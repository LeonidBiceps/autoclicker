import { I18n, type AchievementDef } from '@yg/engine';

const ru = {
  title: 'Самоцветы',
  score: 'Счёт',
  best: 'Рекорд',
  restart: 'Заново',
  leaders: 'Таблица лидеров',
  sound: 'Звук',
  shuffle: 'Перемешать',
  shuffleHint: 'Ходов не осталось',

  pauseTitle: 'Пауза',
  pauseResume: '▶ Продолжить',
  menuSettings: '⚙️ Настройки',
  settingsTitle: 'Настройки',
  settingsSound: 'Звук',
  settingsSoundOn: 'Вкл',
  settingsSoundOff: 'Выкл',
  back: '← Назад',

  comboText: 'Комбо ×{combo}',

  boostOffer: 'Удвоить очки на {seconds} с',
  boostActive: 'Очки ×2 · {seconds} с',

  overTitle: 'Отличная партия!',
  overBest: 'Рекорд: {best}',
  overNewBest: 'Это ваш новый рекорд',
  overRestart: 'Играть снова',
  overKeep: 'Продолжить без сброса',

  boardLoading: 'Загружаем…',
  boardEmpty: 'Пока никого. Станьте первым.',
  boardLogin: 'Войти, чтобы попасть в таблицу',
  boardPlayer: 'Игрок',
  close: 'Закрыть',

  help: 'Правила и помощь',
  helpTitle: 'Как играть',
  helpFeedback: '✉️ Написать разработчику',
  helpFeedbackSubject: 'Отзыв об игре «Самоцветы»',
  achievements: '🏅 Достижения',
  achievementsTitle: 'Достижения',
  achievementUnlocked: 'Достижение открыто',
  iapNoAds: '🚫 Отключить рекламу',
  iapNoAdsOwned: '✓ Реклама отключена',
};

const en: Partial<typeof ru> = {
  title: 'Gems',
  score: 'Score',
  best: 'Best',
  restart: 'Restart',
  leaders: 'Leaderboard',
  sound: 'Sound',
  shuffle: 'Shuffle',
  shuffleHint: 'No moves left',

  pauseTitle: 'Pause',
  pauseResume: '▶ Resume',
  menuSettings: '⚙️ Settings',
  settingsTitle: 'Settings',
  settingsSound: 'Sound',
  settingsSoundOn: 'On',
  settingsSoundOff: 'Off',
  back: '← Back',

  comboText: 'Combo ×{combo}',

  boostOffer: 'Double points for {seconds}s',
  boostActive: 'Points ×2 · {seconds}s',

  overTitle: 'Great run!',
  overBest: 'Best: {best}',
  overNewBest: 'That is a new personal best',
  overRestart: 'Play again',
  overKeep: 'Keep playing',

  boardLoading: 'Loading…',
  boardEmpty: 'Nobody here yet. Be the first.',
  boardLogin: 'Sign in to join the board',
  boardPlayer: 'Player',
  close: 'Close',

  help: 'Rules & help',
  helpTitle: 'How to play',
  helpFeedback: '✉️ Message the developer',
  helpFeedbackSubject: 'Gems feedback',
  achievements: '🏅 Achievements',
  achievementsTitle: 'Achievements',
  achievementUnlocked: 'Achievement unlocked',
  iapNoAds: '🚫 Remove ads',
  iapNoAdsOwned: '✓ Ads removed',
};

export type Keys = typeof ru;

const RULES: Record<'ru' | 'en', string[]> = {
  ru: [
    'Меняйте местами соседние камни, чтобы собрать ряд из трёх и больше.',
    'Ряд из четырёх даёт полосатый камень — сносит весь свой ряд или столбец. Ряд из пяти — камень-бомбу, сносит квадрат вокруг себя.',
    'Одно движение может запустить цепочку из нескольких совпадений подряд — это комбо, оно приносит больше очков.',
    'Режим бесконечный: тупиковое поле пересобирается само и бесплатно.',
    'Долго думаете — игра подсветит один из возможных ходов.',
  ],
  en: [
    'Swap neighboring gems to line up three or more.',
    'A run of four makes a striped gem — it clears its whole row or column. A run of five makes a bomb — it clears a square around itself.',
    'One move can set off several matches in a row — that is a combo, and it scores more.',
    'The mode is endless: a dead-end board reshuffles itself for free.',
    'Taking a while to move? The game highlights a possible move.',
  ],
};

export const rulesFor = (lang: string): string[] => RULES[lang === 'en' ? 'en' : 'ru'];

const ACHIEVEMENTS: Record<'ru' | 'en', AchievementDef[]> = {
  ru: [
    { id: 'combo_master', icon: '⚡', name: 'Мастер комбо', desc: 'Собрали цепочку из 4 совпадений подряд одним ходом' },
    { id: 'special_gem', icon: '💥', name: 'Взрывной ход', desc: 'Собрали ряд из четырёх и получили спецкамень' },
    { id: 'score_5000', icon: '⭐', name: 'Пять тысяч', desc: 'Набрали 5 000 очков за партию' },
    { id: 'score_20000', icon: '🌟', name: 'Двадцать тысяч', desc: 'Набрали 20 000 очков за партию' },
    { id: 'shuffle_survivor', icon: '🍀', name: 'Второе дыхание', desc: 'Поле пересобралось само после тупика' },
    { id: 'ten_runs', icon: '🔄', name: 'Постоянный клиент', desc: 'Сыграли 10 партий' },
  ],
  en: [
    { id: 'combo_master', icon: '⚡', name: 'Combo master', desc: 'Chained 4 matches in a row on one move' },
    { id: 'special_gem', icon: '💥', name: 'Explosive move', desc: 'Matched four in a row and made a special gem' },
    { id: 'score_5000', icon: '⭐', name: 'Five thousand', desc: 'Scored 5,000 points in one run' },
    { id: 'score_20000', icon: '🌟', name: 'Twenty thousand', desc: 'Scored 20,000 points in one run' },
    { id: 'shuffle_survivor', icon: '🍀', name: 'Second wind', desc: 'The board reshuffled itself after a dead end' },
    { id: 'ten_runs', icon: '🔄', name: 'Regular', desc: 'Played 10 runs' },
  ],
};

export const achievementsFor = (lang: string): AchievementDef[] => ACHIEVEMENTS[lang === 'en' ? 'en' : 'ru'];

export const createI18n = (lang: string): I18n<Keys> =>
  new I18n<Keys>({ ru, en: en as Keys }, 'ru', lang);
