import * as THREE from 'three';
import { Track, CAR, brakeDecel as brakeDecelAt } from './track.js';
import { THERM, newTyreSet, stepTyres, stepBrake, tyreFactors, gripTemp, aiTyreEnergy } from './tyres.js';
import { VEH } from './vehicle.js';
import { TEAMS, customTeam, LIVERY_PATTERNS, GIALLO, buildCar, carModelReady, carModel, buildCockpit, setTyreLook, setWingLook, setWheelBlur, setBrakeGlow, COMPOUND_COL, buildSafetyCar, driverRating, setCarLod, FLAP_CLOSED, FLAP_OPEN } from './models.js';
import { TYRES, TYRE_ORDER, isSlick, tyreGrip, weatherCall, dryChoice, wetChoice, pitWindow, startPit, stepPit, pitLat, newDamage, wingDmg, damageEffect, TYRE_WINDOW, tempGrip } from './race.js';
import { PlayerCar, AICar } from './physics.js';
import { HUD, fmtTime } from './hud.js';
import { Audio } from './audio.js';
import { Weather } from './weather.js';
import { Input, IS_TOUCH, ACTIONS, DEFAULT_BINDS, keyLabel } from './input.js';
import { Net, rng, clean, cleanLivery } from './net.js';
import { APP_VERSION } from './version.js';
import { Radio } from './radio.js';
import { buildPodium } from './podium.js';
import { ACHIEVEMENTS, LESSONS, MEDALS, achState, unlock, trackDone, setUnlockHandler, schoolState, saveMedal } from './achieve.js';
import { submitLap, fetchBoard, initBoard, boardMode } from './board.js';
import { loadCareer, newCareer, saveCareer, clearCareer, careerPerf, careerRace, careerQuali, careerNextSeason, UPGRADES, upgradeCost } from './modes.js';
import { loadSeason, newSeason, saveSeason, addRoundResult, addSprintResult, standings, loadGhost, saveGhost, ghostPose, ghostTimeAt, GHOST_DT, POINTS } from './modes.js';
import * as TX from './textures.js';
import { TRACKS, TIMES, trackById } from './tracks.js';
import { terrainAt, terrainEnable, terrainScenePass, rigidOnTerrain, terrainReady, dispose as disposeTerrain } from './terrain.js';
import { TOD, skyTexture, sunDir, sunSprite } from './tod.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
// GTAO fed with an existing depth texture: r160 still touches its own normal target in setGBuffer / setSize /
// dispose, which only exists when it renders a G-buffer itself, so it gets a harmless stand-in
class SceneDepthAO extends GTAOPass {
  constructor(...a) {
    super(...a);
    // the sky: the multisampled depth resolves to just below 1.0 where nothing was drawn, so the pass's own
    // "depth >= 1.0 -> skip" test missed it and laid a grid of AO noise over the sky (plain at noon, a visible
    // pattern in the evening sky). Anything this far is sky.
    this.gtaoMaterial.fragmentShader = this.gtaoMaterial.fragmentShader.replace('if (depth >= 1.0) {', 'if (depth >= 0.9999) {');
    this.gtaoMaterial.needsUpdate = true;
    this.pdMaterial.fragmentShader = this.pdMaterial.fragmentShader.replace('if (depth == 1. ||', 'if (depth >= 0.9999 ||');
    this.pdMaterial.needsUpdate = true;
  }
  setGBuffer(depthTexture, normalTexture) {
    if (depthTexture && !this.normalRenderTarget) this.normalRenderTarget = { depthTexture, setSize() {}, dispose() {} };
    super.setGBuffer(depthTexture, normalTexture);
  }
}
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const $ = (s) => document.querySelector(s);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ settings / menu
const DRIVERS = [];
TEAMS.forEach((t) => t.drivers.forEach((d, i) => DRIVERS.push({ team: t, name: d, number: t.numbers[i] })));

const defaults = {
  driver: 'HAMILTON', track: 'barcelona', tod: 'noon', laps: 5, weather: 'dynamic', difficulty: 75, grid: 8, camera: 'cockpit', quality: 'high',
  profile: 'normal', gearbox: 'auto', tc: 'full', abs: true, brakeAssist: true, autoGas: false, steerAssist: 'light', autoDrs: true, autoErs: true, line: 'corners', steerSens: 100, binds: {},
  touchSteer: 'wheel', wheelSize: 'm', touchSide: 'right', mpName: '', mpAI: 4, mpCollide: true, mpGrid: 'random', mpAIDiff: 75, mpEqual: false, mpAssists: 'all', mpPrivate: false, carStyle: 'modern', retro: false,
  // graphics
  renderScale: 100, dynRes: true, shadows: true, bloom: 'auto', trees: 'auto', fpsLimit: 0,
  // camera
  fov: 72, dynFov: true, headMove: 70, shake: 60, mirrors: true, hands: true, speedFx: true,
  // display
  hudTower: true, hudTiming: true, hudWeather: true, hudMap: true, hudDash: true, hudMsg: true, droplets: true, hudScale: 100, units: 'kmh', hudMode: 'full',
  // audio
  volMaster: 80, volEngine: 80, volFx: 80, volAmb: 70,
  // touch
  touchOpacity: 85, vibrate: true,
  // race rules
  tyreWear: 0, damage: false, penalties: false, safetyCar: true, startTyre: 'auto', radio: 'voice', seasonQuali: true, seasonSprint: false, tyreTemp: false, formation: false, mpLeague: false, launchAssist: true, playStyle: 'simple', gpFormat: 'race',
  // car setup
  setFw: 6, setRw: 6, setBias: 56, setDiff: 50,
  // own livery
  livery: { on: true, ...GIALLO },
};

// settings screen definition: tab, key, label, options or range; `next` = applies from the next race
const ONOFF = { vals: [true, false], labels: ['An', 'Aus'] };
const SETTINGS = [
  { tab: 'Grafik', items: [
    { key: 'quality', label: 'Grafik-Voreinstellung', vals: ['ultra', 'high', 'medium', 'low'], labels: ['Ultra', 'Hoch', 'Mittel', 'Niedrig'], next: true, hint: 'Hoch: Umgebungsverdeckung (Kontaktschatten) und echte Spiegelungen der Umgebung im eigenen Lack. Ultra zusätzlich: doppelt so weite 4K-Schatten, 8× Kantenglättung, Linsenreflexe – für starke PCs und neue iPads.' },
    { key: 'renderScale', label: 'Auflösung', range: [50, 100, 5], unit: '%', hint: 'Weniger = flüssiger auf Handy und Tablet.' },
    { key: 'dynRes', label: 'Auflösung automatisch', ...ONOFF, hint: 'Wird es ruckelig, rendert das Spiel kurz etwas kleiner und danach wieder scharf. Hält die Bildrate stabil.' },
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
  { tab: 'Rennen', items: [
    { key: 'playStyle', label: 'Spielweise', vals: ['simple', 'real', 'custom'], labels: ['Einfach', 'Realistisch', 'Eigene'], next: true, hint: 'Einfach: kein Verschleiß, keine Schäden, keine Strafen, keine Einführungsrunde, automatischer Start – einfach losfahren. Realistisch: alles an. Wer einzelne Regeln ändert, landet bei „Eigene“.' },
    { key: 'startTyre', label: 'Startreifen', vals: ['auto', 'S', 'M', 'H'], labels: ['Automatisch', 'Soft', 'Medium', 'Hard'], next: true, hint: 'Bei Regen startest du automatisch auf Intermediates oder Regenreifen.' },
    { key: 'tyreWear', label: 'Reifenverschleiß', vals: [1, 1.6, 0], labels: ['Normal', 'Hoch', 'Aus'], next: true, hint: 'Soft ist schnell, hält aber kurz. Hard hält lange. Boxenstopp: Enter / I, auf Touch der BOX-Knopf.' },
    { key: 'damage', label: 'Schäden', ...ONOFF, next: true, hint: 'Nach Unfällen bricht der Frontflügel ab. Das Auto schiebt dann über die Vorderräder, ein neuer Flügel kostet beim Stopp ein paar Sekunden.' },
    { key: 'penalties', label: 'Strafen', ...ONOFF, next: true, hint: '5 Sekunden für verursachte Unfälle, Überholen unter Safety Car und ab der 4. Streckenbegrenzung.' },
    { key: 'safetyCar', label: 'Safety Car & Flaggen', ...ONOFF, next: true },
    { key: 'formation', label: 'Einführungsrunde', ...ONOFF, next: true, hint: 'Vor dem Start eine langsame Runde hinter dem Feld: Reifen und Bremsen aufwärmen, dann in die eigene Startbox. Nicht im Multiplayer.' },
    { key: 'tyreTemp', label: 'Reifen- & Bremstemperatur', ...ONOFF, next: true, hint: 'Kalte Reifen rutschen, überhitzte bauen schneller ab. Kalte Bremsen greifen schlechter, zu heiße lassen nach.' },
    { key: 'launchAssist', label: 'Startautomatik', ...ONOFF, next: true, hint: 'Hält beim Start die Drehzahl automatisch im grünen Bereich. Aus: selbst mit dem Gas dosieren.' },
    { key: 'radio', label: 'Boxenfunk', vals: ['voice', 'text', 'off'], labels: ['Stimme + Text', 'Nur Text', 'Aus'] },
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
  easy: { autoGas: true, brakeAssist: true, steerAssist: true, autoDrs: true, autoErs: true, line: 'full', gearbox: 'auto', tc: 'full', abs: true },
  normal: { autoGas: false, brakeAssist: true, steerAssist: 'light', autoDrs: true, autoErs: true, line: 'corners', gearbox: 'auto', tc: 'full', abs: true },
  pro: { autoGas: false, brakeAssist: false, steerAssist: false, autoDrs: false, autoErs: false, line: 'off', gearbox: 'manual', tc: 'off', abs: false },
};
const PROFILE_KEYS = Object.keys(PROFILES.easy);
// play styles: one tap sets the race rules
const STYLES = {
  simple: { formation: false, tyreTemp: false, tyreWear: 0, damage: false, penalties: false, safetyCar: true, launchAssist: true },
  real: { formation: true, tyreTemp: true, tyreWear: 1, damage: true, penalties: true, safetyCar: true, launchAssist: false },
};
const STYLE_KEYS = Object.keys(STYLES.simple);
// friendlier defaults on phones / tablets
if (IS_TOUCH) Object.assign(defaults, { quality: 'medium', difficulty: 60, profile: 'easy', ...PROFILES.easy });
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem('apexgp25') || '{}')); } catch (e) { /* storage unavailable */ }
// the on-screen wheel replaced the joystick as default touch steering
if (!settings.lightIntro) { if (settings.profile === 'normal' && settings.steerAssist === false) settings.steerAssist = 'light'; settings.lightIntro = true; }
// the simple play style became the default: easier to pick up, everything realistic is one tap away
if (!settings.styleIntro) { Object.assign(settings, STYLES.simple, { playStyle: 'simple', styleIntro: true }); }
// the black-yellow 2026 car becomes the player's look once (switch back to team colours in the livery screen)
if (!settings.gialloIntro) { if (!settings.livery || !settings.livery.on) settings.livery = { on: true, ...GIALLO }; settings.gialloIntro = true; }
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
  renderSetup();
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

// track selectors are generated from the circuit list
function trackOpts() {
  document.querySelectorAll('.opt[data-key="track"]').forEach((o) => { o.dataset.vals = JSON.stringify(TRACKS.map((t) => t.id)); o.dataset.labels = JSON.stringify(TRACKS.map((t) => t.name)); });
  // calendar list: round number + circuit, one tap selects
  document.querySelectorAll('.track-list').forEach((list) => {
  list.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const b = document.createElement('button');
    b.dataset.track = t.id; b.setAttribute('role', 'option');
    b.innerHTML = `<small>${t.real ? 'R' + (i + 1) : '★'}</small>`;
    b.append(t.name);
    b.addEventListener('click', () => { settings.track = t.id; save(); renderOpts(); onSettingChanged('track'); });
    list.append(b);
  });
  });
}
trackOpts();

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
      if (key === 'playStyle' && STYLES[settings.playStyle]) Object.assign(settings, STYLES[settings.playStyle]);
      else if (STYLE_KEYS.includes(key)) settings.playStyle = 'custom';
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
  document.querySelectorAll('.track-list button').forEach((b) => { const on = b.dataset.track === settings.track; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); });
  applyTouchLayout();
}

function applyTouchLayout() {
  const B = document.body.classList;
  B.toggle('wheel-s', settings.wheelSize === 's'); B.toggle('wheel-l', settings.wheelSize === 'l');
  B.toggle('touch-swap', settings.touchSide === 'left');
}

function onSettingChanged(key) {
  applyLive();
  if (['laps', 'weather', 'mpAI', 'track', 'tod', 'mpLeague', 'mpCollide', 'playStyle', 'tyreWear', 'damage', 'penalties', 'safetyCar', 'tyreTemp', 'mpGrid', 'mpAIDiff', 'mpEqual', 'mpAssists', 'mpPrivate'].includes(key) && net.isHost) mpSendCfg();
  if (key === 'track' && trackById(settings.track).tod) { settings.tod = trackById(settings.track).tod; save(); renderOpts(); } // night races start at night, like the real event
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
  $('#brand-sub').textContent = `${t.name} · ${(TIMES.find((x) => x.id === settings.tod) || TIMES[1]).name} · ${settings.laps} Runden`;
  renderModes();
  drawTrackPreview();
  $('#sel-driver').textContent = d.name;
  $('#sel-team').textContent = d.team.name;
  $('#sel-num').textContent = d.number;
  document.documentElement.style.setProperty('--team', hex(d.team.body === 0xf0f0f0 || d.team.body === 0x161616 ? d.team.accent : d.team.body));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'menu') renderModes();
}

// spinning wheels: sharp when slow, smeared, then fully spun (m/s thresholds with a little hysteresis-free spacing)
const wheelBlur = (v) => { v = Math.abs(v || 0); return v < 5 ? 0 : v < 17 ? 1 : 2; };

// closest points between segments P1-P2 and Q1-Q2 in the ground plane
function closestSeg(p1x, p1z, p2x, p2z, q1x, q1z, q2x, q2z) {
  const d1x = p2x - p1x, d1z = p2z - p1z, d2x = q2x - q1x, d2z = q2z - q1z, rx = p1x - q1x, rz = p1z - q1z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  const cc = d1x * rx + d1z * rz, b = d1x * d2x + d1z * d2z, den = a * e - b * b;
  let s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - cc * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -cc / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - cc) / a)); }
  return { px: p1x + d1x * s, pz: p1z + d1z * s, qx: q1x + d2x * t, qz: q1z + d2z * t };
}

// ------------------------------------------------------------------ car setup
// wings 1-11 trade cornering grip for straight-line speed, brake bias and diff lock change the balance
function carSetup(o) {
  const fw = o.setFw ?? 6, rw = o.setRw ?? 6;
  return {
    df: 1 + ((fw + rw - 12) / 20) * 0.35,
    cd: 1 + (rw - 6) * 0.035 + (fw - 6) * 0.01,
    bal: (fw - rw) * 0.012,
    bias: (o.setBias ?? 56) / 100,
    diff: (o.setDiff ?? 50) / 100,
  };
}
const SETUP_PRESETS = {
  low: { label: 'Wenig Abtrieb', hint: 'Monza, Spa', v: { setFw: 2, setRw: 1, setBias: 55, setDiff: 60 } },
  bal: { label: 'Ausgewogen', hint: 'Barcelona, Silverstone', v: { setFw: 6, setRw: 6, setBias: 56, setDiff: 50 } },
  high: { label: 'Viel Abtrieb', hint: 'Monaco, Stadtkurs', v: { setFw: 10, setRw: 11, setBias: 57, setDiff: 40 } },
};
const SETUP_ITEMS = [
  { key: 'setFw', label: 'Frontflügel', range: [1, 11, 1], fmt: (v) => v },
  { key: 'setRw', label: 'Heckflügel', range: [1, 11, 1], fmt: (v) => v },
  { key: 'setBias', label: 'Bremsbalance (vorne)', range: [50, 62, 1], fmt: (v) => v + '%' },
  { key: 'setDiff', label: 'Differenzial-Sperre', range: [0, 100, 5], fmt: (v) => v + '%' },
];
function renderSetup() {
  const box = $('#car-setup');
  if (!box) return;
  box.innerHTML = '';
  const pre = document.createElement('div'); pre.className = 'setup-presets';
  for (const [k, P] of Object.entries(SETUP_PRESETS)) {
    const b = document.createElement('button');
    b.innerHTML = `<b>${P.label}</b><small>${P.hint}</small>`;
    b.classList.toggle('sel', Object.entries(P.v).every(([kk, vv]) => settings[kk] === vv));
    b.addEventListener('click', () => { Object.assign(settings, P.v); save(); renderSetup(); });
    pre.append(b);
  }
  box.append(pre);
  for (const it of SETUP_ITEMS) {
    const row = document.createElement('div'); row.className = 'slider';
    row.innerHTML = `<span></span><input type="range" min="${it.range[0]}" max="${it.range[1]}" step="${it.range[2]}"><b></b>`;
    row.querySelector('span').textContent = it.label;
    const inp = row.querySelector('input'), out = row.querySelector('b');
    inp.value = settings[it.key]; out.textContent = it.fmt(settings[it.key]);
    inp.addEventListener('input', () => { settings[it.key] = +inp.value; out.textContent = it.fmt(+inp.value); save(); setupSummary(); box.querySelectorAll('.setup-presets button').forEach((b) => b.classList.remove('sel')); });
    box.append(row);
  }
  const sum = document.createElement('p'); sum.className = 'setup-sum'; sum.id = 'setup-sum'; box.append(sum);
  setupSummary();
}
function setupSummary() {
  const S = carSetup(settings), el = $('#setup-sum');
  if (!el) return;
  // top speed where drive force = drag: power / v = 0.5 rho cdA v^2
  const vmax = Math.cbrt(600000 / (0.5 * 1.2 * 1.35 * S.cd)) * 3.6;
  const grip = Math.round((S.df - 1) * 100 * 0.6);
  const bal = S.bal > 0.02 ? 'dreht leicht ein (übersteuernd)' : S.bal < -0.02 ? 'stabil, schiebt etwas (untersteuernd)' : 'neutral';
  el.textContent = `Topspeed ca. ${Math.round(vmax)} km/h · Kurvengrip ${grip >= 0 ? '+' : ''}${grip}% · Balance ${bal}`;
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

let dynScale = 1; // automatic resolution factor (see dynResolution)
const CAM_P = new THREE.Vector3();
function resize() {
  const w = innerWidth, h = innerHeight;
  const q = settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'ultra' ? 2.5 : q === 'high' ? 2 : q === 'medium' ? 1.5 : 1) * (settings.renderScale || 100) / 100 * (settings.dynRes !== false ? dynScale : 1));
  renderer.setSize(w, h, false);
  if (game) {
    game.camera.aspect = w / h; game.camera.updateProjectionMatrix();
    if (game.composer) { game.composer.setPixelRatio(renderer.getPixelRatio()); game.composer.setSize(w, h); }
  }
}
addEventListener('resize', resize);

// touch with steering buttons: the centre-bottom HUD (onboard bar, dash, pill) sits in the gap between the
// arrow buttons and the pedals, shrunk if that gap is narrow, so it never covers BREMSE or a steering arrow
function fitTouchHud() {
  const b = document.body, els = document.querySelectorAll('#hud .onboard, #hud .dash, #hud .pill');
  for (const el of els) { el.style.left = ''; el.style.scale = ''; }
  if (!b.classList.contains('touch') || !b.classList.contains('ingame') || !b.classList.contains('steer-buttons')) return;
  const a = document.getElementById('tc-arrows'), p = document.querySelector('#touch .tside');
  if (!a || !p || !a.getClientRects().length || !p.getClientRects().length) return;
  const ra = a.getBoundingClientRect(), rp = p.getBoundingClientRect();
  const [l, r] = ra.left < rp.left ? [ra.right, rp.left] : [rp.right, ra.left];
  const gap = r - l - 16, cx = (l + r) / 2;
  if (gap < 60) return;
  for (const el of els) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el), base = parseFloat(cs.scale) || 1, m = /matrix\(([^,]+)/.exec(cs.transform), tb = m ? parseFloat(m[1]) : 1;
    const s = Math.min(1, gap / (el.offsetWidth * base * tb));
    el.style.left = cx + 'px';
    if (s < 1) el.style.scale = String(base * s);
  }
}
addEventListener('resize', fitTouchHud);
setInterval(fitTouchHud, 500);

// ------------------------------------------------------------------ cameras
const CAMS = {
  helmet: { label: 'HELM', pos: [0, 0.945, 0.05], pitch: -0.035, fov: 72, shake: 1.15, ego: true },
  cockpit: { label: 'COCKPIT', pos: [0, 0.96, 0.02], pitch: -0.045, fov: 72, shake: 1, ego: true },
  // T-cam: on the airbox right behind the helmet, like the TV onboard
  tcam: { label: 'T-KAMERA', pos: [0, 1.15, 0.4], pitch: -0.12, fov: 70, shake: 1.0, lean: 0.8, lens: true },
  sidepod: { label: 'SEITENKASTEN', pos: [0.4, 0.8, -0.92], pitch: -0.07, yaw: 0, fov: 78, shake: 0.8, lean: 0.4 },
  nose: { label: 'NASE', pos: [0, 0.5, -2.05], pitch: -0.03, fov: 78, shake: 0.6 },
  wing: { label: 'FRONTFLÜGEL', pos: [0.62, 0.22, -2.35], pitch: 0, fov: 80, shake: 0.5 },
  rear: { label: 'HECK', pos: [0, 1.12, 2.95], pitch: -0.07, yaw: Math.PI, fov: 66, shake: 0.6 },
  chase: { label: 'VERFOLGER', world: true, dist: 6.6, height: 1.95, look: 1.3, fov: 64, shake: 0.25 }, // car low in the frame, plenty of road ahead (like the official games)
  far: { label: 'VERFOLGER WEIT', world: true, dist: 10.5, height: 3.3, look: 0.6, fov: 56, shake: 0.15 },
  heli: { label: 'HELIKOPTER', world: true, heli: true, fov: 45 },
  tv: { label: 'TV-KAMERA', world: true, tv: true, fov: 30 },
};
// the 2026 model car is taller at the airbox and nose than the built-in car: onboard cameras sit just clear of it
const MODEL_CAMS = { tcam: [0, 1.27, 0.45], nose: [0, 0.64, -2.0], wing: [0.62, 0.38, -2.4] };
for (const k in MODEL_CAMS) CAMS[k].pos0 = CAMS[k].pos;
function useModelCams(on) { for (const k in MODEL_CAMS) CAMS[k].pos = on ? MODEL_CAMS[k] : CAMS[k].pos0; }

// floating name above another player's car (always readable, shrinks with distance like the official games)
function nameTag(name, team) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,20,.78)'; g.beginPath(); g.roundRect(4, 10, 248, 44, 8); g.fill();
  g.fillStyle = hex(team.body === 0xf0f0f0 || team.body === 0x161616 ? team.accent : team.body); g.fillRect(4, 10, 8, 44);
  g.fillStyle = '#fff'; g.font = 'bold 30px "Titillium Web", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(name).toUpperCase(), 132, 33, 224);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(2.4, 0.6, 1); sp.position.set(0, 2.1, 0); sp.renderOrder = 10;
  return sp;
}

// celebration: paper confetti over the whole screen (podium, top-3 finish)
function confetti(n = 150) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti'; document.body.append(box);
  const cols = ['#e10600', '#ffd23f', '#19d65b', '#3ff6ff', '#ffffff', '#ff8000', '#9b5cff'];
  for (let i = 0; i < n; i++) {
    const q = document.createElement('i');
    q.style.left = Math.random() * 100 + '%'; q.style.background = cols[i % cols.length];
    q.style.animationDelay = Math.random() * 0.9 + 's'; q.style.animationDuration = 2.4 + Math.random() * 1.8 + 's';
    q.style.setProperty('--dx', Math.random() * 180 - 90 + 'px'); q.style.setProperty('--r', Math.random() * 900 + 'deg');
    box.append(q);
  }
  setTimeout(() => box.remove(), 5600);
}
const INTRO_LEN = 7.5; // seconds of TV opening before the grid / formation lap

// broadcast-style grade after tone mapping: a touch more saturation and S-curve contrast, soft vignette
const GRADE = {
  // wb: white balance. The sky light (hemisphere, environment map) tints everything blue; a camera would balance
  // that out, so asphalt reads neutral grey and grass olive-green like in broadcast footage
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.07 }, curve: { value: 0.16 }, vig: { value: 0.32 }, wb: { value: new THREE.Vector3(1.02, 1.0, 0.96) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, curve, vig; uniform vec3 wb; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= wb;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, sat);
      vec3 s = clamp(c.rgb, 0.0, 1.0);
      c.rgb = mix(c.rgb, s * s * (3.0 - 2.0 * s), curve);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vig * dot(d, d) * 1.5;
      gl_FragColor = c;
    }`,
};

// the same grade without post-processing (medium / low daytime): folded into the tone mapping of every material,
// so it costs no extra full-screen pass. ACES, then into display space, white balance, saturation, S-curve, back
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
    vec3 c = pow( clamp( ACESFilmicToneMapping( color ), 0.0, 1.0 ), vec3( 1.0 / 2.2 ) ) * vec3( 1.02, 1.0, 0.96 );
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    c = clamp( mix( vec3( l ), c, 1.07 ), 0.0, 1.0 );
    c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.16 );
    return pow( c, vec3( 2.2 ) );
  }`);

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
    this.buf = []; // received states, oldest first
    this.gap = 33; // average time between packets (ms)
    this.tyre = 'M';
  }
  get s() { return this.track.wrapS(this.dist + this.track.startS); }
  get t() { return this.buf.length ? this.buf[this.buf.length - 1] : null; }
  set(x, z, yaw, dist, lat) { this.x = x; this.z = z; this.yaw = yaw; this.dist = dist; this.lat = lat; }
  // c[8] = the sender's clock (ms); states are placed on the sender's timeline so network jitter
  // doesn't distort the motion. off = smallest seen (arrival - send) = best-case latency + clock offset
  target(c, now) {
    const st = typeof c[8] === 'number' ? c[8] : now;
    const lag = now - st;
    this.off = this.off === undefined ? lag : Math.min(lag, this.off + 0.03); // creeps up slowly (about 1 ms/s) if the clocks drift
    const last = this.buf[this.buf.length - 1];
    if (last && st <= last.at) return; // late duplicate / out of order
    if (last) this.gap += (Math.min(250, st - last.at) - this.gap) * 0.1;
    this.jit = (this.jit || 0) + (Math.abs(lag - this.off) - (this.jit || 0)) * 0.1;
    this.buf.push({ x: c[0], z: c[1], yaw: c[2], v: c[3], dist: c[4], lat: c[5], steer: c[6], at: st });
    if (this.buf.length > 24) this.buf.shift();
  }
  // snapshot interpolation: show the car a little in the past (about two packet gaps), between two real
  // states; only when packets are late, dead-reckon forward from the newest one
  update(dt) {
    const B = this.buf;
    if (!B.length) return;
    const now = performance.now(), delay = Math.min(250, Math.max(50, this.gap * 1.6 + (this.jit || 0) * 2)), rt = now - (this.off || 0) - delay;
    while (B.length > 2 && B[1].at <= rt) B.shift();
    let x, z, yaw, dist, lat, v, steer;
    const a = B[0], b = B[1];
    if (b && rt >= a.at && rt <= b.at) {
      const k = Math.min(1, (rt - a.at) / Math.max(1, b.at - a.at));
      let dy = b.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      x = a.x + (b.x - a.x) * k; z = a.z + (b.z - a.z) * k; yaw = a.yaw + dy * k;
      dist = a.dist + (b.dist - a.dist) * k; lat = a.lat + (b.lat - a.lat) * k; v = a.v + (b.v - a.v) * k; steer = b.steer;
    } else {
      const l = B[B.length - 1], age = Math.max(0, Math.min(0.3, (rt - l.at) / 1000));
      x = l.x - Math.sin(l.yaw) * l.v * age; z = l.z - Math.cos(l.yaw) * l.v * age; yaw = l.yaw;
      dist = l.dist + l.v * age; lat = l.lat; v = l.v; steer = l.steer;
    }
    // a big jump (teleport after a reset, first packet) snaps, everything else is followed exactly
    if (Math.hypot(x - this.x, z - this.z) > 25) { this.x = x; this.z = z; }
    const k = Math.min(1, dt * 20);
    this.x += (x - this.x) * k; this.z += (z - this.z) * k;
    let dy = yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * k;
    this.dist = dist; this.lat = lat; this.v = v;
    this.steerVis = steer * 0.3;
    this.wheelRot += (this.v * dt) / CAR.tyreR;
  }
}

