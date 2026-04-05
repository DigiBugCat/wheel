#!/usr/bin/env node
// Print the current state of Assets/ and any drift from results.json.

import { readFileSync, existsSync } from "node:fs";
import { relative } from "node:path";
import { ASSETS_DIR, PUBLIC_DIR, RESULTS_PATH, walk, EXT_MAP, isReserved } from "./lib.mjs";

const results = existsSync(RESULTS_PATH) ? JSON.parse(readFileSync(RESULTS_PATH, "utf8")) : [];

const byType = { img: [], vid: [], aud: [] };
const orphans = [];
for (const f of walk(ASSETS_DIR)) {
  if (f.endsWith(".meta.json")) continue;
  const rel = relative(PUBLIC_DIR, f);
  if (isReserved(rel)) continue;
  const ext = f.split(".").pop().toLowerCase();
  const info = EXT_MAP[ext];
  if (!info) {
    orphans.push(rel);
    continue;
  }
  byType[info.type].push(rel);
}

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);

console.log(`\nAssets on disk (${byType.img.length + byType.vid.length + byType.aud.length} total):\n`);
const order = [
  ["Images", byType.img],
  ["Videos", byType.vid],
  ["Audio", byType.aud],
];
for (const [label, list] of order) {
  console.log(`  ${label} (${list.length})`);
  list.sort().forEach((p) => console.log(`    ${p}`));
  console.log();
}

if (orphans.length) {
  console.log(`  Unsupported (will be ignored):`);
  orphans.forEach((o) => console.log(`    ${o}`));
  console.log();
}

console.log(`results.json: ${results.length} entries\n`);
results.forEach((r, i) => {
  const tag = pad(`[${r.filetype}]`, 6);
  const chroma = r.chromacolor && !r.chromacolor.startsWith("(1.0, 1.0, 1.0, 0.0)") ? " (chromakey)" : "";
  console.log(`  ${pad(String(i + 1), 3)} ${tag} ${r.text}${chroma}`);
});
console.log();

// drift check
const onDisk = new Set(
  [...byType.img, ...byType.vid, ...byType.aud].map((p) => "res://" + p.replace(/\\/g, "/")),
);
const inJson = new Set(results.map((r) => r.filepath));
const missing = [...onDisk].filter((p) => !inJson.has(p));
const stale = [...inJson].filter((p) => !onDisk.has(p));
if (missing.length || stale.length) {
  console.log("Drift detected (run `npm run sync` to reconcile):");
  missing.forEach((p) => console.log(`  + on disk but not in results.json: ${p}`));
  stale.forEach((p) => console.log(`  - in results.json but missing on disk: ${p}`));
  console.log();
}
