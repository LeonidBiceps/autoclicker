/**
 * Астроштурм: сборка арены, интерфейса и платформы.
 *
 * Монетизация: rewarded-возрождение на смерти (до двух раз за забег — тот же
 * лимит, что в 2048), rewarded-удвоение медалей в конце забега, interstitial
 * на явном рестарте. Постоянная прогрессия — перки, оружие и классы за
 * медали между забегами, тот же паттерн, что и звёздная пыль в Космоферме.
 *
 * Управление: на десктопе — клавиши для бега/прыжка, мышь для прицела.
 * На тач-устройствах — джойстик слева и кнопка прыжка справа (DOM-оверлей
 * поверх канваса), автонаведение вместо ручного прицела.
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
import { CLASSES, type ClassDef, type ClassId } from './classes';
import {
  achievementsFor,
  classDescKey,
  classNameKey,
  createI18n,
  rulesFor,
  weaponDescKey,
  weaponNameKey,
} from './i18n';
import { Renderer } from './render';
import {
  ArenaSim,
  PERK_DEF,
  PERK_KEYS,
  emptyPerks,
  perkCost,
  type PerkKey,
  type PermaPerks,
} from './sim';
import { WEAPONS, type WeaponDef, type WeaponId } from './weapons';
import './style.css';

const LEADERBOARD = 'bestWave';
const SHOP_STATS = ['damage', 'fireRate', 'hp', 'speed'] as const;
type ShopStat = (typeof SHOP_STATS)[number];

const PERK_ICON: Record<PerkKey, string> = { damage: '⚔️', hp: '🛡️', fireRate: '⚡', crit: '🎯' };
const PERK_NAME_KEY: Record<PerkKey, 'perkDamage' | 'perkHp' | 'perkFireRate' | 'perkCrit'> = {
  damage: 'perkDamage',
  hp: 'perkHp',
  fireRate: 'perkFireRate',
  crit: 'perkCrit',
};
const PERK_DESC_KEY: Record<PerkKey, 'perkDamageDesc' | 'perkHpDesc' | 'perkFireRateDesc' | 'perkCritDesc'> = {
  damage: 'perkDamageDesc',
  hp: 'perkHpDesc',
  fireRate: 'perkFireRateDesc',
  crit: 'perkCritDesc',
};

/** Волна, на которой открывается класс. `0` — доступен сразу. */
const CLASS_UNLOCK_WAVE: Record<ClassId, number> = { assault: 0, sniper: 5, heavy: 10 };

// ── состояние ──────────────────────────────────────────────────────────────

const sfx = new Sfx();
const i18n = createI18n(navigator.language);
const t = i18n.t.bind(i18n);

let sim: ArenaSim;
let perks: PermaPerks = emptyPerks();
let medals = 0;
let bestWave = 0;
let totalRuns = 0;
let purchasesThisRun = 0;
let tookDamageThisWave = false;
let muted = false;
let achievements: Achievements;

let unlockedWeapons = new Set<WeaponId>(['pistol']);
let selectedWeapon: WeaponId = 'pistol';
let selectedClass: ClassId = 'assault';

/** Идёт ли сейчас забег (а не главное меню/лобби) — только тогда Esc открывает паузу. */
let inRun = false;
let pauseOpen = false;

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
const coinsEl = $<HTMLElement>('coins');
const hpFillEl = $<HTMLElement>('hp-fill');
const hpBarEl = hpFillEl.parentElement as HTMLElement;
const xpFillEl = $<HTMLElement>('xp-fill');
const levelBadgeEl = $<HTMLElement>('level-badge');
const waveBannerEl = $<HTMLDivElement>('wave-banner');
const restartBtn = $<HTMLButtonElement>('restart');
const leadersBtn = $<HTMLButtonElement>('leaders');
const soundBtn = $<HTMLButtonElement>('sound');
const helpBtn = $<HTMLButtonElement>('help');
const loaderEl = $<HTMLDivElement>('loader');
const joystickBaseEl = $<HTMLDivElement>('joystick-base');
const joystickKnobEl = $<HTMLDivElement>('joystick-knob');
const jumpBtnEl = $<HTMLButtonElement>('jump-btn');

