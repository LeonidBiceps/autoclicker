/**
 * Самоцветы — сборка match-3: логика, рендер и платформа.
 *
 * Режим бесконечный, без «поражения»: тупиковое поле — не ошибка игрока и
 * чинится автоматической бесплатной пересборкой, а не рекламой. Реклама здесь
 * платит за то, что игрок выбирает сам: удвоение очков и ручное перемешивание
 * «мне не нравится это поле». Тот же принцип, что в остальных играх студии —
 * реклама вознаграждает, а не продавливает через фрустрацию.
 */

import {
  Achievements,
  Loop,
  SUPPORT_EMAIL,
  Sfx,
  Stage,
  buildAchievementList,
  buildLeaderList,
  formatShort,
  hideModal,
  isModalOpen,
  metrics,
  openMailFeedback,
  showAchievementToast,
  showModal,
  type ModalAction,
} from '@yg/engine';
import { yg } from '@yg/ysdk';
import { createBackdrop } from './backdrop';
import { GemBoard, SIZE, isAdjacent, type Pos } from './board';
import { achievementsFor, createI18n, rulesFor } from './i18n';
import { Renderer } from './render';
import './style.css';

const LEADERBOARD = 'bestScore';

const BOOST_MULTIPLIER = 2;
const BOOST_SECONDS = 90;
/** Через сколько секунд бездействия подсвечивать возможный ход. */
const HINT_IDLE_MS = 7000;
/** Порог для «отличной партии» — раньше него итоговая модалка не льстит игроку зря. */
const GOOD_RUN_SCORE = 800;

// ── состояние ──────────────────────────────────────────────────────────────

const board = new GemBoard();
const sfx = new Sfx();
const i18n = createI18n(navigator.language);
const t = i18n.t.bind(i18n);

let muted = false;
let pauseOpen = false;
let selected: Pos | null = null;
let hint: Pos | null = null;
let idleAt = performance.now();
let boostUntil = 0;
let runsThisSession = 0;
let shortcutOffered = false;
let reviewOffered = false;
let achievements: Achievements;
/** Партий за всё время — переживает перезагрузку, для достижений. */
let totalRuns = 0;
let shuffleSurvived = false;
let specialGemMade = false;
let comboMastered = false;

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
const boostEl = $<HTMLElement>('boost');
const boostBtn = $<HTMLButtonElement>('boost-btn');
const shuffleBtn = $<HTMLButtonElement>('shuffle-btn');
const restartBtn = $<HTMLButtonElement>('restart');
const leadersBtn = $<HTMLButtonElement>('leaders');
const soundBtn = $<HTMLButtonElement>('sound');
const helpBtn = $<HTMLButtonElement>('help');
const loaderEl = $<HTMLDivElement>('loader');
const bgEl = $<HTMLDivElement>('bg');

const backdrop = createBackdrop(bgEl);
const stage = new Stage(boardEl, () => renderer.relayout());
const renderer = new Renderer(stage);

// ── всплывающие подписи ──────────────────────────────────────────────────

