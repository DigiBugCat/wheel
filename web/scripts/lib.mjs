// Shared helpers for the wheel asset scripts.
// The filesystem under web/public/Assets/ is the source of truth; results.json is generated.

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, extname, basename, relative, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";

export const PUBLIC_DIR = resolve("public");
export const RESULTS_PATH = join(PUBLIC_DIR, "results.json");
export const ASSETS_DIR = join(PUBLIC_DIR, "Assets");
export const R2_BUCKET = "wheel-assets";
export const WORKER_DIR = resolve("..", "worker");

// Files under Assets/ that the runtime uses internally — exclude from results.
export const RESERVED_PATHS = new Set([
  "Assets/Sprites/wheel.png",
  "Assets/Sprites/musicnotes.png",
]);

// Folders under Assets/ that don't contain wheel results (SFX, shaders, etc.).
export const RESERVED_DIRS = [
  "Assets/Audio/SFX",
  "Assets/Shader",
];

/** True if a file path (relative to public/) should be excluded from results.json. */
export function isReserved(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  if (RESERVED_PATHS.has(norm)) return true;
  for (const dir of RESERVED_DIRS) {
    if (norm === dir || norm.startsWith(dir + "/")) return true;
  }
  return false;
}

// Extension -> (type, target subdir). Matches SpinResultGenerator's constants.
export const EXT_MAP = {
  png: { type: "img", dir: "Assets/Sprites" },
  jpg: { type: "img", dir: "Assets/Sprites" },
  jpeg: { type: "img", dir: "Assets/Sprites" },
  webp: { type: "img", dir: "Assets/Sprites" },
  gif: { type: "img", dir: "Assets/Sprites" },
  svg: { type: "img", dir: "Assets/Sprites" },
  webm: { type: "vid", dir: "Assets/Videos" },
  mp4: { type: "vid", dir: "Assets/Videos" },
  ogv: { type: "vid", dir: "Assets/Videos" },
  ogg: { type: "aud", dir: "Assets/Audio/Tracks" },
  mp3: { type: "aud", dir: "Assets/Audio/Tracks" },
  wav: { type: "aud", dir: "Assets/Audio/Tracks" },
  m4a: { type: "aud", dir: "Assets/Audio/Tracks" },
};

/** Recursively walk a directory, yielding absolute file paths. */
export function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Humanise a filename (without extension) into a display label. */
export function prettyLabel(filenameNoExt) {
  // "SeaOtter" -> "Sea Otter", "fried_chicken" -> "Fried Chicken", "hundred-line" -> "Hundred Line"
  return filenameNoExt
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Convert a #RRGGBB hex (or shorthand #RGB) into Godot's color vector string,
 * matching SpinResultGenerator.parse_color_vector_string().
 */
export function hexToGodotColor(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return `(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}, 1.0)`;
}

/**
 * Build a result entry from a file in Assets/.
 * Reads optional sidecar `<file>.meta.json`:
 *   { "text": "Custom Label", "chroma": "#00ff00", "pickup": 0.1, "fade": 0.1 }
 */
export function entryForAsset(absFilePath) {
  const rel = relative(PUBLIC_DIR, absFilePath); // "Assets/Sprites/foo.png"
  const ext = extname(absFilePath).toLowerCase().slice(1);
  const info = EXT_MAP[ext];
  if (!info) return null; // unsupported extension; skip

  const baseName = basename(absFilePath, extname(absFilePath));
  const metaPath = absFilePath + ".meta.json";
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};

  const entry = {
    filetype: info.type,
    filepath: "res://" + rel.replace(/\\/g, "/"),
    fileext: ext,
    text: meta.text ?? prettyLabel(baseName),
  };

  if (info.type === "vid") {
    // Videos always carry chroma fields (matches VideoLoader.gd). Disabled = NOGREENSCREEN.
    const chromaHex = meta.chroma ?? meta.chromacolor;
    if (chromaHex) {
      entry.chromacolor = hexToGodotColor(chromaHex);
      entry.pickuprange = meta.pickup ?? meta.pickuprange ?? 0.1;
      entry.fadeamount = meta.fade ?? meta.fadeamount ?? 0.1;
    } else {
      // NOGREENSCREEN = Color.TRANSPARENT = (1,1,1,0) in the existing data
      entry.chromacolor = "(1.0, 1.0, 1.0, 0.0)";
      entry.pickuprange = meta.pickup ?? meta.pickuprange ?? 0.1;
      entry.fadeamount = meta.fade ?? meta.fadeamount ?? 0.1;
    }
  }

  return entry;
}

/** Upload a single local file to R2 at the given key. Throws on failure. */
export function r2Put(key, filePath) {
  const res = spawnSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", filePath, "--remote"],
    { cwd: WORKER_DIR, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`r2 put failed for ${key}:\n${res.stderr || res.stdout}`);
  }
}

/** Delete a single object from R2. */
export function r2Delete(key) {
  const res = spawnSync(
    "npx",
    ["wrangler", "r2", "object", "delete", `${R2_BUCKET}/${key}`, "--remote"],
    { cwd: WORKER_DIR, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`r2 delete failed for ${key}:\n${res.stderr || res.stdout}`);
  }
}

export function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", ...opts });
}

/** SHA-256 of a local file as a hex string, for change detection. */
export async function fileHash(path) {
  const { createHash } = await import("node:crypto");
  const { createReadStream } = await import("node:fs");
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(path);
    s.on("data", (c) => h.update(c));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}
