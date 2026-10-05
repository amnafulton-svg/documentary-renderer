export type ArchiveMode =
  | 'photo'
  | 'dossier'
  | 'map'
  | 'timeline'
  | 'memory'
  | 'number';

export type MapCoordinate = [longitude: number, latitude: number];

export type HistoricalMapPlace = {
  label: string;
  coordinates: MapCoordinate;
  importance?: 'primary' | 'secondary';
  labelPosition?: 'left' | 'right' | 'above' | 'below';
  detail?: string;
  /** fraction of the scene (0-1) when the pin appears, from word timestamps */
  appearAt?: number;
  /** 'dot' draws an unlabelled glowing point, for dense clusters */
  marker?: 'pin' | 'dot';
};

export type HistoricalTerritory = {
  id: string;
  name: string;
  color: string;
  countries?: string[];
  polygons?: MapCoordinate[][];
  previousCountries?: string[];
  previousPolygons?: MapCoordinate[][];
  labelAt?: MapCoordinate;
  appearAt?: number;
};

export type HistoricalRoute = {
  id: string;
  label?: string;
  points: MapCoordinate[];
  color?: string;
  dashed?: boolean;
  startAt?: number;
  endAt?: number;
  vehicle?: 'ship' | 'train' | 'plane' | 'submarine';
};

export type MapBasemap = {
  src: string;
  bbox: [west: number, south: number, east: number, north: number];
};

export type MapRegionLabel = {
  label: string;
  coordinates: MapCoordinate;
  size?: number;
  italic?: boolean;
};

/** a camera pose over real 3D terrain: metres above sea level, compass heading, pitch below the horizon (deg) */
export type FlyoverCamera = {lng: number; lat: number; alt: number; heading: number; pitch: number};

export type HistoricalMapSpec = {
  mode: 'territory' | 'transition' | 'campaign' | 'journey';
  style?: 'dark' | 'documentary';
  basemaps?: MapBasemap[];
  regions?: MapRegionLabel[];
  tilt?: {from?: number; to?: number};
  title: string;
  subtitle?: string;
  year?: string;
  accuracy?: 'verified' | 'approximate';
  referenceQuery?: string;
  camera?: {
    center?: MapCoordinate;
    zoom?: number;
    fromCenter?: MapCoordinate;
    fromZoom?: number;
  };
  places?: HistoricalMapPlace[];
  territories?: HistoricalTerritory[];
  routes?: HistoricalRoute[];
  portraitImage?: string;
  portraitLabel?: string;
  /** fly over live 3D satellite terrain (FlyoverMap.tsx, MapTiler) instead of the flat NASA plane */
  flyover?: {from: FlyoverCamera; to: FlyoverCamera; exaggeration?: number};
};

export type ArchivePersonEntry = {name: string; photo: string; at: number};
export type ArchivePerson = {
  /** one person, or two linked by an arrow (the second lands at its own `at`) */
  people: ArchivePersonEntry[];
  /** up to 3 lines beside a single person (1 under the first print for two); `highlight` turns red, finishing on `at` */
  facts?: Array<{text: string; highlight?: string; at: number}>;
  source?: string;
  /** two people: label typed over the arrow, e.g. "biographer of" */
  link?: string;
};

export type ArchiveScene = {
  index: number;
  text: string;
  prompt: string;
  image: string;
  video?: string;
  videoMuted?: boolean;
  start: number;
  end: number;
  visualCueStart?: number;
  mode: ArchiveMode;
  label: string;
  visualText: string;
  dateHint: string;
  motion: string;
  accent?: string;
  sfx?: string;
  graphic?: 'none' | 'document_highlight' | 'kinetic_map';
  highlightText?: string;
  mapFrom?: string;
  mapTo?: string;
  mapLabel?: string;
  historicalMap?: HistoricalMapSpec;
  /** extra framings of the same still, hard-cut in at `at` (absolute seconds); focus is in frame % */
  shots?: ArchiveShot[];
  // 2.5D hero still: foreground cut-out + painted-out background (look.py parallax)
  parallax?: {bg: string; fg: string; origin: [number, number]};
  // real photos render as a framed print over a soft copy of themselves instead of filling the frame
  fit?: 'cover' | 'contain';
  aspect?: number;
  // per-picture tone correction towards the house look: [brightness, contrast, saturate] (look.py)
  tone?: [number, number, number];
  /** editor's transition into this scene: a real film burn screened over the cut (FilmBurn.tsx); n = clip 1/4/5/6/11/12/13 */
  transition?: {kind: 'burn'; n?: number};
  /** chapter title card shown over the opening of this scene */
  chapter?: {number: string; title: string};
  /** real-data motion graphic (line / columns / bars); times are seconds from the scene start */
  chart?: ArchiveChart;
  /** person card on graph paper (PersonCard.tsx); times are seconds from the scene start */
  person?: ArchivePerson;
  /** full-screen statistic reveal (accent 'stat') */
  stat?: {
    value: string;
    label: string;
    prefix?: string;
    compare?: Array<{label: string; value: string; amount: number}>;
    // compare callout under the bars: default "N× MORE"; a string replaces it, false hides it (shares, rankings)
    badge?: string | false;
    // seconds on screen (default 5, or 6 for a compare); capped by the scene length
    hold?: number;
  };
  sourceImage?: string;
  sourceProvider?: string;
  sourceTitle?: string;
  sourceDate?: string;
  sourceCreator?: string;
  sourceRights?: string;
  sourceLicense?: string;
  sourceUrl?: string;
  sourceAttribution?: string;
};

