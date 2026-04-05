#!/usr/bin/env node
// Scan web/public/Assets/, regenerate results.json, and upload everything
// that has changed to R2.
//
// Usage:
//   npm run sync                 # regenerate + upload only changed asset files
//   npm run sync -- --bundle     # also rebuild + upload the JS/CSS bundle
//   npm run sync -- --all        # force re-upload everything (ignore hashes)
//   npm run sync -- --dry-run    # show what would change without uploading

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ASSETS_DIR,
  PUBLIC_DIR,
  RESULTS_PATH,
  walk,
  entryForAsset,
  r2Put,
  r2Delete,
  run,
  fileHash,
  EXT_MAP,
  isReserved,
} from "./lib.mjs";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const FORCE = args.has("--all");
const DO_BUNDLE = args.has("--bundle");

const CACHE_PATH = join(PUBLIC_DIR, "..", ".sync-cache.json");

console.log("Scanning", ASSETS_DIR);

// 0. One-time migration: if existing results.json has chromakey settings
//    for videos that don't yet have a .meta.json sidecar, create the sidecar
//    so the filesystem becomes the source of truth.
migrateChromaToSidecars(DRY);

// 1. Build results.json from whatever's in Assets/.
const entries = [];
const orphans = [];
for (const filePath of walk(ASSETS_DIR)) {
  if (filePath.endsWith(".meta.json")) continue;
  const relPath = relative(PUBLIC_DIR, filePath);
  if (isReserved(relPath)) continue;
  const ext = filePath.split(".").pop().toLowerCase();
  if (!EXT_MAP[ext]) {
    orphans.push(relPath);
    continue;
  }
  entries.push(entryForAsset(filePath));
}

entries.sort((a, b) => a.text.localeCompare(b.text));

const newJson = JSON.stringify(entries, null, 2) + "\n";
const prevJson = existsSync(RESULTS_PATH) ? readFileSync(RESULTS_PATH, "utf8") : "";
const resultsChanged = newJson !== prevJson;

if (!DRY && resultsChanged) writeFileSync(RESULTS_PATH, newJson);

console.log(`  ${entries.length} asset entries generated`);
if (orphans.length) {
  console.log(`  ${orphans.length} orphan files skipped (unsupported ext):`);
  orphans.forEach((o) => console.log(`    - ${o}`));
}
console.log(`  results.json: ${resultsChanged ? "UPDATED" : "unchanged"}`);

// 2. Optionally rebuild the JS/CSS bundle.
if (DO_BUNDLE) {
  console.log("\nBuilding bundle...");
  if (!DRY) run("npm run build");
}

// 3. Upload what changed.
//    We track file hashes in .sync-cache.json so unchanged files are skipped.
const cache = existsSync(CACHE_PATH) && !FORCE ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};
const nextCache = {};
const toUpload = [];

// Candidate files: public/results.json + all of public/Assets/ + (if --bundle) dist/
const candidates = [];
candidates.push(RESULTS_PATH);
for (const f of walk(ASSETS_DIR)) {
  if (f.endsWith(".meta.json")) continue;
  candidates.push(f);
}
if (DO_BUNDLE) {
  const distDir = join(PUBLIC_DIR, "..", "dist");
  if (existsSync(distDir)) {
    for (const f of walk(distDir)) {
      if (f.endsWith(".meta.json")) continue;
      candidates.push(f);
    }
  }
}

for (const filePath of candidates) {
  const hash = await fileHash(filePath);
  // Determine R2 key. results.json + Assets/* are keyed by their path under public/.
  // dist/* are keyed by their path under dist/.
  let key;
  if (filePath.startsWith(PUBLIC_DIR)) {
    key = relative(PUBLIC_DIR, filePath).replace(/\\/g, "/");
  } else {
    key = relative(join(PUBLIC_DIR, "..", "dist"), filePath).replace(/\\/g, "/");
  }
  nextCache[key] = hash;
  if (cache[key] !== hash) {
    toUpload.push({ key, filePath, size: statSync(filePath).size });
  }
}

// Files that were previously uploaded but no longer exist locally — prune from R2.
const toDelete = Object.keys(cache).filter((k) => !(k in nextCache));

console.log(`\n${toUpload.length} files to upload, ${toDelete.length} to delete${DRY ? " (dry run)" : ""}`);
for (const { key, size } of toUpload) console.log(`  + ${key} (${formatSize(size)})`);
for (const key of toDelete) console.log(`  - ${key}`);

if (!DRY) {
  for (let i = 0; i < toUpload.length; i++) {
    const { key, filePath } = toUpload[i];
    process.stdout.write(`  [${i + 1}/${toUpload.length}] upload ${key}... `);
    r2Put(key, filePath);
    process.stdout.write("ok\n");
  }
  for (let i = 0; i < toDelete.length; i++) {
    const key = toDelete[i];
    process.stdout.write(`  [${i + 1}/${toDelete.length}] delete ${key}... `);
    r2Delete(key);
    process.stdout.write("ok\n");
  }
  writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 2));
  console.log("\nDone. https://wheel.pantainos.workers.dev/");
}

/**
 * Walk existing results.json; for every video with a non-transparent chromacolor,
 * write a .meta.json sidecar next to the file if one doesn't already exist.
 */
function migrateChromaToSidecars(dry) {
  if (!existsSync(RESULTS_PATH)) return;
  const existing = JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
  let migrated = 0;
  for (const r of existing) {
    if (r.filetype !== "vid") continue;
    if (!r.chromacolor) continue;
    // Skip the NOGREENSCREEN sentinel — no real chroma to preserve.
    if (/^\(1\.0,\s*1\.0,\s*1\.0,\s*0\.0\)$/.test(r.chromacolor)) continue;

    const relPath = r.filepath.replace(/^res:\/\//, "");
    const videoPath = join(PUBLIC_DIR, relPath);
    const metaPath = videoPath + ".meta.json";
    if (existsSync(metaPath)) continue;
    if (!existsSync(videoPath)) continue; // file gone, skip

    const meta = {
      text: r.text,
      chroma: godotColorToHex(r.chromacolor),
      pickup: r.pickuprange ?? 0.1,
      fade: r.fadeamount ?? 0.1,
    };
    if (!dry) writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    console.log(`  ${dry ? "[dry] " : ""}migrate ${relPath} -> ${relPath}.meta.json`);
    migrated++;
  }
  if (migrated > 0) {
    console.log(`  (${migrated} chromakey configs ${dry ? "would be" : ""} migrated to sidecars)\n`);
  }
}

function godotColorToHex(s) {
  const m = s.match(/\(([^)]+)\)/);
  if (!m) return "#000000";
  const [r, g, b] = m[1].split(",").map((v) => parseFloat(v.trim()));
  const h = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
