// Racing audio, all synthesised with WebAudio (no recordings: official F1 audio is not licensable here).
//
// Engine (EngineVoice): a 1.6 l V6 turbo hybrid built from engine orders instead of a pitched loop.
//  - one oscillator per load state plays a custom waveform whose fundamental is half the crank frequency
//    (rpm / 120): harmonic n is engine order n/2. The firing order of a V6 (order 3) and its multiples carry
//    the tone; the half orders (uneven combustion, exhaust pulse interference) give the rasp. On load the
//    spectrum is bright, on overrun it is darker with stronger half orders (the burble of a lifted engine);
//    the two are cross-faded by throttle.
//  - combustion noise amplitude-modulated at the firing frequency
//  - fixed exhaust / intake resonances (peaking filters) the harmonics sweep through while the pitch moves, a
//    soft clipper whose drive follows load, a slow random wobble of pitch and level: nothing repeats
//  - turbo / MGU-H whistle that spools up with load and decays when lifting
//  - shift events: ignition cut + exhaust crack on upshifts, throttle blip + crackle on downshifts, random
//    overrun pops when lifting at high rpm
// Other cars: a pool of lighter engine voices, given to the nearest cars around the listener (the camera),
// placed with PannerNodes, distance filtered (air absorption) and Doppler-shifted from the real relative speed
// (clamped to physically sane values).
// Camera: on-board cameras hear the player's engine "inside" (direct, low-passed, more body), external cameras
// hear it from where the car is, through the same spatialisation as the other cars; switching cross-fades.
// Tyres and surfaces from the vehicle model: scrub near the grip limit, squeal when locking or spinning, rolling
// roar, kerb rumble at the rib frequency, gravel crunch, grass, wet hiss and spray.
// Mix: engine / effects / ambience buses with user volumes, a compressor-limiter in front of the output.

const C = 343; // speed of sound (m/s)
const ORDER_SEED = 17;

function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// waveform over 64 harmonics of rpm/120. `bright` tilts the spectrum, `half` weights the half orders
function engineWave(ctx, bright, half, seed) {
  const N = 64, re = new Float32Array(N + 1), im = new Float32Array(N + 1), r = seeded(seed);
  for (let n = 1; n <= N; n++) {
    let a = 1 / Math.pow(n, 1.25 - bright * 0.55);
    if (n % 6 === 0) a *= 3.2;            // firing order 3 and its multiples
    else if (n % 2 === 0) a *= 1.25;      // whole orders
    else a *= half;                       // half orders
    if (n === 6) a *= 1.6;                // the fundamental of the exhaust note
    a *= 0.75 + r() * 0.5;                // fixed per-harmonic colour
    const ph = r() * Math.PI * 2;
    re[n] = a * Math.cos(ph); im[n] = a * Math.sin(ph);
  }
  return ctx.createPeriodicWave(re, im);
}

function noiseBuffer(ctx, sec = 2, seed = 5) {
  const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), r = seeded(seed);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return buf;
}
// very slow random signal (for pitch / level wobble): noise low-passed hard
function wobble(ctx, buf, hz, amount, target) {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.37;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hz; f.Q.value = 0.3;
  const g = ctx.createGain(); g.gain.value = amount;
  src.connect(f); f.connect(g); g.connect(target); src.start();
  return g;
}

