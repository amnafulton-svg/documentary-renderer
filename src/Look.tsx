import {AbsoluteFill, Img, interpolate, Loop, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {useLayoutEffect, useRef} from 'react';
import type {CSSProperties} from 'react';
import {CRTDocumentaryLook} from './CRTDocumentaryLook';

// ---------- one look for the whole film ----------
// Modern colour photos, 1950s film, engravings and AI paintings sit side by side in these videos. Three layers make
// them read as one film: a per-picture tone correction measured in Python (scene.tone / shot.tone: brightness,
// contrast, saturation towards a common target), one colour curve for every picture (lifted blacks, cool shadows,
// warm highlights), and one moving film grain over everything.

export const GRADE_ID = 'docGrade';

// R/G/B transfer curves (input 0, .25, .5, .75, 1): lifted blacks, a touch of blue in the shadows,
// warm, slightly rolled-off highlights
const CURVE_R = '0.035 0.275 0.535 0.775 0.975';
const CURVE_G = '0.03 0.262 0.512 0.758 0.955';
const CURVE_B = '0.05 0.262 0.49 0.72 0.9';

export const GradeDefs = () => (
  <svg style={{position: 'absolute', width: 0, height: 0}} aria-hidden>
    <defs>
      <filter id={GRADE_ID} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feComponentTransfer>
          <feFuncR type="table" tableValues={CURVE_R} />
          <feFuncG type="table" tableValues={CURVE_G} />
          <feFuncB type="table" tableValues={CURVE_B} />
        </feComponentTransfer>
      </filter>
    </defs>
  </svg>
);

export type Tone = [brightness: number, contrast: number, saturate: number];

/** the shared picture treatment: per-picture tone correction, the house desaturation, then the colour curve */
export const lookFilter = (tone: Tone | undefined, flicker = 0) => {
  const [b, c, s] = tone ?? [1, 1, 1];
  return `brightness(${(b * (1 + flicker)).toFixed(3)}) contrast(${(c * 1.04).toFixed(3)}) saturate(${(s * 0.8).toFixed(3)}) sepia(0.1) url(#${GRADE_ID})`;
};

// deterministic per frame: every render worker draws the same grain for the same frame
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// a third of the frame size and new every second frame (film runs at 24): visibly alive, yet cheap to render
// and to encode (full-size grain on every frame made the MP4 3.5x bigger)
const GRAIN_W = 640;
const GRAIN_H = 360;

/** soft monochrome film grain over the whole picture, like 16 mm */
export const FilmGrain = ({strength = 0.3}: {strength?: number}) => {
  const frame = Math.floor(useCurrentFrame() / 2);
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(GRAIN_W, GRAIN_H);
    const rand = mulberry32(frame * 7919 + 17);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // sum of two uniforms: a soft, roughly bell-shaped grain around mid-grey
      const v = 128 + (rand() + rand() - 1) * 120;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [frame]);
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'overlay', opacity: strength}}>
      <canvas ref={ref} width={GRAIN_W} height={GRAIN_H} style={{width: '100%', height: '100%'}} />
    </AbsoluteFill>
  );
};

// ---------- 2.5D parallax on a hero still ----------
// The still is split (in Python, from a depth estimate) into a foreground cut-out and a background with the
// foreground painted out. The camera pushes in: the background grows a little, the foreground more, about the
// foreground's own centre, so it always covers its old place and nothing doubles.
export type Parallax = {bg: string; fg: string; origin: [x: number, y: number]};

