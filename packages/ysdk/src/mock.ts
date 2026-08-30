/**
 * Мок Yandex Games SDK для локальной разработки.
 *
 * Задача мока — не «заглушить», а честно воспроизвести поведение платформы:
 * реклама действительно занимает экран и время, сейвы действительно переживают
 * перезагрузку, лидерборд действительно ранжирует. Иначе баги в паузе/мьюте
 * находятся только после публикации.
 */

import type {
  LeaderboardEntries,
  LeaderboardEntry,
  YaCatalogProduct,
  YaLeaderboards,
  YaPayments,
  YaPlayer,
  YaPurchase,
  YaSDK,
} from './types';

const LS_PREFIX = 'ygmock:';

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* приватный режим — молча теряем, как и настоящая платформа при quota */
  }
}

/** Полноэкранная плашка, имитирующая рекламный блок. */
function showAdOverlay(title: string, seconds: number, skippable: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'background:#0b0d12',
      'color:#e8ecf4',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:16px',
      'font:600 18px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'user-select:none',
    ].join(';');

    const label = document.createElement('div');
    label.textContent = title;
    label.style.cssText = 'font-size:22px;letter-spacing:.02em';

    const timer = document.createElement('div');
    timer.style.cssText = 'font-size:15px;font-weight:400;opacity:.65';

    const hint = document.createElement('div');
    hint.textContent = 'МОК-РЕКЛАМА · локальная разработка';
    hint.style.cssText =
      'position:absolute;bottom:20px;font:400 12px system-ui;opacity:.35;letter-spacing:.08em';

    const btn = document.createElement('button');
    btn.style.cssText = [
      'margin-top:8px',
      'padding:10px 22px',
      'border-radius:10px',
      'border:1px solid rgba(232,236,244,.25)',
      'background:transparent',
      'color:inherit',
      'font:600 15px system-ui',
      'cursor:pointer',
    ].join(';');

    root.append(label, timer, btn, hint);
    document.body.appendChild(root);

    let left = seconds;
    let closed = false;

    const finish = (completed: boolean): void => {
      if (closed) return;
      closed = true;
      clearInterval(iv);
      root.remove();
      resolve(completed);
    };

    const render = (): void => {
      timer.textContent = left > 0 ? `Осталось ${left} с` : 'Готово';
      if (left > 0) {
        btn.textContent = skippable ? `Закрыть (${left})` : `Подождите ${left}`;
        btn.disabled = !skippable;
        btn.style.opacity = skippable ? '1' : '.35';
      } else {
        btn.textContent = 'Закрыть';
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    };

    btn.onclick = () => finish(left <= 0);
    render();

    const iv = setInterval(() => {
      left -= 1;
      render();
      if (left <= 0) {
        clearInterval(iv);
        // Небольшая пауза, чтобы было видно состояние «досмотрено».
        setTimeout(() => finish(true), 400);
      }
    }, 1000);
  });
}

function makeMockPlayer(): YaPlayer {
  const authorized = lsGet<boolean>('authorized', false);
  return {
    getMode: () => (authorized ? '' : 'lite'),
    getName: () => (authorized ? 'Локальный игрок' : ''),
    getPhoto: () => '',
    getUniqueID: () => lsGet<string>('uid', 'local-dev-user'),
    async getData(keys?: string[]) {
      const all = lsGet<Record<string, unknown>>('data', {});
      if (!keys) return all;
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in all) out[k] = all[k];
      return out;
    },
    async setData(data: Record<string, unknown>) {
      const all = lsGet<Record<string, unknown>>('data', {});
      lsSet('data', { ...all, ...data });
    },
    async getStats(keys?: string[]) {
      const all = lsGet<Record<string, number>>('stats', {});
      if (!keys) return all;
      const out: Record<string, number> = {};
      for (const k of keys) if (k in all) out[k] = all[k] as number;
      return out;
    },
    async setStats(stats: Record<string, number>) {
      lsSet('stats', { ...lsGet<Record<string, number>>('stats', {}), ...stats });
    },
    async incrementStats(inc: Record<string, number>) {
      const all = lsGet<Record<string, number>>('stats', {});
      for (const [k, v] of Object.entries(inc)) all[k] = (all[k] ?? 0) + v;
      lsSet('stats', all);
      return all;
    },
  };
}

