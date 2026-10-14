// Everything around the racing surface: terrain, barriers, grandstands, pit building,
// trees, lake, city blocks, lights. Styles: 'park' (Barcelona), 'forest' (Monza), 'city'.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { HALF_W } from './track.js';

// ------------------------------------------------------------------ helpers
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return s; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// point inside the circuit's loop (even-odd ray test against the centre line)
function insideLoop(tr, x, z) {
  let inside = false;
  for (let i = 0, j = tr.N - 1; i < tr.N; j = i, i += 1) {
    const xi = tr.px[i], zi = tr.pz[i], xj = tr.px[j], zj = tr.pz[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function ctex(c, rx = 1, ry = 1) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// distance-to-track field on a coarse grid (cheap stamping from track samples)
function distanceField(tr, cell = 16, pad = 2600) {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < tr.N; i++) { minX = Math.min(minX, tr.px[i]); maxX = Math.max(maxX, tr.px[i]); minZ = Math.min(minZ, tr.pz[i]); maxZ = Math.max(maxZ, tr.pz[i]); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const half = Math.max(maxX - minX, maxZ - minZ) / 2 + pad;
  const n = Math.ceil((half * 2) / cell);
  const d = new Float32Array(n * n).fill(1e6);
  const R = Math.ceil(420 / cell);
  for (let i = 0; i < tr.N; i += 3) {
    const gx = Math.floor((tr.px[i] - (cx - half)) / cell), gz = Math.floor((tr.pz[i] - (cz - half)) / cell);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = gx + dx, z = gz + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const wx = cx - half + (x + 0.5) * cell, wz = cz - half + (z + 0.5) * cell;
      const dd = Math.hypot(wx - tr.px[i], wz - tr.pz[i]);
      if (dd < d[z * n + x]) d[z * n + x] = dd;
    }
  }
  const at = (x, z) => {
    const fx = (x - (cx - half)) / cell - 0.5, fz = (z - (cz - half)) / cell - 0.5;
    const x0 = Math.max(0, Math.min(n - 2, Math.floor(fx))), z0 = Math.max(0, Math.min(n - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - x0)), tz = Math.max(0, Math.min(1, fz - z0));
    const a = d[z0 * n + x0], b = d[z0 * n + x0 + 1], c = d[(z0 + 1) * n + x0], e = d[(z0 + 1) * n + x0 + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
  };
  return { at, cx, cz, half };
}

// ------------------------------------------------------------------ textures
function tecproTex() {
  const [c, g] = canvas(512, 128);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f0f0f0' : '#d4121a'; g.fillRect(i * 64, 0, 64, 128); }
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 8; i++) g.fillRect(i * 64 + 60, 0, 4, 128);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 118, 512, 10);
  return ctex(c);
}
function concreteTex(i) {
  const [c, g] = canvas(1024, 160);
  g.fillStyle = '#9a9c9f'; g.fillRect(0, 0, 1024, 160);
  const r = rng(i + 3);
  for (let k = 0; k < 4000; k++) { const v = 130 + r() * 50; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(r() * 1024, r() * 160, 2, 2); }
  const b = TX.banner(i).image;
  g.drawImage(b, 0, 34, 1024, 92);
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < 1024; x += 256) g.fillRect(x, 0, 3, 160);
  return ctex(c);
}
function windowTex(style) {
  const [c, g] = canvas(256, 256);
  const facade = ['#2b3038', '#3a3f47', '#d8d2c4', '#1d2a36'][style];
  g.fillStyle = facade; g.fillRect(0, 0, 256, 256);
  const [e, ge] = canvas(256, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
  const r = rng(style * 31 + 5);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const lit = r() < 0.38;
    const wx = x * 32 + 5, wy = y * 32 + 7;
    g.fillStyle = style === 2 ? '#5a6b7c' : '#1b2633'; g.fillRect(wx, wy, 22, 18);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(wx, wy, 22, 4);
    if (lit) { ge.fillStyle = r() < 0.7 ? '#ffd38a' : '#cfe6ff'; ge.fillRect(wx, wy, 22, 18); }
  }
  return [ctex(c), ctex(e)];
}
function neonTex(text, col) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128);
  g.font = 'italic 900 86px "Titillium Web", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 18; g.fillStyle = col; g.fillText(text, 256, 68, 480);
  g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(text, 256, 68, 480);
  const t = ctex(c); return t;
}
function pavementTex() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#56585c'; g.fillRect(0, 0, 256, 256);
  const r = rng(77);
  for (let k = 0; k < 6000; k++) { const v = 70 + r() * 40; g.fillStyle = `rgba(${v},${v},${v},.4)`; g.fillRect(r() * 256, r() * 256, 1, 1); }
  g.strokeStyle = 'rgba(30,30,30,.35)'; g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(256, x); g.stroke(); }
  return ctex(c);
}
function skidTex() {
  const [c, g] = canvas(64, 256);
  const r = rng(9);
  for (let y = 0; y < 256; y++) { const a = 0.25 + r() * 0.5; g.fillStyle = `rgba(10,10,10,${a})`; g.fillRect(4 + r() * 4, y, 56 - r() * 8, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// painted tree impostors: crown built from many shaded leaf clusters, light from the top left
function treeTexture(kind, R) {
  const [c, g] = canvas(256, 320);
  const W = 256, H = 320;
  const trunkCol = '#5a4030';
  if (kind !== 'bush') {
    g.fillStyle = trunkCol;
    g.beginPath(); g.moveTo(W / 2 - 7, H); g.lineTo(W / 2 - 4, H * 0.45); g.lineTo(W / 2 + 4, H * 0.45); g.lineTo(W / 2 + 7, H); g.fill();
  }
  const greens = kind === 'pine' ? [[34, 66, 34], [44, 82, 40], [58, 98, 48]] : [[52, 92, 38], [70, 112, 46], [92, 136, 58], [118, 160, 70]];
  const blob = (x, y, rad, shade) => {
    const [r0, g0, b0] = greens[Math.min(greens.length - 1, Math.max(0, shade))];
    const gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
    gr.addColorStop(0, `rgb(${r0 + 30},${g0 + 30},${b0 + 18})`); gr.addColorStop(0.7, `rgb(${r0},${g0},${b0})`); gr.addColorStop(1, `rgb(${r0 * 0.7 | 0},${g0 * 0.7 | 0},${b0 * 0.7 | 0})`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  if (kind === 'pine') {
    for (let layer = 0; layer < 9; layer++) {
      const y = H * 0.12 + layer * H * 0.085, half = 14 + layer * 11;
      for (let k = 0; k < 10; k++) blob(W / 2 + (R() - 0.5) * half * 2, y + R() * 16, 9 + R() * 6, layer < 3 ? 2 : layer < 6 ? 1 : 0);
    }
  } else {
    const cx = W / 2, cy = kind === 'bush' ? H * 0.68 : H * 0.36, rx = kind === 'bush' ? 110 : 100, ry = kind === 'bush' ? 90 : 105;
    for (let k = 0; k < 170; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R());
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
      const shade = Math.round(3 - ((y - (cy - ry)) / (2 * ry)) * 2.5 - (x > cx ? 0.6 : 0) + (R() - 0.5));
      blob(x, y, 14 + R() * 14, shade);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ main
export function buildScenery(tr) {
  const G = tr.group, tod = tr.tod || {}, city = tr.style === 'city', desert = tr.style === 'desert';
  const lampsOn = tod.lamps || 0;
  const q = tr.quality;
  const N = tr.N;
  const df = distanceField(tr);
  tr.nightMats = [];
  const R = rng(tr.def.id.length * 977 + N);

  const crowdTex = TX.crowd();
  const greyMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.7 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });

  // ---------------- lake (park / forest): a calm, reflective pond in the infield
  let lake = null;
  if (!city && !desert) {
    let best = null;
    for (let k = 0; k < 400; k++) {
      const x = df.cx + (R() - 0.5) * 900, z = df.cz + (R() - 0.5) * 700;
      const d = df.at(x, z);
      if (d > 150 && d < 320 && (!best || Math.abs(d - 210) < Math.abs(best.d - 210))) best = { x, z, d };
    }
    if (best) lake = { x: best.x, z: best.z, r: Math.min(110, best.d - 70) };
    // Albert Park: the circuit runs round a big lake -> take the deepest infield point and fill it
    if (tr.def.bigLake) {
      let deep = null;
      for (let k = 0; k < 1500; k++) {
        const x = df.cx + (R() - 0.5) * 1400, z = df.cz + (R() - 0.5) * 1400, d = df.at(x, z);
        if (d < 700 && (!deep || d > deep.d) && insideLoop(tr, x, z)) deep = { x, z, d };
      }
      if (deep) lake = { x: deep.x, z: deep.z, r: deep.d - 45 };
    }
  }
  const lakeAt = (x, z) => (lake ? Math.hypot(x - lake.x, z - lake.z) / lake.r : 9);

  // ---------------- open water (harbours, sea fronts): everything beyond a shore line on one side of the circuit
  let seaAt = () => -1e9; // metres past the shore (> 0 = water)
  if (tr.def.sea) {
    const a = (tr.def.sea.dir * Math.PI) / 180, ux = Math.sin(a), uz = -Math.cos(a); // compass -> world (x east, z south)
    let far = -1e9; for (let i = 0; i < N; i += 3) far = Math.max(far, (tr.px[i] - df.cx) * ux + (tr.pz[i] - df.cz) * uz);
    const shore = far + tr.def.sea.gap;
    seaAt = (x, z) => (x - df.cx) * ux + (z - df.cz) * uz - shore;
    tr.sea = { ux, uz, shore };
  }
  tr.seaAt = seaAt;

  // ---------------- terrain: flat near the track, rolling hills further out, mountains on the horizon
  const height = (x, z) => {
    const sea = seaAt(x, z);
    if (sea > -30) { const k = smooth(-30, 0, sea); return (city ? 0 : height0(x, z)) * (1 - k) - 3.2 * k; } // beach slopes into the water
    if (city) return 0;
    return height0(x, z);
  };
  const height0 = (x, z) => {
    const d = df.at(x, z);
    let h = smooth(90, 520, d) * (fbm(x / 420, z / 420) * 55 - 8);
    const far = Math.hypot(x - df.cx, z - df.cz);
    h += smooth(1500, 2600, far) * (fbm(x / 700 + 9, z / 700) * 320 + 40);
    const l = lakeAt(x, z);
    if (l < 1.6) h = h * smooth(1.0, 1.6, l) - 2.5 * (1 - smooth(0.85, 1.15, l));
    return Math.max(h, -2.6);
  };
  tr.heightAt = height;
  {
    const size = 7000, seg = q === 'low' ? 110 : 170;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(df.cx, 0, df.cz);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = height(x, z);
      p.setY(i, h - 0.03);
      if (city) { col.set([1, 1, 1], i * 3); continue; }
      const n = fbm(x / 90, z / 90, 3);
      const d = df.at(x, z);
      const mown = 1 - smooth(40, 160, d);
      let r = 0.72 + n * 0.32, g = 0.76 + n * 0.22, b = 0.62 + n * 0.16;
      const stripe = mown * (Math.floor((x + z) / 9) % 2 ? 0.06 : -0.02);
      r += mown * 0.04 + stripe; g += mown * 0.08 + stripe; b += stripe * 0.5;
      if (desert) { r = 0.95 + n * 0.2; g = 0.92 + n * 0.18; b = 0.88 + n * 0.14; }
      if (h > 120) { const k = smooth(120, 300, h); r = r * (1 - k) + 0.9 * k; g = g * (1 - k) + 0.86 * k; b = b * (1 - k) + 0.8 * k; } // rocky tops
      const sa = seaAt(x, z); if (sa > -60) { const k = smooth(-60, -20, sa); r = r * (1 - k) + 0.96 * k; g = g * (1 - k) + 0.88 * k; b = b * (1 - k) + 0.68 * k; } // beach
      const l = lakeAt(x, z); if (l < 1.25) { const k = 1 - smooth(1.0, 1.25, l); r = r * (1 - k) + 0.95 * k; g = g * (1 - k) + 0.85 * k; b = b * (1 - k) + 0.6 * k; } // sandy shore
      col.set([r, g, b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const tex = city ? pavementTex() : TX.grass(desert);
    tex.repeat.set(city ? 900 : 700, city ? 900 : 700);
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.95 });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    G.add(ground);
    tr.grassMat = mat;
  }
  // water: dark blue-green, mirror-like with a fine ripple normal map
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1d4656, roughness: 0.07, metalness: 0.65 });
  if (q !== 'low') { waterMat.normalMap = TX.noiseNormal(256, 23, 1, 1.4); waterMat.normalMap.repeat.set(120, 120); waterMat.normalScale.set(0.25, 0.25); }
  if (lake) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(lake.r * 1.05, 96), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(lake.x, -0.6, lake.z);
    G.add(water);
  }
  if (tr.sea) {
    const S = tr.sea, W = 9000;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W, W), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.rotation.z = Math.atan2(S.ux, -S.uz);
    water.position.set(df.cx + S.ux * (S.shore + W / 2 - 15), -0.7, df.cz + S.uz * (S.shore + W / 2 - 15));
    G.add(water);
    if (tr.def.sea.boats) {
      // moored yachts and a few bigger motor yachts along the shore
      const hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f5f6, roughness: 0.35 });
      const deckMat = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.3, metalness: 0.3 });
      const px = -S.uz, pz = S.ux; // along the shore
      for (let k = 0; k < 46; k++) {
        const along = (R() - 0.5) * 1600, out = 25 + R() * 260, big = R() < 0.25;
        const L = big ? 30 + R() * 30 : 10 + R() * 12;
        const boat = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(L * 0.28, L * 0.12, L), hullMat); hull.position.y = L * 0.04; boat.add(hull);
        const bow = new THREE.Mesh(new THREE.ConeGeometry(L * 0.14, L * 0.3, 4), hullMat); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.6); bow.position.set(0, L * 0.04, -L * 0.62); boat.add(bow);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(L * 0.2, L * (big ? 0.14 : 0.08), L * 0.4), deckMat); cab.position.set(0, L * (big ? 0.16 : 0.12), L * 0.08); boat.add(cab);
        if (!big) { const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, L * 1.3, 5), hullMat); mast.position.set(0, L * 0.7, -L * 0.05); boat.add(mast); }
        const x = df.cx + S.ux * (S.shore + out) + px * along, z = df.cz + S.uz * (S.shore + out) + pz * along;
        boat.position.set(x, -0.55, z); boat.rotation.y = Math.atan2(S.ux, S.uz) + (R() - 0.5) * 0.5;
        G.add(boat);
      }
    }
  }

  // ---------------- barriers: sponsor armco on straights, tecpro blocks outside corners, concrete in the city
  const bannerMats = [];
  for (let b = 0; b < TX.SPONSOR_COUNT; b++) bannerMats.push(new THREE.MeshStandardMaterial({ map: city ? concreteTex(b) : TX.banner(b), roughness: 0.6, side: THREE.DoubleSide }));
  const tecMat = new THREE.MeshStandardMaterial({ map: tecproTex(), roughness: 0.55, side: THREE.DoubleSide });
  tecMat.map.repeat.set(1, 1);
  const segLen = Math.round(160 / tr.ds);
  for (let side = 0; side < 2; side++) {
    const grav = side ? tr.gravelR : tr.gravelL;
    for (let seg = 0; seg * segLen < N; seg++) {
      const a = seg * segLen, b = Math.min(N, a + segLen);
      let gcount = 0; for (let i = a; i < b; i++) gcount += grav[i];
      const tecpro = !city && gcount > (b - a) * 0.4;
      const mat = tecpro ? tecMat : bannerMats[(seg * 3 + side * 5) % bannerMats.length];
      const lat = side ? (i) => tr.limR[i] : (i) => -tr.limL[i];
      // (the pit straight's right side is the pit wall itself: no second barrier in the same place)
      tr.wall(lat, tecpro ? 1.3 : city ? 1.1 : 1.2, 0, mat, tecpro ? 8 : 22, (i) => i >= a && i <= b && !(side === 1 && tr.inPitStraight(i * tr.ds)), side === 1);
    }
  }
  // catch fence
  {
    const [fc, fg] = canvas(64, 64);
    fg.strokeStyle = 'rgba(40,40,40,0.3)'; fg.lineWidth = 1.5;
    for (let i = 0; i < 64; i += 16) { fg.beginPath(); fg.moveTo(i, 0); fg.lineTo(i + 64, 64); fg.stroke(); fg.beginPath(); fg.moveTo(i + 64, 0); fg.lineTo(i, 64); fg.stroke(); }
    fg.fillStyle = 'rgba(30,30,30,0.7)'; fg.fillRect(0, 0, 2, 64);
    const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    const fenceMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: lampsOn > 0.5 ? 0x8890a0 : 0xffffff });
    const fh = city ? 4.2 : 3.2;
    tr.wall((i) => -tr.limL[i] - 0.3, fh, 1.2, fenceMat, 3);
    tr.wall((i) => tr.limR[i] + 0.3, fh, 1.2, fenceMat, 3, (i) => !tr.inPitStraight(i * tr.ds));
  }

  // ---------------- heavy braking zones: tyre walls, skid marks, distance boards, corner grandstands
  const hardCorners = [];
  for (let i = 0; i < N; i++) {
    const prev = (i - 1 + N) % N;
    if (tr.brakeZone[i] && !tr.brakeZone[prev]) {
      let j = i; while (tr.brakeZone[j % N] && j < i + N) j++;
      const drop = tr.vProf[i] - tr.vProf[j % N];
      if (drop > 22) hardCorners.push({ i, j: j % N, drop, side: tr.k[(j + 8) % N] > 0 ? -1 : 1 });
    }
  }
  // skid marks along the racing line where cars brake hard
  {
    const mat = new THREE.MeshBasicMaterial({ map: skidTex(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, color: 0x000000 });
    const inSkid = new Uint8Array(N);
    for (const c of hardCorners) for (let k = c.i; k !== (c.j + 15) % N; k = (k + 1) % N) inSkid[k] = 1;
    for (const off of [-0.85, 0.85]) tr.ribbon((i) => tr.race[i] + off - 0.17, (i) => tr.race[i] + off + 0.17, 0.036, mat, 1, 10, (i) => inSkid[i]);
  }
  const boards = [150, 100, 50].map((n) => new THREE.MeshStandardMaterial({ map: TX.distanceBoard(n), roughness: 0.6 }));
  const tyreGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.26, 10);
  const tyreCount = hardCorners.length * 70 * 4;
  const tyres = new THREE.InstancedMesh(tyreGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), Math.max(1, tyreCount));
  let tc = 0;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), C = new THREE.Color();
  const standSpots = [];
  for (const c of hardCorners) {
    const sStart = c.i * tr.ds;
    for (let b = 0; b < 3; b++) {
      const s = sStart + 30 + b * 50;
      const lat = c.side > 0 ? tr.limR[tr.idx(s)] - 1.5 : -tr.limL[tr.idx(s)] + 1.5;
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), boards[b]);
      const g = new THREE.Group(); bd.position.y = 1.9; g.add(bd);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), greyMat); pole.position.y = 0.7; g.add(pole);
      tr.place(g, s, lat, 0, 0);
    }
    if (city) continue;
    // tyre wall in front of the barrier around the corner
    const sCorner = c.j * tr.ds;
    for (let s = sCorner - 30; s < sCorner + 40 && tc < tyreCount - 4; s += 0.66) {
      const i = tr.idx(s);
      const lim = c.side > 0 ? tr.limR[i] : tr.limL[i];
      const f = tr.frame(s);
      const lat = c.side * (lim - 0.4);
      for (let h = 0; h < 4; h++) {
        P.set(f.x + f.rx * lat, 0.13 + h * 0.26, f.z + f.rz * lat);
        M.compose(P, Q, S); tyres.setMatrixAt(tc, M);
        C.setHex((Math.floor(s / 0.66) + h) % 7 === 0 ? 0xe8e8e8 : (Math.floor(s / 0.66) + h) % 11 === 0 ? 0xd4121a : 0x1c1c1c);
        tyres.setColorAt(tc, C); tc++;
      }
    }
    standSpots.push({ s: sCorner + 10, side: c.side });
  }
  tyres.count = tc; tyres.castShadow = true;
  if (tc) G.add(tyres);

  // ---------------- grandstands
  const grandstand = (len, depth, height, seed) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: crowdTex.clone(), roughness: 0.9 });
    mat.map.repeat.set(len / 30, 1); mat.map.needsUpdate = true;
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(len, Math.hypot(depth, height)), mat);
    slope.rotation.x = -Math.atan2(height, depth);
    slope.position.set(0, height / 2 + 1.5, -depth / 2);
    g.add(slope);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, height + 4, 1), greyMat); back.position.set(0, (height + 4) / 2, -depth - 0.5); g.add(back);
    const roofMat = new THREE.MeshStandardMaterial({ color: [0xe8e8e8, 0xd4121a, 0x1e3a8a][seed % 3], roughness: 0.5 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.6, depth + 6), roofMat); roof.position.set(0, height + 7, -depth / 2 + 2); roof.rotation.x = 0.06; g.add(roof);
    for (let x = -len / 2; x <= len / 2; x += len / 6) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, height + 7, 0.5), darkMat); p.position.set(x, (height + 7) / 2, -depth - 0.5); g.add(p); }
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 1), greyMat); base.position.set(0, 0.75, 0); g.add(base);
    if (lampsOn > 0.3) { const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2d0, emissiveIntensity: 2 * lampsOn })); strip.position.set(0, height + 6.6, 1.5); g.add(strip); }
    return g;
  };
  const pitLen = tr.pit[1] - tr.pit[0];
  const nStands = Math.max(3, Math.floor((pitLen - 40) / 95));
  for (let k = 0; k < nStands; k++) {
    const s = tr.pit[0] + 60 + k * ((pitLen - 80) / nStands);
    tr.place(grandstand(90, 22, 14, k), s, -tr.limL[tr.idx(s)] - 4, 0, Math.PI / 2);
  }
  for (const sp of standSpots.slice(0, 5)) {
    const i = tr.idx(sp.s);
    const lat = sp.side > 0 ? tr.limR[i] + 6 : -tr.limL[i] - 6;
    tr.place(grandstand(70, 18, 11, Math.round(sp.s)), sp.s, lat, 0, sp.side > 0 ? -Math.PI / 2 : Math.PI / 2);
  }

  // ---------------- pit lane, pit wall, garages
  tr.pitMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.9 });
  tr.ribbon(11.3, 28, 0.025, tr.pitMat, 1, 20, (i) => tr.inPitStraight(i * tr.ds));
  tr.wall(() => 11, 1.3, 0, new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.7, side: THREE.DoubleSide }), 10, (i) => tr.inPitStraight(i * tr.ds));
  const garageMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.15, metalness: 0.6, emissive: 0xbfd8ff, emissiveIntensity: lampsOn * 0.35 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x0c0f14, emissive: 0xfff4e0, emissiveIntensity: lampsOn * 0.25 });
  for (let s = tr.pit[0] + 30; s < tr.pit[1] - 20; s += 40) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(40, 9, 16), garageMat); body.position.set(0, 4.5, -8); g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 18), glassMat); top.position.set(0, 11.5, -8); g.add(top);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(38, 3.2), new THREE.MeshStandardMaterial({ map: TX.banner(1 + ((s / 40) | 0) % 3), roughness: 0.6 }));
    ban.position.set(0, 7.2, 0.05); g.add(ban);
    for (let d = -15; d <= 15; d += 10) { const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 5.5), doorMat); door.position.set(d, 2.75, 0.03); g.add(door); }
    tr.place(g, s, 29, 0, -Math.PI / 2);
  }

  // ---------------- start gantry with lights, position tower, sponsor bridge
  tr.lights = [];
  {
    const gantry = new THREE.Group();
    const span = 2 * HALF_W + 6;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 1.2), darkMat); beam.position.y = 7.5; gantry.add(beam);
    for (const x of [-span / 2, span / 2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.3, 0.8), darkMat); leg.position.set(x, 4.15, 0); gantry.add(leg); }
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(span - 1, 1.3), new THREE.MeshStandardMaterial({ map: TX.banner(3) })); lb.position.set(0, 8.9, 0.6); gantry.add(lb);
    for (let i = 0; i < 5; i++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 })); pod.position.set(-3 + i * 1.5, 6.2, 0.55); gantry.add(pod);
      const lamps = [];
      for (let r = 0; r < 2; r++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshBasicMaterial({ color: 0x220000 })); l.position.set(-3 + i * 1.5, 6.5 - r * 0.6, 0.76); gantry.add(l); lamps.push(l); }
      tr.lights.push(lamps);
    }
    tr.place(gantry, tr.startS + 6, 0, 0, 0);
    const tower = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 3), darkMat); tb.position.y = 13; tower.add(tb);
    const tsign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 20), new THREE.MeshStandardMaterial({ map: TX.liveryText('1 2 3', '#111', '#fff', 64, 512, 40), emissive: 0xffffff, emissiveIntensity: lampsOn * 0.3, emissiveMap: TX.liveryText('1 2 3', '#111', '#fff', 64, 512, 40) }));
    tsign.position.set(0, 14, 1.55); tower.add(tsign);
    tr.place(tower, tr.startS + 120, -tr.limL[tr.idx(tr.startS + 120)] - 2, 0, Math.PI / 2);
    // sponsor bridge over the end of the main straight
    const sB = tr.mainStraight[1] - 140;
    const bridge = new THREE.Group();
    const iB = tr.idx(sB), w = tr.limL[iB] + tr.limR[iB] + 6;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, 4), greyMat); deck.position.y = 7.2; bridge.add(deck);
    for (const x of [-w / 2 + 1, w / 2 - 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 3), greyMat); p.position.set(x + (tr.limR[iB] - tr.limL[iB]) / 2, 3.5, 0); bridge.add(p); }
    deck.position.x = (tr.limR[iB] - tr.limL[iB]) / 2;
    for (const z of [2.05, -2.05]) {
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, 1.6), new THREE.MeshStandardMaterial({ map: TX.banner(z > 0 ? 2 : 6), side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: lampsOn * 0.25, emissiveMap: TX.banner(z > 0 ? 2 : 6) }));
      bn.position.set(deck.position.x, 7.2, z); bridge.add(bn);
    }
    tr.place(bridge, sB, 0, 0, 0);
  }

  // ---------------- marshal posts
  for (let s = 100; s < tr.length; s += 290) {
    const i = tr.idx(s);
    if (tr.inPitStraight(s)) continue;
    const side = tr.k[i] > 0 ? -1 : 1;
    const g = new THREE.Group();
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, 2), orangeMat); hut.position.y = 1.2; g.add(hut);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 2.4), whiteMat); roof.position.y = 2.5; g.add(roof);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2), greyMat); pole.position.set(0.8, 3.5, 0.8); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: 0xf5c400, side: THREE.DoubleSide })); flag.position.set(1.25, 4.3, 0.8); g.add(flag);
    tr.place(g, s, side * ((side > 0 ? tr.limR[i] : tr.limL[i]) + 2.5), 0, 0);
  }

  // ---------------- floodlights / street lights
  if (lampsOn > 0 || city) {
    const every = city ? 46 : 62;
    const count = Math.floor(tr.length / every);
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 12, 6); poleGeo.translate(0, 6, 0);
    const armGeo = new THREE.BoxGeometry(0.15, 0.15, 3.2); armGeo.translate(0, 12, 1.5);
    const headGeo = new THREE.BoxGeometry(0.9, 0.25, 0.5); headGeo.translate(0, 11.85, 3);
    const poleMesh = new THREE.InstancedMesh(mergeGeometries([poleGeo.toNonIndexed(), armGeo.toNonIndexed()]), darkMat, count);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff3dc, emissiveIntensity: 0.2 + lampsOn * 5 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, count);
    let n = 0;
    for (let k = 0; k < count; k++) {
      const s = k * every, i = tr.idx(s);
      const side = k % 2 ? 1 : -1;
      const lat = side * ((side > 0 ? tr.limR[i] : tr.limL[i]) + 1.2);
      const [x, z, yaw] = tr.posAt(s, lat);
      P.set(x, 0, z); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
      M.compose(P, Q, S);
      poleMesh.setMatrixAt(n, M); heads.setMatrixAt(n, M); n++;
    }
    poleMesh.count = heads.count = n;
    G.add(poleMesh, heads);
  }

  if (city) buildCity(tr, df, lampsOn, R);
  else buildNature(tr, df, height, lakeAt, R);

  // TV crane
  const crane = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 26), new THREE.MeshStandardMaterial({ color: 0xf2b705 })); arm.position.set(0, 18, -8); arm.rotation.x = -0.5; crane.add(arm);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), darkMat); mast.position.y = 7; crane.add(mast);
  const sC = (tr.mainStraight[1] + 260) % tr.length;
  tr.place(crane, sC, tr.limR[tr.idx(sC)] + 30, 0, 0.5);
}

