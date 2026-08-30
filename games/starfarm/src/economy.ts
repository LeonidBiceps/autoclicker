/**
 * Экономика idle-игры — без DOM и платформы.
 *
 * Вся математика собрана здесь, потому что в этом жанре именно баланс
 * определяет, вернётся игрок завтра или нет: цены, темп роста и офлайн-доход
 * должны читаться в одном месте, а не быть размазаны по обработчикам кнопок.
 */

export interface GeneratorDef {
  id: string;
  /** Стоимость первой штуки. */
  baseCost: number;
  /** Сколько энергии в секунду даёт одна штука. */
  rate: number;
}

/**
 * Классическая для жанра прогрессия: каждая следующая штука дороже на 15 %.
 * Цифра не случайная — она держит покупку «всегда почти по карману», из-за чего
 * сессия не заканчивается на первом же ожидании.
 */
const COST_GROWTH = 1.15;

/** Офлайн начисляется не полностью: иначе возвращаться незачем — всё и так копится. */
const OFFLINE_EFFICIENCY = 0.5;
/** Дольше этого офлайн не копится, чтобы отсутствие месяц не ломало прогресс. */
export const OFFLINE_CAP_SECONDS = 8 * 3600;

/** Порог перезапуска: раньше него звёздная пыль не начисляется. */
export const PRESTIGE_THRESHOLD = 1e6;

export const GENERATORS: readonly GeneratorDef[] = [
  { id: 'panel', baseCost: 15, rate: 0.1 },
  { id: 'hydro', baseCost: 100, rate: 1 },
  { id: 'drone', baseCost: 1_100, rate: 8 },
  { id: 'smelter', baseCost: 12_000, rate: 47 },
  { id: 'mirror', baseCost: 130_000, rate: 260 },
  { id: 'wormhole', baseCost: 1_400_000, rate: 1_400 },
];

/**
 * Пассивные перки за звёздную пыль.
 *
 * В отличие от построек, перки не обнуляются перезапуском — это то, ради чего
 * вообще стоит перезапускаться. Каждый со своим уровнем и растущей ценой:
 * многоуровневость даёт постоянное «есть, куда потратить пыль», а не разовую
 * покупку, после которой прогресс останавливается.
 */
export interface PerkDef {
  id: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
}

export const PERKS: readonly PerkDef[] = [
  { id: 'clickPower', baseCost: 1, growth: 1.35, maxLevel: 25 },
  { id: 'reactorOutput', baseCost: 1, growth: 1.35, maxLevel: 25 },
  { id: 'offlineOps', baseCost: 2, growth: 1.5, maxLevel: 9 },
  { id: 'bulkDiscount', baseCost: 3, growth: 1.6, maxLevel: 6 },
  { id: 'meteorLuck', baseCost: 2, growth: 1.4, maxLevel: 10 },
  { id: 'autopilot', baseCost: 5, growth: 1.7, maxLevel: 15 },
];

/** Индексы перков — используются и в экономике, и в интерфейсе. */
export const PERK = {
  CLICK_POWER: 0,
  REACTOR_OUTPUT: 1,
  OFFLINE_OPS: 2,
  BULK_DISCOUNT: 3,
  METEOR_LUCK: 4,
  AUTOPILOT: 5,
} as const;

export interface SaveData extends Record<string, unknown> {
  energy: number;
  totalEarned: number;
  lifetime: number;
  owned: number[];
  clickLevel: number;
  stardust: number;
  perkLevels: number[];
  lastSeen: number;
  muted: boolean;
}

export class Economy {
  energy = 0;
  /** Заработано за текущий забег — от него считается звёздная пыль. */
  totalEarned = 0;
  /** Заработано за всё время. Не обнуляется перезапуском — идёт в лидерборд. */
  lifetime = 0;
  owned: number[] = GENERATORS.map(() => 0);
  clickLevel = 1;
  stardust = 0;
  perkLevels: number[] = PERKS.map(() => 0);

  /** Множитель от рекламного ускорения и момент его окончания. */
  boostMultiplier = 1;
  boostUntil = 0;

  /** Множитель клика от метеорита-неистовства — отдельно от рекламного буста. */
  frenzyMultiplier = 1;
  frenzyUntil = 0;

  // ── производство ────────────────────────────────────────────────────────

  /** Постоянный множитель от звёздной пыли: каждая единица даёт +2 %. */
  get prestigeMultiplier(): number {
    return 1 + this.stardust * 0.02;
  }

  get activeBoost(): number {
    return Date.now() < this.boostUntil ? this.boostMultiplier : 1;
  }

  get activeFrenzy(): number {
    return Date.now() < this.frenzyUntil ? this.frenzyMultiplier : 1;
  }

