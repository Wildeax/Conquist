import type { Action } from '@/packages/rules/game';
export type Cue =
  | 'dice'
  | 'build'
  | 'city'
  | 'trade'
  | 'fortune'
  | 'raider'
  | 'discard'
  | 'turn'
  | 'win'
  | 'click';
export function actionCue(action: Pick<Action, 'type'>): Cue {
  switch (action.type) {
    case 'roll':
      return 'dice';
    case 'settlement':
    case 'road':
      return 'build';
    case 'city':
      return 'city';
    case 'trade':
    case 'barter':
      return 'trade';
    case 'card':
    case 'buy':
      return 'fortune';
    case 'raider':
      return 'raider';
    case 'discard':
      return 'discard';
    case 'end':
      return 'turn';
  }
}
/** One user-unlocked context. All sounds are original synthesis, not samples. */
class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = false;
  private level = 0.55;
  private active = false;
  private lastCue = -1;
  async unlock(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.mix();
      return;
    }
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(
          1,
          this.ctx.sampleRate * 4,
          this.ctx.sampleRate,
        );
        const d = this.noise.getChannelData(0);
        let pink = 0;
        for (let i = 0; i < d.length; i++) {
          pink = (pink + (Math.random() * 2 - 1) * 0.035) / 1.035;
          d[i] = pink * 3;
        }
        this.ambience = this.ctx.createGain();
        this.ambience.connect(this.master);
        const source = this.ctx.createBufferSource();
        source.buffer = this.noise;
        source.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 850;
        source.connect(filter);
        const waveGain = this.ctx.createGain();
        waveGain.gain.value = 0.1;
        filter.connect(waveGain);
        waveGain.connect(this.ambience);
        source.start();
        const swell = this.ctx.createOscillator(),
          swellGain = this.ctx.createGain();
        swell.frequency.value = 0.11;
        swellGain.gain.value = 0.035;
        swell.connect(swellGain);
        swellGain.connect(waveGain.gain);
        swell.start();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.mix();
    } catch {
      this.enabled = false;
    }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.mix();
  }
  setVolume(level: number) {
    this.level = Math.max(0, Math.min(1, level));
    this.mix();
  }
  setActive(active: boolean) {
    this.active = active;
    this.mix();
  }
  private mix() {
    if (!this.ctx) return;
    this.master?.gain.setTargetAtTime(
      this.enabled ? this.level * 0.52 : 0,
      this.ctx.currentTime,
      0.08,
    );
    this.ambience?.gain.setTargetAtTime(
      this.active ? 1 : 0,
      this.ctx.currentTime,
      0.5,
    );
  }
  pause() {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }
  resume() {
    if (this.enabled && this.ctx?.state === 'suspended')
      void this.ctx.resume().catch(() => {});
  }
  private tone(
    f: number,
    time: number,
    duration: number,
    gain: number,
    type: OscillatorType = 'sine',
    end = f,
  ) {
    const c = this.ctx!;
    const osc = c.createOscillator(),
      env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, time);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(end, 20),
      time + duration,
    );
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(gain, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(env);
    env.connect(this.master!);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }
  private hit(time: number, duration: number, gain: number, frequency: number) {
    const c = this.ctx!;
    const n = c.createBufferSource(),
      env = c.createGain(),
      filter = c.createBiquadFilter();
    n.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    n.connect(filter);
    filter.connect(env);
    env.connect(this.master!);
    n.start(time);
    n.stop(time + duration);
    n.onended = () => {
      n.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }
  play(cue: Cue) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (t - this.lastCue < 0.035) return;
    this.lastCue = t;
    switch (cue) {
      case 'dice':
        for (let i = 0; i < 9; i++) {
          this.hit(t + i * 0.047, 0.09, 0.85 - i * 0.055, 1100 + i * 140);
          this.tone(420 - i * 22, t + i * 0.047, 0.075, 0.08, 'triangle', 110);
        }
        break;
      case 'build':
        this.hit(t, 0.17, 0.9, 420);
        this.tone(145, t, 0.22, 0.2, 'triangle', 65);
        this.hit(t + 0.11, 0.09, 0.4, 1200);
        break;
      case 'city':
        for (let i = 0; i < 3; i++) {
          this.hit(t + i * 0.09, 0.19, 0.7, 300 + i * 120);
          this.tone(160 + i * 55, t + i * 0.09, 0.22, 0.12, 'triangle', 70);
        }
        this.tone(523, t + 0.26, 0.6, 0.1);
        break;
      case 'trade':
        [1175, 1568, 1760].forEach((f, i) =>
          this.tone(f, t + i * 0.07, 0.26, 0.12, 'sine', f * 0.97),
        );
        break;
      case 'fortune':
        this.hit(t, 0.28, 0.4, 2100);
        [392, 587, 784, 1175].forEach((f, i) =>
          this.tone(f, t + i * 0.065, 0.5, 0.09),
        );
        break;
      case 'raider':
        this.hit(t, 0.6, 0.6, 220);
        this.tone(130, t, 0.65, 0.13, 'triangle', 49);
        break;
      case 'discard':
        this.hit(t, 0.11, 0.35, 1900);
        break;
      case 'turn':
        this.tone(659, t, 0.3, 0.085);
        this.tone(988, t + 0.1, 0.4, 0.06);
        break;
      case 'win':
        [392, 494, 587, 784, 988].forEach((f, i) =>
          this.tone(f, t + i * 0.14, 1.1, 0.14, 'triangle'),
        );
        break;
      case 'click':
        this.tone(740, t, 0.055, 0.08, 'triangle', 500);
        break;
    }
  }
}
export const gameAudio = new GameAudio();
