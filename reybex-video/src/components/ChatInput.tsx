import React from 'react';
import {useCurrentFrame} from 'remotion';
import {brand} from '../brand';
import {content, Seg} from '../content';
import {Icon} from './Icon';
import {Typewriter} from './Typewriter';

export const CHAT = {pad: 44, send: 64};

// Glass-Chat-Eingabe. chrome: 0..1 blendet Rahmen und Bedienelemente ein.
export const ChatInput: React.FC<{
  segments: Seg[];
  typeStart: number;
  width: number;
  height: number;
  fontSize?: number;
  chrome?: number;
  controls?: number;
  sendPress?: number;
}> = ({segments, typeStart, width, height, fontSize = 38, chrome = 1, controls = 1, sendPress = 0}) => {
  const f = useCurrentFrame();
  return (
    <div style={{position: 'relative', width, height, borderRadius: 38, fontFamily: brand.font}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: 38, opacity: chrome,
        background: 'linear-gradient(180deg, rgba(28,30,38,0.92), rgba(14,15,20,0.92))',
        border: '1.5px solid rgba(255,255,255,0.13)',
        boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`}} />
      <div style={{position: 'absolute', left: CHAT.pad, top: CHAT.pad - 4, right: CHAT.pad, color: brand.text, fontSize,
        fontWeight: 500, lineHeight: 1.3, letterSpacing: -0.4}}>
        <Typewriter segments={segments} start={typeStart} cps={2} />
      </div>
      <div style={{position: 'absolute', left: CHAT.pad - 6, right: 32, bottom: 32, height: CHAT.send, display: 'flex',
        alignItems: 'center', opacity: controls, color: brand.text}}>
        <Icon name="plus" size={40} width={1.6} />
        <div style={{flex: 1}} />
        <div style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 26, color: brand.muted, marginRight: 26}}>
          {content.modelLabel}
          <Icon name="chevron" size={20} />
        </div>
        <Icon name="mic" size={32} color={brand.muted} />
        <div style={{display: 'flex', alignItems: 'center', gap: 4, height: 34, margin: '0 26px 0 20px'}}>
          {Array.from({length: 9}).map((_, i) => (
            <div key={i} style={{width: 3.5, borderRadius: 2, background: brand.muted,
              height: 8 + 22 * Math.abs(Math.sin(f / 3 + i * 1.3)) * (0.5 + 0.5 * Math.sin(i))}} />
          ))}
        </div>
        <div style={{width: CHAT.send, height: CHAT.send, borderRadius: 20, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'white',
          background: `linear-gradient(140deg, ${brand.accent}, ${brand.primary})`,
          boxShadow: `0 0 ${20 + sendPress * 50}px ${brand.accent}${sendPress > 0.1 ? 'ff' : '88'}`,
          transform: `scale(${1 - sendPress * 0.12})`}}>
          <Icon name="up" size={32} width={2.4} />
        </div>
      </div>
    </div>
  );
};
