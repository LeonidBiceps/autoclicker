// Логика счётчика эликсира и "цикла" колоды противника в Clash Royale — чистая, без какого-либо
// ввода-вывода (не трогает экран/файлы), чтобы можно было проверить отдельно от распознавания
// картинок и от Electron.
//
// Модель "кто сейчас в руке" у противника: в Clash Royale всегда рука(4)+очередь(4) = 8 карт
// колоды, и розыгрыш карты убирает её из руки и ставит в конец очереди. Значит в любой момент
// времени "последние (до 4) уникальных сыгранных карт" — это ТОЧНО те, что сейчас в очереди
// (ждут своего хода), а все остальные уже открытые карты колоды — ТОЧНО в руке прямо сейчас.
// Это не эвристика, а прямое следствие механики игры — не нужно даже знать все 8 карт колоды,
// чтобы это работало для уже открытых.
const BASE_ELIXIR_INTERVAL_SEC = 2.8; // 1 эликсир за 2.8с — стандартная скорость обычного времени
const STARTING_ELIXIR = 5;

class ClashTracker {
  constructor(config) {
    this.config = {
      matchDurationSec: 120, // через сколько секунд после старта включается х2 эликсир
      overtimeMultiplier: 3, // множитель скорости в овертайме (сверхурочное время при ничьей)
      ...config,
    };
    this.reset();
  }

  updateConfig(partial) {
    this.config = { ...this.config, ...partial };
  }

  reset() {
    this.startedAt = null;
    this.overtimeStartedAt = null;
    this.lastTickAt = null;
    this.elixir = STARTING_ELIXIR;
    this.playHistory = []; // [{ cardId, at }], в порядке розыгрыша
    this.revealedOrder = []; // id карт в порядке ПЕРВОГО появления — открытая часть колоды (до 8)
  }

  start() {
    this.reset();
    this.startedAt = Date.now();
    this.lastTickAt = this.startedAt;
  }

  startOvertime() {
    if (!this.startedAt) return;
    this.overtimeStartedAt = Date.now();
  }

  isRunning() {
    return !!this.startedAt;
  }

  _phaseMultiplier(now) {
    if (this.overtimeStartedAt) return this.config.overtimeMultiplier;
    if (!this.startedAt) return 1;
    const elapsedSec = (now - this.startedAt) / 1000;
    return elapsedSec >= this.config.matchDurationSec ? 2 : 1;
  }

  // Дать эликсиру "натечь" с момента последнего tick — вызывается регулярным таймером снаружи.
  tick(now = Date.now()) {
    if (!this.startedAt) return;
    const dtSec = Math.max(0, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;
    const multiplier = this._phaseMultiplier(now);
    const regenPerSec = multiplier / BASE_ELIXIR_INTERVAL_SEC;
    this.elixir = Math.min(10, this.elixir + regenPerSec * dtSec);
  }

  // Розыгрыш карты противником — cost можно не передавать, тогда возьмётся из lookup таблицы
  // на уровне вызывающего кода (main.js знает базу карт); здесь только сама механика счёта.
  recordCardPlay(cardId, cost) {
    if (!this.startedAt) return;
    this.elixir = Math.max(0, this.elixir - cost);
    this.playHistory.push({ cardId, at: Date.now() });
    if (!this.revealedOrder.includes(cardId)) this.revealedOrder.push(cardId);
  }

  getHandEstimate() {
    const inQueue = [];
    for (let i = this.playHistory.length - 1; i >= 0 && inQueue.length < 4; i--) {
      const id = this.playHistory[i].cardId;
      if (!inQueue.includes(id)) inQueue.push(id);
    }
    const inHand = this.revealedOrder.filter((id) => !inQueue.includes(id));
    return { inHand, inQueue };
  }

  getState() {
    const { inHand, inQueue } = this.getHandEstimate();
    return {
      running: this.isRunning(),
      elixir: Math.round(this.elixir * 10) / 10,
      overtime: !!this.overtimeStartedAt,
      phaseMultiplier: this._phaseMultiplier(Date.now()),
      elapsedSec: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      revealedOrder: this.revealedOrder.slice(),
      inHand,
      inQueue,
    };
  }
}

module.exports = { ClashTracker, STARTING_ELIXIR, BASE_ELIXIR_INTERVAL_SEC };
