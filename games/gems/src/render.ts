/**
 * Отрисовка поля и проигрывание таймлайна хода.
 *
 * Модель (`GemBoard`) разрешает ход целиком и мгновенно — здесь этот
 * результат «растягивается» по времени: своп, схлопывание троек, падение и
 * досыпка проигрываются последовательно, шаг за шагом. Рендер не знает про
 * правила match-3 вообще, только про то, как показать уже готовый результат.
 */

import {
  Particles,
  Rings,
  Shake,
  easeOutBack,
  easeOutCubic,
  roundRect,
  type Stage,
} from '@yg/engine';
import { KINDS, SIZE, type CascadeRound, type Pos, type SpecialKind, type Tile } from './board';

const SWAP_MS = 130;
const CLEAR_MS = 170;
const FALL_MS = 230;

/** Насыщенная палитра из шести хорошо различимых камней. */
const GEM_COLORS: ReadonlyArray<{ base: string; light: string; glow: string }> = [
  { base: '#e0245e', light: '#ff6b9a', glow: '#ff8fb3' }, // рубин
  { base: '#2e86de', light: '#6fb1ff', glow: '#8fc4ff' }, // сапфир
  { base: '#10ac84', light: '#4ee6bb', glow: '#6bf0cc' }, // изумруд
  { base: '#f6b93b', light: '#ffd873', glow: '#ffe29a' }, // янтарь
  { base: '#8854d0', light: '#b389f0', glow: '#c9a8ff' }, // аметист
  { base: '#f97f51', light: '#ffab7a', glow: '#ffc19c' }, // цитрин
];

