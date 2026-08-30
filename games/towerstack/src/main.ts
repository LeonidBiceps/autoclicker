/**
 * Башня: сборка игры, интерфейса и платформы.
 *
 * Монетизация: одно рекламное продолжение за промах (как «Возродиться» в
 * Астроштурме), интерстишл на явном рестарте, отключение рекламы за IAP.
 * Ход сам по себе бесплатный — тут нечего продавать чаще, чем раз в забег.
 */

import {
  Achievements,
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
import { achievementsFor, createI18n, rulesFor } from './i18n';
import { Renderer } from './render';
import { Tower } from './sim';
import './style.css';

const LEADERBOARD = 'bestHeight';
const NO_ADS_PRODUCT = 'no_ads';
/** Одно продолжение за рекламу на забег — как «Возродиться» в других играх студии. */
const MAX_REVIVES = 1;

// ── состояние ──────────────────────────────────────────────────────────────

const tower = new Tower();
const sfx = new Sfx();
const i18n = createI18n(navigator.language);
const t = i18n.t.bind(i18n);

let muted = false;
let pauseOpen = false;
let revivesUsed = 0;
let totalRuns = 0;
let runsThisSession = 0;
let perfectHappenedThisRun = false;
let noAdsPurchased = false;
let shortcutOffered = false;
let reviewOffered = false;
let reviveBusy = false;
let achievements: Achievements;

// ── DOM ────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

const boardEl = $<HTMLDivElement>('board');
const scoreEl = $<HTMLElement>('score');
const bestEl = $<HTMLElement>('best');
const tapHintEl = $<HTMLDivElement>('tap-hint');
const restartBtn = $<HTMLButtonElement>('restart');
const leadersBtn = $<HTMLButtonElement>('leaders');
const soundBtn = $<HTMLButtonElement>('sound');
const helpBtn = $<HTMLButtonElement>('help');
const loaderEl = $<HTMLDivElement>('loader');

const stage = new Stage(boardEl, () => renderer.draw(tower));
const renderer = new Renderer(stage);

function applyStaticLabels(): void {
  $('label-score').textContent = t('score');
  $('label-best').textContent = t('best');
  restartBtn.textContent = t('restart');
  leadersBtn.setAttribute('aria-label', t('leaders'));
  soundBtn.setAttribute('aria-label', t('sound'));
  helpBtn.setAttribute('aria-label', t('help'));
  tapHintEl.textContent = t('tapHint');
}

function syncHud(): void {
  scoreEl.textContent = i18n.num(tower.score);
  bestEl.textContent = i18n.num(tower.best);
  soundBtn.querySelector('.glyph')?.remove();
  soundBtn.textContent = sfx.isMuted ? '🔇' : '🔊';
  tapHintEl.hidden = tower.height > 0;
}

/** Всплывающая подпись в точке касания — тот же приём, что и в других играх студии. */
function spawnFloater(text: string, x: number, y: number): void {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  boardEl.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// ── ход ────────────────────────────────────────────────────────────────────

let tapLocked = false;
/** Гасит дублирующийся pointerdown на один физический тап (стилус+тач, дребезг
 * на некоторых Android WebView) — таймер, а не requestAnimationFrame, чтобы не
 * зависеть от того, рисуется ли следующий кадр. */
const TAP_LOCK_MS = 120;

function handleTap(clientX: number, clientY: number): void {
  if (isModalOpen() || !tower.alive || tapLocked) return;
  tapLocked = true;
  setTimeout(() => {
    tapLocked = false;
  }, TAP_LOCK_MS);

  const cur = tower.current;
  const result = tower.place();
  sfx.play(result.perfect ? 'reward' : result.ok ? 'click' : 'error');
  renderer.addFallingPieces(result.pieces);

  if (cur) {
    const rect = boardEl.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    if (result.perfect) {
      renderer.spawnPerfectFx(cur.x, tower.blocks.length * 34, `hsl(${cur.hue},70%,64%)`);
      spawnFloater(t('combo', { n: tower.comboStreak }), localX, localY - 20);
      perfectHappenedThisRun = true;
    } else if (!result.ok) {
      renderer.spawnMissFx(cur.x, tower.blocks.length * 34);
    }
  }

  if (tower.height > 0 && tower.height % 10 === 0 && result.ok) {
    renderer.celebrateHeightMilestone(tower.blocks[tower.blocks.length - 1]?.x ?? 150, tower.height * 34);
  }

  syncHud();
  persist();
  checkAchievements();

  if (result.gameOver) void onGameOver();
}

boardEl.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('.btn, .modal')) return;
  handleTap(e.clientX, e.clientY);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!isModalOpen() && tower.alive) {
      const rect = boardEl.getBoundingClientRect();
      handleTap(rect.left + rect.width / 2, rect.top + rect.height * 0.6);
    }
  }
  if (e.code === 'Escape') {
    if (pauseOpen) closePause();
    else if (!isModalOpen()) showPause();
  }
});

