// Keyboard, gamepad and touch input (virtual joystick, buttons or tilt steering)
export const IS_TOUCH = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.state = { throttle: 0, brake: 0, steer: 0, analog: false, overtake: false, drs: false, shiftUp: false, shiftDown: false };
    this.touch = { left: false, right: false, gas: false, brake: false, ers: false, drs: false, look: false, steer: 0, steerActive: false };
    this.mode = { touchSteer: 'joystick', autoGas: false };
    this.tilt = 0; this.tiltOn = false;
    this.padPrev = [];
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); for (const k of ['left', 'right', 'gas', 'brake', 'ers', 'look']) this.touch[k] = false; });
    this.bindTouch();
  }

  setMode(m) { Object.assign(this.mode, m); }

  bindTouch() {
    const hold = { 'tc-left': 'left', 'tc-right': 'right', 'tc-gas': 'gas', 'tc-brake': 'brake', 'tc-ers': 'ers', 'tc-look': 'look' };
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
    const tap = { 'tc-drs': 'KeyF', 'tc-cam': 'KeyC', 'tc-pause': 'Escape' };
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

  was(code) { return this.pressed.has(code); }

  poll() {
    const k = this.keys, s = this.state, T = this.touch;
    let thr = k.has('KeyW') || k.has('ArrowUp') || T.gas ? 1 : 0;
    let brk = k.has('KeyS') || k.has('ArrowDown') || T.brake ? 1 : 0;
    let steer = 0, analog = false;
    if (k.has('KeyA') || k.has('ArrowLeft') || T.left) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight') || T.right) steer += 1;
    if (T.steerActive) { steer = T.steer; analog = true; }
    if (this.mode.touchSteer === 'tilt' && this.tiltOn && steer === 0) { steer = this.tilt; analog = true; }
    s.overtake = k.has('Space') || T.ers;
    s.drs = this.was('KeyF');
    s.shiftUp = this.was('KeyE');
    s.shiftDown = this.was('KeyQ');
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
      if (edge(3)) this.pressed.add('KeyC');
      if (edge(9)) this.pressed.add('Escape');
      if (b(1)) T.look = true; else if (this.padLook) T.look = false;
      this.padLook = b(1);
      this.padPrev = p.buttons.map((x) => x.pressed);
      break;
    }
    if (this.mode.autoGas && brk < 0.05) thr = 1;
    s.throttle = thr; s.brake = brk; s.steer = steer; s.analog = analog;
    return s;
  }

  endFrame() { this.pressed.clear(); }
}
