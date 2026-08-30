import { I18n, type AchievementDef } from '@yg/engine';
import type { ClassId } from './classes';
import type { WeaponId } from './weapons';

const ru = {
  title: 'Астроштурм',
  score: 'Счёт',
  wave: 'Волна {n}',
  hp: 'ХП',
  coins: 'Монеты',
  medals: 'Медали',

  waveBanner: 'Волна {n}',
  bossBanner: 'БОСС',
  levelBanner: 'Уровень {n}!',

  shopTitle: 'Магазин · Волна {n}',
  shopDamage: 'Урон',
  shopFireRate: 'Скорострельность',
  shopHp: 'Живучесть',
  shopSpeed: 'Скорость',
  shopContinue: 'В бой',
  shopMax: 'Макс.',
  level: 'Ур. {level}',

  overTitle: 'Вы пали в бою',
  overWave: 'Дошли до волны {wave}',
  overScore: 'Счёт: {score}',
  overMedals: '+{medals} медалей',
  overContinue: '▶ Возродиться',
  overRestart: 'Новый забег',

  perksTitle: 'Постоянные перки',
  perkDamage: 'Боевая подготовка',
  perkDamageDesc: '+8% урона в каждом забеге',
  perkHp: 'Броня',
  perkHpDesc: '+10% максимума здоровья',
  perkFireRate: 'Реакция',
  perkFireRateDesc: '+7% скорострельности',
  perkCrit: 'Меткость',
  perkCritDesc: '+3% шанса крита',

  help: 'Правила и помощь',
  helpTitle: 'Как играть',
  helpFeedback: '✉️ Написать разработчику',
  helpFeedbackSubject: 'Отзыв об игре «Астроштурм»',
  achievements: '🏅 Достижения',
  achievementsTitle: 'Достижения',
  achievementUnlocked: 'Достижение открыто',
  iapNoAds: '🚫 Отключить рекламу',
  iapNoAdsOwned: '✓ Реклама отключена',

  leaders: 'Таблица лидеров',
  boardEmpty: 'Пока никого. Станьте первым.',
  boardLogin: 'Войти, чтобы попасть в таблицу',
  boardPlayer: 'Игрок',
  close: 'Закрыть',
  back: '← Назад',
  sound: 'Звук',

  pauseTitle: 'Пауза',
  pauseResume: '▶ Продолжить',
  pauseExit: '🚪 Выйти в меню',
  menuSettings: '⚙️ Настройки',
  settingsTitle: 'Настройки',
  settingsSound: 'Звук',
  settingsSoundOn: 'Вкл',
  settingsSoundOff: 'Выкл',

  // ── меню ──────────────────────────────────────────────────────────────
  menuPlay: '▶ В БОЙ',
  menuArsenal: '🔫 Арсенал',
  menuClasses: '🎖️ Классы',
  menuBest: 'Лучший результат: волна {wave}',
  menuFirstTime: 'Стреляйте, прыгайте, зачищайте волны',

  arsenalTitle: 'Арсенал',
  arsenalHint: 'Выберите оружие для следующего забега',
  weaponEquipped: 'Экипировано',
  weaponEquip: 'Экипировать',
  weaponLocked: '{cost} медалей',

  classesTitle: 'Классы',
  classesHint: 'Выберите класс для следующего забега',
  classEquipped: 'Экипирован',
  classEquip: 'Выбрать',
  classLocked: 'Волна {wave}',

  weaponPistolName: 'Пистолет',
  weaponPistolDesc: 'Сбалансированное стартовое оружие',
  weaponSmgName: 'Автомат',
  weaponSmgDesc: 'Быстрая стрельба, слабый урон за выстрел',
  weaponShotgunName: 'Дробовик',
  weaponShotgunDesc: 'Веер из пяти пуль, силён вблизи',
  weaponSniperName: 'Снайперка',
  weaponSniperDesc: 'Редкие, но мощные выстрелы навылет',
  weaponRocketName: 'Ракетница',
  weaponRocketDesc: 'Взрыв по площади при попадании',

  classAssaultName: 'Штурмовик',
  classAssaultDesc: 'Сбалансирован во всём',
  classSniperName: 'Снайпер',
  classSniperDesc: 'Мало здоровья, много урона',
  classHeavyName: 'Тяжёлый',
  classHeavyDesc: 'Много здоровья, медленнее остальных',
};

