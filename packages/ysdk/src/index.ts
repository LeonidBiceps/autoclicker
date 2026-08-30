/**
 * Единый фасад над Yandex Games SDK.
 *
 * Правила, ради которых он существует:
 *  1. Ни один вызов не выбрасывает наружу — игра не должна падать из-за рекламы.
 *  2. Любое обещание обязательно резолвится: у платформы бывают колбэки,
 *     которые не приходят никогда, поэтому везде стоит таймаут.
 *  3. Игра узнаёт о показе рекламы через события `pause`/`resume` — звук и
 *     игровой цикл останавливаются в одном месте, а не в каждом вызове.
 *  4. Без SDK (localhost, `?mock=1`) подключается мок с тем же поведением.
 */

import { createMockSdk } from './mock';
import type { LeaderboardEntries, YaLeaderboards, YaPayments, YaPlayer, YaSDK } from './types';

export type * from './types';

const SDK_URL = 'https://yandex.ru/games/sdk/v2';

/** Минимальный интервал между полноэкранными показами. Платформа держит 60 с — берём с запасом. */
const INTERSTITIAL_COOLDOWN_MS = 70_000;
/** Не показываем полноэкранную рекламу в первые секунды сессии. */
const INTERSTITIAL_WARMUP_MS = 45_000;
/** Страховка на случай, если колбэк рекламы не придёт. */
const ADV_TIMEOUT_MS = 90_000;
/** Реже этого интервала платформа не даёт писать сейв. */
const SAVE_MIN_INTERVAL_MS = 3_000;

type Events = {
  pause: void;
  resume: void;
  advstart: { kind: 'interstitial' | 'rewarded' };
  advend: { kind: 'interstitial' | 'rewarded'; success: boolean };
  saveerror: { error: unknown };
};

class Emitter {
  private map = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(cb as (payload: never) => void);
    return () => {
      set.delete(cb as (payload: never) => void);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        (cb as (p: Events[K]) => void)(payload);
      } catch (error) {
        console.error('[ysdk] listener failed', error);
      }
    }
  }
}

function loadScript(src: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    const timer = setTimeout(() => {
      el.remove();
      reject(new Error('sdk script timeout'));
    }, timeoutMs);
    el.src = src;
    el.async = true;
    el.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    el.onerror = () => {
      clearTimeout(timer);
      el.remove();
      reject(new Error('sdk script failed'));
    };
    document.head.appendChild(el);
  });
}

function shouldUseMock(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.get('mock') === '1') return true;
  if (params.get('mock') === '0') return false;
  // На самой платформе игра всегда открыта внутри iframe на домене Яндекса.
  return !/(^|\.)(yandex|ya)\.[a-z.]+$/i.test(location.hostname) && window.top === window.self;
}

export interface InitOptions {
  /** Сообщать платформе о начале/конце активного геймплея (влияет на аналитику и рекламу). */
  gameplayApi?: boolean;
  /** Сколько ждать загрузку скрипта SDK, прежде чем уйти в оффлайн-режим. */
  timeoutMs?: number;
}

export interface AdResult {
  /** Реклама действительно была показана. */
  shown: boolean;
  /** Награда засчитана (только для rewarded). */
  rewarded: boolean;
  /** Показ не состоялся по этой причине. */
  reason?: 'cooldown' | 'warmup' | 'error' | 'offline' | 'closed' | 'unavailable';
}

class YandexGames {
  readonly events = new Emitter();

  private sdk: YaSDK | null = null;
  private player: YaPlayer | null = null;
  private leaderboards: YaLeaderboards | null = null;
  private payments: YaPayments | null = null;

  private initPromise: Promise<void> | null = null;
  private sessionStart = 0;
  private lastInterstitialAt = 0;
  private advInFlight = false;
  private gameplayActive = false;

  private pendingSave: Record<string, unknown> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSaveAt = 0;

  /** `true`, если работаем на моке, а не на настоящей платформе. */
  isMock = false;

  // ── жизненный цикл ──────────────────────────────────────────────────────

