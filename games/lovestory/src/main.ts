/**
 * Клуб Свиданий — визуальная новелла с энергией и подарками.
 *
 * Хаб (список персонажей, магазин подарков, достижения) — модалки, как меню
 * во всех играх студии. Сама сцена диалога — канвас (портрет + фон) с DOM-окном
 * текста поверх: печатная машинка ведётся игровым циклом, тап по полю
 * долистывает реплику или пропускает набор текста.
 */

import {
  Achievements,
  Loop,
  Particles,
  SUPPORT_EMAIL,
  Sfx,
  Stage,
  buildAchievementList,
  buildLeaderList,
  formatDuration,
  hideModal,
  isModalOpen,
  metrics,
  openMailFeedback,
  showAchievementToast,
  showModal,
  type AchievementDef,
  type ModalAction,
} from '@yg/engine';
import { yg } from '@yg/ysdk';
import { CHARACTERS, type CharacterDef, type CharacterId } from './characters';
import { createI18n } from './i18n';
import { drawPortrait } from './portrait';
import { drawScene } from './scene';
import { chaptersFor, type Chapter, type Choice, type DialogueLine, type DialogueNode, type Expression } from './story';

const LEADERBOARD = 'totalHearts';
const NO_ADS_PRODUCT = 'no_ads';
const MAX_ENERGY = 5;
const ENERGY_REGEN_MS = 20 * 60 * 1000;
const TYPE_CPS = 40;

interface GiftDef {
  id: string;
  icon: string;
  nameKey: 'giftCoffee' | 'giftFlowers' | 'giftPresent';
  cost: number;
  delta: number;
}

const GIFTS: readonly GiftDef[] = [
  { id: 'coffee', icon: '☕', nameKey: 'giftCoffee', cost: 20, delta: 3 },
  { id: 'flowers', icon: '💐', nameKey: 'giftFlowers', cost: 45, delta: 6 },
  { id: 'present', icon: '🎁', nameKey: 'giftPresent', cost: 90, delta: 12 },
];

const RELATIONSHIP_TIERS: ReadonlyArray<{ min: number; key: 'tierStranger' | 'tierAcquaintance' | 'tierSympathy' | 'tierCrush' | 'tierRomance' }> = [
  { min: 0, key: 'tierStranger' },
  { min: 20, key: 'tierAcquaintance' },
  { min: 40, key: 'tierSympathy' },
  { min: 60, key: 'tierCrush' },
  { min: 80, key: 'tierRomance' },
];

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'first_chapter', icon: '📖', name: 'Первая глава', desc: 'Прошли первую главу истории' },
  { id: 'sympathy', icon: '💗', name: 'Симпатия', desc: 'Отношения с персонажем достигли уровня «Симпатия»' },
  { id: 'romance', icon: '💞', name: 'Роман', desc: 'Отношения с персонажем достигли уровня «Роман»' },
  { id: 'gift_giver', icon: '🎁', name: 'Даритель', desc: 'Подарили 5 подарков' },
  { id: 'completionist', icon: '⭐', name: 'До последней главы', desc: 'Прошли все доступные главы персонажа' },
];

// ── DOM ────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`нет элемента #${id}`);
  return el as T;
};

const boardEl = $<HTMLDivElement>('board');
const energyStatEl = $<HTMLDivElement>('energy-stat');
const energyEl = $<HTMLElement>('energy');
const coinsEl = $<HTMLElement>('coins');
const hubBtn = $<HTMLButtonElement>('hub');
const soundBtn = $<HTMLButtonElement>('sound');
const helpBtn = $<HTMLButtonElement>('help');
const loaderEl = $<HTMLDivElement>('loader');
const dialogueEl = $<HTMLDivElement>('dialogue');
const dlgNameEl = $<HTMLDivElement>('dlg-name');
const dlgTextEl = $<HTMLDivElement>('dlg-text');
const dlgChoicesEl = $<HTMLDivElement>('dlg-choices');
const dlgHintEl = $<HTMLDivElement>('dlg-hint');

const sfx = new Sfx();
const i18n = createI18n(navigator.language);
const t = i18n.t.bind(i18n);

const stage = new Stage(boardEl, () => {
  /* фон и портрет считаются от текущего viewport на каждом кадре, пересчёт не нужен */
});

// ── состояние ──────────────────────────────────────────────────────────────

