import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

function sourceFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|js|jsx|css|json)$/.test(name)) files.push(path);
  }
  return files;
}

test("runtime is a static Vite + TanStack Router SPA", () => {
  const pkg = JSON.parse(read("package.json"));
  const vite = read("vite.config.ts");
  const main = read("src/main.tsx");

  assert.equal(pkg.dependencies?.["@tanstack/react-start"], undefined);
  assert.equal(pkg.devDependencies?.nitro, undefined);
  assert.equal(vite.includes("tanstackStart"), false);
  assert.equal(vite.includes("nitro("), false);
  assert.equal(vite.includes("grokPwaPlugin"), false);
  assert.match(vite, /tanstackRouter\s*\(/);
  assert.match(main, /RouterProvider/);
  assert.match(main, /createRoot/);
  assert.equal(existsSync(join(root, "index.html")), true);
  assert.equal(existsSync(join(root, "server")), true);
});

test("browser runtime remains model-free and offline-first", () => {
  const pkg = JSON.parse(read("package.json"));
  const productionDependencies = Object.keys(pkg.dependencies ?? {});
  const forbiddenDependencyPatterns = [
    /^openai$/i,
    /anthropic/i,
    /xai/i,
    /kokoro/i,
    /transformers/i,
    /onnxruntime/i,
    /tensorflow/i,
    /torch/i,
    /huggingface/i,
  ];
  for (const dependency of productionDependencies) {
    assert.equal(
      forbiddenDependencyPatterns.some((pattern) => pattern.test(dependency)),
      false,
      `browser production dependency must not include model/runtime package: ${dependency}`,
    );
  }

  const forbiddenRuntimeTokens = [
    "api.openai.com",
    "api.anthropic.com",
    "api.x.ai",
    "huggingface.co",
    "Kokoro",
    "KPipeline",
    "transformers.js",
    "onnxruntime",
  ];
  for (const absolutePath of sourceFiles(join(root, "src"))) {
    const content = readFileSync(absolutePath, "utf8");
    const path = relative(root, absolutePath).replaceAll("\\", "/");
    for (const token of forbiddenRuntimeTokens) {
      assert.equal(content.includes(token), false, `${path} must not depend on model/remote inference token: ${token}`);
    }
  }

  assert.equal(existsSync(join(root, "src", "server")), false);
  assert.equal(existsSync(join(root, "src", "api")), false);
  assert.equal(existsSync(join(root, "public", "models")), false);
});

test("PWA metadata and offline shell are static and product-owned", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const html = read("index.html");
  const main = read("src/main.tsx");
  const serviceWorker = read("public/sw.js");
  const icons = new Map(manifest.icons.map((icon) => [icon.src, icon]));

  assert.equal(manifest.name, "成语故事");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(icons.get("icon-192.png"), { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" });
  assert.deepEqual(icons.get("icon-512.png"), { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" });
  assert.deepEqual(icons.get("icon-maskable-512.png"), {
    src: "icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  });
  assert.equal(icons.size, 3);
  assert.match(html, /href="%BASE_URL%manifest.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon-180.png"/);
  assert.match(main, /serviceWorker.register/);
  assert.match(serviceWorker, /chengyu-storybook-shell-v8/);
  for (const path of [
    "/apple-touch-icon-180.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png",
    "/ui/bookshelf-paper.svg",
    "/og.svg",
  ]) {
    assert.equal(existsSync(join(root, "public", path.slice(1))), true, `${path}: missing static PWA asset`);
    assert.ok(serviceWorker.includes(`"${path}"`), `${path}: missing from offline shell cache`);
  }
  assert.match(serviceWorker, /\/stories\//);
  assert.match(serviceWorker, /\/classic-stories\//);
  assert.match(serviceWorker, /\/child-stories\//);
  assert.doesNotMatch(serviceWorker, /draft-stories/);
  assert.match(serviceWorker, /SCOPE_PREFIX/);
  assert.match(serviceWorker, /request\.headers\.has\("range"\)/);
  assert.match(serviceWorker, /\/audio\//);
  assert.doesNotMatch(serviceWorker, /cache:\s*["']no-store["']/);
  assert.equal(existsSync(join(root, "public/sw.js")), true);
  assert.equal(existsSync(join(root, "public/robots.txt")), true);
  assert.equal(existsSync(join(root, "public/__grok")), false);
  assert.match(read("vite.config.ts"), /spa-fallback-404/);
  assert.match(read("src/routes/about.tsx"), /createFileRoute\("\/about"\)/);
  assert.match(read("src/routes/about.tsx"), /其余 65 本是后来的重绘/);
  assert.match(read("src/routes/privacy.tsx"), /createFileRoute\("\/privacy"\)/);
  assert.match(read("src/routes/about.tsx"), /作为独立一类纳入发行权清单/);
  assert.match(read("src/routes/privacy.tsx"), /作为独立一类纳入发行权清单/);
  assert.match(read("src/data/story-editions.ts"), /hasGrokChildOverlay/);
  assert.match(read("src/routes/unlock.tsx"), /data-pay-pending/);
  assert.match(read("src/lib/checkout.ts"), /isPayConfigured/);
});
