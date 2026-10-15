// Studio showroom: the game's car model (models.js) under a product-shot light rig. Fictional teams only.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildCar, setTyreLook } from './models.js';

// invented teams, colours and partner brands (no real teams, logos or sponsors)
export const STUDIO_TEAMS = [
  { name: 'Carmine Veloce', body: 0xa8001a, top: 0xa8001a, low: 0x141518, accent: 0xd8b35f, pattern: 'racing', number: 28, tyre: 'S', sponsor: 'VELMARE', partners: ['ORVENTA', 'LUMIQ', 'VELMARE'], base: 'Maranello-Süd (fiktiv)' },
  { name: 'Aurelion GP', body: 0x0d5b61, top: 0xeef1f3, low: 0x111316, accent: 0xc77d3a, pattern: 'split', number: 7, tyre: 'M', sponsor: 'HALVEX', partners: ['QUORVIA', 'TESSALT', 'HALVEX'], base: 'Kopenhagen (fiktiv)' },
  { name: 'Kestrel Dynamics', body: 0x0f1c3f, top: 0x0f1c3f, low: 0x0a0f22, accent: 0xff6a13, pattern: 'chevron', number: 22, tyre: 'H', sponsor: 'ZEPHRA', partners: ['VANTOR', 'KYRIX', 'ZEPHRA'], base: 'Oxfordshire (fiktiv)' },
  { name: 'Valkyr Motorsport', body: 0x3a1468, top: 0x111214, low: 0x111214, accent: 0x9be22d, pattern: 'fade', number: 9, tyre: 'S', sponsor: 'NYXTEL', partners: ['OBSIDIA', 'FERRUM9', 'NYXTEL'], base: 'Tallinn (fiktiv)' },
  { name: 'Heliant Austral', body: 0xff9f1c, top: 0xfaf7f0, low: 0x18181b, accent: 0x1f5bd8, pattern: 'stripe', number: 33, tyre: 'M', sponsor: 'HELIANT', partners: ['SOLVERA', 'MAROQ', 'HELIANT'], base: 'Perth (fiktiv)' },
  { name: 'Nordwind Racing', body: 0xc9d1d9, top: 0x1b2026, low: 0x0e1114, accent: 0x29b6f6, pattern: 'racing', number: 51, tyre: 'H', sponsor: 'FJORDA', partners: ['ISBRE', 'POLARIQ', 'FJORDA'], base: 'Bergen (fiktiv)' },
];

// quality tiers: render resolution, shadow map, reflection resolution and blur taps
const TIERS = [
  { name: 'Niedrig', pr: 1, shadow: 1024, refl: 0.25, taps: 2 },
  { name: 'Mittel', pr: 1.5, shadow: 2048, refl: 0.35, taps: 2 },
  { name: 'Hoch', pr: 2, shadow: 2048, refl: 0.5, taps: 3 },
];
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820;
let tier = mobile ? 1 : 2;

const canvas = document.getElementById('studio');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// r160: physically based light units are the default (useLegacyLights = false replaces physicallyCorrectLights)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// backdrop: near black, lifting softly towards the lit studio wall at the top right
{
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const g = c.getContext('2d'), gr = g.createRadialGradient(470, -20, 10, 470, -20, 520);
  gr.addColorStop(0, '#3a3f49'); gr.addColorStop(0.35, '#15171c'); gr.addColorStop(1, '#030405');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0x030405, 8, 20); // the studio falls off into darkness
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(28, 1, 0.3, 120);
camera.position.set(5.0, 4.5, -5.3);
const BASE_DIST = Math.hypot(5.0 - 0.05, 4.5 - 0.35, -5.3 + 0.05); // the 16:9 framing (distance to the target)
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.05, 0.35, -0.05);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 4.6; controls.maxDistance = 12;
controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.42; // never below the floor
controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
controls.rotateSpeed = 0.5;
controls.addEventListener('start', () => { controls.autoRotate = false; });

