import React from 'react';
import {brand} from '../brand';

export const glassPill = (active = 0): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  height: 84,
  borderRadius: 999,
  background: `rgba(255,255,255,${0.06 + active * 0.12})`,
  border: `2px solid rgba(255,255,255,${0.55 + active * 0.4})`,
  boxShadow: `0 0 ${22 + active * 40}px rgba(255,255,255,${0.28 + active * 0.3}), 0 0 ${active * 80}px ${brand.primary}, inset 0 0 14px rgba(255,255,255,0.18)`,
  backdropFilter: 'blur(14px)',
  color: brand.text,
  fontFamily: brand.font,
  fontSize: 33,
  fontWeight: 500,
  letterSpacing: -0.3,
  whiteSpace: 'nowrap',
});
