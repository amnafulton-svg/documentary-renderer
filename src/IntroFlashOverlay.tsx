import {AbsoluteFill, Audio, interpolate, useCurrentFrame} from 'remotion';

const PROJECTOR_SOUND = 'https://remotion.media/shutter-old.wav';

/**
 * Standalone version of the documentary's opening print/flash reveal.
 *
 * In CapCut, place this above the main footage and set Blend to Overlay.
 * The 50% gray base becomes neutral, while the black pulse and warm flash
 * affect the footage underneath. The original projector/shutter sound is
 * included in the rendered MP4.
 */
export const IntroFlashOverlay = () => {
  const frame = useCurrentFrame();
  const black = interpolate(frame, [0, 10, 30], [1, 0.72, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const flash = interpolate(frame, [6, 11, 21, 32], [0, 0.72, 0.2, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const paper = interpolate(frame, [12, 36, 64], [0, 0.32, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#808080'}}>
      <Audio src={PROJECTOR_SOUND} volume={0.18} />
      <AbsoluteFill style={{backgroundColor: '#040302', opacity: black}} />
      <AbsoluteFill
        style={{
          backgroundColor: '#fff0c9',
          opacity: flash,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,246,218,0.75), rgba(196,143,73,0.16) 48%, rgba(0,0,0,0) 70%)',
          opacity: paper,
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};
