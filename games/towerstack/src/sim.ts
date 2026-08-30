/**
 * Башня — логика стека блоков, без канваса и платформы.
 *
 * Блок едет туда-сюда над стопкой; игрок ловит момент, чтобы уронить его
 * максимально ровно. Промах не отрезает мимо — то, что не легло на прошлый
 * блок, становится обломком с собственной скоростью и падает отдельно: это
 * и есть вся «сочность» жанра, остальное просто геометрия.
 */

import { mulberry32 } from '@yg/engine';

/** Мировые единицы — рендер сам решает, сколько это пикселей. */
export const WORLD_WIDTH = 300;
export const BLOCK_HEIGHT = 34;
/** Ниже этой ширины блок физически не за что зацепить — забег кончается. */
const MIN_WIDTH = 14;
/** Отклонение от идеального центра, которое ещё считается «идеальным» попаданием. */
const PERFECT_TOLERANCE = 4;

export interface PlacedBlock {
  x: number;
  width: number;
  hue: number;
}

export interface MovingBlock {
  x: number;
  width: number;
  hue: number;
  dir: 1 | -1;
}

export interface FallingPiece {
  x: number;
  y: number;
  width: number;
  hue: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
}

export interface PlaceResult {
  ok: boolean;
  perfect: boolean;
  gameOver: boolean;
  scoreGained: number;
  pieces: FallingPiece[];
}

export class Tower {
  blocks: PlacedBlock[] = [];
  current: MovingBlock | null = null;
  score = 0;
  best = 0;
  height = 0;
  comboStreak = 0;
  alive = true;
  /** Забегов подряд без единого промаха мимо — для ачивки на серию идеальных. */
  bestPerfectStreak = 0;

  private speed = 0;
  private rnd: () => number;

  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.rnd = mulberry32(seed);
  }

  newRun(): void {
    this.blocks = [{ x: WORLD_WIDTH / 2, width: 120, hue: 210 }];
    this.score = 0;
    this.height = 0;
    this.comboStreak = 0;
    this.alive = true;
    this.speed = 70;
    this.spawnNext();
  }

  private spawnNext(): void {
    const last = this.blocks[this.blocks.length - 1];
    if (!last) return;
    // Начинает с одного из краёв поля — так первый пролёт всегда проходит
    // весь экран, а не стартует уже рядом с целью.
    const fromLeft = this.height % 2 === 0;
    this.current = {
      x: fromLeft ? last.width / 2 + 4 : WORLD_WIDTH - last.width / 2 - 4,
      width: last.width,
      hue: (last.hue + 26 + this.rnd() * 18) % 360,
      dir: fromLeft ? 1 : -1,
    };
    // Скорость растёт с высотой, но с насыщением — иначе после полусотни
    // блоков игра превращается в тест реакции, а не в стек.
    this.speed = 70 + Math.min(140, this.height * 3.2);
  }

  /** Двигает летящий блок; вызывается каждый кадр, пока забег идёт и есть текущий блок. */
  tick(dt: number): void {
    if (!this.alive || !this.current) return;
    const half = this.current.width / 2;
    this.current.x += this.current.dir * this.speed * dt;
    if (this.current.x + half >= WORLD_WIDTH) {
      this.current.x = WORLD_WIDTH - half;
      this.current.dir = -1;
    } else if (this.current.x - half <= 0) {
      this.current.x = half;
      this.current.dir = 1;
    }
  }

  /** Игрок роняет блок. Возвращает результат для рендера/HUD. */
  place(): PlaceResult {
    const cur = this.current;
    const last = this.blocks[this.blocks.length - 1];
    if (!this.alive || !cur || !last) {
      return { ok: false, perfect: false, gameOver: true, scoreGained: 0, pieces: [] };
    }

    const dx = cur.x - last.x;
    const pieces: FallingPiece[] = [];
    const y = this.blocks.length * BLOCK_HEIGHT;

    if (Math.abs(dx) <= PERFECT_TOLERANCE) {
      // Идеально — блок «примагничивается» к прошлому без усечения, полная
      // ширина сохраняется, а не просто засчитывается очко: за меткость
      // платят тем, что дальше ловить легче, а не только цифрой на экране.
      this.blocks.push({ x: last.x, width: cur.width, hue: cur.hue });
      this.comboStreak += 1;
      this.bestPerfectStreak = Math.max(this.bestPerfectStreak, this.comboStreak);
      this.height += 1;
      const gained = 1 + Math.min(9, this.comboStreak);
      this.score += gained;
      this.best = Math.max(this.best, this.score);
      this.spawnNext();
      return { ok: true, perfect: true, gameOver: false, scoreGained: gained, pieces };
    }

    const overlapLeft = Math.max(cur.x - cur.width / 2, last.x - last.width / 2);
    const overlapRight = Math.min(cur.x + cur.width / 2, last.x + last.width / 2);
    const overlapWidth = overlapRight - overlapLeft;

    if (overlapWidth < MIN_WIDTH) {
      // Совсем мимо — весь блок становится обломком и падает, забег кончен.
      this.alive = false;
      this.comboStreak = 0;
      pieces.push({
        x: cur.x,
        y,
        width: cur.width,
        hue: cur.hue,
        vx: cur.dir * 40,
        vy: -60,
        rotation: 0,
        vr: cur.dir * 2.2,
      });
      return { ok: false, perfect: false, gameOver: true, scoreGained: 0, pieces };
    }

    // Частичное попадание — блок обрезается до пересечения, а обрезок улетает.
    const newX = (overlapLeft + overlapRight) / 2;
    this.blocks.push({ x: newX, width: overlapWidth, hue: cur.hue });
    this.comboStreak = 0;
    this.height += 1;
    this.score += 1;
    this.best = Math.max(this.best, this.score);

    if (overlapLeft > cur.x - cur.width / 2) {
      const w = overlapLeft - (cur.x - cur.width / 2);
      pieces.push({ x: cur.x - cur.width / 2 + w / 2, y, width: w, hue: cur.hue, vx: -50, vy: -40, rotation: 0, vr: -2.6 });
    }
    if (overlapRight < cur.x + cur.width / 2) {
      const w = cur.x + cur.width / 2 - overlapRight;
      pieces.push({ x: overlapRight + w / 2, y, width: w, hue: cur.hue, vx: 50, vy: -40, rotation: 0, vr: 2.6 });
    }

    this.spawnNext();
    return { ok: true, perfect: false, gameOver: false, scoreGained: 1, pieces };
  }

  /** Рекламное продолжение: тот же приём, что и в остальных играх студии —
   * убираем причину проигрыша (последний, промазанный блок уже не в стеке)
   * и снова даём летящий блок той же ширины, что у вершины стека. */
  revive(): void {
    this.alive = true;
    this.comboStreak = 0;
    this.spawnNext();
  }

  serialize(): { best: number; bestPerfectStreak: number } {
    return { best: this.best, bestPerfectStreak: this.bestPerfectStreak };
  }

  deserialize(data: { best?: unknown; bestPerfectStreak?: unknown }): void {
    this.best = typeof data.best === 'number' && Number.isFinite(data.best) ? Math.max(0, data.best) : 0;
    this.bestPerfectStreak =
      typeof data.bestPerfectStreak === 'number' && Number.isFinite(data.bestPerfectStreak)
        ? Math.max(0, data.bestPerfectStreak)
        : 0;
  }
}
