import {Easing, Img, interpolate, spring, staticFile, useVideoConfig} from 'remotion';
import {geoEquirectangular, geoPath} from 'd3-geo';
import {feature, mesh} from 'topojson-client';
import worldAtlas from 'world-atlas/countries-50m.json';
import usAtlas from 'us-atlas/states-10m.json';
import type {CSSProperties, ReactNode} from 'react';
import type {FeatureCollection, Geometry} from 'geojson';
import type {ArchiveScene, HistoricalMapPlace, HistoricalMapSpec, HistoricalRoute, MapCoordinate} from './types';
import {ACCENT, ROUTE_COLORS, RETIRED_GOLDS} from './Palette';

// "Real documentary" map: NASA Blue Marble terrain on a tilted 3D ground plane,
// flat keylined routes that draw on, upright pins with callouts, moving vehicles.

const MAP_WIDTH = 1920;
const MAP_HEIGHT = 1080;
const PLANE_W = 2700;
const PLANE_H = 1800;
const PERSPECTIVE = 1500;
const FONT = 'Bahnschrift, "DIN Condensed", "Arial Narrow", Arial, sans-serif';

const WORLD = worldAtlas as unknown as {objects: {countries: never}};
const WORLD_FEATURES = feature(worldAtlas as never, WORLD.objects.countries) as unknown as FeatureCollection<Geometry>;
const COUNTRY_BORDERS = mesh(worldAtlas as never, WORLD.objects.countries, (a, b) => a !== b);
const US = usAtlas as unknown as {objects: {states: never}};
const STATE_BORDERS = mesh(usAtlas as never, US.objects.states, (a, b) => a !== b);

export const PROJECTION = geoEquirectangular()
  .scale(MAP_WIDTH / (2 * Math.PI))
  .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
const PATH = geoPath(PROJECTION);
const COUNTRY_BORDER_PATH = PATH(COUNTRY_BORDERS) || '';
const STATE_BORDER_PATH = PATH(STATE_BORDERS) || '';
const UNITS_PER_DEGREE = MAP_WIDTH / 360;

export type Pt = [number, number];

export const project = (coordinate: MapCoordinate): Pt => {
  const result = PROJECTION(coordinate);
  return result ? [result[0], result[1]] : [MAP_WIDTH / 2, MAP_HEIGHT / 2];
};

const clamp01 = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// ---------- camera ----------

const autoCamera = (spec: HistoricalMapSpec) => {
  const coords: MapCoordinate[] = [
    ...(spec.places ?? []).map((place) => place.coordinates),
    ...(spec.routes ?? []).flatMap((route) => route.points),
  ];
  if (!coords.length) return {center: [MAP_WIDTH / 2, MAP_HEIGHT / 2] as Pt, zoom: 1};
  const pts = coords.map(project);
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const spanX = Math.max(40, Math.max(...xs) - Math.min(...xs));
  const spanY = Math.max(24, Math.max(...ys) - Math.min(...ys));
  const zoom = Math.min(MAP_WIDTH / (spanX * 1.5), MAP_HEIGHT / (spanY * 1.8));
  return {
    center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as Pt,
    zoom,
  };
};

export const cameraAt = (spec: HistoricalMapSpec, progress: number) => {
  const auto = autoCamera(spec);
  const camera = spec.camera ?? {};
  const to = camera.center ? project(camera.center) : auto.center;
  const from = camera.fromCenter ? project(camera.fromCenter) : to;
  const toZoom = Math.max(0.6, camera.zoom ?? auto.zoom);
  const fromZoom = Math.max(0.6, camera.fromZoom ?? toZoom * 0.75);
  const eased = Easing.bezier(0.45, 0, 0.2, 1)(Math.min(1, progress / 0.8));
  const zoom = Math.exp(interpolate(eased, [0, 1], [Math.log(fromZoom), Math.log(toZoom)])) * (1 + 0.035 * progress);
  return {
    cx: interpolate(eased, [0, 1], [from[0], to[0]]),
    cy: interpolate(eased, [0, 1], [from[1], to[1]]),
    zoom,
    eased,
  };
};

// ---------- routes ----------

