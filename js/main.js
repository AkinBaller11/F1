import * as THREE from 'three';
import { Track, HALF_W } from './track.js';
import { TEAMS, buildCar, buildCockpit } from './models.js';
import { PlayerCar, AICar } from './physics.js';
import { HUD, fmtTime } from './hud.js';
import { Audio } from './audio.js';
import { Weather } from './weather.js';
import { Input, IS_TOUCH } from './input.js';
import * as TX from './textures.js';

const $ = (s) => document.querySelector(s);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ settings / menu
const DRIVERS = [];
TEAMS.forEach((t) => t.drivers.forEach((d, i) => DRIVERS.push({ team: t, name: d, number: t.numbers[i] })));

const defaults = { driver: 'HAMILTON', laps: 5, weather: 'dynamic', difficulty: 75, grid: 8, gearbox: 'auto', brakeAssist: false, autoGas: false, line: 'corners', camera: 'cockpit', quality: 'high', touchSteer: 'joystick' };
// friendlier defaults on phones / tablets
if (IS_TOUCH) Object.assign(defaults, { quality: 'medium', brakeAssist: true, line: 'full', difficulty: 60 });
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem('apexgp25') || '{}')); } catch (e) { /* storage unavailable */ }
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
  // option selectors
  document.querySelectorAll('.opt').forEach((o) => {
    const key = o.dataset.key;
    const vals = JSON.parse(o.dataset.vals), labels = JSON.parse(o.dataset.labels);
    const label = o.querySelector('.val');
    const render = () => { const i = vals.indexOf(settings[key]); label.textContent = labels[i < 0 ? 0 : i]; };
    const step = (d) => { let i = vals.indexOf(settings[key]); i = (i + d + vals.length) % vals.length; settings[key] = vals[i]; save(); render(); };
    o.querySelector('.l').addEventListener('click', () => step(-1));
    o.querySelector('.r').addEventListener('click', () => step(1));
    render();
  });
  const diff = $('#difficulty');
  diff.value = settings.difficulty; $('#diff-val').textContent = settings.difficulty;
  diff.addEventListener('input', () => { settings.difficulty = +diff.value; $('#diff-val').textContent = diff.value; save(); });
  updateLivery();
}

