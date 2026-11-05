import React from 'react';

// Richtungs-Motion-Blur (horizontal/vertikal) über einen SVG-Filter.
export const MotionBlur: React.FC<{x?: number; y?: number; id: string; children: React.ReactNode; style?: React.CSSProperties}> = ({
  x = 0,
  y = 0,
  id,
  children,
  style,
}) => {
  const active = x > 0.3 || y > 0.3;
  return (
    <div style={{position: 'absolute', inset: 0, filter: active ? `url(#${id})` : undefined, ...style}}>
      {active && (
        <svg width={0} height={0} style={{position: 'absolute'}}>
          <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={`${x} ${y}`} />
          </filter>
        </svg>
      )}
      {children}
    </div>
  );
};
