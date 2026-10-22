// Packs the files the engine reads from the StarCraft data (ceaser501/taebo-games-starcraft-assets)
// into gzip blobs the browser fetches whole, each with a text index. Paths are lowercased with `/`,
// and the engine looks them up the same way, so the original mixed case does not matter.
// One blob holds what every game needs; each tileset's graphics get their own, fetched per map.
//
//   npm run sc:pack -- [path/to/taebo-games-starcraft-assets]   (default: ../taebo-games-starcraft-assets)
//
// Output (git-ignored), under starcraft/assets/sc/: data/<pack>.bin.gz and data/<pack>.idx
// ("path offset size" per line, offsets into the unzipped blob), maps/**.scm|scx with maps.json,
// sound/**.wav, and ui/ (the original interface art as PNG sheets, fonts, unit names; ui.json).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readDds, readDdsGrp, sheet, readFont, readPcx, encodePng } from './image-formats.mjs';

const src = path.resolve(process.argv[2] || '../taebo-games-starcraft-assets');
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/sc');
if (!fs.existsSync(path.join(src, 'arr', 'units.dat'))) {
  console.error(`StarCraft data not found at ${src}`);
  process.exit(1);
}

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

// What the engine loads: unit and weapon tables, animation scripts, unit graphics with their
// overlay offsets, tilesets (terrain flags, graphics, palette, lighting tables) and the in-game
// palette remaps. HD art, menus and videos are left out.
const wanted = [
  /^arr\/.*\.(dat|tbl)$/,
  /^scripts\/iscript\.bin$/,
  /^triggers\/melee\.trg$/,
  /^rez\/stat_txt\.tbl$/,
  /^unit\/(?!wirefram\/).*\.(grp|lo[a-z])$/,
  /^tileset\/[^/]+\.(cv5|vf4|vr4|vx4ex|wpe|grp)$/,
  /^tileset\/[^/]+\/[^/]+\.pcx$/,
  /^game\/[^/]+\.(pcx|grp)$/,
];

const files = walk(src)
  .map((rel) => ({ rel, key: rel.toLowerCase() }))
  .filter(({ key }) => !key.includes('.dds.') && wanted.some((re) => re.test(key)))
  .sort((a, b) => a.key.localeCompare(b.key));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Tileset graphics (not the terrain flags, which the simulation needs for every tileset).
const packOf = (key) => key.match(/^tileset\/([^/.]+)(\.(vr4|vx4ex|grp|wpe)$|\/)/)?.[1] || 'core';
const packs = {};
for (const f of files) (packs[packOf(f.key)] ||= []).push(f);
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
let total = 0;
const sizes = [];
for (const [name, list] of Object.entries(packs)) {
  const index = [];
  const parts = [];
  let offset = 0;
  for (const { rel, key } of list) {
    const data = fs.readFileSync(path.join(src, rel));
    parts.push(data);
    index.push(`${key} ${offset} ${data.length}`);
    offset += data.length;
  }
  const gz = zlib.gzipSync(Buffer.concat(parts), { level: 9 });
  fs.writeFileSync(path.join(out, 'data', `${name}.bin.gz`), gz);
  fs.writeFileSync(path.join(out, 'data', `${name}.idx`), index.join('\n') + '\n');
  total += gz.length;
  sizes.push(`${name} ${(gz.length / 1e6).toFixed(1)}MB`);
}

// Sounds stay separate files, fetched when first played. sfxdata.tbl names them relative to sound/.
// SD/sound holds the original 22 kHz recordings; sound/ the Remastered ones, used where SD lacks a file.
let sounds = 0;
for (const dir of ['SD/sound', 'sound']) {
  for (const rel of walk(path.join(src, dir))) {
    const dst = path.join(out, 'sound', rel.toLowerCase());
    if (!/\.wav$/i.test(rel) || fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(src, dir, rel), dst);
    sounds++;
  }
}

// Maps: kept as the original MPQ (.scm/.scx); the engine reads scenario.chk out of them.
const maps = [];
for (const rel of walk(path.join(src, 'Maps'))) {
  if (!/\.sc[mx]$/i.test(rel)) continue;
  const name = path.basename(rel).replace(/\.sc[mx]$/i, '');
  const file = rel.toLowerCase().replace(/[^a-z0-9/._-]+/g, '_');
  const dst = path.join(out, 'maps', file);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(src, 'Maps', rel), dst);
  maps.push({ name, file, players: Number(name.match(/^\((\d)\)/)?.[1] || 0), folder: path.dirname(rel) });
}
fs.writeFileSync(path.join(out, 'maps.json'), JSON.stringify(maps, null, 1));

