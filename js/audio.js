// Synthesised V6 hybrid engine, rain ambience and effects via WebAudio
export class Audio {
  constructor() {
    this.ctx = null; this.muted = false;
  }
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);

    // engine: two detuned saws + square sub through a resonant lowpass and soft clip
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 4;
    this.oscs = [];
    const mk = (type, gain) => {
      const o = ctx.createOscillator(); o.type = type;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(shaper); o.start();
      this.oscs.push(o); return o;
    };
    this.o1 = mk('sawtooth', 0.35); this.o2 = mk('sawtooth', 0.25); this.o3 = mk('square', 0.18); this.o4 = mk('triangle', 0.3);
    shaper.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.master);

    // turbo / MGU-K whine
    this.whine = ctx.createOscillator(); this.whine.type = 'sine';
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain); this.whineGain.connect(this.master); this.whine.start();

    // noise buffer for rain / wind / gravel
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = (filterType, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { g, f };
    };
    this.wind = noise('bandpass', 800, 0.6);
    this.rain = noise('highpass', 3000, 0.3);
    this.rumble = noise('lowpass', 180, 1);
    this.rainLevel = 0;
    this.crowd = noise('bandpass', 1200, 0.4);
  }
  resume() { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  update(car, others, inCockpit) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = car.rpm;
    const f = (rpm / 60) * 3; // V6 firing frequency
    this.o1.frequency.setTargetAtTime(f, t, 0.02);
    this.o2.frequency.setTargetAtTime(f * 1.005, t, 0.02);
    this.o3.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    this.o4.frequency.setTargetAtTime(f * 2, t, 0.02);
    const load = 0.35 + car.throttle * 0.65;
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 0.18 * load + (car.limiter ? Math.random() * 800 : 0), t, 0.03);
    this.engGain.gain.setTargetAtTime((0.1 + load * 0.16) * (car.limiter && Math.random() < 0.5 ? 0.4 : 1), t, 0.02);
    this.whine.frequency.setTargetAtTime(1800 + rpm * 0.35, t, 0.05);
    this.whineGain.gain.setTargetAtTime(0.012 * car.throttle, t, 0.05);
    const v = Math.abs(car.v);
    this.wind.g.gain.setTargetAtTime(Math.min(0.12, v * v * 0.000014), t, 0.1);
    this.wind.f.frequency.setTargetAtTime(400 + v * 12, t, 0.1);
    this.rain.g.gain.setTargetAtTime(this.rainLevel * (inCockpit ? 1 : 0.6), t, 0.3);
    this.rumble.g.gain.setTargetAtTime(car.bump * Math.min(1, v / 20) * 0.35, t, 0.03);
    // nearby cars -> crowd/air rush
    let near = 0;
    for (const o of others) { const d = Math.hypot(o.x - car.x, o.z - car.z); if (d < 40) near += (1 - d / 40) * Math.min(1, o.v / 50); }
    this.crowd.g.gain.setTargetAtTime(Math.min(0.12, near * 0.05), t, 0.1);
  }

  shift() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 90;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  beep(freq = 880, dur = 0.25) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  crash(intensity) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = 0.4 * intensity;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  stop() { if (this.ctx) { this.ctx.close(); this.ctx = null; } }
}
