// Detailed procedural 2025-spec F1 car: lofted bodywork with painted liveries,
// real wing profiles, wheels with covers, suspension, floor and diffuser.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TEAMS = [
  { id: 'mcl', name: 'McLaren', body: 0xff8000, top: 0xff8000, low: 0x161616, accent: 0x47c7fc, drivers: ['NORRIS', 'PIASTRI'], numbers: [4, 81], pace: 1.0 },
  { id: 'fer', name: 'Ferrari', body: 0xd40000, top: 0xf2f2f2, low: 0xd40000, accent: 0xffd200, drivers: ['LECLERC', 'HAMILTON'], numbers: [16, 44], pace: 0.985 },
  { id: 'rbr', name: 'Red Bull Racing', body: 0x1b2a5e, top: 0x1b2a5e, low: 0x0e1633, accent: 0xd0021b, drivers: ['VERSTAPPEN', 'TSUNODA'], numbers: [1, 22], pace: 0.99 },
  { id: 'mer', name: 'Mercedes', body: 0xb9bec2, top: 0x16191c, low: 0x16191c, accent: 0x00d2be, drivers: ['RUSSELL', 'ANTONELLI'], numbers: [63, 12], pace: 0.99 },
  { id: 'ast', name: 'Aston Martin', body: 0x00594f, top: 0x00594f, low: 0x0b2f2a, accent: 0xcedc00, drivers: ['ALONSO', 'STROLL'], numbers: [14, 18], pace: 0.965 },
  { id: 'alp', name: 'Alpine', body: 0x0a1e5a, top: 0xff87bc, low: 0x0a1e5a, accent: 0xff87bc, drivers: ['GASLY', 'COLAPINTO'], numbers: [10, 43], pace: 0.96 },
  { id: 'wil', name: 'Williams', body: 0x0a2a6b, top: 0x0a2a6b, low: 0x06173d, accent: 0x00a0de, drivers: ['ALBON', 'SAINZ'], numbers: [23, 55], pace: 0.97 },
  { id: 'rb', name: 'Racing Bulls', body: 0xf0f0f0, top: 0x1634cc, low: 0x1634cc, accent: 0xd0021b, drivers: ['HADJAR', 'LAWSON'], numbers: [6, 30], pace: 0.968 },
  { id: 'sau', name: 'Kick Sauber', body: 0x161616, top: 0x161616, low: 0x0a0a0a, accent: 0x52e252, drivers: ['HULKENBERG', 'BORTOLETO'], numbers: [27, 5], pace: 0.958 },
  { id: 'has', name: 'Haas', body: 0xf0f0f0, top: 0xf0f0f0, low: 0x1a1a1a, accent: 0xe6002b, drivers: ['OCON', 'BEARMAN'], numbers: [31, 87], pace: 0.962 },
];

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const Z0 = -2.95, ZLEN = 5.95; // livery v-mapping range along the car

