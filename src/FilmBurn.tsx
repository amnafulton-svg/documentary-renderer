// Film-burn transitions: real scanned film-burn clips (renderer/assets/transitions, installed into each run's
// public/transitions by look.install_backdrops) screened over the cut, with their own projector sound.
// Adapted from the remotion-film-burn-transition-kit (clips 1, 4, 5, 6, 11, 12, 13).
import {OffthreadVideo, staticFile, useVideoConfig} from 'remotion';

export const FILM_BURN_SOURCE_FPS = 25;

// per clip: length in source frames, the first full-white frame (the cut hides under it), and a gain that
// levels the clips' very different sound effects to ~10 dB under the narration (measured with volumedetect)
export const FILM_BURNS: Record<number, {frames: number; peak: number; gain: number}> = {
  1: {frames: 28, peak: 10, gain: 0.26},
  4: {frames: 29, peak: 20, gain: 1},
  5: {frames: 26, peak: 8, gain: 0.23},
  6: {frames: 27, peak: 12, gain: 0.64},
  11: {frames: 22, peak: 9, gain: 1},
  12: {frames: 25, peak: 11, gain: 1},
  13: {frames: 25, peak: 10, gain: 0.25},
};

export const FILM_BURN_NUMBERS = Object.keys(FILM_BURNS).map(Number);

// an unknown or missing number picks one by the cut's position, so neighbouring burns differ
export const filmBurnNumber = (n: number | undefined, seed: number) =>
  n !== undefined && FILM_BURNS[n] ? n : FILM_BURN_NUMBERS[Math.abs(seed) % FILM_BURN_NUMBERS.length];

const toFrames = (sourceFrames: number, fps: number) => Math.round((sourceFrames / FILM_BURN_SOURCE_FPS) * fps);

// frames before the cut that the burn starts, and its whole length, at the composition's fps
export const filmBurnTiming = (n: number, fps: number) => ({
  pre: toFrames(FILM_BURNS[n].peak, fps),
  frames: Math.ceil((FILM_BURNS[n].frames / FILM_BURN_SOURCE_FPS) * fps),
});

export const FilmBurnOverlay = ({n, volume = 0.8}: {n: number; volume?: number}) => {
  const {width, height} = useVideoConfig();
  return (
    <OffthreadVideo
      src={staticFile(`transitions/film-transition-${String(n).padStart(2, '0')}.mp4`)}
      volume={volume * FILM_BURNS[n].gain}
      style={{width, height, objectFit: 'cover', mixBlendMode: 'screen', pointerEvents: 'none'}}
    />
  );
};
