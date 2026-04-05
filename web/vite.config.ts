import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    // Avoid clashing with public/Assets/ on case-insensitive filesystems (macOS).
    assetsDir: "_bundle",
  },
});
