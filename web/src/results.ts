// Result data model, matching the shape written by the Godot editor.

export type FileType = "vid" | "aud" | "img" | "text";

export interface SpinResult {
  filetype: FileType;
  filepath: string; // "res://Assets/..." in the Godot JSON
  fileext: string;
  text: string;
  // Video-only (greenscreen):
  chromacolor?: string; // e.g. "(0.0863, 0.9961, 0.0588, 1.0)"
  pickuprange?: number;
  fadeamount?: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

/**
 * Parse Godot's Color string "(r, g, b, a)" into floats.
 * Matches SpinResultGenerator.parse_color_vector_string().
 */
export function parseColorString(s: string | undefined): RGBA {
  if (!s) return TRANSPARENT;
  const stripped = s.trim().replace(/^\(/, "").replace(/\)$/, "").replace(/\s+/g, "");
  const parts = stripped.split(",").map(parseFloat);
  if (parts.length < 4 || parts.some(isNaN)) return TRANSPARENT;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] };
}

/** A result has an active chromakey only if the color's alpha is effectively 1.0. */
export function hasChromaKey(result: SpinResult): boolean {
  if (!result.chromacolor) return false;
  const c = parseColorString(result.chromacolor);
  return c.a > 0.99;
}

/** Translate Godot's "res://Assets/..." path into a web URL served from /public. */
export function resolveAssetPath(godotPath: string): string {
  // "res://Assets/Videos/Fur.ogv" -> "/Assets/Videos/Fur.ogv"
  return "/" + godotPath.replace(/^res:\/\//, "");
}

export async function loadResults(url = "/results.json"): Promise<SpinResult[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as SpinResult[];
}
