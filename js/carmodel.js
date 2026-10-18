// The 2026 F1 car model from f1-studio.html: geometry, textures and materials exactly as there. Only placement
// (rotated so the nose points to -z, scaled so the wheelbase matches the game's 3.384 m) and the split of the
// four wheels into their own draws (so they can spin and steer) are added here. Team colours use the same
// navy-shift recolour as the studio's livery switcher, done in the shader so every car can share one texture.
// The textures in assets/car are the studio's with the real-world logos painted out (fictional tyre lettering).
import * as THREE from 'three';

const SCALE = 3.384 / 7.291;          // model axle distance 7.291 units -> game wheelbase 3.384 m
const BASE = 'assets/car/';

const state = { ready: false };
export const carModel = state;

function decode(meta, B64, LOD) {
  return (async () => {
    const bin = Uint8Array.from(atob(B64), (ch) => ch.charCodeAt(0));
    const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const { min, max } = meta, span = [0, 1, 2].map((k) => max[k] - min[k]);
    const place = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE));
    const out = {};
    for (const m of meta.meshes) {
      const q = new Uint16Array(buf, m.pos, m.count * 3), pos = new Float32Array(m.count * 3);
      for (let i = 0; i < pos.length; i++) { const k = i % 3; pos[i] = min[k] + (q[i] / 65535) * span[k]; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, m.nrm, m.count * 3), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, m.uv, m.count * 2), 2));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, m.idx, m.icount), 1));
      g.applyMatrix4(place);
      const lodBin = Uint8Array.from(atob(LOD[m.m]), (ch) => ch.charCodeAt(0));
      out[m.m] = { full: g, lod: new Uint32Array(lodBin.buffer) };
    }
    return out;
  })();
}

// one geometry per part that shares the vertex buffers and draws only `index`
function view(src, index, sphere) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, src.attributes[k]);
  g.setIndex(new THREE.BufferAttribute(index, 1));
  if (sphere) g.boundingSphere = sphere; else g.computeBoundingSphere();
  return g;
}

// split an index buffer into the four wheels (by the side and axle of each triangle's first vertex)
function quadrants(index, pos) {
  const lists = [[], [], [], []];
  for (let i = 0; i < index.length; i += 3) {
    const v = index[i], x = pos.getX(v), z = pos.getZ(v);
    lists[(z < 0 ? 0 : 2) + (x < 0 ? 0 : 1)].push(index[i], index[i + 1], index[i + 2]);
  }
  return lists.map((l) => new Uint32Array(l));
}
function boundsOf(index, pos) {
  const b = new THREE.Box3(), p = new THREE.Vector3();
  for (let i = 0; i < index.length; i++) b.expandByPoint(p.fromBufferAttribute(pos, index[i]));
  return b;
}

function loadTex(name, srgb, aniso) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(BASE + name, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    res(t);
  }, undefined, rej));
}

