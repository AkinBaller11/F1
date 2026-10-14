// Online multiplayer over the Claude artifact `room` capability.
// Everything travels as presence (no event topics), so every viewer who can
// open the page can host or join: the lobby room lists open races, each race
// lives in its own named room ("gp-1234"). The host's presence carries the
// start signal, the grid and the AI cars it simulates; every driver's
// presence carries their own car state.
import { createPeerRoom } from './peer.js';

export const clean = (s, n = 14) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').trim().slice(0, n);

export class Net {
  constructor() {
    this.room = null; this.race = null; this.code = null; this.isHost = false;
    this.listeners = new Set();
    this.lobbyPeers = []; this.racePeers = [];
    this.startSeen = null;
    this.chatSeen = new Map(); // peer -> last chat id
  }

  async init() {
    if (this.ready) return this.room;
    this.ready = true;
    try {
      this.room = window.claude && window.claude.use ? await window.claude.use('room') : null;
    } catch (_) { this.room = null; }
    // outside Claude (Vercel, any web host): direct WebRTC connections via PeerJS
    this.transport = this.room ? 'room' : 'peer';
    if (!this.room) { try { this.room = await createPeerRoom(); } catch (_) { this.room = null; } }
    this.canList = this.transport === 'room';
    if (this.room) {
      this.room.onPeers((ch) => { this.lobbyPeers = ch.peers; this.emit(); }, () => { this.room = null; this.emit(); });
    }
    return this.room;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  // races advertised in the lobby by their hosts
  openRaces() {
    return this.lobbyPeers
      .filter((p) => !p.sameTab && p.presence && /^\d{4}$/.test(String(p.presence.host || '')))
      .map((p) => ({ code: String(p.presence.host), name: clean(p.presence.hn) || 'Gastgeber', n: Math.min(20, +p.presence.n || 1), racing: p.presence.st === 'racing' }));
  }

  get myPeer() { const me = (this.race ? this.race.peers() : this.room ? this.room.peers() : []).find((p) => p.sameTab); return me ? me.peer : null; }

  async open(code, host, me) {
    await this.leave();
    this.code = code; this.isHost = host;
    this.race = await this.room.join('gp-' + code, { host });
    this.race.onPeers((ch) => {
      this.racePeers = ch.peers;
      const h = this.hostPeer();
      if (h && h.presence.start && h.presence.start.id !== this.startSeen && !this.isHost) {
        this.startSeen = h.presence.start.id;
        this.onStart && this.onStart(h.presence.start);
      }
      if (this.isHost) this.advertise();
      this.readChat();
      this.emit();
    }, () => { this.race = null; this.emit(); });
    await this.race.presence({ name: me.name, drv: me.drv, host: host || null, car: null, start: null, ai: null, fin: null });
    if (host) this.advertise();
  }

  advertise(state) {
    if (!this.room || !this.isHost) return;
    if (state) this.hostState = state;
    this.room.presence({ host: this.code, hn: this.myName || '', n: this.players().length || 1, st: this.hostState || 'open' }).catch(() => {});
  }

  hostPeer() { return this.racePeers.find((p) => p.presence && p.presence.host); }

  players() {
    return this.racePeers.filter((p) => p.kind === 'viewer' && p.presence && p.presence.name !== undefined)
      .map((p) => ({ peer: p.peer, name: clean(p.presence.name) || 'Fahrer', drv: clean(p.presence.drv, 16), host: !!p.presence.host, me: p.sameTab }));
  }

  // host: publish the start signal (grid + settings); returns it for the local start
  startRace(start) {
    this.startSeen = start.id;
    this.race.presence({ start }).catch(() => {});
    this.advertise('racing');
    return start;
  }
  backToLobby() {
    if (!this.race) return;
    this.race.presence({ start: null, car: null, ai: null, fin: null }).catch(() => {});
    if (this.isHost) this.advertise('open');
  }

  // chat: each driver's latest message rides in their presence; new ids are shown once
  say(text) {
    const t = clean(text, 80);
    if (!t || !this.race) return;
    this.race.presence({ chat: { id: Date.now() + Math.random(), t } }).catch(() => {});
  }
  readChat() {
    for (const p of this.racePeers) {
      const c = p.presence && p.presence.chat;
      if (!c || typeof c.id !== 'number' || this.chatSeen.get(p.peer) === c.id) continue;
      this.chatSeen.set(p.peer, c.id);
      if (Date.now() - c.id > 20000) continue; // old message from before we joined
      this.onChat && this.onChat({ name: clean(p.presence.name) || 'Fahrer', text: clean(c.t, 80), me: p.sameTab });
    }
  }

  // per-frame car state (coalesced by the platform to ~30 Hz)
  sendCar(state) { if (this.race) this.race.presence(state).catch(() => {}); }

  peerState(peer) { const p = this.racePeers.find((x) => x.peer === peer); return p ? { presence: p.presence, updatedAt: p.updatedAt } : null; }

  async leave() {
    if (this.race) { const r = this.race; this.race = null; try { await r.leave(); } catch (_) { /* ignore */ } }
    this.racePeers = []; this.code = null; this.startSeen = null; this.chatSeen = new Map();
    if (this.room && this.isHost) this.room.presence({ host: null, hn: null, n: null, st: null }).catch(() => {});
    this.isHost = false; this.hostState = 'open';
    this.emit();
  }
}

// small deterministic RNG so every client builds the same weather from the host's seed
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
