/**
 * Симуляция арены — без канваса, DOM и платформы.
 *
 * Формат Strike Force Heroes: широкий уровень с платформами, камера следует
 * за игроком, волны врагов заходят с обоих концов уровня. Прицеливание —
 * по мировой точке (мышь на десктопе), с автонаведением на ближайшего врага,
 * когда точки прицела нет (тач, геймпад). Оружие и класс персонажа задаются
 * извне и определяют урон/скорострельность/живучесть.
 *
 * Система координат по Y: 0 — уровень земли, отрицательные значения — выше
 * (прыжок, платформа). Тот же знак, что у экранных координат canvas, поэтому
 * рендер не должен ничего инвертировать.
 *
 * Постоянная прогрессия (медали → перки) — тот же паттерн, что в
 * Космоферме: перки передаются в конструктор снаружи и не сбрасываются
 * между забегами, апгрейды магазина — сбрасываются.
 */

import { clamp, mulberry32 } from '@yg/engine';
import { classById, type ClassDef, type ClassId } from './classes';
import { weaponById, type WeaponDef, type WeaponId } from './weapons';

export type EnemyKind = 'walker' | 'runner' | 'shooter' | 'boss';

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hostile: boolean;
  damage: number;
  radius: number;
  /** Сколько ещё врагов может пробить (снайперская пуля). */
  pierceLeft: number;
  /** Взрывается по площади при попадании/истечении дальности (ракета). */
  splashRadius: number;
  /** Каким оружием выпущена — рендеру нужно рисовать пули по-разному. `null` у вражеских. */
  weaponId: WeaponId | null;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  value: number;
  radius: number;
  age: number;
  fireAt: number;
  /** 'shooter' держит дистанцию и не подходит вплотную. */
  preferredRange: number;
}

export interface Platform {
  x: number;
  width: number;
  /** Отрицательное значение — высота над землёй. */
  y: number;
}

export interface Hit {
  x: number;
  y: number;
  damage: number;
  crit: boolean;
}

export interface EnemyDeath {
  x: number;
  y: number;
  kind: EnemyKind;
  value: number;
  boss: boolean;
}

export interface TickEvents {
  hits: Hit[];
  deaths: EnemyDeath[];
  playerHit: boolean;
  playerDied: boolean;
  waveCleared: number | null;
  waveStarted: number | null;
  bossSpawned: boolean;
  /** Новый уровень персонажа — `null`, если в этом тике не левелапнулись. */
  leveledUp: number | null;
  /** Игрок выстрелил в этом тике — рендеру нужно для вспышки на стволе. */
  playerShot: boolean;
  /** Игрок оттолкнулся от земли в этом тике — для звука/анимации. */
  playerJumped: boolean;
  /** Центры взрывов ракет в этом тике — для визуального эффекта. */
  explosions: Array<{ x: number; y: number }>;
}

/** Постоянные перки — покупаются за медали, не сбрасываются между забегами. */
export interface PermaPerks {
  damage: number;
  hp: number;
  fireRate: number;
  crit: number;
}

export const PERK_KEYS = ['damage', 'hp', 'fireRate', 'crit'] as const;
export type PerkKey = (typeof PERK_KEYS)[number];

export const PERK_DEF: Record<PerkKey, { baseCost: number; growth: number; maxLevel: number }> = {
  damage: { baseCost: 3, growth: 1.4, maxLevel: 15 },
  hp: { baseCost: 3, growth: 1.4, maxLevel: 15 },
  fireRate: { baseCost: 4, growth: 1.45, maxLevel: 12 },
  crit: { baseCost: 5, growth: 1.5, maxLevel: 10 },
};

export function perkCost(key: PerkKey, level: number): number {
  const def = PERK_DEF[key];
  if (level >= def.maxLevel) return Infinity;
  return Math.ceil(def.baseCost * def.growth ** level);
}

export function emptyPerks(): PermaPerks {
  return { damage: 0, hp: 0, fireRate: 0, crit: 0 };
}