// ------------------------------------------------------------------ game
class Game {
  constructor(opts) {
    this.opts = opts;
    const mp = (this.mp = opts.mp || null);
    this.mode = mp ? 'race' : opts.mode || 'race';
    const solo = (this.solo = this.mode === 'tt' || this.mode === 'quali' || this.mode === 'school');
    const rand = mp ? rng(mp.start.seed) : Math.random;
    const scene = (this.scene = new THREE.Scene());
    // weather first: it decides how wet the track starts
    this.weather = new Weather(scene, opts.weather, opts.laps * 95, opts.quality, rand);
    {
      // contact sparks pool
      const max = 600, pos = new Float32Array(max * 3).fill(-50), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.sparkPts = new THREE.Points(g, new THREE.PointsMaterial({ map: TX.particle(), color: 0xffd080, size: 0.21, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
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
    sky.material.userData.noTerrain = true; skyWet.material.userData.noTerrain = true;
    // daytime: physically based sky (Rayleigh / Mie scattering, sun disc, haze at the horizon) under a cloud layer
    const physSky = (k, gain = 0.62, max = 24) => {
      const sk = new Sky(); sk.scale.setScalar(k);
      const u = sk.material.uniforms, low = tod.sunEl < 20;
      // clear-day air: little aerosol, so the sky stays blue even looking towards the sun (was a white veil)
      u.turbidity.value = low ? 6 : 2.4; u.rayleigh.value = low ? 2.2 : 1.5; u.mieCoefficient.value = low ? 0.004 : 0.0018; u.mieDirectionalG.value = 0.78;
      u.sunPosition.value.copy(this.sunDir);
      // dimmed to our exposure; the sun disc is clamped so half-float targets (bloom) never see Inf / NaN
      sk.material.fragmentShader = sk.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'vec3 skyC = clamp( retColor * ' + gain.toFixed(3) + ', 0.0, ' + max.toFixed(1) + ' ); if ( skyC.r != skyC.r || skyC.g != skyC.g || skyC.b != skyC.b ) skyC = vec3( 0.0 ); gl_FragColor = vec4( skyC, 1.0 );');
      return sk;
    };
    this.physSky = tod.lamps < 0.5 && tod.sunEl > 3 && opts.quality !== 'low';
    if (this.physSky) {
      // the visible dome a little darker than the light it gives (environment map below keeps 0.62): ACES no
      // longer burns the sky towards the sun to white, the blue holds like in a photo with the exposure on the cars
      sky.add(physSky(5200, 0.4, 2.5)); // no HDR sun disc in the dome: the sprite draws the sun; the disc only blew out in reflections
      sky.material.map = skyTexture(tod, false, true); sky.material.transparent = true; sky.material.depthWrite = false;
    }
    sky.add(skyWet);
    scene.add(sky); this.sky = sky; this.skyWet = skyWet;
    this.sunSprite = sunSprite(tod);
    if (this.sunSprite) {
      scene.add(this.sunSprite);
      if (opts.quality === 'high' || opts.quality === 'ultra') this.sunSprite.add(makeFlare(tod));
    }
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    // reflections / sky light without the sun disc: the sun already lights the scene directly, a second sun in
    // the environment map burned clear-coated and metallic paint to white wherever it was reflected
    envScene.add(this.physSky ? physSky(18, 0.62, 1.6) : new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: tod.lamps > 0.5 ? 0x141a14 : 0x51703f }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1; envScene.add(ground);
    // a circuit's horizon is not open sky: barriers, stands and tree lines ring it up to ~6°. Without that band
    // metallic, clear-coated paint mirrored bright sky all round and every car looked washed out (pale yellow,
    // grey carbon) wherever the player's real-surroundings cube map is not rendered (medium / low, all AI cars)
    if (tod.lamps < 0.5) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 2, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x3b4536, side: THREE.BackSide }));
      band.position.y = 0; envScene.add(band); // -6° … +6° around the reflection centre
      ground.material.color.set(0x474a46); // mostly asphalt close to a car, not lawn
    }
    scene.environment = pm.fromScene(envScene, 0.04).texture;