function makeMockLeaderboards(): YaLeaderboards {
  type Row = { name: string; score: number; extraData?: string };

  const readBoard = (board: string): Row[] => {
    const stored = lsGet<Row[] | null>(`lb:${board}`, null);
    if (stored) return stored;
    // Правдоподобные боты, чтобы верстка таблицы проверялась на реальных данных.
    const bots: Row[] = [
      { name: 'Игорь', score: 24_580 },
      { name: 'Marina', score: 19_204 },
      { name: 'kot_v_meshke', score: 15_760 },
      { name: 'Пётр', score: 11_032 },
      { name: 'Alya', score: 8_890 },
      { name: 'nagibator2007', score: 6_120 },
      { name: 'Света', score: 4_408 },
      { name: 'quiet_fox', score: 2_960 },
    ];
    lsSet(`lb:${board}`, bots);
    return bots;
  };

  const toEntry = (row: Row, rank: number): LeaderboardEntry => ({
    score: row.score,
    ...(row.extraData !== undefined ? { extraData: row.extraData } : {}),
    rank,
    player: {
      getAvatarSrc: () => '',
      publicName: row.name,
      uniqueID: `mock-${row.name}`,
    },
  });

  return {
    async setLeaderboardScore(board: string, score: number, extraData?: string) {
      const rows = readBoard(board).filter((r) => r.name !== 'Вы');
      const mine = lsGet<Row | null>(`lb:${board}:me`, null);
      if (!mine || score > mine.score) {
        lsSet(`lb:${board}:me`, {
          name: 'Вы',
          score,
          ...(extraData !== undefined ? { extraData } : {}),
        });
      }
      lsSet(`lb:${board}`, rows);
    },
    async getLeaderboardEntries(board: string, opts): Promise<LeaderboardEntries> {
      const rows = [...readBoard(board)];
      const mine = lsGet<Row | null>(`lb:${board}:me`, null);
      if (mine) rows.push(mine);
      rows.sort((a, b) => b.score - a.score);

      const top = opts?.quantityTop ?? 10;
      const entries = rows.slice(0, top).map((r, i) => toEntry(r, i + 1));
      const userRank = mine ? rows.findIndex((r) => r.name === 'Вы') + 1 : 0;

      return {
        leaderboard: { name: board },
        ranges: [{ start: 0, size: entries.length }],
        userRank,
        entries,
      };
    },
    async getLeaderboardPlayerEntry(board: string): Promise<LeaderboardEntry> {
      const mine = lsGet<Row | null>(`lb:${board}:me`, null);
      if (!mine) throw new Error('FetchError: player is not present in leaderboard');
      const rows = [...readBoard(board), mine].sort((a, b) => b.score - a.score);
      return toEntry(mine, rows.findIndex((r) => r.name === 'Вы') + 1);
    },
  };
}

function makeMockPayments(): YaPayments {
  const catalog: YaCatalogProduct[] = [
    {
      id: 'no_ads',
      title: 'Отключить рекламу',
      description: 'Убирает полноэкранную рекламу навсегда',
      imageURI: '',
      price: '99 YAN',
      priceValue: '99',
      priceCurrencyCode: 'YAN',
      getPriceCurrencyImage: () => '',
    },
    {
      id: 'coins_small',
      title: 'Горсть монет',
      description: '500 монет',
      imageURI: '',
      price: '25 YAN',
      priceValue: '25',
      priceCurrencyCode: 'YAN',
      getPriceCurrencyImage: () => '',
    },
  ];

  return {
    async getCatalog() {
      return catalog;
    },
    async purchase({ id, developerPayload }) {
      const ok = confirm(`[МОК] Купить «${id}»?`);
      if (!ok) throw new Error('purchase cancelled by user');
      const purchase: YaPurchase = {
        productID: id,
        purchaseToken: `mock-token-${id}-${String(performance.now() | 0)}`,
        ...(developerPayload !== undefined ? { developerPayload } : {}),
      };
      const all = lsGet<YaPurchase[]>('purchases', []);
      all.push(purchase);
      lsSet('purchases', all);
      return purchase;
    },
    async getPurchases() {
      return lsGet<YaPurchase[]>('purchases', []);
    },
    async consumePurchase(token: string) {
      lsSet(
        'purchases',
        lsGet<YaPurchase[]>('purchases', []).filter((p) => p.purchaseToken !== token),
      );
    },
  };
}

