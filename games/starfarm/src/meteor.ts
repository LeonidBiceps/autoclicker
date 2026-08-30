/**
 * Золотой метеорит — активная механика поверх пассивного дохода.
 *
 * Классический приём жанра ещё со времён Cookie Clicker: без него idle-игра
 * превращается в «зашёл, подождал, вышел». Метеорит появляется случайно, летит
 * через экран ограниченное время и пропадает — заставляет иногда возвращаться
 * взглядом на экран, а не просто держать вкладку открытой.
 */

export interface MeteorState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  radius: number;
  kind: 'energy' | 'boost' | 'frenzy';
}

export interface MeteorSpawnConfig {
  /** Базовая пауза между метеоритами, секунды. */
  baseInterval: number;
  /** Доля, на которую перк удачи сокращает паузу (0..0.5). */
  frequencyBonus: number;
}

const KIND_WEIGHTS: ReadonlyArray<readonly [MeteorState['kind'], number]> = [
  ['energy', 70],
  ['boost', 20],
  ['frenzy', 10],
];

function pickKind(rnd: () => number): MeteorState['kind'] {
  const total = KIND_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = rnd() * total;
  for (const [kind, weight] of KIND_WEIGHTS) {
    if (roll < weight) return kind;
    roll -= weight;
  }
  return 'energy';
}

/**
 * Управляет появлением одного метеорита за раз.
 *
 * Одного достаточно: несколько сразу превращают активную механику в хаос
 * тапов, а не в приятное «о, метеорит!».
 */
export class MeteorSpawner {
  private nextAt: number;
  current: MeteorState | null = null;

  constructor(
    private readonly config: MeteorSpawnConfig,
    private readonly rnd: () => number = Math.random,
  ) {
    this.nextAt = this.rollDelay();
  }

  private rollDelay(): number {
    const { baseInterval, frequencyBonus } = this.config;
    const min = baseInterval * (1 - frequencyBonus) * 0.7;
    const max = baseInterval * (1 - frequencyBonus) * 1.3;
    return min + this.rnd() * (max - min);
  }

  update(dt: number, width: number, height: number): void {
    if (this.current) {
      const m = this.current;
      m.age += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.age >= m.ttl || m.x < -60 || m.x > width + 60 || m.y > height + 60) {
        this.current = null;
        this.nextAt = this.rollDelay();
      }
      return;
    }

    this.nextAt -= dt;
    if (this.nextAt > 0) return;
    this.spawn(width, height);
  }

  /** Форсирует появление метеорита прямо сейчас — используется только в деве. */
  forceSpawn(width: number, height: number, kind?: MeteorState['kind']): void {
    this.spawn(width, height);
    if (kind && this.current) this.current.kind = kind;
  }

  private spawn(width: number, height: number): void {
    // Влетает сбоку по диагонали — так силуэт виден дольше, чем при падении сверху вниз.
    const fromLeft = this.rnd() > 0.5;
    const y = height * (0.12 + this.rnd() * 0.35);
    const speed = 70 + this.rnd() * 40;

    this.current = {
      x: fromLeft ? -40 : width + 40,
      y,
      vx: fromLeft ? speed : -speed,
      vy: 14 + this.rnd() * 18,
      age: 0,
      ttl: 9 + this.rnd() * 3,
      radius: 22,
      kind: pickKind(this.rnd),
    };
  }

  /** Попадание тапа по метеориту; `null`, если промах. */
  hit(x: number, y: number): MeteorState | null {
    const m = this.current;
    if (!m) return null;
    const dist = Math.hypot(x - m.x, y - m.y);
    if (dist > m.radius * 1.6) return null;
    this.current = null;
    this.nextAt = this.rollDelay();
    return m;
  }
}