function spawnLabel(text: string, x: number, y: number, color = '#f6b93b'): void {
  const el = document.createElement('span');
  el.className = 'floater';
  el.style.color = color;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

const BOARD_CENTER = Math.floor(SIZE / 2);

renderer.onCombo = (comboIndex, tilesCleared) => {
  if (comboIndex < 1) return; // первая тройка хода — не комбо, а обычный ход
  const rect = stage.canvas.getBoundingClientRect();
  const { x, y } = renderer.cellCenter(BOARD_CENTER, BOARD_CENTER);
  spawnLabel(t('comboText', { combo: comboIndex + 1 }), rect.left + x, rect.top + y - comboIndex * 22, '#ff6b9a');
  metrics.send('combo', { round: comboIndex + 1, tiles: tilesCleared });
  if (comboIndex + 1 >= 4) {
    comboMastered = true;
    checkAchievements();
  }
};

// ── ввод ───────────────────────────────────────────────────────────────────

let dragStart: Pos | null = null;
let dragTriggered = false;

function pointToCell(clientX: number, clientY: number): Pos | null {
  const rect = stage.canvas.getBoundingClientRect();
  return renderer.cellAt(clientX - rect.left, clientY - rect.top);
}

function markActivity(): void {
  idleAt = performance.now();
  if (hint) hint = null;
}

function trySwapCells(a: Pos, b: Pos): void {
  markActivity();
  if (renderer.isAnimating) return;

  const tileA = board.at(a.row, a.col);
  const tileB = board.at(b.row, b.col);
  if (!tileA || !tileB) return;

  const result = board.trySwap(a, b);
  if (!result.ok) {
    sfx.play('error');
    renderer.playRejectedSwap(tileA, tileB);
    return;
  }

  sfx.play('merge');
  const boosted = Date.now() < boostUntil;
  const gained = boosted ? result.scoreGained * BOOST_MULTIPLIER : result.scoreGained;
  if (boosted && result.scoreGained > 0) {
    // `trySwap` уже начислил базовые очки — доплачиваем разницу до полного
    // буста и синхронно поднимаем рекорд, иначе он отстанет от реального счёта.
    board.score += result.scoreGained * (BOOST_MULTIPLIER - 1);
    board.best = Math.max(board.best, board.score);
  }

  renderer.playCascade(tileA, tileB, result.rounds);
  if (result.rounds.some((r) => r.upgraded.length > 0)) specialGemMade = true;
  syncHud();
  persist();
  checkAchievements();
  metrics.send('swap', { rounds: result.rounds.length, gained });

  // Своим ходом игрок мог случайно загнать поле в тупик — чиним бесплатно
  // и сразу, чтобы это не выглядело наказанием.
  if (!board.hasValidMove()) {
    setTimeout(() => {
      board.shuffle();
      renderer.playShuffleFlash();
      sfx.play('click');
      shuffleSurvived = true;
      checkAchievements();
    }, 500);
  }
}

boardEl.addEventListener('pointerdown', (e) => {
  markActivity();
  selected = null;
  dragStart = pointToCell(e.clientX, e.clientY);
  dragTriggered = false;
  boardEl.setPointerCapture?.(e.pointerId);
});

boardEl.addEventListener('pointermove', (e) => {
  if (!dragStart || dragTriggered) return;
  const cell = pointToCell(e.clientX, e.clientY);
  if (!cell || (cell.row === dragStart.row && cell.col === dragStart.col)) return;
  if (!isAdjacent(cell, dragStart)) return;

  dragTriggered = true;
  trySwapCells(dragStart, cell);
});

boardEl.addEventListener('pointerup', (e) => {
  if (dragTriggered) {
    dragStart = null;
    return;
  }
  const cell = pointToCell(e.clientX, e.clientY);
  dragStart = null;
  if (!cell) return;

  markActivity();

  if (!selected) {
    selected = cell;
    sfx.play('click');
    return;
  }
  if (selected.row === cell.row && selected.col === cell.col) {
    selected = null;
    return;
  }
  if (isAdjacent(selected, cell)) {
    const a = selected;
    selected = null;
    trySwapCells(a, cell);
    return;
  }
  // Тап по несоседней клетке — просто переносим выделение на неё.
  selected = cell;
  sfx.play('click');
});

// ── действия ───────────────────────────────────────────────────────────────

// Кнопки boost/shuffle вызывают эти функции напрямую, без авто-блокировки,
// которую даёт showModal своим кнопкам — без флага быстрый двойной тап во
// время ожидания рекламы запускал бы второй показ подряд.
let boostBusy = false;
let shuffleBusy = false;

async function requestBoost(): Promise<void> {
  if (boostBusy) return;
  boostBusy = true;
  metrics.send('ad_rewarded_offer', { placement: 'boost' });
  const res = await yg.rewarded().finally(() => {
    boostBusy = false;
  });
  if (!res.rewarded) {
    metrics.send('ad_rewarded_declined', { placement: 'boost' });
    return;
  }
  metrics.send('ad_rewarded_shown', { placement: 'boost' });
  boostUntil = Date.now() + BOOST_SECONDS * 1000;
  sfx.play('reward');
  syncHud();
  persist();
}

async function requestShuffle(): Promise<void> {
  if (shuffleBusy) return;
  shuffleBusy = true;
  metrics.send('ad_rewarded_offer', { placement: 'shuffle' });
  const res = await yg.rewarded().finally(() => {
    shuffleBusy = false;
  });
  if (!res.rewarded) {
    metrics.send('ad_rewarded_declined', { placement: 'shuffle' });
    return;
  }
  metrics.send('ad_rewarded_shown', { placement: 'shuffle' });
  board.shuffle();
  renderer.playShuffleFlash();
  sfx.play('reward');
  persist();
}

function askRestart(): void {
  sfx.play('click');
  const isBest = board.score > 0 && board.score >= board.best;
  showModal({
    title: t('overTitle'),
    result: formatShort(board.score),
    text: isBest ? t('overNewBest') : t('overBest', { best: formatShort(board.best) }),
    dismissible: true,
    actions: [
      { label: t('overRestart'), onClick: () => void doRestart() },
      { label: t('overKeep'), kind: 'ghost', onClick: hideModal },
    ],
  });
}

async function doRestart(): Promise<void> {
  hideModal();
  runsThisSession += 1;
  totalRuns += 1;
  metrics.send('restart', { score: board.score, best: board.best, run: runsThisSession });

  if (!noAdsPurchased) {
    const res = await yg.interstitial();
    if (res.shown) metrics.send('ad_interstitial_shown', { placement: 'restart' });
  }

  board.score = 0;
  board.shuffle();
  selected = null;
  syncHud();
  persist();
  checkAchievements();

  await offerRetentionPrompts();
}

async function offerRetentionPrompts(): Promise<void> {
  if (!shortcutOffered && runsThisSession >= 2) {
    shortcutOffered = true;
    metrics.send('shortcut_offer');
    if (await yg.promptShortcut()) metrics.send('shortcut_accepted');
    return;
  }
  if (!reviewOffered && board.best >= GOOD_RUN_SCORE) {
    reviewOffered = true;
    metrics.send('review_offer');
    await yg.requestReview();
  }
}

function showPause(): void {
  pauseOpen = true;
  sfx.play('click');
  showModal({
    title: t('pauseTitle'),
    text: t('overBest', { best: formatShort(board.best) }),
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
  icon.textContent = muted ? '🔇' : '🔊';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = t('settingsSound');
  const state = document.createElement('span');
  state.className = 'cost';
  state.textContent = muted ? t('settingsSoundOff') : t('settingsSoundOn');
  row.append(icon, name, state);
  row.onclick = () => {
    muted = !muted;
    sfx.setMuted(muted);
    sfx.play('click');
    syncHud();
    persist();
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
          const mailBody = `${t('title')} — ${t('best')}: ${formatShort(board.best)}\n\n`;
          openMailFeedback(SUPPORT_EMAIL, t('helpFeedbackSubject'), mailBody);
        },
      },
      { label: t('close'), onClick: hideModal },
    ],
  });
}

