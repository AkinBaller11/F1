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
  const end = lerp(f, 80, 88, 0, 1);

  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: lerp(f, 0, 8, 0, 1) * (1 - end)}}>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 42}}>
        <div style={{position: 'relative', transform: `scale(${(0.4 + 0.6 * logoP) * pulse})`, ...blurIn(logoP, 20)}}>
          <div style={{position: 'absolute', left: '50%', top: '50%', width: 760, height: 760, marginLeft: -380, marginTop: -380,
            borderRadius: '50%', pointerEvents: 'none', opacity: logoP * (0.85 + 0.15 * Math.sin(f / 4)),
            background: `radial-gradient(circle, ${brand.secondary} 0%, ${brand.secondary} 22%, rgba(14,36,36,0.55) 45%, rgba(14,36,36,0) 70%)`}} />
          <div style={{position: 'relative'}}><Logo size={120} glow={1.2 + 0.5 * Math.sin(f / 4)} glowColor={brand.secondaryAccent} glowColor2={brand.secondaryAccent} /></div>
        </div>
        <div style={{display: 'flex', fontFamily: brand.font, fontSize: 84, fontWeight: 650, color: brand.text, letterSpacing: -2,
          whiteSpace: 'pre'}}>
          {chars.map((c, i) => {
            const p = sp(f, 12 + i * 1.3, 15, 120);
            const q = 1 - p;
            return (
              <span key={i} style={{display: 'inline-block', opacity: Math.min(1, p * 1.4), filter: `blur(${q * 8}px)`,
                fontWeight: c.hl ? 750 : undefined,
                transform: `translate(${-q * 220}px, ${q * q * 360 + q * 40}px) rotate(${-q * 70}deg)`}}>
                {c.ch}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
