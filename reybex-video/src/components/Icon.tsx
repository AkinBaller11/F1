import React from 'react';

const P: Record<string, string> = {
  cart: 'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2',
  truck: 'M3 6h11v10H3z M14 10h4l3 3v3h-7z',
  sparkles:
    'M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z',
  box: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z M3 7.5l9 4.5 9-4.5 M12 12v9',
  ledger: 'M5 3h14v18H5z M8 7h8 M8 11h2 M14 11h2 M8 15h2 M14 15h2',
  plus: 'M12 5v14 M5 12h14',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',
  up: 'M12 19V5 M6 11l6-6 6 6',
  calendar: 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5 9-10',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
};
const C: Record<string, [number, number][]> = {
  cart: [[9, 19], [17, 19]],
  truck: [[7, 18], [17, 18]],
};

export const Icon: React.FC<{name: keyof typeof P | string; size?: number; color?: string; width?: number}> = ({
  name,
  size = 28,
  color = 'currentColor',
  width = 1.9,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width}
    strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
    <path d={P[name]} />
    {(C[name] || []).map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={1.6} />
    ))}
  </svg>
);

export const PILL_ICONS = ['cart', 'truck', 'sparkles', 'box', 'ledger'];
