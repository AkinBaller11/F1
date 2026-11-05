import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {brand} from '../brand';
import {content} from '../content';
import {blurIn, clamp, ease, lerp, mixColor, sp} from '../anim';
import {Logo} from '../components/Logo';
import {Icon} from '../components/Icon';
import {ChatInput} from '../components/ChatInput';
import {Cursor} from '../components/Cursor';

// Lokales Timing
const PAN_DOWN = [62, 82];
const TYPE2 = 80;
const CLICK2 = 106;
const PAN_UP = [110, 130];
export const RESULT_MIX = [116, 138];

const Card: React.FC<{w: number; h: number; mix: number; vertical: boolean}> = ({w, h, mix, vertical}) => {
  const f = useCurrentFrame();
  const c1 = mixColor(brand.primary, brand.secondary, mix, 0.9);
  const c1s = mixColor(brand.primary, brand.secondary, mix, 0.55);
  const c2 = mixColor(brand.accent, brand.secondaryAccent, mix);
  const c2a = mixColor(brand.accent, brand.secondaryAccent, mix, 0.85);
  const k = (d: number) => sp(f, d, 18, 130);
  const sweep = lerp(f, 118, 138, -1.2, 1.2);
  const sched = sp(f, 124, 16, 120);
  const card = content.card;

  return (
    <div style={{position: 'relative', width: w, height: h, borderRadius: 40, overflow: 'hidden', fontFamily: brand.font,
      color: brand.text, border: `2px solid ${c2a}`,
      background: `linear-gradient(152deg, rgba(8,10,22,0.94) 0%, rgba(8,10,22,0.7) 28%, ${c1} 68%, ${c2} 118%)`,
      boxShadow: `0 0 90px ${c1s}, 0 40px 120px rgba(0,0,0,0.6), inset 0 0 50px rgba(255,255,255,0.07)`}}>
      <div style={{position: 'absolute', inset: 0, padding: 50}}>
        {/* Topbar */}
        <div style={{display: 'flex', alignItems: 'center', gap: 34, fontSize: 23, ...blurIn(k(8))}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 14, fontWeight: 700, fontSize: 25}}>
            <Logo size={42} glow={0.5} />
            Reybex
          </div>
          {card.tabs.map((t, i) => (
            <div key={t} style={{color: i === card.activeTab ? brand.text : 'rgba(255,255,255,0.6)', position: 'relative',
              fontWeight: i === card.activeTab ? 600 : 400}}>
              {t}
              {i === card.activeTab && (
                <div style={{position: 'absolute', left: 0, right: 0, bottom: -10, height: 3, borderRadius: 2, background: c2,
                  boxShadow: `0 0 12px ${c2}`, transform: `scaleX(${k(20)})`}} />
              )}
            </div>
          ))}
        </div>
        {/* Titel */}
        <div style={{display: 'flex', alignItems: 'center', gap: 24, marginTop: vertical ? 90 : 56, flexWrap: 'wrap'}}>
          <div style={{fontSize: vertical ? 74 : 70, fontWeight: 650, letterSpacing: -2, ...blurIn(k(12)),
            transform: `translateY(${(1 - k(12)) * 20}px)`}}>{card.title}</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderRadius: 999, fontSize: 21,
            fontWeight: 600, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', ...blurIn(k(20))}}>
            <div style={{width: 10, height: 10, borderRadius: 5, background: '#4BE3A0', boxShadow: '0 0 10px #4BE3A0',
              opacity: 0.6 + 0.4 * Math.sin(f / 4)}} />
            {card.badge}
          </div>
        </div>
        <div style={{fontSize: 26, color: 'rgba(255,255,255,0.72)', marginTop: 14, ...blurIn(k(16))}}>{card.subtitle}</div>
        {/* KPIs */}
        <div style={{display: 'flex', gap: 18, marginTop: vertical ? 60 : 36}}>
          {card.kpis.map((kp, i) => {
            const p = k(22 + i * 4);
            const n = Math.round(interpolate(f, [24 + i * 4, 52 + i * 4], [0, kp.value], {...clamp, easing: ease}));
            return (
              <div key={kp.label} style={{flex: 1, padding: '22px 26px', borderRadius: 24, background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)', ...blurIn(p),
                transform: `translateY(${(1 - p) * 30}px)`}}>
                <div style={{fontSize: 60, fontWeight: 700, letterSpacing: -2, fontVariantNumeric: 'tabular-nums'}}>{n}</div>
                <div style={{fontSize: 21, color: 'rgba(255,255,255,0.66)', marginTop: 2}}>{kp.label}</div>
              </div>
            );
          })}
        </div>
        {/* Ablauf */}
        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: vertical ? 50 : 30, flexWrap: 'wrap', rowGap: 14}}>
          {card.flow.map((s, i) => {
            const p = k(30 + i * 3);
            return (
              <React.Fragment key={s}>
                {i > 0 && <span style={{opacity: p * 0.6}}><Icon name="arrow" size={20} /></span>}
                <div style={{padding: '9px 18px', borderRadius: 999, fontSize: 21, background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.22)', ...blurIn(p, 10)}}>{s}</div>
              </React.Fragment>
            );
          })}
        </div>
        {/* Neuer Zeitplan (Szene 6) */}
        <div style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, fontSize: 23, fontWeight: 600,
          padding: '12px 20px', borderRadius: 16, width: 'fit-content', background: 'rgba(255,255,255,0.14)',
          border: `1px solid ${c2a}`, boxShadow: `0 0 30px ${c1s}`, ...blurIn(sched, 16),
          transform: `translateY(${(1 - sched) * 18}px) scale(${0.94 + 0.06 * sched})`}}>
          <Icon name="calendar" size={26} color={c2} />
          {card.schedule}
        </div>
      </div>
      {/* Button */}
      <div style={{position: 'absolute', right: 50, bottom: 46, padding: '13px 30px', borderRadius: 14, background: 'white',
        color: '#0B0D14', fontSize: 24, fontWeight: 650, boxShadow: '0 0 30px rgba(255,255,255,0.35)', ...blurIn(k(40))}}>
        {card.button}
      </div>
      {/* Lichtschweif */}
      <div style={{position: 'absolute', inset: 0, transform: `translateX(${sweep * 100}%)`, mixBlendMode: 'screen',
        background: 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.0) 42%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 58%, transparent 62%)'}} />
    </div>
  );
};