let energy = MAX_ENERGY;
let lastEnergyTs = Date.now();
let coins = 0;
let relationships: Record<CharacterId, number> = { artem: 0, daniil: 0, ruslan: 0, lev: 0, mark: 0 };
let completedChapters = new Set<string>();
let lastGiftDay: Partial<Record<CharacterId, string>> = {};
let totalGiftsGiven = 0;
let muted = false;
let noAdsPurchased = false;
let achievements: Achievements;

interface DialogueState {
  character: CharacterDef;
  chapter: Chapter;
  nodeId: string;
  lineIndex: number;
  expression: Expression;
  heartsGained: number;
}

let dlg: DialogueState | null = null;
let typing = false;
let typedChars = 0;
let fullText = '';
let bgPhase = 0;
let blinkTimer = 3;
let blinking = false;

/** Сердечки-отклик на выбор реплики — без них смена отношений проходит незаметно. */
const hearts = new Particles(60);

// ── энергия ────────────────────────────────────────────────────────────────

function currentEnergy(): number {
  if (energy >= MAX_ENERGY) return MAX_ENERGY;
  const elapsed = Date.now() - lastEnergyTs;
  const gained = Math.floor(elapsed / ENERGY_REGEN_MS);
  if (gained > 0) {
    energy = Math.min(MAX_ENERGY, energy + gained);
    lastEnergyTs += gained * ENERGY_REGEN_MS;
  }
  return energy;
}

function msToNextEnergy(): number {
  if (currentEnergy() >= MAX_ENERGY) return 0;
  return Math.max(0, ENERGY_REGEN_MS - (Date.now() - lastEnergyTs));
}

function spendEnergy(cost: number): boolean {
  if (currentEnergy() < cost) return false;
  const wasFull = energy >= MAX_ENERGY;
  energy -= cost;
  if (wasFull) lastEnergyTs = Date.now();
  return true;
}

// ── отношения ──────────────────────────────────────────────────────────────

function addRelationship(id: CharacterId, delta: number): void {
  relationships[id] = Math.max(0, Math.min(100, (relationships[id] ?? 0) + delta));
}

function tierFor(points: number): 'tierStranger' | 'tierAcquaintance' | 'tierSympathy' | 'tierCrush' | 'tierRomance' {
  let cur: (typeof RELATIONSHIP_TIERS)[number]['key'] = 'tierStranger';
  for (const tier of RELATIONSHIP_TIERS) if (points >= tier.min) cur = tier.key;
  return cur;
}

