// Readers for the Remastered SD interface art (DDS images, .dds.grp frame sets), the classic
// bitmap fonts (.fnt) and PCX, plus a small PNG writer.
import zlib from 'node:zlib';

// ---- DDS: uncompressed 32-bit, DXT1 (BC1) and DXT5 (BC3) ----

function rgb565(v) {
  return [((v >> 11) & 31) * 255 / 31 | 0, ((v >> 5) & 63) * 255 / 63 | 0, (v & 31) * 255 / 31 | 0];
}

function decodeBlocks(buf, pos, w, h, dxt5) {
  const out = new Uint8Array(w * h * 4);
  for (let by = 0; by < h; by += 4) {
    for (let bx = 0; bx < w; bx += 4) {
      let alpha = null;
      if (dxt5) {
        const a0 = buf[pos], a1 = buf[pos + 1];
        const a = [a0, a1];
        if (a0 > a1) for (let i = 1; i < 7; i++) a.push(((7 - i) * a0 + i * a1) / 7 | 0);
        else { for (let i = 1; i < 5; i++) a.push(((5 - i) * a0 + i * a1) / 5 | 0); a.push(0, 255); }
        let bits = 0n;
        for (let i = 0; i < 6; i++) bits |= BigInt(buf[pos + 2 + i]) << BigInt(8 * i);
        alpha = Array.from({ length: 16 }, (_, i) => a[Number((bits >> BigInt(3 * i)) & 7n)]);
        pos += 8;
      }
      const c0 = buf.readUInt16LE(pos), c1 = buf.readUInt16LE(pos + 2);
      const p0 = rgb565(c0), p1 = rgb565(c1);
      const colors = [[...p0, 255], [...p1, 255]];
      if (c0 > c1 || dxt5) {
        colors.push([0, 1, 2].map((k) => (2 * p0[k] + p1[k]) / 3 | 0).concat(255));
        colors.push([0, 1, 2].map((k) => (p0[k] + 2 * p1[k]) / 3 | 0).concat(255));
      } else {
        colors.push([0, 1, 2].map((k) => (p0[k] + p1[k]) / 2 | 0).concat(255));
        colors.push([0, 0, 0, 0]);
      }
      const idx = buf.readUInt32LE(pos + 4);
      pos += 8;
      for (let i = 0; i < 16; i++) {
        const x = bx + (i & 3), y = by + (i >> 2);
        if (x >= w || y >= h) continue;
        const c = colors[(idx >> (2 * i)) & 3];
        const o = (y * w + x) * 4;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
        out[o + 3] = alpha ? alpha[i] : c[3];
      }
    }
  }
  return out;
}

// Returns { width, height, rgba }.
export function readDds(buf) {
  if (buf.toString('latin1', 0, 4) !== 'DDS ') throw new Error('not DDS');
  const height = buf.readUInt32LE(12), width = buf.readUInt32LE(16);
  const pfFlags = buf.readUInt32LE(80);
  const fourcc = buf.toString('latin1', 84, 88);
  const data = 128;
  if (pfFlags & 4) {
    if (fourcc !== 'DXT1' && fourcc !== 'DXT5') throw new Error(`DDS ${fourcc} not supported`);
    return { width, height, rgba: decodeBlocks(buf, data, width, height, fourcc === 'DXT5') };
  }
  const bits = buf.readUInt32LE(88);
  const masks = [92, 96, 100, 104].map((o) => buf.readUInt32LE(o));
  if (bits !== 32) throw new Error(`DDS ${bits}-bit not supported`);
  const shift = (m) => (m ? Math.log2(m & -m) : 0);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = buf.readUInt32LE(data + i * 4);
    masks.forEach((m, k) => { rgba[i * 4 + k] = m ? (v & m) >>> shift(m) : 255; });
  }
  return { width, height, rgba };
}

// .dds.grp: u32 file size, u16 frame count, u16 version, then per frame
// u32 (unused), u16 width, u16 height, u32 size, and a DDS image of that size.
export function readDdsGrp(buf) {
  const count = buf.readUInt16LE(4);
  const frames = [];
  let pos = 8;
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(pos + 8);
    frames.push(readDds(buf.subarray(pos + 12, pos + 12 + size)));
    pos += 12 + size;
  }
  return frames;
}

// Lays frames into a grid sheet. Returns { png, frames: [[x, y, w, h], ...], cell: [w, h] }.
// With `trim`, each frame's size leaves out fully transparent rows and columns at its right and
// bottom (DDS images are padded to multiples of 4), so tiled pieces join without gaps.
export function sheet(frames, columns = 16, trim = false) {
  const cw = Math.max(...frames.map((f) => f.width)), ch = Math.max(...frames.map((f) => f.height));
  const cols = Math.min(columns, frames.length), rows = Math.ceil(frames.length / cols);
  const W = cols * cw, H = rows * ch;
  const rgba = new Uint8Array(W * H * 4);
  const rects = frames.map((f, i) => {
    const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch;
    for (let y = 0; y < f.height; y++) rgba.set(f.rgba.subarray(y * f.width * 4, (y + 1) * f.width * 4), ((y0 + y) * W + x0) * 4);
    if (!trim) return [x0, y0, f.width, f.height];
    let w = 0, h = 0;
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) if (f.rgba[(y * f.width + x) * 4 + 3]) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
    return [x0, y0, w, h];
  });
  return { png: encodePng(W, H, rgba), frames: rects, cell: [cw, ch] };
}

// ---- classic bitmap font (.fnt) ----
// "FONT", first and last character, max width and height, then per character an offset to:
// width, height, x offset, y offset, and pixels as bytes (transparent run << 3 | colour 0-7).
export function readFont(buf) {
  if (buf.toString('latin1', 0, 4) !== 'FONT') throw new Error('not a font');
  const low = buf[4], high = buf[5], maxW = buf[6], maxH = buf[7];
  const glyphs = {};
  for (let c = low; c <= high; c++) {
    const off = buf.readUInt32LE(8 + (c - low) * 4);
    if (!off) continue;
    const w = buf[off], h = buf[off + 1], xo = buf[off + 2], yo = buf[off + 3];
    const px = new Uint8Array(w * h);
    let p = off + 4, i = 0;
    while (i < w * h && p < buf.length) {
      const b = buf[p++];
      i += b >> 3;
      if (i < w * h) px[i++] = b & 7;
    }
    glyphs[c] = { w, h, xo, yo, px };
  }
  return { low, high, maxW, maxH, glyphs };
}

// ---- PCX (8-bit, RLE) ----
export function readPcx(buf) {
  const w = buf.readUInt16LE(8) - buf.readUInt16LE(4) + 1, h = buf.readUInt16LE(10) - buf.readUInt16LE(6) + 1;
  const bpl = buf.readUInt16LE(66);
  const px = new Uint8Array(w * h);
  let p = 128;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < bpl) {
      let b = buf[p++], n = 1;
      if ((b & 0xc0) === 0xc0) { n = b & 0x3f; b = buf[p++]; }
      for (; n > 0; n--, x++) if (x < w) px[y * w + x] = b;
    }
  }
  return { width: w, height: h, px };
}

// ---- PNG writer ----
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
