const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = {
  intervalMs: 100,
  jitterMs: 20,
  actionType: "mouse", // 'mouse' | 'keyboard'
  button: "left", // 'left' | 'right' | 'double'
  keyToPress: { name: "Space", code: 57 }, // захвачено через uiohook-napi (см. main.js)
  hotkey: "F8",
  panicHotkey: "F9",
  recordHotkey: "F10",
  stopAfterClicks: 0,
  stopAfterMs: 0,
  positionJitterPx: 0,
  colorTrigger: { enabled: false, point: null, color: null, tolerance: 30 }, // Pro: клик только при совпадении цвета
  fixedPoint: null, // { x, y }
  sequencePoints: [], // [{ x, y }, ...]
  mode: "cursor", // 'cursor' | 'point' | 'sequence'
  sequenceClickAll: false, // Pro: в режиме "sequence" кликать на каждый тик сразу во ВСЕ точки, а не по одной по очереди
  licenseKey: "",
  profiles: {}, // name -> settings subset
  macros: {}, // name -> { events: [{ type: 'click'|'keydown'|'keyup', x?, y?, key?, t }, ...], repeat }
  // старые макросы хранились как голый массив кликов без обёртки — main.js приводит их к этой форме на лету
  binds: [], // [{ id, hotkey, text }, ...] — глобальный хоткей печатает заданный текст (Pro)
  launchOnStartup: false,
  launchMinimized: false,
  ocrLang: "rus+eng", // 'rus' | 'eng' | 'rus+eng' — распознавание текста со скриншота (Pro)
  antiAfkEnabled: false, // двигает мышь на 1px и обратно по таймеру — не даёт уйти в АФК/заблокировать экран
  antiAfkIntervalSec: 45,
  targetWindowTitle: "", // пусто = кликер работает всегда; иначе — только когда активно окно с таким заголовком (подстрока)
  scheduleRepeat: "once", // 'once' | 'daily' | 'interval' — во сколько раз повторять отложенный старт (Pro)
  scheduleIntervalMin: 30,
  textTrigger: { enabled: false, region: null, expectedText: "", lang: "rus+eng" }, // Pro: клик только когда в области экрана появляется заданный текст (OCR)
  recordMode: "timelapse", // 'timelapse' (надёжно, единицы fps) | 'video' (плавно, до 60 fps, экспериментально)
  recordMonitorId: null, // id монитора для записи (screen.getAllDisplays()[i].id), null = основной
  recordAudio: false, // Pro, только режим "видео": системный звук через loopback
  recordIndicatorEnabled: true, // показывать поверх экрана мигающий "REC" во время записи (попадает и в саму запись — можно выключить)
  idleStartEnabled: false, // "обратный анти-АФК" — запустить кликер автоматически после простоя
  idleStartThresholdSec: 60,
  telegramEnabled: false,
  telegramBotToken: "",
  telegramChatId: "",
  activityLog: [], // [{ ts, message }, ...] — последние 100 записей, см. logActivity() в main.js
  imageTrigger: { enabled: false, templateFile: null, confidence: 0.9, width: 0, height: 0 }, // Pro: клик только когда на экране найдена сохранённая картинка-образец
  telegramOnTrigger: false, // слать уведомление и при срабатывании цвет-/текст-/картинка-триггера, не только старт/стоп кликера
  clipboardHistoryEnabled: true,
  clipboardHistory: [], // [{ ts, text }, ...] — последние 50 записей
  turboMode: false, // Pro: игнорирует интервал/разброс — кликает так быстро, как позволяет железо
  stickyNotes: [], // [{ id, text, color, x, y, width, height }, ...] — плавающие заметки поверх экрана (бесплатно, без лимита)
  clashTracker: {
    // Pro: счётчик эликсира и открытой колоды противника в Clash Royale (через эмулятор) —
    // распознаёт разыгранные карты по появлению юнита на поле боя (не иконки — в игре её нет).
    enabled: false,
    region: null, // { x, y, width, height } — область всего игрового поля (обе половины)
    confidence: 0.85,
    pollIntervalMs: 700, // как часто проверять, не изменилось ли поле с прошлого раза
    cooldownMs: 2500, // не засчитывать ту же карту снова раньше чем через столько мс (юнит ещё двигается по полю, а не мгновенно исчезающая иконка)
    matchDurationSec: 120, // через сколько секунд после старта включается х2 эликсир
    overtimeMultiplier: 3, // множитель скорости эликсира в овертайме
    cellSize: 40, // размер ячейки сетки motion-detection в пикселях экрана — меньше типичного юнита
    matchActiveTemplateFile: null, // снимок иконки эликсира (видна только во время боя, в одном и том же месте) — по ней определяем, идёт ли матч, вместо того чтобы полагаться на распознавание карт
    matchActiveConfidence: 0.85,
  },
};

// Поля, которые входят в профиль/экспорт (не licenseKey/profiles/macros — те отдельно).
const PROFILE_FIELDS = [
  "intervalMs",
  "jitterMs",
  "actionType",
  "button",
  "keyToPress",
  "positionJitterPx",
  "colorTrigger",
  "stopAfterClicks",
  "stopAfterMs",
  "mode",
  "fixedPoint",
  "sequencePoints",
  "sequenceClickAll",
  "targetWindowTitle",
  "textTrigger",
  "imageTrigger",
  "turboMode",
];

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get(key) {
    return this.data[key];
  }

  getAll() {
    return { ...this.data };
  }

  set(partial) {
    this.data = { ...this.data, ...partial };
    this.save();
  }
}

module.exports = { Store, DEFAULT_SETTINGS, PROFILE_FIELDS };