// ── конец забега ───────────────────────────────────────────────────────────

async function onGameOver(): Promise<void> {
  await submitScore();

  const isBest = tower.score > 0 && tower.score >= tower.best;
  const actions: ModalAction[] = [];

  if (revivesUsed < MAX_REVIVES) {
    actions.push({
      label: t('overContinue'),
      kind: 'reward',
      onClick: async () => {
        if (reviveBusy) return;
        reviveBusy = true;
        metrics.send('ad_rewarded_offer', { placement: 'continue' });
        const res = await yg.rewarded().finally(() => {
          reviveBusy = false;
        });
        if (!res.rewarded) {
          metrics.send('ad_rewarded_declined', { placement: 'continue' });
          return;
        }
        metrics.send('ad_rewarded_shown', { placement: 'continue' });
        revivesUsed += 1;
        tower.revive();
        hideModal();
        syncHud();
      },
    });
  }
  actions.push({ label: t('overRestart'), kind: actions.length ? 'ghost' : 'primary', onClick: () => void restart() });

  showModal({
    title: t('overTitle'),
    result: i18n.num(tower.height),
    text: `${t('overHeight', { height: tower.height })} · ${isBest ? t('overNewBest') : t('overBest', { best: i18n.num(tower.best) })}`,
    actions,
  });

  void offerRetentionPrompts();
}

async function restart(): Promise<void> {
  hideModal();
  if (!noAdsPurchased) {
    const res = await yg.interstitial();
    if (res.shown) metrics.send('ad_interstitial_shown', { placement: 'restart' });
  }
  tower.newRun();
  revivesUsed = 0;
  perfectHappenedThisRun = false;
  totalRuns += 1;
  runsThisSession += 1;
  syncHud();
  persist();
  metrics.send('game_start');
  checkAchievements();
}

async function submitScore(): Promise<void> {
  if (tower.height <= 0) return;
  await yg.submitScore(LEADERBOARD, tower.height);
}

async function offerRetentionPrompts(): Promise<void> {
  if (!shortcutOffered && runsThisSession >= 2) {
    shortcutOffered = true;
    metrics.send('shortcut_offer');
    if (await yg.promptShortcut()) metrics.send('shortcut_accepted');
    return;
  }
  if (!reviewOffered && tower.height >= 15 && tower.height >= tower.best) {
    reviewOffered = true;
    metrics.send('review_offer');
    await yg.requestReview();
  }
}

// ── достижения ─────────────────────────────────────────────────────────────

function checkAchievements(): void {
  const candidates: Array<[string, boolean]> = [
    ['first_perfect', perfectHappenedThisRun],
    ['height_20', tower.height >= 20],
    ['height_50', tower.height >= 50],
    ['streak_5', tower.bestPerfectStreak >= 5],
    ['veteran', totalRuns >= 10],
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

function showAchievements(): void {
  showModal({
    title: t('achievementsTitle'),
    body: buildAchievementList(achievements.all, achievements.unlockedIds),
    dismissible: true,
    actions: [{ label: t('close'), onClick: hideModal }],
  });
}

// ── лидеры ─────────────────────────────────────────────────────────────────

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
      formatScore: (n) => i18n.num(n),
    }),
    actions,
    dismissible: true,
  });
}

