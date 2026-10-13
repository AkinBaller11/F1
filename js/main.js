import * as THREE from 'three';
import { Track, HALF_W } from './track.js';
import { TEAMS, buildCar, buildCockpit } from './models.js';
import { PlayerCar, AICar } from './physics.js';
import { HUD, fmtTime } from './hud.js';
import { Audio } from './audio.js';
import { Weather } from './weather.js';
import { Input, IS_TOUCH, ACTIONS, DEFAULT_BINDS, keyLabel } from './input.js';
import { Net, rng, clean } from './net.js';
import * as TX from './textures.js';
import { TRACKS, TIMES, trackById } from './tracks.js';
import { TOD, skyTexture, sunDir, sunSprite } from './tod.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (s) => document.querySelector(s);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ settings / menu
const DRIVERS = [];
TEAMS.forEach((t) => t.drivers.forEach((d, i) => DRIVERS.push({ team: t, name: d, number: t.numbers[i] })));

const defaults = {
  driver: 'HAMILTON', track: 'barcelona', tod: 'noon', laps: 5, weather: 'dynamic', difficulty: 75, grid: 8, camera: 'cockpit', quality: 'high',
  profile: 'normal', gearbox: 'auto', brakeAssist: true, autoGas: false, steerAssist: false, line: 'corners', steerSens: 100, binds: {},
  touchSteer: 'wheel', wheelSize: 'm', touchSide: 'right', mpName: '', mpAI: 4,
};
// assist profiles: one tap sets everything
const PROFILES = {
  easy: { autoGas: true, brakeAssist: true, steerAssist: true, line: 'full', gearbox: 'auto' },
  normal: { autoGas: false, brakeAssist: true, steerAssist: false, line: 'corners', gearbox: 'auto' },
  pro: { autoGas: false, brakeAssist: false, steerAssist: false, line: 'off', gearbox: 'manual' },
};
const PROFILE_KEYS = Object.keys(PROFILES.easy);
// friendlier defaults on phones / tablets
if (IS_TOUCH) Object.assign(defaults, { quality: 'medium', difficulty: 60, profile: 'easy', ...PROFILES.easy });
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem('apexgp25') || '{}')); } catch (e) { /* storage unavailable */ }
// the on-screen wheel replaced the joystick as default touch steering
if (!settings.wheelIntro) { if (settings.touchSteer === 'joystick') settings.touchSteer = 'wheel'; settings.wheelIntro = true; }
document.body.classList.toggle('touch', IS_TOUCH);
const save = () => { try { localStorage.setItem('apexgp25', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

function buildMenu() {
  const grid = $('#driver-grid');
  grid.innerHTML = DRIVERS.map((d) => `
    <button class="drv${d.name === settings.driver ? ' sel' : ''}" data-name="${d.name}" style="--tc:${hex(d.team.body === 0xf0f0f0 || d.team.body === 0x161616 ? d.team.accent : d.team.body)}">
      <span class="num">${d.number}</span><span class="nm">${d.name}</span><span class="tm">${d.team.name}</span>
    </button>`).join('');
  grid.querySelectorAll('.drv').forEach((b) => b.addEventListener('click', () => {
    settings.driver = b.dataset.name; save();
    grid.querySelectorAll('.drv').forEach((x) => x.classList.toggle('sel', x === b));
    updateLivery();
  }));
  // option selectors (the same key can appear on several screens)
  document.querySelectorAll('.opt').forEach((o) => {
    const key = o.dataset.key;
    const vals = JSON.parse(o.dataset.vals);
    const step = (d) => {
      let i = vals.indexOf(settings[key]); i = (i + d + vals.length) % vals.length; settings[key] = vals[i];
      if (PROFILE_KEYS.includes(key)) settings.profile = 'custom';
      save(); renderOpts(); onSettingChanged(key);
    };
    o.querySelector('.l').addEventListener('click', () => step(-1));
    o.querySelector('.r').addEventListener('click', () => step(1));
  });
  renderOpts();
  // profiles
  document.querySelectorAll('.prof').forEach((b) => b.addEventListener('click', () => {
    settings.profile = b.dataset.profile; Object.assign(settings, PROFILES[b.dataset.profile]); save(); renderOpts();
  }));
  const sens = $('#steer-sens');
  sens.value = settings.steerSens; $('#sens-val').textContent = settings.steerSens + '%';
  sens.addEventListener('input', () => { settings.steerSens = +sens.value; $('#sens-val').textContent = sens.value + '%'; save(); });
  $('#ctrl-reset').addEventListener('click', () => {
    Object.assign(settings, { profile: defaults.profile, steerSens: 100, binds: {}, wheelSize: 'm', touchSide: 'right', touchSteer: 'wheel' }, PROFILES[defaults.profile]);
    sens.value = 100; $('#sens-val').textContent = '100%';
    save(); renderOpts(); renderKeymap();
  });
  renderKeymap();
  const diff = $('#difficulty');
  diff.value = settings.difficulty; $('#diff-val').textContent = settings.difficulty;
  diff.addEventListener('input', () => { settings.difficulty = +diff.value; $('#diff-val').textContent = diff.value; save(); });
  updateLivery();
}

// small outline of the selected circuit for the setup screen
function drawTrackPreview() {
  const cv = $('#track-preview');
  if (!cv) return;
  const def = trackById(settings.track);
  const pts = [];
  if (def.poly) for (const p of def.poly) pts.push(p); else for (const p of def.ctrl) pts.push(p);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = cv.width, H = cv.height, s = Math.min((W - 30) / (maxX - minX), (H - 30) / (maxY - minY));
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => { g.beginPath(); pts.forEach((p, i) => { const x = 15 + (p[0] - minX) * s + (W - 30 - (maxX - minX) * s) / 2, y = 15 + (maxY - p[1]) * s; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  path(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 10; g.stroke();
  path(); g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.stroke();
  const p0 = pts[1]; g.fillStyle = '#e10600'; g.fillRect(15 + (p0[0] - minX) * s + (W - 30 - (maxX - minX) * s) / 2 - 3, 15 + (maxY - p0[1]) * s - 7, 6, 14);
  $('#track-info').textContent = `${def.gp} · ${def.info}`;
}

function renderOpts() {
  document.querySelectorAll('.opt').forEach((o) => {
    const vals = JSON.parse(o.dataset.vals), labels = JSON.parse(o.dataset.labels);
    const i = vals.indexOf(settings[o.dataset.key]);
    o.querySelector('.val').textContent = labels[i < 0 ? 0 : i];
  });
  document.querySelectorAll('.prof').forEach((b) => b.classList.toggle('sel', b.dataset.profile === settings.profile));
  applyTouchLayout();
}

function applyTouchLayout() {
  const B = document.body.classList;
  B.toggle('wheel-s', settings.wheelSize === 's'); B.toggle('wheel-l', settings.wheelSize === 'l');
  B.toggle('touch-swap', settings.touchSide === 'left');
}

function onSettingChanged(key) {
  if (['laps', 'weather', 'mpAI', 'track', 'tod'].includes(key) && net.isHost) mpSendCfg();
  if (key === 'track' || key === 'tod') updateLivery();
}

// keyboard rebinding: two slots per action, a key belongs to one action only
function renderKeymap() {
  const box = $('#keymap');
  const binds = { ...DEFAULT_BINDS, ...settings.binds };
  box.innerHTML = ACTIONS.map(([a, label]) => `<div class="krow"><span>${label}</span>${[0, 1].map((i) => `<button class="kbtn" data-a="${a}" data-i="${i}">${keyLabel(binds[a][i])}</button>`).join('')}</div>`).join('');
  box.querySelectorAll('.kbtn').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('.kbtn.wait').forEach((x) => x.classList.remove('wait'));
    b.classList.add('wait'); b.textContent = 'Taste …';
    input.capture = (code) => {
      const cur = { ...DEFAULT_BINDS, ...settings.binds };
      const next = {};
      for (const [k, v] of Object.entries(cur)) next[k] = v.filter((c) => c !== code);
      const slot = next[b.dataset.a].slice();
      slot[+b.dataset.i] = code;
      next[b.dataset.a] = slot.filter(Boolean).slice(0, 2);
      settings.binds = next; save(); input.setBinds(settings.binds); renderKeymap();
    };
  }));
}

function updateLivery() {
  const d = DRIVERS.find((x) => x.name === settings.driver) || DRIVERS[0];
  const t = trackById(settings.track);
  $('#brand-sub').textContent = `${t.name} · ${(TIMES.find((x) => x.id === settings.tod) || TIMES[1]).name} · Rennwochenende`;
  drawTrackPreview();
  $('#sel-driver').textContent = d.name;
  $('#sel-team').textContent = d.team.name;
  $('#sel-num').textContent = d.number;
  document.documentElement.style.setProperty('--team', hex(d.team.body === 0xf0f0f0 || d.team.body === 0x161616 ? d.team.accent : d.team.body));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

// ------------------------------------------------------------------ renderer
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const input = new Input();
const audio = new Audio();
let game = null;

function resize() {
  const w = innerWidth, h = innerHeight;
  const q = settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
  renderer.setSize(w, h, false);
  if (game) {
    game.camera.aspect = w / h; game.camera.updateProjectionMatrix();
    if (game.composer) { game.composer.setPixelRatio(renderer.getPixelRatio()); game.composer.setSize(w, h); }
  }
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ cameras
const CAMS = {
  cockpit: { label: 'COCKPIT', pos: [0, 0.96, 0.02], pitch: -0.045, fov: 72, shake: 1 },
  tcam: { label: 'T-KAMERA', pos: [0, 1.3, 0.42], pitch: -0.06, fov: 70, shake: 0.8 },
  nose: { label: 'NASEN-KAMERA', pos: [0, 0.5, -2.05], pitch: -0.03, fov: 78, shake: 0.6 },
  wing: { label: 'FLÜGEL-KAMERA', pos: [0.62, 0.22, -2.35], pitch: 0, fov: 80, shake: 0.5 },
  chase: { label: 'VERFOLGER', pos: [0, 2.1, 6.6], pitch: -0.12, fov: 64, shake: 0.3, chase: true },
  far: { label: 'VERFOLGER WEIT', pos: [0, 3.3, 10.5], pitch: -0.15, fov: 60, shake: 0.2, chase: true },
};

// ------------------------------------------------------------------ other players' cars
class RemoteCar {
  constructor(track) {
    this.track = track; this.remote = true;
    this.x = 0; this.z = 0; this.yaw = 0; this.v = 0; this.dist = 0; this.lat = 0; this.wheelRot = 0; this.steerVis = 0;
    this.t = null;
  }
  get s() { return this.track.wrapS(this.dist + this.track.startS); }
  set(x, z, yaw, dist, lat) { this.x = x; this.z = z; this.yaw = yaw; this.dist = dist; this.lat = lat; }
  target(c, now) { this.t = { x: c[0], z: c[1], yaw: c[2], v: c[3], dist: c[4], lat: c[5], steer: c[6], at: now }; }
  update(dt) {
    const t = this.t;
    if (!t) return;
    // dead-reckon from the last packet (max 0.25 s), then ease toward it
    const age = Math.min(0.25, (performance.now() - t.at) / 1000);
    const tx = t.x - Math.sin(t.yaw) * t.v * age, tz = t.z - Math.cos(t.yaw) * t.v * age;
    const k = Math.min(1, dt * 12);
    if (Math.hypot(tx - this.x, tz - this.z) > 15) { this.x = tx; this.z = tz; } else { this.x += (tx - this.x) * k; this.z += (tz - this.z) * k; }
    let dy = t.yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
    this.v = t.v;
    const td = t.dist + t.v * age;
    this.dist += Math.abs(td - this.dist) > 30 ? td - this.dist : (td - this.dist) * k;
    this.lat += (t.lat - this.lat) * k;
    this.steerVis = t.steer * 0.3;
    this.wheelRot += (this.v * dt) / 0.36;
  }
}

// ------------------------------------------------------------------ game
class Game {
  constructor(opts) {
    this.opts = opts;
    const mp = (this.mp = opts.mp || null);
    const rand = mp ? rng(mp.start.seed) : Math.random;
    const scene = (this.scene = new THREE.Scene());
    // weather first: it decides how wet the track starts
    this.weather = new Weather(scene, opts.weather, opts.laps * 95, opts.quality, rand);
    const wet = this.weather.wetness > 0.4; // tyre choice at the start
    this.startWet = wet;
    scene.fog = new THREE.FogExp2(0xc9dcec, 0.0006);
    renderer.shadowMap.enabled = opts.quality !== 'low';

    // time of day + circuit
    const tod = (this.tod = TOD[opts.tod] || TOD.noon);
    this.def = trackById(opts.track);
    this.sunDir = sunDir(tod);
    // sky (clear dome + overcast dome cross-faded by the weather) + environment
    const skyTex = skyTexture(tod);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
    const skyWet = new THREE.Mesh(new THREE.SphereGeometry(2900, 48, 24), new THREE.MeshBasicMaterial({ map: skyTexture(tod, true), side: THREE.BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false }));
    sky.add(skyWet);
    scene.add(sky); this.sky = sky; this.skyWet = skyWet;
    this.sunSprite = sunSprite(tod);
    if (this.sunSprite) scene.add(this.sunSprite);
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: tod.lamps > 0.5 ? 0x141a14 : 0x51703f }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1; envScene.add(ground);
    scene.environment = pm.fromScene(envScene, 0.04).texture;

    const hemi = (this.hemi = new THREE.HemisphereLight(tod.hemiSky, tod.hemiGround, tod.hemiInt));
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(tod.sun, tod.sunInt));
    sun.castShadow = opts.quality !== 'low';
    const sz = opts.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 600;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.fogClear = new THREE.Color(tod.fog);
    this.fogWet = new THREE.Color(tod.lamps > 0.5 ? 0x1a2030 : 0xa9afb5);
    this.hemiClear = new THREE.Color(tod.hemiSky);
    this.sunClear = new THREE.Color(tod.sun);

    // bloom makes lamps, neon and the sun glow (skipped on low quality)
    this.composer = null;
    if (opts.quality === 'high' || (opts.quality === 'medium' && tod.lamps > 0.5)) {
      const c = new EffectComposer(renderer);
      this.renderPass = new RenderPass(scene, null);
      c.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), tod.lamps > 0.5 ? 0.75 : 0.32, 0.5, tod.lamps > 0.5 ? 0.62 : 0.86);
      c.addPass(this.bloom);
      c.addPass(new OutputPass());
      this.composer = c;
    }

    this.track = new Track(scene, { def: this.def, tod, wetness: this.weather.wetness, quality: opts.quality });
    this.applyWeather(0, true);

    // camera
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 5000);
    if (this.renderPass) this.renderPass.camera = this.camera;
    this.camMode = opts.camera;

    // player
    const pd = DRIVERS.find((d) => d.name === opts.driver) || DRIVERS[0];
    this.player = new PlayerCar(this.track, { manual: opts.gearbox === 'manual', brakeAssist: opts.brakeAssist, steerAssist: opts.steerAssist });
    this.player.onShift = (down) => !down && audio.shift();
    this.playerRoot = new THREE.Group(); scene.add(this.playerRoot);
    this.playerBody = new THREE.Group(); this.playerRoot.add(this.playerBody);
        this.mirrorRT = new THREE.WebGLRenderTarget(512, 160);
    this.mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.playerModel = buildCar(pd.team, wet, pd.number, { mirrorTex: this.mirrorRT.texture, second: pd.team.drivers.indexOf(pd.name) === 1 });
    this.playerBody.add(this.playerModel);
    this.cockpit = buildCockpit(); this.playerBody.add(this.cockpit);
    this.rearCam = new THREE.PerspectiveCamera(42, 512 / 160, 0.3, 3500);
    this.rearCam.position.set(0, 0.95, 0.9); this.rearCam.rotation.y = Math.PI;
    this.playerBody.add(this.rearCam);
    this.playerBody.add(this.camera);

    // grid: single player = chosen slot among the AI field; multiplayer = the host's grid
    const byName = (n) => DRIVERS.find((d) => d.name === n);
    let lineup;
    if (mp) {
      const myPeer = mp.net.myPeer;
      lineup = mp.start.slots.map((s) => s.h
        ? (s.h === myPeer ? { kind: 'player', d: pd, name: clean(s.n).toUpperCase() } : { kind: 'remote', d: byName(s.d) || DRIVERS[0], name: clean(s.n).toUpperCase(), peer: s.h })
        : { kind: mp.net.isHost ? 'ai' : 'netai', d: byName(s.a) || DRIVERS[0] });
      if (!lineup.some((l) => l.kind === 'player')) lineup.push({ kind: 'player', d: pd, name: pd.name });
    } else {
      const others = DRIVERS.filter((d) => d !== pd);
      others.sort((a, b) => (b.team.pace + Math.random() * 0.02) - (a.team.pace + Math.random() * 0.02));
      const gridSlot = opts.grid === 'random' ? (Math.random() * 20) | 0 : Math.min(19, opts.grid - 1);
      lineup = others.map((d) => ({ kind: 'ai', d }));
      lineup.splice(gridSlot, 0, { kind: 'player', d: pd });
    }
    const diffF = 0.86 + (opts.difficulty / 110) * 0.14;
    this.cars = [];
    const L = this.track.length;
    this.cpN = Math.ceil((opts.laps * L + 1200) / 50);
    let aiSlot = 0;
    lineup.forEach((it, g) => {
      const d = it.d;
      const gs = this.track.startS - 8 - g * 8;
      const lat = g % 2 === 0 ? -2.6 : 2.6;
      const dist0 = gs - this.track.startS;
      let entry;
      const name = it.name || d.name;
      if (it.kind === 'player') {
        this.player.placeAt(gs, lat);
        this.player.dist = dist0;
        entry = { isPlayer: true, team: d.team, name, number: d.number, obj: this.player, mesh: this.playerRoot };
      } else if (it.kind === 'remote') {
        const rc = new RemoteCar(this.track);
        rc.set(...this.track.posAt(gs, lat), dist0, lat);
        const mesh = buildCar(d.team, wet, d.number, { second: d.team.drivers.indexOf(d.name) === 1 });
        scene.add(mesh);
        entry = { isPlayer: false, remote: true, peer: it.peer, team: d.team, name, number: d.number, obj: rc, mesh };
      } else {
        const skill = diffF * (1 - (1 - d.team.pace) * 0.55) * (0.993 + rand() * 0.007);
        const ai = new AICar(this.track, d.team, d.name, d.number, skill);
        ai.dist = dist0; ai.lat = lat; ai.latOff = lat - this.track.racingLat(gs);
        ai.net = it.kind === 'netai'; ai.slot = aiSlot++;
        ai.computePose();
        const mesh = buildCar(d.team, wet, d.number, { second: d.team.drivers.indexOf(d.name) === 1 });
        scene.add(mesh);
        entry = { isPlayer: false, team: d.team, name, number: d.number, obj: ai, mesh };
      }
      entry.cp = new Float32Array(this.cpN).fill(-1); entry.lastCp = -1;
      entry.finished = false; entry.finishTime = 0; entry.grid = g + 1;
      this.cars.push(entry);
    });
    this.playerEntry = this.cars.find((c) => c.isPlayer);
    this.aiList = this.cars.filter((c) => !c.isPlayer && !c.remote).map((c) => c.obj);
    this.others = this.cars.filter((c) => !c.isPlayer).map((c) => c.obj);

    this.buildRacingLineMesh();

    // race state
    this.laps = opts.laps;
    this.state = 'grid'; this.stateT = 0; this.time = 0; this.raceTime = 0;
    this.lightsHold = 0.6 + rand() * 2.2;
    this.lap = { start: 0, best: Infinity, sectorStart: 0, sector: 0, sectorBest: [Infinity, Infinity, Infinity], states: ['', '', ''], invalid: false, lapNo: 0 };
    this.trackWarnings = 0; this.offWasOn = false;
    this.hud = new HUD($('#hud'), opts.laps);
    this.hud.setMap(this.track);
    this.hud.setLights(0, false);
    this.paused = false;
    this.applyCamera();
    resize();
    audio.init();
    audio.resume();
    this.displayT = 0;
    this.track.setStartLights(0, false);
  }

  // blend sky, light, fog, track surface and sound with the current rain / wetness
  applyWeather(dt, force = false) {
    const W = this.weather, r = W.rain, w = W.wetness;
    const o = Math.min(1, r * 1.3 + w * 0.25);
    const L = (a, b, t = o) => a + (b - a) * t;
    const T = this.tod;
    this.skyWet.material.opacity = o;
    this.scene.fog.density = L(T.fogD, (T.lamps > 0.5 ? 0.0035 : 0.0042) * (0.45 + 0.55 * r));
    this.scene.fog.color.copy(this.fogClear).lerp(this.fogWet, o);
    this.sun.intensity = T.sunInt * (1 - 0.62 * o);
    this.sun.color.copy(this.sunClear).lerp(new THREE.Color(0xdfe5ea), o * 0.7);
    this.sun.shadow.radius = L(2, 6);
    this.hemi.intensity = T.hemiInt * L(1, 1.05);
    this.hemi.color.copy(this.hemiClear).lerp(new THREE.Color(T.lamps > 0.5 ? 0x3a4458 : 0xc5ccd4), o);
    this.scene.environmentIntensity = T.env * L(1, 0.8);
    renderer.toneMappingExposure = T.exposure * L(1, 0.92);
    if (this.sunSprite) this.sunSprite.material.opacity = 1 - o;
    if (force) this.track.setWetness(w);
    audio.rainLevel = r * 0.14;
  }

  buildRacingLineMesh() {
    const tr = this.track, N = tr.N;
    if (this.opts.line === 'off') return;
    const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 4);
    const idx = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      let dx = tr.raceX[j] - tr.raceX[i], dz = tr.raceZ[j] - tr.raceZ[i];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = 0.35;
      pos.set([tr.raceX[i] - dz * w, 0.055, tr.raceZ[i] + dx * w, tr.raceX[i] + dz * w, 0.055, tr.raceZ[i] - dx * w], i * 6);
      idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.frustumCulled = false;
    this.scene.add(m);
    this.lineMesh = m;
    // corners only mode: mask
    this.lineMask = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let near = 0;
      for (let d = -30; d <= 60; d += 3) if (tr.brakeZone[(i + d + N) % N] || Math.abs(tr.k[(i + d + N) % N]) > 1 / 200) near = 1;
      this.lineMask[i] = this.opts.line === 'full' ? 1 : near;
    }
  }

  updateRacingLine() {
    if (!this.lineMesh) return;
    const tr = this.track, N = tr.N, p = this.player;
    const col = this.lineMesh.geometry.attributes.color.array;
    col.fill(0);
    const i0 = p.hint;
    const ahead = 140;
    for (let d = -5; d < ahead; d++) {
      const i = (i0 + d + N) % N;
      const fade = Math.min(1, (d + 5) / 6) * Math.min(1, (ahead - d) / 30) * this.lineMask[i] * 0.85;
      if (fade <= 0) continue;
      const vt = tr.vProf[i];
      // what speed could we still reach this point at with full braking?
      const dist = d * tr.ds;
      const reach = Math.sqrt(Math.max(0, p.v * p.v - 2 * 30 * tr.mu * Math.max(0, dist)));
      let r, g, b;
      if (p.v > vt + 2 && reach > vt - 4) { r = 1; g = 0.08; b = 0.05; }
      else if (p.v > vt - 4 && tr.brakeZone[i]) { r = 1; g = 0.75; b = 0.05; }
      else { r = 0.1; g = 0.95; b = 0.25; }
      for (const k of [i * 2, i * 2 + 1]) { col[k * 4] = r; col[k * 4 + 1] = g; col[k * 4 + 2] = b; col[k * 4 + 3] = fade; }
    }
    this.lineMesh.geometry.attributes.color.needsUpdate = true;
  }

  applyCamera() {
    const m = this.camMode;
    const cam = this.camera;
    const v = CAMS[m] || CAMS.cockpit;
    this.cockpit.visible = m === 'cockpit';
    this.playerModel.userData.helmet.visible = m !== 'cockpit';
    cam.position.set(...v.pos); cam.rotation.set(v.pitch, 0, 0); cam.fov = v.fov;
    cam.updateProjectionMatrix();
    this.hud.camHint(v.label);
  }

  cycleCamera(dir = 1) {
    const modes = Object.keys(CAMS);
    this.camMode = modes[(modes.indexOf(this.camMode) + dir + modes.length) % modes.length];
    this.applyCamera();
  }

  resetCar() {
    const p = this.player;
    const s = p.s;
    const lat = this.track.racingLat(s);
    const d = p.dist;
    p.placeAt(s, lat); p.dist = d; p.gear = 1;
    this.hud.message('ZURÜCKGESETZT', 1.2);
  }

  // ---------------------------------------------------------- race bookkeeping
  recordCheckpoints(entry, t) {
    const k = Math.floor((entry.obj.dist + 1000) / 50);
    while (entry.lastCp < k && entry.lastCp < this.cpN - 1) { entry.lastCp++; entry.cp[entry.lastCp] = t; }
  }

  gapTo(c) {
    const p = this.playerEntry;
    const ahead = c.obj.dist > p.obj.dist;
    const k = ahead ? p.lastCp : c.lastCp;
    if (k < 1 || c.cp[k] < 0 || p.cp[k] < 0) return null;
    if (this.raceTime < 2) return null;
    return c.cp[k] - p.cp[k];
  }

  computeOrder() {
    const cars = this.cars.slice();
    cars.sort((a, b) => {
      if (a.gone !== b.gone) return a.gone ? 1 : -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.obj.dist - a.obj.dist;
    });
    return cars;
  }

  update(dt) {
    const inp = input.poll();
    if (input.act('pause')) { this.togglePause(); }
    if (this.paused && !this.mp) { input.endFrame(); return; }
    if (input.act('cam')) this.cycleCamera();
    if (input.act('camPrev')) this.cycleCamera(-1);
    this.lookBack = inp.look;
    if (input.act('mute')) { const m = audio.toggleMute(); this.hud.camHint(m ? 'TON AUS' : 'TON AN'); }
    if (input.act('reset') && this.state === 'race') this.resetCar();

    this.time += dt;
    // ---- start procedure
    if (this.state === 'grid') {
      this.stateT += dt;
      const n = Math.min(5, Math.floor((this.stateT - 1.2) / 1.0) + 1);
      if (this.stateT > 1.2) {
        if (n !== this.lastLights) { this.lastLights = n; if (n > 0) audio.beep(520, 0.18); }
        this.hud.setLights(n, true); this.track.setStartLights(n, false);
      }
      if (this.stateT > 1.2 + 5 + this.lightsHold) {
        this.state = 'race'; this.raceTime = 0;
        this.hud.setLights(0, true); this.track.setStartLights(0, true);
        audio.beep(1040, 0.4);
        this.hud.message('LIGHTS OUT', 1.6, 'big');
        setTimeout(() => this.hud.setLights(0, false), 900);
        this.lap.start = 0; this.lap.sectorStart = 0;
      }
    }
    const racing = this.state === 'race' || this.state === 'finished';
    const mpSync = !!this.mp;
    if (racing) this.raceTime += dt;
    const wEvent = this.weather.step(dt, this.raceTime);
    // grip + AI speed profile follow the track wetness (cheap, so twice a second)
    this.surfaceT = (this.surfaceT || 0) - dt;
    if (this.surfaceT <= 0) { this.surfaceT = 0.5; this.track.setWetness(this.weather.wetness); }
    if (wEvent === 'start') this.hud.message('REGEN SETZT EIN', 3, 'rain');
    if (wEvent === 'stop') this.hud.message('DER REGEN HÖRT AUF', 3);
    if (this.track.wet !== this.lastWetState && this.lastWetState !== undefined) this.hud.warn(this.track.wet ? 'STRECKE NASS — WENIGER GRIP' : 'STRECKE TROCKNET AB', 2.5);
    this.lastWetState = this.track.wet;

    // ---- physics (fixed sub-steps)
    const p = this.player;
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      p.update(h, inp, racing && !this.playerEntry.finished);
      if (this.playerEntry.finished) { p.throttle = 0; }
    }
    // shift edges consumed
    if (racing) for (const ai of this.aiList) if (!ai.net) ai.update(dt, this.raceTime, this.allObjs(), this.track.mu);
    if (mpSync) this.netSync(dt, racing);
    this.resolveCollisions();
    if (p.impact > 0.25 && !this.lastImpact) { audio.crash(p.impact); this.hud.warn('KOLLISION', 1.2); }
    this.lastImpact = p.impact > 0.25;

    // ---- DRS availability (dry, from lap 2, within 1s at detection, inside zone)
    const sNow = p.s;
    const inZone = this.track.drsZones.some(([a, b]) => (a < b ? sNow > a && sNow < b : sNow > a || sNow < b));
    if (!this.track.wet && this.lap.lapNo >= 1 && inZone) {
      if (!p.drsAvailable && !this.drsChecked) {
        this.drsChecked = true;
        const ahead = this.computeOrder();
        const idx = ahead.indexOf(this.playerEntry);
        const g = idx > 0 ? this.gapTo(ahead[idx - 1]) : null;
        if (g !== null && Math.abs(g) < 1.0) { p.drsAvailable = true; audio.beep(1300, 0.12); }
      }
    } else { p.drsAvailable = false; p.drsOpen = false; this.drsChecked = false; }

    // ---- timing
    const t = this.raceTime;
    for (const c of this.cars) {
      this.recordCheckpoints(c, t);
      const L = this.track.length;
      if (c.remote) continue;
      if (!c.finished && racing && c.obj.dist >= this.laps * L) {
        c.finished = true; c.finishTime = t;
        if (c.isPlayer) this.onPlayerFinish();
      }
    }
    if (racing) this.updateLapTiming();

    // ---- stuck (off track, barely moving) -> put the car back on the racing line
    if (this.state === 'race' && Math.abs(p.v) < 3 && (p.offTrack || p.impact > 0.1)) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 3.5) { this.stuckT = 0; this.resetCar(); } }
    else this.stuckT = 0;

    // ---- track limits
    if (p.offTrack && !this.offWasOn && this.state === 'race') {
      this.trackWarnings++;
      this.lap.invalid = true;
      this.hud.warn(`STRECKENBEGRENZUNG — RUNDE UNGÜLTIG (${this.trackWarnings})`, 2.2);
    }
    this.offWasOn = p.offTrack;

    this.order = this.computeOrder();
    this.playerPos = this.order.indexOf(this.playerEntry) + 1;

    if (this.state === 'finished') {
      this.stateT += dt;
      if (this.stateT > 5 && !this.resultsShown) this.showResults();
    }
    input.endFrame();
  }

  // multiplayer: publish our car (and the host's AI), read everyone else's
  netSync(dt, racing) {
    const net = this.mp.net, p = this.player, r2 = (v, k) => Math.round(v * k) / k;
    const msg = { car: [r2(p.x, 100), r2(p.z, 100), r2(p.yaw, 1000), r2(p.v, 10), r2(p.dist, 10), r2(p.lat, 100), r2(p.steer, 100)], fin: this.playerEntry.finished ? r2(this.playerEntry.finishTime, 1000) : null };
    if (net.isHost) msg.ai = this.aiList.map((a) => [r2(a.dist, 10), r2(a.lat, 100), r2(a.v, 10)]);
    this.netT = (this.netT || 0) - dt;
    if (this.netT <= 0) { this.netT = 1 / 30; net.sendCar(msg); }
    const now = performance.now();
    for (const c of this.cars) {
      if (!c.remote) continue;
      const st = net.peerState(c.peer);
      if (!st) {
        // missing for a few seconds = left the race (comes back if the connection recovers)
        c.missing = (c.missing || 0) + dt;
        if (!c.gone && c.missing > 4 && this.raceTime > 3) { c.gone = true; this.hud.warn(`${c.name} HAT DAS RENNEN VERLASSEN`, 2.5); }
        c.obj.update(dt); continue;
      }
      c.missing = 0; if (c.gone) c.gone = false;
      const car = st.presence.car;
      if (Array.isArray(car) && car.length >= 7 && st.updatedAt !== c.lastUpd) { c.lastUpd = st.updatedAt; c.obj.target(car, now); }
      if (typeof st.presence.fin === 'number' && !c.finished) { c.finished = true; c.finishTime = st.presence.fin; }
      c.obj.update(dt);
    }
    // AI simulated by the host
    if (!net.isHost) {
      const h = net.hostPeer();
      const ai = h && Array.isArray(h.presence.ai) ? h.presence.ai : null;
      if (ai && h.updatedAt !== this.hostUpd) { this.hostUpd = h.updatedAt; this.hostSeen = now; }
      const hostLost = !this.hostSeen ? this.raceTime > 6 : now - this.hostSeen > 3000;
      for (const a of this.aiList) {
        if (!a.net) continue;
        if (hostLost && racing) { a.net = false; continue; } // host gone: drive them ourselves
        const s = ai && ai[a.slot];
        if (racing) a.dist += a.v * dt;
        if (Array.isArray(s)) {
          const err = s[0] - a.dist;
          a.dist += Math.abs(err) > 25 ? err : err * Math.min(1, dt * 4);
          a.lat += (s[1] - a.lat) * Math.min(1, dt * 6);
          a.v = s[2];
          a.latOff = a.lat - this.track.racingLat(a.s);
        }
        a.wheelRot += (a.v * dt) / 0.36;
        a.computePose();
      }
    }
  }

  allObjs() { if (!this._objs) this._objs = this.cars.map((c) => c.obj); return this._objs; }

  updateLapTiming() {
    const p = this.player, L = this.track.length, lap = this.lap;
    const d = p.dist;
    if (d < 0) return;
    const lapNo = Math.floor(d / L);
    const sec = Math.min(2, Math.floor((d - lapNo * L) / (L / 3)));
    if (lapNo > lap.lapNo) {
      // lap completed
      const lt = this.raceTime - lap.start;
      this.closeSector(2);
      const valid = !lap.invalid;
      if (valid && lt < lap.best) { lap.best = lt; if (lap.lapNo > 0) this.hud.message(`PERSÖNLICHE BESTZEIT<br><b>${fmtTime(lt)}</b>`, 3, 'purple'); }
      else if (lapNo < this.laps) this.hud.message(`RUNDE ${lapNo}<br><b>${fmtTime(lt)}</b>${valid ? '' : ' <s>UNGÜLTIG</s>'}`, 2.5);
      lap.lapNo = lapNo; lap.start = this.raceTime; lap.invalid = false;
      lap.sector = 0; lap.sectorStart = this.raceTime;
      lap.states = ['', '', ''];
      if (lapNo === this.laps - 1) setTimeout(() => this.hud.message('LETZTE RUNDE', 2.5, 'big'), 2600);
    } else if (sec > lap.sector) {
      this.closeSector(lap.sector);
      lap.sector = sec;
    }
    this.hud.setSectors(lap.states);
  }

  closeSector(i) {
    const lap = this.lap;
    const t = this.raceTime - lap.sectorStart;
    if (lap.lapNo === 0 && i === 0 && this.raceTime < 1) return;
    let st = 'y';
    if (t < lap.sectorBest[i]) { st = lap.sectorBest[i] === Infinity ? 'g' : 'p'; lap.sectorBest[i] = t; }
    lap.states[i] = st;
    lap.sectorStart = this.raceTime;
  }

  onPlayerFinish() {
    this.state = 'finished'; this.stateT = 0;
    const pos = this.computeOrder().indexOf(this.playerEntry) + 1;
    this.hud.message(`<span class="chequer"></span>ZIEL — P${pos}`, 5, 'big');
    audio.beep(880, 0.3); setTimeout(() => audio.beep(1320, 0.5), 300);
  }

  resolveCollisions() {
    const tr = this.track, L = tr.length;
    const objs = this.allObjs();
    const p = this.player;
    for (let a = 0; a < objs.length; a++) {
      for (let b = a + 1; b < objs.length; b++) {
        const A = objs[a], B = objs[b];
        let ds = B.dist - A.dist;
        if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;
        const dl = B.lat - A.lat;
        if (Math.abs(ds) > 5.4 || Math.abs(dl) > 1.95) continue;
        const ol = 1.95 - Math.abs(dl), os = 5.4 - Math.abs(ds);
        const front = ds > 0 ? B : A, rear = ds > 0 ? A : B;
        if (os / 5.4 < ol / 1.95) {
          // nose-to-tail
          const push = os * 0.5;
          this.shiftCar(rear, -push, 0); this.shiftCar(front, push * 0.3, 0);
          const vm = (front.v + rear.v) / 2;
          if (rear.v > front.v) { const dv = rear.v - front.v; rear.v = vm - dv * 0.1; front.v = vm + dv * 0.1; }
          if ((rear === p || front === p) && Math.abs(rear.v - front.v) > 3) p.impact = Math.max(p.impact, 0.5);
        } else {
          const dir = Math.sign(dl) || 1;
          this.shiftCar(A, 0, -dir * ol * 0.5); this.shiftCar(B, 0, dir * ol * 0.5);
          if (A === p || B === p) p.impact = Math.max(p.impact, 0.2);
        }
      }
    }
  }

  shiftCar(o, ds, dl) {
    if (o.remote || o.net) return; // other players' cars are moved by their own devices
    if (o === this.player) {
      const f = this.track.frame(o.s);
      o.x += f.tx * ds + f.rx * dl; o.z += f.tz * ds + f.rz * dl;
      o.lat += dl; o.dist += ds;
    } else {
      o.dist += ds;
      o.lat = Math.max(-HALF_W - 1, Math.min(HALF_W + 1, o.lat + dl));
      o.latOff += dl;
    }
  }

  // ---------------------------------------------------------- rendering
  render(dt) {
    const p = this.player, cam = this.camera;
    // player transform with a little pitch/roll from g-forces
    this.playerRoot.position.set(p.x, 0, p.z);
    this.playerRoot.rotation.y = p.yaw;
    const longG = (p.v - (this.prevV ?? p.v)) / Math.max(dt, 1e-3);
    this.prevV = p.v;
    const clamp = (x, a) => Math.max(-a, Math.min(a, x));
    this.pitch = (this.pitch || 0) + (clamp(-longG * 0.0012, 0.025) - (this.pitch || 0)) * Math.min(1, dt * 6);
    this.roll = (this.roll || 0) + (clamp(p.yawRate * p.v * 0.0009, 0.03) - (this.roll || 0)) * Math.min(1, dt * 6);
    this.playerBody.rotation.set(this.pitch, 0, this.roll);
    const v = CAMS[this.camMode] || CAMS.cockpit;
    const shake = (p.bump * 0.006 + Math.min(1, p.v / 90) * 0.0012 + p.impact * 0.03) * v.shake;
    const rx = () => (Math.random() - 0.5) * shake;
    if (this.lookBack) {
      cam.position.set(0, 1.25, 0.6); cam.rotation.set(-0.08, Math.PI, 0);
    } else if (v.chase) {
      // chase cams swing out a little in corners
      cam.position.set(p.yawRate * -0.25, v.pos[1], v.pos[2]);
      cam.rotation.set(v.pitch, p.yawRate * 0.12, 0);
    } else {
      cam.position.set(v.pos[0] + rx(), v.pos[1] + rx(), v.pos[2]);
      if (this.camMode === 'cockpit') cam.rotation.set(v.pitch + this.pitch * 0.5, -p.steer * 0.03, -this.roll * 0.6);
      else cam.rotation.set(v.pitch, 0, 0);
    }
    // wheels
    const maxSteer = 0.42 / (1 + Math.abs(p.v) / 16);
    for (const set of [this.playerModel.userData.wheels, this.cockpit.userData.wheels]) {
      for (const w of set) {
        w.wheel.rotation.x = -p.wheelRot;
        if (w.front) w.pivot.rotation.y = -p.steer * maxSteer * 1.6;
      }
    }
    this.cockpit.userData.steering.rotation.z = -p.steer * 0.9;
    const touchWheel = IS_TOUCH && document.body.classList.contains('steer-wheel');
    this.cockpit.userData.steering.visible = !touchWheel;
    if (touchWheel) this.updateTouchWheel(dt);
    // AI meshes
    const blink = (performance.now() / 250 | 0) % 2;
    const rainLights = this.weather.rain > 0.15 || this.weather.wetness > 0.5;
    this.applyWeather(dt);
    for (const c of this.cars) {
      if (c.isPlayer) continue;
      const o = c.obj, m = c.mesh;
      const far = c.gone || Math.hypot(o.x - p.x, o.z - p.z) > 650;
      m.visible = !far;
      if (far) continue;
      m.position.set(o.x, 0, o.z);
      m.rotation.y = o.yaw;
      for (const w of m.userData.wheels) { w.wheel.rotation.x = -o.wheelRot; if (w.front) w.pivot.rotation.y = -o.steerVis * 0.5; }
      m.userData.rainLight.material.color.setHex(rainLights && blink ? 0xff2020 : 0x330000);
    }
    this.playerModel.userData.rainLight.material.color.setHex(rainLights && blink ? 0xff2020 : 0x330000);
    // sun/shadow follow
    this.sun.position.set(p.x + this.sunDir.x * 300, Math.max(60, this.sunDir.y * 300), p.z + this.sunDir.z * 300);
    if (this.sunSprite) { const cw = this.camWorld().position; this.sunSprite.position.set(cw.x + this.sunDir.x * 2500, cw.y + this.sunDir.y * 2500, cw.z + this.sunDir.z * 2500); }
    this.sun.target.position.set(p.x, 0, p.z);
    this.sky.position.set(p.x, 0, p.z);

    this.updateRacingLine();
    this.weather.update(dt, this.camWorld(), p.v, this.others.filter((a) => Math.hypot(a.x - p.x, a.z - p.z) < 160), this.camMode === 'cockpit');
    if (this.camMode !== 'cockpit') this.weather.emitSpray(p, dt);

    // steering wheel display
    this.displayT -= dt;
    if (this.displayT <= 0 && this.camMode === 'cockpit') { this.displayT = 0.1; this.drawWheelDisplay(); }

    // mirrors
    this.mirrorFrame = (this.mirrorFrame || 0) + 1;
    const every = this.opts.quality === 'high' ? 1 : this.opts.quality === 'medium' ? 2 : 3;
    if (this.camMode === 'cockpit' && !this.lookBack && this.mirrorFrame % every === 0) {
      this.cockpit.visible = false; this.playerModel.visible = false;
      renderer.setRenderTarget(this.mirrorRT);
      renderer.render(this.scene, this.rearCam);
      renderer.setRenderTarget(null);
      this.cockpit.visible = true; this.playerModel.visible = true;
    }
    if (this.composer) this.composer.render(); else renderer.render(this.scene, cam);

    this.hud.update(dt, p, {
      playerLap: Math.max(1, this.lap.lapNo + 1), curLapTime: this.state === 'grid' ? 0 : this.raceTime - this.lap.start,
      bestLap: this.lap.best, playerPos: this.playerPos || this.playerEntry.grid, total: this.cars.length,
      order: this.order || this.cars, gapTo: (c) => this.gapTo(c), wet: this.startWet, time: this.raceTime, weather: this.weather,
    });
    audio.update(p, this.others, this.camMode === 'cockpit');
  }

  // on-screen touch wheel: rotation follows the car's steering, display mirrors the dash
  updateTouchWheel(dt) {
    const p = this.player;
    if (!this.tw) {
      const leds = $('#wheel-leds');
      if (!leds.childElementCount) for (let i = 0; i < 15; i++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', 130 + i * 10); c.setAttribute('cy', 38); c.setAttribute('r', 3.6); c.setAttribute('fill', '#222');
        leds.appendChild(c);
      }
      this.tw = { rot: $('#wheel-rot'), leds: [...leds.children], speed: $('#wd-speed'), gear: $('#wd-gear'), ers: $('#wd-ers'), pos: $('#wd-pos'), lap: $('#wd-lap'), drs: $('#wd-drs'), t: 0 };
    }
    const tw = this.tw;
    tw.rot.style.transform = `rotate(${p.steer * 100}deg)`;
    tw.t -= dt;
    if (tw.t > 0) return;
    tw.t = 0.06;
    tw.speed.textContent = Math.round(p.speedKmh);
    tw.gear.textContent = p.gear <= 0 ? (p.v < -0.5 ? 'R' : 'N') : p.gear;
    tw.ers.textContent = Math.round(p.ers * 100) + '%';
    tw.pos.textContent = 'P' + (this.playerPos || '-');
    tw.lap.textContent = 'L' + Math.max(1, this.lap.lapNo + 1) + '/' + this.laps;
    tw.drs.setAttribute('fill', p.drsOpen ? '#19d65b' : p.drsAvailable ? '#0d5c2a' : '#1a1a1a');
    const lit = Math.round(((p.rpm - 9000) / 3300) * 15);
    const flash = p.rpm > 12100 && (performance.now() / 70 | 0) % 2;
    tw.leds.forEach((c, i) => c.setAttribute('fill', i < lit ? (flash ? '#39a8ff' : i < 5 ? '#19e019' : i < 10 ? '#ff2020' : '#a24bff') : '#222'));
  }

  camWorld() { if (!this._cw) this._cw = new THREE.Object3D(); this.camera.getWorldPosition(this._cw.position); return this._cw; }

  drawWheelDisplay() {
    const { canvas: c, tex, rev, revTex } = this.cockpit.userData.display;
    const g = c.getContext('2d'), p = this.player;
    g.fillStyle = '#050608'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#fff'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.gear <= 0 ? 'N' : p.gear, 128, 50);
    g.font = 'bold 26px Arial'; g.fillStyle = '#7CFC00';
    g.fillText(Math.round(p.speedKmh), 45, 30);
    g.fillStyle = '#f5c400'; g.fillText(Math.round(p.ers * 100) + '%', 211, 30);
    g.fillStyle = '#9ad'; g.font = 'bold 20px Arial'; g.fillText('P' + (this.playerPos || '-'), 45, 72);
    g.fillText('L' + Math.max(1, this.lap.lapNo + 1), 211, 72);
    tex.needsUpdate = true;
    const r = rev.getContext('2d');
    r.fillStyle = '#000'; r.fillRect(0, 0, 256, 16);
    const lit = Math.round(((p.rpm - 9000) / 3300) * 15);
    for (let i = 0; i < 15; i++) {
      r.fillStyle = i < lit ? (i < 5 ? '#19e019' : i < 10 ? '#ff2020' : '#8a3cff') : '#1a1a1a';
      r.beginPath(); r.arc(9 + i * 17, 8, 6, 0, 6.3); r.fill();
    }
    revTex.needsUpdate = true;
  }

  togglePause(force) {
    if (this.resultsShown) return;
    this.paused = force ?? !this.paused;
    $('#pause').classList.toggle('active', this.paused);
    if (this.paused && !this.mp) audio.ctx && audio.ctx.suspend(); else audio.resume();
  }

  showResults() {
    this.resultsShown = true;
    const L = this.track.length;
    const p = this.playerEntry;
    // estimate finishing times for cars still running
    const rows = this.cars.map((c) => {
      let t = c.finishTime;
      if (!c.finished) { const remain = this.laps * L - c.obj.dist; t = this.raceTime + remain / Math.max(40, c.obj.v || 50); }
      return { c, t };
    }).sort((a, b) => a.t - b.t);
    const win = rows[0].t;
    $('#results-body').innerHTML = rows.map((r, i) => `
      <tr class="${r.c.isPlayer ? 'me' : ''}">
        <td>${i + 1}</td>
        <td><span class="bar" style="background:${hex(r.c.team.body === 0xf0f0f0 || r.c.team.body === 0x161616 ? r.c.team.accent : r.c.team.body)}"></span>${r.c.name}</td>
        <td>${r.c.team.name}</td>
        <td>${r.c.grid}</td>
        <td>${i === 0 ? fmtTime(r.t) : '+' + (r.t - win).toFixed(3)}</td>
        <td>${[25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] ?? 0}</td>
      </tr>`).join('');
    const pos = rows.findIndex((r) => r.c === p) + 1;
    $('#res-pos').textContent = 'P' + pos;
    $('#res-title').textContent = 'ERGEBNIS · ' + this.def.gp.toUpperCase();
    $('#res-best').textContent = fmtTime(this.lap.best);
    $('#res-warn').textContent = this.trackWarnings;
    showScreen('results');
    $('#hud').classList.remove('active');
    document.body.classList.remove('ingame');
  }

  dispose() {
    this.weather.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); });
    });
    this.mirrorRT.dispose();
    if (this.composer) this.composer.dispose();
    $('#hud').innerHTML = '';
  }
}

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game) return;
  game.update(dt);
  if (!game.paused || game.mp) game.render(dt);
}
requestAnimationFrame(frame);

