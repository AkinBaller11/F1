// The 2026 F1 car model from f1-studio.html: geometry, textures and materials exactly as there. Only placement
// (rotated so the nose points to -z, scaled so the wheelbase matches the game's 3.384 m) and the split of the
// four wheels into their own draws (so they can spin and steer) are added here. Team colours use the same
// navy-shift recolour as the studio's livery switcher, done in the shader so every car can share one texture.
// The textures in assets/car are the studio's with the real-world logos painted out (fictional tyre lettering).
import * as THREE from 'three';

const SCALE = 3.384 / 7.291;          // model axle distance 7.291 units -> game wheelbase 3.384 m
const SRC_NAVY = [0, 53, 114];        // body colour of the original livery (sRGB 0..255)
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

// livery material per team colour: the studio material plus the navy -> team colour shift of its switcher
const liveryCache = new Map();
export function liveryMaterial(hex) {
  const key = hex == null ? 'orig' : hex;
  if (liveryCache.has(key)) return liveryCache.get(key);
  const base = state.mats.Livery;
  if (hex == null) { liveryCache.set(key, base); return base; }
  const m = base.clone();
  const tgt = new THREE.Color(hex);
  const T = [tgt.r, tgt.g, tgt.b].map((c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255); // linear -> sRGB
  m.userData.delta = new THREE.Vector3(T[0] - SRC_NAVY[0], T[1] - SRC_NAVY[1], T[2] - SRC_NAVY[2]);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNavyDelta = { value: m.userData.delta };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uNavyDelta;
vec3 cmToS(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 cmToL(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 s = cmToS(clamp(diffuseColor.rgb, 0.0, 1.0)) * 255.0;
  float e = abs(s.r - ${SRC_NAVY[0]}.0) + abs(s.g - ${SRC_NAVY[1]}.0) + abs(s.b - ${SRC_NAVY[2]}.0);
  float w = e > 150.0 ? 0.0 : (e < 40.0 ? 1.0 : 1.0 - (e - 40.0) / 110.0);
  diffuseColor.rgb = cmToL(clamp((s + uNavyDelta * w) / 255.0, 0.0, 1.0));
}`);
  };
  m.customProgramCacheKey = () => 'navyShift';
  liveryCache.set(key, m);
  return m;
}

// the visual car: body (near + far), wheels as { pivot, wheel, front } like the built-in car's
export function buildModelCar(hex) {
  const S = state, group = new THREE.Group();
  const liv = liveryMaterial(hex);
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
  group.add(livery, liveryFar, light);
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
