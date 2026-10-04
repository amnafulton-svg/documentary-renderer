// Documentary data charts: line / column / bar graphics in the same visual language as the stat reveals
// (condensed grotesk, gold + cream on a dark, slightly textured field). Every element is timed to its spoken
// word: `at` values are seconds from the scene start (editor_pass.py resolves "@word" cues), and an element
// finishes arriving on its word, then holds until the scene ends, so data never flashes past or lingers.
import {AbsoluteFill, Easing, interpolate, Loop, OffthreadVideo, staticFile, useVideoConfig} from 'remotion';
import type {CSSProperties} from 'react';
import type {ArchiveChart, ChartFormat} from './types';
import {ACCENT, accentA, ON_ACCENT} from './Palette';

const FONT = 'Bahnschrift, "DIN Condensed", "Arial Narrow", Arial, sans-serif';
const GOLD = ACCENT;
const CREAM = '#f4efe4';
const DIM = 'rgba(244,239,228,0.5)';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const easeOut = {...clamp, easing: Easing.out(Easing.cubic)};
const easeInOut = {...clamp, easing: Easing.inOut(Easing.cubic)};

// plot box: clear of the title above and the subtitles (bottom ~190px) below
const PLOT = {left: 250, right: 1680, top: 330, bottom: 770};
const GROW = 0.9; // seconds an element takes to arrive; it lands on its word

export const fmt = (n: number, f: ChartFormat = {}, decimals = f.decimals ?? 0) => {
  const fixed = Math.abs(n) >= 1000 && decimals === 0
    ? Math.round(n).toLocaleString('en-US')
    : n.toFixed(decimals);
  return `${f.prefix ?? ''}${fixed}${f.suffix ?? ''}`;
};

// 0 → 1 as an element arrives so that it lands at `at`
const arrive = (t: number, at: number, dur = GROW) => interpolate(t, [at - dur, at], [0, 1], easeOut);

// the house data backdrop: a slowly waving grid (public/backdrops/grid.mp4, 59 s, looped) on the warm dark field
export const GRID_VIDEO = 'backdrops/grid.mp4';
const GRID_SECONDS = 59;
// the grid frames the chart: full strength at the edges, fading to about a seventh over the plot so it never runs through the data
const GRID_MASK = 'radial-gradient(ellipse 62% 58% at 50% 51%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,1) 92%)';

export const ChartBackdrop = (_: {frame: number}) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 75% at 45% 42%, #1d1a15 0%, #0e0d0b 62%, #060605 100%)'}}>
      <AbsoluteFill style={{opacity: 0.62, mixBlendMode: 'screen', maskImage: GRID_MASK, WebkitMaskImage: GRID_MASK}}>
        <Loop durationInFrames={Math.round(GRID_SECONDS * fps)}>
          <OffthreadVideo src={staticFile(GRID_VIDEO)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </Loop>
      </AbsoluteFill>
      <AbsoluteFill style={{background: `radial-gradient(circle at 78% 18%, ${accentA(0.06)} 0%, rgba(0,0,0,0) 45%)`}} />
    </AbsoluteFill>
  );
};