function nextChapterFor(id: CharacterId): Chapter | null {
  return chaptersFor(id).find((c) => !completedChapters.has(c.id)) ?? null;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── HUD ────────────────────────────────────────────────────────────────────

function applyStaticLabels(): void {
  document.documentElement.lang = i18n.current;
  document.title = t('title');
  soundBtn.setAttribute('aria-label', t('sound'));
  helpBtn.setAttribute('aria-label', t('help'));
  hubBtn.textContent = `💌 ${t('hubButton')}`;
}

function syncHud(): void {
  const cur = currentEnergy();
  energyEl.textContent = `${cur}/${MAX_ENERGY}`;
  energyStatEl.classList.toggle('low', cur === 0);
  coinsEl.textContent = i18n.num(coins);
  soundBtn.textContent = muted ? '🔇' : '🔊';
}

function persist(): void {
  yg.save({
    energy,
    lastEnergyTs,
    coins,
    relationships,
    completedChapters: [...completedChapters],
    lastGiftDay,
    totalGiftsGiven,
    muted,
    achievements: achievements.unlockedIds,
  });
}

function checkAchievements(): void {
  const maxRelationship = Math.max(0, ...Object.values(relationships));
  const allDone = CHARACTERS.filter((c) => c.available && chaptersFor(c.id).length > 0).every((c) =>
    chaptersFor(c.id).every((ch) => completedChapters.has(ch.id)),
  );
  const candidates: Array<[string, boolean]> = [
    ['first_chapter', completedChapters.size >= 1],
    ['sympathy', maxRelationship >= 40],
    ['romance', maxRelationship >= 80],
    ['gift_giver', totalGiftsGiven >= 5],
    ['completionist', allDone],
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

// ── хаб ────────────────────────────────────────────────────────────────────

function showHub(): void {
  currentEnergy();
  const list = document.createElement('div');
  list.className = 'char-list';
  for (const c of CHARACTERS) list.appendChild(characterCard(c));

  showModal({
    title: t('title'),
    text: t('hubSubtitle'),
    body: list,
    actions: [
      { label: t('giftShop'), kind: 'ghost', onClick: showGiftShop },
      { label: t('achievements'), kind: 'ghost', onClick: showAchievements },
      { label: t('leaders'), kind: 'ghost', onClick: () => void showLeaders() },
      { label: t('menuSettings'), kind: 'ghost', onClick: () => showSettings(showHub) },
      { label: t('help'), kind: 'ghost', onClick: showHelp },
    ],
  });
  syncHud();
}

function characterCard(c: CharacterDef): HTMLElement {
  const card = document.createElement('div');
  card.className = 'char-card' + (c.available ? '' : ' locked');

  const thumb = document.createElement('div');
  thumb.className = 'char-portrait-thumb';
  const canvas = document.createElement('canvas');
  canvas.width = 56;
  canvas.height = 56;
  const tctx = canvas.getContext('2d');
  if (tctx) drawThumbPortrait(tctx, c);
  thumb.appendChild(canvas);
  if (!c.available) {
    // Портрет виден, но затемнён — дразнит будущего персонажа, а не прячет его целиком.
    canvas.style.filter = 'grayscale(0.7) brightness(0.55)';
    const badge = document.createElement('div');
    badge.textContent = '🔒';
    badge.style.cssText =
      'position:absolute;inset:0;display:grid;place-items:center;font-size:18px;text-shadow:0 1px 3px rgba(0,0,0,0.6)';
    thumb.style.position = 'relative';
    thumb.appendChild(badge);
  }

  const info = document.createElement('div');
  info.className = 'char-info';
  const name = document.createElement('div');
  name.className = 'char-name';
  name.textContent = c.name;
  const tagline = document.createElement('div');
  tagline.className = 'char-tagline';
  tagline.textContent = c.tagline;
  info.append(name, tagline);

  if (c.available) {
    const points = relationships[c.id] ?? 0;
    const track = document.createElement('div');
    track.className = 'heart-bar-track';
    const fill = document.createElement('div');
    fill.className = 'heart-bar-fill';
    fill.style.width = `${points}%`;
    track.appendChild(fill);
    const tierLabel = document.createElement('div');
    tierLabel.className = 'heart-tier';
    tierLabel.textContent = `💗 ${t(tierFor(points))}`;
    info.append(track, tierLabel);
  }

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'char-action';

  if (!c.available) {
    action.textContent = t('locked');
    action.disabled = true;
  } else {
    const chapter = nextChapterFor(c.id);
    if (!chapter) {
      action.textContent = '✓';
      action.disabled = true;
      action.title = t('noChaptersYet');
    } else {
      action.textContent = t('play');
      action.onclick = () => onPlayChapter(c, chapter);
    }
  }

  card.append(thumb, info, action);
  return card;
}

function drawThumbPortrait(ctx: CanvasRenderingContext2D, c: CharacterDef): void {
  ctx.clearRect(0, 0, 56, 56);
  drawPortrait(ctx, 28, 32, 78, c, 'smile');
}

function onPlayChapter(c: CharacterDef, chapter: Chapter): void {
  currentEnergy();
  if (energy < chapter.energyCost) {
    showNotEnoughEnergy();
    return;
  }
  spendEnergy(chapter.energyCost);
  persist();
  hideModal();
  startChapter(c, chapter);
}

function showNotEnoughEnergy(): void {
  sfx.play('error');
  const wait = msToNextEnergy();
  showModal({
    title: t('notEnoughEnergy'),
    text: wait > 0 ? t('energyNext', { time: formatDuration(wait / 1000) }) : '',
    dismissible: true,
    onDismiss: showHub,
    actions: [
      {
        label: t('watchAdForEnergy'),
        kind: 'reward',
        onClick: async () => {
          metrics.send('ad_rewarded_offer', { placement: 'energy' });
          const res = await yg.rewarded();
          if (!res.rewarded) {
            metrics.send('ad_rewarded_declined', { placement: 'energy' });
            return;
          }
          metrics.send('ad_rewarded_shown', { placement: 'energy' });
          energy = MAX_ENERGY;
          persist();
          showHub();
        },
      },
      { label: t('close'), kind: 'ghost', onClick: showHub },
    ],
  });
}

// ── подарки ────────────────────────────────────────────────────────────────

function showGiftShop(): void {
  sfx.play('click');
  const list = document.createElement('div');
  list.className = 'shop-list';

  for (const c of CHARACTERS.filter((c) => c.available)) {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight:800;font-size:13px;color:var(--accent);margin:6px 0 2px;text-align:left';
    header.textContent = c.name;
    list.appendChild(header);

    const givenToday = lastGiftDay[c.id] === todayStr();
    for (const g of GIFTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-row';

      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = g.icon;

      const mid = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t(g.nameKey);
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = `+${g.delta} 💗`;
      mid.append(name, document.createElement('br'), sub);

      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = givenToday ? t('giftAlreadyToday') : String(g.cost);

      btn.append(icon, mid, cost);
      btn.disabled = givenToday || coins < g.cost;
      btn.onclick = () => giveGift(c, g);
      list.appendChild(btn);
    }
  }

  showModal({
    title: t('giftShopTitle'),
    text: t('giftShopHint'),
    result: `🪙 ${i18n.num(coins)}`,
    body: list,
    dismissible: true,
    onDismiss: showHub,
    actions: [{ label: t('back'), kind: 'ghost', onClick: showHub }],
  });
}

function giveGift(c: CharacterDef, g: GiftDef): void {
  if (lastGiftDay[c.id] === todayStr() || coins < g.cost) {
    sfx.play('error');
    return;
  }
  coins -= g.cost;
  lastGiftDay[c.id] = todayStr();
  totalGiftsGiven += 1;
  addRelationship(c.id, g.delta);
  sfx.play('reward');
  checkAchievements();
  persist();
  showGiftShop();
}

// ── диалог ─────────────────────────────────────────────────────────────────

function nodeOf(chapter: Chapter, id: string): DialogueNode {
  const node = chapter.nodes[id];
  if (!node) throw new Error(`неизвестный узел «${id}» в главе «${chapter.id}»`);
  return node;
}

function lineOf(node: DialogueNode, index: number): DialogueLine {
  const line = node.lines[index];
  if (!line) throw new Error(`нет реплики №${index} в узле «${node.id}»`);
  return line;
}

function nameFor(speaker: DialogueLine['speaker'], character: CharacterDef): string {
  if (speaker === 'narrator') return '';
  if (speaker === 'player') return t('you');
  return character.name;
}

function startChapter(character: CharacterDef, chapter: Chapter): void {
  dlg = { character, chapter, nodeId: chapter.startNode, lineIndex: 0, expression: 'neutral', heartsGained: 0 };
  dialogueEl.hidden = false;
  metrics.send('game_start', { chapter: chapter.id });
  playCurrentLine();
}

function playCurrentLine(): void {
  if (!dlg) return;
  const node = nodeOf(dlg.chapter, dlg.nodeId);
  const line = lineOf(node, dlg.lineIndex);

  if (line.speaker === dlg.character.id && line.expression) dlg.expression = line.expression;

  dlgNameEl.textContent = nameFor(line.speaker, dlg.character);
  dlgTextEl.classList.toggle('narrator', line.speaker === 'narrator');
  fullText = line.text;
  typedChars = 0;
  typing = true;
  dlgTextEl.textContent = '';
  dlgChoicesEl.hidden = true;
  dlgChoicesEl.replaceChildren();
  dlgHintEl.textContent = '';
}

function skipTyping(): void {
  typedChars = fullText.length;
  typing = false;
  dlgTextEl.textContent = fullText;
  onLineRevealed();
}

function onLineRevealed(): void {
  if (!dlg) return;
  const node = nodeOf(dlg.chapter, dlg.nodeId);
  const isLastLine = dlg.lineIndex >= node.lines.length - 1;
  if (isLastLine && node.choices) {
    showChoices(node.choices);
    return;
  }
  dlgHintEl.textContent = t('tapToContinue');
}

function showChoices(choices: readonly Choice[]): void {
  dlgChoicesEl.replaceChildren();
  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn';
    btn.textContent = choice.text;
    btn.onclick = () => pickChoice(choice);
    dlgChoicesEl.appendChild(btn);
  }
  dlgChoicesEl.hidden = false;
  dlgHintEl.textContent = '';
}

function pickChoice(choice: Choice): void {
  if (!dlg) return;
  sfx.play('click');
  dlg.heartsGained += choice.delta;
  addRelationship(dlg.character.id, choice.delta);
  spawnHeartFx(choice.delta);
  dlg.nodeId = choice.next;
  dlg.lineIndex = 0;
  dlgChoicesEl.hidden = true;
  playCurrentLine();
}

/** Сердечки над портретом + всплывающее число — иначе смена отношений от
 * выбора реплики проходит совершенно незаметно для игрока. */
function spawnHeartFx(delta: number): void {
  const { width, height } = stage.viewport;
  const x = width / 2;
  const y = height * 0.22;
  hearts.burst(x, y, {
    count: 6 + Math.min(10, delta),
    colors: ['#ff6fa5', '#ffd166', '#ff9fc4'],
    speed: 90,
    size: 4,
    life: 1.1,
    gravity: -140, // вверх, а не вниз — сердечки взлетают, а не падают
    direction: -Math.PI / 2,
    spread: Math.PI * 0.7,
  });
  sfx.play('reward');

  const popup = document.createElement('div');
  popup.textContent = `+${delta} 💗`;
  const rect = stage.canvas.getBoundingClientRect();
  popup.style.cssText = [
    'position:fixed',
    `left:${rect.left + rect.width / 2}px`,
    `top:${rect.top + rect.height * 0.22}px`,
    'transform:translate(-50%,-50%)',
    'z-index:60',
    'pointer-events:none',
    'font:800 20px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'color:#ff6fa5',
    'text-shadow:0 2px 8px rgba(0,0,0,0.5)',
    'opacity:0',
    'transition:transform 1s cubic-bezier(0.2,0.8,0.3,1), opacity 1s ease',
  ].join(';');
  document.body.appendChild(popup);
  requestAnimationFrame(() => {
    popup.style.opacity = '1';
    popup.style.transform = 'translate(-50%,-160%)';
  });
  setTimeout(() => {
    popup.style.opacity = '0';
  }, 700);
  setTimeout(() => popup.remove(), 1100);
}

function onBoardTap(): void {
  if (!dlg) return;
  if (typing) {
    skipTyping();
    return;
  }
  const node = nodeOf(dlg.chapter, dlg.nodeId);
  if (dlg.lineIndex < node.lines.length - 1) {
    dlg.lineIndex += 1;
    playCurrentLine();
    return;
  }
  if (node.choices) return; // ждём клика по варианту
  if (node.next) {
    dlg.nodeId = node.next;
    dlg.lineIndex = 0;
    playCurrentLine();
    return;
  }
  finishChapter();
}

function finishChapter(): void {
  if (!dlg) return;
  const { chapter, heartsGained } = dlg;
  completedChapters.add(chapter.id);
  coins += chapter.coinReward;
  dlg = null;
  dialogueEl.hidden = true;
  checkAchievements();
  void submitScore();
  persist();
  syncHud();
  sfx.play('win');
  showModal({
    title: t('chapterEndTitle'),
    text: `${t('chapterEndHearts', { n: heartsGained })} · ${t('chapterEndCoins', { n: chapter.coinReward })}`,
    actions: [{ label: t('backToHub'), onClick: showHub }],
  });
}

function exitToHub(): void {
  sfx.play('click');
  if (dlg) {
    dlg = null;
    dialogueEl.hidden = true;
  }
  showHub();
}

// ── достижения, лидеры, помощь, настройки ────────────────────────────────

function showAchievements(): void {
  sfx.play('click');
  const { done, total } = achievements.progress;
  showModal({
    title: `${t('achievementsTitle')} (${done}/${total})`,
    body: buildAchievementList(achievements.all, achievements.unlockedIds),
    dismissible: true,
    onDismiss: showHub,
    actions: [{ label: t('back'), kind: 'ghost', onClick: showHub }],
  });
}

async function submitScore(): Promise<void> {
  const total = Object.values(relationships).reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  await yg.submitScore(LEADERBOARD, total);
}

async function showLeaders(): Promise<void> {
  sfx.play('click');
  showModal({ title: t('leaders'), text: '…', dismissible: true, onDismiss: showHub, actions: [{ label: t('back'), kind: 'ghost', onClick: showHub }] });

  const data = await yg.topScores(LEADERBOARD, 10);
  const entries =
    data?.entries.map((e) => ({
      rank: e.rank,
      score: e.score,
      name: e.player.publicName,
      isMe: e.rank === data.userRank && data.userRank > 0,
    })) ?? [];

  const actions: ModalAction[] = [{ label: t('back'), kind: 'ghost', onClick: showHub }];
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
    onDismiss: showHub,
  });
}

