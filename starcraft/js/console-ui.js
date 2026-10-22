// The in-game interface drawn the way the original draws it: a 640x480 screen with the race's
// console art at the bottom, minimap, status panel (wireframe, name, hit points, production),
// command card, resource counters and messages in the original bitmap fonts, and the original
// cursors. Art comes from assets/sc/ui (converted from the Remastered SD files by sc:pack).
const BASE = new URL('assets/sc/ui/', document.baseURI).href;

export const SCREEN = { w: 640, h: 480 };
export const CONSOLE_Y = 292;
export const MINIMAP = { x: 6, y: 348, w: 128, h: 128 };
const CARD = { x: 505, y: 357, dx: 46, dy: 40 };
const STATUS = { x: 154, y: 387, w: 250, h: 90 };
export const PORTRAIT = { x: 413, y: 410, w: 60, h: 56 };
// Text colours as the fonts were baked (tfontgam.pcx order).
export const COLOR = { blue: 0, yellow: 1, white: 2, grey: 3, red: 4, green: 5 };
const HP_COLORS = ['#18fc10', '#fcfc38', '#fc1010'];
// Close matches of the font colours, for letters the bitmap fonts lack.
const FALLBACK_COLORS = ['#b4b4f8', '#fcfc38', '#fcfcfc', '#a0a0a0', '#fc4848', '#18fc10'];

const loadImage = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`${file} 불러오기 실패`));
  img.src = BASE + file;
});

export class ConsoleUI {
  static async load() {
    const meta = await (await fetch(`${BASE}ui.json`)).json();
    const ui = new ConsoleUI(meta);
    const files = new Set();
    for (const race of Object.values(meta.console)) for (const part of Object.values(race)) files.add(part.file);
    for (const s of Object.values(meta.sheets)) files.add(s.file);
    for (const f of Object.values(meta.fonts)) files.add(f.file);
    await Promise.all([...files].map(async (f) => { ui.images[f] = await loadImage(f); }));
    return ui;
  }

  constructor(meta) {
    this.meta = meta;
    this.images = {};
    this.tinted = new Map();
    this.race = 'terran';
    this.ox = 0; // where the 640-wide console starts on a wider screen
  }

  get names() { return this.meta.names; }

  setRace(race) {
    this.race = race;
    // Where the console art is opaque, clicks belong to the console, not the map.
    const art = this.images[this.meta.console[race].console.file];
    const c = document.createElement('canvas');
    c.width = art.width;
    c.height = art.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(art, 0, 0);
    this.consoleAlpha = ctx.getImageData(0, 0, art.width, art.height).data;
  }

  onConsole(x, y) {
    x -= this.ox;
    if (y < CONSOLE_Y || y >= SCREEN.h || x < 0 || x >= SCREEN.w) return false;
    return this.consoleAlpha[((y - CONSOLE_Y) * SCREEN.w + x) * 4 + 3] > 0;
  }

  // ---- drawing helpers ----

  frame(ctx, sheet, index, x, y) {
    const s = this.meta.sheets[sheet];
    const r = s.frames[index];
    if (!r) return;
    ctx.drawImage(this.images[s.file], r[0], r[1], r[2], r[3], x, y, r[2], r[3]);
  }