// ---------------------------------------------------------------- lights
RectAreaLightUniformsLib.init();
// large soft box overhead
const soft = new THREE.RectAreaLight(0xffffff, 5.5, 7, 3.6);
soft.position.set(0, 6.5, 0); soft.lookAt(0, 0, 0); scene.add(soft);
// the shadow from the soft box: a directional light from almost straight above
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(1.2, 9, -1.2); sun.target.position.set(0, 0, 0);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
// red rim light from behind on the left
const rim = new THREE.SpotLight(0xff1608, 60, 22, 0.26, 0.8, 2);
rim.position.set(-3.5, 2.6, 8); rim.target.position.set(0.2, 0.5, 1.6); scene.add(rim, rim.target);
const rimPanel = new THREE.RectAreaLight(0xff2010, 6, 5, 1.2);
rimPanel.position.set(-6.5, 1.6, 6.8); rimPanel.lookAt(0, 0.4, 0); scene.add(rimPanel);
// cool white light from above on the right
const cool = new THREE.RectAreaLight(0xdfe8ff, 4.5, 4, 4);
cool.position.set(6.5, 5.5, -2.5); cool.lookAt(0, 0.3, 0); scene.add(cool);
const coolSpot = new THREE.SpotLight(0xe6eeff, 1800, 34, 0.6, 1, 2);
coolSpot.position.set(-3, 10, -1); coolSpot.target.position.set(-4.5, 0, 1.8); scene.add(coolSpot, coolSpot.target);

