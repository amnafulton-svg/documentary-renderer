import {loadFont} from '@remotion/google-fonts/Tinos';
import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, random, staticFile, useVideoConfig} from 'remotion';
import type {ArchiveDossier, ArchiveDossierPerson} from './types';

// Dossier cards (the producer's CapCut look): charcoal ground with grain, black-and-white portraits (halftone prints
// for title cards, made by editor_pass.py) with an RGB-split edge, bold italic serif words that drop in one by one,
// and a crimson bar that wipes in behind the title. Three kinds:
//   title  - portrait on one side, title (a name or a date) + subtitle on the other
//   lineup - portraits rise in one by one with their names, step back into a row, rivals get crossed out, the first
//            one returns to the centre
//   list   - a title bar and bullet items that land on their words
// Times are seconds from the scene start.
const {fontFamily} = loadFont('italic', {weights: ['400', '700'], subsets: ['latin']});
loadFont('normal', {weights: ['400'], subsets: ['latin']});

export const DOSSIER_RED = '#aa3e4c';
const GROUND = '#212121';
const CREAM = '#f3f1ec';
const STEP = 3; // frames between words
const DROP = 8; // frames a word takes to settle
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.out(Easing.cubic);

const Ground = ({frame, seed}: {frame: number; seed: string}) => {
  const s = Math.round(random(`${seed}-g`) * 500);
  return (
    <AbsoluteFill style={{background: GROUND}}>
      <svg width="100%" height="100%" style={{position: 'absolute', inset: 0, opacity: 0.09, mixBlendMode: 'screen'}}>
        <filter id={`dgrain-${s}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={s + (frame % 12)} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#dgrain-${s})`} />
      </svg>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,0.42) 100%)'}} />
    </AbsoluteFill>
  );
};

// red / cyan split on the picture's edges, wobbling a pixel so it reads as print misregistration
const SplitFilter = ({id, frame, amount}: {id: string; frame: number; amount: number}) => {
  const d = amount + (random(`${id}-${Math.floor(frame / 3)}`) - 0.5) * 1.2;
  const channel = (r: number, g: number, b: number) => `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
  return (
    <svg width="0" height="0" style={{position: 'absolute'}}>
      <filter id={id} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values={channel(1, 0, 0)} result="r" />
        <feOffset in="r" dx={-d} dy={0} result="r2" />
        <feColorMatrix in="SourceGraphic" type="matrix" values={channel(0, 1, 0)} result="g" />
        <feColorMatrix in="SourceGraphic" type="matrix" values={channel(0, 0, 1)} result="b" />
        <feOffset in="b" dx={d} dy={0} result="b2" />
        <feBlend in="r2" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b2" mode="screen" />
      </filter>
    </svg>
  );
};

type Token = {word: string; em: boolean};
// "Becomes *Chairman of the Council*": the starred words are italic (titles are always bold italic)
const tokens = (text: string): Token[] => {
  const out: Token[] = [];
  let em = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const open = raw.startsWith('*');
    const close = raw.endsWith('*') && raw.length > (open ? 1 : 0);
    if (open) em = true;
    out.push({word: raw.replace(/^\*|\*$/g, ''), em});
    if (close) em = false;
  }
  return out;
};

// words drop in one by one: each starts raised, slightly rotated and split, then settles on the line
const DropWords = ({text, start, frame, style, italic}: {
  text: string; start: number; frame: number; style: React.CSSProperties; italic?: boolean;
}) => (
  <>
    {tokens(text).map((t, i) => {
      const t0 = start + i * STEP;
      if (frame < t0) {
        return <span key={i} style={{display: 'inline-block', marginRight: '0.24em', opacity: 0}}>{t.word}</span>;
      }
      const k = interpolate(frame, [t0, t0 + DROP], [0, 1], {...clamp, easing: ease});
      const split = interpolate(k, [0, 1], [5, 0.8]);
      return (
        <span
          key={i}
          style={{
            display: 'inline-block',
            marginRight: '0.24em',
            fontStyle: italic || t.em ? 'italic' : 'normal',
            opacity: interpolate(k, [0, 0.25], [0, 1], clamp),
            transform: `translate(${interpolate(k, [0, 1], [0.12, 0])}em, ${interpolate(k, [0, 1], [-0.42, 0])}em) rotate(${interpolate(k, [0, 1], [-5, 0])}deg) scale(${interpolate(k, [0, 1], [1.1, 1])})`,
            textShadow: `${-split}px 0 rgba(255,40,70,0.55), ${split}px 0 rgba(40,210,255,0.55)`,
          }}
        >
          {t.word}
        </span>
      );
    })}
  </>
);

const wordsDone = (text: string, start: number) => start + Math.max(0, tokens(text).length - 1) * STEP + DROP;

// title with the crimson bar: a thin rule flicks on at the left, then the bar wipes across behind the words
const BarTitle = ({text, start, frame, size}: {text: string; start: number; frame: number; size: number}) => {
  const b0 = wordsDone(text, start) + 2;
  const k = interpolate(frame, [b0 + 4, b0 + 14], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const rule = frame >= b0;
  return (
    <span style={{position: 'relative', display: 'inline-block', fontSize: size, fontWeight: 700, lineHeight: 1.18}}>
      {rule ? (
        <span
          style={{
            position: 'absolute',
            left: '-0.22em',
            top: '0.02em',
            bottom: '0.02em',
            width: `calc(${Math.max(0.004, k) * 100}% + ${k * 0.2}em)`,
            minWidth: Math.max(4, size * 0.06),
            background: DOSSIER_RED,
            boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
          }}
        />
      ) : null}
      <span style={{position: 'relative', whiteSpace: 'nowrap'}}>
        <DropWords text={text} start={start} frame={frame} style={{}} italic />
      </span>
    </span>
  );
};

const Portrait = ({src, frame, id, start, style, split = 2.2}: {
  src: string; frame: number; id: string; start: number; style?: React.CSSProperties; split?: number;
}) => {
  const k = interpolate(frame, [start, start + 12], [0, 1], {...clamp, easing: ease});
  return (
    <>
      <SplitFilter id={id} frame={frame} amount={split} />
      <Img
        src={staticFile(src)}
        style={{
          objectFit: 'contain',
          filter: `url(#${id}) blur(${interpolate(k, [0, 1], [6, 0])}px)`,
          opacity: k,
          ...style,
        }}
      />
    </>
  );
};

