import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {clamp, ease} from '../anim';

export type CursorKey = {f: number; x: number; y: number};

export const Cursor: React.FC<{keys: CursorKey[]; clicks?: number[]; fadeIn?: number; fadeOut?: number}> = ({
  keys,
  clicks = [],
  fadeIn,
  fadeOut,
}) => {
  const frame = useCurrentFrame();
  const fs = keys.map((k) => k.f);
  const x = interpolate(frame, fs, keys.map((k) => k.x), {...clamp, easing: ease});
  const y = interpolate(frame, fs, keys.map((k) => k.y), {...clamp, easing: ease});
  const click = clicks.reduce((m, c) => {
    const d = frame - c;
    return d >= 0 && d < 8 ? Math.max(m, 1 - d / 8) : m;
  }, 0);
  const op =
    (fadeIn !== undefined ? interpolate(frame, [fadeIn, fadeIn + 6], [0, 1], clamp) : 1) *
    (fadeOut !== undefined ? interpolate(frame, [fadeOut, fadeOut + 6], [1, 0], clamp) : 1);
  return (
    <div style={{position: 'absolute', left: x, top: y, opacity: op, transform: `scale(${1 - click * 0.15})`, transformOrigin: '0 0', zIndex: 50}}>
      {clicks.map((c) => {
        const d = frame - c;
        if (d < 0 || d > 14) return null;
        const p = d / 14;
        return (
          <div key={c} style={{position: 'absolute', left: -30 * p - 4, top: -30 * p - 4, width: 8 + 60 * p, height: 8 + 60 * p,
            borderRadius: '50%', border: '2px solid rgba(255,255,255,0.9)', opacity: 1 - p}} />
        );
      })}
      <svg width={44} height={44} viewBox="0 0 24 24" style={{filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))'}}>
        <path d="M4 2.5l15 9.2-6.6 1.3 3.9 7-2.6 1.4-3.9-7-4.8 4.5z" fill="white" stroke="#111" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
    </div>
  );
};
