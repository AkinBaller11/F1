// Reproducible driving tests for the player's vehicle model (js/physics.js + js/vehicle.js).
// Runs in the browser (the game's modules need the three.js import map): load index.html, then
//   const { runAll } = await import('/tests/vehicle-tests.js'); console.table(await runAll());
// Every test drives on a synthetic, flat and endless test pad with a fixed time step and no randomness,
// so the same code always gives the same numbers.
import { PlayerCar, steerLock } from '../js/physics.js';
import { VEH, lateralLimit, brakeLimit } from '../js/vehicle.js';
import { newTyreSet, stepTyres, stepBrake, gripTemp, tyreFactors } from '../js/tyres.js';

const G = 9.81;

// endless straight along -z (yaw 0 drives straight ahead); `surface` sets what is beside the road
function testPad({ halfWidth = 1e4, gravel = 0, mu = 1, wet = false, height = null } = {}) {
  const one = (v) => [v];
  return {
    N: 1, length: 1e9, mu, wet, ds: 2, hw: one(halfWidth), kerbL: one(0), kerbR: one(0), gravelL: one(gravel), gravelR: one(gravel),
    limL: one(1e6), limR: one(1e6), tx: one(0), tz: one(-1),
    hs: height ? [0] : undefined,
    hAt: (s) => (height ? height(s) : 0),
    vCurvAt: (s) => (height ? (height(s + 24) - 2 * height(s) + height(s - 24)) / 576 : 0),
    gradeAt(s) { return height ? (height(s + 6) - height(s - 6)) / 12 : 0; },
    locate(x, z, hint, out) { out.i = 0; out.s = -z; out.lat = x; return out; },
    frame(s) { return { x: 0, z: -s, tx: 0, tz: -1, rx: 1, rz: 0 }; },
    racingLat: () => 0, targetSpeed: () => 100, posAt: (s, lat) => [lat, -s, 0],
  };
}

function newCar(pad, opts = {}) {
  const car = new PlayerCar(pad, { tc: 'full', abs: true, ...opts });
  car.placeAt(0, 0);
  return car;
}
const input = () => ({ throttle: 0, brake: 0, steer: 0, analog: true });
const maxSteer = steerLock; // same mapping as physics.js

// speed holder: throttle / brake from the speed error
function holdSpeed(car, inp, vT) {
  const e = vT - car.v;
  inp.throttle = Math.max(0, Math.min(1, e * 0.6 + 0.25));
  inp.brake = e < -1 ? Math.min(1, -e * 0.2) : 0;
}
// pure pursuit on a circle of radius R around (cx, cz), driving clockwise (right-hand turn)
// plus a PI term on the radius error: pure pursuit alone knows no slip angles and runs wide as they grow
function pursueCircle(car, inp, cx, cz, R, dt = 1 / 120) {
  const ang = Math.atan2(car.z - cz, car.x - cx);
  const look = Math.max(12, Math.abs(car.v) * 0.5);
  const a2 = ang + look / R; // clockwise in screen x/z = increasing atan2 here (z grows "down")
  const tx = cx + Math.cos(a2) * R, tz = cz + Math.sin(a2) * R;
  const dx = tx - car.x, dz = tz - car.z;
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  const alpha = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  const err = Math.hypot(car.x - cx, car.z - cz) - R;
  car._I = Math.max(-0.1, Math.min(0.1, (car._I || 0) + err * 0.004 * dt));
  const delta = Math.atan((2 * VEH.L * Math.sin(alpha)) / Math.hypot(dx, dz)) + 0.006 * err + car._I;
  inp.steer = Math.max(-1, Math.min(1, delta / maxSteer(car.v)));
  return err;
}

export function accelTest(dt = 1 / 120) {
  const car = newCar(testPad()), inp = input();
  let t = 0, t100 = null, t200 = null, t300 = null;
  inp.throttle = 1;
  while (t < 40) {
    car.update(dt, inp, true); t += dt;
    const k = car.v * 3.6;
    if (t100 === null && k >= 100) t100 = t;
    if (t200 === null && k >= 200) t200 = t;
    if (t300 === null && k >= 300) t300 = t;
  }
  return { test: 'Beschleunigung', '0-100 s': t100?.toFixed(2), '0-200 s': t200?.toFixed(2), '0-300 s': t300?.toFixed(2), 'v nach 40 s km/h': (car.v * 3.6).toFixed(1) };
}

