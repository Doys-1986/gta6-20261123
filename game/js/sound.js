// sound.js — every sound in Vice Harbor is synthesized live with the
// Web Audio API. There are no audio files in the game at all: a gunshot
// is a burst of filtered noise, the engine is a sawtooth whose pitch
// tracks speed, the police siren is a triangle wave wobbled by an LFO,
// and the mission jingles are short note sequences. The bank is created
// lazily on the first user gesture, which is when browsers allow audio.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineNodes = null; // { osc, gain } while the player drives
    this.sirenNodes = null;  // { osc, lfo, gain } while police are near
  }

  // Create (or resume) the audio context. Safe to call on every input.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // One enveloped oscillator note. `slideTo` glides the pitch, `delay`
  // offsets the start — together they build every blip and jingle here.
  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // One burst of decaying white noise through a low-pass filter — the
  // raw material for gunshots, punches, crashes and door slams.
  noise(dur, vol = 0.3, cutoff = 1200, delay = 0) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // --- One-shot effects -------------------------------------------------
  gunshot() { this.noise(0.12, 0.5, 2600); this.tone(150, 0.08, 'square', 0.25, 60); }
  melee() { this.noise(0.07, 0.3, 700); this.tone(110, 0.05, 'sine', 0.15, 70); }
  crash(strength = 1) {
    this.noise(0.25, 0.35 * strength, 500);
    this.tone(90, 0.2, 'sawtooth', 0.2, 40);
  }
  pickup() { this.tone(660, 0.09, 'sine', 0.25); this.tone(990, 0.14, 'sine', 0.25, null, 0.08); }
  cash() { this.tone(880, 0.07, 'triangle', 0.3); this.tone(1320, 0.12, 'triangle', 0.3, null, 0.06); }
  hurt() { this.tone(220, 0.12, 'sawtooth', 0.2, 110); }
  door() { this.tone(180, 0.06, 'square', 0.15, 120); this.noise(0.05, 0.12, 900, 0.05); }
  honk() { this.tone(370, 0.16, 'square', 0.12); this.tone(466, 0.16, 'square', 0.1, null, 0.01); }
  missionStart() { this.tone(392, 0.12, 'triangle', 0.25); this.tone(587, 0.18, 'triangle', 0.25, null, 0.1); }
  missionComplete() {
    [523, 659, 784, 1047].forEach((note, i) => this.tone(note, 0.16, 'triangle', 0.3, null, i * 0.11));
  }
  busted() { this.tone(330, 0.3, 'sawtooth', 0.25, 165); this.tone(165, 0.5, 'sawtooth', 0.25, 82, 0.25); }
  wasted() { this.tone(262, 0.4, 'triangle', 0.3, 131); this.tone(131, 0.7, 'triangle', 0.3, 65, 0.35); }

  // --- Continuous loops ---------------------------------------------------
  // Engine hum while driving. Call every frame with the speed ratio;
  // call with on=false when the player steps out.
  engine(on, speedRatio = 0) {
    if (!this.ensure()) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      gain.gain.value = 0.05;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.engineNodes = { osc, gain };
    }
    if (!on && this.engineNodes) {
      try { this.engineNodes.osc.stop(); } catch { /* already stopped */ }
      this.engineNodes.osc.disconnect();
      this.engineNodes = null;
      return;
    }
    if (this.engineNodes) {
      this.engineNodes.osc.frequency.value = 55 + speedRatio * 130;
    }
  }

  // Two-tone police siren while any cruiser is active nearby.
  siren(on) {
    if (!this.ensure()) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 800;
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      gain.gain.value = 0.035;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    }
    if (!on && this.sirenNodes) {
      try { this.sirenNodes.osc.stop(); this.sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      this.sirenNodes.osc.disconnect();
      this.sirenNodes = null;
    }
  }
}