// ---------------------------------------------------------------- floor: blurred mirror under a dark, rough lit floor
const BlurReflect = {
  uniforms: { color: { value: new THREE.Color(0x010102) }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: 0.32 }, blur: { value: 0.0045 } },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vPos;
    void main() { vUv = textureMatrix * vec4(position, 1.0); vPos = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float strength; uniform float blur;
    varying vec4 vUv; varying vec3 vPos;
    void main() {
      vec2 uv = vUv.xy / vUv.w; vec3 acc = vec3(0.0); float ws = 0.0;
      // the further the floor point is below the car, the softer: a rough floor blurs with distance
      float b = blur * (0.6 + 0.25 * length(vPos.xz));
      for (int i = -TAPS; i <= TAPS; i++) for (int j = -TAPS; j <= TAPS; j++) {
        float w = exp(-float(i * i + j * j) / float(TAPS * TAPS + 1));
        acc += texture2D(tDiffuse, uv + vec2(float(i), float(j)) * b).rgb * w; ws += w;
      }
      float fade = smoothstep(14.0, 2.5, length(vPos.xz));
      gl_FragColor = vec4(color + acc / ws * strength * fade, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
let mirror = null;
function makeMirror() {
  if (mirror) { scene.remove(mirror); mirror.getRenderTarget().dispose(); }
  const T = TIERS[tier], pr = Math.min(T.pr, devicePixelRatio);
  mirror = new Reflector(new THREE.PlaneGeometry(240, 240), {
    shader: { ...BlurReflect, fragmentShader: BlurReflect.fragmentShader.replace(/TAPS/g, String(T.taps)) }, // Reflector ignores defines
    textureWidth: Math.round(innerWidth * pr * T.refl), textureHeight: Math.round(innerHeight * pr * T.refl),
    clipBias: 0.003, color: 0x010102, // Reflector writes this into the shader's base colour (default mid grey)
  });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.02; // a clear gap to the lit floor above it (no depth fighting far away) mirror.renderOrder = -2;
  scene.add(mirror);
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.5, metalness: 0, transparent: true, opacity: 0.84, envMapIntensity: 0.08, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.renderOrder = -1;
scene.add(floor);

// ---------------------------------------------------------------- car
let car = null, current = 0;
const $ = (id) => document.getElementById(id);
function showTeam(i) {
  current = i;
  const T = STUDIO_TEAMS[i];
  // the body geometry is shared between builds (models.js caches it), so the old car is only removed
  if (car) scene.remove(car);
  car = buildCar({ id: 'custom', ...T }, false, T.number, { conform: true });
  setTyreLook(car, T.tyre);
  car.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    const m = o.material;
    if (!m || !('envMapIntensity' in m)) return;
    if (m.map && m.normalMap && m.clearcoat !== undefined) {
      // carbon weave: half-matt lacquer, the studio shouldn't mirror in it like in paint
      m.envMapIntensity = 0.35; m.clearcoat = 0.45; m.clearcoatRoughness = 0.32; m.roughness = 0.5;
    } else m.envMapIntensity = m.metalness > 0.5 ? 0.9 : 0.6;
  });
  const paint = car.userData.parts.livery.material; paint.clearcoat = 1; paint.clearcoatRoughness = 0.05; paint.metalness = 0.12; paint.roughness = 0.3;
  if (car.userData.flap) car.userData.flap.rotation.x = -0.65;
  scene.add(car);
  $('tname').textContent = T.name;
  $('tmeta').textContent = `#${T.number} · Hauptsponsor ${T.sponsor} · ${T.base}`;
  for (const b of $('teams').children) b.setAttribute('aria-pressed', String(+b.dataset.i === i));
}
STUDIO_TEAMS.forEach((T, i) => {
  const b = document.createElement('button');
  b.dataset.i = i; b.innerHTML = `<i style="background:#${T.body.toString(16).padStart(6, '0')}"></i>${T.name}`;
  b.addEventListener('click', () => showTeam(i));
  $('teams').appendChild(b);
});

// ---------------------------------------------------------------- quality and size
function applyTier() {
  const T = TIERS[tier];
  renderer.setPixelRatio(Math.min(T.pr, devicePixelRatio));
  sun.shadow.mapSize.set(T.shadow, T.shadow);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  makeMirror();
  $('tier').textContent = 'Grafik: ' + T.name;
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the car's full length in frame on any screen: a slightly wider lens on narrow screens and the
  // camera pulled back so the horizontal coverage matches the 16:9 framing; zoom limits and the fog follow
  const asp = w / h, fov = asp < 1 ? 38 : 28;
  camera.fov = fov; camera.updateProjectionMatrix();
  // (the 16:9 framing leaves wide margins; on narrow screens the car may fill ~85 % of the width)
  const fit = Math.max(1, 0.72 * (1.78 * Math.tan((28 * Math.PI) / 360)) / (asp * Math.tan((fov * Math.PI) / 360)));
  const D = BASE_DIST * fit, off = camera.position.clone().sub(controls.target);
  camera.position.copy(controls.target).addScaledVector(off.normalize(), D);
  controls.minDistance = D * 0.62; controls.maxDistance = D * 1.5;
  scene.fog.near = D + 1; scene.fog.far = D + 13;
  if (mirror) { const T = TIERS[tier], pr = Math.min(T.pr, devicePixelRatio); mirror.getRenderTarget().setSize(Math.round(w * pr * T.refl), Math.round(h * pr * T.refl)); }
}
addEventListener('resize', resize);

// frame-rate watch: step down when a device can't keep ~45 fps, once back up if it runs easily at the top
let frames = 0, acc = 0, last = performance.now(), settled = false, upTried = false;
function watch(dt) {
  acc += dt; frames++;
  if (acc < 2) return;
  const fps = frames / acc; acc = 0; frames = 0;
  if (fps < 42 && tier > 0) { tier--; applyTier(); resize(); }
  else if (!settled && !upTried && fps > 58 && tier < TIERS.length - 1) { upTried = true; tier++; applyTier(); resize(); }
  else settled = true;
}

await document.fonts.load('italic 900 80px "Titillium Web"').catch(() => {});
applyTier();
resize();
showTeam(0);
window.__studio = { renderer, scene, camera, controls, showTeam, setTier: (t) => { tier = t; applyTier(); resize(); } };
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  controls.update();
  renderer.render(scene, camera);
  watch(dt);
});