export const carModelReady = (async () => {
  if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
  const [{ MODEL_META, MODEL_B64, LOD_IDX }, livT, ormT, tyreT, covT] = await Promise.all([
    import('./carmodel-data.js'), loadTex('livery.jpg', true, 8), loadTex('orm.jpg', false, 8), loadTex('tyre.jpg', true, 8), loadTex('covers.jpg', true, 8),
  ]);
  const G = await decode(MODEL_META, MODEL_B64, LOD_IDX);
  // materials: the studio's, unchanged
  const mats = {
    Livery: new THREE.MeshPhysicalMaterial({ map: livT, roughnessMap: ormT, metalnessMap: ormT, roughness: 0.9, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1 }),
    RearLight: new THREE.MeshStandardMaterial({ color: '#ff1a24', emissive: '#ff1a24', emissiveIntensity: 1.2, roughness: 0.3 }),
    Wheels: new THREE.MeshPhysicalMaterial({ map: tyreT, roughness: 0.85, sheen: 0.35, sheenRoughness: 0.8, sheenColor: new THREE.Color('#444') }),
    WheelCovers: new THREE.MeshPhysicalMaterial({ map: covT, roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
  };
  // body parts: full detail and the simplified far view over the same vertices
  const body = {};
  for (const k of ['Livery', 'RearLight']) body[k] = { full: G[k].full, far: view(G[k].full, G[k].lod, G[k].full.boundingSphere || (G[k].full.computeBoundingSphere(), G[k].full.boundingSphere)) };
  // wheels: tyre + cover per corner, hub from the tyre's bounds
  const wheels = [];
  const tq = quadrants(G.Wheels.full.index.array, G.Wheels.full.attributes.position);
  const tqLod = quadrants(G.Wheels.lod, G.Wheels.full.attributes.position);
  const cq = quadrants(G.WheelCovers.full.index.array, G.WheelCovers.full.attributes.position);
  const cqLod = quadrants(G.WheelCovers.lod, G.WheelCovers.full.attributes.position);
  for (let i = 0; i < 4; i++) {
    const tb = boundsOf(tq[i], G.Wheels.full.attributes.position), hub = tb.getCenter(new THREE.Vector3());
    const sph = (b) => b.getBoundingSphere(new THREE.Sphere());
    const cb = boundsOf(cq[i], G.WheelCovers.full.attributes.position);
    wheels.push({
      hub, front: hub.z < 0, right: hub.x > 0, radius: (tb.max.y - tb.min.y) / 2,
      tyre: view(G.Wheels.full, tq[i], sph(tb)), tyreFar: view(G.Wheels.full, tqLod[i], sph(tb)),
      cover: view(G.WheelCovers.full, cq[i], sph(cb)), coverFar: view(G.WheelCovers.full, cqLod[i], sph(cb)),
    });
  }
  // both sidewalls share one UV layout, so on the right-hand wheels the lettering would read mirrored: those
  // get the same material with the texture flipped
  const tyreR = tyreT.clone(); tyreR.wrapS = THREE.RepeatWrapping; tyreR.repeat.x = -1; tyreR.offset.x = 1; tyreR.needsUpdate = true;
  mats.WheelsR = mats.Wheels.clone(); mats.WheelsR.map = tyreR;
  Object.assign(state, { ready: true, mats, body, wheels, livery: livT });
  return state;
})().catch((e) => { console.warn('car model unavailable, using the built-in car', e); return null; });

// livery material per team: the studio material plus the colour shift of its switcher, extended from the navy
// alone to the stripes. Each source colour of the texture moves to a team colour, the shift is added (not
// replaced) so shading, anti-aliased edges and the painted lines keep their shape:
//   navy body ............ team body; on upward-facing panels above the sidepods its top colour, along the
//                          floor edge and lower sidepods its low colour (the two-tone of the built-in car)
//   cream / pale stripes . the team's second colour (top, or white when the top is the body colour)
//   orange, yellow, red .. the team's accent
const SRC = { navy: [1, 53, 113], cream: [252, 218, 148], pale: [250, 250, 150], orange: [252, 104, 0], yellow: [252, 226, 0], red: [240, 12, 16] };
const toS = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(...[c.r, c.g, c.b].map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255)); };
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(1)).join(',')})`;
const liveryCache = new Map();
export function liveryMaterial(team) {
  if (!team) return state.mats.Livery; // the original paint
  const top = team.top ?? team.body, low = team.low ?? team.body;
  const second = top !== team.body ? top : 0xf2f2f2;
  const key = [team.body, top, low, team.accent, second].join('/');
  if (liveryCache.has(key)) return liveryCache.get(key);
  const m = state.mats.Livery.clone();
  const U = { uBody: toS(team.body), uTop: toS(top), uLow: toS(low), uSecond: toS(second), uAccent: toS(team.accent ?? team.body) };
  m.onBeforeCompile = (sh) => {
    for (const k in U) sh.uniforms[k] = { value: U[k] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCarPos; varying vec3 vCarN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarPos = position; vCarN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uBody, uTop, uLow, uSecond, uAccent;
varying vec3 vCarPos; varying vec3 vCarN;
vec3 cmToS(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 cmToL(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
float near(vec3 s, vec3 src, float full, float zero) { float e = abs(s.r - src.r) + abs(s.g - src.g) + abs(s.b - src.b); return 1.0 - smoothstep(full, zero, e); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 s = cmToS(clamp(diffuseColor.rgb, 0.0, 1.0)) * 255.0;
  vec3 N = normalize(vCarN);
  float wTop = smoothstep(0.69, 0.71, N.y) * smoothstep(0.51, 0.52, vCarPos.y);
  float wLow = (1.0 - smoothstep(0.205, 0.215, vCarPos.y)) * step(-1.3, vCarPos.z) * step(vCarPos.z, 1.9);
  vec3 bodyC = mix(mix(uBody, uTop, wTop), uLow, wLow);
  float wN = near(s, ${v3(SRC.navy)}, 40.0, 150.0);
  float wC = near(s, ${v3(SRC.cream)}, 30.0, 90.0), wP = near(s, ${v3(SRC.pale)}, 30.0, 90.0);
  float wO = near(s, ${v3(SRC.orange)}, 30.0, 95.0), wY = near(s, ${v3(SRC.yellow)}, 30.0, 90.0), wR = near(s, ${v3(SRC.red)}, 35.0, 100.0);
  vec3 d = wN * (bodyC - ${v3(SRC.navy)}) + wC * (uSecond - ${v3(SRC.cream)}) + wP * (uSecond - ${v3(SRC.pale)})
         + wO * (uAccent - ${v3(SRC.orange)}) + wY * (uAccent - ${v3(SRC.yellow)}) + wR * (uAccent - ${v3(SRC.red)});
  float wSum = wN + wC + wP + wO + wY + wR;
  if (wSum > 1.0) d /= wSum;
  diffuseColor.rgb = cmToL(clamp((s + d) / 255.0, 0.0, 1.0));
  // halo, its centre pillar, the mirrors and the cockpit rim in bare 2x2 twill carbon (as on the 2026 cars):
  // the region above the cockpit opening, ahead of the airbox
  float wHalo = step(-0.92, vCarPos.z) * step(vCarPos.z, 0.14) * smoothstep(0.755, 0.775, vCarPos.y);
  float tw = step(0.5, fract((vCarPos.x + vCarPos.z) * 70.0)) + step(0.5, fract((vCarPos.z - vCarPos.x + vCarPos.y) * 70.0));
  vec3 carbon = vec3(0.012, 0.013, 0.015) * (0.8 + 0.25 * mod(tw, 2.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, carbon, wHalo);
}`);
  };
  m.customProgramCacheKey = () => 'teamShift';
  liveryCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- stickers
