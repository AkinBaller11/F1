// Player vehicle dynamics + AI drivers
import { CAR, KERB_W, brakeDecel, driveAccel } from './track.js';
import { VEH, AXLE, SUSP, tyrePeak, sideCurve, MF_SLIDE, ALPHA_PEAK, downforce, dragForce, limits } from './vehicle.js';

export const GEAR_TOP = [0, 82, 122, 158, 194, 230, 266, 302, 345].map((k) => k / 3.6); // m/s at 12500 rpm
export const RPM_MAX = 12500, RPM_IDLE = 4000;

// surfaces: grip factor (dry / wet) and rolling resistance as a share of the wheel load (A = estimates):
// painted kerbs are slicker than asphalt, run-off tarmac carries no rubber, a gravel bed decelerates a car
// sinking into it by ~0.5 g, grass is slippery, more so in the wet
const SURF = {
  road: { mu: 1, wet: 1, crr: 0 },
  kerb: { mu: 0.95, wet: 0.8, crr: 0.01 },
  runoff: { mu: 0.85, wet: 0.85, crr: 0.005 },
  gravel: { mu: 0.4, wet: 0.4, crr: 0.5 },
  grass: { mu: 0.5, wet: 0.35, crr: 0.06 },
};
// road-wheel lock range: the angle for the tightest corner the car can take at this speed (L · a_lat / v²,
// from the same tyre model) plus 1.2 x the tyres' peak slip angle, capped at full lock (31°, hairpins).
// More lock than that only drives the front tyres past their peak, which digital (keyboard) input would do.
export const steerLock = (v) => {
  const va = Math.max(Math.abs(v), 1);
  return Math.min(0.55, (VEH.L * limits(1).lat(va)) / (va * va) + 1.2 * ALPHA_PEAK);
};
const SUB = 4; // internal sub-steps per call (the game already calls at 120 Hz -> 480 Hz for tyres and springs)

export class PlayerCar {
  constructor(track, opts) {
    this.track = track;
    this.opts = opts;
    this.x = 0; this.z = 0; this.yaw = 0;
    this.v = 0; this.yawRate = 0; this.slip = 0;
    this.steer = 0; this.throttle = 0; this.brake = 0;
    this.gear = 0; this.rpm = RPM_IDLE; this.shiftTimer = 0;
    this.ers = 1; this.ersMode = 'medium'; this.overtake = false;
    this.drsOpen = false; this.drsAvailable = false;
    this.surface = 'road'; this.offTrack = false; this.offTimer = 0;
    this.hint = -1; this.s = 0; this.lat = 0; this.dist = 0;
    this.impact = 0; this.bump = 0; this.wheelRot = 0; this.limiter = false;
    this.kx = 0; this.kz = 0; this.spin = 0; // legacy shove inputs (world m/s, rad/s), folded into the velocities
    // body-frame state: v forward speed, vy sideways speed (+ right), yawRate (+ right), relaxed slip angles,
    // roll / pitch of the sprung mass (+ = rolled to the left in a right-hander / nose down) and their rates
    this.vy = 0; this.aF = 0; this.aR = 0; this.ax = 0; this.ay = 0;
    this.roll = 0; this.rollV = 0; this.pitch = 0; this.pitchV = 0; this.heave = 0;
    this.load = [0, 0, 0, 0]; this.usage = [0, 0];
    // per-wheel grip from tyre temperature and wear (set by tyres.js each frame), and the energy this model
    // puts into each tyre (friction / rolling, J) and the front brakes since the last read
    this.tyreMu = [1, 1, 1, 1]; this.tyreE = [0, 0, 0, 0]; this.tyreR = [0, 0, 0, 0]; this.brakeE = 0;
    // tyres / damage / setup feed in as multipliers (set by the race each frame)
    this.tyre = 'M'; this.wear = 0; this.dmg = { L: 0, R: 0, rear: 0 };
    this.gripMul = 1; this.dragMul = 1; this.pull = 0;
    this.setup = { df: 1, cd: 1, bias: 0.56, diff: 0.5 };
    this.loc = {};
  }

  placeAt(s, lat) {
    const [x, z, yaw] = this.track.posAt(s, lat);
    this.x = x; this.z = z; this.yaw = yaw; this.v = 0;
    this.vy = 0; this.yawRate = 0; this.aF = this.aR = 0; this.roll = this.rollV = this.pitch = this.pitchV = 0;
    this.hint = -1;
    this.track.locate(x, z, -1, this.loc);
    this.hint = this.loc.i; this.s = this.loc.s; this.lat = this.loc.lat;
  }

