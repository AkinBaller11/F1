import * as THREE from 'three';
import { Track, HALF_W, brakeDecel as brakeDecelAt } from './track.js';
import { TEAMS, buildCar, buildCockpit } from './models.js';
import { PlayerCar, AICar } from './physics.js';
import { HUD, fmtTime } from './hud.js';
import { Audio } from './audio.js';
import { Weather } from './weather.js';
import { Input, IS_TOUCH, ACTIONS, DEFAULT_BINDS, keyLabel } from './input.js';
import { Net, rng, clean } from './net.js';
import { APP_VERSION } from './version.js';
import * as TX from './textures.js';
import { TRACKS, TIMES, trackById } from './tracks.js';
import { TOD, skyTexture, sunDir, sunSprite } from './tod.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const $ = (s) => document.querySelector(s);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ settings / menu
const DRIVERS = [];
TEAMS.forEach((t) => t.drivers.forEach((d, i) => DRIVERS.push({ team: t, name: d, number: t.numbers[i] })));

const defaults = {
  driver: 'HAMILTON', track: 'barcelona', tod: 'noon', laps: 5, weather: 'dynamic', difficulty: 75, grid: 8, camera: 'cockpit', quality: 'high',
  profile: 'normal', gearbox: 'auto', brakeAssist: true, autoGas: false, steerAssist: 'light', autoDrs: true, autoErs: true, line: 'corners', steerSens: 100, binds: {},
  touchSteer: 'wheel', wheelSize: 'm', touchSide: 'right', mpName: '', mpAI: 4, carStyle: 'modern', retro: false,
  // graphics
  renderScale: 100, shadows: true, bloom: 'auto', trees: 'auto', fpsLimit: 0,
  // camera
  fov: 72, dynFov: true, headMove: 70, shake: 60, mirrors: true, hands: true, speedFx: true,
  // display
  hudTower: true, hudTiming: true, hudWeather: true, hudMap: true, hudDash: true, hudMsg: true, droplets: true, hudScale: 100, units: 'kmh', hudMode: 'full',
  // audio
  volMaster: 80, volEngine: 80, volFx: 80, volAmb: 70,
  // touch
  touchOpacity: 85, vibrate: true,
};

// settings screen definition: tab, key, label, options or range; `next` = applies from the next race
const ONOFF = { vals: [true, false], labels: ['An', 'Aus'] };
const SETTINGS = [
  { tab: 'Grafik', items: [
    { key: 'quality', label: 'Grafik-Voreinstellung', vals: ['ultra', 'high', 'medium', 'low'], labels: ['Ultra', 'Hoch', 'Mittel', 'Niedrig'], next: true, hint: 'Ultra: 4K-Schatten, 8× Kantenglättung, Grasbüschel, Linsenreflexe. Für starke PCs und neue iPads.' },
    { key: 'renderScale', label: 'Auflösung', range: [50, 100, 5], unit: '%', hint: 'Weniger = flüssiger auf Handy und Tablet.' },
    { key: 'shadows', label: 'Schatten', ...ONOFF, next: true },
    { key: 'bloom', label: 'Glüheffekt', vals: ['auto', 'on', 'off'], labels: ['Automatisch', 'An', 'Aus'], next: true, hint: 'Leuchtende Lampen, Neon und Sonne.' },
    { key: 'trees', label: 'Bäume & Details', vals: ['auto', 'ultra', 'high', 'medium', 'low'], labels: ['Automatisch', 'Sehr viele', 'Viele', 'Mittel', 'Wenige'], next: true },
    { key: 'fpsLimit', label: 'Bildrate begrenzen', vals: [0, 60, 30], labels: ['Unbegrenzt', '60 FPS', '30 FPS'], hint: '30 FPS schont den Akku.' },
  ] },
  { tab: 'Fahrzeug', items: [
    { key: 'carStyle', label: 'Fahrzeug', vals: ['modern', 'classic'], labels: ['Modern (2025)', 'Klassik (90er)'], next: true, hint: 'Klassik: hohe Nase, kein Halo, offene Felgen.' },
    { key: 'retro', label: 'Lackierungen', vals: [false, true], labels: ['Aktuell', 'Retro'], next: true, hint: 'Retro: Farben im Stil der 80er und 90er.' },
  ] },
  { tab: 'Kamera', items: [
    { key: 'camera', label: 'Start-Kamera', vals: ['helmet', 'cockpit', 'tcam', 'sidepod', 'nose', 'wing', 'rear', 'chase', 'far', 'heli', 'tv'], labels: ['Helm', 'Cockpit', 'T-Kamera', 'Seitenkasten', 'Nase', 'Frontflügel', 'Heck', 'Verfolger', 'Verfolger weit', 'Helikopter', 'TV-Kamera'] },
    { key: 'fov', label: 'Sichtfeld (Cockpit & Helm)', range: [55, 95, 1], unit: '°' },
    { key: 'dynFov', label: 'Sichtfeld wächst mit Tempo', ...ONOFF },
    { key: 'headMove', label: 'Kopfbewegung (G-Kräfte)', range: [0, 100, 5], unit: '%' },
    { key: 'shake', label: 'Kamera-Wackeln', range: [0, 100, 5], unit: '%' },
    { key: 'speedFx', label: 'Tempo-Effekt am Bildrand', ...ONOFF },
    { key: 'mirrors', label: 'Rückspiegel', ...ONOFF },
    { key: 'hands', label: 'Hände am Lenkrad', ...ONOFF },
  ] },
  { tab: 'Anzeige', items: [
    { key: 'hudMode', label: 'HUD', vals: ['full', 'minimal', 'off'], labels: ['Voll', 'Clean', 'Aus'], hint: 'Clean: nur Position und eine schlichte Gang/Tempo-Anzeige. Umschalten mit H oder dem Augen-Knopf.' },
    { key: 'hudTower', label: 'Positionsliste', ...ONOFF },
    { key: 'hudTiming', label: 'Position & Rundenzeit', ...ONOFF },
    { key: 'hudWeather', label: 'Wettervorhersage', ...ONOFF },
    { key: 'hudMap', label: 'Minikarte', ...ONOFF },
    { key: 'hudDash', label: 'Tacho & Gang', ...ONOFF },
    { key: 'hudMsg', label: 'Meldungen', ...ONOFF },
    { key: 'line', label: 'Ideallinie', vals: ['corners', 'full', 'off'], labels: ['Nur Kurven', 'Voll', 'Aus'], next: true },
    { key: 'droplets', label: 'Regentropfen auf dem Visier', ...ONOFF },
    { key: 'units', label: 'Einheit', vals: ['kmh', 'mph'], labels: ['km/h', 'mph'] },
    { key: 'hudScale', label: 'HUD-Größe', range: [70, 130, 5], unit: '%' },
  ] },
  { tab: 'Audio', items: [
    { key: 'volMaster', label: 'Gesamt', range: [0, 100, 5], unit: '%' },
    { key: 'volEngine', label: 'Motor', range: [0, 100, 5], unit: '%' },
    { key: 'volFx', label: 'Effekte & Signale', range: [0, 100, 5], unit: '%' },
    { key: 'volAmb', label: 'Umgebung (Wind, Regen)', range: [0, 100, 5], unit: '%' },
  ] },
  { tab: 'Touch', items: [
    { key: 'touchSteer', label: 'Lenkung', vals: ['wheel', 'joystick', 'buttons', 'tilt'], labels: ['Lenkrad', 'Joystick', 'Tasten', 'Neigen'], next: true },
    { key: 'wheelSize', label: 'Lenkrad-Größe', vals: ['s', 'm', 'l'], labels: ['Klein', 'Mittel', 'Groß'] },
    { key: 'touchSide', label: 'Pedale', vals: ['right', 'left'], labels: ['Rechts', 'Links'] },
    { key: 'touchOpacity', label: 'Deckkraft der Tasten', range: [30, 100, 5], unit: '%' },
    { key: 'vibrate', label: 'Vibration (Android)', ...ONOFF, hint: 'Bei Kollisionen und auf Kerbs. iPhone unterstützt das im Browser nicht.' },
  ] },
];
// assist profiles: one tap sets everything
const PROFILES = {
  easy: { autoGas: true, brakeAssist: true, steerAssist: true, autoDrs: true, autoErs: true, line: 'full', gearbox: 'auto' },
  normal: { autoGas: false, brakeAssist: true, steerAssist: 'light', autoDrs: true, autoErs: true, line: 'corners', gearbox: 'auto' },
  pro: { autoGas: false, brakeAssist: false, steerAssist: false, autoDrs: false, autoErs: false, line: 'off', gearbox: 'manual' },
};
const PROFILE_KEYS = Object.keys(PROFILES.easy);
// friendlier defaults on phones / tablets
if (IS_TOUCH) Object.assign(defaults, { quality: 'medium', difficulty: 60, profile: 'easy', ...PROFILES.easy });
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem('apexgp25') || '{}')); } catch (e) { /* storage unavailable */ }
// the on-screen wheel replaced the joystick as default touch steering
if (!settings.lightIntro) { if (settings.profile === 'normal' && settings.steerAssist === false) settings.steerAssist = 'light'; settings.lightIntro = true; }
if (!settings.wheelIntro) { if (settings.touchSteer === 'joystick') settings.touchSteer = 'wheel'; settings.wheelIntro = true; }
document.body.classList.toggle('touch', IS_TOUCH);

