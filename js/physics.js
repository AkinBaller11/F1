// Player vehicle dynamics + AI drivers
import { CAR, HALF_W, KERB_W, lateralGrip, brakeDecel } from './track.js';

export const GEAR_TOP = [0, 82, 122, 158, 194, 230, 266, 302, 345].map((k) => k / 3.6); // m/s at 12500 rpm
export const RPM_MAX = 12500, RPM_IDLE = 4000;

const DRAG = (v, cdA) => (0.5 * 1.2 * cdA * v * v) / CAR.mass;

export function engineAccel(v, power, mu) {
  const traction = mu * (12 + 0.002 * v * v);
  return Math.min(traction, power / (CAR.mass * Math.max(v, 4)));
}

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
    this.kx = 0; this.kz = 0; this.spin = 0; // shove velocity (world m/s) and yaw kick (rad/s) from contact
    // tyres / damage / setup feed in as multipliers (set by the race each frame)
    this.tyre = 'M'; this.wear = 0; this.dmg = { L: 0, R: 0, rear: 0 };
    this.gripMul = 1; this.dragMul = 1; this.pull = 0;
    this.setup = { df: 1, cd: 1, bias: 0.56, diff: 0.5 };
    this.loc = {};
  }

  placeAt(s, lat) {
    const [x, z, yaw] = this.track.posAt(s, lat);
    this.x = x; this.z = z; this.yaw = yaw; this.v = 0;
    this.hint = -1;
    this.track.locate(x, z, -1, this.loc);
    this.hint = this.loc.i; this.s = this.loc.s; this.lat = this.loc.lat;
  }

  get speedKmh() { return Math.abs(this.v) * 3.6; }

  update(dt, input, raceOn) {
    const tr = this.track;
    // --- surface
    const lat = this.lat, a = Math.abs(lat);
    const i = this.hint;
    const kerb = lat > 0 ? tr.kerbR[i] : tr.kerbL[i];
    const gravel = lat > 0 ? tr.gravelR[i] : tr.gravelL[i];
    let mu = tr.mu * this.gripMul, extraDrag = 0;
    if (a < HALF_W) this.surface = 'road';
    else if (kerb && a < HALF_W + KERB_W) { this.surface = 'kerb'; mu *= tr.wet ? 0.8 : 0.95; }
    else if (kerb && a < HALF_W + 4.5) { this.surface = 'runoff'; mu *= 0.85; }
    else if (gravel) { this.surface = 'gravel'; mu *= 0.4; extraDrag = Math.min(7, Math.abs(this.v) * 0.5) + this.v * 0.08; }
    else { this.surface = 'grass'; mu *= tr.wet ? 0.35 : 0.5; extraDrag = Math.min(1.5, Math.abs(this.v) * 0.3) + this.v * 0.02; }
    this.offTrack = a > HALF_W + KERB_W + 0.6;

    // --- inputs
    const thr = raceOn ? input.throttle : 0;
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
    const analog = input.analog || this.assistAnalog;
    this.assistAnalog = false;
    // keyboard: quick at low speed, calmer at high speed so lines stay clean
    const vk = Math.abs(this.v);
    const rate = analog ? 12 : (Math.sign(st) !== Math.sign(this.steer) && st !== 0 ? 6 : 2.2 + 2.2 / (1 + vk / 25));
    const ret = analog ? 12 : 3.6 + 1.6 / (1 + vk / 30);
    if (st === 0) this.steer -= Math.sign(this.steer) * Math.min(Math.abs(this.steer), ret * dt);
    else this.steer += Math.max(-rate * dt, Math.min(rate * dt, st - this.steer));

    // braking assist
    if (this.opts.brakeAssist && raceOn) {
      const safe = this.opts.steerAssist === true ? 0.92 : this.opts.steerAssist ? 0.97 : 1; // assisted modes keep a margin to the limit
      const ahead = safe * Math.sqrt(this.gripMul) * Math.min(tr.targetSpeed(this.s + Math.max(this.v, 5) * 0.2), tr.targetSpeed(this.s + Math.max(this.v, 5) * 0.5) * 1.04);
      if (this.v > ahead + 0.5) brk = Math.max(brk, Math.min(this.opts.abs === false ? 0.85 : 1, (this.v - ahead) / 4));
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

    // --- longitudinal
    const S0 = this.setup;
    let eng = engineAccel(v, power, mu) * (1 + (S0.diff - 0.5) * 0.08 * Math.max(0, 1 - v / 50)) * (this.launchMul ?? 1);
    // low rpm in a tall gear (manual) -> weaker pull
    // only a manual driver lugging a tall gear loses pull; launches in 1st are traction-limited, not rpm-limited
    if (this.opts.manual && this.gear >= 2) eng *= Math.max(0.45, Math.min(1, (this.rpm - 3000) / 6000));
    if (this.limiter || this.shiftTimer > 0 || this.gear < 1) eng = 0;
    // traction control: full = never spins (old behaviour); medium / off let too much throttle in low gears
    // spin the rears: less drive, and with steering the rear steps out
    this.wheelspin = 0;
    const tc = this.opts.tc || 'full';
    if (tc !== 'full' && raceOn && eng > 0 && this.throttle > 0.3 && this.gear <= 4) {
      const demand = this.throttle * power / (CAR.mass * Math.max(v, 4)), grip = mu * (12 + 0.002 * v * v);
      const ex = demand / grip - 1;
      if (ex > 0) this.wheelspin = Math.min(1, ex * (tc === 'off' ? 0.5 : 0.15));
      eng *= 1 - 0.22 * this.wheelspin;
    }
    let acc = this.throttle * eng - DRAG(this.v, cdA) * Math.sign(this.v) - 0.15 * Math.sign(this.v) - extraDrag * Math.sign(this.v);
    if (thr < 0.05 && this.v > 1) acc -= 1.2; // engine braking
    // gravity along the slope (Eau Rouge, Austin turn 1): uphill slows, downhill pulls
    if (tr.hs) { const i = this.hint >= 0 ? this.hint : 0, along = -Math.sin(this.yaw) * tr.tx[i] - Math.cos(this.yaw) * tr.tz[i]; acc -= 9.81 * tr.gradeAt(this.s) * along; }
    const bd = brakeDecel(v, mu) * (1 - 2.2 * (S0.bias - 0.56) ** 2) * (this.brakeMul ?? 1); // off-balance brakes lock a wheel earlier; brake temperature
    // without ABS a stamp on the brakes locks the fronts: less stopping power, the car won't turn, tyres flat-spot
    this.lockup = this.opts.abs === false && brk > 0.9 && this.v > 8 ? Math.min(1, (brk - 0.9) * 10) : 0;
    if (this.v > 0.3) acc -= brk * bd * (1 - 0.15 * this.lockup);
    // reverse when stationary and holding brake
    if (this.v <= 0.3 && brk > 0.5 && thr < 0.05) acc = -3;
    if (this.v < 0 && thr > 0.1) acc = 6;
    this.v += acc * dt;
    if (this.v < -6) this.v = -6;
    if (Math.abs(this.v) < 0.05 && thr < 0.05 && brk < 0.05) this.v = 0;

    // --- lateral
    // steering lock: full lock in hairpins (about 6.5 m radius at 25 km/h, enough for Loews and the Montreal
    // hairpin), the same calm range as before at high speed
    const maxSteer = Math.min(0.55, 1.2 / (1 + Math.abs(this.v) / 5));
    const wantYaw = (this.v / CAR.wheelBase) * Math.tan(this.steer * maxSteer);
    // friction circle: braking / traction eat into lateral grip
    const S = this.setup;
    // setup: wings scale downforce, diff lock trades traction for rotation on throttle
    let latMax = mu * (CAR.gripBase + CAR.downforce * S.df * v * v) * 1.06; // a touch more forgiving than the AI's limit
    latMax *= 1 - (S.diff - 0.5) * 0.12 * this.throttle;
    const longUse = Math.min(0.85, (brk * bd + this.throttle * eng * 0.4) / (latMax + 1e-3));
    const latAvail = latMax * Math.sqrt(1 - longUse * longUse) * (1 - 0.6 * this.lockup);
    const maxYaw = latAvail / Math.max(Math.abs(this.v), 2);
    let yawRate = wantYaw * (1 + (0.56 - S.bias) * brk * 1.6) * (1 + (S.bal || 0)); // rearward bias rotates the car on the brakes; wing balance sets turn-in
    this.slip *= Math.exp(-dt * 3);
    if (Math.abs(wantYaw) > maxYaw) {
      const excess = Math.abs(wantYaw) / maxYaw - 1;
      yawRate = Math.sign(wantYaw) * maxYaw;
      this.v -= Math.min(excess, 1.5) * 2.6 * dt * Math.sign(this.v); // scrubbing (understeer)
      this.slip = Math.min(1, this.slip + excess * dt * 3);
    }
    if (this.lockup) this.slip = Math.min(1, this.slip + this.lockup * dt * 2);
    // wheelspin with lock applied: the rear steps out in the direction of the corner
    if (this.wheelspin > 0.05 && v > 3) { yawRate += Math.sign(this.steer) * Math.min(1, Math.abs(this.steer) * 2) * this.wheelspin * 0.55 * Math.min(1, v / 12); this.slip = Math.min(1, this.slip + this.wheelspin * dt * 2); }
    // power oversteer in the wet / off-track wobble
    if (tr.wet && thr > 0.8 && this.gear <= 3 && v > 8 && v < 40) yawRate += Math.sign(this.steer) * 0.06 * thr;
    if (this.surface === 'grass' || this.surface === 'gravel') yawRate += (Math.random() - 0.5) * 0.25 * Math.min(1, v / 20);
    if (this.pull) yawRate += this.pull * Math.min(1, v / 40); // bent wing pulls to one side
    this.yawRate += (yawRate - this.yawRate) * Math.min(1, dt * 14);
    this.yaw -= this.yawRate * dt;

    this.x += -Math.sin(this.yaw) * this.v * dt;
    this.z += -Math.cos(this.yaw) * this.v * dt;
    // contact: sideways shove bleeds off through the tyres, a yaw kick can spin the car
    if (this.kx || this.kz || this.spin) {
      this.x += this.kx * dt; this.z += this.kz * dt;
      const kd = Math.exp(-dt * (this.surface === 'road' ? 2.6 : 4));
      this.kx *= kd; this.kz *= kd;
      this.yaw -= this.spin * dt;
      if (Math.abs(this.spin) > 1.2) { this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), (3 + Math.abs(this.v) * 0.35) * dt); this.slip = 1; }
      this.spin *= Math.exp(-dt * (Math.abs(this.spin) > 2 ? 1.1 : 2.8));
      if (Math.abs(this.spin) < 0.02) this.spin = 0;
      if (Math.hypot(this.kx, this.kz) < 0.05) this.kx = this.kz = 0;
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
      // impact: kill velocity component into the wall
      const heading = Math.atan2(-f.tx, -f.tz);
      let rel = this.yaw - heading; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const into = Math.abs(Math.sin(rel));
      const hit = this.v * into;
      if (hit > 2) { this.impact = Math.min(1, hit / 30); this.wallHit = Math.max(this.wallHit || 0, hit); this.wallSide = side; }
      this.v *= 1 - Math.min(0.9, into * 1.6);
      // shove into the wall is absorbed
      const kin = this.kx * f.rx * side + this.kz * f.rz * side;
      if (kin > 0) { this.kx -= f.rx * side * kin; this.kz -= f.rz * side * kin; }
      this.yaw -= rel * 0.5; // align with wall
    }
    this.bump = this.surface === 'kerb' ? 1 : this.surface === 'gravel' || this.surface === 'grass' ? 0.6 : 0;
    this.impact *= Math.exp(-dt * 3);
    this.wheelRot += (this.v * dt) / 0.36;
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
    if (raceTime < this.reaction) { this.computePose(dt); return; }
    // spun: slide and scrub to a stop, then the driver turns the car round and rejoins
    if (this.spunT > 0) {
      this.spunT -= dt;
      this.spinYaw += this.spinRate * dt;
      this.spinRate *= Math.exp(-dt * 1.7);
      this.v = Math.max(0, this.v - (6 + this.v * 0.35) * dt);
      this.dist += this.v * dt;
      this.lat += this.knock * dt; this.knock *= Math.exp(-dt * 2.2);
      this.lat = Math.max(-HALF_W - 2.5, Math.min(HALF_W + 2.5, this.lat));
      this.latOff = this.lat - this.track.racingLat(this.s);
      this.wheelRot += (this.v * dt) / 0.36;
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
      this.lat += (Math.max(-HALF_W + 1, Math.min(HALF_W - 1, this.track.racingLat(this.s) + this.latOff)) - this.lat) * Math.min(1, dt * 0.8);
      this.wheelRot += (this.v * dt) / 0.36;
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
      this.latOff = side * (HALF_W - 1.4) - tr.racingLat(s);
      this.laneTimer = Math.max(this.laneTimer, 0.5);
      target *= 0.97;
    }
    // defending: one move to cover the inside before a braking zone, never across a car alongside
    this.defT -= dt;
    if (behind && !lapper && this.blueT <= 0 && brakeAhead && this.defT <= 0 && behindGap > 4.5 && behindGap < 16 && behind.v > this.v - 0.5 && this.laneTimer <= 0) {
      this.defT = 9;
      if (Math.random() < 0.35 + this.agg * 0.6) {
        const dir = Math.sign(behind.lat - this.lat) || -Math.sign(tr.racingLat(s + 150)) || 1;
        const nl = Math.max(-HALF_W + 1.2, Math.min(HALF_W - 1.2, this.lat + dir * 2.4));
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
          if (Math.abs(nl) > HALF_W - 1) return -1;
          for (const c of cars) {
            if (c === this || c === blocked) continue;
            let ds = c.dist - this.dist; if (ds < -tr.length / 2) ds += tr.length;
            if (Math.abs(ds) < 8 && Math.abs(c.lat - nl) < 2.2) return -1;
          }
          return HALF_W - Math.abs(nl);
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

    const acc = Math.max(0.5, (CAR.power / (CAR.mass * Math.max(this.v, 4))) - (0.5 * 1.2 * CAR.cdA * this.v * this.v) / CAR.mass);
    const traction = wetMu * (12 + 0.002 * this.v * this.v) * (raceTime < 4 ? this.launch : 1);
    if (this.v < target) this.v = Math.min(target, this.v + Math.min(acc, traction) * dt);
    else this.v = Math.max(target, this.v - brakeDecel(this.v, wetMu) * dt);
    if (tr.hs && this.v > 3) this.v -= 9.81 * tr.gradeAt(s) * dt * 0.8; // slope (the speed profile is flat, so a little less)
    this.v = Math.max(0, this.v);
    this.dist += this.v * dt;

    let wantLat = Math.max(-HALF_W + 1, Math.min(HALF_W - 1, tr.racingLat(this.s) + this.latOff));
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
        if (ds > 0 && Math.abs(wantLat) > HALF_W - 1.2) this.backOff = Math.min(this.backOff ?? 1e9, c.v - 1.5);
      }
    }
    wantLat = Math.max(-HALF_W + 0.8, Math.min(HALF_W - 0.8, wantLat));
    const maxMove = (1.2 + this.v * 0.04) * dt;
    this.lat += Math.max(-maxMove, Math.min(maxMove, wantLat - this.lat));
    if (this.knock) {
      this.lat += this.knock * dt; this.knock *= Math.exp(-dt * 3);
      if (Math.abs(this.knock) < 0.05) this.knock = 0;
      this.lat = Math.max(-HALF_W - 2.5, Math.min(HALF_W + 2.5, this.lat));
      this.latOff = this.lat - tr.racingLat(this.s); // rejoin from where the shove left it
    }
    this.wheelRot += (this.v * dt) / 0.36;
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
    this.x = f.x + f.rx * this.lat; this.z = f.z + f.rz * this.lat;
    const yawT = Math.atan2(-(x2 - this.x), -(z2 - this.z));
    if (this.yawInit) { let d = yawT - this.yawB; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yawB += d * Math.min(1, dt * 12); }
    else { this.yawB = yawT; this.yawInit = true; }
    this.yaw = this.yawB + this.spinYaw;
    const steerT = Math.max(-0.4, Math.min(0.4, tr.k[tr.idx(s + 5)] * 12));
    this.steerVis = (this.steerVis || 0) + (steerT - (this.steerVis || 0)) * Math.min(1, dt * 8);
  }
}