const stage = new Stage(boardEl, () => sim.resize(stage.viewport.width, stage.viewport.height));
const renderer = new Renderer(stage);

// ── HUD ────────────────────────────────────────────────────────────────────

function applyStaticLabels(): void {
  document.documentElement.lang = i18n.current;
  document.title = t('title');
  $<HTMLElement>('label-hp').textContent = t('hp');
  $<HTMLElement>('label-score').textContent = t('score');
  $<HTMLElement>('label-coins').textContent = t('coins');
  restartBtn.textContent = t('overRestart');
  leadersBtn.setAttribute('aria-label', t('leaders'));
  soundBtn.setAttribute('aria-label', t('sound'));
  helpBtn.setAttribute('aria-label', t('help'));
  jumpBtnEl.setAttribute('aria-label', t('title'));
  const loaderTitle = loaderEl.querySelector('.loader-title');
  if (loaderTitle) loaderTitle.textContent = t('title');
}

function syncHud(): void {
  scoreEl.textContent = i18n.num(sim.score);
  coinsEl.textContent = i18n.num(sim.coins);

  const ratio = sim.maxHp > 0 ? sim.hp / sim.maxHp : 0;
  hpFillEl.style.width = `${Math.max(0, ratio * 100)}%`;
  hpBarEl.classList.toggle('low', ratio < 0.3);

  levelBadgeEl.textContent = String(sim.level);
  const xpRatio = sim.xp / sim.xpToNext(sim.level);
  xpFillEl.style.width = `${Math.min(100, Math.max(0, xpRatio * 100))}%`;

  soundBtn.textContent = muted ? '🔇' : '🔊';
}

let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function showWaveBanner(text: string): void {
  waveBannerEl.textContent = text;
  waveBannerEl.hidden = false;
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    waveBannerEl.hidden = true;
  }, 1500);
}

// ── сохранение ─────────────────────────────────────────────────────────────

function persist(): void {
  yg.save({
    perks,
    medals,
    bestWave,
    totalRuns,
    muted,
    achievements: achievements.unlockedIds,
    unlockedWeapons: [...unlockedWeapons],
    selectedWeapon,
    selectedClass,
  });
}