function startRace(mpStart) {
  audio.init(); // create / unlock audio inside the user gesture (iOS)
  input.setMode({ touchSteer: settings.touchSteer, autoGas: settings.autoGas });
  input.setBinds(settings.binds); input.sens = settings.steerSens / 100;
  applyTouchLayout();
  if (IS_TOUCH && settings.touchSteer === 'tilt') input.enableTilt();
  document.body.classList.toggle('steer-buttons', settings.touchSteer === 'buttons');
  document.body.classList.toggle('steer-tilt', settings.touchSteer === 'tilt');
  document.body.classList.toggle('steer-wheel', settings.touchSteer === 'wheel' || settings.touchSteer === 'tilt');
  showScreen('loading');
  $('#hud').classList.remove('active');
  setTimeout(() => {
    if (game) { game.dispose(); game = null; }
    const opts = { ...settings };
    if (mpStart) Object.assign(opts, { laps: mpStart.laps, weather: mpStart.weather, difficulty: mpStart.difficulty, track: mpStart.track || 'barcelona', tod: mpStart.tod || 'noon', mp: { net, start: mpStart } });
    game = new Game(opts);
    $('#res-again').textContent = mpStart ? 'Zur Lobby' : 'Nochmal fahren';
    window.__game = game; window.__input = input;
    showScreen('none');
    $('#hud').classList.add('active');
    document.body.classList.add('ingame');
  }, 60);
}