export const sampleRoute = (route: HistoricalRoute): Pt[] => {
  const pts = route.points.map(project);
  if (pts.length < 2) return pts;
  const out: Pt[] = [];
  if (pts.length === 2) {
    const [a, b] = pts;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.max(0.001, Math.hypot(dx, dy));
    const bend = d * 0.14;
    const c: Pt = [(a[0] + b[0]) / 2 - (dy / d) * bend, (a[1] + b[1]) / 2 + (dx / d) * bend];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      out.push([
        (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
        (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
      ]);
    }
    return out;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    for (let j = 0; j < 24; j++) {
      const t = j / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (
        2 * p1[k] +
        (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
      )) as Pt);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

export type Polyline = {pts: Pt[]; cum: number[]; total: number};

export const polyline = (pts: Pt[]): Polyline => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return {pts, cum, total: Math.max(0.0001, cum[cum.length - 1] ?? 0)};
};

export const pointAt = (line: Polyline, length: number): {pt: Pt; index: number} => {
  const L = Math.max(0, Math.min(line.total, length));
  for (let i = 1; i < line.pts.length; i++) {
    if (line.cum[i] >= L) {
      const seg = Math.max(0.0001, line.cum[i] - line.cum[i - 1]);
      const t = (L - line.cum[i - 1]) / seg;
      const a = line.pts[i - 1];
      const b = line.pts[i];
      return {pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: i};
    }
  }
  return {pt: line.pts[line.pts.length - 1], index: line.pts.length};
};

export const toD = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(' ');

export const partialD = (line: Polyline, progress: number) => {
  if (progress <= 0) return '';
  const {pt, index} = pointAt(line, line.total * progress);
  return toD([...line.pts.slice(0, index), pt]);
};

// ---------- main ----------

export const DocumentaryMap = ({
  scene,
  spec,
  frame,
  durationInFrames,
  holdStart = false,
  holdEnd = false,
}: {
  scene: ArchiveScene;
  spec: HistoricalMapSpec;
  frame: number;
  durationInFrames: number;
  /** the scene dissolve already brings the map in, so do not fade it in again */
  holdStart?: boolean;
  /** keep the map fully on screen to the cut when the next shot dissolves over it */
  holdEnd?: boolean;
}) => {
  const {fps} = useVideoConfig();
  const life = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], clamp01);
  const fadeIn = holdStart ? 1 : interpolate(frame, [0, 12], [0, 1], clamp01);
  const exit = holdEnd ? 1 : interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], clamp01);
  const {cx, cy, zoom, eased} = cameraAt(spec, life);
  const u = 1 / zoom; // one screen-ish pixel in map units
  const vx = cx - PLANE_W / 2 / zoom;
  const vy = cy - PLANE_H / 2 / zoom;

  const tiltFrom = spec.tilt?.from ?? 36;
  const tiltTo = spec.tilt?.to ?? 22;
  const tilt = interpolate(eased, [0, 1], [tiltFrom, tiltTo]);
  const spin = interpolate(eased, [0, 1], [-4, 0]);
  const a = (tilt * Math.PI) / 180;
  const b = (spin * Math.PI) / 180;

  // map units -> screen pixels, following the CSS 3D transform of the plane
  const toScreen = (m: Pt) => {
    const rx = (m[0] - vx) * zoom - PLANE_W / 2;
    const ry = (m[1] - vy) * zoom - PLANE_H / 2;
    const x1 = rx * Math.cos(b) - ry * Math.sin(b);
    const y1 = rx * Math.sin(b) + ry * Math.cos(b);
    const s = PERSPECTIVE / (PERSPECTIVE - y1 * Math.sin(a));
    return {x: MAP_WIDTH / 2 + x1 * s, y: MAP_HEIGHT / 2 + y1 * Math.cos(a) * s, s};
  };

  const routes = (spec.routes ?? []).map((route, index) => {
    const start = route.startAt ?? 0.08;
    const end = Math.max(start + 0.08, route.endAt ?? 0.72);
    const progress = interpolate(life, [start, end], [0, 1], {...clamp01, easing: Easing.inOut(Easing.cubic)});
    const line = polyline(sampleRoute(route));
    // older cuts wrote the retired golds into every route; they now take the palette like uncoloured routes
    const legacy = !route.color || RETIRED_GOLDS.includes(route.color.toLowerCase());
    const color: string = legacy || !route.color ? ROUTE_COLORS[index % ROUTE_COLORS.length] : route.color;
    const head = pointAt(line, line.total * progress).pt;
    const behind = pointAt(line, line.total * progress - line.total * 0.02).pt;
    return {route, index, progress, line, color, head, behind};
  });

  const basemaps = [{src: 'maps/doc/world.jpg', bbox: [-180, -90, 180, 90] as [number, number, number, number]}, ...(spec.basemaps ?? [])];
  const stateOpacity = interpolate(zoom, [4, 7], [0, 1], clamp01);
  const ripple = (((frame % 45) + 45) % 45) / 45;
  const campaign = spec.mode === 'campaign';

  return (
    <div style={{...styles.stage, opacity: fadeIn * exit}}>
      <div style={styles.sky} />
      <div style={styles.perspective}>
        <div
          style={{
            ...styles.plane,
            transform: `rotateX(${tilt}deg) rotateZ(${spin}deg)`,
          }}
        >
          {basemaps.map((map) => {
            const [w, s, e, n] = map.bbox;
            const [x, y] = project([w, n]);
            return (
              <Img
                key={map.src}
                src={staticFile(map.src)}
                style={{
                  position: 'absolute',
                  left: (x - vx) * zoom,
                  top: (y - vy) * zoom,
                  width: (e - w) * UNITS_PER_DEGREE * zoom,
                  height: (n - s) * UNITS_PER_DEGREE * zoom,
                  filter: 'saturate(0.78) contrast(1.14) brightness(0.92) sepia(0.1)',
                }}
              />
            );
          })}
          <div style={styles.sunlight} />
          <svg
            width={PLANE_W}
            height={PLANE_H}
            viewBox={`${vx} ${vy} ${PLANE_W / zoom} ${PLANE_H / zoom}`}
            preserveAspectRatio="none"
            style={styles.svg}
          >
            <defs>
              <filter id={`dm-glow-${scene.index}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={5 * u} />
              </filter>
            </defs>

            {/* borders */}
            <path d={STATE_BORDER_PATH} fill="none" stroke="#ffffff" strokeOpacity={0.2 * stateOpacity} strokeWidth={1 * u} />
            <path d={COUNTRY_BORDER_PATH} fill="none" stroke="#0b0d0e" strokeOpacity={0.35} strokeWidth={3 * u} />
            <path d={COUNTRY_BORDER_PATH} fill="none" stroke="#f3ead6" strokeOpacity={0.55} strokeWidth={1.3 * u} />

            {/* territories */}
            {(spec.territories ?? []).map((territory) => {
              const names = new Set((territory.countries ?? []).map((c) => c.toUpperCase()));
              const at = territory.appearAt ?? 0.05;
              const on = interpolate(life, [at, at + 0.2], [0, 1], clamp01);
              // hand-drawn shapes (states, provinces) that are not in the world atlas
              const drawn = (territory.polygons ?? []).map((polygon, i) => (
                <path
                  key={`${territory.id}-poly-${i}`}
                  d={`M${polygon.map((c) => project(c).join(',')).join('L')}Z`}
                  fill={territory.color}
                  fillOpacity={0.3 * on}
                  stroke={territory.color}
                  strokeOpacity={on}
                  strokeWidth={2.5 * u}
                  strokeLinejoin="round"
                />
              ));
              return drawn.concat(WORLD_FEATURES.features
                .filter((f) => names.has(String((f.properties as {name?: string})?.name ?? '').toUpperCase()))
                .map((f, i) => (
                  <path
                    key={`${territory.id}-${i}`}
                    d={PATH(f) || ''}
                    fill={territory.color}
                    fillOpacity={0.3 * on}
                    stroke={territory.color}
                    strokeOpacity={on}
                    strokeWidth={2.5 * u}
                  />
                )));
            })}

            {/* region / water labels lie flat on the ground */}
            {(spec.regions ?? []).map((region, i) => {
              const [x, y] = project(region.coordinates);
              const o = interpolate(frame, [10 + i * 5, 30 + i * 5], [0, 1], clamp01);
              return (
                <text
                  key={region.label}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fill="#f4efe2"
                  fillOpacity={0.62 * o}
                  fontFamily={FONT}
                  fontStyle={region.italic === false ? 'normal' : 'italic'}
                  fontSize={(region.size ?? 30) * u}
                  letterSpacing={(region.size ?? 30) * 0.42 * u}
                  style={{textShadow: 'none'}}
                >
                  {region.label.toUpperCase()}
                </text>
              );
            })}

            {/* routes */}
            {routes.map(({route, progress, line, color, head, behind}) => {
              const d = partialD(line, progress);
              const full = toD(line.pts);
              const angle = (Math.atan2(head[1] - behind[1], head[0] - behind[0]) * 180) / Math.PI;
              const dest = line.pts[line.pts.length - 1];
              const arrival = interpolate(progress, [0.92, 1], [0, 1], clamp01);
              const preview = interpolate(life, [0, 0.08], [0, 1], clamp01);
              return (
                <g key={route.id}>
                  <path d={full} fill="none" stroke="#fff6e0" strokeOpacity={0.28 * preview} strokeWidth={1.6 * u} strokeDasharray={`${3 * u} ${8 * u}`} strokeLinecap="round" />
                  {d ? (
                    <>
                      <path d={d} fill="none" stroke="#050607" strokeOpacity={0.5} strokeWidth={9 * u} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${2 * u} ${3 * u})`} />
                      {/* flat printed line: a thin dark keyline lifts it off the terrain, no glow or neon core */}
                      <path d={d} fill="none" stroke="#0b0d0e" strokeOpacity={0.7} strokeWidth={(campaign ? 7 : 5) * u + 3 * u} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={d} fill="none" stroke={color} strokeWidth={campaign ? 7 * u : 5 * u} strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  ) : null}
                  {campaign && !route.vehicle && progress > 0.01 ? (
                    <g transform={`translate(${head[0]} ${head[1]}) rotate(${angle}) scale(${u})`}>
                      <path d="M-4,-17 L24,0 L-4,17 L2,0 Z" fill={color} stroke="#1a1510" strokeWidth={2} strokeLinejoin="round" />
                    </g>
                  ) : null}
                  {!campaign && !route.vehicle && progress > 0.01 && progress < 1 ? (
                    <>
                      <circle cx={head[0]} cy={head[1]} r={7 * u} fill={color} stroke="#0b0d0e" strokeWidth={2 * u} />
                    </>
                  ) : null}
                  {arrival > 0 ? (
                    <>
                      <circle cx={dest[0]} cy={dest[1]} r={(10 + ripple * 40) * u} fill="none" stroke={color} strokeWidth={2.5 * u} opacity={arrival * (1 - ripple) * 0.9} />
                      <circle cx={dest[0]} cy={dest[1]} r={(10 + ((ripple + 0.5) % 1) * 40) * u} fill="none" stroke={color} strokeWidth={2.5 * u} opacity={arrival * (1 - ((ripple + 0.5) % 1)) * 0.9} />
                    </>
                  ) : null}
                </g>
              );
            })}

            {/* ground shadows under pins */}
            {(spec.places ?? []).map((place, i) => {
              const [x, y] = project(place.coordinates);
              const shown = place.marker !== 'dot' && (place.appearAt === undefined || frame >= place.appearAt * durationInFrames);
              return shown ? <ellipse key={`sh-${i}`} cx={x} cy={y} rx={9 * u} ry={9 * u} fill="#000" opacity={0.35} filter={`url(#dm-glow-${scene.index})`} /> : null;
            })}
          </svg>
          <Img
            src={staticFile('maps/doc/clouds.png')}
            style={{...styles.clouds, left: -500 + frame * 0.9, top: -260 + frame * 0.25, filter: 'brightness(0) blur(10px)', opacity: 0.3}}
          />
          <Img
            src={staticFile('maps/doc/clouds.png')}
            style={{...styles.clouds, left: -540 + frame * 0.9, top: -300 + frame * 0.25, opacity: 0.2}}
          />
        </div>
      </div>

      {/* upright overlay: vehicles, pins, callouts */}
      {routes.map(({route, progress, head, behind, color, line}) => {
        const nodes: ReactNode[] = [];
        if (route.vehicle && progress > 0.01) {
          const h = toScreen(head);
          const p = toScreen(behind);
          const angle = (Math.atan2(h.y - p.y, h.x - p.x) * 180) / Math.PI;
          const done = interpolate(progress, [0.97, 1], [1, 0], clamp01);
          nodes.push(
            <div key={`v-${route.id}`} style={{...styles.anchor, left: h.x, top: h.y, opacity: done}}>
              <div style={{...styles.vehicleGlow, background: `radial-gradient(circle, ${color}aa 0%, transparent 70%)`}} />
              <svg width={64} height={64} viewBox="-32 -32 64 64" style={{position: 'absolute', left: -32, top: -32, transform: `rotate(${angle}deg) scale(${Math.min(1.25, h.s)})`, overflow: 'visible', filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.6))'}}>
                <Vehicle kind={route.vehicle} color={color} />
              </svg>
            </div>,
          );
        }
        if (route.label) {
          const mid = toScreen(pointAt(line, line.total * 0.5).pt);
          const o = interpolate(progress, [0.55, 0.8], [0, 1], clamp01);
          nodes.push(
            <div key={`l-${route.id}`} style={{...styles.anchor, left: mid.x, top: mid.y - 46, opacity: o}}>
              <div style={{...styles.routeChip, borderColor: color, transform: `translate(-50%, -50%) scale(${interpolate(o, [0, 1], [0.8, 1])})`}}>
                {route.label}
              </div>
            </div>,
          );
        }
        return nodes;
      })}

      {(spec.places ?? []).map((place, i) => (
        <PlaceMarker key={`${place.label}-${i}`} place={place} i={i} p={toScreen(project(place.coordinates))} frame={frame} durationInFrames={durationInFrames} ripple={ripple} />
      ))}

      <div style={styles.haze} />
      <div style={styles.grade} />
      <div style={styles.vignette} />

      <div
        style={{
          ...styles.titleCard,
          opacity: interpolate(frame, [8, 22], [0, 1], clamp01),
          transform: `translateY(${interpolate(frame, [8, 26], [18, 0], {...clamp01, easing: Easing.out(Easing.cubic)})}px)`,
        }}
      >
        {spec.year ? <div style={styles.titleYear}>{spec.year}</div> : null}
        <div style={styles.title}>{spec.title}</div>
        {spec.subtitle ? <div style={styles.subtitle}>{spec.subtitle}</div> : null}
      </div>
    </div>
  );
};