/** Собирает объект, совместимый по форме с настоящим `ysdk`. */
export function createMockSdk(): YaSDK {
  const player = makeMockPlayer();
  const leaderboards = makeMockLeaderboards();
  const payments = makeMockPayments();

  const log = (...args: unknown[]): void => console.info('%c[ysdk-mock]', 'color:#7aa2f7', ...args);

  return {
    adv: {
      showFullscreenAdv({ callbacks }) {
        log('showFullscreenAdv');
        callbacks?.onOpen?.();
        void showAdOverlay('Реклама', 5, true).then((completed) => {
          callbacks?.onClose?.(completed);
        });
      },
      showRewardedVideo({ callbacks }) {
        log('showRewardedVideo');
        callbacks?.onOpen?.();
        void showAdOverlay('Реклама за награду', 8, false).then((completed) => {
          if (completed) callbacks?.onRewarded?.();
          callbacks?.onClose?.(completed);
        });
      },
      async getBannerAdvStatus() {
        return { stickyAdvIsShowing: lsGet<boolean>('banner', false) };
      },
      async showBannerAdv() {
        lsSet('banner', true);
        log('showBannerAdv');
        return { stickyAdvIsShowing: true };
      },
      async hideBannerAdv() {
        lsSet('banner', false);
        log('hideBannerAdv');
        return { stickyAdvIsShowing: false };
      },
    },
    environment: {
      app: { id: 'mock-app' },
      browser: { lang: 'ru' },
      // Локаль подменяется через `?lang=en`: иначе перевод невозможно проверить,
      // не переключая язык всей системы.
      i18n: {
        lang: new URLSearchParams(location.search).get('lang') ?? 'ru',
        tld: 'ru',
      },
      payload: new URLSearchParams(location.search).get('payload'),
    },
    deviceInfo: {
      type: 'desktop',
      isMobile: () => matchMedia('(pointer:coarse)').matches,
      isDesktop: () => !matchMedia('(pointer:coarse)').matches,
      isTablet: () => false,
      isTV: () => false,
    },
    features: {
      LoadingAPI: { ready: () => log('LoadingAPI.ready()') },
      GameplayAPI: {
        start: () => log('GameplayAPI.start()'),
        stop: () => log('GameplayAPI.stop()'),
      },
    },
    feedback: {
      async canReview() {
        return { value: true };
      },
      async requestReview() {
        const sent = confirm('[МОК] Оставить отзыв об игре?');
        return { feedbackSent: sent };
      },
    },
    shortcut: {
      async canShowPrompt() {
        return { canShow: true };
      },
      async showPrompt() {
        const ok = confirm('[МОК] Добавить ярлык игры на рабочий стол?');
        return { outcome: ok ? 'accepted' : 'rejected' };
      },
    },
    async getPlayer() {
      return player;
    },
    async getLeaderboards() {
      return leaderboards;
    },
    async getPayments() {
      return payments;
    },
    async getFlags() {
      return lsGet<Record<string, string>>('flags', {});
    },
    auth: {
      async openAuthDialog() {
        const ok = confirm('[МОК] Войти в аккаунт Яндекса?');
        if (!ok) throw new Error('auth cancelled');
        lsSet('authorized', true);
        location.reload();
      },
    },
    async isAvailableMethod() {
      return true;
    },
  };
}