function quitToMenu() {
  if (game && game.mp) net.leave();
  if (game) { game.dispose(); game = null; }
  $('#pause').classList.remove('active');
  $('#hud').classList.remove('active');
  document.body.classList.remove('ingame');
  showScreen('menu');
}

// buttons
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  audio.init();
  if (act === 'start') startRace();
  if (act === 'setup') showScreen('setup');
  if (act === 'controls') showScreen('controls');
  if (act === 'menu') quitToMenu();
  if (act === 'resume') game && game.togglePause(false);
  if (act === 'restart') {
    $('#pause').classList.remove('active');
    if (game && game.mp) backToLobby(); else startRace();
  }
  if (act === 'mp') mpEnter();
  if (act === 'mp-back') { net.leave(); showScreen('menu'); }
  if (act === 'quit') quitToMenu();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.paused && !game.mp) game.togglePause(true); });

// ------------------------------------------------------------------ multiplayer lobby
const net = new Net();
const myName = () => clean(settings.mpName) || (DRIVERS.find((d) => d.name === settings.driver) || DRIVERS[0]).name;
const meInfo = () => ({ name: myName(), drv: settings.driver });
function mpShow(part) { for (const id of ['mp-offline', 'mp-connecting', 'mp-home', 'mp-lobby']) $('#' + id).hidden = id !== part; }
function mpToast(text) { const l = $('#mp-list'); const p = document.createElement('p'); p.className = 'err'; p.textContent = text; l.prepend(p); setTimeout(() => p.remove(), 4000); }

