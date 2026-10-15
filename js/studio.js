// Studio showroom: the 2026 car model under the studio set-up of f1-studio.html (soft box, red rim light,
// cool side light, mirror floor with a darkening veil, contact shadow) and its livery switcher. Liveries are
// fictional; the original one is the model's own paint with the real-world logos painted out.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildCar, carModelReady } from './models.js';

const LIVERIES = [
  { name: 'F1 2026', orig: true, num: 26, p: '#003572', s: '#ff6b00', a: '#ffdb96', meta: 'Originallackierung des Modells' },
  { name: 'Rosso Vento', num: 7, p: '#c4101c', s: '#f3f3f1', a: '#151517', meta: 'Eigene Lackierung · Hauptsponsor NOVALINE' },
  { name: 'Glacier GP', num: 21, p: '#eef2f6', s: '#0e2b4c', a: '#2ec4f0', meta: 'Eigene Lackierung · Hauptsponsor ARCTIQ' },
  { name: 'Ember Racing', num: 44, p: '#16171a', s: '#ff6a13', a: '#ffd23f', meta: 'Eigene Lackierung · Hauptsponsor VOLTEK' },
];
const RIM = ['#ff5a1a', '#ff2436', '#3fb8ff', '#ff7a1a'];
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- renderer, quality tiers
const canvas = $('studio');
const isMobile = matchMedia('(pointer:coarse)').matches;
const TIERS = [
  { name: 'Niedrig', pr: 1, shadow: 1024, refl: 0.35 },
  { name: 'Mittel', pr: 1.5, shadow: 1024, refl: 0.5 },
  { name: 'Hoch', pr: 2, shadow: 2048, refl: 0.5 },
];
let tier = isMobile ? 1 : 2;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0d11');
scene.fog = new THREE.Fog('#0b0d11', 14, 30);

// studio environment for the reflections: soft box above, red strip, cool side light, low fill
const pmrem = new THREE.PMREMGenerator(renderer);
{
  const env = new THREE.Scene(); env.background = new THREE.Color('#040405');
  const box = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); env.add(m);
  };
  box(14, 5, '#ffffff', 5.5, [0, 9, 0], [0, 0, 0]);
  box(2.5, 9, '#ff2638', 4.0, [-9, 2.5, 4], [0, 0.5, 0]);
  box(3, 10, '#e4ecff', 4.5, [6, 3, -9], [0, 0.5, 0]);
  box(16, 1.2, '#ffffff', 1.4, [9, 1.4, 6], [0, 0.5, 0]);
  box(30, 30, '#16181d', 1, [0, -0.5, 0], [0, 1, 0]);
  scene.environment = pmrem.fromScene(env, 0.015).texture;
}

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const HOME = new THREE.Vector3(5.3, 3.1, 4.6), PORTRAIT_HOME = new THREE.Vector3(8.2, 5.0, 7.2);
const homePos = () => (innerWidth / innerHeight < 0.8 ? PORTRAIT_HOME : HOME);
camera.position.copy(homePos());
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.15, 0.35, 0);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.minDistance = 3.2; controls.maxDistance = 17;
controls.maxPolarAngle = Math.PI / 2 - 0.06;
controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.autoRotateSpeed = 0.55;
controls.enablePan = false;

// ---------------------------------------------------------------- lights
const key = new THREE.DirectionalLight('#ffffff', 2.4);
key.position.set(1.5, 9, 2.5); key.castShadow = true;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 6;
scene.add(key);
const rim = new THREE.SpotLight('#ff2436', 260, 22, 0.55, 0.9, 2);
rim.position.set(-6.5, 2.2, 3.5); rim.target.position.set(0, 0.3, 0); scene.add(rim, rim.target);
const cool = new THREE.SpotLight('#dfe9ff', 220, 26, 0.6, 1, 2);
cool.position.set(3, 6, -8); cool.target.position.set(0, 0.2, 0); scene.add(cool, cool.target);
scene.add(new THREE.HemisphereLight('#c9d3e6', '#1a0d10', 0.15));
{ // bright soft-box strip in the background
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, color: '#e9edf5' }));
  m.position.set(4, 9, -17); scene.add(m);
}

