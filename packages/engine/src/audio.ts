/**
 * Синтезированные звуки на WebAudio.
 *
 * Ни одного аудиофайла: в казуалке звук — это 90% «сочности» и 0 байт веса,
 * если генерировать его на месте. Заодно нет проблем с автоплеем — контекст
 * создаётся лениво, при первом же жесте игрока.
 */
export type SfxName = 'move' | 'merge' | 'win' | 'lose' | 'click' | 'reward' | 'error';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  constructor(private volume = 0.35) {}

  private ensure(): AudioContext | null {
    if (this.ctx) {
      // Браузеры «замораживают» контекст при уходе со вкладки.
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Останавливает весь звук — вызывается на паузе и на время рекламы. */
  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  private blip(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);

    // Быстрая атака и экспоненциальный спад — иначе слышны щелчки.
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  play(name: SfxName): void {
    switch (name) {
      case 'move':
        this.blip(220, 0.06, 'sine', 0.25);
        break;
      case 'merge':
        this.blip(440, 0.1, 'triangle', 0.4, 660);
        this.blip(660, 0.09, 'sine', 0.2, 880, 0.04);
        break;
      case 'click':
        this.blip(520, 0.05, 'square', 0.12);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.3, undefined, i * 0.09));
        break;
      case 'reward':
        [659, 880, 1174].forEach((f, i) => this.blip(f, 0.14, 'sine', 0.32, undefined, i * 0.07));
        break;
      case 'lose':
        this.blip(300, 0.5, 'sawtooth', 0.22, 90);
        break;
      case 'error':
        this.blip(150, 0.15, 'square', 0.18, 110);
        break;
    }
  }
}
