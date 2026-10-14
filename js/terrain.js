// Real elevation without touching the 2D simulation: one height field for the whole circuit and its
// surroundings. Every vertex of the game scene (road, cars, trees, stands, particles, shadows) is lifted
// by it in the vertex shader, and the camera / physics read the same field on the CPU. Cars therefore
// pitch over crests and climb Eau Rouge while the race logic stays flat.
import * as THREE from 'three';

const U = { terrainMap: { value: null }, terrainOn: { value: 0 }, terrainOrigin: { value: new THREE.Vector2() }, terrainSize: { value: 1 } };
let cpu = null; // { data: Float32Array, res, ox, oz, size }

const GLSL = `
uniform sampler2D terrainMap; uniform float terrainOn; uniform vec2 terrainOrigin; uniform float terrainSize;
float terrainH( vec2 xz ) {
  if ( terrainOn < 0.5 ) return 0.0;
  vec2 uv = ( xz - terrainOrigin ) / terrainSize + 0.5;
  return texture2D( terrainMap, clamp( uv, 0.0, 1.0 ) ).r;
}
`;
const PROJECT = THREE.ShaderChunk.project_vertex.replace(
  'mvPosition = modelViewMatrix * mvPosition;',
  'vec4 tWorld = modelMatrix * mvPosition; tWorld.y += terrainH( tWorld.xz ); mvPosition = viewMatrix * tWorld;',
);
const WORLDPOS = THREE.ShaderChunk.worldpos_vertex.replace(
  'worldPosition = modelMatrix * worldPosition;',
  'worldPosition = modelMatrix * worldPosition; worldPosition.y += terrainH( worldPosition.xz );',
);
const SPRITE_FROM = 'vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );';
const SPRITE_TO = 'vec4 tw0 = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ); tw0.y += terrainH( tw0.xz ); vec4 mvPosition = viewMatrix * tw0;';

// every material (built-in shaders, depth / shadow materials, sprites) gets the lift unless it opts out
// with userData.noTerrain (sky dome, water at sea level); the menu and podium render with terrainOn = 0
THREE.Material.prototype.onBeforeCompile = function (shader) {
  if (this.userData && this.userData.noTerrain) return;
  const vs = shader.vertexShader;
  if (!vs.includes('#include <project_vertex>') && !vs.includes(SPRITE_FROM)) return;
  Object.assign(shader.uniforms, U);
  shader.vertexShader = GLSL + vs.replace('#include <project_vertex>', PROJECT).replace('#include <worldpos_vertex>', WORLDPOS).replace(SPRITE_FROM, SPRITE_TO);
};

// frustum culling happens on the CPU with the unlifted positions: lift the bounding spheres too,
// or everything small (cars, signs) would vanish on a hill
const _sphere = new THREE.Sphere();
THREE.Frustum.prototype.intersectsObject = function (object) {
  if (object.boundingSphere !== undefined) {
    if (object.boundingSphere === null) object.computeBoundingSphere();
    _sphere.copy(object.boundingSphere).applyMatrix4(object.matrixWorld);
  } else {
    const g = object.geometry;
    if (g.boundingSphere === null) g.computeBoundingSphere();
    _sphere.copy(g.boundingSphere).applyMatrix4(object.matrixWorld);
  }
  if (cpu && U.terrainOn.value && !(object.material && object.material.userData && object.material.userData.noTerrain)) _sphere.center.y += terrainAt(_sphere.center.x, _sphere.center.z);
  return this.intersectsSphere(_sphere);
};
THREE.Frustum.prototype.intersectsSprite = function (sprite) {
  _sphere.center.set(0, 0, 0); _sphere.radius = 0.7071067811865476;
  _sphere.applyMatrix4(sprite.matrixWorld);
  if (cpu && U.terrainOn.value) _sphere.center.y += terrainAt(_sphere.center.x, _sphere.center.z);
  return this.intersectsSphere(_sphere);
};

export function terrainEnable(on) { U.terrainOn.value = on && cpu ? 1 : 0; }
// post-processing passes draw full-screen quads with ordinary materials: only the scene pass may be lifted
export function terrainScenePass(pass) {
  const render = pass.render.bind(pass);
  pass.render = (...a) => { const was = U.terrainOn.value; U.terrainOn.value = cpu ? 1 : 0; render(...a); U.terrainOn.value = was; };
  return pass;
}

