/**
 * Сборка игры: логика + рендер + платформа.
 *
 * Здесь же живёт вся монетизация. Она собрана в одном файле сознательно —
 * это единственное место, где решается, когда игроку показывают рекламу, и
 * такие решения должны быть видны целиком, а не размазаны по коду.
 */

import {
  Achievements,
  Input,
  Loop,
  SUPPORT_EMAIL,
  Sfx,
  Stage,
  buildAchievementList,
  buildLeaderList,
  hideModal,
  isModalOpen,
  metrics,
  openMailFeedback,
  showAchievementToast,
  showModal,
  type ModalAction,
} from '@yg/engine';
import { yg } from '@yg/ysdk';
import { Game } from './game';
import { achievementsFor, createI18n, rulesFor } from './i18n';
import { Renderer } from './render';
import './style.css';

const LEADERBOARD = 'bestScore';

/** Бесплатных откатов на партию. Дальше — за просмотр рекламы. */
const FREE_UNDOS = 3;
/** Сколько раз за партию можно продолжить после проигрыша. */
const MAX_CONTINUES = 2;
/** Столько крупных фишек снимаем с поля при продолжении. */
const CONTINUE_CLEAR = 4;

// ── состояние сессии ───────────────────────────────────────────────────────

const game = new Game();
const sfx = new Sfx();

// Создаётся сразу по языку браузера, а после `yg.init()` уточняется языком
// платформы: до инициализации SDK интерфейс уже может понадобиться отрисовать.
const i18n = createI18n(navigator.language);
const t = i18n.t.bind(i18n);

let undosLeft = FREE_UNDOS;
let lastMoveAt = 0;
let gamesThisSession = 0;
let shortcutOffered = false;
let reviewOffered = false;
let pauseOpen = false;

// Достижения собираются после загрузки языка и сейва (см. boot()) — до этого
// момента ссылка ещё не назначена, но реальные вызовы check происходят только
// в ответ на действия игрока, которые возможны лишь после boot().
let achievements: Achievements;
let usedUndoThisRun = false;
let gamesPlayedTotal = 0;

const NO_ADS_PRODUCT = 'no_ads';
let noAdsPurchased = false;

// ── DOM ────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

const boardEl = $<HTMLDivElement>('board');
const scoreEl = $<HTMLElement>('score');
const bestEl = $<HTMLElement>('best');
const undoBtn = $<HTMLButtonElement>('undo');
const undoCountEl = $<HTMLElement>('undo-count');
const restartBtn = $<HTMLButtonElement>('restart');
const leadersBtn = $<HTMLButtonElement>('leaders');
const soundBtn = $<HTMLButtonElement>('sound');
const helpBtn = $<HTMLButtonElement>('help');
const loaderEl = $<HTMLDivElement>('loader');

// ── графика ────────────────────────────────────────────────────────────────

const stage = new Stage(boardEl, () => renderer.relayout());
const renderer = new Renderer(stage);

const loop = new Loop(
  () => {
    /* вся анимация выводится из времени последнего хода — состояние не тикает */
  },
  () => renderer.draw(game, performance.now() - lastMoveAt, lastMoveAt),
);

// ── интерфейс ──────────────────────────────────────────────────────────────

/** Проставляет надписи, которые в разметке лежат на языке по умолчанию. */
function applyStaticLabels(): void {
  document.documentElement.lang = i18n.current;
  $<HTMLElement>('label-score').textContent = t('score');
  $<HTMLElement>('label-best').textContent = t('best');
  undoBtn.querySelector('.label')!.textContent = t('undo');
  restartBtn.querySelector('.label')!.textContent = t('restart');
  leadersBtn.setAttribute('aria-label', t('leaders'));
  helpBtn.setAttribute('aria-label', t('help'));
  soundBtn.setAttribute('aria-label', t('sound'));
}

function syncHud(): void {
  scoreEl.textContent = i18n.num(game.score);
  bestEl.textContent = i18n.num(game.best);

  undoBtn.disabled = !game.canUndo;
  if (undosLeft > 0) {
    undoCountEl.textContent = String(undosLeft);
    undoCountEl.classList.remove('ad');
  } else {
    // Пустой текст + псевдоэлемент «▶» — откат теперь стоит просмотра рекламы.
    undoCountEl.textContent = '';
    undoCountEl.classList.add('ad');
  }

  soundBtn.querySelector('.glyph')!.textContent = sfx.isMuted ? '🔇' : '🔊';
}

function persist(): void {
  yg.save({ ...game.serialize(), achievements: achievements.unlockedIds, gamesPlayedTotal });
}

