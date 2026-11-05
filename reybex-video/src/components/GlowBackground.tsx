import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {brand} from '../brand';
import {mixColor} from '../anim';

// Fließendes, weich geblurrtes Licht-Band in Markenfarbe.
export const GlowBackground: React.FC<{intensity: number; mix: number}> = ({intensity, mix}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const t = frame / 30;
  const c1 = mixColor(brand.primary, brand.secondary, mix);
  const c2 = mixColor(brand.accent, brand.secondaryAccent, mix);
  const s = Math.min(W, H) / 1080;

  const ribbon = (phase: number, k: number) =>
    `M ${-0.2 * W} ${1.1 * H}
     C ${0.2 * W + 120 * s * Math.sin(t * 0.9 + phase)} ${0.9 * H + 80 * s * Math.cos(t * 0.7 + phase)},
       ${0.3 * W + 140 * s * Math.cos(t * 0.6 + phase)} ${(0.25 + 0.05 * k) * H + 70 * s * Math.sin(t * 1.1 + phase)},
       ${0.58 * W + 90 * s * Math.sin(t * 0.8 + phase)} ${(0.38 - 0.04 * k) * H + 50 * s * Math.cos(t * 0.9)}
     S ${0.98 * W + 60 * s * Math.cos(t * 0.7 + phase)} ${(-0.02 + 0.03 * k) * H},
       ${1.25 * W} ${-0.25 * H}`;

  return (
    <AbsoluteFill style={{background: brand.bg, opacity: intensity}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute'}}>
        <defs>
          <linearGradient id="rg" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={c1} stopOpacity={0.2} />
            <stop offset="45%" stopColor={c1} />
            <stop offset="75%" stopColor={c2} />
            <stop offset="100%" stopColor={c1} stopOpacity={0.3} />
          </linearGradient>
          {[110, 55, 22, 8].map((d) => (
            <filter key={d} id={`b${d}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={d * s} />
            </filter>
          ))}
        </defs>
        <ellipse cx={W * 0.5} cy={H * 1.02} rx={W * 0.55} ry={H * 0.28} fill={c1} opacity={0.35} filter="url(#b110)" />
        <path d={ribbon(0, 0)} stroke="url(#rg)" strokeWidth={380 * s} fill="none" opacity={0.42} filter="url(#b110)" />
        <path d={ribbon(0.4, 1)} stroke="url(#rg)" strokeWidth={150 * s} fill="none" opacity={0.75} filter="url(#b55)" />
        <path d={ribbon(1.3, 2)} stroke={c2} strokeWidth={70 * s} fill="none" opacity={0.55} filter="url(#b22)" />
        <path d={ribbon(0.2, 0.5)} stroke="#ffffff" strokeWidth={14 * s} fill="none" opacity={0.5} filter="url(#b8)" />
      </svg>
    </AbsoluteFill>
  );
};
