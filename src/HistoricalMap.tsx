import {Img, interpolate, spring, staticFile, useVideoConfig} from 'remotion';
import {geoEquirectangular, geoPath} from 'd3-geo';
import {feature} from 'topojson-client';
import worldAtlas from 'world-atlas/countries-50m.json';
import type {CSSProperties} from 'react';
import type {Feature, FeatureCollection, Geometry, Polygon} from 'geojson';
import type {
  ArchiveScene,
  HistoricalMapSpec,
  HistoricalRoute,
  HistoricalTerritory,
  MapCoordinate,
} from './types';

const MAP_WIDTH = 1920;
const MAP_HEIGHT = 1080;

const WORLD_FEATURES = feature(
  worldAtlas as never,
  (worldAtlas as unknown as {objects: {countries: never}}).objects.countries,
) as unknown as FeatureCollection<Geometry>;

const MAP_PROJECTION = geoEquirectangular()
  .scale(MAP_WIDTH / (2 * Math.PI))
  .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
const MAP_PATH = geoPath(MAP_PROJECTION);

const normalizeName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const COUNTRY_ALIASES: Record<string, string[]> = {
  BRITAIN: ['UNITED KINGDOM'],
  BURMA: ['MYANMAR'],
  CHINA: ['CHINA'],
  CZECHIA: ['CZECH REPUBLIC'],
  'DEMOCRATIC REPUBLIC OF THE CONGO': ['DEMOCRATIC REPUBLIC OF THE CONGO', 'DEM. REP. CONGO'],
  IRAN: ['IRAN'],
  LAOS: ['LAOS'],
  MACEDONIA: ['NORTH MACEDONIA', 'MACEDONIA'],
  RUSSIA: ['RUSSIA'],
  'SOUTH KOREA': ['SOUTH KOREA', 'KOREA'],
  SYRIA: ['SYRIA'],
  TANZANIA: ['TANZANIA'],
  TURKEY: ['TURKEY'],
  'UNITED STATES': ['UNITED STATES OF AMERICA', 'UNITED STATES'],
  VIETNAM: ['VIETNAM'],
};

const countryFeatureName = (country: Feature<Geometry>) =>
  normalizeName(String((country.properties as {name?: string} | null)?.name ?? ''));

const territoryCountryNames = (territory: HistoricalTerritory, previous: boolean) => {
  const names = previous ? territory.previousCountries : territory.countries;
  return new Set(
    (names ?? []).flatMap((name) => {
      const normalized = normalizeName(name);
      return [normalized, ...(COUNTRY_ALIASES[normalized] ?? [])].map(normalizeName);
    }),
  );
};

const project = (coordinate: MapCoordinate): [number, number] => {
  const result = MAP_PROJECTION(coordinate);
  return result ? [result[0], result[1]] : [MAP_WIDTH / 2, MAP_HEIGHT / 2];
};

const polygonFeature = (coordinates: MapCoordinate[]): Feature<Polygon> => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[
      ...(coordinates.reduce(
        (area, point, index) => {
          const next = coordinates[(index + 1) % coordinates.length];
          return area + point[0] * next[1] - next[0] * point[1];
        },
        0,
      ) > 0
        ? [...coordinates].reverse()
        : coordinates),
      ...(coordinates.length > 0
        ? [coordinates.reduce(
            (area, point, index) => {
              const next = coordinates[(index + 1) % coordinates.length];
              return area + point[0] * next[1] - next[0] * point[1];
            },
            0,
          ) > 0 ? coordinates[coordinates.length - 1] : coordinates[0]]
        : []),
    ]],
  },
});

const territoryCoordinates = (territory: HistoricalTerritory, previous: boolean) => {
  const polygons = previous ? territory.previousPolygons : territory.polygons;
  return polygons ?? [];
};

const allMapCoordinates = (spec: HistoricalMapSpec): MapCoordinate[] => {
  const result: MapCoordinate[] = [];
  for (const place of spec.places ?? []) result.push(place.coordinates);
  for (const route of spec.routes ?? []) result.push(...route.points);
  for (const territory of spec.territories ?? []) {
    if (territory.labelAt) result.push(territory.labelAt);
    for (const polygon of territory.polygons ?? []) result.push(...polygon);
    for (const polygon of territory.previousPolygons ?? []) result.push(...polygon);
  }
  if (spec.camera?.center) result.push(spec.camera.center);
  if (spec.camera?.fromCenter) result.push(spec.camera.fromCenter);
  return result;
};