const WAVE_INTERMISSION = 2.2;
const BOSS_EVERY = 5;
const PLAYER_RADIUS = 18;
const GUN_HEIGHT = 34;
const PLAYER_FIRE_RANGE = 700;
const GRAVITY = 2000;
// Максимальная высота одного прыжка — JUMP_SPEED²/(2·GRAVITY) — должна с запасом
// перекрывать высоту нижней платформы (-110·s в buildPlatforms), иначе на неё
// физически нельзя запрыгнуть одним прыжком, что бы ни делал игрок. При 640
// потолок прыжка (102.4·s) был НИЖЕ нижней платформы — прыжок туда не долетал
// никогда. 760 даёт ~144·s — нижняя платформа берётся одним прыжком с запасом,
// верхняя (-150·s) по-прежнему требует двойной прыжок.
const JUMP_SPEED = 760;
/** Двойной прыжок разрешён — иначе платформы выше первого прыжка недостижимы. */
const MAX_AIR_JUMPS = 1;

/** Цена внутриигрового апгрейда растёт на 40% за уровень — держит выбор нетривиальным. */
const SHOP_GROWTH = 1.4;
const SHOP_BASE_COST: Record<'damage' | 'fireRate' | 'hp' | 'speed', number> = {
  damage: 25,
  fireRate: 30,
  hp: 20,
  speed: 22,
};
const SHOP_MAX_LEVEL = 8;

export class ArenaSim {
  width = 800;
  height = 420;
  /** Ширина всего уровня — шире экрана, камера следует за игроком. */
  worldWidth = 1600;
  groundY = 360;
  scale = 1;
  cameraX = 0;

  playerX = 400;
  playerY = 0;
  private vx = 0;
  private vy = 0;
  private prevPlayerY = 0;
  isGrounded = true;
  private airJumpsLeft = MAX_AIR_JUMPS;
  private moveInput: -1 | 0 | 1 = 0;
  private jumpQueued = false;
  /** Мировая точка прицела (мышь). `null` — автонаведение на ближайшего врага. */
  private aimPoint: { x: number; y: number } | null = null;
  /** Зажата ли кнопка огня — пока есть прицел мышью, стреляем только по ней. */
  private firing = false;

  hp = 100;
  maxHp = 100;
  facing: 1 | -1 = 1;
  invulnLeft = 0;

  coins = 0;
  wave = 0;
  score = 0;
  alive = true;
  continuesUsed = 0;
  /** Пауза между волнами — в это время открыт магазин. */
  inShop = false;

  /** Опыт персонажа за этот забег — вторая, «бесплатная» ось прогресса поверх магазина. */
  xp = 0;
  level = 1;

  // ── апгрейды забега (сбрасываются) ─────────────────────────────────────
  dmgLevel = 0;
  rateLevel = 0;
  hpLevel = 0;
  speedLevel = 0;

  bullets: Bullet[] = [];
  enemies: Enemy[] = [];
  platforms: Platform[] = [];

  weapon: WeaponDef;
  classDef: ClassDef;

  private waveQueue: Array<{ kind: EnemyKind; side: -1 | 1 }> = [];
  private spawnTimer = 0;
  private intermissionLeft = 0;
  private fireTimer = 0;
  private nextId = 1;
  private rnd: () => number;

  constructor(
    private readonly perks: PermaPerks,
    weaponId: WeaponId = 'pistol',
    classId: ClassId = 'assault',
    seed = (Math.random() * 2 ** 32) >>> 0,
  ) {
    this.rnd = mulberry32(seed);
    this.weapon = weaponById(weaponId);
    this.classDef = classById(classId);
  }

  setLoadout(weaponId: WeaponId, classId: ClassId): void {
    this.weapon = weaponById(weaponId);
    this.classDef = classById(classId);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.scale = Math.min(width, height) / 420;
    this.groundY = height * 0.86;
    this.worldWidth = width * 2.4;
    this.buildPlatforms();
    this.playerX = clamp(this.playerX, PLAYER_RADIUS * this.scale, this.worldWidth - PLAYER_RADIUS * this.scale);
  }

  /** Две платформы на разной высоте — достаточно для манёвра, не превращает арену в лабиринт. */
  private buildPlatforms(): void {
    const s = this.scale;
    this.platforms = [
      { x: this.worldWidth * 0.22, width: 160 * s, y: -110 * s },
      { x: this.worldWidth * 0.55, width: 200 * s, y: -150 * s },
      { x: this.worldWidth * 0.78, width: 160 * s, y: -95 * s },
    ];
  }