/** Проверяет условия достижений и показывает тост на каждое новое. */
function checkAchievements(justDefeatedBoss: boolean, waveJustCleared: number | null): void {
  const candidates: Array<[string, boolean]> = [
    ['first_boss', justDefeatedBoss],
    ['wave_10', bestWave >= 10],
    ['wave_20', bestWave >= 20],
    ['no_hit_wave', waveJustCleared !== null && !tookDamageThisWave],
    ['shopaholic', purchasesThisRun >= 10],
    ['ten_runs', totalRuns >= 10],
    ['full_arsenal', unlockedWeapons.size >= WEAPONS.length],
    ['all_classes', CLASSES.every((c) => bestWave >= CLASS_UNLOCK_WAVE[c.id])],
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

// ── магазин между волнами ───────────────────────────────────────────────────

function shopRow(stat: ShopStat, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shop-row';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = { damage: '⚔️', fireRate: '⚡', hp: '❤️', speed: '👟' }[stat];

  const mid = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'name';
  const key = { damage: 'shopDamage', fireRate: 'shopFireRate', hp: 'shopHp', speed: 'shopSpeed' }[stat] as
    | 'shopDamage'
    | 'shopFireRate'
    | 'shopHp'
    | 'shopSpeed';
  name.textContent = t(key);
  const sub = document.createElement('span');
  sub.className = 'sub';
  const level = { damage: sim.dmgLevel, fireRate: sim.rateLevel, hp: sim.hpLevel, speed: sim.speedLevel }[stat];
  sub.textContent = t('level', { level });
  mid.append(name, document.createElement('br'), sub);

  const cost = document.createElement('span');
  cost.className = 'cost';
  const price = sim.shopCost(stat);
  cost.textContent = Number.isFinite(price) ? String(price) : t('shopMax');

  btn.append(icon, mid, cost);
  btn.disabled = !Number.isFinite(price) || sim.coins < price;
  btn.onclick = onClick;
  return btn;
}

function showShop(): void {
  const list = document.createElement('div');
  list.className = 'shop-list';
  for (const stat of SHOP_STATS) {
    list.appendChild(
      shopRow(stat, () => {
        if (!sim.buyShopUpgrade(stat)) {
          sfx.play('error');
          return;
        }
        sfx.play('click');
        purchasesThisRun += 1;
        syncHud();
        showShop(); // перерисовываем магазин со свежими ценами
      }),
    );
  }

  showModal({
    title: t('shopTitle', { n: sim.wave + 1 }),
    result: `+${sim.coins}`,
    body: list,
    actions: [
      {
        label: t('shopContinue'),
        onClick: () => {
          hideModal();
          sim.closeShop();
        },
      },
    ],
  });
}

// ── смерть и продолжение ────────────────────────────────────────────────────

async function onPlayerDied(): Promise<void> {
  sfx.play('lose');
  bestWave = Math.max(bestWave, sim.wave);
  totalRuns += 1;
  const earnedMedals = sim.medalsEarned();
  metrics.send('game_over', { wave: sim.wave, score: sim.score });
  await submitScore();
  checkAchievements(false, null);

  const actions: ModalAction[] = [];

  if (sim.canContinue) {
    actions.push({
      label: t('overContinue'),
      kind: 'reward',
      onClick: async () => {
        metrics.send('ad_rewarded_offer', { placement: 'revive' });
        const res = await yg.rewarded();
        if (!res.rewarded) {
          metrics.send('ad_rewarded_declined', { placement: 'revive' });
          return;
        }
        metrics.send('ad_rewarded_shown', { placement: 'revive' });
        sim.continuesUsed += 1;
        sim.revive();
        hideModal();
        syncHud();
      },
    });
  }

  actions.push({
    label: t('overRestart'),
    kind: sim.canContinue ? 'ghost' : 'primary',
    onClick: () => void endRun(earnedMedals, 1),
  });

  showModal({
    title: t('overTitle'),
    result: t('overWave', { wave: sim.wave }),
    text: `${t('overScore', { score: i18n.num(sim.score) })} · ${t('overMedals', { medals: earnedMedals })}`,
    actions,
  });
}

async function endRun(earnedMedals: number, multiplier: number): Promise<void> {
  inRun = false;
  hideModal();
  medals += earnedMedals * multiplier;
  persist();

  if (!noAdsPurchased) {
    const res = await yg.interstitial();
    if (res.shown) metrics.send('ad_interstitial_shown', { placement: 'restart' });
  }

  showMainMenu();
}

function startRun(): void {
  inRun = true;
  sim.setLoadout(selectedWeapon, selectedClass);
  sim.newRun();
  purchasesThisRun = 0;
  tookDamageThisWave = false;
  hideModal();
  syncHud();
  persist();
  metrics.send('game_start', { weapon: selectedWeapon, class: selectedClass });
}

// ── меню ─────────────────────────────────────────────────────────────────────

function showMainMenu(): void {
  showModal({
    title: t('title'),
    text: bestWave > 0 ? t('menuBest', { wave: bestWave }) : t('menuFirstTime'),
    actions: [
      { label: t('menuPlay'), onClick: () => startRun() },
      { label: t('menuArsenal'), kind: 'ghost', onClick: showArsenal },
      { label: t('menuClasses'), kind: 'ghost', onClick: showClasses },
      { label: t('perksTitle'), kind: 'ghost', onClick: showPerks },
      { label: t('achievements'), kind: 'ghost', onClick: showAchievements },
      { label: t('leaders'), kind: 'ghost', onClick: () => void showLeaders() },
      { label: t('menuSettings'), kind: 'ghost', onClick: () => showSettings(showMainMenu) },
      { label: t('help'), kind: 'ghost', onClick: showHelp },
    ],
  });
}

function weaponRow(w: WeaponDef): HTMLButtonElement {
  const owned = unlockedWeapons.has(w.id);
  const equipped = selectedWeapon === w.id;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shop-row';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = w.icon;

  const mid = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = t(weaponNameKey(w.id));
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = t(weaponDescKey(w.id));
  mid.append(name, document.createElement('br'), sub);

  const cost = document.createElement('span');
  cost.className = 'cost';
  cost.textContent = equipped ? t('weaponEquipped') : owned ? t('weaponEquip') : t('weaponLocked', { cost: w.cost });
  if (equipped) cost.classList.add('equipped');

  btn.append(icon, mid, cost);
  btn.disabled = equipped;
  btn.onclick = () => {
    if (!owned) {
      if (medals < w.cost) {
        sfx.play('error');
        return;
      }
      medals -= w.cost;
      unlockedWeapons.add(w.id);
      sfx.play('win');
    } else {
      sfx.play('click');
    }
    selectedWeapon = w.id;
    persist();
    checkAchievements(false, null);
    showArsenal();
  };
  return btn;
}

function showArsenal(): void {
  const list = document.createElement('div');
  list.className = 'shop-list';
  for (const w of WEAPONS) list.appendChild(weaponRow(w));

  showModal({
    title: t('arsenalTitle'),
    text: t('arsenalHint'),
    result: `🎖️ ${medals}`,
    body: list,
    dismissible: true,
    actions: [{ label: t('back'), kind: 'ghost', onClick: showMainMenu }],
  });
}

function classRow(c: ClassDef): HTMLButtonElement {
  const unlockWave = CLASS_UNLOCK_WAVE[c.id];
  const unlocked = bestWave >= unlockWave;
  const equipped = selectedClass === c.id;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shop-row';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = c.icon;

  const mid = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = t(classNameKey(c.id));
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = t(classDescKey(c.id));
  mid.append(name, document.createElement('br'), sub);

  const cost = document.createElement('span');
  cost.className = 'cost';
  cost.textContent = equipped
    ? t('classEquipped')
    : unlocked
      ? t('classEquip')
      : t('classLocked', { wave: unlockWave });
  if (equipped) cost.classList.add('equipped');

  btn.append(icon, mid, cost);
  btn.disabled = equipped || !unlocked;
  btn.onclick = () => {
    if (!unlocked) {
      sfx.play('error');
      return;
    }
    selectedClass = c.id;
    sfx.play('click');
    persist();
    showClasses();
  };
  return btn;
}

function showClasses(): void {
  const list = document.createElement('div');
  list.className = 'shop-list';
  for (const c of CLASSES) list.appendChild(classRow(c));

  showModal({
    title: t('classesTitle'),
    text: t('classesHint'),
    body: list,
    dismissible: true,
    actions: [{ label: t('back'), kind: 'ghost', onClick: showMainMenu }],
  });
}

// ── правила, достижения, лидеры ─────────────────────────────────────────────

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
      {
        label: noAdsPurchased ? t('iapNoAdsOwned') : t('iapNoAds'),
        kind: 'ghost',
        onClick: noAdsPurchased ? hideModal : () => void buyNoAds(),
      },
      {
        label: t('helpFeedback'),
        kind: 'ghost',
        onClick: () => {
          const mailBody = `${t('title')} — ${t('wave', { n: bestWave })}\n\n`;
          openMailFeedback(SUPPORT_EMAIL, t('helpFeedbackSubject'), mailBody);
        },
      },
      { label: t('close'), onClick: hideModal },
    ],
  });
}

