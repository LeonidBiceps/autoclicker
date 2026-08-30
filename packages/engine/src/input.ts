export type Direction = 'up' | 'down' | 'left' | 'right';

export interface InputHandlers {
  onSwipe?: (dir: Direction) => void;
  onTap?: (x: number, y: number) => void;
  onKey?: (key: string) => void;
}

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

/**
 * Свайпы, тапы и клавиши в одном месте.
 *
 * Порог свайпа задан в процентах от меньшей стороны экрана, а не в пикселях:
 * иначе на планшете жест ощущается «ватным», а на узком телефоне срабатывает
 * от дрожания пальца.
 */
export class Input {
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private tracking = false;
  private disposers: Array<() => void> = [];

  constructor(
    private readonly target: HTMLElement,
    private readonly handlers: InputHandlers,
  ) {
    this.attach();
  }

  private get threshold(): number {
    return Math.min(innerWidth, innerHeight) * 0.06;
  }

  private attach(): void {
    const el = this.target;

    const down = (e: PointerEvent): void => {
      this.tracking = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startT = performance.now();
      el.setPointerCapture?.(e.pointerId);
    };

    const up = (e: PointerEvent): void => {
      if (!this.tracking) return;
      this.tracking = false;

      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const dist = Math.hypot(dx, dy);
      const dt = performance.now() - this.startT;

      if (dist < this.threshold) {
        // Короткое касание без смещения — тап. Долгое удержание игнорируем.
        if (dt < 500) this.handlers.onTap?.(e.clientX, e.clientY);
        return;
      }

      const dir: Direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      this.handlers.onSwipe?.(dir);
    };

    const cancel = (): void => {
      this.tracking = false;
    };

    const key = (e: KeyboardEvent): void => {
      const dir = KEY_TO_DIR[e.code];
      if (dir) {
        e.preventDefault();
        this.handlers.onSwipe?.(dir);
        return;
      }
      this.handlers.onKey?.(e.code);
    };

    // Скролл и pull-to-refresh на мобильных ломают свайпы — глушим их.
    const preventScroll = (e: TouchEvent): void => {
      if (e.cancelable) e.preventDefault();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', key);

    this.disposers = [
      () => el.removeEventListener('pointerdown', down),
      () => el.removeEventListener('pointerup', up),
      () => el.removeEventListener('pointercancel', cancel),
      () => el.removeEventListener('touchmove', preventScroll),
      () => window.removeEventListener('keydown', key),
    ];
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
