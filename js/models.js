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
// front wing halves are separate meshes so a damaged side can break off
const wingParts = () => ({ L: { carbon: [], accent: [], livery: [] }, R: { carbon: [], accent: [], livery: [] } });
// geometry set with lazily merged variants: '' intact, 'L' / 'R' / 'LR' = that front wing half broken off
function geoSet(livery, carbon, accent, black, fw) {
  const cache = {};
  const part = (k, list, key) => merge([...list, ...(k.includes('L') ? [] : fw.L[key]), ...(k.includes('R') ? [] : fw.R[key])]);
  const variant = (k) => cache[k] || (cache[k] = { livery: part(k, livery, 'livery'), carbon: part(k, carbon, 'carbon'), accent: part(k, accent, 'accent') });
  return { ...variant(''), black: merge(black), variant };
}
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

// 90s-style car: raised slender nose on pylons, no halo, tall airbox, compact sidepods, exposed rims
const MONO_C = [
  { z: -2.78, cy: 0.4, w: 0.055, ht: 0.04, hb: 0.04, n: 2.4 },
  { z: -2.45, cy: 0.42, w: 0.1, ht: 0.065, hb: 0.06, n: 2.6 },
  { z: -1.9, cy: 0.45, w: 0.15, ht: 0.095, hb: 0.11, n: 3 },
  { z: -1.3, cy: 0.47, w: 0.21, ht: 0.125, hb: 0.18, n: 3.4 },
  { z: -0.7, cy: 0.48, w: 0.27, ht: 0.165, hb: 0.27, n: 4 },
  { z: -0.1, cy: 0.48, w: 0.31, ht: 0.21, hb: 0.3, n: 4.4 },
  { z: 0.4, cy: 0.48, w: 0.32, ht: 0.21, hb: 0.3, n: 4.4 },
];
const COVER_C = [
  { z: 0.26, cy: 0.74, w: 0.15, ht: 0.29, hb: 0.3, n: 2.8 },
  { z: 0.6, cy: 0.67, w: 0.26, ht: 0.3, hb: 0.36, n: 3 },
  { z: 1.2, cy: 0.55, w: 0.25, ht: 0.22, hb: 0.3, n: 3 },
  { z: 1.8, cy: 0.45, w: 0.17, ht: 0.15, hb: 0.24, n: 2.8 },
  { z: 2.35, cy: 0.37, w: 0.08, ht: 0.09, hb: 0.15, n: 2.5 },
];
const POD_C = [
  { z: -0.45, cx: 0.56, cy: 0.36, w: 0.17, ht: 0.13, hb: 0.16, n: 6 },
  { z: -0.2, cx: 0.58, cy: 0.36, w: 0.2, ht: 0.14, hb: 0.18, n: 5 },
  { z: 0.6, cx: 0.55, cy: 0.33, w: 0.2, ht: 0.12, hb: 0.17, n: 4.5 },
  { z: 1.3, cx: 0.42, cy: 0.27, w: 0.12, ht: 0.07, hb: 0.11, n: 3.5 },
  { z: 1.7, cx: 0.3, cy: 0.24, w: 0.05, ht: 0.03, hb: 0.05, n: 3 },
];
export const SPECS = {
  modern: { wheels: { front: { x: 0.8, z: -1.75, w: 0.305 }, rear: { x: 0.78, z: 1.85, w: 0.405 }, r: 0.36, rim: 0.235 }, mirror: { x: 0.6, y: 0.725, z: -0.66, w: 0.17, h: 0.064 } },
  classic: { wheels: { front: { x: 0.82, z: -1.7, w: 0.31 }, rear: { x: 0.79, z: 1.72, w: 0.43 }, r: 0.33, rim: 0.2 }, mirror: { x: 0.52, y: 0.66, z: -0.42, w: 0.15, h: 0.06 } },
};