// ── пауза и настройки ────────────────────────────────────────────────────────

function showPause(): void {
  if (!inRun) return;
  pauseOpen = true;
  sfx.play('click');
  showModal({
    title: t('pauseTitle'),
    text: t('wave', { n: sim.wave }),
    dismissible: true,
    onDismiss: closePause,
    actions: [
      { label: t('pauseResume'), onClick: closePause },
      { label: t('menuSettings'), kind: 'ghost', onClick: () => showSettings(showPause) },
      {
        label: t('pauseExit'),
        kind: 'ghost',
        onClick: () => {
          pauseOpen = false;
          void endRun(0, 1);
        },
      },
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
    syncHud();
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

function showPerks(): void {
  const list = document.createElement('div');
  list.className = 'shop-list';

  for (const key of PERK_KEYS) {
    const level = perks[key];
    const def = PERK_DEF[key];
    const cost = perkCost(key, level);
    const maxed = level >= def.maxLevel;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-row';

    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = PERK_ICON[key];

    const mid = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = t(PERK_NAME_KEY[key]);
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = t(PERK_DESC_KEY[key]);
    mid.append(name, document.createElement('br'), sub);

    const costEl = document.createElement('span');
    costEl.className = 'cost';
    costEl.textContent = maxed ? t('shopMax') : String(cost);

    btn.append(icon, mid, costEl);
    btn.disabled = maxed || medals < cost;
    btn.onclick = () => {
      if (maxed || medals < cost) {
        sfx.play('error');
        return;
      }
      medals -= cost;
      perks[key] += 1;
      sfx.play('win');
      persist();
      showPerks();
    };

    list.appendChild(btn);
  }

  showModal({
    title: t('perksTitle'),
    result: `🎖️ ${medals}`,
    body: list,
    dismissible: true,
    actions: [{ label: t('close'), kind: 'ghost', onClick: hideModal }],
  });
}

async function showLeaders(): Promise<void> {
  sfx.play('click');
  showModal({
    title: t('leaders'),
    text: '…',
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

async function submitScore(): Promise<void> {
  if (bestWave <= 0) return;
  await yg.submitScore(LEADERBOARD, bestWave);
}

// ── ввод ───────────────────────────────────────────────────────────────────

const keys = new Set<string>();
let usingMouseAim = false;
let mouseClientX = 0;
let mouseClientY = 0;

// Точка прицела в координатах канваса, зажатая в его границы. Курсор часто
// уходит за край небольшого игрового поля, когда целишься вверх или к краю
// экрана, — прицеливание не должно из-за этого срываться на автонаведение.
function clampedBoardPoint(clientX: number, clientY: number): { x: number; y: number } {
  const rect = stage.canvas.getBoundingClientRect();
  const x = Math.min(Math.max(clientX, rect.left), rect.right) - rect.left;
  const y = Math.min(Math.max(clientY, rect.top), rect.bottom) - rect.top;
  return { x, y };
}

// Слушаем на window, а не на канвасе: так прицел продолжает следить за
// курсором, даже когда тот на миг выходит за пределы игрового поля, и не
// «замирает» в последней точке, где мышь была строго над канвасом.
// Прицел включаем только во время самого забега, без открытых модалок —
// иначе наведение мыши на кнопки меню (лежащие поверх того же канваса) само
// по себе включало бы ручной прицел ещё до первого выстрела.
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;
  if (inRun && !isModalOpen()) usingMouseAim = true;
});
// Клик мышью тоже переводит фокус в игру — иначе первый выстрел после захода
// на страницу целится «в никуда», пока курсор не шевельнётся.
// Пока прицел мышью активен, оружие стреляет по нажатию (как курок), а не
// само по себе — зажатая кнопка держит огонь, отпущенная останавливает.
boardEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') return;
  usingMouseAim = true;
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;
  if (e.button === 0) sim.setFiring(true);
});
// На window, а не на boardEl: при быстром движении мышь может оказаться за
// пределами канваса в момент отпускания кнопки — иначе огонь «залипнет».
window.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  sim.setFiring(false);
});
window.addEventListener('blur', () => {
  sim.setFiring(false);
  // Alt-tab или системный попап крадёт фокус, пока клавиша движения зажата —
  // keyup при этом не приходит вовсе, и персонаж продолжал бы бежать сам по
  // себе после возврата в игру, пока игрок не нажмёт и не отпустит клавишу заново.
  keys.clear();
});

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault(); // не листать страницу
  if (e.code === 'Escape') {
    if (pauseOpen) closePause();
    else if (inRun && !isModalOpen()) showPause();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ── тач-джойстик и кнопка прыжка ─────────────────────────────────────────────

let joystickPointerId: number | null = null;

function updateJoystick(clientX: number): void {
  const rect = joystickBaseEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const maxR = rect.width / 2;
  const dx = Math.max(-maxR, Math.min(maxR, clientX - cx));
  joystickKnobEl.style.transform = `translateX(${dx}px)`;
  const dir = dx < -maxR * 0.25 ? -1 : dx > maxR * 0.25 ? 1 : 0;
  sim.setMoveInput(dir);
}

function resetJoystick(): void {
  joystickPointerId = null;
  joystickKnobEl.style.transform = 'translateX(0)';
  sim.setMoveInput(0);
}

joystickBaseEl.addEventListener('pointerdown', (e) => {
  joystickPointerId = e.pointerId;
  joystickBaseEl.setPointerCapture?.(e.pointerId);
  updateJoystick(e.clientX);
});
joystickBaseEl.addEventListener('pointermove', (e) => {
  if (joystickPointerId !== e.pointerId) return;
  updateJoystick(e.clientX);
});
joystickBaseEl.addEventListener('pointerup', (e) => {
  if (joystickPointerId === e.pointerId) resetJoystick();
});
joystickBaseEl.addEventListener('pointercancel', (e) => {
  if (joystickPointerId === e.pointerId) resetJoystick();
});

jumpBtnEl.addEventListener('pointerdown', () => sim.requestJump());

// ── цикл ───────────────────────────────────────────────────────────────────

function updateFrame(dt: number): void {
  if (isModalOpen()) return;

  let moveInput: -1 | 0 | 1 = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) moveInput = -1;
  else if (keys.has('ArrowRight') || keys.has('KeyD')) moveInput = 1;
  if (moveInput !== 0 || joystickPointerId === null) sim.setMoveInput(moveInput);
  if (keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW')) sim.requestJump();

  // Прицел пересчитывается из текущей позиции мыши и текущей камеры каждый
  // кадр, а не только по событиям pointermove — иначе при неподвижной мыши,
  // но движущейся камере (бежим вперёд, не шевеля мышью) прицел визуально
  // «отстаёт» от курсора вместо того, чтобы оставаться под ним.
  if (usingMouseAim) {
    const { x, y } = clampedBoardPoint(mouseClientX, mouseClientY);
    sim.setAimPoint(x + sim.cameraX, y - sim.groundY);
  } else {
    sim.clearAimPoint();
  }

  const events = sim.tick(dt);
  renderer.update(dt, sim);
  if (events.playerShot) renderer.triggerMuzzleFlash();

  for (const hit of events.hits) renderer.spawnHitFx(hit.x, hit.y, hit.crit);
  for (const death of events.deaths) renderer.spawnDeathFx(death.x, death.y, death.boss);
  for (const boom of events.explosions) renderer.spawnExplosionFx(boom.x, boom.y);
  if (events.playerHit) {
    renderer.spawnPlayerHitFx(sim.playerX, sim.groundY + sim.playerY - 30 * sim.scale);
    tookDamageThisWave = true;
    sfx.play('error');
  }
  if (events.playerJumped) sfx.play('move');
  if (events.hits.some((h) => h.crit)) sfx.play('click');
  if (events.deaths.length > 0) sfx.play('merge');

  if (events.waveStarted !== null) {
    tookDamageThisWave = false;
    showWaveBanner(events.bossSpawned ? t('bossBanner') : t('waveBanner', { n: events.waveStarted }));
    sfx.play(events.bossSpawned ? 'lose' : 'move');
  }

  if (events.leveledUp !== null) {
    showWaveBanner(t('levelBanner', { n: events.leveledUp }));
    renderer.spawnDeathFx(sim.playerX, sim.groundY + sim.playerY - 40 * sim.scale, false);
    sfx.play('reward');
  }

  if (events.waveCleared !== null) {
    bestWave = Math.max(bestWave, sim.wave);
    const justDefeatedBoss = events.waveCleared % 5 === 0;
    checkAchievements(justDefeatedBoss, events.waveCleared);
    persist();
    sfx.play('win');
    showShop();
  }

  if (events.playerDied) void onPlayerDied();

  if (dt > 0) syncHud();
}

const loop = new Loop(updateFrame, () => renderer.draw(sim));

restartBtn.onclick = () => {
  sfx.play('click');
  void endRun(0, 1);
};
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

// ── старт ──────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  metrics.send('load_start');

  await yg.init({ gameplayApi: true });
  i18n.setLang(yg.lang);
  applyStaticLabels();

  const saved = await yg.load<Record<string, unknown>>({});
  muted = saved.muted === true;
  sfx.setMuted(muted);

  const savedPerks = saved.perks as Partial<PermaPerks> | undefined;
  perks = {
    damage: typeof savedPerks?.damage === 'number' ? savedPerks.damage : 0,
    hp: typeof savedPerks?.hp === 'number' ? savedPerks.hp : 0,
    fireRate: typeof savedPerks?.fireRate === 'number' ? savedPerks.fireRate : 0,
    crit: typeof savedPerks?.crit === 'number' ? savedPerks.crit : 0,
  };
  medals = typeof saved.medals === 'number' ? saved.medals : 0;
  bestWave = typeof saved.bestWave === 'number' ? saved.bestWave : 0;
  totalRuns = typeof saved.totalRuns === 'number' ? saved.totalRuns : 0;

  const savedWeapons = Array.isArray(saved.unlockedWeapons)
    ? saved.unlockedWeapons.filter((x): x is WeaponId => typeof x === 'string' && WEAPONS.some((w) => w.id === x))
    : [];
  unlockedWeapons = new Set<WeaponId>(['pistol', ...savedWeapons]);
  selectedWeapon = unlockedWeapons.has(saved.selectedWeapon as WeaponId)
    ? (saved.selectedWeapon as WeaponId)
    : 'pistol';
  const savedClass = saved.selectedClass;
  selectedClass =
    typeof savedClass === 'string' && CLASSES.some((c) => c.id === savedClass) ? (savedClass as ClassId) : 'assault';

  const savedAchievements = Array.isArray(saved.achievements)
    ? saved.achievements.filter((x): x is string => typeof x === 'string')
    : [];
  achievements = new Achievements(achievementsFor(i18n.current), savedAchievements);
  noAdsPurchased = await yg.hasPurchase(NO_ADS_PRODUCT);

  sim = new ArenaSim(perks, selectedWeapon, selectedClass);
  sim.resize(stage.viewport.width, stage.viewport.height);
  sim.newRun();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __debug: {
        sim,
        renderer,
        achievements,
        perks,
        loop,
        updateFrame,
        showShop,
        showPerks,
        showMainMenu,
        showArsenal,
        showClasses,
        showHelp,
        startRun,
        /** Отдельная арена+рендерер на офскрин-канвасе — не трогает реальный забег игрока. Для магазинных скриншотов. */
        renderPreview(
          width: number,
          height: number,
          opts: { ticks?: number; jump?: boolean } = {},
        ): { canvas: HTMLCanvasElement; player: { x: number; y: number } } {
          const container = document.createElement('div');
          container.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;height:${height}px;`;
          document.body.appendChild(container);
          const previewStage = new Stage(container, undefined, { maxDpr: 1 });
          const previewSim = new ArenaSim(emptyPerks(), 'pistol', 'assault', 12345);
          previewSim.resize(previewStage.viewport.width, previewStage.viewport.height);
          previewSim.newRun();
          const previewRenderer = new Renderer(previewStage);

          const ticks = opts.ticks ?? 240;
          for (let i = 0; i < ticks; i += 1) previewSim.tick(1 / 60);

          // На настоящем уровне враги заходят с концов уровня и идут к игроку
          // секунд 15 — для витрины столько ждать нельзя. Спавним волной
          // (правильные хп/скорость по логике игры), затем сразу подтягиваем
          // врагов ближе к камере и досаживаем лишь пару кадров — иначе
          // автоприцел успевает добить их до захвата кадра.
          const spawn = (previewSim as unknown as { spawnEnemy(kind: string, side: -1 | 1): void }).spawnEnemy.bind(
            previewSim,
          );
          const nearby: Array<[string, -1 | 1, number]> = [
            ['walker', 1, 160],
            ['runner', -1, 260],
            ['shooter', 1, 340],
          ];
          for (const [kind, side, offset] of nearby) {
            spawn(kind, side);
            const enemy = previewSim.enemies[previewSim.enemies.length - 1];
            if (enemy) enemy.x = previewSim.playerX + side * offset * previewSim.scale;
          }
          // Прыжок запрашиваем в самом конце — на кадре захвата игрок ещё в
          // воздухе (полный прыжок занимает ~0.76с/46 тиков, тут меньше).
          if (opts.jump) previewSim.requestJump();
          for (let i = 0; i < 18; i += 1) previewSim.tick(1 / 60);

          previewRenderer.update(1 / 60, previewSim);
          previewRenderer.draw(previewSim);
          return {
            canvas: previewStage.canvas,
            player: { x: previewSim.playerX - previewSim.cameraX, y: previewSim.groundY + previewSim.playerY },
          };
        },
      },
    });
  }

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
    showMainMenu();
  };
  requestAnimationFrame(reveal);
  setTimeout(reveal, 1000);
}

void boot();