/** Проверяет условия достижений и показывает тост на каждое новое. */
function checkAchievements(): void {
  const candidates: Array<[string, boolean]> = [
    ['first_2048', game.goalReached],
    ['score_5000', game.score >= 5000],
    ['score_20000', game.score >= 20000],
    ['tile_4096', game.maxValue >= 4096],
    ['no_undo_win', game.goalReached && !usedUndoThisRun],
    ['veteran', gamesPlayedTotal >= 10],
  ];

  for (const [id, met] of candidates) {
    if (!met) continue;
    if (!achievements.unlock(id)) continue;
    const def = achievements.all.find((d) => d.id === id);
    if (def) showAchievementToast(def, t('achievementUnlocked'));
    metrics.send('achievement_unlocked', { id });
    persist();
  }
}

// ── игровой цикл ───────────────────────────────────────────────────────────

function commitMove(dir: Parameters<Game['move']>[0]): void {
  if (isModalOpen()) return;

  const result = game.move(dir);
  if (!result.moved) {
    sfx.play('error');
    return;
  }

  lastMoveAt = performance.now();
  sfx.play(result.merges > 0 ? 'merge' : 'move');
  syncHud();
  persist();
  checkAchievements();

  if (result.reachedGoal) {
    metrics.send('level_up', { value: 2048 });
    void onGoalReached();
    return;
  }

  if (!game.canMove()) void onGameOver();
}

async function onGoalReached(): Promise<void> {
  sfx.play('win');
  renderer.celebrate();
  showModal({
    title: t('goalTitle'),
    result: i18n.num(game.score),
    text: t('goalText'),
    actions: [
      { label: t('goalContinue'), onClick: hideModal },
      {
        label: t('goalRestart'),
        kind: 'ghost',
        onClick: () => void restart(),
      },
    ],
  });
  await submitScore();
}

async function onGameOver(): Promise<void> {
  sfx.play('lose');
  gamesThisSession += 1;
  metrics.send('game_over', { score: game.score, max: game.maxValue });

  await submitScore();

  const canContinue = game.continues < MAX_CONTINUES;
  const actions: ModalAction[] = [];

  if (canContinue) {
    // Продолжение за рекламу — самая ценная точка показа: игрок мотивирован
    // сильнее всего именно в момент проигрыша с хорошим счётом.
    actions.push({
      label: t('overContinue', { count: CONTINUE_CLEAR }),
      kind: 'reward' as const,
      onClick: async () => {
        metrics.send('ad_rewarded_offer', { placement: 'continue' });
        const res = await yg.rewarded();
        if (!res.rewarded) {
          metrics.send('ad_rewarded_declined', { placement: 'continue' });
          return;
        }
        metrics.send('ad_rewarded_shown', { placement: 'continue' });
        game.clearLargest(CONTINUE_CLEAR);
        lastMoveAt = performance.now();
        sfx.play('reward');
        hideModal();
        syncHud();
        persist();
      },
    });
  }

  actions.push({
    label: t('overRestart'),
    kind: canContinue ? ('ghost' as const) : ('primary' as const),
    onClick: () => void restart(),
  });

  showModal({
    title: t('overTitle'),
    result: i18n.num(game.score),
    text:
      game.score >= game.best && game.score > 0
        ? t('overRecord')
        : t('overBest', { best: i18n.num(game.best) }),
    actions,
  });

  await offerRetentionPrompts();
}

async function restart(): Promise<void> {
  hideModal();
  // Полноэкранную рекламу показываем на перезапуске: игрок уже вышел из
  // потока, прерывания здесь не ощущается. Кулдаун обёртка держит сама.
  // Игрок, купивший «без рекламы», интерстишлов вообще не должен видеть.
  if (!noAdsPurchased) {
    const res = await yg.interstitial();
    if (res.shown) metrics.send('ad_interstitial_shown', { placement: 'restart' });
  }

  game.newGame();
  undosLeft = FREE_UNDOS;
  usedUndoThisRun = false;
  gamesPlayedTotal += 1;
  lastMoveAt = performance.now();
  metrics.send('game_start');
  syncHud();
  persist();
  checkAchievements();
}

let undoBusy = false;