let SHARED_C = null;
function classicGeometry() {
  if (SHARED_C) return SHARED_C;
  const livery = [], carbon = [], accent = [], black = [];
  const W = SPECS.classic.wheels, MI = SPECS.classic.mirror;
  livery.push(loft(MONO_C, { capEnd: false }));
  livery.push(loft(COVER_C, { capStart: true }));
  livery.push(loft(POD_C, { capStart: true }), loft(POD_C, { capStart: true, mirrorX: true }));
  for (const s of [1, -1]) {
    const inlet = new THREE.CircleGeometry(1, 24); inlet.scale(0.15, 0.11, 1); inlet.rotateY(Math.PI);
    black.push(at(inlet, s * 0.56, 0.36, -0.452));
  }
  // cockpit opening + padded rim + small windscreen
  black.push(loft([
    { z: -0.5, cy: 0.685, w: 0.08, ht: 0.012, hb: 0.012, n: 2 },
    { z: -0.35, cy: 0.69, w: 0.23, ht: 0.012, hb: 0.012, n: 3 },
    { z: 0.22, cy: 0.69, w: 0.25, ht: 0.012, hb: 0.012, n: 4 },
    { z: 0.3, cy: 0.69, w: 0.18, ht: 0.012, hb: 0.012, n: 4 },
  ], { seg: 24, sub: 4 }));
  const screen = new THREE.SphereGeometry(1, 16, 6, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.18);
  screen.scale(0.3, 0.32, 0.3); black.push(at(screen, 0, 0.62, -0.32));
  // airbox intake
  const ab = new THREE.CircleGeometry(1, 24); ab.scale(0.11, 0.11, 1); ab.rotateY(Math.PI);
  black.push(at(ab, 0, 0.93, 0.255));
  // floor, small diffuser
  carbon.push(slab([[-0.28, -1.15], [-0.62, -0.8], [-0.7, -0.4], [-0.7, 1.3], [-0.5, 1.5], [-0.48, 2.2], [0.48, 2.2], [0.5, 1.5], [0.7, 1.3], [0.7, -0.4], [0.62, -0.8], [0.28, -1.15]], 0.025, 0.06));
  const diff = new THREE.PlaneGeometry(0.9, 0.4, 1, 1); diff.rotateX(Math.PI / 2 - 0.25); carbon.push(at(diff, 0, 0.13, 2.05));
  // front wing: flat mainplane + flap, square endplates, nose pylons
  const fwp = wingParts();
  const fw = wing(0.32, 0.08, 0.05, 0.92, 0.05); fw.translate(0, 0.085, -2.92); fwp.R.carbon.push(fw); fwp.L.carbon.push(mirror(fw));
  const ff = wing(0.16, 0.08, 0.08, 0.72, 0.45); ff.translate(0.2, 0.15, -2.68); fwp.R.accent.push(ff); fwp.L.accent.push(mirror(ff));
  for (const sd of [1, -1]) {
    fwp[sd > 0 ? 'R' : 'L'].livery.push(solid(plate([[-2.95, 0.05], [-2.95, 0.3], [-2.55, 0.3], [-2.55, 0.05]], 0.016).translate(sd * 0.93, 0, 0), 0.5, 0.3));
    carbon.push(plate([[-2.75, 0.1], [-2.6, 0.38], [-2.45, 0.38], [-2.55, 0.1]], 0.014).translate(sd * 0.07, 0, 0));
  }
  // rear wing: tall endplates, two elements, small lower wing
  carbon.push(wing(0.28, 0.1, 0.07, 0.9, 0.18).translate(-0.45, 0.84, 2.35));
  accent.push(wing(0.18, 0.1, 0.07, 0.88, 0.7).translate(-0.44, 0.97, 2.58));
  carbon.push(wing(0.2, 0.1, 0.05, 0.8, 0.15).translate(-0.4, 0.42, 2.3));
  for (const sd of [1, -1]) livery.push(solid(plate([[2.25, 0.3], [2.25, 1.12], [2.85, 1.12], [2.85, 0.3]], 0.018).translate(sd * 0.47, 0, 0), 0.5, 0.97));
  carbon.push(at(new THREE.BoxGeometry(0.12, 0.12, 0.3), 0, 0.32, 2.48));
  const exh = new THREE.CylinderGeometry(0.04, 0.045, 0.16, 14, 1, true); exh.rotateX(Math.PI / 2); const exh2 = exh.clone(); black.push(at(exh, 0.12, 0.42, 2.25), at(exh2, -0.12, 0.42, 2.25));
  // suspension
  for (const sd of [1, -1]) {
    const fz = W.front.z, fx = W.front.x - 0.12, rz = W.rear.z, rx = W.rear.x - 0.18;
    carbon.push(strut([sd * 0.18, 0.47, fz - 0.25], [sd * fx, 0.45, fz]), strut([sd * 0.18, 0.47, fz + 0.28], [sd * fx, 0.45, fz]));
    carbon.push(strut([sd * 0.15, 0.3, fz - 0.3], [sd * fx, 0.22, fz]), strut([sd * 0.15, 0.3, fz + 0.3], [sd * fx, 0.22, fz]));
    carbon.push(strut([sd * 0.16, 0.58, fz + 0.1], [sd * fx, 0.22, fz + 0.02], 0.03, 0.02));
    carbon.push(strut([sd * 0.15, 0.36, rz - 0.3], [sd * rx, 0.44, rz]), strut([sd * 0.2, 0.38, rz + 0.22], [sd * rx, 0.44, rz]));
    carbon.push(strut([sd * 0.18, 0.2, rz - 0.3], [sd * rx, 0.22, rz]), strut([sd * 0.22, 0.22, rz + 0.22], [sd * rx, 0.22, rz]));
    carbon.push(at(new THREE.BoxGeometry(0.08, 0.26, 0.2), sd * (fx + 0.03), 0.33, fz));
    carbon.push(at(new THREE.BoxGeometry(0.1, 0.3, 0.26), sd * (rx + 0.05), 0.33, rz));
  }
  // mirrors on the sidepod shoulders
  for (const sd of [1, -1]) {
    carbon.push(strut([sd * 0.42, 0.52, MI.z + 0.05], [sd * MI.x, MI.y - 0.03, MI.z + 0.04], 0.03, 0.012));
    const h = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    h.rotateX(-Math.PI / 2); h.scale(MI.w / 2 + 0.012, MI.h / 2 + 0.012, 0.08);
    livery.push(solid(at(h, sd * MI.x, MI.y, MI.z + 0.002), 0.2, 0.3));
  }
  SHARED_C = geoSet(livery, carbon, accent, black, fwp);
  return SHARED_C;
}

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
  const fwp = wingParts();
  fwEls.forEach((e, i) => {
    const inner = i === 0 ? 0 : 0.18;
    const g = wing(e.c, 0.09, e.cam, 0.98 - inner, e.a);
    g.translate(inner, e.y, e.z);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k); if (x > 0.62) p.setY(k, p.getY(k) + (x - 0.62) * 0.18); }
    g.computeVertexNormals();
    const k = i >= 2 ? 'accent' : 'carbon';
    fwp.R[k].push(g); fwp.L[k].push(mirror(g));
  });
  for (const s of [1, -1]) {
    fwp[s > 0 ? 'R' : 'L'].carbon.push(plate([[-2.98, 0.04], [-2.98, 0.24], [-2.6, 0.32], [-2.36, 0.3], [-2.36, 0.12], [-2.6, 0.04]], 0.014).translate(s * 0.985, 0, 0));
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
  SHARED = geoSet(livery, carbon, accent, black, fwp);
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
// classic colour schemes (fictional, inspired by 80s/90s grids)
export const RETRO = {
  mcl: { body: 0xd50c1f, top: 0xf4f4f4, low: 0x1a1a1a, accent: 0xf4f4f4 },
  fer: { body: 0xc8000b, top: 0xc8000b, low: 0x1a1a1a, accent: 0xffd200 },
  rbr: { body: 0x1f4fbf, top: 0x1f4fbf, low: 0x0e1f52, accent: 0x2fbf4f },
  mer: { body: 0xc7cbcf, top: 0xc7cbcf, low: 0x2a2d31, accent: 0x14b8a6 },
  ast: { body: 0x0d4d2e, top: 0x0d4d2e, low: 0x072818, accent: 0xf2f2f2 },
  alp: { body: 0xffd100, top: 0xffd100, low: 0x111111, accent: 0x111111 },
  wil: { body: 0xf4f4f4, top: 0xf4f4f4, low: 0x0a2a6b, accent: 0xf5d000 },
  rb: { body: 0x111111, top: 0x111111, low: 0x050505, accent: 0xd4a73a },
  sau: { body: 0x1c4fa8, top: 0xf2f2f2, low: 0x12346f, accent: 0xf2f2f2 },
  has: { body: 0xff7a00, top: 0xff7a00, low: 0x151515, accent: 0x151515 },
};
export function teamLook(team, retro) { return retro && RETRO[team.id] ? { ...team, ...RETRO[team.id], retro: true } : team; }

function liveryTex(team) {
  const key = 'l' + team.id + (team.retro ? 'r' : '');
  if (texCache[key]) return texCache[key];
  const W = 1024, H = 1024;
  const [c, g] = canvas(W, H);
  const R = (u0, u1, v0, v1, col) => { g.fillStyle = col; g.fillRect(u0 * W, v0 * H, (u1 - u0) * W, (v1 - v0) * H); };
  const B = hex(team.body), A = hex(team.accent);
  R(0, 1, 0, 1, B);
  const lower = (col) => { R(0, 0.17, 0, 1, col); R(0.83, 1, 0, 1, col); };
  const stripe = (u, w, v0, v1, col) => { R(u - w, u + w, v0, v1, col); R(1 - u - w, 1 - u + w, v0, v1, col); };
  const grad = (v0, v1, c0, c1, u0 = 0, u1 = 1) => { const gr = g.createLinearGradient(0, v0 * H, 0, v1 * H); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(u0 * W, v0 * H, (u1 - u0) * W, (v1 - v0) * H); };
  if (team.retro) {
    const T = hex(team.top), L = hex(team.low);
    switch (team.id) {
      case 'mcl': R(0.28, 0.72, 0, 0.42, T); g.fillStyle = T; g.beginPath(); g.moveTo(0.28 * W, 0.42 * H); g.lineTo(0.5 * W, 0.6 * H); g.lineTo(0.72 * W, 0.42 * H); g.fill(); lower(L); break;
      case 'fer': stripe(0.27, 0.012, 0.05, 0.95, A); R(0.4, 0.6, 0, 0.1, A); lower(L); break;
      case 'rbr': stripe(0.26, 0.06, 0.2, 0.5, A); stripe(0.3, 0.025, 0.5, 0.9, '#ffd400'); R(0.42, 0.58, 0, 0.14, '#ffd400'); lower(L); break;
      case 'mer': stripe(0.24, 0.006, 0.1, 0.95, A); lower(L); break;
      case 'ast': R(0.47, 0.53, 0, 1, A); lower(L); break;
      case 'alp': stripe(0.24, 0.03, 0.15, 0.95, '#111111'); stripe(0.3, 0.008, 0.15, 0.95, '#ffffff'); lower(L); break;
      case 'wil': lower(L); stripe(0.2, 0.05, 0.05, 1, L); stripe(0.27, 0.02, 0.05, 1, A); R(0.4, 0.6, 0.0, 0.08, A); break;
      case 'rb': stripe(0.26, 0.006, 0.05, 0.95, A); stripe(0.29, 0.003, 0.05, 0.95, A); R(0.47, 0.53, 0.05, 0.95, A); break;
      case 'sau': R(0.3, 0.7, 0, 0.55, T); stripe(0.3, 0.01, 0, 0.55, '#d21f2b'); lower(L); break;
      case 'has': lower(L); stripe(0.25, 0.015, 0.1, 0.95, '#ffffff'); break;
    }
  } else switch (team.id) {
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
  // baked shading: darker underside, soft highlight along the top = cleaner, more solid look
  const ao = g.createLinearGradient(0, 0, W, 0);
  ao.addColorStop(0, 'rgba(0,0,0,0.38)'); ao.addColorStop(0.2, 'rgba(0,0,0,0)'); ao.addColorStop(0.42, 'rgba(255,255,255,0)'); ao.addColorStop(0.5, 'rgba(255,255,255,0.07)'); ao.addColorStop(0.58, 'rgba(255,255,255,0)'); ao.addColorStop(0.8, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = ao; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1.5;
  for (const v of [0.24, 0.58]) { g.beginPath(); g.moveTo(0, v * H); g.lineTo(W, v * H); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  t.wrapS = THREE.RepeatWrapping;
  t.flipY = false;
  return (texCache[key] = t);
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

// ------------------------------------------------------------------ wheels
// Tyre sidewall, wheel cover and rim textures come in three blur levels: 0 sharp, 1 smeared,
// 2 fully spun (rotationally averaged), swapped by speed like a broadcast camera shutter.
export const COMPOUND_COL = { S: '#e8242b', M: '#f2c80f', H: '#f0f0f0', I: '#33c23e', W: '#2e7dff' };
const COMPOUND_NAME = { S: 'SOFT', M: 'MEDIUM', H: 'HARD', I: 'INTER', W: 'WET' };

// draw a word along a circle (letters upright toward the centre)
function arcText(g, text, r, a0, size, spacing = 0.92) {
  const step = (size * spacing) / r;
  g.save();
  g.rotate(a0 - ((text.length - 1) * step) / 2);
  for (const ch of text) { g.save(); g.translate(0, -r); g.fillText(ch, 0, 0); g.restore(); g.rotate(step); }
  g.restore();
}
// smear: draw fn several times rotated around the centre (motion blur of a spinning disc)
function smear(g, n, spread, alpha, fn) {
  g.save(); g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) { g.save(); g.rotate((i / (n - 1) - 0.5) * spread); fn(); g.restore(); }
  g.restore();
}

// sidewall overlay for a RingGeometry(inner, outer): canvas radius 512 = outer edge, f = inner / outer
function tyreTex(code, lvl = 0, f = 0.674) {
  const key = `tyre${code}_${lvl}_${f.toFixed(3)}`;
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(1024, 1024);
  const col = COMPOUND_COL[code] || '#f2c80f', R0 = 512 * f;
  g.translate(512, 512);
  const ring = (r, w, style, a = 1) => { g.save(); g.globalAlpha = a; g.strokeStyle = style; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); g.restore(); };
  // machined rim lip, rubber bead, subtle sidewall sheen, darker shoulder
  const lip = g.createRadialGradient(0, 0, R0 - 2, 0, 0, R0 + 16);
  lip.addColorStop(0, '#5d6168'); lip.addColorStop(0.35, '#d7dbe0'); lip.addColorStop(0.7, '#7c8188'); lip.addColorStop(1, 'rgba(40,42,46,0)');
  g.fillStyle = lip; g.beginPath(); g.arc(0, 0, R0 + 16, 0, Math.PI * 2); g.arc(0, 0, R0 - 2, 0, Math.PI * 2, true); g.fill();
  ring(R0 + 24, 12, '#0b0b0c', 0.9);
  const sheen = g.createRadialGradient(0, 0, R0 + 30, 0, 0, 512);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(0.55, 'rgba(255,255,255,0.09)'); sheen.addColorStop(0.9, 'rgba(0,0,0,0.18)'); sheen.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sheen; g.beginPath(); g.arc(0, 0, 512, 0, Math.PI * 2); g.arc(0, 0, R0 + 30, 0, Math.PI * 2, true); g.fill();
  // compound band (two lines like the real thing)
  const span = 512 - R0;
  ring(R0 + span * 0.36, span * 0.13, col);
  ring(R0 + span * 0.47, span * 0.03, col, 0.85);
  // lettering
  const tr = R0 + span * 0.72, size = span * 0.25;
  g.font = `italic 900 ${size}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = () => {
    g.fillStyle = col; arcText(g, 'APEX', tr, 0, size); arcText(g, 'APEX', tr, Math.PI, size);
    g.fillStyle = '#e8e8e8'; g.font = `700 ${size * 0.62}px Arial`;
    arcText(g, COMPOUND_NAME[code] || '', tr, Math.PI / 2, size * 0.62, 1.05); arcText(g, COMPOUND_NAME[code] || '', tr, -Math.PI / 2, size * 0.62, 1.05);
    g.font = `italic 900 ${size}px Arial`;
  };
  if (lvl === 0) words();
  else if (lvl === 1) smear(g, 9, 0.5, 0.22, words);
  else { ring(tr, size * 0.75, col, 0.28); ring(tr, size * 0.45, '#e8e8e8', 0.1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (texCache[key] = t);
}

// modern aero wheel cover: satin carbon disc, team accents, centre-lock nut
function coverTex(accent, lvl = 0) {
  const key = `cover${accent}_${lvl}`;
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(512, 512);
  g.translate(256, 256);
  const base = g.createRadialGradient(-40, -60, 10, 0, 0, 256);
  base.addColorStop(0, '#41454c'); base.addColorStop(0.6, '#1d2024'); base.addColorStop(1, '#0d0f11');
  g.fillStyle = base; g.beginPath(); g.arc(0, 0, 256, 0, Math.PI * 2); g.fill();
  // fine carbon weave
  g.save(); g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.clip(); g.globalAlpha = 0.07; g.fillStyle = '#fff';
  for (let y = -256; y < 256; y += 8) for (let x = -256 + ((y / 8) % 2 ? 4 : 0); x < 256; x += 8) g.fillRect(x, y, 4, 4);
  g.restore();
  const acc = hex(accent);
  const deco = () => {
    g.strokeStyle = acc; g.lineWidth = 20; g.lineCap = 'butt';
    for (const a of [0.2, 0.2 + Math.PI]) { g.beginPath(); g.arc(0, 0, 205, a, a + 1.5); g.stroke(); }
    g.lineWidth = 4; g.strokeStyle = '#d9dde2';
    for (const a of [1.95, 1.95 + Math.PI]) { g.beginPath(); g.arc(0, 0, 205, a, a + 0.7); g.stroke(); }
    g.fillStyle = '#8f949b';
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 128, Math.sin(a) * 128, 7, 0, Math.PI * 2); g.fill(); }
  };
  if (lvl === 0) deco();
  else if (lvl === 1) smear(g, 9, 0.45, 0.25, deco);
  else {
    g.globalAlpha = 0.5; g.strokeStyle = acc; g.lineWidth = 20; g.beginPath(); g.arc(0, 0, 205, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.18; g.strokeStyle = '#d9dde2'; g.lineWidth = 6; g.stroke();
    g.globalAlpha = 0.15; g.strokeStyle = '#8f949b'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }
  // centre-lock nut: steel hex, coloured retaining ring, polished cap
  const nut = g.createLinearGradient(-50, -50, 50, 50);
  nut.addColorStop(0, '#f0f2f4'); nut.addColorStop(0.5, '#7d838a'); nut.addColorStop(1, '#c7ccd2');
  g.fillStyle = nut; g.beginPath();
  if (lvl === 2) g.arc(0, 0, 48, 0, Math.PI * 2);
  else for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 52, Math.sin(a) * 52); }
  g.fill();
  g.strokeStyle = '#e10600'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 32, 0, Math.PI * 2); g.stroke();
  const cap = g.createRadialGradient(-6, -6, 2, 0, 0, 20); cap.addColorStop(0, '#ffffff'); cap.addColorStop(1, '#8a9096');
  g.fillStyle = cap; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
  // outer lip highlight
  g.strokeStyle = 'rgba(220,225,230,0.55)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 252, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (texCache[key] = t);
}

// 90s open rim: polished spokes, visible brake behind (classic cars)
function rimTex(accent, lvl = 0) {
  const key = `rim${accent}_${lvl}`;
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(512, 512);
  g.translate(256, 256);
  g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(0, 0, 256, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(0, 0, 40, 0, 0, 248);
  gr.addColorStop(0, '#e4e7ea'); gr.addColorStop(0.75, '#959aa0'); gr.addColorStop(1, '#3c4045');
  const spokes = () => {
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 232, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16181b';
    for (let i = 0; i < 6; i++) {
      g.save(); g.rotate((i / 6) * Math.PI * 2);
      g.beginPath(); g.moveTo(28, -56); g.quadraticCurveTo(140, -116, 196, -56); g.lineTo(196, 56); g.quadraticCurveTo(140, 116, 28, 56); g.closePath(); g.fill();
      g.restore();
    }
  };
  if (lvl === 0) spokes();
  else if (lvl === 1) { spokes(); smear(g, 7, 0.4, 0.3, spokes); }
  else {
    // spun: spokes average to a darker grey disc
    const av = g.createRadialGradient(0, 0, 30, 0, 0, 232);
    av.addColorStop(0, '#c9cdd1'); av.addColorStop(0.18, '#7d8288'); av.addColorStop(0.85, '#5b6066'); av.addColorStop(1, '#3c4045');
    g.fillStyle = av; g.beginPath(); g.arc(0, 0, 232, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = hex(accent); g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 220, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#c9c9c9'; g.beginPath(); g.arc(0, 0, 36, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e10600'; g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (texCache[key] = t);
}

// rubber along the lathe profile (u = around, v = across): satin sidewalls, scuffed matte tread,
// optional grooves for intermediates / full wets
function treadTex(grooved) {
  const key = 'tread' + grooved;
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(512, 1024), [rc, rg] = canvas(512, 1024);
  const V = (j) => (j / 11) * 1024; // profile point j -> pixel row
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  for (const [j, col] of [[0, '#1b1b1d'], [2, '#19191b'], [3.6, '#222224'], [5, '#303032'], [6, '#303032'], [7.4, '#222224'], [9, '#19191b'], [11, '#1b1b1d']]) grd.addColorStop(j / 11, col);
  g.fillStyle = grd; g.fillRect(0, 0, 512, 1024);
  // roughness: sidewalls satin, tread matte
  const rgd = rg.createLinearGradient(0, 0, 0, 1024);
  for (const [j, v] of [[0, 140], [3, 150], [4.4, 225], [6.6, 225], [8, 150], [11, 140]]) rgd.addColorStop(j / 11, `rgb(${v},${v},${v})`);
  rg.fillStyle = rgd; rg.fillRect(0, 0, 512, 1024);
  // scuffs and rubber pick-up on the contact patch
  const t0 = V(4.6), t1 = V(6.4);
  for (let i = 0; i < 900; i++) {
    const y = t0 + Math.random() * (t1 - t0), x = Math.random() * 512, l = 4 + Math.random() * 30;
    g.fillStyle = Math.random() < 0.6 ? 'rgba(80,80,84,0.12)' : 'rgba(5,5,6,0.18)';
    g.fillRect(x, y, l, 1 + Math.random() * 2);
  }
  // marbles on the shoulders
  for (let i = 0; i < 140; i++) {
    const y = Math.random() < 0.5 ? V(4) + Math.random() * 30 - 15 : V(7) + Math.random() * 30 - 15;
    g.fillStyle = 'rgba(8,8,9,0.6)'; g.beginPath(); g.arc(Math.random() * 512, y, 1 + Math.random() * 2.5, 0, Math.PI * 2); g.fill();
  }
  if (grooved) {
    g.strokeStyle = '#08080a'; g.lineWidth = 5; rg.strokeStyle = 'rgb(255,255,255)'; rg.lineWidth = 5;
    const mid = (t0 + t1) / 2, half = (t1 - t0) / 2;
    for (let x = -40; x < 560; x += 22) for (const ctx of [g, rg]) {
      ctx.beginPath(); ctx.moveTo(x, mid); ctx.lineTo(x + 26, mid - half * 0.95); ctx.moveTo(x, mid); ctx.lineTo(x + 26, mid + half * 0.95); ctx.stroke();
    }
    for (const ctx of [g, rg]) { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(512, mid); ctx.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const r = new THREE.CanvasTexture(rc);
  return (texCache[key] = { map: t, rough: r });
}

const tyreGeoCache = {};
function tyreGeo(r, w, rimR = 0.235) {
  const k = r + '_' + w + '_' + rimR;
  if (tyreGeoCache[k]) return tyreGeoCache[k];
  const hw = w / 2;
  // balloon sidewall, rounded shoulder, flat contact patch
  const prof = [[rimR, -hw * 0.92], [rimR + 0.02, -hw * 0.99], [r - 0.06, -hw * 1.03], [r - 0.025, -hw * 0.95], [r - 0.006, -hw * 0.8], [r, -hw * 0.5], [r, hw * 0.5], [r - 0.006, hw * 0.8], [r - 0.025, hw * 0.95], [r - 0.06, hw * 1.03], [rimR + 0.02, hw * 0.99], [rimR, hw * 0.92]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 56);
  g.rotateZ(Math.PI / 2);
  return (tyreGeoCache[k] = g);
}
const barrelGeoCache = {};
function barrelGeo(rimR, w) {
  const k = rimR + '_' + w;
  if (barrelGeoCache[k]) return barrelGeoCache[k];
  const g = new THREE.CylinderGeometry(rimR + 0.002, rimR + 0.002, w * 1.0, 40, 1, true); g.rotateZ(Math.PI / 2);
  return (barrelGeoCache[k] = g);
}
const mats = {};
function sharedMats() {
  if (mats.carbon) return mats;
  mats.carbon = new THREE.MeshPhysicalMaterial({ map: carbonTex(), color: 0x8a8a8a, roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  mats.black = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8, side: THREE.DoubleSide });
  const slick = treadTex(false), wetT = treadTex(true);
  mats.rubber = new THREE.MeshStandardMaterial({ map: slick.map, roughnessMap: slick.rough, roughness: 1, metalness: 0 });
  mats.rubberWet = new THREE.MeshStandardMaterial({ map: wetT.map, roughnessMap: wetT.rough, roughness: 1, metalness: 0 });
  mats.barrel = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.9 });
  return mats;
}
const compoundOf = (wet, seed, tyre) => (tyre && COMPOUND_COL[tyre] ? tyre : wet ? 'I' : ['S', 'M', 'H'][seed % 3]);

// front wing halves broken off (dm.L / dm.R >= 0.5) -> geometry variant without them
export function setWingLook(car, dm) {
  const U = car && car.userData;
  if (!U || !U.parts || !U.geo) return;
  const G = U.geo.variant((dm.L >= 0.5 ? 'L' : '') + (dm.R >= 0.5 ? 'R' : ''));
  for (const n of ['livery', 'carbon', 'accent']) U.parts[n].geometry = G[n];
}
// swap the sidewall marking (and grooved rubber) after a pit stop
export function setTyreLook(car, tyre) {
  for (const w of car.userData.wheels || []) {
    const U = w.wheel.userData;
    if (!U.side) continue;
    U.compound = tyre;
    U.side.map = tyreTex(tyre, U.lvl || 0, U.f);
    U.tyre.material = tyre === 'I' || tyre === 'W' ? sharedMats().rubberWet : sharedMats().rubber;
  }
}
// motion blur of the spinning wheels: 0 sharp, 1 smeared, 2 spun
export function setWheelBlur(car, lvl) {
  const U0 = car.userData;
  if (U0.blurLvl === lvl) return;
  U0.blurLvl = lvl;
  for (const w of U0.wheels || []) {
    const U = w.wheel.userData;
    if (!U.side) continue;
    U.lvl = lvl;
    U.side.map = tyreTex(U.compound, lvl, U.f);
    U.cover.map = U.classic ? rimTex(U.accent, lvl) : coverTex(U.accent, lvl);
  }
}

function buildWheel(r, w, wet, accent, seed, rimR = 0.235, classic = false, compound = null) {
  const m = sharedMats();
  const code = compoundOf(wet, seed, compound);
  const wheel = new THREE.Group();
  const tyre = new THREE.Mesh(tyreGeo(r, w, rimR), code === 'I' || code === 'W' ? m.rubberWet : m.rubber); tyre.castShadow = true;
  wheel.add(tyre);
  wheel.add(new THREE.Mesh(barrelGeo(rimR, w), m.barrel));
  const outer = r - 0.004;
  const sideMat = new THREE.MeshStandardMaterial({ map: null, transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
  const coverMat = new THREE.MeshStandardMaterial({ map: classic ? rimTex(accent) : coverTex(accent), roughness: classic ? 0.3 : 0.45, metalness: classic ? 0.8 : 0.35 });
  for (const s of [1, -1]) {
    // the overlay starts at the rim so the machined lip is part of the sidewall texture
    const ring = new THREE.Mesh(new THREE.RingGeometry(rimR - 0.004, outer, 64), sideMat);
    ring.rotation.y = s * Math.PI / 2; ring.position.x = s * (w / 2 * 1.035);
    wheel.add(ring);
    const cover = new THREE.Mesh(new THREE.CircleGeometry(rimR + 0.001, 40), coverMat);
    cover.rotation.y = s * Math.PI / 2; cover.position.x = s * (w / 2 * (classic ? 0.75 : 0.9));
    wheel.add(cover);
  }
  wheel.userData = { side: sideMat, cover: coverMat, tyre, compound: code, accent, classic, f: (rimR - 0.004) / outer, lvl: 0 };
  sideMat.map = tyreTex(code, 0, wheel.userData.f);
  return wheel;
}

// ------------------------------------------------------------------ car assembly
export function buildCar(team0, wet, number = 0, opts = {}) {
  const classic = opts.style === 'classic';
  const team = teamLook(team0, opts.retro);
  const spec = classic ? SPECS.classic : SPECS.modern;
  const WHEELS = spec.wheels, MIRROR = spec.mirror;
  const geo = classic ? classicGeometry() : sharedGeometry();
  const m = sharedMats();
  const car = new THREE.Group();
  const liv = new THREE.MeshPhysicalMaterial({
    map: liveryTex(team), roughness: team.id === 'rbr' ? 0.55 : 0.32, metalness: team.id === 'mer' ? 0.55 : 0.15,
    clearcoat: team.id === 'rbr' ? 0.15 : 1.0, clearcoatRoughness: 0.08, side: THREE.DoubleSide,
  });
  const acc = new THREE.MeshPhysicalMaterial({ color: team.accent, roughness: 0.35, metalness: 0.1, clearcoat: 0.8 });
  const add = (g, mat, shadow = true) => { const me = new THREE.Mesh(g, mat); me.castShadow = shadow; car.add(me); return me; };
  car.userData.parts = { livery: add(geo.livery, liv), carbon: add(geo.carbon, m.carbon), accent: add(geo.accent, acc) };
  car.userData.geo = geo;
  add(geo.black, m.black, false);

  // T-cam: black for the first driver, yellow for the second
  const tcam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: opts.second ? 0xf5d000 : 0x111111, roughness: 0.4 }));
  tcam.position.set(0, 1.06, 0.38); car.add(tcam);
  car.userData.tcam = tcam;

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
    const s = sectionAt(classic ? MONO_C : MONO, -2.0);
    decal(decalTex(String(number), light ? '#111' : '#fff', numFont), 0.2, 0.1, 0, s.cy + s.ht + 0.004, -2.0, 0, -Math.PI / 2 + 0.17);
    for (const sd of [1, -1]) {
      const c = sectionAt(classic ? COVER_C : COVER, 1.25);
      decal(decalTex(String(number), '#fff', numFont), 0.22, 0.11, sd * (c.w + 0.006), c.cy + 0.06, 1.25, sd * Math.PI / 2);
    }
  }
  const sponsors = { mcl: 'VELOX', fer: 'ROSSA', rbr: 'ORACLE·X', mer: 'PETRA', ast: 'ARAMCOR', alp: 'BWT·A', wil: 'ATLAS', rb: 'VISA·C', sau: 'STAKEX', has: 'MONEYG' };
  const spName = sponsors[team.id] || 'KRONOS';
  const sp = decalTex(spName, light ? '#111' : '#fff');
  for (const sd of [1, -1]) {
    const p = sectionAt(classic ? POD_C : POD, 0.15);
    decal(sp, 0.62, 0.14, sd * (p.cx + p.w + 0.006), p.cy + 0.02, 0.15, sd * Math.PI / 2);
    decal(decalTex(team.name.toUpperCase(), '#fff', { w: 512, h: 96, font: 'bold 60px Arial' }), 0.44, 0.08, sd * (classic ? 0.482 : 0.527), classic ? 0.9 : 0.86, classic ? 2.55 : 2.62, sd * Math.PI / 2);
  }
  if (!classic) decal(sp, 0.32, 0.08, 0, 0.705, -0.85, 0, -Math.PI / 2 + 0.1);
  else { const nz = sectionAt(MONO_C, -1.2); decal(sp, 0.3, 0.075, 0, nz.cy + nz.ht + 0.004, -1.2, 0, -Math.PI / 2 + 0.06); }
  decal(decalTex(spName, '#fff'), 0.7, 0.16, 0, 0.88, 2.43, Math.PI, 0.12);

  // helmet: painted shell (team colours, stripes, number), dark visor, chin guard; pivots at the neck
  const helmet = new THREE.Group();
  helmet.position.set(0, 0.74, 0.07);
  const head = new THREE.Group(); head.position.y = 0.12; helmet.add(head);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 32, 20), new THREE.MeshPhysicalMaterial({ map: helmetTex(team, number), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }));
  shell.scale.set(1, 1.05, 1.12); shell.rotation.y = Math.PI; head.add(shell);
  // SphereGeometry: front (-z) sits at phi = 1.5 PI
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.1385, 24, 8, Math.PI * 1.22, Math.PI * 0.56, Math.PI * 0.36, Math.PI * 0.17), new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, roughness: 0.05, metalness: 0.9, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 }));
  visor.scale.set(1, 1.05, 1.12); head.add(visor);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 6, Math.PI * 1.25, Math.PI * 0.5, Math.PI * 0.6, Math.PI * 0.18), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6 }));
  chin.scale.set(1, 1.05, 1.12); head.add(chin);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 20), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.0; helmet.add(collar);
  car.add(helmet);
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
      const wh = buildWheel(WHEELS.r, ax.w, wet, team.accent, seed, WHEELS.rim, classic, opts.tyre);
      pivot.add(wh); car.add(pivot);
      wheels.push({ pivot, wheel: wh, front });
    }
  }
  car.userData.wheels = wheels;
  car.add(contactShadow());
  return car;
}

function helmetTex(team, number) {
  const key = 'helm' + team.id + number;
  if (texCache[key]) return texCache[key];
  const [c, g] = canvas(512, 256);
  // equirectangular: x = around the head (front at the centre after the mesh is turned), y = top -> bottom
  g.fillStyle = hex(team.top === 0xf2f2f2 || team.top === 0xf0f0f0 ? team.body : team.top); g.fillRect(0, 0, 512, 256);
  g.fillStyle = hex(team.accent); g.fillRect(0, 0, 512, 46);
  g.fillStyle = hex(team.body); g.fillRect(0, 150, 512, 106);
  g.strokeStyle = '#ffffff'; g.lineWidth = 6;
  for (const y of [52, 144]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  // swooshes on the sides
  g.fillStyle = hex(team.accent);
  for (const x of [128, 384]) { g.beginPath(); g.moveTo(x - 70, 140); g.quadraticCurveTo(x, 70, x + 70, 140); g.lineTo(x + 70, 150); g.quadraticCurveTo(x, 90, x - 70, 150); g.fill(); }
  if (number) {
    g.fillStyle = '#ffffff'; g.font = 'italic 900 54px "Titillium Web", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(number), 128, 110); g.fillText(String(number), 384, 110);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (texCache[key] = t);
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
export function buildCockpit(team) {
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
  // driver's gloves on the grips
  const hands = new THREE.Group();
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x1c1d22, roughness: 0.75 });
  const cuffMat = new THREE.MeshStandardMaterial({ color: team ? team.accent : 0xe10600, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.075, 4, 10), gloveMat);
    palm.position.set(0, 0, 0.03); hand.add(palm);
    const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.05, 4, 8), gloveMat);
    fingers.rotation.z = Math.PI / 2; fingers.position.set(-s * 0.03, 0.02, -0.02); hand.add(fingers);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, 3, 6), gloveMat);
    thumb.rotation.z = s * 0.9; thumb.position.set(-s * 0.035, 0.035, 0.035); hand.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.05, 12), cuffMat);
    cuff.position.set(s * 0.01, -0.07, 0.06); cuff.rotation.x = 0.5; hand.add(cuff);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 10), new THREE.MeshStandardMaterial({ color: team ? team.body : 0xd40000, roughness: 0.6 }));
    arm.position.set(s * 0.05, -0.2, 0.16); arm.rotation.x = 0.9; arm.rotation.z = -s * 0.25; hand.add(arm);
    hand.position.set(s * 0.165, 0.005, 0.0);
    hands.add(hand);
  }
  sw.add(hands);
  g.userData.hands = hands;
  g.add(sw);
  g.userData.steering = sw;
  g.userData.display = { canvas: dispCanvas, tex: dispTex, rev: revCanvas, revTex };
  g.userData.wheels = [];
  return g;
}

// ------------------------------------------------------------------ safety car (silver GT coupé with a roof light bar)
export function buildSafetyCar() {
  const car = new THREE.Group();
  // side profile (z forward = negative, y up), extruded across the width with rounded edges
  const prof = [[-2.35, 0.32], [-2.38, 0.5], [-2.0, 0.66], [-1.0, 0.8], [-0.45, 0.86], [0.15, 1.24], [0.75, 1.26], [1.55, 1.0], [2.2, 0.86], [2.35, 0.72], [2.32, 0.32]];
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
  const body = new THREE.ExtrudeGeometry(shape, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 8 });
  body.rotateY(-Math.PI / 2); body.translate(0.85, 0, 0); body.computeVertexNormals();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xb9c0c8, metalness: 0.75, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 });
  const bm = new THREE.Mesh(body, paint); bm.castShadow = true; car.add(bm);
  // glasshouse
  const gprof = [[-0.4, 0.88], [0.17, 1.22], [0.74, 1.24], [1.5, 1.0], [1.5, 0.9], [-0.4, 0.9]];
  const gshape = new THREE.Shape(gprof.map(([z, y]) => new THREE.Vector2(z, y)));
  const glass = new THREE.ExtrudeGeometry(gshape, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 });
  glass.rotateY(-Math.PI / 2); glass.translate(0.81, 0.03, 0);
  car.add(new THREE.Mesh(glass, new THREE.MeshPhysicalMaterial({ color: 0x0c1016, metalness: 0.4, roughness: 0.05, clearcoat: 1 })));
  // livery stripes + lettering
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#d4dbe2'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#e10600'; g.fillRect(0, 44, 512, 10);
  g.fillStyle = '#1a1d22'; g.font = 'italic 900 34px Arial'; g.textAlign = 'center'; g.fillText('SAFETY CAR', 256, 38);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (const s of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.3 }));
    pl.position.set(s * 0.97, 0.58, 0.1); pl.rotation.y = s * Math.PI / 2; car.add(pl);
  }
  // light bar: amber outer lamps, green centre, blinking via userData
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
  bar.position.set(0, 1.36, 0.45); car.add(bar);
  const lamp = (x, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.18), new THREE.MeshBasicMaterial({ color: col })); m.position.set(x, 1.41, 0.45); car.add(m); return m; };
  car.userData.lamps = { amber: [lamp(-0.42, 0xff9a00), lamp(0.42, 0xff9a00)], green: [lamp(0, 0x19d65b)] };
  // head / tail lights
  for (const s of [1, -1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xf2f6ff })); hl.position.set(s * 0.62, 0.62, -2.42); car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0xff1010 })); tl.position.set(s * 0.6, 0.78, 2.4); car.add(tl);
  }
  // wheels
  const tyreG = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 28); tyreG.rotateZ(Math.PI / 2);
  const rimG = new THREE.CircleGeometry(0.24, 24);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
  const rimM = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 0.9, roughness: 0.3 });
  car.userData.wheels = [];
  for (const [z, front] of [[-1.45, true], [1.45, false]]) for (const s of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.86, 0.34, z);
    const wheel = new THREE.Group();
    const t = new THREE.Mesh(tyreG, rubber); t.castShadow = true; wheel.add(t);
    const r = new THREE.Mesh(rimG, rimM); r.rotation.y = s * Math.PI / 2; r.position.x = s * 0.145; wheel.add(r);
    pivot.add(wheel); car.add(pivot); car.userData.wheels.push({ pivot, wheel, front });
  }
  car.add(contactShadow());
  return car;
}
