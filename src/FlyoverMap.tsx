import {useEffect, useMemo, useRef, useState} from 'react';
import {
  AbsoluteFill,
  Easing,
  cancelRender,
  continueRender,
  delayRender,
  getRemotionEnvironment,
  interpolate,
  useVideoConfig,
} from 'remotion';
import type {ReactNode} from 'react';
import type {ArchiveScene, FlyoverCamera, HistoricalMapSpec, MapCoordinate} from './types';
import {ROUTE_COLORS, RETIRED_GOLDS} from './Palette';
import {PROJECTION, PlaceMarker, Vehicle, pointAt, polyline, sampleRoute, styles, type Pt} from './DocumentaryMap';

// The documentary map flown over live 3D satellite terrain (CesiumJS + MapTiler), for scenes whose geography is
// the point: a basin, a coastline, a mountain pass. Same pins, routes, title and grade as DocumentaryMap; only the
// ground is real. Cesium rules (remotion-maps skill): own render loop, viewer.render() per frame, preserved
// drawing buffer, every frame gated on delayRender until the tiles settle.

const MAPTILER_KEY = process.env.REMOTION_MAPTILER_KEY;
const CESIUM_VER = '1.143';
const CDN = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VER}/Build/Cesium/`;
const clamp01 = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

type Screen = {x: number; y: number; s: number} | null;

const loadCesium = () =>
  new Promise<any>((resolve, reject) => {
    const w = window as any;
    if (w.Cesium) return resolve(w.Cesium);
    w.CESIUM_BASE_URL = CDN;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${CDN}Widgets/widgets.css`;
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = `${CDN}Cesium.js`;
    script.onload = () => resolve(w.Cesium);
    script.onerror = () => reject(new Error(`Failed to load CesiumJS ${CESIUM_VER}`));
    document.head.appendChild(script);
  });

