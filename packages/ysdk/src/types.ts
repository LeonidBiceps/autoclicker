/**
 * Минимальные типы публичного Yandex Games SDK v2.
 *
 * Описаны только те части, которыми пользуется обёртка. Всё помечено
 * опциональным там, где платформа может не отдать метод (устаревший клиент,
 * TV-режим, отключённая фича) — обёртка обязана переживать их отсутствие.
 */

export interface AdvCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (error: unknown) => void;
  onOffline?: () => void;
  onRewarded?: () => void;
}

export interface BannerStatus {
  stickyAdvIsShowing: boolean;
  reason?: string;
}

export interface YaAdv {
  showFullscreenAdv(opts: { callbacks?: AdvCallbacks }): void;
  showRewardedVideo(opts: { callbacks?: AdvCallbacks }): void;
  getBannerAdvStatus?(): Promise<BannerStatus>;
  showBannerAdv?(): Promise<BannerStatus>;
  hideBannerAdv?(): Promise<{ stickyAdvIsShowing: boolean }>;
}

export type PlayerMode = 'lite' | '';

export interface YaPlayer {
  getMode(): PlayerMode;
  getName(): string;
  getPhoto(size: 'small' | 'medium' | 'large'): string;
  getUniqueID(): string;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
  getStats(keys?: string[]): Promise<Record<string, number>>;
  setStats(stats: Record<string, number>): Promise<void>;
  incrementStats(increments: Record<string, number>): Promise<Record<string, number>>;
}

export interface LeaderboardEntry {
  score: number;
  extraData?: string;
  rank: number;
  player: {
    getAvatarSrc(size: string): string;
    publicName: string;
    uniqueID: string;
  };
}

export interface LeaderboardEntries {
  leaderboard: { name: string };
  ranges: Array<{ start: number; size: number }>;
  userRank: number;
  entries: LeaderboardEntry[];
}

export interface YaLeaderboards {
  setLeaderboardScore(name: string, score: number, extraData?: string): Promise<void>;
  getLeaderboardEntries(
    name: string,
    opts?: {
      includeUser?: boolean;
      quantityAround?: number;
      quantityTop?: number;
    },
  ): Promise<LeaderboardEntries>;
  getLeaderboardPlayerEntry(name: string): Promise<LeaderboardEntry>;
}

export interface YaPurchase {
  productID: string;
  purchaseToken: string;
  developerPayload?: string;
}

export interface YaCatalogProduct {
  id: string;
  title: string;
  description: string;
  imageURI: string;
  price: string;
  priceValue: string;
  priceCurrencyCode: string;
  getPriceCurrencyImage(size: string): string;
}

export interface YaPayments {
  purchase(opts: { id: string; developerPayload?: string }): Promise<YaPurchase>;
  getPurchases(): Promise<YaPurchase[]>;
  getCatalog(): Promise<YaCatalogProduct[]>;
  consumePurchase(token: string): Promise<void>;
}

export interface YaEnvironment {
  app: { id: string };
  browser?: { lang: string };
  i18n: { lang: string; tld: string };
  payload?: string | null;
}

export interface YaDeviceInfo {
  type: string;
  isMobile(): boolean;
  isDesktop(): boolean;
  isTablet(): boolean;
  isTV(): boolean;
}

export interface YaFeedback {
  canReview(): Promise<{ value: boolean; reason?: string }>;
  requestReview(): Promise<{ feedbackSent: boolean }>;
}

export interface YaShortcut {
  canShowPrompt(): Promise<{ canShow: boolean }>;
  showPrompt(): Promise<{ outcome: 'accepted' | 'rejected' }>;
}

export interface YaScreen {
  fullscreen: {
    status: 'on' | 'off';
    request(): Promise<void>;
    exit(): Promise<void>;
  };
}

export interface YaFeatures {
  LoadingAPI?: { ready(): void };
  GameplayAPI?: { start(): void; stop(): void };
}

export interface YaSDK {
  adv: YaAdv;
  environment: YaEnvironment;
  deviceInfo?: YaDeviceInfo;
  features?: YaFeatures;
  screen?: YaScreen;
  feedback?: YaFeedback;
  shortcut?: YaShortcut;
  getPlayer(opts?: { scopes?: boolean; signed?: boolean }): Promise<YaPlayer>;
  getLeaderboards(): Promise<YaLeaderboards>;
  getPayments(opts?: { signed?: boolean }): Promise<YaPayments>;
  getFlags(opts?: unknown): Promise<Record<string, string>>;
  auth?: { openAuthDialog(): Promise<void> };
  isAvailableMethod?(name: string): Promise<boolean>;
  onEvent?(eventName: string, cb: (...args: unknown[]) => void): () => void;
  EVENT?: Record<string, string>;
}

declare global {
  interface Window {
    YaGames?: { init(opts?: unknown): Promise<YaSDK> };
    ysdk?: YaSDK;
  }
}