  init(options: InitOptions = {}): Promise<void> {
    this.initPromise ??= this.doInit(options);
    return this.initPromise;
  }

  private async doInit({ gameplayApi = true, timeoutMs = 8_000 }: InitOptions): Promise<void> {
    this.sessionStart = performance.now();

    if (shouldUseMock()) {
      this.sdk = createMockSdk();
      this.isMock = true;
      console.info('%c[ysdk] мок-режим', 'color:#7aa2f7');
    } else {
      try {
        if (!window.YaGames) await loadScript(SDK_URL, timeoutMs);
        this.sdk = (await window.YaGames?.init()) ?? null;
        window.ysdk = this.sdk ?? undefined;
      } catch (error) {
        console.warn('[ysdk] SDK недоступен, играем без платформы', error);
        this.sdk = null;
      }
    }

    if (this.sdk) {
      // Игрок нужен почти сразу — сейвы висят на нём.
      try {
        this.player = await this.sdk.getPlayer({ scopes: false });
      } catch (error) {
        console.warn('[ysdk] getPlayer failed', error);
      }
    }

    if (gameplayApi) this.gameplayStart();

    // Сейв не должен потеряться при сворачивании вкладки.
    const flush = (): void => void this.flushSave();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  /** Сообщает платформе, что загрузка закончена и можно снимать прелоадер. */
  ready(): void {
    try {
      this.sdk?.features?.LoadingAPI?.ready();
    } catch (error) {
      console.warn('[ysdk] LoadingAPI.ready failed', error);
    }
  }

  gameplayStart(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    try {
      this.sdk?.features?.GameplayAPI?.start();
    } catch {
      /* не критично */
    }
  }

  gameplayStop(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    try {
      this.sdk?.features?.GameplayAPI?.stop();
    } catch {
      /* не критично */
    }
  }

  // ── окружение ───────────────────────────────────────────────────────────

  get lang(): string {
    return this.sdk?.environment.i18n.lang ?? navigator.language.slice(0, 2);
  }

  get isMobile(): boolean {
    return this.sdk?.deviceInfo?.isMobile() ?? matchMedia('(pointer:coarse)').matches;
  }

  get isTV(): boolean {
    return this.sdk?.deviceInfo?.isTV() ?? false;
  }

  get payload(): string | null {
    return this.sdk?.environment.payload ?? null;
  }

  get isAuthorized(): boolean {
    return this.player ? this.player.getMode() !== 'lite' : false;
  }

  get playerName(): string {
    try {
      return this.player?.getName() ?? '';
    } catch {
      return '';
    }
  }

  /** Открывает диалог входа. Возвращает `true`, если игрок авторизовался. */
  async requestLogin(): Promise<boolean> {
    if (!this.sdk?.auth) return false;
    try {
      await this.sdk.auth.openAuthDialog();
      this.player = await this.sdk.getPlayer({ scopes: false });
      return this.isAuthorized;
    } catch {
      return false;
    }
  }

  // ── реклама ─────────────────────────────────────────────────────────────

  /**
   * Полноэкранная реклама. Сама соблюдает кулдаун и прогрев — вызывать можно
   * в каждом подходящем месте, лишние показы отсеются.
   */
  async interstitial(): Promise<AdResult> {
    const now = performance.now();
    if (this.advInFlight) return { shown: false, rewarded: false, reason: 'cooldown' };
    if (now - this.sessionStart < INTERSTITIAL_WARMUP_MS) {
      return { shown: false, rewarded: false, reason: 'warmup' };
    }
    if (this.lastInterstitialAt && now - this.lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) {
      return { shown: false, rewarded: false, reason: 'cooldown' };
    }
    if (!this.sdk) return { shown: false, rewarded: false, reason: 'unavailable' };

    const result = await this.runAd('interstitial');
    if (result.shown) this.lastInterstitialAt = performance.now();
    return result;
  }

  /** Реклама за награду. `rewarded === true` — награду можно выдавать. */
  async rewarded(): Promise<AdResult> {
    if (this.advInFlight) return { shown: false, rewarded: false, reason: 'error' };
    if (!this.sdk) return { shown: false, rewarded: false, reason: 'unavailable' };
    return this.runAd('rewarded');
  }

  /** Сколько секунд осталось до следующей возможной полноэкранной рекламы. */
  interstitialCooldownLeft(): number {
    const now = performance.now();
    const warmupLeft = INTERSTITIAL_WARMUP_MS - (now - this.sessionStart);
    const cooldownLeft = this.lastInterstitialAt
      ? INTERSTITIAL_COOLDOWN_MS - (now - this.lastInterstitialAt)
      : 0;
    return Math.max(0, Math.ceil(Math.max(warmupLeft, cooldownLeft) / 1000));
  }

  private runAd(kind: 'interstitial' | 'rewarded'): Promise<AdResult> {
    return new Promise<AdResult>((resolve) => {
      const sdk = this.sdk;
      if (!sdk) {
        resolve({ shown: false, rewarded: false, reason: 'unavailable' });
        return;
      }

      this.advInFlight = true;
      let settled = false;
      let opened = false;
      let rewarded = false;

      const done = (result: AdResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.advInFlight = false;
        this.events.emit('advend', { kind, success: result.shown });
        this.events.emit('resume', undefined);
        if (this.gameplayActive) {
          // Платформа считает рекламу паузой геймплея — возвращаем состояние.
          try {
            sdk.features?.GameplayAPI?.start();
          } catch {
            /* не критично */
          }
        }
        resolve(result);
      };

      const timer = setTimeout(
        () => done({ shown: opened, rewarded, reason: 'error' }),
        ADV_TIMEOUT_MS,
      );

      const callbacks = {
        onOpen: () => {
          opened = true;
          this.events.emit('advstart', { kind });
          this.events.emit('pause', undefined);
          try {
            sdk.features?.GameplayAPI?.stop();
          } catch {
            /* не критично */
          }
        },
        onRewarded: () => {
          rewarded = true;
        },
        onClose: (wasShown?: boolean) => {
          const shown = wasShown ?? opened;
          done({
            shown,
            rewarded,
            ...(shown ? {} : { reason: 'closed' as const }),
          });
        },
        onError: (error: unknown) => {
          console.warn(`[ysdk] ${kind} error`, error);
          done({ shown: false, rewarded: false, reason: 'error' });
        },
        onOffline: () => done({ shown: false, rewarded: false, reason: 'offline' }),
      };

      try {
        if (kind === 'rewarded') sdk.adv.showRewardedVideo({ callbacks });
        else sdk.adv.showFullscreenAdv({ callbacks });
      } catch (error) {
        console.warn(`[ysdk] ${kind} throw`, error);
        done({ shown: false, rewarded: false, reason: 'error' });
      }
    });
  }

  async showBanner(): Promise<boolean> {
    try {
      const res = await this.sdk?.adv.showBannerAdv?.();
      return res?.stickyAdvIsShowing ?? false;
    } catch {
      return false;
    }
  }

  async hideBanner(): Promise<void> {
    try {
      await this.sdk?.adv.hideBannerAdv?.();
    } catch {
      /* не критично */
    }
  }

  // ── сейвы ───────────────────────────────────────────────────────────────

  /**
   * Читает сохранение. Всегда возвращает объект: при любой ошибке — `fallback`,
   * чтобы вызывающий код не занимался обработкой отсутствующего облака.
   */
  async load<T extends Record<string, unknown>>(fallback: T): Promise<T> {
    try {
      const data = await this.player?.getData();
      if (data && Object.keys(data).length > 0) return { ...fallback, ...data } as T;
    } catch (error) {
      console.warn('[ysdk] load failed', error);
    }
    // Оффлайн-резерв: локальная копия переживает недоступность облака.
    try {
      const raw = localStorage.getItem('yg:save');
      if (raw) return { ...fallback, ...(JSON.parse(raw) as Record<string, unknown>) } as T;
    } catch {
      /* повреждённый сейв — играем с нуля */
    }
    return fallback;
  }

  /**
   * Ставит сохранение в очередь. Частые вызовы схлопываются в один запрос —
   * писать в облако на каждый ход платформа не даёт.
   */
  save(data: Record<string, unknown>): void {
    this.pendingSave = { ...(this.pendingSave ?? {}), ...data };

    try {
      localStorage.setItem('yg:save', JSON.stringify(this.pendingSave));
    } catch {
      /* приватный режим */
    }

    if (this.saveTimer) return;
    const wait = Math.max(0, SAVE_MIN_INTERVAL_MS - (Date.now() - this.lastSaveAt));
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, wait);
  }