// start numbers and (fictional) sponsors projected onto the bodywork. The decal shapes are the same for every
// car, so each is cut from the body once (DecalGeometry over just the triangles near it); every car then only
// gets its own small text textures.
const SLOTS = [
  // name, ray origin, ray direction, decal size (w, h), kind
  ['nose', [0, 2, -1.75], [0, -1, 0], [0.24, 0.24], 'num'],
  ['coverR', [1.5, 0.78, 0.55], [-1, 0, 0], [0.26, 0.26], 'num'],
  ['coverL', [-1.5, 0.78, 0.55], [1, 0, 0], [0.26, 0.26], 'num'],
  ['podR', [1.6, 0.42, -0.15], [-1, 0, 0], [0.62, 0.15], 'sponsor'],
  ['podL', [-1.6, 0.42, -0.15], [1, 0, 0], [0.62, 0.15], 'sponsor'],
  ['noseR', [1.0, 0.47, -1.45], [-1, 0, 0], [0.34, 0.08], 'partner'],
  ['noseL', [-1.0, 0.47, -1.45], [1, 0, 0], [0.34, 0.08], 'partner'],
  ['wingR', [1.5, 0.86, 2.3], [-1, 0, 0], [0.4, 0.11], 'sponsor'],
  ['wingL', [-1.5, 0.86, 2.3], [1, 0, 0], [0.4, 0.11], 'sponsor'],
];
let decalGeos = null;
async function cutDecals() {
  const { DecalGeometry } = await import('three/addons/geometries/DecalGeometry.js');
  const src = state.body.Livery.full, pos = src.attributes.position, idx = src.index.array;
  const ray = new THREE.Raycaster(), probe = new THREE.Mesh(src);
  const out = [];
  for (const [name, o, dir, size, kind] of SLOTS) {
    ray.set(new THREE.Vector3(...o), new THREE.Vector3(...dir)); ray.far = 3;
    const hit = ray.intersectObject(probe, false)[0];
    if (!hit) continue;
    // projector: looks against the ray (its +z points out of the surface), text up = +y on the sides, nose up
    // towards the front on the top so it reads from behind (chase / onboard cameras)
    const e = dir[1] < 0 ? new THREE.Euler(-Math.PI / 2, 0, 0) : new THREE.Euler(0, dir[0] < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    // only the triangles near the hit go into the projection
    const r = Math.max(size[0], size[1]) * 0.75 + 0.05, P = hit.point, sub = [], a = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]);
      if (a.distanceTo(P) < r) sub.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos); g.setAttribute('normal', src.attributes.normal);
    g.setIndex(sub);
    const dg = new DecalGeometry(new THREE.Mesh(g), P, e, new THREE.Vector3(size[0], size[1], 0.25));
    if (!dg.attributes.position.count) continue;
    const n = new THREE.Vector3(...dir).negate().multiplyScalar(0.002); dg.translate(n.x, n.y, n.z); // just off the paint
    out.push({ name, kind, geo: dg, aspect: size[0] / size[1] });
  }
  return out;
}
export const decalsReady = carModelReady.then((s) => (s ? cutDecals().then((d) => { decalGeos = d; }) : null)).catch((e) => console.warn('car stickers unavailable', e));

