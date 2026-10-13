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
    let mu = tr.mu, extraDrag = 0;
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
      const ahead = this.s + Math.max(8, this.v * 0.45);
      const f = tr.frame(ahead), lat = tr.racingLat(ahead);
      const want = Math.atan2(-(f.x + f.rx * lat - this.x), -(f.z + f.rz * lat - this.z));
      let err = want - this.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
      const auto = Math.max(-1, Math.min(1, -err * 12));
      st = st === 0 ? auto : Math.max(-1, Math.min(1, st + (auto - st) * 0.35));
      this.assistErr = Math.abs(err);
      this.assistAnalog = true;
    }
    const analog = input.analog || this.assistAnalog;
    this.assistAnalog = false;
    const rate = analog ? 12 : (Math.sign(st) !== Math.sign(this.steer) && st !== 0 ? 6 : 3.2);
    const ret = analog ? 12 : 4.5;
    if (st === 0) this.steer -= Math.sign(this.steer) * Math.min(Math.abs(this.steer), ret * dt);
    else this.steer += Math.max(-rate * dt, Math.min(rate * dt, st - this.steer));

    // braking assist
    if (this.opts.brakeAssist && raceOn) {
      const safe = this.opts.steerAssist ? 0.92 : 1; // easy mode keeps a margin to the limit
      const ahead = safe * Math.min(tr.targetSpeed(this.s + Math.max(this.v, 5) * 0.2), tr.targetSpeed(this.s + Math.max(this.v, 5) * 0.5) * 1.04);
      if (this.v > ahead + 0.5) brk = Math.max(brk, Math.min(1, (this.v - ahead) / 4));
    }
    let thrEff = thr;
    if (this.opts.steerAssist && this.assistErr > 0.06) thrEff = thr * Math.max(0.2, 1 - (this.assistErr - 0.06) * 6);
    this.assistErr = 0;
    this.throttle = thrEff; this.brake = brk;

    // --- ERS / DRS
    let power = CAR.power;
    this.overtake = !!input.overtake && this.ers > 0.01 && thr > 0.5;
    if (this.overtake) { power += CAR.ersPower; this.ers -= dt / 22; }
    else if (thr > 0.95 && this.v > 30 && this.ers > 0.02) { power += CAR.ersPower * 0.45; this.ers -= dt / 90; }
    this.ers += (brk * 0.03 + (thr < 0.05 ? 0.004 : 0)) * dt;
    this.ers = Math.max(0, Math.min(1, this.ers));
    if (brk > 0.1) this.drsOpen = false;
    if (input.drs && this.drsAvailable && !this.drsOpen) this.drsOpen = true;
    if (!this.drsAvailable && this.drsOpen && brk > 0) this.drsOpen = false;
    const cdA = this.drsOpen ? CAR.drsCdA : CAR.cdA;

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
    let eng = engineAccel(v, power, mu);
    // low rpm in a tall gear (manual) -> weaker pull
    if (this.gear >= 1) eng *= Math.max(0.35, Math.min(1, (this.rpm - 3000) / 6000));
    if (this.limiter || this.shiftTimer > 0 || this.gear < 1) eng = 0;
    let acc = this.throttle * eng - DRAG(this.v, cdA) * Math.sign(this.v) - 0.15 * Math.sign(this.v) - extraDrag * Math.sign(this.v);
    if (thr < 0.05 && this.v > 1) acc -= 1.2; // engine braking
    const bd = brakeDecel(v, mu);
    if (this.v > 0.3) acc -= brk * bd;
    // reverse when stationary and holding brake
    if (this.v <= 0.3 && brk > 0.5 && thr < 0.05) acc = -3;
    if (this.v < 0 && thr > 0.1) acc = 6;
    this.v += acc * dt;
    if (this.v < -6) this.v = -6;
    if (Math.abs(this.v) < 0.05 && thr < 0.05 && brk < 0.05) this.v = 0;

    // --- lateral
    const maxSteer = 0.42 / (1 + Math.abs(this.v) / 16);
    const wantYaw = (this.v / CAR.wheelBase) * Math.tan(this.steer * maxSteer);
    // friction circle: braking / traction eat into lateral grip
    const latMax = lateralGrip(v, mu);
    const longUse = Math.min(0.85, (brk * bd + this.throttle * eng * 0.4) / (latMax + 1e-3));
    const latAvail = latMax * Math.sqrt(1 - longUse * longUse);
    const maxYaw = latAvail / Math.max(Math.abs(this.v), 2);
    let yawRate = wantYaw;
    this.slip *= Math.exp(-dt * 3);
    if (Math.abs(wantYaw) > maxYaw) {
      const excess = Math.abs(wantYaw) / maxYaw - 1;
      yawRate = Math.sign(wantYaw) * maxYaw;
      this.v -= Math.min(excess, 1.5) * 4 * dt * Math.sign(this.v); // scrubbing (understeer)
      this.slip = Math.min(1, this.slip + excess * dt * 3);
    }
    // power oversteer in the wet / off-track wobble
    if (tr.wet && thr > 0.8 && this.gear <= 3 && v > 8 && v < 40) yawRate += Math.sign(this.steer) * 0.06 * thr;
    if (this.surface === 'grass' || this.surface === 'gravel') yawRate += (Math.random() - 0.5) * 0.25 * Math.min(1, v / 20);
    this.yawRate += (yawRate - this.yawRate) * Math.min(1, dt * 14);
    this.yaw -= this.yawRate * dt;

    this.x += -Math.sin(this.yaw) * this.v * dt;
    this.z += -Math.cos(this.yaw) * this.v * dt;

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
      if (hit > 2) { this.impact = Math.min(1, hit / 30); }
      this.v *= 1 - Math.min(0.9, into * 1.6);
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
  }
  get s() { return this.track.wrapS(this.dist + this.track.startS); }

  update(dt, raceTime, cars, wetMu) {
    const tr = this.track;
    if (raceTime < this.reaction) { this.computePose(); return; }
    const s = this.s;
    const look = Math.max(this.v, 10) * 0.12;
    let target = tr.targetSpeed(s + look) * this.skill;
    // traffic awareness
    let blocked = null, blockGap = 1e9;
    for (const c of cars) {
      if (c === this) continue;
      let ds = c.dist - this.dist;
      if (ds < -tr.length / 2) ds += tr.length; // lapping
      if (ds <= 0 || ds > 28) continue;
      if (Math.abs(c.lat - this.lat) < 2.3 && ds < blockGap) { blocked = c; blockGap = ds; }
    }
    if (blocked) {
      const closing = this.v - blocked.v;
      if (closing > -1 && this.laneTimer <= 0) {
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
      // otherwise follow
      if (blockGap < 14 && Math.abs(blocked.lat - this.lat) < 2.0) target = Math.min(target, blocked.v - (14 - blockGap) * 0.4);
      // slipstream
      if (blockGap < 25) target *= 1.012;
    }
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) this.latOff *= Math.exp(-dt * 0.6);

    const acc = Math.max(0.5, (CAR.power / (CAR.mass * Math.max(this.v, 4))) - (0.5 * 1.2 * CAR.cdA * this.v * this.v) / CAR.mass);
    const traction = wetMu * (12 + 0.002 * this.v * this.v);
    if (this.v < target) this.v = Math.min(target, this.v + Math.min(acc, traction) * dt);
    else this.v = Math.max(target, this.v - brakeDecel(this.v, wetMu) * dt);
    this.v = Math.max(0, this.v);
    this.dist += this.v * dt;

    const wantLat = Math.max(-HALF_W + 1, Math.min(HALF_W - 1, tr.racingLat(this.s) + this.latOff));
    const maxMove = (1.2 + this.v * 0.04) * dt;
    this.lat += Math.max(-maxMove, Math.min(maxMove, wantLat - this.lat));
    this.wheelRot += (this.v * dt) / 0.36;
    this.computePose();
  }

  computePose() {
    const tr = this.track;
    const s = this.s;
    const f = tr.frame(s);
    const fa = tr.frame(s + 3);
    const la = tr.racingLat(s + 3) + this.latOff;
    const x2 = fa.x + fa.rx * la, z2 = fa.z + fa.rz * la;
    this.x = f.x + f.rx * this.lat; this.z = f.z + f.rz * this.lat;
    this.yaw = Math.atan2(-(x2 - this.x), -(z2 - this.z));
    this.steerVis = Math.max(-0.4, Math.min(0.4, tr.k[tr.idx(s + 4)] * 12));
  }
}
