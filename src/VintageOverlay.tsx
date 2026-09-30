import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {CSSProperties} from 'react';

/**
 * Standalone, audio-free old-film texture for video editors.
 *
 * The 50% gray base is intentional: place the rendered MP4 above footage and
 * set the editor blend mode to Overlay or Soft Light. Mid-gray disappears,
 * while bright scratches/dust and the dark vignette remain visible.
 */
export const VintageOverlay = () => {
  const frame = useCurrentFrame();
  const base = Math.round(128 + Math.sin(frame * 0.39) * 3);
  const scratchA = 14 + ((frame * 3) % 1880);
  const scratchB = 1880 - ((frame * 7) % 1800);
  const dustAX = (97 + frame * 5) % 1920;
  const dustAY = (41 + frame * 7) % 1080;
  const dustBX = (733 + frame * 11) % 1920;
  const dustBY = (281 + frame * 13) % 1080;
  const pulse = 0.08 + Math.abs(Math.sin(frame * 0.47)) * 0.035;
  const spliceFlash = interpolate(frame % 347, [0, 2, 7], [0.11, 0.04, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: `rgb(${base}, ${base}, ${base})`}}>
      <AbsoluteFill style={styles.warmAge} />
      <AbsoluteFill style={styles.vignette} />
      <div style={{...styles.grain, opacity: pulse}} />
      <div
        style={{
          ...styles.scratch,
          left: scratchA,
          opacity: frame % 9 < 5 ? 0.22 : 0.04,
        }}
      />
      <div
        style={{
          ...styles.scratch,
          left: scratchB,
          width: 1,
          opacity: frame % 19 < 4 ? 0.16 : 0,
        }}
      />
      <div
        style={{
          ...styles.dust,
          left: dustAX,
          top: dustAY,
          opacity: frame % 17 < 3 ? 0.38 : 0,
        }}
      />
      <div
        style={{
          ...styles.dust,
          left: dustBX,
          top: dustBY,
          width: 7,
          height: 7,
          opacity: frame % 23 < 4 ? 0.28 : 0,
        }}
      />
      <AbsoluteFill style={styles.filmGate} />
      <AbsoluteFill
        style={{
          backgroundColor: '#fff2cf',
          opacity: spliceFlash,
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};

const styles: Record<string, CSSProperties> = {
  warmAge: {
    background:
      'linear-gradient(90deg, rgba(42,22,7,0.08), rgba(255,232,178,0.035) 48%, rgba(30,15,5,0.1)), linear-gradient(180deg, rgba(255,220,150,0.05), rgba(0,0,0,0.055))',
    mixBlendMode: 'overlay',
  },
  vignette: {
    background:
      'radial-gradient(circle at 50% 48%, rgba(128,128,128,0) 0%, rgba(72,67,60,0.08) 54%, rgba(0,0,0,0.42) 100%)',
  },
  grain: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'radial-gradient(circle, rgba(255,255,255,0.82) 0 1px, transparent 1px), radial-gradient(circle, rgba(0,0,0,0.7) 0 1px, transparent 1px)',
    backgroundPosition: '0 0, 2px 3px',
    backgroundSize: '5px 5px, 7px 7px',
    mixBlendMode: 'overlay',
  },
  scratch: {
    position: 'absolute',
    top: -80,
    width: 2,
    height: 1240,
    backgroundColor: 'rgba(255,246,220,0.78)',
    filter: 'blur(1px)',
  },
  dust: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,246,220,0.72)',
    filter: 'blur(2px)',
  },
  filmGate: {
    inset: 34,
    border: '2px solid rgba(255,237,197,0.2)',
    boxShadow: 'inset 0 0 110px rgba(0,0,0,0.72)',
    opacity: 0.22,
  },
};
