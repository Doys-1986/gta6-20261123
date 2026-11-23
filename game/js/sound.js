// sound.js — WebAudio-synthesized sound for Vice Harbor: Neon Streets.
// No audio files: engine hum, sirens, gunshots, crashes, pickups and
// jingles are all oscillators + filtered noise, created on first use.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
  }

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
      this.master.gain.value = 0.5;
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

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  gunshot() { this.noise(0.12, 0.5, 2600); this.tone(150, 0.08, 'square', 0.25, 60); }
  melee() { this.noise(0.07, 0.3, 700); }
  crash(strength = 1) { this.noise(0.25, 0.35 * strength, 500); this.tone(90, 0.2, 'sawtooth', 0.2, 40); }
  pickup() { this.tone(660, 0.09, 'sine', 0.25); this.tone(990, 0.14, 'sine', 0.25, null, 0.08); }
  cash() { this.tone(880, 0.07, 'triangle', 0.3); this.tone(1320, 0.12, 'triangle', 0.3, null, 0.06); }
  hurt() { this.tone(220, 0.12, 'sawtooth', 0.2, 110); }
  door() { this.tone(180, 0.06, 'square', 0.15, 120); this.noise(0.05, 0.12, 900, 0.05); }
  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.16, 'triangle', 0.3, null, i * 0.11));
  }
  missionStart() { this.tone(392, 0.12, 'triangle', 0.25); this.tone(587, 0.18, 'triangle', 0.25, null, 0.1); }
  busted() { this.tone(330, 0.3, 'sawtooth', 0.25, 165); this.tone(165, 0.5, 'sawtooth', 0.25, 82, 0.25); }
  wasted() { this.tone(262, 0.4, 'triangle', 0.3, 131); this.tone(131, 0.7, 'triangle', 0.3, 65, 0.35); }

  // Continuous engine hum while driving; pitch follows speed.
  engine(on, speedRatio = 0) {
    if (!this.ensure()) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.05;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      this.engineOsc.connect(f).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    if (!on && this.engineOsc) {
      try { this.engineOsc.stop(); } catch { /* already stopped */ }
      this.engineOsc.disconnect();
      this.engineOsc = null;
      this.engineGain = null;
    }
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 55 + speedRatio * 130;
    }
  }

  // Police siren loop while any police unit is close and active.
  siren(on) {
    if (!this.ensure()) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenLfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 800;
      this.sirenLfo.frequency.value = 0.7;
      lfoGain.gain.value = 180;
      this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    }
    if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
      this.sirenLfo = null;
    }
  }
}
