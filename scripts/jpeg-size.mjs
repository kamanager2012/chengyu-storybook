import { readFileSync } from "node:fs";

export function readJpegSizeFromBuffer(buffer) {
  if (!buffer || buffer.length < 10 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        width: buffer.readUInt16BE(i + 7),
        height: buffer.readUInt16BE(i + 5),
      };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 3 >= buffer.length) break;
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
}

export function readJpegSize(path) {
  return readJpegSizeFromBuffer(readFileSync(path));
}

export function jpegSizeLabel(size) {
  return size ? `${size.width}x${size.height}` : "unknown";
}
