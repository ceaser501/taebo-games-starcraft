// Reads the local CASC storage of a StarCraft: Remastered install (the `Data/` folder Battle.net
// writes) so the files we need can be listed and copied out without CascView, which is Windows-only.
//
//   node starcraft/tools/casc.mjs list    <StarCraft folder>                   > casc-list.txt
//   node starcraft/tools/casc.mjs extract <StarCraft folder> <out dir> <pattern>...
//
// `list` prints every file as "size<TAB>path". `extract` copies the files matching the patterns
// (case-insensitive): `arr/` takes a whole folder, `*` stays within one folder (`TileSet/*.cv5`),
// and a leading `!` leaves matches out (`!unit/wirefram/`).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const hex = (b) => Buffer.from(b).toString('hex');

// .build.info is a pipe-separated table; the active row names the build config.
function readBuildInfo(root) {
  const file = path.join(root, '.build.info');
  if (!fs.existsSync(file)) throw new Error(`${file} not found (it is a hidden file next to the Data folder; copy it too)`);
  const [head, ...rows] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const names = head.split('|').map((h) => h.split('!')[0]);
  const table = rows.map((r) => Object.fromEntries(r.split('|').map((v, i) => [names[i], v])));
  return table.find((r) => r.Active === '1') || table[0];
}

function readConfig(dataDir, key) {
  const file = path.join(dataDir, 'config', key.slice(0, 2), key.slice(2, 4), key);
  const config = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([\w-]+)\s*=\s*(.*)$/);
    if (m) config[m[1]] = m[2].trim().split(/\s+/);
  }
  return config;
}

// Index files map the first 9 bytes of an encoded key to (archive number, offset, size).
// Each of the 16 buckets may have several versions; the newest one is current.
function readIndices(dataDir) {
  const dir = path.join(dataDir, 'data');
  const newest = {};
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^([0-9a-f]{2})([0-9a-f]{8})\.idx$/i);
    if (m && (!newest[m[1]] || newest[m[1]] < f)) newest[m[1]] = f;
  }
  const map = new Map();
  for (const f of Object.values(newest)) {
    const buf = fs.readFileSync(path.join(dir, f));
    const headerSize = buf.readUInt32LE(0);
    const keyBytes = buf[8 + 6]; // after version u16, bucket, extra bytes, size bytes, offset bytes
    let pos = (8 + headerSize + 15) & ~15;
    const entriesSize = buf.readUInt32LE(pos);
    pos += 8;
    const entrySize = keyBytes + 5 + 4;
    for (const end = pos + entriesSize; pos + entrySize <= end; pos += entrySize) {
      const key = buf.toString('hex', pos, pos + keyBytes);
      if (map.has(key)) continue;
      const o = pos + keyBytes;
      const archive = (buf[o] << 2) | (buf[o + 1] >> 6);
      const offset = ((buf[o + 1] & 0x3f) * 0x1000000) + (buf[o + 2] << 16) + (buf[o + 3] << 8) + buf[o + 4];
      map.set(key, { archive, offset, size: buf.readUInt32LE(o + 5) });
    }
  }
  return map;
}

// BLTE: optional chunk table, then chunks tagged N (raw), Z (zlib) or F (nested BLTE).
export function decodeBlte(buf) {
  if (buf.toString('latin1', 0, 4) !== 'BLTE') throw new Error('not BLTE');
  const headerSize = buf.readUInt32BE(4);
  const chunks = [];
  if (headerSize === 0) {
    chunks.push(buf.subarray(8));
  } else {
    const count = buf.readUIntBE(9, 3);
    let pos = headerSize;
    for (let i = 0; i < count; i++) {
      const compSize = buf.readUInt32BE(12 + i * 24);
      chunks.push(buf.subarray(pos, pos + compSize));
      pos += compSize;
    }
  }
  return Buffer.concat(chunks.map((c) => {
    const body = c.subarray(1);
    switch (String.fromCharCode(c[0])) {
      case 'N': return body;
      case 'Z': return zlib.inflateSync(body);
      case 'F': return decodeBlte(body);
      case 'E': throw new Error('encrypted BLTE chunk');
      default: throw new Error(`unknown BLTE chunk mode ${c[0]}`);
    }
  }));
}