// an upright pin with a callout that wipes on; p is the place's screen position (flat plane or 3D flyover)
export const PlaceMarker = ({place, i, p, frame, durationInFrames, ripple}: {
  place: HistoricalMapPlace; i: number; p: {x: number; y: number; s: number}; frame: number; durationInFrames: number; ripple: number;
}) => {
  const {fps} = useVideoConfig();
  if (p.x < -200 || p.x > MAP_WIDTH + 200 || p.y < -100 || p.y > MAP_HEIGHT + 100) return null;
  const primary = place.importance !== 'secondary';
  const pos = place.labelPosition ?? 'above';
  const delay = place.appearAt !== undefined ? Math.max(6, Math.round(place.appearAt * durationInFrames)) : 10 + i * 7;
  const pop = spring({frame: frame - delay, fps, config: {damping: 12, stiffness: 140}});
  if (place.marker === 'dot') {
    // unlabelled cluster marker (e.g. dozens of camps): a small flat point
    return (
      <div style={{...styles.anchor, left: p.x, top: p.y, transform: `scale(${Math.max(0.8, Math.min(1.15, p.s)) * pop})`}}>
        <div style={{position: 'absolute', left: -5, top: -5, width: 10, height: 10, borderRadius: '50%', background: ACCENT, border: '1.5px solid #0b0d0e', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.5)'}} />
      </div>
    );
  }
  const grow = interpolate(frame, [delay + 4, delay + 14], [0, 1], {...clamp01, easing: Easing.out(Easing.cubic)});
  const wipe = interpolate(frame, [delay + 10, delay + 22], [0, 1], {...clamp01, easing: Easing.out(Easing.cubic)});
  const depth = Math.max(0.8, Math.min(1.15, p.s));
  const accent = primary ? ACCENT : '#b9b3a4';
  const stem = primary ? 58 : 40;
  const vertical = pos === 'above' || pos === 'below';
  const box = (
    <div
      style={{
        ...styles.callout,
        ...(primary ? {} : styles.calloutSecondary),
        borderLeftColor: accent,
        clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
      }}
    >
      {place.label.toUpperCase()}
      {place.detail && primary ? <div style={styles.calloutDetail}>{place.detail}</div> : null}
    </div>
  );
  const boxPos: CSSProperties = pos === 'above'
    ? {left: 0, bottom: stem * grow, transform: 'translateX(-50%)'}
    : pos === 'below'
      ? {left: 0, top: stem * grow, transform: 'translateX(-50%)'}
      : pos === 'left'
        ? {right: stem * grow, top: 0, transform: 'translateY(-50%)'}
        : {left: stem * grow, top: 0, transform: 'translateY(-50%)'};
  return (
    <div style={{...styles.anchor, left: p.x, top: p.y, transform: `scale(${depth})`}}>
      <div
        style={{
          position: 'absolute',
          background: `linear-gradient(${vertical ? '0deg' : pos === 'left' ? '270deg' : '90deg'}, ${accent}, rgba(255,255,255,0.85))`,
          ...(vertical
            ? {left: -1, width: 2, height: stem * grow, [pos === 'above' ? 'bottom' : 'top']: 0}
            : {top: -1, height: 2, width: stem * grow, [pos === 'left' ? 'right' : 'left']: 0}),
        }}
      />
      <div style={{position: 'absolute', whiteSpace: 'nowrap', ...boxPos}}>{box}</div>
      <div
        style={{
          ...styles.pin,
          width: primary ? 16 : 12,
          height: primary ? 16 : 12,
          left: primary ? -8 : -6,
          top: primary ? -8 : -6,
          borderColor: accent,
          transform: `scale(${pop})`,
          boxShadow: `0 0 0 ${2 + ripple * 14}px ${accent}${Math.round((1 - ripple) * 90).toString(16).padStart(2, '0')}, 0 3px 8px rgba(0,0,0,0.6)`,
        }}
      />
    </div>
  );
};

export const Vehicle = ({kind, color}: {kind: string; color: string}) => {
  if (kind === 'ship') {
    return (
      <g>
        <path d="M-24,-6 L14,-6 Q24,-3 27,0 Q24,3 14,6 L-24,6 Q-27,0 -24,-6 Z" fill="#e9e3d4" stroke="#15181a" strokeWidth={1.6} />
        <rect x={-12} y={-3.5} width={14} height={7} rx={1} fill={color} stroke="#15181a" strokeWidth={1} />
        <rect x={-20} y={-2} width={5} height={4} fill="#6b6e70" />
      </g>
    );
  }
  if (kind === 'submarine') {
    return (
      <g>
        <path d="M-26,0 Q-22,-5 -8,-5 L16,-5 Q27,-4 28,0 Q27,4 16,5 L-8,5 Q-22,5 -26,0 Z" fill="#c3c8c9" stroke="#0d0f10" strokeWidth={1.6} />
        <rect x={-2} y={-3} width={9} height={6} rx={2} fill={color} stroke="#0d0f10" strokeWidth={1} />
      </g>
    );
  }
  if (kind === 'plane') {
    return (
      <path d="M24,0 L6,-3 L-4,-20 L-9,-20 L-3,-3 L-16,-3 L-21,-9 L-24,-9 L-21,0 L-24,9 L-21,9 L-16,3 L-3,3 L-9,20 L-4,20 L6,3 Z" fill="#eee8da" stroke="#15181a" strokeWidth={1.4} />
    );
  }
  // train: locomotive + two cars
  return (
    <g stroke="#15181a" strokeWidth={1.4}>
      <rect x={-30} y={-5} width={14} height={10} rx={1.5} fill="#c9c2b2" />
      <rect x={-14} y={-5} width={14} height={10} rx={1.5} fill="#c9c2b2" />
      <path d="M2,-6 L20,-6 Q27,-5 28,0 Q27,5 20,6 L2,6 Z" fill={color} />
    </g>
  );
};

export const styles: Record<string, CSSProperties> = {
  stage: {position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#0c1418'},
  sky: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, #0a1116 0%, #1b2c36 40%, #0c1418 100%)',
  },
  perspective: {position: 'absolute', inset: 0, perspective: PERSPECTIVE, perspectiveOrigin: '50% 50%'},
  plane: {
    position: 'absolute',
    left: (MAP_WIDTH - PLANE_W) / 2,
    top: (MAP_HEIGHT - PLANE_H) / 2,
    width: PLANE_W,
    height: PLANE_H,
    overflow: 'hidden',
    transformOrigin: '50% 50%',
    backgroundColor: '#0f2233',
  },
  svg: {position: 'absolute', left: 0, top: 0, overflow: 'visible'},
  sunlight: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at 30% 25%, rgba(255,226,170,0.16), transparent 55%), linear-gradient(160deg, rgba(0,0,0,0) 40%, rgba(0,8,16,0.35) 100%)',
    mixBlendMode: 'soft-light',
  },
  clouds: {position: 'absolute', width: 3600, height: 1800, pointerEvents: 'none'},
  haze: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(150,178,196,0.42) 0%, rgba(120,150,170,0.14) 16%, rgba(0,0,0,0) 34%)',
    pointerEvents: 'none',
  },
  grade: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(20,60,80,0.18), rgba(90,60,20,0.12))',
    mixBlendMode: 'overlay',
    pointerEvents: 'none',
  },
  vignette: {position: 'absolute', inset: 0, boxShadow: 'inset 0 0 220px 70px rgba(0,0,0,0.72)', pointerEvents: 'none'},
  anchor: {position: 'absolute', width: 0, height: 0},
  pin: {position: 'absolute', borderRadius: '50%', backgroundColor: '#fffaf0', borderStyle: 'solid', borderWidth: 3, boxSizing: 'border-box'},
  callout: {
    padding: '9px 18px 8px 14px',
    backgroundColor: 'rgba(10,13,15,0.84)',
    borderLeft: '4px solid',
    color: '#f6f1e6',
    fontFamily: FONT,
    fontSize: 27,
    fontWeight: 600,
    letterSpacing: 3.2,
    lineHeight: 1,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  calloutDetail: {
    marginTop: 6,
    maxWidth: 380,
    whiteSpace: 'normal',
    fontFamily: 'Georgia, serif',
    fontSize: 17,
    fontWeight: 400,
    fontStyle: 'italic',
    letterSpacing: 0.2,
    lineHeight: 1.25,
    color: '#d9d0bd',
  },
  calloutSecondary: {fontSize: 20, letterSpacing: 2.6, backgroundColor: 'rgba(10,13,15,0.66)', color: '#e3ddd0', padding: '7px 14px 6px 11px'},
  routeChip: {
    position: 'absolute',
    whiteSpace: 'nowrap',
    padding: '6px 14px 5px',
    border: '2px solid',
    backgroundColor: 'rgba(10,13,15,0.82)',
    color: '#fff3d6',
    fontFamily: FONT,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 3,
  },
  vehicleGlow: {position: 'absolute', left: -40, top: -40, width: 80, height: 80, borderRadius: '50%'},
  titleCard: {position: 'absolute', left: 78, top: 70, maxWidth: 900, textShadow: '0 3px 14px rgba(0,0,0,0.85)'},
  titleBar: {height: 4, backgroundColor: ACCENT, marginBottom: 14},
  titleYear: {color: ACCENT, fontFamily: FONT, fontSize: 28, fontWeight: 700, letterSpacing: 7, marginBottom: 6},
  title: {color: '#f7f2e7', fontFamily: FONT, fontSize: 40, fontWeight: 700, letterSpacing: 4, lineHeight: 1.05},
  subtitle: {color: '#d9d1bf', fontFamily: FONT, fontSize: 21, letterSpacing: 1.5, marginTop: 8},
};
