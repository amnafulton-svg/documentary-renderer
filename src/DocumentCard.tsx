import {loadFont} from '@remotion/google-fonts/Poppins';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useVideoConfig} from 'remotion';
import {GridPaper} from './PersonCard';
import type {ArchiveDocument, ArchiveDocumentMark} from './types';

// Document card: a real evidence document (newspaper page, law, letter, telegram, report) as a print on graph
// paper. It rises in and lands whole, then the camera moves in on each passage the narration quotes, the rest of
// the page dims, and the words are marked as they are spoken: a highlighter sweep, an underline or a hand-drawn
// circle. The rects come from OCR of the scan (documents.py), so the marks sit on the real printed words.
const {fontFamily} = loadFont('normal', {weights: ['500', '600'], subsets: ['latin']});

const RED = '#d24a35';
const SLIDE = 16; // frames the print takes to rise in
const AREA_W = 1560;
const AREA_H = 880;
const PAD = 16; // white border of the print
const TILT = -1.2;
const MAX_ZOOM = 3.4;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.inOut(Easing.cubic);

type Px = {x: number; y: number; w: number; h: number};
type Cam = {f: number; cx: number; cy: number; z: number};

const union = (rs: Px[]): Px => {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
};

// the camera: whole page, then on to each mark ahead of its word; zoom eases in log space so it doesn't swoop
const camera = (keys: Cam[], frame: number): Cam => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].f <= frame) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  if (b === a || frame <= a.f) return {...a, f: frame};
  const k = ease(Math.min(1, (frame - a.f) / Math.max(1, b.f - a.f)));
  return {
    f: frame,
    cx: a.cx + (b.cx - a.cx) * k,
    cy: a.cy + (b.cy - a.cy) * k,
    z: Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k),
  };
};

const Mark = ({m, rects, frame, fps, id}: {m: ArchiveDocumentMark; rects: Px[]; frame: number; fps: number; id: string}) => {
  const start = Math.round((m.at - 0.1) * fps);
  const len = Math.max(Math.round(0.45 * fps), m.until ? Math.round((m.until - m.at) * fps) : 0);
  const k = interpolate(frame, [start, start + len], [0, 1], {...clamp, easing: Easing.out(Easing.quad)});
  if (k <= 0) return null;
  const style = m.style ?? 'highlight';
  if (style === 'circle') {
    const u = union(rects);
    const rx = u.w * 0.53 + Math.max(22, u.h * 0.4);
    const ry = u.h / 2 + Math.max(16, u.h * 0.5);
    const cx = u.x + u.w / 2;
    const cy = u.y + u.h / 2;
    // a hand-drawn loop: starts top-left, runs a little past where it began
    const d = `M ${cx - rx * 0.7} ${cy - ry * 0.95} C ${cx + rx * 0.2} ${cy - ry * 1.25}, ${cx + rx * 1.1} ${cy - ry * 0.9}, ${cx + rx} ${cy}`
      + ` S ${cx + rx * 0.3} ${cy + ry * 1.12}, ${cx - rx * 0.4} ${cy + ry * 0.98}`
      + ` S ${cx - rx * 1.1} ${cy + ry * 0.2}, ${cx - rx * 0.92} ${cy - ry * 0.35}`
      + ` S ${cx - rx * 0.35} ${cy - ry * 1.15}, ${cx + rx * 0.05} ${cy - ry * 1.05}`;
    const sw = Math.max(4, u.h * 0.09);
    return (
      <svg style={{position: 'absolute', inset: 0, overflow: 'visible'}} width="100%" height="100%">
        <path d={d} fill="none" stroke={RED} strokeWidth={sw} strokeLinecap="round" pathLength={1}
          strokeDasharray="1 1" strokeDashoffset={1 - k} opacity={0.92} />
      </svg>
    );
  }
  // highlight / underline sweep line by line, left to right, as one continuous stroke
  const total = rects.reduce((s, r) => s + r.w, 0);
  let done = 0;
  return (
    <>
      {rects.map((r, i) => {
        const part = Math.max(0, Math.min(1, (k * total - done) / r.w));
        done += r.w;
        if (part <= 0) return null;
        const padY = r.h * 0.16;
        return style === 'underline' ? (
          <div key={`${id}-${i}`} style={{position: 'absolute', left: r.x - 4, top: r.y + r.h + padY * 0.4,
            width: (r.w + 8) * part, height: Math.max(4, r.h * 0.11), background: RED, borderRadius: 3}} />
        ) : (
          <div key={`${id}-${i}`} style={{position: 'absolute', left: r.x - 6, top: r.y - padY, width: (r.w + 12) * part,
            height: r.h + 2 * padY, background: 'rgba(226, 84, 62, 0.42)', mixBlendMode: 'multiply',
            borderRadius: `${r.h * 0.12}px ${r.h * 0.3}px ${r.h * 0.12}px ${r.h * 0.3}px`}} />
        );
      })}
    </>
  );
};