    const hemi = (this.hemi = new THREE.HemisphereLight(tod.hemiSky, tod.hemiGround, tod.hemiInt));
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(tod.sun, tod.sunInt));
    sun.castShadow = opts.quality !== 'low' && opts.shadows;
    const sz = opts.quality === 'ultra' ? 4096 : opts.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const sr = opts.quality === 'ultra' ? 110 : 70; // ultra: twice the shadowed area at the same texel size as high (4096 vs 2048)
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
      // high / ultra: keep the scene depth so the ambient occlusion pass can read it (no second scene render)
      this.wantAO = opts.quality === 'high' || opts.quality === 'ultra';
      if (this.wantAO) rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height);
      const c = new EffectComposer(renderer, rt);
      this.renderPass = terrainScenePass(new RenderPass(scene, null));
      c.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), tod.lamps > 0.5 ? 0.75 : 0.22, 0.45, tod.lamps > 0.5 ? 0.62 : 0.96);
      c.addPass(this.bloom);
      c.addPass(new OutputPass());
      c.addPass(new ShaderPass(GRADE));
      this.composer = c;
    }
    // no post-processing: the broadcast grade runs inside the tone mapping instead (see CustomToneMapping)
    renderer.toneMapping = this.composer ? THREE.ACESFilmicToneMapping : THREE.CustomToneMapping;

    this.track = new Track(scene, { def: this.def, tod, wetness: this.weather.wetness, quality: opts.quality, trees: opts.trees === 'auto' ? opts.quality : opts.trees });
    this.applyWeather(0, true);

    // camera
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 5000);
    if (this.renderPass) this.renderPass.camera = this.camera;
    if (this.composer && this.wantAO) {
      // ambient occlusion from the scene's own depth buffer (normals rebuilt from depth): contact darkening under
      // cars, wings, stands and barriers. No override-material pass, so the terrain lift and the rigid cars
      // are seen exactly as rendered.
      const pr = renderer.getPixelRatio();
      const ao = new SceneDepthAO(scene, this.camera, innerWidth * pr, innerHeight * pr, { depthTexture: this.composer.renderTarget1.depthTexture },
        { radius: 1.1, distanceExponent: 1.0, thickness: 1.5, scale: 2.2, samples: opts.quality === 'ultra' ? 16 : 10 }, { radius: 6, samples: 12 });
      ao.blendIntensity = 0.85;
      const aoRender = ao.render.bind(ao);
      ao.render = (r, w, read, ...rest) => { // the composer ping-pongs two targets: read the one the scene went into
        const d = read.depthTexture;
        if (d) { ao.depthTexture = d; ao.gtaoMaterial.uniforms.tDepth.value = d; ao.pdMaterial.uniforms.tDepth.value = d; }
        aoRender(r, w, read, ...rest);
      };
      this.composer.insertPass(ao, 1);
      this.aoPass = ao;
    }
    this.camMode = opts.camera;

    // player
    // career: your own driver takes a seat in a team (replacing one of its drivers)
    const CD = opts.customDriver, cTeam = CD && TEAMS.find((t) => t.id === CD.team);
    const pd = cTeam ? { team: cTeam, name: CD.name, number: CD.number } : DRIVERS.find((d) => d.name === opts.driver) || DRIVERS[0];
    this.fieldDrivers = DRIVERS.filter((d) => d !== pd && d.name !== pd.name && !(CD && d.name === CD.replaces));
    this.player = new PlayerCar(this.track, { manual: opts.gearbox === 'manual', brakeAssist: opts.brakeAssist, steerAssist: opts.steerAssist, autoDrs: opts.autoDrs, autoErs: opts.autoErs, tc: opts.tc, abs: opts.abs });
    this.player.onShift = (down) => !down && audio.shift();
    this.player.setup = carSetup(opts);
    if (opts.career && cTeam) {
      const c = loadCareer(), perf = c ? careerPerf(c, cTeam.pace) : { power: 1, df: 1, grip: 1 };
      this.player.powerMul = perf.power; this.player.setup.df *= perf.df; this.careerGrip = perf.grip;
      this.mateName = cTeam.drivers.find((n) => n !== CD.replaces);
    }
    this.playerRoot = new THREE.Group(); scene.add(this.playerRoot);
    this.playerBody = new THREE.Group(); this.playerRoot.add(this.playerBody);
        this.mirrorRT = new THREE.WebGLRenderTarget(512, 160);
    this.mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
    const myLiv = opts.livery && opts.livery.on ? opts.livery : null;
    const myLook = myLiv ? customTeam(myLiv, pd.team) : pd.team, myNum = myLiv && myLiv.number ? myLiv.number : pd.number;
    this.playerModel = buildCar(myLook, wet, myNum, { mirrorTex: this.mirrorRT.texture, second: pd.team.drivers.indexOf(pd.name) === 1, style: opts.carStyle, retro: opts.retro && !myLiv });
    this.playerBody.add(this.playerModel);
    // high / ultra: the player's paint reflects its real surroundings (road, kerbs, stands, other cars) from a
    // small cube map around the car instead of only the sky
    // medium: a 64 px cube, one face per frame (no 6-render spike, ~1/6 of a scene render each frame at tiny
    // resolution) and a shorter far plane so the cube's cameras cull most of the circuit
    if (opts.quality === 'high' || opts.quality === 'ultra' || opts.quality === 'medium') {
      const med = opts.quality === 'medium';
      this.envRT = new THREE.WebGLCubeRenderTarget(opts.quality === 'ultra' ? 256 : med ? 64 : 128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      this.envCam = new THREE.CubeCamera(0.4, med ? 450 : 1500, this.envRT);
      this.envEvery = opts.quality === 'ultra' ? 3 : 8;
      this.envFaces = med;
      scene.add(this.envCam);
      const P = this.playerModel.userData.parts;
      for (const m of [P.livery.material, P.accent.material]) { m.envMap = this.envRT.texture; m.needsUpdate = true; }
    }
    this.cockpit = buildCockpit(myLook); this.playerBody.add(this.cockpit);
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
      mp.start.slots.forEach((s, i) => { if (s.h && lineup[i]) lineup[i].liv = cleanLivery(s.l); });
      if (!lineup.some((l) => l.kind === 'player')) { lineup.push({ kind: 'player', d: pd, name: pd.name }); this.spectator = true; }
    } else if (solo) {
      lineup = [{ kind: 'player', d: pd }];
      if (opts.lesson === 'overtake') for (const d of this.fieldDrivers.slice().sort((a, b) => a.team.pace - b.team.pace).slice(0, 3)) lineup.push({ kind: 'ai', d });
    } else {
      const others = this.fieldDrivers.slice();
      others.sort((a, b) => (b.team.pace + Math.random() * 0.02) - (a.team.pace + Math.random() * 0.02));
      const gridSlot = opts.grid === 'random' ? (Math.random() * (this.fieldDrivers.length + 1)) | 0 : Math.min(this.fieldDrivers.length, opts.grid - 1);
      lineup = others.map((d) => ({ kind: 'ai', d }));
      lineup.splice(gridSlot, 0, { kind: 'player', d: pd });
      // weekend: the qualifying result sets the grid
      if (Array.isArray(opts.gridOrder)) { const ix = (n) => { const i = opts.gridOrder.indexOf(n); return i < 0 ? 99 : i; }; lineup.sort((a, b) => ix(a.d.name) - ix(b.d.name)); }
    }
    const diffF = 0.86 + (opts.difficulty / 110) * 0.14;
    this.cars = [];
    const L = this.track.length;
    this.laps = this.mode === 'tt' || this.mode === 'school' ? 9999 : this.mode === 'quali' ? 3 : opts.laps;
    this.cpN = Math.ceil((Math.min(this.laps, 40) * L + 1200) / 50);
    let aiSlot = 0;
    lineup.forEach((it, g) => {
      const d = it.d;
      const gs = this.track.startS - 8 - g * 8;
      const lat = (g % 2 === 0 ? -1 : 1) * Math.min(2.6, this.track.hwAt(gs) - 1.8); // same slots as painted
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
        const lv = it.liv;
        const mesh = buildCar(lv ? customTeam(lv, d.team) : d.team, wet, lv && lv.number ? lv.number : d.number, { second: d.team.drivers.indexOf(d.name) === 1, style: opts.carStyle, retro: opts.retro && !lv });
        scene.add(mesh);
        entry = { isPlayer: false, remote: true, peer: it.peer, team: d.team, name, number: d.number, obj: rc, mesh };
        mesh.add(rigidOnTerrain(nameTag(name, d.team))); // other players get their name above the car
      } else {
        const R = driverRating(d.name);
        const skill = diffF * (opts.mpEqual ? 0.985 : (1 - (1 - d.team.pace) * 0.55) * (1 + R[0] / 100)) * (0.995 + rand() * 0.005); // equal cars: only the driver's luck differs
        const ai = new AICar(this.track, d.team, d.name, d.number, skill);
        ai.agg = R[1]; ai.cons = R[2];
        ai.tyre = this.weather.wetness > 0.32 ? wetChoice(this.weather.wetness) : opts.laps >= 8 && rand() < 0.3 ? 'H' : rand() < 0.5 ? 'S' : 'M';
        ai.dist = dist0; ai.lat = lat; ai.latOff = lat - this.track.racingLat(gs);
        ai.net = it.kind === 'netai'; ai.slot = aiSlot++;
        ai.computePose();
        const mesh = buildCar(d.team, wet, d.number, { second: d.team.drivers.indexOf(d.name) === 1, style: opts.carStyle, retro: opts.retro, tyre: ai.tyre });
        scene.add(mesh);
        entry = { isPlayer: false, team: d.team, name, number: d.number, obj: ai, mesh };
      }
      entry.cp = new Float32Array(this.cpN).fill(-1); entry.lastCp = -1;
      entry.finished = false; entry.finishTime = 0; entry.grid = g + 1; entry.pen = 0; entry.slot = Math.max(0, TEAMS.indexOf(d.team));
      entry.gridDist = dist0; entry.gridLat = lat;
      this.cars.push(entry);
    });
    this.playerEntry = this.cars.find((c) => c.isPlayer);
    if (this.spectator) {
      // watching only: our own car is parked out of the way and left out of everything
      this.playerEntry.gone = true; this.playerEntry.spectator = true;
      this.playerRoot.visible = false;
      this.player.placeAt(this.track.wrapS(this.track.startS), 60); this.player.dist = -1e6;
      this.spec = { focus: this.cars.findIndex((c) => !c.isPlayer), cam: 'tv', auto: true, t: 0 };
    }
    this.entryOf = new Map(this.cars.map((c) => [c.obj, c]));
    // tyres, damage, pit stops
    this.raceM = Math.max(opts.laps, 5) * L;
    this.dmgOn = opts.damage !== false; this.penOn = opts.penalties !== false;
    const w0 = this.weather.wetness;
    this.player.tyre = w0 > 0.32 ? wetChoice(w0) : opts.startTyre && opts.startTyre !== 'auto' ? opts.startTyre : opts.laps <= 5 ? 'S' : 'M';
    setTyreLook(this.playerModel, this.player.tyre);
    this.boxReq = false; this.pitTyre = 'auto'; this.pitCtl = null; this.stratT = 0; this.penCool = 0;
    this.debris = [];
    // replay buffer: per frame raceTime + x/z/yaw of every car + the safety car
    this.replay = this.mode === 'race' ? { hz: 15, fs: 1 + (this.cars.length + 1) * 3 + 1, chunks: [], n: 0, events: [] } : null;
    this.sc = null; this.scCount = 0; this.incScore = 0; this.yelT = [0, 0, 0]; this.vscOver = 0;
    this.radio = new Radio(this.hud, () => settings.radio, audio); this.radioState = {};
    this.aiList = this.cars.filter((c) => !c.isPlayer && !c.remote).map((c) => c.obj);
    this.others = this.cars.filter((c) => !c.isPlayer).map((c) => c.obj);

    this.buildRacingLineMesh();
    this.buildRubber();
    if (opts.weather === 'local') this.buildRainZone(rand);

    // race state
    this.state = 'grid'; this.stateT = 0; this.time = 0; this.raceTime = 0;
    if (solo) {
      // flying lap: start 350 m before the line, already at speed
      const tr = this.track, s0 = tr.wrapS(tr.startS - 350);
      this.player.placeAt(s0, tr.racingLat(s0)); this.player.dist = -350; this.player.v = 48; this.player.gear = 4;
      this.state = 'race'; this.flying = true; this.lapStarted = false;
    }
    if (!solo && !mp && opts.formation !== false && this.mode === 'race') {
      this.state = 'formation'; this.formT = 0;
    }
    // TV-style opening: a camera sweep over the grid with the race graphics, then the normal start
    if (!solo && this.mode === 'race' && opts.intro !== false && !opts.school) { this.afterIntro = this.state; this.state = 'intro'; this.introT = 0; }
    document.body.classList.toggle('mode-tt', this.mode === 'tt');
    document.body.classList.toggle('mode-quali', this.mode === 'quali');
    this.lightsHold = 0.6 + rand() * 2.2;
    this.lap = { start: 0, best: Infinity, sectorStart: 0, sector: 0, sectorBest: [Infinity, Infinity, Infinity], states: ['', '', ''], invalid: false, lapNo: 0 };
    this.trackWarnings = 0; this.offWasOn = false;
    this.hud = new HUD($('#hud'), this.mode === 'tt' ? '∞' : this.laps, opts.sprintRace ? 'sprint' : this.mode);
    this.hud.el['h-intro'].addEventListener('pointerdown', () => { this.introSkip = true; });
    this.radio.hud = this.hud;
    this.hud.setMap(this.track);
    this.hud.setDriver(this.playerEntry.name, myNum, myLook);
    this.hud.setLights(0, false);
    if (this.mode === 'quali') this.initQuali(pd, diffF);
    if (this.mode === 'tt') this.initTT(pd);
    if (this.mode === 'school') this.initSchool();
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
    this.scene.fog.density = L(T.fogD, (T.lamps > 0.5 ? 0.0028 : 0.003) * (0.5 + 0.5 * r));
    this.scene.fog.color.copy(this.fogClear).lerp(this.fogWet, o);
    this.sun.intensity = T.sunInt * (1 - 0.62 * o);
    this.sun.color.copy(this.sunClear).lerp(TMP_C.setHex(0xdfe5ea), o * 0.7);
    this.sun.shadow.radius = L(2, 6);
    this.hemi.intensity = T.hemiInt * L(1, 1.05);
    this.hemi.color.copy(this.hemiClear).lerp(TMP_C.setHex(T.lamps > 0.5 ? 0x3a4458 : 0xc5ccd4), o);
    this.scene.environmentIntensity = T.env * L(1, 0.8);
    renderer.toneMappingExposure = T.exposure * L(1, 0.92);
    if (this.sunSprite) this.sunSprite.material.opacity = 1 - o;
    if (force) this.track.setWetness(this.rainZone ? 0 : w);
    // fog: thick, pale, sun dimmed
    if (this.opts.weather === 'fog') {
      this.scene.fog.density = Math.max(this.scene.fog.density, T.lamps > 0.5 ? 0.0075 : 0.0065);
      this.scene.fog.color.copy(this.fogClear).lerp(TMP_C.setHex(T.lamps > 0.5 ? 0x1c2230 : 0xc3c8cc), 0.75);
      this.sun.intensity *= 0.45;
      if (this.sunSprite) this.sunSprite.material.opacity = 0.15;
    }
    // thunderstorm: lightning flashes the whole scene
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.2);
      this.hemi.intensity += this.flash * 4; renderer.toneMappingExposure *= 1 + this.flash * 0.8;
    }
    const fl = $('#flash'); if (fl) { const o2 = (this.flash || 0) * 0.55; if (fl._o !== o2) { fl._o = o2; fl.style.opacity = o2; } }
    audio.rainLevel = r * 0.14; audio.wetness = this.weather.wetness;
  }

  // rubber laid down on the racing line (darker, grippier as the race goes on) and marbles beside it
  buildRubber() {
    const tr = this.track, N = tr.N;
    const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), idx = [];
    let dist = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      let dx = tr.raceX[j] - tr.raceX[i], dz = tr.raceZ[j] - tr.raceZ[i];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = 1.25;
      const y = 0.018 + (tr.hilly ? tr.hs[i] : 0); // on the exact road surface (track.js ribbon `exact`)
      pos.set([tr.raceX[i] - dz * w, y, tr.raceZ[i] + dx * w, tr.raceX[i] + dz * w, y, tr.raceZ[i] - dx * w], i * 6);
      uv.set([0, dist / 6, 1, dist / 6], i * 4);
      dist += l;
      idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    // two dark tyre tracks with soft edges and streaks
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const cg = c.getContext('2d');
    for (const cx of [17, 47]) {
      const gr = cg.createLinearGradient(cx - 14, 0, cx + 14, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cg.fillStyle = gr; cg.fillRect(cx - 14, 0, 28, 256);
    }
    cg.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) { cg.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; cg.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 2, 6 + Math.random() * 30); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: t, color: 0x000000, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    mat.userData.noTerrain = tr.hilly;
    this.rubberMesh = new THREE.Mesh(g, mat); this.rubberMesh.frustumCulled = false;
    this.scene.add(this.rubberMesh);
    // marbles: little rubber pellets off the line, one instanced mesh
    const M = 2400, mg = new THREE.CircleGeometry(0.035, 6); mg.rotateX(-Math.PI / 2);
    const marbles = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ color: 0x0b0b0c, transparent: true, opacity: 0, depthWrite: false }), M);
    marbles.material.userData.noTerrain = tr.hilly;
    const d = new THREE.Object3D();
    for (let k = 0; k < M; k++) {
      const i = (Math.random() * N) | 0, s = i * tr.ds, rl = tr.racingLat(s);
      const side = Math.random() < 0.5 ? -1 : 1;
      const lat = Math.max(-tr.hw[i] + 0.3, Math.min(tr.hw[i] - 0.3, rl + side * (2.6 + Math.random() * 3)));
      const [x, z] = tr.posAt(s, lat);
      d.position.set(x, 0.022 + (tr.hilly ? tr.hAt(s) : 0), z); d.scale.setScalar(0.6 + Math.random() * 1.2); d.updateMatrix();
      marbles.setMatrixAt(k, d.matrix);
    }
    marbles.frustumCulled = false;
    this.scene.add(marbles); this.marbles = marbles;
    this.rubber = this.mode === 'tt' || this.mode === 'school' ? 0.7 : 0.25;
  }

  updateRubber(dt) {
    if (!this.rubberMesh) return;
    const lead = this.order && this.order[0] ? this.order[0].obj.dist : 0;
    const base = this.mode === 'tt' || this.mode === 'school' ? 0.7 : 0.25;
    const target = Math.min(1, base + Math.max(0, lead) / (this.track.length * 5));
    this.rubber += (target - this.rubber) * Math.min(1, dt * 0.2);
    this.rubber = Math.max(0, this.rubber - this.weather.rain * dt * 0.01); // rain washes it off
    this.rubberMesh.material.opacity = this.rubber * 0.32 * (1 - this.weather.wetness * 0.6);
    this.marbles.material.opacity = Math.max(0, this.rubber - 0.3) * 0.9;
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
      const y = 0.056 + (tr.hilly ? tr.hs[i] : 0); // on the exact road surface
      pos.set([tr.raceX[i] - dz * w, y, tr.raceZ[i] + dx * w, tr.raceX[i] + dz * w, y, tr.raceZ[i] - dx * w], i * 6);
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
    mat.userData.noTerrain = tr.hilly;
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

  // three TV shots: wide over the start line, a dolly down the grid, then in behind our car
  introCamera() {
    const tr = this.track, cam = this.camera, t = Math.min(1, this.introT / INTRO_LEN), p = this.player;
    if (cam.parent !== this.scene) this.scene.add(cam);
    this.cockpit.visible = false; this.playerModel.userData.helmet.visible = true;
    const pole = tr.startS - 8, mine = p.s, gridLen = tr.wrapS(pole - mine);
    const ease = (k) => k * k * (3 - 2 * k);
    let s, lat, h, ls, ll, lh;
    if (t < 0.32) { const k = ease(t / 0.32); s = tr.startS + 90 - k * 35; lat = 0; h = 19 - k * 9; ls = tr.startS - 60 - k * 40; ll = 0; lh = 0; } // above the track: never inside a grandstand
    else if (t < 0.78) { const k = ease((t - 0.32) / 0.46); s = pole + 6 - k * (gridLen + 4); lat = 6.2; h = 1.25 + Math.sin(k * Math.PI) * 0.5; ls = s + 2; ll = 0; lh = 0.55; }
    else { const k = ease((t - 0.78) / 0.22); s = mine - 9 + k * 2.5; lat = p.lat + 1.5 - k * 1.5; h = 2.6 - k * 0.7; ls = mine + 25; ll = p.lat; lh = 0.8; }
    const [x, z] = tr.posAt(tr.wrapS(s), lat), [lx, lz] = tr.posAt(tr.wrapS(ls), ll);
    cam.position.set(x, h, z); cam.lookAt(lx, lh, lz);
    if (cam.fov !== 48) { cam.fov = 48; cam.updateProjectionMatrix(); }
  }

  introHTML() {
    const W = { dynamic: 'Wechselhaft', wet: 'Regen', dry: 'Trocken', storm: 'Gewitter', fog: 'Nebel', local: 'Teilweise Regen' };
    const tod = (TIMES.find((x) => x.id === this.opts.tod) || {}).name || '';
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pole = this.cars[0], me = this.cars.indexOf(this.playerEntry) + 1;
    const km = this.def.km ? this.def.km.toFixed(3).replace('.', ',') + ' km' : (this.track.length / 1000).toFixed(2).replace('.', ',') + ' km';
    const bar = (c) => hex(c.team.body === 0xf0f0f0 || c.team.body === 0x161616 ? c.team.accent : c.team.body);
    const humans = this.mp ? this.cars.map((c, i) => [c, i]).filter(([c]) => c.isPlayer || c.remote) : [];
    return `<div class="in-card">
      <div class="in-gp">${esc(this.def.gp || this.def.name)}</div>
      <div class="in-trk">${esc(this.def.name)} · ${km} · ${this.laps} ${this.laps === 1 ? 'Runde' : 'Runden'}</div>
      <div class="in-row"><span>WETTER</span><b>${esc(W[this.opts.weather] || '')}</b><span>ZEIT</span><b>${esc(tod)}</b><span>POLE</span><b><i style="background:${bar(pole)}"></i>${esc(pole.name)}</b></div>
      ${humans.length > 1 ? `<div class="in-grid">${humans.map(([c, i]) => `<span><i style="background:${bar(c)}"></i>P${i + 1} ${esc(c.name)}</span>`).join('')}</div>` : this.spectator ? '' : `<div class="in-you">DU STARTEST VON <b>P${me}</b></div>`}
    </div>${this.mp ? '' : '<div class="in-skip">Gas geben oder tippen zum Überspringen</div>'}`;
  }

  // rigid placement on the road: height and pitch of the road at the car's own track position (where the physics
  // drives); the height field beside the road may already slope away towards another section of the lap
  roadPose(x, z, yaw, s, out) {
    const tr = this.track;
    if (!terrainReady()) { out.y = 0; out.pitch = 0; return out; }
    if (s == null || !isFinite(s)) { tr.locate(x, z, out.hint ?? -1, out); s = out.s; out.hint = out.i; }
    const f = tr.frame(s, out.f || (out.f = {}));
    out.y = tr.hAt(s);
    out.pitch = Math.atan(tr.gradeAt(s)) * (-Math.sin(yaw) * f.tx - Math.cos(yaw) * f.tz);
    return out;
  }

  // the world is lifted by the height field in the shaders, so free cameras follow: raise them by the ground
  // height under them (returns the undo for after the frame)
  liftCamera(cam) {
    if (!cam) return () => {};
    cam.updateMatrixWorld();
    // on-board cameras ride inside the player's car, which already sits on the road with its pitch
    for (let o = cam.parent; o; o = o.parent) if (o === this.playerRoot) return () => {};
    const wp = TMP_V1.setFromMatrixPosition(cam.matrixWorld);
    const v = CAMS[this.camMode] || {};
    // chase cameras trail the car along the road: take the road height behind it, not the ground under the lens
    // (which can be the slope down to another section)
    const trail = !this.replayMode && !this.photo && !this.spectator && v.world && v.dist && cam.parent === this.scene && this.state !== 'intro';
    const h = trail && terrainReady() ? this.track.hAt(this.player.s - v.dist) : terrainAt(wp.x, wp.z);
    if (!h) return () => {};
    cam.position.y += h; cam.updateMatrixWorld();
    return () => { cam.position.y -= h; cam.updateMatrixWorld(); };
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
  updateWorldCam(dt, v, subj = null) {
    const p = subj || this.player, cam = this.camera, tr = this.track;
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
    const shk = ((p.bump || 0) * 0.02 + (p.impact || 0) * 0.15) * (settings.shake / 60) * v.shake;
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

  moveFlap(mesh, open, dt) {
    const f = mesh && mesh.userData.flap;
    if (!f) return;
    const want = -(open ? FLAP_OPEN : FLAP_CLOSED);
    f.rotation.x += (want - f.rotation.x) * Math.min(1, dt * (open ? 6 : 12)); // closes faster than it opens
  }

  // a short chat message / emoji rises above the sender's car for a few seconds
  floatEmote(m) {
    if (!m.text || m.text.length > 10) return;
    const who = String(m.name).toUpperCase();
    const c = m.me ? this.playerEntry : this.cars.find((e) => e.remote && e.name === who);
    if (!c || !c.mesh) return;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d'); g.font = '90px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (/^[\p{Extended_Pictographic}\uFE0F]+$/u.test(m.text)) g.fillText(m.text, 128, 70);
    else { g.font = 'bold 54px Arial'; g.fillStyle = 'rgba(10,12,20,.8)'; g.beginPath(); g.roundRect(8, 24, 240, 80, 14); g.fill(); g.fillStyle = '#fff'; g.fillText(m.text, 128, 66, 224); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(2.6, 1.3, 1); sp.position.set(0, 2.9, 0); sp.renderOrder = 11;
    (c.isPlayer ? this.playerRoot : c.mesh).add(rigidOnTerrain(sp)); // the car already sits on the road
    const t0 = performance.now();
    const tick = () => {
      const k = (performance.now() - t0) / 2800;
      if (k >= 1 || !this.scene) { sp.removeFromParent(); tex.dispose(); sp.material.dispose(); return; }
      sp.position.y = 2.9 + k * 1.6; sp.material.opacity = k < 0.75 ? 1 : (1 - k) / 0.25;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // time trial: the record to beat (TV graphic), and our place after every valid lap
  async showBoardTop() {
    try {
      const rows = await fetchBoard(this.def.id, this.opts.carStyle);
      if (!rows.length || this.disposed) return;
      const r = rows[0], where = boardMode() === 'local' ? 'DEIN REKORD' : 'REKORD';
      setTimeout(() => this.hud.tv(`<span class="tv-tag">${where}</span><b>${clean(r.name).toUpperCase()}</b><em>${fmtTime(r.time)}</em>`, 'purple', 5), 2400);
    } catch (_) { /* offline */ }
  }
  async showBoardRank(lt) {
    const rows = await fetchBoard(this.def.id, this.opts.carStyle);
    const i = rows.findIndex((r) => r.me);
    if (i < 0 || this.disposed) return;
    const txt = boardMode() === 'local' ? `PLATZ ${i + 1} DEINER ZEITEN` : `PLATZ ${i + 1} VON ${rows.length} WELTWEIT`;
    this.hud.tv(`<span class="tv-tag">BESTENLISTE</span><b>${txt}</b><em>${fmtTime(rows[i].time)}</em>`, i === 0 ? 'purple' : '', 4);
  }

  // TV ticker for position changes at the front and anything involving a human driver
  overtakeTicker() {
    if (this.state !== 'race' || this.raceTime < 8 || this.solo) return;
    this.otT = (this.otT || 0) - 1 / 30;
    const names = this.order.map((c) => c);
    if (!this.lastOrder) { this.lastOrder = names; return; }
    if (this.otT > 0) return;
    for (let i = 0; i < Math.min(names.length, 10); i++) {
      const c = names[i], before = this.lastOrder.indexOf(c);
      if (before <= i || c.obj.pitCtl || c.finished) continue;
      const passed = this.lastOrder[i];
      if (!passed || passed.obj.pitCtl || passed.gone || passed.finished) continue;
      const human = c.isPlayer || c.remote || passed.isPlayer || passed.remote;
      if (i > 2 && !human) continue;
      const col = (e) => hex(e.team.body === 0xf0f0f0 || e.team.body === 0x161616 ? e.team.accent : e.team.body);
      this.hud.tv(`<span class="tv-tag">P${i + 1}</span><i style="background:${col(c)}"></i><b>${c.name}</b><span class="tv-x">überholt</span><i style="background:${col(passed)}"></i><b>${passed.name}</b>`, i === 0 ? 'lead' : '', 2.6);
      this.otT = 2.8;
      break;
    }
    this.lastOrder = names;
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
    if (this.replayMode) { input.poll(); this.updateReplay(dt); input.endFrame(); return; }
    if (this.podium) { input.poll(); input.endFrame(); return; }
    const inp = input.poll();
    if (input.act('pause')) { if (this.photo) this.stopPhoto(); else this.togglePause(); }
    if (this.paused && !this.mp) { input.endFrame(); return; }
    if (input.act('cam')) this.cycleCamera();
    if (input.act('camPrev')) this.cycleCamera(-1);
    if (input.act('hud')) cycleHud();
    this.lookBack = inp.look;
    if (input.act('mute')) { const m = audio.toggleMute(); this.hud.camHint(m ? 'TON AUS' : 'TON AN'); }
    if (input.act('reset') && this.state === 'race' && !this.pitCtl) this.resetCar();
    if (input.act('box')) this.toggleBox();
    if (input.act('tyre')) this.cyclePitTyre();

    this.time += dt;
    // ---- start procedure
    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT < 0.1) { this.hud.setIntro(this.introHTML()); document.body.classList.add('intro-on'); }
      // single player can skip with the throttle or a tap; in multiplayer everyone watches the same length
      const skip = !this.mp && this.introT > 0.8 && (inp.throttle > 0.6 || this.introSkip);
      if (this.introT > INTRO_LEN || skip) {
        this.state = this.afterIntro; this.stateT = 0;
        this.hud.setIntro(null); this.applyCamera(true); document.body.classList.remove('intro-on');
      }
    }
    if (this.state === 'formation') this.updateFormation(dt, inp);
    if (this.state === 'grid') {
      this.stateT += dt;
      this.updateLaunchRevs(dt, inp);
      const n = Math.min(5, Math.floor((this.stateT - 0.8) / 1.0) + 1);
      if (this.stateT > 0.8) {
        if (n !== this.lastLights) { this.lastLights = n; if (n > 0) audio.beep(520, 0.18); }
        this.hud.setLights(n, true); this.track.setStartLights(n, false);
      }
      if (this.stateT > 0.8 + 5 + this.lightsHold && this.rainZone && !this.zoneMsg) { this.zoneMsg = true; this.radio.say(`Regen nur in einem Teil der Strecke, ab Sektor ${this.sectorOf(this.rainZone.s0) + 1}. Dort ist es rutschig.`, 3); }
      if (this.stateT > 0.8 + 5 + this.lightsHold) {
        this.state = 'race'; this.raceTime = 0;
        this.hud.setLights(0, true); this.track.setStartLights(0, true);
        audio.beep(1040, 0.4);
        this.hud.message('LIGHTS OUT', 1.6, 'big');
        setTimeout(() => this.hud.setLights(0, false), 900);
        this.judgeLaunch();
        this.lap.start = 0; this.lap.sectorStart = 0;
      }
    }
    const racing = this.state === 'race' || this.state === 'finished';
    const mpSync = !!this.mp;
    if (racing) this.raceTime += dt;
    const wEvent = this.weather.step(dt, this.raceTime);
    // grip + AI speed profile follow the track wetness (cheap, so twice a second)
    this.surfaceT = (this.surfaceT || 0) - dt;
    if (this.surfaceT <= 0) { this.surfaceT = 0.5; this.track.setWetness(this.rainZone ? 0 : this.weather.wetness); }
    if (this.rainZone) this.updateRainZone(dt);
    if (this.opts.weather === 'storm' && !this.paused) this.updateStorm(dt);
    if (wEvent === 'start') this.hud.message('REGEN SETZT EIN', 3, 'rain');
    if (wEvent === 'stop') this.hud.message('DER REGEN HÖRT AUF', 3);
    if (this.track.wet !== this.lastWetState && this.lastWetState !== undefined) this.hud.warn(this.track.wet ? 'STRECKE NASS — WENIGER GRIP' : 'STRECKE TROCKNET AB', 2.5);
    this.lastWetState = this.track.wet;

    // ---- physics (fixed sub-steps)
    const p = this.player;
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    const forming = this.state === 'formation';
    if (this.pitCtl) this.stepPlayerPit(dt);
    else if (forming && this.parkCtl) this.stepPark(p, dt);
    else if (this.spectator) { /* watching: no car to drive */ }
    else for (let i = 0; i < steps; i++) {
      p.update(h, inp, (racing || forming) && !this.playerEntry.finished);
      if (this.playerEntry.finished) { p.throttle = 0; }
    }
    // shift edges consumed
    if (racing) for (const ai of this.aiList) if (!ai.net) { if (ai.pitCtl) this.stepAIPit(ai, dt); else ai.update(dt, this.raceTime, this.allObjs(), this.track.mu); }
    if (forming) for (const ai of this.aiList) { if (ai.park) this.stepPark(ai, dt); else ai.update(dt, 99, this.allObjs(), this.track.mu); }
    if (mpSync) this.netSync(dt, racing);
    this.resolveCollisions(racing || forming ? dt : 0);
    if (p.impact > 0.25 && !this.lastImpact) { audio.crash(p.impact); this.hud.warn('KOLLISION', 1.2); }
    this.lastImpact = p.impact > 0.25;
    this.updateRaceSystems(dt, racing || forming);
    this.updateFlags(dt, racing);
    this.updateRadio(dt, racing);
    if (racing && this.replay) this.recordReplay();

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
      // lap crossings for everyone: fastest lap of the race (TV graphic in purple)
      if (racing && !c.gone && !c.spectator) {
        const n = Math.floor(c.obj.dist / L);
        if (c.lapN === undefined) c.lapN = n;
        if (n > c.lapN) {
          if (n >= 2 && c.lapAt !== undefined && !c.obj.pitCtl) {
            const lt = t - c.lapAt;
            if (lt > 20 && (!this.fastest || lt < this.fastest.t)) {
              const first = !this.fastest; this.fastest = { t: lt, name: c.name, entry: c };
              const human = c.isPlayer || c.remote;
              if ((!first || this.laps > 2) && (human || t - (this.flShown || -99) > 6)) this.flShown = t, this.hud.tv(`<span class="tv-tag">SCHNELLSTE RUNDE</span><i style="background:${hex(c.team.body === 0xf0f0f0 || c.team.body === 0x161616 ? c.team.accent : c.team.body)}"></i><b>${c.name}</b><em>${fmtTime(lt)}</em>`, 'purple', 4);
            }
          }
          c.lapN = n; c.lapAt = t;
        }
      }
      if (c.remote) continue;
      if (!c.finished && racing && c.obj.dist >= this.laps * L) {
        c.finished = true; c.finishTime = t;
        if (c.isPlayer) this.onPlayerFinish();
      }
    }
    if (this.flying && !this.lapStarted && p.dist >= 0) {
      this.lapStarted = true; this.lap.start = this.raceTime; this.lap.sectorStart = this.raceTime;
      this.hud.message(this.mode === 'quali' ? 'QUALIFYING — 3 GEZEITETE RUNDEN' : 'ZEITFAHREN — FLIEGENDE RUNDE', 2);
      if (this.mode === 'tt') this.showBoardTop();
    }
    if (racing && (!this.flying || this.lapStarted)) this.updateLapTiming();
    // spectators: the race ends for them once the field is home
    if (this.spectator && this.state === 'race' && this.cars.some((c) => c.finished && !c.spectator)) {
      this.specEndT = (this.specEndT || 0) + dt;
      if (this.specEndT > 25 || this.cars.every((c) => c.finished || c.gone)) { this.state = 'finished'; this.stateT = 0; }
    }
    if (this.mode === 'tt') this.updateTT();
    if (this.mode === 'school') this.updateSchool(dt);

    // ---- stuck (off track, barely moving) -> put the car back on the racing line
    if (this.state === 'race' && !this.pitCtl && Math.abs(p.v) < 3 && (p.offTrack || p.impact > 0.1)) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 3.5) { this.stuckT = 0; this.resetCar(); } }
    else this.stuckT = 0;

    // ---- track limits
    if (p.offTrack && !this.offWasOn && this.state === 'race' && !this.pitCtl) {
      this.trackWarnings++;
      this.lap.invalid = true;
      if (this.penOn && this.trackWarnings > 3) this.penalize(5, 'STRECKENBEGRENZUNG');
      else this.hud.warn(`STRECKENBEGRENZUNG — RUNDE UNGÜLTIG (${this.trackWarnings}${this.penOn ? '/3' : ''})`, 2.2);
    }
    this.offWasOn = p.offTrack;

    this.order = this.computeOrder();
    this.overtakeTicker();
    const prevPos = this.playerPos;
    this.playerPos = this.order.indexOf(this.playerEntry) + 1;
    if (prevPos && this.raceTime > 6 && this.state === 'race' && !this.pitCtl) {
      if (this.playerPos < prevPos) { const o = this.order[this.playerPos]; if (o && !o.obj.pitCtl && this.raceTime - (this.lastOtLog || -9) > 4) { this.lastOtLog = this.raceTime; this.logEvent(`Überholt: ${o.name} (P${this.playerPos})`); } }
    }
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
      if (this.stateT > 5 && !this.resultsShown && !this.podium) { if (this.mode === 'race' && !this.opts.sprintRace && settings.podium !== false) this.showPodium(); else this.showResults(); }
    }
    input.endFrame();
  }

  // multiplayer: publish our car (and the host's AI), read everyone else's
  netSync(dt, racing) {
    const net = this.mp.net, p = this.player, r2 = (v, k) => Math.round(v * k) / k;
    const msg = this.spectator ? { car: null, fin: null } : { car: [r2(p.x, 100), r2(p.z, 100), r2(p.yaw, 1000), r2(p.v, 10), r2(p.dist, 10), r2(p.lat, 100), r2(p.steer, 100), TYRE_ORDER.indexOf(p.tyre), Math.round(performance.now())], fin: this.playerEntry.finished ? r2(this.playerEntry.finishTime, 1000) : null };
    if (net.isHost) msg.sc = this.sc ? [this.sc.kind === 'VSC' ? 1 : 2, this.sc.ph === 'in' ? 1 : this.sc.ph === 'end' ? 2 : 0, this.scObj ? r2(this.scObj.dist, 10) : null, this.scObj ? r2(this.scObj.lat, 100) : 0, this.scObj ? r2(this.scObj.v, 10) : 0] : null;
    if (net.isHost) msg.ai = this.aiList.map((a) => [r2(a.dist, 10), r2(a.lat, 100), r2(a.v, 10), r2(a.spinYaw, 100), TYRE_ORDER.indexOf(a.tyre)]);
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
      if (Array.isArray(car) && car.length >= 7 && st.updatedAt !== c.lastUpd) {
        c.lastUpd = st.updatedAt; c.obj.target(car, now);
        const ty = TYRE_ORDER[car[7]];
        if (ty && ty !== c.obj.tyre) { c.obj.tyre = ty; setTyreLook(c.mesh, ty); }
      }
      if (typeof st.presence.fin === 'number' && !c.finished) { c.finished = true; c.finishTime = st.presence.fin; }
      c.obj.update(dt);
    }
    // AI simulated by the host
    if (!net.isHost) {
      const h = net.hostPeer();
      const ai = h && Array.isArray(h.presence.ai) ? h.presence.ai : null;
      if (ai && h.updatedAt !== this.hostUpd) { this.hostUpd = h.updatedAt; this.hostSeen = now; this.applyNetSC(h.presence.sc); }
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
          const ty = TYRE_ORDER[s[4]];
          if (ty && ty !== a.tyre) { a.tyre = ty; setTyreLook(this.entryOf.get(a).mesh, ty); }
          a.latOff = a.lat - this.track.racingLat(a.s);
        }
        a.wheelRot += (a.v * dt) / CAR.tyreR;
        a.computePose(dt);
      }
    }
  }

  allObjs() { if (!this._objs) { this._objs = this.cars.map((c) => c.obj); if (this.scObj) this._objs.push(this.scObj); } return this._objs; }

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
      this.onLapDone(lt, valid);
      if (valid && lt < lap.best) { lap.best = lt; if (lap.lapNo > 0) { this.hud.message(`PERSÖNLICHE BESTZEIT<br><b>${fmtTime(lt)}</b>`, 3, 'purple'); if (this.mode !== 'tt') this.radio.say('Starke Runde, persönliche Bestzeit!'); } }
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
    this.logEvent('Zieldurchfahrt');
    if (this.mode === 'quali') {
      const pos = this.qualiOrder().indexOf(this.playerEntry) + 1;
      this.hud.message(`QUALIFYING BEENDET — P${pos}`, 4, 'big');
      this.radio.say(pos === 1 ? 'Pole Position! Fantastische Runde!' : `Startplatz ${pos}. Jetzt zählt das Rennen.`, 3, true);
      return;
    }
    const pos = this.computeOrder().indexOf(this.playerEntry) + 1;
    this.hud.message(`<span class="chequer"></span>ZIEL — P${pos}`, 5, 'big');
    if (this.mode !== 'tt' && this.mode !== 'quali') this.radio.say(pos === 1 ? 'Ja! Du hast gewonnen! Was für ein Rennen!' : pos <= 3 ? `P${pos}, Podium! Starke Leistung!` : pos <= 10 ? `P${pos}, gute Punkte heute.` : `P${pos}. Wir schauen uns die Daten an.`, 4, true);
    audio.beep(880, 0.3); setTimeout(() => audio.beep(1320, 0.5), 300);
  }

  // ---------------------------------------------------------- formation lap + launch
  updateFormation(dt, inp) {
    const tr = this.track, L = tr.length, p = this.player;
    this.formT += dt;
    if (this.formT < 0.1) { this.hud.message('EINFÜHRUNGSRUNDE<br><b>Reifen und Bremsen aufwärmen, nicht überholen</b>', 4); this.radio.say('Einführungsrunde. Reifen warm machen, in Kurven etwas schlängeln. Dann in deine Startbox.', 4); }
    // AI: slow train, nobody passes; each car parks in its own box one lap later
    for (const c of this.cars) {
      const o = c.obj, slot = c.gridDist + L;
      if (c.isPlayer) continue;
      o.scCap = Math.min(tr.targetSpeed(o.s + 10) * 0.7, 55); o.noPass = true;
      if (!o.park && o.dist > slot - 230) o.park = { slot, lat: c.gridLat };
    }
    if (!this.parkCtl && p.dist > this.playerEntry.gridDist + L - 200) {
      this.parkCtl = { slot: this.playerEntry.gridDist + L, lat: this.playerEntry.gridLat };
      p.park = this.parkCtl;
      this.hud.warn('STARTBOX — DAS AUTO PARKT AUTOMATISCH', 2.5);
    }
    if (this.parkCtl) this.hud.setFlag('green', 'EINFÜHRUNGSRUNDE');
    else this.hud.setFlag('green', `EINFÜHRUNGSRUNDE · NOCH ${Math.max(0, Math.round(this.playerEntry.gridDist + L - p.dist))} M`);
    // done when everyone is in the box (a car stuck behind another one gets 12 s, then it is placed)
    const ready = this.cars.every((c) => c.spectator || (c.obj.park && (c.obj.park.done || c.obj.park.t > 12)));
    if (ready || this.formT > 240) this.endFormation();
  }

  // drive a car into its grid box and stop there
  stepPark(o, dt) {
    const tr = this.track, P = o.park;
    P.t = (P.t || 0) + dt;
    const togo = P.slot - o.dist;
    const vT = P.done ? 0 : Math.max(0, Math.min(tr.targetSpeed(o.s + 10) * 0.5, Math.sqrt(2 * 3 * Math.max(0, togo))));
    o.v = o.v > vT ? Math.max(vT, o.v - 8 * dt) : Math.min(vT, o.v + 4 * dt);
    if (togo < 0.25 && o.v < 0.6) { P.done = true; o.v = 0; }
    const d = o.v * dt;
    if (o === this.player) {
      const lat = o.lat + (P.lat - o.lat) * Math.min(1, dt * 1.2);
      const s = tr.wrapS(o.s + d);
      const [x, z] = tr.posAt(s, lat), [x2, z2] = tr.posAt(tr.wrapS(s + 3), P.lat);
      o.x = x; o.z = z; o.yaw = Math.atan2(-(x2 - x), -(z2 - z)); o.yawRate = 0; if (o.vy) o.vy = 0; o.steer *= Math.exp(-dt * 4);
      tr.locate(x, z, o.hint, o.loc); o.hint = o.loc.i; o.s = o.loc.s; o.lat = o.loc.lat;
      o.dist += d; o.wheelRot += d / CAR.tyreR; o.throttle = 0; o.brake = vT < o.v ? 0.3 : 0;
      o.gear = o.v < 1 ? 1 : 2;
    } else {
      o.dist += d; o.lat += (P.lat - o.lat) * Math.min(1, dt * 1.2); o.latOff = o.lat - tr.racingLat(o.s);
      o.wheelRot += d / CAR.tyreR; o.computePose(dt);
    }
  }

  endFormation() {
    const tr = this.track, L = tr.length;
    // everyone back on the grid numbers: put stragglers into their box, reset the lap counters
    for (const c of this.cars) {
      const o = c.obj;
      o.park = null; o.scCap = undefined; o.noPass = false; o.v = 0;
      const s = tr.wrapS(c.gridDist + tr.startS);
      if (c.isPlayer) { const keepT = o.tyreT, keepB = o.brakeT; o.placeAt(s, c.gridLat); o.tyreT = keepT; o.brakeT = keepB; o.gear = 0; o.park = null; }
      else { o.lat = c.gridLat; o.latOff = c.gridLat - tr.racingLat(s); o.knock = 0; o.spinRate = 0; o.spinYaw = 0; o.spunT = 0; }
      o.dist = c.gridDist;
      if (!c.isPlayer) o.computePose();
      c.cp.fill(-1); c.lastCp = -1;
    }
    this.parkCtl = null;
    this.state = 'grid'; this.stateT = 0; this.raceTime = 0;
    this.hud.setFlag('', '');
    this.hud.message('ALLE AUTOS IN POSITION', 1.5);
  }

  // clutch launch: keep the revs in the green window until the lights go out
  updateLaunchRevs(dt, inp) {
    const p = this.player;
    const auto = this.opts.autoGas || this.opts.steerAssist === true || this.opts.launchAssist === true;
    if (this.stateT < 0.8) { this.launchRpm = 4000; this.hud.setLaunch(null); return; }
    if (auto) { this.launchRpm = 10200; }
    else {
      const t = inp.throttle;
      // analog input sets a target, keys / pedals ramp the revs up and let them fall
      const target = inp.analog ? 4000 + t * 8500 : t > 0.5 ? 12500 : 4000;
      this.launchRpm = (this.launchRpm || 4000) + Math.max(-7000 * dt, Math.min(5200 * dt, target - (this.launchRpm || 4000)));
    }
    p.rpm = this.launchRpm; p.throttle = Math.max(0, (this.launchRpm - 4000) / 8500);
    this.hud.setLaunch(this.launchRpm, auto);
  }

  judgeLaunch() {
    const r = this.launchRpm || 4000, p = this.player;
    let mul = 1, t = 0, msg = 'GUTER START', k = 'ok';
    if (r >= 9500 && r <= 11000) { mul = 1.07; t = 2.6; msg = 'PERFEKTER START!'; k = 'perfect'; if (!(this.opts.autoGas || this.opts.steerAssist === true || this.opts.launchAssist === true)) unlock('perfect_start'); }
    else if (r > 11800) { mul = 0.7; t = 1.8; msg = 'DURCHDREHENDE RÄDER!'; k = 'spin'; if (p.tyreT) p.tyreT = p.tyreT.map((x) => x + 12); }
    else if (r < 8000) { mul = 0.78; t = 1.5; msg = 'ZU WENIG DREHZAHL'; k = 'bog'; }
    p.launchMul = mul; this.launchT = t;
    this.launchKind = k;
    this.hud.setLaunch(null);
    setTimeout(() => this.hud.warn(msg, 1.8), 700);
  }

  // ---------------------------------------------------------- tyres, pit stops, damage, penalties
  toggleBox() {
    if (this.state !== 'race' || this.playerEntry.finished || this.pitCtl || this.solo) return;
    this.boxReq = !this.boxReq;
    this.hud.warn(this.boxReq ? `BOX ANGEFORDERT — ${TYRES[this.chooseStopTyre()].name}` : 'BOXENSTOPP ABGESAGT', 2);
    audio.beep(this.boxReq ? 980 : 520, 0.12);
    this.radio && this.radio.say(this.boxReq ? `Verstanden, Box diese Runde. Wir ziehen ${TYRES[this.chooseStopTyre()].name.toLowerCase()} auf.` : 'Okay, bleib draußen.', 2);
  }

  cyclePitTyre() {
    const opts = ['auto', ...TYRE_ORDER];
    this.pitTyre = opts[(opts.indexOf(this.pitTyre) + 1) % opts.length];
    this.hud.warn(`REIFEN BEIM STOPP: ${this.pitTyre === 'auto' ? 'AUTOMATISCH (' + TYRES[this.chooseStopTyre()].name + ')' : TYRES[this.pitTyre].name}`, 1.6);
  }

  // the strategist's pick: wets / inters for the rain, otherwise the softest slick that lasts
  chooseStopTyre() {
    if (this.pitTyre !== 'auto') return this.pitTyre;
    const w = this.wetPlan(), remain = this.laps * this.track.length - this.player.dist;
    if (w > 0.32) return wetChoice(w);
    return dryChoice(Math.max(0, remain), this.raceM, this.wearRef());
  }

  beginPlayerPit() {
    const p = this.player, dm = p.dmg;
    const repair = this.dmgOn && (wingDmg(dm) > 0.05 || dm.rear > 0.1) ? 3.5 + wingDmg(dm) * 3 : 0;
    this.pitCtl = startPit(this.track, p, this.playerEntry.slot, this.chooseStopTyre(), repair);
    this.boxReq = false;
    p.drsOpen = false; p.kx = p.kz = 0; p.spin = 0;
    this.hud.warn('BOXENGASSE — 80 KM/H', 2.5);
    this.logEvent('Dein Boxenstopp');
  }

  stepPlayerPit(dt) {
    const p = this.player, P = this.pitCtl, tr = this.track;
    const r = stepPit(tr, p, P, dt);
    const [x, z] = tr.posAt(r.s, r.lat);
    const [x2, z2] = tr.posAt(tr.wrapS(r.s + 3), pitLat(tr, P, P.d + 3));
    p.x = x; p.z = z; p.yaw = Math.atan2(-(x2 - x), -(z2 - z)); p.yawRate = 0; p.vy = 0;
    p.steer *= Math.exp(-dt * 6);
    const prevS = p.s;
    tr.locate(x, z, p.hint, p.loc);
    p.hint = p.loc.i; p.s = p.loc.s; p.lat = p.loc.lat;
    let d = p.s - prevS; if (d > tr.length / 2) d -= tr.length; if (d < -tr.length / 2) d += tr.length;
    p.dist += d;
    p.wheelRot += (p.v * dt) / CAR.tyreR;
    p.gear = Math.max(1, Math.min(8, Math.ceil(p.v / 11)));
    p.rpm = 4500 + ((p.v % 11) / 11) * 6000; p.throttle = P.ph === 'stop' ? 0 : 0.4; p.brake = 0; p.limiter = false;
    p.impact = 0; p.slip = 0;
    if (P.ph === 'stop') this.hud.message(`BOXENSTOPP<br><b>${Math.max(0, P.stopT - P.t).toFixed(1)}</b>`, 0.3);
    if (P.serviced && !P.applied) {
      P.applied = true;
      p.tyre = P.tyre; p.wear = 0; p.tset = null; p.setDist = 0;
      if (P.repair) { p.dmg = newDamage(); this.showWing(this.playerModel, p.dmg); }
      setTyreLook(this.playerModel, p.tyre);
      this.playerEntry.stops = (this.playerEntry.stops || 0) + 1;
      this.hud.message(`${P.stopT.toFixed(1)} S · ${TYRES[p.tyre].name}${P.repair ? ' · NEUER FRONTFLÜGEL' : ''}`, 2.5);
      audio.beep(1200, 0.15);
    }
    if (r.done) { this.pitCtl = null; p.yawRate = 0; }
  }

  stepAIPit(ai, dt) {
    const tr = this.track, P = ai.pitCtl;
    const prevS = ai.s;
    const r = stepPit(tr, ai, P, dt);
    let d = r.s - prevS; if (d > tr.length / 2) d -= tr.length; if (d < -tr.length / 2) d += tr.length;
    ai.dist += d; ai.lat = r.lat; ai.latOff = ai.lat - tr.racingLat(ai.s);
    ai.wheelRot += (ai.v * dt) / CAR.tyreR;
    ai.computePose(dt);
    if (P.serviced && !P.applied) {
      P.applied = true;
      ai.tyre = P.tyre; ai.wear = 0; ai.tset = null; ai.setDist = 0; ai.boxWant = null;
      const e = this.entryOf.get(ai);
      if (P.repair) { ai.dmg = newDamage(); this.showWing(e.mesh, ai.dmg); }
      setTyreLook(e.mesh, ai.tyre);
      e.stops = (e.stops || 0) + 1;
    }
    if (r.done) { ai.pitCtl = null; ai.laneTimer = 0; }
  }

  // ---------------------------------------------------------- partial rain / storm
  buildRainZone(rand) {
    const tr = this.track, L = tr.length;
    const Z = (this.rainZone = { s0: rand() * L, len: L * 0.35, wet: 0.85 });
    // wet, shiny patch over the zone (vertex alpha fades in and out at the edges)
    const n = Math.ceil(Z.len / tr.ds), pos = new Float32Array((n + 1) * 2 * 3), col = new Float32Array((n + 1) * 2 * 4), idx = [];
    for (let k = 0; k <= n; k++) {
      const s = tr.wrapS(Z.s0 + k * tr.ds), w = tr.hwAt(s) + 0.6;
      const [x1, z1] = tr.posAt(s, -w), [x2, z2] = tr.posAt(s, w);
      pos.set([x1, 0.026, z1, x2, 0.026, z2], k * 6);
      const e = Math.min(1, k * tr.ds / 40, (n - k) * tr.ds / 40);
      col.set([1, 1, 1, e, 1, 1, 1, e], k * 8);
      if (k < n) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: 0x1b1f25, roughness: 0.07, metalness: 0.35, transparent: true, opacity: 0.6, vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.zoneMesh = new THREE.Mesh(g, m); this.zoneMesh.frustumCulled = false; this.zoneMesh.receiveShadow = true;
    this.scene.add(this.zoneMesh);
  }
  inZone(s) { const Z = this.rainZone; return this.track.wrapS(s - Z.s0) < Z.len; }
  // track wetness under a given position (soft 40 m edges in partial-rain mode)
  wetAt(s) {
    const Z = this.rainZone;
    if (!Z) return this.weather.wetness;
    const d = this.track.wrapS(s - Z.s0);
    if (d >= Z.len) return 0;
    return Z.wet * Math.min(1, d / 40, (Z.len - d) / 40);
  }
  // wetness the strategists plan with (whole lap)
  wetPlan() { return this.rainZone ? this.rainZone.wet * 0.35 : this.weather.wetness; }
  updateRainZone(dt) {
    const W = this.weather, p = this.player, inZ = this.inZone(p.s);
    W.rain += ((inZ ? 0.75 : 0) - W.rain) * Math.min(1, dt * 1.5);
    W.wetness = this.wetAt(p.s);
    if (inZ !== this.wasInZone) { if (inZ) this.hud.warn('REGEN IN DIESEM ABSCHNITT — NASSE STRECKE', 2); this.wasInZone = inZ; }
  }
  updateStorm(dt) {
    this.strikeT = (this.strikeT ?? 4) - dt;
    if (this.strikeT <= 0) {
      this.strikeT = 6 + Math.random() * 14;
      this.flash = 0.7 + Math.random() * 0.3;
      const delay = 0.3 + Math.random() * 2.6;
      setTimeout(() => audio.thunder(1 - delay / 3), delay * 1000);
      if (Math.random() < 0.4) setTimeout(() => { this.flash = 0.6; }, 140); // double flash
    }
  }

  // tyre temperatures per corner (player) and brake temperatures (every car)
  updateTemps(dt, racing) {
    const p = this.player, w = this.wetAt(p.s), tr = this.track;
    this.tempOn = this.opts.tyreTemp !== false && this.mode !== 'school';
    const amb = (this.tod.lamps > 0.5 ? 24 : this.tod.sunEl < 20 ? 28 : 34) - w * 14;
    // asphalt: sun-heated in daylight, near air temperature at night, cooled by water (estimate)
    const trackT = amb + (this.tod.lamps > 0.5 ? 4 : this.tod.sunEl < 20 ? 8 : 16) * (1 - w);
    if (dt <= 0) return;
    // tyre wear: energy-based (tyres.js), compressed to the race length like the wear rate of F1 games
    const k = this.lesson && this.lesson.id === 'tyres' ? 0.4 : this.solo ? 0 : this.opts.tyreWear ?? 1;
    const comp = Math.max(1, THERM.realRaceM / Math.max(this.raceM || THERM.realRaceM, 1));
    this.wearScale = k * comp;
    const freshT = (c) => (this.flying ? TYRE_WINDOW[c][0] - 6 : isSlick(c) ? 70 : 50); // blankets: 70 °C slicks
    // ---- player: energies straight from the vehicle model
    if (!p.tset || p.tset.c !== p.tyre) p.tset = newTyreSet(p.tyre, freshT(p.tyre));
    for (let i = 0; i < 4; i++) { p.tset.E[i] += p.tyreE[i]; p.tset.R[i] += p.tyreR[i]; p.tyreE[i] = 0; p.tyreR[i] = 0; }
    p.tset.R[0] += p.brakeE * THERM.rimShare / 2; p.tset.R[1] += p.brakeE * THERM.rimShare / 2; // brake heat through the rims
    const wearing = racing && !this.pitCtl ? this.wearScale : 0;
    const over = stepTyres(p.tset, dt, p.v, amb, trackT, w, wearing);
    p.tyreT = [0, 1, 2, 3].map((i) => gripTemp(p.tset, i)); p.tyreFor = p.tyre;
    p.wear = Math.max(...p.tset.wear);
    tyreFactors(p.tset, p.tyreMu, this.tempOn);
    this.overheat = over;
    p.brakeT = stepBrake(p.brakeT ?? amb + 180, p.brakeE * (1 - THERM.rimShare), dt, p.v, amb); p.brakeE = 0;
    // cold carbon brakes bite less, overheated ones fade
    p.brakeMul = !this.tempOn ? 1 : p.brakeT < 300 ? 0.9 + (p.brakeT / 300) * 0.1 : p.brakeT > 1000 ? Math.max(0.75, 1 - (p.brakeT - 1000) / 1200) : 1;
    // ---- AI: the same energies estimated from speed, line curvature and acceleration
    for (const ai of this.aiList) {
      if (ai.net) continue;
      const wa = this.wetAt(ai.s), ax = ((ai.v - (ai.prevVb ?? ai.v)) / dt); ai.prevVb = ai.v;
      if (!ai.tset || ai.tset.c !== ai.tyre) ai.tset = newTyreSet(ai.tyre, freshT(ai.tyre));
      const moving = racing && !ai.pitCtl && !(ai.spunT > 0);
      if (moving) aiTyreEnergy(ai.tset, ai.v, tr.kRace[tr.idx(ai.s)], Math.max(-60, Math.min(20, ax)), tr.mu * tyreGrip(ai.tyre, 0, wa), dt);
      stepTyres(ai.tset, dt, ai.v, amb, trackT, wa, moving ? this.wearScale : 0);
      ai.wear = Math.max(...ai.tset.wear);
      ai.tyreF = tyreFactors(ai.tset, ai.tyreF || [1, 1, 1, 1], this.tempOn);
      if (ax < 0 && moving) { const eb = VEH.mass * -ax * ai.v * 0.56 * dt; ai.brakeE = (ai.brakeE || 0) + eb; ai.tset.R[0] += eb * THERM.rimShare / 2; ai.tset.R[1] += eb * THERM.rimShare / 2; }
      ai.brakeT = stepBrake(ai.brakeT ?? amb + 180, (ai.brakeE || 0) * (1 - THERM.rimShare), dt, ai.v, amb); ai.brakeE = 0;
      if (moving) ai.setDist = (ai.setDist || 0) + ai.v * dt;
    }
    if (racing && !this.pitCtl) p.setDist = (p.setDist || 0) + Math.abs(p.v) * dt;
  }

  // underfloor sparks: the plank scrapes at top speed, kerbs throw bursts
  floorSparks(o, dt, onKerb) {
    if (!this.sparkPts || o.pitCtl) return;
    const v = Math.abs(o.v || 0);
    const rate = onKerb && v > 25 ? 14 : v > 62 ? (v - 62) * 0.35 : 0;
    if (!rate || Math.random() > rate * dt) return;
    const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw), S = this.sparkPts.userData;
    const n = 3 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const k = S.next = (S.next + 1) % S.max;
      S.pos[k * 3] = o.x - fx * (0.6 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.5; S.pos[k * 3 + 1] = 0.04; S.pos[k * 3 + 2] = o.z - fz * (0.6 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.5;
      const sp = v * (0.45 + Math.random() * 0.25), side = (Math.random() - 0.5) * 3;
      S.vel[k * 3] = fx * sp + Math.cos(o.yaw) * side; S.vel[k * 3 + 1] = 0.5 + Math.random() * 2.2; S.vel[k * 3 + 2] = fz * sp - Math.sin(o.yaw) * side;
      S.life[k] = 0.18 + Math.random() * 0.3;
    }
  }

  updateRaceSystems(dt, racing) {
    if (this.launchT > 0) { this.launchT -= dt; if (this.launchT <= 0) this.player.launchMul = 1; }
    const tr = this.track, w = this.weather.wetness, k = this.lesson && this.lesson.id === 'tyres' ? 0.6 : this.solo ? 0 : this.opts.tyreWear ?? 1, p = this.player;
    const wp = this.wetAt(p.s), zoneMu = (x) => (this.rainZone ? 1 - 0.28 * x : 1); // the dry speed profile doesn't know about the wet patch
    const de = damageEffect(p.dmg);
    this.updateTemps(dt, racing);
    this.updateRubber(dt);
    // rubbered line grips a little more, the marbles beside it a lot less
    const off = Math.abs(p.lat - tr.racingLat(p.s));
    const rubberGrip = off < 1.6 ? 1 + this.rubber * 0.02 : off > 2.8 && Math.abs(p.lat) < tr.hwAt(p.s) ? 1 - Math.max(0, this.rubber - 0.3) * 0.08 : 1;
    p.gripMul = (this.careerGrip || 1) * tyreGrip(p.tyre, 0, wp) * zoneMu(wp) * de.grip * rubberGrip; // temperature + wear act per wheel (p.tyreMu) p.dragMul = de.drag; p.pull = de.pull;
    for (const ai of this.aiList) {
      if (ai.net) continue;
      const wa = this.wetAt(ai.s);
      const f = ai.tyreF || [1, 1, 1, 1];
      ai.gripMul = tyreGrip(ai.tyre, 0, wa) * ((f[0] + f[1] + f[2] + f[3]) / 4) * zoneMu(wa) * damageEffect(ai.dmg).grip;
    }
    // wall hits break the front wing
    if (p.wallHit > 22) this.incident(p, 1);
    if (p.wallHit) { if (this.dmgOn && p.wallHit > 8) this.addDamage(p, p.wallSide > 0 ? 'R' : 'L', (p.wallHit - 6) / 30); p.wallHit = 0; }
    this.stratT -= dt;
    if (racing && this.stratT <= 0) { this.stratT = 0.5; this.aiStrategy(); }
    if (this.boxReq && !this.pitCtl && this.state === 'race' && !this.playerEntry.finished && pitWindow(tr, p.s) && p.v > 5) this.beginPlayerPit();
    this.penCool -= dt;
    this.updateDebris(dt);
    const tb = $('#tc-box'), on = this.boxReq || !!this.pitCtl;
    if (tb && tb._on !== on) { tb._on = on; tb.classList.toggle('on', on); }
    this.hud.setCarStatus({ tyre: p.tyre, wear: p.wear, dmg: p.dmg, box: this.boxReq || !!this.pitCtl, pen: this.playerEntry.pen, wearOn: k > 0, temps: this.tempOn ? p.tyreT : null, win: TYRE_WINDOW[p.tyre], brakeT: p.brakeT });
  }

  // wear per metre of a medium in this race, measured from every car's current set (the strategists
  // look at the timing data); before there is enough running, a prior: half a race distance to the cliff
  wearRef() {
    let wSum = 0, dSum = 0;
    for (const c of this.cars) { const o = c.obj; if (!o.tset || !(o.setDist > 800)) continue; wSum += o.wear / TYRES[o.tyre].wear; dSum += o.setDist; }
    const prior = (0.7 / (0.5 * (this.raceM || 1))) * ((this.opts.tyreWear ?? 1) > 0 ? 1 : 0);
    return dSum > 4000 ? wSum / dSum : prior;
  }

  // AI pit calls: weather changes (not all on the same lap), worn tyres, a broken wing
  aiStrategy() {
    const tr = this.track, w = this.wetPlan(), L = tr.length, k = this.opts.tyreWear ?? 1;
    for (const c of this.cars) {
      const ai = c.obj;
      if (c.isPlayer || c.remote || ai.net || ai.pitCtl || c.finished) continue;
      const remain = this.laps * L - ai.dist;
      if (remain < L * 0.6) { ai.boxWant = null; continue; } // bring it home
      if (!ai.boxWant) {
        const call = weatherCall(ai.tyre, w);
        // wear per metre this car has actually seen on this set (falls back to the race-wide estimate)
        const rate = ai.setDist > 800 ? ai.wear / ai.setDist : this.wearRef() * TYRES[ai.tyre].wear;
        if (call) ai.boxWant = call === 'dry' ? dryChoice(remain, this.raceM, this.wearRef()) : call;
        else if (k > 0 && ai.wear > 0.5 && ai.wear + rate * remain > 0.92) ai.boxWant = isSlick(ai.tyre) ? dryChoice(remain, this.raceM, this.wearRef()) : ai.tyre;
        else if (this.dmgOn && wingDmg(ai.dmg) > 0.45) ai.boxWant = isSlick(ai.tyre) ? dryChoice(remain, this.raceM, this.wearRef()) : ai.tyre;
      }
      const inWin = pitWindow(tr, ai.s);
      if (inWin && !ai.inWin && ai.boxWant && !(ai.spunT > 0) && !this.sc) {
        // some gamble one more lap on the wrong tyre
        const go = weatherCall(ai.tyre, w) ? Math.random() < 0.7 : true;
        if (go) {
          const dm = ai.dmg, repair = this.dmgOn && (wingDmg(dm) > 0.05 || dm.rear > 0.1) ? 3.5 + wingDmg(dm) * 3 : 0;
          ai.pitCtl = startPit(tr, ai, c.slot, ai.boxWant, repair);
        }
      }
      ai.inWin = inWin;
    }
  }

  // ---------------------------------------------------------- spectator (multiplayer)
  // auto mode follows the closest fight near the front, otherwise the chosen car
  updateSpectator(dt) {
    const S = this.spec, order = this.order || this.cars;
    if (this.cars[S.focus].gone) S.focus = this.cars.findIndex((c) => !c.gone);
    S.t -= dt;
    if (S.auto && S.t <= 0) {
      S.t = 10;
      let best = null, bestGap = 1e9;
      order.slice(0, 10).forEach((c, i) => { const n = order[i + 1]; if (!n || c.gone || n.gone) return; const g = c.obj.dist - n.obj.dist; if (g > 0 && g < bestGap) { bestGap = g; best = n; } });
      if (best) { const k = this.cars.indexOf(best); if (k !== S.focus) { S.focus = k; this.chaseCam = null; } }
      const cams = ['tv', 'tv', 'chase', 'heli', 'onboard'];
      S.cam = cams[(Math.random() * cams.length) | 0]; this.chaseCam = null;
    }
    if (S.cam === 'onboard') this.playerModel.userData.tcam.visible = true;
    this.specUIT = (this.specUIT || 0) - dt;
    if (this.specUIT <= 0) {
      this.specUIT = 0.3;
      const c = this.cars[S.focus], pos = order.indexOf(c) + 1;
      $('#sp-car').textContent = `P${pos} ${c.name}`;
      $('#sp-cam').textContent = { tv: 'TV', chase: 'VERFOLGER', heli: 'HELI', onboard: 'ONBOARD' }[S.cam];
      $('#sp-auto').classList.toggle('on', S.auto);
    }
  }

  // ---------------------------------------------------------- photo mode
  startPhoto() {
    if (this.mp) return;
    if (!this.paused) this.togglePause(true);
    const p = this.player;
    this.photo = { yaw: p.yaw + 2.4, pitch: 0.12, dist: 6.5, fov: 40, dof: 35, roll: 0, filter: 'none', snap: null };
    this.scene.add(this.camera);
    this.cockpit.visible = false; this.playerModel.userData.helmet.visible = true; this.playerModel.userData.tcam.visible = true;
    document.body.classList.add('photo');
    $('#photo-ui').hidden = false;
    renderPhotoUI();
  }

  stopPhoto() {
    this.photo = null;
    if (this.photoComposer) { this.photoComposer.dispose(); this.photoComposer = null; }
    document.body.classList.remove('photo', 'ph-cinema', 'ph-hidepanel');
    renderer.domElement.style.filter = '';
    $('#photo-ui').hidden = true;
    this.camera.rotation.order = 'XYZ';
    this.applyCamera(true);
    $('#pause').classList.add('active');
  }

  photoCamera() {
    const P = this.photo, p = this.player, cam = this.camera;
    if (cam.parent !== this.scene) this.scene.add(cam);
    const tx = p.x, ty = 0.55, tz = p.z;
    const ch = Math.cos(P.pitch);
    cam.position.set(tx + Math.sin(P.yaw) * ch * P.dist, Math.max(0.12, ty + Math.sin(P.pitch) * P.dist), tz + Math.cos(P.yaw) * ch * P.dist);
    cam.lookAt(tx, ty, tz);
    cam.rotateZ((P.roll * Math.PI) / 180);
    if (Math.abs(cam.fov - P.fov) > 0.01) { cam.fov = P.fov; cam.updateProjectionMatrix(); }
  }

  // depth of field: focus on the car, aperture from the slider
  renderPhotoDof() {
    const P = this.photo;
    if (!this.photoComposer) {
      const c = new EffectComposer(renderer);
      c.addPass(terrainScenePass(new RenderPass(this.scene, this.camera)));
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: P.dist, aperture: 0.004, maxblur: 0.012 });
      c.addPass(terrainScenePass(this.bokeh)); c.addPass(new OutputPass()); // bokeh renders the scene's depth too
      this.photoComposer = c;
    }
    const u = this.bokeh.uniforms;
    u.focus.value = P.dist; u.aperture.value = (P.dof / 100) * 0.012; u.maxblur.value = 0.004 + (P.dof / 100) * 0.016;
    this.photoComposer.setSize(innerWidth, innerHeight); this.photoComposer.setPixelRatio(renderer.getPixelRatio());
    terrainEnable(false); this.photoComposer.render();
  }

  // ---------------------------------------------------------- replay
  logEvent(label) { if (this.replay && !this.replayMode && this.state !== 'grid') this.replay.events.push({ t: this.raceTime, label }); }

  recordReplay() {
    const R = this.replay, CH = 1024;
    if (R.n && this.raceTime < R.last + 1 / R.hz - 1e-6) return;
    R.last = this.raceTime;
    const ci = Math.floor(R.n / CH);
    if (!R.chunks[ci]) R.chunks[ci] = new Float32Array(CH * R.fs);
    const a = R.chunks[ci], o0 = (R.n % CH) * R.fs;
    a[o0] = this.raceTime;
    let k = o0 + 1;
    for (const c of this.cars) { const o = c.obj; a[k++] = o.x; a[k++] = o.z; a[k++] = o.yaw; }
    const S = this.scObj;
    a[k++] = S ? S.x : 0; a[k++] = S ? S.z : 0; a[k++] = S ? S.yaw : 0; a[k] = S ? 1 : 0;
    R.n++;
  }

  replayFrame(i) { const R = this.replay, CH = 1024; return [R.chunks[Math.floor(i / CH)], (i % CH) * R.fs]; }

  startReplay() {
    const R = this.replay;
    if (!R || R.n < 2) return;
    const [a0] = this.replayFrame(0), [aN, oN] = this.replayFrame(R.n - 1);
    this.replayMode = { t: a0[0], t0: a0[0], t1: aN[oN], speed: 1, playing: true, focus: this.cars.indexOf(this.playerEntry), cam: 'tv' };
    this.paused = false; this.chaseCam = null;
    this.lookBack = false;
    this.radio.stop();
    this.cockpit.visible = false; this.playerModel.userData.helmet.visible = true; this.playerModel.userData.tcam.visible = true;
    for (const d of this.debris) this.scene.remove(d.m);
    this.debris = [];
    this.scene.add(this.camera);
    showScreen('none');
    document.body.classList.add('replaying', 'ingame');
    $('#replay-ui').hidden = false;
    renderReplayUI(true);
  }

  stopReplay() {
    this.replayMode = null;
    this.camera.rotation.order = 'XYZ';
    document.body.classList.remove('replaying', 'ingame');
    $('#replay-ui').hidden = true;
    showScreen('results');
  }

  // set every car to its recorded pose at replay time t
  updateReplay(dt) {
    const M = this.replayMode, R = this.replay;
    if (M.playing) { M.t += dt * M.speed; if (M.t >= M.t1) { M.t = M.t1; M.playing = false; } }
    let lo = 0, hi = R.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; const [a, o] = this.replayFrame(m); if (a[o] <= M.t) lo = m; else hi = m; }
    const [A, oa] = this.replayFrame(lo), [B, ob] = this.replayFrame(hi);
    const span = Math.max(1e-6, B[ob] - A[oa]), f = Math.max(0, Math.min(1, (M.t - A[oa]) / span));
    let k = 1;
    const lerpYaw = (y0, y1) => { let d = y1 - y0; d = Math.atan2(Math.sin(d), Math.cos(d)); return y0 + d * f; };
    for (const c of this.cars) {
      const o = c.obj;
      const x = A[oa + k] + (B[ob + k] - A[oa + k]) * f, z = A[oa + k + 1] + (B[ob + k + 1] - A[oa + k + 1]) * f;
      const moved = Math.hypot(x - o.x, z - o.z);
      o.v = dt > 0 && M.playing ? Math.min(100, moved / dt) : 0;
      o.wheelRot = (o.wheelRot || 0) + moved / CAR.tyreR;
      o.x = x; o.z = z; o.yaw = lerpYaw(A[oa + k + 2], B[ob + k + 2]);
      if (c.isPlayer) { o.impact = 0; o.bump = 0; this.track.locate(x, z, o.hint, o.loc); o.hint = o.loc.i; o.s = o.loc.s; }
      k += 3;
    }
    // safety car
    const sv = A[oa + k + 3] > 0.5;
    if (this.scMesh) {
      this.scMesh.visible = sv;
      if (sv) { this.scObj = this.scObj || { x: 0, z: 0, yaw: 0, wheelRot: 0, v: 0, dist: 0, lat: 0, remote: true }; this.scObj.x = A[oa + k]; this.scObj.z = A[oa + k + 1]; this.scObj.yaw = A[oa + k + 2]; }
    }
    this.replayUIT = (this.replayUIT || 0) - dt;
    if (this.replayUIT <= 0) { this.replayUIT = 0.2; renderReplayUI(); }
  }

  replayCamera(dt, M = this.replayMode) {
    const c = this.cars[M.focus], o = c.obj, cam = this.camera;
    if (cam.parent !== this.scene) this.scene.add(cam);
    if (M.cam === 'onboard') {
      // T-cam above the airbox, computed from the recorded pose (mesh matrices lag a frame)
      cam.position.set(o.x + Math.sin(o.yaw) * 0.78, 1.24, o.z + Math.cos(o.yaw) * 0.78);
      cam.rotation.order = 'YXZ'; cam.rotation.set(-0.085, o.yaw, 0);
      if (Math.abs(cam.fov - 58) > 0.05) { cam.fov = 58; cam.updateProjectionMatrix(); }
      this.playerModel.userData.tcam.visible = !c.isPlayer;
      return;
    }
    this.playerModel.userData.tcam.visible = true;
    const loc = this.track.locate(o.x, o.z, c.rHint ?? -1, this.rLoc || (this.rLoc = {}));
    c.rHint = loc.i;
    const subj = { x: o.x, z: o.z, yaw: o.yaw, v: o.v || 0, s: loc.s };
    if (M.subj !== M.focus + M.cam) { M.subj = M.focus + M.cam; this.chaseCam = null; }
    const v = CAMS[M.cam === 'tv' ? 'tv' : M.cam === 'heli' ? 'heli' : 'chase'];
    this.updateWorldCam(dt, v, subj);
    if (M.cam === 'chase' && Math.abs(cam.fov - v.fov) > 0.05) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
  }

  // ---------------------------------------------------------- qualifying / time trial
  initQuali(pd, diffF) {
    const tr = this.track;
    let ideal = 0; for (let i = 0; i < tr.N; i++) ideal += tr.ds / Math.max(1, tr.vProf[i]);
    // AI laps from their pace (calibrated against the AI's free-air lap: ideal / skill * 1.03, softs a bit quicker)
    this.qField = this.fieldDrivers.map((d) => {
      const skill = diffF * (1 - (1 - d.team.pace) * 0.55) * (1 + driverRating(d.name)[0] / 100) * (0.995 + Math.random() * 0.005);
      return { name: d.name, team: d.team, number: d.number, isPlayer: false, obj: { tyre: 'S' }, qt: (ideal / skill) * 1.022 * (1 + (Math.random() - 0.5) * 0.008) };
    });
    this.player.tyre = this.weather.wetness > 0.32 ? wetChoice(this.weather.wetness) : 'S';
    setTyreLook(this.playerModel, this.player.tyre);
  }

  qualiOrder() {
    const me = this.playerEntry; me.qt = this.lap.best;
    return [...this.qField, me].sort((a, b) => (a.qt || Infinity) - (b.qt || Infinity));
  }

  initTT(pd) {
    this.ghost = loadGhost(this.def.id, this.opts.carStyle);
    this.rec = [];
    this.ghostMesh = buildCar(pd.team, false, pd.number, { style: this.opts.carStyle, retro: this.opts.retro });
    this.ghostMesh.traverse((o) => {
      if (!o.material) return;
      o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.32; c.depthWrite = false; return c; });
      if (o.material.length === 1) o.material = o.material[0];
      o.castShadow = false;
    });
    this.ghostMesh.visible = false;
    this.scene.add(this.ghostMesh);
    this.ghostTmp = { x: 0, z: 0, yaw: 0 };
    if (this.ghost) this.hud.warn(`GEIST: ${fmtTime(this.ghost.time)}`, 3);
  }

  // per frame in time trial: record this lap, move the ghost, live delta
  updateTT() {
    const p = this.player, L = this.track.length;
    if (!this.lapStarted) return;
    const lt = this.raceTime - this.lap.start, dIn = p.dist - this.lap.lapNo * L;
    const k = Math.floor(lt / GHOST_DT);
    while (this.rec.length / 4 <= k) this.rec.push(p.x, p.z, p.yaw, dIn);
    if (this.ghost) {
      const gt = ghostTimeAt(this.ghost, dIn);
      this.hud.setDelta(gt === null ? null : lt - gt);
    }
  }

  // a timed lap is complete (lt = lap time)
  onLapDone(lt, valid) {
    if (this.mode === 'tt') {
      if (valid && this.ghost && lt < this.ghost.time) unlock('tt_ghost');
      if (valid && (!this.ghost || lt < this.ghost.time) && this.rec.length > 40) {
        const d = DRIVERS.find((x) => x.name === this.opts.driver) || DRIVERS[0];
        saveGhost(this.def.id, this.opts.carStyle, lt, d.name, this.rec);
        this.ghost = { time: lt, driver: d.name, data: new Float32Array(this.rec) };
        this.hud.warn('NEUER GEIST GESPEICHERT', 2);
      }
      this.rec = [];
      if (valid) submitLap(this.def.id, lt, this.opts).then(() => this.showBoardRank(lt)).catch(() => {});
    }
    if (this.mode === 'quali' && valid) submitLap(this.def.id, lt, this.opts);
  }

  // ---------------------------------------------------------- driving school
  initSchool() {
    const tr = this.track, L = tr.length, id = this.opts.lesson, p = this.player;
    let s0, D;
    if (id === 'brake') {
      // the braking zone at the end of the longest straight (turn 1)
      s0 = tr.wrapS(tr.mainStraight[1] - 420); D = 640;
    } else if (id === 'line') { s0 = tr.startS; D = L / 3; }
    else if (id === 'sector') { s0 = tr.wrapS(tr.startS + L / 3); D = L / 3; }
    else if (id === 'overtake') { s0 = tr.wrapS(tr.startS - 150); D = L; }
    else { s0 = tr.wrapS(tr.startS - 250); D = 2 * L; }
    p.placeAt(s0, tr.racingLat(s0)); p.dist = 0; p.v = Math.min(tr.vProf[tr.idx(s0)], 78); p.gear = 5;
    if (id === 'tyres') { p.tyre = 'S'; setTyreLook(this.playerModel, 'S'); }
    this.flying = false;
    // the ideal time of the segment from the speed profile
    let ideal = 0; for (let d = 0; d < D; d += tr.ds) ideal += tr.ds / Math.max(5, tr.vProf[tr.idx(s0 + d)]);
    this.lesson = { id, D, t: 0, n: 0, near: 0, ideal, contact: false, done: false };
    if (id === 'overtake') {
      this.aiList.forEach((ai, i) => {
        const d = 70 + i * 55; ai.dist = d; ai.v = p.v; ai.skill = 0.84; ai.lat = tr.racingLat(tr.wrapS(s0 + d)); ai.latOff = 0; ai.reaction = 0;
        Object.defineProperty(ai, 's', { configurable: true, get() { return tr.wrapS(this.dist + s0); } });
        ai.computePose();
      });
    }
    const Ls = LESSONS.find((l) => l.id === id);
    this.hud.message(`FAHRSCHULE · ${Ls.name.toUpperCase()}<br><b>${Ls.desc}</b>`, 4);
  }

  updateSchool(dt) {
    const L = this.lesson, p = this.player, tr = this.track;
    if (!L || L.done) return;
    L.t += dt;
    const off = Math.abs(p.lat - tr.racingLat(p.s));
    L.n++; if (off < 1.3) L.near++;
    if (p.impact > 0.35) L.contact = true;
    const passed = this.aiList.filter((a) => a.dist < p.dist).length;
    const txt = { brake: `ZEIT ${L.t.toFixed(2)} S`, line: `LINIE ${Math.round((L.near / L.n) * 100)} %`, sector: `SEKTOR ${L.t.toFixed(2)} S`, overtake: `ÜBERHOLT ${passed} / 3`, tyres: `REIFEN ${Math.round((1 - p.wear) * 100)} %` }[L.id];
    this.hud.setFlag('green', txt + ` · NOCH ${Math.max(0, Math.round(L.D - p.dist))} M`);
    L.offT = p.offTrack ? (L.offT || 0) + dt : 0;
    if (L.offT > 0.8) { this.finishLesson(0, 'Du hast die Strecke verlassen.'); return; }
    if (p.dist >= L.D) {
      const r = L.t / L.ideal, pct = L.near / L.n, life = 1 - p.wear;
      let m = 0, info = '';
      if (L.id === 'brake' || L.id === 'sector') { m = r <= 1.06 ? 3 : r <= 1.12 ? 2 : r <= 1.2 ? 1 : 0; info = `${L.t.toFixed(2)} s (Ideal ${L.ideal.toFixed(2)} s)`; }
      else if (L.id === 'line') { m = pct >= 0.85 ? 3 : pct >= 0.7 ? 2 : pct >= 0.55 ? 1 : 0; info = `${Math.round(pct * 100)} % nah an der Linie`; }
      else if (L.id === 'overtake') { m = passed >= 3 ? (!L.contact && r <= 1.15 ? 3 : 2) : passed >= 2 ? 1 : 0; info = `${passed} von 3 überholt${L.contact ? ', mit Kontakt' : ''} · ${fmtTime(L.t)}`; }
      else { m = r > 1.18 ? (life >= 0.4 ? 1 : 0) : life >= 0.55 ? 3 : life >= 0.48 ? 2 : life >= 0.4 ? 1 : 0; info = `${Math.round(life * 100)} % Reifen übrig · ${fmtTime(L.t)}${r > 1.18 ? ' (zu langsam für mehr)' : ''}`; }
      this.finishLesson(m, info);
    }
  }

  finishLesson(medal, info) {
    const L = this.lesson; L.done = true;
    if (medal) saveMedal(L.id, medal);
    this.paused = true;
    this.hud.setFlag('', '');
    const box = $('#school-result');
    box.querySelector('.sr-medal').textContent = medal ? ['', '🥉', '🥈', '🥇'][medal] : '✖';
    box.querySelector('.sr-title').textContent = medal ? MEDALS[medal].toUpperCase() : 'NICHT BESTANDEN';
    box.querySelector('.sr-info').textContent = info;
    box.hidden = false;
    audio.beep(medal >= 3 ? 1320 : medal ? 880 : 300, 0.3);
  }

  // ---------------------------------------------------------- race engineer
  updateRadio(dt, racing) {
    const R = this.radio, st = this.radioState, p = this.player;
    R.update(dt);
    if (!racing || this.solo || this.playerEntry.finished) return;
    const lapNo = this.lap.lapNo, w = this.wetPlan();
    // gaps every second lap, at the start of the lap
    if (lapNo !== st.lap) {
      st.lap = lapNo;
      if (lapNo >= 1 && lapNo % 2 === 1 && lapNo < this.laps - 1 && !this.sc) {
        const o = this.order || [], i = o.indexOf(this.playerEntry);
        const ga = i > 0 ? this.gapTo(o[i - 1]) : null, gb = o[i + 1] ? this.gapTo(o[i + 1]) : null;
        const f = (x) => Math.abs(x).toFixed(1).replace('.', ',');
        if (i === 0 && gb !== null) R.say(`Du führst. Vorsprung ${f(gb)} Sekunden auf ${o[i + 1].name}.`);
        else if (ga !== null) R.say(`P${i + 1}. Abstand nach vorne ${f(ga)} Sekunden auf ${o[i - 1].name}.${gb !== null && Math.abs(gb) < 1 ? ' ' + o[i + 1].name + ' ist direkt hinter dir.' : ''}`);
      }
      if (lapNo === this.laps - 1) R.say('Letzte Runde. Bring es nach Hause!', 2.5, true);
    }
    // weather: forecast and tyre calls
    const fc = this.weather.forecast ? this.weather.forecast(this.raceTime) : null;
    if (fc && fc[2] && fc[2].rain > 0.5 && this.weather.rain < 0.1 && !st.rainWarn) { st.rainWarn = true; R.say('Regen kommt in etwa drei Minuten. Wir behalten das im Auge.'); }
    if (this.weather.rain > 0.2) st.rainWarn = false;
    const call = weatherCall(p.tyre, w);
    if (call && !this.boxReq && !this.pitCtl && st.call !== call) { st.call = call; R.say(call === 'dry' ? 'Die Strecke trocknet. Box, box, wir gehen auf Slicks.' : `Box, box! Die Strecke ist zu nass, wir brauchen ${call === 'W' ? 'Regenreifen' : 'Intermediates'}.`, 3, true); }
    if (!call) st.call = null;
    if ((this.opts.tyreWear ?? 1) > 0 && p.wear > 0.72 && !st.worn && !this.pitCtl) { st.worn = true; R.say('Die Reifen sind fast hinüber. Box, wenn du bereit bist.', 3, true); }
    if (p.wear < 0.2) st.worn = false;
  }

  // ---------------------------------------------------------- flags, safety car, virtual safety car
  incident(o, sev) {
    if (this.state === 'race' && this.raceTime > 6) this.incScore += sev;
    const e = this.entryOf.get(o);
    if (e && sev >= 1 && this.raceTime - (this.lastIncLog || -9) > 2) { this.lastIncLog = this.raceTime; this.logEvent(`Dreher: ${e.name}`); }
  }

  sectorOf(s) { const L = this.track.length; return Math.min(2, Math.floor(this.track.wrapS(s - this.track.startS) / (L / 3))); }

  updateFlags(dt, racing) {
    const tr = this.track, p = this.player, L = tr.length;
    if (this.state === 'formation') return; // the formation lap sets its own caps and banner
    for (const ai of this.aiList) { ai.scCap = undefined; ai.noPass = false; }
    if (this.mode === 'school') return; // the lesson owns the banner
    if (!this.opts.safetyCar || this.solo || !racing) { this.hud.setFlag('', ''); return; }
    const host = !this.mp || this.mp.net.isHost;
    // local yellows: a stopped or spinning car near the racing surface
    const yel = [0, 0, 0];
    if (this.raceTime > 8) for (const c of this.cars) {
      const o = c.obj;
      if (c.gone || c.finished || o.pitCtl || (c.isPlayer && this.pitCtl)) continue;
      if ((o.spunT > 0 || o.v < 7) && Math.abs(o.lat) < 12) yel[this.sectorOf(o.s)] = 1;
    }
    for (let i = 0; i < 3; i++) this.yelT[i] = yel[i] ? 4 : Math.max(0, this.yelT[i] - dt);
    this.incScore = Math.max(0, this.incScore - dt * 0.08);
    const order = this.order || this.computeOrder();
    const leader = order.find((c) => !c.gone) || this.playerEntry;
    const remainLaps = this.laps - leader.obj.dist / L;
    this.scCool = Math.max(0, (this.scCool || 0) - dt);
    if (host && !this.sc && !this.scCool && this.state === 'race' && this.raceTime > 10 && remainLaps > 1.6 && this.scCount < 2 && this.incScore >= 2) {
      this.deploySC(this.incScore >= 3 || Math.random() < 0.5 ? 'SC' : 'VSC', leader);
    }
    const S = this.sc;
    if (S) this.runSC(dt, S, order, leader);
    // AI behaviour under yellow in their sector
    for (const ai of this.aiList) if (!S && this.yelT[this.sectorOf(ai.s)] > 0 && !ai.pitCtl) { ai.scCap = tr.targetSpeed(ai.s + 20) * 0.86; ai.noPass = true; }
    // player: overtaking under the safety car / VSC is penalised
    const pos = this.playerPos || this.playerEntry.grid;
    if (S && this.lastPos && pos < this.lastPos && !this.pitCtl) {
      const passed = order[pos]; // the car now right behind us
      if (passed && !passed.obj.pitCtl && !(passed.obj.spunT > 0) && !passed.gone && !passed.finished && Math.abs(passed.obj.lat) < 8 && passed.obj.v > 12 && p.v > passed.obj.v + 2 && S.t > 2) {
        this.giveBack = { car: passed, t: 6, why: S.kind === 'VSC' ? 'ÜBERHOLT UNTER VSC' : 'ÜBERHOLT UNTER SAFETY CAR' };
        this.hud.warn(`POSITION AN ${passed.name} ZURÜCKGEBEN`, 3);
        this.radio && this.radio.say(`Du hast unter ${S.kind === 'VSC' ? 'VSC' : 'Safety Car'} überholt. Lass ${passed.name} wieder vorbei.`, 3, true);
      }
    }
    this.lastPos = pos;
    if (this.giveBack) {
      const G = this.giveBack;
      G.t -= dt;
      if (order.indexOf(G.car) < order.indexOf(this.playerEntry) || G.car.obj.pitCtl || G.car.finished) this.giveBack = null;
      else if (G.t <= 0) { this.giveBack = null; this.blame(G.why); }
    }
    // banner
    const mySec = this.sectorOf(p.s);
    if (S) this.hud.setFlag(S.kind === 'VSC' ? 'vsc' : 'sc', S.kind === 'VSC' ? (S.ph === 'end' ? 'VSC ENDET' : 'VIRTUELLES SAFETY CAR') : S.ph === 'in' ? 'SAFETY CAR KOMMT REIN' : 'SAFETY CAR');
    else if (this.yelT[mySec] > 0 || this.yelT[(mySec + 1) % 3] > 0) this.hud.setFlag('yellow', `GELBE FLAGGE · SEKTOR ${this.yelT[mySec] > 0 ? mySec + 1 : ((mySec + 1) % 3) + 1}`);
    else if (this.greenT > 0) { this.greenT -= dt; this.hud.setFlag('green', 'GRÜNE FLAGGE'); }
    else this.hud.setFlag('', '');
  }

  deploySC(kind, leader) {
    this.sc = { kind, ph: 'run', t: 0, leaderDist0: leader.obj.dist };
    this.scCount++; this.incScore = 0;
    this.logEvent(kind === 'SC' ? 'Safety Car' : 'Virtuelles Safety Car');
    if (kind === 'SC') {
      if (!this.scMesh) { this.scMesh = buildSafetyCar(); this.scene.add(this.scMesh); }
      const tr = this.track;
      const o = { remote: true, isSC: true, track: tr, dist: leader.obj.dist + 160, lat: 0, v: 30, x: 0, z: 0, yaw: 0, wheelRot: 0, pitCtl: null };
      Object.defineProperty(o, 's', { get() { return tr.wrapS(this.dist + tr.startS); } });
      o.lat = tr.racingLat(o.s);
      this.scObj = o; this._objs = null;
      this.scMesh.visible = true;
    }
    this.hud.message(kind === 'SC' ? 'SAFETY CAR' : 'VIRTUELLES SAFETY CAR', 3, 'big sc');
    audio.beep(700, 0.3);
    this.radio && this.radio.say(kind === 'SC' ? 'Safety Car, Safety Car. Nicht überholen, bleib dicht dran.' : 'Virtuelles Safety Car. Halte das Delta, langsam fahren.', 3, true);
  }

  runSC(dt, S, order, leader) {
    const tr = this.track, p = this.player, L = tr.length;
    S.t += dt;
    if (this.mp && !this.mp.net.isHost) {
      // guests mirror the host's safety car; only the player's own VSC delta is checked here
      const o = this.scObj;
      if (o) { const [x, z] = tr.posAt(o.s, o.lat), [x2, z2] = tr.posAt(tr.wrapS(o.s + 3), o.lat); o.x = x; o.z = z; o.yaw = Math.atan2(-(x2 - x), -(z2 - z)); o.dist += o.v * dt; o.wheelRot += (o.v * dt) / 0.34; }
      if (S.kind === 'VSC') this.checkVscDelta(dt);
      return;
    }
    if (S.kind === 'VSC') {
      if (S.ph === 'run' && S.t > 26) { S.ph = 'end'; S.t = 0; this.radio && this.radio.say('VSC endet. Mach dich bereit.', 2); }
      if (S.ph === 'end' && S.t > 5) { this.endSC(); return; }
      for (const ai of this.aiList) if (!ai.pitCtl) { ai.scCap = tr.targetSpeed(ai.s + 10) * 0.6; ai.noPass = true; }
      this.checkVscDelta(dt);
      return;
    }
    // safety car on track
    const o = this.scObj;
    if (o) {
      if (o.pitCtl) {
        const prevS = o.s;
        const r = stepPit(tr, o, o.pitCtl, dt);
        let d = r.s - prevS; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
        o.dist += d; o.lat = r.lat;
        if (o.pitCtl.ph === 'stop' || r.done) { this.scObj = null; this._objs = null; this.scMesh.visible = false; }
      } else {
        const vT = Math.min(tr.targetSpeed(o.s + 20) * 0.62, 50);
        o.v += Math.max(-12 * dt, Math.min(6 * dt, vT - o.v));
        o.dist += o.v * dt;
        o.lat += (tr.racingLat(o.s) - o.lat) * Math.min(1, dt * 2);
        if (S.ph === 'in' && pitWindow(tr, o.s)) o.pitCtl = startPit(tr, o, 0, null, 0);
      }
      if (this.scObj) {
        const [x, z] = tr.posAt(o.s, o.lat), [x2, z2] = tr.posAt(tr.wrapS(o.s + 3), o.lat);
        o.x = x; o.z = z; o.yaw = Math.atan2(-(x2 - x), -(z2 - z));
        o.wheelRot += (o.v * dt) / 0.34;
      }
    }
    const toPit = this.scObj ? tr.wrapS(tr.pit[0] - this.scObj.s) : 0;
    if (S.ph === 'run' && S.t > 40 && leader.obj.dist - S.leaderDist0 > L * 0.6 && toPit > L * 0.15 && toPit < L * 0.45) {
      S.ph = 'in'; S.t = 0;
      this.hud.message('SAFETY CAR KOMMT IN DIESER RUNDE REIN', 3);
      this.radio && this.radio.say('Safety Car kommt in dieser Runde rein. Reifen warm halten.', 2.5);
    }
    // queue: each car follows the one in front at ~20 m, the leader follows the safety car
    let ahead = this.scObj;
    for (const c of order) {
      if (c.gone || c.finished) continue;
      const ob = c.obj;
      if (ob.pitCtl || (c.isPlayer && this.pitCtl)) continue;
      let cap;
      if (!ahead) cap = tr.targetSpeed(ob.s + 10) * 0.62;
      else {
        const gap = ahead.dist - ob.dist;
        if (gap > 70) cap = tr.targetSpeed(ob.s + 10) * 0.92;
        else if (gap > 20) cap = Math.max(10, ahead.v + (gap - 20) * 0.35);
        else cap = Math.max(4, ahead.v - (20 - gap) * 0.6);
      }
      if (!c.isPlayer && !c.remote && !ob.net) { ob.scCap = cap; ob.noPass = true; }
      ahead = ob;
    }
    // restart: once the safety car is in the pits, the leader takes the field to the line
    if (S.ph === 'in' && !this.scObj) {
      const lineD = tr.wrapS(tr.startS - leader.obj.s);
      if (lineD < 15 || lineD > L - 30) this.endSC();
    }
  }

  // VSC: too fast for too long = penalty
  checkVscDelta(dt) {
    const p = this.player, cap = this.track.targetSpeed(p.s + 10) * 0.6 + 5;
    if (this.sc.t < 4) return; // time to slow down
    if (!this.pitCtl && p.v > cap) { this.vscOver += dt; if (this.vscOver > 1.2) this.hud.warn('VSC — LANGSAMER FAHREN', 0.8); if (this.vscOver > 6) { this.vscOver = 0; this.blame('VSC-DELTA ÜBERSCHRITTEN'); } }
    else this.vscOver = Math.max(0, this.vscOver - dt * 0.5);
  }

  // multiplayer guests: host's flag state -> local safety car
  applyNetSC(d) {
    if (!Array.isArray(d)) { if (this.sc) this.endSC(); return; }
    const kind = d[0] === 1 ? 'VSC' : 'SC', ph = ['run', 'in', 'end'][d[1]] || 'run';
    if (!this.sc) {
      this.sc = { kind, ph, t: 0, leaderDist0: 0 };
      this.hud.message(kind === 'SC' ? 'SAFETY CAR' : 'VIRTUELLES SAFETY CAR', 3, 'big sc');
      this.radio && this.radio.say(kind === 'SC' ? 'Safety Car, Safety Car. Nicht überholen.' : 'Virtuelles Safety Car. Halte das Delta.', 3, true);
    }
    this.sc.kind = kind; this.sc.ph = ph;
    if (typeof d[2] === 'number') {
      if (!this.scObj) {
        if (!this.scMesh) { this.scMesh = buildSafetyCar(); this.scene.add(this.scMesh); }
        const tr = this.track, o = { remote: true, track: tr, dist: d[2], lat: d[3], v: d[4], x: 0, z: 0, yaw: 0, wheelRot: 0 };
        Object.defineProperty(o, 's', { get() { return tr.wrapS(this.dist + tr.startS); } });
        this.scObj = o; this._objs = null; this.scMesh.visible = true;
      }
      const o = this.scObj; o.dist += (d[2] - o.dist) * 0.3; o.lat = d[3]; o.v = d[4];
    } else if (this.scObj) { this.scObj = null; this._objs = null; this.scMesh.visible = false; }
  }

  endSC() {
    this.sc = null; this.vscOver = 0; this.greenT = 3; this.scCool = 90; this.incScore = 0;
    if (this.scObj) { this.scObj = null; this._objs = null; }
    if (this.scMesh) this.scMesh.visible = false;
    this.hud.message('GRÜNE FLAGGE', 2, 'big green');
    audio.beep(1040, 0.25);
    this.radio && this.radio.say('Grün, grün, grün! Gib alles.', 1.5, true);
  }

  // damage: side 'L' / 'R' front wing halves, 'rear'
  addDamage(o, side, amount) {
    if (!this.dmgOn || o.remote || o.net || amount <= 0 || !o.dmg) return;
    const before = o.dmg[side];
    o.dmg[side] = Math.min(1, before + amount);
    const e = this.entryOf.get(o);
    if (side !== 'rear' && before < 0.5 && o.dmg[side] >= 0.5) {
      this.showWing(e.mesh === this.playerRoot ? this.playerModel : e.mesh, o.dmg);
      this.spawnDebris(o.x, o.z, o.yaw, side === 'R' ? 1 : -1, o.v);
      this.logEvent(`Flügel ab: ${e.name}`);
      this.incident(o, 0.7);
      if (o === this.player) {
        this.hud.warn(`FRONTFLÜGEL ${side === 'R' ? 'RECHTS' : 'LINKS'} ABGEBROCHEN`, 2.5);
        this.radio && this.radio.say('Wir haben Flügelschaden. Komm an die Box, wir haben einen neuen Flügel bereit.', 3, true);
      }
    } else if (o === this.player && side !== 'rear' && before < 0.15 && o.dmg[side] >= 0.15) {
      this.hud.warn('FRONTFLÜGEL BESCHÄDIGT', 2);
    }
  }

  showWing(model, dm) { setWingLook(model, dm); }

  // carbon pieces that fly off and stay on the track for a while
  spawnDebris(x, z, yaw, side, v) {
    if (!this.debrisGeo) {
      this.debrisGeo = [new THREE.BoxGeometry(0.5, 0.03, 0.22), new THREE.BoxGeometry(0.22, 0.2, 0.02), new THREE.BoxGeometry(0.3, 0.02, 0.12)];
      this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.2 });
    }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.debrisGeo[i % 3], this.debrisMat);
      m.castShadow = true;
      m.position.set(x + fx * 2.6 + rx * side * 0.7, 0.2, z + fz * 2.6 + rz * side * 0.7);
      const sp = v * (0.35 + Math.random() * 0.4);
      this.scene.add(m);
      this.debris.push({ m, vx: fx * sp + rx * side * (2 + Math.random() * 4), vz: fz * sp + rz * side * (2 + Math.random() * 4), vy: 2 + Math.random() * 3, spin: (Math.random() - 0.5) * 20, life: 25 });
    }
    if (this.debris.length > 48) { const old = this.debris.splice(0, this.debris.length - 48); for (const d of old) this.scene.remove(d.m); }
  }

  updateDebris(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], m = d.m;
      d.life -= dt;
      if (d.life <= 0) { this.scene.remove(m); this.debris.splice(i, 1); continue; }
      if (m.position.y > 0.02 || d.vy > 0) {
        d.vy -= 9.8 * dt;
        m.position.x += d.vx * dt; m.position.y = Math.max(0.015, m.position.y + d.vy * dt); m.position.z += d.vz * dt;
        m.rotation.x += d.spin * dt; m.rotation.z += d.spin * 0.6 * dt;
        if (m.position.y <= 0.015) { d.vy = 0; d.vx *= 0.3; d.vz *= 0.3; m.rotation.x = 0; m.rotation.z = 0; }
      } else { const f = Math.exp(-dt * 3); d.vx *= f; d.vz *= f; m.position.x += d.vx * dt; m.position.z += d.vz * dt; }
    }
  }

  blame(why) { if (this.penCool > 0) return; this.penCool = 6; this.penalize(5, why); }

  penalize(sec, why) {
    if (!this.penOn || this.solo) return;
    this.playerEntry.pen += sec;
    this.hud.warn(`${sec} SEK. STRAFE — ${why}`, 3);
    audio.beep(330, 0.3);
    this.radio && this.radio.say(`Wir haben ${sec} Sekunden Strafe bekommen: ${why.toLowerCase()}.`, 3, true);
  }

  // Car-to-car contact. Every car is a capsule that turns with it (3.4 m spine + 0.95 m radius),
  // so a car sitting sideways is hit sideways. Contacts exchange an impulse at the contact point:
  // straight hits trade speed, off-centre hits add a yaw kick, hard ones spin the car.
  resolveCollisions(dt) {
    if (dt <= 0) return;
    if (this.mp && this.opts.mpCollide === false) return; // multiplayer with collisions off: everyone drives through everyone
    const objs = this.allObjs(), p = this.player;
    const R = 0.95, HALF = 1.7, E = 0.2, IM = 2.6; // radius, half spine, restitution, inertia per mass (m²)
    // world velocity of each car (heading speed + sideways shove)
    for (const o of objs) {
      o._fx = -Math.sin(o.yaw || 0); o._fz = -Math.cos(o.yaw || 0);
      // a spinning AI car keeps sliding along its path, it doesn't drive where its nose points
      const my = o.yawB !== undefined ? o.yawB : o.yaw || 0;
      let vx = -Math.sin(my) * (o.v || 0), vz = -Math.cos(my) * (o.v || 0);
      if (o === p) { vx = p.wvx; vz = p.wvz; } // the player's car slides: its real velocity, not just the heading
      else if (o.knock && !o.remote) { const f = this.track.frame(o.s); vx += f.rx * o.knock; vz += f.rz * o.knock; }
      o._vx = vx; o._vz = vz;
    }
    const seg = (o, out) => { out[0] = o.x - o._fx * HALF; out[1] = o.z - o._fz * HALF; out[2] = o.x + o._fx * HALF; out[3] = o.z + o._fz * HALF; return out; };
    const sa = [0, 0, 0, 0], sb = [0, 0, 0, 0];
    for (let a = 0; a < objs.length; a++) {
      for (let b = a + 1; b < objs.length; b++) {
        const A = objs[a], B = objs[b];
        if (A.gone || B.gone || (A.remote && B.remote)) continue;
        const cx = B.x - A.x, cz = B.z - A.z;
        if (cx * cx + cz * cz > 36) continue;
        // close in space but far apart along the lap: the two branches of a crossover (the bridge at Suzuka)
        const sA = A.s, sB = B.s;
        if (Number.isFinite(sA) && Number.isFinite(sB)) { let dsAB = Math.abs(sA - sB); dsAB = Math.min(dsAB, this.track.length - dsAB); if (dsAB > 60) continue; }
        // closest points between the two spines
        const [ax, az, ax2, az2] = seg(A, sa), [bx, bz, bx2, bz2] = seg(B, sb);
        const c = closestSeg(ax, az, ax2, az2, bx, bz, bx2, bz2);
        let nx = c.qx - c.px, nz = c.qz - c.pz;
        const d = Math.hypot(nx, nz);
        if (d >= 2 * R) continue;
        if (d < 1e-4) { nx = cx || 1; nz = cz; } // spines touching: push apart centre to centre
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const pen = 2 * R - d;
        const withP = A === p || B === p;
        // separate (a remote car is moved by its own device, so the local one takes it all)
        const fixA = A.remote || A.net, fixB = B.remote || B.net;
        const wa = fixA ? 0 : fixB ? 1 : 0.5, wb = fixB ? 0 : fixA ? 1 : 0.5;
        this.moveCar(A, -nx * pen * wa, -nz * pen * wa);
        this.moveCar(B, nx * pen * wb, nz * pen * wb);
        // impulse along the normal at the contact point
        const px = c.px + nx * R, pz = c.pz + nz * R;
        const vn = (B._vx - A._vx) * nx + (B._vz - A._vz) * nz; // < 0: closing
        if (vn >= 0) continue;
        const closing = -vn;
        const soft = withP || A.remote || B.remote ? 1 : 0.5; // AI leave each other a little room
        const J = ((1 + E) * closing) / 2;
        // rubbing: some friction along the contact
        const tx = -nz, tz = nx, vt = (B._vx - A._vx) * tx + (B._vz - A._vz) * tz;
        const Jt = Math.max(-0.3 * J, Math.min(0.3 * J, -vt / 4));
        const ix = nx * J + tx * Jt, iz = nz * J + tz * Jt; // impulse on B (A gets the opposite)
        const hard = withP || closing > 12; // AI rarely take each other out
        if (!fixA) this.applyImpulse(A, -ix, -iz, px - A.x, pz - A.z, IM, soft, hard);
        if (!fixB) this.applyImpulse(B, ix, iz, px - B.x, pz - B.z, IM, soft, hard);
        // damage: front wing if the contact is at the nose, rear if at the gearbox
        for (const o of [A, B]) {
          if (o.remote || o.net || closing < 5) continue;
          const rx = px - o.x, rz = pz - o.z, along = rx * o._fx + rz * o._fz, side = rx * -o._fz + rz * o._fx;
          if (along > 1.3) this.addDamage(o, side < 0 ? 'R' : 'L', (closing - 5) * 0.06 * soft);
          else if (along < -1.6) this.addDamage(o, 'rear', (closing - 5) * 0.025 * soft);
        }
        // blame: the player drove into a car that then spun
        if (withP && closing > 7) {
          const o = A === p ? B : A, ux = (o.x - p.x), uz = (o.z - p.z), ul = Math.hypot(ux, uz) || 1;
          const pIn = (p._vx * ux + p._vz * uz) / ul, oIn = (o._vx * ux + o._vz * uz) / ul;
          if (pIn > oIn + 5 && o.spunT > 0) this.blame('KOLLISION VERURSACHT');
        }
        if (withP) {
          p.impact = Math.max(p.impact, Math.min(1, closing / 14));
          if (closing > 3) this.sparks(px, pz, Math.min(36, 4 + closing * 2), p.v);
        } else if (closing > 4 && Math.hypot(px - p.x, pz - p.z) < 120) {
          this.sparks(px, pz, Math.min(26, 3 + closing * 2), (A.v + B.v) / 2);
          audio.crash(Math.min(0.6, closing / 20) * Math.max(0.2, 1 - Math.hypot(px - p.x, pz - p.z) / 120));
        }
      }
    }
  }

  // move a car by a world offset (keeps the track bookkeeping right)
  moveCar(o, dx, dz) {
    if (!dx && !dz) return;
    if (o.remote || o.net) return;
    const tr = this.track;
    if (o === this.player) {
      o.x += dx; o.z += dz;
      const prevS = o.s;
      tr.locate(o.x, o.z, o.hint, o.loc); o.hint = o.loc.i; o.s = o.loc.s; o.lat = o.loc.lat;
      let d = o.s - prevS; if (d > tr.length / 2) d -= tr.length; if (d < -tr.length / 2) d += tr.length;
      o.dist += d;
    } else {
      const f = tr.frame(o.s);
      o.dist += dx * f.tx + dz * f.tz;
      const dl = dx * f.rx + dz * f.rz;
      const hw = tr.hwAt(o.s);
      o.lat = Math.max(-hw - 2.5, Math.min(hw + 2.5, o.lat + dl));
      o.latOff += dl;
      o.x += dx; o.z += dz;
    }
  }

  // impulse (per unit mass) at offset r from the centre: speed along the heading, sideways shove, yaw
  applyImpulse(o, ix, iz, rx, rz, IM, soft, hard = true) {
    const fx = o._fx, fz = o._fz;
    const along = ix * fx + iz * fz;
    const latx = ix - fx * along, latz = iz - fz * along;
    const cross = rx * iz - rz * ix; // >0: turns the car right (yaw down)
    const dYawRate = (cross / IM) * soft; // rad/s, positive = to the right
    if (o === this.player) {
      o.applyImpulse(ix, iz, rx, rz); // rigid body with the car's own yaw inertia
    } else {
      o.v = Math.max(0, o.v + along * soft);
      const f = this.track.frame(o.s);
      o.knock = Math.max(-8, Math.min(8, (o.knock || 0) + (latx * f.rx + latz * f.rz) * soft));
      o.latOff = o.lat - this.track.racingLat(o.s);
      // AI yaw grows to the left; a hard off-centre hit breaks the rear loose (spin-out)
      o.spinRate = (o.spinRate || 0) - dYawRate * 1.6;
      if (!hard) o.spinRate = Math.max(-1.2, Math.min(1.2, o.spinRate));
      else if (Math.abs(o.spinRate) > 2 && !(o.spunT > 0)) { o.spinRate = Math.sign(o.spinRate) * Math.max(3.5, Math.abs(o.spinRate)); o.spunT = 6; o.recover = false; this.incident(o, 1); }
    }
  }

  // change a car's forward speed (other players are moved by their own devices)
  pushV(o, dv) { if (o.remote || o.net) return; o.v = Math.max(0, o.v + dv); }

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



  // ---------------------------------------------------------- rendering
  render(dt) {
    if (this.podium) {
      const P = this.podium;
      if (P.camera.aspect !== innerWidth / innerHeight) { P.camera.aspect = innerWidth / innerHeight; P.camera.updateProjectionMatrix(); }
      P.update(dt);
      terrainEnable(false);
      renderer.render(P.scene, P.camera);
      audio.quiet(0.12);
      return;
    }
    const p = this.player, cam = this.camera;
    // player transform with a little pitch/roll from g-forces
    const P0 = this.roadPose(p.x, p.z, p.yaw, p.s, this._pPose || (this._pPose = {}));
    this.playerRoot.position.set(p.x, P0.y, p.z);
    this.playerRoot.rotation.order = 'YXZ'; this.playerRoot.rotation.set(P0.pitch, p.yaw, 0);
    const longG = (p.v - (this.prevV ?? p.v)) / Math.max(dt, 1e-3);
    this.prevV = p.v;
    const clamp = (x, a) => Math.max(-a, Math.min(a, x));
    // chassis: roll, pitch and ride height straight from the suspension model in physics.js; kerbs shake it
    this.pitch = clamp(p.pitch || 0, 0.05); this.roll = clamp(p.roll || 0, 0.05);
    const tNow = performance.now() / 1000;
    const ride = clamp(p.heave || 0, 0.04) + p.bump * Math.sin(tNow * 42) * 0.006;
    this.playerBody.rotation.set(this.pitch, 0, this.roll + p.bump * Math.sin(tNow * 31) * 0.004);
    this.playerBody.position.y = ride;
    const v = CAMS[this.camMode] || CAMS.cockpit;
    const shakeK = settings.shake / 60;
    const shake = (p.bump * 0.006 + Math.min(1, p.v / 90) * 0.0012 + p.impact * 0.03) * v.shake * shakeK;
    const rx = () => (Math.random() - 0.5) * shake;
    // ego cams: head reacts to g-forces (lean out of corners, nod under braking), looks into the apex
    const hm = settings.headMove / 100, k = Math.min(1, dt * 7);
    const latG = p.ay ?? p.yawRate * p.v, lonG = p.ax ?? (p.v - (this.prevV2 ?? p.v)) / Math.max(dt, 1e-3);
    this.prevV2 = p.v;
    const clampv = (x, a) => Math.max(-a, Math.min(a, x));
    this.head = this.head || { x: 0, z: 0, roll: 0, pitch: 0 };
    const H = this.head;
    H.x += (clampv(-latG * 0.0011 * hm, 0.06) - H.x) * k;
    H.roll += (clampv(-latG * 0.0016 * hm, 0.09) - H.roll) * k;
    H.z += (clampv(-lonG * 0.0016 * hm, 0.05) - H.z) * k;
    H.pitch += (clampv(lonG * 0.0011 * hm, 0.05) - H.pitch) * k;
    const wantWorld = !!v.world && !this.lookBack;
    if (!this.replayMode && !this.photo && !this.spectator && wantWorld && cam.parent !== this.scene) { this.scene.add(cam); this.chaseCam = null; }
    if (!this.replayMode && !this.photo && !this.spectator && !wantWorld && cam.parent !== this.playerBody) this.playerBody.add(cam);
    if (this.state === 'intro' && !this.replayMode && !this.photo) {
      this.introCamera();
    } else if (this.replayMode) {
      this.replayCamera(dt);
    } else if (this.spectator) {
      this.updateSpectator(dt);
      this.replayCamera(dt, this.spec);
    } else if (this.photo) {
      this.photoCamera();
    } else if (this.lookBack) {
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
    if (!this.replayMode && !this.photo && !this.spectator && (!wantWorld || !(v.tv || v.heli))) {
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
    // 2026 active aero: flat flap on the straights (and with DRS), closed into the braking zone
    this.moveFlap(this.playerModel, p.drsOpen || (p.v > 50 && p.throttle > 0.9 && p.brake < 0.05 && Math.abs(p.steer) < 0.12), dt);
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
    setWheelBlur(this.playerModel, wheelBlur(p.v));
    setBrakeGlow(this.playerModel, Math.max(0, Math.min(1, ((p.brakeT || 0) - 550) / 450)));
    if (!this.replayMode && !this.podium) this.floorSparks(p, dt, p.surface === 'kerb');
    // AI meshes
    const blink = (performance.now() / 250 | 0) % 2;
    const rainLights = this.weather.rain > 0.15 || this.weather.wetness > 0.5;
    const fastBlink = (performance.now() / 110 | 0) % 2 === 0;
    this.applyWeather(dt);
    this.updateSparks(dt);
    cam.updateMatrixWorld();
    const camP = CAM_P.setFromMatrixPosition(cam.matrixWorld);
    for (const c of this.cars) {
      if (c.isPlayer) continue;
      const o = c.obj, m = c.mesh;
      const ref = this.replayMode ? this.cars[this.replayMode.focus].obj : p;
      const far = c.gone || Math.hypot(o.x - ref.x, o.z - ref.z) > 650;
      m.visible = !far;
      if (far) continue;
      const dCam = Math.hypot(o.x - camP.x, o.z - camP.z);
      // details and shadow-map casting only up close; the full 2026 model (~200k triangles) is kept for the few
      // nearest cars on low/medium quality, beyond that its simplified version (~25k) is drawn
      const nearD = this.opts.quality === 'low' ? 22 : this.opts.quality === 'medium' ? 40 : 75;
      setCarLod(m, dCam < nearD || !!this.photo, dCam < Math.min(55, nearD) || !!this.photo);
      if (dCam < 160) this.moveFlap(m, o.drsOn || (o.v > 50 && this.track.targetSpeed((o.s || 0) + 45) > (this.track._vTop || 90) * 0.82 && (o._pv ?? o.v) <= o.v + 0.02), dt);
      const RP = this.roadPose(o.x, o.z, o.yaw, this.replayMode && !c.isPlayer ? null : o.s, o._pose || (o._pose = {})); // replays only move x/z
      m.position.set(o.x, RP.y - Math.min(0.025, o.v * o.v * 0.0000035), o.z);
      o.rollVis = (o.rollVis || 0) + (Math.max(-0.028, Math.min(0.028, (o.steerVis || 0) * o.v * 0.0016)) - (o.rollVis || 0)) * Math.min(1, dt * 5);
      m.rotation.set(RP.pitch, o.yaw, o.rollVis);
      for (const w of m.userData.wheels) { w.wheel.rotation.x = -o.wheelRot; if (w.front) w.pivot.rotation.y = -o.steerVis * 0.5; }
      setWheelBlur(m, wheelBlur(o.v));
      setBrakeGlow(m, Math.max(0, Math.min(1, ((o.brakeT || 0) - 550) / 450)));
      if (!this.replayMode && Math.hypot(o.x - p.x, o.z - p.z) < 140) this.floorSparks(o, dt, Math.abs(o.lat || 0) > this.track.hwAt(o.s) - 0.4);
      m.userData.helmet.children[0].rotation.set(0, -(o.steerVis || 0) * 0.6, (o.rollVis || 0) * -3);
      const harvest = o.v > 20 && (o._pv ?? o.v) - o.v > 0.05; o._pv = o.v; // slowing at speed = recharging
      m.userData.rainLight.material.color.setHex((rainLights && blink) || (harvest && fastBlink) ? 0xff2020 : 0x330000);
    }
    const ph = p.v > 20 && (p.throttle < 0.05 || p.brake > 0.1);
    this.playerModel.userData.rainLight.material.color.setHex((rainLights && blink) || (ph && fastBlink) ? 0xff2020 : 0x330000);
    if (this.ghostMesh) {
      const G = this.ghost, pose = G && this.lapStarted ? ghostPose(G, this.raceTime - this.lap.start, this.ghostTmp) : null;
      const near = pose && Math.hypot(pose.x - p.x, pose.z - p.z) < 3.2;
      this.ghostMesh.visible = !!pose && !near;
      if (pose) { const RP = this.roadPose(pose.x, pose.z, pose.yaw, null, this._gPose || (this._gPose = {})); this.ghostMesh.position.set(pose.x, RP.y, pose.z); this.ghostMesh.rotation.set(RP.pitch, pose.yaw, 0); }
    }
    if (this.scMesh && this.scMesh.visible && this.scObj) {
      const o = this.scObj, m = this.scMesh, U = m.userData;
      const RP = this.roadPose(o.x, o.z, o.yaw, o.s, o._pose || (o._pose = {}));
      m.position.set(o.x, RP.y, o.z); m.rotation.set(RP.pitch, o.yaw, 0);
      for (const w of U.wheels) w.wheel.rotation.x = -o.wheelRot;
      const ph = (performance.now() / 180 | 0) % 2;
      U.lamps.amber[0].material.color.setHex(this.sc && this.sc.ph === 'in' ? 0x331d00 : ph ? 0xff9a00 : 0x331d00);
      U.lamps.amber[1].material.color.setHex(this.sc && this.sc.ph === 'in' ? 0x331d00 : ph ? 0x331d00 : 0xff9a00);
      U.lamps.green[0].material.color.setHex(this.sc && this.sc.ph === 'in' ? (ph ? 0x19d65b : 0x052a10) : 0x052a10);
    }
    // sun/shadow follow
    const hSun = terrainAt(p.x, p.z);
    this.sun.position.set(p.x + this.sunDir.x * 300, Math.max(60, this.sunDir.y * 300) + hSun, p.z + this.sunDir.z * 300);
    if (this.sunSprite) { const cw = this.camWorld().position; this.sunSprite.position.set(cw.x + this.sunDir.x * 2500, cw.y + this.sunDir.y * 2500, cw.z + this.sunDir.z * 2500); }
    this.sun.target.position.set(p.x, hSun, p.z);
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
    terrainEnable(true);
    const undoLift = this.liftCamera(cam);
    if ((CAMS[this.camMode] || {}).ego && settings.mirrors && !this.lookBack && this.mirrorFrame % every === 0) {
      this.cockpit.visible = false; this.playerModel.visible = false;
      const undoRear = this.liftCamera(this.rearCam);
      renderer.setRenderTarget(this.mirrorRT);
      renderer.render(this.scene, this.rearCam);
      renderer.setRenderTarget(null);
      undoRear();
      this.cockpit.visible = true; this.playerModel.visible = true;
    }
    if (this.envCam && (this.envFrame = (this.envFrame || 0) + 1) % (this.envFaces ? 1 : this.envEvery) === (this.envFaces ? 0 : 1)) {
      // refresh the car's reflection cube from just above the cockpit, without the car itself and without
      // re-rendering the sun's shadow map six times
      // nor the sun sprite and its lens flare: they are screen effects of the main camera, but in the cube they
      // became a huge additive blob that the clear coat reflected like a fire on the engine cover
      const vis = [this.playerModel.visible, this.cockpit.visible, this.sunSprite ? this.sunSprite.visible : false];
      this.playerModel.visible = false; this.cockpit.visible = false; if (this.sunSprite) this.sunSprite.visible = false;
      this.playerRoot.getWorldPosition(this.envCam.position); this.envCam.position.y += 0.8;
      this.envCam.updateMatrixWorld(true);
      const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      if (this.envFaces) {
        // one face per frame; the last one regenerates the mipmaps the rough paint samples
        const f = this.envFrame % 6, rt = this.envRT, gm = rt.texture.generateMipmaps;
        if (this.envCam.coordinateSystem !== renderer.coordinateSystem) { this.envCam.coordinateSystem = renderer.coordinateSystem; this.envCam.updateCoordinateSystem(); }
        rt.texture.generateMipmaps = f === 5;
        renderer.setRenderTarget(rt, f); renderer.render(this.scene, this.envCam.children[f]); renderer.setRenderTarget(null);
        rt.texture.generateMipmaps = gm;
        if (f === 5) rt.texture.needsPMREMUpdate = true; // the paint samples a prefiltered copy: refresh it once per full cube
      } else this.envCam.update(renderer, this.scene);
      renderer.shadowMap.autoUpdate = au;
      [this.playerModel.visible, this.cockpit.visible] = vis; if (this.sunSprite) this.sunSprite.visible = vis[2];
    }
    if (this.photo && this.photo.dof > 0) this.renderPhotoDof();
    else if (this.composer) { terrainEnable(false); this.composer.render(); } else renderer.render(this.scene, cam);
    undoLift();
    if (this.photo && this.photo.snap) { const cb = this.photo.snap; this.photo.snap = null; cb(renderer.domElement); }

    this.hud.update(dt, p, {
      playerLap: Math.max(1, this.lap.lapNo + 1), curLapTime: this.state === 'grid' || (this.flying && !this.lapStarted) ? 0 : this.raceTime - this.lap.start,
      bestLap: this.lap.best, playerPos: this.mode === 'quali' ? this.qualiOrder().indexOf(this.playerEntry) + 1 : this.playerPos || this.playerEntry.grid, total: this.mode === 'quali' ? 20 : this.cars.length,
      order: this.mode === 'quali' ? this.qualiOrder() : this.order || this.cars, quali: this.mode === 'quali', gapTo: (c) => this.gapTo(c), wet: this.startWet, time: this.raceTime, weather: this.weather, mph: settings.units === 'mph',
    });
    if (this.replayMode) audio.quiet(); else audio.update(p, this.others, !!(CAMS[this.camMode] || {}).ego, this.camera);
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
    updatePausePit();
    $('#pause').classList.toggle('active', this.paused);
    if (this.paused && !this.mp) audio.ctx && audio.ctx.suspend(); else audio.resume();
  }

  // finishing order (cars still running are estimated), penalties included
  resultRows() {
    const L = this.track.length;
    return this.cars.filter((c) => !c.spectator).map((c) => {
      let t = c.finishTime;
      if (!c.finished) { const remain = this.laps * L - c.obj.dist; t = this.raceTime + remain / Math.max(40, c.obj.v || 50); }
      return { c, t: t + (c.pen || 0) };
    }).sort((a, b) => a.t - b.t);
  }

  showPodium() {
    const rows = this.resultRows().filter((r) => !r.c.gone);
    this.podium = buildPodium(rows.slice(0, 3).map((r) => ({ name: r.c.name, team: r.c.team })), this.def.gp.toUpperCase());
    this.radio.stop();
    $('#hud').classList.remove('active');
    document.body.classList.add('podium-on');
    const ui = $('#podium-ui'); ui.hidden = false;
    $('#podium-list').innerHTML = rows.slice(0, 3).map((r, i) => `<li class="${r.c.isPlayer ? 'me' : ''}"><b>${i + 1}</b><span class="bar" style="background:${hex(r.c.team.body === 0xf0f0f0 || r.c.team.body === 0x161616 ? r.c.team.accent : r.c.team.body)}"></span>${r.c.name}<small>${r.c.team.name}</small></li>`).join('');
    audio.beep(784, 0.2); setTimeout(() => audio.beep(988, 0.2), 220); setTimeout(() => audio.beep(1175, 0.45), 440);
    confetti();
  }

  endPodium() {
    if (!this.podium) return;
    this.podium.dispose(); this.podium = null;
    document.body.classList.remove('podium-on');
    $('#podium-ui').hidden = true;
    this.showResults();
  }

  showResults() {
    this.resultsShown = true;
    const L = this.track.length;
    const p = this.playerEntry;
    $('#res-race').hidden = !(this.mode === 'quali' || this.opts.sprintRace);
    $('#res-race').textContent = this.opts.sprintRace ? 'Zum Hauptrennen ›' : this.opts.sprint ? 'Zum Sprint ›' : 'Zum Rennen ›';
    $('#res-again').hidden = this.mode === 'quali' || !!this.opts.season || !!this.opts.sprintRace;
    $('#res-season').hidden = !(this.opts.season && this.mode === 'race' && !this.opts.sprintRace);
    $('#res-career').hidden = !(this.opts.career && this.mode === 'race' && !this.opts.sprintRace);
    if (this.opts.career) $('#res-again').hidden = true;
    $('#res-replay').hidden = this.mode === 'quali' || !this.replay;
    if (this.mode === 'quali') { this.showQualiResults(); return; }
    const rows = this.resultRows();
    const win = rows[0].t;
    $('#results-body').innerHTML = rows.map((r, i) => `
      <tr class="${r.c.isPlayer ? 'me' : ''}">
        <td>${i + 1}</td>
        <td><span class="bar" style="background:${hex(r.c.team.body === 0xf0f0f0 || r.c.team.body === 0x161616 ? r.c.team.accent : r.c.team.body)}"></span>${r.c.name}</td>
        <td>${r.c.team.name}</td>
        <td>${r.c.grid}</td>
        <td>${i === 0 ? fmtTime(r.t) : '+' + (r.t - win).toFixed(3)}${r.c.pen ? ` <small class="pen">+${r.c.pen}s</small>` : ''}</td>
        <td>${r.c.stops || 0}</td>
        <td>${(this.opts.sprintRace ? [8, 7, 6, 5, 4, 3, 2, 1] : [25, 18, 15, 12, 10, 8, 6, 4, 2, 1])[i] ?? 0}</td>
      </tr>`).join('');
    const pos = rows.findIndex((r) => r.c === p) + 1;
    $('#res-pos').textContent = pos ? 'P' + pos : '–';
    $('#res-title').textContent = (this.opts.sprintRace ? 'SPRINT · ' : 'ERGEBNIS · ') + this.def.gp.toUpperCase();
    $('#res-best').textContent = fmtTime(this.lap.best);
    $('#res-warn').textContent = this.trackWarnings;
    // achievements
    if (!this.spectator) {
      const pos = rows.findIndex((r) => r.c === p) + 1, gained = p.grid - pos;
      unlock('first_race');
      if (pos <= 10) unlock('points');
      if (pos <= 3) unlock('podium');
      if (pos === 1) { unlock('win'); if (p.grid >= 15) unlock('from_back'); if (this.startWet || this.weather.wetness > 0.4) unlock('rain_win'); if (this.opts.career) unlock('career_win'); if (this.opts.qualiOrder && this.opts.qualiOrder[0] === p.name) unlock('grand_slam'); }
      if (gained >= 10) unlock('overtakes');
      if (!p.pen && !this.trackWarnings) unlock('clean');
      if ((p.stops || 0) >= 1) unlock('pit_pro');
      if (this.mp) unlock('mp_race');
      trackDone(this.def.id, TRACKS.length);
    }
    // multiplayer league (host keeps the table): humans only, in finishing order
    if (this.mp && this.mp.net.isHost && settings.mpLeague && !this.leagueScored) {
      this.leagueScored = true;
      leagueAddRace(rows.filter((r) => (r.c.isPlayer || r.c.remote) && !r.c.spectator).map((r) => r.c.name));
    }
    // career: credits, rating, team-mate duel
    if (this.opts.career && !this.opts.sprintRace && !this.careerScored) {
      this.careerScored = true;
      const c = loadCareer();
      if (c && !c.season.done && c.season.calendar[c.season.round] === this.def.id) {
        const rank = [...TEAMS].sort((a, b) => b.pace - a.pace).findIndex((t) => t.id === c.team) + 1;
        const r = careerRace(c, this.def.id, rows.map((x) => ({ name: x.c.name, team: x.c.team.name, isPlayer: x.c.isPlayer })), this.mateName, rank * 2);
        setTimeout(() => showToast(`Karriere: P${r.pos} · +${r.earned} Entwicklungspunkte`, 4000), 400);
      }
    }
    // championship: score the round once
    if (this.opts.season && !this.seasonScored) {
      this.seasonScored = true;
      const S = loadSeason();
      const R = rows.map((r) => ({ name: r.c.name, team: r.c.team.name, isPlayer: r.c.isPlayer }));
      if (S && !S.done && S.calendar[S.round] === this.def.id) {
        if (this.opts.sprintRace) addSprintResult(S, R); else addRoundResult(S, this.def.id, R);
        if (S.done && standings(S)[0] && standings(S)[0][0] === p.name) unlock('champion');
      }
    }
    showScreen('results');
    $('#hud').classList.remove('active');
    document.body.classList.remove('ingame', 'intro-on');
  }

  showQualiResults() {
    const order = this.qualiOrder(), pole = order[0].qt;
    if (order[0] === this.playerEntry) { unlock('pole'); if (this.def.id === 'monaco') unlock('monaco_pole'); }
    if (this.opts.career && !this.careerQ) { this.careerQ = true; const c = loadCareer(); if (c) careerQuali(c, order.indexOf(this.playerEntry) + 1, order.findIndex((x) => x.name === this.mateName) + 1); }
    $('#results-body').innerHTML = order.map((c, i) => `
      <tr class="${c.isPlayer ? 'me' : ''}">
        <td>${i + 1}</td>
        <td><span class="bar" style="background:${hex(c.team.body === 0xf0f0f0 || c.team.body === 0x161616 ? c.team.accent : c.team.body)}"></span>${c.name}</td>
        <td>${c.team.name}</td><td>–</td>
        <td>${isFinite(c.qt) ? (i === 0 ? fmtTime(c.qt) : fmtTime(c.qt) + ' <small>+' + (c.qt - pole).toFixed(3) + '</small>') : 'keine Zeit'}</td><td>–</td><td>–</td>
      </tr>`).join('');
    $('#res-pos').textContent = 'P' + (order.indexOf(this.playerEntry) + 1);
    $('#res-title').textContent = 'QUALIFYING · ' + this.def.gp.toUpperCase();
    $('#res-best').textContent = fmtTime(this.lap.best);
    $('#res-warn').textContent = this.trackWarnings;
    showScreen('results');
    $('#hud').classList.remove('active');
    document.body.classList.remove('ingame', 'intro-on');
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
    this.disposed = true;
    document.body.classList.remove('intro-on');
    disposeTerrain();
    this.radio.stop();
    if (this.photo) { this.photo = null; document.body.classList.remove('photo', 'ph-cinema', 'ph-hidepanel'); renderer.domElement.style.filter = ''; $('#photo-ui').hidden = true; }
    if (this.podium) { this.podium.dispose(); this.podium = null; document.body.classList.remove('podium-on'); $('#podium-ui').hidden = true; }
    if (this.replayMode) { this.replayMode = null; document.body.classList.remove('replaying'); $('#replay-ui').hidden = true; }
    this.weather.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); });
    });
    this.mirrorRT.dispose();
    if (this.envRT) this.envRT.dispose();
    if (this.composer) {
      for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) if (t.depthTexture) t.depthTexture.dispose();
      this.composer.dispose();
    }
    $('#hud').innerHTML = '';
  }
}

