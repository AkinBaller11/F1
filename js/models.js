// Low-poly F1 car models + first-person cockpit
import * as THREE from 'three';
import * as TX from './textures.js';

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

// frustum "box" along -z: rear section (w0,h0,y0) at z=0, front section (w1,h1,y1) at z=-len
function taper(w0, h0, y0, w1, h1, y1, len) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const back = z > 0;
    const w = back ? w0 : w1, h = back ? h0 : h1, yo = back ? y0 : y1;
    p.setXYZ(i, x * w, yo + (y + 0.5) * h, back ? 0 : -len);
  }
  g.computeVertexNormals();
  return g;
}

const geoCache = {};
function wheelGeo(r, w) {
  const k = r + '_' + w;
  if (!geoCache[k]) {
    const g = new THREE.CylinderGeometry(r, r, w, 24, 1);
    g.rotateZ(Math.PI / 2);
    geoCache[k] = g;
  }
  return geoCache[k];
}

let tyreMats = null;
function getTyreMats(wet) {
  if (!tyreMats) {
    const side = TX.tyreSide(wet ? '#2fbf3a' : '#e8242b');
    const tread = TX.tyreTread();
    tyreMats = [
      new THREE.MeshStandardMaterial({ map: tread, roughness: 0.9, color: 0x888888 }),
      new THREE.MeshStandardMaterial({ map: side, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: side, roughness: 0.8 }),
    ];
  }
  return tyreMats;
}

export function makeWheel(r, w, wet) {
  const m = new THREE.Mesh(wheelGeo(r, w), getTyreMats(wet));
  m.castShadow = true;
  return m;
}

export function buildCar(team, wet, number = 0) {
  const car = new THREE.Group();
  const mBody = new THREE.MeshStandardMaterial({ color: team.body, roughness: 0.35, metalness: 0.25 });
  const mTop = new THREE.MeshStandardMaterial({ color: team.top, roughness: 0.35, metalness: 0.25 });
  const mLow = new THREE.MeshStandardMaterial({ color: team.low, roughness: 0.5, metalness: 0.2 });
  const mAcc = new THREE.MeshStandardMaterial({ color: team.accent, roughness: 0.4 });
  const mCarbon = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.3 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; car.add(m); return m;
  };
  // floor
  add(new THREE.BoxGeometry(1.5, 0.05, 3.6), mCarbon, 0, 0.1, 0.3);
  // nose + front of tub
  add(taper(0.62, 0.42, 0.28, 0.2, 0.16, 0.2, 1.9), mBody, 0, 0, -0.75);
  add(taper(0.6, 0.08, 0.69, 0.18, 0.04, 0.37, 1.9), mTop, 0, 0, -0.75);
  // cockpit tub
  add(taper(0.7, 0.5, 0.2, 0.62, 0.48, 0.28, 1.1), mBody, 0, 0, 0.35);
  add(taper(0.7, 0.06, 0.7, 0.62, 0.06, 0.74, 1.1), mTop, 0, 0, 0.35);
  // sidepods
  for (const s of [-1, 1]) {
    add(taper(0.25, 0.3, 0.14, 0.5, 0.45, 0.16, 1.9), mBody, s * 0.62, 0, 1.55);
    add(taper(0.25, 0.05, 0.44, 0.5, 0.05, 0.6, 1.9), mTop, s * 0.62, 0, 1.55);
    add(new THREE.BoxGeometry(0.42, 0.3, 0.04), mCarbon, s * 0.64, 0.4, -0.36); // inlet
  }
  // engine cover
  add(taper(0.3, 0.32, 0.25, 0.66, 0.7, 0.2, 2.0), mLow, 0, 0, 2.35);
  add(taper(0.04, 0.3, 0.55, 0.04, 0.36, 0.84, 1.6), mTop, 0, 0, 2.3); // shark fin
  // airbox / roll hoop
  add(taper(0.28, 0.3, 0.75, 0.3, 0.36, 0.72, 0.45), mTop, 0, 0, 0.75);
  add(new THREE.BoxGeometry(0.16, 0.12, 0.05), mCarbon, 0, 0.98, 0.31);
  // front wing
  add(new THREE.BoxGeometry(1.95, 0.035, 0.45), mCarbon, 0, 0.1, -2.55);
  add(new THREE.BoxGeometry(1.8, 0.03, 0.2), mAcc, 0, 0.17, -2.42).rotation.x = -0.35;
  add(new THREE.BoxGeometry(1.7, 0.03, 0.15), mBody, 0, 0.24, -2.33).rotation.x = -0.5;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.28, 0.6), mBody, s * 0.98, 0.2, -2.5);
  // rear wing
  add(new THREE.BoxGeometry(1.0, 0.04, 0.36), mCarbon, 0, 0.92, 2.6);
  add(new THREE.BoxGeometry(1.0, 0.03, 0.18), mAcc, 0, 1.03, 2.68).rotation.x = 0.4;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.7, 0.6), mBody, s * 0.51, 0.72, 2.6);
  add(new THREE.BoxGeometry(0.9, 0.03, 0.18), mCarbon, 0, 0.38, 2.55); // beam wing
  add(new THREE.BoxGeometry(0.06, 0.5, 0.06), mCarbon, 0, 0.6, 2.5);
  // diffuser
  add(new THREE.BoxGeometry(1.0, 0.18, 0.3), mCarbon, 0, 0.18, 2.35).rotation.x = -0.35;
  // rain light
  const rl = add(new THREE.BoxGeometry(0.14, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0x330000 }), 0, 0.33, 2.67);
  car.userData.rainLight = rl;
  // halo
  const halo = new THREE.Mesh(haloGeo(0.022, 1), mCarbon); halo.castShadow = true;
  car.add(halo);
  // helmet
  add(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({ color: team.accent, roughness: 0.3 }), 0, 0.82, 0.1);
  // number on nose
  if (number) {
    const nt = TX.liveryText(String(number), hex(team.top), team.top === 0xf2f2f2 || team.top === 0xf0f0f0 ? '#111' : '#fff', 128, 64, 48);
    const np = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshBasicMaterial({ map: nt }));
    np.rotation.x = -Math.PI / 2 + 0.17; np.position.set(0, 0.5, -1.95);
    car.add(np);
  }
  // wheels
  const wheels = [];
  const wpos = [[-0.82, 0.36, -1.75, 0.38], [0.82, 0.36, -1.75, 0.38], [-0.8, 0.37, 1.85, 0.44], [0.8, 0.37, 1.85, 0.44]];
  for (const [x, y, z, w] of wpos) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    const wh = makeWheel(y, w, wet); pivot.add(wh);
    car.add(pivot);
    wheels.push({ pivot, wheel: wh, front: z < 0 });
  }
  // suspension arms
  for (const s of [-1, 1]) for (const [z, dz] of [[-1.75, 0.2], [1.85, -0.2]]) {
    for (const y of [0.3, 0.45]) {
      const a = add(new THREE.BoxGeometry(0.62, 0.025, 0.04), mCarbon, s * 0.45, y, z + dz * 0.3);
      a.rotation.z = s * (y > 0.4 ? -0.15 : 0.05);
    }
  }
  car.userData.wheels = wheels;
  return car;
}

