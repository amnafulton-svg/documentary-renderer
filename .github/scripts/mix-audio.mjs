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
for (const scene of data.scenes ?? []) {
  if (scene.graphic === "kinetic_map" && !scene.historicalMap) continue;
  if (scene.graphic === "document_highlight" && !scene.sourceImage) continue;
  const src = scene.sourceImage ? sfx.paperSlide : accentSound(scene.accent, scene.sfx);
  if (!src) continue;
  const offset = scene.graphic === "kinetic_map" ? 0.62 : scene.sourceImage ? 0.12 : 0;
  plannedEvents.push({
    src,
    start: cueStart(scene) + offset,
    duration: 1.4,
    volume: scene.sfx === "map_ping" ? 0.13 : 0.1,
  });
}

const events = [];
for (const event of plannedEvents.slice(0, 200)) {
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
for (const event of events) {
  args.push("-i", event.resolved);
}

const filters = ["[0:a]volume=1[a0]"];
const mixLabels = ["[a0]"];
events.forEach((event, index) => {
  const inputIndex = index + 1;
  const label = `s${index}`;
  const delay = Math.max(0, Math.round(Number(event.start || 0) * 1000));
  const clipDuration = Math.max(0.05, Number(event.duration || 1));
  const volume = Math.max(0, Number(event.volume || 0.08));
  filters.push(
    `[${inputIndex}:a]atrim=0:${clipDuration},asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay}[${label}]`,
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