// ------------------------------------------------------------------ loop
let last = performance.now();
// automatic resolution: when frames take too long the picture renders a little smaller (down to 60 %),
// with headroom it climbs back; slow hysteresis so it doesn't pump
let frameAvg = 16.7, dynT = 0;
function dynResolution(ms) {
  if (settings.dynRes === false || settings.fpsLimit || !game || game.paused) return;
  frameAvg += (Math.min(100, ms) - frameAvg) * 0.05;
  dynT += ms;
  if (frameAvg > 21 && dynT > 1500 && dynScale > 0.6) { dynScale = Math.max(0.6, dynScale - 0.1); dynT = 0; resize(); }
  else if (frameAvg < 17.6 && dynT > 5000 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.05); dynT = 0; resize(); }
  else if (dynT > 5000) dynT = 0;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (settings.fpsLimit && now - last < 1000 / settings.fpsLimit - 2) return;
  const ms = now - last, dt = Math.min(0.05, ms / 1000);
  last = now;
  if (!game) return;
  dynResolution(ms);
  game.update(dt);
  if (!game.paused || game.mp || game.photo) game.render(dt);
}
requestAnimationFrame(frame);

let lastExtra = null;
function startRace(mpStart, extra = null) {
  lastExtra = mpStart ? null : extra;
  audio.init(); // create / unlock audio inside the user gesture (iOS)
  if (settings.radio === 'voice') Radio.unlock();
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
  setTimeout(async () => {
    await carModelReady; // the 2026 car model (decoded once, in the background since page load)
    if (game) { game.dispose(); game = null; }
    const opts = { ...settings, ...(extra || {}) };
    useModelCams(carModel.ready && opts.carStyle !== 'classic');
    if (mpStart) Object.assign(opts, { laps: mpStart.laps, weather: mpStart.weather, difficulty: mpStart.difficulty, track: mpStart.track || 'barcelona', tod: mpStart.tod || 'noon', mp: { net, start: mpStart } }, mpRules(mpStart.rules));
    if (mpStart) input.setMode({ touchSteer: settings.touchSteer, autoGas: opts.autoGas });
    game = new Game(opts);
    game.warmup();
    $('#res-again').textContent = mpStart ? 'Zur Lobby' : 'Nochmal fahren';
    window.__game = game; window.__input = input; window.__renderer = renderer; window.__audio = audio;
    showScreen('none');
    $('#hud').classList.add('active');
    document.body.classList.add('ingame');
    document.body.classList.toggle('mp-race', !!mpStart);
    document.body.classList.toggle('spectating', !!game.spectator);
    $('#spec-ui').hidden = !game.spectator;
    $('#emote-bar').hidden = true;
  }, 60);
}

