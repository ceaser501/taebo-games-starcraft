// One match: runs the engine at Brood War's "Fastest" speed, draws the view, and turns mouse and
// keyboard input into commands. Commands never touch the game directly; they go to the lockstep
// (solo: run on the next frame; online: run on both computers on the same frame).
import { names, commandCard } from './units.js';

export const FRAME_MS = 42;
const VIEW_LINES = 480; // the original screen height; the view scales so this many lines fit
const SCROLL_SPEED = 0.9; // map pixels per screen ms with the arrow keys
const ORDER = { move: 6, attack: 14, patrol: 152, gather: 79, repair: 34 };
const RACE_NAMES = ['저그', '테란', '프로토스'];

const $ = (id) => document.getElementById(id);

// Solo play: whatever the player commands runs on the next frame.
export class SoloLockstep {
  constructor(slot) { this.slot = slot; this.queue = []; }
  submit(bytes) { this.queue.push(bytes); }
  ready() { return true; }
  take() { const q = this.queue.map((bytes) => ({ slot: this.slot, bytes })); this.queue = []; return q; }
}

export class Game {
  constructor({ engine, sound, me, slots, lockstep, onEnd }) {
    Object.assign(this, { engine, sound, me, slots, lockstep, onEnd });
    this.canvas = $('view');
    this.ctx = this.canvas.getContext('2d');
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.view = { x: 0, y: 0 };
    this.keys = new Set();
    this.mode = null; // { kind: 'order', order } | { kind: 'build', type } while picking a target
    this.menu = null; // 'build' while the SCV build menu is open
    this.drag = null;
    this.markers = [];
    this.notices = [];
    this.selection = [];
    this.running = false;
    this.waiting = false;
    this.lastClick = { t: 0, x: 0, y: 0 };
    this.listeners = [];
  }

  start() {
    const home = this.engine.startLocation(this.me);
    this.resize();
    this.center(home.x, home.y);
    this.mini.width = this.engine.mapTileWidth;
    this.mini.height = this.engine.mapTileHeight;
    this.miniImage = new ImageData(this.mini.width, this.mini.height);
    this.bindInput();
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.lastUi = 0;
    requestAnimationFrame((t) => this.tick(t));
  }

  stop() {
    this.running = false;
    for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts);
    this.listeners = [];
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
    this.scroll(dt);
    this.draw(now);
    if (now - this.lastUi > 100) { this.lastUi = now; this.updateUi(); }
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