  // ── ввод ────────────────────────────────────────────────────────────────

  setMoveInput(dir: -1 | 0 | 1): void {
    this.moveInput = dir;
  }

  requestJump(): void {
    this.jumpQueued = true;
  }

  /** Точка прицела в мировых координатах — вызывается на движении мыши. */
  setAimPoint(x: number, y: number): void {
    this.aimPoint = { x, y };
  }

  clearAimPoint(): void {
    this.aimPoint = null;
    this.firing = false;
  }

  /** Зажата кнопка мыши — стрелять, пока не отпустят (только когда есть прицел мышью). */
  setFiring(active: boolean): void {
    this.firing = active;
  }

  /** Мировая точка прицела — для рендера прицельной сетки, не только для стрельбы. */
  get aimWorldPoint(): { x: number; y: number } | null {
    return this.aimPoint;
  }

  /** Зажата ли сейчас кнопка огня — для подсветки прицела красным. */
  get isFiring(): boolean {
    return this.firing;
  }

  // ── стат-формулы ────────────────────────────────────────────────────────

  get damage(): number {
    return (
      this.weapon.damage *
      this.classDef.damageMult *
      (1 + this.dmgLevel * 0.22) *
      (1 + this.perks.damage * 0.08) *
      (1 + (this.level - 1) * 0.05)
    );
  }

  get fireInterval(): number {
    const rateMult = (1 + this.rateLevel * 0.16) * (1 + this.perks.fireRate * 0.07);
    return this.weapon.fireInterval / rateMult;
  }

  get critChance(): number {
    return Math.min(0.6, 0.05 + this.perks.crit * 0.03);
  }

  get moveSpeed(): number {
    return (300 * this.classDef.speedMult + this.speedLevel * 26) * this.scale;
  }

  private recomputeMaxHp(): number {
    // Уровень персонажа даёт небольшой бесплатный прирост — независимо от
    // того, купил ли игрок апгрейд живучести в магазине.
    return Math.round(
      (100 * this.classDef.hpMult + this.hpLevel * 22 + (this.level - 1) * 6) * (1 + this.perks.hp * 0.1),
    );
  }

  /** Опыта нужно для следующего уровня — растёт быстрее, чем волны становятся сложнее. */
  xpToNext(level: number): number {
    return Math.round(30 + level * 22 + level ** 1.6);
  }

  private gainXp(amount: number, events: TickEvents): void {
    this.xp += amount;
    let threshold = this.xpToNext(this.level);
    while (this.xp >= threshold) {
      this.xp -= threshold;
      this.level += 1;
      const newMax = this.recomputeMaxHp();
      this.hp += newMax - this.maxHp; // прирост сразу лечит на разницу
      this.maxHp = newMax;
      events.leveledUp = this.level;
      threshold = this.xpToNext(this.level);
    }
  }

  // ── магазин между волнами ───────────────────────────────────────────────

  shopCost(stat: 'damage' | 'fireRate' | 'hp' | 'speed'): number {
    const level = { damage: this.dmgLevel, fireRate: this.rateLevel, hp: this.hpLevel, speed: this.speedLevel }[stat];
    if (level >= SHOP_MAX_LEVEL) return Infinity;
    return Math.ceil(SHOP_BASE_COST[stat] * SHOP_GROWTH ** level);
  }

  buyShopUpgrade(stat: 'damage' | 'fireRate' | 'hp' | 'speed'): boolean {
    const cost = this.shopCost(stat);
    if (!Number.isFinite(cost) || this.coins < cost) return false;
    this.coins -= cost;

    if (stat === 'damage') this.dmgLevel += 1;
    else if (stat === 'fireRate') this.rateLevel += 1;
    else if (stat === 'speed') this.speedLevel += 1;
    else {
      this.hpLevel += 1;
      const newMax = this.recomputeMaxHp();
      this.hp += newMax - this.maxHp; // прирост сразу лечит на разницу
      this.maxHp = newMax;
    }
    return true;
  }

  /** Закрывает магазин и запускает следующую волну. */
  closeShop(): void {
    this.inShop = false;
    this.intermissionLeft = 0.01;
  }

  // ── забег ────────────────────────────────────────────────────────────────

