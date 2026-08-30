import { I18n, type AchievementDef } from '@yg/engine';

/**
 * Словари игры. Русский — основной: если в другом языке ключ забыт,
 * подставится русская строка, а не пустое место.
 */
const ru = {
  score: 'Счёт',
  best: 'Рекорд',
  undo: 'Отменить',
  restart: 'Заново',
  leaders: 'Таблица лидеров',
  sound: 'Звук',

  pauseTitle: 'Пауза',
  pauseResume: '▶ Продолжить',
  menuSettings: '⚙️ Настройки',
  settingsTitle: 'Настройки',
  settingsSound: 'Звук',
  settingsSoundOn: 'Вкл',
  settingsSoundOff: 'Выкл',
  back: '← Назад',

  goalTitle: 'Есть 2048!',
  goalText: 'Можно остановиться на этом — а можно посмотреть, как далеко получится зайти.',
  goalContinue: 'Играть дальше',
  goalRestart: 'Начать заново',

  overTitle: 'Ходов больше нет',
  overRecord: 'Это ваш новый рекорд.',
  overBest: 'Ваш рекорд: {best}',
  overContinue: 'Продолжить · убрать {count} фишки',
  overRestart: 'Новая игра',

  boardLoading: 'Загружаем…',
  boardEmpty: 'Пока никого. Станьте первым.',
  boardLogin: 'Войти, чтобы попасть в таблицу',
  boardPlayer: 'Игрок',
  close: 'Закрыть',

  help: 'Правила и помощь',
  helpTitle: 'Как играть',
  helpFeedback: '✉️ Написать разработчику',
  helpFeedbackSubject: 'Отзыв об игре «2048»',
  achievements: '🏅 Достижения',
  achievementsTitle: 'Достижения',
  achievementUnlocked: 'Достижение открыто',
  iapNoAds: '🚫 Отключить рекламу',
  iapNoAdsOwned: '✓ Реклама отключена',
  iapPending: 'Оформляем покупку…',
};

const en: Partial<typeof ru> = {
  score: 'Score',
  best: 'Best',
  undo: 'Undo',
  restart: 'Restart',
  leaders: 'Leaderboard',
  sound: 'Sound',

  pauseTitle: 'Pause',
  pauseResume: '▶ Resume',
  menuSettings: '⚙️ Settings',
  settingsTitle: 'Settings',
  settingsSound: 'Sound',
  settingsSoundOn: 'On',
  settingsSoundOff: 'Off',
  back: '← Back',

  goalTitle: 'You made 2048!',
  goalText: 'You can stop here — or find out how much further this goes.',
  goalContinue: 'Keep playing',
  goalRestart: 'Start over',

  overTitle: 'No moves left',
  overRecord: 'A new personal best.',
  overBest: 'Your best: {best}',
  overContinue: 'Continue · clear {count} tiles',
  overRestart: 'New game',

  boardLoading: 'Loading…',
  boardEmpty: 'Nobody here yet. Be the first.',
  boardLogin: 'Sign in to join the board',
  boardPlayer: 'Player',
  close: 'Close',

  help: 'Rules & help',
  helpTitle: 'How to play',
  helpFeedback: '✉️ Message the developer',
  helpFeedbackSubject: '2048 feedback',
  achievements: '🏅 Achievements',
  achievementsTitle: 'Achievements',
  achievementUnlocked: 'Achievement unlocked',
  iapNoAds: '🚫 Remove ads',
  iapNoAdsOwned: '✓ Ads removed',
  iapPending: 'Processing purchase…',
};

export type Keys = typeof ru;

/** Список правил, отдельно от шаблонных строк — их не подставляют в текст, а перечисляют. */
const RULES: Record<'ru' | 'en', string[]> = {
  ru: [
    'Свайпайте в любую сторону или используйте стрелки — все плитки едут туда.',
    'Две одинаковые плитки сливаются в одну, вдвое больше.',
    'Доберитесь до 2048 — и играйте дальше, если получится больше.',
    'Три отмены хода бесплатно за партию, дальше — за просмотр рекламы.',
  ],
  en: [
    'Swipe in any direction, or use arrow keys — every tile slides that way.',
    'Two matching tiles merge into one worth double.',
    'Reach 2048 — then keep going to see how far you get.',
    'Three free undos per run, more available for watching an ad.',
  ],
};

export const rulesFor = (lang: string): string[] => RULES[lang === 'en' ? 'en' : 'ru'];

/** Достижения — id постоянны между языками, локализованы только имя и описание. */
const ACHIEVEMENTS: Record<'ru' | 'en', AchievementDef[]> = {
  ru: [
    { id: 'first_2048', icon: '🏆', name: 'Есть 2048!', desc: 'Собрали плитку 2048 впервые' },
    { id: 'score_5000', icon: '⭐', name: 'Пять тысяч', desc: 'Набрали 5 000 очков за партию' },
    { id: 'score_20000', icon: '🌟', name: 'Двадцать тысяч', desc: 'Набрали 20 000 очков за партию' },
    { id: 'tile_4096', icon: '💎', name: 'За пределами цели', desc: 'Собрали плитку 4096' },
    { id: 'no_undo_win', icon: '🎯', name: 'Без права на ошибку', desc: 'Дошли до 2048, ни разу не отменив ход' },
    { id: 'veteran', icon: '🔄', name: 'Ветеран', desc: 'Сыграли 10 партий' },
  ],
  en: [
    { id: 'first_2048', icon: '🏆', name: 'There it is!', desc: 'Made the 2048 tile for the first time' },
    { id: 'score_5000', icon: '⭐', name: 'Five thousand', desc: 'Scored 5,000 points in one run' },
    { id: 'score_20000', icon: '🌟', name: 'Twenty thousand', desc: 'Scored 20,000 points in one run' },
    { id: 'tile_4096', icon: '💎', name: 'Beyond the goal', desc: 'Made the 4096 tile' },
    { id: 'no_undo_win', icon: '🎯', name: 'No second guesses', desc: 'Reached 2048 without a single undo' },
    { id: 'veteran', icon: '🔄', name: 'Veteran', desc: 'Played 10 runs' },
  ],
};

export const achievementsFor = (lang: string): AchievementDef[] => ACHIEVEMENTS[lang === 'en' ? 'en' : 'ru'];

export const createI18n = (lang: string): I18n<Keys> =>
  new I18n<Keys>({ ru, en: en as Keys }, 'ru', lang);
