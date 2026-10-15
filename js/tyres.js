// Tyre and brake thermals and tyre wear, driven by the energy the vehicle model actually puts through the
// tyres (friction power = force x sliding speed, rolling hysteresis) and the brakes (brake power).
// Each tyre has two thermal nodes: the tread surface (fast) and the carcass (slow). Grip per tyre falls
// outside the compound's window and with wear; physics.js applies it per wheel.
//
// Numbers (A = estimate, C = calibration target, G = existing game value):
//  tread surface 2.0 kJ/K .... A ~1 kg of tread rubber, c ≈ 1.9 kJ/(kg K)
//  carcass + gas 14 kJ/K ..... A rest of a ~10 kg tyre plus the inflation gas
//  friction heat 60 % tread, 40 % carcass; rolling hysteresis into the carcass (A)
//  tread <-> carcass 400 W/K .. A surface follows the carcass within a few seconds
//  convection 20 + 2.6·v W/K .. A/C tread to air; tuned so a medium sits in its window at race pace
//  tread -> track 60 W/K ...... A contact patch conduction to the asphalt
//  water: convection x (1 + 3 x wetness) (A)
//  operating windows .......... G per compound (Pirelli's are not public)
//  wear ∝ friction energy ..... A Archard-type abrasion; rate per J calibrated (C) so a medium reaches the
//                               0.7 "cliff" after about half a real race distance on a medium-severity lap
//  race compression ........... the wear rate is multiplied by 305 km / race distance (and the player's
//                               wear setting), like the accelerated wear of F1 games: in a 5-lap race the
//                               tyres go through the same share of their life as in a full Grand Prix
//  carbon brake disc 2 kJ/K ... A ~1.2 kg carbon disc + pads per front corner; convection 15 + 1.2·v W/K plus
//                               radiation, so the discs run in the 400-1000 °C Brembo quotes for F1
//  rim heating 8 % ............ A share of the front brake energy that soaks through the rim into the tyre
//                               (teams use brake ducts to steer tyre temperatures this way)
import { TYRES, TYRE_WINDOW, isSlick } from './race.js';
import { VEH, AXLE, tyrePeak, sideCurve, ALPHA_PEAK, downforce } from './vehicle.js';

export const THERM = {
  Cs: 2000, Cc: 14000, toTread: 0.6, Gsc: 400, h0: 20, h1: 2.6, Groad: 60, Gcore: 15,
  wearPerJ: 2.9e-8, // calibrated, see header (fraction of tread life per joule of friction energy, medium)
  realRaceM: 305000,
  discC: 2000, disc0: 15, disc1: 1.2, discA: 0.15, discEps: 0.8, rimShare: 0.08,
};
const SIGMA = 5.67e-8;

export function newTyreSet(compound, T0) {
  return { c: compound, Ts: [T0, T0, T0, T0], Tc: [T0, T0, T0, T0], wear: [0, 0, 0, 0], E: [0, 0, 0, 0], R: [0, 0, 0, 0], EF: [0, 0, 0, 0] };
}

// grip factor of one tyre from its temperature (tread/carcass blend) and wear
export function tyreTempGrip(c, T) {
  const W = TYRE_WINDOW[c] || TYRE_WINDOW.M;
  const d = T < W[0] ? W[0] - T : T > W[1] ? T - W[1] : 0;
  return Math.max(0.72, 1 - 0.00012 * d * d);
}
export function tyreWearGrip(w) { return 1 - 0.06 * w - Math.max(0, w - 0.7) * 0.5; } // slow fade, then the cliff
export const gripTemp = (set, i) => 0.6 * set.Ts[i] + 0.4 * set.Tc[i];
export function tyreFactors(set, out = [1, 1, 1, 1], tempOn = true) {
  for (let i = 0; i < 4; i++) out[i] = (tempOn ? tyreTempGrip(set.c, gripTemp(set, i)) : 1) * tyreWearGrip(set.wear[i]);
  return out;
}