const TitleCard = ({d, frame, durationInFrames, seed}: {d: Extract<ArchiveDossier, {kind: 'title'}>; frame: number; durationInFrames: number; seed: string}) => {
  const {fps} = useVideoConfig();
  const at = Math.round(d.at * fps);
  const sub = d.subtitle ? Math.round((d.subtitleAt ?? d.at + 0.5) * fps) : 0;
  const right = (d.side ?? 'left') === 'left'; // text on the right of a left-hand portrait
  const push = interpolate(frame, [0, durationInFrames], [1.0, 1.06]);
  const size = d.title.length > 22 ? 64 : 76;
  return (
    <>
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            [right ? 'left' : 'right']: 0,
            width: 1060,
            transform: `scale(${push})`,
            transformOrigin: right ? '35% 40%' : '65% 40%',
          }}
        >
          <Portrait src={d.photo} frame={frame} id={`dsp-${seed}`} start={0}
                    style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectPosition: right ? 'left center' : 'right center'}} />
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          [right ? 'left' : 'right']: right ? 1094 : 1080,
          top: d.subtitle ? 360 : 470,
          width: 720,
          fontFamily,
          color: CREAM,
          textAlign: 'left',
        }}
      >
        <BarTitle text={d.title} start={at} frame={frame} size={size} />
        {d.subtitle ? (
          <div style={{marginTop: 26, fontSize: 50, lineHeight: 1.32, maxWidth: 640, textShadow: '0 2px 8px rgba(0,0,0,0.6)'}}>
            <DropWords text={d.subtitle} start={sub} frame={frame} style={{}} />
          </div>
        ) : null}
      </div>
    </>
  );
};

const BIG = {w: 520, h: 600, cx: 960, cy: 430}; // a portrait in the centre; its name bar sits under it
const SMALL = 0.4;