export type ArchiveShot = {
  at: number;
  focus: [x: number, y: number];
  zoom: [from: number, to: number];
  /** b-roll cutaway: a different photo or footage file shown for this shot instead of the scene still */
  image?: string;
  video?: string;
  /** 'contain' = small/portrait photo framed over a blurred copy of itself */
  fit?: 'cover' | 'contain';
  aspect?: number;
  // per-picture tone correction towards the house look: [brightness, contrast, saturate] (look.py)
  tone?: [number, number, number];
};

export type ArchiveCaption = {
  start: number;
  end: number;
  text: string;
};

export type ArchiveData = {
  title: string;
  fps: number;
  duration: number;
  audio: string;
  // cold open: narration seconds [from, to] play first, then `gap` seconds of black, then the film from 0
  coldOpen?: {from: number; to: number; gap?: number};
  renderOptions?: {
    showSubtitles?: boolean;
    showArchiveOverlay?: boolean;
    showDocumentHighlights?: boolean;
    showKineticMaps?: boolean;
    enableVisualSfx?: boolean;
  };
  captions?: ArchiveCaption[];
  sfx?: {
    projectorStart?: string;
    cameraClick?: string;
    paperSlide?: string;
    markerStroke?: string;
    mapPing?: string;
    typewriter?: string;
  };
  archiveClipCoverage?: {
    targetPercent: number;
    actualPercent: number;
    clipSeconds: number;
    totalSeconds: number;
    readyClips: number;
    plannedClips: number;
    fallback: string;
  };
  archiveClipSources?: Array<{
    scene: number;
    identifier?: string;
    title?: string;
    itemUrl?: string;
    licenseUrl?: string;
    rights?: string;
    sourceFile?: string;
    sourceStart?: number;
    searchQuery?: string;
  }>;
  scenes: ArchiveScene[];
};

export type ChartFormat = {prefix?: string; suffix?: string; decimals?: number; axisDecimals?: number};

export type ArchiveChartRow = {
  label: string;
  sub?: string;
  amount: number;
  /** second the bar lands (its spoken word) */
  at: number;
  text?: string;
  highlight?: boolean;
  /** later values the same bar steps to, each on its own word (tariff escalation) */
  steps?: Array<{amount: number; at: number; text?: string}>;
  /** stacked parts that add up (US + Germany + Japan + UK) */
  segments?: Array<{label: string; amount: number; at: number}>;
};

export type ArchiveChart = {
  type: 'line' | 'columns' | 'bars';
  kicker?: string;
  title: string;
  source?: string;
  format?: ChartFormat;
  appear?: number;
  until?: number;
  x?: [number, number];
  y?: [number, number];
  xTicks?: number[];
  yTicks?: number[];
  series?: Array<{label?: string; points: [number, number][]; color?: 'gold' | 'cream'}>;
  /** the line's head reaches x when `at` is spoken */
  reveal?: Array<{x: number; at: number}>;
  markers?: Array<{x: number; label: string; at?: number}>;
  callouts?: Array<{x: number; y?: number; series?: number; text?: string; at: number; below?: boolean}>;
  rows?: ArchiveChartRow[];
  max?: number;
  track?: boolean;
  labelWidth?: number;
  badge?: {text: string; at: number};
};
