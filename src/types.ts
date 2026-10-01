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
  // real photos render as a framed print over a soft copy of themselves instead of filling the frame
  fit?: 'cover' | 'contain';
  aspect?: number;
  /** chapter title card shown over the opening of this scene */
  chapter?: {number: string; title: string};
  /** full-screen statistic reveal (accent 'stat') */
  stat?: {
    value: string;
    label: string;
    prefix?: string;
    compare?: Array<{label: string; value: string; amount: number}>;
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
