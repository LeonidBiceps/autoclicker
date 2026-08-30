/**
 * Визуальная «сочность»: частицы, тряска экрана, звёздный фон.
 *
 * Всё рисуется кодом. В казуальной игре ощущение дорогой картинки создают не
 * текстуры, а отклик на действие — вспышка, разлёт, толчок камеры. Это стоит
 * ноль байт, не требует лицензий и одинаково резко выглядит на любом экране,
 * в отличие от растровых ассетов.
 *
 * Все системы уважают `prefers-reduced-motion`: часть игроков от тряски
 * действительно укачивает.
 */

import { clamp } from './math';

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── частицы ────────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: 'circle' | 'square';
  spin: number;
  angle: number;
}

export interface BurstOptions {
  count?: number;
  colors?: readonly string[];
  /** Разброс скорости в пикселях в секунду. */
  speed?: number;
  spread?: number;
  size?: number;
  life?: number;
  gravity?: number;
  shape?: 'circle' | 'square';
  /** Направление в радианах; по умолчанию во все стороны. */
  direction?: number;
}

/**
 * Пул частиц с фиксированным потолком.
 *
 * Потолок важнее красоты: в кликере игрок нажимает десять раз в секунду, и без
 * ограничения система за минуту съест кадры на слабом телефоне.
 */
export class Particles {
  private pool: Particle[] = [];
  private active = 0;

  constructor(private readonly max = 260) {}

  get count(): number {
    return this.active;
  }

  burst(x: number, y: number, options: BurstOptions = {}): void {
    if (reducedMotion()) return;

    const {
      count = 12,
      colors = ['#ffd166'],
      speed = 220,
      spread = Math.PI * 2,
      size = 4,
      life = 0.7,
      gravity = 420,
      shape = 'circle',
      direction = -Math.PI / 2,
    } = options;

    for (let i = 0; i < count; i += 1) {
      if (this.active >= this.max) return;

      const angle = direction + (Math.random() - 0.5) * spread;
      const velocity = speed * (0.45 + Math.random() * 0.75);
      const particle: Particle = {
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: life * (0.7 + Math.random() * 0.6),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[Math.floor(Math.random() * colors.length)] ?? '#fff',
        gravity,
        shape,
        spin: (Math.random() - 0.5) * 12,
        angle: Math.random() * Math.PI,
      };
      particle.maxLife = particle.life;

      // Живые частицы держим в начале массива — так обход не спотыкается о дыры.
      this.pool[this.active] = particle;
      this.active += 1;
    }
  }

  update(dt: number): void {
    for (let i = this.active - 1; i >= 0; i -= 1) {
      const p = this.pool[i];
      if (!p) continue;

      p.life -= dt;
      if (p.life <= 0) {
        // Убитую частицу заменяем последней живой — порядок неважен.
        const last = this.pool[this.active - 1];
        if (last) this.pool[i] = last;
        this.active -= 1;
        continue;
      }

      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.active; i += 1) {
      const p = this.pool[i];
      if (!p) continue;

      const t = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const s = p.size * t;
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.active = 0;
  }
}

// ── тряска экрана ──────────────────────────────────────────────────────────

/**
 * Толчок камеры. Затухает экспоненциально: резкий удар и быстрый возврат
 * читаются как «сильно», долгая мелкая дрожь — как «сломалось».
 */
export class Shake {
  private power = 0;
  offsetX = 0;
  offsetY = 0;

  kick(power: number): void {
    if (reducedMotion()) return;
    this.power = Math.max(this.power, power);
  }

  update(dt: number): void {
    if (this.power <= 0.01) {
      this.power = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }
    this.power *= Math.pow(0.0008, dt);
    this.offsetX = (Math.random() - 0.5) * this.power * 2;
    this.offsetY = (Math.random() - 0.5) * this.power * 2;
  }

  /** Применяет смещение к контексту. Не забудьте `ctx.restore()`. */
  apply(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
  }
}

// ── звёздный фон ───────────────────────────────────────────────────────────

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  hue: number;
}

/**
 * Многослойное звёздное небо с параллаксом и мерцанием.
 *
 * Дальние слои движутся медленнее и тусклее — приём, который создаёт глубину
 * без единой текстуры.
 */
export class Starfield {
  private stars: Star[] = [];
  private width = 0;
  private height = 0;
  private time = 0;

  constructor(
    private readonly density = 0.00018,
    private readonly palette: readonly string[] = ['#ffffff', '#a9c4ff', '#ffe6a7'],
  ) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    const target = Math.round(width * height * this.density);
    this.stars = Array.from({ length: target }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      // Крупные звёзды летят быстрее — они «ближе».
      size: 0.5 + Math.random() * 1.8,
      speed: 2 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      hue: Math.floor(Math.random() * this.palette.length),
    }));
  }

  update(dt: number): void {
    this.time += dt;
    for (const star of this.stars) {
      star.y += star.speed * dt;
      if (star.y > this.height + 2) {
        star.y = -2;
        star.x = Math.random() * this.width;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const star of this.stars) {
      // Мерцание завязано на фазу, а не на случайность: иначе картинка «шумит».
      const twinkle = 0.55 + 0.45 * Math.sin(this.time * 2 + star.phase);
      ctx.globalAlpha = twinkle * clamp(star.size / 2, 0.25, 1);
      ctx.fillStyle = this.palette[star.hue] ?? '#fff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ── расходящиеся кольца ────────────────────────────────────────────────────

interface Ring {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

/** Ударные волны — отклик на нажатие, который читается даже без частиц. */
export class Rings {
  private rings: Ring[] = [];

  spawn(x: number, y: number, color = '#7aa2f7', life = 0.55, width = 3): void {
    if (reducedMotion()) return;
    if (this.rings.length > 24) this.rings.shift();
    this.rings.push({ x, y, radius: 0, life, maxLife: life, color, width });
  }

  update(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      if (!ring) continue;
      ring.life -= dt;
      ring.radius += 260 * dt;
      if (ring.life <= 0) this.rings.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const ring of this.rings) {
      const t = clamp(ring.life / ring.maxLife, 0, 1);
      ctx.globalAlpha = t * 0.7;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * t;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