// ---------------------------------------------------------------- floor: mirror + darkening veil + contact shadow
const mirror = new Reflector(new THREE.PlaneGeometry(60, 60), { textureWidth: 512, textureHeight: 512, color: 0x50535a });
mirror.rotation.x = -Math.PI / 2; scene.add(mirror);
function radialTex(stops, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const veil = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({
  color: '#07080a', roughness: 0.75, metalness: 0, transparent: true, depthWrite: false,
  alphaMap: radialTex([[0, '#b0b0b0'], [0.2, '#c4c4c4'], [0.6, '#f2f2f2'], [1, '#ffffff']]),
}));
veil.rotation.x = -Math.PI / 2; veil.position.y = 0.002; veil.receiveShadow = true; scene.add(veil);
{
  const t = radialTex([[0, 'rgba(0,0,0,.85)'], [0.45, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']], 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0.2, 0.004, 0); m.renderOrder = 2; scene.add(m);
}

// ---------------------------------------------------------------- car and livery switcher
// the game builds the car nose to -z at its real size; the studio frames it nose to +x at 5.6 m
const stand = new THREE.Group(); stand.rotation.y = -Math.PI / 2; scene.add(stand);
let car = null, current = 0;
function setLivery(i) {
  current = i;
  const L = LIVERIES[i];
  if (car) stand.remove(car);
  car = buildCar({ id: 'custom', name: L.name, body: parseInt(L.p.slice(1), 16), top: parseInt(L.s.slice(1), 16), low: 0x16171b, accent: parseInt(L.a.slice(1), 16), pattern: 'plain' }, false, L.num, { origLivery: !!L.orig });
  car.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  for (const o of car.children) if (o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.transparent) o.visible = false; // the game's own contact shadow
  const box = new THREE.Box3().setFromObject(car), len = box.max.z - box.min.z;
  stand.scale.setScalar(5.6 / len);
  stand.position.set(((box.max.z + box.min.z) / 2) * (5.6 / len), 0, 0);
  stand.add(car);
  rim.color.set(RIM[i]);
  $('tname').innerHTML = '<span></span>'; $('tname').firstChild.textContent = L.name;
  $('tmeta').textContent = `Saison 2026 · Nr. ${L.num} · ${L.meta}`;
  document.documentElement.style.setProperty('--acc', L.orig ? L.s : L.p === '#eef2f6' ? L.a : L.p === '#16171a' ? L.s : L.p);
  for (const b of $('teams').children) b.setAttribute('aria-pressed', String(+b.dataset.i === i));
  try { localStorage.setItem('apexgp-studio-livery', String(i)); } catch (e) { /* private mode */ }
}
LIVERIES.forEach((L, i) => {
  const b = document.createElement('button');
  b.dataset.i = i;
  b.setAttribute('aria-label', `Lackierung ${L.name}`);
  b.innerHTML = `<i style="background:conic-gradient(${L.p} 0 50%, ${L.s} 50% 100%)"></i>${L.name}`;
  b.addEventListener('click', () => setLivery(i));
  $('teams').appendChild(b);
});
$('spin').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; $('spin').setAttribute('aria-pressed', String(controls.autoRotate)); });
$('spin').setAttribute('aria-pressed', String(controls.autoRotate));
$('reset').addEventListener('click', () => { camera.position.copy(homePos()); controls.target.set(0.15, 0.35, 0); controls.update(); });

// ---------------------------------------------------------------- quality and size
function applyTier() {
  const T = TIERS[tier];
  renderer.setPixelRatio(Math.min(T.pr, devicePixelRatio, isMobile ? 1.75 : 2));
  key.shadow.mapSize.set(T.shadow, T.shadow);
  if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  $('tier').textContent = 'Grafik: ' + T.name;
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 46 : 32;
  camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio(), k = TIERS[tier].refl;
  mirror.getRenderTarget().setSize(Math.floor(w * pr * k), Math.floor(h * pr * k));
}
addEventListener('resize', resize);
// frame-rate watch: one step down when a device can't hold ~42 fps, one try up if it runs easily
let frames = 0, acc = 0, last = performance.now(), settled = false, upTried = false;
function watch(dt) {
  acc += dt; frames++;
  if (acc < 2) return;
  const fps = frames / acc; acc = 0; frames = 0;
  if (fps < 42 && tier > 0) { tier--; applyTier(); resize(); }
  else if (!settled && !upTried && fps > 58 && tier < TIERS.length - 1) { upTried = true; tier++; applyTier(); resize(); }
  else settled = true;
}

applyTier(); resize();
let start = 0;
try { start = Math.max(0, Math.min(LIVERIES.length - 1, parseInt(localStorage.getItem('apexgp-studio-livery') || '0', 10) || 0)); } catch (e) { /* private mode */ }
await carModelReady;
setLivery(start);
$('load').classList.add('gone');
window.__studio = { renderer, scene, camera, controls, setLivery, setTier: (t) => { tier = t; applyTier(); resize(); } };
renderer.setAnimationLoop(() => {
  const now = performance.now(); watch((now - last) / 1000); last = now;
  controls.update();
  renderer.render(scene, camera);
});