async function doUndo(): Promise<void> {
  // Кнопка и клавиша Z ведут сюда независимо — без флага двойной клик/тап
  // во время ожидания рекламы запускал бы второй показ и откатывал два хода
  // вместо одного.
  if (!game.canUndo || undoBusy) return;

  if (undosLeft <= 0) {
    undoBusy = true;
    metrics.send('ad_rewarded_offer', { placement: 'undo' });
    const res = await yg.rewarded().finally(() => {
      undoBusy = false;
    });
    if (!res.rewarded) {
      metrics.send('ad_rewarded_declined', { placement: 'undo' });
      return;
    }
    metrics.send('ad_rewarded_shown', { placement: 'undo' });
  } else {
    undosLeft -= 1;
  }

  game.undo();
  usedUndoThisRun = true;
  lastMoveAt = performance.now();
  sfx.play('click');
  syncHud();
  persist();
}

async function submitScore(): Promise<void> {
  if (game.score <= 0) return;
  await yg.submitScore(LEADERBOARD, game.best);
}

function showPause(): void {
  pauseOpen = true;
  sfx.play('click');
  showModal({
    title: t('pauseTitle'),
    text: t('overBest', { best: i18n.num(game.best) }),
    dismissible: true,
    onDismiss: closePause,
    actions: [
      { label: t('pauseResume'), onClick: closePause },
      { label: t('menuSettings'), kind: 'ghost', onClick: () => showSettings(showPause) },
    ],
  });
}

function closePause(): void {
  pauseOpen = false;
  hideModal();
  sfx.play('click');
}

function showSettings(back: () => void): void {
  sfx.play('click');

  const body = document.createElement('div');
  body.className = 'shop-list';

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'shop-row';
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = sfx.isMuted ? '🔇' : '🔊';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = t('settingsSound');
  const state = document.createElement('span');
  state.className = 'cost';
  state.textContent = sfx.isMuted ? t('settingsSoundOff') : t('settingsSoundOn');
  row.append(icon, name, state);
  row.onclick = () => {
    sfx.setMuted(!sfx.isMuted);
    sfx.play('click');
    syncHud();
    yg.save({ muted: sfx.isMuted });
    showSettings(back); // перерисовать строку с новым состоянием
  };
  body.appendChild(row);

  showModal({
    title: t('settingsTitle'),
    body,
    dismissible: true,
    onDismiss: back,
    actions: [{ label: t('back'), kind: 'ghost', onClick: back }],
  });
}

/** Правила игры и письмо разработчику — один модуль на все игры студии. */
function showHelp(): void {
  sfx.play('click');

  const body = document.createElement('div');
  const list = document.createElement('ul');
  list.className = 'rules-list';
  for (const rule of rulesFor(i18n.current)) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }
  body.appendChild(list);

  showModal({
    title: t('helpTitle'),
    body,
    dismissible: true,
    actions: [
      { label: t('achievements'), kind: 'ghost', onClick: showAchievements },
      {
        label: noAdsPurchased ? t('iapNoAdsOwned') : t('iapNoAds'),
        kind: 'ghost',
        onClick: noAdsPurchased ? hideModal : () => void buyNoAds(),
      },
      {
        label: t('helpFeedback'),
        kind: 'ghost',
        onClick: () => {
          const mailBody = `2048 — ${t('best')}: ${i18n.num(game.best)}\n\n`;
          openMailFeedback(SUPPORT_EMAIL, t('helpFeedbackSubject'), mailBody);
        },
      },
      { label: t('close'), onClick: hideModal },
    ],
  });
}

/** Покупка «без рекламы» — платит саму себя тем, что убирает интерстишлы. */
async function buyNoAds(): Promise<void> {
  if (noAdsPurchased) return;
  metrics.send('iap_offer', { id: NO_ADS_PRODUCT });
  const ok = await yg.purchase(NO_ADS_PRODUCT);
  if (!ok) return;
  noAdsPurchased = true;
  metrics.send('iap_purchased', { id: NO_ADS_PRODUCT });
  showHelp(); // перерисовываем модалку — кнопка должна показать «уже куплено»
}

function showAchievements(): void {
  const { done, total } = achievements.progress;
  showModal({
    title: `${t('achievementsTitle')} (${done}/${total})`,
    body: buildAchievementList(achievements.all, achievements.unlockedIds),
    dismissible: true,
    actions: [{ label: t('close'), kind: 'ghost', onClick: hideModal }],
  });
}

