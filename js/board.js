// Leaderboard: best laps per track and car style, shared by everyone where possible.
//  - inside the Claude artifact: the `db` capability (one document per player, everyone reads all)
//  - on Vercel: /api/board (needs a connected Redis store)
//  - otherwise: this device only (localStorage)
const LOCAL = 'apexgp25-board';
let mode = null, db = null, uid = null, initP = null;

const deviceId = () => {
  try {
    let id = localStorage.getItem('apexgp25-id');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('apexgp25-id', id); }
    return id;
  } catch (_) { return 'anon'; }
};
const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || '{}'); } catch (_) { return {}; } };
const key = (track, style) => `${track}-${style === 'classic' ? 'classic' : 'modern'}`;

export function initBoard() {
  if (initP) return initP;
  initP = (async () => {
    try {
      if (window.claude && window.claude.use) {
        db = await window.claude.use('db');
        if (db) {
          const user = await window.claude.use('user');
          uid = user && user.id ? await user.id() : null;
          if (uid) { mode = 'db'; return mode; }
        }
      }
    } catch (_) { /* fall through */ }
    if (location.protocol.startsWith('http') && !/claudeusercontent|claude\.ai/.test(location.host)) {
      try {
        const r = await fetch('api/board?track=barcelona&style=modern', { cache: 'no-store' });
        if (r.ok) { mode = 'api'; return mode; }
      } catch (_) { /* no API */ }
    }
    mode = 'local';
    return mode;
  })();
  return initP;
}

export const boardMode = () => mode;

export async function submitLap(track, time, opts) {
  const style = opts.carStyle, name = (opts.mpName || opts.driver || 'Fahrer').slice(0, 14);
  const k = key(track, style);
  // always keep the personal best on the device
  const L = loadLocal();
  const prev = L[k];
  if (!prev || time < prev.time) { L[k] = { time, name, drv: opts.driver, at: Date.now() }; try { localStorage.setItem(LOCAL, JSON.stringify(L)); } catch (_) { /* ignore */ } }
  await initBoard();
  try {
    if (mode === 'db') {
      const ref = db.collection('laps').doc(uid);
      const snap = await ref.get();
      const cur = snap.exists ? snap.data() : {};
      const times = { ...(cur.times || {}) };
      if (times[k] && times[k].time <= time) return;
      times[k] = { time, drv: opts.driver, at: Date.now() };
      await ref.set({ name, times });
    } else if (mode === 'api') {
      await fetch('api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track, style, time, name, drv: opts.driver, id: deviceId() }) });
    }
  } catch (_) { /* offline or not allowed: the local best stays */ }
}

// rows sorted by time: { name, drv, time, at, me }
export async function fetchBoard(track, style) {
  await initBoard();
  const k = key(track, style);
  try {
    if (mode === 'db') {
      const snap = await db.collection('laps').get();
      const rows = [];
      for (const d of snap.docs) {
        const v = d.data() || {}, t = v.times && v.times[k];
        if (t && typeof t.time === 'number' && t.time > 20 && t.time < 900) rows.push({ name: String(v.name || 'Fahrer').slice(0, 14), drv: String(t.drv || '').slice(0, 16), time: t.time, at: t.at || 0, me: d.id === uid });
      }
      return rows.sort((a, b) => a.time - b.time).slice(0, 50);
    }
    if (mode === 'api') {
      const r = await fetch(`api/board?track=${encodeURIComponent(track)}&style=${style === 'classic' ? 'classic' : 'modern'}`, { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); return (j.rows || []).map((x) => ({ ...x, me: false })); }
    }
  } catch (_) { /* fall back to local */ }
  const L = loadLocal()[k];
  return L ? [{ ...L, me: true }] : [];
}