// ------------------------------------------------------------------ geometry helpers
const lerp = (a, b, t) => a + (b - a) * t;
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const KEYS = ['z', 'cx', 'cy', 'w', 'ht', 'hb', 'n'];
const val = (s, k) => s[k] ?? (k === 'cx' ? 0 : k === 'n' ? 2.5 : 0);
function interpSections(S, sub) {
  const out = [];
  for (let i = 0; i < S.length - 1; i++) {
    for (let k = 0; k < sub; k++) {
      const t = k / sub, o = {};
      for (const key of KEYS) {
        const g = (j) => val(S[Math.max(0, Math.min(S.length - 1, j))], key);
        o[key] = cr(g(i - 1), g(i), g(i + 1), g(i + 2), t);
      }
      out.push(o);
    }
  }
  const last = S[S.length - 1], o = {};
  for (const key of KEYS) o[key] = val(last, key);
  out.push(o);
  return out;
}
// loft a smooth body through superellipse cross-sections; u = around (0 bottom, .5 top), v = along car
function loft(S, { seg = 36, sub = 6, capStart = true, capEnd = true, mirrorX = false } = {}) {
  const secs = interpSections(S, sub);
  const pos = [], uv = [], idx = [];
  const ring = seg + 1;
  for (const s of secs) {
    for (let j = 0; j <= seg; j++) {
      const t = j / seg, th = -Math.PI / 2 + t * Math.PI * 2;
      const c = Math.cos(th), si = Math.sin(th), e = 2 / Math.max(1.2, s.n);
      let x = s.cx + s.w * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = s.cy + (si > 0 ? s.ht : s.hb) * Math.sign(si) * Math.pow(Math.abs(si), e);
      if (mirrorX) x = -x;
      pos.push(x, y, s.z);
      uv.push(mirrorX ? 1 - t : t, (s.z - Z0) / ZLEN);
    }
  }
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
      if (mirrorX) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (si, flip) => {
    const s = secs[si];
    const ci = pos.length / 3;
    pos.push(mirrorX ? -s.cx : s.cx, s.cy, s.z); uv.push(0.5, (s.z - Z0) / ZLEN);
    for (let j = 0; j < seg; j++) {
      const a = si * ring + j, b = a + 1;
      const f = mirrorX ? !flip : flip;
      if (f) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(secs.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function sectionAt(S, z) {
  for (let i = 0; i < S.length - 1; i++) {
    if (z >= S[i].z && z <= S[i + 1].z) {
      const t = (z - S[i].z) / (S[i + 1].z - S[i].z), o = {};
      for (const k of KEYS) o[k] = lerp(val(S[i], k), val(S[i + 1], k), t);
      return o;
    }
  }
  return S[S.length - 1];
}

// cambered airfoil, chord along +z (LE at z=0), thickness y, extruded along x
function airfoilShape(chord, thick, camber) {
  const sh = new THREE.Shape();
  const N = 14, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const x = (1 - Math.cos((i / N) * Math.PI)) / 2;
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = -camber * 4 * x * (1 - x); // inverted camber for downforce
    top.push([-x * chord, (yc + yt) * chord]); bot.push([-x * chord, (yc - yt) * chord]);
  }
  sh.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i <= N; i++) sh.lineTo(top[i][0], top[i][1]);
  for (let i = N; i >= 0; i--) sh.lineTo(bot[i][0], bot[i][1]);
  return sh;
}
function wing(chord, thick, camber, span, aoa) {
  const g = new THREE.ExtrudeGeometry(airfoilShape(chord, thick, camber), { depth: span, bevelEnabled: false, curveSegments: 4 });
  g.rotateY(Math.PI / 2);      // chord -> +z, span -> +x
  g.rotateX(-aoa);             // trailing edge up
  return g;
}
// flat plate from a 2D outline in (z, y), thickness along x
function plate(pts, thick) {
  const sh = new THREE.Shape();
  sh.moveTo(-pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(-pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(Math.PI / 2);
  g.translate(-thick / 2, 0, 0);
  return g;
}
// horizontal plate from outline in (x, z), thickness along y
function slab(pts, thick, y) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], -pts[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
// streamlined strut between two points
function strut(a, b, w = 0.05, h = 0.018) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(1, 1, len, 8, 1);
  g.scale(w / 2, 1, h / 2);
  const m = new THREE.Matrix4();
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  m.compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
// pin all UVs of a part to one spot of the livery texture (solid colour)
const solid = (g, u = 0.5, v = 0.92) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, u, v); return g; };
function flipWinding(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else {
    for (const name of Object.keys(g.attributes)) {
      const at2 = g.attributes[name], n = at2.itemSize, arr = at2.array;
      for (let i = 0; i < arr.length; i += 3 * n) for (let k = 0; k < n; k++) { const t = arr[i + n + k]; arr[i + n + k] = arr[i + 2 * n + k]; arr[i + 2 * n + k] = t; }
    }
  }
  g.computeVertexNormals();
  return g;
}
const mirror = (g) => { const c = g.clone(); c.scale(-1, 1, 1); return flipWinding(c); };
function merge(list) {
  const prepared = list.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    if (!x.attributes.normal) x.computeVertexNormals();
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
    return x;
  });
  return mergeGeometries(prepared, false);
}

