import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {brand} from '../brand';
import {content} from '../content';
import {blurIn, lerp, sp} from '../anim';
import {Logo} from '../components/Logo';

export const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const logoP = sp(f, 4, 13, 110);
  const pulse = 1 + 0.05 * Math.sin(f / 4);
  const chars: {ch: string; hl: boolean}[] = [];
  content.claim.forEach((s) => s.text.split('').forEach((ch) => chars.push({ch, hl: !!s.hl})));
  const sub = sp(f, 48, 18, 110);
  const end = lerp(f, 80, 88, 0, 1);

  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: lerp(f, 0, 8, 0, 1) * (1 - end)}}>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 42}}>
        <div style={{transform: `scale(${(0.4 + 0.6 * logoP) * pulse})`, ...blurIn(logoP, 20)}}>
          <Logo size={120} glow={1.2 + 0.5 * Math.sin(f / 4)} />
        </div>
        <div style={{display: 'flex', fontFamily: brand.font, fontSize: 84, fontWeight: 650, color: brand.text, letterSpacing: -2,
          whiteSpace: 'pre'}}>
          {chars.map((c, i) => {
            const p = sp(f, 12 + i * 1.3, 15, 120);
            const q = 1 - p;
            return (
              <span key={i} style={{display: 'inline-block', opacity: Math.min(1, p * 1.4), filter: `blur(${q * 8}px)`,
                color: c.hl ? brand.accent : undefined, textShadow: c.hl ? `0 0 30px ${brand.accent}aa` : undefined,
                transform: `translate(${-q * 220}px, ${q * q * 360 + q * 40}px) rotate(${-q * 70}deg)`}}>
                {c.ch}
              </span>
            );
          })}
        </div>
        <div style={{display: 'flex', gap: 18, alignItems: 'center', fontFamily: brand.font, fontSize: 30, color: brand.muted,
          ...blurIn(sub), transform: `translateY(${(1 - sub) * 16}px)`}}>
          <span style={{color: brand.text, fontWeight: 600}}>{content.subline}</span>
          <span>·</span>
          <span>{content.url}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
