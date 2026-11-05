import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {content} from '../content';
import {clamp, ease, easeIn, lerp} from '../anim';
import {CHAT, ChatInput} from '../components/ChatInput';
import {Cursor} from '../components/Cursor';
import {MotionBlur} from '../components/MotionBlur';

export const Prompt: React.FC = () => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const vertical = H > W;
  const bw = Math.min(1250, W - 100);
  const bh = vertical ? 360 : 290;
  const left = (W - bw) / 2;
  const top = H / 2 - bh / 2;
  const CLICK = 58;

  // Kamera: groß auf den Text, dann Zoom-out auf das Eingabefeld
  const z = interpolate(f, [0, 42], [2.0, 1], {...clamp, easing: ease});
  const ox = left + CHAT.pad;
  const oy = top + CHAT.pad + 20;
  // leichter Push-in danach
  const push = 1 + 0.03 * lerp(f, 42, 64, 0, 1);
  const exit = lerp(f, 64, 80, 0, 1, easeIn);
  const press = interpolate(f, [CLICK, CLICK + 2, CLICK + 9], [0, 1, 0], clamp);

  const sendX = left + bw - 32 - CHAT.send / 2;
  const sendY = top + bh - 32 - CHAT.send / 2;

  return (
    <AbsoluteFill style={{opacity: lerp(f, 0, 5, 0, 1) * (1 - lerp(f, 72, 80, 0, 1))}}>
      <MotionBlur id="mb-prompt" x={exit * 60}>
        <AbsoluteFill style={{transform: `translateX(${-exit * W * 0.7}px)`}}>
          <AbsoluteFill style={{transformOrigin: `${ox}px ${oy}px`, transform: `scale(${z * push})`}}>
            <div style={{position: 'absolute', left, top}}>
              <ChatInput
                segments={content.prompt1}
                typeStart={3}
                width={bw}
                height={bh}
                chrome={lerp(f, 16, 38, 0, 1)}
                controls={lerp(f, 26, 42, 0, 1)}
                sendPress={press}
              />
            </div>
            <Cursor
              keys={[
                {f: 42, x: W * 0.92, y: H * 0.95},
                {f: 56, x: sendX - 6, y: sendY - 4},
                {f: 80, x: sendX - 2, y: sendY},
              ]}
              clicks={[CLICK]}
              fadeIn={42}
              fadeOut={64}
            />
          </AbsoluteFill>
        </AbsoluteFill>
      </MotionBlur>
    </AbsoluteFill>
  );
};
