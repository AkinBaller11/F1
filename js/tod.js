// Time-of-day presets: sun position/colour, ambient light, fog, sky gradient and floodlights
import * as THREE from 'three';

export const TOD = {
  morning: {
    sunAz: 75, sunEl: 13, sun: 0xffd2a0, sunInt: 2.2, hemiSky: 0xcfdcf2, hemiGround: 0x55603f, hemiInt: 0.95,
    fog: 0xdcd6cc, fogD: 0.00048, exposure: 1.03, env: 0.85, lamps: 0, shadow: 1,
    sky: ['#4f7fc4', '#9cb9dc', '#f2d4b4'], cloud: [255, 236, 220], clouds: 70, stars: 0, glow: '#ffd9a8',
  },
  noon: {
    // strong direct sun, less (blue) sky fill: contrast and neutral colours of a clear midday
    sunAz: 160, sunEl: 58, sun: 0xfff1de, sunInt: 3.5, hemiSky: 0xe2eaf6, hemiGround: 0x67683f, hemiInt: 0.85,
    fog: 0xcfe0ee, fogD: 0.00035, exposure: 1.08, env: 0.75, lamps: 0, shadow: 1,
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
export function skyTexture(t, overcast = false, cloudsOnly = false) {
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
  if (!cloudsOnly) { // clouds only: transparent layer over the physical sky
    g.fillStyle = grd; g.fillRect(0, 0, 2048, 512);
    g.fillStyle = overcast ? '#555a5e' : t.sky[2]; g.fillRect(0, 512, 2048, 512);
  }
  const r = rand(overcast ? 99 : 7);
  if (t.stars && !overcast && !cloudsOnly) {
    for (let i = 0; i < 1400 * t.stars; i++) {
      const y = r() * 470, a = (0.3 + r() * 0.7) * (1 - y / 520);
      g.fillStyle = `rgba(255,255,255,${a})`;
      const s = r() < 0.04 ? 2 : 1;
      g.fillRect(r() * 2048, y, s, s);
    }
  }
  if (!overcast && t.clouds) { cumulus(g, t, r); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex; }
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

// fair-weather cumulus: fractal noise on a horizontal cloud layer seen from the ground (so the clouds shrink and
// crowd towards the horizon like real ones), flat grey bases, bright sunlit tops. Drawn into the upper half of the
// equirectangular sky (rows 0..512 = zenith..horizon) at quarter resolution and scaled up (soft edges anyway).
function cumulus(g, t, r) {
  const G = 256, grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = grid[(yi & 255) * G + (xi & 255)], b = grid[(yi & 255) * G + ((xi + 1) & 255)];
    const c = grid[((yi + 1) & 255) * G + (xi & 255)], d = grid[((yi + 1) & 255) * G + ((xi + 1) & 255)];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const fbm = (x, y) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < 5; o++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };
  const W = 512, H = 128, [cr, cg, cb] = t.cloud;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'), img = cx.createImageData(W, H), px = img.data;
  const cover = Math.min(0.75, t.clouds / 170); // share of the sky covered (noon 60 -> ~35 %)
  const thr = 0.62 - cover * 0.3;
  for (let y = 0; y < H; y++) {
    const el = (1 - (y + 0.5) / H) * Math.PI / 2; // elevation of this row
    // distance to the cloud layer (in layer heights), capped: further out one texel would span many cloud cells
    // and the noise aliased into stripes near the horizon
    const dist = Math.min(9, 1 / Math.max(Math.tan(el), 0.02));
    for (let x = 0; x < W; x++) {
      const az = (x / W) * Math.PI * 2;
      const u = Math.sin(az) * dist * 1.6 + 60, v = Math.cos(az) * dist * 1.6 + 60;
      const n = fbm(u, v);
      let a = Math.min(1, Math.max(0, (n - thr) / 0.16));
      a *= Math.min(1, el / 0.16); // fade into the horizon haze
      // shading: denser core darker underneath, edges bright
      const core = Math.min(1, Math.max(0, (n - thr - 0.08) / 0.2));
      const shade = 1 - core * 0.28 * (0.6 + 0.4 * Math.min(1, el * 2));
      const k = (x + y * W) * 4;
      px[k] = Math.min(255, cr * shade); px[k + 1] = Math.min(255, cg * shade); px[k + 2] = Math.min(255, cb * shade);
      px[k + 3] = Math.round(a * 235 * Math.min(1, 0.45 + el)); // thinner haze-like near the horizon
    }
  }
  cx.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(cv, 0, 0, 2048, 512);
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
