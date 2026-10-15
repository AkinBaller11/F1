// Vehicle model shared by the player's car (full dynamics in physics.js) and the AI / speed profile
// (quasi-steady limits below), so both run on the same tyres, aero and masses.
//
// Parameters and where they come from (A = assumption / estimate, R = regulation or published figure,
// G = previous game value kept so race pace and balance stay comparable):
//  mass 800 kg ............ R/G 2026 minimum mass 768 kg (car + driver, no fuel) plus some fuel
//  wheelbase 3.40 m ....... R   2026 maximum wheelbase
//  front axle share 45.5 %  A   F1 cars run ~45 % front (the regulations set minimum axle masses)
//  CG height 0.28 m ....... A   low-slung single seater, 0.25-0.30 m
//  track 1.60 / 1.55 m .... A   2026 overall width 1.90 m minus a tyre width
//  yaw inertia 1000 kg m²  A   radius of gyration ~1.1 m (m k² = 800 * 1.12²)
//  CdA 1.35 m², ClA 5.2 m²  G   lift/drag ~3.9, typical for current F1 (published L/D 3-4)
//  aero balance 40 % front  A   centre of pressure slightly behind the CG: stable at speed
//  power 600 kW + ERS ..... G   at the wheels; top speed ~325 km/h with the drag above
//  tyre μ 1.75 @ 3 kN ..... A   racing slicks on a rubbered track; falls 0.05 per kN of load (load
//                               sensitivity of the order given for slicks in Milliken & Milliken, RCVD).
//                               Pirelli's F1 data is not public, so this is an estimate.
//  peak slip angle ~5° .... A   slick tyres peak around 4-7°; past the peak the force falls to ~80 %
//  relaxation length 0.45 m A   tyre builds up side force over ~half a metre of rolling
//  roll gradient 0.25°/g .. A   very stiff F1 suspension (≈1° roll at 4 g), 55 % of the roll stiffness front
//  pitch gradient 0.12°/g . A   pitch-sensitive floor needs a stiff platform
//  heave stiffness 1.05 MN/m A  ~25 mm ride-height drop under full downforce at top speed
//  brake capacity 55 kN ... A   carbon brakes sized just above the tyres' limit at top speed
//  engine braking 960 N ... G   engine drag + MGU-K harvesting when lifting (old 1.2 m/s²)
//  rolling resistance 0.015 A   radial racing tyre, times the wheel load
export const VEH = {
  mass: 800, g: 9.81, rho: 1.2,
  L: 3.4, frontShare: 0.455, h: 0.28, tF: 1.6, tR: 1.55, Iz: 1000,
  CdA: 1.35, drsCdA: 1.0, ClA: 5.2, drsClALoss: 0.6, aeroFront: 0.40,
  power: 600000, ersPower: 120000,
  mu0: 1.75, Fz0: 3000, muLoad: 0.05 / 1000, muMin: 0.9,
  B: 24, C: 1.4, relax: 0.45,
  rollGradDeg: 0.25, rollFront: 0.55, Ix: 180, rollZeta: 0.7,
  pitchGradDeg: 0.12, Iy: 900, pitchZeta: 0.7,
  heaveK: 1.05e6,
  brakeMax: 55000, engineBrake: 960, crr: 0.015,
  tyreR: 0.3525,
};
export const AXLE = {
  a: (1 - VEH.frontShare) * VEH.L, // CG to front axle
  b: VEH.frontShare * VEH.L,       // CG to rear axle
};
// roll / pitch springs from the gradients: K = m g h / angle-per-g; damping from the damping ratio
const D2R = Math.PI / 180;
export const SUSP = {
  Kr: (VEH.mass * VEH.g * VEH.h) / (VEH.rollGradDeg * D2R),
  Kp: (VEH.mass * VEH.g * VEH.h) / (VEH.pitchGradDeg * D2R),
};
SUSP.Cr = 2 * VEH.rollZeta * Math.sqrt(SUSP.Kr * VEH.Ix);
SUSP.Cp = 2 * VEH.pitchZeta * Math.sqrt(SUSP.Kp * VEH.Iy);

// friction coefficient of one tyre at load Fz (N): load sensitivity
export const muAt = (Fz) => Math.max(VEH.muMin, VEH.mu0 - VEH.muLoad * (Fz - VEH.Fz0));
// peak force of one tyre (N), μ scaled by surface / weather / tyre state
export const tyrePeak = (Fz, mu) => (Fz > 0 ? mu * muAt(Fz) * Fz : 0);
// normalised side force over slip angle (rad), simplified Magic Formula: peak 1 near 5°, ~0.8 fully sliding
export const MF_SLIDE = Math.sin(VEH.C * Math.PI / 2);
export const sideCurve = (alpha) => Math.sin(VEH.C * Math.atan(VEH.B * alpha));
export const ALPHA_PEAK = Math.tan(Math.PI / (2 * VEH.C)) / VEH.B;

