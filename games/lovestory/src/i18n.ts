/**
 * Локализация интерфейса. Текст самих глав (`story.ts`) пока только на
 * русском — это издательский контент, а не пара десятков строк интерфейса,
 * и его перевод имеет смысл делать отдельным заходом, когда понятно, что
 * механика заходит игрокам. Английский тут покрывает только UI-обвязку.
 */

import { I18n } from '@yg/engine';

const ru = {
  title: 'Клуб Свиданий',
  hubSubtitle: 'Выбирай, с кем продолжить историю',

  energy: 'Энергия',
  coins: 'Монеты',
  energyFull: 'Энергия полная',
  energyNext: 'Следующая через {time}',
  watchAdForEnergy: '▶ Реклама за полную энергию',
  notEnoughEnergy: 'Не хватает энергии на главу',

  play: '▶ Играть',
  continueChapter: 'Продолжить',
  locked: 'Скоро в клубе',
  chapterLocked: '🔒 Сначала пройдите предыдущую главу',
  noChaptersYet: 'Новые главы скоро появятся',
  chapterCost: '−{cost} энергии',

  giftShop: '🎁 Подарки',
  giftShopTitle: 'Подарки',
  giftShopHint: 'Выберите, кому и что подарить — отношения растут сразу',
  giftGiven: 'Подарок вручён!',
  giftAlreadyToday: 'Уже дарили сегодня',
  giftCoffee: 'Кофе навынос',
  giftFlowers: 'Букет цветов',
  giftPresent: 'Подарок с открыткой',

  tierStranger: 'Незнакомец',
  tierAcquaintance: 'Знакомство',
  tierSympathy: 'Симпатия',
  tierCrush: 'Влюблённость',
  tierRomance: 'Роман',

  tapToContinue: 'Нажмите, чтобы продолжить',
  chapterEndTitle: 'Глава пройдена',
  chapterEndHearts: '+{n} к отношениям',
  chapterEndCoins: '+{n} монет',
  backToHub: 'В клуб',

  menuSettings: '⚙️ Настройки',
  settingsTitle: 'Настройки',
  settingsSound: 'Звук',
  settingsSoundOn: 'Вкл',
  settingsSoundOff: 'Выкл',

  achievements: '🏅 Достижения',
  achievementsTitle: 'Достижения',
  achievementUnlocked: 'Достижение открыто',

  leaders: 'Таблица лидеров',
  boardEmpty: 'Пока никого. Станьте первой.',
  boardLogin: 'Войти, чтобы попасть в таблицу',
  boardPlayer: 'Игрок',

  help: 'Правила и помощь',
  helpTitle: 'Как играть',
  helpRules1: 'Проходите главы историй — выбор реплик влияет на отношения с персонажем.',
  helpRules2: 'Каждая глава стоит энергию. Энергия восстанавливается сама или мгновенно — за рекламу.',
  helpRules3: 'Дарите подарки в клубе, чтобы поднять отношения без прохождения глав.',
  helpRules4: 'Чем выше отношения — тем теплее реакции персонажа и тем ближе роман.',
  helpFeedback: '✉️ Написать разработчику',
  helpFeedbackSubject: 'Отзыв об игре «Клуб Свиданий»',
  iapNoAds: '🚫 Отключить рекламу',
  iapNoAdsOwned: '✓ Реклама отключена',

  close: 'Закрыть',
  back: '← Назад',
  sound: 'Звук',
  you: 'Вы',
  hubButton: 'Клуб',
};

const en: Partial<typeof ru> = {
  title: 'Dating Club',
  hubSubtitle: 'Pick who to continue the story with',

  energy: 'Energy',
  coins: 'Coins',
  energyFull: 'Energy full',
  energyNext: 'Next in {time}',
  watchAdForEnergy: '▶ Watch ad for full energy',
  notEnoughEnergy: 'Not enough energy for a chapter',

  play: '▶ Play',
  continueChapter: 'Continue',
  locked: 'Coming soon',
  chapterLocked: '🔒 Finish the previous chapter first',
  noChaptersYet: 'New chapters coming soon',
  chapterCost: '−{cost} energy',

  giftShop: '🎁 Gifts',
  giftShopTitle: 'Gifts',
  giftShopHint: 'Pick who to gift and what — relationship grows instantly',
  giftGiven: 'Gift given!',
  giftAlreadyToday: 'Already gifted today',
  giftCoffee: 'Coffee to go',
  giftFlowers: 'Bouquet of flowers',
  giftPresent: 'Gift with a card',

  tierStranger: 'Stranger',
  tierAcquaintance: 'Acquaintance',
  tierSympathy: 'Sympathy',
  tierCrush: 'Crush',
  tierRomance: 'Romance',

  tapToContinue: 'Tap to continue',
  chapterEndTitle: 'Chapter complete',
  chapterEndHearts: '+{n} relationship',
  chapterEndCoins: '+{n} coins',
  backToHub: 'Back to club',

  menuSettings: '⚙️ Settings',
  settingsTitle: 'Settings',
  settingsSound: 'Sound',
  settingsSoundOn: 'On',
  settingsSoundOff: 'Off',

  achievements: '🏅 Achievements',
  achievementsTitle: 'Achievements',
  achievementUnlocked: 'Achievement unlocked',

  leaders: 'Leaderboard',
  boardEmpty: 'Nobody here yet. Be the first.',
  boardLogin: 'Sign in to join the board',
  boardPlayer: 'Player',

  help: 'Rules & help',
  helpTitle: 'How to play',
  helpRules1: 'Play through chapters — the lines you pick affect your relationship with each character.',
  helpRules2: 'Each chapter costs energy. It refills over time, or instantly with a rewarded ad.',
  helpRules3: 'Give gifts in the club to raise relationship without playing a chapter.',
  helpRules4: 'The higher the relationship, the warmer the reactions — and the closer the romance.',
  helpFeedback: '✉️ Message the developer',
  helpFeedbackSubject: 'Dating Club feedback',
  iapNoAds: '🚫 Remove ads',
  iapNoAdsOwned: '✓ Ads removed',

  close: 'Close',
  back: '← Back',
  sound: 'Sound',
  you: 'You',
  hubButton: 'Club',
};

export type Keys = typeof ru;

export const createI18n = (lang: string): I18n<Keys> => new I18n<Keys>({ ru, en: en as Keys }, 'ru', lang);
