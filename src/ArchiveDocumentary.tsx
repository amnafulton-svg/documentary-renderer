import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {geoEquirectangular, geoPath} from 'd3-geo';
import {feature} from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
import type {CSSProperties, ReactNode} from 'react';
import type {FeatureCollection, Geometry} from 'geojson';
import type {ArchiveCaption, ArchiveData, ArchiveScene, ArchiveShot, HistoricalMapSpec, HistoricalRoute} from './types';
import {HistoricalMap} from './HistoricalMap';
import {DocumentaryMap} from './DocumentaryMap';
import {ChartBackdrop, DataChart} from './DataChart';
import {ACCENT, ON_ACCENT} from './Palette';
import {FilmGrain, GradeDefs, lookFilter, ParallaxStill, SCAN_TALL, SCAN_WIDE, ScanPrint} from './Look';

type GeoPoint = [longitude: number, latitude: number];

const WORLD_FEATURES = feature(
  worldAtlas as never,
  (worldAtlas as unknown as {objects: {countries: never}}).objects.countries,
) as unknown as FeatureCollection<Geometry>;
const WORLD_PROJECTION = geoEquirectangular().fitExtent(
  [[35, 35], [1565, 725]],
  WORLD_FEATURES,
);
const WORLD_PATH = geoPath(WORLD_PROJECTION);
const MAP_LOCATIONS: Record<string, GeoPoint> = {
  'AFRICA': [20, 5],
  'ASIA': [90, 34],
  'ATLANTIC': [-35, 20],
  'BABAOSHAN CEMETERY, BEIJING': [116.2, 39.9],
  'BEIJING': [116.4, 39.9],
  'BERLIN': [13.4, 52.5],
  'BRAZIL': [-51.9, -14.2],
  'BRITAIN': [-3.4, 55.4],
  'CARIBBEAN': [-72, 18],
  'CHANGCHUN': [125.3, 43.8],
  'CHINA': [104.2, 35.9],
  'CRIMEA': [34.1, 44.9],
  'DETROIT': [-83.05, 42.33],
  'ENGLAND': [-1.5, 52.4],
  'EUROPE': [15, 52],
  'FLORIDA': [-81.5, 27.7],
  'FRANCE': [2.2, 46.2],
  'FUSHUN, LIAONING': [123.9, 41.9],
  'GERMANY': [10.5, 51.2],
  'HAITI': [-72.3, 19],
  'HUALONG ROYAL CEMETERY': [115.3, 39.4],
  'IRAN': [53.7, 32.4],
  'ISTANBUL': [29, 41],
  'LONDON': [-0.1, 51.5],
  'MANCHURIA': [127, 46],
  'MEXICO': [-102.5, 23.6],
  // Regional labels use recognizable reference anchors rather than broad bounding-box centers.
  'MONGOLIA': [106.91, 47.89],
  'MOSCOW': [37.6, 55.8],
  'NEW YORK': [-74, 40.7],
  'NORTH AFRICA': [10, 33],
  'OTTOMAN EMPIRE': [34, 39],
  'PACIFIC': [-155, 10],
  'PARIS': [2.35, 48.86],
  'PORT-AU-PRINCE': [-72.34, 18.54],
  'RUSSIA': [90, 60],
  'SAINT-DOMINGUE': [-72.5, 19],
  'SIBERIA': [105, 60],
  'SOUTH CHINA SEA': [116, 12.5],
  'SOVIET FAR EAST': [135, 49],
  'TIANJIN': [117.2, 39.1],
  'TEXAS': [-99.3, 31.5],
  'TOKYO': [139.7, 35.7],
  'TIBET': [91.17, 29.65],
  'UKRAINE': [31.2, 48.4],
  'UNITED STATES': [-98.6, 39.8],
  'WASHINGTON': [-77, 38.9],
  'WILLOW RUN': [-83.53, 42.24],
};
const INVALID_MAP_LABELS = new Set(['', 'ORIGIN', 'DESTINATION', 'UNKNOWN', 'ROUTE TRACE']);
const EXTENT_MAP_RE = /\b(empire|extent|stretch(?:ed|ing)?|span(?:ned|ning)?|territor(?:y|ial)|border|annex(?:ed|ation)|ruled)\b/i;

const locationPoint = (label?: string) => {
  const normalized = (label || '').trim().toUpperCase();
  if (INVALID_MAP_LABELS.has(normalized)) return null;
  if (MAP_LOCATIONS[normalized]) return WORLD_PROJECTION(MAP_LOCATIONS[normalized]);
  const contained = Object.keys(MAP_LOCATIONS).find(
    (name) => normalized.includes(name) || name.includes(normalized),
  );
  return contained ? WORLD_PROJECTION(MAP_LOCATIONS[contained]) : null;
};

const locationCoordinate = (label?: string): GeoPoint | null => {
  const normalized = (label || '').trim().toUpperCase();
  if (INVALID_MAP_LABELS.has(normalized)) return null;
  if (MAP_LOCATIONS[normalized]) return MAP_LOCATIONS[normalized];
  const contained = Object.keys(MAP_LOCATIONS).find((name) => normalized.includes(name) || name.includes(normalized));
  return contained ? MAP_LOCATIONS[contained] : null;
};

const VEHICLE_PATTERNS: Array<[NonNullable<HistoricalRoute['vehicle']>, RegExp]> = [
  ['submarine', /\b(u-?boats?|submarines?)\b/i],
  ['plane', /\b(fl[eo]w|flight|flying|planes?|aircraft|airlift(?:ed)?|bombers?|flown)\b/i],
  ['ship', /\b(ships?|shipped|sail(?:ed|ing)?|voyage|convoys?|fleet|boats?|liners?|steamer)\b/i],
  ['train', /\b(trains?|rail(?:road|way)?s?|boxcars?|locomotives?)\b/i],
];

// Every map uses the documentary satellite style unless a spec explicitly asks for style "dark".
// Simple mapFrom/mapTo routes are upgraded to a documentary journey automatically.
const mapSpecFor = (scene: ArchiveScene): HistoricalMapSpec | null => {
  if (scene.graphic !== 'kinetic_map') return null;
  if (scene.historicalMap) {
    return scene.historicalMap.style === 'dark' ? null : {...scene.historicalMap, style: 'documentary'};
  }
  const from = locationCoordinate(scene.mapFrom);
  const to = locationCoordinate(scene.mapTo);
  if (!from || !to || (from[0] === to[0] && from[1] === to[1])) return null;
  const vehicle = VEHICLE_PATTERNS.find(([, pattern]) => pattern.test(scene.text))?.[0];
  const west = from[0] <= to[0];
  return {
    mode: 'journey',
    style: 'documentary',
    title: (scene.mapLabel || `${scene.mapFrom} to ${scene.mapTo}`).toUpperCase(),
    year: scene.dateHint || undefined,
    accuracy: 'approximate',
    places: [
      {label: (scene.mapFrom || '').toUpperCase(), coordinates: from, labelPosition: west ? 'left' : 'right', appearAt: 0.04},
      {label: (scene.mapTo || '').toUpperCase(), coordinates: to, labelPosition: west ? 'right' : 'left', appearAt: 0.66},
    ],
    routes: [{id: 'route', points: [from, to], color: ACCENT, startAt: 0.08, endAt: 0.72, vehicle}],
  };
};

const narrationMapPoints = (scene: ArchiveScene) => {
  const narration = scene.text.toUpperCase();
  return Object.entries(MAP_LOCATIONS)
    .filter(([label]) => narration.includes(label))
    .map(([label, coordinates]) => ({label, point: WORLD_PROJECTION(coordinates)}))
    .filter((item): item is {label: string; point: [number, number]} => Boolean(item.point));
};

