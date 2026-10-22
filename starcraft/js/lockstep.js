// Lockstep for two players: only commands travel, and both computers run every command on the same
// game frame, so the (deterministic) engine produces the same game on both.
//
// Time is cut into turns of TURN frames. Commands given during turn k are sent as one packet that
// runs at turn k + DELAY on both sides; a turn may only start once both packets for it are in.
// Every packet is sent even when empty, so a missing one means "wait". Each packet also repeats
// the previous turn's commands, so a single lost message costs nothing; packets are kept and sent
// again when the other side asks (after several lost messages or a short disconnect).
// Every HASH_EVERY frames each side hashes its game state and sends it along; a mismatch means the
// games have drifted apart (a bug), which the page reports.
export const TURN = 2;          // frames per turn (84 ms)
export const DELAY = 4;         // turns between giving a command and running it (~340 ms)
const HASH_EVERY = 48;          // frames between state checks (~2 s)
const RESEND_AFTER = 250;       // ms to wait for a packet before asking for it again

const encode = (bytes) => btoa(String.fromCharCode(...bytes));
const decode = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export class NetLockstep {
  // me: this player's index (0 host, 1 guest); slots: the game slot of each player index.
  constructor({ net, me, slots, onDesync }) {
    Object.assign(this, { net, me, slots, onDesync });
    this.other = 1 - me;
    this.local = [];
    this.packets = [new Map(), new Map()]; // per player: turn -> [bytes]
    this.sent = new Map();                 // turn -> message, for resending
    this.sentFor = -1;                     // last turn whose start produced our packet
    this.hashes = new Map();               // frame -> our hash
    this.theirHashes = new Map();          // frame -> their hash
    this.pendingHash = null;
    this.waitingSince = 0;
    this.lastRequest = 0;
    this.desynced = false;
    this.lastTaken = -1;
  }

  submit(bytes) { this.local.push(bytes); }

  ready(frame) {
    if (frame % TURN) return true;
    const turn = frame / TURN;
    if (this.sentFor < turn) this.flush(turn);
    if (turn < DELAY || this.packets[this.other].has(turn)) { this.waitingSince = 0; return true; }
    const now = performance.now();
    this.waitingSince ||= now;
    if (now - this.waitingSince > RESEND_AFTER && now - this.lastRequest > RESEND_AFTER) {
      this.lastRequest = now;
      this.net.send({ t: 'need', n: turn });
    }
    return false;
  }

  // Our commands so far become the packet for `turn + DELAY`.
  flush(turn) {
    this.sentFor = turn;
    const target = turn + DELAY;
    const msg = { t: 'turn', n: target, a: this.local.map(encode) };
    const prev = this.sent.get(target - 1);
    if (prev) msg.p = prev.a;
    if (this.pendingHash) { msg.h = this.pendingHash; this.pendingHash = null; }
    this.packets[this.me].set(target, this.local);
    this.local = [];
    this.sent.set(target, msg);
    this.sent.delete(target - 200);
    this.net.send(msg);
  }

  // The commands to run before `frame`, both players in a fixed order.
  take(frame) {
    if (frame % TURN) return [];
    const turn = frame / TURN;
    this.lastTaken = turn;
    const out = [];
    for (let p = 0; p < 2; p++) {
      for (const bytes of this.packets[p].get(turn) || []) out.push({ slot: this.slots[p], bytes });
      this.packets[p].delete(turn);
    }
    return out;
  }

  afterStep(engine) {
    const frame = engine.frame;
    if (frame % HASH_EVERY) return;
    const hash = engine.hash();
    this.hashes.set(frame, hash);
    this.hashes.delete(frame - HASH_EVERY * 50);
    this.pendingHash = [frame, hash];
    this.compare(frame);
  }

  compare(frame) {
    if (!this.hashes.has(frame) || !this.theirHashes.has(frame)) return;
    if (this.hashes.get(frame) !== this.theirHashes.get(frame) && !this.desynced) {
      this.desynced = true;
      this.onDesync?.(frame);
    }
    this.theirHashes.delete(frame);
  }

  receive(msg) {
    if (msg.t === 'turn') {
      const got = this.packets[this.other];
      if (msg.n > this.lastTaken && !got.has(msg.n)) got.set(msg.n, msg.a.map(decode));
      if (msg.p && msg.n - 1 > this.lastTaken && !got.has(msg.n - 1)) got.set(msg.n - 1, msg.p.map(decode));
      if (msg.h) {
        this.theirHashes.set(msg.h[0], msg.h[1]);
        this.compare(msg.h[0]);
      }
    } else if (msg.t === 'need') {
      // Send everything from the asked turn on that we still have.
      for (const [n, m] of this.sent) if (n >= msg.n) this.net.send(m);
    }
  }
}