async function mpEnter() {
  showScreen('mp');
  const d = DRIVERS.find((x) => x.name === settings.driver) || DRIVERS[0];
  $('#mp-car').textContent = `${d.name} · ${d.team.name}`;
  $('#mp-name').value = myName();
  if (net.race) { mpShow('mp-lobby'); renderLobby(); return; }
  mpShow('mp-connecting');
  const room = await net.init();
  if (!room) { mpShow('mp-offline'); return; }
  mpShow('mp-home'); renderLobby();
}

function renderLobby() {
  const list = $('#mp-list');
  if (!$('#mp-home').hidden) {
    $('#mp-open').hidden = !net.canList;
    const races = net.openRaces();
    const keep = [...list.querySelectorAll('.err')];
    list.innerHTML = '';
    keep.forEach((k) => list.appendChild(k));
    if (!races.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = net.canList ? 'Gerade ist kein Rennen offen. Erstelle eins und gib deinen Freunden den Code.' : 'Erstelle ein Rennen und gib deinen Freunden den Code, oder gib den Code deines Freundes oben ein.'; list.appendChild(p); }
    for (const r of races) {
      const b = document.createElement('button'); b.className = 'race-item'; b.disabled = r.racing;
      const code = document.createElement('b'); code.textContent = r.code;
      const who = document.createElement('span'); who.textContent = `${r.name} · ${r.n} Fahrer`;
      const st = document.createElement('i'); st.textContent = r.racing ? 'läuft' : 'beitreten ›';
      b.append(code, who, st);
      b.addEventListener('click', () => mpJoin(r.code));
      list.appendChild(b);
    }
  }
  if (!$('#mp-lobby').hidden && net.race) {
    $('#lobby-code').textContent = net.code;
    const ps = net.players();
    $('#lobby-count').textContent = `(${ps.length})`;
    const box = $('#lobby-players'); box.innerHTML = '';
    for (const p of ps) {
      const d = DRIVERS.find((x) => x.name === p.drv) || DRIVERS[0];
      const row = document.createElement('div'); row.className = 'lp' + (p.me ? ' me' : '');
      row.style.setProperty('--tc', hex(d.team.body === 0xf0f0f0 || d.team.body === 0x161616 ? d.team.accent : d.team.body));
      const n = document.createElement('b'); n.textContent = p.name;
      const c = document.createElement('span'); c.textContent = `${d.name} · ${d.team.name}`;
      row.append(n, c);
      if (p.host) { const t = document.createElement('i'); t.textContent = 'GASTGEBER'; row.append(t); }
      if (p.me) { const t = document.createElement('i'); t.className = 'you'; t.textContent = 'DU'; row.append(t); }
      box.appendChild(row);
    }
    document.body.classList.toggle('mp-host', net.isHost);
    const h = net.hostPeer();
    const cfg = h && h.presence.cfg;
    const W = { dynamic: 'Wechselhaft', wet: 'Regen', dry: 'Trocken' };
    const tName = cfg && cfg.track ? trackById(cfg.track).name : '';
    const tTime = cfg && cfg.tod ? (TIMES.find((x) => x.id === cfg.tod) || {}).name : '';
    $('#lobby-set').textContent = cfg ? `${tName} · ${tTime} · ${cfg.laps} Runden · ${W[cfg.weather] || ''} · ${cfg.ai ? '+' + cfg.ai + ' KI' : 'ohne KI'}` : '';
    // only in the lobby screen: a host missing for 6 s straight has left
    const inLobby = !game && document.querySelector('.screen.active')?.id === 'mp';
    if (h) net.hostSeenAt = performance.now();
    if (inLobby && !h && !net.isHost && performance.now() - (net.hostSeenAt || net.joinedAt || 0) > 6000) { mpLeave(); mpToast(`Der Gastgeber von Rennen ${net.code || ''} ist nicht mehr da.`); }
  }
}
net.on(renderLobby);