const convexHull = (points: Array<[number, number]>) => {
  if (points.length <= 2) return points;
  const sorted = [...points].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  const cross = (origin: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower: Array<[number, number]> = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Array<[number, number]> = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

const mapRoute = (scene: ArchiveScene) => {
  const narrationPoints = narrationMapPoints(scene);
  const isExtent = EXTENT_MAP_RE.test(scene.text) && narrationPoints.length >= 2;
  const from = locationPoint(scene.mapFrom) || (isExtent ? narrationPoints[0]?.point : null);
  const to = locationPoint(scene.mapTo) || (isExtent ? narrationPoints[1]?.point : null);
  if (!from || !to) return null;
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (distance < 3) return null;
  const displayPoints = isExtent
    ? narrationPoints
    : [
        {label: (scene.mapFrom || '').trim().toUpperCase(), point: from},
        {label: (scene.mapTo || '').trim().toUpperCase(), point: to},
      ];
  const boundsPoints = displayPoints.map((item) => item.point);
  const midpointX = (from[0] + to[0]) / 2;
  const midpointY = (from[1] + to[1]) / 2;
  const bend = Math.max(1.5, Math.min(105, distance * 0.34));
  const direction = scene.index % 2 === 0 ? 1 : -1;
  const normalX = -(to[1] - from[1]) / distance;
  const normalY = (to[0] - from[0]) / distance;
  const control: [number, number] = [
    midpointX + normalX * bend * direction,
    midpointY + normalY * bend * direction,
  ];
  const aspect = 1600 / 760;
  const minX = Math.min(...boundsPoints.map(([x]) => x));
  const maxX = Math.max(...boundsPoints.map(([x]) => x));
  const minY = Math.min(...boundsPoints.map(([, y]) => y));
  const maxY = Math.max(...boundsPoints.map(([, y]) => y));
  const routePadding = Math.max(38, Math.min(210, distance * 0.85));
  const minimumRouteWidth = distance < 12 ? 80 : distance < 45 ? 120 : 170;
  const routeWidth = isExtent
    ? Math.max(460, maxX - minX + 310)
    : Math.max(minimumRouteWidth, maxX - minX + routePadding * 2);
  const routeHeight = isExtent
    ? Math.max(250, maxY - minY + 220)
    : Math.max(minimumRouteWidth / aspect, maxY - minY + routePadding * 1.1);
  const viewWidth = Math.max(routeWidth, routeHeight * aspect);
  const viewHeight = viewWidth / aspect;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const viewBounds: [number, number, number, number] = [
    centerX - viewWidth / 2,
    centerY - viewHeight / 2,
    viewWidth,
    viewHeight,
  ];
  return {
    from,
    to,
    control,
    distance,
    displayPoints,
    isExtent,
    viewBounds,
    viewBox: viewBounds.join(' '),
  };
};

type MapRouteData = NonNullable<ReturnType<typeof mapRoute>>;

const mapAnimationFrames = (routeData: MapRouteData, availableFrames: number) => {
  const target = routeData.isExtent
    ? 42
    : routeData.distance < 12
      ? 28
      : routeData.distance < 70
        ? 46
        : 64;
  return Math.max(14, Math.min(target, availableFrames - 8));
};

const cueWords = (text: string): string[] => Array.from(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);

const cueAnchor = (scene: ArchiveScene) => {
  const text = scene.text.toLowerCase();
  const patterns = scene.graphic === 'kinetic_map'
    ? EXTENT_MAP_RE.test(scene.text)
      ? [/\b(stretching|stretched|spanning|spanned)\b/, /\b(from)\b/]
      : [/\b(moved|handed|transferred|transported|deported|fled|sailed|marched|crossed|returned|sent|taken|expelled|invaded|occupied)\b/]
    : scene.sourceImage || scene.graphic === 'document_highlight'
      ? [
          /\b(signed|wrote|published|issued|announced|reported|concluded|revealed)\b/,
          /\b(document|newspapers?|articles?|headlines?|letters?|decrees?|edicts?|reports?|ledgers?|memorandums?|treaties|certificates?|manifests?)\b/,
        ]
      : [
          /\b(stretching|moved|handed|transferred|signed|wrote|published|issued|announced|revealed)\b/,
        ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && typeof match.index === 'number') {
      return {word: match[1] || match[0], characterIndex: match.index};
    }
  }
  return null;
};

const sceneVisualCueStart = (scene: ArchiveScene, captions: ArchiveCaption[]) => {
  const latest = Math.max(scene.start, scene.end - 0.35);
  if (typeof scene.visualCueStart === 'number' && Number.isFinite(scene.visualCueStart)) {
    return Math.max(scene.start, Math.min(latest, scene.visualCueStart));
  }

  const anchor = cueAnchor(scene);
  if (anchor) {
    for (const caption of captions) {
      if (caption.end < scene.start || caption.start > scene.end) continue;
      const words = cueWords(caption.text);
      const wordIndex = words.indexOf(anchor.word);
      if (wordIndex < 0) continue;
      const wordPosition = wordIndex / Math.max(1, words.length);
      const timestamp = caption.start + (caption.end - caption.start) * wordPosition - 0.1;
      return Math.max(scene.start, Math.min(latest, timestamp));
    }
  }

  const sceneWords = cueWords(scene.text);
  const cueIndex = anchor
    ? cueWords(scene.text.slice(0, anchor.characterIndex)).length
    : Math.round(sceneWords.length * 0.06);
  const ratio = cueIndex / Math.max(1, sceneWords.length);
  const estimated = scene.start + (scene.end - scene.start) * ratio - 0.1;
  return Math.max(scene.start, Math.min(latest, estimated));
};

// ---------- editing: transitions ----------
// Chosen per cut like an editor would: dissolves between longer shots, hard cuts inside footage
// montages and on short beats, a dip to black on time jumps, a film burn on light-leak beats, a camera flash on
// scan/shutter beats, and longer dissolves into and out of maps.
type TransitionKind = 'open' | 'dissolve' | 'cut' | 'dip' | 'burn' | 'flash';
type Transition = {kind: TransitionKind; frames: number};

const MAX_OVERLAP = 14; // every footage clip carries at least ~0.5s of spare tail

// maps and full-screen charts dissolve in and out
const isMapScene = (scene: ArchiveScene) => (scene.graphic === 'kinetic_map' || !!scene.chart) && !scene.video && !scene.image;

const transitionInto = (prev: ArchiveScene | undefined, scene: ArchiveScene, fps: number): Transition => {
  if (!prev) return {kind: 'open', frames: Math.round(fps * 0.55)};
  const seconds = scene.end - scene.start;
  if (isMapScene(scene) || isMapScene(prev)) return {kind: 'dissolve', frames: 16};
  if (scene.accent === 'date_stamp' && seconds > 2.2) return {kind: 'dip', frames: 12};
  if (scene.accent === 'light_leak') return {kind: 'burn', frames: 14};
  if (scene.accent === 'scan' || scene.accent === 'shutter') return {kind: 'flash', frames: 5};
  // footage montages and short punchy beats cut on the beat; longer reflective shots dissolve
  if (prev.video && scene.video) return {kind: 'cut', frames: 0};
  if (seconds < 4.5) return {kind: 'cut', frames: 0};
  return {kind: 'dissolve', frames: 12};
};

const overlapOf = (transition?: Transition) =>
  transition && (transition.kind === 'dissolve' || transition.kind === 'burn') ? Math.min(MAX_OVERLAP, transition.frames) : 0;

const TransitionFx = ({transition}: {transition: Transition}) => {
  const frame = useCurrentFrame();
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  if (transition.kind === 'burn') {
    const T = transition.frames;
    const heat = interpolate(frame, [0, T * 0.55, T * 1.1, T * 2], [0, 0.95, 0.55, 0], clamp);
    const drift = interpolate(frame, [0, T * 2], [-18, 22], clamp);
    return (
      <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen', opacity: heat}}>
        <AbsoluteFill style={{background: `radial-gradient(ellipse 70% 90% at ${58 + drift}% 45%, #fff4d6 0%, #ffb347 28%, #d2451e 55%, rgba(80,10,0,0) 80%)`}} />
        <AbsoluteFill style={{background: `radial-gradient(circle at ${12 - drift / 2}% 80%, rgba(255,120,40,0.8) 0%, rgba(0,0,0,0) 45%)`}} />
      </AbsoluteFill>
    );
  }
  if (transition.kind === 'flash') {
    const flash = interpolate(frame, [0, 1, 2, 6], [0, 0.85, 0.5, 0], clamp);
    return <AbsoluteFill style={{pointerEvents: 'none', backgroundColor: '#fffaf0', opacity: flash}} />;
  }
  return null;
};

export const ArchiveDocumentary = ({data}: {data: ArchiveData}) => {
  const {fps} = useVideoConfig();
  const showSubtitles = data.renderOptions?.showSubtitles ?? true;
  const showArchiveOverlay = data.renderOptions?.showArchiveOverlay ?? true;
  const showDocumentHighlights = data.renderOptions?.showDocumentHighlights ?? true;
  const showKineticMaps = data.renderOptions?.showKineticMaps ?? true;
  const enableVisualSfx = data.renderOptions?.enableVisualSfx ?? true;
  const transitions = data.scenes.map((scene, i) => transitionInto(data.scenes[i - 1], scene, fps));

  if (!data.scenes.length) {
    return (
      <AbsoluteFill style={styles.empty}>
        <div style={styles.emptyTitle}>Archive Remotion Factory</div>
        <div style={styles.emptyText}>Build a preview from the Python app.</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={styles.stage}>
      {showArchiveOverlay ? <GradeDefs /> : null}
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}
      {showArchiveOverlay && enableVisualSfx ? <SoundEffects data={data} /> : null}
      {data.scenes.map((scene, i) => {
        const from = Math.floor(scene.start * fps);
        const durationInFrames = Math.max(1, Math.ceil((scene.end - scene.start) * fps));
        const transitionIn = transitions[i];
        const transitionOut = transitions[i + 1];
        // the incoming shot starts under the outgoing one, which keeps playing until the dissolve ends
        const lead = overlapOf(transitionIn);
        const tail = overlapOf(transitionOut);
        return (
          <Sequence key={scene.index} from={from - lead} durationInFrames={durationInFrames + lead + tail}>
            <ArchiveSceneFrame
              scene={scene}
              captions={data.captions ?? []}
              lead={lead}
              transitionIn={transitionIn}
              transitionOut={transitionOut}
              durationInFrames={durationInFrames}
              showArchiveOverlay={showArchiveOverlay}
              showDocumentHighlights={showDocumentHighlights}
              showKineticMaps={showKineticMaps}
            />
          </Sequence>
        );
      })}
      {showArchiveOverlay
        ? data.scenes.map((scene, i) => {
            const transition = transitions[i];
            if (transition.kind !== 'burn' && transition.kind !== 'flash') return null;
            const cut = Math.floor(scene.start * fps);
            const pre = transition.kind === 'burn' ? Math.round(transition.frames * 0.55) : 1;
            return (
              <Sequence key={`fx-${scene.index}`} from={Math.max(0, cut - pre)} durationInFrames={transition.frames * 2 + 2}>
                <TransitionFx transition={transition} />
              </Sequence>
            );
          })
        : null}
      {showArchiveOverlay ? <FilmGrain strength={0.16} /> : null}
      {showSubtitles ? <Captions captions={data.captions ?? []} /> : null}
    </AbsoluteFill>
  );
};

const SoundEffects = ({data}: {data: ArchiveData}) => {
  const {fps} = useVideoConfig();
  const sfx = data.sfx ?? {};
  const namedSound = (name?: string) => {
    if (name === 'paper_slide') return sfx.paperSlide;
    if (name === 'camera_click') return sfx.cameraClick;
    if (name === 'marker_stroke') return sfx.markerStroke;
    if (name === 'map_ping') return sfx.mapPing;
    if (name === 'typewriter') return sfx.typewriter;
    return null;
  };
  const accentSound = (accent?: string, explicit?: string) => {
    const planned = namedSound(explicit);
    if (planned) return planned;
    if (accent === 'scan' || accent === 'shutter') return sfx.cameraClick;
    if (accent === 'document_highlight') return sfx.markerStroke;
    if (accent === 'kinetic_map') return sfx.mapPing;
    if (accent === 'focus' || accent === 'light_leak') return sfx.paperSlide;
    return null;
  };

  return (
    <>
      {sfx.projectorStart ? (
        <Sequence from={0} durationInFrames={Math.round(fps * 2.1)}>
          <Audio src={resolveAudioSrc(sfx.projectorStart)} volume={0.18} />
        </Sequence>
      ) : null}
      {data.scenes.map((scene) => {
        const documentaryMap = mapSpecFor(scene);
        const routeData = scene.graphic === 'kinetic_map' && !scene.historicalMap && !documentaryMap ? mapRoute(scene) : null;
        if (scene.graphic === 'kinetic_map' && !scene.historicalMap && !documentaryMap && !routeData) return null;
        if (scene.graphic === 'document_highlight' && !scene.sourceImage) return null;
        const file = scene.sourceImage
          ? sfx.paperSlide
          : accentSound(scene.accent, scene.sfx);
        if (!file) return null;
        const cueSecond = sceneVisualCueStart(scene, data.captions ?? []);
        const cueDurationFrames = Math.max(1, Math.ceil((scene.end - cueSecond) * fps));
        const cueOffset = scene.graphic === 'kinetic_map'
          ? scene.historicalMap || documentaryMap
            ? Math.round(fps * 0.62)
            : routeData?.isExtent
            ? Math.round(fps * 0.18)
            : mapAnimationFrames(routeData as MapRouteData, cueDurationFrames)
          : scene.sourceImage
            ? Math.round(fps * 0.12)
            : 0;
        return (
          <Sequence
            key={`sfx-${scene.index}`}
            from={Math.floor(cueSecond * fps) + cueOffset}
            durationInFrames={Math.round(fps * 1.4)}
          >
            <Audio src={resolveAudioSrc(file)} volume={scene.sfx === 'map_ping' ? 0.13 : 0.1} />
          </Sequence>
        );
      })}
    </>
  );
};

const resolveAudioSrc = (src: string) => {
  return /^https?:\/\//.test(src) ? src : staticFile(src);
};

const ArchiveSceneFrame = ({
  scene,
  captions,
  lead,
  transitionIn,
  transitionOut,
  durationInFrames,
  showArchiveOverlay,
  showDocumentHighlights,
  showKineticMaps,
}: {
  scene: ArchiveScene;
  captions: ArchiveCaption[];
  lead: number;
  transitionIn: Transition;
  transitionOut?: Transition;
  durationInFrames: number;
  showArchiveOverlay: boolean;
  showDocumentHighlights: boolean;
  showKineticMaps: boolean;
}) => {
  // frame 0 is the cut point; negative frames are the dissolve starting under the previous shot
  const frame = useCurrentFrame() - lead;
  const {fps} = useVideoConfig();
  const mapSpec = mapSpecFor(scene);
  const cueSecond = sceneVisualCueStart(scene, captions);
  const cueFrame = Math.max(0, Math.round((cueSecond - scene.start) * fps));
  const visualFrame = frame - cueFrame;
  const visualDurationInFrames = Math.max(1, durationInFrames - cueFrame);
  const visualIsActive = visualFrame >= 0;
  // Ken Burns keeps moving through the dissolve tails instead of freezing
  const progress = interpolate(frame, [-lead, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
  });
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const fadeIn = transitionIn.kind === 'open'
    ? interpolate(frame, [0, transitionIn.frames], [0, 1], clamp)
    : transitionIn.kind === 'dip'
      ? interpolate(frame, [0, transitionIn.frames], [0, 1], {...clamp, easing: Easing.out(Easing.quad)})
      : lead > 0
        ? interpolate(frame, [-lead, 0], [0, 1], {...clamp, easing: Easing.inOut(Easing.sin)})
        : 1;
  const fadeOut = !transitionOut
    ? interpolate(frame, [durationInFrames - fps * 0.7, durationInFrames], [1, 0], clamp)
    : transitionOut.kind === 'dip'
      ? interpolate(frame, [durationInFrames - 9, durationInFrames], [1, 0], {...clamp, easing: Easing.in(Easing.quad)})
      : 1;
  const fade = Math.min(fadeIn, fadeOut);
  const holdMapToCut = overlapOf(transitionOut) > 0;
  // long stills are broken into several framings (wide, then detail punch-ins) hard-cut on phrase boundaries
  const shots = !scene.video && scene.image ? scene.shots ?? [] : [];
  const sceneSecond = scene.start + frame / fps;
  const shotIndex = shots.reduce((found, shot, i) => (sceneSecond >= shot.at ? i : found), -1);
  const segStart = shotIndex < 0 ? -lead : Math.round((shots[shotIndex].at - scene.start) * fps);
  const segEnd = shotIndex + 1 < shots.length ? Math.round((shots[shotIndex + 1].at - scene.start) * fps) : durationInFrames;
  const segProgress = interpolate(frame, [segStart, Math.max(segStart + 1, segEnd - 1)], [0, 1], {extrapolateLeft: 'clamp'});
  const framed = !scene.video && scene.fit === 'contain';
  const transform = shotIndex >= 0
    ? shotTransform(shots[shotIndex], segProgress)
    : framed
      ? printTransform(shots.length ? segProgress : progress)
      : imageTransform(scene, shots.length ? segProgress : progress);
  const focusBlur = scene.index === 1
    ? interpolate(frame, [0, 14, 42], [8, 2.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 0;
  const look = (tone?: ArchiveScene['tone']) => (showArchiveOverlay
    ? `${imageFilter(scene, frame, tone)} blur(${focusBlur}px)`
    : `blur(${focusBlur}px)`);
  const ownProgress = shots.length ? segProgress : progress;
  const scan = framed && scene.aspect && (scene.aspect >= SCAN_WIDE || scene.aspect <= SCAN_TALL);
  const parallax = !scene.video && scene.parallax && shotIndex < 0 ? scene.parallax : null;

  return (
    <AbsoluteFill style={{...styles.scene, opacity: fade}}>
      <AbsoluteFill
        // footage and framed prints play at their true size: no bleed box, no Ken Burns zoom
        style={scene.video || framed || parallax ? undefined : styles.imageWrap}
      >
        {scene.video ? (
          <OffthreadVideo
            src={staticFile(scene.video)}
            muted={scene.videoMuted ?? true}
            style={{...styles.image, filter: look(scene.tone)}}
          />
        ) : scene.image && shotIndex >= 0 && (shots[shotIndex].image || shots[shotIndex].video) ? (
          <ShotMedia
            shot={shots[shotIndex]}
            from={segStart}
            frames={segEnd - segStart}
            transform={transform}
            progress={segProgress}
            reverse={(scene.index + shotIndex) % 2 === 1}
            filter={look(shots[shotIndex].tone ?? scene.tone)}
          />
        ) : parallax ? (
          <ParallaxStill parallax={parallax} progress={ownProgress} filter={look(scene.tone)} />
        ) : scene.image && scan ? (
          <ScanPrint
            src={staticFile(scene.image)}
            aspect={scene.aspect as number}
            progress={ownProgress}
            reverse={scene.index % 2 === 1}
            filter={look(scene.tone)}
          />
        ) : scene.image && framed ? (
          <FramedPrint
            src={staticFile(scene.image)}
            transform={transform}
            aspect={scene.aspect}
            filter={look(scene.tone)}
          />
        ) : scene.image ? (
          <Img
            src={staticFile(scene.image)}
            style={{
              ...styles.image,
              transform,
              filter: look(scene.tone),
            }}
          />
        ) : scene.chart ? (
          <ChartBackdrop frame={frame} />
        ) : scene.graphic === 'kinetic_map' ? (
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, #2b3f43 0%, #1a2a2d 60%, #0f1719 100%)'}} />
        ) : (
          <GeneratedArchiveBackdrop scene={scene} frame={frame} />
        )}
      </AbsoluteFill>

      {showArchiveOverlay ? (
        <>
          <AbsoluteFill style={styles.softGrade} />
          <AbsoluteFill style={styles.vignette} />
          <FilmDamage frame={frame} scene={scene} />
          {visualIsActive ? (
            <MomentAccent
              scene={scene}
              frame={visualFrame}
              durationInFrames={visualDurationInFrames}
            />
          ) : null}
          {visualIsActive && showDocumentHighlights && scene.sourceImage ? (
            <AuthenticSourceOverlay
              scene={scene}
              frame={visualFrame}
              durationInFrames={visualDurationInFrames}
            />
          ) : null}
          {showKineticMaps && mapSpec && visualFrame >= -lead ? (
            <DocumentaryMap
              scene={scene}
              spec={mapSpec}
              frame={visualFrame}
              durationInFrames={visualDurationInFrames}
              holdStart={cueFrame === 0 && lead > 0}
              holdEnd={holdMapToCut}
            />
          ) : visualIsActive && showKineticMaps && scene.graphic === 'kinetic_map' && scene.historicalMap ? (
            <HistoricalMap
              scene={scene}
              spec={scene.historicalMap}
              frame={visualFrame}
              durationInFrames={visualDurationInFrames}
            />
          ) : null}
          {visualIsActive && showKineticMaps && !mapSpec && scene.graphic === 'kinetic_map' && !scene.historicalMap && mapRoute(scene) ? (
            <KineticMap
              scene={scene}
              frame={visualFrame}
              durationInFrames={visualDurationInFrames}
            />
          ) : null}
          {scene.chart && frame >= 0 ? (
            <DataChart
              chart={scene.chart}
              frame={frame}
              durationInFrames={Math.round((scene.end - scene.start) * fps)}
              backdrop={Boolean(scene.image || scene.video)}
            />
          ) : null}
          {scene.index === 1 ? <IntroPrintReveal frame={frame} /> : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

const imageTransform = (scene: ArchiveScene, progress: number) => {
  const motion = scene.motion || (scene.index % 2 === 1 ? 'push' : 'pull');
  const isZoomIn = ['push', 'slow_push', 'scanner'].includes(motion);
  const startScale = isZoomIn ? 1.035 : 1.15;
  const endScale = isZoomIn ? (motion === 'slow_push' ? 1.105 : 1.15) : 1.035;
  const zoom = interpolate(progress, [0, 1], [startScale, endScale], {
    extrapolateLeft: 'clamp',
  });
  const x = motion === 'pan_left'
    ? interpolate(progress, [0, 1], [38, -38])
    : motion === 'pan_right'
      ? interpolate(progress, [0, 1], [-38, 38])
      : motion === 'drift'
        ? Math.sin(progress * Math.PI) * 22
        : 0;
  const y = motion === 'scanner' ? interpolate(progress, [0, 1], [-18, 18]) : 0;
  return `translate(${x}px, ${y}px) scale(${zoom})`;
};

// imageWrap box (1920x1080 frame plus bleed); focus is a % point inside it
const WRAP_W = 2104;
const WRAP_H = 1420;

const shotTransform = (shot: ArchiveShot, progress: number) => {
  const zoom = interpolate(progress, [0, 1], shot.zoom, {extrapolateLeft: 'clamp'});
  const dx = (shot.focus[0] / 100 - 0.5) * WRAP_W;
  const dy = (shot.focus[1] / 100 - 0.5) * WRAP_H;
  // centre the detail, but never pull an image edge into frame
  const maxX = Math.max(0, (zoom * WRAP_W) / 2 - 964);
  const maxY = Math.max(0, (zoom * WRAP_H) / 2 - 554);
  const x = Math.max(-maxX, Math.min(maxX, -zoom * dx));
  const y = Math.max(-maxY, Math.min(maxY, -zoom * dy));
  return `translate(${x}px, ${y}px) scale(${zoom})`;
};

// b-roll cutaway inside a long still: another photo or a footage clip, hard-cut on a phrase boundary
const ShotMedia = ({shot, from, frames, transform, filter, progress, reverse}: {
  shot: ArchiveShot;
  from: number;
  frames: number;
  transform: string;
  filter: string;
  progress: number;
  reverse: boolean;
}) => {
  if (shot.video) {
    return (
      <Sequence from={from} durationInFrames={Math.max(1, frames)} layout="none">
        <OffthreadVideo src={staticFile(shot.video)} muted style={{...styles.image, transform, filter}} />
      </Sequence>
    );
  }
  const src = staticFile(shot.image as string);
  if (shot.fit !== 'contain') {
    return <Img src={src} style={{...styles.image, transform, filter}} />;
  }
  if (shot.aspect && (shot.aspect >= SCAN_WIDE || shot.aspect <= SCAN_TALL)) {
    return <ScanPrint src={src} aspect={shot.aspect} progress={progress} filter={filter} reverse={reverse} />;
  }
  return <FramedPrint src={src} transform={transform} filter={filter} aspect={shot.aspect} />;
};

// a real photo shown whole: framed print over a soft, dark copy of itself
const FramedPrint = ({src, transform, filter, aspect}: {src: string; transform: string; filter: string; aspect?: number}) => {
  // fit the print inside 1640x860 at its own shape (small photos scale up too)
  const size = !aspect ? {height: 860, width: 'auto', maxWidth: 1640}
    : aspect >= 1640 / 860 ? {width: 1640, height: Math.round(1640 / aspect)}
      : {height: 860, width: Math.round(860 * aspect)};
  return (
  <AbsoluteFill style={{filter}}>
    <Img src={src} style={{...styles.image, filter: 'blur(28px) brightness(0.45) saturate(0.7)', transform: 'scale(1.15)'}} />
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform}}>
      <Img
        src={src}
        style={{...size, objectFit: 'contain', boxShadow: '0 24px 60px rgba(0,0,0,0.65)'}}
      />
    </AbsoluteFill>
  </AbsoluteFill>
  );
};

// framed prints only breathe: a slow 4% push, never a crop
const printTransform = (progress: number) => `scale(${interpolate(progress, [0, 1], [1.0, 1.04])})`;

// ---------- documentary data graphics ----------
// One type family with the maps (condensed grotesk), gold + cream over footage that is
// dimmed, desaturated and softly defocused behind the graphic, never a flat black card.
const GFX_FONT = 'Bahnschrift, "DIN Condensed", "Arial Narrow", Arial, sans-serif';
const GOLD = ACCENT;
const CREAM = '#f4efe4';
const clampX = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// footage treatment under a data graphic: defocus + desaturate + shade
const GfxBackdrop = ({amount, side = 'left'}: {amount: number; side?: 'left' | 'full'}) => {
  const filter = `blur(${4 * amount}px) grayscale(${0.55 * amount}) brightness(${1 - 0.28 * amount})`;
  return (
    <>
      <AbsoluteFill style={{backdropFilter: filter, WebkitBackdropFilter: filter}} />
      <AbsoluteFill
        style={{
          opacity: amount,
          background:
            side === 'left'
              ? 'linear-gradient(90deg, rgba(6,7,9,0.9) 0%, rgba(6,7,9,0.7) 38%, rgba(6,7,9,0.25) 72%, rgba(6,7,9,0.1) 100%)'
              : 'radial-gradient(ellipse at 40% 50%, rgba(6,7,9,0.62) 0%, rgba(6,7,9,0.9) 100%)',
        }}
      />
    </>
  );
};

// a line of text revealed by a mask wiping upward, then lifted out on exit
const MaskLine = ({
  frame,
  inAt,
  outAt,
  children,
  style,
}: {
  frame: number;
  inAt: number;
  outAt: number;
  children: ReactNode;
  style?: CSSProperties;
}) => {
  const enter = interpolate(frame, [inAt, inAt + 16], [0, 1], {...clampX, easing: Easing.out(Easing.cubic)});
  const exit = interpolate(frame, [outAt, outAt + 12], [0, 1], {...clampX, easing: Easing.in(Easing.cubic)});
  return (
    <div style={{overflow: 'hidden', paddingBottom: 4}}>
      <div style={{...style, transform: `translateY(${(1 - enter) * 105 - exit * 105}%)`}}>{children}</div>
    </div>
  );
};

const NUMBER = /\d[\d,]*(\.\d+)?/;

// counts the first number in a value up from zero, keeping any text around it
const countUp = (value: string, t: number) => {
  const match = value.match(NUMBER);
  if (!match || match.index === undefined) return value;
  const raw = match[0];
  const target = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(target) || raw.includes('.')) return value;
  const current = Math.round(target * t);
  const shown = raw.includes(',') || target >= 10000 ? current.toLocaleString('en-US') : String(current);
  return value.slice(0, match.index) + shown + value.slice(match.index + raw.length);
};

// mechanical odometer: each digit rolls on its own drum; left digits land first, the last one lands last
const Odometer = ({value, frame, start, duration}: {value: string; frame: number; start: number; duration: number}) => {
  const chars = value.split('');
  const digitSlots = chars.map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  const suffixIn = interpolate(frame, [start + duration * 0.5, start + duration * 0.85], [0, 1], clampX);
  return (
    <span style={{display: 'inline-flex', alignItems: 'flex-start'}}>
      {chars.map((c, i) => {
        if (/\d/.test(c)) {
          const order = digitSlots.indexOf(i);
          const share = digitSlots.length > 1 ? order / (digitSlots.length - 1) : 1;
          const land = start + duration * (0.45 + 0.55 * share);
          const ease = {...clampX, easing: Easing.out(Easing.cubic)};
          const cells = (2 + order) * 10 + Number(c);
          const t = interpolate(frame, [start, land], [0, 1], ease);
          const speed = cells * Math.abs(interpolate(frame + 1, [start, land], [0, 1], ease) - t);
          return (
            <span
              key={i}
              style={{
                position: 'relative',
                display: 'inline-block',
                height: '1em',
                width: '1ch',
                overflow: 'hidden',
                WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)',
                maskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  textAlign: 'center',
                  transform: `translateY(${-cells * t}em)`,
                  filter: `blur(${Math.min(5, speed * 4)}px)`,
                }}
              >
                {Array.from({length: cells + 1}, (_, k) => (
                  <span key={k} style={{display: 'block', height: '1em', lineHeight: '1em'}}>
                    {k % 10}
                  </span>
                ))}
              </span>
            </span>
          );
        }
        const isWord = /[A-Za-z]/.test(c);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              height: isWord || c === '+' ? undefined : '1em',
              lineHeight: '1em',
              alignSelf: isWord ? 'flex-end' : c === '+' ? 'center' : 'flex-start',
              marginBottom: isWord ? '0.12em' : 0,
              marginLeft: c === '+' ? '0.06em' : 0,
              fontSize: isWord ? '0.4em' : c === '+' ? '0.62em' : '1em',
              letterSpacing: isWord ? '0.1em' : 0,
              opacity: c === '+' || isWord ? suffixIn : 1,
              color: c === '+' ? GOLD : undefined,
            }}
          >
            {c === ' ' ? ' ' : c}
          </span>
        );
      })}
    </span>
  );
};

const StatReveal = ({
  stat,
  frame,
  durationInFrames,
}: {
  stat: NonNullable<ArchiveScene['stat']>;
  frame: number;
  durationInFrames: number;
}) => {
  const {fps} = useVideoConfig();
  const compare = stat.compare?.length ? stat.compare : null;
  const end = Math.min(durationInFrames - 2, Math.round(fps * (stat.hold ?? (compare ? 6 : 5))));
  if (frame > end) return null;
  const out = end - 14;
  const backdrop = interpolate(frame, [0, 12, out + 4, end], [0, 1, 1, 0], clampX);
  const rule = interpolate(frame, [4, 26], [0, 1], {...clampX, easing: Easing.out(Easing.cubic)});
  const ruleOut = interpolate(frame, [out, out + 12], [0, 1], {...clampX, easing: Easing.in(Easing.cubic)});
  const drift = interpolate(frame, [0, end], [0, -14], clampX);
  const kicker = (
    <MaskLine frame={frame} inAt={4} outAt={out} style={styles.gfxKicker}>
      {stat.prefix ?? 'BY THE NUMBERS'}
    </MaskLine>
  );

  if (compare) {
    const max = Math.max(...compare.map((row) => row.amount));
    const hi = compare[compare.length - 1];
    const ratio = hi.amount / Math.max(1, compare[0].amount);
    const ratioText = ratio >= 10 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1)}×`;
    const badgeText = stat.badge === false ? null : stat.badge ?? `${ratioText} MORE`;
    const barsDone = 10 + (compare.length - 1) * 14 + fps * 1.4;
    const callout = spring({frame: frame - barsDone, fps, config: {damping: 15, stiffness: 140, mass: 0.6}});
    const calloutOut = interpolate(frame, [out, out + 10], [1, 0], clampX);
    const TRACK = 1000;
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <GfxBackdrop amount={backdrop} side="full" />
        <div style={{position: 'absolute', left: 170, top: 260, width: 1580, transform: `translateX(${drift}px)`}}>
          {kicker}
          <div style={{marginTop: 12}}>
            <MaskLine frame={frame} inAt={8} outAt={out + 2} style={styles.gfxTitle}>
              {stat.label}
            </MaskLine>
          </div>
          <div style={{position: 'relative', marginTop: 54}}>
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <div
                key={g}
                style={{
                  position: 'absolute',
                  left: 380 + TRACK * g,
                  top: -12,
                  bottom: -12,
                  width: 1,
                  backgroundColor: 'rgba(244,239,228,0.13)',
                  opacity: rule * (1 - ruleOut),
                }}
              />
            ))}
            {compare.map((row, i) => {
              const s = 10 + i * 14;
              const grow = interpolate(frame, [s, s + fps * 1.4], [0, 1], {...clampX, easing: Easing.inOut(Easing.cubic)});
              const shrink = interpolate(frame, [out, out + 12], [1, 0], {...clampX, easing: Easing.in(Easing.cubic)});
              const width = Math.max(8, (row.amount / max) * TRACK) * grow * shrink;
              const highlight = i === compare.length - 1;
              return (
                <div key={row.label} style={{display: 'flex', alignItems: 'center', height: 108}}>
                  <div style={{width: 380, flexShrink: 0, whiteSpace: 'nowrap'}}>
                    <MaskLine frame={frame} inAt={s} outAt={out} style={{...styles.gfxRowLabel, color: highlight ? CREAM : 'rgba(244,239,228,0.66)'}}>
                      {row.label}
                    </MaskLine>
                  </div>
                  <div
                    style={{
                      height: highlight ? 30 : 22,
                      flexShrink: 0,
                      width,
                      background: highlight ? GOLD : 'rgba(244,239,228,0.42)',
                      boxShadow: 'none',
                    }}
                  />
                  <div
                    style={{
                      ...styles.gfxRowValue,
                      color: highlight ? GOLD : CREAM,
                      opacity: interpolate(grow, [0, 0.15], [0, 1]) * shrink,
                      marginLeft: 22,
                    }}
                  >
                    {countUp(row.value, grow)}
                  </div>
                </div>
              );
            })}
          </div>
          {badgeText ? (
            <div
              style={{
                ...styles.gfxRatio,
                display: 'inline-block',
                marginLeft: 380,
                marginTop: 18,
                opacity: Math.min(1, callout) * calloutOut,
                transform: `translateY(${interpolate(callout, [0, 1], [14, 0])}px)`,
              }}
            >
              {badgeText}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  const rollStart = 6;
  const rollDur = Math.round(Math.min(fps * 1.5, end * 0.4));
  const numberIn = interpolate(frame, [2, 12], [0, 1], clampX);
  const numberOut = interpolate(frame, [out, out + 12], [0, 1], {...clampX, easing: Easing.in(Easing.cubic)});
  const fill = interpolate(frame, [rollStart, rollStart + rollDur], [0, 1], {...clampX, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <GfxBackdrop amount={backdrop} />
      <div style={{position: 'absolute', left: 170, top: 250, transform: `translateX(${drift}px)`}}>
        {kicker}
        <div style={{...styles.gfxNumber, opacity: numberIn * (1 - numberOut), transform: `translateY(${-numberOut * 30}px)`}}>
          <Odometer value={stat.value} frame={frame} start={rollStart} duration={rollDur} />
        </div>
        <div style={{height: 3, width: 620, backgroundColor: `rgba(244,239,228,${0.18 * (1 - ruleOut)})`, marginTop: 10}}>
          <div style={{height: '100%', width: '100%', backgroundColor: GOLD, transform: `scaleX(${fill * (1 - ruleOut)})`, transformOrigin: 'left'}} />
        </div>
        <div style={{marginTop: 22, maxWidth: 1500}}>
          <MaskLine frame={frame} inAt={rollStart + 10} outAt={out + 2} style={styles.gfxLabel}>
            {stat.label}
          </MaskLine>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const imageFilter = (scene: ArchiveScene, frame: number, tone?: ArchiveScene['tone']) => {
  const flicker = scene.video ? Math.sin(frame * 0.39 + scene.index) * 0.014 : 0;
  return lookFilter(tone, flicker);
};

const GeneratedArchiveBackdrop = ({scene, frame}: {scene: ArchiveScene; frame: number}) => {
  const drift = Math.sin(frame * 0.018 + scene.index) * 18;
  return (
    <AbsoluteFill
      style={{
        ...styles.generatedBackdrop,
        transform: `scale(1.08) translateX(${drift}px)`,
      }}
    >
      <div style={styles.backdropGlow} />
      <div style={{...styles.backdropPaper, transform: `rotate(${scene.index % 2 ? -4 : 3}deg)`}}>
        <div style={styles.backdropMasthead}>THE HISTORICAL RECORD</div>
        {Array.from({length: 13}).map((_, index) => (
          <div
            key={index}
            style={{
              ...styles.backdropLine,
              width: `${78 - ((index * 11 + scene.index * 7) % 28)}%`,
              opacity: 0.22 + (index % 3) * 0.08,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const AuthenticSourceOverlay = ({
  scene,
  frame,
  durationInFrames,
}: {
  scene: ArchiveScene;
  frame: number;
  durationInFrames: number;
}) => {
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 20, stiffness: 92, mass: 0.86}});
  const exit = interpolate(
    frame,
    [Math.max(1, durationInFrames - 18), durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const provider = scene.sourceProvider || 'ARCHIVAL COLLECTION';
  const citation = [scene.sourceCreator, scene.sourceDate, provider].filter(Boolean).join(' • ');
  return (
    <AbsoluteFill style={{...styles.graphicLayer, opacity: exit}}>
      <div
        style={{
          ...styles.authenticSourceCard,
          opacity: interpolate(enter, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(enter, [0, 1], [95, 0])}px) scale(${interpolate(
            enter,
            [0, 1],
            [0.95, 1],
          )})`,
        }}
      >
        <div style={styles.authenticSourceHeader}>
          <span>ARCHIVE SOURCE</span>
          <span>{scene.sourceTitle || provider}</span>
        </div>
        <div style={styles.authenticSourceImageWrap}>
          <Img src={staticFile(scene.sourceImage as string)} style={styles.authenticSourceImage} />
          <div style={styles.sourceEdgeShade} />
        </div>
        <div style={styles.authenticCitation}>
          <span>{citation || 'Source metadata preserved with project'}</span>
          <span>{scene.sourceLicense || scene.sourceRights || 'RIGHTS: VERIFY SOURCE RECORD'}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const KineticMap = ({
  scene,
  frame,
  durationInFrames,
}: {
  scene: ArchiveScene;
  frame: number;
  durationInFrames: number;
}) => {
  const {fps} = useVideoConfig();
  const routeData = mapRoute(scene);
  if (!routeData) return null;
  const enter = spring({frame, fps, config: {damping: 18, stiffness: 88, mass: 0.9}});
  const routeEndFrame = mapAnimationFrames(routeData, durationInFrames);
  const route = interpolate(frame, [10, routeEndFrame], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const arrival = interpolate(frame, [Math.max(10, routeEndFrame - 8), routeEndFrame + 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rippleAge = Math.max(0, frame - routeEndFrame);
  const ripplePhase = (rippleAge % 38) / 38;
  const rippleOpacity = frame >= routeEndFrame ? (1 - ripplePhase) * 0.46 : 0;
  const destinationPulse = 1 + Math.sin(rippleAge * 0.2) * 0.09 * arrival;
  const exit = interpolate(
    frame,
    [Math.max(1, durationInFrames - 18), durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const pulse = 1 + Math.sin(frame * 0.28) * 0.12;
  const suppliedFrom = (scene.mapFrom || '').trim().toUpperCase();
  const suppliedTo = (scene.mapTo || '').trim().toUpperCase();
  const from = INVALID_MAP_LABELS.has(suppliedFrom)
    ? routeData.displayPoints[0].label
    : suppliedFrom;
  const to = INVALID_MAP_LABELS.has(suppliedTo)
    ? routeData.displayPoints[1].label
    : suppliedTo;
  const [viewX, viewY, viewWidth, viewHeight] = routeData.viewBounds;
  const markerScale = viewWidth / 1610;
  const screenPosition = ([x, y]: [number, number]) => ({
    left: 48 + ((x - viewX) / viewWidth) * 1610,
    top: 70 + ((y - viewY) / viewHeight) * 770,
  });
  const fromPosition = screenPosition(routeData.from);
  const toPosition = screenPosition(routeData.to);
  const destinationIsRight = toPosition.left >= fromPosition.left;
  const routePath = `M${routeData.from[0]} ${routeData.from[1]} Q${routeData.control[0]} ${routeData.control[1]} ${routeData.to[0]} ${routeData.to[1]}`;
  const extentHull = convexHull(routeData.displayPoints.map((item) => item.point));
  const extentPath = extentHull.length >= 3
    ? `${extentHull.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`
    : '';
  return (
    <AbsoluteFill style={{...styles.graphicLayer, opacity: exit}}>
      <div
        style={{
          ...styles.mapPanel,
          opacity: interpolate(enter, [0, 1], [0, 0.94]),
          transform: `translateX(${interpolate(enter, [0, 1], [-140, 0])}px) scale(${interpolate(
            enter,
            [0, 1],
            [0.96, 1],
          )})`,
        }}
      >
        <div style={styles.mapHeader}>
          <span>{routeData.isExtent ? 'GEOGRAPHIC SPAN' : 'GEOGRAPHIC ROUTE'}</span>
          <span>{scene.mapLabel || scene.dateHint || `${from} — ${to}`}</span>
        </div>
        <svg viewBox={routeData.viewBox} style={styles.mapSvg}>
          <defs>
            <pattern id={`grid-${scene.index}`} width="90" height="90" patternUnits="userSpaceOnUse">
              <path d="M 90 0 L 0 0 0 90" fill="none" stroke="rgba(58,45,27,0.16)" strokeWidth="2" />
            </pattern>
            <filter id={`map-shadow-${scene.index}`}>
              <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor="#000000" floodOpacity="0.28" />
            </filter>
            <mask
              id={`route-reveal-${scene.index}`}
              x={viewX}
              y={viewY}
              width={viewWidth}
              height={viewHeight}
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
            >
              <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} fill="black" />
              <path
                d={routePath}
                fill="none"
                stroke="white"
                strokeWidth="24"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${route} 1`}
                vectorEffect="non-scaling-stroke"
              />
            </mask>
          </defs>
          <rect
            x={viewX}
            y={viewY}
            width={viewWidth}
            height={viewHeight}
            fill="rgba(210,194,153,0.44)"
          />
          {WORLD_FEATURES.features.map((country, index) => (
            <path
              key={index}
              d={WORLD_PATH(country) || ''}
              fill="rgba(92,105,73,0.3)"
              stroke="rgba(49,55,39,0.5)"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {routeData.isExtent ? (
            <>
              {extentPath ? (
                <path
                  d={extentPath}
                  fill="rgba(162,54,43,0.19)"
                  stroke="#a2362b"
                  strokeWidth="5"
                  strokeDasharray="14 9"
                  opacity={route}
                  filter={`url(#map-shadow-${scene.index})`}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <line
                  x1={routeData.from[0]}
                  y1={routeData.from[1]}
                  x2={routeData.to[0]}
                  y2={routeData.to[1]}
                  stroke="#a2362b"
                  strokeWidth="8"
                  strokeDasharray="14 9"
                  opacity={route}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {routeData.displayPoints.map(({label, point}) => (
                <circle
                  key={label}
                  cx={point[0]}
                  cy={point[1]}
                  r={7 * pulse * markerScale}
                  fill="#a2362b"
                  stroke="#f0dca5"
                  strokeWidth="3"
                  opacity={route}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </>
          ) : (
            <>
              <g mask={`url(#route-reveal-${scene.index})`}>
                <path
                  d={routePath}
                  fill="none"
                  stroke="rgba(46,30,16,0.46)"
                  strokeWidth="17"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="0.09 0.07"
                  strokeDashoffset={-(frame * 0.0045)}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={routePath}
                  fill="none"
                  stroke="#d6a83b"
                  strokeWidth="9"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="0.09 0.07"
                  strokeDashoffset={-(frame * 0.0045)}
                  filter={`url(#map-shadow-${scene.index})`}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              <circle
                cx={routeData.from[0]}
                cy={routeData.from[1]}
                r={10 * pulse * markerScale}
                fill="#aa372d"
                stroke="#f0dca5"
                strokeWidth="4"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={routeData.to[0]}
                cy={routeData.to[1]}
                r={(13 + ripplePhase * 30) * markerScale}
                fill="none"
                stroke="#e6bd58"
                strokeWidth="3"
                opacity={rippleOpacity}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={routeData.to[0]}
                cy={routeData.to[1]}
                r={10 * destinationPulse * markerScale}
                fill="#d6a83b"
                stroke="#5d3d19"
                strokeWidth="4"
                opacity={arrival}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        {routeData.isExtent ? routeData.displayPoints.slice(0, 6).map(({label, point}) => {
          const position = screenPosition(point);
          const labelAbove = ['MONGOLIA', 'MANCHURIA', 'SOUTH CHINA SEA'].includes(label);
          return (
            <div
              key={label}
              style={{
                ...styles.mapPlace,
                minWidth: 0,
                padding: '6px 10px',
                fontSize: 20,
                letterSpacing: 1.5,
                whiteSpace: 'nowrap',
                left: Math.max(180, Math.min(1530, position.left)),
                top: Math.max(100, Math.min(715, position.top + (labelAbove ? -58 : 22))),
                opacity: route,
                transform: 'translateX(-50%)',
              }}
            >
              {label}
            </div>
          );
        }) : (
          <>
            <div
              style={{
                ...styles.mapPlace,
                left: Math.max(
                  55,
                  Math.min(1380, fromPosition.left + (destinationIsRight ? -300 : 24)),
                ),
                top: Math.max(100, Math.min(715, fromPosition.top - 72)),
              }}
            >
              {from}
            </div>
            <div
              style={{
                ...styles.mapPlace,
                left: Math.max(
                  55,
                  Math.min(1380, toPosition.left + (destinationIsRight ? 24 : -300)),
                ),
                top: Math.max(100, Math.min(715, toPosition.top + 24)),
                opacity: arrival,
              }}
            >
              {to}
            </div>
          </>
        )}
        <div style={{...styles.routeTag, opacity: route, transform: `translateY(${(1 - route) * 18}px)`}}>
          {routeData.isExtent ? 'NARRATIVE REFERENCE POINTS' : (scene.mapLabel || `${from} → ${to}`)}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const FilmDamage = ({frame, scene}: {frame: number; scene: ArchiveScene}) => {
  const scratch = 14 + ((scene.index * 73 + frame * 3) % 1600);
  const dustA = (scene.index * 97 + frame * 5) % 1920;
  const dustB = (scene.index * 41 + frame * 7) % 1080;
  return (
    <AbsoluteFill style={styles.damage}>
      {scene.video ? <div style={{...styles.scratch, left: scratch, opacity: frame % 9 < 5 ? 0.22 : 0.04}} /> : null}
      {scene.video ? <div style={{...styles.dust, left: dustA, top: dustB, opacity: frame % 17 < 3 ? 0.38 : 0}} /> : null}
      <div style={{...styles.filmGate, opacity: 0.18 + Math.sin(frame * 0.11) * 0.04}} />
    </AbsoluteFill>
  );
};

const IntroPrintReveal = ({frame}: {frame: number}) => {
  const black = interpolate(frame, [0, 10, 30], [1, 0.72, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const flash = interpolate(frame, [6, 11, 21, 32], [0, 0.72, 0.2, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const paper = interpolate(frame, [12, 36, 64], [0, 0.32, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={styles.introLayer}>
      <AbsoluteFill style={{backgroundColor: '#040302', opacity: black}} />
      <AbsoluteFill style={{backgroundColor: '#fff0c9', opacity: flash, mixBlendMode: 'screen'}} />
      <AbsoluteFill style={{...styles.paperWash, opacity: paper}} />
    </AbsoluteFill>
  );
};

const MomentAccent = ({
  scene,
  frame,
  durationInFrames,
}: {
  scene: ArchiveScene;
  frame: number;
  durationInFrames: number;
}) => {
  const {fps} = useVideoConfig();
  const accent = scene.accent ?? 'none';
  if (accent === 'none' || accent === 'intro_print' || durationInFrames < 18) {
    return null;
  }
  const life = interpolate(frame, [0, 12, Math.min(durationInFrames, 48)], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (accent === 'stat' && scene.stat) {
    return <StatReveal stat={scene.stat} frame={frame} durationInFrames={durationInFrames} />;
  }

  if (accent === 'scan') {
    const top = interpolate(frame, [0, Math.min(durationInFrames, 54)], [140, 900], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return (
      <AbsoluteFill style={styles.accentLayer}>
        <div style={{...styles.scanAccent, top, opacity: life * 0.38}} />
      </AbsoluteFill>
    );
  }

  if (accent === 'focus') {
    const scale = interpolate(frame, [0, 34], [0.82, 1.22], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return (
      <AbsoluteFill style={styles.accentLayer}>
        <div style={{...styles.focusRing, opacity: life * 0.25, transform: `translate(-50%, -50%) scale(${scale})`}} />
      </AbsoluteFill>
    );
  }

  if (accent === 'light_leak') {
    const left = interpolate(frame, [0, Math.min(durationInFrames, 62)], [-360, 1980], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return (
      <AbsoluteFill style={styles.accentLayer}>
        <div style={{...styles.lightLeak, left, opacity: life * 0.28}} />
      </AbsoluteFill>
    );
  }

  if (accent === 'shutter') {
    const opacity = interpolate(frame, [0, 3, 12], [0, 0.34, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return <AbsoluteFill style={{...styles.shutterFlash, opacity}} />;
  }

  if (accent === 'date_stamp' || accent === 'evidence_slip') {
    // documentary lower third: gold bar grows, text wipes in behind a mask, soft shade under it
    const text = (accent === 'date_stamp' && scene.dateHint ? scene.dateHint : scene.visualText) || '';
    const isDate = accent === 'date_stamp';
    const hold = Math.min(durationInFrames - 8, Math.round(fps * 3.4));
    const bar = interpolate(frame, [0, 10], [0, 1], {...clampX, easing: Easing.out(Easing.cubic)});
    const barOut = interpolate(frame, [hold + 6, hold + 16], [1, 0], {...clampX, easing: Easing.in(Easing.cubic)});
    const wipe = interpolate(frame, [4, 22], [0, 100], {...clampX, easing: Easing.out(Easing.cubic)});
    const drift = interpolate(frame, [0, hold + 16], [0, 10], clampX);
    return (
      <AbsoluteFill style={styles.accentLayer}>
        <AbsoluteFill
          style={{
            opacity: Math.min(bar, barOut) * 0.85,
            background: 'linear-gradient(0deg, rgba(6,7,9,0.72) 0%, rgba(6,7,9,0.25) 30%, rgba(6,7,9,0) 48%)',
          }}
        />
        <div style={{...styles.lowerThird, transform: `translateX(${drift}px)`}}>
          <div style={{...styles.lowerThirdBar, height: isDate ? 76 : 58, transform: `scaleY(${bar * barOut})`}} />
          <div style={{clipPath: `inset(-10px ${100 - wipe}% -10px 0)`, opacity: barOut}}>
            <div style={isDate ? styles.lowerThirdDate : styles.lowerThirdText}>{text}</div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};

export const Captions = ({captions}: {captions: ArchiveCaption[]}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const second = frame / fps;
  const caption = captions.find((item) => second >= item.start && second < item.end);
  if (!caption) {
    return null;
  }
  const local = frame - Math.floor(caption.start * fps);
  const duration = Math.max(1, Math.round((caption.end - caption.start) * fps));
  const opacity = Math.min(
    interpolate(local, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
    interpolate(local, [Math.max(0, duration - 10), duration], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const settle = spring({frame: local, fps, config: {damping: 18, stiffness: 95, mass: 0.7}});
  const y = interpolate(settle, [0, 1], [10, 0]);

  return (
    <AbsoluteFill style={styles.captionLayer}>
      <div style={{...styles.subtitle, opacity, transform: `translateY(${y}px)`}}>{caption.text}</div>
    </AbsoluteFill>
  );
};

const styles: Record<string, CSSProperties> = {
  stage: {
    backgroundColor: '#080706',
    color: '#f2eadc',
    fontFamily: 'Georgia, Times New Roman, serif',
  },
  empty: {
    backgroundColor: '#0c0a08',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#efe7d8',
  },
  emptyTitle: {
    fontSize: 78,
    letterSpacing: 0,
  },
  emptyText: {
    marginTop: 24,
    fontSize: 32,
    color: '#b7aa94',
  },
  scene: {
    backgroundColor: '#080706',
    overflow: 'hidden',
  },
  imageWrap: {
    top: -160,
    left: -92,
    width: 'calc(100% + 184px)',
    height: 'calc(100% + 340px)',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transformOrigin: 'center center',
  },
  generatedBackdrop: {
    background:
      'radial-gradient(circle at 72% 30%, rgba(177,135,72,0.26), transparent 34%), linear-gradient(135deg, #20170f, #6f5734 48%, #18110b)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdropGlow: {
    position: 'absolute',
    inset: 0,
    background:
      'repeating-linear-gradient(8deg, rgba(244,226,184,0.025) 0 2px, transparent 2px 12px)',
  },
  backdropPaper: {
    width: 910,
    minHeight: 730,
    padding: '70px 76px',
    backgroundColor: '#d4c39c',
    color: '#352917',
    boxShadow: '0 50px 110px rgba(0,0,0,0.62)',
    opacity: 0.7,
  },
  backdropMasthead: {
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: 3,
    borderBottom: '5px double rgba(48,37,24,0.64)',
    paddingBottom: 20,
    marginBottom: 34,
  },
  backdropLine: {
    height: 13,
    marginBottom: 22,
    borderRadius: 2,
    backgroundColor: '#392c1c',
  },
  softGrade: {
    background:
      'linear-gradient(90deg, rgba(23,13,5,0.18), rgba(7,7,8,0.03) 45%, rgba(8,7,6,0.22)), linear-gradient(180deg, rgba(248,212,140,0.07), rgba(0,0,0,0.07))',
    mixBlendMode: 'multiply',
  },
  vignette: {
    background:
      'radial-gradient(circle at 50% 48%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 54%, rgba(0,0,0,0.36) 100%)',
  },
  damage: {
    pointerEvents: 'none',
  },
  grain: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'radial-gradient(circle, rgba(255,255,255,0.38) 0 1px, transparent 1px), radial-gradient(circle, rgba(0,0,0,0.25) 0 1px, transparent 1px)',
    backgroundSize: '5px 5px, 7px 7px',
    mixBlendMode: 'overlay',
  },
  scratch: {
    position: 'absolute',
    top: -80,
    width: 2,
    height: 1240,
    backgroundColor: 'rgba(255,246,220,0.75)',
    filter: 'blur(1px)',
  },
  dust: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,246,220,0.55)',
    filter: 'blur(2px)',
  },
  filmGate: {
    position: 'absolute',
    inset: 34,
    border: '2px solid rgba(255,237,197,0.2)',
    boxShadow: 'inset 0 0 90px rgba(0,0,0,0.75)',
  },
  introLayer: {
    pointerEvents: 'none',
  },
  paperWash: {
    background:
      'radial-gradient(circle at 50% 50%, rgba(255,246,218,0.75), rgba(196,143,73,0.16) 48%, rgba(0,0,0,0) 70%)',
    mixBlendMode: 'screen',
  },
  accentLayer: {
    pointerEvents: 'none',
  },
  graphicLayer: {
    pointerEvents: 'none',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authenticSourceCard: {
    position: 'absolute',
    left: 175,
    top: 76,
    width: 1570,
    height: 875,
    padding: '30px 34px 26px',
    color: '#2b2115',
    backgroundColor: '#d8c9a5',
    border: '1px solid rgba(55,39,20,0.62)',
    boxShadow: '0 52px 130px rgba(0,0,0,0.72), inset 0 0 80px rgba(84,54,23,0.14)',
  },
  authenticSourceHeader: {
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 30,
    padding: '0 8px 17px',
    color: '#4b351d',
    borderBottom: '3px solid rgba(53,38,20,0.54)',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 19,
    fontWeight: 800,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  authenticSourceImageWrap: {
    position: 'relative',
    height: 720,
    marginTop: 18,
    overflow: 'hidden',
    backgroundColor: '#17130e',
    boxShadow: 'inset 0 0 40px rgba(0,0,0,0.72)',
  },
  authenticSourceImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    filter: 'sepia(0.08) contrast(1.04)',
  },
  sourceEdgeShade: {
    position: 'absolute',
    inset: 0,
    boxShadow: 'inset 0 0 75px rgba(0,0,0,0.38)',
  },
  authenticCitation: {
    height: 58,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 30,
    padding: '8px 6px 0',
    color: '#4c3922',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 16,
    lineHeight: 1.2,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  mapPanel: {
    position: 'absolute',
    left: 105,
    top: 92,
    width: 1710,
    height: 825,
    overflow: 'hidden',
    color: '#302416',
    background:
      'radial-gradient(circle at 44% 34%, rgba(222,208,166,0.95), rgba(184,161,111,0.95) 68%, rgba(122,94,55,0.96))',
    border: '2px solid rgba(44,32,18,0.7)',
    boxShadow: '0 48px 120px rgba(0,0,0,0.68), inset 0 0 110px rgba(69,41,19,0.28)',
    transformOrigin: 'center center',
  },
  mapHeader: {
    position: 'absolute',
    zIndex: 3,
    left: 48,
    right: 48,
    top: 34,
    display: 'flex',
    justifyContent: 'space-between',
    paddingBottom: 15,
    color: '#3d2b17',
    borderBottom: '3px solid rgba(53,38,21,0.46)',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 3,
  },
  mapSvg: {
    position: 'absolute',
    left: 48,
    top: 70,
    width: 1610,
    height: 770,
  },
  mapPlace: {
    position: 'absolute',
    zIndex: 4,
    minWidth: 210,
    padding: '8px 14px',
    color: '#f2e5c1',
    backgroundColor: 'rgba(49,35,20,0.9)',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: 2,
    textAlign: 'center',
    boxShadow: '0 10px 30px rgba(0,0,0,0.24)',
  },
  routeTag: {
    position: 'absolute',
    zIndex: 4,
    left: 610,
    bottom: 62,
    width: 500,
    padding: '12px 18px',
    color: '#392715',
    backgroundColor: 'rgba(232,211,159,0.82)',
    borderTop: '3px solid #aa372d',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 2,
    textAlign: 'center',
  },
  scanAccent: {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: 5,
    background: 'linear-gradient(90deg, rgba(255,236,185,0), rgba(255,236,185,0.72), rgba(255,236,185,0))',
    boxShadow: '0 0 30px rgba(255,236,185,0.38)',
  },
  focusRing: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 520,
    height: 520,
    borderRadius: 520,
    border: '3px solid rgba(255,232,184,0.75)',
    boxShadow: '0 0 50px rgba(255,232,184,0.18), inset 0 0 46px rgba(255,232,184,0.14)',
  },
  lightLeak: {
    position: 'absolute',
    top: -120,
    width: 330,
    height: 1320,
    background:
      'linear-gradient(90deg, rgba(255,175,76,0), rgba(255,202,104,0.62), rgba(255,90,42,0.15), rgba(255,175,76,0))',
    filter: 'blur(34px)',
    mixBlendMode: 'screen',
  },
  shutterFlash: {
    backgroundColor: '#fff2cf',
    mixBlendMode: 'screen',
    pointerEvents: 'none',
  },
  evidenceSlip: {
    position: 'absolute',
    left: 86,
    bottom: 168,
    maxWidth: 760,
    padding: '13px 22px 14px 18px',
    backgroundColor: 'rgba(231,210,164,0.82)',
    color: '#1b120a',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 30,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    whiteSpace: 'normal',
    overflow: 'hidden',
    lineHeight: 1.12,
    boxShadow: '0 18px 46px rgba(0,0,0,0.38)',
    border: '1px solid rgba(90,58,28,0.32)',
  },
  dateSlip: {
    fontSize: 40,
    letterSpacing: 4,
    padding: '12px 26px 12px 20px',
  },
  gfxKicker: {
    fontFamily: GFX_FONT,
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: 7,
    color: GOLD,
    textTransform: 'uppercase',
  },
  gfxNumber: {
    fontFamily: GFX_FONT,
    fontStretch: '75%',
    fontSize: 250,
    fontWeight: 700,
    lineHeight: 1,
    marginTop: 20,
    color: CREAM,
    fontVariantNumeric: 'tabular-nums',
    textShadow: '0 8px 40px rgba(0,0,0,0.55)',
  },
  gfxLabel: {
    fontFamily: GFX_FONT,
    fontSize: 38,
    fontWeight: 400,
    letterSpacing: 3,
    lineHeight: 1.2,
    color: CREAM,
    textTransform: 'uppercase',
  },
  gfxTitle: {
    fontFamily: GFX_FONT,
    fontSize: 52,
    fontWeight: 700,
    letterSpacing: 2,
    lineHeight: 1.1,
    color: CREAM,
    textTransform: 'uppercase',
  },
  gfxRowLabel: {
    fontFamily: GFX_FONT,
    fontSize: 34,
    fontWeight: 600,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  gfxRowValue: {
    fontFamily: GFX_FONT,
    fontStretch: '75%',
    fontSize: 72,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  gfxRatio: {
    fontFamily: GFX_FONT,
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: 3,
    color: ON_ACCENT,
    backgroundColor: GOLD,
    padding: '6px 14px 5px',
    whiteSpace: 'nowrap',
  },
  lowerThird: {
    position: 'absolute',
    left: 120,
    bottom: 200,
    display: 'flex',
    alignItems: 'center',
    gap: 22,
    maxWidth: 1300,
  },
  lowerThirdBar: {
    width: 5,
    flexShrink: 0,
    backgroundColor: ACCENT,
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    transformOrigin: 'center bottom',
  },
  lowerThirdText: {
    fontFamily: GFX_FONT,
    fontSize: 42,
    fontWeight: 600,
    letterSpacing: 3,
    lineHeight: 1.15,
    color: '#f4efe4',
    textTransform: 'uppercase',
    textShadow: '0 3px 18px rgba(0,0,0,0.7)',
  },
  lowerThirdDate: {
    fontFamily: GFX_FONT,
    fontSize: 66,
    fontWeight: 700,
    letterSpacing: 8,
    lineHeight: 1,
    color: '#f4efe4',
    textTransform: 'uppercase',
    textShadow: '0 3px 18px rgba(0,0,0,0.7)',
  },
  slipRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
    backgroundColor: '#8f2a1e',
    transformOrigin: 'left center',
  },
  slipCursor: {
    display: 'inline-block',
    width: 14,
    height: '0.85em',
    marginRight: -14,
    verticalAlign: '-0.08em',
    backgroundColor: '#1b120a',
  },
  evidencePin: {
    display: 'inline-block',
    width: 10,
    height: 10,
    marginRight: 14,
    backgroundColor: '#8f2a1e',
  },
  captionLayer: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 72,
    pointerEvents: 'none',
  },
  subtitle: {
    maxWidth: 1300,
    padding: '6px 18px 8px',
    color: '#f4efe4',
    fontFamily: 'Bahnschrift, "DIN Condensed", "Arial Narrow", Arial, sans-serif',
    fontWeight: 600,
    fontSize: 44,
    lineHeight: 1.18,
    letterSpacing: 0.3,
    textAlign: 'center',
    textShadow: '0 2px 6px rgba(0,0,0,0.6)',
    backgroundColor: 'rgba(8,8,10,0.62)',
    borderRadius: 4,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  },
};
