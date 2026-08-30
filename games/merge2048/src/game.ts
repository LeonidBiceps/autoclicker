/**
 * Чистая логика 2048 — без канваса, DOM и SDK.
 *
 * Отделена намеренно: правила игры должны быть проверяемы без браузера, а
 * рендер обязан уметь показать *как* фишка приехала, поэтому каждый ход
 * возвращает не только новое поле, но и траектории движения.
 */

import { mulberry32 } from '@yg/engine';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  /** Откуда фишка приехала на этом ходу (для анимации). */
  from: { row: number; col: number } | null;
  /** Фишка появилась в результате слияния — её нужно «стукнуть» масштабом. */
  merged: boolean;
  /** Фишка только что заспавнилась. */
  spawned: boolean;
}

export interface MoveResult {
  moved: boolean;
  gained: number;
  /** Достигнута плитка 2048 впервые. */
  reachedGoal: boolean;
  merges: number;
}

export interface Snapshot {
  values: number[];
  score: number;
}

export const SIZE = 4;
export const GOAL = 2048;

const HISTORY_LIMIT = 24;

export class Game {
  /** Плоский массив длиной SIZE*SIZE; `null` — пустая клетка. */
  private cells: (Tile | null)[] = new Array(SIZE * SIZE).fill(null);
  private nextId = 1;
  private rnd: () => number;
  private history: Snapshot[] = [];