  get speedKmh() { return Math.hypot(this.v, this.vy) * 3.6; }
  // world velocity (x, z) of the centre of gravity
  get wvx() { return -Math.sin(this.yaw) * this.v + Math.cos(this.yaw) * this.vy; }
  get wvz() { return -Math.cos(this.yaw) * this.v - Math.sin(this.yaw) * this.vy; }
  setWorldVel(vx, vz) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.v = vx * fx + vz * fz; this.vy = vx * Math.cos(this.yaw) - vz * Math.sin(this.yaw); // forward, right-hand axis
  }
  // contact impulse from another car: (ix, iz) velocity change at the contact point offset (rx, rz)
  applyImpulse(ix, iz, rx, rz) {
    this.setWorldVel(this.wvx + ix, this.wvz + iz);
    const cross = rx * iz - rz * ix; // >0 turns the car to the right
    this.yawRate += (cross * VEH.mass) / VEH.Iz;
  }

  update(dt, input, raceOn) {
    const tr = this.track;
    // --- surface
    const lat = this.lat, a = Math.abs(lat);
    const i = this.hint;
    const W = tr.hw[i]; // measured half width of the road here
    const kerb = lat > 0 ? tr.kerbR[i] : tr.kerbL[i];
    const gravel = lat > 0 ? tr.gravelR[i] : tr.gravelL[i];
    if (a < W) this.surface = 'road';
    else if (kerb && a < W + KERB_W) this.surface = 'kerb';
    else if (kerb && a < W + 4.5) this.surface = 'runoff';
    // the gravel trap is drawn from 4.5 m beyond the road edge (track.js buildMeshes): the strip in between is grass
    // on screen, so it is grass to drive on too
    else if (gravel && a >= W + 4.5) this.surface = 'gravel';
    else this.surface = 'grass';
    const SF = SURF[this.surface];
    const mu = tr.mu * this.gripMul * (tr.wet ? SF.wet : SF.mu);
    this.offTrack = a > W + KERB_W + 0.6;

    // --- inputs
    let thr = raceOn ? input.throttle : 0;
    let brk = input.brake;
    // steering smoothing (keyboard is digital -> ramp)
    let st = input.steer;
    // steering assist: pulls the car toward the racing line, strongest when the player isn't steering
    if (this.opts.steerAssist && this.v > 3) {
      const strong = this.opts.steerAssist === true;
      const ahead = this.s + Math.max(8, this.v * 0.45);
      const f = tr.frame(ahead), lat = tr.racingLat(ahead);
      const want = Math.atan2(-(f.x + f.rx * lat - this.x), -(f.z + f.rz * lat - this.z));
      let err = want - this.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
      const auto = Math.max(-1, Math.min(1, -err * 12));
      // strong: drives itself when hands-off; light: gentle pull toward the line, player stays in charge
      const k = strong ? (st === 0 ? 1 : 0.35) : (st === 0 ? 0.35 : 0.14);
      st = Math.max(-1, Math.min(1, st + (auto - st) * k));
      this.assistErr = Math.abs(err);
      this.assistAnalog = true;
    }
    // the assist's own corrections may move the wheel quickly, but a held key or touch button stays digital:
    // it keeps the slip-angle cap and the ramp below (before, the assist switched both off, so a held key
    // snapped to full lock at any speed and the car slid wide or spun)
    const analog = !!input.analog, assistOnly = this.assistAnalog && input.steer === 0;
    this.assistAnalog = false;
    // keys are all-or-nothing: a held key may steer as far as the current rotation needs (r L / v) plus the
    // tyres' peak slip angle, never beyond that peak where more lock only loses side force. Analog input
    // (pad, wheel) keeps the full range.
    if (!input.analog && Math.abs(this.v) > 8) {
      const lock = steerLock(this.v), cap = (Math.abs(this.yawRate) * VEH.L) / Math.abs(this.v) + ALPHA_PEAK;
      const c = Math.min(1, cap / lock);
      st = Math.max(-c, Math.min(c, st));
    }
    // keyboard: quick at low speed, calmer at high speed so lines stay clean
    const vk = Math.abs(this.v);
    const rate = analog ? 12 : assistOnly ? 6 : (Math.sign(st) !== Math.sign(this.steer) && st !== 0 ? 6 : 2.2 + 2.2 / (1 + vk / 25));
    const ret = analog ? 12 : 3.6 + 1.6 / (1 + vk / 30);
    if (st === 0) this.steer -= Math.sign(this.steer) * Math.min(Math.abs(this.steer), ret * dt);
    else this.steer += Math.max(-rate * dt, Math.min(rate * dt, st - this.steer));

    // braking assist
    if (this.opts.brakeAssist && raceOn) {
      const safe = this.opts.steerAssist === true ? 0.92 : this.opts.steerAssist ? 0.97 : 1; // assisted modes keep a margin to the limit
      const ahead = safe * Math.sqrt(this.gripMul) * Math.min(tr.targetSpeed(this.s + Math.max(this.v, 5) * 0.2), tr.targetSpeed(this.s + Math.max(this.v, 5) * 0.5) * 1.04);
      if (this.v > ahead + 0.5) { const ab = Math.min(this.opts.abs === false ? 0.85 : 1, (this.v - ahead) / 4); if (ab > brk) { thr *= Math.max(0, 1 - ab * 3); brk = ab; } } // the assist lifts off while it brakes
    }
    let thrEff = thr;
    if (this.opts.steerAssist === true && this.assistErr > 0.06) thrEff = thr * Math.max(0.2, 1 - (this.assistErr - 0.06) * 6);
    this.assistErr = 0;
    this.throttle = thrEff; this.brake = brk;

    // --- ERS / DRS
    let power = CAR.power * (this.powerMul ?? 1);
    this.overtake = (!!input.overtake || (this.opts.autoErs && this.ersAuto)) && this.ers > 0.01 && thr > 0.5;
    if (this.overtake) { power += CAR.ersPower; this.ers -= dt / 22; }
    else if (thr > 0.95 && this.v > 30 && this.ers > 0.02) { power += CAR.ersPower * 0.45; this.ers -= dt / 90; }
    this.ers += (brk * 0.03 + (thr < 0.05 ? 0.004 : 0)) * dt;
    this.ers = Math.max(0, Math.min(1, this.ers));
    if (brk > 0.1) this.drsOpen = false;
    if ((input.drs || (this.opts.autoDrs && thr > 0.9 && brk < 0.05 && Math.abs(this.steer) < 0.35)) && this.drsAvailable && !this.drsOpen) this.drsOpen = true;
    if (!this.drsAvailable && this.drsOpen && brk > 0) this.drsOpen = false;
    const cdA = (this.drsOpen ? CAR.drsCdA : CAR.cdA) * this.dragMul * this.setup.cd;

    // --- gearbox
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const v = Math.max(0, this.v);
    if (this.gear < 1 && raceOn && thr > 0.05) this.gear = 1;
    if (this.opts.manual) {
      if (input.shiftUp && this.gear < 8) { this.gear++; this.shiftTimer = 0.06; this.onShift && this.onShift(); }
      if (input.shiftDown && this.gear > 1) {
        if (v < GEAR_TOP[this.gear - 1] * 0.98) { this.gear--; this.shiftTimer = 0.06; this.onShift && this.onShift(); }
      }
    } else if (this.gear >= 1) {
      if (this.rpm > 12150 && this.gear < 8) { this.gear++; this.shiftTimer = 0.05; this.onShift && this.onShift(); }
      else if (this.gear > 1 && v < GEAR_TOP[this.gear - 1] * 0.62) { this.gear--; this.onShift && this.onShift(true); }
    }
    const gTop = this.gear >= 1 ? GEAR_TOP[this.gear] : 1;
    const targetRpm = this.gear >= 1 ? Math.max(RPM_IDLE + (raceOn ? 0 : thr * 6000), (v / gTop) * RPM_MAX) : RPM_IDLE + input.throttle * 7500;
    this.rpm += (Math.min(RPM_MAX + 150, targetRpm) - this.rpm) * Math.min(1, dt * 18);
    this.limiter = this.gear >= 1 && v >= gTop * 0.995;

    // --- drive and brake demands
    const S = this.setup, u0 = this.v;
    // engine: power-limited force at the rear wheels; a manual driver lugging a tall gear loses pull
    let drive = (power / Math.max(Math.abs(u0), 1)) * (this.launchMul ?? 1);
    if (this.opts.manual && this.gear >= 2) drive *= Math.max(0.45, Math.min(1, (this.rpm - 3000) / 6000));
    if (this.limiter || this.shiftTimer > 0 || this.gear < 1) drive = 0;
    drive *= this.throttle;
    const brakeF = brk * VEH.brakeMax * (this.brakeMul ?? 1); // pedal -> total brake force, brake temperature
    const engBrake = thr < 0.05 && u0 > 1 ? VEH.engineBrake : 0;
    const reverse = u0 <= 0.3 && brk > 0.5 && thr < 0.05;
    const dfMul = S.df, aeroFront = VEH.aeroFront + (S.bal || 0); // wing balance moves the centre of pressure
    const lock = S.diff, tc = this.opts.tc || 'full', abs = this.opts.abs !== false;
    const esc = tc === 'full';
    // road shape: slope along the car's heading, vertical curvature (crest < 0: the car goes light, dip > 0)
    const ti = this.hint >= 0 ? this.hint : 0;
    const along = -Math.sin(this.yaw) * tr.tx[ti] - Math.cos(this.yaw) * tr.tz[ti];
    const grade = tr.hs ? tr.gradeAt(this.s) * along : 0;
    const curvV = tr.vCurvAt ? tr.vCurvAt(this.s) : 0;
    // steering: road-wheel angle; full lock at walking pace, a narrow range at speed (input mapping, not physics)
    const delta = this.steer * steerLock(u0);
    const cosD = Math.cos(delta), sinD = Math.sin(delta);
    const m = VEH.mass, a_ = AXLE.a, b_ = AXLE.b, L = VEH.L;
    const pullK = this.pull ? this.pull / 0.035 : 0; // bent wing: extra drag on one side of the nose

    const hs = dt / SUB;
    let spin = 0, lockF = 0, lockR = 0, usF = 0, usR = 0;
    for (let k = 0; k < SUB; k++) {
      const u = this.v, w = this.vy, r = this.yawRate, au = Math.abs(u);
      // ---- wheel loads: weight (+ road curvature), downforce, load transfer through the springs
      const Fdf = Math.max(0, downforce(au, dfMul, this.drsOpen));
      const Fm = Math.max(0, m * (VEH.g + u * u * curvV));
      const dLong = (SUSP.Kp * this.pitch + SUSP.Cp * this.pitchV) / L;
      const Mroll = SUSP.Kr * this.roll + SUSP.Cr * this.rollV;
      const dF = (VEH.rollFront * Mroll) / VEH.tF, dR = ((1 - VEH.rollFront) * Mroll) / VEH.tR;
      const fo = (Fm * b_ / L + Fdf * aeroFront + dLong) / 2, ro = (Fm * a_ / L + Fdf * (1 - aeroFront) - dLong) / 2;
      const FL = Math.max(0, fo + dF), FR = Math.max(0, fo - dF), RL = Math.max(0, ro + dR), RR = Math.max(0, ro - dR);
      this.load[0] = FL; this.load[1] = FR; this.load[2] = RL; this.load[3] = RR;
      const tm = this.tyreMu;
      const pFL = tyrePeak(FL, mu * tm[0]), pFR = tyrePeak(FR, mu * tm[1]), pRL = tyrePeak(RL, mu * tm[2]), pRR = tyrePeak(RR, mu * tm[3]);
      const capF = pFL + pFR;
      const capR = pRL + pRR, capRd = (1 - lock) * 2 * Math.min(pRL, pRR) + lock * capR;

      // ---- slip angles with tyre relaxation (side force needs ~half a metre of rolling to build up)
      const vfx = u * cosD + (w + a_ * r) * sinD, vfy = -u * sinD + (w + a_ * r) * cosD; // front wheel frame
      const vrx = u, vry = w - b_ * r;
      const relax = 1 - Math.exp(-Math.max(au, 1) * hs / VEH.relax);
      this.aF += (Math.atan2(vfy, Math.max(Math.abs(vfx), 0.5)) - this.aF) * relax;
      this.aR += (Math.atan2(vry, Math.max(Math.abs(vrx), 0.5)) - this.aR) * relax;

      // ---- side force each axle would make at its slip angle (Magic-Formula curve, load-sensitive μ)
      const FyFp = -capF * sideCurve(this.aF), FyRp = -capR * sideCurve(this.aR);
      // ---- longitudinal tyre forces per axle (wheel frame, + forward)
      const dir = Math.sign(u) || 0;
      let FxF = -dir * S.bias * brakeF;
      // brake-by-wire: the MGU-K harvest / engine drag is part of the rear's share, not on top of it
      let FxR = reverse ? -3 * m : drive - dir * Math.max((1 - S.bias) * brakeF, engBrake); // reverse gear: gentle 3 m/s²
      // driver aids: ABS / full TC hold each axle's longitudinal force inside what the friction circle leaves
      // after the side force the corner needs, so the car stays steerable; without them an axle that is asked
      // for more than its grip locks (brakes) or spins up (drive)
      const room = (cap, fy) => Math.sqrt(Math.max(0, cap * cap - fy * fy));
      lockF = 0; lockR = 0; spin = 0;
      if (abs) { const l = room(capF, FyFp); if (-FxF * dir > l) FxF = -dir * l; } else if (Math.abs(FxF) > capF) lockF = 1;
      if (FxR < 0 && !reverse) { if (abs) { const l = room(capR, FyRp); if (-FxR > l) FxR = -l; } else if (-FxR > capR) lockR = 1; }
      if (FxR > 0) {
        const l = tc === 'full' ? Math.min(capRd, room(capR, FyRp)) : capRd;
        if (FxR > l) {
          if (tc === 'full') FxR = l;
          else { spin = Math.min(1, (FxR / l - 1) * (tc === 'off' ? 1.5 : 0.5)); FxR = l * (1 - (1 - MF_SLIDE) * spin); } // rears spin up
        }
      }
      // ---- side forces: the slip-angle force, capped by the friction circle left after Fx;
      // a locked axle slides: its whole (sliding) force points against its own velocity
      if (esc && FxR > 0) {
        const over = Math.abs(this.aR) / ALPHA_PEAK; // rears past their peak: power oversteer
        if (over > 1.1) FxR *= Math.max(0.15, 1 - (over - 1.1) * 2.5);
      }
      const clampC = (fy, cap, fx) => { const l = room(cap, fx); return Math.max(-l, Math.min(l, fy)); };
      let FyF, FyR;
      if (lockF) { const vv = Math.hypot(vfx, vfy) || 1; FxF = -MF_SLIDE * capF * vfx / vv; FyF = -MF_SLIDE * capF * vfy / vv; }
      else FyF = clampC(FyFp, capF, FxF);
      if (lockR) { const vv = Math.hypot(vrx, vry) || 1; FxR = -MF_SLIDE * capR * vrx / vv; FyR = -MF_SLIDE * capR * vry / vv; }
      else FyR = clampC(FyRp, capR, FxR);
      usF = Math.hypot(FxF, FyF) / Math.max(capF, 1); usR = Math.hypot(FxR, FyR) / Math.max(capR, 1);
      // ---- energy into the tyres: force x sliding speed (lateral: the wheel's sideways speed; longitudinal:
      // slip ratio from the slip stiffness ~25 x load, the full speed when locked, more when spinning up),
      // split between the two wheels of an axle by their grip; rolling hysteresis crr·Fz·v; brake power
      const kF = lockF ? 1 : Math.min(0.15, Math.abs(FxF) / Math.max(25 * (FL + FR), 1));
      const kR = lockR ? 1 : Math.min(0.3, Math.abs(FxR) / Math.max(25 * (RL + RR), 1) + spin * 0.25);
      const PF = (Math.abs(FyF) * Math.abs(vfy) + Math.abs(FxF) * kF * Math.abs(vfx)) * hs;
      const PR = (Math.abs(FyR) * Math.abs(vry) + Math.abs(FxR) * kR * au) * hs;
      const E = this.tyreE, Rr = this.tyreR, rr = VEH.crr * au * hs;
      E[0] += PF * pFL / Math.max(capF, 1); E[1] += PF * pFR / Math.max(capF, 1);
      E[2] += PR * pRL / Math.max(capR, 1); E[3] += PR * pRR / Math.max(capR, 1);
      Rr[0] += rr * FL; Rr[1] += rr * FR; Rr[2] += rr * RL; Rr[3] += rr * RR;
      if (FxF * dir < 0 && !lockF) this.brakeE += -FxF * dir * au * hs;

      // ---- body forces and yaw moment
      let Fx = FxF * cosD - FyF * sinD + FxR;
      const Fy = FxF * sinD + FyF * cosD + FyR;
      let Mz = a_ * (FxF * sinD + FyF * cosD) - b_ * FyR;
      // limited-slip diff: equal rear wheel speeds through a turn push the inner wheel ahead -> yaw moment
      // against the rotation (longitudinal slip stiffness ~25 x load); bounded by the drive it locks
      if (lock > 0 && FxR > 0 && au > 3) {
        const dFx = Math.min(lock * FxR, (lock * 25 * (RL + RR) * Math.abs(r) * VEH.tR) / au);
        Mz -= Math.sign(r) * dFx * VEH.tR / 2;
      }
      if (pullK) Mz += pullK * 0.15 * dragForce(au, cdA) * VEH.tF / 2;
      // stability aid (with full traction control, i.e. the Normal / Easy assists; Pro drives without it): like an
      // ESC it brakes single wheels when the car rotates faster than the steering asks for (the rear stepping
      // out) and takes drive away while the rears slide past their grip peak
      if (esc && au > 6) {
        const rMax = (capF + capR) / (m * au);
        const rRef = Math.max(-rMax, Math.min(rMax, (u * Math.tan(delta)) / L));
        const e = r - rRef;
        if (Math.abs(r) > Math.abs(rRef) + 0.015 || Math.sign(r) !== Math.sign(rRef)) {
          const Mmax = 0.35 * (capF * VEH.tF + capR * VEH.tR) / 2;
          const Mc = Math.max(-Mmax, Math.min(Mmax, (-VEH.Iz * e) / 0.12));
          Mz += Mc;
          Fx -= dir * Math.abs(Mc) / (VEH.tF / 2) * 0.5; // the braked wheel slows the car a little
        }
      }
      const res = dragForce(u, cdA) + dir * (VEH.crr + SF.crr) * (Fm + Fdf);
      Fx -= res + m * 9.81 * grade;

      // ---- integrate (body frame: u' = Fx/m + w r, w' = Fy/m - u r, r' = Mz/Iz)
      this.ax = Fx / m; this.ay = Fy / m;
      let nu = u + (this.ax + w * r) * hs, nw = w + (this.ay - u * r) * hs, nr = r + (Mz / VEH.Iz) * hs;
      // brakes and rolling resistance stop the car, they don't push it backwards
      if (!reverse && drive <= 0 && Math.sign(nu) !== Math.sign(u) && u !== 0) nu = 0;
      if (reverse) nu = Math.max(-6, nu);
      // walking pace: the tyre model degenerates (slip angles of a nearly stopped car); blend into
      // rolling-without-slip kinematics below ~4 m/s
      const kin = Math.min(1, Math.max(0, (Math.abs(nu) - 1.5) / 2.5));
      if (kin < 1) {
        const rk = (nu * Math.tan(delta)) / L;
        nr = nr * kin + rk * (1 - kin); nw = nw * kin + rk * b_ * (1 - kin);
      }
      this.v = nu; this.vy = nw; this.yawRate = nr;
      // ---- sprung mass: roll and pitch springs/dampers driven by the inertial moments
      this.rollV += ((m * this.ay * VEH.h - SUSP.Kr * this.roll - SUSP.Cr * this.rollV) / VEH.Ix) * hs;
      this.roll += this.rollV * hs;
      this.pitchV += ((-m * this.ax * VEH.h - SUSP.Kp * this.pitch - SUSP.Cp * this.pitchV) / VEH.Iy) * hs;
      this.pitch += this.pitchV * hs;
      this.heave = -(Fdf + m * u * u * curvV) / VEH.heaveK;
      // ---- position
      this.yaw -= nr * hs;
      this.x += (-Math.sin(this.yaw) * nu + Math.cos(this.yaw) * nw) * hs;
      this.z += (-Math.cos(this.yaw) * nu - Math.sin(this.yaw) * nw) * hs;
    }
    if (Math.abs(this.v) < 0.05 && Math.abs(this.vy) < 0.05 && thr < 0.05 && brk < 0.05) { this.v = 0; this.vy = 0; }
    this.wheelspin = spin;
    this.lockup = Math.max(lockF, lockR);
    this.usage[0] = usF; this.usage[1] = usR;
    // sliding indicator (tyre heat, wear, sound): how far past the grip peak the tyres run
    const over = Math.max(Math.abs(this.aF), Math.abs(this.aR)) / ALPHA_PEAK;
    this.slip = Math.min(1, Math.max(0, over - 1) * 1.5 + this.lockup * 0.6 + spin * 0.5);
    // legacy contact inputs (world shove / yaw kick) go straight into the velocities
    if (this.kx || this.kz || this.spin) {
      this.setWorldVel(this.wvx + this.kx, this.wvz + this.kz); this.yawRate += this.spin;
      this.kx = this.kz = this.spin = 0;
    }

    // --- track position & barriers
    const prevS = this.s;
    tr.locate(this.x, this.z, this.hint, this.loc);
    this.hint = this.loc.i; this.s = this.loc.s; this.lat = this.loc.lat;
    let d = this.s - prevS;
    if (d > tr.length / 2) d -= tr.length; if (d < -tr.length / 2) d += tr.length;
    this.dist += d;
    const limR = tr.limR[this.hint] - 1.1, limL = tr.limL[this.hint] - 1.1;
    if (this.lat > limR || this.lat < -limL) {
      const side = this.lat > 0 ? 1 : -1;
      const lim = side > 0 ? limR : limL;
      const pen = Math.abs(this.lat) - lim;
      const f = tr.frame(this.s);
      this.x -= f.rx * side * pen; this.z -= f.rz * side * pen;
      this.lat = side * lim;
      this.wallImpact(f.rx * side, f.rz * side);
    }
    this.bump = this.surface === 'kerb' ? 1 : this.surface === 'gravel' || this.surface === 'grass' ? 0.6 : 0;
    this.impact *= Math.exp(-dt * 3);
    this.wheelRot += (this.v * dt) / CAR.tyreR;
  }

  // rigid-body impulse against a barrier with outward normal n (pointing into the wall): the corner of the
  // car that touches it takes the hit, so a glancing nose contact turns the car (restitution 0.15 and wall
  // friction 0.3 are estimates for tyre barriers / Armco)
  wallImpact(nx, nz) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), Rx = Math.cos(this.yaw), Rz = -Math.sin(this.yaw);
    let best = -1e9, P = 0, Q = 0;
    for (const p of [2.6, -2.6]) for (const q of [0.95, -0.95]) {
      const d = (p * fx + q * Rx) * nx + (p * fz + q * Rz) * nz;
      if (d > best) { best = d; P = p; Q = q; }
    }
    // velocity of that corner: V + r (P R - Q f)
    const r = this.yawRate, lx = P * Rx - Q * fx, lz = P * Rz - Q * fz;
    let vx = this.wvx + r * lx, vz = this.wvz + r * lz;
    const vn = vx * nx + vz * nz;
    if (vn <= 0) return;
    const m = VEH.mass, I = VEH.Iz, e = 0.15, muW = 0.3;
    const levN = lx * nx + lz * nz, J = (-(1 + e) * vn) / (1 / m + (levN * levN) / I);
    let Vx = this.wvx + (J * nx) / m, Vz = this.wvz + (J * nz) / m, nr = r + (J * levN) / I;
    // friction along the wall
    const tx = -nz, tz = nx, levT = lx * tx + lz * tz;
    vx = Vx + nr * lx; vz = Vz + nr * lz;
    const vt = vx * tx + vz * tz;
    const Jt = Math.max(-muW * Math.abs(J), Math.min(muW * Math.abs(J), -vt / (1 / m + (levT * levT) / I)));
    Vx += (Jt * tx) / m; Vz += (Jt * tz) / m; nr += (Jt * levT) / I;
    this.setWorldVel(Vx, Vz); this.yawRate = nr;
    if (vn > 2) { this.impact = Math.min(1, vn / 30); this.wallHit = Math.max(this.wallHit || 0, vn); this.wallSide = nx * Rx + nz * Rz > 0 ? 1 : -1; }
  }
}