// ---- Interface: console art, wireframes, cursors, fonts and names, as PNG + ui.json ----
const ui = { console: {}, sheets: {}, fonts: {}, names: [] };
const uiDir = path.join(out, 'ui');
fs.mkdirSync(uiDir, { recursive: true });
const sd = (rel) => path.join(src, 'SD', rel);
const writeDds = (rel, name) => {
  const d = readDds(fs.readFileSync(sd(rel)));
  fs.writeFileSync(path.join(uiDir, `${name}.png`), encodePng(d.width, d.height, d.rgba));
  return { file: `${name}.png`, w: d.width, h: d.height };
};
const writeSheet = (rel, name, columns = 16) => {
  const s = sheet(readDdsGrp(fs.readFileSync(sd(rel))), columns);
  fs.writeFileSync(path.join(uiDir, `${name}.png`), s.png);
  ui.sheets[name] = { file: `${name}.png`, cell: s.cell, frames: s.frames };
};
for (const race of ['terran', 'protoss', 'zerg']) {
  const dir = `game/consoles/${race}`;
  ui.console[race] = {
    console: writeDds(`${dir}/console.DDS`, `console-${race}`),
    portrait: writeDds(`${dir}/conover.DDS`, `conover-${race}`),
    time: writeDds(`${dir}/console_TIME.DDS`, `time-${race}`),
  };
  writeSheet(`${dir}/cmdbtns.dds.grp`, `cmdbtns-${race}`, 10);
}
ui.console.progress = { empty: writeDds('game/tpbrempt.DDS', 'pbrempt'), full: writeDds('game/consoles/terran/pbrfull.DDS', 'pbrfull') };
writeSheet('game/icons.dds.grp', 'icons', 12);
writeSheet('unit/wirefram/wirefram.dds.grp', 'wirefram', 8);
writeSheet('unit/wirefram/grpwire.dds.grp', 'grpwire', 16);
writeSheet('unit/wirefram/tranwire.dds.grp', 'tranwire', 16);
for (const f of fs.readdirSync(sd('cursor'))) writeSheet(`cursor/${f}`, `cursor-${f.replace('.dds.grp', '')}`, 16);

// Fonts: one row per text colour (pale blue, yellow, white, grey, red, green, as tfontgam.pcx
// maps them), glyphs side by side. Coloured with the badlands palette; the interface colours
// are the same in every tileset palette.
const palette = fs.readFileSync(path.join(src, 'TileSet', 'badlands.wpe'));
const fontGamma = readPcx(fs.readFileSync(path.join(src, 'game', 'tfontgam.pcx')));
const FONT_COLORS = 6;
for (const size of [8, 10, 14, 16]) {
  const font = readFont(fs.readFileSync(sd(`font/font${size}.fnt`)));
  const codes = Object.keys(font.glyphs).map(Number);
  const W = codes.reduce((s, c) => s + font.glyphs[c].w + font.glyphs[c].xo, 0), H = font.maxH * FONT_COLORS;
  const rgba = new Uint8Array(W * H * 4);
  const glyphs = {};
  let x = 0;
  for (const c of codes) {
    const g = font.glyphs[c];
    glyphs[c] = [x, g.w + g.xo, g.yo];
    for (let color = 0; color < FONT_COLORS; color++) {
      for (let y = 0; y < g.h; y++) for (let gx = 0; gx < g.w; gx++) {
        const v = g.px[y * g.w + gx];
        if (!v) continue;
        const p = fontGamma.px[color * 8 + v];
        const d = ((color * font.maxH + g.yo + y) * W + x + g.xo + gx) * 4;
        rgba.set([palette[p * 4], palette[p * 4 + 1], palette[p * 4 + 2], 255], d);
      }
    }
    x += g.w + g.xo;
  }
  fs.writeFileSync(path.join(uiDir, `font${size}.png`), encodePng(W, H, rgba));
  ui.fonts[`font${size}`] = { file: `font${size}.png`, height: font.maxH, glyphs };
}

// Unit names (the first 228 strings of stat_txt.tbl), as in the original English game.
const tbl = fs.readFileSync(path.join(src, 'rez', 'stat_txt.tbl'));
for (let i = 0; i < 228; i++) {
  const o = tbl.readUInt16LE(2 + i * 2);
  ui.names.push(tbl.toString('latin1', o, tbl.indexOf(0, o)));
}
// All stat_txt strings too: tech and upgrade names are looked up by their label number.
const count = tbl.readUInt16LE(0);
ui.strings = [];
for (let i = 0; i < count; i++) {
  const o = tbl.readUInt16LE(2 + i * 2);
  ui.strings.push(tbl.toString('latin1', o, tbl.indexOf(0, o)));
}

// Portraits: Remastered SD keeps them as WebM clips, e.g. portrait/tmarine/tmafid00.webm (idle
// fidgets) and tmatlk00.webm (talking). portdata.dat gives each portrait's idle and talking names.
const portraitDir = sd('portrait');
ui.portraits = [];
if (fs.existsSync(portraitDir)) {
  const ptbl = fs.readFileSync(path.join(src, 'arr', 'portdata.tbl'));
  const pstr = (i) => { const o = ptbl.readUInt16LE(2 + (i - 1) * 2); return ptbl.toString('latin1', o, ptbl.indexOf(0, o)); };
  const pdat = fs.readFileSync(path.join(src, 'arr', 'portdata.dat'));
  const count = pdat.length / 12;
  const clips = (index) => {
    if (!index) return [];
    const [folder, stem] = pstr(index).toLowerCase().split('\\');
    const dir = path.join(portraitDir, folder);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.startsWith(stem) && f.endsWith('.webm')).sort().map((f) => `${folder}/${f}`);
  };
  for (let i = 0; i < count; i++) ui.portraits.push({ idle: clips(pdat.readUInt32LE(i * 4)), talk: clips(pdat.readUInt32LE((count + i) * 4)) });
  for (const rel of walk(portraitDir)) {
    const dst = path.join(out, 'portrait', rel.toLowerCase());
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(portraitDir, rel), dst);
  }
}
fs.writeFileSync(path.join(uiDir, 'ui.json'), JSON.stringify(ui));

console.log(`${files.length} files in ${sizes.join(', ')} (${(total / 1e6).toFixed(1)} MB), ${sounds} sounds, ${maps.length} maps -> ${out}`);
