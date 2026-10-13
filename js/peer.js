// WebRTC transport (PeerJS) for hosting the game outside Claude, e.g. on Vercel.
// It mimics the small part of the artifact `room` API that net.js uses:
// join(name) -> { presence(patch), peers(), onPeers(fn), leave() }.
// Star topology: the race host owns the peer id "apexgp25-<code>", every guest
// connects to it, sends its presence, and the host re-broadcasts everyone's
// presence ~25 times a second.
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'apexgp25-';

function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL; s.async = true;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('peerjs')));
    s.onerror = () => reject(new Error('peerjs'));
    document.head.appendChild(s);
  });
}

// optional custom signalling server: ?peerhost=host:port (used for local testing)
function peerOptions() {
  const q = new URLSearchParams(location.search).get('peerhost');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:', debug: 0 };
}

const freeze = (o) => Object.freeze({ ...o });

function makeRace(Peer, code, isHost) {
  return new Promise((resolve, reject) => {
    const opts = peerOptions();
    const peer = isHost ? new Peer(PREFIX + code, opts) : new Peer(opts);
    let myId = null, mine = {}, myVer = 0;
    const listeners = new Set();
    let snap = [];
    let closed = false;
    // host state
    const conns = new Map(); // peerId -> conn
    const states = new Map(); // peerId -> { presence, ver, updatedAt }
    // guest state
    let conn = null;
    const seen = new Map(); // peerId -> { ver, updatedAt, presence }

    const notify = () => {
      for (const fn of listeners) { try { fn({ peers: snap, joined: [], left: [], updated: [] }); } catch (e) { console.error(e); } }
    };
    const entry = (id, presence, updatedAt) => Object.freeze({ peer: id, by: null, isMe: id === myId, sameTab: id === myId, kind: 'viewer', guest: false, presence, updatedAt });

    const rebuildHost = () => {
      const now = Date.now();
      const arr = [entry(myId, freeze(mine), now)];
      for (const [id, st] of states) arr.push(entry(id, st.presence, st.updatedAt));
      snap = Object.freeze(arr); notify();
    };
    let lastBroadcast = 0, pending = false;
    const broadcast = () => {
      const now = performance.now();
      if (now - lastBroadcast < 40) { if (!pending) { pending = true; setTimeout(() => { pending = false; broadcast(); }, 40); } return; }
      lastBroadcast = now;
      const list = [[myId, myVer, mine]];
      for (const [id, st] of states) list.push([id, st.ver, st.presence]);
      const msg = { t: 's', l: list };
      for (const c of conns.values()) if (c.open) { try { c.send(msg); } catch (_) { /* ignore */ } }
    };

    const applySnapshot = (list) => {
      const now = Date.now();
      const arr = [];
      const ids = new Set();
      for (const [id, ver, presence] of list) {
        if (typeof id !== 'string') continue;
        ids.add(id);
        if (id === myId) { arr.push(entry(myId, freeze(mine), now)); continue; }
        let s = seen.get(id);
        if (!s || s.ver !== ver) { s = { ver, updatedAt: now, presence: freeze(presence || {}) }; seen.set(id, s); }
        arr.push(entry(id, s.presence, s.updatedAt));
      }
      for (const id of [...seen.keys()]) if (!ids.has(id)) seen.delete(id);
      if (!ids.has(myId)) arr.unshift(entry(myId, freeze(mine), now));
      snap = Object.freeze(arr); notify();
    };

    let lastSend = 0, sendPending = false;
    const sendMine = () => {
      if (!conn || !conn.open) return;
      const now = performance.now();
      if (now - lastSend < 33) { if (!sendPending) { sendPending = true; setTimeout(() => { sendPending = false; sendMine(); }, 33); } return; }
      lastSend = now;
      try { conn.send({ t: 'p', v: myVer, p: mine }); } catch (_) { /* ignore */ }
    };

    const api = {
      name: 'gp-' + code,
      async presence(patch) {
        for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete mine[k]; else mine[k] = v; }
        myVer++;
        if (isHost) { rebuildHost(); broadcast(); } else { snap = Object.freeze(snap.map((p) => (p.peer === myId ? entry(myId, freeze(mine), Date.now()) : p))); sendMine(); }
      },
      peers: () => snap,
      onPeers(fn) { listeners.add(fn); setTimeout(() => fn({ peers: snap, joined: snap, left: [], updated: [] }), 0); return () => listeners.delete(fn); },
      connected: () => !closed,
      onConnection(fn) { setTimeout(() => fn(!closed), 0); return () => {}; },
      emit: async () => {}, on: () => () => {},
      async leave() {
        closed = true;
        try { if (conn) conn.close(); for (const c of conns.values()) c.close(); peer.destroy(); } catch (_) { /* ignore */ }
        snap = Object.freeze([]); notify();
      },
    };

    let settled = false;
    const fail = (e) => { if (!settled) { settled = true; try { peer.destroy(); } catch (_) { /* ignore */ } reject(e); } else if (!closed) { closed = true; snap = Object.freeze(snap.filter((p) => p.sameTab)); notify(); } };
    const timer = setTimeout(() => fail(Object.assign(new Error('timeout'), { code: 'timeout' })), 12000);

    // keep-alive: unreliable channels can drop a message, so state is re-sent regularly
    const keep = setInterval(() => { if (closed) { clearInterval(keep); return; } if (isHost) broadcast(); else sendMine(); }, 700);
    peer.on('error', (e) => fail(Object.assign(new Error(e.type || 'error'), { code: e.type })));
    peer.on('disconnected', () => { if (!closed) { try { peer.reconnect(); } catch (_) { /* ignore */ } } });
    peer.on('open', (id) => {
      myId = id;
      if (isHost) {
        peer.on('connection', (c) => {
          c.on('open', () => { conns.set(c.peer, c); broadcast(); });
          c.on('data', (m) => {
            if (!m || m.t !== 'p' || typeof m.p !== 'object') return;
            const st = states.get(c.peer);
            if (!st || st.ver !== m.v) states.set(c.peer, { presence: freeze(m.p), ver: m.v, updatedAt: Date.now() });
            rebuildHost(); broadcast();
          });
          const drop = () => { conns.delete(c.peer); states.delete(c.peer); rebuildHost(); broadcast(); };
          c.on('close', drop); c.on('error', drop);
        });
        rebuildHost();
        clearTimeout(timer); settled = true; resolve(api);
      } else {
        conn = peer.connect(PREFIX + code, { serialization: 'json', reliable: false });
        conn.on('open', () => {
          snap = Object.freeze([entry(myId, freeze(mine), Date.now())]);
          clearTimeout(timer); settled = true; resolve(api);
          sendMine();
        });
        conn.on('data', (m) => { if (m && m.t === 's' && Array.isArray(m.l)) applySnapshot(m.l); });
        conn.on('close', () => { if (!closed) { snap = Object.freeze(snap.filter((p) => p.sameTab)); notify(); } });
      }
    });
  });
}

// room-like object: lobby without listing (no public directory), races via join()
export async function createPeerRoom() {
  const Peer = await loadPeerJS();
  return {
    kind: 'peer',
    onPeers: () => () => {},
    presence: async () => {},
    peers: () => [],
    join: (name, opts = {}) => makeRace(Peer, String(name).replace(/^gp-/, ''), !!opts.host),
  };
}