function updateLivery() {
  const d = DRIVERS.find((x) => x.name === settings.driver) || DRIVERS[0];
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
  if (game) { game.camera.aspect = w / h; game.camera.updateProjectionMatrix(); }
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

// ------------------------------------------------------------------ game
class Game {
  constructor(opts) {
    this.opts = opts;
    const scene = (this.scene = new THREE.Scene());
    // weather first: it decides how wet the track starts
    this.weather = new Weather(scene, opts.weather, opts.laps * 95, opts.quality);
    const wet = this.weather.wetness > 0.4; // tyre choice at the start
    this.startWet = wet;
    scene.fog = new THREE.FogExp2(0xc9dcec, 0.0006);
    renderer.shadowMap.enabled = opts.quality !== 'low';

    // sky (dry dome + overcast dome cross-faded by the weather) + environment
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.MeshBasicMaterial({ map: TX.sky(false), side: THREE.BackSide, fog: false }));
    const skyWet = new THREE.Mesh(new THREE.SphereGeometry(2900, 32, 16), new THREE.MeshBasicMaterial({ map: TX.sky(true), side: THREE.BackSide, fog: false, transparent: true, opacity: 0, depthWrite: false }));
    sky.add(skyWet);
    scene.add(sky); this.sky = sky; this.skyWet = skyWet;
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: TX.sky(false), side: THREE.BackSide })));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0x51703f }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1; envScene.add(ground);
    scene.environment = pm.fromScene(envScene, 0.04).texture;

    const hemi = (this.hemi = new THREE.HemisphereLight(0xdbe8ff, 0x5a6b3c, 1.1));
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1dd, 2.6));
    sun.position.set(80, 140, 60);
    sun.castShadow = opts.quality !== 'low';
    const sz = opts.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 400;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    this.track = new Track(scene, { wetness: this.weather.wetness, quality: opts.quality });
    this.applyWeather(0, true);

    // camera
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 5000);
    this.camMode = opts.camera;

    // player
    const pd = DRIVERS.find((d) => d.name === opts.driver) || DRIVERS[0];
    this.player = new PlayerCar(this.track, { manual: opts.gearbox === 'manual', brakeAssist: opts.brakeAssist });
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

    // grid order: player at chosen slot, others ordered by pace with some randomness
    const others = DRIVERS.filter((d) => d !== pd);
    others.sort((a, b) => (b.team.pace + Math.random() * 0.02) - (a.team.pace + Math.random() * 0.02));
    const gridSlot = opts.grid === 'random' ? (Math.random() * 20) | 0 : Math.min(19, opts.grid - 1);
    const lineup = others.slice(); lineup.splice(gridSlot, 0, pd);
    const diffF = 0.86 + (opts.difficulty / 110) * 0.14;
    this.cars = [];
    const L = this.track.length;
    this.cpN = Math.ceil((opts.laps * L + 1200) / 50);
    lineup.forEach((d, g) => {
      const gs = this.track.startS - 8 - g * 8;
      const lat = g % 2 === 0 ? -2.6 : 2.6;
      const dist0 = gs - this.track.startS;
      let entry;
      if (d === pd) {
        this.player.placeAt(gs, lat);
        this.player.dist = dist0;
        entry = { isPlayer: true, team: d.team, name: d.name, number: d.number, obj: this.player, mesh: this.playerRoot };
      } else {
        const skill = diffF * (1 - (1 - d.team.pace) * 0.55) * (0.993 + Math.random() * 0.007);
        const ai = new AICar(this.track, d.team, d.name, d.number, skill);
        ai.dist = dist0; ai.lat = lat; ai.latOff = lat - this.track.racingLat(gs);
        ai.computePose();
        const mesh = buildCar(d.team, wet, d.number, { second: d.team.drivers.indexOf(d.name) === 1 });
        scene.add(mesh);
        entry = { isPlayer: false, team: d.team, name: d.name, number: d.number, obj: ai, mesh };
      }
      entry.cp = new Float32Array(this.cpN).fill(-1); entry.lastCp = -1;
      entry.finished = false; entry.finishTime = 0; entry.grid = g + 1;
      this.cars.push(entry);
    });
    this.playerEntry = this.cars.find((c) => c.isPlayer);
    this.aiList = this.cars.filter((c) => !c.isPlayer).map((c) => c.obj);

    this.buildRacingLineMesh();

    // race state
    this.laps = opts.laps;
    this.state = 'grid'; this.stateT = 0; this.time = 0; this.raceTime = 0;
    this.lightsHold = 0.6 + Math.random() * 2.2;
    this.lap = { start: 0, best: Infinity, sectorStart: 0, sector: 0, sectorBest: [Infinity, Infinity, Infinity], states: ['', '', ''], invalid: false, lapNo: 0 };
    this.trackWarnings = 0; this.offWasOn = false;
    this.hud = new HUD($('#hud'), opts.laps);
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
    this.skyWet.material.opacity = o;
    this.scene.fog.density = L(0.00055, 0.0042 * (0.45 + 0.55 * r));
    this.scene.fog.color.setRGB(L(0.79, 0.66), L(0.86, 0.69), L(0.93, 0.71));
    this.sun.intensity = L(2.6, 0.9);
    this.sun.color.setRGB(1, L(0.945, 0.9), L(0.87, 0.92));
    this.sun.shadow.radius = L(2, 6);
    this.hemi.intensity = L(1.1, 1.2);
    this.hemi.color.setRGB(L(0.86, 0.77), L(0.91, 0.8), L(1, 0.83));
    this.scene.environmentIntensity = L(0.9, 0.7);
    renderer.toneMappingExposure = L(1.05, 0.95);
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
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.obj.dist - a.obj.dist;
    });
    return cars;
  }

  update(dt) {
    const inp = input.poll();
    if (input.was('Escape') || input.was('KeyP')) { this.togglePause(); }
    if (this.paused) { input.endFrame(); return; }
    if (input.was('KeyC')) this.cycleCamera();
    if (input.was('KeyV')) this.cycleCamera(-1);
    this.lookBack = input.keys.has('KeyB') || input.touch.look;
    if (input.was('KeyM')) { const m = audio.toggleMute(); this.hud.camHint(m ? 'TON AUS' : 'TON AN'); }
    if (input.was('KeyR') && this.state === 'race') this.resetCar();

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
    if (racing) for (const ai of this.aiList) ai.update(dt, this.raceTime, this.allObjs(), this.track.mu);
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
      if (!c.finished && racing && c.obj.dist >= this.laps * L) {
        c.finished = true; c.finishTime = t;
        if (c.isPlayer) this.onPlayerFinish();
      }
    }
    if (racing) this.updateLapTiming();

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
    // AI meshes
    const blink = (performance.now() / 250 | 0) % 2;
    const rainLights = this.weather.rain > 0.15 || this.weather.wetness > 0.5;
    this.applyWeather(dt);
    for (const c of this.cars) {
      if (c.isPlayer) continue;
      const o = c.obj, m = c.mesh;
      const far = Math.hypot(o.x - p.x, o.z - p.z) > 650;
      m.visible = !far;
      if (far) continue;
      m.position.set(o.x, 0, o.z);
      m.rotation.y = o.yaw;
      for (const w of m.userData.wheels) { w.wheel.rotation.x = -o.wheelRot; if (w.front) w.pivot.rotation.y = -o.steerVis * 0.5; }
      m.userData.rainLight.material.color.setHex(rainLights && blink ? 0xff2020 : 0x330000);
    }
    this.playerModel.userData.rainLight.material.color.setHex(rainLights && blink ? 0xff2020 : 0x330000);
    // sun/shadow follow
    this.sun.position.set(p.x + 80, 140, p.z + 60);
    this.sun.target.position.set(p.x, 0, p.z);
    this.sky.position.set(p.x, 0, p.z);

    this.updateRacingLine();
    this.weather.update(dt, this.camWorld(), p.v, this.aiList.filter((a) => Math.hypot(a.x - p.x, a.z - p.z) < 160), this.camMode === 'cockpit');
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
    renderer.render(this.scene, cam);

    this.hud.update(dt, p, {
      playerLap: Math.max(1, this.lap.lapNo + 1), curLapTime: this.state === 'grid' ? 0 : this.raceTime - this.lap.start,
      bestLap: this.lap.best, playerPos: this.playerPos || this.playerEntry.grid, total: this.cars.length,
      order: this.order || this.cars, gapTo: (c) => this.gapTo(c), wet: this.startWet, time: this.raceTime, weather: this.weather,
    });
    audio.update(p, this.aiList, this.camMode === 'cockpit');
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
    if (this.paused) audio.ctx && audio.ctx.suspend(); else audio.resume();
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
  if (!game.paused) game.render(dt);
}
requestAnimationFrame(frame);

function startRace() {
  audio.init(); // create / unlock audio inside the user gesture (iOS)
  input.setMode({ touchSteer: settings.touchSteer, autoGas: settings.autoGas });
  if (IS_TOUCH && settings.touchSteer === 'tilt') input.enableTilt();
  document.body.classList.toggle('steer-buttons', settings.touchSteer === 'buttons');
  document.body.classList.toggle('steer-tilt', settings.touchSteer === 'tilt');
  showScreen('loading');
  $('#hud').classList.remove('active');
  setTimeout(() => {
    if (game) { game.dispose(); game = null; }
    game = new Game({ ...settings });
    window.__game = game; window.__input = input;
    showScreen('none');
    $('#hud').classList.add('active');
    document.body.classList.add('ingame');
  }, 60);
}

function quitToMenu() {
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
  if (act === 'restart') { $('#pause').classList.remove('active'); startRace(); }
  if (act === 'quit') quitToMenu();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.paused) game.togglePause(true); });
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
