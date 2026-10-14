// Game modes: championship season and time-trial ghosts, persisted in localStorage.
import { TRACKS } from './tracks.js';

const KEY_SEASON = 'apexgp25-season';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// ------------------------------------------------------------------ championship
export function loadSeason() { return load(KEY_SEASON); }
export function newSeason(driver) {
  const s = { round: 0, calendar: TRACKS.map((t) => t.id), pts: {}, team: {}, wins: {}, history: [], driver, done: false };
  store(KEY_SEASON, s);
  return s;
}
export function saveSeason(s) { store(KEY_SEASON, s); }
export function clearSeason() { try { localStorage.removeItem(KEY_SEASON); } catch (_) { /* ignore */ } }
// rows: [{ name, team, isPlayer }] in finishing order
export function addRoundResult(s, track, rows) {
  rows.forEach((r, i) => {
    const p = POINTS[i] || 0;
    s.pts[r.name] = (s.pts[r.name] || 0) + p;
    s.team[r.team] = (s.team[r.team] || 0) + p;
    if (i === 0) s.wins[r.name] = (s.wins[r.name] || 0) + 1;
  });
  s.history.push({ track, top: rows.slice(0, 3).map((r) => r.name), me: rows.findIndex((r) => r.isPlayer) + 1 });
  s.round++;
  if (s.round >= s.calendar.length) s.done = true;
  saveSeason(s);
}
// sprint: points for the top 8, the round continues with the Grand Prix
export function addSprintResult(s, rows) {
  rows.forEach((r, i) => { const p = [8, 7, 6, 5, 4, 3, 2, 1][i] || 0; s.pts[r.name] = (s.pts[r.name] || 0) + p; s.team[r.team] = (s.team[r.team] || 0) + p; });
  saveSeason(s);
}
export function standings(s) {
  return Object.entries(s.pts).sort((a, b) => b[1] - a[1] || (s.wins[b[0]] || 0) - (s.wins[a[0]] || 0));
}

// ------------------------------------------------------------------ time-trial ghosts
// samples every GHOST_DT seconds of lap time: x, z, yaw, distance into the lap
export const GHOST_DT = 0.05;
const ghostKey = (track, style) => `apexgp25-ghost-${track}-${style || 'modern'}`;
function b64(f32) { const u8 = new Uint8Array(f32.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const bin = atob(str); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer); }
export function loadGhost(track, style) {
  const g = load(ghostKey(track, style));
  if (!g || !g.data) return null;
  try { return { time: g.time, driver: g.driver, data: unb64(g.data) }; } catch (_) { return null; }
}
export function saveGhost(track, style, time, driver, samples) {
  return store(ghostKey(track, style), { time, driver, data: b64(new Float32Array(samples)) });
}
// pose of the ghost at lap time t (interpolated)
export function ghostPose(G, t, out) {
  const n = G.data.length / 4;
  const f = t / GHOST_DT, i = Math.floor(f);
  if (i < 0 || i >= n - 1) return null;
  const k = f - i, a = i * 4, b = a + 4, D = G.data;
  let dy = D[b + 2] - D[a + 2]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  out.x = D[a] + (D[b] - D[a]) * k; out.z = D[a + 1] + (D[b + 1] - D[a + 1]) * k; out.yaw = D[a + 2] + dy * k;
  return out;
}
// ghost's lap time when it was at lap distance d (for the live delta)
export function ghostTimeAt(G, d) {
  const D = G.data, n = D.length / 4;
  let lo = 0, hi = n - 1;
  if (d <= D[3]) return 0;
  if (d >= D[(n - 1) * 4 + 3]) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m * 4 + 3] < d) lo = m; else hi = m; }
  const d0 = D[lo * 4 + 3], d1 = D[hi * 4 + 3];
  return (lo + (d - d0) / Math.max(1e-6, d1 - d0)) * GHOST_DT;
}

// ------------------------------------------------------------------ career
// Your own driver: start in a back-marker team, earn upgrade points, beat your team-mate,
// get offers from better teams at the end of each season.
const KEY_CAREER = 'apexgp25-career';
export const UPGRADES = [
  { k: 'engine', name: 'Motor', desc: '+1 % Leistung pro Stufe' },
  { k: 'aero', name: 'Aerodynamik', desc: '+1,5 % Abtrieb pro Stufe' },
  { k: 'chassis', name: 'Chassis', desc: '+0,8 % mechanischer Grip pro Stufe' },
];
export const upgradeCost = (lvl) => 20 + lvl * 15;
export function loadCareer() { return load(KEY_CAREER); }
export function saveCareer(c) { store(KEY_CAREER, c); }
export function clearCareer() { try { localStorage.removeItem(KEY_CAREER); } catch (_) { /* ignore */ } }
export function newCareer(name, number, team, replaces) {
  const c = { name, number, team, replaces, seasonNo: 1, upg: { engine: 0, aero: 0, chassis: 0 }, credits: 20, h2h: { q: [0, 0], r: [0, 0] }, rating: 50, offers: null, history: [] };
  c.season = { round: 0, calendar: TRACKS.map((t) => t.id), pts: {}, team: {}, wins: {}, history: [], done: false };
  saveCareer(c);
  return c;
}
// performance of the player's car: team baseline plus upgrades
export function careerPerf(c, pace) {
  return {
    power: (1 - (1 - pace) * 0.9) * (1 + 0.01 * c.upg.engine),
    df: 1 + 0.015 * c.upg.aero,
    grip: (1 - (1 - pace) * 0.5) * (1 + 0.008 * c.upg.chassis),
  };
}
// after a race: credits for the result (more for beating expectations and the team-mate)
export function careerRace(c, track, rows, mateName, expected) {
  const me = rows.findIndex((r) => r.isPlayer) + 1, mate = rows.findIndex((r) => r.name === mateName) + 1;
  const S = c.season;
  rows.forEach((r, i) => { const p = POINTS[i] || 0; S.pts[r.name] = (S.pts[r.name] || 0) + p; S.team[r.team] = (S.team[r.team] || 0) + p; if (i === 0) S.wins[r.name] = (S.wins[r.name] || 0) + 1; });
  S.history.push({ track, top: rows.slice(0, 3).map((r) => r.name), me });
  S.round++;
  if (mate) { if (me < mate) c.h2h.r[0]++; else c.h2h.r[1]++; }
  const earned = 10 + Math.max(0, expected - me) * 3 + (mate && me < mate ? 8 : 0) + Math.round((POINTS[me - 1] || 0) / 2);
  c.credits += earned;
  c.rating = Math.max(0, Math.min(100, c.rating + (expected - me) * 1.5 + (mate && me < mate ? 2 : -1)));
  c.history.push({ season: c.seasonNo, track, pos: me, earned });
  if (S.round >= S.calendar.length) S.done = true;
  saveCareer(c);
  return { pos: me, earned };
}
export function careerQuali(c, myPos, matePos) { if (matePos) { if (myPos < matePos) c.h2h.q[0]++; else c.h2h.q[1]++; saveCareer(c); } }
export function careerNextSeason(c, team, replaces) {
  if (team !== c.team) c.upg = { engine: Math.floor(c.upg.engine / 2), aero: Math.floor(c.upg.aero / 2), chassis: Math.floor(c.upg.chassis / 2) };
  c.team = team; c.replaces = replaces; c.seasonNo++; c.offers = null; c.h2h = { q: [0, 0], r: [0, 0] };
  c.season = { round: 0, calendar: TRACKS.map((t) => t.id), pts: {}, team: {}, wins: {}, history: [], done: false };
  saveCareer(c);
}
