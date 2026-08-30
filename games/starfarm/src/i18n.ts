import { I18n, type AchievementDef } from '@yg/engine';

const ru = {
  title: 'Космоферма',
  energy: 'Энергия',
  perSecond: '{value}/сек',
  tapHint: 'Жми на реактор',
  perClick: '+{value} за нажатие',

  shop: 'Постройки',
  buy: 'Купить',
  owned: '{count} шт.',
  clickUpgrade: 'Усилить нажатие',
  level: 'Ур. {level}',

  boost: 'Ускорение ×{mult}',
  boostActive: 'Ускорение ×{mult} · {time}',
  boostOffer: 'Ускорить добычу ×{mult} на {minutes} мин',

  prestige: 'Перезапуск',
  prestigeLocked: 'Перезапуск откроется на {amount} энергии',
  prestigeTitle: 'Перезапустить ферму?',
  prestigeText:
    'Постройки и энергия обнулятся, но вы получите {gain} звёздной пыли. Каждая единица навсегда добавляет +2 % к добыче.',
  prestigeConfirm: 'Перезапустить и получить {gain}',
  stardust: 'Звёздная пыль',

  offlineTitle: 'Ферма работала без вас',
  offlineText: 'За {time} накопилось энергии:',
  offlineCollect: 'Забрать',
  offlineDouble: 'Забрать вдвое больше',

  leaders: 'Таблица лидеров',
  boardEmpty: 'Пока никого. Станьте первым.',
  boardLogin: 'Войти, чтобы попасть в таблицу',
  boardPlayer: 'Игрок',
  close: 'Закрыть',
  cancel: 'Отмена',
  sound: 'Звук',
  back: '← Назад',

  pauseTitle: 'Пауза',
  pauseResume: '▶ Продолжить',
  menuSettings: '⚙️ Настройки',
  settingsTitle: 'Настройки',
  settingsSound: 'Звук',
  settingsSoundOn: 'Вкл',
  settingsSoundOff: 'Выкл',

  genPanel: 'Солнечная панель',
  genHydro: 'Гидропонная ферма',
  genDrone: 'Дрон-сборщик',
  genSmelter: 'Плавильня',
  genMirror: 'Орбитальное зеркало',
  genWormhole: 'Червоточина',

  tabShop: 'Постройки',
  tabPerks: 'Перки',
  perkMax: 'Макс.',

  perkClickPower: 'Сила нажатия',
  perkClickPowerDesc: '+8% к энергии за нажатие',
  perkReactorOutput: 'Мощность реактора',
  perkReactorOutputDesc: '+8% к добыче построек',
  perkOfflineOps: 'Офлайн-операции',
  perkOfflineOpsDesc: '+5.5% к доходу за время отсутствия',
  perkBulkDiscount: 'Оптовые закупки',
  perkBulkDiscountDesc: 'Постройки дорожают медленнее',
  perkMeteorLuck: 'Звёздная удача',
  perkMeteorLuckDesc: 'Метеориты чаще и щедрее',
  perkAutopilot: 'Автопилот',
  perkAutopilotDesc: 'Часть силы нажатия работает без вас',
  perkLockedHint:
    'Звёздная пыль появляется после «Перезапуска» на вкладке «Постройки» — он открывается на {amount} энергии.',

  meteorEnergy: '+{value} энергии',
  meteorBoost: 'Метеорит: короткий всплеск ×5',
  meteorFrenzy: 'Метеорит: неистовство кликов ×10 на 15с',

  help: 'Правила и помощь',
  helpTitle: 'Как играть',
  helpFeedback: '✉️ Написать разработчику',
  helpFeedbackSubject: 'Отзыв об игре «Космоферма»',
  achievements: '🏅 Достижения',
  achievementsTitle: 'Достижения',
  achievementUnlocked: 'Достижение открыто',
  iapNoAds: '🚫 Отключить рекламу',
  iapNoAdsOwned: '✓ Реклама отключена',
};

