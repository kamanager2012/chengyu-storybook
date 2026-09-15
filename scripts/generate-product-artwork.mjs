import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const artwork = {
  "public/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="成语故事">
  <rect width="100" height="100" rx="22" fill="#F4EAD8"/>
  <rect x="14" y="18" width="72" height="64" rx="8" fill="#B33828"/>
  <rect x="20" y="24" width="60" height="52" rx="5" fill="#FFF8EC"/>
  <path d="M50 28v44" stroke="#D9C4A4" stroke-width="3"/>
  <circle cx="38" cy="48" r="7" fill="#3F7A5A"/>
  <circle cx="62" cy="52" r="5" fill="#C7922B"/>
  <rect x="28" y="66" width="18" height="4" rx="2" fill="#B33828"/>
</svg>
`,
  "public/icon-180.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="成语故事">
  <rect width="180" height="180" rx="40" fill="#F4EAD8"/>
  <rect x="25" y="32" width="130" height="116" rx="15" fill="#B33828"/>
  <rect x="36" y="43" width="108" height="94" rx="10" fill="#FFF8EC"/>
  <path d="M90 50v80" stroke="#D9C4A4" stroke-width="5"/>
  <circle cx="68" cy="86" r="13" fill="#3F7A5A"/>
  <circle cx="112" cy="94" r="10" fill="#C7922B"/>
  <rect x="50" y="118" width="33" height="7" rx="3.5" fill="#B33828"/>
</svg>
`,
  "public/og.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="成语故事">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF8EC"/>
      <stop offset="1" stop-color="#E7D5B5"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#F4EAD8"/>
  <circle cx="1040" cy="95" r="170" fill="#C7922B" opacity=".12"/>
  <circle cx="110" cy="560" r="210" fill="#3F7A5A" opacity=".10"/>
  <rect x="95" y="95" width="1010" height="440" rx="42" fill="url(#paper)" stroke="#D9C4A4" stroke-width="4"/>
  <rect x="150" y="155" width="250" height="320" rx="26" fill="#B33828"/>
  <rect x="178" y="185" width="194" height="260" rx="18" fill="#FFF8EC"/>
  <path d="M275 200v230" stroke="#D9C4A4" stroke-width="8"/>
  <circle cx="235" cy="285" r="24" fill="#3F7A5A"/>
  <circle cx="320" cy="320" r="18" fill="#C7922B"/>
  <text x="475" y="285" fill="#2C2118" font-size="108" font-weight="700" font-family="serif">成语故事</text>
  <text x="480" y="370" fill="#5C4A3A" font-size="42" font-family="sans-serif">给小朋友听的中国成语有声绘本</text>
  <rect x="480" y="410" width="300" height="8" rx="4" fill="#B33828"/>
</svg>
`,
  "public/ui/bookshelf-paper.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="纸张纹理背景">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF8EC"/>
      <stop offset="1" stop-color="#F4EAD8"/>
    </linearGradient>
    <pattern id="fiber" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M2 18C16 11 27 25 42 17S62 12 70 20" fill="none" stroke="#D9C4A4" stroke-width="1.2" opacity=".28"/>
      <path d="M8 52c13-8 24 6 39-2s18-5 23-1" fill="none" stroke="#C9B08A" stroke-width="1" opacity=".18"/>
      <circle cx="18" cy="35" r="1.2" fill="#B99A6D" opacity=".20"/>
      <circle cx="55" cy="61" r="1" fill="#B99A6D" opacity=".16"/>
    </pattern>
  </defs>
  <rect width="1200" height="800" fill="url(#base)"/>
  <rect width="1200" height="800" fill="url(#fiber)"/>
  <path d="M0 130C210 95 350 160 560 122S930 88 1200 138" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".18"/>
  <path d="M0 650C240 610 420 690 670 642s350-18 530 2" fill="none" stroke="#C9B08A" stroke-width="2" opacity=".10"/>
</svg>
`,
};