const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
function textTex(text, aspect, color, italic, font) {
  const h = 128, w = Math.round(h * aspect), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  let px = h * 0.86; g.font = `${italic ? 'italic ' : ''}900 ${px}px ${font}`;
  while (g.measureText(text).width > w * 0.94 && px > 8) { px -= 4; g.font = `${italic ? 'italic ' : ''}900 ${px}px ${font}`; }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + px * 0.04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const texCache = new Map();
function cachedTex(text, aspect, color, italic) {
  const k = [text, aspect.toFixed(2), color, italic].join('|');
  if (!texCache.has(k)) texCache.set(k, textTex(text, aspect, color, italic, '"Titillium Web", Arial, sans-serif'));
  return texCache.get(k);
}
const matCache = new Map();
function decalMat(tex) {
  if (!matCache.has(tex)) matCache.set(tex, new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }));
  return matCache.get(tex);
}
// stickers for one car: number, main sponsor, partner; ink contrasts with the panel it sits on
function stickers(team, number, sponsor, partner) {
  if (!decalGeos || !team) return [];
  const ink = (hex) => (lum(hex) > 0.45 ? '#111316' : '#ffffff');
  const top = team.top ?? team.body;
  const list = [];
  for (const d of decalGeos) {
    const panel = d.name === 'nose' ? top : team.body;
    const text = d.kind === 'num' ? String(number) : d.kind === 'sponsor' ? sponsor : partner;
    if (!text) continue;
    const me = new THREE.Mesh(d.geo, decalMat(cachedTex(text, d.aspect, ink(panel), true)));
    me.renderOrder = 3; me.userData.lod = true;
    list.push(me);
  }
  return list;
}

// the visual car: body (near + far), stickers, wheels as { pivot, wheel, front } like the built-in car's.
// team null = the model's original paint without stickers
export function buildModelCar(team, number = 0, sponsor = '', partner = '') {
  const S = state, group = new THREE.Group();
  const liv = liveryMaterial(team);
  const mesh = (g, mat, far) => {
    const me = new THREE.Mesh(g, mat); me.castShadow = me.receiveShadow = true;
    if (far) me.userData.far = true; else me.userData.lod = true;
    return me;
  };
  const livery = mesh(S.body.Livery.full, liv), liveryFar = mesh(S.body.Livery.far, liv, true);
  liveryFar.visible = false;
  // own rear-light material per car so the rain light can blink (same look when off)
  const lightMat = S.mats.RearLight.clone();
  const light = new THREE.Mesh(S.body.RearLight.full, lightMat);
  group.add(livery, liveryFar, light, ...stickers(team, number, sponsor, partner));
  const wheels = [];
  for (const w of S.wheels) {
    const pivot = new THREE.Group(); pivot.position.copy(w.hub);
    const wheel = new THREE.Group(); pivot.add(wheel);
    const add = (g, mat, far) => { const me = mesh(g, mat, far); me.position.copy(w.hub).negate(); if (far) me.visible = false; wheel.add(me); };
    const tm = w.right ? S.mats.WheelsR : S.mats.Wheels;
    add(w.tyre, tm); add(w.tyreFar, tm, true);
    add(w.cover, S.mats.WheelCovers); add(w.coverFar, S.mats.WheelCovers, true);
    group.add(pivot);
    wheels.push({ pivot, wheel, front: w.front });
  }
  return { group, livery, wheels, lightMat };
}
