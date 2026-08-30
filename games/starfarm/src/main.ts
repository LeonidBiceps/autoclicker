/**
 * Космоферма: сборка экономики, интерфейса и платформы.
 *
 * Монетизация idle-игры устроена иначе, чем в аркаде: прерывать здесь нечего,
 * зато есть два естественных повода посмотреть рекламу — ускорить добычу и
 * удвоить накопленное за время отсутствия. Оба вплетены в сам цикл, а не
 * навязаны сверху.
 */

import {
  Achievements,
  Loop,
  Particles,
  Rings,
  SUPPORT_EMAIL,
  Sfx,
  Shake,
  Stage,
  buildAchievementList,
  buildLeaderList,
  formatDuration,
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
import { Economy, GENERATORS, PERKS, PRESTIGE_THRESHOLD, type SaveData } from './economy';
import { achievementsFor, createI18n, rulesFor, type Keys } from './i18n';
import { MeteorSpawner, type MeteorState } from './meteor';
import './style.css';

const LEADERBOARD = 'lifetimeEnergy';

/** Множитель и длительность рекламного ускорения. */
const BOOST_MULTIPLIER = 3;
const BOOST_SECONDS = 120;

/** Ниже этой величины офлайн-доход не показываем — окно ради копеек раздражает. */
const OFFLINE_MIN_AMOUNT = 10;

const GENERATOR_ICONS = ['☀️', '🌱', '🛸', '🔥', '🪞', '🌀'];
const GENERATOR_NAME_KEYS: Array<keyof Keys> = [
  'genPanel',
  'genHydro',
  'genDrone',
  'genSmelter',
  'genMirror',
  'genWormhole',
];

const PERK_ICONS = ['👆', '⚡', '📡', '📦', '🍀', '🤖'];
const PERK_NAME_KEYS: Array<keyof Keys> = [
  'perkClickPower',
  'perkReactorOutput',
  'perkOfflineOps',
  'perkBulkDiscount',
  'perkMeteorLuck',
  'perkAutopilot',
];
const PERK_DESC_KEYS: Array<keyof Keys> = [
  'perkClickPowerDesc',
  'perkReactorOutputDesc',
  'perkOfflineOpsDesc',
  'perkBulkDiscountDesc',
  'perkMeteorLuckDesc',
  'perkAutopilotDesc',
];

/** Метеорит появляется в среднем раз в эту паузу; перк удачи сокращает её. */
const METEOR_BASE_INTERVAL = 45;
const FRENZY_MULTIPLIER = 10;
const FRENZY_SECONDS = 15;
const METEOR_BOOST_MULTIPLIER = 5;
const METEOR_BOOST_SECONDS = 20;

// ── состояние ──────────────────────────────────────────────────────────────

const economy = new Economy();
const sfx = new Sfx();
const i18n = createI18n(navigator.language);
const t = i18n.t.bind(i18n);

let muted = false;
let pauseOpen = false;
/** Перезапусков за эту сессию — только для темпа подсказок про ярлык/отзыв. */
let prestigeCount = 0;
/** Перезапусков за всё время — переживает перезагрузку, для достижений. */
let totalPrestiges = 0;
let achievements: Achievements;
let meteorsCaught = 0;
let offlineCollected = false;

const NO_ADS_PRODUCT = 'no_ads';
let noAdsPurchased = false;

// ── DOM ────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

const energyEl = $<HTMLElement>('energy');
const rateEl = $<HTMLElement>('rate');
const stardustBox = $<HTMLElement>('stardust-box');
const stardustEl = $<HTMLElement>('stardust');
const boostEl = $<HTMLElement>('boost');
const reactorBtn = $<HTMLButtonElement>('reactor');
const perClickEl = $<HTMLElement>('per-click');
const floatersEl = $<HTMLElement>('floaters');
const shopListEl = $<HTMLElement>('shop-list');
const perkListEl = $<HTMLElement>('perk-list');
const perkListWrapEl = $<HTMLElement>('perk-list-wrap');
const perkLockedHintEl = $<HTMLElement>('perk-locked-hint');
const tabShopBtn = $<HTMLButtonElement>('tab-shop');
const tabPerksBtn = $<HTMLButtonElement>('tab-perks');
const boostBtn = $<HTMLButtonElement>('boost-btn');
const prestigeBtn = $<HTMLButtonElement>('prestige');
const leadersBtn = $<HTMLButtonElement>('leaders');
const soundBtn = $<HTMLButtonElement>('sound');
const helpBtn = $<HTMLButtonElement>('help');
const loaderEl = $<HTMLDivElement>('loader');
const bgEl = $<HTMLDivElement>('bg');
const fxEl = $<HTMLDivElement>('fx');
const appEl = $<HTMLDivElement>('app');

// ── эффекты ────────────────────────────────────────────────────────────────

const backdrop = createBackdrop(bgEl);
const fxStage = new Stage(fxEl, undefined, { alpha: true });
const particles = new Particles(220);
const rings = new Rings();
const shake = new Shake();

const GOLD = ['#ffd166', '#ffb703', '#fff3c4'] as const;
const BLUE = ['#7aa2f7', '#a9c4ff', '#c9dcff'] as const;
const PURPLE = ['#c792ea', '#e0b3ff', '#f4dbff'] as const;

// Объект передаётся в спаунер по ссылке и обновляется в цикле — так рост
// перка удачи меняет частоту появления без пересоздания спаунера.
const meteorConfig = { baseInterval: METEOR_BASE_INTERVAL, frequencyBonus: 0 };
const meteor = new MeteorSpawner(meteorConfig);

function fxAt(clientX: number, clientY: number): { x: number; y: number } {
  const rect = fxEl.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/** Центр реактора в координатах слоя эффектов — цель для «безадресных» вспышек. */
function fxCenter(): { x: number; y: number } {
  const r = reactorBtn.getBoundingClientRect();
  return fxAt(r.left + r.width / 2, r.top + r.height / 2);
}

/** Строки магазина создаются один раз, дальше только обновляются. */
interface ShopRow {
  root: HTMLButtonElement;
  name: HTMLElement;
  sub: HTMLElement;
  cost: HTMLElement;
  count: HTMLElement;
}

const rows: ShopRow[] = [];
const perkRows: ShopRow[] = [];
let clickRow: ShopRow | null = null;

function createRow(icon: string, onClick: () => void): ShopRow {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'item';

  const iconEl = document.createElement('span');
  iconEl.className = 'icon';
  iconEl.textContent = icon;

  const middle = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'name';
  const sub = document.createElement('span');
  sub.className = 'sub';
  middle.append(name, document.createElement('br'), sub);

  const right = document.createElement('span');
  const cost = document.createElement('span');
  cost.className = 'cost';
  const count = document.createElement('span');
  count.className = 'count';
  right.append(cost, count);

  root.append(iconEl, middle, right);
  root.onclick = onClick;

  return { root, name, sub, cost, count };
}

function buildShop(): void {
  shopListEl.replaceChildren();
  rows.length = 0;

  GENERATORS.forEach((_, index) => {
    const row = createRow(GENERATOR_ICONS[index] ?? '⚙️', () => buyGenerator(index));
    rows.push(row);
    shopListEl.appendChild(row.root);
  });

  clickRow = createRow('👆', () => upgradeClick());
  shopListEl.appendChild(clickRow.root);
}

function buildPerks(): void {
  perkListEl.replaceChildren();
  perkRows.length = 0;

  PERKS.forEach((_, index) => {
    const row = createRow(PERK_ICONS[index] ?? '✨', () => buyPerk(index));
    perkRows.push(row);
    perkListEl.appendChild(row.root);
  });
}

function switchTab(tab: 'shop' | 'perks'): void {
  const showShop = tab === 'shop';
  shopListEl.hidden = !showShop;
  perkListWrapEl.hidden = showShop;
  tabShopBtn.classList.toggle('active', showShop);
  tabShopBtn.setAttribute('aria-selected', String(showShop));
  tabPerksBtn.classList.toggle('active', !showShop);
  tabPerksBtn.setAttribute('aria-selected', String(!showShop));
}

// ── действия ───────────────────────────────────────────────────────────────

function buyGenerator(index: number): void {
  if (!economy.buy(index)) {
    sfx.play('error');
    return;
  }
  sfx.play('click');
  metrics.send('buy_generator', { index, owned: economy.owned[index] });
  const { x, y } = fxCenter();
  rings.spawn(x, y, '#7aa2f7', 0.5, 3);
  particles.burst(x, y, { count: 10, colors: BLUE, speed: 200, size: 3.5, life: 0.6 });
  refresh();
  persist();
}

function upgradeClick(): void {
  if (!economy.upgradeClick()) {
    sfx.play('error');
    return;
  }
  sfx.play('click');
  metrics.send('upgrade_click', { level: economy.clickLevel });
  const { x, y } = fxCenter();
  rings.spawn(x, y, '#7aa2f7', 0.5, 3);
  refresh();
  persist();
}

function buyPerk(index: number): void {
  if (!economy.buyPerk(index)) {
    sfx.play('error');
    return;
  }
  sfx.play('win');
  metrics.send('buy_perk', { index, level: economy.perkLevels[index] });
  const { x, y } = fxCenter();
  rings.spawn(x, y, '#c792ea', 0.55, 3);
  particles.burst(x, y, { count: 16, colors: PURPLE, speed: 220, size: 3.5, life: 0.7 });
  refresh();
  persist();
  checkAchievements();
}

function tap(event: PointerEvent): void {
  const amount = economy.click();
  sfx.play('move');
  spawnFloater(`+${formatShort(amount)}`, event);

  const { x, y } = fxAt(event.clientX, event.clientY);
  particles.burst(x, y, {
    count: 8,
    colors: GOLD,
    speed: 160,
    spread: Math.PI * 1.6,
    size: 3,
    life: 0.5,
  });
  rings.spawn(x, y, '#ffd166', 0.4, 2);

  refresh();
}

/** Всплывающее «+N» в точке нажатия. */
function spawnFloater(text: string, event: PointerEvent): void {
  const rect = floatersEl.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'floater';
  el.textContent = text;
  el.style.left = `${event.clientX - rect.left}px`;
  el.style.top = `${event.clientY - rect.top}px`;
  // Небольшой разброс, чтобы серия нажатий не сливалась в одну колонку.
  el.style.transform = `translateX(${Math.round(Math.random() * 24 - 12)}px)`;
  floatersEl.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/** Текстовая всплывающая подпись в произвольной точке экрана (не только у реактора). */
function spawnLabel(text: string, x: number, y: number, color = '#ffd166'): void {
  const el = document.createElement('span');
  el.className = 'floater';
  el.style.color = color;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function handleMeteorHit(clientX: number, clientY: number): void {
  const { x, y } = fxAt(clientX, clientY);
  const hit = meteor.hit(x, y);
  if (!hit) return;

  sfx.play('reward');
  particles.burst(x, y, {
    count: 30,
    colors: hit.kind === 'frenzy' ? PURPLE : hit.kind === 'boost' ? BLUE : GOLD,
    speed: 260,
    size: 4,
    life: 0.8,
    shape: 'square',
  });
  rings.spawn(x, y, '#ffd166', 0.6, 3);

  metrics.send('meteor_hit', { kind: hit.kind });
  meteorsCaught += 1;

  switch (hit.kind) {
    case 'energy': {
      const amount =
        (economy.perSecond * (20 + Math.random() * 40) + economy.perClick * 20) *
        economy.meteorValueMultiplier;
      economy.collect(amount);
      spawnLabel(t('meteorEnergy', { value: formatShort(amount) }), x, y);
      break;
    }
    case 'boost': {
      economy.startBoost(METEOR_BOOST_MULTIPLIER, METEOR_BOOST_SECONDS);
      spawnLabel(t('meteorBoost'), x, y, '#7aa2f7');
      break;
    }
    case 'frenzy': {
      economy.startFrenzy(FRENZY_MULTIPLIER, FRENZY_SECONDS);
      spawnLabel(t('meteorFrenzy'), x, y, '#c792ea');
      break;
    }
  }

  refresh();
  persist();
  checkAchievements();
}

function drawMeteor(m: MeteorState, ctx: CanvasRenderingContext2D, elapsed: number): void {
  const color = m.kind === 'frenzy' ? '#c792ea' : m.kind === 'boost' ? '#7aa2f7' : '#ffd166';
  const pulse = 1 + 0.12 * Math.sin(elapsed * 10);

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.radius * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Хвост в направлении полёта — единственная подсказка, что это не просто точка.
  const angle = Math.atan2(m.vy, m.vx);
  const tailLen = m.radius * 2.2;
  const grad = ctx.createLinearGradient(
    m.x,
    m.y,
    m.x - Math.cos(angle) * tailLen,
    m.y - Math.sin(angle) * tailLen,
  );
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'transparent');
  ctx.strokeStyle = grad;
  ctx.lineWidth = m.radius * 0.7;
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(m.x - Math.cos(angle) * tailLen, m.y - Math.sin(angle) * tailLen);
  ctx.stroke();
}

async function requestBoost(): Promise<void> {
  metrics.send('ad_rewarded_offer', { placement: 'boost' });
  const res = await yg.rewarded();
  if (!res.rewarded) {
    metrics.send('ad_rewarded_declined', { placement: 'boost' });
    return;
  }
  metrics.send('ad_rewarded_shown', { placement: 'boost' });
  economy.startBoost(BOOST_MULTIPLIER, BOOST_SECONDS);
  sfx.play('reward');
  shake.kick(10);
  const { x, y } = fxCenter();
  particles.burst(x, y, {
    count: 40,
    colors: [...GOLD, ...BLUE],
    speed: 320,
    size: 4,
    life: 0.9,
  });
  rings.spawn(x, y, '#ffd166', 0.7, 4);
  refresh();
  persist();
}

function askPrestige(): void {
  const gain = economy.pendingStardust;
  if (gain <= 0) return;

  sfx.play('click');
  showModal({
    title: t('prestigeTitle'),
    result: `+${formatShort(gain)}`,
    text: t('prestigeText', { gain: formatShort(gain) }),
    dismissible: true,
    actions: [
      {
        label: t('prestigeConfirm', { gain: formatShort(gain) }),
        onClick: () => void doPrestige(),
      },
      { label: t('cancel'), kind: 'ghost', onClick: hideModal },
    ],
  });
}

async function doPrestige(): Promise<void> {
  const gain = economy.prestige();
  if (gain <= 0) return;

  prestigeCount += 1;
  totalPrestiges += 1;
  metrics.send('prestige', { gain, total: economy.stardust, count: prestigeCount });
  sfx.play('win');
  shake.kick(18);
  const { x, y } = fxCenter();
  particles.burst(x, y, {
    count: 60,
    colors: [...GOLD, ...BLUE, '#ffffff'],
    speed: 380,
    size: 5,
    life: 1.1,
    gravity: 260,
  });
  hideModal();
  refresh();
  persist();
  checkAchievements();

  // Перезапуск — единственный момент, когда игрок сам вышел из цикла:
  // прервать его здесь не обидно. Кулдаун обёртка держит сама. Купившим
  // «без рекламы» интерстишл вообще не показываем.
  if (!noAdsPurchased) {
    const res = await yg.interstitial();
    if (res.shown) metrics.send('ad_interstitial_shown', { placement: 'prestige' });
  }

  await offerRetentionPrompts();
}

async function offerRetentionPrompts(): Promise<void> {
  // Ярлык предлагаем после первого перезапуска: к этому моменту игрок точно
  // втянулся, а idle-игра без возвратов не имеет смысла.
  if (prestigeCount === 1) {
    metrics.send('shortcut_offer');
    if (await yg.promptShortcut()) metrics.send('shortcut_accepted');
    return;
  }
  if (prestigeCount === 3) {
    metrics.send('review_offer');
    await yg.requestReview();
  }
}

function showPause(): void {
  pauseOpen = true;
  sfx.play('click');
  showModal({
    title: t('pauseTitle'),
    text: `${t('energy')}: ${formatShort(economy.lifetime)}`,
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
  row.className = 'item';
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
    refresh();
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
          const mailBody = `${t('title')} — ${t('energy')}: ${formatShort(economy.lifetime)}\n\n`;
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
      formatScore: (n) => formatShort(n),
    }),
    actions,
    dismissible: true,
  });
}

async function submitScore(): Promise<void> {
  if (economy.lifetime < 1) return;
  // Лидерборд принимает целые числа, а энергия дробная.
  await yg.submitScore(LEADERBOARD, Math.floor(economy.lifetime));
}

// ── офлайн ─────────────────────────────────────────────────────────────────

function showOfflineReward(secondsAway: number): void {
  const { seconds, amount } = economy.offlineEarnings(secondsAway);
  if (amount < OFFLINE_MIN_AMOUNT) return;

  metrics.send('offline_return', { seconds: Math.round(seconds), amount: Math.round(amount) });

  const collect = (multiplier: number): void => {
    economy.collect(amount * multiplier);
    offlineCollected = true;
    sfx.play(multiplier > 1 ? 'reward' : 'click');
    hideModal();
    refresh();
    persist();
    checkAchievements();
    void submitScore();
  };

  showModal({
    title: t('offlineTitle'),
    result: formatShort(amount),
    text: t('offlineText', {
      time: formatDuration(seconds, i18n.current === 'en' ? { h: 'h', m: 'm', s: 's' } : undefined),
    }),
    actions: [
      {
        label: t('offlineDouble'),
        kind: 'reward',
        onClick: async () => {
          metrics.send('ad_rewarded_offer', { placement: 'offline' });
          const res = await yg.rewarded();
          if (!res.rewarded) {
            metrics.send('ad_rewarded_declined', { placement: 'offline' });
            return;
          }
          metrics.send('ad_rewarded_shown', { placement: 'offline' });
          collect(2);
        },
      },
      { label: t('offlineCollect'), kind: 'ghost', onClick: () => collect(1) },
    ],
  });
}

// ── отрисовка интерфейса ───────────────────────────────────────────────────

function applyStaticLabels(): void {
  document.documentElement.lang = i18n.current;
  document.title = t('title');
  $<HTMLElement>('label-stardust').textContent = t('stardust');
  tabShopBtn.textContent = t('tabShop');
  tabPerksBtn.textContent = t('tabPerks');
  leadersBtn.setAttribute('aria-label', t('leaders'));
  soundBtn.setAttribute('aria-label', t('sound'));
  helpBtn.setAttribute('aria-label', t('help'));
  const loaderTitle = loaderEl.querySelector('.loader-title');
  if (loaderTitle) loaderTitle.textContent = t('title');
}

function refresh(): void {
  energyEl.textContent = formatShort(economy.energy);
  rateEl.textContent = t('perSecond', { value: formatShort(economy.perSecond) });
  perClickEl.textContent = t('perClick', { value: formatShort(economy.perClick) });

  stardustBox.hidden = economy.stardust <= 0;
  stardustEl.textContent = formatShort(economy.stardust);

  const boostLeft = economy.boostSecondsLeft;
  const frenzyLeft = economy.frenzySecondsLeft;
  boostEl.hidden = boostLeft <= 0 && frenzyLeft <= 0;
  if (frenzyLeft > 0) {
    boostEl.textContent = t('boostActive', { mult: FRENZY_MULTIPLIER, time: `${frenzyLeft}s` });
  } else if (boostLeft > 0) {
    boostEl.textContent = t('boostActive', {
      mult: economy.boostMultiplier,
      time: formatDuration(boostLeft, i18n.current === 'en' ? { h: 'h', m: 'm', s: 's' } : undefined),
    });
  }

  rows.forEach((row, index) => {
    const cost = economy.costOf(index);
    const owned = economy.owned[index] ?? 0;
    row.name.textContent = t(GENERATOR_NAME_KEYS[index] ?? 'genPanel');
    row.sub.textContent = t('perSecond', {
      value: formatShort((GENERATORS[index]?.rate ?? 0) * economy.prestigeMultiplier),
    });
    row.cost.textContent = formatShort(cost);
    row.count.textContent = owned > 0 ? t('owned', { count: owned }) : '';
    row.root.disabled = !economy.canBuy(index);
  });

  if (clickRow) {
    clickRow.name.textContent = t('clickUpgrade');
    clickRow.sub.textContent = t('perClick', { value: formatShort(economy.perClick) });
    clickRow.cost.textContent = formatShort(economy.clickUpgradeCost);
    clickRow.count.textContent = t('level', { level: economy.clickLevel });
    clickRow.root.disabled = economy.energy < economy.clickUpgradeCost;
  }

  // Без пыли все перки выглядят одинаково задизейбленными без объяснений —
  // это читается как «сломано», хотя это просто ещё не открытая механика.
  perkLockedHintEl.hidden = economy.stardust > 0;
  if (economy.stardust <= 0) {
    perkLockedHintEl.textContent = t('perkLockedHint', { amount: formatShort(PRESTIGE_THRESHOLD) });
  }

  perkRows.forEach((row, index) => {
    const def = PERKS[index];
    const level = economy.perkLevels[index] ?? 0;
    const maxed = def ? level >= def.maxLevel : false;

    row.name.textContent = t(PERK_NAME_KEYS[index] ?? 'perkClickPower');
    row.sub.textContent = t(PERK_DESC_KEYS[index] ?? 'perkClickPowerDesc');
    row.count.textContent = level > 0 ? t('level', { level }) : '';

    if (maxed) {
      row.cost.textContent = '';
      row.cost.className = 'perk-max';
      row.cost.textContent = t('perkMax');
      row.root.disabled = true;
    } else {
      row.cost.className = 'cost-stardust';
      row.cost.textContent = formatShort(economy.perkCost(index));
      row.root.disabled = !economy.canBuyPerk(index);
    }
  });

  boostBtn.textContent =
    boostLeft > 0
      ? t('boost', { mult: BOOST_MULTIPLIER })
      : t('boostOffer', { mult: BOOST_MULTIPLIER, minutes: BOOST_SECONDS / 60 });
  boostBtn.disabled = boostLeft > 0;

  const gain = economy.pendingStardust;
  prestigeBtn.disabled = gain <= 0;
  prestigeBtn.textContent =
    gain > 0
      ? `${t('prestige')} +${formatShort(gain)}`
      : t('prestigeLocked', { amount: formatShort(PRESTIGE_THRESHOLD) });

  soundBtn.textContent = muted ? '🔇' : '🔊';
}

// ── сохранение ─────────────────────────────────────────────────────────────

function persist(): void {
  yg.save({
    ...economy.serialize(muted),
    achievements: achievements.unlockedIds,
    meteorsCaught,
    offlineCollected,
    totalPrestiges,
  });
}

/** Проверяет условия достижений и показывает тост на каждое новое. */
function checkAchievements(): void {
  const anyPerkMaxed = PERKS.some((def, i) => (economy.perkLevels[i] ?? 0) >= def.maxLevel);
  const candidates: Array<[string, boolean]> = [
    ['first_prestige', totalPrestiges >= 1],
    ['five_prestige', totalPrestiges >= 5],
    ['meteor_hunter', meteorsCaught >= 20],
    ['max_perk', anyPerkMaxed],
    ['billionaire', economy.lifetime >= 1e9],
    ['offline_return', offlineCollected],
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

let sinceRefresh = 0;
let sinceSave = 0;
let meteorAge = 0;

const loop = new Loop(
  (dt) => {
    economy.tick(dt);

    // Текст обновляем 10 раз в секунду: чаще — лишняя работа для верстки,
    // реже — цифры начинают «дёргаться».
    sinceRefresh += dt;
    if (sinceRefresh >= 0.1) {
      sinceRefresh = 0;
      refresh();
    }

    sinceSave += dt;
    if (sinceSave >= 5) {
      sinceSave = 0;
      persist();
    }

    backdrop.update(dt);
    particles.update(dt);
    rings.update(dt);
    shake.update(dt);

    meteorConfig.frequencyBonus = economy.meteorFrequencyBonus;
    meteor.update(dt, fxStage.viewport.width, fxStage.viewport.height);
    meteorAge += dt;
  },
  () => {
    fxStage.clearTransparent();
    shake.apply(fxStage.ctx);
    particles.draw(fxStage.ctx);
    rings.draw(fxStage.ctx);
    if (meteor.current) drawMeteor(meteor.current, fxStage.ctx, meteorAge);
    fxStage.ctx.restore();

    // Тряска экрана: применяем и к реальному интерфейсу, не только к канвасу
    // эффектов, иначе крупный толчок будет заметен только за пределами кнопок.
    appEl.style.transform =
      shake.offsetX || shake.offsetY ? `translate(${shake.offsetX}px, ${shake.offsetY}px)` : '';
  },
);

// ── ввод ───────────────────────────────────────────────────────────────────

reactorBtn.addEventListener('pointerdown', tap);
boostBtn.onclick = () => void requestBoost();
prestigeBtn.onclick = () => askPrestige();
leadersBtn.onclick = () => void showLeaders();
helpBtn.onclick = () => showHelp();
tabShopBtn.onclick = () => switchTab('shop');
tabPerksBtn.onclick = () => switchTab('perks');

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (pauseOpen) closePause();
  else if (!isModalOpen()) showPause();
});

// Метеорит ловится где угодно на экране, не только по канвасу: сам канвас
// прозрачен для кликов (см. .fx-layer), чтобы не перекрывать магазин. Слушатель
// висит на window, поэтому клик по кнопке в модалке тоже всплывает сюда —
// без проверки игрок мог бы поймать метеорит, просто закрывая паузу или магазин.
window.addEventListener('pointerdown', (e) => {
  if (isModalOpen()) return;
  handleMeteorHit(e.clientX, e.clientY);
});
soundBtn.onclick = () => {
  muted = !muted;
  sfx.setMuted(muted);
  sfx.play('click');
  refresh();
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

// Сейв обязан быть свежим на момент ухода: от `lastSeen` считается офлайн-доход,
// и устаревшая метка украла бы у игрока накопленное.
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

  const saved = await yg.load<
    Partial<SaveData> & {
      achievements?: unknown;
      meteorsCaught?: unknown;
      offlineCollected?: unknown;
      totalPrestiges?: unknown;
    }
  >({});
  muted = saved.muted === true;
  sfx.setMuted(muted);

  const savedAchievements = Array.isArray(saved.achievements)
    ? saved.achievements.filter((x): x is string => typeof x === 'string')
    : [];
  achievements = new Achievements(achievementsFor(i18n.current), savedAchievements);
  meteorsCaught = typeof saved.meteorsCaught === 'number' ? saved.meteorsCaught : 0;
  offlineCollected = saved.offlineCollected === true;
  totalPrestiges = typeof saved.totalPrestiges === 'number' ? saved.totalPrestiges : 0;
  noAdsPurchased = await yg.hasPurchase(NO_ADS_PRODUCT);

  let secondsAway = economy.deserialize(saved);

  // Офлайн-доход иначе не проверить: ждать два часа между запусками нельзя, а
  // подменить сейв снаружи мешает дописывание при уходе со страницы. В релизной
  // сборке ветка вырезается вместе с `import.meta.env.DEV`.
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(location.search);
    const away = Number(params.get('away'));
    if (Number.isFinite(away) && away > 0) secondsAway = away;

    // Ждать 45 секунд между прогонами теста метеорита неудобно — форсируем.
    const meteorKind = params.get('meteor');
    if (meteorKind === 'energy' || meteorKind === 'boost' || meteorKind === 'frenzy') {
      setTimeout(() => meteor.forceSpawn(fxStage.viewport.width, fxStage.viewport.height, meteorKind), 300);
    }

    // Первый перезапуск требует 1 млн энергии — новому игроку до перков и
    // прогресса пришлось бы копить час. Даём выдать пыль/энергию напрямую.
    const giveStardust = Number(params.get('stardust'));
    if (Number.isFinite(giveStardust) && giveStardust > 0) economy.stardust += giveStardust;
    const giveEnergy = Number(params.get('energy'));
    if (Number.isFinite(giveEnergy) && giveEnergy > 0) {
      economy.energy += giveEnergy;
      economy.totalEarned = Math.max(economy.totalEarned, economy.energy);
    }

    // Прямой доступ для проверок из консоли — только в дев-сборке.
    Object.assign(window, { __debug: { economy, meteor, fxStage, achievements } });
  }

  buildShop();
  buildPerks();
  refresh();
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
    metrics.send('game_start', { returning: secondsAway !== null });

    if (secondsAway !== null && secondsAway > 60) showOfflineReward(secondsAway);
  };

  requestAnimationFrame(reveal);
  setTimeout(reveal, 1000);
}

void boot();