const en: Partial<typeof ru> = {
  title: 'Astro Assault',
  score: 'Score',
  wave: 'Wave {n}',
  hp: 'HP',
  coins: 'Coins',
  medals: 'Medals',

  waveBanner: 'Wave {n}',
  bossBanner: 'BOSS',
  levelBanner: 'Level {n}!',

  shopTitle: 'Shop · Wave {n}',
  shopDamage: 'Damage',
  shopFireRate: 'Fire rate',
  shopHp: 'Toughness',
  shopSpeed: 'Speed',
  shopContinue: 'Fight on',
  shopMax: 'Max',
  level: 'Lv. {level}',

  overTitle: 'You fell in battle',
  overWave: 'Reached wave {wave}',
  overScore: 'Score: {score}',
  overMedals: '+{medals} medals',
  overContinue: '▶ Revive',
  overRestart: 'New run',

  perksTitle: 'Permanent perks',
  perkDamage: 'Combat training',
  perkDamageDesc: '+8% damage every run',
  perkHp: 'Armor',
  perkHpDesc: '+10% max health',
  perkFireRate: 'Reflexes',
  perkFireRateDesc: '+7% fire rate',
  perkCrit: 'Marksmanship',
  perkCritDesc: '+3% crit chance',

  help: 'Rules & help',
  helpTitle: 'How to play',
  helpFeedback: '✉️ Message the developer',
  helpFeedbackSubject: 'Astro Assault feedback',
  achievements: '🏅 Achievements',
  achievementsTitle: 'Achievements',
  achievementUnlocked: 'Achievement unlocked',
  iapNoAds: '🚫 Remove ads',
  iapNoAdsOwned: '✓ Ads removed',

  leaders: 'Leaderboard',
  boardEmpty: 'Nobody here yet. Be the first.',
  boardLogin: 'Sign in to join the board',
  boardPlayer: 'Player',
  close: 'Close',
  back: '← Back',
  sound: 'Sound',

  pauseTitle: 'Paused',
  pauseResume: '▶ Resume',
  pauseExit: '🚪 Exit to menu',
  menuSettings: '⚙️ Settings',
  settingsTitle: 'Settings',
  settingsSound: 'Sound',
  settingsSoundOn: 'On',
  settingsSoundOff: 'Off',

  menuPlay: '▶ FIGHT',
  menuArsenal: '🔫 Arsenal',
  menuClasses: '🎖️ Classes',
  menuBest: 'Best run: wave {wave}',
  menuFirstTime: 'Shoot, jump, clear the waves',

  arsenalTitle: 'Arsenal',
  arsenalHint: 'Pick a weapon for your next run',
  weaponEquipped: 'Equipped',
  weaponEquip: 'Equip',
  weaponLocked: '{cost} medals',

  classesTitle: 'Classes',
  classesHint: 'Pick a class for your next run',
  classEquipped: 'Equipped',
  classEquip: 'Select',
  classLocked: 'Wave {wave}',

  weaponPistolName: 'Pistol',
  weaponPistolDesc: 'Balanced starting weapon',
  weaponSmgName: 'SMG',
  weaponSmgDesc: 'Fast fire, low damage per shot',
  weaponShotgunName: 'Shotgun',
  weaponShotgunDesc: 'Five-pellet spread, strong up close',
  weaponSniperName: 'Sniper rifle',
  weaponSniperDesc: 'Rare but heavy shots that pierce',
  weaponRocketName: 'Rocket launcher',
  weaponRocketDesc: 'Splash damage on impact',

  classAssaultName: 'Assault',
  classAssaultDesc: 'Balanced all around',
  classSniperName: 'Sniper',
  classSniperDesc: 'Low health, high damage',
  classHeavyName: 'Heavy',
  classHeavyDesc: 'High health, slower than the rest',
};

export type Keys = typeof ru;

const RULES: Record<'ru' | 'en', string[]> = {
  ru: [
    'Бегайте клавишами (A/D или стрелки) и прыгайте (пробел/W) — на платформах можно уйти от врагов вверх.',
    'На компьютере цельтесь мышью — стреляете туда, куда наведён курсор. На телефоне — джойстик слева и автонаведение на ближайшего врага.',
    'Между волнами открывается магазин: тратьте монеты на урон, скорострельность, живучесть и скорость.',
    'В Арсенале открывайте разное оружие за медали, в Классах — персонажей с разными сильными сторонами.',
    'Каждая пятая волна — босс с большим запасом здоровья.',
    'Медали за забег не сгорают — тратьте их на постоянные перки, они остаются навсегда.',
  ],
  en: [
    'Run with keys (A/D or arrows) and jump (space/W) — platforms let you escape enemies upward.',
    'On desktop, aim with the mouse — you fire where the cursor points. On phone, use the left joystick and auto-aim at the nearest enemy.',
    'A shop opens between waves: spend coins on damage, fire rate, toughness and speed.',
    'Unlock weapons in the Arsenal with medals, and characters with different strengths in Classes.',
    'Every fifth wave is a boss with a big health pool.',
    'Medals from a run never disappear — spend them on permanent perks that stay forever.',
  ],
};

