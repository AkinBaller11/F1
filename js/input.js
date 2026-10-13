// Keyboard, gamepad and touch input
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.state = { throttle: 0, brake: 0, steer: 0, analog: false, overtake: false, drs: false, shiftUp: false, shiftDown: false };
    this.touch = { left: false, right: false, gas: false, brake: false, ers: false, drs: false };
    this.padPrev = [];
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.bindTouch();
  }

  bindTouch() {
    const map = { 'tc-left': 'left', 'tc-right': 'right', 'tc-gas': 'gas', 'tc-brake': 'brake', 'tc-ers': 'ers', 'tc-drs': 'drs' };
    for (const [id, k] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const on = (e) => { e.preventDefault(); this.touch[k] = true; el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.touch[k] = false; el.classList.remove('on'); };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
    }
  }

  was(code) { return this.pressed.has(code); }

  poll() {
    const k = this.keys, s = this.state;
    let thr = k.has('KeyW') || k.has('ArrowUp') || this.touch.gas ? 1 : 0;
    let brk = k.has('KeyS') || k.has('ArrowDown') || this.touch.brake ? 1 : 0;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft') || this.touch.left) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight') || this.touch.right) steer += 1;
    let analog = false;
    s.overtake = k.has('Space') || this.touch.ers;
    s.drs = this.was('KeyF') || this.touch.drs;
    s.shiftUp = this.was('KeyE');
    s.shiftDown = this.was('KeyQ');
    this.padButtons = {};
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
      this.padPrev = p.buttons.map((x) => x.pressed);
      break;
    }
    s.throttle = thr; s.brake = brk; s.steer = steer; s.analog = analog;
    return s;
  }

  endFrame() { this.pressed.clear(); }
}