// ------------------------------------------------------------------ park / forest
function buildNature(tr, df, height, lakeAt, R) {
  const G = tr.group, q = tr.trees || tr.quality, forest = tr.style === 'forest';
  const count = Math.round((q === 'low' ? 700 : q === 'medium' ? 1400 : q === 'ultra' ? 3600 : 2400) * (forest ? 1.5 : tr.style === 'desert' ? 0.12 : 1));
  // trees as painted impostors: three crossed planes with a hand-drawn crown (much cleaner than low-poly blobs)
  const treeGeo = (w, h) => {
    const planes = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => { const p = new THREE.PlaneGeometry(w, h); p.translate(0, h / 2, 0); p.rotateY(a); return p; });
    const g = mergeGeometries(planes);
    // normals pointing up-ish so the crowns are lit evenly from every side
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 0.9, n.getZ(i) * 0.3);
    return g;
  };
  const treeMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(treeGeo(9, 11), treeMat(treeTexture('leaf', R)), count);
  const leaves = { setMatrixAt() {}, setColorAt() {} }; // (kept for the placement loop below)
  const pines = new THREE.InstancedMesh(treeGeo(6.5, 13), treeMat(treeTexture('pine', R)), count);
  const bushes = new THREE.InstancedMesh(treeGeo(3.2, 2.2), treeMat(treeTexture('bush', R)), Math.round(count / 2));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  const greens = [0x3c5f2e, 0x4a6b30, 0x2f5228, 0x5b7a34, 0x6e7f3a];
  const pinesC = [0x2c4a24, 0x26401f, 0x34522a];
  let lc = 0, pc = 0, bc = 0;
  const loc = {};
  const span = df.half - 1200;
  for (let tries = 0; tries < count * 4 && (lc + pc) < count; tries++) {
    // forests cluster: accept points with high clumping noise
    const x = df.cx + (R() - 0.5) * 2 * span, z = df.cz + (R() - 0.5) * 2 * span;
    const clump = fbm(x / 260 + 3, z / 260 - 7, 3);
    if (clump < (forest ? 0.38 : 0.47)) continue;
    const d = df.at(x, z);
    if (d < 30) continue;
    if (d < 70) { tr.locate(x, z, -1, loc); const lim = loc.lat > 0 ? tr.limR[loc.i] : tr.limL[loc.i]; if (Math.abs(loc.lat) < lim + 12 || tr.inPitStraight(loc.s)) continue; }
    if (d < 110 && tr.inPitStraight(tr.locate(x, z, -1, loc).s)) continue;
    if (lakeAt(x, z) < 1.2 || tr.seaAt(x, z) > -25) continue;
    const h = height(x, z);
    if (h > 160) continue;
    const s = 0.75 + R() * 0.9;
    Q.setFromAxisAngle(Y, R() * 6.28);
    const tint = 0.82 + R() * 0.3;
    if (R() < (forest ? 0.55 : 0.62)) {
      P.set(x, h - 0.2, z); S.set(s, s * (0.85 + R() * 0.35), s); M.compose(P, Q, S); trunks.setMatrixAt(lc, M);
      trunks.setColorAt(lc, C.setRGB(tint, tint * (0.95 + R() * 0.1), tint * 0.9)); lc++;
    } else {
      P.set(x, h - 0.2, z); S.set(s, s * (0.9 + R() * 0.4), s); M.compose(P, Q, S); pines.setMatrixAt(pc, M);
      pines.setColorAt(pc, C.setRGB(tint, tint, tint)); pc++;
    }
    if (bc < bushes.instanceMatrix.count && R() < 0.5) {
      const bx = x + (R() - 0.5) * 9, bz = z + (R() - 0.5) * 9;
      P.set(bx, height(bx, bz) - 0.1, bz); S.setScalar(0.7 + R() * 0.8); M.compose(P, Q, S); bushes.setMatrixAt(bc, M);
      bushes.setColorAt(bc, C.setRGB(tint * 0.9, tint * 0.95, tint * 0.85)); bc++;
    }
  }
  trunks.count = lc; pines.count = pc; bushes.count = bc;
  // grass tufts near the barriers (ultra/high): two crossed alpha planes per tuft
  if (q === 'ultra' || q === 'high') {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g2 = c.getContext('2d');
    for (let k = 0; k < 26; k++) { const x = 4 + R() * 56; g2.strokeStyle = `rgba(${60 + R() * 40},${110 + R() * 50},${40 + R() * 20},1)`; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(32, 64); g2.quadraticCurveTo(x, 40, x + (R() - 0.5) * 10, 6 + R() * 20); g2.stroke(); }
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
    const p1 = new THREE.PlaneGeometry(0.8, 0.55); p1.translate(0, 0.27, 0);
    const p2 = p1.clone(); p2.rotateY(Math.PI / 2);
    const tuftGeo = mergeGeometries([p1, p2]);
    const n = q === 'ultra' ? 9000 : 4500;
    const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ map: tt, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), n);
    let tcnt = 0;
    for (let k = 0; k < n * 2 && tcnt < n; k++) {
      const s = R() * tr.length, i = tr.idx(s);
      if (tr.inPitStraight(s)) continue;
      const side = R() < 0.5 ? -1 : 1;
      const lim = side > 0 ? tr.limR[i] : tr.limL[i];
      const grav = side > 0 ? tr.gravelR[i] : tr.gravelL[i];
      const kerb = side > 0 ? tr.kerbR[i] : tr.kerbL[i];
      const from = HALF_W + (kerb ? 5 : 1.2);
      const lat = side * (from + R() * Math.max(0.5, (grav ? 3 : lim) - from - 0.6));
      if (Math.abs(lat) > lim - 0.5) continue;
      const [x, z] = tr.posAt(s, lat);
      P.set(x, 0, z); Q.setFromAxisAngle(Y, R() * 6.28); S.setScalar(0.7 + R() * 0.8);
      M.compose(P, Q, S); tufts.setMatrixAt(tcnt, M); tcnt++;
    }
    tufts.count = tcnt;
    G.add(tufts);
  }
  // alpha-tested shadows so the impostors cast tree-shaped shadows, not rectangles
  for (const m of [trunks, pines]) { m.castShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.material.map, alphaTest: 0.45 }); }
  G.add(trunks, pines, bushes);
}

