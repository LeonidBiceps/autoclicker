/**
 * Воронка событий.
 *
 * Доход портфельной студии определяется удержанием, а удержание не видно без
 * событий. Модуль складывает их в Яндекс.Метрику, если счётчик подключён, и
 * дублирует в консоль на локальной сборке — чтобы воронку можно было читать
 * ещё до публикации.
 */

declare global {
  interface Window {
    ym?: (id: number, action: string, ...args: unknown[]) => void;
  }
}

/** События, которые стоит слать в каждой игре — общий каркас воронки. */
export type CoreEvent =
  | 'load_start'
  | 'load_done'
  | 'game_start'
  | 'game_over'
  | 'level_up'
  | 'ad_rewarded_offer'
  | 'ad_rewarded_shown'
  | 'ad_rewarded_declined'
  | 'ad_interstitial_shown'
  | 'shortcut_offer'
  | 'shortcut_accepted'
  | 'review_offer'
  | 'purchase';

export class Metrics {
  private counterId: number | null = null;
  private readonly t0 = performance.now();
  private readonly debug: boolean;

  constructor(debug = import.meta.env?.DEV ?? false) {
    this.debug = debug;
  }

  /** Подключает счётчик Метрики, если он есть на странице. */
  attachYandexMetrica(counterId: number): void {
    this.counterId = counterId;
  }

  send(event: CoreEvent | (string & {}), params?: Record<string, unknown>): void {
    const payload = {
      ...params,
      // Время от старта сессии — без него события невозможно интерпретировать.
      t: Math.round((performance.now() - this.t0) / 1000),
    };

    if (this.counterId !== null && typeof window.ym === 'function') {
      try {
        window.ym(this.counterId, 'reachGoal', event, payload);
      } catch {
        /* счётчик заблокирован адблоком — не наша забота */
      }
    }

    if (this.debug) console.info('%c[metrics]', 'color:#9ece6a', event, payload);
  }
}

export const metrics = new Metrics();
