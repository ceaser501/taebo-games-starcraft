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
// Text colours as the fonts were baked (tfontgam.pcx order).
export const COLOR = { blue: 0, yellow: 1, white: 2, grey: 3, red: 4, green: 5 };
const HP_COLORS = ['#18fc10', '#fcfc38', '#fc1010'];

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

  textWidth(text, font = 'font10') {
    const f = this.meta.fonts[font];
    let w = 0;
    for (const ch of text) w += f.glyphs[ch.charCodeAt(0)]?.[1] ?? 3;
    return w;
  }

  text(ctx, text, x, y, color = COLOR.blue, font = 'font10', align = 'left') {
    const f = this.meta.fonts[font];
    const img = this.images[f.file];
    if (align === 'center') x -= Math.round(this.textWidth(text, font) / 2);
    else if (align === 'right') x -= this.textWidth(text, font);
    for (const ch of text) {
      const g = f.glyphs[ch.charCodeAt(0)];
      if (!g) { x += 3; continue; }
      ctx.drawImage(img, g[0], color * f.height, g[1], f.height, x, y, g[1], f.height);
      x += g[1];
    }
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
    ctx.drawImage(this.images[art.console.file], 0, CONSOLE_Y);
    this.drawMinimap(ctx, s);
    this.drawStatus(ctx, s);
    this.drawCard(ctx, s);
    this.drawResources(ctx, s);
    this.drawMessages(ctx, s);
    if (s.clock) {
      ctx.drawImage(this.images[art.time.file], 0, 0);
      this.text(ctx, s.clock, 76, 9, COLOR.white, 'font10', 'center');
    }
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
    this.minimapRect = { x: ox, y: oy, w: dw, h: dh, scale };
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
    if (u.maxHp > 0) this.text(ctx, `${u.hp}/${u.maxHp}`, STATUS.x + 40, STATUS.y + 70, hpColor, 'font8', 'center');
    if (u.energy >= 0 && u.completed && !u.building) this.text(ctx, `${u.energy}/200`, STATUS.x + 40, STATUS.y + 80, COLOR.blue, 'font8', 'center');
    this.text(ctx, name, STATUS.x + 160, STATUS.y + 6, COLOR.white, 'font10', 'center');

    const mine = u.owner === s.me;
    if (u.progress >= 0 && mine) {
      // Construction or training: the queue of five slots and the progress bar.
      const training = u.completed;
      if (!training) this.text(ctx, u.building ? 'Under Construction' : 'Morphing', STATUS.x + 160, STATUS.y + 24, COLOR.blue, 'font10', 'center');
      const bar = this.meta.console.progress;
      const bx = STATUS.x + 106, by = training ? STATUS.y + 30 : STATUS.y + 44;
      ctx.drawImage(this.images[bar.empty.file], bx, by);
      const fw = Math.round(bar.full.w * u.progress / 100);
      if (fw > 0) ctx.drawImage(this.images[bar.full.file], 0, 0, fw, bar.full.h, bx, by - 1, fw, bar.full.h);
      if (training) {
        // Five queue slots; the first (in production) has the arrow pointing at the rest.
        for (let i = 0; i < 5; i++) {
          const x = STATUS.x + 64 + i * 36, y = STATUS.y + 55;
          this.frame(ctx, `cmdbtns-${this.race}`, i === 0 ? 4 : 2, x, y);
          const type = u.queue[i];
          if (type != null) s.drawIcon(ctx, type, x + 1, y + 1, 0, 34, 32);
        }
      }
    } else if (!u.building && mine) {
      this.text(ctx, 'Kills: 0', STATUS.x + 160, STATUS.y + 40, COLOR.blue, 'font10', 'center');
    }
  }

  // Command buttons: the original button frame with the icon on it, pressed ones shifted.
  cardSlot(pos) {
    return { x: CARD.x + (pos % 3) * CARD.dx, y: CARD.y + Math.floor(pos / 3) * CARD.dy, w: 36, h: 34 };
  }

  cardAt(x, y) {
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
    // Tooltip above the card, like the original.
    const hover = s.buttons.find((b) => b.pos === s.hoverPos);
    if (hover) {
      const text = hover.tip;
      const w = this.textWidth(text) + 8;
      const x = Math.min(SCREEN.w - w - 2, CARD.x + 60 - w / 2), y = CARD.y - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x, y, w, 15);
      ctx.strokeStyle = '#3c3c3c';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 14);
      this.text(ctx, text, x + 4, y + 1, COLOR.white);
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
    const cols = [436, 504, 572];
    items.forEach(([icon, text, color], i) => {
      this.frame(ctx, 'icons', icon, cols[i], 2);
      this.text(ctx, text, cols[i] + 18, 3, color);
    });
  }

  drawMessages(ctx, s) {
    const lines = s.messages;
    lines.forEach((m, i) => this.text(ctx, m.text, 10, CONSOLE_Y - 14 * (lines.length - i) + 4, m.color ?? COLOR.white));
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