type ViewBox = [x: number, y: number, width: number, height: number];

const boundsViewBox = (spec: HistoricalMapSpec): ViewBox => {
  const coordinates = allMapCoordinates(spec);
  if (!coordinates.length) return [0, 0, MAP_WIDTH, MAP_HEIGHT];
  const projected = coordinates.map(project);
  const minX = Math.min(...projected.map(([x]) => x));
  const maxX = Math.max(...projected.map(([x]) => x));
  const minY = Math.min(...projected.map(([, y]) => y));
  const maxY = Math.max(...projected.map(([, y]) => y));
  const spanX = Math.max(180, maxX - minX);
  const spanY = Math.max(120, maxY - minY);
  const paddedWidth = Math.max(390, spanX * 1.38);
  const paddedHeight = Math.max(235, spanY * 1.5);
  const width = Math.max(paddedWidth, paddedHeight * (16 / 9));
  const height = width / (16 / 9);
  return [
    (minX + maxX) / 2 - width / 2,
    (minY + maxY) / 2 - height / 2,
    width,
    height,
  ];
};

const cameraViewBox = (spec: HistoricalMapSpec, progress: number): ViewBox => {
  const automatic = boundsViewBox(spec);
  const camera = spec.camera;
  if (!camera?.center && !camera?.fromCenter && !camera?.zoom && !camera?.fromZoom) return automatic;

  const automaticCenter: [number, number] = [
    automatic[0] + automatic[2] / 2,
    automatic[1] + automatic[3] / 2,
  ];
  const toCenter = camera.center ? project(camera.center) : automaticCenter;
  const fromCenter = camera.fromCenter ? project(camera.fromCenter) : toCenter;
  const automaticZoom = MAP_WIDTH / automatic[2];
  const fromZoom = Math.max(0.55, camera.fromZoom ?? Math.max(0.7, automaticZoom * 0.82));
  const toZoom = Math.max(0.55, camera.zoom ?? automaticZoom);
  const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
  const centerX = interpolate(eased, [0, 1], [fromCenter[0], toCenter[0]]);
  const centerY = interpolate(eased, [0, 1], [fromCenter[1], toCenter[1]]);
  const zoom = interpolate(eased, [0, 1], [fromZoom, toZoom]);
  const width = MAP_WIDTH / zoom;
  const height = MAP_HEIGHT / zoom;
  return [centerX - width / 2, centerY - height / 2, width, height];
};

const curvedRoutePath = (route: HistoricalRoute) => {
  const points = route.points.map(project);
  if (points.length < 2) return '';
  if (points.length === 2) {
    const [from, to] = points;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(105, Math.max(24, distance * 0.16));
    const control: [number, number] = [
      (from[0] + to[0]) / 2 - (dy / distance) * bend,
      (from[1] + to[1]) / 2 + (dx / distance) * bend,
    ];
    return `M ${from[0]} ${from[1]} Q ${control[0]} ${control[1]} ${to[0]} ${to[1]}`;
  }

  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length - 1; index++) {
    const current = points[index];
    const next = points[index + 1];
    const midpoint: [number, number] = [(current[0] + next[0]) / 2, (current[1] + next[1]) / 2];
    path += ` Q ${current[0]} ${current[1]} ${midpoint[0]} ${midpoint[1]}`;
  }
  const last = points[points.length - 1];
  path += ` T ${last[0]} ${last[1]}`;
  return path;
};

const movingPoint = (route: HistoricalRoute, progress: number): [number, number] => {
  const points = route.points.map(project);
  if (points.length < 2) return points[0] ?? [MAP_WIDTH / 2, MAP_HEIGHT / 2];
  const lengths = points.slice(1).map((point, index) => Math.hypot(
    point[0] - points[index][0],
    point[1] - points[index][1],
  ));
  const total = Math.max(1, lengths.reduce((sum, value) => sum + value, 0));
  let remaining = progress * total;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const local = remaining / Math.max(1, lengths[index]);
      return [
        interpolate(local, [0, 1], [points[index][0], points[index + 1][0]]),
        interpolate(local, [0, 1], [points[index][1], points[index + 1][1]]),
      ];
    }
    remaining -= lengths[index];
  }
  return points[points.length - 1];
};