async function buyNoAds(): Promise<void> {
  if (noAdsPurchased) return;
  metrics.send('iap_offer', { id: NO_ADS_PRODUCT });
  const ok = await yg.purchase(NO_ADS_PRODUCT);
  if (!ok) return;
  noAdsPurchased = true;
  metrics.send('iap_purchased', { id: NO_ADS_PRODUCT });
  showHelp();
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
      formatScore: (n) => formatShort(n),
    }),
    actions,
    dismissible: true,
  });
}

async function submitScore(): Promise<void> {
  if (board.best <= 0) return;
  await yg.submitScore(LEADERBOARD, Math.floor(board.best));
}

// ── интерфейс ──────────────────────────────────────────────────────────────

function applyStaticLabels(): void {
  document.documentElement.lang = i18n.current;
  document.title = t('title');
  $<HTMLElement>('label-score').textContent = t('score');
  $<HTMLElement>('label-best').textContent = t('best');
  restartBtn.textContent = t('restart');
  leadersBtn.setAttribute('aria-label', t('leaders'));
  soundBtn.setAttribute('aria-label', t('sound'));
  helpBtn.setAttribute('aria-label', t('help'));
  const loaderTitle = loaderEl.querySelector('.loader-title');
  if (loaderTitle) loaderTitle.textContent = t('title');
}