  // ---- view ----

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.scale = Math.max(1, h / VIEW_LINES);
    const vw = Math.round(w / this.scale), vh = Math.round(h / this.scale);
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw;
      this.canvas.height = vh;
      this.image = new ImageData(vw, vh);
    }
    document.documentElement.style.setProperty('--ui-scale', String(this.scale));
  }

  center(x, y) {
    this.view.x = x - this.canvas.width / 2;
    this.view.y = y - (this.canvas.height - 110) / 2;
  }

  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.round(this.view.x + (e.clientX - r.left) * this.canvas.width / r.width),
      y: Math.round(this.view.y + (e.clientY - r.top) * this.canvas.height / r.height),
    };
  }

  scroll(dt) {
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    // Screen-edge scrolling, only in full screen where the edge is the monitor's.
    if (document.fullscreenElement && this.pointer && !this.drag) {
      const m = 2;
      if (this.pointer.x <= m) dx -= 1;
      if (this.pointer.x >= window.innerWidth - 1 - m) dx += 1;
      if (this.pointer.y <= m) dy -= 1;
      if (this.pointer.y >= window.innerHeight - 1 - m) dy += 1;
    }
    this.view.x += dx * SCROLL_SPEED * dt;
    this.view.y += dy * SCROLL_SPEED * dt;
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

    if (this.drag?.moved) {
      ctx.strokeStyle = '#18fc10';
      ctx.lineWidth = 1;
      const x0 = Math.min(this.drag.x0, this.drag.x1), y0 = Math.min(this.drag.y0, this.drag.y1);
      ctx.strokeRect(sx(x0) + 0.5, sy(y0) + 0.5, Math.abs(this.drag.x1 - this.drag.x0), Math.abs(this.drag.y1 - this.drag.y0));
    }

    // Building placement: the footprint in green where it fits, red where it does not.
    if (this.mode?.kind === 'build' && this.pointerWorld) {
      const t = this.engine.unitType(this.mode.type);
      const tx = Math.round((this.pointerWorld.x - t.w / 2) / 32), ty = Math.round((this.pointerWorld.y - t.h / 2) / 32);
      const tw = Math.ceil(t.w / 32), th = Math.ceil(t.h / 32);
      const ok = this.engine.canPlace(this.mode.type, tx, ty);
      this.mode.tile = { tx, ty, ok };
      ctx.fillStyle = ok ? 'rgba(24,252,16,0.35)' : 'rgba(252,16,16,0.4)';
      ctx.fillRect(sx(tx * 32), sy(ty * 32), tw * 32, th * 32);
      ctx.strokeStyle = ok ? '#18fc10' : '#fc1010';
      ctx.strokeRect(sx(tx * 32) + 0.5, sy(ty * 32) + 0.5, tw * 32 - 1, th * 32 - 1);
    }

    this.engine.renderMinimap(this.miniImage);
    this.miniCtx.putImageData(this.miniImage, 0, 0);
    // The minimap's view rectangle.
    this.miniCtx.strokeStyle = '#fff';
    this.miniCtx.lineWidth = 1;
    this.miniCtx.strokeRect(this.view.x / 32 + 0.5, this.view.y / 32 + 0.5, this.canvas.width / 32, this.canvas.height / 32);

    this.canvas.style.cursor = this.mode ? 'crosshair' : '';
  }

  // ---- panels ----

  notice(text) {
    this.notices.push({ text, t: performance.now() });
    this.notices = this.notices.slice(-3);
    this.renderNotices();
  }

  renderNotices() {
    const now = performance.now();
    this.notices = this.notices.filter((n) => now - n.t < 4000);
    $('notices').replaceChildren(...this.notices.map((n) => Object.assign(document.createElement('div'), { textContent: n.text })));
  }

  updateUi() {
    const p = this.engine.player(this.me);
    this.playerState = p;
    $('minerals').textContent = p.minerals;
    $('gas').textContent = p.gas;
    $('supply').textContent = `${p.supplyUsed}/${p.supplyMax}`;
    $('supply').classList.toggle('full', p.supplyUsed >= p.supplyMax);
    this.selection = this.engine.selection();
    this.renderInfo();
    this.renderCard();
    this.renderNotices();
    const secs = Math.floor(this.engine.frame * FRAME_MS / 1000);
    $('clock').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('waiting').hidden = !this.waiting;
    this.checkEnd();
  }

  renderInfo() {
    const sel = this.selection;
    const box = $('info');
    if (!sel.length) { box.replaceChildren(); return; }
    if (sel.length > 1) {
      // Several units: their icons with health colour, like the original's wireframe grid.
      box.replaceChildren(...sel.map((u) => {
        const c = document.createElement('div');
        c.className = 'cell';
        c.append(this.iconCopy(u.type));
        const hp = u.hp / u.maxHp;
        c.style.setProperty('--hp', hp > 0.66 ? '#18fc10' : hp > 0.33 ? '#fcfc38' : '#fc1010');
        return c;
      }));
      box.className = 'group';
      return;
    }
    const u = sel[0];
    box.className = 'single';
    const lines = [];
    lines.push(`<b>${names[u.type] ?? `유닛 ${u.type}`}</b>`);
    if (u.resources >= 0) lines.push(`남은 자원 ${u.resources}`);
    else if (u.maxHp > 0) lines.push(`${u.hp} / ${u.maxHp}`);
    if (u.owner !== this.me && u.owner < 8) lines.push('<span class="enemy">상대</span>');
    if (u.progress >= 0) {
      const what = u.completed ? (u.queue[0] != null ? names[u.queue[0]] : '') : '건설 중';
      lines.push(`<div class="progress"><i style="width:${u.progress}%"></i></div><small>${what}</small>`);
    }
    box.innerHTML = lines.join('<br>');
    if (u.queue.length && u.owner === this.me) {
      const q = document.createElement('div');
      q.className = 'queue';
      u.queue.forEach((type, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = '취소';
        b.append(this.iconCopy(type));
        b.onclick = () => this.send(this.engine.cmd.cancelQueue(i));
        q.append(b);
      });
      box.append(q);
    }
  }

  // A fresh canvas with an icon on it (a canvas element can only sit in one place).
  iconCopy(frame, row = 0, set = 0) {
    const icon = this.engine.icon(frame, row, set);
    const c = document.createElement('canvas');
    c.width = icon.width;
    c.height = icon.height;
    c.getContext('2d').drawImage(icon, 0, 0);
    return c;
  }

  // The 3x3 command card for what is selected.
  buttons() {
    const mine = this.selection.filter((u) => u.owner === this.me);
    if (!mine.length || mine.length !== this.selection.length) return [];
    return commandCard(mine, this.menu, this);
  }

  renderCard() {
    const list = this.buttons();
    this.cardButtons = list;
    const card = $('card');
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const b = list.find((x) => x.pos === i);
      const el = document.createElement('button');
      el.type = 'button';
      if (b) {
        const enabled = b.enabled !== false;
        el.append(this.iconCopy(b.icon, enabled ? 0 : 1));
        el.title = `${b.label} (${b.key})${b.cost ? ` - ${b.cost}` : ''}`;
        el.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); this.press(b); };
        el.classList.toggle('active', !!(this.mode && this.mode.button === b.id));
      } else {
        el.disabled = true;
      }
      cells.push(el);
    }
    card.replaceChildren(...cells);
  }

  press(b) {
    this.sound.unlock();
    if (b.enabled === false) { if (b.why) this.notice(b.why); return; }
    b.run();
    this.updateUi();
  }

  // ---- commands from buttons and clicks ----

  needResources(type) {
    const t = this.engine.unitType(type), p = this.playerState || this.engine.player(this.me);
    if (p.minerals < t.minerals) return '미네랄이 부족합니다.';
    if (p.gas < t.gas) return '베스핀 가스가 부족합니다.';
    if (t.supply > 0 && p.supplyUsed + t.supply > p.supplyMax) return '보급품이 부족합니다. 서플라이 디포를 더 지으세요.';
    return null;
  }

  target(kind, extra) {
    this.mode = { kind, ...extra };
  }

  issueAt(world, queue) {
    const m = this.mode;
    this.mode = null;
    if (m.kind === 'order') {
      this.send(this.engine.cmd.order(m.order, world.x, world.y, queue));
      this.markers.push({ ...world, t: performance.now(), color: m.order === ORDER.attack ? '#fc1010' : '#18fc10' });
      this.acknowledge();
    } else if (m.kind === 'build') {
      const t = this.engine.unitType(m.type);
      const tx = Math.round((world.x - t.w / 2) / 32), ty = Math.round((world.y - t.h / 2) / 32);
      if (!this.engine.canPlace(m.type, tx, ty)) { this.notice('여기에는 지을 수 없습니다.'); this.mode = m; return; }
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

  acknowledge() { this.voice('yes'); }

  selectAt(world0, world1, shift, sameType) {
    const n = this.engine.select(world0.x, world0.y, world1.x, world1.y, shift, sameType);
    this.menu = null;
    this.send(this.engine.cmd.select());
    this.selection = this.engine.selection();
    if (n) this.voice('what');
    this.renderInfo();
    this.renderCard();
  }

  // ---- input ----

  bindInput() {
    const view = this.canvas;
    this.on(window, 'resize', () => this.resize());
    this.on(view, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.pointerWorld = this.toWorld(e);
      if (this.drag) {
        this.drag.x1 = this.pointerWorld.x;
        this.drag.y1 = this.pointerWorld.y;
        if (Math.abs(this.drag.x1 - this.drag.x0) > 4 || Math.abs(this.drag.y1 - this.drag.y0) > 4) this.drag.moved = true;
      }
    });
    this.on(view, 'pointerdown', (e) => {
      this.sound.unlock();
      const w = this.toWorld(e);
      if (e.button === 2) { this.rightClick(w, e.shiftKey); return; }
      if (e.button !== 0) return;
      if (this.mode) { this.issueAt(w, e.shiftKey); return; }
      view.setPointerCapture(e.pointerId);
      this.drag = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, moved: false };
    });
    this.on(view, 'pointerup', (e) => {
      if (e.button !== 0 || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      const now = performance.now();
      const dbl = !d.moved && now - this.lastClick.t < 350 && Math.abs(this.lastClick.x - d.x0) < 8 && Math.abs(this.lastClick.y - d.y0) < 8;
      this.lastClick = { t: now, x: d.x0, y: d.y0 };
      this.selectAt({ x: d.x0, y: d.y0 }, d.moved ? { x: d.x1, y: d.y1 } : { x: d.x0, y: d.y0 }, e.shiftKey, dbl || e.ctrlKey);
    });

    // Minimap: left button moves the view (drag to keep moving), right button orders there.
    const miniWorld = (e) => {
      const r = this.mini.getBoundingClientRect();
      return { x: Math.round((e.clientX - r.left) / r.width * this.engine.mapWidth), y: Math.round((e.clientY - r.top) / r.height * this.engine.mapHeight) };
    };
    this.on(this.mini, 'contextmenu', (e) => e.preventDefault());
    this.on(this.mini, 'pointerdown', (e) => {
      e.preventDefault();
      this.sound.unlock();
      const w = miniWorld(e);
      if (e.button === 2) { this.rightClick(w, e.shiftKey); return; }
      if (this.mode) { this.issueAt(w, e.shiftKey); return; }
      this.mini.setPointerCapture(e.pointerId);
      this.miniDrag = true;
      this.center(w.x, w.y);
    });
    this.on(this.mini, 'pointermove', (e) => { if (this.miniDrag) { const w = miniWorld(e); this.center(w.x, w.y); } });
    this.on(this.mini, 'pointerup', () => { this.miniDrag = false; });

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
    if (e.code === 'Escape') {
      if (this.mode) { this.mode = null; return; }
      const b = this.cardButtons?.find((x) => x.key === 'Esc');
      if (b) { this.press(b); return; }
      if (this.menu) { this.menu = null; this.renderCard(); return; }
      this.onEnd?.('menu');
      return;
    }
    const digit = e.code.match(/^Digit(\d)$/)?.[1];
    if (digit != null) {
      e.preventDefault();
      const n = Number(digit);
      if (e.ctrlKey || e.metaKey) { this.send(this.engine.cmd.group(0, n)); this.notice(`${n}번 부대 지정`); } else if (e.shiftKey) this.send(this.engine.cmd.group(2, n));
      else {
        this.send(this.engine.cmd.group(1, n));
        // Pressing the number twice quickly jumps the view to the group.
        const now = performance.now();
        if (this.lastGroup?.n === n && now - this.lastGroup.t < 400) this.jumpToSelection = true;
        this.lastGroup = { n, t: now };
        setTimeout(() => {
          this.selection = this.engine.selection();
          if (this.jumpToSelection && this.selection[0]) this.centerOnSelection();
          this.jumpToSelection = false;
        }, FRAME_MS * 3);
      }
      return;
    }
    const letter = e.code.match(/^Key([A-Z])$/)?.[1];
    if (letter && !e.ctrlKey && !e.metaKey) {
      const b = this.cardButtons?.find((x) => x.key === letter);
      if (b) { e.preventDefault(); this.press(b); }
    }
  }

  centerOnSelection() {
    const u = this.selection[0];
    if (!u) return;
    this.center(u.x, u.y);
  }

  // ---- end of game ----

  checkEnd() {
    if (this.ended) return;
    const mine = this.engine.player(this.me);
    const others = this.slots.filter((s) => s !== this.me).map((s) => this.engine.player(s));
    if (this.engine.frame < 24) return;
    if (mine.units === 0) this.finish(false);
    else if (others.length && others.every((p) => p.units === 0)) this.finish(true);
  }

  finish(won) {
    this.ended = true;
    this.onEnd?.(won ? 'victory' : 'defeat');
  }
}

export { ORDER, RACE_NAMES };