  get frenzySecondsLeft(): number {
    return Math.max(0, Math.ceil((this.frenzyUntil - Date.now()) / 1000));
  }

  startFrenzy(multiplier: number, seconds: number): void {
    this.frenzyMultiplier = multiplier;
    this.frenzyUntil = Date.now() + seconds * 1000;
  }

  private perkLevel(index: number): number {
    return this.perkLevels[index] ?? 0;
  }

  /** +8 % за уровень перка «сила клика». */
  get perkClickMultiplier(): number {
    return 1 + this.perkLevel(PERK.CLICK_POWER) * 0.08;
  }

  /** +8 % за уровень перка «мощность реактора». */
  get perkRateMultiplier(): number {
    return 1 + this.perkLevel(PERK.REACTOR_OUTPUT) * 0.08;
  }

  /** Автопилот превращает часть силы клика в добычу без нажатий. */
  get autopilotPerSecond(): number {
    return this.perkLevel(PERK.AUTOPILOT) * 0.4 * this.clickLevel * this.prestigeMultiplier;
  }

  /** Доля офлайн-дохода: база 50 %, перк доводит до 100 %. */
  get offlineEfficiency(): number {
    return Math.min(1, OFFLINE_EFFICIENCY + this.perkLevel(PERK.OFFLINE_OPS) * 0.055);
  }

  /** Рост цены построек: перк снижает наценку, но не ниже 8 % за штуку. */
  get costGrowth(): number {
    return Math.max(1.08, COST_GROWTH - this.perkLevel(PERK.BULK_DISCOUNT) * 0.01);
  }

  /** Множитель награды золотого метеорита — растёт с уровнем удачи. */
  get meteorValueMultiplier(): number {
    return 1 + this.perkLevel(PERK.METEOR_LUCK) * 0.15;
  }

  /** Доля, на которую сокращается пауза между метеоритами (не ниже половины). */
  get meteorFrequencyBonus(): number {
    return Math.min(0.5, this.perkLevel(PERK.METEOR_LUCK) * 0.05);
  }

  /** Энергии в секунду со всеми множителями. */
  get perSecond(): number {
    let base = 0;
    for (let i = 0; i < GENERATORS.length; i += 1) {
      base += (GENERATORS[i] as GeneratorDef).rate * (this.owned[i] ?? 0);
    }
    const withPerks = base * this.perkRateMultiplier + this.autopilotPerSecond;
    return withPerks * this.prestigeMultiplier * this.activeBoost;
  }

  get perClick(): number {
    // Клик должен оставаться осмысленным и на поздних этапах, но не заменять
    // генераторы — отсюда мягкий рост и привязка к общему множителю.
    return (
      this.clickLevel *
      this.perkClickMultiplier *
      this.prestigeMultiplier *
      this.activeBoost *
      this.activeFrenzy
    );
  }

  // ── действия ────────────────────────────────────────────────────────────

  tick(dt: number): void {
    this.earn(this.perSecond * dt);
  }

  click(): number {
    const amount = this.perClick;
    this.earn(amount);
    return amount;
  }

  private earn(amount: number): void {
    if (amount <= 0) return;
    this.energy += amount;
    this.totalEarned += amount;
    this.lifetime += amount;
  }

  costOf(index: number): number {
    const def = GENERATORS[index];
    if (!def) return Infinity;
    return Math.ceil(def.baseCost * this.costGrowth ** (this.owned[index] ?? 0));
  }

  canBuy(index: number): boolean {
    return this.energy >= this.costOf(index);
  }

  buy(index: number): boolean {
    if (!this.canBuy(index)) return false;
    this.energy -= this.costOf(index);
    this.owned[index] = (this.owned[index] ?? 0) + 1;
    return true;
  }

  /** Сколько штук можно купить подряд на текущий баланс. */
  affordableCount(index: number, limit = 100): number {
    const def = GENERATORS[index];
    if (!def) return 0;
    const growth = this.costGrowth;
    let budget = this.energy;
    let count = 0;
    let owned = this.owned[index] ?? 0;
    while (count < limit) {
      const cost = Math.ceil(def.baseCost * growth ** owned);
      if (budget < cost) break;
      budget -= cost;
      owned += 1;
      count += 1;
    }
    return count;
  }

  // ── перки ───────────────────────────────────────────────────────────────

  perkCost(index: number): number {
    const def = PERKS[index];
    if (!def) return Infinity;
    const level = this.perkLevel(index);
    if (level >= def.maxLevel) return Infinity;
    return Math.ceil(def.baseCost * def.growth ** level);
  }