const territoryPaths = (
  territory: HistoricalTerritory,
  previous: boolean,
) => {
  const names = territoryCountryNames(territory, previous);
  const countryPaths = names.size
    ? WORLD_FEATURES.features
        .filter((country) => names.has(countryFeatureName(country)))
        .map((country) => MAP_PATH(country) || '')
        .filter(Boolean)
    : [];
  const polygonPaths = territoryCoordinates(territory, previous)
    .filter((polygon) => polygon.length >= 3)
    .map((polygon) => MAP_PATH(polygonFeature(polygon)) || '')
    .filter(Boolean);
  return [...countryPaths, ...polygonPaths];
};

const accuracyLabel = (spec: HistoricalMapSpec) =>
  spec.accuracy === 'verified' ? 'SOURCE-GROUNDED EXTENT' : 'APPROXIMATE HISTORICAL EXTENT';

export const HistoricalMap = ({
  scene,
  spec,
  frame,
  durationInFrames,
}: {
  scene: ArchiveScene;
  spec: HistoricalMapSpec;
  frame: number;
  durationInFrames: number;
}) => {
  const {fps} = useVideoConfig();
  const entrance = spring({frame, fps, config: {damping: 22, stiffness: 78, mass: 1}});
  const lifeProgress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const mapProgress = interpolate(frame, [8, Math.max(26, durationInFrames * 0.62)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const transitionProgress = interpolate(frame, [12, Math.max(34, durationInFrames * 0.7)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(
    frame,
    [Math.max(1, durationInFrames - 16), durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const [viewX, viewY, viewWidth, viewHeight] = cameraViewBox(spec, lifeProgress);
  const viewBox = `${viewX} ${viewY} ${viewWidth} ${viewHeight}`;
  const labelScale = viewWidth / MAP_WIDTH;
  const reliefOpacity = interpolate(viewWidth, [80, 145, 270], [0.08, 0.4, 0.78], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const routeProgresses = (spec.routes ?? []).map((route) => {
    const start = route.startAt ?? 0.08;
    const end = Math.max(start + 0.08, route.endAt ?? 0.72);
    return interpolate(lifeProgress, [start, end], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  });
  const primaryRoute = spec.routes?.[0];
  const primaryProgress = routeProgresses[0] ?? 0;
  const markerPoint = primaryRoute ? movingPoint(primaryRoute, primaryProgress) : null;
  const ripple = (frame % 42) / 42;
  const markerVisible = spec.mode === 'journey' && markerPoint && primaryProgress > 0.015;

  return (
    <div
      style={{
        ...styles.stage,
        opacity: exit * interpolate(entrance, [0, 1], [0, 1]),
        transform: `scale(${interpolate(entrance, [0, 1], [1.025, 1])})`,
      }}
    >
      <svg viewBox={viewBox} style={styles.svg} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`ocean-${scene.index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#263b3f" />
            <stop offset="0.55" stopColor="#365157" />
            <stop offset="1" stopColor="#1d3034" />
          </linearGradient>
          <linearGradient id={`land-${scene.index}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#cdc5aa" />
            <stop offset="0.46" stopColor="#b9b093" />
            <stop offset="1" stopColor="#8f8771" />
          </linearGradient>
          <filter id={`land-shadow-${scene.index}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy={3 * labelScale}
              stdDeviation={4 * labelScale}
              floodColor="#111b1d"
              floodOpacity="0.42"
            />
          </filter>
          <filter id={`territory-glow-${scene.index}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy={2 * labelScale}
              stdDeviation={2.4 * labelScale}
              floodColor="#15100d"
              floodOpacity="0.38"
            />
          </filter>
          <filter id={`paper-grain-${scene.index}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.38"
              numOctaves="3"
              seed={scene.index * 17}
              stitchTiles="stitch"
            />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.35 0 0 0 0 0.31 0 0 0 0 0.24 0 0 0 0.22 0"
            />
          </filter>
          <clipPath id={`land-clip-${scene.index}`}>
            {WORLD_FEATURES.features.map((country, index) => (
              <path key={`land-clip-${index}`} d={MAP_PATH(country) || ''} />
            ))}
          </clipPath>
          {(spec.routes ?? []).map((route, index) => {
            const path = curvedRoutePath(route);
            const progress = routeProgresses[index] ?? 0;
            return (
              <mask
                key={route.id}
                id={`route-mask-${scene.index}-${index}`}
                x={viewX}
                y={viewY}
                width={viewWidth}
                height={viewHeight}
                maskUnits="userSpaceOnUse"
              >
                <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} fill="black" />
                <path
                  d={path}
                  fill="none"
                  stroke="white"
                  strokeWidth={26 * labelScale}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={`${progress} 1`}
                />
              </mask>
            );
          })}
          <marker
            id={`arrow-${scene.index}`}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="#f8d24d" />
          </marker>
        </defs>

        <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} fill={`url(#ocean-${scene.index})`} />
        <image
          href={staticFile('maps/natural-earth-2-relief.jpg')}
          x="0"
          y="60"
          width={MAP_WIDTH}
          height="960"
          preserveAspectRatio="none"
          opacity={reliefOpacity}
          clipPath={`url(#land-clip-${scene.index})`}
          style={{filter: 'sepia(0.38) saturate(0.5) brightness(0.78) contrast(1.12)'}}
        />
        <g filter={`url(#land-shadow-${scene.index})`}>
          {WORLD_FEATURES.features.map((country, index) => (
            <path
              key={`base-${index}`}
              d={MAP_PATH(country) || ''}
              fill="rgba(188,178,147,0.16)"
              stroke="rgba(68,66,55,0.68)"
              strokeWidth={0.9}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <rect
          x={viewX}
          y={viewY}
          width={viewWidth}
          height={viewHeight}
          fill="#8f856c"
          opacity="0.15"
          filter={`url(#paper-grain-${scene.index})`}
          clipPath={`url(#land-clip-${scene.index})`}
        />

        {(spec.territories ?? []).map((territory, territoryIndex) => {
          const currentPaths = territoryPaths(territory, false);
          const previousPaths = territoryPaths(territory, true);
          const isTransition = spec.mode === 'transition' && previousPaths.length > 0;
          const currentOpacity = isTransition ? transitionProgress : mapProgress;
          const previousOpacity = isTransition ? 1 - transitionProgress : 0;
          const strokeWidth = 2.2;
          return (
            <g key={territory.id} filter={`url(#territory-glow-${scene.index})`}>
              <g clipPath={`url(#land-clip-${scene.index})`}>
                {previousPaths.map((path, index) => (
                  <path
                    key={`previous-${index}`}
                    d={path}
                    fill={territory.color}
                    fillOpacity={previousOpacity * 0.5}
                    stroke={territory.color}
                    strokeOpacity={previousOpacity}
                    strokeWidth={strokeWidth}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {currentPaths.map((path, index) => (
                  <path
                    key={`current-${index}`}
                    d={path}
                    fill={territory.color}
                    fillOpacity={currentOpacity * 0.55}
                    stroke={territory.color}
                    strokeOpacity={currentOpacity}
                    strokeWidth={strokeWidth}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
              {territory.labelAt ? (
                <TerritoryLabel
                  territory={territory}
                  opacity={currentOpacity}
                  scale={labelScale}
                  index={territoryIndex}
                />
              ) : null}
            </g>
          );
        })}

        {(spec.routes ?? []).map((route, index) => {
          const path = curvedRoutePath(route);
          const progress = routeProgresses[index] ?? 0;
          const color = route.color || (index === 0 ? '#ff3a32' : index === 1 ? '#5a65ff' : '#f8d24d');
          const strokeWidth = spec.mode === 'campaign' ? 5.2 : 4.2;
          const dash = route.dashed ?? spec.mode === 'journey';
          const destination = route.points.length ? project(route.points[route.points.length - 1]) : null;
          const arrival = interpolate(progress, [0.9, 1], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <g key={route.id}>
              <g mask={`url(#route-mask-${scene.index}-${index})`}>
                <path
                  d={path}
                  fill="none"
                  stroke="rgba(18,14,11,0.58)"
                  strokeWidth={strokeWidth + 3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash ? '22 16' : undefined}
                  strokeDashoffset={dash ? -frame * 0.9 : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={spec.mode === 'campaign' ? `url(#arrow-${scene.index})` : undefined}
                  vectorEffect="non-scaling-stroke"
                  opacity="0.9"
                  style={{filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.38))'}}
                />
              </g>
              {destination ? (
                <>
                  <circle
                    cx={destination[0]}
                    cy={destination[1]}
                    r={(10 + ripple * 22) * labelScale}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.8 * labelScale}
                    opacity={arrival * (1 - ripple) * 0.5}
                  />
                  <circle
                    cx={destination[0]}
                    cy={destination[1]}
                    r={6 * labelScale}
                    fill="#d9c9a1"
                    stroke={color}
                    strokeWidth={2 * labelScale}
                    opacity={arrival}
                  />
                </>
              ) : null}
            </g>
          );
        })}

        {(spec.places ?? []).map((place, index) => {
          const [x, y] = project(place.coordinates);
          const primary = place.importance !== 'secondary';
          const labelPosition = place.labelPosition ?? (index % 2 === 0 ? 'right' : 'left');
          const labelX = labelPosition === 'left'
            ? x - 13 * labelScale
            : labelPosition === 'right'
              ? x + 13 * labelScale
              : x;
          const labelY = labelPosition === 'above'
            ? y - 17 * labelScale
            : labelPosition === 'below'
              ? y + 31 * labelScale
              : y - 12 * labelScale;
          const textAnchor = labelPosition === 'left'
            ? 'end'
            : labelPosition === 'right'
              ? 'start'
              : 'middle';
          const opacity = interpolate(frame, [12 + index * 4, 28 + index * 4], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <g key={`${place.label}-${index}`} opacity={opacity}>
              <circle
                cx={x}
                cy={y}
                r={(primary ? 5 : 3.5) * labelScale}
                fill="#ddd0ad"
                stroke="#28221b"
                strokeWidth={1.7 * labelScale}
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor={textAnchor}
                fill="#eee7d6"
                stroke="rgba(24,20,17,0.82)"
                strokeWidth={2.6 * labelScale}
                paintOrder="stroke"
                fontFamily="Georgia, Times New Roman, serif"
                fontSize={(primary ? 24 : 18) * labelScale}
                fontWeight={600}
                letterSpacing={1.6 * labelScale}
              >
                {place.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {markerVisible && markerPoint ? (
          <g transform={`translate(${markerPoint[0]} ${markerPoint[1]})`}>
            <circle
              r={10 * labelScale}
              fill="#b99756"
              stroke="#251f18"
              strokeWidth={2.5 * labelScale}
              style={{filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))'}}
            />
            <circle r={3 * labelScale} fill="#f0e2bd" />
          </g>
        ) : null}
      </svg>

      <div style={styles.topShade} />
      <div style={styles.vignette} />
      {spec.mode === 'transition' ? (
        <div style={styles.transitionMeter}>
          <div style={styles.transitionLabel}>TERRITORIAL CHANGE</div>
          <div style={styles.transitionTrack}>
            <div style={{...styles.transitionFill, width: `${transitionProgress * 100}%`}} />
          </div>
        </div>
      ) : null}
      {spec.mode === 'journey' && spec.portraitImage ? (
        <div
          style={{
            ...styles.portraitCard,
            opacity: interpolate(frame, [8, 25], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            transform: `translateY(${interpolate(entrance, [0, 1], [34, 0])}px)`,
          }}
        >
          <Img src={staticFile(spec.portraitImage)} style={styles.portrait} />
          <div style={styles.portraitName}>{spec.portraitLabel || scene.mapLabel || 'JOURNEY'}</div>
        </div>
      ) : null}
      <div style={styles.filmWash} />
    </div>
  );
};

const TerritoryLabel = ({
  territory,
  opacity,
  scale,
  index,
}: {
  territory: HistoricalTerritory;
  opacity: number;
  scale: number;
  index: number;
}) => {
  if (!territory.labelAt) return null;
  const [x, y] = project(territory.labelAt);
  const words = territory.name.toUpperCase().split(/\s+/);
  const midpoint = words.length > 1 ? Math.ceil(words.length / 2) : words.length;
  const lines = words.length > 2
    ? [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')]
    : [territory.name.toUpperCase()];
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill="#eee6d3"
      stroke="rgba(28,22,19,0.78)"
      strokeWidth={2.2 * scale}
      paintOrder="stroke"
      opacity={opacity}
      fontFamily="Georgia, Times New Roman, serif"
      fontSize={(lines.length > 1 ? 28 : 32) * scale}
      fontWeight={600}
      letterSpacing={2.1 * scale}
      style={{filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.46))'}}
    >
      {lines.map((line, lineIndex) => (
        <tspan
          key={`${index}-${line}`}
          x={x}
          dy={lineIndex === 0 ? 0 : 34 * scale}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
};

const styles: Record<string, CSSProperties> = {
  stage: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    backgroundColor: '#1d3034',
    transformOrigin: 'center',
  },
  svg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  topShade: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(7,9,9,0.66), rgba(8,10,10,0.1) 25%, rgba(7,7,6,0.03) 70%, rgba(5,4,3,0.48))',
    pointerEvents: 'none',
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    boxShadow: 'inset 0 0 175px 58px rgba(6,5,4,0.68)',
    pointerEvents: 'none',
  },
  header: {
    position: 'absolute',
    left: 58,
    top: 42,
    maxWidth: 980,
    color: '#eee7d7',
    textShadow: '0 3px 15px rgba(0,0,0,0.68)',
  },
  eyebrow: {
    marginBottom: 8,
    color: '#cbbd9a',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: 4,
  },
  title: {
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: 42,
    lineHeight: 1.04,
    letterSpacing: 0.35,
  },
  subtitle: {
    marginTop: 12,
    color: '#cfc5ae',
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: 20,
    lineHeight: 1.2,
  },
  year: {
    position: 'absolute',
    right: 46,
    top: 35,
    minWidth: 154,
    padding: '12px 20px 14px',
    color: '#e9e0ce',
    backgroundColor: 'rgba(18,19,17,0.72)',
    border: '1px solid rgba(205,192,157,0.32)',
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: 40,
    fontStyle: 'italic',
    letterSpacing: 4,
    textAlign: 'center',
    textShadow: '0 3px 8px rgba(0,0,0,0.8)',
  },
  accuracy: {
    position: 'absolute',
    right: 44,
    top: 118,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '6px 9px',
    color: '#cfc5ae',
    backgroundColor: 'rgba(17,19,17,0.54)',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 10,
    letterSpacing: 1.25,
  },
  accuracyDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
  },
  transitionMeter: {
    position: 'absolute',
    left: 60,
    bottom: 116,
    width: 330,
    padding: '10px 12px 12px',
    backgroundColor: 'rgba(20,19,16,0.62)',
    border: '1px solid rgba(207,193,158,0.28)',
  },
  transitionLabel: {
    marginBottom: 8,
    color: '#eee3c5',
    fontFamily: 'Menlo, Monaco, monospace',
    fontSize: 11,
    letterSpacing: 2.4,
  },
  transitionTrack: {
    height: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(231,218,183,0.2)',
  },
  transitionFill: {
    height: '100%',
    backgroundColor: '#a98a4e',
  },
  portraitCard: {
    position: 'absolute',
    left: 48,
    bottom: 105,
    display: 'flex',
    alignItems: 'center',
    gap: 15,
    maxWidth: 430,
    padding: '10px 20px 10px 10px',
    color: '#fff8e5',
    backgroundColor: 'rgba(25,22,17,0.78)',
    border: '1px solid rgba(236,218,178,0.52)',
    boxShadow: '0 12px 35px rgba(0,0,0,0.4)',
  },
  portrait: {
    width: 82,
    height: 82,
    borderRadius: 82,
    objectFit: 'cover',
    filter: 'sepia(0.45) contrast(1.08)',
    border: '3px solid #e2d3ae',
  },
  portraitName: {
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: 26,
    lineHeight: 1.05,
    textTransform: 'uppercase',
  },
  filmWash: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    opacity: 0.09,
    mixBlendMode: 'overlay',
    backgroundImage:
      'radial-gradient(circle at 22% 24%, rgba(229,214,176,0.22), transparent 38%), linear-gradient(112deg, transparent 28%, rgba(255,246,217,0.08) 47%, transparent 68%)',
  },
};