const Header = ({chart, t, out}: {chart: ArchiveChart; t: number; out: number}) => {
  const a = chart.appear ?? 0;
  const rule = interpolate(t, [a, a + 0.7], [0, 1], easeOut);
  const title = interpolate(t, [a + 0.1, a + 0.7], [0, 1], easeOut);
  return (
    <>
      <div style={{position: 'absolute', left: 170, top: 112, opacity: out}}>
        <div style={{...styles.kicker, opacity: rule}}>{chart.kicker ?? 'BY THE NUMBERS'}</div>
        <div style={{overflow: 'hidden', marginTop: 10}}>
          <div style={{...styles.title, transform: `translateY(${(1 - title) * 105}%)`}}>{chart.title}</div>
        </div>
      </div>
      {chart.source ? (
        <div style={{...styles.source, opacity: rule * out}}>SOURCE: {chart.source}</div>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------- line chart
const LineChart = ({chart, t}: {chart: ArchiveChart; t: number}) => {
  const series = chart.series ?? [];
  const allX = series.flatMap((s) => s.points.map((p) => p[0]));
  const allY = series.flatMap((s) => s.points.map((p) => p[1]));
  const [x0, x1] = chart.x ?? [Math.min(...allX), Math.max(...allX)];
  const [y0, y1] = chart.y ?? [0, Math.max(...allY) * 1.12];
  const W = PLOT.right - PLOT.left;
  const H = PLOT.bottom - PLOT.top;
  const sx = (x: number) => PLOT.left + ((x - x0) / (x1 - x0)) * W;
  const sy = (y: number) => PLOT.bottom - ((y - y0) / (y1 - y0)) * H;
  const a = chart.appear ?? 0;

  // the line's leading edge reaches each reveal x exactly when its word is spoken
  const reveal = chart.reveal?.length ? chart.reveal : [{x: x1, at: a + 3}];
  const firstAt = reveal[0].at;
  const startAt = Math.max(a + 0.5, firstAt - Math.min(2.4, Math.max(0.8, firstAt - a - 0.5)));
  const times = [startAt, ...reveal.map((r) => r.at)];
  const xs = [x0, ...reveal.map((r) => r.x)];
  for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i], times[i - 1] + 0.05);
  let head = xs[0];
  for (let i = 0; i < times.length - 1; i++) {
    if (t >= times[i]) head = interpolate(t, [times[i], times[i + 1]], [xs[i], xs[i + 1]], easeInOut);
  }
  if (t >= times[times.length - 1]) head = xs[xs.length - 1];
  const moving = t > startAt && t < times[times.length - 1] + 0.6;

  const yAt = (pts: [number, number][], x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        return ay + ((x - ax) / (bx - ax)) * (by - ay);
      }
    }
    return pts[pts.length - 1][1];
  };
  const drawn = (pts: [number, number][]) => {
    const kept = pts.filter((p) => p[0] < head).map((p) => [sx(p[0]), sy(p[1])]);
    kept.push([sx(head), sy(yAt(pts, head))]);
    return kept;
  };

  const axisIn = interpolate(t, [a + 0.2, a + 1.0], [0, 1], easeOut);
  const yTicks = chart.yTicks ?? [0.25, 0.5, 0.75, 1].map((g) => y0 + (y1 - y0) * g);
  const xTicks = chart.xTicks ?? [x0, x1];
  const axisFmt = {...chart.format, decimals: chart.format?.axisDecimals ?? 0};

  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.2} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v} opacity={axisIn}>
            <line x1={PLOT.left} x2={PLOT.left + W * axisIn} y1={sy(v)} y2={sy(v)} stroke="rgba(244,239,228,0.13)" strokeWidth={1} />
            <text x={PLOT.left - 22} y={sy(v) + 10} textAnchor="end" style={styles.axisText}>{fmt(v, axisFmt)}</text>
          </g>
        ))}
        <line x1={PLOT.left} x2={PLOT.left + W * axisIn} y1={PLOT.bottom} y2={PLOT.bottom} stroke="rgba(244,239,228,0.45)" strokeWidth={2} />
        {xTicks.map((x) => (
          <text key={x} x={sx(x)} y={PLOT.bottom + 46} textAnchor="middle" opacity={axisIn} style={styles.axisText}>{x}</text>
        ))}
        {(chart.markers ?? []).map((m) => {
          const on = interpolate(t, [(m.at ?? 0) - 0.5, m.at ?? 0], [0, 1], easeOut) * (m.at === undefined ? (head >= m.x ? 1 : 0) : 1);
          return (
            <g key={m.label} opacity={on}>
              <line x1={sx(m.x)} x2={sx(m.x)} y1={PLOT.bottom} y2={PLOT.bottom - (PLOT.bottom - PLOT.top + 10) * on} stroke={CREAM} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="8 8" />
              <text x={sx(m.x) + 14} y={PLOT.top + 20} style={{...styles.markerText}}>{m.label}</text>
            </g>
          );
        })}
        {series.map((s, si) => {
          const pts = drawn(s.points);
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
          const color = s.color === 'cream' ? CREAM : GOLD;
          const primary = si === 0;
          return (
            <g key={si}>
              {primary ? <path d={`${d} L${pts[pts.length - 1][0]},${PLOT.bottom} L${pts[0][0]},${PLOT.bottom} Z`} fill="url(#chartArea)" /> : null}
              <path d={d} stroke={color} strokeWidth={primary ? 5 : 3.5} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={primary ? 1 : 0.75} />
              {t > startAt ? <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={primary ? 9 : 6} fill={color} /> : null}
              {s.label && t > startAt ? (
                <text x={pts[pts.length - 1][0] + 18} y={pts[pts.length - 1][1] + (primary ? 44 : 30)} style={{...styles.seriesText, fill: color}}>{s.label}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {/* running value at the line head while it draws */}
      {series[0] && moving && !(chart.callouts ?? []).some((c) => t >= c.at - 0.2 && Math.abs(c.x - head) < (x1 - x0) * 0.04) ? (
        <ValueTag
          x={sx(head)}
          y={sy(yAt(series[0].points, head))}
          text={fmt(yAt(series[0].points, head), chart.format)}
          opacity={interpolate(t, [startAt, startAt + 0.3], [0, 1], clamp)}
          dim
        />
      ) : null}
      {(chart.callouts ?? []).map((c, i) => {
        const s = series[c.series ?? 0];
        const y = c.y ?? yAt(s.points, c.x);
        const on = arrive(t, c.at, 0.5);
        return <ValueTag key={i} x={sx(c.x)} y={sy(y)} text={c.text ?? fmt(y, chart.format)} opacity={on} below={c.below} />;
      })}
    </AbsoluteFill>
  );
};

const ValueTag = ({x, y, text, opacity, dim, below}: {x: number; y: number; text: string; opacity: number; dim?: boolean; below?: boolean}) => (
  <div
    style={{
      position: 'absolute',
      left: Math.min(x, PLOT.right + 40),
      top: below ? y + 26 : y - 84,
      transform: `translate(-50%, ${(1 - opacity) * 12}px)`,
      opacity,
      ...styles.tag,
      color: dim ? CREAM : ON_ACCENT,
      backgroundColor: dim ? 'rgba(6,6,5,0.6)' : GOLD,
      border: dim ? `1px solid ${accentA(0.6)}` : 'none',
    }}
  >
    {text}
  </div>
);

// ---------------------------------------------------------------- columns (vertical bars, each on its word)
const ColumnChart = ({chart, t}: {chart: ArchiveChart; t: number}) => {
  const rows = chart.rows ?? [];
  const max = chart.max ?? Math.max(...rows.flatMap((r) => [r.amount, ...(r.steps ?? []).map((s) => s.amount)])) * 1.08;
  const W = PLOT.right - PLOT.left;
  const H = PLOT.bottom - PLOT.top;
  const slot = W / rows.length;
  const barW = Math.min(170, slot * 0.56);
  const a = chart.appear ?? 0;
  const axisIn = interpolate(t, [a + 0.2, a + 1.0], [0, 1], easeOut);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: PLOT.left, top: PLOT.bottom, width: W * axisIn, height: 2, backgroundColor: 'rgba(244,239,228,0.45)'}} />
      {rows.map((r, i) => {
        const {amount, text, grow} = rowValue(r, t, chart.format);
        const h = (amount / max) * H * grow;
        const cx = PLOT.left + slot * (i + 0.5);
        const hl = r.highlight ?? i === rows.length - 1;
        return (
          <div key={i}>
            <div
              style={{
                position: 'absolute',
                left: cx - barW / 2,
                top: PLOT.bottom - h,
                width: barW,
                height: h,
                background: hl ? GOLD : 'rgba(244,239,228,0.4)',
                boxShadow: 'none',
              }}
            />
            <div style={{...styles.colValue, left: cx, top: PLOT.bottom - h - 78, opacity: grow, color: hl ? GOLD : CREAM}}>{text}</div>
            <div style={{...styles.colLabel, left: cx, top: PLOT.bottom + 16, opacity: interpolate(grow, [0, 0.3], [0, 1], clamp)}}>
              {r.label}
              {r.sub ? <div style={styles.colSub}>{r.sub}</div> : null}
            </div>
          </div>
        );
      })}
      <Badge chart={chart} t={t} left={PLOT.left} top={PLOT.top - 70} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- bars (horizontal, each row on its word)
const BarChart = ({chart, t}: {chart: ArchiveChart; t: number}) => {
  const rows = chart.rows ?? [];
  const max = chart.max ?? Math.max(...rows.flatMap((r) => [r.amount, ...(r.steps ?? []).map((s) => s.amount), r.segments ? r.segments.reduce((s, g) => s + g.amount, 0) : 0])) * 1.04;
  const LABEL = chart.labelWidth ?? 400;
  const TRACK = 1000;
  const rowH = Math.min(118, (PLOT.bottom - PLOT.top + 40) / rows.length);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 170, top: PLOT.top - 10, width: 1600}}>
        {rows.map((r, i) => {
          const hl = r.highlight ?? i === rows.length - 1;
          const {amount, text, grow} = rowValue(r, t, chart.format);
          const labelIn = arrive(t, r.at - 0.4, 0.5); // label is in place before the bar finishes growing
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', height: rowH}}>
              <div style={{width: LABEL, flexShrink: 0, overflow: 'hidden'}}>
                <div style={{...styles.rowLabel, color: hl ? CREAM : 'rgba(244,239,228,0.7)', transform: `translateY(${(1 - labelIn) * 105}%)`}}>{r.label}</div>
              </div>
              <div style={{position: 'relative', width: TRACK, height: hl ? 34 : 26, flexShrink: 0}}>
                {chart.track ? <div style={{position: 'absolute', inset: 0, backgroundColor: 'rgba(244,239,228,0.08)', opacity: labelIn}} /> : null}
                {r.segments ? (
                  <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex'}}>
                    {r.segments.map((g, k) => {
                      const gg = arrive(t, g.at);
                      return (
                        <div key={k} style={{position: 'relative', width: (g.amount / max) * TRACK * gg, height: '100%', backgroundColor: k % 2 ? 'rgba(244,239,228,0.32)' : 'rgba(244,239,228,0.5)', borderRight: '2px solid #0e0d0b'}}>
                          <div style={{...styles.segLabel, opacity: interpolate(gg, [0.6, 1], [0, 1], clamp)}}>{g.label}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: (amount / max) * TRACK * grow,
                      background: hl ? GOLD : 'rgba(244,239,228,0.45)',
                      boxShadow: 'none',
                    }}
                  />
                )}
              </div>
              <div style={{...styles.rowValue, color: hl ? GOLD : CREAM, opacity: grow, marginLeft: 26}}>{text}</div>
            </div>
          );
        })}
      </div>
      <Badge chart={chart} t={t} left={170 + LABEL} top={PLOT.top + rows.length * rowH + 4} />
    </AbsoluteFill>
  );
};

const Badge = ({chart, t, left, top}: {chart: ArchiveChart; t: number; left: number; top: number}) => {
  if (!chart.badge) return null;
  const on = arrive(t, chart.badge.at, 0.5);
  return (
    <div style={{position: 'absolute', left, top, opacity: on, transform: `translateY(${(1 - on) * 14}px)`, ...styles.badge}}>
      {chart.badge.text}
    </div>
  );
};

// a row's current amount: grows in on its word, then steps to each later value on that value's word
const rowValue = (r: NonNullable<ArchiveChart['rows']>[number], t: number, format?: ChartFormat) => {
  const grow = arrive(t, r.at);
  let amount = r.segments ? r.segments.reduce((s, g) => s + g.amount, 0) : r.amount;
  let shown = amount * grow;
  let text = r.text ?? fmt(shown, format);
  let prev = amount;
  for (const st of r.steps ?? []) {
    const p = arrive(t, st.at, 1.1);
    if (p <= 0) break;
    amount = prev + (st.amount - prev) * p;
    shown = amount;
    text = p >= 1 && st.text ? st.text : fmt(amount, format);
    prev = st.amount;
  }
  if (r.steps?.length) return {amount: shown / Math.max(grow, 1e-6), text, grow};
  if (r.text && grow < 1) text = fmt(shown, format);
  return {amount, text, grow};
};

export const DataChart = ({chart, frame, durationInFrames, backdrop = true}: {
  chart: ArchiveChart;
  frame: number;
  durationInFrames: number;
  // false when the scene frame under the chart already shows the same backdrop (no need to decode the grid twice)
  backdrop?: boolean;
}) => {
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const end = Math.min(durationInFrames / fps, chart.until ?? Infinity);
  if (t > end + 0.1) return null;
  const out = interpolate(t, [end - 0.45, end], [1, 0], clamp);
  const a = chart.appear ?? 0;
  const fieldIn = interpolate(t, [a - 0.1, a + 0.4], [0, 1], clamp);
  const body = chart.type === 'line' ? <LineChart chart={chart} t={t} /> : chart.type === 'columns' ? <ColumnChart chart={chart} t={t} /> : <BarChart chart={chart} t={t} />;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity: Math.min(fieldIn, chart.until !== undefined ? out : 1)}}>
      {backdrop ? <ChartBackdrop frame={frame} /> : null}
      <Header chart={chart} t={t} out={1} />
      {body}
    </AbsoluteFill>
  );
};