  canBuyPerk(index: number): boolean {
    return this.stardust >= this.perkCost(index);
  }

  buyPerk(index: number): boolean {
    if (!this.canBuyPerk(index)) return false;
    this.stardust -= this.perkCost(index);
    this.perkLevels[index] = (this.perkLevels[index] ?? 0) + 1;
    return true;
  }

  get clickUpgradeCost(): number {
    return Math.ceil(25 * 1.6 ** (this.clickLevel - 1));
  }

  upgradeClick(): boolean {
    const cost = this.clickUpgradeCost;
    if (this.energy < cost) return false;
    this.energy -= cost;
    this.clickLevel += 1;
    return true;
  }

  startBoost(multiplier: number, seconds: number): void {
    this.boostMultiplier = multiplier;
    this.boostUntil = Date.now() + seconds * 1000;
  }

  get boostSecondsLeft(): number {
    return Math.max(0, Math.ceil((this.boostUntil - Date.now()) / 1000));
  }

  // ── перезапуск ──────────────────────────────────────────────────────────

  /** Сколько звёздной пыли даст перезапуск прямо сейчас. */
  get pendingStardust(): number {
    if (this.totalEarned < PRESTIGE_THRESHOLD) return 0;
    return Math.floor(Math.sqrt(this.totalEarned / PRESTIGE_THRESHOLD));
  }

  prestige(): number {
    const gain = this.pendingStardust;
    if (gain <= 0) return 0;
    this.stardust += gain;
    this.energy = 0;
    this.totalEarned = 0;
    this.owned = GENERATORS.map(() => 0);
    this.clickLevel = 1;
    this.boostUntil = 0;
    return gain;
  }

  // ── офлайн ──────────────────────────────────────────────────────────────

  /**
   * Считает, сколько накопилось за отсутствие. Ускорение в офлайне не
   * работает — только генераторы и автопилот, с долей от полной отдачи
   * (перк «офлайн-операции» поднимает её вплоть до 100 %).
   */
  offlineEarnings(secondsAway: number): { seconds: number; amount: number } {
    const seconds = Math.min(Math.max(0, secondsAway), OFFLINE_CAP_SECONDS);
    let base = 0;
    for (let i = 0; i < GENERATORS.length; i += 1) {
      base += (GENERATORS[i] as GeneratorDef).rate * (this.owned[i] ?? 0);
    }
    const withPerks = base * this.perkRateMultiplier + this.autopilotPerSecond;
    const amount = withPerks * this.prestigeMultiplier * this.offlineEfficiency * seconds;
    return { seconds, amount };
  }

  collect(amount: number): void {
    this.earn(amount);
  }

  // ── сохранение ──────────────────────────────────────────────────────────

  serialize(muted: boolean): SaveData {
    return {
      energy: this.energy,
      totalEarned: this.totalEarned,
      lifetime: this.lifetime,
      owned: [...this.owned],
      clickLevel: this.clickLevel,
      stardust: this.stardust,
      perkLevels: [...this.perkLevels],
      lastSeen: Date.now(),
      muted,
    };
  }

  /** Возвращает, сколько секунд игрока не было; `null` — сейва не было. */
  deserialize(data: Partial<SaveData>): number | null {
    if (typeof data.energy !== 'number' || !Number.isFinite(data.energy)) return null;

    this.energy = Math.max(0, data.energy);
    this.totalEarned = Math.max(
      this.energy,
      typeof data.totalEarned === 'number' ? data.totalEarned : 0,
    );
    this.lifetime = Math.max(
      this.totalEarned,
      typeof data.lifetime === 'number' ? data.lifetime : 0,
    );
    this.clickLevel = Math.max(1, Math.floor(Number(data.clickLevel) || 1));
    this.stardust = Math.max(0, Math.floor(Number(data.stardust) || 0));

    // Длину массива фиксируем сами: сейв мог прийти из версии с другим набором
    // генераторов, и доверять его форме нельзя.
    const saved = Array.isArray(data.owned) ? data.owned : [];
    this.owned = GENERATORS.map((_, i) => {
      const value = Number(saved[i]);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    });

    const savedPerks = Array.isArray(data.perkLevels) ? data.perkLevels : [];
    this.perkLevels = PERKS.map((def, i) => {
      const value = Number(savedPerks[i]);
      return Number.isFinite(value) && value > 0 ? Math.min(def.maxLevel, Math.floor(value)) : 0;
    });

    const lastSeen = Number(data.lastSeen);
    if (!Number.isFinite(lastSeen) || lastSeen <= 0) return 0;
    // Часы на устройстве могли перевести назад — отрицательный простой не берём.
    return Math.max(0, (Date.now() - lastSeen) / 1000);
  }
}
