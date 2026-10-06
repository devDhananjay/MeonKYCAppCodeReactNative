const CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes standard (padded) base64 into bytes. Throws on invalid input. */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[\r\n\s]/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  const outLen = (clean.length / 4) * 3 - padding;
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const idx: number[] = [];
    for (let j = 0; j < 4; j++) {
      const ch = clean[i + j];
      if (ch === '=') {
        idx.push(0);
      } else {
        const v = CHARS.indexOf(ch);
        if (v < 0) throw new Error('Invalid base64 character');
        idx.push(v);
      }
    }
    const n = (idx[0] << 18) | (idx[1] << 12) | (idx[2] << 6) | idx[3];
    if (o < outLen) out[o++] = (n >> 16) & 0xff;
    if (o < outLen) out[o++] = (n >> 8) & 0xff;
    if (o < outLen) out[o++] = n & 0xff;
  }
  return out;
}

/** Decodes bytes as UTF-8 (throws on malformed input, like dart's utf8.decode). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) {
      cp = b;
    } else if (b >= 0xc2 && b < 0xe0) {
      if (i >= bytes.length) throw new Error('Invalid UTF-8');
      cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (b >= 0xe0 && b < 0xf0) {
      if (i + 1 >= bytes.length) throw new Error('Invalid UTF-8');
      cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else if (b >= 0xf0 && b < 0xf5) {
      if (i + 2 >= bytes.length) throw new Error('Invalid UTF-8');
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    } else {
      throw new Error('Invalid UTF-8');
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** Bytes -> standard base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += CHARS[(n >> 18) & 63];
    out += CHARS[(n >> 12) & 63];
    out += i + 1 < bytes.length ? CHARS[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? CHARS[n & 63] : '=';
  }
  return out;
}
