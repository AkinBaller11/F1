import React from 'react';
import {brand} from '../brand';
import {content, Seg} from '../content';
import {Icon} from './Icon';
import {Logo} from './Logo';
import {Typewriter} from './Typewriter';

// Reybex-KI-Befehlsleiste
export const CHAT = {pad: 40, textTop: 104, btnW: 214, btnH: 60, edge: 30};

// Mitte des „Ausführen“-Buttons relativ zur linken oberen Ecke des Felds
export const sendCenter = (w: number, h: number) => ({
  x: w - CHAT.edge - CHAT.btnW / 2,
  y: h - CHAT.edge - CHAT.btnH / 2,
});

const kbd: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.28)',
  background: 'rgba(255,255,255,0.06)',
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.2,
};

// chrome: 0..1 blendet die Fläche ein, controls: 0..1 die Bedienelemente
export const ChatInput: React.FC<{
  segments: Seg[];
  typeStart: number;
  width: number;
  height: number;
  chips?: string[];
  fontSize?: number;
  chrome?: number;
  controls?: number;
  sendPress?: number;
}> = ({segments, typeStart, width, height, chips = [], fontSize = 38, chrome = 1, controls = 1, sendPress = 0}) => (
  <div style={{position: 'relative', width, height, borderRadius: 24, fontFamily: brand.font, color: brand.text}}>
    <div style={{position: 'absolute', inset: 0, borderRadius: 24, opacity: chrome, overflow: 'hidden',
      background: 'rgba(14,36,36,0.96)', border: '1.5px solid rgba(255,255,255,0.14)',
      boxShadow: '0 30px 80px rgba(0,0,0,0.6)'}}>
      {/* Orange Akzentlinie oben */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 3,
        background: `linear-gradient(90deg, rgba(241,86,40,0) 0%, ${brand.primary} 30%, ${brand.primary} 70%, rgba(241,86,40,0) 100%)`}} />
      {/* Trennlinie unter der Kopfzeile */}
      <div style={{position: 'absolute', left: CHAT.pad, right: CHAT.pad, top: 76, height: 1, background: 'rgba(255,255,255,0.12)'}} />
    </div>
    {/* Kopfzeile */}
    <div style={{position: 'absolute', left: CHAT.pad, right: CHAT.pad, top: 22, height: 36, display: 'flex', alignItems: 'center',
      gap: 14, opacity: controls, fontSize: 23, fontWeight: 650}}>
      <Logo size={30} glow={0.35} />
      {content.modelLabel}
      <div style={{flex: 1}} />
      <span style={kbd}>Strg K</span>
    </div>
    {/* Eingabetext */}
    <div style={{position: 'absolute', left: CHAT.pad, top: CHAT.textTop, right: CHAT.pad, fontSize, fontWeight: 500,
      lineHeight: 1.3, letterSpacing: -0.4}}>
      <Typewriter segments={segments} start={typeStart} cps={2} />
    </div>
    {/* Fußzeile: Kontext-Chips + Ausführen */}
    <div style={{position: 'absolute', left: CHAT.pad - 4, right: CHAT.edge, bottom: CHAT.edge, height: CHAT.btnH, display: 'flex',
      alignItems: 'center', gap: 12, opacity: controls}}>
      {chips.map((c) => (
        <div key={c} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, fontSize: 21,
          fontWeight: 500, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', whiteSpace: 'nowrap'}}>
          <Icon name="box" size={20} width={1.8} />
          {c}
        </div>
      ))}
      <div style={{flex: 1}} />
      <span style={{...kbd, marginRight: 6}}>Enter</span>
      <div style={{width: CHAT.btnW, height: CHAT.btnH, borderRadius: 999, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 10, fontSize: 23, fontWeight: 650, background: brand.primary,
        boxShadow: `0 0 ${18 + sendPress * 50}px ${brand.primary}${sendPress > 0.1 ? 'ff' : '77'}`,
        transform: `scale(${1 - sendPress * 0.08})`}}>
        <Icon name="sparkles" size={24} width={2} />
        Ausführen
      </div>
    </div>
  </div>
);