export const ParallaxStill = ({
  parallax,
  progress,
  filter,
}: {
  parallax: Parallax;
  progress: number;
  filter: string;
}) => {
  const ease = interpolate(progress, [0, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const bgScale = 1.02 + 0.045 * ease;
  const fgScale = 1.02 + 0.1 * ease;
  const origin = `${parallax.origin[0]}% ${parallax.origin[1]}%`;
  const layer = {position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transformOrigin: origin} as const;
  return (
    <AbsoluteFill style={{filter, overflow: 'hidden'}}>
      <Img src={staticFile(parallax.bg)} style={{...layer, transform: `scale(${bgScale})`}} />
      <Img src={staticFile(parallax.fg)} style={{...layer, transform: `scale(${fgScale})`}} />
    </AbsoluteFill>
  );
};

// ---------- scanning a wide or tall print ----------
// A panorama, relief or scroll shown whole would be a thin strip; instead it fills the frame's height (or width for
// a tall page) and the camera travels across it once, so every part of the picture is seen and nothing is re-zoomed.
export const SCAN_WIDE = 2.05;
export const SCAN_TALL = 0.6;

export const scanSize = (aspect: number) => {
  const {width, height} = {width: 1920, height: 1080};
  if (aspect >= SCAN_WIDE) {
    const h = Math.round(height * 0.86);
    return {w: Math.round(h * aspect), h, axis: 'x' as const, travel: Math.max(0, Math.round(h * aspect) - width * 0.9)};
  }
  const w = Math.round(width * 0.62);
  return {w, h: Math.round(w / aspect), axis: 'y' as const, travel: Math.max(0, Math.round(w / aspect) - height * 0.86)};
};

export const ScanPrint = ({
  src,
  aspect,
  progress,
  filter,
  reverse,
  crt,
  enter,
}: {
  src: string;
  aspect: number;
  progress: number;
  filter: string;
  reverse?: boolean;
  crt?: number | null;
  enter?: string;
}) => {
  useVideoConfig();
  const {w, h, axis, travel} = scanSize(aspect);
  // ease in and out of the move so it starts and lands gently
  const t = interpolate(progress, [0, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const offset = (reverse ? 1 - eased : eased) * travel - travel / 2;
  const move = axis === 'x' ? `translateX(${-offset}px)` : `translateY(${-offset}px)`;
  return (
    <AbsoluteFill>
      <PaperBackdrop />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: enter}}>
        <PrintFace src={src} width={w} height={h} filter={filter} crt={crt} style={{transform: move}} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- photos as prints on white graph paper ----------
// the producer's look: a real photo with rounded corners and a soft drop shadow, lying on white graph paper whose
// grid slowly waves (public/backdrops/paper.mp4, 59 s, looped)
export const PAPER_VIDEO = 'backdrops/paper.mp4';

// each print slides onto the paper from off-screen, landing in the centre. The direction rotates
// top, bottom, left, right from one print to the next (key = scene index + cutaway number).
const SLIDE_FROM = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
export const printEnter = (key: number, framesIn: number, fps: number) => {
  const t = interpolate(framesIn, [0, Math.round(fps * 0.75)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const left = Math.pow(1 - t, 3); // ease-out cubic: fast in, gentle landing
  const [dx, dy] = SLIDE_FROM[((key % 4) + 4) % 4];
  return `translate(${dx * 1500 * left}px, ${dy * 1150 * left}px)`;
};
const PAPER_SECONDS = 59;

export const PaperBackdrop = () => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: '#f7f7f5'}}>
      <Loop durationInFrames={Math.round(PAPER_SECONDS * fps)}>
        <OffthreadVideo src={staticFile(PAPER_VIDEO)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </Loop>
    </AbsoluteFill>
  );
};

/** the print itself: rounded corners and a soft shadow on the paper; the CRT look (when on) covers the photo only */
export const PrintFace = ({src, width, height, filter, crt, style}: {
  src: string;
  width: number;
  height: number;
  filter: string;
  crt?: number | null;
  style?: CSSProperties;
}) => {
  const radius = Math.round(Math.min(width, height) * 0.035);
  const photo = <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter}} />;
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        maxWidth: 'none',
        flexShrink: 0,
        borderRadius: radius,
        overflow: 'hidden',
        boxShadow: '10px 14px 22px rgba(0,0,0,0.32), 3px 4px 7px rgba(0,0,0,0.22)',
        ...style,
      }}
    >
      {crt ? <CRTDocumentaryLook intensity={crt}>{photo}</CRTDocumentaryLook> : photo}
    </div>
  );
};
