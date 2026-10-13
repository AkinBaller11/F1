// Time-of-day presets: sun position/colour, ambient light, fog, sky gradient and floodlights
import * as THREE from 'three';

export const TOD = {
  morning: {
    sunAz: 75, sunEl: 13, sun: 0xffd2a0, sunInt: 2.2, hemiSky: 0xcfdcf2, hemiGround: 0x55603f, hemiInt: 0.95,
    fog: 0xdcd6cc, fogD: 0.0007, exposure: 1.0, env: 0.8, lamps: 0, shadow: 1,
    sky: ['#4f7fc4', '#9cb9dc', '#f2d4b4'], cloud: [255, 236, 220], clouds: 70, stars: 0, glow: '#ffd9a8',
  },
  noon: {
    sunAz: 160, sunEl: 58, sun: 0xfff3e0, sunInt: 2.7, hemiSky: 0xdbe8ff, hemiGround: 0x5a6b3c, hemiInt: 1.1,
    fog: 0xc9dcec, fogD: 0.00055, exposure: 1.05, env: 0.9, lamps: 0, shadow: 1,
    sky: ['#2f6cc4', '#7eaee6', '#d5e6f4'], cloud: [250, 250, 252], clouds: 60, stars: 0, glow: '#fffaf0',
  },
  evening: {
    sunAz: 255, sunEl: 6, sun: 0xff9550, sunInt: 2.3, hemiSky: 0xd9a99a, hemiGround: 0x3c3428, hemiInt: 0.75,
    fog: 0xe2a884, fogD: 0.0008, exposure: 1.0, env: 0.75, lamps: 0.7, shadow: 1,
    sky: ['#253a78', '#b4677a', '#ffae63'], cloud: [255, 170, 150], clouds: 80, stars: 0.15, glow: '#ff9a4a',
  },
  night: {
    sunAz: 200, sunEl: 72, sun: 0xdfe6ff, sunInt: 1.25, hemiSky: 0x3d4c70, hemiGround: 0x14181e, hemiInt: 0.7,
    fog: 0x0f1626, fogD: 0.0011, exposure: 1.2, env: 0.35, lamps: 1, shadow: 0.6,
    sky: ['#02040b', '#0a1226', '#1b2744'], cloud: [40, 46, 64], clouds: 40, stars: 1, glow: null,
  },
};

function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// equirectangular sky: gradient, clouds lit by the time of day, stars at night, optional overcast
export function skyTexture(t, overcast = false) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  if (overcast) {
    const k = t.stars > 0.5 ? 0.28 : t.sunEl < 10 ? 0.7 : 1;
    const sh = (v) => Math.round(v * k);
    grd.addColorStop(0, `rgb(${sh(104)},${sh(112)},${sh(120)})`);
    grd.addColorStop(0.6, `rgb(${sh(150)},${sh(156)},${sh(162)})`);
    grd.addColorStop(1, `rgb(${sh(178)},${sh(182)},${sh(186)})`);
  } else {
    grd.addColorStop(0, t.sky[0]); grd.addColorStop(0.62, t.sky[1]); grd.addColorStop(1, t.sky[2]);
  }
  g.fillStyle = grd; g.fillRect(0, 0, 2048, 512);
  g.fillStyle = overcast ? '#555a5e' : t.sky[2]; g.fillRect(0, 512, 2048, 512);
  const r = rand(overcast ? 99 : 7);
  if (t.stars && !overcast) {
    for (let i = 0; i < 1400 * t.stars; i++) {
      const y = r() * 470, a = (0.3 + r() * 0.7) * (1 - y / 520);
      g.fillStyle = `rgba(255,255,255,${a})`;
      const s = r() < 0.04 ? 2 : 1;
      g.fillRect(r() * 2048, y, s, s);
    }
  }
  const n = overcast ? 320 : t.clouds;
  const [cr, cg, cb] = t.cloud;
  for (let i = 0; i < n; i++) {
    const x = r() * 2048, y = 150 + r() * 330;
    const rad = 26 + r() * (overcast ? 110 : 70);
    const gg = g.createRadialGradient(x, y, 0, x, y, rad);
    const k = overcast ? 0.45 + r() * 0.3 : 0.85 + r() * 0.15;
    const col = overcast ? [cr * 0.6 + 60, cg * 0.6 + 62, cb * 0.6 + 66].map((v) => Math.round(v * (t.stars > 0.5 ? 0.35 : 1))) : [cr * k, cg * k, cb * k].map(Math.round);
    gg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${overcast ? 0.55 : 0.5})`);
    gg.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle = gg;
    g.beginPath(); g.ellipse(x, y, rad * 2.4, rad * 0.6, 0, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function sunDir(t) {
  const az = (t.sunAz * Math.PI) / 180, el = (t.sunEl * Math.PI) / 180;
  // azimuth measured from north (-z) clockwise toward east (+x)
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export function sunSprite(t) {
  if (!t.glow) return null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,250,1)');
  gr.addColorStop(0.08, 'rgba(255,250,235,1)');
  gr.addColorStop(0.18, t.glow + 'aa');
  gr.addColorStop(1, t.glow + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(t.sunEl < 20 ? 900 : 600);
  s.renderOrder = -1;
  return s;
}