  newRun(): void {
    this.bullets = [];
    this.enemies = [];
    this.firing = false;
    this.dmgLevel = 0;
    this.rateLevel = 0;
    this.hpLevel = 0;
    this.speedLevel = 0;
    this.maxHp = this.recomputeMaxHp();
    this.hp = this.maxHp;
    this.coins = 0;
    this.wave = 0;
    this.score = 0;
    this.continuesUsed = 0;
    this.alive = true;
    this.inShop = false;
    this.xp = 0;
    this.level = 1;
    this.invulnLeft = 1.2;
    this.playerX = this.worldWidth / 2;
    this.playerY = 0;
    this.vx = 0;
    this.vy = 0;
    this.isGrounded = true;
    this.airJumpsLeft = MAX_AIR_JUMPS;
    this.waveQueue = [];
    this.intermissionLeft = 1.2;
    this.updateCamera(true);
  }

  revive(): void {
    this.alive = true;
    this.hp = Math.max(1, Math.round(this.maxHp * 0.5));
    this.invulnLeft = 1.6;
    // Врагов, стоящих вплотную к игроку, отодвигаем — иначе возрождение
    // тут же съест только что выданное здоровье.
    for (const e of this.enemies) {
      if (Math.abs(e.x - this.playerX) < 80 * this.scale) {
        e.x = this.playerX + (e.x < this.playerX ? -1 : 1) * 90 * this.scale;
      }
    }
  }

  // ── волны ───────────────────────────────────────────────────────────────

