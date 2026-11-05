import React from 'react';
import {Img, staticFile} from 'remotion';
import {brand} from '../brand';

// Reybex-Bildmarke (weiß, transparent) mit Glow in Markenfarbe.
export const Logo: React.FC<{size?: number; glow?: number; glowColor?: string; glowColor2?: string}> = ({
  size = 120,
  glow = 1,
  glowColor = brand.primary,
  glowColor2 = brand.primary,
}) => (
  <Img
    src={staticFile('reybex-logo.png')}
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      filter: `drop-shadow(0 0 ${size * 0.1 * glow}px ${glowColor}) drop-shadow(0 0 ${size * 0.35 * glow}px ${glowColor2}aa)`,
    }}
  />
);
