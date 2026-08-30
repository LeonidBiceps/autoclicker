/**
 * Отрисовка поля на Canvas2D.
 *
 * Никаких изображений: всё поле — прямоугольники и цифры. Это даёт мгновенный
 * первый экран (весь бандл — десятки килобайт) и бесплатную поддержку любых
 * разрешений, что на портале с мобильным трафиком важнее красивых текстур.
 */

import {
  Particles,
  Rings,
  Shake,
  easeOutBack,
  easeOutCubic,
  fitText,
  roundRect,
  type Stage,
} from '@yg/engine';
import { SIZE, type Game, type Tile } from './game';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Осветляет hex-цвет на `amount` (0–255) — для верхнего края градиента плитки. */
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amount);
  const g = Math.min(255, ((n >> 8) & 255) + amount);
  const b = Math.min(255, (n & 255) + amount);
  return `rgb(${r},${g},${b})`;
}

/** Длительности подобраны так, чтобы ход читался, но не тормозил серию свайпов. */
const MOVE_MS = 110;
const POP_MS = 160;

const PALETTE: Record<number, { bg: string; fg: string }> = {
  2: { bg: '#eee4da', fg: '#776e65' },
  4: { bg: '#ede0c8', fg: '#776e65' },
  8: { bg: '#f2b179', fg: '#f9f6f2' },
  16: { bg: '#f59563', fg: '#f9f6f2' },
  32: { bg: '#f67c5f', fg: '#f9f6f2' },
  64: { bg: '#f65e3b', fg: '#f9f6f2' },
  128: { bg: '#edcf72', fg: '#f9f6f2' },
  256: { bg: '#edcc61', fg: '#f9f6f2' },
  512: { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
};

/** Выше 2048 цвета уходят в тёмный — иначе оттенки жёлтого перестают различаться. */
const HIGH = { bg: '#3c3a32', fg: '#f9f6f2' };

interface Layout {
  x: number;
  y: number;
  size: number;
  cell: number;
  gap: number;
  radius: number;
}

export class Renderer {
  private layout: Layout = { x: 0, y: 0, size: 0, cell: 0, gap: 0, radius: 0 };

  // Частицы и тряска рисуются в этом же непрозрачном канвасе, что и поле —
  // отдельного слоя не нужно, «сочность» подмешивается прямо в кадр.
  private readonly particles = new Particles(160);
  private readonly rings = new Rings();
  private readonly shake = new Shake();
  /** Момент последнего хода, для которого уже проиграна вспышка слияния. */
  private burstForMove = -1;
  private lastFrameAt = -1;

  constructor(private readonly stage: Stage) {
    this.relayout();
  }

  relayout(): void {
    const { width, height } = this.stage.viewport;
    // Поле — квадрат по меньшей стороне с полями под интерфейс.
    const size = Math.min(width, height) * 0.94;
    const gap = size * 0.025;
    const cell = (size - gap * (SIZE + 1)) / SIZE;

    this.layout = {
      x: (width - size) / 2,
      y: (height - size) / 2,
      size,
      cell,
      gap,
      radius: cell * 0.12,
    };
  }

  /**
   * @param elapsedMs время с последнего хода — управляет анимацией фишек.
   * @param moveAt метка последнего хода (например, `performance.now()` на
   *   момент хода) — по её смене рендер понимает, что нужно проиграть новую
   *   вспышку слияния, а не повторять её на каждом кадре, пока ход «свежий».
   */
  draw(game: Game, elapsedMs: number, moveAt: number): void {
    const { ctx } = this.stage;
    const l = this.layout;

    const now = performance.now();
    const dt = this.lastFrameAt < 0 ? 0 : Math.min(0.05, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;

    if (moveAt !== this.burstForMove) {
      this.burstForMove = moveAt;
      this.spawnMergeFx(game);
    }

    this.particles.update(dt);
    this.rings.update(dt);
    this.shake.update(dt);

    this.stage.clear('#faf8ef');
    this.shake.apply(ctx);

    // Подложка поля — лёгкий градиент вместо плоской заливки, чтобы доска
    // читалась как физическая панель, а не закрашенный прямоугольник.
    const boardGrad = ctx.createLinearGradient(l.x, l.y, l.x, l.y + l.size);
    boardGrad.addColorStop(0, '#c2b3a5');
    boardGrad.addColorStop(1, '#b2a290');
    ctx.fillStyle = boardGrad;
    roundRect(ctx, l.x, l.y, l.size, l.size, l.radius * 1.3);
    ctx.fill();

    // Пустые клетки — лёгкая внутренняя тень сверху даёт «врезанный» вид
    // вместо плоского полупрозрачного пятна.
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const { x, y } = this.cellPos(row, col);
        const cellGrad = ctx.createLinearGradient(x, y, x, y + l.cell);
        cellGrad.addColorStop(0, 'rgba(143, 122, 102, 0.28)');
        cellGrad.addColorStop(0.18, 'rgba(238, 228, 218, 0.32)');
        cellGrad.addColorStop(1, 'rgba(238, 228, 218, 0.32)');
        ctx.fillStyle = cellGrad;
        roundRect(ctx, x, y, l.cell, l.cell, l.radius);
        ctx.fill();
      }
    }

    const moveT = Math.min(1, elapsedMs / MOVE_MS);
    const popT = Math.min(1, Math.max(0, (elapsedMs - MOVE_MS) / POP_MS));

    // Сначала едущие фишки, поверх — те, что появились: так слияние читается.
    for (const tile of game.tiles) this.drawTile(tile, moveT, popT);

    this.rings.draw(ctx);
    this.particles.draw(ctx);
    ctx.restore();
  }

  /** Вспышка частиц в месте каждого слияния этого хода — масштаб растёт с ценностью фишки. */
  private spawnMergeFx(game: Game): void {
    for (const tile of game.tiles) {
      if (!tile.merged) continue;
      const { x, y } = this.cellPos(tile.row, tile.col);
      const cx = x + this.layout.cell / 2;
      const cy = y + this.layout.cell / 2;
      const colors = PALETTE[tile.value] ?? HIGH;

      // log2(value) растёт медленно — крупные слияния заметно ярче мелких,
      // но не превращаются в вечный фейерверк на позднем поле.
      const weight = Math.min(6, Math.log2(tile.value) - 1);
      this.particles.burst(cx, cy, {
        count: Math.round(6 + weight * 3),
        colors: [colors.bg, colors.fg],
        speed: 90 + weight * 20,
        size: 2.5 + weight * 0.4,
        life: 0.45,
        gravity: 260,
      });
      this.rings.spawn(cx, cy, colors.bg, 0.35, 2);

      if (weight >= 5) this.shake.kick(4 + weight);
    }
  }

  /** Крупный залп по всему полю — вызывается при достижении 2048. */
  celebrate(): void {
    const { width, height } = this.stage.viewport;
    this.shake.kick(14);
    for (let i = 0; i < 3; i += 1) {
      const x = width * (0.25 + Math.random() * 0.5);
      const y = height * (0.25 + Math.random() * 0.5);
      this.particles.burst(x, y, {
        count: 26,
        colors: ['#edc22e', '#f9f6f2', '#f2b179'],
        speed: 260,
        size: 4,
        life: 0.9,
        gravity: 220,
      });
      this.rings.spawn(x, y, '#edc22e', 0.6, 3);
    }
  }

  private cellPos(row: number, col: number): { x: number; y: number } {
    const l = this.layout;
    return {
      x: l.x + l.gap + col * (l.cell + l.gap),
      y: l.y + l.gap + row * (l.cell + l.gap),
    };
  }

  private drawTile(tile: Tile, moveT: number, popT: number): void {
    const { ctx } = this.stage;
    const l = this.layout;

    const target = this.cellPos(tile.row, tile.col);
    let x = target.x;
    let y = target.y;

    if (tile.from) {
      const start = this.cellPos(tile.from.row, tile.from.col);
      const t = easeOutCubic(moveT);
      x = start.x + (target.x - start.x) * t;
      y = start.y + (target.y - start.y) * t;
    }

    // Масштаб: появление — «выпрыгивание», слияние — короткий толчок.
    let scale = 1;
    if (tile.spawned) {
      scale = 0.1 + 0.9 * easeOutBack(Math.min(1, popT));
    } else if (tile.merged) {
      const pop = Math.min(1, popT);
      scale = 1 + 0.18 * Math.sin(pop * Math.PI);
    }

    const size = l.cell * scale;
    const offset = (l.cell - size) / 2;

    const colors = PALETTE[tile.value] ?? HIGH;
    const tx = x + offset;
    const ty = y + offset;
    const tr = l.radius * scale;

    ctx.save();

    // Мягкая тень под плиткой — даёт ощущение приподнятой фишки без единой
    // текстуры, только тенью и градиентом.
    ctx.shadowColor = 'rgba(60, 50, 40, 0.28)';
    ctx.shadowBlur = size * 0.06;
    ctx.shadowOffsetY = size * 0.035;

    // Плитки от 512 и выше светятся — та же прогрессия ценности, что и раньше,
    // но крупные значения теперь ещё и выглядят «редкими», а не просто желтее.
    if (tile.value >= 512) {
      ctx.shadowColor = colors.bg;
      ctx.shadowBlur = size * 0.16;
    }

    const grad = ctx.createLinearGradient(tx, ty, tx, ty + size);
    grad.addColorStop(0, lighten(colors.bg, 18));
    grad.addColorStop(1, colors.bg);
    ctx.fillStyle = grad;
    roundRect(ctx, tx, ty, size, size, tr);
    ctx.fill();
    ctx.restore();

    // Блик по верхнему краю — тонкая светлая дуга, читается как глянец, но
    // не спорит с плоским, «настольным» стилем игры.
    ctx.save();
    ctx.globalAlpha = 0.22 * Math.min(1, Math.max(0, scale));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.moveTo(tx + tr, ty + size * 0.06);
    ctx.lineTo(tx + size - tr, ty + size * 0.06);
    ctx.stroke();
    ctx.restore();

    const label = String(tile.value);
    const fontSize = fitText(ctx, label, size * 0.78, size * 0.42, FONT);
    ctx.fillStyle = colors.fg;
    ctx.font = `700 ${fontSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + l.cell / 2, y + l.cell / 2 + fontSize * 0.04);
  }

  /** Сколько частиц сейчас летит — используется только для отладочных проверок. */
  get particleCount(): number {
    return this.particles.count;
  }

  /** Анимация ещё идёт — цикл не должен засыпать. */
  static isAnimating(elapsedMs: number): boolean {
    return elapsedMs < MOVE_MS + POP_MS;
  }
}