// ------------------------------------------------------------------ body definition (shared by all cars)
const MONO = [
  { z: -2.82, cy: 0.215, w: 0.05, ht: 0.035, hb: 0.03, n: 2.4 },
  { z: -2.6, cy: 0.235, w: 0.095, ht: 0.06, hb: 0.05, n: 2.6 },
  { z: -2.15, cy: 0.3, w: 0.14, ht: 0.085, hb: 0.075, n: 2.8 },
  { z: -1.65, cy: 0.39, w: 0.19, ht: 0.115, hb: 0.12, n: 3.2 },
  { z: -1.1, cy: 0.47, w: 0.245, ht: 0.155, hb: 0.2, n: 3.6 },
  { z: -0.55, cy: 0.5, w: 0.31, ht: 0.19, hb: 0.29, n: 4.2 },
  { z: -0.05, cy: 0.49, w: 0.36, ht: 0.19, hb: 0.3, n: 4.6 },
  { z: 0.4, cy: 0.48, w: 0.37, ht: 0.2, hb: 0.3, n: 4.6 },
];
const COVER = [
  { z: 0.28, cy: 0.66, w: 0.2, ht: 0.32, hb: 0.3, n: 3 },
  { z: 0.55, cy: 0.66, w: 0.3, ht: 0.32, hb: 0.36, n: 3.2 },
  { z: 1.05, cy: 0.58, w: 0.27, ht: 0.25, hb: 0.32, n: 3 },
  { z: 1.6, cy: 0.47, w: 0.19, ht: 0.18, hb: 0.26, n: 2.8 },
  { z: 2.1, cy: 0.39, w: 0.11, ht: 0.12, hb: 0.19, n: 2.6 },
  { z: 2.5, cy: 0.35, w: 0.055, ht: 0.07, hb: 0.12, n: 2.4 },
];
const POD = [
  { z: -0.62, cx: 0.6, cy: 0.43, w: 0.19, ht: 0.12, hb: 0.17, n: 5 },
  { z: -0.4, cx: 0.63, cy: 0.42, w: 0.235, ht: 0.155, hb: 0.21, n: 4.4 },
  { z: 0.2, cx: 0.61, cy: 0.39, w: 0.24, ht: 0.16, hb: 0.23, n: 4 },
  { z: 0.85, cx: 0.53, cy: 0.31, w: 0.2, ht: 0.11, hb: 0.17, n: 3.4 },
  { z: 1.45, cx: 0.4, cy: 0.24, w: 0.13, ht: 0.065, hb: 0.11, n: 3 },
  { z: 1.95, cx: 0.27, cy: 0.2, w: 0.06, ht: 0.035, hb: 0.06, n: 2.6 },
];
export const WHEELS = { front: { x: 0.8, z: -1.75, w: 0.305 }, rear: { x: 0.78, z: 1.85, w: 0.405 }, r: 0.36 };
export const MIRROR = { x: 0.6, y: 0.725, z: -0.66, w: 0.17, h: 0.064 };

