import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {content} from '../content';
import {blurIn, lerp, sp, easeIn} from '../anim';
import {glassPill} from '../components/Glass';
import {Icon, PILL_ICONS} from '../components/Icon';
import {Cursor} from '../components/Cursor';

const PILL_W = 300;
const GAP = 18;

export const Pills: React.FC = () => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const vertical = H > W;
  const sel = content.selectedPill;
  const CLICK = 24;
  const active = lerp(f, CLICK, CLICK + 5, 0, 1);
  const othersOut = lerp(f, 29, 40, 0, 1);
  const zoom = lerp(f, 31, 51, 0, 1, easeIn);
  const scale = 1 + zoom * 6;
  const fadeIn = lerp(f, 0, 6, 0, 1);

  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: `scale(${scale})`,
      filter: `blur(${zoom * 14}px)`, opacity: (1 - lerp(f, 44, 51, 0, 1)) * fadeIn}}>
      <div style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: GAP}}>
        {content.pills.map((label, i) => {
          const dist = Math.abs(i - sel);
          const p = sp(f, 2 + dist * 3, 15, 130);
          const dir = i - sel;
          const isSel = i === sel;
          const off = (1 - p) * -dir * (vertical ? 70 : PILL_W * 0.6);
          return (
            <div key={label} style={{
              ...glassPill(isSel ? active : 0), width: PILL_W,
              ...blurIn(p * (isSel ? 1 : 1 - othersOut), 18),
              transform: `${vertical ? `translateY(${off}px)` : `translateX(${off}px)`} scale(${(0.8 + 0.2 * p) * (isSel ? 1 + 0.08 * active - 0.05 * lerp(f, CLICK - 2, CLICK + 1, 0, 1) * (1 - active) : 1 - 0.1 * othersOut)})`,
            }}>
              <Icon name={PILL_ICONS[i]} size={30} />
              {label}
            </div>
          );
        })}
      </div>
      <Cursor
        keys={[
          {f: 6, x: W * 0.78, y: H * 0.86},
          {f: 22, x: W / 2 + 20, y: H / 2 + 8},
          {f: 40, x: W / 2 + 26, y: H / 2 + 14},
        ]}
        clicks={[CLICK]}
        fadeIn={6}
        fadeOut={30}
      />
    </AbsoluteFill>
  );
};
