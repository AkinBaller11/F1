// Procedural canvas textures (no external assets needed)
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeatX = 1, repeatY = 1, aniso = 16) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function asphalt(wet) {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const r = rand(7);
  g.fillStyle = wet ? '#3a3c40' : '#55575b';
  g.fillRect(0, 0, S, S);
  // aggregate: dense speckle in several sizes and tones
  for (let i = 0; i < 120000; i++) {
    const v = (wet ? 40 : 66) + r() * 58;
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.3 + r() * 0.45})`;
    const s = r() < 0.92 ? 1 + r() * 1.5 : 2 + r() * 2.5;
    g.fillRect(r() * S, r() * S, s, s);
  }
  // patches of older / newer tarmac
  for (let i = 0; i < 26; i++) {
    const x = r() * S, y = r() * S, w = 60 + r() * 240, h = 40 + r() * 200;
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
    g.fillRect(x, y, w, h);
  }
  // rubbered-in racing line darkening in the middle band
  const grd = g.createLinearGradient(0, 0, S, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.32, 'rgba(10,10,12,0.25)');
  grd.addColorStop(0.68, 'rgba(10,10,12,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // white edge lines with a slightly worn look
  g.fillStyle = '#ececec';
  g.fillRect(8, 0, 18, S); g.fillRect(S - 26, 0, 18, S);
  for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(80,80,80,0.5)'; g.fillRect(8 + r() * 18, r() * S, 1.5, 1.5); g.fillRect(S - 26 + r() * 18, r() * S, 1.5, 1.5); }
  return tex(c, 1, 1);
}

// tangent-space normal map from value noise (gives asphalt and grass a real surface under the light)
export function noiseNormal(size = 512, seed = 3, scale = 1, strength = 2.2) {
  const r = rand(seed);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = r();
  // two blur passes = soft grains
  const blur = (src) => { const o = new Float32Array(src.length); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy + size) % size) * size + ((x + dx + size) % size)]; o[y * size + x] = s / 9; } return o; };
  let hh = blur(h); if (scale > 1) hh = blur(hh);
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const L = hh[y * size + ((x - 1 + size) % size)], R = hh[y * size + ((x + 1) % size)];
    const U = hh[((y - 1 + size) % size) * size + x], D = hh[((y + 1) % size) * size + x];
    let nx = (L - R) * strength, ny = (U - D) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * size + x) * 4;
    img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  return t;
}

export function kerb() {
  const [c, g] = canvas(64, 256);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#f2f2f2' : '#d4121a';
    g.fillRect(0, i * 64, 64, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(0, 0, 8, 256);
  return tex(c, 1, 1);
}

export function grass() {
  const [c, g] = canvas(512, 512);
  const r = rand(3);
  g.fillStyle = '#3f6b2a';
  g.fillRect(0, 0, 512, 512);
  // mowing stripes
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(0, i * 64, 512, 64);
  }
  for (let i = 0; i < 30000; i++) {
    const gr = 80 + r() * 70;
    g.fillStyle = `rgba(${gr * 0.45},${gr},${gr * 0.3},0.35)`;
    g.fillRect(r() * 512, r() * 512, 1, 2 + r() * 2);
  }
  return tex(c, 1, 1);
}

export function gravel() {
  const [c, g] = canvas(256, 256);
  const r = rand(11);
  g.fillStyle = '#b9a98a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 140 + r() * 90;
    g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.78})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  return tex(c, 1, 1);
}

export function runoff() {
  const [c, g] = canvas(256, 256);
  const r = rand(5);
  g.fillStyle = '#5c5f63';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 70 + r() * 50;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * 256, r() * 256, 1, 1);
  }
  // painted red/blue stripes like modern run-off areas
  g.fillStyle = '#9c2a2a';
  g.fillRect(0, 0, 256, 60);
  g.fillStyle = '#2d4d8a';
  g.fillRect(0, 196, 256, 60);
  return tex(c, 1, 1);
}

const SPONSORS = [
  ['#0b1e3d', '#ffffff', 'NOVA AIR'],
  ['#ffcc00', '#d40511', 'SWIFTPOST'],
  ['#5b0e2d', '#ffffff', 'AURELIA AIRWAYS'],
  ['#1a1a1a', '#e10600', 'GRAN PREMIO'],
  ['#e2231a', '#ffffff', 'Lumeno'],
  ['#3d2a1a', '#e8d5a8', 'MAISON VÉRITÉ'],
  ['#0f2a5c', '#ffffff', 'OCEANIC'],
  ['#ffffff', '#111111', 'KRONOS'],
  ['#00205b', '#ffffff', 'ESPAÑA GP'],
  ['#23272b', '#9be22d', 'PULSE'],
];

export function banner(i) {
  const [bg, fg, text] = SPONSORS[i % SPONSORS.length];
  const [c, g] = canvas(1024, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = fg;
  g.font = `bold ${text.length > 10 ? 64 : 80}px "Titillium Web", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 68, 900);
  return tex(c, 1, 1);
}
export const SPONSOR_COUNT = SPONSORS.length;