function syncHud(): void {
  scoreEl.textContent = formatShort(board.score);
  bestEl.textContent = formatShort(board.best);

  const boostLeft = Math.max(0, Math.ceil((boostUntil - Date.now()) / 1000));
  boostEl.hidden = boostLeft <= 0;
  if (boostLeft > 0) boostEl.textContent = t('boostActive', { seconds: boostLeft });

  boostBtn.textContent = boostLeft > 0 ? t('boostActive', { seconds: boostLeft }) : t('boostOffer', { seconds: BOOST_SECONDS });
  boostBtn.disabled = boostLeft > 0;

  shuffleBtn.textContent = t('shuffle');

  soundBtn.textContent = muted ? '🔇' : '🔊';
}

function persist(): void {
  yg.save({
    ...board.serialize(),
    muted,
    achievements: achievements.unlockedIds,
    totalRuns,
    shuffleSurvived,
  });
}

/** Проверяет условия достижений и показывает тост на каждое новое. */
function checkAchievements(): void {
  const candidates: Array<[string, boolean]> = [
    ['combo_master', comboMastered],
    ['score_5000', board.score >= 5000],
    ['score_20000', board.best >= 20000],
    ['shuffle_survivor', shuffleSurvived],
    ['special_gem', specialGemMade],
    ['ten_runs', totalRuns >= 10],
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

// ── цикл ───────────────────────────────────────────────────────────────────

let sinceHud = 0;

const loop = new Loop(
  (dt) => {
    backdrop.update(dt);
    renderer.update(dt);

    sinceHud += dt;
    if (sinceHud >= 0.25) {
      sinceHud = 0;
      syncHud();
    }

    if (!hint && !renderer.isAnimating && performance.now() - idleAt > HINT_IDLE_MS) {
      const move = board.findAnyValidMove();
      hint = move?.a ?? null;
    }
  },
  () => renderer.draw(board, selected, hint),
);

restartBtn.onclick = () => askRestart();
leadersBtn.onclick = () => void showLeaders();
helpBtn.onclick = () => showHelp();
boostBtn.onclick = () => void requestBoost();
shuffleBtn.onclick = () => void requestShuffle();

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (pauseOpen) closePause();
  else if (!isModalOpen()) showPause();
});
soundBtn.onclick = () => {
  muted = !muted;
  sfx.setMuted(muted);
  sfx.play('click');
  syncHud();
  persist();
};

yg.events.on('pause', () => {
  loop.pause();
  sfx.suspend();
});
yg.events.on('resume', () => {
  loop.resume();
  sfx.resume();
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

  await yg.init({ gameplayApi: true });
  i18n.setLang(yg.lang);
  applyStaticLabels();

  const saved = await yg.load<Record<string, unknown>>({});
  muted = saved.muted === true;
  sfx.setMuted(muted);

  const savedAchievements = Array.isArray(saved.achievements)
    ? saved.achievements.filter((x): x is string => typeof x === 'string')
    : [];
  achievements = new Achievements(achievementsFor(i18n.current), savedAchievements);
  totalRuns = typeof saved.totalRuns === 'number' ? saved.totalRuns : 0;
  shuffleSurvived = saved.shuffleSurvived === true;
  noAdsPurchased = await yg.hasPurchase(NO_ADS_PRODUCT);

  if (import.meta.env.DEV) Object.assign(window, { __debug: { board, renderer, loop, syncHud, achievements } });

  const restored = board.deserialize(saved);
  if (!restored && !board.hasValidMove()) board.shuffle();

  syncHud();
  checkAchievements();
  loop.start();

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
