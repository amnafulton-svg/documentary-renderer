import {loadFont} from '@remotion/google-fonts/Poppins';
import {AbsoluteFill, Easing, Img, interpolate, random, staticFile, useVideoConfig} from 'remotion';
import type {ArchivePerson, ArchivePersonEntry} from './types';

// Person card: who someone is, introduced on graph paper. A print with a torn caption strip slides in (motion
// blur) and lands on the spoken name, the name types on in red, facts type in beside it with the key figure in red,
// and a second person can be linked by a hand-drawn arrow. Times are seconds from the scene start.
const {fontFamily} = loadFont('normal', {weights: ['500', '600', '700'], subsets: ['latin']});

const RED = '#d24a35';
const INK = '#26231f';
const PAPER = '#e6e3db';
const SLIDE = 14; // frames the print takes to slide in
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

type Box = {x: number; y: number; w: number; h: number};

export const GridPaper = ({frame, duration, seed}: {frame: number; duration: number; seed: string}) => {
  const t = frame / Math.max(1, duration);
  const dx = interpolate(t, [0, 1], [-14, 14]);
  const dy = interpolate(t, [0, 1], [-8, 8]);
  const s = Math.round(random(seed) * 900);
  return (
    <AbsoluteFill style={{background: PAPER, overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: `translate(${dx}px, ${dy}px) scale(1.06)`}}>
        {/* crumpled paper: lit noise, multiplied over the paper */}
        <svg width="100%" height="100%" style={{position: 'absolute', inset: 0, mixBlendMode: 'multiply', opacity: 0.55}}>
          <filter id={`crumple-${s}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.006" numOctaves={4} seed={s} />
            <feDiffuseLighting surfaceScale={4.5} lightingColor="#ffffff">
              <feDistantLight azimuth={225} elevation={52} />
            </feDiffuseLighting>
          </filter>
          <rect width="100%" height="100%" filter={`url(#crumple-${s})`} />
        </svg>
        <AbsoluteFill
          style={{
            backgroundImage:
              'linear-gradient(rgba(70,72,74,0.17) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(70,72,74,0.17) 1.5px, transparent 1.5px)',
            backgroundSize: '38px 38px',
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(20,18,15,0.38) 100%)'}} />
    </AbsoluteFill>
  );
};

// torn bottom edge of the print, the same tear every frame
const tornClip = (w: number, h: number, seed: string) => {
  const pts = ['0px 0px', `${w}px 0px`];
  for (let x = w; x >= 0; x -= 9) {
    pts.push(`${x}px ${h - 2 - random(`${seed}-${x}`) * 9}px`);
  }
  return `polygon(${pts.join(', ')})`;
};

const typed = (text: string, frame: number, start: number, cps: number, fps: number) =>
  text.slice(0, Math.max(0, Math.floor(((frame - start) / fps) * cps)));

const Print = ({p, box, frame, id}: {p: ArchivePersonEntry; box: Box; frame: number; id: string}) => {
  const {fps} = useVideoConfig();
  const land = Math.round(p.at * fps);
  const enter = land - SLIDE;
  const k = interpolate(frame, [enter, land], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const x = interpolate(k, [0, 1], [1920 - box.x + 40, 0]);
  const blur = interpolate(k, [0, 0.7, 1], [38, 10, 0]);
  const strip = Math.round(box.w * 0.16);
  const pad = Math.round(box.w * 0.03);
  const name = typed(p.name, frame, land + 4, 22, fps);
  if (frame < enter) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        transform: `translateX(${x}px)`,
        filter: `url(#mb-${id}) drop-shadow(0 12px 16px rgba(0,0,0,0.32))`,
      }}
    >
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id={`mb-${id}`} x="-50%" y="0" width="200%" height="100%">
          <feGaussianBlur stdDeviation={`${blur} 0`} />
        </filter>
      </svg>
      <div style={{position: 'absolute', inset: 0, background: '#f6f4ee', clipPath: tornClip(box.w, box.h, id)}}>
        <Img
          src={staticFile(p.photo)}
          style={{
            position: 'absolute',
            left: pad,
            top: pad,
            width: box.w - 2 * pad,
            height: box.h - pad - strip,
            objectFit: 'cover',
            objectPosition: 'center 22%',
            // one warm monochrome for every print, so a colour photo and a b/w one read as a pair
            filter: 'grayscale(1) sepia(0.22) contrast(1.06) brightness(1.02)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 4,
            height: strip,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily,
            fontWeight: 700,
            fontSize: Math.round(box.w * 0.08),
            color: RED,
            whiteSpace: 'nowrap',
          }}
        >
          {/* the full name holds the layout; the typed part shows over it */}
          <span style={{visibility: 'hidden'}}>{p.name}</span>
          <span style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)'}}>
            <span>{name}</span>
            <span style={{visibility: 'hidden'}}>{p.name.slice(name.length)}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// a fact types on, then its key words turn red in a sweep that finishes on the spoken word (`at`)
const Fact = ({text, highlight, at, x, y, w, frame}: {
  text: string; highlight?: string; at: number; x: number; y: number; w: number; frame: number;
}) => {
  const {fps} = useVideoConfig();
  const cps = 38;
  const end = Math.round((at - 0.35) * fps);
  const start = Math.max(0, end - Math.round((text.length / cps) * fps));
  const shown = Math.max(0, Math.floor(((frame - start) / fps) * cps));
  const hi = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  const sweep = interpolate(frame, [end, end + Math.round(0.35 * fps)], [0, 1], clamp);
  const redUpTo = hi < 0 ? -1 : hi + Math.round(sweep * (highlight as string).length);
  if (frame < start) {
    return null;
  }
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, fontFamily, fontSize: 50, lineHeight: 1.2, fontWeight: 500, color: INK}}>
      {Array.from(text).map((ch, i) => {
        const isHi = hi >= 0 && i >= hi && i < hi + (highlight as string).length;
        const age = (frame - start) / fps * cps - i;
        return (
          <span
            key={i}
            style={{
              opacity: i < shown ? interpolate(age, [0, 4], [0.35, 1], clamp) : 0,
              color: isHi && i < redUpTo ? RED : INK,
              fontWeight: isHi && i < redUpTo ? 600 : 500,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

// the arrow draws itself, then its label (how the two are linked: "biographer of") types on above the curve
const Arrow = ({from, to, frame, start, len, label}: {
  from: [number, number]; to: [number, number]; frame: number; start: number; len: number; label?: string;
}) => {
  const {fps} = useVideoConfig();
  const k = interpolate(frame, [start, start + len], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
  if (k <= 0) {
    return null;
  }
  const [x1, y1] = from;
  const [x2, y2] = to;
  const d = `M ${x1} ${y1} C ${x1 + (x2 - x1) * 0.35} ${y1 - 70}, ${x2 - 30} ${y1 - 40}, ${x2} ${y2}`;
  const head = interpolate(k, [0.85, 1], [0, 1], clamp);
  const shown = label ? typed(label, frame, start + len, 24, fps) : '';
  return (
    <>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <path d={d} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - k} />
        <g opacity={head} stroke={INK} strokeWidth={5} strokeLinecap="round">
          <line x1={x2} y1={y2} x2={x2 - 26} y2={y2 - 14} />
          <line x1={x2} y1={y2} x2={x2 + 4} y2={y2 - 29} />
        </g>
      </svg>
      {label ? (
        <div style={{position: 'absolute', left: (x1 + x2) / 2 - 300, width: 600, top: y1 - 112, textAlign: 'center',
          fontFamily, fontWeight: 600, fontSize: 34, letterSpacing: 1, color: INK}}>
          <span>{shown}</span>
          <span style={{visibility: 'hidden'}}>{label.slice(shown.length)}</span>
        </div>
      ) : null}
    </>
  );
};

export const PersonCard = ({person, frame, durationInFrames, seed}: {
  person: ArchivePerson; frame: number; durationInFrames: number; seed: string;
}) => {
  const {fps} = useVideoConfig();
  const [a, b] = person.people;
  const facts = person.facts ?? [];
  let layout: Box[];
  if (b) {
    layout = [{x: 330, y: 110, w: 420, h: 600}, {x: 1170, y: 320, w: 420, h: 600}]; // clear of the subtitles
  } else if (facts.length) {
    layout = [{x: 300, y: 170, w: 470, h: 650}];
  } else {
    layout = [{x: 700, y: 140, w: 520, h: 720}];
  }
  const A = layout[0];
  return (
    <AbsoluteFill>
      <GridPaper frame={frame} duration={durationInFrames} seed={seed} />
      {person.source ? (
        <div style={{position: 'absolute', right: 70, top: 52, fontFamily, fontSize: 22, letterSpacing: 2, color: 'rgba(38,35,31,0.55)'}}>
          {person.source}
        </div>
      ) : null}
      <Print p={a} box={A} frame={frame} id={`${seed}-a`} />
      {!b
        ? facts.slice(0, 3).map((f, i) => (
          <Fact key={i} text={f.text} highlight={f.highlight} at={f.at} frame={frame}
            x={A.x + A.w + 90} y={A.y + 40 + i * (facts.length > 2 ? 200 : 300)} w={1920 - (A.x + A.w + 90) - 120} />
        ))
        : facts.slice(0, 1).map((f, i) => (
          // with two people, one fact sits under the first print
          <Fact key={i} text={f.text} highlight={f.highlight} at={f.at} frame={frame}
            x={A.x} y={A.y + A.h + 50} w={layout[1].x - A.x - 40} />
        ))}
      {b ? (
        <>
          <Arrow from={[A.x + A.w + 40, A.y + 90]} to={[layout[1].x + layout[1].w * 0.45, layout[1].y - 28]}
            frame={frame} start={Math.round(b.at * fps) - SLIDE - 16} len={16} label={person.link} />
          <Print p={b} box={layout[1]} frame={frame} id={`${seed}-b`} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