const Lineup = ({d, frame, seed}: {d: Extract<ArchiveDossier, {kind: 'lineup'}>; frame: number; seed: string}) => {
  const {fps} = useVideoConfig();
  const ppl = d.people;
  const n = ppl.length;
  const f = (s: number) => Math.round(s * fps);
  const enter = ppl.map((p) => f(p.at) - 14); // portrait rises in; its name drops in on `at`
  const crosses = ppl.map((p) => p.cross).filter((c): c is number => typeof c === 'number');
  const ret = d.returnAt != null ? f(d.returnAt) : null;
  const rowAt = crosses.length ? f(Math.min(...crosses)) - 16 : ret != null ? ret - 16 : null;
  const spacing = Math.min(440, 1640 / Math.max(1, n));
  const slot = (i: number) => ({x: 960 + (i - (n - 1) / 2) * spacing, y: 470});
  return (
    <>
      {ppl.map((p, i) => {
        if (frame < enter[i]) return null;
        const shrinkAt = i + 1 < n ? enter[i + 1] : rowAt;
        const rise = interpolate(frame, [enter[i], enter[i] + 12], [0, 1], {...clamp, easing: ease});
        let s = shrinkAt != null ? interpolate(frame, [shrinkAt, shrinkAt + 12], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)}) : 0;
        let fade = 1;
        if (ret != null && frame >= ret) {
          if (i === 0) s = interpolate(frame, [ret, ret + 14], [1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)});
          else fade = interpolate(frame, [ret, ret + 10], [1, 0], clamp);
        }
        const to = slot(i);
        const x = interpolate(s, [0, 1], [BIG.cx, to.x]);
        const y = interpolate(s, [0, 1], [BIG.cy, to.y]) + interpolate(rise, [0, 1], [720, 0]);
        const scale = interpolate(s, [0, 1], [1, SMALL]);
        const swap = i === 0 && d.heroSwap && frame >= f(d.heroSwap.at) - 8
          ? interpolate(frame, [f(d.heroSwap.at) - 8, f(d.heroSwap.at) + 4], [0, 1], clamp) : 0;
        const cross = p.cross != null ? f(p.cross) : null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - BIG.w / 2,
              top: y - BIG.h / 2,
              width: BIG.w,
              height: BIG.h,
              transform: `scale(${scale})`,
              opacity: fade,
              zIndex: i === 0 && ret != null && frame >= ret ? 50 : i + 1,
            }}
          >
            <Portrait src={p.photo} frame={frame} id={`dlp-${seed}-${i}`} start={enter[i]} split={1.6}
                      style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 1 - swap}} />
            {swap > 0 && d.heroSwap ? (
              <Portrait src={d.heroSwap.photo} frame={frame} id={`dlp-${seed}-swap`} start={f(d.heroSwap.at) - 8} split={1.6}
                        style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
            ) : null}
            {cross != null && frame >= cross ? <Cross frame={frame} start={cross} /> : null}
            <div style={{position: 'absolute', left: -200, right: -200, top: BIG.h + 14, textAlign: 'center', fontFamily, color: CREAM}}>
              <BarTitle text={p.name} start={f(p.at)} frame={frame} size={58} />
            </div>
          </div>
        );
      })}
    </>
  );
};

const Cross = ({frame, start}: {frame: number; start: number}) => {
  const a = interpolate(frame, [start, start + 6], [0, 1], {...clamp, easing: ease});
  const b = interpolate(frame, [start + 4, start + 10], [0, 1], {...clamp, easing: ease});
  const len = Math.hypot(BIG.w, BIG.h);
  return (
    <svg width={BIG.w} height={BIG.h} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
      {[
        [40, 60, BIG.w - 40, BIG.h - 60, a],
        [BIG.w - 40, 60, 40, BIG.h - 60, b],
      ].map(([x1, y1, x2, y2, k], j) => (
        <line key={j} x1={x1} y1={y1} x2={x2} y2={y2} stroke={DOSSIER_RED} strokeWidth={34} strokeLinecap="round"
              strokeDasharray={len} strokeDashoffset={len * (1 - k)} opacity={0.92} />
      ))}
    </svg>
  );
};

const List = ({d, frame}: {d: Extract<ArchiveDossier, {kind: 'list'}>; frame: number}) => {
  const {fps} = useVideoConfig();
  const at = Math.round(d.at * fps);
  const gap = d.items.length > 4 ? 112 : 150;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', fontFamily, color: CREAM}}>
      <BarTitle text={d.title} start={at} frame={frame} size={76} />
      {d.items.map((it, i) => {
        const t = Math.round(it.at * fps) - 6;
        const dot = interpolate(frame, [t, t + 5], [0, 1], {...clamp, easing: ease});
        return (
          <div key={i} style={{position: 'absolute', left: 0, right: 0, top: 150 + i * gap, fontSize: 66, fontWeight: 700}}>
            <span style={{display: 'inline-block', marginRight: '0.3em', opacity: dot, transform: `scale(${0.4 + 0.6 * dot})`}}>•</span>
            <DropWords text={it.text} start={t + 4} frame={frame} style={{}} italic />
          </div>
        );
      })}
    </div>
  );
};

export const DossierCard = ({dossier, frame, durationInFrames, seed}: {
  dossier: ArchiveDossier; frame: number; durationInFrames: number; seed: string;
}) => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <Ground frame={frame} seed={seed} />
    {dossier.kind === 'title' ? <TitleCard d={dossier} frame={frame} durationInFrames={durationInFrames} seed={seed} /> : null}
    {dossier.kind === 'lineup' ? <Lineup d={dossier} frame={frame} seed={seed} /> : null}
    {dossier.kind === 'list' ? <List d={dossier} frame={frame} /> : null}
  </AbsoluteFill>
);

export type {ArchiveDossierPerson};
