// Circuit generation: centre-line, racing line, speed profile and all trackside geometry.
import * as THREE from 'three';
import * as TX from './textures.js';
import { buildScenery } from './scenery.js';
import { buildTerrain } from './terrain.js';
import { VEH, limits, driveLimit } from './vehicle.js';

export const HALF_W = 7;      // default half track width (m); measured circuits carry their own per sample (Track.hw)
export const KERB_W = 1.6;
const DS = 2;                 // sample spacing (m)
// smallest centre-line radius kept from the source data: the car's full-lock turning radius is 5.8 m (tests/
// vehicle-tests.js, 'Volleinschlag'); tighter points are digitising kinks of the 20 m GeoJSON polygons
const MIN_R = 7;

// centripetal Catmull-Rom (alpha 0.5) through p1 -> p2, u in [0, 1]. The uniform form overshoots and can loop
// where neighbouring control points are unevenly spaced (a 0.1 m closing segment next to 5 m ones, GeoJSON points
// 6 m and 22 m apart); the centripetal form never forms cusps or self-intersections inside a segment.
function catmullC(p0, p1, p2, p3, u, out) {
  const d = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), t = t1 + (t2 - t1) * u;
  for (let c = 0; c < 2; c++) {
    const A1 = (p0[c] * (t1 - t) + p1[c] * t) / t1;
    const A2 = (p1[c] * (t2 - t) + p2[c] * (t - t1)) / (t2 - t1);
    const A3 = (p2[c] * (t3 - t) + p3[c] * (t - t2)) / (t3 - t2);
    const B1 = (A1 * (t2 - t) + A2 * t) / t2;
    const B2 = (A2 * (t3 - t) + A3 * (t - t1)) / (t3 - t1);
    out[c] = (B1 * (t2 - t) + B2 * (t - t1)) / (t2 - t1);
  }
  return out;
}

// drop control points that nearly coincide with their predecessor (e.g. a closing point 0.08 m from the
// first one): a near-zero segment is a kink in any spline through it. Per-point data (height, width) goes too.
function cleanControls(C, E, W) {
  const n = C.length, seg = [];
  for (let i = 0; i < n; i++) seg.push(Math.hypot(C[(i + 1) % n][0] - C[i][0], C[(i + 1) % n][1] - C[i][1]));
  const med = [...seg].sort((a, b) => a - b)[n >> 1], keep = [];
  for (let i = 0; i < n; i++) {
    const prev = keep.length ? C[keep[keep.length - 1]] : null;
    if (prev && Math.hypot(C[i][0] - prev[0], C[i][1] - prev[1]) < med * 0.2) continue;
    keep.push(i);
  }
  // the closing segment (last kept point -> first point)
  while (keep.length > 3 && Math.hypot(C[keep[keep.length - 1]][0] - C[0][0], C[keep[keep.length - 1]][1] - C[0][1]) < med * 0.2) keep.pop();
  return { C: keep.map((i) => C[i]), E: E && keep.map((i) => E[i]), W: W && keep.map((i) => W[i]) };
}

function smoothArr(a, radius, passes = 1) {
  const n = a.length;
  let src = Float32Array.from(a);
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    let acc = 0;
    for (let j = -radius; j <= radius; j++) acc += src[(j + n) % n];
    for (let i = 0; i < n; i++) {
      out[i] = acc / (2 * radius + 1);
      acc += src[(i + radius + 1) % n] - src[(i - radius + n) % n];
    }
    src = out;
  }
  return src;
}

// Vehicle model constants shared with physics; the tyres, aero and masses themselves live in vehicle.js and
// give the limits below (the same model the player's car runs on)
export const CAR = {
  mass: VEH.mass, power: VEH.power, ersPower: VEH.ersPower, cdA: VEH.CdA, drsCdA: VEH.drsCdA,
  wheelBase: VEH.L, vMaxClamp: 100, // 2026 wheelbase
  tyreR: VEH.tyreR, // rolling radius of the 2026 tyres (about 705 mm diameter): turns the wheels as fast as the car moves
};

// steady-state limits of the car (m/s²) at grip level mu: cornering, braking with ABS, net forward drive
export function lateralGrip(v, mu) { return limits(mu).lat(v); }
export function brakeDecel(v, mu) { return limits(mu).brake(v); }
export function driveAccel(v, power, cdA, mu) {
  return power === VEH.power && cdA === VEH.CdA ? limits(mu).drive(v) : driveLimit(v, power, cdA, mu);
}

export class Track {
  constructor(scene, opts) {
    this.def = opts.def;
    this.style = this.def.style || 'park';
    this.tod = opts.tod;
    this.wetness = opts.wetness ?? 0;
    this.quality = opts.quality || 'high';
    this.trees = opts.trees || this.quality;
    this.mu = 1 - 0.28 * this.wetness;
    this.wet = false; // materials are built dry, then tinted by setWetness()
    this.buildCentreLine();
    this.findStart();
    this.buildRacingLine();
    this.buildSpeedProfile();
    this.buildLimits();
    this.buildVertical();
    buildTerrain(this, 7000, 1024, HALF_W); // real elevation (no-op on flat circuits); uses this.hw per sample
    this.hilly = this.hs.some((h) => h > 0.5);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildMeshes();
    buildScenery(this);
    this.profileMu = this.mu;
    this.setWetness(this.wetness, true);
  }