const COLORS = {
  paper: [244, 234, 216, 255],
  cinnabar: [179, 56, 40, 255],
  panel: [255, 248, 236, 255],
  rule: [217, 196, 164, 255],
  bamboo: [63, 122, 90, 255],
  gold: [199, 146, 43, 255],
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function raster(width, height, background) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = background[0];
    pixels[offset + 1] = background[1];
    pixels[offset + 2] = background[2];
    pixels[offset + 3] = background[3];
  }
  return pixels;
}

function setPixel(pixels, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y * width * 4 >= pixels.length) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fillRect(pixels, width, height, x, y, w, h, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w));
  const y1 = Math.min(height, Math.ceil(y + h));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) setPixel(pixels, width, px, py, color);
  }
}

function fillCircle(pixels, width, height, cx, cy, radius, color) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  const rr = radius * radius;
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy <= rr) setPixel(pixels, width, px, py, color);
    }
  }
}

function fillRoundedRect(pixels, width, height, x, y, w, h, radius, color) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  fillRect(pixels, width, height, x + r, y, w - 2 * r, h, color);
  fillRect(pixels, width, height, x, y + r, w, h - 2 * r, color);
  fillCircle(pixels, width, height, x + r, y + r, r, color);
  fillCircle(pixels, width, height, x + w - r, y + r, r, color);
  fillCircle(pixels, width, height, x + r, y + h - r, r, color);
  fillCircle(pixels, width, height, x + w - r, y + h - r, r, color);
}

function drawBookIcon(size, { maskable = false } = {}) {
  const pixels = raster(size, size, COLORS.paper);
  const baseScale = size / 180;
  const contentScale = maskable ? 0.74 : 1;
  const scale = baseScale * contentScale;
  const center = size / 2;
  const originX = center - 90 * scale;
  const originY = center - 90 * scale;
  const X = (value) => originX + value * scale;
  const Y = (value) => originY + value * scale;
  const S = (value) => value * scale;

  fillRoundedRect(pixels, size, size, X(25), Y(32), S(130), S(116), S(15), COLORS.cinnabar);
  fillRoundedRect(pixels, size, size, X(36), Y(43), S(108), S(94), S(10), COLORS.panel);
  fillRect(pixels, size, size, X(87.5), Y(50), S(5), S(80), COLORS.rule);
  fillCircle(pixels, size, size, X(68), Y(86), S(13), COLORS.bamboo);
  fillCircle(pixels, size, size, X(112), Y(94), S(10), COLORS.gold);
  fillRoundedRect(pixels, size, size, X(50), Y(118), S(33), S(7), S(3.5), COLORS.cinnabar);
  return encodePng(size, size, pixels);
}

const binaryArtwork = {
  "public/apple-touch-icon-180.png": drawBookIcon(180),
  "public/icon-192.png": drawBookIcon(192),
  "public/icon-512.png": drawBookIcon(512),
  "public/icon-maskable-512.png": drawBookIcon(512, { maskable: true }),
};

export function generatedProductArtwork() {
  return [
    ...Object.entries(artwork).map(([path, content]) => ({ path, content: Buffer.from(content, "utf8"), sha256: sha256(content) })),
    ...Object.entries(binaryArtwork).map(([path, content]) => ({ path, content, sha256: sha256(content) })),
  ];
}

export function writeProductArtwork() {
  for (const item of generatedProductArtwork()) {
    const absolute = join(repoRoot, item.path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, item.content);
  }
}

export function checkProductArtwork() {
  const problems = [];
  for (const item of generatedProductArtwork()) {
    const absolute = join(repoRoot, item.path);
    if (!existsSync(absolute)) {
      problems.push(`${item.path}: missing generated artwork`);
      continue;
    }
    const actual = readFileSync(absolute);
    if (!actual.equals(item.content)) problems.push(`${item.path}: committed bytes do not match deterministic generator`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  if (write) writeProductArtwork();
  const items = generatedProductArtwork().map(({ path, sha256 }) => ({ path, sha256 }));
  const problems = check ? checkProductArtwork() : [];
  console.log(JSON.stringify({ schemaVersion: 1, items, problems }, null, 2));
  if (check && problems.length > 0) process.exitCode = 1;
}
