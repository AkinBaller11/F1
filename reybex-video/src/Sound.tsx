import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import {T} from './timeline';

// Musik + frame-genaue Soundeffekte. Dateien: public/audio (erzeugt mit audio/generate.py)
export const MUSIC_VOLUME = 0.5;
export const SFX_VOLUME = 1;

type Cue = {f: number; s: string; v: number};

const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let x = a; x < b; x += step) out.push(Math.round(x));
  return out;
};

const P = T.prompt.from;
const R = T.result.from;
const O = T.outro.from;

const cues: Cue[] = [
  // Intro: Licht-Band + Logo
  {f: 0, s: 'whoosh', v: 0.35},
  {f: 3, s: 'shimmer', v: 0.45},
  // Pills poppen auf, Klick, Zoom hinein
  {f: 47, s: 'pop', v: 0.4},
  {f: 50, s: 'pop', v: 0.3},
  {f: 53, s: 'pop', v: 0.25},
  {f: T.pills.from + 24, s: 'click', v: 0.6},
  {f: T.pills.from + 31, s: 'whoosh', v: 0.55},
  // Prompt 1 tippen (2 Zeichen/Frame → Tastenanschlag alle 2–3 Frames)
  ...range(P + 3, P + 39, 2.6).map((f, i) => ({f, s: `key${i % 3}`, v: 0.35 + 0.1 * ((i * 7) % 3) / 2})),
  {f: P + 58, s: 'click', v: 0.6},
  {f: P + 58, s: 'send', v: 0.45},
  {f: P + 63, s: 'whip', v: 0.6},
  // Build: Riser + Daten-Blips je Zeile
  {f: T.build.from, s: 'riser', v: 0.45},
  ...range(0, 12, 1).map((i) => ({f: T.build.from + 5 + Math.round(i * 2.2 * 1.6), s: `blip${(i * 3) % 5}`, v: 0.22})),
  {f: T.build.from + 36, s: 'whoosh', v: 0.45},
  // Ergebnis-Karte (Drop in der Musik)
  {f: R, s: 'impact', v: 0.5},
  ...range(R + 24, R + 54, 3).map((f) => ({f, s: 'tick', v: 0.25})),
  // Pan nach unten, Prompt 2, Senden, Pan hoch
  {f: R + 62, s: 'pan', v: 0.45},
  ...range(R + 80, R + 99, 2.6).map((f, i) => ({f, s: `key${(i + 1) % 3}`, v: 0.35})),
  {f: R + 106, s: 'click', v: 0.6},
  {f: R + 106, s: 'send', v: 0.45},
  {f: R + 110, s: 'pan', v: 0.4},
  // Lichtschweif, Farbwechsel, Zeitplan-Zeile
  {f: R + 118, s: 'shimmer', v: 0.5},
  {f: R + 124, s: 'chime', v: 0.45},
  {f: R + 126, s: 'pop', v: 0.3},
  // Outro
  {f: O - 4, s: 'whoosh', v: 0.45},
  {f: O + 4, s: 'impact', v: 0.5},
  {f: O + 6, s: 'shimmer', v: 0.5},
  {f: O + 14, s: 'whip', v: 0.25},
  {f: O + 48, s: 'pop', v: 0.3},
];

export const Sound: React.FC = () => (
  <>
    <Audio src={staticFile('audio/music.wav')} volume={MUSIC_VOLUME} />
    {cues.map((c, i) => (
      <Sequence key={i} from={c.f} layout="none">
        <Audio src={staticFile(`audio/${c.s}.wav`)} volume={c.v * SFX_VOLUME} />
      </Sequence>
    ))}
  </>
);