function updatePausePit() {
  if (!game) return;
  $('#pause-box').textContent = game.boxReq ? 'Boxenstopp absagen' : 'Boxenstopp anfordern';
  $('#pause-tyre').textContent = 'Reifen: ' + (game.pitTyre === 'auto' ? 'Automatisch' : TYRES[game.pitTyre].name.charAt(0) + TYRES[game.pitTyre].name.slice(1).toLowerCase());
  $('#pause').classList.toggle('no-pit', !!game.solo);
  $('#pause-qend').hidden = game.mode !== 'quali';
  $('#pause-photo').hidden = !!game.mp;
}

// ------------------------------------------------------------------ game modes
// subtitles of the main-menu tiles
function renderModes() {
  const S = loadSeason();
  $('#season-sub').textContent = S && !S.done ? `Runde ${S.round + 1}/${S.calendar.length}: ${trackById(S.calendar[S.round]).name}` : S && S.done ? 'Saison beendet' : 'Alle Strecken, WM-Punkte';
  $('#tt-sub').textContent = `${trackById(settings.track).name} gegen dein Geist-Auto`;
  $('#quick-sub').textContent = `${trackById(settings.track).name} · ${settings.laps} Runden`;
}

function renderSeason() {
  let S = loadSeason();
  if (!S) S = newSeason(settings.driver);
  const cal = $('#season-cal'); cal.innerHTML = '';
  S.calendar.forEach((id, i) => {
    const li = document.createElement('li');
    li.className = i < S.round ? 'done' : i === S.round && !S.done ? 'next' : '';
    li.append(trackById(id).name);
    const h = S.history[i];
    if (h) { const sm = document.createElement('small'); sm.textContent = `P${h.me} · Sieg ${h.top[0]}`; li.append(sm); }
    cal.append(li);
  });
  const rows = standings(S);
  const teamOf = (n) => (DRIVERS.find((d) => d.name === n) || {}).team;
  $('#season-body').innerHTML = rows.length ? rows.map(([n, pts], i) => {
    const t = teamOf(n);
    return `<tr class="${n === settings.driver ? 'me' : ''}"><td>${i + 1}</td><td><span class="bar" style="background:${t ? hex(t.body === 0xf0f0f0 || t.body === 0x161616 ? t.accent : t.body) : '#888'}"></span>${n}</td><td>${t ? t.name : ''}</td><td>${S.wins[n] || 0}</td><td>${pts}</td></tr>`;
  }).join('') : '<tr><td colspan="5">Noch keine Rennen gefahren.</td></tr>';
  const ch = $('#season-champ');
  ch.hidden = !S.done;
  if (S.done && rows.length) ch.textContent = `🏆 WELTMEISTER: ${rows[0][0]} mit ${rows[0][1]} Punkten`;
  $('#season-next').hidden = S.done;
  $('#season-next').textContent = S.done ? '' : `${trackById(S.calendar[S.round]).name} fahren ›`;
  renderOpts();
}