export const Result: React.FC = () => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const vertical = H > W;
  const cw = Math.min(1120, W - 100);
  const ch = vertical ? 900 : 720;
  const iw = Math.min(1120, W - 100);
  const ih = vertical ? 300 : 230;
  const cardTop = H / 2 - ch / 2;
  const inTop = cardTop + ch + 70;
  const inLeft = (W - iw) / 2;
  const pan = inTop + ih / 2 - H * 0.66;
  const panY = -pan * (sp(f, PAN_DOWN[0], 22, 90) - sp(f, PAN_UP[0], 22, 90));
  const mix = lerp(f, RESULT_MIX[0], RESULT_MIX[1], 0, 1);

  const enter = sp(f, 0, 18, 80);
  const push = 1 + 0.035 * lerp(f, 0, 160, 0, 1);
  const exit = lerp(f, 146, 160, 0, 1);
  const press = interpolate(f, [CLICK2, CLICK2 + 2, CLICK2 + 9], [0, 1, 0], clamp);
  const leak = interpolate(f, [114, 128, 158], [0, 1, 0.25], clamp);
  const sendX = inLeft + iw - 32 - 32;
  const sendY = inTop + ih - 32 - 32;

  return (
    <AbsoluteFill style={{opacity: lerp(f, 0, 6, 0, 1) * (1 - exit), filter: `blur(${exit * 14}px)`}}>
      <AbsoluteFill style={{transform: `translateY(${panY}px) scale(${push * (1 - exit * 0.05)})`, perspective: 1800}}>
        <div style={{position: 'absolute', left: (W - cw) / 2, top: cardTop,
          transform: `rotateY(${(1 - enter) * -34}deg) rotateX(${(1 - enter) * 16}deg) scale(${0.8 + 0.2 * enter}) translateZ(${(1 - enter) * -200}px)`,
          filter: `blur(${(1 - enter) * 16}px)`, opacity: Math.min(1, enter * 1.5)}}>
          <Card w={cw} h={ch} mix={mix} vertical={vertical} />
        </div>
        <div style={{position: 'absolute', left: inLeft, top: inTop, ...blurIn(lerp(f, 60, 74, 0, 1))}}>
          <ChatInput segments={content.prompt2} typeStart={TYPE2} width={iw} height={ih} fontSize={38} sendPress={press} />
        </div>
        <Cursor
          keys={[
            {f: 92, x: W * 0.95, y: inTop + ih + 160},
            {f: 104, x: sendX - 6, y: sendY - 4},
            {f: 120, x: sendX, y: sendY + 4},
          ]}
          clicks={[CLICK2]}
          fadeIn={92}
          fadeOut={112}
        />
      </AbsoluteFill>
      {/* Light-Leak links */}
      <AbsoluteFill style={{opacity: leak, mixBlendMode: 'screen',
        background: `radial-gradient(ellipse 30% 60% at 0% 45%, ${mixColor(brand.secondary, brand.secondaryAccent, 0.3, 0.95)} 0%, ${mixColor(brand.secondary, brand.secondary, 0, 0.35)} 45%, transparent 75%)`}} />
    </AbsoluteFill>
  );
};
