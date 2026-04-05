// Main state machine, port of EffectDecider.gd:
//   spin wheel -> hide wheel -> show rainbow-wave text (4s) + play "get" sfx ->
//   after 2s delay -> play result (video/audio/image) -> teardown.

import { loadResults, resolveAssetPath, parseColorString, hasChromaKey, type SpinResult } from "./results";
import { spinWheel } from "./wheel";
import { ChromaKeyRenderer } from "./chromakey";
import { setRainbowWaveText } from "./label";

const TEXT_TIME_MS = 4000;
const DELAY_TIME_MS = 2000;
const SPRITE_DISPLAY_MS = 5000;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

const wheelEl = $<HTMLImageElement>("wheel");
const labelEl = $<HTMLDivElement>("label");
const imageEl = $<HTMLImageElement>("image-result");
const audioPlaceholderEl = $<HTMLImageElement>("audio-placeholder");
const videoCanvasEl = $<HTMLCanvasElement>("video-canvas");
const videoEl = $<HTMLVideoElement>("video");
const audioEl = $<HTMLAudioElement>("audio");
const rollSfx = $<HTMLAudioElement>("sfx-roll");
const getSfx = $<HTMLAudioElement>("sfx-get");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function playResult(result: SpinResult): Promise<void> {
  const src = resolveAssetPath(result.filepath);
  switch (result.filetype) {
    case "vid":
      return playVideo(result, src);
    case "aud":
      return playAudio(src);
    case "img":
      return playImage(src);
    default:
      return;
  }
}

async function playVideo(result: SpinResult, src: string): Promise<void> {
  videoEl.src = src;
  videoEl.loop = false;
  videoEl.muted = false;
  videoCanvasEl.hidden = false;

  const chromaActive = hasChromaKey(result);
  const chroma = chromaActive ? parseColorString(result.chromacolor) : { r: 0, g: 0, b: 0, a: 0 };
  const renderer = new ChromaKeyRenderer(videoCanvasEl, videoEl);
  renderer.start({
    chroma,
    pickup: result.pickuprange ?? 0.1,
    fade: result.fadeamount ?? 0.1,
  });

  await new Promise<void>((resolve) => {
    const done = () => {
      videoEl.removeEventListener("ended", done);
      videoEl.removeEventListener("error", done);
      resolve();
    };
    videoEl.addEventListener("ended", done);
    videoEl.addEventListener("error", done);
    void videoEl.play().catch(done);
  });

  renderer.stop();
  videoCanvasEl.hidden = true;
  videoEl.removeAttribute("src");
  videoEl.load();
}

async function playAudio(src: string): Promise<void> {
  audioPlaceholderEl.hidden = false;
  audioEl.src = src;
  await new Promise<void>((resolve) => {
    const done = () => {
      audioEl.removeEventListener("ended", done);
      audioEl.removeEventListener("error", done);
      resolve();
    };
    audioEl.addEventListener("ended", done);
    audioEl.addEventListener("error", done);
    void audioEl.play().catch(done);
  });
  audioPlaceholderEl.hidden = true;
}

async function playImage(src: string): Promise<void> {
  imageEl.src = src;
  imageEl.hidden = false;
  await sleep(SPRITE_DISPLAY_MS);
  imageEl.hidden = true;
  imageEl.removeAttribute("src");
}

async function run() {
  const results = await loadResults();
  if (results.length === 0) {
    console.warn("No results in results.json");
    return;
  }
  const chosen = pickRandom(results);

  // 1. Spin the wheel.
  const spin = spinWheel(wheelEl, rollSfx);
  await spin.done;
  wheelEl.hidden = true;

  // 2. Show rainbow-wave text + play "get" sfx. Meanwhile wait 2s, then play result.
  setRainbowWaveText(labelEl, chosen.text);
  labelEl.hidden = false;
  getSfx.currentTime = 0;
  void getSfx.play().catch(() => {});

  // Hide text after TEXT_TIME_MS (same as Godot: text shows for 4s independently of result).
  const hideTextTimer = window.setTimeout(() => {
    labelEl.hidden = true;
  }, TEXT_TIME_MS);

  await sleep(DELAY_TIME_MS);
  await playResult(chosen);

  clearTimeout(hideTextTimer);
  labelEl.hidden = true;
}

// Autoplay policies: browsers block audio until a user gesture. To keep the
// OBS-overlay use case working, we attempt immediately and also unlock on first
// click/keypress as a fallback.
function unlockOnGesture() {
  const unlock = () => {
    rollSfx.play().then(() => rollSfx.pause()).catch(() => {});
    getSfx.play().then(() => getSfx.pause()).catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

unlockOnGesture();
run().catch((err) => console.error(err));
