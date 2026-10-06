import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {basename, join} from "node:path";

const output = process.argv[2] || "out/mixed-audio.m4a";
const publicDir = "public";
const data = JSON.parse(readFileSync(join(publicDir, "archive.json"), "utf8"));
const duration = Math.max(0.1, Number(data.duration || 0.1));
const sfx = data.sfx ?? {};
const cacheDir = "audio-mix-assets";

const isUrl = (src) => /^https?:\/\//i.test(src);
// Mirrors SoundEffects in src/ArchiveDocumentary.tsx so the fast ffmpeg mix matches Studio.
const namedSound = (name) => {
  if (name === "paper_slide") return sfx.paperSlide;
  if (name === "camera_click") return sfx.cameraClick;
  if (name === "marker_stroke") return sfx.markerStroke;
  if (name === "map_ping") return sfx.mapPing;
  if (name === "typewriter") return sfx.typewriter;
  return null;
};
const accentSound = (accent, explicit) => {
  const planned = namedSound(explicit);
  if (planned) return planned;
  if (accent === "scan" || accent === "shutter") return sfx.cameraClick;
  if (accent === "document_highlight") return sfx.markerStroke;
  if (accent === "kinetic_map") return sfx.mapPing;
  if (accent === "focus" || accent === "light_leak") return sfx.paperSlide;
  return null;
};
const cueStart = (scene) => {
  const start = Number(scene.start || 0);
  const latest = Math.max(start, Number(scene.end || start) - 0.35);
  const cue = Number(scene.visualCueStart);
  return Number.isFinite(cue) ? Math.max(start, Math.min(latest, cue)) : start;
};

const resolveAsset = async (src) => {
  if (!src) return "";
  if (!isUrl(src)) {
    const local = join(publicDir, src);
    return existsSync(local) ? local : "";
  }

  mkdirSync(cacheDir, {recursive: true});
  const ext = basename(new URL(src).pathname).includes(".")
    ? basename(new URL(src).pathname).slice(basename(new URL(src).pathname).lastIndexOf("."))
    : ".bin";
  const file = join(cacheDir, `${createHash("sha1").update(src).digest("hex")}${ext}`);
  if (existsSync(file)) return file;

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Unable to download SFX ${src}: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(file, buffer);
  return file;
};

const voice = data.audio ? join(publicDir, data.audio) : "";
if (!voice || !existsSync(voice)) {
  process.exit(0);
}

const plannedEvents = [];
if (sfx.projectorStart) {
  plannedEvents.push({src: sfx.projectorStart, start: 0, duration: 2.1, volume: 0.18});
}
// Mirrors FILM_BURNS in src/FilmBurn.tsx: clip length and first full-white frame (25 fps source), sound gain.
const FILM_BURNS = {
  1: {frames: 28, peak: 10, gain: 0.26},
  4: {frames: 29, peak: 20, gain: 1},
  5: {frames: 26, peak: 8, gain: 0.23},
  6: {frames: 27, peak: 12, gain: 0.64},
  11: {frames: 22, peak: 9, gain: 1},
  12: {frames: 25, peak: 11, gain: 1},
  13: {frames: 25, peak: 10, gain: 0.25},
};
const isBurn = (scene) => scene.transition?.kind === "burn" && FILM_BURNS[scene.transition.n];
for (const scene of data.scenes ?? []) {
  if (isBurn(scene)) {
    // the burn's projector sound, timed so its white flash lands on the cut (as the overlay is)
    const burn = FILM_BURNS[scene.transition.n];
    plannedEvents.push({
      src: `transitions/film-transition-${String(scene.transition.n).padStart(2, "0")}.mp4`,
      start: Math.max(0, Number(scene.start || 0) - burn.peak / 25),
      duration: burn.frames / 25,
      volume: 0.8 * burn.gain,
    });
  }
  if (scene.graphic === "kinetic_map" && !scene.historicalMap) continue;
  if (scene.graphic === "document_highlight" && !scene.sourceImage) continue;
  const src = scene.sourceImage ? sfx.paperSlide : accentSound(scene.accent, scene.sfx);
  if (!src) continue;
  // a film burn carries its own sound: no second effect on top of it
  if (isBurn(scene) && cueStart(scene) - Number(scene.start || 0) < 1.2) continue;
  const offset = scene.graphic === "kinetic_map" ? 0.62 : scene.sourceImage ? 0.12 : 0;
  plannedEvents.push({
    src,
    start: cueStart(scene) + offset,
    duration: 1.4,
    volume: scene.sfx === "map_ping" ? 0.13 : 0.1,
  });
}