// Halo tube: ring around the driver's head opening at the rear + centre pillar
export function haloGeo(r, scale = 1, seg = 64) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI * 0.82 + (i / 24) * Math.PI * 1.64;
    const front = Math.cos(a); // 1 at front
    const x = Math.sin(a) * 0.43;
    const z = -0.05 - front * 0.5;
    const y = 0.72 + 0.31 * Math.pow(Math.max(0, (front + 0.75) / 1.75), 0.6);
    pts.push(new THREE.Vector3(x * scale, y, z * scale + 0.0));
  }
  const ring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 10, false);
  const pillar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.03, -0.55), new THREE.Vector3(0, 0.95, -0.7), new THREE.Vector3(0, 0.74, -0.9),
  ]), 12, r * 0.85, 10, false);
  const merged = mergeGeos([ring, pillar]);
  return merged;
}

function mergeGeos(geos) {
  let total = 0, itotal = 0;
  for (const g of geos) { total += g.attributes.position.count; itotal += g.index.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const idx = new Uint32Array(itotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const ia = g.index.array;
    for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
    vo += g.attributes.position.count; io += ia.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Detailed first-person cockpit, in car space (eye ~ (0, 0.92, 0.12))
export function buildCockpit(team, wet, mirrorTex) {
  const g = new THREE.Group();
  const mBody = new THREE.MeshStandardMaterial({ color: team.body, roughness: 0.3, metalness: 0.2 });
  const mTop = new THREE.MeshStandardMaterial({ color: team.top, roughness: 0.3, metalness: 0.15 });
  const mCarbon = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.45, metalness: 0.35 });
  const mPad = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.9 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

  // chassis ahead of the driver
  add(taper(0.74, 0.46, 0.26, 0.2, 0.16, 0.2, 2.4), mBody, 0, 0, -0.3);
  add(taper(0.72, 0.07, 0.7, 0.18, 0.05, 0.37, 2.4), mTop, 0, 0, -0.3);
  // cockpit rim sides
  for (const s of [-1, 1]) {
    add(taper(0.3, 0.42, 0.2, 0.3, 0.44, 0.2, 1.3), mBody, s * 0.5, 0, 0.95);
    add(taper(0.3, 0.05, 0.62, 0.3, 0.05, 0.64, 1.3), mBody, s * 0.5, 0, 0.95);
  }
  // sidepods
  for (const s of [-1, 1]) {
    add(taper(0.55, 0.38, 0.16, 0.55, 0.4, 0.16, 1.5), mBody, s * 0.78, 0, 0.6);
    add(taper(0.55, 0.06, 0.54, 0.55, 0.06, 0.56, 1.5), mBody, s * 0.78, 0, 0.6);
    add(new THREE.BoxGeometry(0.5, 0.3, 0.03), mCarbon, s * 0.78, 0.38, -0.91);
  }
  // sponsor decals on top of the chassis
  const deco = TX.liveryText('KRONOS', hex(team.top), team.top === 0xf2f2f2 || team.top === 0xf0f0f0 ? '#d40000' : '#ffffff', 512, 128, 72);
  const dp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshBasicMaterial({ map: deco, transparent: false }));
  dp.rotation.x = -Math.PI / 2 + 0.13; dp.position.set(0, 0.742, -0.85);
  g.add(dp);
  // halo
  const halo = new THREE.Mesh(haloGeo(0.03, 1, 96), mCarbon);
  g.add(halo);
  // steering wheel with display
  const sw = new THREE.Group();
  sw.position.set(0, 0.66, -0.12); sw.rotation.x = -0.6; sw.scale.setScalar(0.85);
  const wheelBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), mCarbon);
  sw.add(wheelBody);
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), mPad);
    grip.position.set(s * 0.17, 0, 0); sw.add(grip);
  }
  const dispCanvas = document.createElement('canvas'); dispCanvas.width = 256; dispCanvas.height = 96;
  const dispTex = new THREE.CanvasTexture(dispCanvas);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.045), new THREE.MeshBasicMaterial({ map: dispTex }));
  disp.position.set(0, 0.015, 0.027); sw.add(disp);
  const revCanvas = document.createElement('canvas'); revCanvas.width = 256; revCanvas.height = 16;
  const revTex = new THREE.CanvasTexture(revCanvas);
  const rev = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.012), new THREE.MeshBasicMaterial({ map: revTex }));
  rev.position.set(0, 0.06, 0.027); sw.add(rev);
  g.add(sw);
  g.userData.steering = sw;
  g.userData.display = { canvas: dispCanvas, tex: dispTex, rev: revCanvas, revTex };

  // mirrors (rear view render texture, left half / right half)
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.03), mCarbon);
    stalk.position.set(s * 0.86, 0.6, -0.72); g.add(stalk);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.06), mBody);
    housing.position.set(s * 0.86, 0.69, -0.76); g.add(housing);
    const geo = new THREE.PlaneGeometry(0.22, 0.08);
    const uv = geo.attributes.uv;
    // left mirror shows left half of the rear image, mirrored
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      uv.setX(i, s < 0 ? (1 - u) * 0.5 + 0.5 : (1 - u) * 0.5);
    }
    const glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mirrorTex }));
    glass.position.set(s * 0.86, 0.69, -0.728); glass.rotation.y = s * -0.12;
    g.add(glass);
  }
  // front suspension arms (visible from cockpit)
  for (const s of [-1, 1]) {
    for (const [y, dz] of [[0.42, -1.62], [0.3, -1.85]]) {
      const len = 0.62;
      const a = new THREE.Mesh(new THREE.BoxGeometry(len, 0.025, 0.05), mCarbon);
      a.position.set(s * 0.5, y, dz); a.rotation.z = s * (y > 0.4 ? -0.1 : 0.05);
      g.add(a);
    }
  }
  // front wheels
  const wheels = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.88, 0.36, -1.78);
    const wh = makeWheel(0.36, 0.38, wet); pivot.add(wh); g.add(pivot);
    wheels.push({ pivot, wheel: wh, front: true });
  }
  g.userData.wheels = wheels;
  return g;
}