// ── пауза ──────────────────────────────────────────────────────────────────

function showPause(): void {
  pauseOpen = true;
  sfx.play('click');
  showModal({
    title: t('pauseTitle'),
    text: t('overHeight', { height: tower.height }),
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
    persist();
    showSettings(back);
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

// ── справка / покупки ──────────────────────────────────────────────────────

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
          const mailBody = `${t('title')} — ${t('best')}: ${i18n.num(tower.best)}\n\n`;
          openMailFeedback(SUPPORT_EMAIL, t('helpFeedbackSubject'), mailBody);
        },
      },
      { label: t('close'), onClick: hideModal },
    ],
  });
}

async function buyNoAds(): Promise<void> {
  if (noAdsPurchased) return;
  const ok = await yg.purchase(NO_ADS_PRODUCT);
  if (!ok) return;
  noAdsPurchased = true;
  metrics.send('iap_purchased', { id: NO_ADS_PRODUCT });
  showHelp();
}

// ── сохранение ─────────────────────────────────────────────────────────────

function persist(): void {
  yg.save({
    ...tower.serialize(),
    muted,
    totalRuns,
    achievements: achievements.unlockedIds,
  });
}

// ── ввод кнопок ────────────────────────────────────────────────────────────

restartBtn.onclick = () => void restart();
leadersBtn.onclick = () => void showLeaders();
helpBtn.onclick = () => showHelp();
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

// ── цикл ───────────────────────────────────────────────────────────────────

const loop = new Loop(
  (dt) => {
    tower.tick(dt);
    renderer.update(dt, tower);
  },
  () => renderer.draw(tower),
);

// ── старт ──────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  metrics.send('load_start');

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __debug: {
        tower,
        renderer,
        loop,
        /** Отдельная башня+рендерер на офскрин-канвасе — не трогает реальный
         * забег игрока. Для магазинных скриншотов заданного размера. */
        renderPreview(width: number, height: number, drops: number): HTMLCanvasElement {
          const container = document.createElement('div');
          container.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;height:${height}px;`;
          document.body.appendChild(container);
          const previewStage = new Stage(container, undefined, { maxDpr: 1 });
          const previewTower = new Tower(12345);
          const previewRenderer = new Renderer(previewStage);
          previewTower.newRun();
          for (let i = 0; i < drops && previewTower.alive; i += 1) {
            const last = previewTower.blocks[previewTower.blocks.length - 1];
            const cur = previewTower.current;
            if (!last || !cur) break;
            // Небольшой управляемый разброс — то же самое соотношение идеальных
            // и подрезанных блоков, что и в реальной игре, а не идеальный забег.
            const offset = i % 4 === 0 ? 0 : (((i * 37) % 11) - 5) * 1.4;
            cur.x = last.x + offset;
            previewTower.place();
          }
          previewRenderer.update(1, previewTower);
          previewRenderer.draw(previewTower);
          return previewStage.canvas;
        },
      },
    });
  }

  await yg.init({ gameplayApi: true });
  i18n.setLang(yg.lang);
  applyStaticLabels();

  const saved = await yg.load<Record<string, unknown>>({});
  muted = saved.muted === true;
  sfx.setMuted(muted);
  tower.deserialize(saved);
  totalRuns = typeof saved.totalRuns === 'number' && Number.isFinite(saved.totalRuns) ? saved.totalRuns : 0;

  const savedAchievements = Array.isArray(saved.achievements)
    ? saved.achievements.filter((x): x is string => typeof x === 'string')
    : [];
  achievements = new Achievements(achievementsFor(i18n.current), savedAchievements);
  noAdsPurchased = await yg.hasPurchase(NO_ADS_PRODUCT);

  tower.newRun();
  syncHud();
  loop.start();

  let revealed = false;
  const reveal = (): void => {
    if (revealed) return;
    revealed = true;
    loaderEl.classList.add('hidden');
    setTimeout(() => loaderEl.remove(), 350);
    yg.ready();
    metrics.send('load_done');
    metrics.send('game_start');
  };
  requestAnimationFrame(reveal);
  setTimeout(reveal, 1000);
}

void boot();