  // 0 = bone dry, 1 = standing water. Changes grip, AI speeds and the look of the surfaces.
  setWetness(w, force = false) {
    this.wetness = w;
    this.wet = w > 0.4;
    this.mu = 1 - 0.28 * w;
    const L = (a, b) => a + (b - a) * w;
    const r = this.roadMat;
    r.roughness = L(0.85, 0.3); r.metalness = 0;
    r.color.setRGB(L(1, 0.52), L(1, 0.54), L(1, 0.58));
    if (r.normalMap) r.normalScale.set(L(0.45, 0.15), L(0.45, 0.15)); // water fills the grain
    this.kerbMat.roughness = L(0.7, 0.25);
    this.roMat.roughness = L(0.9, 0.35);
    this.pitMat.roughness = L(0.9, 0.3); this.pitMat.color.setRGB(L(0.33, 0.24), L(0.34, 0.25), L(0.36, 0.27));
    this.grassMat.color.setRGB(L(1, 0.75), L(1, 0.82), L(1, 0.72));
    this.grassMat.roughness = L(0.95, 0.7);
    if (force || Math.abs(this.mu - this.profileMu) > 0.012) { this.profileMu = this.mu; this.buildSpeedProfile(); }
  }

  buildCentreLine() {
    // dense polyline (spline or straights + arcs), then resample uniformly every DS metres
    const dense = [];
    const def = this.def;
    if (def.poly) {
      const P = def.poly, n = P.length;
      for (let i = 0; i < n; i++) {
        const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
        const r = def.r ? def.r[i] : 25;
        const d1 = [b[0] - a[0], b[1] - a[1]], d2 = [c[0] - b[0], c[1] - b[1]];
        const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
        const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2];
        const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]);
        const tdist = Math.min(r * Math.tan(Math.abs(turn) / 2), l1 * 0.45, l2 * 0.45);
        const rr = tdist / Math.tan(Math.abs(turn) / 2);
        const p0 = [b[0] - u1[0] * tdist, b[1] - u1[1] * tdist];
        const sgn = Math.sign(turn);
        const cx = p0[0] - u1[1] * rr * sgn, cy = p0[1] + u1[0] * rr * sgn;
        const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
        const steps = Math.max(6, Math.ceil(Math.abs(turn) * rr / 1.5));
        for (let k = 0; k <= steps; k++) {
          const ang = a0 + (turn * k) / steps;
          dense.push([cx + Math.cos(ang) * rr, -(cy + Math.sin(ang) * rr)]);
        }
        // straight to the next corner start, sampled every ~4 m
        const nb = c, nc = P[(i + 2) % n];
        const e1 = [nb[0] - b[0], nb[1] - b[1]], e2 = [nc[0] - nb[0], nc[1] - nb[1]];
        const el1 = Math.hypot(...e1), el2 = Math.hypot(...e2);
        const v1 = [e1[0] / el1, e1[1] / el1], v2 = [e2[0] / el2, e2[1] / el2];
        const t2 = Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]);
        const r2 = def.r ? def.r[(i + 1) % n] : 25;
        const td2 = Math.min(r2 * Math.tan(Math.abs(t2) / 2), el1 * 0.45, el2 * 0.45);
        const s0 = [b[0] + u2[0] * tdist, b[1] + u2[1] * tdist], s1 = [nb[0] - v1[0] * td2, nb[1] - v1[1] * td2];
        const sl = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]), ns = Math.max(1, Math.ceil(sl / 4));
        for (let k = 1; k < ns; k++) dense.push([s0[0] + (s1[0] - s0[0]) * (k / ns), -(s0[1] + (s1[1] - s0[1]) * (k / ns))]);
      }
    } else {
      const { C, E, W: Wd } = cleanControls(def.ctrl, def.elev, def.hw), n = C.length;
      // measured circuits have points every 5 m: fewer spline steps keep the dense line small
      const sub = n > 600 ? 12 : 60, q = [0, 0];
      for (let i = 0; i < n; i++) {
        const a = C[(i - 1 + n) % n], b = C[i], c = C[(i + 1) % n], d = C[(i + 2) % n];
        for (let k = 0; k < sub; k++) {
          const t = k / sub;
          catmullC(a, b, c, d, t, q);
          // x east, z = -north (three.js: -z is "forward" on the map), heights dm -> m, half widths m
          dense.push([q[0], -q[1], E ? (E[i] + (E[(i + 1) % n] - E[i]) * t) / 10 : 0, Wd ? Wd[i] + (Wd[(i + 1) % n] - Wd[i]) * t : HALF_W]);
        }
      }
    }
    this.resample(dense);
    // a centre line tighter than the road's half width folds the inside edge of the road back over itself (and
    // the driving surface with it). Where the source line has such a corner, relax it locally until the inside
    // edge keeps a radius of at least 1 m; everywhere else the line stays exactly as measured. Where that is not
    // possible without reshaping the lap (hairpin legs closer than the assumed road width), at least kinks of the
    // source polygon tighter than MIN_R are rounded off
    if (this.relaxTightCorners((i) => this.hw[i] + 1) || this.relaxTightCorners(() => MIN_R)) this.resample(Array.from({ length: this.N }, (_, i) => [this.px[i], this.pz[i], this.hs[i], this.hw[i]]));
    const N = this.N;
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz);
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    // signed curvature (+ = right-hander)
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const b = (i + 1) % N;
      const cross = this.tx[i] * this.tz[b] - this.tz[i] * this.tx[b];
      const dot = this.tx[i] * this.tx[b] + this.tz[i] * this.tz[b];
      k[i] = Math.atan2(cross, dot) / this.ds;
    }
    this.k = smoothArr(k, 3, 2);
  }

  // arc-length resampling of a closed polyline [x, z, height, half width] into N samples every ~DS metres
  resample(dense) {
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const p = dense[i - 1], q = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    const total = cum[dense.length];
    const N = Math.round(total / DS);
    this.N = N; this.ds = total / N; this.length = total;
    this.px = new Float32Array(N); this.pz = new Float32Array(N); this.hs = new Float32Array(N); this.hw = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.ds;
      while (cum[j + 1] < s) j++;
      const f = (s - cum[j]) / (cum[j + 1] - cum[j]);
      const p = dense[j], q = dense[(j + 1) % dense.length];
      this.px[i] = p[0] + (q[0] - p[0]) * f;
      this.pz[i] = p[1] + (q[1] - p[1]) * f;
      this.hs[i] = (p[2] || 0) + ((q[2] || 0) - (p[2] || 0)) * f; // road height above the lowest point (m)
      this.hw[i] = (p[3] || HALF_W) + ((q[3] || HALF_W) - (p[3] || HALF_W)) * f; // half road width (m)
    }
  }

  // local Laplacian relaxation of samples whose curvature (over +-2 samples) exceeds 1 / rMin(i); returns true if
  // the line was changed. Heights and widths stay with their samples.
  relaxTightCorners(rMin) {
    const N = this.N, px = this.px, pz = this.pz, K = 2;
    const kAt = (i) => {
      const a = (i - K + N) % N, b = (i + K) % N;
      const ax = px[i] - px[a], az = pz[i] - pz[a], bx = px[b] - px[i], bz = pz[b] - pz[i];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      return Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)) / Math.max(0.5 * (la + lb), 1e-3);
    };
    const count = () => { let n = 0; for (let i = 0; i < N; i++) if (kAt(i) * rMin(i) > 1) n++; return n; };
    const kMax = () => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, kAt(i) * rMin(i)); return m; };
    const len = () => { let L = 0; for (let i = 0; i < N; i++) { const j = (i + 1) % N; L += Math.hypot(px[j] - px[i], pz[j] - pz[i]); } return L; };
    const n0 = count();
    if (!n0) return false;
    const x0 = Float32Array.from(px), z0 = Float32Array.from(pz), L0 = len(), k0 = kMax();
    // keep the best state (smallest worst curvature) whose lap length is within 0.3 % of the source line; a
    // hairpin whose legs are fixed can't be opened by smoothing, only pulled inwards, so this stops early
    let best = null, bestK = k0;
    for (let it = 0; it < 400; it++) {
      const bad = [];
      for (let i = 0; i < N; i++) if (kAt(i) * rMin(i) > 1) bad.push(i);
      if (!bad.length) break;
      const mark = new Uint8Array(N);
      for (const i of bad) for (let d = -4; d <= 4; d++) mark[(i + d + N) % N] = 1;
      const nx = Float32Array.from(px), nz = Float32Array.from(pz);
      for (let i = 0; i < N; i++) if (mark[i]) {
        const a = (i - 1 + N) % N, b = (i + 1) % N;
        nx[i] = px[i] + ((px[a] + px[b]) / 2 - px[i]) * 0.5;
        nz[i] = pz[i] + ((pz[a] + pz[b]) / 2 - pz[i]) * 0.5;
      }
      px.set(nx); pz.set(nz);
      if (Math.abs(len() - L0) > L0 * 0.003) break;
      const k = kMax();
      if (k < bestK) { bestK = k; best = [Float32Array.from(px), Float32Array.from(pz)]; }
      if (k <= 1) break; // fully fixed
    }
    // worth keeping if it fixed the corner, or made the worst point clearly better (kinks of the source polygon); otherwise the
    // source line stays and the strips only avoid folding (ribbon / wall)
    const moved = !!best && (bestK <= 1 || bestK < k0 * 0.8);
    if (moved) { px.set(best[0]); pz.set(best[1]); } else { px.set(x0); pz.set(z0); }
    this.tightCorners = count(); // samples still tighter than rMin
    this.relaxed = moved;
    this.tightCorners = moved ? 0 : n0; // samples still tighter than rMin
    return moved;
  }

  idx(s) { const N = this.N; return ((Math.floor(s / this.ds) % N) + N) % N; }
  wrapS(s) { const L = this.length; return ((s % L) + L) % L; }

  // interpolated centre-line frame at distance s
  frame(s, out = {}) {
    s = this.wrapS(s);
    const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    out.x = this.px[i] + (this.px[j] - this.px[i]) * t;
    out.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz); out.tx = tx / l; out.tz = tz / l;
    out.rx = -out.tz; out.rz = out.tx; // right-hand normal
    return out;
  }

  racingLat(s) {
    s = this.wrapS(s);
    const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    return this.race[i] + (this.race[j] - this.race[i]) * t;
  }
  targetSpeed(s) { return this.vProf[this.idx(s)]; }
  // road height and gradient along the lap (rise per metre, + = uphill in race direction)
  hAt(s) {
    s = this.wrapS(s);
    const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    return this.hs[i] + (this.hs[j] - this.hs[i]) * t;
  }
  gradeAt(s) { return (this.hAt(s + 6) - this.hAt(s - 6)) / 12; }
  // vertical curvature of the road (1/m, > 0 = dip / compression, < 0 = crest) from a smoothed profile: the
  // heights come from a 10-30 m elevation model stored in decimetres, so a short-base second difference
  // would only show rounding steps (±0.6 g of fake load swing at 280 km/h)
  buildVertical() {
    const N = this.N, k = Math.max(1, Math.round(24 / this.ds)), c = new Float32Array(N), d2 = (k * this.ds) ** 2;
    for (let i = 0; i < N; i++) c[i] = (this.hs[(i + k) % N] - 2 * this.hs[i] + this.hs[(i - k + N) % N]) / d2;
    this.vCurv = smoothArr(c, Math.round(12 / this.ds), 2);
  }
  vCurvAt(s) { return this.vCurv ? this.vCurv[this.idx(s)] : 0; }
  // half road width (centre line to the white edge line) at distance s
  hwAt(s) {
    s = this.wrapS(s);
    const f = s / this.ds, i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    return this.hw[i] + (this.hw[j] - this.hw[i]) * t;
  }

  buildRacingLine() {
    const N = this.N;
    const ks = smoothArr(this.k, 12, 3);
    // how close the car's centre gets to the white line: real cars put their wheels on the kerbs; the 14 m
    // default-width circuits keep the older, wider margin so their lap times stay as they were
    this.lineMargin = this.def.measured ? 0.5 : 1.6;
    // in corners (where buildLimits lays kerbs) the line on measured circuits may run onto the kerb, the car's
    // centre up to 0.3 m past the white line (one side of the car over it), like real cars through chicanes
    const kerbed = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (Math.abs(this.k[i]) > 1 / 320) for (let d = -6; d <= 6; d++) kerbed[(i + d + N) % N] = 1;
    const G = 320, lim = (i) => this.hw[i] - (this.def.measured && kerbed[i] ? -0.3 : this.lineMargin);
    const off = Math.round(55 / this.ds);
    const race = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = G * (ks[i] - 0.55 * ks[(i + off) % N] - 0.35 * ks[(i - off + N) % N]);
      race[i] = Math.max(-lim(i), Math.min(lim(i), v));
    }
    // minimum-curvature refinement ("elastic band"): every point is pulled toward the midpoint of its
    // neighbours and clamped to the track width -> real outside-inside-outside lines through corners
    const lat = smoothArr(race, 8, 3);
    for (const stride of [16, 8, 4, 2]) {
      for (let it = 0; it < 90; it++) {
        for (let i = 0; i < N; i++) {
          // curvature-minimising target from a 5-point stencil: (-p[-2] + 4p[-1] + 4p[+1] - p[+2]) / 6
          const P = (o) => { const j = (i + o * stride + N * 4) % N; return [this.px[j] - this.tz[j] * lat[j], this.pz[j] + this.tx[j] * lat[j]]; };
          const a2 = P(-2), a1 = P(-1), b1 = P(1), b2 = P(2);
          const tx = (-a2[0] + 4 * a1[0] + 4 * b1[0] - b2[0]) / 6 - this.px[i];
          const tz = (-a2[1] + 4 * a1[1] + 4 * b1[1] - b2[1]) / 6 - this.pz[i];
          const want = tx * -this.tz[i] + tz * this.tx[i];
          const nl = lat[i] + (want - lat[i]) * 0.5;
          const edge = lim(i);
          lat[i] = nl > edge ? edge : nl < -edge ? -edge : nl;
        }
      }
    }
    this.race = smoothArr(lat, 3, 2);
    // curvature of the racing line itself
    const rx = new Float32Array(N), rz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      rx[i] = this.px[i] - this.tz[i] * this.race[i];
      rz[i] = this.pz[i] + this.tx[i] * this.race[i];
    }
    const kr = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 4 + N) % N, b = i, c = (i + 4) % N;
      const ax = rx[b] - rx[a], az = rz[b] - rz[a], bx = rx[c] - rx[b], bz = rz[c] - rz[b];
      const cross = ax * bz - az * bx, dot = ax * bx + az * bz;
      const len = (Math.hypot(ax, az) + Math.hypot(bx, bz)) * 0.5;
      kr[i] = Math.atan2(cross, dot) / Math.max(len, 0.01);
    }
    this.kRace = smoothArr(kr, 4, 2);
    this.raceX = rx; this.raceZ = rz;
  }

  buildSpeedProfile() {
    const N = this.N, mu = this.mu, ds = this.ds;
    const v = new Float32Array(N);
    const LIM = limits(mu);
    for (let i = 0; i < N; i++) {
      // corner speed: v² / R = lateral limit at that speed (downforce grows with v, so iterate upwards)
      const R = 1 / Math.max(Math.abs(this.kRace[i]), 1e-5);
      let vc = Math.sqrt(R * LIM.lat(0));
      for (let k = 0; k < 40 && vc < CAR.vMaxClamp; k++) vc = Math.sqrt(R * LIM.lat(vc));
      v[i] = Math.min(CAR.vMaxClamp, vc);
    }
    // slope along the lap: uphill helps braking and costs drive, downhill the other way
    const grade = (i) => (this.hs[(i + 1) % N] - this.hs[(i - 1 + N) % N]) / (2 * ds);
    // g-g diagram: the tyres' longitudinal force is what the friction circle leaves after the corner's side
    // force (drag and rolling resistance act regardless)
    const avail = (i, vi) => { const u = Math.min(1, (vi * vi * Math.abs(this.kRace[i])) / Math.max(LIM.lat(vi), 1)); return Math.max(0.15, Math.sqrt(1 - u * u)); };
    for (let pass = 0; pass < 3; pass++) {
      for (let c = 0; c < N; c++) { // braking: backward
        const i = (N - 1 - c), j = (i + 1) % N;
        const dec = (LIM.brake(v[j]) - LIM.res(v[j])) * avail(j, v[j]) + LIM.res(v[j]);
        const lim2 = Math.sqrt(v[j] * v[j] + 2 * Math.max(1, dec * 0.92 + 9.81 * grade(i)) * ds);
        if (v[i] > lim2) v[i] = lim2;
      }
      for (let i = 0; i < N; i++) { // traction: forward
        const j = (i + 1) % N;
        const pw = CAR.power / (CAR.mass * Math.max(v[i], 1));
        const a = Math.max(0.1, Math.min(pw, LIM.gross(v[i]) * avail(i, v[i])) - LIM.res(v[i]) - 9.81 * grade(i));
        const lim = Math.sqrt(v[i] * v[i] + 2 * a * ds);
        if (v[j] > lim) v[j] = lim;
      }
    }
    this.vProf = v;
    // DRS zones: long flat-out sections
    this.drsZones = [];
    let runStart = -1;
    const fast = (i) => v[i % N] > 72;
    let i0 = 0; while (fast(i0) && i0 < N) i0++; // start scanning from a slow point
    for (let c = 0; c <= N; c++) {
      const i = (i0 + c) % N;
      if (fast(i) && runStart < 0) runStart = i0 + c;
      if ((!fast(i) || c === N) && runStart >= 0) {
        const len = (i0 + c - runStart) * ds;
        if (len > 380) this.drsZones.push([((runStart * ds) + 60) % this.length, ((runStart * ds) + len - 40) % this.length]);
        runStart = -1;
      }
    }
    // braking zones -> distance boards & coloured racing line
    this.brakeZone = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const j = (i + 3) % N;
      if (v[j] < v[i] - 0.25) this.brakeZone[i] = 1;
    }
  }

  buildLimits() {
    const N = this.N;
    // outside of corners gets wider run-off; inside limited by corner radius
    const ks = smoothArr(this.k, 10, 2);
    const left = new Float32Array(N), right = new Float32Array(N);
    this.kerbL = new Uint8Array(N); this.kerbR = new Uint8Array(N);
    this.gravelL = new Uint8Array(N); this.gravelR = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const k = ks[i], R = 1 / Math.max(Math.abs(k), 1e-5);
      const outside = Math.min(40, 16 + Math.abs(k) * 2600);
      const inside = Math.min(16, R * 0.55);
      if (k > 0) { right[i] = inside; left[i] = outside; } else { left[i] = inside; right[i] = outside; }
      const corner = Math.abs(this.k[i]) > 1 / 320;
      if (corner) { this.kerbL[i] = 1; this.kerbR[i] = 1; }
      if (Math.abs(k) > 1 / 400) { if (k > 0) this.gravelL[i] = 1; else this.gravelR[i] = 1; }
    }
    // street circuit: walls right next to the track, no gravel
    if (this.style === 'city') {
      for (let i = 0; i < N; i++) {
        left[i] = right[i] = this.hw[i] + 3.2 + Math.min(4, Math.abs(ks[i]) * 220);
        this.gravelL[i] = this.gravelR[i] = 0;
      }
    }
    // pit straight: pit wall on the right
    for (let i = 0; i < N; i++) {
      const s = i * this.ds;
      // the pit wall stays clear of the pit lane however wide the road is
      if (this.inPitStraight(s)) { right[i] = Math.max(11, this.hw[i] + 4); left[i] = Math.max(this.style === 'city' ? 11 : 15, this.hw[i] + (this.style === 'city' ? 4 : 8)); this.gravelL[i] = this.gravelR[i] = 0; }
    }
    // other parts of the circuit close by (parallel sections, Suzuka's crossover): run-off and walls stop
    // halfway to them; where the road crosses itself there are no walls, kerbs or gravel at all
    this.cross = new Uint8Array(N);
    const near = this.neighbourGaps();
    for (let i = 0; i < N; i++) {
      if (near.cross[i]) { this.cross[i] = 1; left[i] = right[i] = 24; continue; }
      if (near.L[i] < 1e9) left[i] = Math.min(left[i], Math.max(this.hw[i] + 1.6, near.L[i] / 2 - 1));
      if (near.R[i] < 1e9) right[i] = Math.min(right[i], Math.max(this.hw[i] + 1.6, near.R[i] / 2 - 1));
    }
    if (near.pairs.length) this.levelCrossings(near.pairs);
    // verges (grass / pavement beside the road) end halfway to a neighbouring section, so they meet the other
    // section's verge instead of reaching over its road
    const half = (g) => Float32Array.from(g, (d, i) => Math.max(this.hw[i] + 1, Math.min(92, d / 2)));
    const soft = (raw) => { const sm = smoothArr(raw, 6, 2); for (let i = 0; i < N; i++) sm[i] = Math.min(sm[i], raw[i]); return sm; }; // never past the half gap
    this.vergeL = soft(half(near.L)); this.vergeR = soft(half(near.R));
    this.limL = smoothArr(left, 6, 2);
    this.limR = smoothArr(right, 6, 2);
    for (let i = 0; i < N; i++) if (near.cross[i]) { this.limL[i] = Math.max(this.limL[i], 24); this.limR[i] = Math.max(this.limR[i], 24); }
    // dilate kerbs a little so they start before turn-in
    const dil = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (a[i]) for (let d = -6; d <= 6; d++) o[(i + d + N) % N] = 1; return o; };
    this.kerbL = dil(this.kerbL); this.kerbR = dil(this.kerbR);
    this.gravelL = dil(this.gravelL); this.gravelR = dil(this.gravelR);
    for (let i = 0; i < N; i++) if (this.cross[i]) this.kerbL[i] = this.kerbR[i] = this.gravelL[i] = this.gravelR[i] = 0;
  }

  // the two branches of a crossover get the same height there, blended in over 80 m each way
  levelCrossings(pairs) {
    const N = this.N, done = [];
    pairs.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of pairs) {
      if (done.some(([a, b]) => Math.min(Math.abs(a - i), N - Math.abs(a - i)) < 60 || Math.min(Math.abs(b - i), N - Math.abs(b - i)) < 60)) continue;
      done.push([i, j]);
      const h0 = this.hs.slice(), mean = (h0[i] + h0[j]) / 2, span = Math.round(80 / this.ds);
      for (let d = -span; d <= span; d++) {
        const w = 0.5 * (1 + Math.cos((Math.PI * d) / span));
        const a = (i + d + N) % N, b = (j + d + N) % N;
        this.hs[a] += (mean - h0[i]) * w; this.hs[b] += (mean - h0[j]) * w;
      }
    }
  }

  // for every sample: lateral distance to the nearest unrelated part of the track on each side
  // (unrelated = much further along the lap than it is away in space, so hairpin legs don't count)
  neighbourGaps() {
    const N = this.N, ds = this.ds, R = 70, cell = 50;
    const L = new Float32Array(N).fill(1e9), Rr = new Float32Array(N).fill(1e9), cross = new Uint8Array(N), pairs = [];
    const grid = new Map(), key = (cx, cz) => cx * 100003 + cz;
    for (let j = 0; j < N; j++) { const k = key(Math.floor(this.px[j] / cell), Math.floor(this.pz[j] / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(j); }
    for (let i = 0; i < N; i++) {
      const x = this.px[i], z = this.pz[i], tx = this.tx[i], tz = this.tz[i];
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const list = grid.get(key(cx + a, cz + b)); if (!list) continue;
        for (const j of list) {
          const dx = this.px[j] - x, dz = this.pz[j] - z, d = Math.hypot(dx, dz);
          if (d > R) continue;
          let arc = Math.abs(i - j); arc = Math.min(arc, N - arc) * ds;
          if (arc < d * 3 + 40) continue;
          const along = dx * tx + dz * tz, lat = dx * -tz + dz * tx;
          if (Math.abs(along) > 20) continue;
          if (Math.abs(lat) < this.hw[i] + this.hw[j] + 2) {
            // a real crossover only if the other branch actually passes through our centre line
            const j0 = (j - 3 + N) % N, j1 = (j + 3) % N;
            const l0 = (this.px[j0] - x) * -tz + (this.pz[j0] - z) * tx, l1 = (this.px[j1] - x) * -tz + (this.pz[j1] - z) * tx;
            if (Math.sign(l0) !== Math.sign(l1) && Math.abs(lat) < this.hw[i]) { cross[i] = 1; if (d < 4) pairs.push([i, j, d]); continue; }
          }
          if (lat > 0) Rr[i] = Math.min(Rr[i], lat); else L[i] = Math.min(L[i], -lat);
        }
      }
    }
    // the crossing zone reaches a little either side of the overlap
    const c2 = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (cross[i]) for (let d = -15; d <= 15; d++) c2[(i + d + N) % N] = 1;
    return { L, R: Rr, cross: c2, pairs };
  }

  // longest near-straight section hosts start line, grid and pit lane
  findStart() {
    const N = this.N, ks = smoothArr(this.k, 10, 2);
    const straight = (i) => Math.abs(ks[((i % N) + N) % N]) < 1 / 700;
    if (this.def.real) {
      // real circuit: the data starts at the start/finish line; the main straight is the near-straight run
      // around it (gentle kinks allowed), the pit lane sits around the line like at the real track
      const st = this.def.start || 0, i0 = this.idx(st);
      const loose = (i) => Math.abs(ks[((i % N) + N) % N]) < 1 / 350;
      let b = i0, f = i0;
      while (loose(b - 1) && i0 - b < N / 3) b--;
      while (loose(f + 1) && f - i0 < N / 3) f++;
      this.mainStraight = [b * this.ds, f * this.ds];
      this.startS = this.wrapS(st);
      this.pit = [st - 220, st + 170];
      return;
    }
    let i0 = 0; while (straight(i0) && i0 < N) i0++;
    let best = [0, 0], run = -1;
    for (let c = 0; c <= N; c++) {
      const i = i0 + c;
      if (straight(i) && run < 0) run = i;
      if ((!straight(i) || c === N) && run >= 0) { if (i - run > best[1] - best[0]) best = [run, i]; run = -1; }
    }
    const a = best[0] * this.ds, len = (best[1] - best[0]) * this.ds;
    this.mainStraight = [a, a + len];
    const st = a + Math.max(200, Math.min(len - 160, len * 0.5));
    this.startS = this.wrapS(st);
    // pit lane around the start line, about as long as a real one (~20 s at the 80 km/h limit)
    this.pit = [Math.max(a + 15, st - 220), Math.min(a + len - 50, st + 170)];
  }
  inRange(s, a, b) { const L = this.length; s = this.wrapS(s - a); return s < b - a && s >= 0 && b - a < L; }
  inPitStraight(s) { return this.inRange(s, this.pit[0], this.pit[1]); }

  // Find nearest centre-line sample around a hint index
  locate(x, z, hint, out = {}) {
    const N = this.N;
    let best = 1e18, bi = hint;
    const span = hint < 0 ? N : 40;
    const from = hint < 0 ? 0 : hint - span;
    for (let d = 0; d < (hint < 0 ? N : span * 2); d++) {
      const i = ((from + d) % N + N) % N;
      const dx = x - this.px[i], dz = z - this.pz[i];
      const dd = dx * dx + dz * dz;
      if (dd < best) { best = dd; bi = i; }
    }
    const dx = x - this.px[bi], dz = z - this.pz[bi];
    const along = dx * this.tx[bi] + dz * this.tz[bi];
    out.i = bi;
    out.s = this.wrapS(bi * this.ds + along);
    out.lat = dx * -this.tz[bi] + dz * this.tx[bi];
    return out;
  }

  // ---------- geometry ----------
  // lateral offset on the inside of a corner limited to 95 % of the local radius: beyond the corner's centre an
  // offset line would run backwards (strips fold, lanes of a wide strip cross each other). Outside: unchanged.
  clampInside(i, l) {
    if (!this.rIn) {
      const ks = smoothArr(this.k, 2, 1);
      this.rIn = Float32Array.from(ks, (k) => (Math.abs(k) > 1e-5 ? 0.95 / Math.abs(k) : 1e9) * Math.sign(k || 1));
    }
    const r = this.rIn[i]; // signed: + = the inside is to the right (+lat)
    return r > 0 ? Math.min(l, r) : Math.max(l, r);
  }
  ribbon(latA, latB, y, mat, uScale, vLen, filter, across = 1, exact = false) {
    // build a strip between two lateral offsets (arrays or numbers), optionally only where filter(i) true;
    // `across` splits it into lanes so a wide strip can follow the height field between its edges.
    // `exact`: the strip carries the road's own height profile (Track.hs, what the cars drive on) in its vertices
    // and skips the height-field lift. The field is a 1024² raster (3-7 m texels) that blurs steps between
    // close sections; the driving surface must not depend on it.
    if (exact && this.hilly) { mat.userData.noTerrain = true; mat.needsUpdate = true; }
    const N = this.N, K = Math.max(1, across | 0), row = K + 1;
    const pos = [], uv = [], idx = [];
    let run = false, base = 0;
    const getA = (i) => (typeof latA === 'function' ? latA(i) : latA);
    const getB = (i) => (typeof latB === 'function' ? latB(i) : latB);
    const prev = new Float32Array(2 * (K + 1));
    for (let c = 0; c <= N; c++) {
      const i = c % N;
      const ok = !filter || filter(i);
      if (ok) {
        const a = getA(i), b = getB(i);
        const rx = -this.tz[i], rz = this.tx[i];
        const v = (c * this.ds) / vLen;
        for (let k = 0; k <= K; k++) {
          const l = this.clampInside(i, a + (b - a) * (k / K));
          let x = this.px[i] + rx * l, z = this.pz[i] + rz * l;
          // an offset line on the inside of a corner tighter than the offset would run backwards and fold the
          // strip over itself: it holds its last point instead (the strip narrows to a fan, no overlap)
          if (run && (x - prev[2 * k]) * this.tx[i] + (z - prev[2 * k + 1]) * this.tz[i] < 0.01) { x = prev[2 * k]; z = prev[2 * k + 1]; }
          prev[2 * k] = x; prev[2 * k + 1] = z;
          pos.push(x, exact && this.hilly ? y + this.hs[i] : y, z);
          uv.push(uScale * (k / K), v);
        }
        const vi = pos.length / 3 - row;
        if (run) for (let k = 0; k < K; k++) { const p0 = vi - row + k, p1 = vi + k; idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1); }
        run = true;
      } else run = false;
      base++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // ensure normals point up (winding may vary)
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true; m.userData.ribbon = true;
    this.group.add(m);
    return m;
  }

  wall(latFn, h, y0, mat, vLen, filter, flipU = false) {
    const N = this.N;
    const pos = [], uv = [], idx = [];
    let run = false, dist = 0, prevX = null, prevZ = null;
    for (let c = 0; c <= N; c++) {
      const i = c % N;
      const ok = (!filter || filter(i)) && !(this.cross && this.cross[i]);
      const l = this.clampInside(i, latFn(i));
      let x = this.px[i] - this.tz[i] * l, z = this.pz[i] + this.tx[i] * l;
      // same as the ribbons: a wall on the inside of a corner tighter than its offset holds its last point
      if (prevX !== null && (x - prevX) * this.tx[i] + (z - prevZ) * this.tz[i] < 0.01) { x = prevX; z = prevZ; }
      if (prevX !== null) dist += Math.hypot(x - prevX, z - prevZ);
      prevX = x; prevZ = z;
      if (ok) {
        pos.push(x, y0, z, x, y0 + h, z);
        const u = (flipU ? -dist : dist) / vLen;
        uv.push(u, 0, u, 1);
        const vi = pos.length / 3 - 2;
        if (run) idx.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1);
        run = true;
      } else run = false;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    this.group.add(m);
    return m;
  }

  buildMeshes() {
    const wet = this.wet;
    const W = (i) => this.hw[i], nW = (i) => -this.hw[i], at = (d) => (i) => this.hw[i] + d, nat = (d) => (i) => -this.hw[i] - d;
    // asphalt
    const asp = TX.asphalt(wet);
    const roadMat = new THREE.MeshStandardMaterial({
      map: asp, roughness: wet ? 0.28 : 0.85, metalness: wet ? 0.15 : 0.0, color: wet ? 0xbfc4c9 : 0xffffff,
    });
    if (this.quality !== 'low') { roadMat.normalMap = TX.noiseNormal(512, 11, 1, 2.6); roadMat.normalMap.repeat.set(9, 11); roadMat.normalScale.set(0.45, 0.45); }
    this.roadMat = roadMat;
    this.ribbon(nW, W, 0.03, roadMat, 1, 16, null, 1, true);

    // run-off verge (tarmac strip next to track)
    const ro = TX.runoff();
    const roMat = (this.roMat = new THREE.MeshStandardMaterial({ map: ro, roughness: 0.9, color: 0xbbbbbb }));
    this.ribbon(nat(4.5), nW, 0.02, roMat, 1, 30, (i) => this.kerbL[i], 1, true);
    this.ribbon(W, at(4.5), 0.02, roMat, 1, 30, (i) => this.kerbR[i], 1, true);

    // gravel traps
    const gr = TX.gravel(); gr.repeat.set(3, 1);
    const grMat = new THREE.MeshStandardMaterial({ map: gr, roughness: 1, color: wet ? 0x9a8f7a : 0xffffff });
    this.ribbon((i) => -this.limL[i] + 1.5, nat(4.5), 0.015, grMat, 3, 12, (i) => this.gravelL[i]);
    this.ribbon(at(4.5), (i) => this.limR[i] - 1.5, 0.015, grMat, 3, 12, (i) => this.gravelR[i]);

    // kerbs
    const kt = TX.kerb();
    const kMat = (this.kerbMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.7 }));
    this.ribbon(nat(KERB_W), nat(-0.1), 0.045, kMat, 1, 8, (i) => this.kerbL[i], 1, true);
    this.ribbon(at(-0.1), at(KERB_W), 0.045, kMat, 1, 8, (i) => this.kerbR[i], 1, true);

    // start/finish line + grid slots
    const startI = this.idx(this.startS);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    this.ribbon(nW, W, 0.04, lineMat, 1, 1, (i) => i === startI || i === (startI + 1) % this.N, 1, true);
    for (let g = 0; g < 22; g++) {
      const s = this.startS - 8 - g * 8;
      const lat = (g % 2 === 0 ? -1 : 1) * Math.min(2.6, this.hwAt(s) - 1.8);
      const slotGeo = new THREE.PlaneGeometry(2.8, 0.3); slotGeo.rotateX(-Math.PI / 2);
      this.place(new THREE.Mesh(slotGeo, lineMat), s, lat, 0.045);
    }

  }

  posAt(s, lat) {
    const f = this.frame(s);
    return [f.x + f.rx * lat, f.z + f.rz * lat, Math.atan2(-f.tx, -f.tz)];
  }

  place(obj, s, lat, y = 0, yawOff = 0) {
    const [x, z, yaw] = this.posAt(s, lat);
    obj.position.set(x, y, z);
    obj.rotation.y = yaw + yawOff;
    this.group.add(obj);
    (this.placed || (this.placed = [])).push(obj); // levelled on the terrain once the scenery is built
    return obj;
  }

  setStartLights(n, out) {
    // n = number of red light columns lit (0..5); out = lights out
    this.lights.forEach((lamps, i) => lamps.forEach((l) => l.material.color.setHex(!out && i < n ? 0xff1010 : 0x220000)));
  }
}