export const downforce = (v, dfMul = 1, drs = false) => 0.5 * VEH.rho * (VEH.ClA * dfMul - (drs ? VEH.drsClALoss : 0)) * v * v;
export const dragForce = (v, cdA) => 0.5 * VEH.rho * cdA * v * Math.abs(v);

// ---------------------------------------------------------------- quasi-steady limits (AI, speed profile)
// axle capacities with the load transfer of a steady lateral (ay) and longitudinal (ax) acceleration
function axleCaps(v, mu, ay, ax, dfMul, aeroFront) {
  const m = VEH.mass, F = downforce(v, dfMul);
  const Ff = m * VEH.g * AXLE.b / VEH.L + F * aeroFront, Fr = m * VEH.g * AXLE.a / VEH.L + F * (1 - aeroFront);
  const dLong = (-m * ax * VEH.h) / VEH.L; // braking (ax < 0) moves load forward
  const M = m * Math.abs(ay) * VEH.h, dF = (VEH.rollFront * M) / VEH.tF, dR = ((1 - VEH.rollFront) * M) / VEH.tR;
  const fo = (Ff + dLong) / 2, ro = (Fr - dLong) / 2;
  return {
    front: tyrePeak(fo + dF, mu) + tyrePeak(fo - dF, mu),
    rearL: tyrePeak(ro + dR, mu), rearR: tyrePeak(ro - dR, mu),
  };
}

// largest steady lateral acceleration (m/s²) at speed v: each axle must carry its share of the side force
// (front b/L, rear a/L for zero yaw acceleration)
export function lateralLimit(v, mu, dfMul = 1, aeroFront = VEH.aeroFront) {
  let lo = 0, hi = 90;
  for (let k = 0; k < 30; k++) {
    const ay = (lo + hi) / 2, c = axleCaps(v, mu, ay, 0, dfMul, aeroFront), m = VEH.mass;
    const ok = c.front >= (m * ay * AXLE.b) / VEH.L && c.rearL + c.rearR >= (m * ay * AXLE.a) / VEH.L;
    if (ok) lo = ay; else hi = ay;
  }
  return lo;
}

// full braking with ABS at brake balance `bias` (front share): each axle up to its grip, plus drag and
// rolling resistance; returns deceleration (m/s², positive)
export function brakeLimit(v, mu, bias = 0.56, cdA = VEH.CdA, brakeMul = 1) {
  const m = VEH.mass;
  let dec = 30;
  for (let k = 0; k < 12; k++) {
    const c = axleCaps(v, mu, 0, -dec, 1, VEH.aeroFront);
    const Fb = VEH.brakeMax * brakeMul;
    const fx = Math.min(bias * Fb, c.front) + Math.min(Math.max((1 - bias) * Fb, VEH.engineBrake), c.rearL + c.rearR);
    const load = m * VEH.g + downforce(v);
    dec = (fx + dragForce(v, cdA) + VEH.crr * load) / m;
  }
  return dec;
}

// forward acceleration (m/s², net of drag and rolling) with the rear tyres' traction and a half-locked diff
export function driveLimit(v, power, cdA, mu, lock = 0.5) {
  const m = VEH.mass;
  let acc = 5;
  for (let k = 0; k < 10; k++) {
    const c = axleCaps(v, mu, 0, acc, 1, VEH.aeroFront);
    const trac = (1 - lock) * 2 * Math.min(c.rearL, c.rearR) + lock * (c.rearL + c.rearR);
    const load = m * VEH.g + downforce(v);
    acc = (Math.min(trac, power / Math.max(v, 1)) - dragForce(v, cdA) - VEH.crr * load) / m;
  }
  return acc;
}

// tables per grip level, so the speed profile can ask thousands of times cheaply
const cache = new Map();
export function limits(mu) {
  const key = Math.round(mu * 1000);
  if (cache.has(key)) return cache.get(key);
  const lat = new Float32Array(111), brk = new Float32Array(111), drv = new Float32Array(111), trc = new Float32Array(111), res = new Float32Array(111);
  for (let v = 0; v <= 110; v++) {
    lat[v] = lateralLimit(v, mu);
    brk[v] = brakeLimit(v, mu);
    drv[v] = driveLimit(v, VEH.power, VEH.CdA, mu);
    res[v] = (dragForce(v, VEH.CdA) + VEH.crr * (VEH.mass * VEH.g + downforce(v))) / VEH.mass; // drag + rolling
    trc[v] = Math.min(drv[v] + res[v], 99); // gross forward force the rear tyres / engine deliver (per kg)
  }
  const at = (t, v) => { v = Math.max(0, Math.min(109.999, v)); const i = Math.floor(v), f = v - i; return t[i] + (t[i + 1] - t[i]) * f; };
  const L = { lat: (v) => at(lat, v), brake: (v) => at(brk, v), drive: (v) => at(drv, v), gross: (v) => at(trc, v), res: (v) => at(res, v) };
  if (cache.size > 64) cache.clear();
  cache.set(key, L);
  return L;
}
