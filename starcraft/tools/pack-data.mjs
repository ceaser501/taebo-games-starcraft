// Packs the files the engine reads from the StarCraft data (ceaser501/taebo-games-starcraft-assets)
// into gzip blobs the browser fetches whole, each with a text index. Paths are lowercased with `/`,
// and the engine looks them up the same way, so the original mixed case does not matter.
// One blob holds what every game needs; each tileset's graphics get their own, fetched per map.
//
//   npm run sc:pack -- [path/to/taebo-games-starcraft-assets]   (default: ../taebo-games-starcraft-assets)
//
// Output (git-ignored), under starcraft/assets/sc/: data/<pack>.bin.gz and data/<pack>.idx
// ("path offset size" per line, offsets into the unzipped blob), maps/**.scm|scx with maps.json,
// and sound/**.wav.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

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

console.log(`${files.length} files in ${sizes.join(', ')} (${(total / 1e6).toFixed(1)} MB), ${sounds} sounds, ${maps.length} maps -> ${out}`);