  /** Немедленно отправляет накопленное сохранение. */
  async flushSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const data = this.pendingSave;
    if (!data || !this.player) return;
    this.pendingSave = null;
    this.lastSaveAt = Date.now();
    try {
      await this.player.setData(data, true);
    } catch (error) {
      // Возвращаем данные в очередь — попробуем на следующем сохранении.
      this.pendingSave = { ...data, ...(this.pendingSave ?? {}) };
      this.events.emit('saveerror', { error });
      console.warn('[ysdk] save failed', error);
    }
  }

  // ── лидерборды ──────────────────────────────────────────────────────────

  private async lb(): Promise<YaLeaderboards | null> {
    if (this.leaderboards) return this.leaderboards;
    try {
      this.leaderboards = (await this.sdk?.getLeaderboards()) ?? null;
    } catch (error) {
      console.warn('[ysdk] getLeaderboards failed', error);
      this.leaderboards = null;
    }
    return this.leaderboards;
  }

  async submitScore(board: string, score: number, extraData?: string): Promise<boolean> {
    try {
      const lb = await this.lb();
      if (!lb) return false;
      await lb.setLeaderboardScore(board, Math.floor(score), extraData);
      return true;
    } catch (error) {
      console.warn('[ysdk] submitScore failed', error);
      return false;
    }
  }

  async topScores(board: string, quantityTop = 10): Promise<LeaderboardEntries | null> {
    try {
      const lb = await this.lb();
      if (!lb) return null;
      return await lb.getLeaderboardEntries(board, { quantityTop, includeUser: true });
    } catch (error) {
      console.warn('[ysdk] topScores failed', error);
      return null;
    }
  }

  // ── покупки ─────────────────────────────────────────────────────────────

  private async pay(): Promise<YaPayments | null> {
    if (this.payments) return this.payments;
    try {
      this.payments = (await this.sdk?.getPayments({ signed: false })) ?? null;
    } catch (error) {
      console.warn('[ysdk] getPayments failed', error);
      this.payments = null;
    }
    return this.payments;
  }

  async purchase(id: string): Promise<boolean> {
    try {
      const p = await this.pay();
      if (!p) return false;
      await p.purchase({ id });
      return true;
    } catch {
      return false;
    }
  }

  async hasPurchase(id: string): Promise<boolean> {
    try {
      const p = await this.pay();
      if (!p) return false;
      return (await p.getPurchases()).some((x) => x.productID === id);
    } catch {
      return false;
    }
  }

  // ── прочее ──────────────────────────────────────────────────────────────

  /** Просит оценить игру. Показывать только после явно удачной сессии. */
  async requestReview(): Promise<boolean> {
    try {
      const can = await this.sdk?.feedback?.canReview();
      if (!can?.value) return false;
      const res = await this.sdk?.feedback?.requestReview();
      return res?.feedbackSent ?? false;
    } catch {
      return false;
    }
  }

  /** Предлагает добавить ярлык игры — сильный рычаг возвратов. */
  async promptShortcut(): Promise<boolean> {
    try {
      const can = await this.sdk?.shortcut?.canShowPrompt();
      if (!can?.canShow) return false;
      const res = await this.sdk?.shortcut?.showPrompt();
      return res?.outcome === 'accepted';
    } catch {
      return false;
    }
  }

  async flags(): Promise<Record<string, string>> {
    try {
      return (await this.sdk?.getFlags()) ?? {};
    } catch {
      return {};
    }
  }
}

/** Singleton — SDK на странице всё равно один. */
export const yg = new YandexGames();