// --------------------------------------------------------------------- AI
export class AICar {
  constructor(track, team, driver, number, skill) {
    this.track = track; this.team = team; this.name = driver; this.number = number;
    this.skill = skill;
    this.dist = 0; this.v = 0; this.latOff = 0; this.lat = 0;
    this.reaction = 0.15 + Math.random() * 0.35;
    this.laneTimer = 0; this.wheelRot = 0; this.yaw = 0; this.x = 0; this.z = 0;
    this.wobble = Math.random() * 100;
    this.launch = 0.86 + Math.random() * 0.18; // good or bad getaway
    this.knock = 0; this.spinRate = 0; this.spinYaw = 0; this.spunT = 0; // contact response
    this.tyre = 'M'; this.wear = 0; this.dmg = { L: 0, R: 0, rear: 0 }; this.gripMul = 1; this.pitCtl = null; this.stops = 0;
    // racecraft (set from the driver rating): aggression in attack / defence, consistency (fewer mistakes)
    this.agg = 0.5; this.cons = 0.95;
    this.defT = 0; this.blueT = 0; this.mistakeT = 0; this.mistakeCheck = 1 + Math.random(); this.drsOn = false; this.drsChk = false;
  }
  get s() { return this.track.wrapS(this.dist + this.track.startS); }