export const rulesFor = (lang: string): string[] => RULES[lang === 'en' ? 'en' : 'ru'];

const ACHIEVEMENTS: Record<'ru' | 'en', AchievementDef[]> = {
  ru: [
    { id: 'first_boss', icon: '💀', name: 'Первый босс', desc: 'Победили первого босса' },
    { id: 'wave_10', icon: '🔥', name: 'Десятая волна', desc: 'Дошли до 10-й волны' },
    { id: 'wave_20', icon: '🌋', name: 'Двадцатая волна', desc: 'Дошли до 20-й волны' },
    { id: 'no_hit_wave', icon: '🛡️', name: 'Без единой царапины', desc: 'Прошли волну, не получив урона' },
    { id: 'shopaholic', icon: '💰', name: 'Транжира', desc: 'Купили 10 апгрейдов за один забег' },
    { id: 'ten_runs', icon: '🔄', name: 'Ветеран арены', desc: 'Сыграли 10 забегов' },
    { id: 'full_arsenal', icon: '🎒', name: 'Полный арсенал', desc: 'Открыли всё оружие' },
    { id: 'all_classes', icon: '🏵️', name: 'Все классы', desc: 'Открыли всех персонажей' },
  ],
  en: [
    { id: 'first_boss', icon: '💀', name: 'First boss down', desc: 'Defeated your first boss' },
    { id: 'wave_10', icon: '🔥', name: 'Wave ten', desc: 'Reached wave 10' },
    { id: 'wave_20', icon: '🌋', name: 'Wave twenty', desc: 'Reached wave 20' },
    { id: 'no_hit_wave', icon: '🛡️', name: 'Not a scratch', desc: 'Cleared a wave without taking damage' },
    { id: 'shopaholic', icon: '💰', name: 'Big spender', desc: 'Bought 10 upgrades in one run' },
    { id: 'ten_runs', icon: '🔄', name: 'Arena veteran', desc: 'Played 10 runs' },
    { id: 'full_arsenal', icon: '🎒', name: 'Full arsenal', desc: 'Unlocked every weapon' },
    { id: 'all_classes', icon: '🏵️', name: 'All classes', desc: 'Unlocked every class' },
  ],
};

export const achievementsFor = (lang: string): AchievementDef[] => ACHIEVEMENTS[lang === 'en' ? 'en' : 'ru'];

const WEAPON_NAME_KEY: Record<WeaponId, keyof Keys> = {
  pistol: 'weaponPistolName',
  smg: 'weaponSmgName',
  shotgun: 'weaponShotgunName',
  sniper: 'weaponSniperName',
  rocket: 'weaponRocketName',
};
const WEAPON_DESC_KEY: Record<WeaponId, keyof Keys> = {
  pistol: 'weaponPistolDesc',
  smg: 'weaponSmgDesc',
  shotgun: 'weaponShotgunDesc',
  sniper: 'weaponSniperDesc',
  rocket: 'weaponRocketDesc',
};
const CLASS_NAME_KEY: Record<ClassId, keyof Keys> = {
  assault: 'classAssaultName',
  sniper: 'classSniperName',
  heavy: 'classHeavyName',
};
const CLASS_DESC_KEY: Record<ClassId, keyof Keys> = {
  assault: 'classAssaultDesc',
  sniper: 'classSniperDesc',
  heavy: 'classHeavyDesc',
};

export const weaponNameKey = (id: WeaponId): keyof Keys => WEAPON_NAME_KEY[id];
export const weaponDescKey = (id: WeaponId): keyof Keys => WEAPON_DESC_KEY[id];
export const classNameKey = (id: ClassId): keyof Keys => CLASS_NAME_KEY[id];
export const classDescKey = (id: ClassId): keyof Keys => CLASS_DESC_KEY[id];

export const createI18n = (lang: string): I18n<Keys> =>
  new I18n<Keys>({ ru, en: en as Keys }, 'ru', lang);
