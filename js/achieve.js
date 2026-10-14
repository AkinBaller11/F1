// Achievements and driving-school medals, kept in localStorage
const KEY = 'apexgp25-ach', KEY_SCHOOL = 'apexgp25-school';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (_) { return {}; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } };

export const ACHIEVEMENTS = [
  { id: 'first_race', icon: '🏁', name: 'Erstes Rennen', desc: 'Beende ein Rennen.' },
  { id: 'points', icon: '🔟', name: 'Punkte!', desc: 'Beende ein Rennen in den Top 10.' },
  { id: 'podium', icon: '🥉', name: 'Podium', desc: 'Fahr aufs Podium.' },
  { id: 'win', icon: '🏆', name: 'Erster Sieg', desc: 'Gewinne ein Rennen.' },
  { id: 'from_back', icon: '🚀', name: 'Von ganz hinten', desc: 'Gewinne von Startplatz 15 oder schlechter.' },
  { id: 'overtakes', icon: '⚔️', name: 'Überholkünstler', desc: 'Mach in einem Rennen 10 Plätze gut.' },
  { id: 'rain_win', icon: '🌧️', name: 'Regengott', desc: 'Gewinne auf nasser Strecke.' },
  { id: 'clean', icon: '😇', name: 'Saubere Weste', desc: 'Rennen ohne Strafe und ohne Streckenverstoß.' },
  { id: 'pole', icon: '⏱️', name: 'Pole Position', desc: 'Hol die Pole im Qualifying.' },
  { id: 'monaco_pole', icon: '🎰', name: 'Pole in Monaco', desc: 'Pole Position in Monaco.' },
  { id: 'grand_slam', icon: '👑', name: 'Grand Slam', desc: 'Pole und Sieg am selben Wochenende.' },
  { id: 'perfect_start', icon: '⚡', name: 'Raketenstart', desc: 'Perfekter Start mit der Kupplung.' },
  { id: 'pit_pro', icon: '🔧', name: 'Boxenprofi', desc: 'Mach einen Boxenstopp im Rennen.' },
  { id: 'tt_ghost', icon: '👻', name: 'Geisterjäger', desc: 'Schlag dein Geist-Auto im Zeitfahren.' },
  { id: 'champion', icon: '🌍', name: 'Weltmeister', desc: 'Gewinne die Meisterschaft.' },
  { id: 'career_win', icon: '⭐', name: 'Karrieresieg', desc: 'Gewinne ein Rennen in der Karriere.' },
  { id: 'mp_race', icon: '🌐', name: 'Online-Racer', desc: 'Beende ein Multiplayer-Rennen.' },
  { id: 'photo', icon: '📷', name: 'Fotograf', desc: 'Speichere ein Foto im Fotomodus.' },
  { id: 'all_tracks', icon: '🗺️', name: 'Weltenbummler', desc: 'Fahr auf allen Strecken ein Rennen zu Ende.' },
  { id: 'school_gold', icon: '🎓', name: 'Musterschüler', desc: 'Gold in allen Fahrschul-Lektionen.' },
];

let onUnlock = null;
export function setUnlockHandler(fn) { onUnlock = fn; }
export function achState() { return load(KEY); }
export function unlock(id) {
  const A = load(KEY);
  if (A[id]) return false;
  A[id] = Date.now(); store(KEY, A);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a && onUnlock) onUnlock(a);
  return true;
}
// tracks with a finished race, for 'all_tracks'
export function trackDone(id, total) {
  const A = load(KEY);
  const t = new Set(A._tracks || []); t.add(id); A._tracks = [...t]; store(KEY, A);
  if (t.size >= total) unlock('all_tracks');
}

// ------------------------------------------------------------------ driving school
export const LESSONS = [
  { id: 'brake', name: 'Bremspunkt', desc: 'Volle Fahrt auf die härteste Bremszone zu: spät, aber sauber bremsen und schnell durch die Kurve.', goal: 'Zeit bis 150 m nach der Kurve' },
  { id: 'line', name: 'Ideallinie', desc: 'Fahr den ersten Sektor so nah wie möglich an der Ideallinie.', goal: 'Anteil der Strecke nah an der Linie' },
  { id: 'sector', name: 'Kurvenfolge', desc: 'Der zweite Sektor auf Zeit: Rhythmus, Kurvenausgänge, kein Fehler.', goal: 'Sektorzeit' },
  { id: 'overtake', name: 'Überholen', desc: 'Drei langsamere Autos vor dir: Überhol alle in einer Runde, ohne Kontakt.', goal: 'Überholte Autos und Rundenzeit' },
  { id: 'tyres', name: 'Reifen schonen', desc: 'Zwei Runden auf Soft mit hohem Verschleiß: zügig fahren, aber Reifen übrig behalten.', goal: 'Restlaufzeit der Reifen' },
];
export const MEDALS = ['', 'Bronze', 'Silber', 'Gold'];
export function schoolState() { return load(KEY_SCHOOL); }
export function saveMedal(id, m) {
  const S = load(KEY_SCHOOL);
  if (!(S[id] >= m)) { S[id] = m; store(KEY_SCHOOL, S); }
  if (LESSONS.every((l) => (load(KEY_SCHOOL)[l.id] || 0) >= 3)) unlock('school_gold');
}