function seasonNext() {
  let S = loadSeason();
  if (!S) S = newSeason(settings.driver);
  if (S.done) return;
  const track = S.calendar[S.round];
  startRace(null, settings.seasonSprint ? { mode: 'quali', weekend: true, sprint: true, season: true, track } : settings.seasonQuali ? { mode: 'quali', weekend: true, season: true, track } : { mode: 'race', season: true, track });
}

let boardTrack = null;
async function renderBoard() {
  boardTrack = boardTrack || settings.track;
  const tabs = $('#board-tabs'); tabs.innerHTML = '';
  for (const t of TRACKS) {
    const b = document.createElement('button'); b.textContent = t.name; b.classList.toggle('sel', t.id === boardTrack);
    b.addEventListener('click', () => { boardTrack = t.id; renderBoard(); });
    tabs.append(b);
  }
  const body = $('#board-body');
  body.innerHTML = '<tr><td colspan="5">Lade …</td></tr>';
  const rows = await fetchBoard(boardTrack, settings.carStyle);
  const m = boardMode();
  $('#board-note').textContent = (m === 'local' ? 'Gerade nur auf diesem Gerät gespeichert: Für diese Seite ist noch kein Online-Speicher eingerichtet (auf Vercel: Upstash Redis mit dem Projekt verbinden, siehe README).' : m === 'db' ? 'Bestzeiten aller Spieler, die diese Seite öffnen können (Seite über „Teilen“ freigeben, damit Freunde mitfahren).' : 'Bestzeiten aller Spieler weltweit.') + ` Fahrzeug: ${settings.carStyle === 'classic' ? 'Klassik' : 'Modern'}. Zeiten kommen aus Zeitfahren und Qualifying (gültige Runden).`;
  body.innerHTML = '';
  if (!rows.length) { body.innerHTML = '<tr><td colspan="5">Noch keine Zeiten. Fahr im Zeitfahren eine gültige Runde!</td></tr>'; return; }
  rows.forEach((r, i) => {
    const tr = document.createElement('tr'); if (r.me) tr.className = 'me';
    const cells = [i + 1, r.name, r.drv, fmtTime(r.time), r.at ? new Date(r.at).toLocaleDateString('de-DE') : ''];
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
    body.append(tr);
  });
}