// Mirrors printSlides in SoundEffects (src/ArchiveDocumentary.tsx): a paper slide under every real-photo print that
// slides onto the graph paper (scene prints and print cutaways), timed to the moment the print starts moving in.
const fps = Number(data.fps || 30);
const MAX_OVERLAP = 14;
const isMapScene = (scene) =>
  (scene.graphic === "kinetic_map" || !!scene.chart || !!scene.person || !!scene.dossier) && !scene.video && !scene.image;
// frames the scene's dissolve-in starts before scene.start (transitionInto + overlapOf in the renderer)
const overlapInto = (prev, scene) => {
  if (!prev || scene.transition?.kind === "burn") return 0;
  const seconds = scene.end - scene.start;
  if (isMapScene(scene) || isMapScene(prev)) return Math.min(MAX_OVERLAP, 16);
  if (scene.accent === "date_stamp" && seconds > 2.2) return 0;
  if (scene.accent === "scan" || scene.accent === "shutter") return 0;
  if (prev.video && scene.video) return 0;
  if (seconds < 4.5) return 0;
  return Math.min(MAX_OVERLAP, 12);
};
if (sfx.paperSlide) {
  const scenes = data.scenes ?? [];
  scenes.forEach((scene, i) => {
    const startFrame = Math.floor(Number(scene.start || 0) * fps);
    const shots = scene.shots ?? [];
    if (!scene.video && scene.image) {
      const coveredAtStart = shots.some((shot) => shot.at <= scene.start + 0.05);
      if (scene.fit === "contain" && !scene.parallax && !coveredAtStart && scene.transition?.kind !== "burn") {
        const frame = Math.max(0, startFrame - overlapInto(scenes[i - 1], scene));
        plannedEvents.push({src: sfx.paperSlide, start: frame / fps, duration: 1.2, volume: 0.22});
      }
    }
    for (const shot of shots) {
      if (shot.image && !shot.video && shot.fit === "contain") {
        const frame = startFrame + Math.round((shot.at - scene.start) * fps);
        plannedEvents.push({src: sfx.paperSlide, start: frame / fps, duration: 1.2, volume: 0.22});
      }
    }
  });
}

const events = [];
for (const event of plannedEvents) {
  try {
    const resolved = await resolveAsset(event.src);
    if (resolved) {
      events.push({...event, resolved});
    }
  } catch (error) {
    console.log(String(error?.message || error));
  }
}

mkdirSync("out", {recursive: true});

if (events.length === 0) {
  execFileSync("ffmpeg", [
    "-y",
    "-i",
    voice,
    "-vn",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(duration),
    output,
  ], {stdio: "inherit"});
  process.exit(0);
}

const args = ["-y", "-i", voice];
const files = [...new Set(events.map((event) => event.resolved))];
for (const file of files) {
  args.push("-i", file);
}

const filters = ["[0:a]volume=1[a0]"];
const mixLabels = ["[a0]"];
const taps = new Map();
files.forEach((file, f) => {
  const users = events.filter((event) => event.resolved === file).length;
  const outs = Array.from({length: users}, (_, k) => `f${f}_${k}`);
  filters.push(`[${f + 1}:a]asplit=${users}${outs.map((o) => `[${o}]`).join("")}`);
  taps.set(file, outs);
});
events.forEach((event, index) => {
  const tap = taps.get(event.resolved).shift();
  const label = `s${index}`;
  const delay = Math.max(0, Math.round(Number(event.start || 0) * 1000));
  const clipDuration = Math.max(0.05, Number(event.duration || 1));
  const volume = Math.max(0, Number(event.volume || 0.08));
  // aformat: the burn clips' audio may not match the voice's layout or rate
  filters.push(
    `[${tap}]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${clipDuration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay}[${label}]`,
  );
  mixLabels.push(`[${label}]`);
});
filters.push(
  `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.98,atrim=0:${duration}[aout]`,
);

args.push(
  "-filter_complex",
  filters.join(";"),
  "-map",
  "[aout]",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  output,
);

execFileSync("ffmpeg", args, {stdio: "inherit"});
