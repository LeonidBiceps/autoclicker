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
  licenseKey: "",
  profiles: {}, // name -> settings subset
  macros: {}, // name -> { events: [{ type: 'click'|'keydown'|'keyup', x?, y?, key?, t }, ...], repeat }
  // старые макросы хранились как голый массив кликов без обёртки — main.js приводит их к этой форме на лету
  binds: [], // [{ id, hotkey, text }, ...] — глобальный хоткей печатает заданный текст (Pro)
  launchOnStartup: false,
  launchMinimized: false,
  ocrLang: "rus+eng", // 'rus' | 'eng' | 'rus+eng' — распознавание текста со скриншота (Pro)
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