  score = 0;
  best = 0;
  /** Игрок уже видел поздравление с 2048 — второй раз не показываем. */
  goalReached = false;
  /** Сколько раз игрок продолжал партию за рекламу. */
  continues = 0;

  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.rnd = mulberry32(seed);
  }

  // ── доступ к полю ───────────────────────────────────────────────────────

  at(row: number, col: number): Tile | null {
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return null;
    return this.cells[row * SIZE + col] ?? null;
  }

  private set(row: number, col: number, tile: Tile | null): void {
    this.cells[row * SIZE + col] = tile;
    if (tile) {
      tile.row = row;
      tile.col = col;
    }
  }

  get tiles(): Tile[] {
    return this.cells.filter((t): t is Tile => t !== null);
  }

  get maxValue(): number {
    return this.tiles.reduce((max, t) => Math.max(max, t.value), 0);
  }

  private emptyCells(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cells.length; i += 1) if (!this.cells[i]) out.push(i);
    return out;
  }

  // ── партия ──────────────────────────────────────────────────────────────

  newGame(): void {
    this.cells = new Array(SIZE * SIZE).fill(null);
    this.score = 0;
    this.goalReached = false;
    this.continues = 0;
    this.history = [];
    this.spawn();
    this.spawn();
  }

  /** Добавляет фишку в случайную пустую клетку. `false` — места нет. */
  spawn(): boolean {
    const empty = this.emptyCells();
    if (empty.length === 0) return false;
    const index = empty[Math.floor(this.rnd() * empty.length)] as number;
    // Классическое соотношение: четвёрка примерно в одном случае из десяти.
    const value = this.rnd() < 0.9 ? 2 : 4;
    const tile: Tile = {
      id: this.nextId++,
      value,
      row: Math.floor(index / SIZE),
      col: index % SIZE,
      from: null,
      merged: false,
      spawned: true,
    };
    this.cells[index] = tile;
    return true;
  }

  /** Сбрасывает пометки анимации — вызывается, когда анимация доиграла. */
  clearAnimationFlags(): void {
    for (const tile of this.tiles) {
      tile.from = null;
      tile.merged = false;
      tile.spawned = false;
    }
  }

  move(dir: Direction): MoveResult {
    const before = this.snapshot();

    for (const tile of this.tiles) {
      tile.from = null;
      tile.merged = false;
      tile.spawned = false;
    }

    const vector = {
      up: { r: -1, c: 0 },
      down: { r: 1, c: 0 },
      left: { r: 0, c: -1 },
      right: { r: 0, c: 1 },
    }[dir];

    // Обходим клетки начиная с той стороны, куда движемся, иначе фишки
    // «перепрыгивают» друг друга.
    const order: number[] = [];
    for (let i = 0; i < SIZE; i += 1) order.push(i);
    const rows = vector.r > 0 ? [...order].reverse() : order;
    const cols = vector.c > 0 ? [...order].reverse() : order;

    let moved = false;
    let gained = 0;
    let merges = 0;
    let reachedGoal = false;

    for (const row of rows) {
      for (const col of cols) {
        const tile = this.at(row, col);
        if (!tile) continue;

        let r = row;
        let c = col;
        // Едем до упора.
        while (true) {
          const nr = r + vector.r;
          const nc = c + vector.c;
          if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE) break;
          if (this.at(nr, nc)) break;
          r = nr;
          c = nc;
        }

        const nr = r + vector.r;
        const nc = c + vector.c;
        const neighbour = this.at(nr, nc);

        // Сливаемся, только если сосед той же ценности и ещё не сливался.
        if (neighbour && neighbour.value === tile.value && !neighbour.merged) {
          this.set(row, col, null);
          neighbour.value *= 2;
          neighbour.merged = true;
          neighbour.from = { row, col };
          // Съеденная фишка не рисуется отдельно: её путь показывает соседка.
          gained += neighbour.value;
          merges += 1;
          moved = true;
          if (neighbour.value >= GOAL && !this.goalReached) {
            this.goalReached = true;
            reachedGoal = true;
          }
          continue;
        }

        if (r !== row || c !== col) {
          this.set(row, col, null);
          tile.from = { row, col };
          this.set(r, c, tile);
          moved = true;
        }
      }
    }

    if (moved) {
      this.score += gained;
      this.best = Math.max(this.best, this.score);
      this.pushHistory(before);
      this.spawn();
    }

    return { moved, gained, reachedGoal, merges };
  }

  canMove(): boolean {
    if (this.emptyCells().length > 0) return true;
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const v = this.at(row, col)?.value;
        if (v === undefined) return true;
        if (this.at(row, col + 1)?.value === v) return true;
        if (this.at(row + 1, col)?.value === v) return true;
      }
    }
    return false;
  }

  // ── откат ───────────────────────────────────────────────────────────────

  private snapshot(): Snapshot {
    return {
      values: this.cells.map((t) => t?.value ?? 0),
      score: this.score,
    };
  }

  private pushHistory(snap: Snapshot): void {
    this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): boolean {
    const snap = this.history.pop();
    if (!snap) return false;
    this.restore(snap);
    return true;
  }

  /**
   * Убирает с поля самые крупные фишки — «продолжение» после проигрыша.
   * Снимаем именно крупные: освобождается место и остаётся шанс отыграться,
   * а не просто пара ходов до того же тупика.
   */
  clearLargest(count: number): void {
    const sorted = [...this.tiles].sort((a, b) => b.value - a.value).slice(0, count);
    for (const tile of sorted) this.set(tile.row, tile.col, null);
    if (this.tiles.length === 0) this.spawn();
    this.continues += 1;
  }

  private restore(snap: Snapshot): void {
    this.cells = snap.values.map((value, i) =>
      value === 0
        ? null
        : {
            id: this.nextId++,
            value,
            row: Math.floor(i / SIZE),
            col: i % SIZE,
            from: null,
            merged: false,
            spawned: false,
          },
    );
    this.score = snap.score;
  }

  // ── сохранение ──────────────────────────────────────────────────────────

  serialize(): Record<string, unknown> {
    return {
      values: this.cells.map((t) => t?.value ?? 0),
      score: this.score,
      best: this.best,
      goalReached: this.goalReached,
      continues: this.continues,
    };
  }

  /** Возвращает `true`, если удалось восстановить осмысленную партию. */
  deserialize(data: Record<string, unknown>): boolean {
    const values = data.values;
    if (!Array.isArray(values) || values.length !== SIZE * SIZE) return false;
    if (!values.every((v) => typeof v === 'number' && v >= 0)) return false;
    if (values.every((v) => v === 0)) return false;

    this.restore({
      values: values as number[],
      score: typeof data.score === 'number' ? data.score : 0,
    });
    this.best = typeof data.best === 'number' ? data.best : this.score;
    this.goalReached = data.goalReached === true;
    // Без этого перезагрузка страницы после одного «продолжения» за рекламу
    // сбрасывала счётчик — партию можно было продолжать за рекламу бесконечно.
    this.continues = typeof data.continues === 'number' && data.continues >= 0 ? data.continues : 0;
    this.history = [];
    return true;
  }
}
