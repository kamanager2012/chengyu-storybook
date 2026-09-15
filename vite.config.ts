import { copyFileSync, existsSync } from "node:fs";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { buildNarrationRuntimeAvailability } from "./scripts/narration-runtime-availability.mjs";
import { buildRuntimeStoryEditions, buildRuntimeStoryIndex } from "./scripts/runtime-story-index.mjs";

function spaFallback404() {
  return {
    name: "spa-fallback-404",
    closeBundle() {
      if (existsSync("dist/index.html")) copyFileSync("dist/index.html", "dist/404.html");
    },
  };
}

const pagesBase = process.env.GITHUB_PAGES === "1" ? "/juniper-branch-civic-royal/" : "/";
const storyIndex = buildRuntimeStoryIndex({ base: pagesBase });
const storyEditions = buildRuntimeStoryEditions();
const narrationAvailability = buildNarrationRuntimeAvailability();

/**
 * Static storybook runtime. Route generation happens at build/dev time; the
 * deployed application is plain static HTML/CSS/JS plus story assets.
 */
export default defineConfig({
  base: pagesBase,
  define: {
    __STORY_INDEX__: JSON.stringify(storyIndex),
    __STORY_EDITIONS__: JSON.stringify(storyEditions),
    __NARRATION_AVAILABILITY__: JSON.stringify(narrationAvailability),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
    spaFallback404(),
  ],
});