function mpSendCfg() {
  if (net.race && net.isHost) net.race.presence({ cfg: { laps: settings.laps, weather: settings.weather, ai: settings.mpAI, track: settings.track, tod: settings.tod } }).catch(() => {});
}

async function mpCreate() {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  net.myName = myName();
  try { await net.open(code, true, meInfo()); } catch (e) {
    if (e && e.code === 'unavailable-id') return mpCreate(); // code already taken: pick another
    mpToast(e && e.code === 'browser-incompatible' ? 'Dein Browser unterstützt keine Direktverbindungen (WebRTC).' : 'Rennen konnte nicht erstellt werden. Prüf deine Internetverbindung und versuch es nochmal.'); return;
  }
  mpSendCfg();
  mpShow('mp-lobby'); renderLobby();
}

async function mpJoin(code) {
  code = String(code || '').replace(/\D/g, '').slice(0, 4);
  if (code.length !== 4) { mpToast('Gib den 4-stelligen Code ein.'); return; }
  try { await net.open(code, false, meInfo()); } catch (e) {
    await net.leave();
    mpToast(e && e.code === 'peer-unavailable' ? `Kein offenes Rennen mit Code ${code}.` : 'Beitreten hat nicht geklappt. Prüf den Code und deine Internetverbindung.'); return;
  }
  net.joinedAt = performance.now(); net.hostSeenAt = 0;
  mpShow('mp-lobby'); renderLobby();
  setTimeout(() => { if (!game && net.race && net.code === code && !net.hostSeenAt) { mpLeave(); mpToast(`Kein offenes Rennen mit Code ${code}.`); } }, 5000);
}