export function brakeTest(v0 = 300 / 3.6, abs = true, bias = 0.56, dt = 1 / 120) {
  const car = newCar(testPad(), { abs }), inp = input();
  car.setup.bias = bias; car.v = v0; car.gear = 8;
  inp.brake = 1;
  let t = 0, dist = 0, peak = 0, t100 = null, yawMax = 0;
  while (car.v > 0.1 && t < 20) {
    const v = car.v;
    car.update(dt, inp, true); t += dt; dist += v * dt;
    peak = Math.max(peak, (v - car.v) / dt);
    yawMax = Math.max(yawMax, Math.abs(car.yaw));
    if (t100 === null && car.v * 3.6 <= 100) t100 = t;
  }
  return {
    test: `Bremsen ${Math.round(v0 * 3.6)}→0 ${abs ? 'ABS' : 'ohne ABS'} Bias ${Math.round(bias * 100)} %`,
    'Weg m': dist.toFixed(1), 'Zeit s': t.toFixed(2), 'bis 100 km/h s': t100?.toFixed(2), 'max Verz. g': (peak / G).toFixed(2),
    'Modell-Grenze bei v0 g': (brakeLimit(v0, 1, bias) / G).toFixed(2), 'max Gierwinkel °': (yawMax * 180 / Math.PI).toFixed(1),
  };
}

// steady circle with slowly rising speed: the highest lateral acceleration the car holds on the radius
export function circleTest(R = 100, dt = 1 / 120) {
  const car = newCar(testPad()), inp = input();
  const cx = car.x + R, cz = car.z; // centre to the right of the car
  car.v = 0; car.gear = 1;
  // start at 75 % of the speed the model predicts for this radius, then ramp up slowly
  let vS = 10; for (let k = 0; k < 40; k++) vS = Math.sqrt(R * lateralLimit(vS, 1));
  vS = Math.min(vS, 86); // above ~310 km/h the circle is limited by power, not grip
  let vT = 0.75 * vS, t = 0, best = { ay: 0, v: 0, beta: 0, steer: 0 }, lost = null;
  while (t < 240) {
    holdSpeed(car, inp, vT);
    const err = pursueCircle(car, inp, cx, cz, R, dt);
    car.update(dt, inp, true); t += dt;
    if (t > 6) vT += 0.25 * dt; // slow ramp: quasi-steady
    const ay = (car.v * car.v) / R;
    if (Math.abs(err) < 1.5 && t > 6 && ay > best.ay && Math.abs(car.v - vT) < 1) best = { ay, v: car.v, beta: Math.atan2(car.vy, car.v), steer: car.steer };
    if (Math.abs(err) > 4 && t > 6) { lost = { v: car.v, err }; break; }
  }
  return {
    test: `Kreisfahrt R=${R} m`, 'max ay g': (best.ay / G).toFixed(2), 'bei km/h': (best.v * 3.6).toFixed(0),
    'Modell-Grenze g': (lateralLimit(best.v, 1) / G).toFixed(2), 'Schwimmwinkel °': (best.beta * 180 / Math.PI).toFixed(2),
    'Lenk-Eingabe': best.steer.toFixed(3), 'verlässt Radius bei km/h': lost ? (lost.v * 3.6).toFixed(0) + (lost.err > 0 ? ' (schiebt nach außen)' : ' (dreht ein)') : '-',
  };
}

// step steer at constant speed: yaw-rate rise time, overshoot, stability
export function stepSteerTest(kmh = 200, steer = 0.5, dt = 1 / 120) {
  const car = newCar(testPad()), inp = input(), v0 = kmh / 3.6;
  car.v = v0; car.gear = 7;
  let t = 0, r90 = null, rMax = 0, rEnd = 0, ayEnd = 0, slipMax = 0;
  const hist = [];
  while (t < 5) {
    holdSpeed(car, inp, v0);
    inp.steer = t > 1 ? steer : 0;
    car.update(dt, inp, true); t += dt;
    hist.push([t, car.yawRate]);
    rMax = Math.max(rMax, car.yawRate);
    slipMax = Math.max(slipMax, Math.abs(Math.atan2(car.vy, car.v)));
  }
  rEnd = car.yawRate; ayEnd = car.ay;
  for (const [tt, r] of hist) if (tt > 1 && r >= 0.9 * rEnd) { r90 = tt - 1; break; }
  return {
    test: `Lenkwinkelsprung ${kmh} km/h, Eingabe ${steer}, dt=1/${Math.round(1 / dt)}`, 'Gierrate Ende °/s': (rEnd * 180 / Math.PI).toFixed(2),
    'ay Ende g': (ayEnd / G).toFixed(2), '90 % nach s': r90?.toFixed(3), 'Überschwingen %': (100 * (rMax / rEnd - 1)).toFixed(1),
    'max Schwimmwinkel °': (slipMax * 180 / Math.PI).toFixed(2),
  };
}