let SHARED = null;
function sharedGeometry() {
  if (SHARED) return SHARED;
  const livery = [], carbon = [], accent = [], black = [];
  // monocoque, engine cover, sidepods
  livery.push(loft(MONO, { capEnd: false }));
  livery.push(loft(COVER, { capStart: true }));
  livery.push(loft(POD, { capStart: false }), loft(POD, { capStart: false, mirrorX: true }));
  // sidepod inlets (dark mouths)
  for (const s of [1, -1]) {
    const inlet = new THREE.CircleGeometry(1, 24); inlet.scale(0.18, 0.14, 1); inlet.rotateY(Math.PI);
    black.push(at(inlet, s * 0.6, 0.44, -0.618));
  }
  // cockpit opening (dark) and headrest pads
  black.push(loft([
    { z: -0.48, cy: 0.69, w: 0.06, ht: 0.012, hb: 0.012, n: 2 },
    { z: -0.35, cy: 0.69, w: 0.24, ht: 0.012, hb: 0.012, n: 3 },
    { z: 0.25, cy: 0.69, w: 0.27, ht: 0.012, hb: 0.012, n: 4 },
    { z: 0.33, cy: 0.69, w: 0.2, ht: 0.012, hb: 0.012, n: 4 },
  ], { seg: 24, sub: 4 }));
  for (const s of [1, -1]) black.push(at(new THREE.BoxGeometry(0.07, 0.08, 0.5), s * 0.25, 0.72, 0.04));
  // airbox intake + roll hoop
  const ab = new THREE.CircleGeometry(1, 24); ab.scale(0.13, 0.1, 1); ab.rotateY(Math.PI);
  black.push(at(ab, 0, 0.88, 0.275));
  carbon.push(at(new THREE.BoxGeometry(0.06, 0.12, 0.06), 0, 1.0, 0.36));
  // shark fin
  livery.push(solid(plate([[0.55, 0.92], [2.25, 0.62], [2.4, 0.5], [1.2, 0.55], [0.55, 0.8]], 0.012), 0.5, 0.7));
  // halo
  carbon.push(haloGeo(0.03, 96));
  // floor with edge wings and fences
  const floorPts = [[-0.3, -1.25], [-0.6, -0.95], [-0.78, -0.55], [-0.8, 1.35], [-0.6, 1.62], [-0.55, 2.05], [-0.5, 2.38], [0.5, 2.38], [0.55, 2.05], [0.6, 1.62], [0.8, 1.35], [0.78, -0.55], [0.6, -0.95], [0.3, -1.25]];
  carbon.push(slab(floorPts, 0.025, 0.055));
  for (const s of [1, -1]) carbon.push(plate([[-0.9, 0.06], [-0.4, 0.13], [1.3, 0.13], [1.35, 0.06]], 0.012).translate(s * 0.79, 0, 0));
  for (const x of [0.32, 0.42, 0.52]) for (const s of [1, -1]) carbon.push(plate([[-1.2, 0.04], [-0.9, 0.065], [-0.5, 0.065], [-0.6, 0.04]], 0.01).translate(s * x, 0, 0));
  // diffuser ramp + strakes
  const diff = new THREE.PlaneGeometry(1.0, 0.55, 1, 1); diff.rotateX(Math.PI / 2 - 0.32);
  carbon.push(at(diff, 0, 0.14, 2.15));
  for (const x of [-0.42, -0.24, -0.08, 0.08, 0.24, 0.42]) carbon.push(plate([[1.88, 0.06], [2.4, 0.24], [2.42, 0.06]], 0.01).translate(x, 0, 0));
  // front wing: four elements sweeping up at the tips
  const fwEls = [
    { c: 0.3, z: -2.92, y: 0.075, a: 0.06, cam: 0.05 },
    { c: 0.15, z: -2.68, y: 0.11, a: 0.32, cam: 0.08 },
    { c: 0.13, z: -2.57, y: 0.16, a: 0.55, cam: 0.08 },
    { c: 0.11, z: -2.48, y: 0.215, a: 0.8, cam: 0.08 },
  ];
  fwEls.forEach((e, i) => {
    const inner = i === 0 ? 0 : 0.18;
    const g = wing(e.c, 0.09, e.cam, 0.98 - inner, e.a);
    g.translate(inner, e.y, e.z);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k); if (x > 0.62) p.setY(k, p.getY(k) + (x - 0.62) * 0.18); }
    g.computeVertexNormals();
    const target = i >= 2 ? accent : carbon;
    target.push(g, mirror(g));
  });
  for (const s of [1, -1]) {
    carbon.push(plate([[-2.98, 0.04], [-2.98, 0.24], [-2.6, 0.32], [-2.36, 0.3], [-2.36, 0.12], [-2.6, 0.04]], 0.014).translate(s * 0.985, 0, 0));
    carbon.push(plate([[-2.7, 0.1], [-2.55, 0.23], [-2.45, 0.23], [-2.6, 0.1]], 0.012).translate(s * 0.09, 0, 0));
  }
  // rear wing: mainplane + DRS flap, endplates, beam wing, swan-neck pylons
  carbon.push(wing(0.3, 0.1, 0.07, 1.0, 0.12).translate(-0.5, 0.8, 2.42));
  accent.push(wing(0.2, 0.1, 0.06, 0.98, 0.65).translate(-0.49, 0.9, 2.66));
  carbon.push(wing(0.16, 0.12, 0.05, 0.8, 0.2).translate(-0.4, 0.34, 2.45));
  for (const s of [1, -1]) {
    livery.push(solid(plate([[2.28, 0.32], [2.3, 0.9], [2.42, 1.02], [2.92, 1.0], [2.9, 0.62], [2.62, 0.5], [2.55, 0.32]], 0.016).translate(s * 0.51, 0, 0), 0.25, 0.95));
    carbon.push(strut([s * 0.06, 0.45, 2.45], [s * 0.06, 0.95, 2.62], 0.06, 0.02));
  }
  carbon.push(at(new THREE.BoxGeometry(0.06, 0.08, 0.12), 0, 1.0, 2.62)); // DRS actuator pod
  carbon.push(at(new THREE.BoxGeometry(0.12, 0.12, 0.35), 0, 0.33, 2.62)); // crash structure
  const exh = new THREE.CylinderGeometry(0.045, 0.05, 0.2, 14, 1, true); exh.rotateX(Math.PI / 2);
  black.push(at(exh, 0, 0.5, 2.5));
  // suspension (front pushrod, rear pullrod), uprights / brake ducts
  for (const s of [1, -1]) {
    const fz = WHEELS.front.z, fx = WHEELS.front.x - 0.13, rz = WHEELS.rear.z, rx = WHEELS.rear.x - 0.18;
    carbon.push(strut([s * 0.2, 0.42, fz - 0.28], [s * fx, 0.47, fz]), strut([s * 0.2, 0.44, fz + 0.3], [s * fx, 0.47, fz]));
    carbon.push(strut([s * 0.17, 0.26, fz - 0.32], [s * fx, 0.24, fz]), strut([s * 0.17, 0.27, fz + 0.32], [s * fx, 0.24, fz]));
    carbon.push(strut([s * 0.18, 0.55, fz + 0.12], [s * fx, 0.23, fz + 0.02], 0.035, 0.02));
    carbon.push(strut([s * 0.13, 0.3, fz + 0.06], [s * fx, 0.36, fz + 0.06], 0.035, 0.02));
    carbon.push(strut([s * 0.16, 0.38, rz - 0.3], [s * rx, 0.46, rz]), strut([s * 0.2, 0.4, rz + 0.25], [s * rx, 0.46, rz]));
    carbon.push(strut([s * 0.18, 0.2, rz - 0.3], [s * rx, 0.24, rz]), strut([s * 0.22, 0.22, rz + 0.25], [s * rx, 0.24, rz]));
    carbon.push(strut([s * 0.2, 0.2, rz - 0.05], [s * rx, 0.45, rz + 0.02], 0.035, 0.02));
    carbon.push(at(new THREE.BoxGeometry(0.1, 0.3, 0.26), s * (fx + 0.02), 0.36, fz));
    carbon.push(at(new THREE.BoxGeometry(0.12, 0.34, 0.32), s * (rx + 0.04), 0.36, rz));
  }
  // mirrors: stalk + aero housing (glass face per car)
  for (const s of [1, -1]) {
    carbon.push(strut([s * 0.4, 0.62, MIRROR.z + 0.08], [s * MIRROR.x, MIRROR.y - 0.03, MIRROR.z + 0.05], 0.035, 0.012));
    const h = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    h.rotateX(-Math.PI / 2); h.scale(MIRROR.w / 2 + 0.012, MIRROR.h / 2 + 0.012, 0.09);
    livery.push(solid(at(h, s * MIRROR.x, MIRROR.y, MIRROR.z + 0.002), 0.2, 0.3));
  }
  SHARED = { livery: merge(livery), carbon: merge(carbon), accent: merge(accent), black: merge(black) };
  return SHARED;
}

