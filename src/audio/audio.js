// All sounds are made live by the phone's audio chip (Web Audio) — no sound files to download.
// Music: a gentle, never-ending kalimba tune that changes between day and night.
// Ambience: waves, the waterfall, rain, birds and crickets.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note number -> frequency
const DAY_CHORDS = [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 58]]; // Fmaj7 Dm7 Bbmaj7 C7
const NIGHT_CHORDS = [[50, 53, 57, 60], [46, 50, 53, 57], [53, 57, 60, 64], [45, 48, 52, 55]];
const SCALE = [65, 67, 69, 72, 74, 77, 79, 81]; // F major pentatonic-ish (F G A C D F G A)

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.8;
    this.night = 0;
    this.rain = 0;
    this.fallDist = 999;
    this.started = false;
    this.bar = 0;
    this.nextBar = 0;
  }

  // Browsers only allow sound after the player touches the screen.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.muted) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch { /* not supported */ }
    const ctx = new AC({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = this.sfxVol * 0.7;
    this.amb.connect(this.master);
    // a short echo for the music (makes it feel warm and roomy)
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.39;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2200;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.music);
    this.noise = this.makeNoise();
    this.startAmbience();
    this.started = true;
    this.setVolumes(this.musicVol, this.sfxVol);
    this.nextBar = ctx.currentTime + 0.3;
    this.timer = setInterval(() => this.schedule(), 120);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else if (!this.muted) this.ctx.resume().catch(() => {});
    });
  }

  makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  loop(filterType, freq, q = 0.7) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    return g;
  }

  startAmbience() {
    const ctx = this.ctx;
    this.waves = this.loop('lowpass', 520);
    this.waves.gain.value = 0.35;
    // slow swell of the waves
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = ctx.createGain();
    lg.gain.value = 0.18;
    lfo.connect(lg).connect(this.waves.gain);
    lfo.start();
    this.fall = this.loop('bandpass', 900, 0.5);
    this.rainG = this.loop('highpass', 2500, 0.3);
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    // both off? let the audio chip sleep completely (saves battery)
    this.muted = music <= 0.01 && sfx <= 0.01;
    if (this.muted) { this.ctx.suspend().catch(() => {}); return; }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(music * 0.5, t, 0.2);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.1);
    this.amb.gain.setTargetAtTime(sfx * 0.7, t, 0.2);
  }

  // called a few times a second with what's going on around the player
  setScene({ night, rain, fallDist }) {
    this.night = night;
    this.rain = rain;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.fall.gain.setTargetAtTime(Math.max(0, 1 - fallDist / 22) * 0.55, t, 0.5);
    this.rainG.gain.setTargetAtTime(rain * 0.22, t, 0.8);
  }

  // ---------------------------------------------------------------- music
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // birds by day, crickets at night
    if (Math.random() < (this.night < 0.5 ? 0.025 : 0.0)) this.chirp();
    if (this.night > 0.6 && Math.random() < 0.06) this.cricket();
    if (this.musicVol <= 0.01) { this.nextBar = ctx.currentTime + 0.5; return; }
    while (this.nextBar < ctx.currentTime + 0.6) {
      this.playBar(this.nextBar);
      const beat = this.night > 0.5 ? 0.92 : 0.79;
      this.nextBar += beat * 4;
      this.bar++;
    }
  }

  playBar(t0) {
    const night = this.night > 0.5;
    const chords = night ? NIGHT_CHORDS : DAY_CHORDS;
    const chord = chords[this.bar % 4];
    const beat = night ? 0.92 : 0.79;
    // soft pad
    for (const n of chord) this.pad(NOTE(n), t0, beat * 4, night ? 0.035 : 0.045);
    // bass
    this.pluck(NOTE(chord[0] - 12), t0, 0.07, 1.8, 'sine');
    if (!night) this.pluck(NOTE(chord[0] - 12), t0 + beat * 2, 0.05, 1.2, 'sine');
    // melody: a few kalimba notes picked from the scale, gently random
    const steps = night ? 4 : 8;
    let last = 3;
    for (let i = 0; i < steps; i++) {
      if (Math.random() < (night ? 0.45 : 0.55)) {
        last = Math.max(0, Math.min(SCALE.length - 1, last + Math.floor(Math.random() * 5) - 2));
        const tt = t0 + i * beat * (4 / steps);
        this.kalimba(NOTE(SCALE[last] + (night ? 12 : 0)), tt, night ? 0.05 : 0.065);
      }
    }
  }

  pad(f, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(filt).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kalimba(f, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o2.type = 'sine';
    o2.frequency.value = f * 4.02; // the little "tine" overtone
    const g = ctx.createGain(), g2 = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.4);
    g2.gain.setValueAtTime(vol * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    o.connect(g);
    o2.connect(g2);
    g.connect(this.music);
    g2.connect(this.music);
    g.connect(this.delay);
    o.start(t); o2.start(t);
    o.stop(t + 1.5); o2.stop(t + 0.2);
  }

  pluck(f, t, vol, dur, type = 'triangle', dest = this.music) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- sound effects
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  ok() { return this.ctx && this.ctx.state === 'running' && this.sfxVol > 0.01; }

  noiseHit(t, dur, freq, vol, type = 'bandpass', q = 1, dest = this.sfx) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  tone(f0, f1, t, dur, vol, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  step(surface) {
    if (!this.ok()) return;
    const t = this.now();
    if (surface === 'wood') this.noiseHit(t, 0.07, 700 + Math.random() * 200, 0.12, 'bandpass', 4);
    else if (surface === 'water') this.noiseHit(t, 0.16, 1500, 0.08, 'bandpass', 1.2);
    else this.noiseHit(t, 0.08, 2600 + Math.random() * 600, 0.035, 'highpass', 0.8);
  }
  ui(kind = 'tap') {
    if (!this.ok()) return;
    const t = this.now();
    if (kind === 'open') { this.tone(660, 880, t, 0.12, 0.08); this.tone(990, 1320, t + 0.06, 0.12, 0.05); }
    else if (kind === 'close') this.tone(700, 520, t, 0.1, 0.06);
    else if (kind === 'tick') this.tone(1200, 1100, t, 0.04, 0.04);
    else if (kind === 'error') { this.tone(300, 260, t, 0.15, 0.08, 'triangle'); this.tone(240, 200, t + 0.1, 0.18, 0.07, 'triangle'); }
    else this.tone(880, 990, t, 0.06, 0.06);
  }
  cast() { if (!this.ok()) return; const f = this.noiseHit(this.now(), 0.35, 800, 0.18, 'bandpass', 2); f.frequency.exponentialRampToValueAtTime(3000, this.now() + 0.3); }
  plop() { if (!this.ok()) return; const t = this.now(); this.tone(600, 140, t, 0.18, 0.2); this.noiseHit(t, 0.15, 1200, 0.06); }
  nibble() { if (!this.ok()) return; this.tone(900, 500, this.now(), 0.07, 0.07); }
  bite() {
    if (!this.ok()) return;
    const t = this.now();
    this.tone(500, 120, t, 0.25, 0.25);
    this.noiseHit(t, 0.25, 1400, 0.12);
    this.tone(1320, 1320, t + 0.05, 0.25, 0.08, 'triangle');
  }
  hook() { if (!this.ok()) return; const t = this.now(); this.tone(660, 990, t, 0.12, 0.1, 'triangle'); }
  reelClick() { if (!this.ok()) return; this.noiseHit(this.now(), 0.025, 3500, 0.05, 'highpass', 2); }
  splash() { if (!this.ok()) return; this.noiseHit(this.now(), 0.3, 1100, 0.14); }
  escape() { if (!this.ok()) return; const t = this.now(); this.tone(600, 300, t, 0.3, 0.1, 'triangle'); this.tone(450, 220, t + 0.15, 0.35, 0.08, 'triangle'); }
  catchJingle(rar) {
    if (!this.ok()) return;
    const t = this.now();
    const seq = rar === 'legendary' ? [72, 76, 79, 84, 88, 91] : rar === 'rare' ? [72, 76, 79, 84, 88] : rar === 'junk' ? [67, 64] : [72, 76, 79, 84];
    seq.forEach((n, i) => this.pluck(NOTE(n), t + i * 0.09, 0.12, 0.6, 'triangle', this.sfx));
    this.noiseHit(t, 0.4, 1000, 0.15);
  }
  coin() { if (!this.ok()) return; const t = this.now(); this.tone(1568, 1568, t, 0.12, 0.08, 'square'); this.tone(2093, 2093, t + 0.07, 0.25, 0.07, 'square'); }
  pop() { if (!this.ok()) return; const t = this.now(); this.tone(500, 1100, t, 0.09, 0.12); }
  rustle() { if (!this.ok()) return; const t = this.now(); for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.07, 0.12, 4000, 0.06, 'highpass', 1); }
  pour() { if (!this.ok()) return; const f = this.noiseHit(this.now(), 0.9, 1800, 0.08, 'bandpass', 3); f.frequency.linearRampToValueAtTime(2600, this.now() + 0.8); }
  sizzle() { if (!this.ok()) return; this.noiseHit(this.now(), 1.6, 5000, 0.07, 'highpass', 0.5); }
  meow() { if (!this.ok()) return; const t = this.now(); this.tone(700, 1100, t, 0.18, 0.06, 'triangle'); this.tone(1100, 650, t + 0.16, 0.25, 0.06, 'triangle'); }
  gull() { if (!this.ok()) return; const t = this.now(); for (let i = 0; i < 3; i++) this.tone(1500, 900, t + i * 0.16, 0.13, 0.03, 'sawtooth'); }
  chime() { if (!this.ok()) return; const t = this.now(); [84, 88, 91].forEach((n, i) => this.pluck(NOTE(n), t + i * 0.08, 0.08, 0.8, 'sine', this.sfx)); }
  clap() { if (!this.ok()) return; const t = this.now(); this.noiseHit(t, 0.06, 1500, 0.35, 'bandpass', 0.8); this.noiseHit(t + 0.11, 0.06, 1700, 0.3, 'bandpass', 0.8); }
  letter() { if (!this.ok()) return; const t = this.now(); this.noiseHit(t, 0.2, 3000, 0.06, 'highpass'); this.pluck(NOTE(79), t + 0.1, 0.08, 0.6, 'sine', this.sfx); }
  fanfare() {
    if (!this.ok()) return;
    const t = this.now();
    [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]].forEach((ch, i) => ch.forEach((n) => this.pluck(NOTE(n), t + i * 0.22, 0.07, i === 3 ? 1.6 : 0.5, 'triangle', this.sfx)));
  }
  boom() { if (!this.ok()) return; const t = this.now(); this.tone(140, 40, t, 0.6, 0.18); this.noiseHit(t + 0.05, 0.9, 2500, 0.05, 'highpass'); }
  chirp() {
    if (!this.ok()) return;
    const t = this.now();
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(base, base * 1.3, t + i * 0.11, 0.08, 0.012);
  }
  cricket() {
    if (!this.ok()) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) this.tone(4200, 4100, t + i * 0.05, 0.03, 0.01, 'square');
  }
}