// ------------------------------------------------------------------ city
function buildCity(tr, df, lampsOn, R) {
  const G = tr.group;
  const styles = [0, 1, 2, 3].map((s) => windowTex(s));
  const lists = [[], [], [], []];
  const box = (x, z, w, d, h, rot) => {
    const g = new THREE.BoxGeometry(w, h, d);
    // scale UVs so windows keep their size: one texture tile = 8 m wide, 4 floors (12 m)
    const uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
      const sw = ay > 0.5 ? 0 : ax > 0.5 ? d : w;
      uv.setXY(i, uv.getX(i) * sw / 8, uv.getY(i) * (ay > 0.5 ? 0 : h / 12));
    }
    g.rotateY(rot); g.translate(x, h / 2, z);
    return g.toNonIndexed();
  };
  const cell = 52;
  const ext = 1250;
  for (let gx = -ext; gx <= ext; gx += cell) {
    for (let gz = -ext; gz <= ext; gz += cell) {
      const x = df.cx + gx + (R() - 0.5) * 10, z = df.cz + gz + (R() - 0.5) * 10;
      const d = df.at(x, z);
      if (d < 34 || tr.seaAt(x, z) > -30) continue;
      // keep the pit/grandstand side of the main straight open
      const loc = {}; if (d < 90) { tr.locate(x, z, -1, loc); if (tr.inPitStraight(loc.s)) continue; }
      const w = 26 + R() * 18, dd = 26 + R() * 18;
      const near = 1 - Math.min(1, d / 600);
      const h = Math.max(9, (14 + R() * 40 + R() * R() * 140 * (0.4 + near)) * (tr.def.cityH ?? 1)); // Monaco is mid-rise, Singapore towers
      lists[(R() * 4) | 0].push(box(x, z, w, dd, h, 0));
    }
  }
  // distant skyline ring
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * Math.PI * 2 + R() * 0.05, r = 1700 + R() * 600;
    const x = df.cx + Math.cos(a) * r, z = df.cz + Math.sin(a) * r;
    if (tr.seaAt(x, z) > -30) continue;
    lists[(R() * 4) | 0].push(box(x, z, 60 + R() * 60, 60 + R() * 60, (60 + R() * 260) * Math.max(0.35, tr.def.cityH ?? 1), a));
  }
  lists.forEach((l, i) => {
    if (!l.length) return;
    const [map, emi] = styles[i];
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 0.03 + lampsOn * 0.55, roughness: 0.6, metalness: i === 3 ? 0.4 : 0.1 });
    const mesh = new THREE.Mesh(mergeGeometries(l), mat);
    mesh.castShadow = false; mesh.receiveShadow = true;
    G.add(mesh);
  });
  // neon signs facing the track
  const words = [['GRAND', '#ff3fb4'], ['NOVA', '#3ff6ff'], ['LUMEN', '#ffd23f'], ['ROYAL', '#9b5cff'], ['PULSE', '#39ff88'], ['CASINO', '#ff5a3f']];
  for (let s = 60, k = 0; s < tr.length; s += 210, k++) {
    if (tr.inPitStraight(s)) continue;
    const i = tr.idx(s);
    const side = k % 2 ? 1 : -1;
    const lat = side * ((side > 0 ? tr.limR[i] : tr.limL[i]) + 18);
    const [word, col] = words[k % words.length];
    const t = neonTex(word, col);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.6 + lampsOn * 2.4, transparent: false }));
    const g = new THREE.Group(); sign.position.y = 11; g.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), new THREE.MeshStandardMaterial({ color: 0x222 })); post.position.y = 4.5; g.add(post);
    tr.place(g, s, lat, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // ferris wheel near the first corner
  {
    const wheel = new THREE.Group();
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xff4fd8, emissiveIntensity: 0.1 + lampsOn * 2.2, roughness: 0.4 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(38, 0.8, 8, 64), rimMat); rim.position.y = 46; wheel.add(rim);
    for (let k = 0; k < 16; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 76, 0.4), new THREE.MeshStandardMaterial({ color: 0xbbbbbb }));
      sp.position.y = 46; sp.rotation.z = (k / 16) * Math.PI; wheel.add(sp);
      const a = (k / 16) * Math.PI * 2;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0x223, emissive: [0x3ff6ff, 0xffd23f, 0xff3fb4][k % 3], emissiveIntensity: 0.2 + lampsOn * 1.8 }));
      cab.position.set(Math.cos(a) * 38, 46 + Math.sin(a) * 38, 0); wheel.add(cab);
    }
    for (const x of [-6, 6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 50, 1.5), new THREE.MeshStandardMaterial({ color: 0x999999 })); leg.position.set(0, 23, x); leg.rotation.x = x > 0 ? -0.12 : 0.12; wheel.add(leg); }
    const sF = (tr.mainStraight[1] + 120) % tr.length;
    const iF = tr.idx(sF);
    tr.place(wheel, sF, -(tr.limL[iF] + 80), 0, Math.PI / 2);
  }
}
