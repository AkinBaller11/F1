import React from 'react';
import {brand} from '../brand';

// TODO: Durch das echte Reybex-Logo (SVG) ersetzen – Platzhalter-Bildmarke.
export const Logo: React.FC<{size?: number; glow?: number}> = ({size = 120, glow = 1}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      background: `linear-gradient(140deg, ${brand.accent} 0%, ${brand.primary} 70%)`,
      boxShadow: `0 0 ${size * 0.5 * glow}px ${brand.accent}99, 0 0 ${size * 1.2 * glow}px ${brand.primary}66, inset 0 0 ${size * 0.15}px rgba(255,255,255,0.5)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: brand.font,
      fontWeight: 800,
      fontSize: size * 0.58,
      letterSpacing: -size * 0.02,
      flexShrink: 0,
    }}
  >
    R
  </div>
);
