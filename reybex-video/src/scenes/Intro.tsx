import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {brand} from '../brand';
import {content} from '../content';
import {blurIn, lerp, sp} from '../anim';
import {Logo} from '../components/Logo';

export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const logoP = sp(f, 2, 14, 110);
  const pulse = 1 + 0.035 * Math.sin(f / 4.5);
  const out = lerp(f, 40, 54, 0, 1);
  const word = content.wordmark.split('');
  const camera = 1.06 - 0.06 * lerp(f, 0, 54, 0, 1);

  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: `scale(${camera})`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 34}}>
        <div style={{transform: `scale(${(0.5 + 0.5 * logoP) * pulse * (1 - 0.6 * out)}) rotate(${(1 - logoP) * -40}deg)`,
          ...blurIn(logoP * (1 - out), 24)}}>
          <Logo size={130} glow={1 + 0.4 * Math.sin(f / 4.5)} />
        </div>
        <div style={{display: 'flex', fontFamily: brand.font, fontSize: 112, fontWeight: 700, color: brand.text, letterSpacing: -3,
          filter: `blur(${out * 18}px)`, opacity: 1 - out, transform: `translateX(${-out * 40}px)`}}>
          {word.map((ch, i) => {
            const p = sp(f, 10 + i * 2, 16, 140);
            return (
              <span key={i} style={{...blurIn(p, 22), display: 'inline-block', transform: `translateY(${(1 - p) * 26}px)`}}>
                {ch}
              </span>
            );
          })}
          <span style={{width: 26}} />
          {content.wordmarkSuffix.split('').map((ch, i) => {
            const p = sp(f, 24 + i * 2, 16, 140);
            return (
              <span key={i} style={{...blurIn(p, 22), display: 'inline-block', color: brand.text,
                textShadow: `0 0 40px ${brand.primary}`, transform: `translateY(${(1 - p) * 26}px)`}}>
                {ch}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