// Halo: titanium ring around the cockpit + centre pillar, in car space
export function haloGeo(r, seg = 64) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI * 0.82 + (i / 24) * Math.PI * 1.64;
    const front = Math.cos(a);
    const x = Math.sin(a) * 0.4;
    const z = -0.1 - front * 0.47;
    const y = 0.7 + 0.32 * Math.pow(Math.max(0, (front + 0.75) / 1.75), 0.6);
    pts.push(new THREE.Vector3(x, y, z));
  }
  const ring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 10, false);
  const pillar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.015, -0.57), new THREE.Vector3(0, 0.95, -0.72), new THREE.Vector3(0, 0.71, -0.9),
  ]), 12, r * 0.9, 10, false);
  return merge([ring, pillar]);
}

// ------------------------------------------------------------------ textures
const texCache = {};
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function carbonTex() {
  if (texCache.carbon) return texCache.carbon;
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#121315'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    const gr = g.createLinearGradient(x, y, x + 8, y + 8);
    const on = ((x + y) / 8) % 2;
    gr.addColorStop(0, on ? '#2a2c30' : '#1a1b1e'); gr.addColorStop(1, on ? '#141518' : '#26282c');
    g.fillStyle = gr; g.fillRect(x, y, 8, 8);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.colorSpace = THREE.SRGBColorSpace;
  return (texCache.carbon = t);
}

