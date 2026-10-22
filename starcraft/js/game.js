// One match: runs the engine at Brood War's "Fastest" speed, draws the original 640x480 screen
// (map view plus console), and turns mouse and keyboard input into commands. Commands never touch
// the game directly; they go to the lockstep (solo: run on the next frame; online: run on both
// computers on the same frame).
import { commandCard, MESSAGES } from './units.js';
import { SCREEN, MINIMAP, COLOR } from './console-ui.js';
import { Orders } from './bw-ids.js';

export const FRAME_MS = 42;
const SCROLL_SPEED = 0.7; // map pixels per ms with the arrow keys or the screen edge
const RACES = ['zerg', 'terran', 'protoss'];
const PORTRAITS = new URL('assets/sc/portrait/', document.baseURI).href;

// Solo play: whatever the player commands runs on the next frame.
export class SoloLockstep {
  constructor(slot) { this.slot = slot; this.queue = []; }
  submit(bytes) { this.queue.push(bytes); }
  ready() { return true; }
  take() { const q = this.queue.map((bytes) => ({ slot: this.slot, bytes })); this.queue = []; return q; }
}

export class Game {
  constructor({ engine, ui, sound, me, slots, lockstep, race = 1, cheats = false, onEnd }) {
    Object.assign(this, { engine, ui, sound, me, slots, lockstep, race, cheats, onEnd });
    this.canvas = document.getElementById('view');
    this.canvas.width = SCREEN.w;
    this.canvas.height = SCREEN.h;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.image = new ImageData(SCREEN.w, SCREEN.h);
    this.map = document.createElement('canvas');
    this.view = { x: 0, y: 0 };
    this.keys = new Set();
    this.mode = null; // { kind: 'order', order } | { kind: 'build', type } while picking a target
    this.menu = null; // 'build' while the SCV build menu is open
    this.drag = null;
    this.markers = [];
    this.messages = [];
    this.selection = [];
    this.buttons = [];
    this.hoverPos = -1;
    this.pressedPos = -1;
    this.running = false;
    this.waiting = false;
    this.lastClick = { t: 0, x: 0, y: 0 };
    this.listeners = [];
    this.ui.setRace(RACES[race]);
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, preload: 'auto' });
    this.video.addEventListener('ended', () => this.portraitIdle());
    this.portraitSet = null;
    // Sounds from the simulation; flag 0x10 means "don't restart while it still plays".
    this.engine.onSound = (file, volume, pan, priority, flags) => this.sound.play(file, volume, pan, !!(flags & 0x10));
    this.alerts = { base: 0, forces: 0 };
    this.pings = [];
  }

  // ---- what the original announces: unit ready, job finished, research done, under attack, nukes ----

  handleEvents() {
    const now = performance.now();
    for (const e of this.engine.events()) {
      switch (e.kind) {
        case 'ready': {
          const t = this.engine.unitType(e.type);
          if (t.ready) this.sound.play(this.engine.soundFile(t.ready));
          break;
        }
        case 'built': this.sound.play('terran/scv/tscupd00.wav'); break;
        case 'addon': this.sound.play('terran/advisor/tadupd03.wav'); break;
        case 'research': this.sound.play('terran/advisor/tadupd02.wav'); break;
        case 'upgrade': this.sound.play('terran/advisor/tadupd06.wav'); break;
        case 'nukeready': this.sound.play('terran/advisor/tadupd07.wav'); break;
        case 'nuke': this.notice('nuke'); break;
        case 'attacked': {
          // A warning and a blink on the minimap, at most every 15 s for buildings and for units each,
          // and not for fights on screen.
          const kind = e.building ? 'base' : 'forces';
          const onScreen = e.x >= this.view.x && e.x < this.view.x + SCREEN.w && e.y >= this.view.y && e.y < this.view.y + SCREEN.h - 100;
          if (onScreen || now - this.alerts[kind] < 15000) break;
          this.alerts[kind] = now;
          this.sound.play(e.building ? 'terran/advisor/tadupd00.wav' : 'terran/advisor/tadupd01.wav');
          this.pings.push({ x: e.x, y: e.y, t: now, color: '#fc1010' });
          break;
        }
      }
    }
  }

  // ---- portrait: idle fidgets, talking when the unit answers ----

  playClip(file) {
    if (!file) return;
    this.video.src = PORTRAITS + file;
    this.video.play().catch(() => {});
  }

  portraitIdle() {
    const idle = this.portraitSet?.idle || [];
    // Mostly the plain idle loop, now and then one of the other fidgets.
    this.playClip(Math.random() < 0.8 || idle.length < 2 ? idle[0] : idle[1 + Math.floor(Math.random() * (idle.length - 1))]);
  }

  updatePortrait() {
    const u = this.selection[0];
    const index = u ? this.engine.unitType(u.type).portrait : -1;
    const set = index >= 0 && index < 65535 ? this.ui.meta.portraits?.[index] : null;
    if (set === this.portraitSet) return;
    this.portraitSet = set;
    if (set) this.portraitIdle();
    else this.video.removeAttribute('src');
  }

  portraitTalk() {
    const talk = this.portraitSet?.talk || [];
    if (talk.length) this.playClip(talk[Math.floor(Math.random() * talk.length)]);
  }

  start() {
    const home = this.engine.startLocation(this.me);
    this.resize();
    this.center(home.x, home.y);
    this.map.width = this.engine.mapTileWidth;
    this.map.height = this.engine.mapTileHeight;
    this.mapCtx = this.map.getContext('2d');
    this.miniImage = new ImageData(this.map.width, this.map.height);
    this.bindInput();
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.lastUi = 0;
    this.updateState();
    requestAnimationFrame((t) => this.tick(t));
  }

  stop() {
    this.running = false;
    for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts);
    this.listeners = [];
    this.canvas.style.cursor = '';
    this.video.pause();
    this.video.removeAttribute('src');
  }

  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn, opts]);
  }

  // ---- loop ----

  tick(now) {
    if (!this.running) return;
    const dt = Math.min(250, now - this.last);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    this.waiting = false;
    while (this.acc >= FRAME_MS && steps < 8) {
      if (!this.lockstep.ready(this.engine.frame)) { this.waiting = true; this.acc = Math.min(this.acc, FRAME_MS); break; }
      this.runFrame();
      this.acc -= FRAME_MS;
      steps++;
    }
    if (steps === 8) this.acc = 0;
    if (steps) this.handleEvents();
    this.scroll(dt);
    if (now - this.lastUi > 100) { this.lastUi = now; this.updateState(); }
    this.draw(now);
    requestAnimationFrame((t) => this.tick(t));
  }

  runFrame() {
    for (const { slot, bytes } of this.lockstep.take(this.engine.frame)) {
      this.engine.action(slot, bytes);
      // A recalled control group is chosen by the game; show what it picked.
      if (slot === this.me && bytes[0] === 19 && bytes[1] === 1) this.engine.syncSelection();
    }
    this.engine.step();
    this.lockstep.afterStep?.(this.engine);
  }

  send(bytes) {
    if (bytes) this.lockstep.submit(bytes);
  }

  // ---- screen ----

  // The 640x480 screen is scaled to fit the window, keeping 4:3 (black bars on the sides).
  resize() {
    const scale = Math.min(window.innerWidth / SCREEN.w, window.innerHeight / SCREEN.h);
    if (scale === this.scale) return;
    this.scale = scale;
    this.canvas.style.width = `${Math.floor(SCREEN.w * scale)}px`;
    this.canvas.style.height = `${Math.floor(SCREEN.h * scale)}px`;
    this.cursorKey = null;
  }

  center(x, y) {
    this.view.x = x - SCREEN.w / 2;
    this.view.y = y - (SCREEN.h - 120) / 2;
  }

  // Page position -> screen pixel (0-639, 0-479).
  toScreen(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) * SCREEN.w / r.width), y: Math.floor((e.clientY - r.top) * SCREEN.h / r.height) };
  }

  toWorld(p) { return { x: Math.round(this.view.x + p.x), y: Math.round(this.view.y + p.y) }; }

  scroll(dt) {
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    // Screen-edge scrolling, only in full screen where the edge is the monitor's.
    this.edge = null;
    if (document.fullscreenElement && this.pointer && !this.drag) {
      const p = this.pointer;
      const ex = p.x <= 1 ? -1 : p.x >= SCREEN.w - 2 ? 1 : 0, ey = p.y <= 1 ? -1 : p.y >= SCREEN.h - 2 ? 1 : 0;
      dx += ex;
      dy += ey;
      if (ex || ey) this.edge = ['ul', 'u', 'ur', 'l', '', 'r', 'dl', 'd', 'dr'][(ey + 1) * 3 + ex + 1];
    }
    this.view.x += Math.sign(dx) * SCROLL_SPEED * dt;
    this.view.y += Math.sign(dy) * SCROLL_SPEED * dt;
  }

  draw(now) {
    this.resize();
    const v = this.engine.render(this.image, this.view.x, this.view.y);
    this.view.x = v.x;
    this.view.y = v.y;
    const ctx = this.ctx;
    ctx.putImageData(this.image, 0, 0);
    const sx = (x) => x - this.view.x, sy = (y) => y - this.view.y;

    // Where a right click or order went.
    this.markers = this.markers.filter((m) => now - m.t < 300);
    for (const m of this.markers) {
      const k = 1 - (now - m.t) / 300;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx(m.x) + 0.5, sy(m.y) + 0.5, 3 + 9 * k, 2 + 6 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Building placement (and landing): the footprint in green where it fits, red where it does not.
    if ((this.mode?.kind === 'build' || this.mode?.kind === 'land') && this.pointer && !this.ui.onConsole(this.pointer.x, this.pointer.y)) {
      const w = this.toWorld(this.pointer);
      const t = this.engine.unitType(this.mode.type);
      const tx = Math.round((w.x - t.w / 2) / 32), ty = Math.round((w.y - t.h / 2) / 32);
      const tw = Math.ceil(t.w / 32), th = Math.ceil(t.h / 32);
      const ok = this.mode.kind === 'land' ? this.engine.canLand(tx, ty) : this.engine.canPlace(this.mode.type, tx, ty);
      ctx.fillStyle = ok ? 'rgba(24,252,16,0.35)' : 'rgba(252,16,16,0.4)';
      ctx.fillRect(sx(tx * 32), sy(ty * 32), tw * 32, th * 32);
    }

    if (this.drag?.moved) {
      ctx.strokeStyle = '#18fc10';
      ctx.lineWidth = 1;
      const a = { x: sx(Math.min(this.drag.x0, this.drag.x1)), y: sy(Math.min(this.drag.y0, this.drag.y1)) };
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, Math.abs(this.drag.x1 - this.drag.x0), Math.abs(this.drag.y1 - this.drag.y0));
    }

    this.engine.renderMinimap(this.miniImage);
    this.mapCtx.putImageData(this.miniImage, 0, 0);
    this.messages = this.messages.filter((m) => now - m.t < 6000);
    const secs = Math.floor(this.engine.frame * FRAME_MS / 1000);
    this.ui.draw(ctx, {
      me: this.me,
      raceIndex: this.race,
      player: this.playerState,
      selection: this.selection,
      buttons: this.buttons,
      hoverPos: this.hoverPos,
      pressedPos: this.pressedPos,
      activeButton: this.mode?.button,
      minimap: this.map,
      pings: (this.pings = this.pings.filter((p) => now - p.t < 3000)),
      now,
      minimapSize: { w: this.map.width, h: this.map.height },
      viewRect: { x: this.view.x, y: this.view.y, w: SCREEN.w, h: SCREEN.h },
      messages: [
        ...this.messages,
        ...(this.waiting ? [{ text: 'Waiting for opponent...', color: COLOR.yellow }] : []),
        ...(this.banner ? [{ text: this.banner, color: COLOR.yellow }] : []),
      ],
      clock: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      portrait: this.video,
      techIcon: (id) => this.engine.tech(id).icon,
      upgradeIcon: (id) => this.engine.upgrade(id, this.me).icon,
      drawIcon: (c, frame, x, y, row, w, h) => {
        const icon = this.engine.icon(frame, row);
        if (w) c.drawImage(icon, (icon.width - w) / 2, (icon.height - h) / 2, w, h, x, y, w, h);
        else c.drawImage(icon, x, y);
      },
    });
    this.updateCursor(now);
  }

  // The original cursors: arrow, green/yellow/red magnifier over own/neutral/enemy units,
  // crosshair while targeting, scroll arrows at the edge.
  updateCursor(now) {
    let name = 'arrow';
    if (this.edge) name = `scroll${this.edge}`;
    else if (this.mode) name = this.mode.kind === 'order' ? 'targg' : 'arrow';
    else if (this.drag?.moved) name = 'drag';
    else if (this.hoverUnit) name = this.hoverUnit.owner === this.me ? 'magg' : this.hoverUnit.owner >= 8 ? 'magy' : 'magr';
    const frames = this.ui.meta.sheets[`cursor-${name}`]?.frames.length || 1;
    const frame = Math.floor(now / 100) % frames;
    const key = `${name}:${frame}:${this.scale}`;
    if (key !== this.cursorKey) {
      this.cursorKey = key;
      this.canvas.style.cursor = this.ui.cursorCss(name, frame, this.scale);
    }
  }

  // ---- state for the panels ----

  updateState() {
    this.playerState = this.engine.player(this.me);
    this.selection = this.engine.selectionFull();
    this.updatePortrait();
    const mine = this.selection.filter((u) => u.owner === this.me);
    this.buttons = mine.length && mine.length === this.selection.length ? commandCard(mine, this.menu, this) : [];
    if (this.pointer && !this.ui.onConsole(this.pointer.x, this.pointer.y)) {
      const w = this.toWorld(this.pointer);
      this.hoverUnit = this.engine.unitAt(w.x, w.y);
    } else {
      this.hoverUnit = null;
    }
    this.checkEnd();
  }

  // A line in the message area: a MESSAGES key (original text and advisor voice) or plain text.
  notice(what) {
    const m = MESSAGES[what];
    const text = m ? m.text ?? this.ui.meta.strings[m.str] : what;
    if (m?.voice) this.sound.play(m.voice, 100, 0, true);
    this.messages.push({ text, t: performance.now() });
    this.messages = this.messages.slice(-4);
  }

  // Why something costing `cost` ({ minerals, gas, supply }, or a unit type) cannot be paid, if so.
  needResources(cost) {
    const t = typeof cost === 'number' ? this.engine.unitType(cost) : cost, p = this.playerState || this.engine.player(this.me);
    if (p.minerals < t.minerals) return 'minerals';
    if (p.gas < t.gas) return 'gas';
    if (t.supply > 0 && p.supplyUsed + t.supply > p.supplyMax) return 'supply';
    return null;
  }

  // ---- commands from buttons and clicks ----

  press(b) {
    this.sound.unlock();
    if (b.enabled === false) return;
    b.run();
    this.updateState();
  }

  target(kind, extra) {
    this.mode = { kind, ...extra };
  }

  issueAt(world, queue) {
    const m = this.mode;
    this.mode = null;
    if (m.kind === 'order') {
      this.send(this.engine.cmd.order(m.order, world.x, world.y, queue));
      this.markers.push({ ...world, t: performance.now(), color: m.order === Orders.AttackDefault ? '#fc1010' : '#18fc10' });
      this.acknowledge();
    } else if (m.kind === 'land') {
      const t = this.engine.unitType(m.type);
      const tx = Math.round((world.x - t.w / 2) / 32), ty = Math.round((world.y - t.h / 2) / 32);
      if (!this.engine.canLand(tx, ty)) { this.notice('landing'); this.mode = m; return; }
      this.send(this.engine.cmd.land(tx, ty));
    } else if (m.kind === 'build') {
      const t = this.engine.unitType(m.type);
      const tx = Math.round((world.x - t.w / 2) / 32), ty = Math.round((world.y - t.h / 2) / 32);
      if (!this.engine.canPlace(m.type, tx, ty)) { this.notice('location'); this.mode = m; return; }
      const why = this.needResources(m.type);
      if (why) { this.notice(why); return; }
      this.send(this.engine.cmd.build(m.type, tx, ty));
      this.menu = null;
      this.acknowledge();
    }
  }

  rightClick(world, queue) {
    if (this.mode) { this.mode = null; return; }
    if (!this.selection.some((u) => u.owner === this.me)) return;
    this.send(this.engine.cmd.rightClick(world.x, world.y, queue));
    this.markers.push({ ...world, t: performance.now(), color: '#18fc10' });
    this.acknowledge();
  }

  // Unit voices: "what" when selected, "yes" when ordered.
  voice(kind) {
    const u = this.selection.find((x) => x.owner === this.me);
    if (!u) return;
    const t = this.engine.unitType(u.type);
    const [a, b] = t[kind] || [0, 0];
    if (!a) return;
    this.sound.play(this.engine.soundFile(a + Math.floor(Math.random() * (b - a + 1))), 100, 0, true);
  }

  acknowledge() { this.voice('yes'); this.portraitTalk(); }

  selectAt(world0, world1, shift, sameType) {
    const n = this.engine.select(world0.x, world0.y, world1.x, world1.y, shift, sameType);
    this.menu = null;
    this.send(this.engine.cmd.select());
    this.updateState();
    if (n) { this.voice('what'); this.portraitTalk(); }
  }

  // ---- input ----

  minimapWorld(p) {
    const r = this.ui.minimapRect;
    if (!r) return null;
    const x = Math.max(0, Math.min(r.w - 1, p.x - r.x)), y = Math.max(0, Math.min(r.h - 1, p.y - r.y));
    return { x: Math.round(x / r.scale * 32), y: Math.round(y / r.scale * 32) };
  }

  inMinimap(p) {
    const r = this.ui.minimapRect;
    return r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  }

  bindInput() {
    const view = this.canvas;
    this.on(window, 'resize', () => this.resize());
    this.on(view, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'pointermove', (e) => {
      const p = this.toScreen(e);
      this.pointer = p;
      this.hoverPos = this.ui.cardAt(p.x, p.y);
      if (this.hoverPos >= 0 && !this.buttons.some((b) => b.pos === this.hoverPos)) this.hoverPos = -1;
      if (this.miniDrag) { const w = this.minimapWorld(p); this.center(w.x, w.y); }
      if (this.drag) {
        const w = this.toWorld(p);
        this.drag.x1 = w.x;
        this.drag.y1 = w.y;
        if (Math.abs(this.drag.x1 - this.drag.x0) > 4 || Math.abs(this.drag.y1 - this.drag.y0) > 4) this.drag.moved = true;
      }
    });
    this.on(view, 'pointerdown', (e) => {
      e.preventDefault();
      this.sound.unlock();
      const p = this.toScreen(e);
      this.pointer = p;
      if (this.inMinimap(p)) {
        const w = this.minimapWorld(p);
        if (e.button === 2) { this.rightClick(w, e.shiftKey); return; }
        if (this.mode) { this.issueAt(w, e.shiftKey); return; }
        view.setPointerCapture(e.pointerId);
        this.miniDrag = true;
        this.center(w.x, w.y);
        return;
      }
      const pos = this.ui.cardAt(p.x, p.y);
      const button = this.buttons.find((b) => b.pos === pos);
      if (button && e.button === 0) { this.pressedPos = pos; view.setPointerCapture(e.pointerId); return; }
      const passenger = this.ui.passengerAt(p.x, p.y);
      if (passenger != null && e.button === 0) { this.send(this.engine.cmd.unload(passenger)); return; }
      if (this.ui.onConsole(p.x, p.y)) return;
      const w = this.toWorld(p);
      if (e.button === 2) { this.rightClick(w, e.shiftKey); return; }
      if (e.button !== 0) return;
      if (this.mode) { this.issueAt(w, e.shiftKey); return; }
      view.setPointerCapture(e.pointerId);
      this.drag = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, moved: false };
    });
    this.on(view, 'pointerup', (e) => {
      if (e.button !== 0) return;
      this.miniDrag = false;
      if (this.pressedPos >= 0) {
        const p = this.toScreen(e);
        const pos = this.pressedPos;
        this.pressedPos = -1;
        const b = this.buttons.find((x) => x.pos === pos);
        if (b && this.ui.cardAt(p.x, p.y) === pos) this.press(b);
        return;
      }
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      const now = performance.now();
      const dbl = !d.moved && now - this.lastClick.t < 350 && Math.abs(this.lastClick.x - d.x0) < 8 && Math.abs(this.lastClick.y - d.y0) < 8;
      this.lastClick = { t: now, x: d.x0, y: d.y0 };
      this.selectAt({ x: d.x0, y: d.y0 }, d.moved ? { x: d.x1, y: d.y1 } : { x: d.x0, y: d.y0 }, e.shiftKey, dbl || e.ctrlKey);
    });
    this.on(window, 'keydown', (e) => this.key(e, true));
    this.on(window, 'keyup', (e) => this.key(e, false));
    this.on(window, 'blur', () => this.keys.clear());
  }

  key(e, down) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code.startsWith('Arrow')) {
      e.preventDefault();
      if (down) this.keys.add(e.code); else this.keys.delete(e.code);
      return;
    }
    if (!down) return;
    // Solo testing: F9 gives 10000 minerals and gas and turns on fast building (the original's
    // "show me the money" and "operation cwal"). F9 has no other use in the original.
    if (e.code === 'F9' && this.cheats) {
      e.preventDefault();
      this.engine.M._bw_enable_cheats(1);
      this.send(Uint8Array.of(18, 0x12, 0, 0, 0));
      this.notice('Cheat enabled.');
      return;
    }
    if (e.code === 'Escape') {
      if (this.mode) { this.mode = null; return; }
      const b = this.buttons.find((x) => x.key === 'Esc');
      if (b) { this.press(b); return; }
      if (this.menu) { this.menu = null; this.updateState(); return; }
      this.onEnd?.('menu');
      return;
    }
    const digit = e.code.match(/^Digit(\d)$/)?.[1];
    if (digit != null) {
      e.preventDefault();
      const n = Number(digit);
      if (e.ctrlKey || e.metaKey) this.send(this.engine.cmd.group(0, n));
      else if (e.shiftKey) this.send(this.engine.cmd.group(2, n));
      else {
        this.send(this.engine.cmd.group(1, n));
        // Pressing the number twice quickly jumps the view to the group.
        const now = performance.now();
        const jump = this.lastGroup?.n === n && now - this.lastGroup.t < 400;
        this.lastGroup = { n, t: now };
        setTimeout(() => {
          this.updateState();
          if (jump && this.selection[0]) this.center(this.selection[0].x, this.selection[0].y);
        }, FRAME_MS * 3);
      }
      return;
    }
    const letter = e.code.match(/^Key([A-Z])$/)?.[1];
    if (letter && !e.ctrlKey && !e.metaKey) {
      const b = this.buttons.find((x) => x.key === letter);
      if (b) { e.preventDefault(); this.press(b); }
    }
  }

  // ---- end of game ----

  checkEnd() {
    if (this.ended || this.engine.frame < 24) return;
    const mine = this.engine.player(this.me);
    const others = this.slots.filter((s) => s !== this.me).map((s) => this.engine.player(s));
    if (mine.units === 0) this.finish(false);
    else if (others.length && others.every((p) => p.units === 0)) this.finish(true);
  }

  finish(won) {
    this.ended = true;
    this.onEnd?.(won ? 'victory' : 'defeat');
  }
}