// ------------------------------------------------------------------ replay controls
function renderReplayUI(full = false) {
  const g = game, M = g && g.replayMode;
  if (!M) return;
  const c = g.cars[M.focus];
  $('#rp-time').textContent = `${fmtTime(Math.max(0, M.t - M.t0))} / ${fmtTime(M.t1 - M.t0)}`;
  $('#rp-seek').value = Math.round(((M.t - M.t0) / Math.max(1, M.t1 - M.t0)) * 1000);
  $('#rp-play').textContent = M.playing ? '❚❚' : '▶';
  $('#rp-speed').textContent = M.speed + '×';
  $('#rp-cam').textContent = { tv: 'TV', chase: 'VERFOLGER', heli: 'HELI', onboard: 'ONBOARD' }[M.cam];
  $('#rp-car').textContent = c.name;
  if (full) {
    const ev = $('#rp-events'); ev.innerHTML = '';
    const list = g.replay.events.slice(0, 40);
    if (!list.length) ev.innerHTML = '<span class="none">Keine Highlights</span>';
    for (const e of list) {
      const b = document.createElement('button');
      b.textContent = `${fmtTime(Math.max(0, e.t - M.t0), false).replace(/\.\d+$/, '')}s · ${e.label}`;
      b.addEventListener('click', () => { M.t = Math.max(M.t0, e.t - 4); M.playing = true; g.chaseCam = null; });
      ev.append(b);
    }
  }
}
function bindReplayUI() {
  const M = () => game && game.replayMode;
  $('#rp-play').addEventListener('click', () => { const m = M(); if (!m) return; if (m.t >= m.t1) m.t = m.t0; m.playing = !m.playing; renderReplayUI(); });
  $('#rp-speed').addEventListener('click', () => { const m = M(); if (!m) return; const S = [0.25, 0.5, 1, 2, 4]; m.speed = S[(S.indexOf(m.speed) + 1) % S.length]; renderReplayUI(); });
  $('#rp-cam').addEventListener('click', () => { const m = M(); if (!m) return; const C = ['tv', 'chase', 'heli', 'onboard']; m.cam = C[(C.indexOf(m.cam) + 1) % C.length]; game.chaseCam = null; renderReplayUI(); });
  const car = (d) => { const m = M(); if (!m) return; const n = game.cars.length; m.focus = (m.focus + d + n) % n; game.chaseCam = null; renderReplayUI(); };
  $('#rp-prev').addEventListener('click', () => car(-1));
  $('#rp-next').addEventListener('click', () => car(1));
  $('#rp-back').addEventListener('click', () => { const m = M(); if (m) { m.t = Math.max(m.t0, m.t - 10); game.chaseCam = null; } });
  $('#rp-seek').addEventListener('input', (e) => { const m = M(); if (!m) return; m.t = m.t0 + (e.target.value / 1000) * (m.t1 - m.t0); game.chaseCam = null; });
  $('#rp-exit').addEventListener('click', () => game && game.stopReplay());
}

