import {execFileSync} from "node:child_process";
import {readdirSync, statSync} from "node:fs";
import {basename, extname, join} from "node:path";

const dir = process.argv[2] || "incoming";
const requestedWorkers = Math.max(1, Number.parseInt(process.argv[3] || "4", 10) || 4);

const safeStem = (name) =>
  (basename(name, extname(name))
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90)
    .replace(/[._-]+$/g, "") || "video");

const readArchive = (zipPath) => {
  const raw = execFileSync("unzip", ["-p", zipPath, "archive.json"], {encoding: "utf8"});
  return JSON.parse(raw);
};

let files = [];
try {
  files = readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === ".zip")
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort((a, b) => a.localeCompare(b));
} catch {
  files = [];
}

if (files.length === 0) {
  throw new Error(`No zip files found in ${dir}`);
}

const seen = new Map();
const videos = [];
const chunks = [];

for (const zipName of files) {
  const base = safeStem(zipName);
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  const stem = count === 0 ? base : `${base}_${count + 1}`;
  const zipPath = join(dir, zipName);
  const archive = readArchive(zipPath);
  const fps = Number(archive.fps || 30);
  const duration = Number(archive.duration || 1);
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const chunkCount = Math.min(requestedWorkers, totalFrames);

  videos.push({
    zip_name: zipName,
    stem,
    chunk_count: chunkCount,
  });

  for (let i = 0; i < chunkCount; i += 1) {
    const start = Math.floor((i * totalFrames) / chunkCount);
    const end = Math.max(start, Math.floor(((i + 1) * totalFrames) / chunkCount) - 1);
    const chunkId = String(i + 1).padStart(3, "0");
    chunks.push({
      zip_name: zipName,
      stem,
      chunk_id: chunkId,
      frames: `${start}-${end}`,
    });
  }
}

console.log(`chunks=${JSON.stringify({include: chunks})}`);
console.log(`videos=${JSON.stringify({include: videos})}`);