// behave like an app: no pinch/double-tap zoom, no long-press copy menu or blue text selection
{
  const editable = (t) => t && t.closest && t.closest('input, textarea, select, [contenteditable]');
  const block = (e) => { if (!editable(e.target)) e.preventDefault(); };
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'selectstart', 'contextmenu', 'dragstart', 'dblclick']) document.addEventListener(ev, block, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = e.timeStamp;
    if (now - lastTap < 320 && e.changedTouches.length === 1 && !editable(e.target) && !e.target.closest('button, a, label')) e.preventDefault();
    lastTap = now;
  }, { passive: false });
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });
}
const save = () => { try { localStorage.setItem('apexgp25', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

function renderSettingsScreen() {
  const tabs = $('#set-tabs'), panes = $('#set-panes');
  tabs.innerHTML = ''; panes.innerHTML = '';
  let active = 0;
  try { active = +(sessionStorage.getItem('apexgp25-tab') || 0); } catch (_) { /* ignore */ }
  SETTINGS.forEach((sec, ti) => {
    if (sec.tab === 'Touch' && !IS_TOUCH) return;
    const b = document.createElement('button');
    b.className = 'tab'; b.textContent = sec.tab; b.setAttribute('role', 'tab');
    const pane = document.createElement('div'); pane.className = 'pane';
    for (const it of sec.items) {
      const row = document.createElement('div');
      const name = it.label + (it.next ? ' ●' : '');
      if (it.range) {
        row.className = 'slider set-range';
        row.innerHTML = `<span></span><input type="range" min="${it.range[0]}" max="${it.range[1]}" step="${it.range[2]}" id="set-${it.key}"><b></b>`;
        row.querySelector('span').textContent = name;
        const inp = row.querySelector('input'), out = row.querySelector('b');
        inp.value = settings[it.key]; out.textContent = settings[it.key] + it.unit;
        inp.addEventListener('input', () => { settings[it.key] = +inp.value; out.textContent = inp.value + it.unit; save(); applyLive(); });
      } else {
        row.className = 'opt';
        row.dataset.key = it.key; row.dataset.vals = JSON.stringify(it.vals); row.dataset.labels = JSON.stringify(it.labels);
        row.innerHTML = '<span></span><button class="l">‹</button><span class="val"></span><button class="r">›</button>';
        row.querySelector('span').textContent = name;
      }
      pane.appendChild(row);
      if (it.hint) { const h = document.createElement('p'); h.className = 'set-hint'; h.textContent = it.hint; pane.appendChild(h); }
    }
    const idx = panes.childElementCount;
    b.addEventListener('click', () => {
      tabs.querySelectorAll('.tab').forEach((x, i) => x.classList.toggle('sel', i === idx));
      panes.querySelectorAll('.pane').forEach((x, i) => { x.hidden = i !== idx; });
      try { sessionStorage.setItem('apexgp25-tab', idx); } catch (_) { /* ignore */ }
    });
    tabs.appendChild(b); panes.appendChild(pane);
  });
  const n = panes.childElementCount, sel = Math.min(active, n - 1);
  tabs.querySelectorAll('.tab').forEach((x, i) => x.classList.toggle('sel', i === sel));
  panes.querySelectorAll('.pane').forEach((x, i) => { x.hidden = i !== sel; });
}

// settings that take effect immediately (HUD, audio, camera, touch, resolution)
function applyLive() {
  const B = document.body.classList, S = settings, mode = S.hudMode;
  B.toggle('hide-tower', !S.hudTower || mode !== 'full');
  B.toggle('hide-timing', !S.hudTiming || mode === 'off');
  B.toggle('hide-weather', !S.hudWeather || mode !== 'full');
  B.toggle('hide-map', !S.hudMap || mode !== 'full');
  B.toggle('hide-dash', !S.hudDash || mode !== 'full');
  B.toggle('hud-minimal', mode === 'minimal');
  B.toggle('hide-msg', !S.hudMsg || mode === 'off');
  document.documentElement.style.setProperty('--hud-scale', S.hudScale / 100);
  document.documentElement.style.setProperty('--touch-opacity', S.touchOpacity / 100);
  audio.setVolumes({ master: S.volMaster, engine: S.volEngine, fx: S.volFx, amb: S.volAmb });
  input.sens = S.steerSens / 100;
  applyTouchLayout();
  resize();
  if (game) { game.applyCamera(true); game.updateMirrors(); }
}

function cycleHud() {
  const order = ['full', 'minimal', 'off'];
  settings.hudMode = order[(order.indexOf(settings.hudMode) + 1) % 3]; save(); renderOpts(); applyLive();
  showToast({ full: 'HUD: Voll', minimal: 'HUD: Clean', off: 'HUD: Aus' }[settings.hudMode], 1200);
}

let toastT = 0;
function showToast(text, ms = 3500) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}

// fullscreen: works on desktop, Android and iPad; iPhone Safari only via "Add to Home Screen"
function fsSupported() { const el = document.documentElement; return !!(el.requestFullscreen || el.webkitRequestFullscreen) && (document.fullscreenEnabled || document.webkitFullscreenEnabled); }
async function toggleFullscreen() {
  const el = document.documentElement;
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  if (!fsSupported()) {
    const ios = /iPhone|iPod/.test(navigator.userAgent);
    showToast(ios ? 'Auf dem iPhone geht Vollbild über „Teilen → Zum Home-Bildschirm“. Dann startet das Spiel als Vollbild-App.' : 'Vollbild ist hier nicht verfügbar. Öffne das Spiel direkt im Browser.', 6000);
    return;
  }
  try {
    if (isFs) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { await (el.requestFullscreen || el.webkitRequestFullscreen).call(el); try { await screen.orientation.lock('landscape'); } catch (_) { /* optional */ } }
  } catch (_) { showToast('Vollbild wurde vom Browser blockiert. Öffne das Spiel direkt im Browser (nicht eingebettet).', 5000); }
}

function buildMenu() {
  renderSettingsScreen();
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
  bindOpts();
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
  $('#set-reset').addEventListener('click', () => {
    for (const sec of SETTINGS) for (const it of sec.items) settings[it.key] = defaults[it.key];
    save(); renderSettingsScreen(); bindOpts(); renderOpts(); applyLive();
  });
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

function bindOpts() {
  // option selectors (the same key can appear on several screens); bind each element once
  document.querySelectorAll('.opt').forEach((o) => {
    if (o.dataset.bound) return;
    o.dataset.bound = '1';
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
  applyLive();
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
const TMP_V1 = new THREE.Vector3(), TMP_V2 = new THREE.Vector3(), TMP_V3 = new THREE.Vector3(), TMP_C = new THREE.Color(); // per-frame scratch

function resize() {
  const w = innerWidth, h = innerHeight;
  const q = settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'ultra' ? 2.5 : q === 'high' ? 2 : q === 'medium' ? 1.5 : 1) * (settings.renderScale || 100) / 100);
  renderer.setSize(w, h, false);
  if (game) {
    game.camera.aspect = w / h; game.camera.updateProjectionMatrix();
    if (game.composer) { game.composer.setPixelRatio(renderer.getPixelRatio()); game.composer.setSize(w, h); }
  }
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ cameras
const CAMS = {
  helmet: { label: 'HELM', pos: [0, 0.945, 0.05], pitch: -0.035, fov: 72, shake: 1.15, ego: true },
  cockpit: { label: 'COCKPIT', pos: [0, 0.96, 0.02], pitch: -0.045, fov: 72, shake: 1, ego: true },
  tcam: { label: 'T-KAMERA', pos: [0, 1.24, 0.78], pitch: -0.085, fov: 58, shake: 1.0, lean: 0.8, lens: true },
  sidepod: { label: 'SEITENKASTEN', pos: [0.4, 0.8, -0.92], pitch: -0.07, yaw: 0, fov: 78, shake: 0.8, lean: 0.4 },
  nose: { label: 'NASE', pos: [0, 0.5, -2.05], pitch: -0.03, fov: 78, shake: 0.6 },
  wing: { label: 'FRONTFLÜGEL', pos: [0.62, 0.22, -2.35], pitch: 0, fov: 80, shake: 0.5 },
  rear: { label: 'HECK', pos: [0, 1.12, 2.95], pitch: -0.07, yaw: Math.PI, fov: 66, shake: 0.6 },
  chase: { label: 'VERFOLGER', world: true, dist: 6.3, height: 1.85, look: 0.9, fov: 62, shake: 0.25 },
  far: { label: 'VERFOLGER WEIT', world: true, dist: 10.5, height: 3.3, look: 0.6, fov: 56, shake: 0.15 },
  heli: { label: 'HELIKOPTER', world: true, heli: true, fov: 45 },
  tv: { label: 'TV-KAMERA', world: true, tv: true, fov: 30 },
};

// sun lens flare: soft hexagonal ghosts along the line through the screen centre
function makeFlare(tod) {
  const disc = (size, inner, col) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, col); gr.addColorStop(inner, col.replace(/[\d.]+\)$/, '0.25)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  };
  const warm = tod.sunEl < 20;
  const lf = new Lensflare();
  lf.addElement(new LensflareElement(disc(256, 0.2, warm ? 'rgba(255,200,140,0.9)' : 'rgba(255,250,235,0.9)'), 420, 0, new THREE.Color(1, 1, 1)));
  const ghost = disc(128, 0.6, 'rgba(255,255,255,0.35)');
  [[60, 0.6], [90, 0.7], [140, 0.9], [70, 1.0], [180, 1.2]].forEach(([s, d], i) => lf.addElement(new LensflareElement(ghost, s, d, new THREE.Color(i % 2 ? 0.6 : 0.9, i % 2 ? 0.8 : 0.7, 1))));
  return lf;
}

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
    {
      // contact sparks pool
      const max = 160, pos = new Float32Array(max * 3).fill(-50), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.sparkPts = new THREE.Points(g, new THREE.PointsMaterial({ map: TX.particle(), color: 0xffc060, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      this.sparkPts.frustumCulled = false;
      this.sparkPts.userData = { max, pos, vel: new Float32Array(max * 3), life: new Float32Array(max), next: 0 };
      scene.add(this.sparkPts);
    }
    const wet = this.weather.wetness > 0.4; // tyre choice at the start
    this.startWet = wet;
    scene.fog = new THREE.FogExp2(0xc9dcec, 0.0006);
    renderer.shadowMap.enabled = opts.quality !== 'low' && opts.shadows;

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
    if (this.sunSprite) {
      scene.add(this.sunSprite);
      if (opts.quality === 'high' || opts.quality === 'ultra') this.sunSprite.add(makeFlare(tod));
    }
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: tod.lamps > 0.5 ? 0x141a14 : 0x51703f }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1; envScene.add(ground);
    scene.environment = pm.fromScene(envScene, 0.04).texture;

    const hemi = (this.hemi = new THREE.HemisphereLight(tod.hemiSky, tod.hemiGround, tod.hemiInt));
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(tod.sun, tod.sunInt));
    sun.castShadow = opts.quality !== 'low' && opts.shadows;
    const sz = opts.quality === 'ultra' ? 4096 : opts.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const sr = opts.quality === 'ultra' ? 55 : 70;
    const sc = sun.shadow.camera; sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr; sc.near = 10; sc.far = 600;
    sun.shadow.normalBias = 0.02;
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    this.fogClear = new THREE.Color(tod.fog);
    this.fogWet = new THREE.Color(tod.lamps > 0.5 ? 0x1a2030 : 0xa9afb5);
    this.hemiClear = new THREE.Color(tod.hemiSky);
    this.sunClear = new THREE.Color(tod.sun);

    // bloom makes lamps, neon and the sun glow (skipped on low quality)
    this.composer = null;
    const wantBloom = opts.bloom === 'on' || (opts.bloom !== 'off' && (opts.quality === 'high' || opts.quality === 'ultra' || (opts.quality === 'medium' && tod.lamps > 0.5)));
    if (wantBloom) {
      // multisampled target keeps anti-aliasing when post-processing is on
      const pr = renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: opts.quality === 'ultra' ? 8 : 4 });
      const c = new EffectComposer(renderer, rt);
      this.renderPass = new RenderPass(scene, null);
      c.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), tod.lamps > 0.5 ? 0.75 : 0.22, 0.45, tod.lamps > 0.5 ? 0.62 : 0.96);
      c.addPass(this.bloom);
      c.addPass(new OutputPass());
      this.composer = c;
    }

    this.track = new Track(scene, { def: this.def, tod, wetness: this.weather.wetness, quality: opts.quality, trees: opts.trees === 'auto' ? opts.quality : opts.trees });
    this.applyWeather(0, true);

    // camera
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 5000);
    if (this.renderPass) this.renderPass.camera = this.camera;
    this.camMode = opts.camera;

    // player
    const pd = DRIVERS.find((d) => d.name === opts.driver) || DRIVERS[0];
    this.player = new PlayerCar(this.track, { manual: opts.gearbox === 'manual', brakeAssist: opts.brakeAssist, steerAssist: opts.steerAssist, autoDrs: opts.autoDrs, autoErs: opts.autoErs });
    this.player.onShift = (down) => !down && audio.shift();
    this.playerRoot = new THREE.Group(); scene.add(this.playerRoot);
    this.playerBody = new THREE.Group(); this.playerRoot.add(this.playerBody);
        this.mirrorRT = new THREE.WebGLRenderTarget(512, 160);
    this.mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.playerModel = buildCar(pd.team, wet, pd.number, { mirrorTex: this.mirrorRT.texture, second: pd.team.drivers.indexOf(pd.name) === 1, style: opts.carStyle, retro: opts.retro });
    this.playerBody.add(this.playerModel);
    this.cockpit = buildCockpit(pd.team); this.playerBody.add(this.cockpit);
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
        const mesh = buildCar(d.team, wet, d.number, { second: d.team.drivers.indexOf(d.name) === 1, style: opts.carStyle, retro: opts.retro });
        scene.add(mesh);
        entry = { isPlayer: false, remote: true, peer: it.peer, team: d.team, name, number: d.number, obj: rc, mesh };
      } else {
        const skill = diffF * (1 - (1 - d.team.pace) * 0.55) * (0.993 + rand() * 0.007);
        const ai = new AICar(this.track, d.team, d.name, d.number, skill);
        ai.dist = dist0; ai.lat = lat; ai.latOff = lat - this.track.racingLat(gs);
        ai.net = it.kind === 'netai'; ai.slot = aiSlot++;
        ai.computePose();
        const mesh = buildCar(d.team, wet, d.number, { second: d.team.drivers.indexOf(d.name) === 1, style: opts.carStyle, retro: opts.retro });
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
    this.hud.setDriver(this.playerEntry.name, pd.number, pd.team);
    this.hud.setLights(0, false);
    this.paused = false;
    this.applyCamera();
    this.updateMirrors();
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
    this.sun.color.copy(this.sunClear).lerp(TMP_C.setHex(0xdfe5ea), o * 0.7);
    this.sun.shadow.radius = L(2, 6);
    this.hemi.intensity = T.hemiInt * L(1, 1.05);
    this.hemi.color.copy(this.hemiClear).lerp(TMP_C.setHex(T.lamps > 0.5 ? 0x3a4458 : 0xc5ccd4), o);
    this.scene.environmentIntensity = T.env * L(1, 0.8);
    renderer.toneMappingExposure = T.exposure * L(1, 0.92);
    if (this.sunSprite) this.sunSprite.material.opacity = 1 - o;
    if (force) this.track.setWetness(w);
    audio.rainLevel = r * 0.14;
  }

  buildRacingLineMesh() {
    const tr = this.track, N = tr.N;
    if (this.opts.line === 'off') return;
    // ribbon along the racing line with chevrons pointing in the driving direction
    const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 4), uv = new Float32Array(N * 2 * 2);
    const idx = [];
    let dist = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      let dx = tr.raceX[j] - tr.raceX[i], dz = tr.raceZ[j] - tr.raceZ[i];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = 0.55;
      pos.set([tr.raceX[i] - dz * w, 0.056, tr.raceZ[i] + dx * w, tr.raceX[i] + dz * w, 0.056, tr.raceZ[i] - dx * w], i * 6);
      uv.set([0, dist / 2.2, 1, dist / 2.2], i * 4);
      dist += l;
      idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    // chevron texture: soft band with arrow shapes
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const cg = c.getContext('2d');
    const band = cg.createLinearGradient(0, 0, 64, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.18, 'rgba(255,255,255,.55)'); band.addColorStop(0.82, 'rgba(255,255,255,.55)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = band; cg.fillRect(0, 0, 64, 128);
    cg.fillStyle = 'rgba(255,255,255,1)';
    cg.beginPath(); cg.moveTo(8, 92); cg.lineTo(32, 40); cg.lineTo(56, 92); cg.lineTo(46, 92); cg.lineTo(32, 62); cg.lineTo(18, 92); cg.closePath(); cg.fill();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
    const mat = new THREE.MeshBasicMaterial({ map: t, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.lineMesh = mesh;
    // corners-only mode: show from the braking zone through the apex
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
    const from = this.lineFrom ?? 0, to = this.lineTo ?? 0;
    for (let d = from; d < to; d++) { const i = (d + N) % N; col[i * 8 + 3] = 0; col[i * 8 + 7] = 0; } // clear the previous window only
    const i0 = p.hint, ahead = 160, v = Math.max(p.v, 0);
    const brakeCap = brakeDecelAt(v, tr.mu) * 0.85;
    this.lineFrom = i0 - 6; this.lineTo = i0 + ahead;
    for (let d = -6; d < ahead; d++) {
      const i = (i0 + d + N) % N;
      const fade = Math.min(1, (d + 6) / 8) * Math.min(1, (ahead - d) / 40) * this.lineMask[i];
      if (fade <= 0) { col[i * 8 + 3] = 0; col[i * 8 + 7] = 0; continue; }
      // how hard would we have to brake from here to make the target speed at that point?
      const vt = tr.vProf[i], dist = Math.max(1, d * tr.ds);
      const need = v > vt ? (v * v - vt * vt) / (2 * dist) : 0;
      const k = need / brakeCap;
      let r, g, b;
      if (k > 0.75 || v > vt + 4) { r = 1; g = 0.12; b = 0.08; }          // brake now
      else if (k > 0.3 || (tr.brakeZone[i] && v > vt - 6)) { r = 1; g = 0.78; b = 0.08; } // lift / prepare
      else { r = 0.12; g = 0.95; b = 0.35; }                               // full throttle
      const a = fade * 0.9;
      col.set([r, g, b, a, r, g, b, a], i * 8);
    }
    this.lineMesh.geometry.attributes.color.needsUpdate = true;
  }

  applyCamera(quiet = false) {
    if (!CAMS[this.camMode]) this.camMode = 'cockpit';
    const m = this.camMode;
    const cam = this.camera;
    const v = CAMS[m];
    this.cockpit.visible = !!v.ego;
    this.playerModel.userData.helmet.visible = !v.ego;
    this.playerModel.userData.tcam.visible = m !== 'tcam';
    this.cockpit.userData.hands.visible = settings.hands;
    document.body.classList.toggle('cam-helmet', m === 'helmet');
    document.body.classList.toggle('cam-tcam', m === 'tcam');
    if (v.world) { if (cam.parent !== this.scene) this.scene.add(cam); this.chaseCam = null; }
    else { if (cam.parent !== this.playerBody) this.playerBody.add(cam); cam.position.set(...v.pos); cam.rotation.set(v.pitch, v.yaw || 0, 0); }
    this.baseFov = v.ego ? settings.fov - (m === 'helmet' ? 4 : 0) : v.fov;
    cam.fov = this.baseFov;
    cam.updateProjectionMatrix();
    if (!quiet) this.hud.camHint(v.label);
  }

  // chase / heli / TV cameras live in world space so they can lag, swing and cut like a broadcast
  updateWorldCam(dt, v) {
    const p = this.player, cam = this.camera, tr = this.track;
    const fwd = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
    if (!this.chaseCam) {
      const [fx, fz] = fwd(p.yaw);
      this.chaseCam = { yaw: p.yaw, pos: new THREE.Vector3(p.x - fx * (v.dist || 8), (v.height || 3), p.z - fz * (v.dist || 8)), look: new THREE.Vector3(p.x, 0.8, p.z), tvIdx: -1 };
    }
    const C = this.chaseCam;
    if (v.tv) {
      // trackside cameras every 150 m on the outside of the circuit; cut to the next one as the car passes
      const spacing = 150, sAhead = tr.wrapS(p.s + 70);
      const idx = Math.floor(sAhead / spacing);
      if (idx !== C.tvIdx) {
        C.tvIdx = idx;
        const s = idx * spacing, i = tr.idx(s);
        const side = tr.k[i] > 0 ? -1 : 1;
        const lat = side * ((side > 0 ? tr.limR[i] : tr.limL[i]) + 9);
        const [x, z] = tr.posAt(s, lat);
        C.pos.set(x, 6 + (idx % 3) * 2.5, z);
        C.look.set(p.x, 0.8, p.z);
      }
      C.look.lerp(TMP_V1.set(p.x - Math.sin(p.yaw) * p.v * 0.12, 0.7, p.z - Math.cos(p.yaw) * p.v * 0.12), Math.min(1, dt * 6));
      cam.position.copy(C.pos);
      cam.lookAt(C.look);
      const d = C.pos.distanceTo(C.look);
      const fov = Math.max(6, Math.min(55, (2 * Math.atan(9 / d) * 180) / Math.PI));
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
      return;
    }
    // smoothed heading: the camera trails the car's rotation, so it swings out in corners
    let dy = p.yaw - C.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    C.yaw += dy * Math.min(1, dt * (v.heli ? 1.2 : 3.2));
    const [fx, fz] = fwd(C.yaw);
    if (v.heli) {
      const want = TMP_V2.set(p.x - fx * 26 + fz * 14, 34, p.z - fz * 26 - fx * 14);
      C.pos.lerp(want, Math.min(1, dt * 1.5));
      C.look.lerp(TMP_V1.set(p.x, 0.5, p.z), Math.min(1, dt * 5));
      cam.position.copy(C.pos); cam.lookAt(C.look);
      if (Math.abs(cam.fov - v.fov) > 0.05) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
      return;
    }
    const speedPull = Math.min(1.6, p.v * 0.018); // drift back a little at speed
    const dist = v.dist + speedPull;
    const want = TMP_V2.set(p.x - fx * dist, v.height + Math.min(0.35, p.v * 0.003), p.z - fz * dist);
    // stiff along the ground, softer in height: smooth but never floaty
    C.pos.x += (want.x - C.pos.x) * Math.min(1, dt * 9);
    C.pos.z += (want.z - C.pos.z) * Math.min(1, dt * 9);
    C.pos.y += (want.y - C.pos.y) * Math.min(1, dt * 4);
    const [cx, cz] = fwd(p.yaw);
    const lookWant = TMP_V3.set(p.x + cx * (3 + p.v * 0.05), v.look, p.z + cz * (3 + p.v * 0.05));
    C.look.lerp(lookWant, Math.min(1, dt * 10));
    const shk = (p.bump * 0.02 + p.impact * 0.15) * (settings.shake / 60) * v.shake;
    cam.position.set(C.pos.x + (Math.random() - 0.5) * shk, C.pos.y + (Math.random() - 0.5) * shk, C.pos.z);
    cam.lookAt(C.look);
    cam.rotation.z += -dy * 0.15; // slight bank while the camera catches up
  }

  updateMirrors() {
    for (const g of this.playerModel.userData.mirrors) { g.material.map = settings.mirrors ? this.mirrorRT.texture : null; g.material.color.setHex(settings.mirrors ? 0xffffff : 0x0b0d10); g.material.needsUpdate = true; }
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
    if (input.act('hud')) cycleHud();
    this.lookBack = inp.look;
    if (input.act('mute')) { const m = audio.toggleMute(); this.hud.camHint(m ? 'TON AUS' : 'TON AN'); }
    if (input.act('reset') && this.state === 'race') this.resetCar();

    this.time += dt;
    // ---- start procedure
    if (this.state === 'grid') {
      this.stateT += dt;
      const n = Math.min(5, Math.floor((this.stateT - 0.8) / 1.0) + 1);
      if (this.stateT > 0.8) {
        if (n !== this.lastLights) { this.lastLights = n; if (n > 0) audio.beep(520, 0.18); }
        this.hud.setLights(n, true); this.track.setStartLights(n, false);
      }
      if (this.stateT > 0.8 + 5 + this.lightsHold) {
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
    this.resolveCollisions(racing ? dt : 0);
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
    // automatic ERS: deploy on straights when attacking, defending or on the last lap
    if (this.opts.autoErs) {
      const i = this.playerPos - 1;
      const ga = i > 0 ? this.gapTo(this.order[i - 1]) : null, gb = this.order[i + 1] ? this.gapTo(this.order[i + 1]) : null;
      const straight = this.track.targetSpeed(p.s + 90) > 74 && this.track.targetSpeed(p.s + 30) > 70 && p.v > 45;
      const fight = (ga !== null && Math.abs(ga) < 1.2) || (gb !== null && Math.abs(gb) < 0.8) || this.lap.lapNo >= this.laps - 1;
      p.ersAuto = straight && fight && p.ers > 0.18;
    } else p.ersAuto = false;

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
    if (net.isHost) msg.ai = this.aiList.map((a) => [r2(a.dist, 10), r2(a.lat, 100), r2(a.v, 10), r2(a.spinYaw, 100)]);
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
          if (typeof s[3] === 'number') a.spinYaw = s[3];
          a.latOff = a.lat - this.track.racingLat(a.s);
        }
        a.wheelRot += (a.v * dt) / 0.36;
        a.computePose(dt);
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

  resolveCollisions(dt) {
    const tr = this.track, L = tr.length;
    const objs = this.allObjs();
    const p = this.player;
    // lateral speed of every car (from how fast its track offset changes)
    for (const o of objs) o.latV = o.prevLat === undefined || dt <= 0 ? 0 : (o.lat - o.prevLat) / dt;
    const LEN = 5.3, WID = 1.95, E = 0.3; // contact box (m) and restitution
    for (let a = 0; a < objs.length; a++) {
      for (let b = a + 1; b < objs.length; b++) {
        const A = objs[a], B = objs[b];
        if (A.gone || B.gone) continue;
        let ds = B.dist - A.dist;
        if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;
        const dl = B.lat - A.lat;
        if (Math.abs(ds) > LEN || Math.abs(dl) > WID) continue;
        const ol = WID - Math.abs(dl), os = LEN - Math.abs(ds);
        const front = ds > 0 ? B : A, rear = ds > 0 ? A : B;
        const withP = A === p || B === p;
        const soft = withP || A.remote || B.remote ? 1 : 0.45; // AI give each other room: gentler, rarely a spin
        let hit = 0, at = null;
        if (os / LEN < ol / WID) {
          // nose-to-tail: momentum exchange, an off-centre hit spins the car in front
          this.shiftCar(rear, -os * 0.55, 0); this.shiftCar(front, os * 0.45, 0);
          const dv = rear.v - front.v;
          if (dv > 0) {
            const J = dv * (1 + E) / 2;
            this.pushV(rear, -J); this.pushV(front, J);
            const off = Math.min(1, Math.abs(front.lat - rear.lat) / WID), side = Math.sign(front.lat - rear.lat) || 1;
            this.kick(front, side * dv * (0.12 + off * 0.5) * soft, dv > (withP ? 7 : 14) && off > 0.25 ? 2.2 : 0, (front.lat - rear.lat) * dv * 0.08 * soft);
            this.kick(rear, side * dv * off * 0.12 * soft, 0, 0);
            hit = dv;
          }
          at = rear;
        } else {
          // side by side: lateral impulse pushes them apart, rubbing at different speeds yaws them
          const dir = Math.sign(dl) || 1;
          this.shiftCar(A, 0, -dir * ol * 0.55); this.shiftCar(B, 0, dir * ol * 0.55);
          const closing = Math.max(0, (A.latV - B.latV) * dir);
          const J = (closing * (1 + E) / 2 + 0.6) * soft;
          const sgn = Math.sign(ds) || 1, lever = Math.min(1, Math.abs(ds) / LEN);
          const out = withP && closing > 6 && lever > 0.45 ? 1.6 : 0;
          this.kick(A, -dir * sgn * J * lever * 0.55, out, -dir * J);
          this.kick(B, -dir * sgn * J * lever * 0.55, out, dir * J);
          // friction: speeds pull together while rubbing
          const dv = (A.v - B.v) * Math.min(1, dt * 2);
          this.pushV(A, -dv * 0.5); this.pushV(B, dv * 0.5);
          hit = closing * 1.5;
          at = A;
        }
        if (withP && hit > 0.5) {
          const o = A === p ? B : A;
          p.impact = Math.max(p.impact, Math.min(1, hit / 14));
          if (hit > 2.5) this.sparks((p.x + o.x) / 2, (p.z + o.z) / 2, Math.min(40, 6 + hit * 2), p.v);
        } else if (!withP && hit > 3 && at && Math.hypot(at.x - p.x, at.z - p.z) < 120) {
          this.sparks((A.x + B.x) / 2, (A.z + B.z) / 2, Math.min(30, 4 + hit * 2), (A.v + B.v) / 2);
          audio.crash(Math.min(0.6, hit / 20) * Math.max(0.2, 1 - Math.hypot(at.x - p.x, at.z - p.z) / 120));
        }
      }
    }
    for (const o of objs) o.prevLat = o.lat; // after the shoves, so they don't read as lateral speed
  }

  // change a car's forward speed (other players are moved by their own devices)
  pushV(o, dv) { if (o.remote || o.net) return; o.v = Math.max(0, o.v + dv); }

  // contact response: yaw kick (rad/s, +right), spin-out time for AI, sideways shove (m/s, +right)
  kick(o, spin, spunT, lat) {
    if (o.remote || o.net) return;
    if (o === this.player) {
      o.spin = Math.max(-6, Math.min(6, o.spin + spin * 0.7));
      if (lat) { const f = this.track.frame(o.s); o.kx += f.rx * lat; o.kz += f.rz * lat; }
    } else {
      // AI yaw grows the other way (yaw += left), so flip the sign
      if (spunT && !(o.spunT > 0)) { o.spinRate = -Math.sign(spin) * (4 + Math.random() * 3); o.spunT = spunT + Math.random(); o.knock += lat; }
      else { o.spinRate += -spin * 0.5; o.knock += lat; o.spunT = Math.max(o.spunT, Math.abs(o.spinRate) > 2.5 ? 1.2 : 0); }
      o.knock = Math.max(-9, Math.min(9, o.knock));
    }
  }

  // contact sparks: small additive particle burst at the contact point
  sparks(x, z, n, v) {
    if (!this.sparkPts) return;
    const S = this.sparkPts.userData;
    for (let i = 0; i < n; i++) {
      const k = S.next = (S.next + 1) % S.max;
      S.pos[k * 3] = x + (Math.random() - 0.5) * 1.2; S.pos[k * 3 + 1] = 0.2 + Math.random() * 0.4; S.pos[k * 3 + 2] = z + (Math.random() - 0.5) * 1.2;
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3.5;
      S.vel[k * 3] = Math.cos(a) * sp; S.vel[k * 3 + 1] = 1 + Math.random() * 4; S.vel[k * 3 + 2] = Math.sin(a) * sp;
      S.life[k] = 0.15 + Math.random() * 0.3;
    }
    S.v = v;
  }

  updateSparks(dt) {
    if (!this.sparkPts) return;
    const S = this.sparkPts.userData, P = S.pos;
    let any = false;
    for (let k = 0; k < S.max; k++) {
      if (S.life[k] <= 0) continue;
      S.life[k] -= dt;
      if (S.life[k] <= 0) { P[k * 3 + 1] = -50; continue; }
      any = true;
      S.vel[k * 3 + 1] -= 9.8 * dt;
      P[k * 3] += S.vel[k * 3] * dt; P[k * 3 + 1] = Math.max(0.02, P[k * 3 + 1] + S.vel[k * 3 + 1] * dt); P[k * 3 + 2] += S.vel[k * 3 + 2] * dt;
    }
    if (any || S.wasAny) this.sparkPts.geometry.attributes.position.needsUpdate = true;
    S.wasAny = any;
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
    // chassis: spring-damped pitch/roll, ride height drops with downforce, kerbs shake it
    this.sus = this.sus || { p: 0, vp: 0, r: 0, vr: 0 };
    const S2 = this.sus, kS = 90, dS = 15, h = Math.min(dt, 0.033);
    const pT = clamp(-longG * 0.0011, 0.022), rT = clamp(p.yawRate * p.v * 0.0008, 0.028);
    S2.vp += ((pT - S2.p) * kS - S2.vp * dS) * h; S2.p += S2.vp * h;
    S2.vr += ((rT - S2.r) * kS - S2.vr * dS) * h; S2.r += S2.vr * h;
    this.pitch = S2.p; this.roll = S2.r;
    const tNow = performance.now() / 1000;
    const ride = -Math.min(0.025, p.v * p.v * 0.0000035) + p.bump * Math.sin(tNow * 42) * 0.006;
    this.playerBody.rotation.set(this.pitch, 0, this.roll + p.bump * Math.sin(tNow * 31) * 0.004);
    this.playerBody.position.y = ride;
    const v = CAMS[this.camMode] || CAMS.cockpit;
    const shakeK = settings.shake / 60;
    const shake = (p.bump * 0.006 + Math.min(1, p.v / 90) * 0.0012 + p.impact * 0.03) * v.shake * shakeK;
    const rx = () => (Math.random() - 0.5) * shake;
    // ego cams: head reacts to g-forces (lean out of corners, nod under braking), looks into the apex
    const hm = settings.headMove / 100, k = Math.min(1, dt * 7);
    const latG = p.yawRate * p.v, lonG = (p.v - (this.prevV2 ?? p.v)) / Math.max(dt, 1e-3);
    this.prevV2 = p.v;
    const clampv = (x, a) => Math.max(-a, Math.min(a, x));
    this.head = this.head || { x: 0, z: 0, roll: 0, pitch: 0 };
    const H = this.head;
    H.x += (clampv(-latG * 0.0011 * hm, 0.06) - H.x) * k;
    H.roll += (clampv(-latG * 0.0016 * hm, 0.09) - H.roll) * k;
    H.z += (clampv(-lonG * 0.0016 * hm, 0.05) - H.z) * k;
    H.pitch += (clampv(lonG * 0.0011 * hm, 0.05) - H.pitch) * k;
    const wantWorld = !!v.world && !this.lookBack;
    if (wantWorld && cam.parent !== this.scene) { this.scene.add(cam); this.chaseCam = null; }
    if (!wantWorld && cam.parent !== this.playerBody) this.playerBody.add(cam);
    if (this.lookBack) {
      cam.position.set(0, 1.25, 0.6); cam.rotation.set(-0.08, Math.PI, 0);
    } else if (wantWorld) {
      this.updateWorldCam(dt, v);
    } else if (v.ego) {
      const t = performance.now() / 1000;
      const buzz = Math.min(1, p.v / 85) * 0.0009 * shakeK; // high-speed vibration
      cam.position.set(v.pos[0] + H.x + rx() + Math.sin(t * 61) * buzz, v.pos[1] + rx() + Math.sin(t * 47) * buzz + p.bump * Math.sin(t * 38) * 0.004 * shakeK, v.pos[2] + H.z);
      cam.rotation.set(v.pitch + H.pitch, -p.steer * 0.05 * hm, H.roll);
    } else {
      // body-mounted onboard cams: rigid mount, engine buzz, a touch of lean into corners
      const t2 = performance.now() / 1000, bz = Math.min(1, p.v / 85) * 0.0011 * shakeK * (v.lens ? 1.4 : 1);
      cam.position.set(v.pos[0] + rx() + Math.sin(t2 * 67) * bz, v.pos[1] + rx() + Math.sin(t2 * 53) * bz + p.bump * Math.sin(t2 * 40) * 0.005 * shakeK, v.pos[2]);
      cam.rotation.set(v.pitch + H.pitch * 0.3, (v.yaw || 0) - p.steer * 0.015, H.roll * (v.lean || 0) * 0.4);
    }
    // field of view widens with speed
    if (!wantWorld || !(v.tv || v.heli)) {
      const fovT = (this.baseFov || cam.fov) + (settings.dynFov && (v.ego || v.world) && !this.lookBack ? Math.min(1, Math.max(0, (p.v - 20) / 70)) * (v.ego ? 8 : 6) : 0);
      if (Math.abs(cam.fov - fovT) > 0.05) { cam.fov += (fovT - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    }
    // speed vignette
    const sfx = settings.speedFx && v.ego && !this.lookBack ? Math.max(0, Math.min(1, (p.v - 45) / 45)) : 0;
    if (Math.abs(sfx - (this.sfx || 0)) > 0.01) { this.sfx = sfx; $('#speedfx').style.opacity = (sfx * 0.6).toFixed(2); }
    // vibration feedback on phones (Android)
    if (IS_TOUCH && settings.vibrate && navigator.vibrate) {
      this.vibT = (this.vibT || 0) - dt;
      if (this.vibT <= 0 && (p.impact > 0.3 || (p.bump > 0.9 && p.v > 15))) { navigator.vibrate(p.impact > 0.3 ? 60 : 15); this.vibT = p.impact > 0.3 ? 0.5 : 0.25; }
    }
    // driver's head: leans with lateral g, looks toward the apex, nods under braking
    const hd = this.playerModel.userData.helmet.children[0];
    hd.rotation.set(-H.pitch * 1.6, -p.steer * 0.32, H.roll * 1.4);
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
    this.updateSparks(dt);
    for (const c of this.cars) {
      if (c.isPlayer) continue;
      const o = c.obj, m = c.mesh;
      const far = c.gone || Math.hypot(o.x - p.x, o.z - p.z) > 650;
      m.visible = !far;
      if (far) continue;
      m.position.set(o.x, -Math.min(0.025, o.v * o.v * 0.0000035), o.z);
      o.rollVis = (o.rollVis || 0) + (Math.max(-0.028, Math.min(0.028, (o.steerVis || 0) * o.v * 0.0016)) - (o.rollVis || 0)) * Math.min(1, dt * 5);
      m.rotation.set(0, o.yaw, o.rollVis);
      for (const w of m.userData.wheels) { w.wheel.rotation.x = -o.wheelRot; if (w.front) w.pivot.rotation.y = -o.steerVis * 0.5; }
      m.userData.helmet.children[0].rotation.set(0, -(o.steerVis || 0) * 0.6, (o.rollVis || 0) * -3);
      m.userData.rainLight.material.color.setHex(rainLights && blink ? 0xff2020 : 0x330000);
    }
    this.playerModel.userData.rainLight.material.color.setHex(rainLights && blink ? 0xff2020 : 0x330000);
    // sun/shadow follow
    this.sun.position.set(p.x + this.sunDir.x * 300, Math.max(60, this.sunDir.y * 300), p.z + this.sunDir.z * 300);
    if (this.sunSprite) { const cw = this.camWorld().position; this.sunSprite.position.set(cw.x + this.sunDir.x * 2500, cw.y + this.sunDir.y * 2500, cw.z + this.sunDir.z * 2500); }
    this.sun.target.position.set(p.x, 0, p.z);
    this.sky.position.set(p.x, 0, p.z);

    this.updateRacingLine();
    this.weather.update(dt, this.camWorld(), p.v, this.others.filter((a) => Math.hypot(a.x - p.x, a.z - p.z) < 160), !!((CAMS[this.camMode] || {}).ego || (CAMS[this.camMode] || {}).lens) && settings.droplets && !this.lookBack);
    if (!(CAMS[this.camMode] || {}).ego) this.weather.emitSpray(p, dt);

    // steering wheel display
    this.displayT -= dt;
    if (this.displayT <= 0 && (CAMS[this.camMode] || {}).ego) { this.displayT = 0.1; this.drawWheelDisplay(); }

    // mirrors
    this.mirrorFrame = (this.mirrorFrame || 0) + 1;
    const every = this.opts.quality === 'high' ? 1 : this.opts.quality === 'medium' ? 2 : 3;
    if ((CAMS[this.camMode] || {}).ego && settings.mirrors && !this.lookBack && this.mirrorFrame % every === 0) {
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
      order: this.order || this.cars, gapTo: (c) => this.gapTo(c), wet: this.startWet, time: this.raceTime, weather: this.weather, mph: settings.units === 'mph',
    });
    audio.update(p, this.others, !!(CAMS[this.camMode] || {}).ego);
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
    tw.speed.textContent = Math.round(settings.units === 'mph' ? p.speedKmh * 0.621371 : p.speedKmh);
    tw.unit = tw.unit || $('#wheel-svg .wd-l'); tw.unit.textContent = settings.units === 'mph' ? 'MPH' : 'KM/H';
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

  // compile every shader up front (rain, cockpit, sparks, mirrors…) so nothing stalls mid-race the first time it appears
  warmup() {
    const hidden = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const sp = this.sparkPts.userData.pos; sp[1] = 0.5; sp[0] = this.player.x; sp[2] = this.player.z - 6;
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
    try {
      renderer.compile(this.scene, this.camera);
      if (this.mirrorRT) { renderer.setRenderTarget(this.mirrorRT); renderer.render(this.scene, this.rearCam); renderer.setRenderTarget(null); }
      if (this.composer) this.composer.render(); else renderer.render(this.scene, this.camera);
    } catch (e) { console.warn('warmup', e); }
    for (const o of hidden) o.visible = false;
    sp[1] = -50; this.sparkPts.geometry.attributes.position.needsUpdate = true;
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
  if (settings.fpsLimit && now - last < 1000 / settings.fpsLimit - 2) return;
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
  document.body.classList.toggle('auto-drs', !!settings.autoDrs);
  document.body.classList.toggle('auto-ers', !!settings.autoErs);
  showScreen('loading');
  $('#hud').classList.remove('active');
  setTimeout(() => {
    if (game) { game.dispose(); game = null; }
    const opts = { ...settings };
    if (mpStart) Object.assign(opts, { laps: mpStart.laps, weather: mpStart.weather, difficulty: mpStart.difficulty, track: mpStart.track || 'barcelona', tod: mpStart.tod || 'noon', mp: { net, start: mpStart } });
    game = new Game(opts);
    game.warmup();
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
  if (act === 'settings') { renderOpts(); $('#pause').classList.remove('active'); showScreen('settings'); }
  if (act === 'settings-back') {
    if (game && !game.resultsShown) { showScreen('none'); if (game.paused) $('#pause').classList.add('active'); else game.togglePause(true); }
    else showScreen('menu');
  }
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.paused && !game.mp) game.togglePause(true);
  if (!document.hidden) checkForUpdate();
});

// ------------------------------------------------------------------ updates for installed (home-screen) apps
// version.json is never cached; if it names a newer build than the code that is running, reload.
let updateReady = null;
async function checkForUpdate() {
  if (APP_VERSION === '__BUILD__') return; // local copy or Claude artifact: always current
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    if (!version || version === APP_VERSION || version === '__BUILD__') return;
    updateReady = version;
    // already reloaded for this version but still old code (stubborn cache): don't loop, just offer the button
    const tried = new URL(location.href).searchParams.get('v') === version;
    const onMenu = !game && !net.race && document.querySelector('.screen.active')?.id === 'menu';
    if (onMenu && !tried) applyUpdate();
    else $('#update-bar').hidden = false;
  } catch (_) { /* offline: try again later */ }
}
function applyUpdate() {
  // a changed query string makes iOS home-screen apps fetch fresh files
  const url = new URL(location.href);
  url.searchParams.set('v', updateReady || Date.now());
  location.replace(url.toString());
}
$('#update-now').addEventListener('click', applyUpdate);
$('#update-later').addEventListener('click', () => { $('#update-bar').hidden = true; });
setInterval(checkForUpdate, 10 * 60 * 1000);
setTimeout(checkForUpdate, 1500);

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
$('#fs-btn').addEventListener('click', toggleFullscreen);
$('#tc-fs').addEventListener('click', (e) => { e.preventDefault(); toggleFullscreen(); });
applyLive();
showScreen('menu');
// Menu backdrop: slowly orbiting camera around a car
(function menuBackdrop() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(4, 6, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff4040, 1.3); rim.position.set(-5, 4, -4); scene.add(rim);
  // glossy floor that fades out softly instead of ending in a hard edge
  const fc = document.createElement('canvas'); fc.width = fc.height = 256;
  const fg = fc.getContext('2d');
  const grd = fg.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, '#fff'); grd.addColorStop(0.45, '#bbb'); grd.addColorStop(1, '#000');
  fg.fillStyle = grd; fg.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.45, metalness: 0.5, transparent: true, alphaMap: new THREE.CanvasTexture(fc), depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const spot = new THREE.SpotLight(0xffffff, 60, 30, 0.5, 0.6); spot.position.set(0, 10, 0); spot.target.position.set(0, 0, 0); scene.add(spot, spot.target);
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
    const want = settings.driver + settings.carStyle + settings.retro;
    if (carName !== want) {
      if (car) scene.remove(car);
      const d = DRIVERS.find((x) => x.name === settings.driver) || DRIVERS[0];
      car = buildCar(d.team, false, d.number, { style: settings.carStyle, retro: settings.retro }); scene.add(car); carName = want;
    }
    const w = c2.clientWidth, h = c2.clientHeight;
    if (c2.width !== Math.floor(w * Math.min(devicePixelRatio, 2)) || c2.height !== Math.floor(h * Math.min(devicePixelRatio, 2))) {
      r2.setPixelRatio(Math.min(devicePixelRatio, 2)); r2.setSize(w, h, false); cam.aspect = w / h;
      // the menu sits on the left: shift the car into the free space on the right (portrait: lower half)
      const wide = w / h > 1.2;
      cam.setViewOffset(w, h, wide ? -w * (w / h > 1.8 ? 0.24 : 0.25) : 0, wide ? 0 : -h * 0.22, w, h);
      cam.updateProjectionMatrix();
    }
    const a = t * 0.00015;
    const dist = w / h > 1.8 ? 10.5 : w / h > 1.2 ? 11.5 : 13;
    cam.position.set(Math.sin(a) * dist, 2.4, Math.cos(a) * dist);
    cam.lookAt(0, 0.4, 0);
    r2.render(scene, cam);
  }
  requestAnimationFrame(loop);
})();