class EngineVoice {
  // full: the player's engine (both load layers, whine, pops); otherwise a lighter voice for other cars
  constructor(A, full) {
    const ctx = A.ctx;
    this.A = A; this.full = full;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    // exhaust / intake resonances, fixed in frequency
    const peaks = [[310, 1.1, 6], [1150, 1.6, 5], [2600, 2.2, 3.5], [4200, 3, 2]];
    let head = null, tail = null;
    for (const [f, q, db] of peaks) { const p = ctx.createBiquadFilter(); p.type = 'peaking'; p.frequency.value = f; p.Q.value = q; p.gain.value = db; if (!head) head = p; else tail.connect(p); tail = p; }
    this.drive = ctx.createWaveShaper(); this.setDrive(0.5);
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 9000; this.tone.Q.value = 0.5;
    tail.connect(this.drive); this.drive.connect(this.tone); this.tone.connect(this.out);
    this.mix = ctx.createGain(); this.mix.gain.value = 1; this.mix.connect(head);
    // harmonic layers
    this.onG = ctx.createGain(); this.onG.connect(this.mix);
    this.on = ctx.createOscillator(); this.on.setPeriodicWave(A.waveOn); this.on.connect(this.onG); this.on.start();
    if (full) {
      this.offG = ctx.createGain(); this.offG.gain.value = 0; this.offG.connect(this.mix);
      this.off = ctx.createOscillator(); this.off.setPeriodicWave(A.waveOff); this.off.connect(this.offG); this.off.start();
      wobble(ctx, A.noise, 3, 9, this.off.detune);
    }
    wobble(ctx, A.noise, 4, full ? 7 : 10, this.on.detune); // cents of slow pitch wander
    // combustion noise, amplitude-modulated at the firing frequency
    const ns = ctx.createBufferSource(); ns.buffer = A.noise; ns.loop = true; ns.loopStart = Math.random(); ns.start(0, Math.random() * 1.5);
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 0.7;
    this.combG = ctx.createGain(); this.combG.gain.value = 0;
    this.am = ctx.createGain(); this.am.gain.value = 0.5;
    this.fire = ctx.createOscillator(); this.fire.type = 'sawtooth';
    const amDepth = ctx.createGain(); amDepth.gain.value = 0.5; this.fire.connect(amDepth); amDepth.connect(this.am.gain); this.fire.start();
    ns.connect(nf); nf.connect(this.am); this.am.connect(this.combG); this.combG.connect(this.mix);
    if (full) {
      this.whine = ctx.createOscillator(); this.whine.type = 'sine';
      this.whineG = ctx.createGain(); this.whineG.gain.value = 0;
      this.whine.connect(this.whineG); this.whineG.connect(this.out); this.whine.start();
      this.spool = 0;
    }
    this.cut = 1; // ignition cut on upshifts (0..1)
  }
  setDrive(k) {
    const n = 512, c = new Float32Array(n), d = 1 + k * 2.5;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * d) / Math.tanh(d); }
    this.drive.curve = c; this.driveK = k;
  }
  // rpm, load 0..1 (throttle / engine pulling), gain, brightness 0..1 (tone filter), dt
  set(t, rpm, load, gain, bright, dt) {
    const f0 = rpm / 120, fire = rpm / 20;
    this.on.frequency.setTargetAtTime(f0, t, 0.012);
    this.fire.frequency.setTargetAtTime(fire, t, 0.012);
    if (this.full) {
      this.off.frequency.setTargetAtTime(f0, t, 0.012);
      this.onG.gain.setTargetAtTime(0.25 + load * 0.75, t, 0.03);
      this.offG.gain.setTargetAtTime((1 - load) * 0.9, t, 0.05);
      // turbo spools with load and rpm, decays slower than it builds
      const want = load * Math.min(1, rpm / 11000);
      this.spool += (want - this.spool) * Math.min(1, dt * (want > this.spool ? 2.2 : 1.1));
      this.whine.frequency.setTargetAtTime(2400 + this.spool * 2600 + rpm * 0.08, t, 0.05);
      this.whineG.gain.setTargetAtTime(0.006 + this.spool * 0.014, t, 0.06);
    } else this.onG.gain.setTargetAtTime(0.6 + load * 0.4, t, 0.05);
    this.combG.gain.setTargetAtTime((0.05 + load * 0.16) * Math.min(1, rpm / 9000), t, 0.03);
    // drive: more harmonics on load; only re-shape the curve when it really changed
    const k = 0.25 + load * 0.6;
    if (Math.abs(k - this.driveK) > 0.08) this.setDrive(k);
    this.tone.frequency.setTargetAtTime(Math.min(16000, (1600 + rpm * 0.55 * (0.55 + load * 0.45)) * (0.25 + bright * 0.75) + 300), t, 0.04);
    this.out.gain.setTargetAtTime(gain * this.cut, t, 0.015);
  }
  stop(t) { this.out.gain.setTargetAtTime(0, t, 0.1); }
}

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false;
    this.rainLevel = 0; this.wetness = 0;
  }
  // ctx: optional context to render into (an OfflineAudioContext in the audio tests)
  init(ctxIn) {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !ctxIn) return;
    const ctx = (this.ctx = ctxIn || new AC());
    // output: compressor-limiter so many voices can never clip
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9; this.limiter.knee.value = 6; this.limiter.ratio.value = 8; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.15;
    this.limiter.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.limiter);
    // buses: engine, effects (tyres, shifts, impacts, UI), ambience (wind, rain, crowd)
    this.engBus = ctx.createGain(); this.fxBus = ctx.createGain(); this.ambBus = ctx.createGain();
    for (const b of [this.engBus, this.fxBus, this.ambBus]) b.connect(this.master);
    if (this.vol) this.setVolumes(this.vol);
    this.noise = noiseBuffer(ctx, 2.3, 5);
    this.waveOn = engineWave(ctx, 1, 0.42, ORDER_SEED);
    this.waveOff = engineWave(ctx, 0.15, 0.9, ORDER_SEED + 4);
    this.waveAI = engineWave(ctx, 0.8, 0.5, ORDER_SEED + 9);

    // player's engine: one voice, two routes: inside (on-board cameras) and outside (spatial)
    this.eng = new EngineVoice(this, true);
    this.inside = ctx.createGain(); this.inside.gain.value = 1;
    const body = ctx.createBiquadFilter(); body.type = 'lowshelf'; body.frequency.value = 220; body.gain.value = 5; // chassis / airbox
    this.insideLP = ctx.createBiquadFilter(); this.insideLP.type = 'lowpass'; this.insideLP.frequency.value = 3200; this.insideLP.Q.value = 0.6;
    this.eng.out.connect(body); body.connect(this.insideLP); this.insideLP.connect(this.inside); this.inside.connect(this.engBus);
    this.outside = ctx.createGain(); this.outside.gain.value = 0;
    this.pPan = this.panner(); this.pAir = ctx.createBiquadFilter(); this.pAir.type = 'lowpass'; this.pAir.frequency.value = 16000;
    this.eng.out.connect(this.outside); this.outside.connect(this.pAir); this.pAir.connect(this.pPan); this.pPan.connect(this.engBus);
    this.ego = 1; // 1 = on-board, 0 = external (smoothed)

    // other cars: voice pool
    this.voices = [];
    for (let k = 0; k < 5; k++) {
      const v = new EngineVoice(this, false);
      v.on.setPeriodicWave(this.waveAI);
      v.air = ctx.createBiquadFilter(); v.air.type = 'lowpass'; v.air.frequency.value = 12000;
      v.pan = this.panner();
      v.out.connect(v.air); v.air.connect(v.pan); v.pan.connect(this.engBus);
      v.car = null; v.level = 0; v.prevV = 0; v.rpm = 6000; v.dop = 1;
      this.voices.push(v);
    }

    // noise layers
    const layer = (type, freq, q, bus) => {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.start(0, Math.random() * 2);
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(bus);
      return { g, f, src };
    };
    this.wind = layer('bandpass', 800, 0.6, this.ambBus);
    this.buffet = layer('lowpass', 140, 0.7, this.ambBus); // helmet buffeting in the cockpit
    this.rain = layer('highpass', 3000, 0.3, this.ambBus);
    this.crowd = layer('bandpass', 900, 0.5, this.ambBus);
    this.squeal = layer('bandpass', 1900, 7, this.fxBus);
    this.scrub = layer('bandpass', 750, 2.2, this.fxBus);
    this.roll = layer('lowpass', 260, 0.7, this.fxBus);       // tyre roar on asphalt
    this.gravel = layer('bandpass', 1400, 0.6, this.fxBus);
    this.grass = layer('lowpass', 420, 0.8, this.fxBus);
    this.hiss = layer('bandpass', 2600, 0.8, this.fxBus);      // wet tyres and spray
    // kerb rumble: a square at the rib frequency through a low-pass
    this.kerbOsc = ctx.createOscillator(); this.kerbOsc.type = 'square'; this.kerbOsc.frequency.value = 20;
    const kf = ctx.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 380;
    this.kerbG = ctx.createGain(); this.kerbG.gain.value = 0;
    this.kerbOsc.connect(kf); kf.connect(this.kerbG); this.kerbG.connect(this.fxBus); this.kerbOsc.start();
    this.bumpG = layer('lowpass', 120, 1, this.fxBus);         // suspension over bumps
    this.lastT = 0; this.prevGear = 0; this.popT = 0; this.listener = { x: 0, z: 0, vx: 0, vz: 0, init: false };
  }
  panner() {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 7; p.maxDistance = 2000; p.rolloffFactor = 1.1;
    return p;
  }
  resume() { this.ctx && this.ctx.state === 'suspended' && this.ctx.resume(); }
  setMuted(m) { this.muted = m; this.applyMaster(); }
  // volumes 0..100
  setVolumes(v) {
    this.vol = { ...v };
    if (!this.ctx) return;
    this.engBus.gain.value = (v.engine ?? 80) / 80;
    this.fxBus.gain.value = (v.fx ?? 80) / 80;
    this.ambBus.gain.value = (v.amb ?? 70) / 70;
    this.applyMaster();
  }
  applyMaster() { if (this.master) this.master.gain.value = this.muted ? 0 : 0.5 * (((this.vol && this.vol.master) ?? 80) / 80); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // place a panner (positions on the ground plane, y = height above it)
  place(p, x, y, z, t) {
    if (p.positionX) { p.positionX.setTargetAtTime(x, t, 0.02); p.positionY.setTargetAtTime(y, t, 0.02); p.positionZ.setTargetAtTime(z, t, 0.02); }
    else p.setPosition(x, y, z);
  }

  // car: the player's physics object; others: other cars; inCockpit: on-board camera; cam: the camera (THREE
  // camera, for the listener); optional for the tests
  update(car, others, inCockpit, cam) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, dt = Math.min(0.1, Math.max(1 / 240, t - this.lastT || 1 / 60));
    this.lastT = t;
    const v = Math.abs(car.v), rpm = car.rpm || 4000;
    // ---------- listener (camera)
    let lx = car.x, lz = car.z, fx = -Math.sin(car.yaw || 0), fz = -Math.cos(car.yaw || 0);
    if (cam && cam.matrixWorld) {
      const e = cam.matrixWorld.elements;
      lx = e[12]; lz = e[14];
      const dx = -e[8], dz = -e[10], dl = Math.hypot(dx, dz) || 1; fx = dx / dl; fz = dz / dl;
    }
    const L = this.listener;
    if (!L.init) { L.x = lx; L.z = lz; L.init = true; }
    const lvx = (lx - L.x) / dt, lvz = (lz - L.z) / dt;
    L.vx += (lvx - L.vx) * Math.min(1, dt * 8); L.vz += (lvz - L.vz) * Math.min(1, dt * 8);
    if (Math.hypot(lx - L.x, lz - L.z) > 60) { L.vx = 0; L.vz = 0; } // camera cut
    L.x = lx; L.z = lz;
    const al = ctx.listener;
    if (al.positionX) {
      al.positionX.setTargetAtTime(lx, t, 0.02); al.positionY.setTargetAtTime(1.2, t, 0.02); al.positionZ.setTargetAtTime(lz, t, 0.02);
      al.forwardX.setTargetAtTime(fx, t, 0.02); al.forwardY.setTargetAtTime(0, t, 0.02); al.forwardZ.setTargetAtTime(fz, t, 0.02);
      al.upX.value = 0; al.upY.value = 1; al.upZ.value = 0;
    } else { al.setPosition(lx, 1.2, lz); al.setOrientation(fx, 0, fz, 0, 1, 0); }
    // relative Doppler factor for a source at (x, z) moving with (vx, vz): f' = f (c + v_l·n) / (c + v_s·n),
    // n from source to listener, clamped (a 330 km/h pass is about 1.3 / 0.77 in reality)
    const doppler = (x, z, vx, vz) => {
      const nx = lx - x, nz = lz - z, d = Math.hypot(nx, nz) || 1;
      const ux = nx / d, uz = nz / d;
      const vl = -(L.vx * ux + L.vz * uz), vs = -(vx * ux + vz * uz);
      return Math.max(0.78, Math.min(1.28, (C + vl) / (C + vs)));
    };
    const air = (d) => Math.max(1400, 17000 * Math.exp(-d / 220)); // high frequencies die off with distance

    // ---------- player's engine
    const thr = car.throttle || 0;
    const load = car.limiter ? 0.6 : Math.min(1, thr * (0.65 + 0.35 * Math.min(1, rpm / 9000)));
    this.ego += ((inCockpit ? 1 : 0) - this.ego) * Math.min(1, dt * 5);
    // upshift ignition cut recovers within ~60 ms
    this.eng.cut = Math.min(1, this.eng.cut + dt * 14);
    // limiter: the ECU cuts sparks in quick bursts
    if (car.limiter) this.eng.cut *= (Math.floor(t * 28) % 2 ? 0.45 : 1);
    const eg = 0.2 + load * 0.22 + Math.min(0.06, rpm / 200000);
    this.eng.set(t, rpm, load, eg, 0.55 + 0.45 * load, dt);
    this.inside.gain.setTargetAtTime(this.ego * 0.95, t, 0.05);
    this.outside.gain.setTargetAtTime((1 - this.ego) * 1.15, t, 0.05);
    const yawc = car.yaw || 0, cvx = -Math.sin(yawc) * car.v, cvz = -Math.cos(yawc) * car.v;
    this.place(this.pPan, car.x, 0.6, car.z, t);
    const dP = Math.hypot(car.x - lx, car.z - lz);
    this.pAir.frequency.setTargetAtTime(air(dP), t, 0.05);
    // Doppler only matters once the camera is detached from the car (TV / heli / replay views)
    const dopP = this.ego < 0.5 && dP > 12 ? doppler(car.x, car.z, cvx, cvz) : 1;
    if (dopP !== 1) { this.eng.on.frequency.setTargetAtTime(rpm / 120 * dopP, t, 0.02); this.eng.off.frequency.setTargetAtTime(rpm / 120 * dopP, t, 0.02); this.eng.fire.frequency.setTargetAtTime(rpm / 20 * dopP, t, 0.02); }
    // gear changes: up = cut + crack, down = blip + crackle
    if (car.gear !== this.prevGear && this.prevGear > 0 && car.gear > 0) { if (car.gear > this.prevGear) this.upshift(); else this.downshift(); }
    this.prevGear = car.gear;
    // overrun pops: lifted at high rpm
    if (thr < 0.08 && rpm > 7500 && v > 12) {
      this.popT -= dt;
      if (this.popT <= 0) { this.pop(0.5 + Math.random() * 0.5); this.popT = 0.05 + Math.random() * 0.35 * (12500 / rpm); }
    } else this.popT = 0.2;

    // ---------- other cars: the nearest ones to the listener get a voice
    const near = [];
    for (const o of others || []) {
      if (!o || o.gone || o === car) continue;
      const d = Math.hypot(o.x - lx, o.z - lz);
      if (d < 320) near.push([d, o]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const want = near.slice(0, this.voices.length).map((e) => e[1]);
    for (const vc of this.voices) if (vc.car && !want.includes(vc.car)) { vc.car = null; vc.out.gain.setTargetAtTime(0, t, 0.08); }
    for (const o of want) {
      let vc = this.voices.find((x) => x.car === o);
      if (!vc) { vc = this.voices.find((x) => !x.car); if (!vc) continue; vc.car = o; vc.prevV = o.v; vc.rpm = aiRpm(o.v); }
      const acc = (o.v - vc.prevV) / dt; vc.prevV = o.v;
      const r = aiRpm(o.v);
      vc.rpm += (r - vc.rpm) * Math.min(1, dt * 12);
      const ld = acc > 0.5 ? 1 : acc < -2 ? 0.1 : 0.55;
      const d = Math.hypot(o.x - lx, o.z - lz);
      const ovx = -Math.sin(o.yaw || 0) * o.v, ovz = -Math.cos(o.yaw || 0) * o.v;
      vc.dop += (doppler(o.x, o.z, ovx, ovz) - vc.dop) * Math.min(1, dt * 10);
      vc.set(t, vc.rpm * vc.dop, ld, 0.42 + ld * 0.2, 0.75, dt);
      vc.air.frequency.setTargetAtTime(air(d), t, 0.05);
      this.place(vc.pan, o.x, 0.6, o.z, t);
    }

    // ---------- tyres and surface (from the vehicle model)
    const wet = Math.min(1, this.wetness || this.rainLevel * 4);
    const use = car.usage ? Math.max(car.usage[0], car.usage[1]) : 0;
    const onboard = 0.75 + 0.25 * this.ego;
    const scrub = Math.min(1, Math.max(0, (use - 0.85) / 0.15)) * Math.min(1, v / 15) * (1 - 0.75 * wet);
    const sq = Math.max(car.lockup || 0, (car.wheelspin || 0) * 0.8) * Math.min(1, v / 10) * (1 - 0.5 * wet);
    this.scrubLevel = Math.max(sq, scrub * 0.45);
    this.squeal.g.gain.setTargetAtTime(sq * 0.45 * onboard, t, 0.04);
    this.squeal.f.frequency.setTargetAtTime((car.lockup ? 1350 : 1700) + v * 5, t, 0.08);
    this.scrub.g.gain.setTargetAtTime(scrub * 0.16 * onboard, t, 0.06);
    this.scrub.f.frequency.setTargetAtTime(600 + v * 3, t, 0.1);
    const surf = car.surface || 'road';
    const onRoad = surf === 'road' || surf === 'kerb' || surf === 'runoff';
    this.roll.g.gain.setTargetAtTime((onRoad ? 1 : 0.4) * Math.min(0.15, v * 0.0019) * (1 - 0.4 * wet), t, 0.1);
    this.roll.f.frequency.setTargetAtTime(160 + v * 2.2, t, 0.1);
    this.gravel.g.gain.setTargetAtTime(surf === 'gravel' ? Math.min(0.3, 0.08 + v * 0.006) : 0, t, 0.04);
    this.grass.g.gain.setTargetAtTime(surf === 'grass' ? Math.min(0.22, 0.05 + v * 0.004) : 0, t, 0.05);
    // kerb ribs every ~1.1 m (estimate): the rumble frequency follows the speed
    this.kerbOsc.frequency.setTargetAtTime(Math.max(8, v / 1.1), t, 0.02);
    this.kerbG.gain.setTargetAtTime(surf === 'kerb' ? Math.min(0.16, 0.04 + v * 0.0025) * onboard : 0, t, 0.02);
    this.bumpG.g.gain.setTargetAtTime((car.bump || 0) * Math.min(1, v / 20) * 0.3, t, 0.03);
    this.hiss.f.frequency.setTargetAtTime(1800 + v * 12, t, 0.15);

    // ---------- wind, rain, crowd
    this.wind.g.gain.setTargetAtTime(Math.min(0.12, v * v * 0.000013) * (0.55 + 0.45 * this.ego), t, 0.1);
    this.wind.f.frequency.setTargetAtTime(400 + v * 12, t, 0.1);
    this.buffet.g.gain.setTargetAtTime(this.ego * Math.min(0.1, v * v * 0.0000075), t, 0.1);
    this.rain.g.gain.setTargetAtTime(this.rainLevel * (0.6 + 0.4 * this.ego), t, 0.3);
    // spray from cars ahead in the wet: louder the closer they run
    let spray = 0;
    for (const o of others || []) { const d = Math.hypot(o.x - car.x, o.z - car.z); if (d < 35) spray += (1 - d / 35) * Math.min(1, o.v / 50); }
    this.hiss.g.gain.setTargetAtTime(wet * (Math.min(0.14, v * 0.0018) + Math.min(0.1, spray * 0.05)), t, 0.15);
    // crowd: a distant murmur, louder on the pit straight (grandstands), and while cars pass the camera
    const tr = car.track, pitS = tr && tr.inPitStraight ? tr.inPitStraight(car.s || 0) : false;
    this.crowd.g.gain.setTargetAtTime((pitS ? 0.05 : 0.015) * (1 - 0.5 * this.ego), t, 0.6);
  }

  // engines off (replay / podium); crowd level for the ceremony
  quiet(crowd = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.eng.stop(t);
    for (const vc of this.voices) { vc.stop(t); vc.car = null; }
    for (const g of [this.wind.g.gain, this.buffet.g.gain, this.squeal.g.gain, this.scrub.g.gain, this.roll.g.gain, this.gravel.g.gain, this.grass.g.gain, this.kerbG.gain, this.bumpG.g.gain, this.hiss.g.gain]) g.setTargetAtTime(0, t, 0.15);
    this.crowd.g.gain.setTargetAtTime(crowd, t, 0.4);
  }

  // short filtered noise burst on a bus
  burst(dur, freq, q, gain, bus = this.fxBus, at = 0) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(bus); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }
  // upshift: ~30 ms ignition cut, exhaust crack, a dull clunk through the chassis
  upshift() {
    if (!this.ctx || this.muted) return;
    this.eng.cut = 0.25;
    this.burst(0.05, 1500, 1.2, 0.22 * (1 - 0.4 * this.ego), this.engBus);
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.05);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.09 * (0.4 + 0.6 * this.ego), t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.09);
  }
  // downshift: the blip is in the rpm itself; add the crackle of unburnt fuel
  downshift() {
    if (!this.ctx || this.muted) return;
    for (let k = 0; k < 3; k++) if (Math.random() < 0.8) this.pop(0.6 + Math.random() * 0.5, 0.03 + k * 0.06 + Math.random() * 0.04);
  }
  pop(k = 1, at = 0) {
    if (!this.ctx || this.muted) return;
    this.burst(0.018 + Math.random() * 0.02, 700 + Math.random() * 900, 0.9, 0.16 * k * (1 - 0.35 * this.ego), this.engBus, at);
  }
  // kept for callers: the gear sound now comes from update() watching the gear
  shift() {}
  beep(freq = 880, dur = 0.25) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  // impact: a low thud plus scraping carbon, scaled by the impact
  crash(intensity) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, k = Math.min(1, intensity);
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + 0.32);
    this.burst(0.35 + k * 0.4, 900, 0.5, 0.35 * k);
    this.burst(0.5 + k * 0.5, 3200, 2.5, 0.12 * k, this.fxBus, 0.04); // carbon scraping / debris
  }
  // thunder: long low rumble, louder and sharper when the strike is close
  thunder(near = 0.5) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = b * 0.985 + (Math.random() * 2 - 1) * 0.15; const env = Math.min(1, i / (this.ctx.sampleRate * (0.05 + (1 - near) * 0.3))) * Math.pow(1 - i / len, 1.6); d[i] = b * env * (1 + 0.6 * Math.sin(i / 4000)); }
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160 + near * 500;
    const g = this.ctx.createGain(); g.gain.value = 0.9 * (0.4 + near * 0.6);
    src.connect(f); f.connect(g); g.connect(this.ambBus || this.fxBus); src.start(t);
  }
  // team radio: short band-passed static burst with a click
  radioClick() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, len = this.ctx.sampleRate * 0.18;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i < 300 ? 1 : 0.35) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.value = 0.18;
    src.connect(f); f.connect(g); g.connect(this.fxBus); src.start(t);
  }
  stop() { if (this.ctx) { this.ctx.close(); this.ctx = null; } }
}

// AI cars have no gearbox model: the gear that fits the speed (shift at 97 % of a gear's top, 8 gears, the
// player's ratios from physics.js: m/s at 12500 rpm) gives the rpm
const GEAR_TOP = [0, 82, 122, 158, 194, 230, 266, 302, 345].map((k) => k / 3.6);
function aiRpm(v) {
  let g = 1; while (g < 8 && v > GEAR_TOP[g] * 0.97) g++;
  return Math.max(4200, Math.min(12500, (v / GEAR_TOP[g]) * 12500));
}
