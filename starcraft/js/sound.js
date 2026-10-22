// Plays the original WAV sounds (assets/sc/sound/) through Web Audio. Files load on first use;
// like the original, at most 8 play at once and a sound does not restart within 80 ms.
const BASE = new URL('assets/sc/sound/', document.baseURI).href;
const CHANNELS = 8;

export class Sound {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.playing = [];
    this.lastPlayed = new Map();
    this.volume = 0.6;
  }

  // Browsers only allow audio after a user gesture; call from one.
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  load(file) {
    const key = file.toLowerCase().replace(/\\/g, '/');
    if (!this.buffers.has(key)) {
      this.buffers.set(key, fetch(BASE + key)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((b) => this.ctx.decodeAudioData(b))
        .catch(() => null));
    }
    return this.buffers.get(key);
  }

  // volume 0-100, pan -100..100. `exclusive` skips the sound while the same one still plays.
  async play(file, volume = 100, pan = 0, exclusive = false) {
    if (!this.ctx || !file) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(file) || 0) < 80) return;
    this.lastPlayed.set(file, now);
    this.playing = this.playing.filter((p) => !p.done);
    if (exclusive && this.playing.some((p) => p.file === file)) return;
    if (this.playing.length >= CHANNELS) return;
    const entry = { file, done: false };
    this.playing.push(entry);
    const buffer = await this.load(file);
    if (!buffer) { entry.done = true; return; }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume / 100));
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan / 100)) * 0.6;
    src.connect(gain).connect(panner).connect(this.master);
    src.onended = () => { entry.done = true; };
    src.start();
  }
}
