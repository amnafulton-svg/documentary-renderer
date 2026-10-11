import {loadFont} from '@remotion/google-fonts/Poppins';
import {loadFont as loadOswald} from '@remotion/google-fonts/Oswald';
import {AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ACCENT} from './Palette';
import {GridPaper} from './PersonCard';

// Templates reverse-engineered from the reference "The Fascinating Story of Medici Bank" (2026-10-11 study).
// Measured there: shots last 2-4 s (median 2.9 s), every overlay TYPES ON letter by letter, starting on (or ~0.3 s
// before) the spoken word and finishing within ~0.7 s; red #d24a35-style boxes with white Poppins; the key number
// of a sentence turns red as it is spoken. All times below are seconds from the start of the scene.
const {fontFamily} = loadFont('normal', {weights: ['500', '600', '700'], subsets: ['latin']});
const {fontFamily: condensed} = loadOswald('normal', {weights: ['600'], subsets: ['latin']});

const RED = ACCENT;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// characters shown at time t (s) when typing starts at `at` with `cps` characters per second
const typedCount = (len: number, t: number, at: number, cps: number) => Math.max(0, Math.min(len, Math.floor((t - at) * cps)));

// a still with the slow push the reference keeps on every painting (about 6% over the shot)
export const PushStill = ({src, frame, duration, dim = 0, blur = 0}: {
  src: string; frame: number; duration: number; dim?: number; blur?: number;
}) => {
  const s = interpolate(frame, [0, duration], [1.02, 1.08], clamp);
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})`,
        filter: `brightness(${1 - dim}) blur(${blur}px)`}} />
    </AbsoluteFill>
  );
};

// 1. NAME TAG — red box, white Poppins, typed on the spoken name (reference: starts 0.3 s before "Charles",
//    16 characters in 0.7 s). A second line (e.g. "Dominican monastery") types right after the first.
export const NameTag = ({lines, at, frame, fps, x = 0.5, y = 0.87}: {
  lines: string[]; at: number; frame: number; fps: number; x?: number; y?: number;
}) => {
  const t = frame / fps;
  let start = at;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8}}>
        {lines.map((line, i) => {
          const s0 = start;
          start += line.length / 24 + 0.1;
          const n = typedCount(line.length, t, s0, 24);
          if (t < s0) return null;
          return (
            <div key={i} style={{background: RED, color: '#fff', fontFamily, fontWeight: 600, fontSize: i ? 34 : 40,
              padding: '4px 18px 6px', borderRadius: 4, whiteSpace: 'pre', boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
              minWidth: 20, minHeight: i ? 50 : 58}}>
              {line.slice(0, n)}
              {n < line.length ? <span style={{opacity: 0.85}}>▌</span> : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// 2. YEAR BADGE — small red box in the top-right corner; the year types in from the RIGHT ("7", "97", "497",
//    "1497"), ~0.15 s per digit, starting on the spoken year. It stays until the cut.
export const YearBadge = ({text, at, frame, fps}: {text: string; at: number; frame: number; fps: number}) => {
  const n = typedCount(text.length, frame / fps, at, 6.5);
  if (n === 0) return null;
  return (
    <div style={{position: 'absolute', right: 90, top: 70, background: RED, color: '#fff', fontFamily, fontWeight: 700,
      fontSize: 46, padding: '2px 18px 4px', borderRadius: 4, boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      letterSpacing: 1}}>
      <span style={{visibility: 'hidden', position: 'absolute'}}>{text}</span>
      {text.slice(text.length - n)}
    </div>
  );
};

// 3. QUOTE CARD — the picture dims (to ~30 %) and softens, a one- or two-line fact types on in the centre, and the
//    key figure turns red letter by letter when the narrator says it (reference 1:13 "100,000 florins").
//    `highlight` must be words of the text; the red sweep starts at highlightAt. QuoteOverlay is the part laid over
//    whatever picture or film is on screen (production: data.overlays); QuoteCard = a still + the overlay (preview).
export const QuoteOverlay = ({text, highlight, at, highlightAt, frame, fps}: {
  text: string; highlight?: string; at: number; highlightAt?: number; frame: number; fps: number;
}) => {
  const t = frame / fps;
  const k = interpolate(t, [at - 0.2, at + 0.5], [0, 1], clamp);
  const n = typedCount(text.length, t, at, 40);
  const h0 = highlight ? text.indexOf(highlight) : -1;
  const red = h0 >= 0 && highlightAt !== undefined ? typedCount(highlight!.length, t, highlightAt, 14) : 0;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: `rgba(0,0,0,${0.7 * k})`, backdropFilter: `blur(${3 * k}px)`}} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{width: 1100, textAlign: 'center', fontFamily, fontWeight: 600, fontSize: 50, lineHeight: 1.3,
          color: '#fff', textShadow: '0 3px 16px rgba(0,0,0,0.6)'}}>
          {text.split('').map((ch, i) => (
            <span key={i} style={{opacity: i < n ? 1 : 0,
              color: h0 >= 0 && i >= h0 && i < h0 + red ? RED : '#fff'}}>{ch}</span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const QuoteCard = ({src, text, highlight, at, highlightAt, frame, fps, duration}: {
  src: string; text: string; highlight?: string; at: number; highlightAt?: number; frame: number; fps: number; duration: number;
}) => (
  <AbsoluteFill>
    <PushStill src={src} frame={frame} duration={duration} />
    <QuoteOverlay text={text} highlight={highlight} at={at} highlightAt={highlightAt} frame={frame} fps={fps} />
  </AbsoluteFill>
);

// 4. TIMELINE BOARD — on the house graph paper: "1435 ──→ 1450" red boxes, the arrow draws, a picture rises in
//    out of a blur, then the period's figure types in big red under it on the spoken number (reference 5:01).
export const TimelineBoard = ({from, to, src, figure, at, figureAt, frame, fps, duration}: {
  from: string; to: string; src: string; figure: string; at: number; figureAt: number; frame: number; fps: number;
  duration: number;
}) => {
  const t = frame / fps;
  const box = (text: string, s: number) => {
    const n = typedCount(text.length, t, s, 10);
    return (
      <div style={{background: RED, color: '#fff', fontFamily, fontWeight: 700, fontSize: 44, padding: '2px 18px 4px',
        borderRadius: 4, minWidth: 140, textAlign: 'center', opacity: t >= s ? 1 : 0}}>
        <span style={{visibility: 'hidden', position: 'absolute'}}>{text}</span>{text.slice(text.length - n) || ' '}
      </div>
    );
  };
  const arrow = interpolate(t, [at + 0.3, at + 0.8], [0, 1], clamp);
  const pic = interpolate(t, [at + 0.9, at + 1.5], [0, 1], clamp);
  const fn = typedCount(figure.length, t, figureAt, 16);
  return (
    <AbsoluteFill>
      <GridPaper frame={frame} duration={duration} seed="timeline" />
      <div style={{position: 'absolute', top: 120, left: 0, right: 0, display: 'flex', justifyContent: 'center',
        alignItems: 'center', gap: 30}}>
        {box(from, at)}
        <svg width={360} height={30}>
          <line x1={0} y1={15} x2={350 * arrow} y2={15} stroke="#26231f" strokeWidth={3} />
          {arrow >= 1 ? <polygon points="340,6 358,15 340,24" fill="#26231f" /> : null}
        </svg>
        {box(to, at + 0.8)}
      </div>
      <div style={{position: 'absolute', left: '50%', top: 250, width: 700, height: 420,
        transform: `translate(-50%, ${(1 - pic) * 120}px)`, opacity: pic, filter: `blur(${(1 - pic) * 10}px)`,
        border: '10px solid #fff', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', overflow: 'hidden'}}>
        <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </div>
      <div style={{position: 'absolute', top: 730, left: 0, right: 0, textAlign: 'center', fontFamily, fontWeight: 700,
        fontSize: 84, color: RED}}>
        {figure.split('').map((ch, i) => {
          const k = interpolate(t - figureAt - i / 16, [0, 0.25], [0, 1], clamp);
          return <span key={i} style={{opacity: i < fn ? k : 0, filter: `blur(${(1 - k) * 6}px)`,
            display: 'inline-block', transform: `translateY(${(1 - k) * 18}px) scale(${1.25 - 0.25 * k})`}}>{ch === ' ' ? ' ' : ch}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

// 5. REWIND — "But let's back up for a second": the film flicks BACKWARDS through earlier pictures (3 frames each)
//    with VHS tracking bands and a "REWIND ◄◄" stamp, then flashes white into the next scene (reference 0:39).
export const RewindTransition = ({images, frame, duration}: {images: string[]; frame: number; duration: number}) => {
  const per = 3;
  const k = Math.min(images.length - 1, Math.floor(frame / per));
  const src = images[images.length - 1 - k];
  const flash = interpolate(frame, [duration - 8, duration - 3, duration], [0, 1, 0.6], clamp);
  const band = (i: number) => {
    const y = ((random(`b${i}-${frame}`) * 1.3 - 0.15) * 1080) | 0;
    return <div key={i} style={{position: 'absolute', left: 0, right: 0, top: y, height: 6 + random(`h${i}-${frame}`) * 26,
      background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(3px)', transform: `translateX(${(random(`x${i}-${frame}`) - 0.5) * 60}px)`}} />;
  };
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover',
        filter: 'saturate(1.25) contrast(1.1) brightness(1.08)', transform: `translateX(${(random(`j${frame}`) - 0.5) * 14}px) scale(1.04)`}} />
      {[0, 1, 2].map(band)}
      <div style={{position: 'absolute', left: 120, bottom: 110, color: '#fff', fontFamily: 'monospace', fontWeight: 700,
        fontSize: 54, letterSpacing: 4, textShadow: '0 0 8px rgba(255,255,255,0.7)', opacity: frame % 20 < 14 ? 1 : 0.4}}>
        REWIND ◄◄
      </div>
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};

// 6. COLD-OPEN YEAR — the first seconds: paintings flicker every 4 frames while the opening year types digit by
//    digit in huge white condensed type, on "The year is 1397", then everything blows out to white (reference 0:00).
export const ColdOpenYear = ({images, year, at, frame, fps, duration}: {
  images: string[]; year: string; at: number; frame: number; fps: number; duration: number;
}) => {
  const src = images[Math.floor(frame / 4) % images.length];
  const n = typedCount(year.length, frame / fps, at, 6);
  const flash = interpolate(frame, [duration - 10, duration], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.92)'}} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{fontFamily: condensed, fontWeight: 600, fontSize: 420, color: '#f4f2ee', letterSpacing: -4,
          textShadow: '0 12px 40px rgba(0,0,0,0.55)', lineHeight: 1}}>
          {year.slice(0, n)}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{background: '#fff', opacity: flash, mixBlendMode: 'screen'}} />
      <AbsoluteFill style={{background: '#fff', opacity: flash * flash}} />
    </AbsoluteFill>
  );
};

// convenience wrapper for Sequences: hands the local frame/fps to a template
export const useLocal = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return {frame, fps};
};