async function mpLeave() { await net.leave(); mpShow('mp-home'); renderLobby(); }

function mpStart() {
  if (!net.isHost || !net.race) return;
  const humans = net.players();
  for (let i = humans.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [humans[i], humans[j]] = [humans[j], humans[i]]; }
  const taken = new Set(humans.map((h) => h.drv));
  const ai = DRIVERS.filter((d) => !taken.has(d.name)).sort((a, b) => b.team.pace - a.team.pace).slice(0, Math.min(+settings.mpAI || 0, 20 - humans.length));
  const start = {
    id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    seed: Math.floor(Math.random() * 2 ** 31), laps: settings.laps, weather: settings.weather, difficulty: settings.difficulty, track: settings.track, tod: settings.tod,
    slots: [...humans.map((h) => ({ h: h.peer, n: h.name, d: h.drv })), ...ai.map((d) => ({ a: d.name }))],
  };
  net.startRace(start);
  startRace(start);
}
net.onStart = (start) => {
  // a client follows the host's start signal from the lobby or the results screen
  const where = document.querySelector('.screen.active');
  if (game && game.mp && !game.resultsShown) { game.dispose(); game = null; }
  if (!game || (where && where.id === 'results')) startRace(start);
};

function backToLobby() {
  if (game) { game.dispose(); game = null; }
  $('#hud').classList.remove('active');
  document.body.classList.remove('ingame');
  net.backToLobby();
  showScreen('mp'); mpShow('mp-lobby'); renderLobby();
}

