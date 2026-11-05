import React from 'react';
import {Img, staticFile} from 'remotion';
import {brand} from '../brand';

// Reybex-Bildmarke (weiß, transparent) mit Glow in Markenfarbe.
export const Logo: React.FC<{size?: number; glow?: number}> = ({size = 120, glow = 1}) => (
  <Img
    src={staticFile('reybex-logo.png')}
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      filter: `drop-shadow(0 0 ${size * 0.1 * glow}px ${brand.accent}) drop-shadow(0 0 ${size * 0.35 * glow}px ${brand.primary}aa)`,
    }}
  />
);
