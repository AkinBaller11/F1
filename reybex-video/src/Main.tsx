import React from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {clamp} from './anim';
import {brand} from './brand';
import {T} from './timeline';
import {GlowBackground} from './components/GlowBackground';
import {Intro} from './scenes/Intro';
import {Pills} from './scenes/Pills';
import {Prompt} from './scenes/Prompt';
import {Build} from './scenes/Build';
import {Result, RESULT_MIX} from './scenes/Result';
import {Outro} from './scenes/Outro';
import {Sound} from './Sound';

export const Main: React.FC = () => {
  const f = useCurrentFrame();
  const intensity = interpolate(
    f,
    [0, 12, 90, 104, 160, 176, 214, 230, 350, 372, 450],
    [0, 1, 1, 0.42, 0.42, 0.95, 0.9, 0.62, 0.62, 0.14, 0.12],
    clamp,
  );
  const mix = interpolate(f, [T.result.from + RESULT_MIX[0], T.result.from + RESULT_MIX[1]], [0, 1], clamp);

  return (
    <AbsoluteFill style={{background: brand.bg}}>
      <GlowBackground intensity={intensity} mix={mix} />
      <Sequence from={T.intro.from} durationInFrames={T.intro.dur}><Intro /></Sequence>
      <Sequence from={T.pills.from} durationInFrames={T.pills.dur}><Pills /></Sequence>
      <Sequence from={T.prompt.from} durationInFrames={T.prompt.dur}><Prompt /></Sequence>
      <Sequence from={T.build.from} durationInFrames={T.build.dur}><Build /></Sequence>
      <Sequence from={T.result.from} durationInFrames={T.result.dur}><Result /></Sequence>
      <Sequence from={T.outro.from} durationInFrames={T.outro.dur}><Outro /></Sequence>
      <Sound />
      {/* Vignette */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
