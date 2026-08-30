import { I18n, type AchievementDef } from '@yg/engine';

const ru = {
  title: 'Башня',
  score: 'Счёт',
  best: 'Рекорд',
  restart: 'Заново',
  leaders: 'Таблица лидеров',
  sound: 'Звук',
  tapHint: 'Тапните, чтобы уронить блок',
  perfect: 'Идеально!',
  combo: 'Комбо ×{n}',

  pauseTitle: 'Пауза',
  pauseResume: '▶ Продолжить',
  menuSettings: '⚙️ Настройки',
  settingsTitle: 'Настройки',
  settingsSound: 'Звук',
  settingsSoundOn: 'Вкл',
  settingsSoundOff: 'Выкл',
  back: '← Назад',

  overTitle: 'Башня рухнула',
  overHeight: 'Высота: {height}',
  overBest: 'Рекорд: {best}',
  overNewBest: 'Это ваш новый рекорд',
  overContinue: '▶ Продолжить за рекламу',
  overRestart: 'Новая башня',

  boardLoading: 'Загружаем…',
  boardEmpty: 'Пока никого. Станьте первым.',
  boardLogin: 'Войти, чтобы попасть в таблицу',
  boardPlayer: 'Игрок',
  close: 'Закрыть',

  help: 'Правила и помощь',
  helpTitle: 'Как играть',
  helpFeedback: '✉️ Написать разработчику',
  helpFeedbackSubject: 'Отзыв об игре «Башня»',
  achievements: '🏅 Достижения',
  achievementsTitle: 'Достижения',
  achievementUnlocked: 'Достижение открыто',
  iapNoAds: '🚫 Отключить рекламу',
  iapNoAdsOwned: '✓ Реклама отключена',
};

const en: Partial<typeof ru> = {
  title: 'Tower',
  score: 'Score',
  best: 'Best',
  restart: 'Restart',
  leaders: 'Leaderboard',
  sound: 'Sound',
  tapHint: 'Tap to drop the block',
  perfect: 'Perfect!',
  combo: 'Combo ×{n}',

  pauseTitle: 'Pause',
  pauseResume: '▶ Resume',
  menuSettings: '⚙️ Settings',
  settingsTitle: 'Settings',
  settingsSound: 'Sound',
  settingsSoundOn: 'On',
  settingsSoundOff: 'Off',
  back: '← Back',

  overTitle: 'The tower fell',
  overHeight: 'Height: {height}',
  overBest: 'Best: {best}',
  overNewBest: 'A new personal best',
  overContinue: '▶ Continue for an ad',
  overRestart: 'New tower',

  boardLoading: 'Loading…',
  boardEmpty: 'Nobody here yet. Be the first.',
  boardLogin: 'Sign in to join the board',
  boardPlayer: 'Player',
  close: 'Close',

  help: 'Rules & help',
  helpTitle: 'How to play',
  helpFeedback: '✉️ Message the developer',
  helpFeedbackSubject: 'Tower feedback',
  achievements: '🏅 Achievements',
  achievementsTitle: 'Achievements',
  achievementUnlocked: 'Achievement unlocked',
  iapNoAds: '🚫 Remove ads',
  iapNoAdsOwned: '✓ Ads removed',
};

export type Keys = typeof ru;

const RULES: Record<'ru' | 'en', string[]> = {
  ru: [
    'Блок едет туда-сюда над башней — тапните, чтобы его уронить.',
    'Чем точнее блок ляжет на предыдущий — тем меньше отрежется. Идеальное попадание сохраняет всю ширину и даёт больше очков.',
    'То, что не легло, отваливается и падает — но не мешает игре, просто зрелище.',
    'Если новый блок совсем не задел прошлый — башня падает.',
    'С высотой блоки едут быстрее.',
  ],
  en: [
    'The block slides back and forth above the tower — tap to drop it.',
    'The more precisely it lands on the block below, the less gets cut off. A perfect hit keeps the full width and scores more.',
    'Whatever misses the previous block breaks off and falls — just for show, it does not end the run.',
    'If the new block misses the tower entirely, it falls.',
    'Blocks move faster the higher you go.',
  ],
};

export const rulesFor = (lang: string): string[] => RULES[lang === 'en' ? 'en' : 'ru'];

const ACHIEVEMENTS: Record<'ru' | 'en', AchievementDef[]> = {
  ru: [
    { id: 'first_perfect', icon: '🎯', name: 'Первое попадание', desc: 'Уронили блок идеально ровно' },
    { id: 'height_20', icon: '🏗️', name: 'Двадцать этажей', desc: 'Достигли высоты 20 за один забег' },
    { id: 'height_50', icon: '🏙️', name: 'Пятьдесят этажей', desc: 'Достигли высоты 50 за один забег' },
    { id: 'streak_5', icon: '⚡', name: 'Серия из пяти', desc: '5 идеальных попаданий подряд' },
    { id: 'veteran', icon: '🔄', name: 'Строитель', desc: 'Сыграли 10 забегов' },
  ],
  en: [
    { id: 'first_perfect', icon: '🎯', name: 'First perfect', desc: 'Dropped a block perfectly straight' },
    { id: 'height_20', icon: '🏗️', name: 'Twenty floors', desc: 'Reached height 20 in one run' },
    { id: 'height_50', icon: '🏙️', name: 'Fifty floors', desc: 'Reached height 50 in one run' },
    { id: 'streak_5', icon: '⚡', name: 'Five in a row', desc: '5 perfect drops in a row' },
    { id: 'veteran', icon: '🔄', name: 'Builder', desc: 'Played 10 runs' },
  ],
};

export const achievementsFor = (lang: string): AchievementDef[] => ACHIEVEMENTS[lang === 'en' ? 'en' : 'ru'];

export const createI18n = (lang: string): I18n<Keys> => new I18n<Keys>({ ru, en: en as Keys }, 'ru', lang);