// straight at top speed with a small steering wobble: response must stay small and die out
export function highSpeedTest(dt = 1 / 120) {
  const car = newCar(testPad()), inp = input();
  car.v = 88; car.gear = 8;
  let t = 0, rMaxEarly = 0, rMaxLate = 0;
  while (t < 12) {
    inp.throttle = 1;
    inp.steer = t < 6 ? 0.04 * Math.sin(t * 2 * Math.PI) : 0;
    car.update(dt, inp, true); t += dt;
    if (t < 6) rMaxEarly = Math.max(rMaxEarly, Math.abs(car.yawRate)); else if (t > 8) rMaxLate = Math.max(rMaxLate, Math.abs(car.yawRate));
  }
  return { test: 'Hochgeschwindigkeit 317 km/h, Lenkzittern', 'max Gierrate °/s': (rMaxEarly * 180 / Math.PI).toFixed(2), 'Gierrate 2 s nach Ende °/s': (rMaxLate * 180 / Math.PI).toFixed(3), 'Speed km/h': (car.v * 3.6).toFixed(0), 'Seitenversatz m': car.x.toFixed(2) };
}

// trail braking in a 2 g corner without ABS: rearward bias locks the rears (spin), forward bias the fronts
export function trailBrakeTest(bias, pedal = 0.3, dt = 1 / 120) {
  const car = newCar(testPad(), { abs: false }), inp = input(), R = 120;
  car.setup.bias = bias; car.v = 140 / 3.6; car.gear = 5;
  const cx = car.x + R, cz = car.z;
  let t = 0, yawSlip = 0, err = 0;
  while (t < 4) {
    if (t < 1.5) holdSpeed(car, inp, 140 / 3.6); else { inp.throttle = 0; inp.brake = pedal; }
    err = pursueCircle(car, inp, cx, cz, R, dt);
    car.update(dt, inp, true); t += dt;
    if (car.v > 10) yawSlip = Math.max(yawSlip, Math.abs(Math.atan2(car.vy, Math.abs(car.v))));
    else break;
  }
  return { test: `Bremsen in der Kurve (1,3 g, 140 km/h) ohne ABS, Pedal ${Math.round(pedal * 100)} % (≈${(pedal * VEH.brakeMax / VEH.mass / G).toFixed(1)} g), Bias ${Math.round(bias * 100)} %`, 'max Schwimmwinkel °': (yawSlip * 180 / Math.PI).toFixed(1), 'Radius-Abweichung m': err.toFixed(1), 'Ergebnis': yawSlip > 0.5 ? 'Dreher (Heck überlastet)' : err > 3 ? 'schiebt geradeaus (Front überlastet)' : 'bleibt auf Kurs' };
}

export function gravelTest(dt = 1 / 120) {
  const pad = testPad({ halfWidth: 0, gravel: 1 });
  const car = newCar(pad), inp = input();
  car.v = 150 / 3.6; car.gear = 5;
  let t = 0, dist = 0;
  while (car.v > 0.5 && t < 20) { const v = car.v; car.update(dt, inp, true); t += dt; dist += v * dt; }
  return { test: 'Kiesbett ab 150 km/h, ohne Bremse', 'Weg m': dist.toFixed(1), 'Zeit s': t.toFixed(2), 'mittl. Verz. g': ((150 / 3.6) / t / G).toFixed(2) };
}

// crest (Raidillon-like: vertical radius 150 m) at speed: wheel loads drop, downforce keeps the car on the road
export function crestTest(kmh = 290, dt = 1 / 120) {
  const Rv = 150, pad = testPad({ height: (s) => -((s - 200) ** 2) / (2 * Rv) });
  const car = newCar(pad), inp = input();
  car.v = kmh / 3.6; car.gear = 8;
  let t = 0, minLoad = 1e9, flatLoad = 0, vCrest = 0;
  while (t < 3) {
    holdSpeed(car, inp, kmh / 3.6);
    car.update(dt, inp, true); t += dt;
    const sum = car.load[0] + car.load[1] + car.load[2] + car.load[3];
    if (t < 0.05) flatLoad = sum;
    if (Math.abs(car.s - 200) < 30 && sum < minLoad) { minLoad = sum; vCrest = car.v; }
  }
  return { test: `Kuppe R=${Rv} m bei ${kmh} km/h`, 'Radlast gesamt kN (Kuppe)': (minLoad / 1000).toFixed(1), 'Gewicht kN': (VEH.mass * G / 1000).toFixed(1), 'Abtrieb dort kN': ((0.5 * VEH.rho * VEH.ClA * vCrest ** 2) / 1000).toFixed(1), 'km/h dort': (vCrest * 3.6).toFixed(0) };
}

