// Loads the WebAssembly engine (engine/bw.mjs, built from starcraft/engine) and the packed game data,
// and wraps the engine's C functions in plain JavaScript.
const TILESETS = ['badlands', 'platform', 'install', 'ashworld', 'jungle', 'desert', 'ice', 'twilight'];
const DATA = new URL('assets/sc/', document.baseURI).href;
const ENGINE = new URL('js/engine/', document.baseURI).href;

// Fetches a file whole, with progress. Errors name the file (Safari only says "Load failed").
async function fetchBytes(url, onProgress) {
  const name = decodeURIComponent(url.slice(DATA.length) || url);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`${name} 받기 실패 (${err.message})`);
  }
  if (!res.ok) throw new Error(`${name} 없음 (${res.status}). npm run sc:pack 을 했는지 확인해 주세요.`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let loaded = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }
  } catch (err) {
    throw new Error(`${name} 받다가 끊김 (${err.message})`);
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return bytes;
}

// The data packs are gzip files. Some servers already unzip them on the way (Content-Encoding),
// so only unzip what still starts with the gzip signature.
async function fetchGzip(url, onProgress) {
  const bytes = await fetchBytes(url, onProgress);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const fetchText = async (url) => new TextDecoder().decode(await fetchBytes(url));

export class Engine {
  static async load(onProgress) {
    let M;
    try {
      const { default: create } = await import(/* webpackIgnore: true */ `${ENGINE}bw.mjs`);
      M = await create({ locateFile: (f) => ENGINE + f });
    } catch (err) {
      throw new Error(`엔진(bw.mjs/bw.wasm) 불러오기 실패 (${err.message})`);
    }
    const engine = new Engine(M);
    const [bin, idx] = await Promise.all([fetchGzip(`${DATA}data/core.bin.gz`, onProgress), fetchText(`${DATA}data/core.idx`)]);
    engine.addData(bin, idx);
    if (!M._bw_init()) throw new Error('engine init failed');
    engine.maps = JSON.parse(await fetchText(`${DATA}maps.json`));
    return engine;
  }

  constructor(M) {
    this.M = M;
    this.tilesets = new Set();
    this.unitTypes = new Map();
    this.icons = new Map();
    this.M.onFatal = (text) => { this.fatal = text; };
    // Sounds the simulation plays (weapons, deaths, the nuke warning...), with volume and pan.
    this.M.onSound = (file, volume, pan, priority, flags) => this.onSound?.(file, volume, pan, priority, flags);
  }

  // Copies bytes into the engine heap; data handed to bw_add_data must stay there for good.
  heapCopy(bytes) {
    const ptr = this.M._malloc(bytes.length || 1);
    this.M.HEAPU8.set(bytes, ptr);
    return ptr;
  }

  cstr(text) {
    const n = this.M.lengthBytesUTF8(text) + 1;
    const ptr = this.M._malloc(n);
    this.M.stringToUTF8(text, ptr, n);
    return ptr;
  }

  addData(bin, idx) {
    this.M._bw_add_data(this.heapCopy(bin), this.cstr(idx));
  }

  text(ptr) { return this.M.UTF8ToString(ptr); }
  json(ptr) { return JSON.parse(this.text(ptr)); }
  bytes(n) { return n > 0 ? this.M.HEAPU8.slice(this.M._bw_out(), this.M._bw_out() + n) : null; }

  // Fetches a map, plus its tileset graphics when not loaded yet, and starts a melee game.
  // races: one per player (0 zerg, 1 terran, 2 protoss). Returns the slot of each player.
  async start(mapFile, seed, races, onProgress) {
    const path = '/map.chk.mpq';
    this.M.FS.writeFile(path, await fetchBytes(`${DATA}maps/${mapFile}`));
    const p = this.cstr(path);
    const tileset = this.M._bw_map_tileset(p);
    if (tileset < 0) throw new Error(`맵을 읽지 못했어요: ${this.text(this.M._bw_text())}`);
    const name = TILESETS[tileset];
    if (!this.tilesets.has(name)) {
      const [bin, idx] = await Promise.all([fetchGzip(`${DATA}data/${name}.bin.gz`, onProgress), fetchText(`${DATA}data/${name}.idx`)]);
      this.addData(bin, idx);
      this.tilesets.add(name);
    }
    const racesPtr = this.M._malloc(4 * races.length);
    this.M.HEAP32.set(races, racesPtr >> 2);
    const placed = this.M._bw_start(p, seed >>> 0, races.length, racesPtr);
    this.M._free(racesPtr);
    this.M._free(p);
    if (placed < 0) throw new Error(`맵을 시작하지 못했어요: ${this.text(this.M._bw_text())}`);
    if (placed < races.length) throw new Error(`이 맵은 ${placed}명까지만 할 수 있어요.`);
    this.icons.clear();
    return races.map((_, i) => this.M._bw_player_slot(i));
  }

  setViewer(slot) { this.M._bw_set_viewer(slot); }
  get frame() { return this.M._bw_frame(); }
  get mapWidth() { return this.M._bw_map_width(); }
  get mapHeight() { return this.M._bw_map_height(); }
  get mapTileWidth() { return this.M._bw_map_tile_width(); }
  get mapTileHeight() { return this.M._bw_map_tile_height(); }
  startLocation(slot) { return { x: this.M._bw_start_x(slot), y: this.M._bw_start_y(slot) }; }

  step() { this.M._bw_step(); }
  hash() { return this.M._bw_hash() >>> 0; }

  action(slot, bytes) {
    const ptr = this.M._malloc(bytes.length);
    this.M.HEAPU8.set(bytes, ptr);
    const r = this.M._bw_action(slot, ptr, bytes.length);
    this.M._free(ptr);
    return r;
  }

  // Renders the view into `imageData` (w x h). Returns the view position after clamping to the map.
  render(imageData, x, y) {
    const { width: w, height: h } = imageData;
    const ptr = this.M._bw_render(w, h, Math.round(x), Math.round(y));
    imageData.data.set(this.M.HEAPU8.subarray(ptr, ptr + w * h * 4));
    return { x: this.M._bw_view_x(), y: this.M._bw_view_y() };
  }

  renderMinimap(imageData) {
    const ptr = this.M._bw_render_minimap();
    imageData.data.set(this.M.HEAPU8.subarray(ptr, ptr + imageData.width * imageData.height * 4));
  }

  select(x0, y0, x1, y1, shift, sameType) { return this.M._bw_select(x0, y0, x1, y1, shift ? 1 : 0, sameType ? 1 : 0); }
  nukesReady(slot) { return this.M._bw_nukes_ready(slot); }
  selectId(id) { return this.M._bw_select_id(id); }
  selectLarva() { return this.M._bw_select_larva(); }
  syncSelection() { return this.M._bw_sync_selection(); }
  selection() { return this.json(this.M._bw_selection_json()); }
  player(slot) { return this.json(this.M._bw_player_json(slot)); }
  units(owner = -1, type = -1) { return this.json(this.M._bw_units_json(owner, type)).map(([id, t, x, y]) => ({ id, type: t, x, y })); }

  unitAt(x, y) {
    const owner = this.M._bw_unit_at(x, y);
    return owner < 0 ? null : { owner };
  }

  poweredAt(x, y) { return !!this.M._bw_powered_at(x, y); }
  unitInfo(x, y) { return this.json(this.M._bw_unit_info(x, y)); }
  canPlace(type, tx, ty) { return !!this.M._bw_can_place(type, tx, ty); }

  unitType(id) {
    if (!this.unitTypes.has(id)) this.unitTypes.set(id, this.json(this.M._bw_unit_type_json(id)));
    return this.unitTypes.get(id);
  }

  can(kind, id) { return !!this.M._bw_can({ build: 0, research: 1, upgrade: 2, tech: 3, order: 4 }[kind], id); }
  techState(slot, tech) { return this.M._bw_tech_state(slot, tech); }
  upgradeState(slot, upgrade) { const v = this.M._bw_upgrade_state(slot, upgrade); return { level: v % 100, upgrading: v >= 100, max: this.M._bw_upgrade_max(slot, upgrade) }; }
  tech(id) { return this.json(this.M._bw_tech_json(id)); }
  upgrade(id, slot) { return this.json(this.M._bw_upgrade_json(id, slot)); }
  canLand(tx, ty) { return !!this.M._bw_can_land(tx, ty); }

  // Building preview drawn by the next render; returns { ok, tiles } (1 per tile that fits), or clears with type -1.
  placement(type, tx, ty, land = false) {
    const ok = !!this.M._bw_placement(type, tx, ty, land ? 1 : 0);
    const n = this.M._bw_out ? this.M.HEAPU8.subarray(this.M._bw_out(), this.M._bw_out() + 64) : null;
    return { ok, tiles: n };
  }

  // Selection with the extra details merged in.
  selectionFull() {
    const sel = this.selection();
    const extra = this.json(this.M._bw_selection_extra_json());
    return sel.map((u, i) => ({ ...u, ...extra[i] }));
  }

  // What happened for the local player since the last call (see bw_events_json).
  events() { return this.json(this.M._bw_events_json()); }

  soundFile(id) { return this.text(this.M._bw_sound_file(id)); }

  // A command card icon as a canvas, cached per frame and colour row (0 normal, 1 disabled, 2 lit).
  icon(frame, row = 0, set = 0) {
    const key = `${set}:${frame}:${row}`;
    if (!this.icons.has(key)) {
      const ptr = this.M._bw_icon(set, frame, row);
      const w = this.M._bw_icon_w(), h = this.M._bw_icon_h();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const img = new ImageData(w, h);
      img.data.set(this.M.HEAPU8.subarray(ptr, ptr + w * h * 4));
      c.getContext('2d').putImageData(img, 0, 0);
      this.icons.set(key, c);
    }
    return this.icons.get(key);
  }

  // Command bytes for the local player (Brood War action format), or null when there is nothing to send.
  cmd = {
    select: () => this.bytes(this.M._bw_cmd_select()),
    rightClick: (x, y, queue) => this.bytes(this.M._bw_cmd_right_click(x, y, queue ? 1 : 0)),
    order: (order, x, y, queue) => this.bytes(this.M._bw_cmd_order(order, x, y, queue ? 1 : 0)),
    stop: () => this.bytes(this.M._bw_cmd_stop()),
    hold: () => this.bytes(this.M._bw_cmd_hold()),
    returnCargo: () => this.bytes(this.M._bw_cmd_return_cargo()),
    train: (type) => this.bytes(this.M._bw_cmd_train(type)),
    cancelQueue: (slot = 254) => this.bytes(this.M._bw_cmd_cancel_queue(slot)),
    cancelConstruction: () => this.bytes(this.M._bw_cmd_cancel_construction()),
    build: (type, tx, ty) => this.bytes(this.M._bw_cmd_build(type, tx, ty)),
    group: (sub, n) => this.bytes(this.M._bw_cmd_group(sub, n)),
    research: (tech) => this.bytes(this.M._bw_cmd_research(tech)),
    upgrade: (upgrade) => this.bytes(this.M._bw_cmd_upgrade(upgrade)),
    cancelResearch: () => this.bytes(this.M._bw_cmd_cancel_research()),
    cancelUpgrade: () => this.bytes(this.M._bw_cmd_cancel_upgrade()),
    cancelAddon: () => this.bytes(this.M._bw_cmd_cancel_addon()),
    cancelNuke: () => this.bytes(this.M._bw_cmd_cancel_nuke()),
    stim: () => this.bytes(this.M._bw_cmd_stim()),
    cloak: () => this.bytes(this.M._bw_cmd_cloak()),
    decloak: () => this.bytes(this.M._bw_cmd_decloak()),
    siege: () => this.bytes(this.M._bw_cmd_siege()),
    unsiege: () => this.bytes(this.M._bw_cmd_unsiege()),
    unloadAll: () => this.bytes(this.M._bw_cmd_unload_all()),
    unload: (uid) => this.bytes(this.M._bw_cmd_unload(uid)),
    liftoff: () => this.bytes(this.M._bw_cmd_liftoff()),
    land: (tx, ty) => this.bytes(this.M._bw_cmd_land(tx, ty)),
    addon: (type) => this.bytes(this.M._bw_cmd_addon(type)),
    morph: (type) => this.bytes(this.M._bw_cmd_morph(type)),
    morphBuilding: (type) => this.bytes(this.M._bw_cmd_morph_building(type)),
    burrow: () => this.bytes(this.M._bw_cmd_burrow()),
    unburrow: () => this.bytes(this.M._bw_cmd_unburrow()),
    cancelMorph: () => this.bytes(this.M._bw_cmd_cancel_morph()),
    archon: () => this.bytes(this.M._bw_cmd_archon()),
    darkArchon: () => this.bytes(this.M._bw_cmd_dark_archon()),
    trainFighter: () => this.bytes(this.M._bw_cmd_train_fighter()),
  };
}