// height at a world position (bilinear, same as the GPU)
export function terrainAt(x, z) {
  if (!cpu) return 0;
  const { data, res, ox, oz, size } = cpu;
  const u = Math.min(1, Math.max(0, (x - ox) / size + 0.5)) * res - 0.5, v = Math.min(1, Math.max(0, (z - oz) / size + 0.5)) * res - 0.5;
  const x0 = Math.max(0, Math.min(res - 1, Math.floor(u))), y0 = Math.max(0, Math.min(res - 1, Math.floor(v)));
  const x1 = Math.min(res - 1, x0 + 1), y1 = Math.min(res - 1, y0 + 1), fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
  const a = data[y0 * res + x0], b = data[y0 * res + x1], c = data[y1 * res + x0], d = data[y1 * res + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// build the field from the road heights: nearest road sample right next to the track (so the road is
// level across its width), blurred further out so the land rolls smoothly between the track's sections
export function buildTerrain(tr, size = 7000, res = 1024) {
  dispose();
  let any = false; for (let i = 0; i < tr.N; i++) if (tr.hs[i] > 0.05) { any = true; break; }
  if (!any) return; // flat circuit: no field, no cost
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < tr.N; i++) { minX = Math.min(minX, tr.px[i]); maxX = Math.max(maxX, tr.px[i]); minZ = Math.min(minZ, tr.pz[i]); maxZ = Math.max(maxZ, tr.pz[i]); }
  const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2, cell = size / res;
  const n = res * res, near = new Int32Array(n).fill(-1), dist = new Float32Array(n).fill(1e9);
  const cx = (k) => ox - size / 2 + ((k % res) + 0.5) * cell, cz = (k) => oz - size / 2 + (Math.floor(k / res) + 0.5) * cell;
  // seeds: every road sample marks its texel
  for (let i = 0; i < tr.N; i++) {
    const c = Math.floor((tr.px[i] - ox) / cell + res / 2), r = Math.floor((tr.pz[i] - oz) / cell + res / 2);
    if (c < 0 || r < 0 || c >= res || r >= res) continue;
    const k = r * res + c, d = Math.hypot(cx(k) - tr.px[i], cz(k) - tr.pz[i]);
    if (d < dist[k]) { dist[k] = d; near[k] = i; }
  }
  // two-pass propagation of the nearest sample (Voronoi of the road samples)
  const relax = (k, kk) => {
    const i = near[kk]; if (i < 0) return;
    const d = Math.hypot(cx(k) - tr.px[i], cz(k) - tr.pz[i]);
    if (d < dist[k]) { dist[k] = d; near[k] = i; }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < res; r++) for (let c = 0; c < res; c++) {
      const k = r * res + c;
      if (c > 0) relax(k, k - 1); if (r > 0) { relax(k, k - res); if (c > 0) relax(k, k - res - 1); if (c < res - 1) relax(k, k - res + 1); }
    }
    for (let r = res - 1; r >= 0; r--) for (let c = res - 1; c >= 0; c--) {
      const k = r * res + c;
      if (c < res - 1) relax(k, k + 1); if (r < res - 1) { relax(k, k + res); if (c < res - 1) relax(k, k + res + 1); if (c > 0) relax(k, k + res - 1); }
    }
  }
  const sharp = new Float32Array(n);
  for (let k = 0; k < n; k++) sharp[k] = near[k] >= 0 ? tr.hs[near[k]] : 0;
  // separable box blur (twice) for the land between the sections
  const blur = (src, rad) => {
    const tmp = new Float32Array(n), out = new Float32Array(n), w = 2 * rad + 1;
    for (let r = 0; r < res; r++) { let acc = 0; for (let c = -rad; c <= rad; c++) acc += src[r * res + Math.min(res - 1, Math.max(0, c))]; for (let c = 0; c < res; c++) { tmp[r * res + c] = acc / w; acc += src[r * res + Math.min(res - 1, c + rad + 1)] - src[r * res + Math.max(0, c - rad)]; } }
    for (let c = 0; c < res; c++) { let acc = 0; for (let r = -rad; r <= rad; r++) acc += tmp[Math.min(res - 1, Math.max(0, r)) * res + c]; for (let r = 0; r < res; r++) { out[r * res + c] = acc / w; acc += tmp[Math.min(res - 1, r + rad + 1) * res + c] - tmp[Math.max(0, r - rad) * res + c]; } }
    return out;
  };
  const soft = blur(blur(sharp, 6), 6);
  const data = new Float32Array(n), half = new Uint16Array(n);
  for (let k = 0; k < n; k++) {
    const t = Math.min(1, Math.max(0, (dist[k] - 28) / 110)), w = t * t * (3 - 2 * t);
    data[k] = sharp[k] * (1 - w) + soft[k] * w;
    half[k] = THREE.DataUtils.toHalfFloat(data[k]);
  }
  const tex = new THREE.DataTexture(half, res, res, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  U.terrainMap.value = tex; U.terrainOrigin.value.set(ox, oz); U.terrainSize.value = size;
  cpu = { data, res, ox, oz, size };
  U.terrainOn.value = 1;
}

export function dispose() {
  if (U.terrainMap.value) U.terrainMap.value.dispose();
  U.terrainMap.value = null; U.terrainOn.value = 0; cpu = null;
}
