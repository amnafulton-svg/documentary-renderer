import {existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {join, posix} from "node:path";

const publicDir = process.argv[2] || "public";
const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const audioExts = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const videoExts = new Set([".mp4", ".m4v"]);

const isUrl = (value) => /^https?:\/\//i.test(value);
const isHiddenOrMetadata = (name) =>
  name.startsWith(".") || name === ".DS_Store" || name === "Thumbs.db" || name === "__MACOSX";

const removeHidden = (dir) => {
  if (!existsSync(dir)) {
    return;
  }
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (isHiddenOrMetadata(name)) {
      rmSync(full, {recursive: true, force: true});
      continue;
    }
    if (statSync(full).isDirectory()) {
      removeHidden(full);
    }
  }
};

const extname = (file) => {
  const base = posix.basename(file).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
};

const hasUnsafePart = (value) => String(value).split("/").some(isHiddenOrMetadata);
const localExists = (value) => existsSync(join(publicDir, value));

const validLocalAsset = (value, allowedExts) => {
  if (!value || isUrl(value)) return Boolean(value);
  return !hasUnsafePart(value) && allowedExts.has(extname(value)) && localExists(value);
};

removeHidden(publicDir);

const archivePath = join(publicDir, "archive.json");
const data = JSON.parse(readFileSync(archivePath, "utf8"));

if (!Array.isArray(data.scenes)) {
  throw new Error("archive.json is missing a scenes array");
}

if (data.audio && !validLocalAsset(String(data.audio), audioExts)) {
  console.log(`Removed invalid audio from archive.json: ${data.audio}`);
  data.audio = "";
}

for (const scene of data.scenes) {
  // Documentary map and data-chart scenes are drawn live by the renderer and carry no image.
  const isMapScene = scene.mode === "map" && scene.historicalMap;
  const isChartScene = Boolean(scene.chart);
  if ((isMapScene || isChartScene) && !scene.image) {
    // ok
  } else if (!validLocalAsset(String(scene.image || ""), imageExts)) {
    throw new Error(`Scene ${scene.index || "?"} has a missing or invalid image: ${scene.image || ""}`);
  }
  if (scene.video && !validLocalAsset(String(scene.video), videoExts)) {
    console.log(`Removed invalid video from archive.json for scene ${scene.index || "?"}: ${scene.video}`);
    delete scene.video;
    delete scene.videoMuted;
  }
}

if (data.sfx && typeof data.sfx === "object") {
  for (const key of Object.keys(data.sfx)) {
    const value = String(data.sfx[key] || "");
    if (value && !validLocalAsset(value, audioExts)) {
      console.log(`Removed invalid sfx from archive.json: ${key}`);
      data.sfx[key] = "";
    }
  }
}

writeFileSync(archivePath, `${JSON.stringify(data, null, 2)}\n`);