async function showLeaders(): Promise<void> {
  sfx.play('click');
  showModal({
    title: t('leaders'),
    text: t('boardLoading'),
    actions: [{ label: t('close'), kind: 'ghost', onClick: hideModal }],
    dismissible: true,
  });

  const data = await yg.topScores(LEADERBOARD, 10);
  const entries =
    data?.entries.map((e) => ({
      rank: e.rank,
      score: e.score,
      name: e.player.publicName,
      isMe: e.rank === data.userRank && data.userRank > 0,
    })) ?? [];

  const actions: ModalAction[] = [{ label: t('close'), kind: 'ghost', onClick: hideModal }];

  // Анонимному игроку результат в общую таблицу не попадёт — предлагаем вход.
  if (!yg.isAuthorized) {
    actions.unshift({
      label: t('boardLogin'),
      kind: 'primary',
      onClick: async () => {
        await yg.requestLogin();
        await submitScore();
        await showLeaders();
      },
    });
  }

  showModal({
    title: t('leaders'),
    body: buildLeaderList(entries, {
      emptyText: t('boardEmpty'),
      fallbackName: t('boardPlayer'),
      formatScore: (n) => i18n.num(n),
    }),
    actions,
    dismissible: true,
  });
}

/**
 * Ярлык и отзыв — два бесплатных рычага возвратов. Предлагаем их редко и
 * только в момент, когда игрок доволен, иначе это раздражает и снижает оценку.
 */
async function offerRetentionPrompts(): Promise<void> {
  if (!shortcutOffered && gamesThisSession >= 2) {
    shortcutOffered = true;
    metrics.send('shortcut_offer');
    if (await yg.promptShortcut()) metrics.send('shortcut_accepted');
    return;
  }

  if (!reviewOffered && game.score >= 5000 && game.score >= game.best) {
    reviewOffered = true;
    metrics.send('review_offer');
    await yg.requestReview();
  }
}

// ── ввод ───────────────────────────────────────────────────────────────────

new Input(boardEl, {
  onSwipe: (dir) => commitMove(dir),
  onKey: (code) => {
    if (code === 'KeyZ') void doUndo();
    if (code === 'KeyR') void restart();
    if (code === 'Escape') {
      if (pauseOpen) closePause();
      else if (!isModalOpen()) showPause();
    }
  },
});

undoBtn.onclick = () => void doUndo();
restartBtn.onclick = () => {
  sfx.play('click');
  void restart();
};
leadersBtn.onclick = () => void showLeaders();
helpBtn.onclick = () => showHelp();
soundBtn.onclick = () => {
  sfx.setMuted(!sfx.isMuted);
  sfx.play('click');
  syncHud();
  yg.save({ muted: sfx.isMuted });
};

// Реклама обязана глушить игру: иначе поверх ролика играет наша музыка,
// а свайпы проходят «сквозь» рекламный блок.
yg.events.on('pause', () => {
  loop.pause();
  sfx.suspend();
});
yg.events.on('resume', () => {
  loop.resume();
  sfx.resume();
  lastMoveAt = performance.now();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    persist();
    void yg.flushSave();
  }
});

// ── старт ──────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  metrics.send('load_start');

  if (import.meta.env.DEV) Object.assign(window, { __debug: { game, renderer } });

  await yg.init({ gameplayApi: true });

  // Язык платформы точнее языка браузера: игрок мог открыть каталог на другом
  // домене, чем настроен его браузер.
  i18n.setLang(yg.lang);
  applyStaticLabels();

  const saved = await yg.load<Record<string, unknown>>({});
  if (saved.muted === true) sfx.setMuted(true);

  const savedAchievements = Array.isArray(saved.achievements)
    ? saved.achievements.filter((x): x is string => typeof x === 'string')
    : [];
  achievements = new Achievements(achievementsFor(i18n.current), savedAchievements);
  gamesPlayedTotal = typeof saved.gamesPlayedTotal === 'number' ? saved.gamesPlayedTotal : 0;
  noAdsPurchased = await yg.hasPurchase(NO_ADS_PRODUCT);

  const restored = game.deserialize(saved);
  if (!restored || !game.canMove()) {
    game.newGame();
    gamesPlayedTotal += 1;
  }

  lastMoveAt = performance.now();
  syncHud();
  checkAchievements();
  loop.start();

  // Прелоадер снимаем после первого кадра, иначе мелькает пустое поле. Но
  // ждать кадр бесконечно нельзя: в скрытом айфрейме rAF не вызывается вообще,
  // и игрок остался бы наедине с полосой загрузки — поэтому есть страховка.
  let revealed = false;
  const reveal = (): void => {
    if (revealed) return;
    revealed = true;
    loaderEl.classList.add('hidden');
    setTimeout(() => loaderEl.remove(), 350);
    yg.ready();
    metrics.send('load_done');
    metrics.send('game_start', { restored });
  };

  requestAnimationFrame(reveal);
  setTimeout(reveal, 1000);
}

void boot();