// Livery painted in loft UV space: canvas x = u around the section (0 bottom, .25/.75 sides, .5 top),
// canvas y = v along the car (0 nose -> 1 rear)
function liveryTex(team) {
  if (texCache['l' + team.id]) return texCache['l' + team.id];
  const W = 1024, H = 1024;
  const [c, g] = canvas(W, H);
  const R = (u0, u1, v0, v1, col) => { g.fillStyle = col; g.fillRect(u0 * W, v0 * H, (u1 - u0) * W, (v1 - v0) * H); };
  const B = hex(team.body), A = hex(team.accent);
  R(0, 1, 0, 1, B);
  const lower = (col) => { R(0, 0.17, 0, 1, col); R(0.83, 1, 0, 1, col); };
  const stripe = (u, w, v0, v1, col) => { R(u - w, u + w, v0, v1, col); R(1 - u - w, 1 - u + w, v0, v1, col); };
  const grad = (v0, v1, c0, c1, u0 = 0, u1 = 1) => { const gr = g.createLinearGradient(0, v0 * H, 0, v1 * H); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(u0 * W, v0 * H, (u1 - u0) * W, (v1 - v0) * H); };
  switch (team.id) {
    case 'mcl': lower('#1b1c1f'); stripe(0.21, 0.012, 0.25, 0.75, A); grad(0.55, 1, 'rgba(27,28,31,0)', '#1b1c1f', 0.17, 0.33); grad(0.55, 1, 'rgba(27,28,31,0)', '#1b1c1f', 0.67, 0.83); break;
    case 'fer': R(0.3, 0.7, 0, 0.5, '#f2f2f2'); stripe(0.3, 0.008, 0, 0.5, A); R(0.47, 0.53, 0.5, 1, '#f2f2f2'); lower('#1b1b1b'); break;
    case 'rbr': stripe(0.26, 0.05, 0.36, 0.48, '#d0021b'); stripe(0.26, 0.03, 0.3, 0.36, A); R(0.4, 0.6, 0.03, 0.12, '#d0021b'); lower('#0b1330'); break;
    case 'mer': grad(0.15, 0.85, '#c3c8cc', '#141618'); lower('#101214'); stripe(0.24, 0.01, 0.2, 0.9, A); break;
    case 'ast': stripe(0.25, 0.018, 0.1, 0.95, A); R(0.42, 0.58, 0.0, 0.18, A); lower('#0d2a25'); break;
    case 'alp': grad(0.3, 0.95, '#0a1e5a', '#ff5fa8'); stripe(0.27, 0.01, 0.1, 0.9, '#ffffff'); lower('#081439'); break;
    case 'wil': grad(0.0, 1.0, '#00a0de', '#061a4a'); stripe(0.3, 0.008, 0.2, 0.8, '#ffffff'); lower('#061233'); break;
    case 'rb': lower('#1634cc'); stripe(0.22, 0.06, 0.15, 0.9, '#1634cc'); stripe(0.3, 0.01, 0.2, 0.8, '#d0021b'); R(0.45, 0.55, 0.0, 0.2, '#1634cc'); break;
    case 'sau': for (let i = 0; i < 6; i++) stripe(0.2 + i * 0.03, 0.006, 0.2 + i * 0.05, 0.75, A); R(0.44, 0.56, 0.0, 0.12, A); lower('#050505'); break;
    case 'has': lower('#1b1b1b'); stripe(0.22, 0.03, 0.1, 0.95, '#1b1b1b'); stripe(0.26, 0.01, 0.1, 0.95, A); R(0.44, 0.56, 0.0, 0.15, A); break;
  }
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
  for (const v of [0.24, 0.4, 0.58]) { g.beginPath(); g.moveTo(0, v * H); g.lineTo(W, v * H); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.flipY = false;
  return (texCache['l' + team.id] = t);
}

function decalTex(text, color, opts = {}) {
  const key = 'd' + text + color + (opts.font || '');
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(opts.w || 512, opts.h || 128);
  g.fillStyle = color;
  g.font = opts.font || 'italic 900 84px "Titillium Web", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 4, c.width - 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (texCache[key] = t);
}

function tyreTex(compound) {
  const key = 'tyre' + compound;
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(512, 512);
  const cx = 256;
  g.strokeStyle = compound; g.lineWidth = 16;
  g.beginPath(); g.arc(cx, cx, 214, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e9e9e9'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 2; i++) {
    g.save(); g.translate(cx, cx); g.rotate(i * Math.PI + 0.3);
    const word = 'P ZERO';
    for (let k = 0; k < word.length; k++) { g.save(); g.rotate((k - word.length / 2) * 0.09); g.fillText(word[k], 0, -240); g.restore(); }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (texCache[key] = t);
}

function coverTex(accent) {
  const key = 'cover' + accent;
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(256, 256);
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#3a3d42'); gr.addColorStop(0.75, '#16181b'); gr.addColorStop(1, '#0c0d0f');
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
  g.strokeStyle = hex(accent); g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 110, 0.2, 2.6); g.stroke();
  g.fillStyle = '#888'; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 26, 128 + Math.sin(a) * 26, 6, 0, 7); g.fill(); }
  g.fillStyle = '#c9c9c9'; g.beginPath(); g.arc(128, 128, 14, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (texCache[key] = t);
}

// ------------------------------------------------------------------ wheels
const tyreGeoCache = {};
function tyreGeo(r, w) {
  const k = r + '_' + w;
  if (tyreGeoCache[k]) return tyreGeoCache[k];
  const rimR = 0.235, hw = w / 2;
  const prof = [[rimR, -hw * 0.92], [rimR + 0.02, -hw * 0.99], [r - 0.06, -hw * 1.02], [r - 0.025, -hw * 0.94], [r - 0.006, -hw * 0.78], [r, -hw * 0.5], [r, hw * 0.5], [r - 0.006, hw * 0.78], [r - 0.025, hw * 0.94], [r - 0.06, hw * 1.02], [rimR + 0.02, hw * 0.99], [rimR, hw * 0.92]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  g.rotateZ(Math.PI / 2);
  return (tyreGeoCache[k] = g);
}
const mats = {};
function sharedMats() {
  if (mats.carbon) return mats;
  mats.carbon = new THREE.MeshPhysicalMaterial({ map: carbonTex(), color: 0x8a8a8a, roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  mats.black = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8, side: THREE.DoubleSide });
  mats.rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.92, metalness: 0 });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.9 });
  return mats;
}
function compoundColor(wet, seed) {
  if (wet) return '#33c23e';
  return ['#e8242b', '#f2c80f', '#f0f0f0'][seed % 3];
}