// Encoding file: content key (what the root names) -> encoded key (what the indices store).
function readEncoding(buf) {
  if (buf.toString('latin1', 0, 2) !== 'EN') throw new Error('not an encoding file');
  const ckeySize = buf[3], ekeySize = buf[4];
  const pageSize = buf.readUInt16BE(5) * 1024;
  const pageCount = buf.readUInt32BE(9);
  const especSize = buf.readUInt32BE(18);
  let pos = 22 + especSize + pageCount * (ckeySize + 16);
  const map = new Map();
  for (let p = 0; p < pageCount; p++, pos += pageSize) {
    for (let o = pos; o < pos + pageSize;) {
      const keyCount = buf[o];
      if (keyCount === 0) break;
      const size = buf.readUIntBE(o + 1, 5);
      const ckey = buf.toString('hex', o + 6, o + 6 + ckeySize);
      map.set(ckey, { ekey: buf.toString('hex', o + 6 + ckeySize, o + 6 + ckeySize + ekeySize), size });
      o += 6 + ckeySize + keyCount * ekeySize;
    }
  }
  return map;
}

export class Casc {
  constructor(root) {
    this.root = root;
    this.dataDir = path.join(root, 'Data');
    const build = readBuildInfo(root);
    this.config = readConfig(this.dataDir, build['Build Key']);
    this.indices = readIndices(this.dataDir);
    this.encoding = readEncoding(this.readEkey(this.config.encoding[1]));
    this.files = this.readRoot(this.readCkey(this.config.root[0]));
  }

  readEkey(ekey) {
    const loc = this.indices.get(ekey.slice(0, 18));
    if (!loc) throw new Error(`encoded key ${ekey} is not in the local indices`);
    const file = path.join(this.dataDir, 'data', `data.${String(loc.archive).padStart(3, '0')}`);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(loc.size);
    fs.readSync(fd, buf, 0, loc.size, loc.offset);
    fs.closeSync(fd);
    // Each blob starts with a 30-byte header (reversed key, size, flags, checksums).
    return decodeBlte(buf.subarray(30));
  }

  readCkey(ckey) {
    const enc = this.encoding.get(ckey);
    if (!enc) throw new Error(`content key ${ckey} is not in the encoding file`);
    return this.readEkey(enc.ekey);
  }

  // StarCraft keeps a text root: one "path|content key" per line.
  readRoot(buf) {
    const text = buf.toString('utf8');
    if (!/^[^\n|]+\|[0-9a-f]{32}/i.test(text)) {
      throw new Error(`unsupported root format (starts with ${JSON.stringify(buf.toString('latin1', 0, 4))}); send this message to Claude`);
    }
    const files = [];
    for (const line of text.split(/\r?\n/)) {
      const [name, ckey] = line.split('|');
      if (!name || !/^[0-9a-f]{32}$/i.test(ckey || '')) continue;
      const enc = this.encoding.get(ckey.toLowerCase());
      files.push({ name: name.replace(/\\/g, '/'), ckey: ckey.toLowerCase(), size: enc?.size ?? -1, local: !!enc && this.indices.has(enc.ekey.slice(0, 18)) });
    }
    return files;
  }

  read(file) { return this.readCkey(file.ckey); }
}

// A trailing `/` means everything below that folder.
function patternToRegex(p) {
  const body = p.replace(/\\/g, '/').replace(/[.+?^${}()|[\]]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${body}${p.endsWith('/') ? '' : '$'}`, 'i');
}

function main([cmd, root, out, ...patterns]) {
  if (!['list', 'extract'].includes(cmd) || !root || (cmd === 'extract' && (!out || !patterns.length))) {
    console.error('usage: casc.mjs list <StarCraft folder>\n       casc.mjs extract <StarCraft folder> <out dir> <pattern>...');
    process.exit(1);
  }
  const casc = new Casc(path.resolve(root));
  if (cmd === 'list') {
    for (const f of casc.files.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`${f.size}\t${f.name}${f.local ? '' : '\t(not installed)'}`);
    }
    const total = casc.files.reduce((s, f) => s + Math.max(0, f.size), 0);
    console.error(`${casc.files.length} files, ${(total / 1e6).toFixed(0)} MB`);
    return;
  }
  const wanted = patterns.filter((p) => !p.startsWith('!')).map(patternToRegex);
  const skipped = patterns.filter((p) => p.startsWith('!')).map((p) => patternToRegex(p.slice(1)));
  let count = 0, bytes = 0;
  for (const f of casc.files) {
    if (!f.local || !wanted.some((r) => r.test(f.name)) || skipped.some((r) => r.test(f.name))) continue;
    const dst = path.join(out, f.name);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const data = casc.read(f);
    fs.writeFileSync(dst, data);
    count++;
    bytes += data.length;
  }
  console.error(`${count} files, ${(bytes / 1e6).toFixed(1)} MB -> ${path.resolve(out)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main(process.argv.slice(2));