export function lockTest(dt = 1 / 120) {
  const car = newCar(testPad()), inp = input();
  let t = 0, minX = 0, maxX = 0;
  while (t < 20) {
    holdSpeed(car, inp, 10 / 3.6);
    inp.steer = 1;
    car.update(dt, inp, true); t += dt;
    if (t > 8) { minX = Math.min(minX, car.x); maxX = Math.max(maxX, car.x); }
  }
  return { test: 'Volleinschlag 10 km/h', 'Wendekreis-Radius m': ((maxX - minX) / 2).toFixed(2) };
}

// tyres on a 100 m circle at 85 % of the limit for 90 s (medium, 30 °C air, 40 °C track), the thermal model
// stepped at the game's frame rate dt; wear without race compression
export function tyreThermalTest(frameDt = 1 / 30) {
  const car = newCar(testPad()), inp = input(), R = 100, set = newTyreSet('M', 70);
  const cx = car.x + R, cz = car.z;
  let vS = 10; for (let k = 0; k < 40; k++) vS = Math.sqrt(R * lateralLimit(vS, 1));
  const vT = vS * Math.sqrt(0.85), sub = Math.round(frameDt * 120);
  let t = 0, Tb = 300, dist = 0;
  car.v = vT; car.gear = 5;
  while (t < 90) {
    for (let k = 0; k < sub; k++) { holdSpeed(car, inp, vT); pursueCircle(car, inp, cx, cz, R, 1 / 120); car.update(1 / 120, inp, true); dist += car.v / 120; }
    t += frameDt;
    for (let i = 0; i < 4; i++) { set.E[i] += car.tyreE[i]; set.R[i] += car.tyreR[i]; car.tyreE[i] = car.tyreR[i] = 0; }
    stepTyres(set, frameDt, car.v, 30, 40, 0, 1);
    Tb = stepBrake(Tb, car.brakeE, frameDt, car.v, 30); car.brakeE = 0;
    tyreFactors(set, car.tyreMu);
  }
  const f = (a) => a.map((x) => Math.round(x)).join('/');
  return { test: `Reifenthermik Kreis R=100, 85 % Grenze, Takt 1/${Math.round(1 / frameDt)}`, 'Lauffläche °C FL/FR/RL/RR': f(set.Ts), 'Karkasse °C': f(set.Tc), 'Grip-Temp °C': f([0, 1, 2, 3].map((i) => gripTemp(set, i))), 'Verschleiß je km (ohne Zeitraffer)': set.wear.map((w) => (w / (dist / 1000)).toFixed(4)).join('/'), 'Grip-Faktor': car.tyreMu.map((x) => x.toFixed(3)).join('/') };
}

export async function runAll() {
  return [
    accelTest(), brakeTest(), brakeTest(200 / 3.6), brakeTest(300 / 3.6, false), circleTest(30), circleTest(100), circleTest(300),
    stepSteerTest(200, 0.2, 1 / 60), stepSteerTest(200, 0.2, 1 / 120), stepSteerTest(200, 0.2, 1 / 240), stepSteerTest(200, 0.5), stepSteerTest(100, 0.5),
    highSpeedTest(), trailBrakeTest(0.56, 0.2), trailBrakeTest(0.48), trailBrakeTest(0.56), trailBrakeTest(0.64), trailBrakeTest(0.56, 1), gravelTest(), crestTest(), lockTest(), tyreThermalTest(1 / 30), tyreThermalTest(1 / 120),
  ];
}

// time series of the trail-braking test (debugging aid)
export function trailBrakeTrace(bias = 0.56, pedal = 0.3, dt = 1 / 120) {
  const car = newCar(testPad(), { abs: false }), inp = input(), R = 120;
  car.setup.bias = bias; car.v = 140 / 3.6; car.gear = 5;
  const cx = car.x + R, cz = car.z, out = [];
  for (let t = 0; t < 3.2; t += dt) {
    if (t < 1.5) holdSpeed(car, inp, 140 / 3.6); else { inp.throttle = 0; inp.brake = pedal; }
    const err = pursueCircle(car, inp, cx, cz, R, dt);
    car.update(dt, inp, true);
    if (Math.round(t * 120) % 12 === 0 && t > 1.3) out.push({ t: t.toFixed(2), v: (car.v * 3.6).toFixed(0), beta: (Math.atan2(car.vy, car.v) * 57.3).toFixed(1), r: (car.yawRate * 57.3).toFixed(1), steer: car.steer.toFixed(2), aF: (car.aF * 57.3).toFixed(1), aR: (car.aR * 57.3).toFixed(1), useF: car.usage[0].toFixed(2), useR: car.usage[1].toFixed(2), lock: car.lockup, loads: car.load.map((x) => Math.round(x)).join('/'), err: err.toFixed(1) });
  }
  return out;
}