function buildWheel(r, w, wet, accent, seed) {
  const m = sharedMats();
  const wheel = new THREE.Group();
  const tyre = new THREE.Mesh(tyreGeo(r, w), m.rubber); tyre.castShadow = true;
  wheel.add(tyre);
  const sideMat = new THREE.MeshStandardMaterial({ map: tyreTex(compoundColor(wet, seed)), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  const coverMat = new THREE.MeshStandardMaterial({ map: coverTex(accent), roughness: 0.4, metalness: 0.5 });
  for (const s of [1, -1]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, r - 0.004, 48), sideMat);
    ring.rotation.y = s * Math.PI / 2; ring.position.x = s * (w / 2 * 1.025);
    wheel.add(ring);
    const cover = new THREE.Mesh(new THREE.CircleGeometry(0.236, 32), coverMat);
    cover.rotation.y = s * Math.PI / 2; cover.position.x = s * (w / 2 * 0.9);
    wheel.add(cover);
  }
  return wheel;
}

// ------------------------------------------------------------------ car assembly
export function buildCar(team, wet, number = 0, opts = {}) {
  const geo = sharedGeometry();
  const m = sharedMats();
  const car = new THREE.Group();
  const liv = new THREE.MeshPhysicalMaterial({
    map: liveryTex(team), roughness: team.id === 'rbr' ? 0.55 : 0.32, metalness: team.id === 'mer' ? 0.55 : 0.15,
    clearcoat: team.id === 'rbr' ? 0.15 : 1.0, clearcoatRoughness: 0.08, side: THREE.DoubleSide,
  });
  const acc = new THREE.MeshPhysicalMaterial({ color: team.accent, roughness: 0.35, metalness: 0.1, clearcoat: 0.8 });
  const add = (g, mat, shadow = true) => { const me = new THREE.Mesh(g, mat); me.castShadow = shadow; car.add(me); return me; };
  add(geo.livery, liv); add(geo.carbon, m.carbon); add(geo.accent, acc); add(geo.black, m.black, false);

  // T-cam: black for the first driver, yellow for the second
  const tcam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: opts.second ? 0xf5d000 : 0x111111, roughness: 0.4 }));
  tcam.position.set(0, 1.06, 0.38); car.add(tcam);

  // mirror glass (the player car shows the live rear view)
  car.userData.mirrors = [];
  for (const s of [-1, 1]) {
    const gg = new THREE.PlaneGeometry(MIRROR.w, MIRROR.h);
    const uv = gg.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setX(i, s < 0 ? (1 - u) * 0.5 + 0.5 : (1 - u) * 0.5); }
    const glass = new THREE.Mesh(gg, opts.mirrorTex ? new THREE.MeshBasicMaterial({ map: opts.mirrorTex }) : m.glass);
    glass.position.set(s * MIRROR.x, MIRROR.y, MIRROR.z + 0.004);
    glass.rotation.y = s * -0.08;
    car.add(glass); car.userData.mirrors.push(glass);
  }

  // decals
  const light = team.top === 0xf2f2f2 || team.top === 0xf0f0f0;
  const decal = (tex, w, h, x, y, z, ry = 0, rx = 0) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
    me.position.set(x, y, z); me.rotation.set(rx, ry, 0, 'YXZ'); car.add(me); return me;
  };
  const numFont = { w: 256, h: 128, font: 'italic 900 100px "Titillium Web", Arial' };
  if (number) {
    const s = sectionAt(MONO, -2.0);
    decal(decalTex(String(number), light ? '#111' : '#fff', numFont), 0.2, 0.1, 0, s.cy + s.ht + 0.004, -2.0, 0, -Math.PI / 2 + 0.17);
    for (const sd of [1, -1]) {
      const c = sectionAt(COVER, 1.25);
      decal(decalTex(String(number), '#fff', numFont), 0.22, 0.11, sd * (c.w + 0.006), c.cy + 0.06, 1.25, sd * Math.PI / 2);
    }
  }
  const sponsors = { mcl: 'VELOX', fer: 'ROSSA', rbr: 'ORACLE·X', mer: 'PETRA', ast: 'ARAMCOR', alp: 'BWT·A', wil: 'ATLAS', rb: 'VISA·C', sau: 'STAKEX', has: 'MONEYG' };
  const spName = sponsors[team.id] || 'KRONOS';
  const sp = decalTex(spName, light ? '#111' : '#fff');
  for (const sd of [1, -1]) {
    const p = sectionAt(POD, 0.15);
    decal(sp, 0.62, 0.14, sd * (p.cx + p.w + 0.006), p.cy + 0.02, 0.15, sd * Math.PI / 2);
    decal(decalTex(team.name.toUpperCase(), '#fff', { w: 512, h: 96, font: 'bold 60px Arial' }), 0.44, 0.08, sd * 0.527, 0.86, 2.62, sd * Math.PI / 2);
  }
  decal(sp, 0.32, 0.08, 0, 0.705, -0.85, 0, -Math.PI / 2 + 0.1);
  decal(decalTex(spName, '#fff'), 0.7, 0.16, 0, 0.88, 2.43, Math.PI, 0.12);

  // helmet with visor
  const helmet = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), new THREE.MeshPhysicalMaterial({ color: team.accent, roughness: 0.25, clearcoat: 1 }));
  shell.scale.set(1, 1.05, 1.12); helmet.add(shell);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 8, Math.PI * 0.72, Math.PI * 0.56, Math.PI * 0.35, Math.PI * 0.2), m.glass);
  visor.scale.set(1, 1.05, 1.12); helmet.add(visor);
  helmet.position.set(0, 0.86, 0.05); car.add(helmet);
  car.userData.helmet = helmet;

  // rain light
  const rl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x330000 }));
  rl.position.set(0, 0.33, 2.8); car.add(rl);
  car.userData.rainLight = rl;

  // wheels
  const wheels = [];
  const seed = (number || 1) + team.id.length;
  for (const [ax, front] of [[WHEELS.front, true], [WHEELS.rear, false]]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * ax.x, WHEELS.r, ax.z);
      const wh = buildWheel(WHEELS.r, ax.w, wet, team.accent, seed);
      pivot.add(wh); car.add(pivot);
      wheels.push({ pivot, wheel: wh, front });
    }
  }
  car.userData.wheels = wheels;
  car.add(contactShadow());
  return car;
}

