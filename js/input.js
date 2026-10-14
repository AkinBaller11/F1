// Keyboard, gamepad and touch input (virtual joystick, buttons or tilt steering)
export const IS_TOUCH = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

// Rebindable keyboard actions (KeyboardEvent.code values)
export const ACTIONS = [
  ['throttle', 'Gas'], ['brake', 'Bremse'], ['left', 'Links lenken'], ['right', 'Rechts lenken'],
  ['ers', 'ERS Overtake'], ['drs', 'DRS'], ['up', 'Hochschalten'], ['down', 'Runterschalten'],
  ['cam', 'Kamera weiter'], ['camPrev', 'Kamera zurück'], ['look', 'Nach hinten schauen'],
  ['reset', 'Auto zurücksetzen'], ['pause', 'Pause'], ['mute', 'Ton an/aus'], ['hud', 'HUD umschalten'],
  ['box', 'Boxenstopp anfordern'], ['tyre', 'Reifen für den Stopp wählen'],
];
export const DEFAULT_BINDS = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  ers: ['Space'], drs: ['KeyF'], up: ['KeyE'], down: ['KeyQ'], cam: ['KeyC'], camPrev: ['KeyV'], look: ['KeyB'],
  reset: ['KeyR'], pause: ['Escape', 'KeyP'], mute: ['KeyM'], hud: ['KeyH'], box: ['Enter', 'KeyI'], tyre: ['KeyO'],
};
export function keyLabel(code) {
  if (!code) return '—';
  const map = { Space: 'Leertaste', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', ShiftLeft: 'Shift L', ShiftRight: 'Shift R', ControlLeft: 'Strg L', ControlRight: 'Strg R', AltLeft: 'Alt', Enter: 'Enter', Tab: 'Tab', Backspace: '⌫' };
  if (map[code]) return map[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // actions triggered this frame
    this.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
    this.capture = null; // rebinding callback
    this.sens = 1;
    this.state = { throttle: 0, brake: 0, steer: 0, analog: false, overtake: false, drs: false, shiftUp: false, shiftDown: false };
    this.touch = { left: false, right: false, gas: false, brake: false, ers: false, drs: false, look: false, steer: 0, steerActive: false };
    this.mode = { touchSteer: 'wheel', autoGas: false };
    this.tilt = 0; this.tiltOn = false;
    this.padPrev = [];
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const cb = this.capture; this.capture = null; cb(e.code); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !(e.target && e.target.tagName === 'INPUT')) e.preventDefault();
      if (!this.keys.has(e.code)) for (const [a, codes] of Object.entries(this.binds)) if (codes.includes(e.code)) this.pressed.add(a);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); for (const k of ['left', 'right', 'gas', 'brake', 'ers', 'look']) this.touch[k] = false; });
    this.bindTouch();
    this.bindWheel();
  }

  setMode(m) { Object.assign(this.mode, m); }
  setBinds(b) { this.binds = { ...JSON.parse(JSON.stringify(DEFAULT_BINDS)), ...(b || {}) }; }
  held(a) { const c = this.binds[a]; return !!c && c.some((k) => this.keys.has(k)); }
  act(a) { return this.pressed.has(a); }

  bindTouch() {
    const hold = { 'tc-left': 'left', 'tc-right': 'right', 'tc-gas': 'gas', 'tc-brake': 'brake', 'tc-ers': 'ers', 'tc-looktop': 'look' };
    for (const [id, k] of Object.entries(hold)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const on = (e) => { e.preventDefault(); this.touch[k] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
      const off = (e) => { e.preventDefault(); this.touch[k] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    const tap = { 'tc-drs': 'drs', 'tc-cam': 'cam', 'tc-pause': 'pause', 'tc-camtop': 'cam', 'tc-hud': 'hud', 'tc-box': 'box' };
    for (const [id, code] of Object.entries(tap)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pressed.add(code); });
    }
    // floating virtual joystick: horizontal offset from where the thumb landed
    const zone = document.getElementById('tz-steer'), knob = document.getElementById('tz-knob'), ring = zone && zone.querySelector('.ring');
    if (zone) {
      let id = null, x0 = 0, y0 = 0;
      const range = () => Math.min(90, Math.max(55, innerWidth * 0.07));
      zone.addEventListener('pointerdown', (e) => {
        if (id !== null) return;
        e.preventDefault(); id = e.pointerId; x0 = e.clientX; y0 = e.clientY;
        try { zone.setPointerCapture(id); } catch (_) { /* ignore */ }
        const r = zone.getBoundingClientRect();
        ring.style.left = x0 - r.left + 'px'; ring.style.top = y0 - r.top + 'px';
        zone.classList.add('active'); this.touch.steerActive = true; this.touch.steer = 0;
        knob.style.transform = 'translate(-50%,-50%)';
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        const d = Math.max(-1, Math.min(1, (e.clientX - x0) / range()));
        this.touch.steer = Math.sign(d) * Math.pow(Math.abs(d), 1.25);
        knob.style.transform = `translate(calc(-50% + ${d * range()}px), -50%)`;
      });
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null; this.touch.steer = 0; this.touch.steerActive = false; zone.classList.remove('active');
        knob.style.transform = 'translate(-50%,-50%)';
      };
      zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    }
  }

  // On-screen F1 wheel: one thumb drags sideways / around the rim, two fingers rotate it like a real wheel.
  bindWheel() {
    const pad = document.getElementById('wheelpad');
    if (!pad) return;
    const MAX = 100 * Math.PI / 180; // wheel rotation at full lock
    const pts = new Map();
    let base = null;
    const centre = () => { const r = pad.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.55, r.width]; };
    const recompute = () => {
      if (!pts.size) { this.touch.steerActive = false; this.touch.steer = 0; base = null; return; }
      const arr = [...pts.values()];
      if (arr.length >= 2) {
        const [a, b] = arr;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (!base || base.mode !== 2) base = { mode: 2, ang, steer: this.touch.steer };
        let d = ang - base.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.touch.steer = Math.max(-1, Math.min(1, base.steer + d / MAX));
      } else {
        const p = arr[0];
        const [cx, cy, w] = centre();
        if (!base || base.mode !== 1) base = { mode: 1, x: p.x, ang: Math.atan2(p.y - cy, p.x - cx), steer: this.touch.steer };
        // sideways drag, plus rotation around the hub when the thumb is out on the rim
        const lin = (p.x - base.x) / (w * 0.32);
        const rDist = Math.hypot(p.x - cx, p.y - cy);
        let rot = 0;
        if (rDist > w * 0.22) { rot = Math.atan2(p.y - cy, p.x - cx) - base.ang; rot = Math.atan2(Math.sin(rot), Math.cos(rot)) / MAX; }
        const v = Math.abs(rot) > Math.abs(lin) ? rot : lin;
        const raw = Math.max(-1, Math.min(1, base.steer + v));
        this.touch.steer = raw;
      }
      this.touch.steerActive = true;
    };
    pad.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('[data-btn]');
      e.preventDefault();
      if (btn) {
        const b = btn.dataset.btn;
        btn.classList.add('on');
        if (b === 'drs') this.pressed.add('drs');
        if (b === 'cam') this.pressed.add('cam');
        if (b === 'ot') this.touch.ers = true;
        if (b === 'look') this.touch.look = true;
        const up = (ev) => {
          if (ev.pointerId !== e.pointerId) return;
          btn.classList.remove('on');
          if (b === 'ot') this.touch.ers = false;
          if (b === 'look') this.touch.look = false;
          removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        };
        addEventListener('pointerup', up); addEventListener('pointercancel', up);
        return;
      }
      try { pad.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      base = null; recompute();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      recompute();
    });
    const end = (e) => {
      if (!pts.delete(e.pointerId)) return;
      base = null;
      if (pts.size) { this.touch.steer = this.touch.steer; recompute(); } else recompute();
    };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // must be called from a user gesture on iOS
  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
    } catch (_) { return false; }
    if (!this.tiltBound) {
      this.tiltBound = true;
      addEventListener('deviceorientation', (e) => {
        if (e.beta == null) return;
        this.tiltOn = true;
        const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 90;
        let t = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
        t = Math.abs(t) < 1.5 ? 0 : t - Math.sign(t) * 1.5;
        this.tilt = Math.max(-1, Math.min(1, t / 22));
      });
    }
    return true;
  }

  poll() {
    const s = this.state, T = this.touch, H = (a) => this.held(a);
    let thr = H('throttle') || T.gas ? 1 : 0;
    let brk = H('brake') || T.brake ? 1 : 0;
    let steer = 0, analog = false;
    if (H('left') || T.left) steer -= 1;
    if (H('right') || T.right) steer += 1;
    // touch: expo curve = finer control around the centre, full lock still reachable
    if (T.steerActive) { steer = Math.sign(T.steer) * Math.pow(Math.abs(T.steer), 1.45); analog = true; }
    if (this.mode.touchSteer === 'tilt' && this.tiltOn && steer === 0) { steer = this.tilt; analog = true; }
    s.overtake = H('ers') || T.ers;
    s.drs = this.act('drs');
    s.shiftUp = this.act('up');
    s.shiftDown = this.act('down');
    s.look = H('look') || T.look;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.08) { steer = Math.sign(ax) * Math.pow((Math.abs(ax) - 0.08) / 0.92, 1.4); analog = true; }
      const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05) thr = Math.max(thr, rt);
      if (lt > 0.05) brk = Math.max(brk, lt);
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      const edge = (i) => b(i) && !this.padPrev[i];
      if (b(0)) s.overtake = true;
      if (edge(2)) s.drs = true;
      if (edge(5)) s.shiftUp = true;
      if (edge(4)) s.shiftDown = true;
      if (edge(3)) this.pressed.add('cam');
      if (edge(9)) this.pressed.add('pause');
      if (edge(12)) this.pressed.add('box');
      if (edge(13)) this.pressed.add('tyre');
      if (b(1)) T.look = true; else if (this.padLook) T.look = false;
      this.padLook = b(1);
      this.padPrev = p.buttons.map((x) => x.pressed);
      break;
    }
    if (this.mode.autoGas && brk < 0.05) thr = 1;
    steer = Math.max(-1, Math.min(1, steer * this.sens));
    s.throttle = thr; s.brake = brk; s.steer = steer; s.analog = analog;
    return s;
  }

  endFrame() { this.pressed.clear(); }
}