// ------------------------------------------------------------------ photo mode UI
const PHOTO_FILTERS = {
  none: { label: 'Normal', css: '' },
  bw: { label: 'S/W', css: 'grayscale(1) contrast(1.12)' },
  warm: { label: 'Warm', css: 'sepia(0.35) saturate(1.25) contrast(1.05)' },
  cinema: { label: 'Kino', css: 'contrast(1.15) saturate(0.82) brightness(0.95)' },
  vivid: { label: 'Lebhaft', css: 'saturate(1.55) contrast(1.08)' },
  retro: { label: 'Retro', css: 'sepia(0.55) contrast(0.92) brightness(1.05) saturate(0.8)' },
};
function renderPhotoUI() {
  const P = game && game.photo;
  if (!P) return;
  $('#ph-fov').value = P.fov; $('#ph-dof').value = P.dof; $('#ph-roll').value = P.roll;
  const box = $('#ph-filters'); box.innerHTML = '';
  for (const [k, f] of Object.entries(PHOTO_FILTERS)) {
    const b = document.createElement('button'); b.textContent = f.label; b.classList.toggle('sel', P.filter === k);
    b.addEventListener('click', () => { P.filter = k; applyPhotoFilter(); renderPhotoUI(); });
    box.append(b);
  }
  applyPhotoFilter();
}
function applyPhotoFilter() {
  const P = game && game.photo;
  renderer.domElement.style.filter = P ? PHOTO_FILTERS[P.filter].css : '';
  document.body.classList.toggle('ph-cinema', !!P && P.filter === 'cinema');
}
async function savePhoto() {
  const P = game && game.photo;
  if (!P) return;
  document.body.classList.add('ph-hidepanel');
  const src = await new Promise((res) => { P.snap = res; });
  const W = src.width, H = src.height;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d');
  g.filter = PHOTO_FILTERS[P.filter].css || 'none';
  g.drawImage(src, 0, 0);
  g.filter = 'none';
  if (P.filter === 'cinema') { g.fillStyle = '#000'; g.fillRect(0, 0, W, H * 0.11); g.fillRect(0, H * 0.89, W, H * 0.11); }
  g.font = `italic 900 ${Math.round(H * 0.03)}px Arial`; g.fillStyle = 'rgba(255,255,255,0.75)'; g.textAlign = 'right';
  g.fillText('APEX GP 25', W - H * 0.03, H - H * 0.03);
  document.body.classList.remove('ph-hidepanel');
  const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.92));
  const name = `apex-gp-25-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
  try {
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (dl) { await dl.save({ filename: name, data: blob }); showToast('Foto gespeichert', 2000); unlock('photo'); return; }
  } catch (e) { if (e && e.code === 'declined') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  showToast('Foto gespeichert', 2000);
  unlock('photo');
}
function bindPhotoUI() {
  const P = () => game && game.photo;
  $('#ph-fov').addEventListener('input', (e) => { const p = P(); if (p) p.fov = +e.target.value; });
  $('#ph-dof').addEventListener('input', (e) => { const p = P(); if (p) p.dof = +e.target.value; });
  $('#ph-roll').addEventListener('input', (e) => { const p = P(); if (p) p.roll = +e.target.value; });
  $('#ph-save').addEventListener('click', savePhoto);
  $('#ph-exit').addEventListener('click', () => game && game.stopPhoto());
  // orbit with drag (mouse or one finger), distance with wheel / pinch
  const cv = renderer.domElement, pts = new Map();
  let pinch0 = 0, dist0 = 0;
  cv.addEventListener('pointerdown', (e) => { if (!P()) return; pts.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture(e.pointerId); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = P().dist; } });
  cv.addEventListener('pointermove', (e) => {
    const p = P(); if (!p || !pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) p.dist = Math.max(2.2, Math.min(40, dist0 * (pinch0 / d))); return; }
    p.yaw -= (e.clientX - prev[0]) * 0.008; p.pitch = Math.max(-0.05, Math.min(1.4, p.pitch + (e.clientY - prev[1]) * 0.006));
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { const p = P(); if (!p) return; e.preventDefault(); p.dist = Math.max(2.2, Math.min(40, p.dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
}

// ------------------------------------------------------------------ livery & helmet editor
const LIV_PAT_NAMES = { giallo: 'Giallo', plain: 'Uni', stripe: 'Mittelstreifen', racing: 'Doppelstreifen', split: 'Zweifarbig', chevron: 'Pfeile', fade: 'Verlauf', retro: 'Retro' };
const LIV_PRESETS = [
  { label: 'Giallo', v: { ...GIALLO } },
  { label: 'Gulf', v: { body: 0x7fb8e6, top: 0x7fb8e6, low: 0x1b1d22, accent: 0xff7a00, pattern: 'stripe', hMain: 0x7fb8e6, hStripe: 0xff7a00 } },
  { label: 'Midnight', v: { body: 0x0d0f14, top: 0x2a2f3a, low: 0x050608, accent: 0xffd200, pattern: 'fade', hMain: 0x0d0f14, hStripe: 0xffd200 } },
  { label: 'Martini', v: { body: 0xf2f2f2, top: 0xf2f2f2, low: 0x14213d, accent: 0xd0021b, pattern: 'racing', hMain: 0xf2f2f2, hStripe: 0x14213d } },
  { label: 'Lime', v: { body: 0x111111, top: 0x7cff3a, low: 0x111111, accent: 0x7cff3a, pattern: 'chevron', hMain: 0x7cff3a, hStripe: 0x111111 } },
  { label: 'Rosso', v: { body: 0xc80000, top: 0xf5f5f5, low: 0x1a1a1a, accent: 0xffd200, pattern: 'split', hMain: 0xffd200, hStripe: 0xc80000 } },
];
const hexStr = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
let livPrev = null;
function renderLivery() {
  const L = settings.livery;
  $('#liv-toggle').textContent = L.on ? 'AN ✓' : 'AUS';
  $('#liv-state').textContent = L.on ? 'Deine Lackierung ist aktiv.' : 'Aus: du fährst in den Farben deines Teams. Oben rechts einschalten.';
  $('#liv-name').value = L.name || ''; $('#liv-number').value = L.number ?? 7;
  document.querySelectorAll('#livery input[type=color]').forEach((i) => { i.value = hexStr(L[i.dataset.k] ?? 0); });
  const pats = $('#liv-pats'); pats.innerHTML = '';
  for (const k of LIVERY_PATTERNS) { const b = document.createElement('button'); b.textContent = LIV_PAT_NAMES[k]; b.classList.toggle('sel', L.pattern === k); b.addEventListener('click', () => { L.pattern = k; livChanged(); renderLivery(); }); pats.append(b); }
  const pre = $('#liv-presets'); pre.innerHTML = '';
  for (const P of LIV_PRESETS) { const b = document.createElement('button'); const dot = document.createElement('i'); dot.style.background = `linear-gradient(90deg, ${hexStr(P.v.body)} 50%, ${hexStr(P.v.accent)} 50%)`; b.append(dot, P.label); b.addEventListener('click', () => { Object.assign(L, P.v, { on: true }); livChanged(); renderLivery(); }); pre.append(b); }
  livPreview();
}
function livChanged() { save(); if (livPrev) livPrev.dirty = true; }
function bindLivery() {
  $('#liv-toggle').addEventListener('click', () => { settings.livery.on = !settings.livery.on; livChanged(); renderLivery(); });
  $('#liv-name').addEventListener('input', (e) => { settings.livery.name = clean(e.target.value, 18); livChanged(); });
  $('#liv-number').addEventListener('input', (e) => { settings.livery.number = Math.max(0, Math.min(99, +e.target.value | 0)); livChanged(); });
  document.querySelectorAll('#livery input[type=color]').forEach((i) => i.addEventListener('input', () => { settings.livery[i.dataset.k] = parseInt(i.value.slice(1), 16); settings.livery.on = true; $('#liv-toggle').textContent = 'AN ✓'; livChanged(); }));
}
// small turntable preview with its own renderer, only running while the editor is open
function livPreview() {
  const cv = $('#liv-canvas');
  if (!livPrev) {
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x0b0d12);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(4, 6, 3); sc.add(key);
    const pm = new THREE.PMREMGenerator(r), env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ map: TX.sky(false), side: THREE.BackSide })));
    sc.environment = pm.fromScene(env).texture;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.5, metalness: 0.4 }));
    floor.rotation.x = -Math.PI / 2; sc.add(floor);
    const cam = new THREE.PerspectiveCamera(32, 1.6, 0.1, 60);
    livPrev = { r, sc, cam, car: null, dirty: true };
    const loop = (t) => {
      requestAnimationFrame(loop);
      if (document.querySelector('.screen.active')?.id !== 'livery') return;
      const P = livPrev, w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.floor(w * Math.min(devicePixelRatio, 2))) { P.r.setPixelRatio(Math.min(devicePixelRatio, 2)); P.r.setSize(w, h, false); P.cam.aspect = w / h; P.cam.updateProjectionMatrix(); }
      if (P.dirty && t - (P.built || 0) > 120) {
        P.dirty = false; P.built = t;
        if (P.car) P.sc.remove(P.car);
        const d = DRIVERS.find((x) => x.name === settings.driver) || DRIVERS[0], L = settings.livery;
        P.car = buildCar(L.on ? customTeam(L, d.team) : d.team, false, L.on && L.number ? L.number : d.number, { style: settings.carStyle, retro: settings.retro && !L.on });
        P.sc.add(P.car);
      }
      const a = t * 0.0004;
      P.cam.position.set(Math.sin(a) * 9.5, 2.6, Math.cos(a) * 9.5); P.cam.lookAt(0, 0.45, 0);
      P.r.render(P.sc, P.cam);
    };
    requestAnimationFrame(loop);
  }
  livPrev.dirty = true;
}

// ------------------------------------------------------------------ career screen
const careerDraft = { team: 'sau', name: '', number: 21 };
function renderCareer() {
  const box = $('#career-body'), c = loadCareer();
  box.innerHTML = '';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const teamCol = (t) => hex(t.body === 0xf0f0f0 || t.body === 0x161616 ? t.accent : t.body);
  const teamCard = (t, sel, onPick, note) => { const b = el('button', 'cr-team' + (sel ? ' sel' : '')); b.style.setProperty('--tc', teamCol(t)); b.append(el('b', '', t.name), el('span', '', note || `Tempo ${Math.round(t.pace * 1000) / 10} %`)); b.addEventListener('click', onPick); return b; };
  if (!c) {
    // new career: name, number, first contract
    if (!careerDraft.name) careerDraft.name = (clean(settings.mpName) || 'FAHRER').toUpperCase();
    box.append(el('p', 'cr-intro', 'Du startest als Neuling bei einem kleinen Team. Mit guten Ergebnissen sammelst du Entwicklungspunkte für dein Auto, schlägst deinen Teamkollegen und bekommst am Saisonende Angebote von besseren Teams.'));
    const row = el('div', 'liv-row');
    const ln = el('label', '', 'Dein Name'), inN = el('input'); inN.maxLength = 14; inN.value = careerDraft.name; inN.addEventListener('input', () => { careerDraft.name = clean(inN.value, 14).toUpperCase(); }); ln.append(inN);
    const lno = el('label', 'num', 'Nummer'), inNo = el('input'); inNo.type = 'number'; inNo.min = 2; inNo.max = 99; inNo.value = careerDraft.number; inNo.addEventListener('input', () => { careerDraft.number = Math.max(2, Math.min(99, +inNo.value | 0)); }); lno.append(inNo);
    row.append(ln, lno); box.append(row);
    box.append(el('h3', '', 'ERSTER VERTRAG'));
    const grid = el('div', 'cr-teams');
    for (const id of ['sau', 'has', 'alp']) { const t = TEAMS.find((x) => x.id === id); grid.append(teamCard(t, careerDraft.team === id, () => { careerDraft.team = id; renderCareer(); }, `Ersetzt ${t.drivers[1]}`)); }
    box.append(grid);
    const go = el('button', 'primary cr-go', 'Karriere starten ›');
    go.addEventListener('click', () => { const t = TEAMS.find((x) => x.id === careerDraft.team); newCareer(careerDraft.name || 'FAHRER', careerDraft.number, t.id, t.drivers[1]); renderCareer(); });
    box.append(go);
    return;
  }
  const team = TEAMS.find((t) => t.id === c.team), S = c.season;
  const head = el('div', 'cr-head'); head.style.setProperty('--tc', teamCol(team));
  head.append(el('span', 'cr-num', String(c.number)));
  const who = el('div'); who.append(el('b', '', c.name), el('span', '', `${team.name} · Saison ${c.seasonNo} · Rennen ${Math.min(S.round + 1, S.calendar.length)}/${S.calendar.length}`)); head.append(who);
  const rate = el('div', 'cr-rate'); rate.append(el('span', '', 'BEWERTUNG'), el('i')); rate.querySelector('i').style.width = Math.round(c.rating) + '%'; head.append(rate);
  box.append(head);
  const cols = el('div', 'season-cols');
  // left: development + team-mate duel
  const L = el('div');
  L.append(el('h3', '', `ENTWICKLUNG · ${c.credits} PUNKTE`));
  for (const u of UPGRADES) {
    const lvl = c.upg[u.k], r = el('div', 'cr-upg');
    const dots = el('span', 'cr-dots'); for (let i = 0; i < 5; i++) dots.append(el('i', i < lvl ? 'on' : ''));
    const info = el('div'); info.append(el('b', '', u.name), el('small', '', u.desc));
    const buy = el('button', '', lvl >= 5 ? 'MAX' : `+1 · ${upgradeCost(lvl)}`); buy.disabled = lvl >= 5 || c.credits < upgradeCost(lvl);
    buy.addEventListener('click', () => { const cc = loadCareer(); const cost = upgradeCost(cc.upg[u.k]); if (cc.credits >= cost && cc.upg[u.k] < 5) { cc.credits -= cost; cc.upg[u.k]++; saveCareer(cc); renderCareer(); } });
    r.append(info, dots, buy); L.append(r);
  }
  const mate = team.drivers.find((n) => n !== c.replaces);
  L.append(el('h3', '', `TEAMDUELL GEGEN ${mate}`));
  const duel = el('div', 'cr-duel');
  duel.append(el('span', '', `Qualifying ${c.h2h.q[0]} : ${c.h2h.q[1]}`), el('span', '', `Rennen ${c.h2h.r[0]} : ${c.h2h.r[1]}`));
  L.append(duel);
  // right: standings
  const R = el('div');
  R.append(el('h3', '', 'FAHRERWERTUNG'));
  const tbl = el('table', 'res'), tb = el('tbody');
  const rows = Object.entries(S.pts).sort((a, b) => b[1] - a[1]);
  if (!rows.length) { const tr = el('tr'); tr.append(el('td', '', 'Noch keine Rennen gefahren.')); tb.append(tr); }
  rows.slice(0, 10).forEach(([n, pts], i) => { const tr = el('tr', n === c.name ? 'me' : ''); tr.append(el('td', '', String(i + 1)), el('td', '', n), el('td', '', String(pts))); tb.append(tr); });
  const myIdx = rows.findIndex((r) => r[0] === c.name);
  if (myIdx >= 10) { const tr = el('tr', 'me'); tr.append(el('td', '', String(myIdx + 1)), el('td', '', c.name), el('td', '', String(rows[myIdx][1]))); tb.append(tr); }
  tbl.append(tb); R.append(tbl);
  cols.append(L, R); box.append(cols);
  if (S.done) {
    // contract offers depend on the rating
    const ranked = [...TEAMS].sort((a, b) => b.pace - a.pace);
    const best = c.rating >= 85 ? 0 : c.rating >= 70 ? 2 : c.rating >= 55 ? 4 : 6;
    const offers = ranked.slice(best, best + 3).map((t) => t.id);
    if (!offers.includes(c.team)) offers.push(c.team);
    box.append(el('h3', '', 'SAISON BEENDET · VERTRAGSANGEBOTE'));
    const g = el('div', 'cr-teams');
    for (const id of offers) { const t = TEAMS.find((x) => x.id === id); g.append(teamCard(t, false, () => { const cc = loadCareer(); careerNextSeason(cc, id, t.id === c.team ? c.replaces : t.drivers[1]); renderCareer(); }, id === c.team ? 'Bleiben' : `Ersetzt ${t.drivers[1]}`)); }
    box.append(g);
  } else {
    const go = el('button', 'primary cr-go', `${trackById(S.calendar[S.round]).name} fahren ›`);
    go.addEventListener('click', () => { const cc = loadCareer(); startRace(null, { mode: 'quali', weekend: true, career: true, track: cc.season.calendar[cc.season.round], customDriver: { name: cc.name, number: cc.number, team: cc.team, replaces: cc.replaces } }); });
    box.append(go);
  }
  const reset = el('button', 'cr-reset', 'Neue Karriere');
  reset.addEventListener('click', () => { if (!reset.dataset.armed) { reset.dataset.armed = '1'; reset.textContent = 'Wirklich? Nochmal tippen'; return; } clearCareer(); renderCareer(); });
  box.append(reset);
}

// ------------------------------------------------------------------ achievements + driving school screens
setUnlockHandler((a) => {
  const t = $('#ach-toast');
  t.querySelector('i').textContent = a.icon; t.querySelector('b').textContent = a.name; t.querySelector('span').textContent = a.desc;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 4200);
  audio.beep(1175, 0.12); setTimeout(() => audio.beep(1568, 0.25), 130);
});
function renderTrophies() {
  const A = achState(), box = $('#trophy-grid');
  box.innerHTML = '';
  const n = ACHIEVEMENTS.filter((a) => A[a.id]).length;
  $('#trophy-count').textContent = `${n} / ${ACHIEVEMENTS.length}`;
  for (const a of ACHIEVEMENTS) {
    const d = document.createElement('div'); d.className = 'trophy' + (A[a.id] ? ' got' : '');
    const i = document.createElement('i'); i.textContent = A[a.id] ? a.icon : '🔒';
    const b = document.createElement('b'); b.textContent = a.name;
    const sp = document.createElement('span'); sp.textContent = A[a.id] ? `${a.desc} · ${new Date(A[a.id]).toLocaleDateString('de-DE')}` : a.desc;
    d.append(i, b, sp); box.append(d);
  }
}
function renderSchool() {
  const S = schoolState(), box = $('#school-grid');
  box.innerHTML = '';
  LESSONS.forEach((l, k) => {
    const b = document.createElement('button'); b.className = 'mode-card lesson';
    const m = S[l.id] || 0;
    b.innerHTML = `<i class="mi">${m ? ['', '🥉', '🥈', '🥇'][m] : k + 1}</i><b></b><span></span><small></small>`;
    b.querySelector('b').textContent = l.name; b.querySelector('span').textContent = l.desc; b.querySelector('small').textContent = 'Wertung: ' + l.goal + (m ? ` · Bestes: ${MEDALS[m]}` : '');
    b.addEventListener('click', () => startRace(null, { mode: 'school', lesson: l.id, weather: 'dry', formation: false, tyreTemp: false }));
    box.append(b);
  });
  $('#school-track').textContent = `Strecke: ${trackById(settings.track).name} (unter „Grand Prix“ änderbar)`;
}

function quitToMenu() {
  if (game && game.mp) net.leave();
  if (game) { game.dispose(); game = null; }
  $('#pause').classList.remove('active');
  $('#hud').classList.remove('active');
  document.body.classList.remove('ingame', 'intro-on');
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
    if (game && game.mp) backToLobby(); else startRace(null, lastExtra);
  }
  if (act === 'mp') mpEnter();
  if (act === 'mp-back') { net.leave(); showScreen('menu'); }
  if (act === 'quit') quitToMenu();
  if (act === 'pause-box' && game) { game.toggleBox(); updatePausePit(); }
  if (act === 'quali-end' && game && game.mode === 'quali') { game.togglePause(false); game.onPlayerFinish(); game.stateT = 5; }
  if (act === 'gp-start') {
    if (settings.gpFormat === 'quali') startRace(null, { mode: 'quali', weekend: true });
    else if (settings.gpFormat === 'sprint') startRace(null, { mode: 'quali', weekend: true, sprint: true });
    else startRace();
  }
  if (act === 'weekend') startRace(null, { mode: 'quali', weekend: true });
  if (act === 'tt') startRace(null, { mode: 'tt', weather: 'dry' });
  if (act === 'weekend-race' && game) {
    const o = game.opts;
    let ex;
    if (game.mode === 'quali') {
      const order = game.qualiOrder().map((c) => c.name);
      ex = { mode: 'race', gridOrder: order, qualiOrder: order, season: !!o.season, sprint: !!o.sprint, sprintRace: !!o.sprint };
      if (o.sprint) ex.laps = Math.max(2, Math.round(settings.laps / 3));
    } else ex = { mode: 'race', gridOrder: o.qualiOrder, season: !!o.season, sprint: false, sprintRace: false }; // after the sprint: the Grand Prix
    if (o.season || o.career) ex.track = o.track;
    if (o.career) { ex.career = true; ex.customDriver = o.customDriver; }
    startRace(null, ex);
  }
  if (act === 'sprint-weekend') startRace(null, { mode: 'quali', weekend: true, sprint: true });
  if (act === 'season-open') { if (game && game.resultsShown) quitToMenu(); renderSeason(); showScreen('season'); }
  if (act === 'season-next') seasonNext();
  if (act === 'replay' && game) game.startReplay();
  if (act === 'livery') { showScreen('livery'); renderLivery(); }
  if (act === 'photo' && game) { $('#pause').classList.remove('active'); game.startPhoto(); }
  if (act === 'podium-next' && game) game.endPodium();
  if (act === 'career') { if (game && game.resultsShown) quitToMenu(); renderCareer(); showScreen('career'); }
  if (act === 'studio') { location.href = 'studio.html'; return; }
  if (act === 'trophies') { renderTrophies(); showScreen('trophies'); }
  if (act === 'school') { if (game) quitToMenu(); $('#school-result').hidden = true; renderSchool(); showScreen('school'); }
  if (act === 'school-retry') { $('#school-result').hidden = true; startRace(null, lastExtra); }
  if (act === 'board') { renderBoard(); showScreen('board'); }
  if (act === 'pause-tyre' && game) { game.cyclePitTyre(); updatePausePit(); }
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
const meInfo = () => ({ name: myName(), drv: settings.driver, liv: settings.livery && settings.livery.on ? cleanLivery(settings.livery) : null });
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
      const tags = document.createElement('div'); tags.className = 'tags';
      const tag = (cls, text) => { const t = document.createElement('i'); t.className = cls; t.textContent = text; tags.append(t); };
      if (p.host) tag('', 'GASTGEBER');
      if (p.spec) tag('spec', 'ZUSCHAUER'); else if (p.ready || p.host) tag('rdy', '✓ BEREIT');
      if (p.me) tag('you', 'DU');
      row.append(n, c, tags);
      box.appendChild(row);
    }
    document.body.classList.toggle('mp-host', net.isHost);
    const h = net.hostPeer();
    const cfg = h && h.presence.cfg;
    const W = { dynamic: 'Wechselhaft', wet: 'Regen', dry: 'Trocken', storm: 'Gewitter', fog: 'Nebel', local: 'Teilweise Regen' };
    const tName = cfg && cfg.track ? trackById(cfg.track).name : '';
    const tTime = cfg && cfg.tod ? (TIMES.find((x) => x.id === cfg.tod) || {}).name : '';
    // league table from the host
    const lg = h && h.presence.league;
    $('#lobby-league').hidden = !(lg && Array.isArray(lg.t));
    if (lg && Array.isArray(lg.t)) {
      $('#league-n').textContent = `· ${lg.n | 0} Rennen`;
      const tb = $('#league-body'); tb.innerHTML = '';
      if (!lg.t.length) tb.innerHTML = '<tr><td colspan="4">Noch keine Rennen.</td></tr>';
      lg.t.slice(0, 20).forEach((r, i) => { const tr = document.createElement('tr'); for (const v of [i + 1, clean(r[0]), r[2] | 0, r[1] | 0]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); } tb.append(tr); });
    }
    const me = ps.find((x) => x.me);
    const drivers = ps.filter((x) => !x.spec), ready = drivers.filter((x) => x.ready || x.host).length;
    $('#mp-start').textContent = drivers.length > 1 ? `Rennen starten (${ready}/${drivers.length} bereit)` : 'Rennen starten';
    $('#mp-ready').textContent = me && me.ready ? '✓ Bereit' : 'Bereit?'; $('#mp-ready').classList.toggle('on', !!(me && me.ready));
    $('#mp-ready').hidden = net.isHost || !!(me && me.spec);
    $('#mp-spec').textContent = `👁 Zuschauen: ${me && me.spec ? 'An' : 'Aus'}`; $('#mp-spec').classList.toggle('on', !!(me && me.spec));
    const R = mpRules(cfg && cfg.rules);
    const GRID = { random: 'Startplätze zufällig', front: 'Spieler vorne', back: 'Spieler hinten', league: 'Liga umgekehrt' };
    const AS = { all: '', limited: ' · Hilfen begrenzt', none: ' · ohne Fahrhilfen' };
    const rules = cfg && cfg.rules ? ` · Schäden ${R.damage ? 'an' : 'aus'} · Strafen ${R.penalties ? 'an' : 'aus'} · Verschleiß ${R.tyreWear ? 'an' : 'aus'}${R.mpCollide ? '' : ' · Geisterautos'}${R.mpEqual ? ' · gleiche Autos' : ''}${AS[R.mpAssists] || ''}${cfg.grid ? ' · ' + (GRID[cfg.grid] || '') : ''}${cfg.ai && cfg.aiDiff ? ' · KI-Stärke ' + cfg.aiDiff : ''}` : '';
    $('#lobby-set').textContent = cfg ? `${tName} · ${tTime} · ${cfg.laps} Runden · ${W[cfg.weather] || ''} · ${cfg.ai ? '+' + cfg.ai + ' KI' : 'ohne KI'}${rules}` : '';
    // only in the lobby screen: a host missing for 6 s straight has left
    const inLobby = !game && document.querySelector('.screen.active')?.id === 'mp';
    if (h) net.hostSeenAt = performance.now();
    if (inLobby && !h && !net.isHost && performance.now() - (net.hostSeenAt || net.joinedAt || 0) > 6000) { mpLeave(); mpToast(`Der Gastgeber von Rennen ${net.code || ''} ist nicht mehr da.`); }
  }
}
net.on(renderLobby);

// race rules set by the host; guests race under exactly these (only known keys, sane values)
function mpRules(r) {
  if (!r || typeof r !== 'object') return {};
  const out = {
    tyreWear: [0, 1, 1.6].includes(r.tyreWear) ? r.tyreWear : 0, damage: !!r.damage, penalties: !!r.penalties, safetyCar: r.safetyCar !== false,
    tyreTemp: !!r.tyreTemp, mpCollide: r.mpCollide !== false, mpEqual: !!r.mpEqual, formation: false,
  };
  // assist limits for a fair race: 'limited' = no driving-for-you aids, 'none' = like the real thing
  if (r.assists === 'limited' || r.assists === 'none') Object.assign(out, { steerAssist: false, autoGas: false });
  if (r.assists === 'none') Object.assign(out, { brakeAssist: false, line: 'off', tc: 'off', abs: false, launchAssist: false });
  out.mpAssists = ['limited', 'none'].includes(r.assists) ? r.assists : 'all';
  return out;
}
const hostRules = () => ({ tyreWear: settings.tyreWear, damage: settings.damage, penalties: settings.penalties, safetyCar: settings.safetyCar, tyreTemp: settings.tyreTemp, mpCollide: settings.mpCollide, mpEqual: settings.mpEqual, assists: settings.mpAssists });

function mpSendCfg() {
  net.private = !!settings.mpPrivate;
  if (net.race && net.isHost) { net.race.presence({ cfg: { laps: settings.laps, weather: settings.weather, ai: settings.mpAI, aiDiff: settings.mpAIDiff, grid: settings.mpGrid, track: settings.track, tod: settings.tod, rules: hostRules() }, league: leaguePresence() }).catch(() => {}); net.advertise(); }
}
// friends league: kept by the host, everyone sees the table in the lobby
const KEY_LEAGUE = 'apexgp25-league';
function loadLeague() { try { return JSON.parse(localStorage.getItem(KEY_LEAGUE) || 'null') || { n: 0, pts: {}, wins: {} }; } catch (_) { return { n: 0, pts: {}, wins: {} }; } }
function saveLeague(L) { try { localStorage.setItem(KEY_LEAGUE, JSON.stringify(L)); } catch (_) { /* ignore */ } }
function leaguePresence() {
  if (!settings.mpLeague) return null;
  const L = loadLeague();
  return { n: L.n, t: Object.entries(L.pts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([n, p]) => [n, p, L.wins[n] || 0]) };
}
function leagueAddRace(names) {
  const L = loadLeague();
  names.forEach((n, i) => { L.pts[n] = (L.pts[n] || 0) + ([25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] || 0); if (i === 0) L.wins[n] = (L.wins[n] || 0) + 1; });
  L.n++; saveLeague(L); mpSendCfg();
}

async function mpCreate() {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  net.myName = myName(); net.private = !!settings.mpPrivate;
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
  const humans = net.players().filter((h) => !h.spec);
  if (!humans.length && !(+settings.mpAI)) { mpToast('Alle schauen nur zu: stell KI-Gegner ein oder fahr selbst mit.'); return; }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(humans);
  const taken = new Set(humans.map((h) => h.drv));
  const ai = DRIVERS.filter((d) => !taken.has(d.name)).sort((a, b) => b.team.pace - a.team.pace).slice(0, Math.min(+settings.mpAI || 0, 22 - humans.length));
  // grid: random mix, players in front / at the back (a chase through the field), or reversed league table
  const hs = humans.map((h) => ({ h: h.peer, n: h.name, d: h.drv, l: h.liv || null })), as = ai.map((d) => ({ a: d.name }));
  let slots;
  if (settings.mpGrid === 'front') slots = [...hs, ...as];
  else if (settings.mpGrid === 'back') slots = [...as, ...hs];
  else if (settings.mpGrid === 'league') { const L = loadLeague(); hs.sort((a, b) => (L.pts[clean(a.n).toUpperCase()] || 0) - (L.pts[clean(b.n).toUpperCase()] || 0)); slots = [...hs, ...as]; }
  else slots = shuffle([...hs, ...as]);
  const start = {
    id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    seed: Math.floor(Math.random() * 2 ** 31), laps: settings.laps, weather: settings.weather, difficulty: settings.mpAIDiff, track: settings.track, tod: settings.tod, rules: hostRules(),
    slots,
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
  document.body.classList.remove('ingame', 'intro-on');
  net.backToLobby();
  showScreen('mp'); mpShow('mp-lobby'); renderLobby();
}

$('#season-reset').addEventListener('click', (e) => {
  // two taps instead of confirm() (blocked inside embedded pages)
  const b = e.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'WIRKLICH?'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'NEUE SAISON'; }, 3000); return; }
  delete b.dataset.armed; b.textContent = 'NEUE SAISON';
  newSeason(settings.driver); renderSeason();
});
initBoard();
bindReplayUI();
bindLivery();
bindPhotoUI();
// ------------------------------------------------------------------ multiplayer chat + emojis
const EMOTES = ['👍', '😂', '😡', '🔥', '🏁', 'GG', 'Sorry!', 'Danke!'];
function chatLine(m) {
  const line = document.createElement('p');
  const n = document.createElement('b'); n.textContent = m.name + ': ';
  line.append(n, document.createTextNode(m.text));
  if (m.me) line.className = 'me';
  return line;
}
net.onChat = (m) => {
  const log = $('#chat-log');
  log.append(chatLine(m)); while (log.childElementCount > 40) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  if (game && game.mp) {
    game.floatEmote(m);
    const f = $('#chat-feed'), l = chatLine(m);
    f.append(l); while (f.childElementCount > 4) f.firstChild.remove();
    setTimeout(() => l.remove(), 6000);
    if (!m.me) audio.beep(1500, 0.06);
  }
};
function sendChat() { const i = $('#chat-input'); net.say(i.value); i.value = ''; }
$('#chat-send').addEventListener('click', sendChat);
$('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
for (const box of [$('#lobby-emotes'), $('#emote-bar')]) {
  EMOTES.forEach((em, i) => {
    const b = document.createElement('button'); b.textContent = em; b.title = `Taste ${i + 1}`;
    b.addEventListener('click', () => { net.say(em); if (box.id === 'emote-bar') box.hidden = true; });
    box.append(b);
  });
}
$('#tc-emote').addEventListener('click', (e) => { e.preventDefault(); $('#emote-bar').hidden = !$('#emote-bar').hidden; });
// keys 1-8 send an emoji during a multiplayer race
addEventListener('keydown', (e) => {
  if (!game || !game.mp || e.target.tagName === 'INPUT') return;
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m) net.say(EMOTES[+m[1] - 1]);
});

$('#mp-create').addEventListener('click', mpCreate);
$('#mp-join').addEventListener('click', () => mpJoin($('#mp-code').value));
$('#mp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') mpJoin($('#mp-code').value); });
$('#mp-leave').addEventListener('click', mpLeave);
$('#mp-ready').addEventListener('click', () => { const me = net.players().find((x) => x.me); if (net.race) net.race.presence({ ready: !(me && me.ready) }).catch(() => {}); });
// invite: a link that opens the game straight into this race (on the web), or the code as text
$('#mp-invite').addEventListener('click', async () => {
  if (!net.code) return;
  const link = net.transport === 'peer' ? `${location.origin}${location.pathname}?join=${net.code}` : '';
  const text = `Fahr mit mir bei Apex GP 25! Code: ${net.code}${link ? ' ' + link : ''}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Apex GP 25', text, url: link || undefined }); return; }
    await navigator.clipboard.writeText(link || text); mpToastLobby(link ? 'Einladungslink kopiert' : 'Code kopiert');
  } catch (_) { mpToastLobby(`Code: ${net.code}`); }
});
function mpToastLobby(t) { const b = $('#mp-invite'); const o = b.textContent; b.textContent = t; setTimeout(() => { b.textContent = o; }, 1800); }
// opened from an invite link: straight into that race
{
  const j = new URLSearchParams(location.search).get('join');
  if (j && /^\d{4}$/.test(j)) {
    history.replaceState(null, '', location.pathname);
    setTimeout(async () => { await mpEnter(); if (net.room && !net.race) mpJoin(j); }, 300);
  }
}
$('#mp-spec').addEventListener('click', () => { const me = net.players().find((x) => x.me); if (net.race) net.race.presence({ spec: !(me && me.spec) }).catch(() => {}); });
$('#mp-league-reset').addEventListener('click', (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Wirklich? Nochmal tippen'; return; } delete b.dataset.armed; b.textContent = 'Liga zurücksetzen'; saveLeague({ n: 0, pts: {}, wins: {} }); mpSendCfg(); });
$('#sp-prev').addEventListener('click', () => { const g = game; if (!g || !g.spec) return; const n = g.cars.length; do { g.spec.focus = (g.spec.focus - 1 + n) % n; } while (g.cars[g.spec.focus].gone); g.spec.auto = false; g.chaseCam = null; });
$('#sp-next').addEventListener('click', () => { const g = game; if (!g || !g.spec) return; const n = g.cars.length; do { g.spec.focus = (g.spec.focus + 1) % n; } while (g.cars[g.spec.focus].gone); g.spec.auto = false; g.chaseCam = null; });
$('#sp-cam').addEventListener('click', () => { const g = game; if (!g || !g.spec) return; const C = ['tv', 'chase', 'heli', 'onboard']; g.spec.cam = C[(C.indexOf(g.spec.cam) + 1) % C.length]; g.chaseCam = null; });
$('#sp-auto').addEventListener('click', () => { const g = game; if (!g || !g.spec) return; g.spec.auto = !g.spec.auto; g.spec.t = 0; });
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
    const want = settings.driver + settings.carStyle + settings.retro + JSON.stringify(settings.livery) + carModel.ready;
    if (carName !== want) {
      if (car) scene.remove(car);
      const d = DRIVERS.find((x) => x.name === settings.driver) || DRIVERS[0];
      const L = settings.livery && settings.livery.on ? settings.livery : null;
      car = buildCar(L ? customTeam(L, d.team) : d.team, false, L && L.number ? L.number : d.number, { style: settings.carStyle, retro: settings.retro && !L }); scene.add(car); carName = want;
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
