import React from 'react';
import {useCurrentFrame} from 'remotion';
import {brand} from '../brand';
import type {Seg} from '../content';

export const segLength = (segs: Seg[]) => segs.reduce((n, s) => n + s.text.length, 0);

export const Typewriter: React.FC<{
  segments: Seg[];
  start: number;
  cps?: number; // Zeichen pro Frame
  cursor?: boolean;
  hlColor?: string;
  style?: React.CSSProperties;
}> = ({segments, start, cps = 2, cursor = true, hlColor = brand.accent, style}) => {
  const frame = useCurrentFrame();
  const total = segLength(segments);
  const shown = Math.max(0, Math.min(total, Math.floor((frame - start) * cps)));
  const typing = shown > 0 && shown < total;
  let left = shown;
  const blinkOn = typing || Math.floor(frame / 15) % 2 === 0;
  return (
    <span style={style}>
      {segments.map((s, i) => {
        const part = s.text.slice(0, Math.max(0, left));
        left -= s.text.length;
        return (
          <span key={i} style={s.hl ? {color: hlColor, textShadow: `0 0 24px ${hlColor}88`} : undefined}>
            {part}
          </span>
        );
      })}
      {cursor && frame >= start - 6 && (
        <span
          style={{
            display: 'inline-block',
            width: '0.07em',
            height: '1.05em',
            marginLeft: '0.06em',
            verticalAlign: '-0.15em',
            background: brand.text,
            opacity: blinkOn ? 0.9 : 0,
          }}
        />
      )}
    </span>
  );
};