export const DocumentCard = ({doc, frame, durationInFrames, seed}: {
  doc: ArchiveDocument; frame: number; durationInFrames: number; seed: string;
}) => {
  const {fps} = useVideoConfig();
  // the scan, fitted whole into the stage, inside a white print border
  const fit = Math.min((AREA_W - 2 * PAD) / doc.aspect, AREA_H - 2 * PAD);
  const imgH = fit;
  const imgW = fit * doc.aspect;
  const W = imgW + 2 * PAD;
  const H = imgH + 2 * PAD;
  const marks = [...doc.marks].sort((a, b) => a.at - b.at);
  const px = marks.map((m) => m.rects.map(([x, y, w, h]) => ({x: PAD + x * imgW, y: PAD + y * imgH, w: w * imgW, h: h * imgH})));

  // camera keys: land whole, then leave for each mark ~0.85s before its word and arrive just ahead of it
  const land = Math.round(doc.at * fps);
  const keys: Cam[] = [{f: 0, cx: W / 2, cy: H / 2, z: 1}];
  const arrive: number[] = [];
  marks.forEach((m, i) => {
    const u = union(px[i]);
    const z = Math.max(1, Math.min(MAX_ZOOM, (0.6 * 1920) / u.w, (0.34 * 1080) / u.h));
    // keep the page edge from swinging into the middle: centre no closer to an edge than half the view
    const half = (v: number, span: number, view: number) => (span <= view / z ? span / 2 : Math.max(view / z / 2, Math.min(span - view / z / 2, v)));
    const cx = half(u.x + u.w / 2, W, 1920);
    const cy = half(u.y + u.h / 2, H, 1080);
    const prev = keys[keys.length - 1];
    let a = Math.round((m.at - 0.25) * fps);
    let l = a - Math.round(0.85 * fps);
    l = Math.max(l, prev.f + Math.round(0.25 * fps), land + Math.round(0.3 * fps));
    a = Math.max(a, l + Math.round(0.35 * fps));
    keys.push({...prev, f: l}, {f: a, cx, cy, z});
    arrive.push(a);
  });
  const cam = camera(keys, frame);
  const drift = 1 + 0.018 * (frame / Math.max(1, durationInFrames));

  // the print rises in with a vertical motion blur and settles to a slight tilt
  const k = interpolate(frame, [land - SLIDE, land], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const rise = interpolate(k, [0, 1], [1150, 0]);
  const blur = interpolate(k, [0, 0.7, 1], [30, 8, 0]);
  const rot = interpolate(k, [0, 1], [5, TILT]);
  const z = cam.z * drift;
  const tx = 960 - cam.cx * z;
  const ty = 548 - cam.cy * z + rise;

  return (
    <AbsoluteFill>
      <GridPaper frame={frame} duration={durationInFrames} seed={seed} />
      {frame >= land - SLIDE ? (
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0',
          transform: `translate(${tx}px, ${ty}px) scale(${z}) translate(${W / 2}px, ${H / 2}px) rotate(${rot}deg) translate(${-W / 2}px, ${-H / 2}px)`,
          filter: blur > 0.5 ? `url(#mbv-${seed}) drop-shadow(0 10px 14px rgba(0,0,0,0.3))` : 'drop-shadow(0 10px 14px rgba(0,0,0,0.3))'}}>
          <svg width={0} height={0} style={{position: 'absolute'}}>
            <filter id={`mbv-${seed}`} x="0" y="-50%" width="100%" height="200%">
              <feGaussianBlur stdDeviation={`0 ${blur}`} />
            </filter>
          </svg>
          <div style={{position: 'absolute', inset: 0, background: '#f7f5ef'}} />
          <Img src={staticFile(doc.photo)} style={{position: 'absolute', left: PAD, top: PAD, width: imgW, height: imgH,
            filter: 'sepia(0.08) contrast(1.05)'}} />
          {/* the page dims around the passage being read */}
          {marks.map((m, i) => {
            const next = arrive[i + 1] !== undefined ? keys[2 * (i + 1) + 1].f : Infinity;
            const fadeOut = next === Infinity ? [durationInFrames + 1, durationInFrames + 2] : [next, next + 8];
            const o = interpolate(frame, [arrive[i] - 8, arrive[i] + 4, fadeOut[0], fadeOut[1]], [0, 1, 1, 0], clamp);
            if (o <= 0) return null;
            const u = union(px[i]);
            // the lit window hugs the words (a circle gets room for its ring) and never spills past the scan's edge
            const lineH = Math.min(...px[i].map((r) => r.h));
            const padX = m.style === 'circle' ? u.w * 0.03 + Math.max(22, u.h * 0.4) + 12 : Math.max(14, lineH * 0.3);
            const padY = m.style === 'circle' ? Math.max(16, u.h * 0.5) + 12 : Math.max(8, lineH * (m.style === 'underline' ? 0.28 : 0.2));
            const x0 = Math.max(PAD, u.x - padX), x1 = Math.min(PAD + imgW, u.x + u.w + padX);
            const y0 = Math.max(PAD, u.y - padY), y1 = Math.min(PAD + imgH, u.y + u.h + padY);
            return (
              <svg key={`dim-${i}`} width={W} height={H} style={{position: 'absolute', inset: 0, opacity: o * 0.5}}>
                <path fillRule="evenodd" fill="#1c1a17"
                  d={`M0 0H${W}V${H}H0Z M${x0} ${y0}H${x1}V${y1}H${x0}Z`} />
              </svg>
            );
          })}
          {marks.map((m, i) => {
            const leave = arrive[i + 1] !== undefined ? keys[2 * (i + 1) + 1].f : Infinity;
            const o = leave === Infinity ? 1 : interpolate(frame, [leave, leave + 10], [1, 0], clamp);
            return o <= 0 ? null : (
              <div key={i} style={{position: 'absolute', inset: 0, opacity: o}}>
                <Mark m={m} rects={px[i]} frame={frame} fps={fps} id={`${seed}-${i}`} />
              </div>
            );
          })}
        </div>
      ) : null}
      {doc.source ? (
        <div style={{position: 'absolute', right: 70, top: 46, fontFamily, fontWeight: 600, fontSize: 22, letterSpacing: 2,
          color: 'rgba(38,35,31,0.62)', background: 'rgba(230,227,219,0.85)', padding: '4px 12px'}}>
          {doc.source.toUpperCase()}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