// advance temperatures and wear by dt using the friction energy E[i] and rolling energy R[i] (J) the
// physics accumulated since the last call; v speed (m/s), amb air °C, trackT asphalt °C, wet 0..1
export function stepTyres(set, dt, v, amb, trackT, wet, wearScale) {
  const T = THERM, hA = (T.h0 + T.h1 * Math.abs(v)) * (1 + 3 * wet), comp = (TYRES[set.c] || TYRES.M).wear;
  // inters / wets on a drying track: the tread overheats and chunks
  const dryCook = isSlick(set.c) ? 1 : 1 + 2.2 * Math.max(0, (set.c === 'W' ? 0.6 : 0.3) - wet);
  const W = TYRE_WINDOW[set.c] || TYRE_WINDOW.M;
  let maxOver = 0;
  for (let i = 0; i < 4; i++) {
    const Ef = set.E[i], Er = set.R[i];
    set.EF[i] += Ef; // lifetime friction energy of this tyre (diagnostics)
    set.E[i] = 0; set.R[i] = 0;
    const Ts = set.Ts[i], Tc = set.Tc[i];
    const qS = T.toTread * Ef - (T.Gsc * (Ts - Tc) + hA * (Ts - amb) + T.Groad * (Ts - trackT)) * dt;
    const qC = (1 - T.toTread) * Ef + Er + (T.Gsc * (Ts - Tc) - T.Gcore * (Tc - amb)) * dt;
    // the tread node is fast: integrate it implicitly against its losses so big dt stay stable
    const g = (T.Gsc + hA + T.Groad) * dt / T.Cs;
    set.Ts[i] = Ts + qS / T.Cs / (1 + g);
    set.Tc[i] = Tc + qC / T.Cc;
    const over = Math.max(0, gripTemp(set, i) - W[1]);
    maxOver = Math.max(maxOver, over);
    // abrasion from friction energy; a tread past its window degrades faster (thermal degradation)
    set.wear[i] = Math.min(1, set.wear[i] + Ef * T.wearPerJ * comp * dryCook * (1 + over / 25) * wearScale);
  }
  return maxOver;
}

// front brake disc: brake energy in (J, both front discs together), convection + radiation out
export function stepBrake(Tb, Ein, dt, v, amb) {
  const T = THERM, K = 273.15;
  const loss = (T.disc0 + T.disc1 * Math.abs(v)) * (Tb - amb) + T.discEps * SIGMA * T.discA * ((Tb + K) ** 4 - (amb + K) ** 4);
  return Tb + (Ein / 2 - loss * dt) / T.discC;
}

// AI cars have no tyre model of their own: estimate the same energies from what they do (speed, the racing
// line's curvature, their acceleration), with the axle loads and tyre curves of vehicle.js
export function aiTyreEnergy(set, v, k, ax, mu, dt) {
  const m = VEH.mass, F = downforce(v), L = VEH.L;
  const Fzf = m * VEH.g * AXLE.b / L + F * VEH.aeroFront, Fzr = m * VEH.g * AXLE.a / L + F * (1 - VEH.aeroFront);
  const ay = v * v * k, side = Math.sign(ay) || 1, M = m * Math.abs(ay) * VEH.h;
  const dF = (VEH.rollFront * M) / VEH.tF, dR = ((1 - VEH.rollFront) * M) / VEH.tR, dL = (-m * ax * VEH.h) / L;
  // loads: index 0 FL, 1 FR, 2 RL, 3 RR; in a right-hander (ay > 0) the left wheels are outside
  const Fz = [(Fzf + dL) / 2 + side * dF, (Fzf + dL) / 2 - side * dF, (Fzr - dL) / 2 + side * dR, (Fzr - dL) / 2 - side * dR].map((x) => Math.max(0, x));
  const axle = (i0, Fy, Fx) => {
    const cap = tyrePeak(Fz[i0], mu) + tyrePeak(Fz[i0 + 1], mu);
    const use = Math.min(0.999, Math.hypot(Fy, Fx) / Math.max(cap, 1));
    // slip angle that gives this share of the peak on the Magic-Formula curve (bisection up to the peak)
    let lo = 0, hi = ALPHA_PEAK;
    for (let n = 0; n < 16; n++) { const a = (lo + hi) / 2; if (sideCurve(a) < use) lo = a; else hi = a; }
    const vs = v * Math.tan(lo) + (Math.abs(Fx) / Math.max(25 * (Fz[i0] + Fz[i0 + 1]), 1)) * v; // lateral + longitudinal slip
    const P = Math.hypot(Fy, Fx) * vs;
    for (const i of [i0, i0 + 1]) {
      const sh = tyrePeak(Fz[i], mu) / Math.max(cap, 1);
      set.E[i] += P * sh * dt; set.R[i] += VEH.crr * Fz[i] * v * dt;
    }
  };
  const Fy = m * Math.abs(ay), Fx = m * ax;
  axle(0, Fy * AXLE.b / L, ax < 0 ? Fx * 0.56 : 0);
  axle(2, Fy * AXLE.a / L, ax < 0 ? Fx * 0.44 : Fx);
}