let shadowTex = null;
function contactShadow() {
  if (!shadowTex) {
    const [c, g] = canvas(64, 128);
    const gr = g.createRadialGradient(32, 64, 4, 32, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 6.0), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  p.rotation.x = -Math.PI / 2; p.position.y = 0.035;
  return p;
}

// First-person extras only shown in the cockpit view (steering wheel with display)
export function buildCockpit() {
  const g = new THREE.Group();
  const mCarbon = sharedMats().carbon;
  const mPad = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.9 });
  const sw = new THREE.Group();
  sw.position.set(0, 0.69, -0.26); sw.rotation.x = -0.55; sw.scale.setScalar(0.85);
  const shape = new THREE.Shape();
  shape.moveTo(-0.13, -0.06); shape.lineTo(0.13, -0.06); shape.quadraticCurveTo(0.17, 0, 0.13, 0.07); shape.lineTo(-0.13, 0.07); shape.quadraticCurveTo(-0.17, 0, -0.13, -0.06);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), mCarbon);
  body.position.z = -0.04; sw.add(body);
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.1, 4, 8), mPad);
    grip.position.set(s * 0.165, 0, 0); sw.add(grip);
    for (let i = 0; i < 3; i++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10), new THREE.MeshStandardMaterial({ color: [0xffcc00, 0x2e7dff, 0xe10600][i] }));
      knob.rotation.x = Math.PI / 2; knob.position.set(s * (0.085 + i * 0.012), -0.035 + i * 0.012, 0.012); sw.add(knob);
    }
  }
  const dispCanvas = document.createElement('canvas'); dispCanvas.width = 256; dispCanvas.height = 96;
  const dispTex = new THREE.CanvasTexture(dispCanvas);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.045), new THREE.MeshBasicMaterial({ map: dispTex }));
  disp.position.set(0, 0.012, 0.01); sw.add(disp);
  const revCanvas = document.createElement('canvas'); revCanvas.width = 256; revCanvas.height = 16;
  const revTex = new THREE.CanvasTexture(revCanvas);
  const rev = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.012), new THREE.MeshBasicMaterial({ map: revTex }));
  rev.position.set(0, 0.056, 0.01); sw.add(rev);
  g.add(sw);
  g.userData.steering = sw;
  g.userData.display = { canvas: dispCanvas, tex: dispTex, rev: revCanvas, revTex };
  g.userData.wheels = [];
  return g;
}