  // A white-on-transparent piece of a sheet recoloured (wireframes), cached per colour.
  tintedPart(sheet, index, part, size, color) {
    const key = `${sheet}:${index}:${part}:${color}`;
    if (!this.tinted.has(key)) {
      const s = this.meta.sheets[sheet];
      const r = s.frames[index];
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      if (r) {
        ctx.drawImage(this.images[s.file], r[0] + part * size, r[1], size, size, 0, 0, size, size);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, size, size);
      }
      this.tinted.set(key, c);
    }
    return this.tinted.get(key);
  }

  // Text uses the original colour codes: \x01/\x02 pale blue, \x03 yellow, \x04 white, \x05 grey,
  // \x06 red, \x07 green; \n starts a new line.
  textWidth(text, font = 'font10') {
    const f = this.meta.fonts[font];
    let w = 0, max = 0;
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c === 10) { max = Math.max(max, w); w = 0; continue; }
      if (c < 32) continue;
      w += f.glyphs[c]?.[1] ?? (c > 255 ? f.height - 2 : 3);
    }
    return Math.max(max, w);
  }

  text(ctx, text, x, y, color = COLOR.blue, font = 'font10', align = 'left') {
    const f = this.meta.fonts[font];
    const img = this.images[f.file];
    const CODES = { 1: COLOR.blue, 2: COLOR.blue, 3: COLOR.yellow, 4: COLOR.white, 5: COLOR.grey, 6: COLOR.red, 7: COLOR.green };
    const base = color;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      let lx = x;
      if (align === 'center') lx -= Math.round(this.textWidth(line, font) / 2);
      else if (align === 'right') lx -= this.textWidth(line, font);
      for (const ch of line) {
        const c = ch.charCodeAt(0);
        if (c < 32) { color = c === 1 ? base : CODES[c] ?? color; continue; }
        const g = f.glyphs[c];
        if (!g) {
          // The bitmap fonts only cover Latin-1; other letters (Korean chat) use a system font.
          if (c > 255) {
            ctx.font = `${f.height - 2}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
            ctx.fillStyle = FALLBACK_COLORS[color];
            ctx.textBaseline = 'top';
            ctx.fillText(ch, lx, y + i * (f.height - 1));
            lx += Math.ceil(ctx.measureText(ch).width);
          } else lx += 3;
          continue;
        }
        ctx.drawImage(img, g[0], color * f.height, g[1], f.height, lx, y + i * (f.height - 1), g[1], f.height);
        lx += g[1];
      }
    });
  }

  // Wireframe: four body sections coloured by health, like the original's damage display.
  wireframe(ctx, sheet, type, x, y, size, hp, maxHp) {
    const ratio = maxHp > 0 ? hp / maxHp : 1;
    const damaged = ratio >= 1 ? 0 : Math.min(4, Math.ceil((1 - ratio) * 4));
    for (let part = 0; part < 4; part++) {
      // The most damaged sections turn red first, the next ones yellow.
      const level = part < damaged ? (ratio < 0.34 || part < damaged - 1 ? 2 : 1) : 0;
      ctx.drawImage(this.tintedPart(sheet, type, part, size, HP_COLORS[level]), x, y);
    }
  }

  // ---- the console ----

  draw(ctx, s) {
    const art = this.meta.console[this.race];
    const img = this.images[art.console.file];
    // On a wide screen the map shows beside the console down to its frames; below that, black.
    if (this.ox > 0) {
      const w = ctx.canvas.width, top = CONSOLE_Y + 56;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, top, this.ox + 2, SCREEN.h - top);
      ctx.fillRect(this.ox + img.width - 2, top, w - this.ox - img.width + 2, SCREEN.h - top);
    }
    ctx.save();
    ctx.translate(this.ox, 0);
    this.drawConsole(ctx, s, art, img);
    ctx.restore();
  }

  drawConsole(ctx, s, art, img) {
    // The game clock sits on top of the minimap's frame, as in Remastered.
    if (s.clock) {
      const t = art.time;
      const y = CONSOLE_Y + (t.h > 32 ? 28 : 20) - t.h;
      ctx.drawImage(this.images[t.file], 0, y);
      this.text(ctx, s.clock, 76, y + (t.h > 32 ? 28 : 9), COLOR.white, 'font10', 'center');
    }
    ctx.drawImage(img, 0, CONSOLE_Y);
    this.drawMinimap(ctx, s);
    this.drawPortrait(ctx, s.portrait);
    this.drawStatus(ctx, s);
    this.drawCard(ctx, s);
    this.drawResources(ctx, s);
    this.drawMessages(ctx, s);
  }

  drawMinimap(ctx, s) {
    if (!s.minimap) return;
    const { w, h } = s.minimapSize;
    const scale = MINIMAP.w / Math.max(w, h);
    const dw = w * scale, dh = h * scale;
    const ox = MINIMAP.x + (MINIMAP.w - dw) / 2, oy = MINIMAP.y + (MINIMAP.h - dh) / 2;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(s.minimap, ox, oy, dw, dh);
    ctx.imageSmoothingEnabled = false;
    // The view rectangle, in white as in the original.
    const v = s.viewRect;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox + v.x / 32 * scale) + 0.5, Math.round(oy + v.y / 32 * scale) + 0.5, Math.round(v.w / 32 * scale), Math.round(v.h / 32 * scale));
    this.minimapRect = { x: ox + this.ox, y: oy, w: dw, h: dh, scale }; // screen coordinates
    // Blinking squares where something happened (attacks, pings).
    for (const p of s.pings || []) {
      if (Math.floor((s.now - p.t) / 150) % 2) continue;
      const px = Math.round(ox + p.x / 32 * scale), py = Math.round(oy + p.y / 32 * scale);
      ctx.strokeStyle = p.color;
      ctx.strokeRect(px - 4.5, py - 4.5, 9, 9);
    }
  }

  drawStatus(ctx, s) {
    const sel = s.selection;
    if (!sel.length) return;
    if (sel.length > 1) {
      // Up to 12 units: small wireframes in boxes, two rows of six.
      sel.slice(0, 12).forEach((u, i) => {
        const x = STATUS.x + 12 + (i % 6) * 38, y = STATUS.y + 8 + Math.floor(i / 6) * 40;
        this.frame(ctx, `cmdbtns-${this.race}`, 13, x, y);
        this.wireframe(ctx, 'grpwire', u.type, x + 2, y + 2, 32, u.hp, u.maxHp);
      });
      return;
    }
    const u = sel[0];
    const name = this.names[u.type] ?? '';
    this.wireframe(ctx, 'wirefram', u.type, STATUS.x + 8, STATUS.y + 4, 64, u.hp, u.maxHp);
    if (u.resources >= 0) {
      this.text(ctx, name, STATUS.x + 160, STATUS.y + 10, COLOR.white, 'font10', 'center');
      this.text(ctx, `${u.type === 188 ? 'Vespene Gas' : 'Minerals'}: ${u.resources}`, STATUS.x + 160, STATUS.y + 40, COLOR.white, 'font10', 'center');
      return;
    }
    const ratio = u.maxHp ? u.hp / u.maxHp : 1;
    const hpColor = ratio > 0.66 ? COLOR.green : ratio > 0.33 ? COLOR.yellow : COLOR.red;
    // Protoss: shields above the hit points.
    const shields = u.maxShields > 0;
    if (shields) this.text(ctx, `${u.shields}/${u.maxShields}`, STATUS.x + 40, STATUS.y + 60, COLOR.white, 'font8', 'center');
    if (u.maxHp > 0) this.text(ctx, `${u.hp}/${u.maxHp}`, STATUS.x + 40, STATUS.y + 70, hpColor, 'font8', 'center');
    this.text(ctx, name, STATUS.x + 160, STATUS.y + 6, COLOR.white, 'font10', 'center');

    const mine = u.owner === s.me;
    const bar = this.meta.console.progress;
    const progressBar = (pct, y) => {
      const bx = STATUS.x + 106;
      ctx.drawImage(this.images[bar.empty.file], bx, y);
      const fw = Math.round(bar.full.w * pct / 100);
      if (fw > 0) ctx.drawImage(this.images[bar.full.file], 0, 0, fw, bar.full.h, bx, y - 1, fw, bar.full.h);
    };
    // One slot with an icon and a bar: research, upgrade, add-on under construction.
    const work = (label, icon, pct) => {
      this.text(ctx, label, STATUS.x + 160, STATUS.y + 22, COLOR.blue, 'font10', 'center');
      this.frame(ctx, `cmdbtns-${this.race}`, 2, STATUS.x + 64, STATUS.y + 38);
      s.drawIcon(ctx, icon, STATUS.x + 65, STATUS.y + 39, 0, 34, 32);
      progressBar(pct, STATUS.y + 50);
    };
    this.passengerRects = [];
    if (mine && u.research >= 0) work('Researching', s.techIcon(u.research), u.work);
    else if (mine && u.upgrade >= 0) work('Upgrading', s.upgradeIcon(u.upgrade), u.work);
    else if (mine && u.addonProgress >= 0) work('Adding On', u.addon, u.addonProgress);
    else if (u.progress >= 0 && mine) {
      const training = u.completed;
      if (!training) this.text(ctx, u.building ? 'Under Construction' : 'Morphing', STATUS.x + 160, STATUS.y + 24, COLOR.blue, 'font10', 'center');
      progressBar(u.progress, training ? STATUS.y + 30 : STATUS.y + 44);
      if (training) {
        // Five queue slots; the first (in production) has the arrow pointing at the rest.
        for (let i = 0; i < 5; i++) {
          const x = STATUS.x + 64 + i * 36, y = STATUS.y + 55;
          this.frame(ctx, `cmdbtns-${this.race}`, i === 0 ? 4 : 2, x, y);
          const type = u.queue[i];
          if (type != null) s.drawIcon(ctx, type, x + 1, y + 1, 0, 34, 32);
        }
      }
    } else if (u.loaded?.length) {
      // Passengers: small wireframes in boxes; clicking one unloads it.
      u.loaded.forEach(([uid, type, hp, maxHp], i) => {
        const x = STATUS.x + 80 + (i % 4) * 38, y = STATUS.y + 22 + Math.floor(i / 4) * 34;
        this.frame(ctx, `cmdbtns-${this.race}`, 13, x, y);
        this.wireframe(ctx, 'grpwire', type, x + 2, y + 2, 32, hp, maxHp);
        if (mine) this.passengerRects.push({ x, y, w: 36, h: 34, uid });
      });
    } else if (u.nuke && mine) {
      this.text(ctx, u.nuke === 2 ? 'Nuke Ready' : 'Arming Nuke', STATUS.x + 160, STATUS.y + 40, COLOR.blue, 'font10', 'center');
    } else if (u.building && mine && u.powered === 0) {
      this.text(ctx, 'Disabled', STATUS.x + 160, STATUS.y + 24, COLOR.blue, 'font10', 'center');
    } else if (!u.building && mine) {
      this.text(ctx, `Kills: ${u.kills ?? 0}`, STATUS.x + 160, STATUS.y + 22, COLOR.blue, 'font10', 'center');
    }
    // Armor and weapon icons with the upgrade level in the corner.
    if (u.gear?.length && !(u.progress >= 0 && mine) && !u.loaded?.length && u.research < 0 && u.upgrade < 0) {
      // Carriers and reavers also show how many interceptors / scarabs they hold.
      const gear = u.fighters >= 0 && mine ? [...u.gear, [u.type === 72 ? 73 : 85, 0, u.fighters]] : u.gear;
      gear.forEach(([icon, , level], i) => {
        const x = STATUS.x + 82 + i * 38, y = STATUS.y + 40;
        this.frame(ctx, `cmdbtns-${this.race}`, 13, x, y);
        s.drawIcon(ctx, icon, x + 2, y + 2, 0, 32, 30);
        if (level) this.text(ctx, String(level), x + 27, y + 21, COLOR.white, 'font8');
      });
    }
    if (u.energy >= 0 && u.maxEnergy > 0 && u.completed) this.text(ctx, `${u.energy}/${u.maxEnergy}`, STATUS.x + 40, STATUS.y + 78, COLOR.blue, 'font8', 'center');
  }

  passengerAt(x, y) {
    x -= this.ox;
    return this.passengerRects?.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)?.uid ?? null;
  }

  // The talking head: the current clip's frame inside the console's portrait window.
  drawPortrait(ctx, video) {
    if (video?.img) ctx.drawImage(video.img, video.sx, 0, video.w, video.h, PORTRAIT.x, PORTRAIT.y, PORTRAIT.w, PORTRAIT.h);
    else if (video && video.readyState >= 2) ctx.drawImage(video, PORTRAIT.x, PORTRAIT.y, PORTRAIT.w, PORTRAIT.h);
    ctx.drawImage(this.images[this.meta.console[this.race].portrait.file], PORTRAIT.x, PORTRAIT.y);
  }

  // Command buttons: the original button frame with the icon on it, pressed ones shifted.
  cardSlot(pos) {
    return { x: CARD.x + (pos % 3) * CARD.dx, y: CARD.y + Math.floor(pos / 3) * CARD.dy, w: 36, h: 34 };
  }

  cardAt(x, y) {
    x -= this.ox;
    for (let pos = 0; pos < 9; pos++) {
      const r = this.cardSlot(pos);
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return pos;
    }
    return -1;
  }

  drawCard(ctx, s) {
    for (const b of s.buttons) {
      const r = this.cardSlot(b.pos);
      const pressed = s.pressedPos === b.pos;
      this.frame(ctx, `cmdbtns-${this.race}`, pressed ? 1 : 0, r.x, r.y);
      const enabled = b.enabled !== false;
      const lit = s.hoverPos === b.pos || s.activeButton === b.id;
      s.drawIcon(ctx, b.icon, r.x + (pressed ? 1 : 0), r.y + (pressed ? 1 : 0), enabled ? (lit ? 2 : 0) : 1);
    }
    // Tooltip above the card: the button text, then its cost with the resource icons.
    const hover = s.buttons.find((b) => b.pos === s.hoverPos);
    if (hover) {
      const cost = [];
      const c = hover.cost || {};
      if (c.minerals) cost.push([0, c.minerals]);
      if (c.gas) cost.push([1 + s.raceIndex, c.gas]);
      if (c.supply) cost.push([4 + s.raceIndex, c.supply]);
      if (c.energy) cost.push([7 + s.raceIndex, c.energy]);
      const costW = cost.reduce((w, [, n]) => w + 20 + this.textWidth(String(n)), 0);
      const lines = hover.tip.split('\n').length;
      const w = Math.max(this.textWidth(hover.tip), costW) + 10;
      const h = lines * 12 + 4 + (cost.length ? 16 : 0);
      const x = Math.max(2, Math.min(SCREEN.w - w - 2, CARD.x + 62 - w / 2)), y = CARD.y - h - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#484848';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      this.text(ctx, hover.tip, x + 5, y + 2, COLOR.white);
      let cx = x + 5;
      for (const [icon, n] of cost) {
        this.frame(ctx, 'icons', icon, cx, y + h - 17);
        this.text(ctx, String(n), cx + 18, y + h - 16, COLOR.white);
        cx += 20 + this.textWidth(String(n));
      }
    }
  }

  // Top right: minerals, gas, supply with the original icons.
  drawResources(ctx, s) {
    const p = s.player;
    if (!p) return;
    const race = s.raceIndex;
    const items = [[0, String(p.minerals), COLOR.green], [1 + race, String(p.gas), COLOR.green],
      [4 + race, `${p.supplyUsed}/${p.supplyMax}`, p.supplyUsed > p.supplyMax ? COLOR.red : COLOR.green]];
    // Each counter is an icon and a number in a fixed column, as in the original.
    const right = (s.screenRight ?? SCREEN.w) - SCREEN.w;
    const cols = [436 + right, 504 + right, 572 + right];
    items.forEach(([icon, text, color], i) => {
      this.frame(ctx, 'icons', icon, cols[i], 2);
      this.text(ctx, text, cols[i] + 18, 3, color);
    });
  }

  drawMessages(ctx, s) {
    const lines = s.messages;
    const bottom = CONSOLE_Y - 16 - (s.chat ? 18 : 0); // above the clock
    lines.forEach((m, i) => this.text(ctx, m.text, 10, bottom - 14 * (lines.length - i) + 4, m.color ?? COLOR.white));
    if (s.chat) {
      const cursor = Math.floor(s.now / 400) % 2 ? '_' : '';
      this.text(ctx, `\x04Message to all: \x02${s.chat.text}${cursor}`, 10, CONSOLE_Y - 14, COLOR.white);
    }
  }

  // ---- dialogs (game menu, victory / defeat), from the console's dialog pieces ----
  // dlg.dds.grp: 35-43 the box (corners, edges, middle), 47-49 a button (left, middle, right),
  // 53-55 a disabled button, 56-58 a lit one.

  dialogLayout(d) {
    const bw = d.width || 200, bh = 22;
    const h = 46 + d.buttons.length * (bh + 6) + (d.text ? 20 : 0);
    const w = bw + 40;
    const x = Math.round((SCREEN.w - w) / 2), y = Math.round((CONSOLE_Y - h) / 2) + 20;
    const buttons = d.buttons.map((b, i) => ({ ...b, x: x + 20, y: y + 40 + (d.text ? 20 : 0) + i * (bh + 6), w: bw, h: bh }));
    return { x, y, w, h, buttons };
  }

  dialogButtonAt(d, px, py) {
    px -= this.ox;
    return this.dialogLayout(d).buttons.findIndex((b) => px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h);
  }

  drawDialog(ctx, d, hover) {
    ctx.save();
    ctx.translate(this.ox, 0);
    this.drawDialogBox(ctx, d, hover);
    ctx.restore();
  }

  drawDialogBox(ctx, d, hover) {
    const sheet = `dlg-${this.race}`;
    const L = this.dialogLayout(d);
    const piece = (i) => this.meta.sheets[sheet].frames[i];
    // The box: corners, then edges and middle tiled.
    const [tl, t, tr, l, c, r, bl, b, br] = [35, 36, 37, 38, 39, 40, 41, 42, 43].map(piece);
    const img = this.images[this.meta.sheets[sheet].file];
    const tile = (f, x, y, w, h) => {
      for (let yy = 0; yy < h; yy += f[3]) for (let xx = 0; xx < w; xx += f[2]) {
        const cw = Math.min(f[2], w - xx), ch = Math.min(f[3], h - yy);
        ctx.drawImage(img, f[0], f[1], cw, ch, x + xx, y + yy, cw, ch);
      }
    };
    const { x, y, w, h } = L;
    tile(c, x + tl[2], y + t[3], w - tl[2] - tr[2], h - t[3] - b[3]);
    tile(t, x + tl[2], y, w - tl[2] - tr[2], t[3]);
    tile(b, x + bl[2], y + h - b[3], w - bl[2] - br[2], b[3]);
    tile(l, x, y + tl[3], l[2], h - tl[3] - bl[3]);
    tile(r, x + w - r[2], y + tr[3], r[2], h - tr[3] - br[3]);
    ctx.drawImage(img, tl[0], tl[1], tl[2], tl[3], x, y, tl[2], tl[3]);
    ctx.drawImage(img, tr[0], tr[1], tr[2], tr[3], x + w - tr[2], y, tr[2], tr[3]);
    ctx.drawImage(img, bl[0], bl[1], bl[2], bl[3], x, y + h - bl[3], bl[2], bl[3]);
    ctx.drawImage(img, br[0], br[1], br[2], br[3], x + w - br[2], y + h - br[3], br[2], br[3]);
    this.text(ctx, d.title, x + w / 2, y + 12, COLOR.white, d.big ? 'font16' : 'font14', 'center');
    if (d.text) this.text(ctx, d.text, x + w / 2, y + 36, COLOR.blue, 'font10', 'center');
    L.buttons.forEach((bt, i) => {
      const set = bt.disabled ? [53, 54, 55] : i === hover ? [56, 57, 58] : [47, 48, 49];
      const [bl2, bm, br2] = set.map(piece);
      tile(bm, bt.x + bl2[2], bt.y, bt.w - bl2[2] - br2[2], bm[3]);
      ctx.drawImage(img, bl2[0], bl2[1], bl2[2], bl2[3], bt.x, bt.y, bl2[2], bl2[3]);
      ctx.drawImage(img, br2[0], br2[1], br2[2], br2[3], bt.x + bt.w - br2[2], bt.y, br2[2], br2[3]);
      this.text(ctx, bt.label, bt.x + bt.w / 2, bt.y + 4, bt.disabled ? COLOR.grey : i === hover ? COLOR.white : COLOR.yellow, 'font10', 'center');
    });
  }

  // A cursor image as a CSS cursor (data URL scaled to the screen), so it moves without lag.
  cursorCss(name, frameIndex, scale) {
    const key = `${name}:${frameIndex}:${scale}`;
    this.cursors ??= new Map();
    if (!this.cursors.has(key)) {
      const s = this.meta.sheets[`cursor-${name}`];
      const r = s.frames[frameIndex % s.frames.length];
      const k = Math.max(1, Math.min(3, Math.round(scale)));
      const c = document.createElement('canvas');
      c.width = r[2] * k;
      c.height = r[3] * k;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.images[s.file], r[0], r[1], r[2], r[3], 0, 0, c.width, c.height);
      const hot = name === 'arrow' ? [0, 0] : [c.width / 2 | 0, c.height / 2 | 0];
      this.cursors.set(key, `url(${c.toDataURL()}) ${hot[0]} ${hot[1]}, auto`);
    }
    return this.cursors.get(key);
  }
}
