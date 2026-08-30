/**
 * Игровой цикл на requestAnimationFrame.
 *
 * Умеет главное, о чём забывают: пауза при уходе со вкладки и при показе
 * рекламы, и ограничение дельты — иначе после возврата из фона мир
 * «телепортируется» на пару секунд вперёд.
 */
export class Loop {
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = 0;

  constructor(
    private readonly update: (dt: number, elapsed: number) => void,
    private readonly render: (alpha: number) => void,
    /** Максимальный шаг в секундах: защита от прыжка после сворачивания вкладки. */
    private readonly maxDt = 1 / 20,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.tick(this.last);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Пауза со счётчиком: два независимых источника не «распаузят» друг друга. */
  pause(): void {
    this.paused += 1;
  }

  resume(): void {
    this.paused = Math.max(0, this.paused - 1);
    this.last = performance.now();
  }

  get isPaused(): boolean {
    return this.paused > 0;
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause();
    else this.resume();
  };

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const rawDt = (now - this.last) / 1000;
    this.last = now;

    if (this.paused > 0) {
      this.render(0);
      return;
    }

    const dt = Math.min(rawDt, this.maxDt);
    this.update(dt, now / 1000);
    this.render(0);
  };
}