type Step =
  | { kind: 'swap'; a: Tile; b: Tile }
  | { kind: 'clear'; round: CascadeRound; comboIndex: number }
  | { kind: 'fall'; round: CascadeRound };

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

  private readonly particles = new Particles(220);
  private readonly rings = new Rings();
  private readonly shake = new Shake();

  private queue: Step[] = [];
  private stepElapsed = 0;
  private lastFrameAt = -1;
  /** Пропускался ли уже эффект (частицы/тряска) для текущего шага очереди. */
  private fxSpawnedForStep = false;

  /** Растёт с длиной цепочки за один ход — читается интерфейсом для попапа комбо. */
  onCombo: ((round: number, tilesCleared: number) => void) | null = null;

  constructor(private readonly stage: Stage) {
    this.relayout();
  }

  relayout(): void {
    const { width, height } = this.stage.viewport;
    const size = Math.min(width, height) * 0.94;
    const gap = size * 0.018;
    const cell = (size - gap * (SIZE + 1)) / SIZE;

    this.layout = {
      x: (width - size) / 2,
      y: (height - size) / 2,
      size,
      cell,
      gap,
      radius: cell * 0.24,
    };
  }

  get isAnimating(): boolean {
    return this.queue.length > 0;
  }

  // ── постановка анимации в очередь ──────────────────────────────────────

  /** Отклонённый своп: тот же ход туда и обратно — выглядит как бодрый «отказ». */
  playRejectedSwap(a: Tile, b: Tile): void {
    this.queue.push({ kind: 'swap', a, b }, { kind: 'swap', a: b, b: a });
  }

  playCascade(swapA: Tile, swapB: Tile, rounds: CascadeRound[]): void {
    this.queue.push({ kind: 'swap', a: swapA, b: swapB });
    rounds.forEach((round, i) => {
      this.queue.push({ kind: 'clear', round, comboIndex: i });
      this.queue.push({ kind: 'fall', round });
    });
  }

  /** Лёгкая рябь по всему полю — сигнал о перемешивании. */
  playShuffleFlash(): void {
    const cx = this.layout.x + this.layout.size / 2;
    const cy = this.layout.y + this.layout.size / 2;
    this.rings.spawn(cx, cy, '#ffffff', 0.5, 3);
    this.rings.spawn(cx, cy, '#7aa2f7', 0.7, 2);
  }

  // ── обновление и отрисовка ──────────────────────────────────────────────

  update(dt: number): void {
    this.particles.update(dt);
    this.rings.update(dt);
    this.shake.update(dt);

    if (this.queue.length === 0) return;

    if (!this.fxSpawnedForStep) {
      this.spawnStepFx(this.queue[0] as Step);
      this.fxSpawnedForStep = true;
    }

    this.stepElapsed += dt * 1000;
    const duration = this.stepDuration(this.queue[0] as Step);
    if (this.stepElapsed >= duration) {
      this.queue.shift();
      this.stepElapsed = 0;
      this.fxSpawnedForStep = false;
    }
  }

  private stepDuration(step: Step): number {
    if (step.kind === 'swap') return SWAP_MS;
    if (step.kind === 'clear') return CLEAR_MS;
    return FALL_MS;
  }

  private spawnStepFx(step: Step): void {
    if (step.kind !== 'clear') return;

    for (const tile of step.round.cleared) {
      const { x, y } = this.cellCenter(tile.row, tile.col);
      const color = GEM_COLORS[tile.kind] ?? GEM_COLORS[0];
      // Активация спецфишки сносит целый ряд/столбец или квадрат — заметно
      // крупнее обычного схлопывания тройки, иначе игрок не поймёт, что
      // сработал именно бонус, а не рядовая тройка.
      const boosted = !!tile.special;
      this.particles.burst(x, y, {
        count: (boosted ? 18 : 10) + step.comboIndex * 4,
        colors: [color?.light ?? '#fff', color?.base ?? '#fff'],
        speed: (boosted ? 220 : 150) + step.comboIndex * 30,
        size: boosted ? 4.5 : 3.5,
        life: 0.5,
        shape: 'square',
      });
      this.rings.spawn(x, y, color?.glow ?? '#fff', boosted ? 0.6 : 0.4, boosted ? 3 : 2);
    }

    for (const up of step.round.upgraded) {
      // Рождение спецфишки — белая вспышка на её клетке, читается как «эта
      // фишка теперь особенная», отдельно от цветных вспышек снятия.
      const { x, y } = this.cellCenter(up.row, up.col);
      this.rings.spawn(x, y, '#ffffff', 0.55, 2);
    }

    if (step.round.cleared.length > 0) {
      this.onCombo?.(step.comboIndex, step.round.cleared.length);
      if (step.comboIndex >= 1) this.shake.kick(4 + step.comboIndex * 3);
    }
  }

  draw(board: { tiles: Tile[] }, selected: Pos | null, hint: Pos | null): void {
    const { ctx } = this.stage;
    const l = this.layout;

    this.stage.clear('#141227');
    this.shake.apply(ctx);

    // Подложка поля.
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, l.x, l.y, l.size, l.size, l.radius * 1.2);
    ctx.fill();

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const { x, y } = this.cellPos(row, col);
        ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.02)';
        roundRect(ctx, x, y, l.cell, l.cell, l.radius);
        ctx.fill();
      }
    }

    const step = this.queue[0];
    const t = step ? Math.min(1, this.stepElapsed / this.stepDuration(step)) : 0;

    const positionOverride = new Map<number, { row: number; col: number }>();
    const ghosts: Array<{ kind: number; special?: SpecialKind; row: number; col: number; scale: number; alpha: number }> = [];

    if (step?.kind === 'swap') {
      const e = easeOutCubic(t);
      positionOverride.set(step.a.id, {
        row: step.a.row + (step.b.row - step.a.row) * e,
        col: step.a.col + (step.b.col - step.a.col) * e,
      });
      positionOverride.set(step.b.id, {
        row: step.b.row + (step.a.row - step.b.row) * e,
        col: step.b.col + (step.a.col - step.b.col) * e,
      });
    } else if (step?.kind === 'fall') {
      for (const f of step.round.fallen) {
        const e = easeOutBack(t);
        positionOverride.set(f.id, { row: f.fromRow + (f.toRow - f.fromRow) * e, col: f.col });
      }
    } else if (step?.kind === 'clear') {
      // Снятые фишки уже удалены из модели — рисуем их как «призраков» поверх поля.
      const pop = t < 0.4 ? 1 + (t / 0.4) * 0.25 : 1.25 - ((t - 0.4) / 0.6) * 1.25;
      const alpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
      for (const c of step.round.cleared) {
        ghosts.push({
          kind: c.kind,
          special: c.special,
          row: c.row,
          col: c.col,
          scale: Math.max(0, pop),
          alpha: Math.max(0, alpha),
        });
      }
    }

    for (const tile of board.tiles) {
      const pos = positionOverride.get(tile.id) ?? { row: tile.row, col: tile.col };
      const isSelected = !!selected && selected.row === tile.row && selected.col === tile.col;
      const isHint = !!hint && hint.row === tile.row && hint.col === tile.col;
      this.drawGem(tile.kind, tile.special, pos.row, pos.col, 1, 1, isSelected, isHint);
    }
    for (const ghost of ghosts) {
      this.drawGem(ghost.kind, ghost.special, ghost.row, ghost.col, ghost.scale, ghost.alpha, false, false);
    }

    this.rings.draw(ctx);
    this.particles.draw(ctx);
    ctx.restore();
  }

  // ── геометрия ───────────────────────────────────────────────────────────

  private cellPos(row: number, col: number): { x: number; y: number } {
    const l = this.layout;
    return {
      x: l.x + l.gap + col * (l.cell + l.gap),
      y: l.y + l.gap + row * (l.cell + l.gap),
    };
  }

  cellCenter(row: number, col: number): { x: number; y: number } {
    const { x, y } = this.cellPos(row, col);
    return { x: x + this.layout.cell / 2, y: y + this.layout.cell / 2 };
  }

  /** Переводит координаты канваса в индекс клетки; `null` — мимо поля. */
  cellAt(x: number, y: number): Pos | null {
    const l = this.layout;
    const col = Math.floor((x - l.x - l.gap / 2) / (l.cell + l.gap));
    const row = Math.floor((y - l.y - l.gap / 2) / (l.cell + l.gap));
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return null;
    return { row, col };
  }

  private drawGem(
    kind: number,
    special: SpecialKind | undefined,
    row: number,
    col: number,
    scale: number,
    alpha: number,
    selected: boolean,
    hint: boolean,
  ): void {
    if (alpha <= 0 || scale <= 0) return;

    const { ctx } = this.stage;
    const l = this.layout;
    const { x, y } = this.cellPos(row, col);
    const cx = x + l.cell / 2;
    const cy = y + l.cell / 2;
    const colors = GEM_COLORS[((kind % KINDS) + KINDS) % KINDS] ?? GEM_COLORS[0];
    if (!colors) return;

    const r = (l.cell / 2) * 0.82 * scale;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (selected) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      roundRect(ctx, x, y, l.cell, l.cell, l.radius);
      ctx.fill();
    }
    if (hint) {
      // Мягкая пульсация подсказки — не мигает резко, чтобы не раздражать.
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
      ctx.lineWidth = 3;
      roundRect(ctx, x + 2, y + 2, l.cell - 4, l.cell - 4, l.radius);
      ctx.stroke();
    }

    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, colors.light);
    grad.addColorStop(1, colors.base);

    // Спецфишка светится сильнее и постоянно — так игрок замечает её на
    // переполненном поле раньше, чем успевает прочитать форму значка.
    const pulse = special ? 0.6 + 0.4 * Math.sin(performance.now() / 260) : 0;
    ctx.fillStyle = grad;
    ctx.shadowColor = special ? '#ffffff' : colors.glow;
    ctx.shadowBlur = special ? (14 + pulse * 6) * scale : 10 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Блик — двумя мазками, дёшево и достаточно, чтобы читалось как «драгоценный камень».
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.34, r * 0.32, r * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();

    if (special === 'lineH' || special === 'lineV') {
      // Полоса через весь камень — направление читается с первого взгляда,
      // подсказывает, что снесёт при активации, без отдельной легенды.
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (special === 'lineH') {
        ctx.moveTo(cx - r * 0.62, cy);
        ctx.lineTo(cx + r * 0.62, cy);
      } else {
        ctx.moveTo(cx, cy - r * 0.62);
        ctx.lineTo(cx, cy + r * 0.62);
      }
      ctx.stroke();
    } else if (special === 'bomb') {
      // Четырёхлучевая искра поверх камня — единственная форма, не читающаяся
      // как «просто полоса», однозначно отличает бомбу от line-фишек.
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      for (let i = 0; i < 4; i += 1) {
        const a = (Math.PI / 2) * i;
        const tipR = r * 0.6;
        const baseR = r * 0.16;
        const tipX = cx + Math.cos(a) * tipR;
        const tipY = cy + Math.sin(a) * tipR;
        const b1x = cx + Math.cos(a - 0.4) * baseR;
        const b1y = cy + Math.sin(a - 0.4) * baseR;
        const b2x = cx + Math.cos(a + 0.4) * baseR;
        const b2y = cy + Math.sin(a + 0.4) * baseR;
        ctx.moveTo(cx, cy);
        ctx.lineTo(b1x, b1y);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(b2x, b2y);
        ctx.closePath();
      }
      ctx.fill();
    }

    ctx.restore();
  }
}