function showHelp(): void {
  sfx.play('click');
  const body = document.createElement('div');
  for (const key of ['helpRules1', 'helpRules2', 'helpRules3', 'helpRules4'] as const) {
    const p = document.createElement('p');
    p.style.textAlign = 'left';
    p.textContent = t(key);
    body.appendChild(p);
  }
  showModal({
    title: t('helpTitle'),
    body,
    dismissible: true,
    onDismiss: showHub,
    actions: [
      {
        label: noAdsPurchased ? t('iapNoAdsOwned') : t('iapNoAds'),
        kind: 'ghost',
        onClick: noAdsPurchased ? showHub : () => void buyNoAds(),
      },
      {
        label: t('helpFeedback'),
        kind: 'ghost',
        onClick: () => openMailFeedback(SUPPORT_EMAIL, t('helpFeedbackSubject'), `${t('title')}\n\n`),
      },
      { label: t('close'), onClick: showHub },
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

// ── ввод и цикл ────────────────────────────────────────────────────────────

// Обычный click, а не `Input` с перехватом указателя: захват указателя на
// `#board` не даёт кликам по вложенным кнопкам выбора (`#dlg-choices`)
// доходить до их собственных обработчиков — они тоже дети `#board`.
boardEl.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.choice-btn')) return;
  onBoardTap();
});

hubBtn.onclick = () => exitToHub();
soundBtn.onclick = () => {
  muted = !muted;
  sfx.setMuted(muted);
  sfx.play('click');
  syncHud();
  persist();
};
helpBtn.onclick = () => showHelp();

function updateFrame(dt: number): void {
  bgPhase += dt;
  hearts.update(dt);

  blinkTimer -= dt;
  if (blinkTimer <= 0) {
    blinking = !blinking;
    blinkTimer = blinking ? 0.12 : 2 + Math.random() * 3;
  }

  if (typing) {
    typedChars += dt * TYPE_CPS;
    const shown = Math.min(fullText.length, Math.floor(typedChars));
    dlgTextEl.textContent = fullText.slice(0, shown);
    if (shown >= fullText.length) {
      typing = false;
      onLineRevealed();
    }
  }

  if (!isModalOpen()) syncHud();
}

const loop = new Loop(updateFrame, () => {
  drawScene(
    stage.ctx,
    stage.viewport.width,
    stage.viewport.height,
    bgPhase,
    dlg?.character ?? null,
    dlg?.expression ?? 'neutral',
    blinking,
    dlg?.chapter.location ?? 'hallway',
  );
  hearts.draw(stage.ctx);
});

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
  // `typeof NaN === 'number'` — сейв с испорченным числом (NaN) иначе прошёл бы
  // проверку и намертво сломал сравнения на расход энергии (`NaN >= cost`
  // всегда `false`), давая бесконечную бесплатную энергию.
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  energy = num(saved.energy, MAX_ENERGY);
  lastEnergyTs = num(saved.lastEnergyTs, Date.now());
  coins = num(saved.coins, 0);
  totalGiftsGiven = num(saved.totalGiftsGiven, 0);

  const savedRel = saved.relationships as Partial<Record<CharacterId, number>> | undefined;
  relationships = {
    artem: savedRel?.artem ?? 0,
    daniil: savedRel?.daniil ?? 0,
    ruslan: savedRel?.ruslan ?? 0,
    lev: savedRel?.lev ?? 0,
    mark: savedRel?.mark ?? 0,
  };
  completedChapters = new Set(Array.isArray(saved.completedChapters) ? (saved.completedChapters as string[]) : []);
  lastGiftDay = (saved.lastGiftDay as Partial<Record<CharacterId, string>> | undefined) ?? {};

  noAdsPurchased = await yg.hasPurchase(NO_ADS_PRODUCT);
  achievements = new Achievements(
    ACHIEVEMENT_DEFS,
    Array.isArray(saved.achievements) ? (saved.achievements as string[]) : [],
  );

  loop.start();
  showHub();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __debug: {
        CHARACTERS,
        /** Рисует портрет+фон на отдельном канвасе — без запуска реальной сцены/DOM. Для магазинных скриншотов. */
        renderPreview(width: number, height: number, characterId: CharacterId, expression: Expression, location: Chapter['location']): HTMLCanvasElement {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          const character = CHARACTERS.find((c) => c.id === characterId) ?? null;
          if (ctx && character) drawScene(ctx, width, height, 0, character, expression, false, location);
          return canvas;
        },
      },
    });
  }

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