$('#mp-create').addEventListener('click', mpCreate);
$('#mp-join').addEventListener('click', () => mpJoin($('#mp-code').value));
$('#mp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') mpJoin($('#mp-code').value); });
$('#mp-leave').addEventListener('click', mpLeave);
$('#mp-start').addEventListener('click', mpStart);
$('#mp-name').addEventListener('change', () => {
  settings.mpName = clean($('#mp-name').value); save();
  $('#mp-name').value = myName();
  if (net.race) net.race.presence({ name: myName() }).catch(() => {});
  net.myName = myName(); net.advertise();
});
addEventListener('keydown', (e) => {
  if (game) return;
  if (e.code === 'Enter') {
    const active = document.querySelector('.screen.active');
    if (active && (active.id === 'menu' || active.id === 'setup')) startRace();
  }
});

buildMenu();
resize();
// fullscreen (not available on iPhone Safari; add to home screen instead)
{
  const fsBtn = $('#fs-btn');
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.hidden = true;
  fsBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { await req.call(el); try { await screen.orientation.lock('landscape'); } catch (_) { /* optional */ } }
    } catch (_) { fsBtn.hidden = true; }
  });
}
showScreen('menu');
// Menu backdrop: slowly orbiting camera around a car
(function menuBackdrop() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(4, 6, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff3030, 4); rim.position.set(-5, 2, -4); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.25, metalness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  let car = null, carName = '';
  const c2 = $('#menu-bg');
  const r2 = new THREE.WebGLRenderer({ canvas: c2, antialias: true, alpha: false });
  r2.outputColorSpace = THREE.SRGBColorSpace; r2.toneMapping = THREE.ACESFilmicToneMapping;
  const pm = new THREE.PMREMGenerator(r2);
  const env = new THREE.Scene(); env.add(new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ map: TX.sky(false), side: THREE.BackSide })));
  scene.environment = pm.fromScene(env).texture;
  function loop(t) {
    requestAnimationFrame(loop);
    if (game) return;
    if (carName !== settings.driver) {
      if (car) scene.remove(car);
      const d = DRIVERS.find((x) => x.name === settings.driver) || DRIVERS[0];
      car = buildCar(d.team, false, d.number); scene.add(car); carName = settings.driver;
    }
    const w = c2.clientWidth, h = c2.clientHeight;
    if (c2.width !== Math.floor(w * Math.min(devicePixelRatio, 2))) { r2.setPixelRatio(Math.min(devicePixelRatio, 2)); r2.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const a = t * 0.00015;
    cam.position.set(Math.sin(a) * 9, 2.4, Math.cos(a) * 9);
    cam.lookAt(0, 0.4, 0);
    r2.render(scene, cam);
  }
  requestAnimationFrame(loop);
})();
