// Circuit generation: centre-line, racing line, speed profile and all trackside geometry.
import * as THREE from 'three';
import * as TX from './textures.js';

// Plan view control points (metres, x east / y north), driven clockwise.
// Loosely modelled on the Circuit de Barcelona-Catalunya layout.
const CTRL = [[-450,0],[0,0],[450,0],[560,-5],[610,-45],[625,-100],[660,-140],[730,-170],[780,-230],[785,-310],[745,-375],[670,-405],[590,-410],[540,-440],[530,-500],[545,-560],[590,-590],[630,-630],[625,-690],[580,-720],[500,-720],[430,-700],[370,-720],[300,-735],[150,-735],[0,-728],[-150,-720],[-220,-705],[-255,-660],[-265,-560],[-270,-450],[-275,-370],[-285,-320],[-320,-295],[-360,-310],[-375,-350],[-372,-420],[-368,-470],[-380,-530],[-430,-565],[-500,-560],[-560,-530],[-590,-470],[-600,-300],[-600,-150],[-585,-60],[-540,-10]];

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
    this.wet = opts.wet;
    this.mu = opts.wet ? 0.72 : 1.0;
    this.buildCentreLine();
    this.buildRacingLine();
    this.buildSpeedProfile();
    this.buildLimits();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildMeshes();
    this.buildScenery();
  }

  buildCentreLine() {
    // dense spline, then resample uniformly every DS metres
    const dense = [];
    const n = CTRL.length;
    for (let i = 0; i < n; i++) {
      const a = CTRL[(i - 1 + n) % n], b = CTRL[i], c = CTRL[(i + 1) % n], d = CTRL[(i + 2) % n];
      for (let k = 0; k < 60; k++) {
        const t = k / 60;
        dense.push([catmull(a[0], b[0], c[0], d[0], t), -catmull(a[1], b[1], c[1], d[1], t)]);
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
    this.race = smoothArr(race, 8, 3);
    // curvature of the racing line itself
    const rx = new Float32Array(N), rz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      rx[i] = this.px[i] - this.tz[i] * this.race[i];
      rz[i] = this.pz[i] + this.tx[i] * this.race[i];
    }
    const kr = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 2 + N) % N, b = i, c = (i + 2) % N;
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
    // pit straight: pit wall on the right
    for (let i = 0; i < N; i++) {
      const s = i * this.ds;
      if (this.inPitStraight(s)) { right[i] = 11; left[i] = 15; this.gravelL[i] = this.gravelR[i] = 0; }
    }
    this.limL = smoothArr(left, 6, 2);
    this.limR = smoothArr(right, 6, 2);
    // dilate kerbs a little so they start before turn-in
    const dil = (a) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (a[i]) for (let d = -6; d <= 6; d++) o[(i + d + N) % N] = 1; return o; };
    this.kerbL = dil(this.kerbL); this.kerbR = dil(this.kerbR);
    this.gravelL = dil(this.gravelL); this.gravelR = dil(this.gravelR);
  }

  // main straight: from final corner exit through to T1 braking (start line at s=450 from first ctrl point)
  inPitStraight(s) { return s > 40 && s < 900; }

  get startS() { return 450; }

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
    // ground
    const grassTex = TX.grass(); grassTex.repeat.set(220, 220);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: wet ? 0.75 : 0.95, color: wet ? 0xb8c8b0 : 0xffffff }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(100, -0.02, 360);
    ground.receiveShadow = true;
    this.group.add(ground);

    // asphalt
    const asp = TX.asphalt(wet);
    const roadMat = new THREE.MeshStandardMaterial({
      map: asp, roughness: wet ? 0.28 : 0.85, metalness: wet ? 0.15 : 0.0, color: wet ? 0xbfc4c9 : 0xffffff,
    });
    this.roadMat = roadMat;
    this.ribbon(-W, W, 0.03, roadMat, 1, 16);

    // run-off verge (tarmac strip next to track)
    const ro = TX.runoff();
    const roMat = new THREE.MeshStandardMaterial({ map: ro, roughness: wet ? 0.4 : 0.9, color: 0xbbbbbb });
    this.ribbon(-W - 4.5, -W, 0.02, roMat, 1, 30, (i) => this.kerbL[i]);
    this.ribbon(W, W + 4.5, 0.02, roMat, 1, 30, (i) => this.kerbR[i]);

    // gravel traps
    const gr = TX.gravel(); gr.repeat.set(3, 1);
    const grMat = new THREE.MeshStandardMaterial({ map: gr, roughness: 1, color: wet ? 0x9a8f7a : 0xffffff });
    this.ribbon((i) => -this.limL[i] + 1.5, -W - 4.5, 0.015, grMat, 3, 12, (i) => this.gravelL[i]);
    this.ribbon(W + 4.5, (i) => this.limR[i] - 1.5, 0.015, grMat, 3, 12, (i) => this.gravelR[i]);

    // kerbs
    const kt = TX.kerb();
    const kMat = new THREE.MeshStandardMaterial({ map: kt, roughness: wet ? 0.3 : 0.7 });
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

    // barriers with sponsor banners
    const bannerMats = [];
    for (let b = 0; b < TX.SPONSOR_COUNT; b++) {
      const t = TX.banner(b);
      bannerMats.push(new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, side: THREE.DoubleSide }));
    }
    const segLen = Math.round(240 / this.ds);
    for (let side = 0; side < 2; side++) {
      for (let seg = 0; seg * segLen < this.N; seg++) {
        const a = seg * segLen, b = a + segLen;
        const mat = bannerMats[(seg * 3 + side * 5) % bannerMats.length];
        const lat = side ? (i) => this.limR[i] : (i) => -this.limL[i];
        this.wall(lat, 1.2, 0, mat, 22, (i) => i >= a && i <= b, side === 1);
      }
    }
    // catch fence
    const fc = document.createElement('canvas'); fc.width = fc.height = 64;
    const fg = fc.getContext('2d');
    fg.strokeStyle = 'rgba(40,40,40,0.55)'; fg.lineWidth = 2;
    for (let i = 0; i < 64; i += 16) { fg.beginPath(); fg.moveTo(i, 0); fg.lineTo(i + 64, 64); fg.stroke(); fg.beginPath(); fg.moveTo(i + 64, 0); fg.lineTo(i, 64); fg.stroke(); }
    fg.fillStyle = 'rgba(30,30,30,0.9)'; fg.fillRect(0, 0, 3, 64);
    const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    const fenceMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.wall((i) => -this.limL[i] - 0.3, 3.2, 1.2, fenceMat, 3);
    this.wall((i) => this.limR[i] + 0.3, 3.2, 1.2, fenceMat, 3, (i) => !this.inPitStraight(i * this.ds));
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

  buildScenery() {
    const wet = this.wet;
    const crowdTex = TX.crowd();
    const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
    const greyMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.7 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });

    const grandstand = (len, depth, height) => {
      const g = new THREE.Group();
      const slope = new THREE.Mesh(new THREE.PlaneGeometry(len, Math.hypot(depth, height)), crowdMat);
      slope.material = crowdMat.clone(); slope.material.map = crowdTex.clone(); slope.material.map.repeat.set(len / 30, 1); slope.material.map.needsUpdate = true;
      slope.rotation.x = -Math.atan2(height, depth);
      slope.position.set(0, height / 2 + 1.5, -depth / 2);
      g.add(slope);
      const back = new THREE.Mesh(new THREE.BoxGeometry(len, height + 4, 1), greyMat);
      back.position.set(0, (height + 4) / 2, -depth - 0.5);
      g.add(back);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.6, depth + 6), whiteMat);
      roof.position.set(0, height + 7, -depth / 2 + 2);
      roof.rotation.x = 0.06;
      g.add(roof);
      for (let x = -len / 2; x <= len / 2; x += len / 6) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, height + 7, 0.5), darkMat);
        p.position.set(x, (height + 7) / 2, -depth - 0.5);
        g.add(p);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 1), greyMat);
      base.position.set(0, 0.75, 0);
      g.add(base);
      return g;
    };

    // main straight: grandstands left, pit building right
    for (let s = 120; s < 880; s += 95) {
      const gs = grandstand(90, 22, 14);
      this.place(gs, s, -this.limL[this.idx(s)] - 4, 0, Math.PI / 2);
    }
    // pit lane + garages on the right
    const pitMatT = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: wet ? 0.35 : 0.9 });
    this.ribbon(11.3, 28, 0.025, pitMatT, 1, 20, (i) => this.inPitStraight(i * this.ds));
    // pit wall
    const pitWallMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.7, side: THREE.DoubleSide });
    this.wall(() => 11, 1.3, 0, pitWallMat, 10, (i) => this.inPitStraight(i * this.ds));
    // garages
    const garageMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.15, metalness: 0.6 });
    for (let s = 70; s < 870; s += 40) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(40, 9, 16), garageMat);
      body.position.set(0, 4.5, -8); g.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 18), glassMat);
      top.position.set(0, 11.5, -8); g.add(top);
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(38, 3.2),
        new THREE.MeshStandardMaterial({ map: TX.banner(1 + ((s / 40) | 0) % 3), roughness: 0.6 }));
      ban.position.set(0, 7.2, 0.05); g.add(ban);
      for (let d = -15; d <= 15; d += 10) {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 5.5), new THREE.MeshStandardMaterial({ color: 0x0c0f14 }));
        door.position.set(d, 2.75, 0.03); g.add(door);
      }
      this.place(g, s, 29, 0, -Math.PI / 2);
    }

    // start gantry with lights
    this.lights = [];
    const gantry = new THREE.Group();
    const span = 2 * HALF_W + 6;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 1.2), darkMat);
    beam.position.y = 7.5; gantry.add(beam);
    for (const x of [-span / 2, span / 2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.3, 0.8), darkMat);
      leg.position.set(x, 4.15, 0); gantry.add(leg);
    }
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(span - 1, 1.3), new THREE.MeshStandardMaterial({ map: TX.banner(3) }));
    lb.position.set(0, 8.9, 0.6); gantry.add(lb);
    for (let i = 0; i < 5; i++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      pod.position.set(-3 + i * 1.5, 6.2, 0.55); gantry.add(pod);
      const lamps = [];
      for (let r = 0; r < 2; r++) {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshBasicMaterial({ color: 0x220000 }));
        l.position.set(-3 + i * 1.5, 6.5 - r * 0.6, 0.76); gantry.add(l);
        lamps.push(l);
      }
      this.lights.push(lamps);
    }
    this.place(gantry, this.startS + 6, 0, 0, 0);

    // position tower
    const tower = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 3), darkMat);
    tb.position.y = 13; tower.add(tb);
    const tsign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 20), new THREE.MeshStandardMaterial({ map: TX.liveryText('1 2 3', '#111', '#fff', 64, 512, 40) }));
    tsign.position.set(0, 14, 1.55); tower.add(tsign);
    this.place(tower, this.startS + 120, -this.limL[this.idx(this.startS + 120)] - 2, 0, Math.PI / 2);

    // distance boards before heavy braking zones
    const boards = [150, 100, 50].map((n) => new THREE.MeshStandardMaterial({ map: TX.distanceBoard(n), roughness: 0.6 }));
    const N = this.N;
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      if (this.brakeZone[i] && !this.brakeZone[prev]) {
        // find how much speed is lost
        let j = i; while (this.brakeZone[j % N]) j++;
        const drop = this.vProf[i] - this.vProf[j % N];
        if (drop < 22) continue;
        const sStart = i * this.ds;
        for (let b = 0; b < 3; b++) {
          const s = sStart + 30 + b * 50;
          const side = this.k[(j) % N] > 0 ? -1 : 1; // outside of the corner
          const lat = side > 0 ? this.limR[this.idx(s)] - 1.5 : -this.limL[this.idx(s)] + 1.5;
          const bd = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), boards[b]);
          const g = new THREE.Group(); bd.position.y = 1.9; g.add(bd);
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), greyMat);
          pole.position.y = 0.7; g.add(pole);
          this.place(g, s, lat, 0, 0);
        }
      }
    }

    // trees (instanced) outside the barriers
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 6);
    const leafGeo = new THREE.IcosahedronGeometry(3.2, 1);
    const pineGeo = new THREE.ConeGeometry(2.6, 8, 7);
    const count = 1400;
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3423 }), count);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: wet ? 0x2f4a2a : 0x3c5f2e, roughness: 0.9, flatShading: true }), count);
    const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: wet ? 0x22381f : 0x2c4a24, roughness: 0.9, flatShading: true }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let placed = 0, pc = 0, lc = 0;
    let seed = 1234;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tmp = {};
    while (placed < count) {
      const x = -900 + rnd() * 1900, z = -400 + rnd() * 1300;
      this.locate(x, z, -1, tmp);
      const lim = tmp.lat > 0 ? this.limR[tmp.i] : this.limL[tmp.i];
      const d = Math.abs(tmp.lat);
      if (d < lim + 14) { placed++; continue; }
      if (this.inPitStraight(tmp.s) && d < 70) { placed++; continue; }
      const s = 0.7 + rnd() * 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      if (rnd() < 0.5) {
        p.set(x, 1.5 * s, z); sc.set(s, s, s); m.compose(p, q, sc); trunks.setMatrixAt(lc, m);
        p.set(x, 4.6 * s, z); sc.set(s, s * 0.9, s); m.compose(p, q, sc); leaves.setMatrixAt(lc, m); lc++;
      } else {
        p.set(x, 4 * s, z); sc.set(s, s, s); m.compose(p, q, sc); pines.setMatrixAt(pc, m); pc++;
      }
      placed++;
    }
    trunks.count = lc; leaves.count = lc; pines.count = pc;
    this.group.add(trunks, leaves, pines);

    // distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: wet ? 0x56664f : 0x5d7a4a, roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 1700 + (i % 3) * 200;
      const h = new THREE.Mesh(new THREE.ConeGeometry(260 + (i * 37) % 200, 120 + (i * 53) % 140, 7), hillMat);
      h.position.set(100 + Math.cos(a) * r, 30, 360 + Math.sin(a) * r);
      this.group.add(h);
    }

    // TV crane near the hairpin / T1 for flavour
    const crane = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 26), new THREE.MeshStandardMaterial({ color: 0xf2b705 }));
    arm.position.set(0, 18, -8); arm.rotation.x = -0.5; crane.add(arm);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), darkMat);
    mast.position.y = 7; crane.add(mast);
    this.place(crane, 1150, 45, 0, 0.5);
  }

  setStartLights(n, out) {
    // n = number of red light columns lit (0..5); out = lights out
    this.lights.forEach((lamps, i) => lamps.forEach((l) => l.material.color.setHex(!out && i < n ? 0xff1010 : 0x220000)));
  }
}
