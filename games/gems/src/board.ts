/**
 * Логика match-3 — без канваса, DOM и платформы.
 *
 * Разрешение хода (снятие совпадений → гравитация → досыпка → повторная
 * проверка) выполняется мгновенно и целиком, а не по кадрам: модель отдаёт
 * отрисовке готовый таймлайн шагов (`CascadeRound[]`), и уже отрисовка решает,
 * как быстро и красиво его проиграть. Это то же разделение, что в 2048 —
 * логика не знает про анимацию вообще.
 */

import { mulberry32 } from '@yg/engine';

export const SIZE = 7;
export const KINDS = 6;

/**
 * Специальные фишки — награда за длинную тройку. `lineH`/`lineV` при
 * активации сносят весь ряд/столбец, `bomb` — квадрат 3×3 вокруг себя.
 * Такой же принцип, что в любом match-3: длинный ход не просто даёт больше
 * очков, а оставляет на поле инструмент для следующего хода.
 */
export type SpecialKind = 'lineH' | 'lineV' | 'bomb';

export interface Tile {
  id: number;
  kind: number;
  row: number;
  col: number;
  special?: SpecialKind;
}

export interface Pos {
  row: number;
  col: number;
}

interface ClearedTile {
  id: number;
  kind: number;
  row: number;
  col: number;
  /** Была ли снятая фишка специальной — рендер играет более заметный эффект. */
  special?: SpecialKind;
}

interface FallenTile {
  id: number;
  kind: number;
  fromRow: number;
  toRow: number;
  col: number;
}

interface UpgradedTile {
  id: number;
  row: number;
  col: number;
  special: SpecialKind;
}

export interface CascadeRound {
  /** Снятые в этом раунде фишки — для анимации схлопывания. */
  cleared: ClearedTile[];
  /** Все фишки, что упали в этом раунде (включая новые, летящие сверху). */
  fallen: FallenTile[];
  /** Фишки, превращённые в этом раунде в специальные — та же клетка, не падает и не снимается. */
  upgraded: UpgradedTile[];
}

interface MatchRun {
  cells: Pos[];
  orientation: 'h' | 'v';
}

export interface SwapResult {
  ok: boolean;
  rounds: CascadeRound[];
  /** Очки за ход: чем больше раундов каскада, тем выше множитель. */
  scoreGained: number;
}

const POINTS_PER_TILE = 10;

function neighborsOf({ row, col }: Pos): Pos[] {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ];
}

export function isAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

export class GemBoard {
  private grid: (Tile | null)[][] = [];
  private nextId = 1;
  private rnd: () => number;

