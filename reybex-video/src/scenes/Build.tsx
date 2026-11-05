import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {brand} from '../brand';
import {content} from '../content';
import {blurIn, easeIn, lerp, sp} from '../anim';
import {MotionBlur} from '../components/MotionBlur';

const COLORS: Record<string, string> = {k: '#FFFFFF', s: '#FFFFFF', c: '#FFFFFF'};

export const Build: React.FC = () => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const vertical = H > W;
  const enter = sp(f, 0, 22, 160);
  const exit = lerp(f, 36, 52, 0, 1, easeIn);
  const enterBlur = (1 - lerp(f, 0, 10, 0, 1)) * 50;
  const scroll = -f * (vertical ? 16 : 13);
  const lines = [
    ...content.buildLines,
    ...content.buildLines.map((l) => [l[0], l[1], l[2]] as [string, string, string]),
  ];

  return (
    <AbsoluteFill style={{opacity: lerp(f, 0, 4, 0, 1) * (1 - lerp(f, 44, 52, 0, 1))}}>
      <MotionBlur id="mb-build" x={enterBlur} y={exit * 20}>
        <AbsoluteFill style={{perspective: 1500, alignItems: 'center', justifyContent: 'center',
          transform: `translateX(${(1 - enter) * W * 0.6}px) scale(${1 + exit * 1.6})`, filter: `blur(${exit * 10}px)`}}>
          <div style={{width: vertical ? 980 : 1300, transform: `rotateX(32deg) rotateY(-16deg) rotateZ(7deg) translateY(${scroll + (vertical ? 820 : 260)}px)`,
            fontFamily: brand.mono, fontSize: vertical ? 30 : 34, lineHeight: 1.75, color: brand.text}}>
            <div style={{color: brand.muted, ...blurIn(lerp(f, 2, 8, 0, 1))}}>{content.buildHeader}</div>
            {lines.map(([kind, key, val], i) => {
              const p = lerp(f, 4 + i * 2.2, 9 + i * 2.2, 0, 1);
              const isStep = kind === 's';
              return (
                <div key={i} style={{display: 'flex', gap: 22, whiteSpace: 'nowrap', ...blurIn(p, 12),
                  transform: `translateX(${(1 - p) * 60}px)`, marginTop: isStep ? 10 : 0}}>
                  <span style={{color: brand.text, width: 48, textAlign: 'right'}}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{color: COLORS[kind], fontWeight: isStep ? 700 : 400, textShadow: isStep ? `0 0 18px ${brand.primary}aa` : undefined}}>
                    {key}
                  </span>
                  <span style={{color: brand.text}}>→</span>
                  <span style={{color: brand.text}}>{val}</span>
                  {isStep && (
                    <span style={{color: brand.text, opacity: lerp(f, 10 + i * 2.2, 13 + i * 2.2, 0, 1)}}>✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </MotionBlur>
    </AbsoluteFill>
  );
};