const styles: Record<string, CSSProperties> = {
  kicker: {fontFamily: FONT, fontSize: 30, fontWeight: 700, letterSpacing: 7, color: GOLD, textTransform: 'uppercase'},
  title: {fontFamily: FONT, fontSize: 56, fontWeight: 700, letterSpacing: 2, lineHeight: 1.08, color: CREAM, textTransform: 'uppercase', maxWidth: 1500},
  source: {position: 'absolute', right: 170, top: 118, fontFamily: FONT, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: 'rgba(244,239,228,0.72)', textAlign: 'right', maxWidth: 520},
  axisText: {fontFamily: FONT, fontSize: 26, letterSpacing: 1, fill: 'rgba(244,239,228,0.62)'},
  markerText: {fontFamily: FONT, fontSize: 26, fontWeight: 600, letterSpacing: 4, fill: CREAM},
  seriesText: {fontFamily: FONT, fontSize: 26, fontWeight: 700, letterSpacing: 3},
  tag: {fontFamily: FONT, fontStretch: '75%', fontSize: 44, fontWeight: 700, padding: '4px 14px 2px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'},
  colValue: {position: 'absolute', transform: 'translateX(-50%)', fontFamily: FONT, fontStretch: '75%', fontSize: 60, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'},
  colLabel: {position: 'absolute', transform: 'translateX(-50%)', fontFamily: FONT, fontSize: 28, fontWeight: 600, letterSpacing: 3, color: CREAM, textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'uppercase'},
  colSub: {fontSize: 21, fontWeight: 400, letterSpacing: 2, color: DIM, marginTop: 4},
  rowLabel: {fontFamily: FONT, fontSize: 34, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', whiteSpace: 'nowrap'},
  rowValue: {fontFamily: FONT, fontStretch: '75%', fontSize: 68, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'},
  segLabel: {position: 'absolute', left: 10, top: -36, fontFamily: FONT, fontSize: 22, letterSpacing: 2, color: CREAM, whiteSpace: 'nowrap'},
  badge: {fontFamily: FONT, fontSize: 34, fontWeight: 700, letterSpacing: 3, color: ON_ACCENT, backgroundColor: GOLD, padding: '6px 14px 5px', whiteSpace: 'nowrap'},
};
