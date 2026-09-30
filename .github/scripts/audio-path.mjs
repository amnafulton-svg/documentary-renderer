import {readFileSync} from "node:fs";

const data = JSON.parse(readFileSync("public/archive.json", "utf8"));
process.stdout.write(String(data.audio || ""));