  private composeWave(wave: number): Array<{ kind: EnemyKind; side: -1 | 1 }> {
    if (wave % BOSS_EVERY === 0) return [{ kind: 'boss', side: this.rnd() < 0.5 ? -1 : 1 }];

    const list: Array<{ kind: EnemyKind; side: -1 | 1 }> = [];
    // База поднята с 3 до 6: при старом значении волна 1 у нового игрока без
    // прокачки проходила за ~4 секунды — магазин перехватывал управление
    // раньше, чем игрок успевал распробовать бег/прыжок/стрельбу, и это
    // читалось как «игра не отвечает на клавиши».
    const walkers = 6 + Math.floor(wave * 1.3);
    const runners = Math.max(0, Math.floor((wave - 1) * 0.5));
    const shooters = Math.max(0, Math.floor((wave - 2) * 0.35));

    const push = (kind: EnemyKind, n: number): void => {
      for (let i = 0; i < n; i += 1) list.push({ kind, side: this.rnd() < 0.5 ? -1 : 1 });
    };
    push('walker', walkers);
    push('runner', runners);
    push('shooter', shooters);

    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rnd() * (i + 1));
      const tmp = list[i] as { kind: EnemyKind; side: -1 | 1 };
      list[i] = list[j] as { kind: EnemyKind; side: -1 | 1 };
      list[j] = tmp;
    }
    return list;
  }

  private statsFor(kind: EnemyKind, wave: number) {
    const growth = 1 + wave * 0.07;
    const s = this.scale;
    switch (kind) {
      case 'walker':
        return { hp: Math.round(18 * growth), speed: 55 * s, damage: 8, value: 4, radius: 16 * s, range: 0 };
      case 'runner':
        return { hp: Math.round(12 * growth), speed: 115 * s, damage: 6, value: 6, radius: 14 * s, range: 0 };
      case 'shooter':
        return { hp: Math.round(20 * growth), speed: 40 * s, damage: 5, value: 8, radius: 15 * s, range: 260 * s };
      case 'boss':
        return {
          hp: Math.round(240 * (1 + wave * 0.28)),
          speed: 32 * s,
          damage: 16,
          value: 120,
          radius: 34 * s,
          range: 320 * s,
        };
    }
  }

  private spawnEnemy(kind: EnemyKind, side: -1 | 1): void {
    const stats = this.statsFor(kind, this.wave);
    this.enemies.push({
      id: this.nextId++,
      kind,
      // Уровень шире экрана — враги заходят с концов ВСЕГО уровня, а не
      // только с краёв текущего кадра камеры: это и делает пространство
      // ощутимым, а не косметическим фоном.
      x: side < 0 ? -stats.radius : this.worldWidth + stats.radius,
      y: 0,
      facing: side < 0 ? 1 : -1,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      damage: stats.damage,
      value: stats.value,
      radius: stats.radius,
      age: 0,
      fireAt: 0.6 + this.rnd() * 0.8,
      preferredRange: stats.range,
    });
  }

  // ── стрельба ────────────────────────────────────────────────────────────

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = PLAYER_FIRE_RANGE * this.scale;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - this.playerX, e.y - this.playerY);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  /** Текущее направление ствола — для рендера, независимо от момента выстрела. */
  get gunAimAngle(): number {
    const gunX = this.playerX;
    const gunY = this.playerY - GUN_HEIGHT * this.scale;
    const { dx, dy } = this.aimDirection(gunX, gunY);
    return Math.atan2(dy, dx);
  }

  /** Направление выстрела: точка прицела мыши, иначе — ближайший враг, иначе — куда смотрит игрок. */
  private aimDirection(gunX: number, gunY: number): { dx: number; dy: number } {
    if (this.aimPoint) {
      const dx = this.aimPoint.x - gunX;
      const dy = this.aimPoint.y - gunY;
      const len = Math.hypot(dx, dy) || 1;
      return { dx: dx / len, dy: dy / len };
    }
    const target = this.nearestEnemy();
    if (target) {
      const dx = target.x - gunX;
      const dy = target.y - gunY;
      const len = Math.hypot(dx, dy) || 1;
      return { dx: dx / len, dy: dy / len };
    }
    return { dx: this.facing, dy: 0 };
  }

  private playerShoot(events: TickEvents): void {
    const gunX = this.playerX;
    const gunY = this.playerY - GUN_HEIGHT * this.scale;
    const { dx, dy } = this.aimDirection(gunX, gunY);
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;

    const w = this.weapon;
    const speed = w.bulletSpeed * this.scale;
    const baseAngle = Math.atan2(dy, dx);
    const pellets = Math.max(1, w.pellets);

    for (let i = 0; i < pellets; i += 1) {
      // Пеллеты дробовика веерятся вокруг центрального направления, а не
      // случайно — так разброс выглядит контролируемым, а не рандомным.
      const offset = pellets === 1 ? 0 : (i / (pellets - 1) - 0.5) * w.spread;
      const angle = baseAngle + offset + (w.spread > 0 && pellets === 1 ? (this.rnd() - 0.5) * w.spread : 0);
      this.bullets.push({
        id: this.nextId++,
        x: gunX,
        y: gunY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hostile: false,
        damage: this.damage,
        radius: 4 * this.scale,
        pierceLeft: w.pierce,
        splashRadius: w.splashRadius * this.scale,
        weaponId: w.id,
      });
    }
    events.playerShot = true;
  }

  private enemyShoot(e: Enemy): void {
    const dx = this.playerX - e.x;
    const dy = this.playerY - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 420 * this.scale;
    this.bullets.push({
      id: this.nextId++,
      x: e.x + (dx / len) * e.radius,
      y: e.y - 6 * this.scale,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      hostile: true,
      damage: e.damage,
      radius: 4 * this.scale,
      pierceLeft: 0,
      splashRadius: 0,
      weaponId: null,
    });
  }

  // ── тик ─────────────────────────────────────────────────────────────────

  tick(dt: number): TickEvents {
    const events: TickEvents = {
      hits: [],
      deaths: [],
      playerHit: false,
      playerDied: false,
      waveCleared: null,
      waveStarted: null,
      bossSpawned: false,
      leveledUp: null,
      playerShot: false,
      playerJumped: false,
      explosions: [],
    };

    if (!this.alive || this.inShop) return events;

    this.updateMovement(dt, events);
    if (this.invulnLeft > 0) this.invulnLeft = Math.max(0, this.invulnLeft - dt);

    this.updateWaves(dt, events);
    this.updateShooting(dt, events);
    this.updateBullets(dt);
    this.updateEnemies(dt, events);
    this.resolveCollisions(events);
    this.updateCamera(false);

    return events;
  }

  private updateMovement(dt: number, events: TickEvents): void {
    const accel = this.moveSpeed * 8;
    const targetVx = this.moveInput * this.moveSpeed;
    // Разгон/торможение вместо мгновенной скорости — платформер должен
    // ощущаться отзывчиво, но не «телепортом» при смене направления.
    this.vx += clamp(targetVx - this.vx, -accel * dt, accel * dt);
    this.playerX = clamp(this.playerX + this.vx * dt, PLAYER_RADIUS * this.scale, this.worldWidth - PLAYER_RADIUS * this.scale);
    if (Math.abs(this.vx) > 4) this.facing = this.vx > 0 ? 1 : -1;

    this.prevPlayerY = this.playerY;

    if (this.jumpQueued) {
      this.jumpQueued = false;
      if (this.isGrounded) {
        this.vy = -JUMP_SPEED * this.classDef.jumpMult * this.scale;
        this.isGrounded = false;
        events.playerJumped = true;
      } else if (this.airJumpsLeft > 0) {
        this.airJumpsLeft -= 1;
        this.vy = -JUMP_SPEED * this.classDef.jumpMult * this.scale * 0.9;
        events.playerJumped = true;
      }
    }

    this.vy += GRAVITY * this.scale * dt;
    this.playerY += this.vy * dt;

    const surface = this.surfaceYAt(this.playerX, this.prevPlayerY, this.playerY);
    if (surface !== null && this.playerY >= surface) {
      this.playerY = surface;
      this.vy = 0;
      this.isGrounded = true;
      this.airJumpsLeft = MAX_AIR_JUMPS;
    } else {
      this.isGrounded = false;
    }
  }

  /** Поверхность (земля или платформа) под точкой X, если игрок сейчас может на неё приземлиться. */
  private surfaceYAt(x: number, prevY: number, nextY: number): number | null {
    let surface: number | null = 0; // земля всегда есть
    for (const p of this.platforms) {
      if (x < p.x || x > p.x + p.width) continue;
      // Платформа одностороння: приземление засчитывается, только если ноги
      // были на уровне платформы или выше в прошлом кадре и падают сквозь
      // неё сейчас — иначе можно запрыгнуть на неё снизу.
      if (prevY <= p.y && nextY >= p.y) {
        if (surface === null || p.y < surface) surface = p.y;
      }
    }
    return surface;
  }

  private updateCamera(snap: boolean): void {
    const target = clamp(this.playerX - this.width / 2, 0, Math.max(0, this.worldWidth - this.width));
    this.cameraX = snap ? target : this.cameraX + (target - this.cameraX) * 0.14;
  }

  private updateWaves(dt: number, events: TickEvents): void {
    if (this.intermissionLeft > 0) {
      this.intermissionLeft -= dt;
      if (this.intermissionLeft <= 0) {
        this.wave += 1;
        this.waveQueue = this.composeWave(this.wave);
        this.spawnTimer = 0;
        events.waveStarted = this.wave;
        if (this.wave % BOSS_EVERY === 0) events.bossSpawned = true;
      }
      return;
    }

    if (this.waveQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const next = this.waveQueue.shift();
        if (next) this.spawnEnemy(next.kind, next.side);
        // Ранние волны заходят заметно реже — иначе первая волна проходит за
        // 4 секунды, магазин перехватывает управление раньше, чем игрок
        // распробует бег/прыжок/стрельбу, и это выглядит как «игра не
        // отвечает». К поздним волнам пауза сокращается почти до боевого темпа.
        const pace = Math.max(0.32, 1.5 - this.wave * 0.1);
        this.spawnTimer = next?.kind === 'boss' ? 0 : pace;
      }
      return;
    }

    if (this.enemies.length === 0) {
      const bonus = 20 + this.wave * 6;
      this.coins += bonus;
      this.score += this.wave * 150;
      events.waveCleared = this.wave;
      this.inShop = true;
    }
  }

  private updateShooting(dt: number, events: TickEvents): void {
    this.fireTimer -= dt;
    // Пока есть точка прицела мышью — оружие стреляет только по нажатию, как
    // настоящий курок. Без мыши (тач, только клавиатура) — автонаведение на
    // ближайшего врага, иначе на телефоне стрелять было бы нечем.
    const shouldFire = this.aimPoint !== null ? this.firing : true;
    if (shouldFire && this.fireTimer <= 0) {
      this.fireTimer = this.fireInterval;
      this.playerShoot(events);
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    const margin = 60 * this.scale;
    this.bullets = this.bullets.filter(
      (b) => b.x > -margin && b.x < this.worldWidth + margin && b.y > -this.height && b.y < this.height,
    );
  }

  private updateEnemies(dt: number, events: TickEvents): void {
    for (const e of this.enemies) {
      e.age += dt;
      const dx = this.playerX - e.x;
      const dist = Math.abs(dx);

      if (e.preferredRange > 0) {
        // 'shooter' держит дистанцию: подходит, пока далеко, отходит, если слишком близко.
        if (dist > e.preferredRange * 1.15) e.x += Math.sign(dx) * e.speed * dt;
        else if (dist < e.preferredRange * 0.75) e.x -= Math.sign(dx) * e.speed * dt;
        if (e.age >= e.fireAt) {
          this.enemyShoot(e);
          e.fireAt = e.age + 1.3 + this.rnd() * 0.7;
        }
      } else {
        e.x += Math.sign(dx) * e.speed * dt;
      }
      e.facing = dx >= 0 ? 1 : -1;
    }

    // Контактный урон: не более одного удара за окно неуязвимости, даже если
    // вплотную стоят сразу несколько врагов, и только пока игрок на земле —
    // прыжок должен реально уводить от ближнего боя, а не быть косметикой.
    if (this.isGrounded || this.playerY > -this.height * 0.08) {
      for (const e of this.enemies) {
        if (this.invulnLeft > 0) break;
        const d = Math.hypot(e.x - this.playerX, e.y - this.playerY);
        if (d > e.radius + PLAYER_RADIUS * this.scale) continue;
        this.hitPlayer(e.damage, events);
      }
    }
  }

  private explode(x: number, y: number, radius: number, damage: number, events: TickEvents): void {
    events.explosions.push({ x, y });
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius + e.radius) continue;
      const falloff = 1 - d / (radius + e.radius);
      const dmg = damage * (0.5 + 0.5 * falloff);
      e.hp -= dmg;
      events.hits.push({ x: e.x, y: e.y, damage: Math.round(dmg), crit: false });
      if (e.hp <= 0) this.killEnemy(e, events);
    }
  }

  private killEnemy(e: Enemy, events: TickEvents): void {
    this.coins += e.value;
    this.score += e.value * 8;
    this.gainXp(e.value * 1.5, events);
    events.deaths.push({ x: e.x, y: e.y, kind: e.kind, value: e.value, boss: e.kind === 'boss' });
  }

  private resolveCollisions(events: TickEvents): void {
    for (const b of this.bullets) {
      if (b.hostile) continue;
      for (const e of this.enemies) {
        if (b.x < -99999) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) > b.radius + e.radius) continue;

        if (b.splashRadius > 0) {
          // Взрыв сам считает урон по всем в радиусе, включая эту цель —
          // отдельный «прямой» урон здесь не начисляем, иначе на ближайшем
          // враге он удваивался бы (прямое попадание + полный сплеш на
          // нулевой дистанции).
          this.explode(b.x, b.y, b.splashRadius, b.damage, events);
        } else {
          const crit = this.rnd() < this.critChance;
          const dmg = crit ? b.damage * 1.8 : b.damage;
          e.hp -= dmg;
          events.hits.push({ x: e.x, y: e.y, damage: Math.round(dmg), crit });
          if (e.hp <= 0) this.killEnemy(e, events);
        }

        if (b.pierceLeft > 0) {
          b.pierceLeft -= 1;
        } else {
          b.x = -999999;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.x > -99999);
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    if (this.invulnLeft > 0) return;
    for (const b of this.bullets) {
      if (!b.hostile) continue;
      if (Math.hypot(b.x - this.playerX, b.y - this.playerY) > b.radius + PLAYER_RADIUS * this.scale) continue;
      b.x = -999999;
      this.hitPlayer(b.damage, events);
    }
    this.bullets = this.bullets.filter((b) => b.x > -99999);
  }

  private hitPlayer(damage: number, events: TickEvents): void {
    this.hp -= damage;
    this.invulnLeft = 0.5;
    events.playerHit = true;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      events.playerDied = true;
    }
  }

  get canContinue(): boolean {
    return this.continuesUsed < 2;
  }

  /** Медали за забег — постоянная валюта, не сгорает при смерти. */
  medalsEarned(): number {
    return Math.floor(this.wave * 3 + this.score / 400);
  }
}
