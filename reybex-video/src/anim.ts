import {interpolate, spring, Easing} from 'remotion';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const sp = (frame: number, delay = 0, damping = 20, stiffness = 120, mass = 0.8) =>
  spring({frame: frame - delay, fps: 30, config: {damping, stiffness, mass}});

export const ease = Easing.bezier(0.33, 0, 0.15, 1);
export const easeIn = Easing.bezier(0.55, 0, 0.9, 0.4);

export const lerp = (f: number, a: number, b: number, from: number, to: number, e = ease) =>
  interpolate(f, [a, b], [from, to], {...clamp, easing: e});

// Blur-in Stil: p 0 → 1
export const blurIn = (p: number, blur = 20) => ({
  opacity: Math.min(1, Math.max(0, p)),
  filter: `blur(${Math.max(0, (1 - p) * blur)}px)`,
});

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mixColor = (a: string, b: string, t: number, alpha = 1) => {
  const A = hex(a);
  const B = hex(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
};