export function crowd() {
  const [c, g] = canvas(512, 256);
  const r = rand(21);
  g.fillStyle = '#2b2f36'; g.fillRect(0, 0, 512, 256);
  const cols = ['#d4121a', '#f6c600', '#ffffff', '#ff8000', '#1e5bc6', '#222', '#0a7d3b', '#c9c9c9'];
  for (let row = 0; row < 16; row++) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, row * 16 + 14, 512, 2);
    for (let x = 0; x < 512; x += 6) {
      if (r() < 0.12) continue;
      g.fillStyle = cols[(r() * cols.length) | 0];
      g.fillRect(x + r() * 2, row * 16 + 4 + r() * 3, 4, 9);
      g.fillStyle = '#e0b48f';
      g.fillRect(x + 1 + r() * 2, row * 16 + 1 + r() * 2, 3, 3);
    }
  }
  return tex(c, 4, 1);
}

export function sky(wet) {
  const [c, g] = canvas(1024, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  if (wet) {
    grd.addColorStop(0, '#6d747c');
    grd.addColorStop(0.5, '#9aa1a8');
    grd.addColorStop(1, '#b8bcc0');
  } else {
    grd.addColorStop(0, '#3f78c4');
    grd.addColorStop(0.55, '#8fb8e6');
    grd.addColorStop(1, '#d7e6f3');
  }
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  const r = rand(wet ? 99 : 42);
  const n = wet ? 260 : 70;
  for (let i = 0; i < n; i++) {
    const x = r() * 1024, y = 60 + r() * 330;
    const rad = 20 + r() * (wet ? 90 : 55);
    const gg = g.createRadialGradient(x, y, 0, x, y, rad);
    const shade = wet ? 120 + r() * 70 : 235 + r() * 20;
    gg.addColorStop(0, `rgba(${shade},${shade},${shade + 4},${wet ? 0.5 : 0.55})`);
    gg.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    g.fillStyle = gg;
    g.beginPath(); g.ellipse(x, y, rad * 2.2, rad * 0.7, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function tyreSide(compound) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#141414'; g.fillRect(0, 0, 256, 256);
  const cx = 128, cy = 128;
  g.strokeStyle = compound; g.lineWidth = 9;
  g.beginPath(); g.arc(cx, cy, 96, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e8e8e8';
  g.font = 'bold 22px Arial';
  g.textAlign = 'center';
  for (let i = 0; i < 2; i++) {
    g.save(); g.translate(cx, cy); g.rotate(i * Math.PI);
    g.fillText('P ZERO', 0, -108); g.restore();
  }
  g.fillStyle = '#2a2a2a';
  g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#555';
  g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function tyreTread() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(70,70,70,0.6)';
    g.fillRect(i * 6.4, 0, 2, 64);
  }
  return tex(c, 1, 1);
}

export function particle() {
  const [c, g] = canvas(64, 64);
  const gg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gg.addColorStop(0, 'rgba(255,255,255,0.9)');
  gg.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gg; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function distanceBoard(n) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#111';
  g.font = 'bold 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function liveryText(text, bg, fg, w = 512, h = 128, font = 70) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `italic bold ${font}px Arial`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
