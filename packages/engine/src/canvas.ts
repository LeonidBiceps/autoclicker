export interface Viewport {
  /** Логическая ширина в CSS-пикселях. */
  width: number;
  /** Логическая высота в CSS-пикселях. */
  height: number;
  dpr: number;
}

/**
 * Canvas, растянутый на контейнер, с корректным DPR.
 *
 * DPR ограничен двойкой: на телефонах с DPR 3–4 честный рендер съедает кадры,
 * а разницы на глаз почти нет.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: Viewport = { width: 0, height: 0, dpr: 1 };

  private observer: ResizeObserver;
  private readonly maxDpr: number;

  constructor(
    private readonly container: HTMLElement,
    private readonly onResize?: (vp: Viewport) => void,
    options: { maxDpr?: number; alpha?: boolean } = {},
  ) {
    const { maxDpr = 2, alpha = false } = options;
    this.maxDpr = maxDpr;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    container.appendChild(this.canvas);

    // `alpha:false` для непрозрачных игровых полей — экономит на композитинге.
    // Слою эффектов поверх интерфейса, наоборот, нужна прозрачность.
    const ctx = this.canvas.getContext('2d', { alpha });
    if (!ctx) throw new Error('2D-контекст недоступен');
    this.ctx = ctx;

    // Первый замер делаем молча: подписчика на этом этапе ещё не существует
    // (его конструктор обычно принимает саму сцену). ResizeObserver всё равно
    // выдаст первый колбэк сразу после подписки, уже с готовым подписчиком.
    this.resize(true);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
  }

  resize(silent = false): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, this.maxDpr);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));

    if (this.viewport.width === w && this.viewport.height === h && this.viewport.dpr === dpr) return;

    this.viewport.width = w;
    this.viewport.height = h;
    this.viewport.dpr = dpr;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // Рисуем в CSS-пикселях, масштаб берёт на себя контекст.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!silent) this.onResize?.(this.viewport);
  }

  clear(color: string): void {
    const { width, height } = this.viewport;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, width, height);
  }

  /** Для канвасов с `alpha:true` — стирает кадр вместо заливки цветом. */
  clearTransparent(): void {
    const { width, height } = this.viewport;
    this.ctx.clearRect(0, 0, width, height);
  }

  dispose(): void {
    this.observer.disconnect();
    this.canvas.remove();
  }
}

/** Скруглённый прямоугольник — самая частая примитивная форма в казуалках. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Подбирает размер шрифта так, чтобы текст влез в заданную ширину. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  family: string,
  weight = '700',
): number {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  } while (size > 6);
  return size;
}
