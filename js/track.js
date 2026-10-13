// Circuit generation: centre-line, racing line, speed profile and all trackside geometry.
import * as THREE from 'three';
import * as TX from './textures.js';
import { buildScenery } from './scenery.js';

export const HALF_W = 7;      // half track width (m)
export const KERB_W = 1.6;
const DS = 2;                 // sample spacing (m)

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
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

// Vehicle model constants shared with physics (so AI speed profile matches player car)
export const CAR = {
  mass: 800, power: 600000, ersPower: 120000, cdA: 1.35, drsCdA: 1.0,
  gripBase: 13.7, downforce: 0.0039, brakeBase: 15, brakeDf: 0.0055,
  wheelBase: 3.6, vMaxClamp: 100,
};

export function lateralGrip(v, mu) { return mu * (CAR.gripBase + CAR.downforce * v * v); }
export function brakeDecel(v, mu) { return mu * (CAR.brakeBase + CAR.brakeDf * v * v); }
export function driveAccel(v, power, cdA, mu) {
  const traction = mu * (12 + 0.002 * v * v);
  const a = Math.min(traction, power / (CAR.mass * Math.max(v, 4)));
  return a - (0.5 * 1.2 * cdA * v * v) / CAR.mass - 0.15;
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
    r.roughness = L(0.85, 0.22); r.metalness = L(0, 0.18);
    r.color.setRGB(L(1, 0.72), L(1, 0.75), L(1, 0.79));
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
      const C = def.ctrl, n = C.length;
      for (let i = 0; i < n; i++) {
        const a = C[(i - 1 + n) % n], b = C[i], c = C[(i + 1) % n], d = C[(i + 2) % n];
        for (let k = 0; k < 60; k++) {
          const t = k / 60;
          dense.push([catmull(a[0], b[0], c[0], d[0], t), -catmull(a[1], b[1], c[1], d[1], t)]);
        }
      }
    }
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const p = dense[i - 1], q = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    const total = cum[dense.length];
    const N = Math.round(total / DS);
    this.N = N; this.ds = total / N; this.length = total;
    this.px = new Float32Array(N); this.pz = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.ds;
      while (cum[j + 1] < s) j++;
      const f = (s - cum[j]) / (cum[j + 1] - cum[j]);
      const p = dense[j], q = dense[(j + 1) % dense.length];
      this.px[i] = p[0] + (q[0] - p[0]) * f;
      this.pz[i] = p[1] + (q[1] - p[1]) * f;
    }
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

  buildRacingLine() {
    const N = this.N;
    const ks = smoothArr(this.k, 12, 3);
    const G = 320, lim = HALF_W - 1.6;
    const off = Math.round(55 / this.ds);
    const race = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = G * (ks[i] - 0.55 * ks[(i + off) % N] - 0.35 * ks[(i - off + N) % N]);
      race[i] = Math.max(-lim, Math.min(lim, v));
    }
    // minimum-curvature refinement ("elastic band"): every point is pulled toward the midpoint of its
    // neighbours and clamped to the track width -> real outside-inside-outside lines through corners
    const lat = smoothArr(race, 8, 3);
    const edge = HALF_W - 1.6;
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
    for (let i = 0; i < N; i++) {
      const R = 1 / Math.max(Math.abs(this.kRace[i]), 1e-5);
      const denom = 1 - R * mu * CAR.downforce;
      v[i] = denom <= 0.02 ? CAR.vMaxClamp : Math.min(CAR.vMaxClamp, Math.sqrt((R * mu * CAR.gripBase) / denom));
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let c = 0; c < N; c++) { // braking: backward
        const i = (N - 1 - c), j = (i + 1) % N;
        const lim = Math.sqrt(v[j] * v[j] + 2 * brakeDecel(v[j], mu) * 0.92 * ds);
        if (v[i] > lim) v[i] = lim;
      }
      for (let i = 0; i < N; i++) { // traction: forward
        const j = (i + 1) % N;
        const a = Math.max(0.1, driveAccel(v[i], CAR.power, CAR.cdA, mu));
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
        left[i] = right[i] = HALF_W + 3.2 + Math.min(4, Math.abs(ks[i]) * 220);
        this.gravelL[i] = this.gravelR[i] = 0;
      }
    }
    // pit straight: pit wall on the right
    for (let i = 0; i < N; i++) {
      const s = i * this.ds;
      if (this.inPitStraight(s)) { right[i] = 11; left[i] = this.style === 'city' ? 11 : 15; this.gravelL[i] = this.gravelR[i] = 0; }
    }
    this.limL = smoothArr(left, 6, 2);
    this.limR = smoothArr(right, 6, 2);
    // dilate kerbs a little so they start before turn-in
    const dil = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (a[i]) for (let d = -6; d <= 6; d++) o[(i + d + N) % N] = 1; return o; };
    this.kerbL = dil(this.kerbL); this.kerbR = dil(this.kerbR);
    this.gravelL = dil(this.gravelL); this.gravelR = dil(this.gravelR);
  }

  // longest near-straight section hosts start line, grid and pit lane
  findStart() {
    const N = this.N, ks = smoothArr(this.k, 10, 2);
    const straight = (i) => Math.abs(ks[i % N]) < 1 / 700;
    let i0 = 0; while (straight(i0) && i0 < N) i0++;
    let best = [0, 0], run = -1;
    for (let c = 0; c <= N; c++) {
      const i = i0 + c;
      if (straight(i) && run < 0) run = i;
      if ((!straight(i) || c === N) && run >= 0) { if (i - run > best[1] - best[0]) best = [run, i]; run = -1; }
    }
    const a = best[0] * this.ds, len = (best[1] - best[0]) * this.ds;
    this.mainStraight = [a, a + len];
    this.startS = this.wrapS(a + Math.max(200, Math.min(len - 160, len * 0.5)));
    this.pit = [a + 15, a + len - 50];
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
  ribbon(latA, latB, y, mat, uScale, vLen, filter) {
    // build a strip between two lateral offsets (arrays or numbers), optionally only where filter(i) true
    const N = this.N;
    const pos = [], uv = [], idx = [];
    let run = false, base = 0;
    const getA = (i) => (typeof latA === 'function' ? latA(i) : latA);
    const getB = (i) => (typeof latB === 'function' ? latB(i) : latB);
    for (let c = 0; c <= N; c++) {
      const i = c % N;
      const ok = !filter || filter(i);
      if (ok) {
        const a = getA(i), b = getB(i);
        const rx = -this.tz[i], rz = this.tx[i];
        pos.push(this.px[i] + rx * a, y, this.pz[i] + rz * a, this.px[i] + rx * b, y, this.pz[i] + rz * b);
        const v = (c * this.ds) / vLen;
        uv.push(0, v, uScale, v);
        const vi = pos.length / 3 - 2;
        if (run) idx.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
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
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  wall(latFn, h, y0, mat, vLen, filter, flipU = false) {
    const N = this.N;
    const pos = [], uv = [], idx = [];
    let run = false, dist = 0, prevX = null, prevZ = null;
    for (let c = 0; c <= N; c++) {
      const i = c % N;
      const ok = !filter || filter(i);
      const l = latFn(i);
      const x = this.px[i] - this.tz[i] * l, z = this.pz[i] + this.tx[i] * l;
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
    const W = HALF_W;
    // asphalt
    const asp = TX.asphalt(wet);
    const roadMat = new THREE.MeshStandardMaterial({
      map: asp, roughness: wet ? 0.28 : 0.85, metalness: wet ? 0.15 : 0.0, color: wet ? 0xbfc4c9 : 0xffffff,
    });
    if (this.quality !== 'low') { roadMat.normalMap = TX.noiseNormal(512, 11, 1, 2.6); roadMat.normalMap.repeat.set(9, 11); roadMat.normalScale.set(0.45, 0.45); }
    this.roadMat = roadMat;
    this.ribbon(-W, W, 0.03, roadMat, 1, 16);

    // run-off verge (tarmac strip next to track)
    const ro = TX.runoff();
    const roMat = (this.roMat = new THREE.MeshStandardMaterial({ map: ro, roughness: 0.9, color: 0xbbbbbb }));
    this.ribbon(-W - 4.5, -W, 0.02, roMat, 1, 30, (i) => this.kerbL[i]);
    this.ribbon(W, W + 4.5, 0.02, roMat, 1, 30, (i) => this.kerbR[i]);

    // gravel traps
    const gr = TX.gravel(); gr.repeat.set(3, 1);
    const grMat = new THREE.MeshStandardMaterial({ map: gr, roughness: 1, color: wet ? 0x9a8f7a : 0xffffff });
    this.ribbon((i) => -this.limL[i] + 1.5, -W - 4.5, 0.015, grMat, 3, 12, (i) => this.gravelL[i]);
    this.ribbon(W + 4.5, (i) => this.limR[i] - 1.5, 0.015, grMat, 3, 12, (i) => this.gravelR[i]);

    // kerbs
    const kt = TX.kerb();
    const kMat = (this.kerbMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.7 }));
    this.ribbon(-W - KERB_W, -W + 0.1, 0.045, kMat, 1, 8, (i) => this.kerbL[i]);
    this.ribbon(W - 0.1, W + KERB_W, 0.045, kMat, 1, 8, (i) => this.kerbR[i]);

    // start/finish line + grid slots
    const startI = this.idx(this.startS);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    this.ribbon(-W, W, 0.04, lineMat, 1, 1, (i) => i === startI || i === (startI + 1) % this.N);
    for (let g = 0; g < 22; g++) {
      const s = this.startS - 8 - g * 8;
      const lat = g % 2 === 0 ? -2.6 : 2.6;
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
    return obj;
  }

  setStartLights(n, out) {
    // n = number of red light columns lit (0..5); out = lights out
    this.lights.forEach((lamps, i) => lamps.forEach((l) => l.material.color.setHex(!out && i < n ? 0xff1010 : 0x220000)));
  }
}
