import {bytesToBase64} from './base64';

export type SignaturePoint = {x: number; y: number} | null;

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (crcTable == null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const body = new Uint8Array(4 + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32be(data.length), 0);
  out.set(body, 4);
  out.set(u32be(crc32(body)), 4 + body.length);
  return out;
}

/** zlib stream using stored (uncompressed) deflate blocks - valid PNG without needing a compressor. */
function zlibStore(raw: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const blocks = Math.max(1, Math.ceil(raw.length / maxBlock));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let i = 0; i < blocks; i++) {
    const start = i * maxBlock;
    const len = Math.min(maxBlock, raw.length - start);
    const isLast = i === blocks - 1;
    out[o++] = isLast ? 1 : 0;
    out[o++] = len & 0xff;
    out[o++] = (len >>> 8) & 0xff;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  out.set(u32be(adler32(raw)), o);
  return out;
}

/**
 * Rasterises the signature strokes (black, 3px wide, round caps/joins) on a white background and
 * returns a base64 PNG. Mirrors the Flutter canvas export (`PictureRecorder` + `toImage`).
 */
export function renderSignaturePngBase64(
  points: SignaturePoint[],
  widthIn: number,
  heightIn: number,
  strokeWidth = 3,
): string {
  const width = Math.ceil(widthIn);
  const height = Math.ceil(heightIn);
  // Single-channel intensity buffer (255 = white).
  const gray = new Uint8Array(width * height).fill(255);
  const r = strokeWidth / 2;

  const drawSegment = (x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - r - 1));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(x1, x2) + r + 1));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - r - 1));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(y1, y2) + r + 1));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        let t = lenSq === 0 ? 0 : ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const nx = x1 + t * dx;
        const ny = y1 + t * dy;
        const d = Math.sqrt((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny));
        const coverage = Math.max(0, Math.min(1, r + 0.5 - d));
        if (coverage > 0) {
          const v = Math.round(255 * (1 - coverage));
          const idx = py * width + px;
          if (v < gray[idx]) gray[idx] = v;
        }
      }
    }
  };

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (p1 != null && p2 != null) {
      drawSegment(p1.x, p1.y, p2.x, p2.y);
    }
  }

  const rowLen = 1 + width * 3;
  const raw = new Uint8Array(rowLen * height);
  for (let y = 0; y < height; y++) {
    const base = y * rowLen;
    raw[base] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const v = gray[y * width + x];
      const o = base + 1 + x * 3;
      raw[o] = v;
      raw[o + 1] = v;
      raw[o + 2] = v;
    }
  }

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array([...u32be(width), ...u32be(height), 8, 2, 0, 0, 0]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', zlibStore(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return bytesToBase64(png);
}