  update(dt, raceTime, cars, wetMu) {
    const tr = this.track;
    const HW = tr.hwAt(this.s); // half road width here (measured circuits vary along the lap)
    if (raceTime < this.reaction) { this.computePose(dt); return; }
    // spun: slide and scrub to a stop, then the driver turns the car round and rejoins
    if (this.spunT > 0) {
      this.spunT -= dt;
      this.spinYaw += this.spinRate * dt;
      this.spinRate *= Math.exp(-dt * 1.7);
      this.v = Math.max(0, this.v - (6 + this.v * 0.35) * dt);
      this.dist += this.v * dt;
      this.lat += this.knock * dt; this.knock *= Math.exp(-dt * 2.2);
      this.lat = Math.max(-HW - 2.5, Math.min(HW + 2.5, this.lat));
      this.latOff = this.lat - this.track.racingLat(this.s);
      this.wheelRot += (this.v * dt) / CAR.tyreR;
      if (this.v < 1 && Math.abs(this.spinRate) < 0.5) { this.spunT = 0; this.spinRate = 0; this.recover = true; }
      this.computePose(dt);
      return;
    }
    if (this.recover) {
      // pointing the wrong way: creep and turn back to the racing direction
      let d = Math.atan2(Math.sin(this.spinYaw), Math.cos(this.spinYaw));
      d -= Math.sign(d) * Math.min(Math.abs(d), dt * 1.3);
      this.spinYaw = d;
      this.v = Math.min(this.v + dt * 2, 2.5);
      this.dist += this.v * dt;
      this.latOff *= Math.exp(-dt * 0.4);
      this.lat += (Math.max(-HW + Math.min(1, tr.lineMargin), Math.min(HW - Math.min(1, tr.lineMargin), this.track.racingLat(this.s) + this.latOff)) - this.lat) * Math.min(1, dt * 0.8);
      this.wheelRot += (this.v * dt) / CAR.tyreR;
      if (Math.abs(d) < 0.08) { this.spinYaw = 0; this.recover = false; }
      this.computePose(dt);
      return;
    }
    // small wobbles from light contact settle quickly
    if (this.spinRate) {
      this.spinYaw += this.spinRate * dt;
      this.spinRate *= Math.exp(-dt * 6);
      if (Math.abs(this.spinRate) < 0.05) this.spinRate = 0;
    }
    if (this.spinYaw && !this.spinRate) {
      let d = Math.atan2(Math.sin(this.spinYaw), Math.cos(this.spinYaw));
      d -= Math.sign(d) * Math.min(Math.abs(d), dt * 2.5);
      this.spinYaw = Math.abs(d) < 0.01 ? 0 : d;
    }
    const s = this.s, L = tr.length;
    const look = Math.max(this.v, 10) * 0.12;
    let target = tr.targetSpeed(s + look) * this.skill * Math.sqrt(this.gripMul) * (this.paceMul || 1);
    if (!tr._vTop) { let m = 0; for (const x of tr.vProf) m = Math.max(m, x); tr._vTop = m; }
    const vTop = tr._vTop;
    const onStraight = tr.targetSpeed(s + 20) > 0.82 * vTop;
    const brakeAhead = onStraight && tr.targetSpeed(s + 150) < 0.65 * vTop; // heavy braking zone coming up
    // traffic awareness: car ahead in our lane, nearest car behind, a leader coming through to lap us
    let blocked = null, blockGap = 1e9, aheadAny = 1e9, behind = null, behindGap = 1e9, lapper = null;
    for (const c of cars) {
      if (c === this || c.gone) continue;
      const raw = c.dist - this.dist;
      let ds = raw;
      if (ds < -L / 2) ds += L; // lapping
      if (ds > L / 2) ds -= L;
      if (ds < 0 && ds > -40) {
        if (-ds < behindGap) { behind = c; behindGap = -ds; }
        if (raw > L / 2 && ds > -35 && !c.pitCtl && !c.isSC) lapper = c; // a lap ahead of us and right behind: blue flag
      }
      if (ds <= 0 || ds > 60) continue;
      if (ds < aheadAny) aheadAny = ds;
      // a car half a lane over still counts: in braking zones the lines converge (a stopped car only blocks its own width);
      // also a car sitting where our line will take us
      const dl = Math.min(Math.abs(c.lat - this.lat), Math.abs(c.lat - (tr.racingLat(s + ds) + this.latOff)));
      if (dl < (c.v < 5 ? 2.4 : 3.4) && ds < blockGap) { blocked = c; blockGap = ds; }
    }
    // blue flag: move off the line and lift a little to let the leader through
    if (lapper && !blocked) this.blueT = 1.6;
    if (this.blueT > 0) {
      this.blueT -= dt;
      const side = lapper ? -Math.sign(lapper.lat - this.lat || tr.racingLat(s) || 1) : Math.sign(this.lat || 1);
      this.latOff = side * (HW - 1.4) - tr.racingLat(s);
      this.laneTimer = Math.max(this.laneTimer, 0.5);
      target *= 0.97;
    }
    // defending: one move to cover the inside before a braking zone, never across a car alongside
    this.defT -= dt;
    if (behind && !lapper && this.blueT <= 0 && brakeAhead && this.defT <= 0 && behindGap > 4.5 && behindGap < 16 && behind.v > this.v - 0.5 && this.laneTimer <= 0) {
      this.defT = 9;
      if (Math.random() < 0.35 + this.agg * 0.6) {
        const dir = Math.sign(behind.lat - this.lat) || -Math.sign(tr.racingLat(s + 150)) || 1;
        const nl = Math.max(-HW + 1.2, Math.min(HW - 1.2, this.lat + dir * 2.4));
        this.latOff = nl - tr.racingLat(s);
        this.laneTimer = 2.2;
      }
    }
    // DRS: within a second of the car ahead at the start of a zone (dry, from lap 2)
    const inDrs = tr.drsZones && tr.drsZones.some(([a, b]) => (a < b ? s > a && s < b : s > a || s < b));
    if (inDrs && !tr.wet && this.dist > L) {
      if (!this.drsChk) { this.drsChk = true; this.drsOn = aheadAny / Math.max(this.v, 10) < 1; }
    } else { this.drsChk = false; this.drsOn = false; }
    if (this.drsOn) target *= 1.035;
    // the odd mistake: lock-up into a corner, runs wide and loses time
    this.mistakeCheck -= dt;
    if (this.mistakeCheck <= 0) {
      this.mistakeCheck = 1;
      if (brakeAhead && this.mistakeT <= 0 && Math.random() < (1 - this.cons) * 0.05) this.mistakeT = 2.2;
    }
    if (this.mistakeT > 0) {
      this.mistakeT -= dt;
      if (!onStraight) {
        target *= 0.9;
        if (this.laneTimer <= 0) { this.latOff -= Math.sign(tr.racingLat(s + 30) || 1) * dt * 2.5; this.laneTimer = 0.2; }
      }
    }
    if (blocked) {
      const closing = this.v - blocked.v;
      // pass on a straight / into a braking zone, or when clearly faster; in corners sit behind
      const goFor = (onStraight && closing > 0.9 - this.agg) || closing > 3.5 - this.agg || blocked.v < Math.min(10, target * 0.5); // always go round a stopped / crawling car
      const crawling = blocked.v < Math.min(10, target * 0.5);
      if (goFor && this.laneTimer <= 0 && (!this.noPass || crawling) && this.blueT <= 0) { // under yellow only past the stopped car
        // try to pass on the side with more room
        const room = (dir) => {
          const nl = blocked.lat + dir * 3.0;
          if (Math.abs(nl) > HW - 1) return -1;
          for (const c of cars) {
            if (c === this || c === blocked) continue;
            let ds = c.dist - this.dist; if (ds < -tr.length / 2) ds += tr.length;
            if (Math.abs(ds) < 8 && Math.abs(c.lat - nl) < 2.2) return -1;
          }
          return HW - Math.abs(nl);
        };
        const rl = room(-1), rr = room(1);
        if (rl > 0 || rr > 0) {
          const nl = blocked.lat + (rr >= rl ? 3.0 : -3.0);
          this.latOff = nl - tr.racingLat(s);
          this.laneTimer = 2.5;
        }
      }
      // otherwise follow: never faster than what still lets us stop 7 m behind it (predictive gap)
      if (Math.min(Math.abs(blocked.lat - this.lat), Math.abs(blocked.lat - (tr.racingLat(s + blockGap) + this.latOff))) < (blocked.v < 5 ? 2.4 : 3.4)) {
        const safe = Math.sqrt(Math.max(0, blocked.v * blocked.v + 2 * 22 * (blockGap - 7)));
        target = Math.min(target, safe);
        if (blockGap < 9) target = Math.min(target, blocked.v - (9 - blockGap) * 0.6);
      }
      // slipstream on the straights, dirty air (less grip) through the corners
      if (onStraight && blockGap < 30) target *= 1.012 + (blockGap < 40 ? this.agg * 0.004 : 0);
      else if (!onStraight && blockGap < 22) target *= 0.988;
    }
    if (this.scCap !== undefined) target = Math.min(target, this.scCap); // safety car / VSC / yellow flag
    if (this.backOff !== undefined) { target = Math.min(target, this.backOff); this.backOff = undefined; } // squeezed alongside: lift
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) this.latOff *= Math.exp(-dt * 0.6);

