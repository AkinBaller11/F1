// Race systems shared by the player and the AI: tyre compounds and wear, pit stops,
// damage and penalties. Kept free of DOM/audio so it can be driven from main.js.
import { HALF_W } from './track.js';

export const TYRES = {
  S: { name: 'SOFT', col: '#e8242b', grip: 1.03, wear: 1.7 },
  M: { name: 'MEDIUM', col: '#f2c80f', grip: 1.0, wear: 1.0 },
  H: { name: 'HARD', col: '#f0f0f0', grip: 0.975, wear: 0.68 },
  I: { name: 'INTERMEDIATE', col: '#33c23e', grip: 1.0, wear: 0.9 },
  W: { name: 'REGEN', col: '#2e7dff', grip: 1.0, wear: 0.8 },
};
export const TYRE_ORDER = ['S', 'M', 'H', 'I', 'W'];
export const isSlick = (c) => c === 'S' || c === 'M' || c === 'H';
const lerp3 = (a, w) => (w < 0.5 ? a[0] + (a[1] - a[0]) * w * 2 : a[1] + (a[2] - a[1]) * (w - 0.5) * 2);

// absolute grip factor of a compound for a track wetness (0 dry .. 1 standing water)
function rawGrip(c, wear, w) {
  const T = TYRES[c] || TYRES.M;
  const wet = isSlick(c) ? lerp3([1, 0.78, 0.6], w) : c === 'I' ? lerp3([0.9, 1.06, 0.9], w) : lerp3([0.82, 1.0, 1.08], w);
  const worn = 1 - 0.06 * wear - Math.max(0, wear - 0.7) * 0.5; // slow fade, then the cliff
  return T.grip * wet * worn;
}
// relative to the best fresh tyre for the conditions (the track's speed profile assumes that one)
export function tyreGrip(c, wear, w) {
  const ref = Math.max(rawGrip('M', 0, w), rawGrip('I', 0, w), rawGrip('W', 0, w));
  return rawGrip(c, wear, w) / ref;
}

// wear per metre: on a 5+ lap race a soft lasts ~55 % of the distance, a hard ~140 %
export function wearPerM(c, w, slip, raceM, k) {
  let r = (TYRES[c] || TYRES.M).wear / (raceM * 0.95);
  if (!isSlick(c)) r *= 1 + 2.2 * Math.max(0, (c === 'W' ? 0.6 : 0.3) - w); // inters / wets cook on a drying track
  return r * (1 + slip * 1.2) * k;
}

// what the weather asks for: a compound, 'dry' (back to slicks) or null (fine as is)
export function weatherCall(c, w) {
  if (isSlick(c) && w > 0.32) return w > 0.72 ? 'W' : 'I';
  if (c === 'I' && w < 0.16) return 'dry';
  if (c === 'I' && w > 0.82) return 'W';
  if (c === 'W' && w < 0.5) return w < 0.16 ? 'dry' : 'I';
  return null;
}
// softest slick that makes it to the flag
export function dryChoice(remainM, raceM) {
  for (const c of ['S', 'M', 'H']) if ((TYRES[c].wear / (raceM * 0.95)) * remainM < 0.82) return c;
  return 'H';
}
export function wetChoice(w) { return w > 0.72 ? 'W' : 'I'; }

// ------------------------------------------------------------------ pit stops
// A pit stop is a scripted path: lane change into the pit lane, 80 km/h limiter,
// stop at the team's box, limiter to the end of the lane, merge back onto the racing line.
export const PIT_LAT = 16, PIT_V = 22.2;

export function pitBoxS(tr, slot) {
  const n = Math.max(1, Math.floor((tr.pit[1] - tr.pit[0] - 50) / 40));
  return tr.wrapS(tr.pit[0] + 30 + (slot % n) * 40);
}

// can a car start its pit entry from here? (distance to the lane start)
export function pitWindow(tr, s) {
  const d = tr.wrapS(tr.pit[0] - s);
  return d > 70 && d < 240;
}

export function startPit(tr, car, slot, tyre, repair) {
  const s0 = car.s;
  const dIn = tr.wrapS(tr.pit[0] - s0);
  const dBox = dIn + tr.wrapS(pitBoxS(tr, slot) - tr.pit[0]);
  const dOut = dIn + tr.wrapS(tr.pit[1] - tr.pit[0]);
  return {
    s0, d: 0, lat0: car.lat, dIn, dBox, dOut, dEnd: dOut + 150, ph: 'in', tyre, repair,
    stopT: 2.2 + Math.random() * 0.7 + (repair ? repair : 0), t: 0,
  };
}

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export function pitLat(tr, P, d) {
  if (d < P.dIn) return P.lat0 + (PIT_LAT - P.lat0) * smooth((d - (P.dIn - 150)) / 140);
  if (d < P.dOut) return PIT_LAT;
  return PIT_LAT + (tr.racingLat(tr.wrapS(P.s0 + d)) - PIT_LAT) * smooth((d - P.dOut) / (P.dEnd - P.dOut - 10));
}

// advance a car along the pit path; returns its new track position and whether it is back on track
export function stepPit(tr, car, P, dt) {
  const d = P.d, s = tr.wrapS(P.s0 + d);
  let vT;
  if (P.ph === 'stop') vT = 0;
  else if (d < P.dIn) vT = Math.min(tr.targetSpeed(s), Math.sqrt(PIT_V * PIT_V + 2 * 22 * Math.max(0, P.dIn - d)));
  else if (d < P.dOut) vT = P.ph === 'in' || P.ph === 'lane' ? Math.min(PIT_V, Math.sqrt(2 * 7 * Math.max(0, P.dBox - d)) + 0.6) : PIT_V;
  else vT = tr.targetSpeed(s) * 0.9;
  if (car.v > vT) car.v = Math.max(vT, car.v - 26 * dt); else car.v = Math.min(vT, car.v + (d < P.dOut ? 6 : 11) * dt);
  if (P.ph === 'in' && d >= P.dIn) P.ph = 'lane';
  if (P.ph === 'lane' && d >= P.dBox - 0.6) { P.ph = 'stop'; P.t = 0; car.v = 0; }
  if (P.ph === 'stop') {
    P.t += dt;
    if (P.t >= P.stopT) { P.ph = 'out'; P.serviced = true; }
  } else P.d += car.v * dt;
  return { s: tr.wrapS(P.s0 + P.d), lat: pitLat(tr, P, P.d), done: P.d >= P.dEnd };
}

// ------------------------------------------------------------------ damage
export function newDamage() { return { L: 0, R: 0, rear: 0 }; }
export const wingDmg = (dm) => Math.max(dm.L, dm.R);
// grip / drag / steering pull from damage
export function damageEffect(dm) {
  const fw = wingDmg(dm);
  return { grip: 1 - 0.13 * fw - 0.05 * dm.rear, drag: 1 + 0.3 * dm.rear, pull: (dm.R - dm.L) * 0.035 };
}

export const clampLat = (lat) => Math.max(-HALF_W - 2.5, Math.min(PIT_LAT + 2, lat));