const poseAt = (a: FlyoverCamera, b: FlyoverCamera, t: number): FlyoverCamera => {
  let dh = b.heading - a.heading;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  return {
    lng: a.lng + (b.lng - a.lng) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    alt: Math.exp(Math.log(a.alt) + (Math.log(b.alt) - Math.log(a.alt)) * t),
    heading: a.heading + dh * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
};

export const FlyoverMap = ({
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
  holdStart?: boolean;
  holdEnd?: boolean;
}) => {
  const {width, height} = useVideoConfig();
  const fly = spec.flyover as NonNullable<HistoricalMapSpec['flyover']>;
  const rendering = getRemotionEnvironment().isRendering;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const started = useRef(false);
  const pending = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [initHandle] = useState(() => delayRender(`flyover init s${scene.index}`, {timeoutInMilliseconds: 120000}));
  const [screen, setScreen] = useState<{frame: number; pts: Screen[]}>({frame: -9999, pts: []});

  const life = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], clamp01);
  const fadeIn = holdStart ? 1 : interpolate(frame, [0, 12], [0, 1], clamp01);
  const exit = holdEnd ? 1 : interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], clamp01);
  const ripple = (((frame % 45) + 45) % 45) / 45;

  // every ground point the overlay needs, as lng/lat: places, then each route's sampled curve
  const routes = useMemo(() => (spec.routes ?? []).map((route) => ({
    route,
    lngLat: sampleRoute(route).map((p) => (PROJECTION.invert?.(p) ?? [0, 0]) as MapCoordinate),
  })), [spec.routes]);
  const ground = useMemo(() => [
    ...(spec.places ?? []).map((p) => p.coordinates),
    ...routes.flatMap((r) => r.lngLat),
  ], [spec.places, routes]);

  const place = (C: any, viewer: any, t: number) => {
    const pose = poseAt(fly.from, fly.to, Easing.bezier(0.33, 0, 0.3, 1)(t));
    viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(pose.lng, pose.lat, pose.alt),
      orientation: {heading: C.Math.toRadians(pose.heading), pitch: C.Math.toRadians(pose.pitch), roll: 0},
    });
  };

  const settle = (viewer: any) => new Promise<void>((resolve) => {
    let stable = 0;
    let ticks = 0;
    const tick = () => {
      viewer.render();
      ticks++;
      stable = viewer.scene.globe.tilesLoaded ? stable + 1 : 0;
      if (stable > 6 || ticks > 900) {
        viewer.render();
        resolve();
      } else {
        setTimeout(tick, 8);
      }
    };
    tick();
  });

  const projectAll = (C: any, viewer: any): Screen[] => {
    const sc = viewer.scene;
    const camPos = viewer.camera.positionWC;
    const toWindow = C.SceneTransforms.worldToWindowCoordinates ?? C.SceneTransforms.wgs84ToWindowCoordinates;
    const exaggeration = fly.exaggeration ?? 1.4;
    return ground.map(([lng, lat]) => {
      const h = sc.globe.getHeight(C.Cartographic.fromDegrees(lng, lat)) ?? 0;
      const world = C.Cartesian3.fromDegrees(lng, lat, h * exaggeration);
      // points behind the camera have no screen position
      const dir = C.Cartesian3.subtract(world, camPos, new C.Cartesian3());
      if (C.Cartesian3.dot(dir, viewer.camera.directionWC) <= 0) return null;
      const w = toWindow(sc, world);
      if (!w) return null;
      const dist = C.Cartesian3.magnitude(dir);
      return {x: w.x, y: w.y, s: Math.max(0.8, Math.min(1.15, (fly.to.alt * 2.2) / dist))};
    });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!MAPTILER_KEY) throw new Error('flyover: REMOTION_MAPTILER_KEY is not set (renderer/.env)');
      const C = await loadCesium();
      const viewer = new C.Viewer(containerRef.current, {
        baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
        navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
        infoBox: false, selectionIndicator: false,
        contextOptions: {webgl: {preserveDrawingBuffer: true}},
      });
      viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
        url: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`,
        maximumLevel: 20,
      }));
      viewer.terrainProvider = await C.CesiumTerrainProvider.fromUrl(
        `https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=${MAPTILER_KEY}`,
        {requestVertexNormals: true},
      );
      viewer.creditDisplay.addStaticCredit(new C.Credit('© MapTiler © OpenStreetMap contributors', true));
      viewer.useDefaultRenderLoop = false;
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.fog.enabled = true;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.verticalExaggeration = fly.exaggeration ?? 1.4;
      viewerRef.current = {viewer, C};
      place(C, viewer, 0);
      await settle(viewer);
      setReady(true);
      continueRender(initHandle);
    })().catch((error) => cancelRender(error));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const {viewer, C} = viewerRef.current;
    const handle = delayRender(`flyover s${scene.index} f${frame}`, {timeoutInMilliseconds: 90000});
    pending.current = handle;
    place(C, viewer, life);
    // Studio playback draws once per frame; renders wait for the tiles at every frame
    const done = rendering ? settle(viewer) : Promise.resolve(viewer.render());
    done.then(() => setScreen({frame, pts: projectAll(C, viewer)}));
  }, [ready, frame]); // eslint-disable-line react-hooks/exhaustive-deps

  // the overlay must be committed for this frame before the frame is captured
  useEffect(() => {
    if (pending.current !== null && screen.frame === frame) {
      continueRender(pending.current);
      pending.current = null;
    }
  }, [screen, frame]);

  const pts = screen.pts;
  const nPlaces = (spec.places ?? []).length;
  let cursor = nPlaces;
  const overlay: ReactNode[] = [];
  routes.forEach(({route, lngLat}, index) => {
    const screenPts = pts.slice(cursor, cursor + lngLat.length);
    cursor += lngLat.length;
    const visible = screenPts.filter((p): p is NonNullable<Screen> => Boolean(p)).map((p) => [p.x, p.y] as Pt);
    if (visible.length < 2) return;
    const start = route.startAt ?? 0.08;
    const end = Math.max(start + 0.08, route.endAt ?? 0.72);
    const progress = interpolate(life, [start, end], [0, 1], {...clamp01, easing: Easing.inOut(Easing.cubic)});
    const legacy = !route.color || RETIRED_GOLDS.includes(route.color.toLowerCase());
    const color: string = legacy || !route.color ? ROUTE_COLORS[index % ROUTE_COLORS.length] : route.color;
    const line = polyline(visible);
    const at = pointAt(line, line.total * progress);
    const drawn = [...line.pts.slice(0, at.index), at.pt];
    const d = (p: Pt[]) => p.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
    const preview = interpolate(life, [0, 0.08], [0, 1], clamp01);
    overlay.push(
      <svg key={route.id} width={width} height={height} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <path d={d(line.pts)} fill="none" stroke="#fff6e0" strokeOpacity={0.3 * preview} strokeWidth={2} strokeDasharray="4 10" strokeLinecap="round" />
        {progress > 0 ? (
          <>
            <path d={d(drawn)} fill="none" stroke="#0b0d0e" strokeOpacity={0.7} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d(drawn)} fill="none" stroke={color} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}
      </svg>,
    );
    if (route.vehicle && progress > 0.01) {
      const behind = pointAt(line, line.total * progress - 12).pt;
      const angle = (Math.atan2(at.pt[1] - behind[1], at.pt[0] - behind[0]) * 180) / Math.PI;
      const done = interpolate(progress, [0.97, 1], [1, 0], clamp01);
      overlay.push(
        <div key={`v-${route.id}`} style={{...styles.anchor, left: at.pt[0], top: at.pt[1], opacity: done}}>
          <div style={{...styles.vehicleGlow, background: `radial-gradient(circle, ${color}aa 0%, transparent 70%)`}} />
          <svg width={64} height={64} viewBox="-32 -32 64 64" style={{position: 'absolute', left: -32, top: -32, transform: `rotate(${angle}deg)`, overflow: 'visible', filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.6))'}}>
            <Vehicle kind={route.vehicle} color={color} />
          </svg>
        </div>,
      );
    }
  });

  return (
    <div style={{...styles.stage, opacity: fadeIn * exit}}>
      {/* the satellite ground, graded towards the house look like the NASA plane */}
      <AbsoluteFill style={{filter: 'saturate(0.62) contrast(1.12) brightness(0.9) sepia(0.14)'}}>
        <div ref={containerRef} style={{position: 'absolute', width, height}} />
      </AbsoluteFill>
      {overlay}
      {(spec.places ?? []).map((p, i) => {
        const s = pts[i];
        return s ? <PlaceMarker key={`${p.label}-${i}`} place={p} i={i} p={s} frame={frame} durationInFrames={durationInFrames} ripple={ripple} /> : null;
      })}
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