    // same car limits as the player's model: rear traction / power net of drag, braking with ABS; the speed
    // profile already accounts for the slope, so gravity acts here in full
    const acc = Math.max(0.5, driveAccel(this.v, CAR.power, CAR.cdA, wetMu) * (raceTime < 4 ? this.launch : 1));
    if (this.v < target) this.v = Math.min(target, this.v + acc * dt);
    else this.v = Math.max(target, this.v - brakeDecel(this.v, wetMu) * dt);
    if (tr.hs && this.v > 3) this.v -= 9.81 * tr.gradeAt(s) * dt;
    this.v = Math.max(0, this.v);
    this.dist += this.v * dt;

    let wantLat = Math.max(-HW + Math.min(1, tr.lineMargin), Math.min(HW - Math.min(1, tr.lineMargin), tr.racingLat(this.s) + this.latOff));
    // side awareness: never steer into a car alongside, ease away if it is close
    for (const c of cars) {
      if (c === this || c.gone) continue;
      let ds = c.dist - this.dist;
      if (ds > tr.length / 2) ds -= tr.length; if (ds < -tr.length / 2) ds += tr.length;
      // alongside, or just behind and faster: don't move across its path
      if (ds > 6.5 || ds < -16 || (ds < -6.5 && c.v < this.v + 1)) continue;
      const dl = c.lat - this.lat;
      if (Math.abs(dl) > 3.2) continue;
      if (Math.sign(wantLat - this.lat) === Math.sign(dl)) wantLat = this.lat; // hold the line
      if (Math.abs(dl) < 2.3) {
        wantLat = this.lat - Math.sign(dl || 1) * (2.4 - Math.abs(dl));
        // no room to ease away (track edge) and the other car is a little ahead: lift and tuck in behind
        if (ds > 0 && Math.abs(wantLat) > HW - 1.2) this.backOff = Math.min(this.backOff ?? 1e9, c.v - 1.5);
      }
    }
    wantLat = Math.max(-HW + Math.min(0.8, tr.lineMargin), Math.min(HW - Math.min(0.8, tr.lineMargin), wantLat));
    const maxMove = (1.2 + this.v * 0.04) * dt;
    this.lat += Math.max(-maxMove, Math.min(maxMove, wantLat - this.lat));
    if (this.knock) {
      this.lat += this.knock * dt; this.knock *= Math.exp(-dt * 3);
      if (Math.abs(this.knock) < 0.05) this.knock = 0;
      this.lat = Math.max(-HW - 2.5, Math.min(HW + 2.5, this.lat));
      this.latOff = this.lat - tr.racingLat(this.s); // rejoin from where the shove left it
    }
    this.wheelRot += (this.v * dt) / CAR.tyreR;
    this.computePose(dt);
  }

  computePose(dt = 1 / 60) {
    const tr = this.track;
    const s = this.s;
    const f = tr.frame(s);
    const look = 4 + this.v * 0.08;
    const fa = tr.frame(s + look);
    const la = tr.racingLat(s + look) + this.latOff;
    const x2 = fa.x + fa.rx * la, z2 = fa.z + fa.rz * la;
    const px = this.x, pz = this.z;
    this.x = f.x + f.rx * this.lat; this.z = f.z + f.rz * this.lat;
    // the car points where it travels: its actual movement this frame (aiming at the look-ahead point turned
    // the nose into every corner, up to ~15° in hairpins, so AI cars looked as if they were drifting);
    // standing it keeps its heading; after a jump in position (pit, reset) it takes the look-ahead direction
    const mx = this.x - px, mz = this.z - pz, md = Math.hypot(mx, mz);
    const moved = md > 0.02 && md < 8;
    const yawT = this.yawInit && moved ? Math.atan2(-mx, -mz) : Math.atan2(-(x2 - this.x), -(z2 - this.z));
    if (this.yawInit && md <= 0.02) { /* not moved since the last call (stopped, or a second call this frame): keep the heading */ }
    else if (this.yawInit && moved) { let d = yawT - this.yawB; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yawB += d * Math.min(1, dt * 20); }
    else { this.yawB = yawT; this.yawInit = true; }
    this.yaw = this.yawB + this.spinYaw;
    const steerT = Math.max(-0.4, Math.min(0.4, tr.k[tr.idx(s + 5)] * 12));
    this.steerVis = (this.steerVis || 0) + (steerT - (this.steerVis || 0)) * Math.min(1, dt * 8);
  }
}