const en: Partial<typeof ru> = {
  title: 'Star Farm',
  energy: 'Energy',
  perSecond: '{value}/sec',
  tapHint: 'Tap the reactor',
  perClick: '+{value} per tap',

  shop: 'Buildings',
  buy: 'Buy',
  owned: '{count} owned',
  clickUpgrade: 'Upgrade tap',
  level: 'Lv. {level}',

  boost: 'Boost ×{mult}',
  boostActive: 'Boost ×{mult} · {time}',
  boostOffer: 'Boost output ×{mult} for {minutes} min',

  prestige: 'Restart',
  prestigeLocked: 'Restart unlocks at {amount} energy',
  prestigeTitle: 'Restart the farm?',
  prestigeText:
    'Buildings and energy reset, but you gain {gain} stardust. Each unit permanently adds +2% output.',
  prestigeConfirm: 'Restart and take {gain}',
  stardust: 'Stardust',

  offlineTitle: 'The farm kept running',
  offlineText: 'Collected while you were away for {time}:',
  offlineCollect: 'Collect',
  offlineDouble: 'Collect double',

  leaders: 'Leaderboard',
  boardEmpty: 'Nobody here yet. Be the first.',
  boardLogin: 'Sign in to join the board',
  boardPlayer: 'Player',
  close: 'Close',
  cancel: 'Cancel',
  sound: 'Sound',
  back: '← Back',

  pauseTitle: 'Pause',
  pauseResume: '▶ Resume',
  menuSettings: '⚙️ Settings',
  settingsTitle: 'Settings',
  settingsSound: 'Sound',
  settingsSoundOn: 'On',
  settingsSoundOff: 'Off',

  genPanel: 'Solar panel',
  genHydro: 'Hydroponic farm',
  genDrone: 'Collector drone',
  genSmelter: 'Smelter',
  genMirror: 'Orbital mirror',
  genWormhole: 'Wormhole',

  tabShop: 'Buildings',
  tabPerks: 'Perks',
  perkMax: 'Max',

  perkClickPower: 'Tap power',
  perkClickPowerDesc: '+8% energy per tap',
  perkReactorOutput: 'Reactor output',
  perkReactorOutputDesc: '+8% building output',
  perkOfflineOps: 'Offline ops',
  perkOfflineOpsDesc: '+5.5% earnings while away',
  perkBulkDiscount: 'Bulk buying',
  perkBulkDiscountDesc: 'Buildings get expensive slower',
  perkMeteorLuck: 'Star luck',
  perkMeteorLuckDesc: 'Meteors appear more often and pay more',
  perkAutopilot: 'Autopilot',
  perkAutopilotDesc: 'Part of your tap power works without you',
  perkLockedHint:
    'Stardust appears after a "Restart" on the Buildings tab — it unlocks at {amount} energy.',

  meteorEnergy: '+{value} energy',
  meteorBoost: 'Meteor: short ×5 burst',
  meteorFrenzy: 'Meteor: ×10 tap frenzy for 15s',

  help: 'Rules & help',
  helpTitle: 'How to play',
  helpFeedback: '✉️ Message the developer',
  helpFeedbackSubject: 'Star Farm feedback',
  achievements: '🏅 Achievements',
  achievementsTitle: 'Achievements',
  achievementUnlocked: 'Achievement unlocked',
  iapNoAds: '🚫 Remove ads',
  iapNoAdsOwned: '✓ Ads removed',
};

export type Keys = typeof ru;

const RULES: Record<'ru' | 'en', string[]> = {
  ru: [
    'Тапайте по реактору, чтобы добывать энергию вручную.',
    'Покупайте постройки — они добывают энергию сами, даже пока вы офлайн.',
    'Перезапуск даёт звёздную пыль — тратьте её на постоянные перки во вкладке «Перки».',
    'Ловите золотые метеориты кликом ради разовых бонусов.',
  ],
  en: [
    'Tap the reactor to mine energy by hand.',
    'Buy buildings — they mine energy on their own, even while you are offline.',
    'Restarting grants stardust — spend it on permanent perks in the Perks tab.',
    'Tap golden meteors for one-time bonuses.',
  ],
};

export const rulesFor = (lang: string): string[] => RULES[lang === 'en' ? 'en' : 'ru'];

const ACHIEVEMENTS: Record<'ru' | 'en', AchievementDef[]> = {
  ru: [
    { id: 'first_prestige', icon: '✨', name: 'Первый перезапуск', desc: 'Перезапустили ферму и получили звёздную пыль' },
    { id: 'five_prestige', icon: '🌌', name: 'Космический ветеран', desc: 'Перезапустили ферму 5 раз' },
    { id: 'meteor_hunter', icon: '☄️', name: 'Охотник за метеоритами', desc: 'Поймали 20 золотых метеоритов' },
    { id: 'max_perk', icon: '🔺', name: 'Предел прокачки', desc: 'Прокачали любой перк до максимума' },
    { id: 'billionaire', icon: '💰', name: 'Миллиардер', desc: 'Заработали миллиард энергии за всё время' },
    { id: 'offline_return', icon: '🌙', name: 'С возвращением', desc: 'Забрали доход, накопленный в офлайне' },
  ],
  en: [
    { id: 'first_prestige', icon: '✨', name: 'First restart', desc: 'Restarted the farm and got stardust' },
    { id: 'five_prestige', icon: '🌌', name: 'Space veteran', desc: 'Restarted the farm 5 times' },
    { id: 'meteor_hunter', icon: '☄️', name: 'Meteor hunter', desc: 'Caught 20 golden meteors' },
    { id: 'max_perk', icon: '🔺', name: 'Maxed out', desc: 'Upgraded any perk to its max level' },
    { id: 'billionaire', icon: '💰', name: 'Billionaire', desc: 'Earned a billion energy lifetime' },
    { id: 'offline_return', icon: '🌙', name: 'Welcome back', desc: 'Collected earnings made while offline' },
  ],
};

export const achievementsFor = (lang: string): AchievementDef[] => ACHIEVEMENTS[lang === 'en' ? 'en' : 'ru'];

export const createI18n = (lang: string): I18n<Keys> =>
  new I18n<Keys>({ ru, en: en as Keys }, 'ru', lang);