  score = 0;
  best = 0;

  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.rnd = mulberry32(seed);
    this.generateSolvableBoard();
  }

  // ── доступ к полю ───────────────────────────────────────────────────────

  at(row: number, col: number): Tile | null {
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return null;
    return this.grid[row]?.[col] ?? null;
  }

  get tiles(): Tile[] {
    const out: Tile[] = [];
    for (const row of this.grid) for (const tile of row) if (tile) out.push(tile);
    return out;
  }

  private set(row: number, col: number, tile: Tile | null): void {
    const line = this.grid[row];
    if (!line) return;
    line[col] = tile;
    if (tile) {
      tile.row = row;
      tile.col = col;
    }
  }

  // ── генерация ───────────────────────────────────────────────────────────

  private randomKind(): number {
    return Math.floor(this.rnd() * KINDS);
  }

  /** Строит поле без готовых совпадений и с гарантией хотя бы одного хода. */
  private generateSolvableBoard(): void {
    do {
      // Пустой каркас назначаем сразу: `wouldMatchAt` читает `this.grid`, и
      // если заполнять локальный массив в стороне, а присвоить только в
      // конце, проверка соседей во время генерации будет смотреть на старое
      // (или пустое) поле и не увидит уже поставленные в этом же проходе
      // фишки — именно так снятие повторов молча переставало работать.
      this.grid = Array.from({ length: SIZE }, () => new Array<Tile | null>(SIZE).fill(null));

      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          // Перебираем цвета, пока не найдём тот, что не создаст тройку сразу
          // при генерации слева направо, сверху вниз.
          let kind = this.randomKind();
          let guard = 0;
          while (guard < 20 && this.wouldMatchAt(row, col, kind)) {
            kind = this.randomKind();
            guard += 1;
          }
          this.set(row, col, { id: this.nextId++, kind, row, col });
        }
      }
    } while (!this.hasValidMove());
  }

  private wouldMatchAt(row: number, col: number, kind: number): boolean {
    // Проверяем только уже заполненную часть (слева и сверху) — во время
    // построчной генерации остального поля ещё нет.
    if (col >= 2 && this.grid[row]?.[col - 1]?.kind === kind && this.grid[row]?.[col - 2]?.kind === kind) {
      return true;
    }
    if (row >= 2 && this.grid[row - 1]?.[col]?.kind === kind && this.grid[row - 2]?.[col]?.kind === kind) {
      return true;
    }
    return false;
  }

  // ── поиск совпадений ────────────────────────────────────────────────────

  /** Все клетки, входящие хотя бы в одну тройку (и длиннее), без дублей. */
  private findMatches(): Set<string> {
    const hit = new Set<string>();
    const key = (r: number, c: number): string => `${r}:${c}`;

    for (let row = 0; row < SIZE; row += 1) {
      let runStart = 0;
      for (let col = 1; col <= SIZE; col += 1) {
        const same = col < SIZE && this.grid[row]?.[col]?.kind === this.grid[row]?.[runStart]?.kind;
        if (!same) {
          if (col - runStart >= 3) for (let c = runStart; c < col; c += 1) hit.add(key(row, c));
          runStart = col;
        }
      }
    }

    for (let col = 0; col < SIZE; col += 1) {
      let runStart = 0;
      for (let row = 1; row <= SIZE; row += 1) {
        const same = row < SIZE && this.grid[row]?.[col]?.kind === this.grid[runStart]?.[col]?.kind;
        if (!same) {
          if (row - runStart >= 3) for (let r = runStart; r < row; r += 1) hit.add(key(r, col));
          runStart = row;
        }
      }
    }

    return hit;
  }

  /** Как `findMatches`, но группирует совпадения в цепочки с ориентацией — нужно, чтобы решить, где и какая спецфишка появится. */
  private findMatchRuns(): MatchRun[] {
    const runs: MatchRun[] = [];

    for (let row = 0; row < SIZE; row += 1) {
      let runStart = 0;
      for (let col = 1; col <= SIZE; col += 1) {
        const same = col < SIZE && this.grid[row]?.[col]?.kind === this.grid[row]?.[runStart]?.kind;
        if (!same) {
          if (col - runStart >= 3) {
            const cells: Pos[] = [];
            for (let c = runStart; c < col; c += 1) cells.push({ row, col: c });
            runs.push({ cells, orientation: 'h' });
          }
          runStart = col;
        }
      }
    }

    for (let col = 0; col < SIZE; col += 1) {
      let runStart = 0;
      for (let row = 1; row <= SIZE; row += 1) {
        const same = row < SIZE && this.grid[row]?.[col]?.kind === this.grid[runStart]?.[col]?.kind;
        if (!same) {
          if (row - runStart >= 3) {
            const cells: Pos[] = [];
            for (let r = runStart; r < row; r += 1) cells.push({ row: r, col });
            runs.push({ cells, orientation: 'v' });
          }
          runStart = row;
        }
      }
    }

    return runs;
  }

  // ── разрешение хода ─────────────────────────────────────────────────────

  /**
   * Снимает найденные совпадения, роняет остаток и досыпает сверху. Пустой
   * массив раундов — совпадений не было. `swapHint` — клетки, которыми игрок
   * только что поменялся: если одна из них попадает в тройку длиной 4+, спецфишка
   * встаёт именно туда (там, где игрок ждёт награду), а не в случайную клетку рана.
   */
  private resolveCascade(swapHint?: [Pos, Pos]): CascadeRound[] {
    const rounds: CascadeRound[] = [];
    let firstRound = true;
    const key = (p: Pos): string => `${p.row}:${p.col}`;

    while (true) {
      const runs = this.findMatchRuns();
      if (runs.length === 0) break;

      const toClear = new Set<string>();
      for (const run of runs) for (const c of run.cells) toClear.add(key(c));

      // Длинные раны (4+) апгрейдят одну свою клетку вместо снятия — самые
      // длинные обрабатываем первыми, чтобы пересечение двух ранов честно
      // досталось более редкой/сильной спецфишке.
      const upgrades = new Map<string, SpecialKind>();
      // Уже специальная фишка, попавшая в новый ран, не годится в якорь: если
      // её молча перекрасить в другой тип, потеряется её собственная
      // активация (снос ряда/бомбы) — та клетка должна остаться на снос, где
      // её подхватит цепочка активации ниже, а апгрейд достанется соседней клетке.
      const isSpecial = (p: Pos): boolean => !!this.at(p.row, p.col)?.special;

      const longRuns = [...runs].filter((r) => r.cells.length >= 4).sort((a, b) => b.cells.length - a.cells.length);
      for (const run of longRuns) {
        let anchor = run.cells.find((c) => !isSpecial(c)) ?? (run.cells[Math.floor(run.cells.length / 2)] as Pos);
        if (firstRound && swapHint) {
          const fromSwap = run.cells.find(
            (c) => !isSpecial(c) && swapHint.some((s) => s.row === c.row && s.col === c.col),
          );
          if (fromSwap) anchor = fromSwap;
        }
        const anchorKey = key(anchor);
        if (upgrades.has(anchorKey)) continue; // клетка уже занята другим пересекающимся раном
        upgrades.set(anchorKey, run.cells.length >= 5 ? 'bomb' : run.orientation === 'h' ? 'lineH' : 'lineV');
        toClear.delete(anchorKey);
      }

      // Активация спецфишек, попавших под снос: их эффект расширяет набор
      // снимаемых клеток, что может задеть другие спецфишки — повторяем до
      // стабильного набора, иначе цепочка бомб оборвётся на первом звене.
      const activated = new Set<string>();
      let changed = true;
      while (changed) {
        changed = false;
        for (const k of [...toClear]) {
          if (activated.has(k) || upgrades.has(k)) continue;
          const [r, c] = k.split(':').map(Number) as [number, number];
          const tile = this.at(r, c);
          if (!tile?.special) continue;
          activated.add(k);
          changed = true;
          if (tile.special === 'lineH') {
            for (let cc = 0; cc < SIZE; cc += 1) toClear.add(key({ row: r, col: cc }));
          } else if (tile.special === 'lineV') {
            for (let rr = 0; rr < SIZE; rr += 1) toClear.add(key({ row: rr, col: c }));
          } else {
            for (let dr = -1; dr <= 1; dr += 1) {
              for (let dc = -1; dc <= 1; dc += 1) {
                const rr = r + dr;
                const cc = c + dc;
                if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) toClear.add(key({ row: rr, col: cc }));
              }
            }
          }
        }
      }
      // Апгрейженная клетка не снимается, даже если чей-то эффект дотянулся до неё.
      for (const k of upgrades.keys()) toClear.delete(k);

      const cleared: ClearedTile[] = [];
      for (const k of toClear) {
        const [r, c] = k.split(':').map(Number) as [number, number];
        const tile = this.at(r, c);
        if (!tile) continue;
        cleared.push({ id: tile.id, kind: tile.kind, row: r, col: c, special: tile.special });
        this.set(r, c, null);
      }

      const upgraded: UpgradedTile[] = [];
      for (const [k, special] of upgrades) {
        const [r, c] = k.split(':').map(Number) as [number, number];
        const tile = this.at(r, c);
        if (!tile) continue;
        tile.special = special;
        upgraded.push({ id: tile.id, row: r, col: c, special });
      }

      const fallen: FallenTile[] = [];
      for (let col = 0; col < SIZE; col += 1) {
        // Собираем уцелевшие фишки столбца снизу вверх и укладываем их плотно
        // к низу — ровно то же самое, что делает гравитация в этом жанре.
        const survivors: Tile[] = [];
        for (let row = SIZE - 1; row >= 0; row -= 1) {
          const tile = this.at(row, col);
          if (tile) survivors.push(tile);
        }

        let writeRow = SIZE - 1;
        for (const tile of survivors) {
          if (tile.row !== writeRow) {
            fallen.push({ id: tile.id, kind: tile.kind, fromRow: tile.row, toRow: writeRow, col });
          }
          this.set(tile.row, col, null);
          writeRow -= 1;
        }
        // Второй проход: расставляем без коллизий (predecessor мог занимать
        // целевую клетку другого выжившего до переноса).
        let cursor = SIZE - 1;
        for (const tile of survivors) {
          this.set(cursor, col, tile);
          cursor -= 1;
        }

        // Досыпаем новые сверху — с отрицательным `fromRow`, чтобы рендер
        // знал, что они влетают из-за пределов поля.
        for (let row = cursor; row >= 0; row -= 1) {
          const tile: Tile = { id: this.nextId++, kind: this.randomKind(), row, col };
          this.set(row, col, tile);
          fallen.push({ id: tile.id, kind: tile.kind, fromRow: row - (cursor + 1), toRow: row, col });
        }
      }

      rounds.push({ cleared, fallen, upgraded });
      firstRound = false;
    }

    return rounds;
  }

  // ── ход игрока ──────────────────────────────────────────────────────────

  trySwap(a: Pos, b: Pos): SwapResult {
    if (!isAdjacent(a, b)) return { ok: false, rounds: [], scoreGained: 0 };

    const tileA = this.at(a.row, a.col);
    const tileB = this.at(b.row, b.col);
    if (!tileA || !tileB) return { ok: false, rounds: [], scoreGained: 0 };

    this.set(a.row, a.col, tileB);
    this.set(b.row, b.col, tileA);

    const rounds = this.resolveCascade([a, b]);
    if (rounds.length === 0) {
      // Совпадений не случилось — возвращаем как было.
      this.set(a.row, a.col, tileA);
      this.set(b.row, b.col, tileB);
      return { ok: false, rounds: [], scoreGained: 0 };
    }

    let scoreGained = 0;
    rounds.forEach((round, i) => {
      // Каскад (совпадение, вызванное падением, а не самим ходом) стоит
      // больше — это и есть механика комбо, ради которой игроки ищут
      // «длинные» ходы, а не просто первую попавшуюся тройку.
      scoreGained += round.cleared.length * POINTS_PER_TILE * (i + 1);
    });

    this.score += scoreGained;
    this.best = Math.max(this.best, this.score);

    return { ok: true, rounds, scoreGained };
  }

  /** Есть ли на поле ход, дающий совпадение — используется для детекта тупика. */
  hasValidMove(): boolean {
    return this.findAnyValidMove() !== null;
  }

  /** Первая найденная пара, дающая совпадение — источник подсказки и детекта тупика. */
  findAnyValidMove(): { a: Pos; b: Pos } | null {
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        for (const n of neighborsOf({ row, col })) {
          if (n.row < row || (n.row === row && n.col < col)) continue; // каждую пару проверяем один раз
          if (this.simulateSwapMatches({ row, col }, n)) return { a: { row, col }, b: n };
        }
      }
    }
    return null;
  }

  /** Проверка «что если поменять» без мутации состояния. */
  private simulateSwapMatches(a: Pos, b: Pos): boolean {
    const tileA = this.at(a.row, a.col);
    const tileB = this.at(b.row, b.col);
    if (!tileA || !tileB || !isAdjacent(a, b)) return false;

    this.set(a.row, a.col, tileB);
    this.set(b.row, b.col, tileA);
    const hasMatch = this.findMatches().size > 0;
    this.set(a.row, a.col, tileA);
    this.set(b.row, b.col, tileB);

    return hasMatch;
  }

  /**
   * Полностью перемешивает поле, сохраняя набор цветов. Используется, когда
   * у игрока не осталось ходов — без этого endless-режим упирался бы в тупик.
   */
  shuffle(): void {
    const kinds = this.tiles.map((t) => t.kind);
    // Fisher–Yates: даёт равномерную перестановку, а не смещённую к концу.
    for (let i = kinds.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rnd() * (i + 1));
      const tmp = kinds[i] as number;
      kinds[i] = kinds[j] as number;
      kinds[j] = tmp;
    }

    let cursor = 0;
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const tile = this.at(row, col);
        if (tile) {
          tile.kind = kinds[cursor++] as number;
          // Спецэффект был привязан к прежнему месту в раскладе — после
          // перемешивания он бы не значил ничего, только путал бы игрока.
          tile.special = undefined;
        }
      }
    }

    // Перемешивание могло случайно создать тройки или тупик — досортировываем.
    if (this.findMatches().size > 0 || !this.hasValidMove()) this.generateSolvableBoard();
  }

  // ── сохранение ──────────────────────────────────────────────────────────

  serialize(): { kinds: number[]; specials: string[]; score: number; best: number } {
    const kinds: number[] = [];
    // Спецфишка — заслуженная награда за длинный ход; терять её на перезагрузке
    // было бы неприятным сюрпризом, поэтому сохраняем отдельным парал­лельным
    // массивом ('' — обычный камень), а не только цвета.
    const specials: string[] = [];
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const tile = this.at(row, col);
        kinds.push(tile?.kind ?? -1);
        specials.push(tile?.special ?? '');
      }
    }
    return { kinds, specials, score: this.score, best: this.best };
  }

  /** `true` — поле восстановлено из сейва; `false` — сейва не было или он битый. */
  deserialize(data: { kinds?: unknown; specials?: unknown; score?: unknown; best?: unknown }): boolean {
    const kinds = data.kinds;
    if (!Array.isArray(kinds) || kinds.length !== SIZE * SIZE) return false;
    if (!kinds.every((k) => typeof k === 'number' && k >= 0 && k < KINDS)) return false;

    // Старые сейвы (до появления спецфишек) не несут `specials` — трактуем как
    // «нигде нет спецфишек», а не как повреждённые данные.
    const rawSpecials = Array.isArray(data.specials) && data.specials.length === SIZE * SIZE ? data.specials : null;
    const validKind = (v: unknown): v is SpecialKind => v === 'lineH' || v === 'lineV' || v === 'bomb';

    let cursor = 0;
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const special = rawSpecials?.[cursor];
        this.set(row, col, {
          id: this.nextId++,
          kind: kinds[cursor++] as number,
          row,
          col,
          special: validKind(special) ? special : undefined,
        });
      }
    }

    // Сейв мог прийти с полем, где уже есть готовые тройки (баг другой версии,
    // ручное редактирование) — на такое поле игра не должна выглядеть сломанной.
    if (this.findMatches().size > 0 || !this.hasValidMove()) this.generateSolvableBoard();

    this.score = typeof data.score === 'number' && data.score >= 0 ? data.score : 0;
    this.best = typeof data.best === 'number' && data.best >= this.score ? data.best : this.score;
    return true;
  }
}
