import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
import {TOTAL_FRAMES} from './timeline';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Main" component={Main} durationInFrames={TOTAL_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="Vertical" component={Main} durationInFrames={TOTAL_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
