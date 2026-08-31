const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, dialog, shell, Notification } = require("electron");

// Не даём запускать вторую копию — раньше при зависании и повторных запусках можно было
// накопить несколько параллельных процессов в трее, и непонятно было, какое окно вообще
// открылось. Теперь повторный запуск .exe просто поднимает уже работающее окно.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Заполни своей страницей (Boosty, DonationAlerts и т.п. — то, что реально работает из России).
// Пустая строка = кнопка доната покажет честное сообщение «ссылка ещё не настроена», а не тихо
// откроет пустоту или чужую страницу.
const DONATE_URL = "https://www.donationalerts.com/r/leonidbiceps111";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { Store, PROFILE_FIELDS } = require("./store");
const { verifyLicenseKey, getMachineId } = require("./license");
const { mouse, keyboard, screen: nutScreen, Point, Button, Region, FileType } = require("@nut-tree-fork/nut-js");
const { uIOhook } = require("uiohook-napi");
const { keycodeToName, resolveNutjsKey } = require("./keymap");
const Tesseract = require("tesseract.js");

mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

const FREE_SESSION_CLICK_CAP = 5000;

let store;
let mainWindow = null;
let tray = null;
let hudWindow = null;
let seqMarkerWindows = [];
let running = false;
let proUnlocked = false;
let timerId = null;
let sessionClicks = 0;
let sessionStartedAt = 0;
let sequenceIndex = 0;
let scheduledTimerId = null;
let scheduledAt = null;
let recording = false;
let recordedEvents = [];
let recordStartTime = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("status:update", { running, clickCount: sessionClicks });
  }
  updateTrayMenu();
}

function sendNote(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("note:show", text);
  }
}

async function refreshLicense() {
  const result = await verifyLicenseKey(store.get("licenseKey"));
  proUnlocked = result.valid;
  return result;
}

// --- Click loop ---

function getMouseTargetPoint(settings) {
  if (settings.mode === "point" && settings.fixedPoint) return settings.fixedPoint;
  if (settings.mode === "sequence" && proUnlocked && settings.sequencePoints.length > 0) {
    const point = settings.sequencePoints[sequenceIndex % settings.sequencePoints.length];
    sequenceIndex++;
    return point;
  }
  return null;
}

async function performClick() {
  const settings = store.getAll();

  if (settings.actionType === "keyboard") {
    const key = resolveNutjsKey(settings.keyToPress);
    await keyboard.pressKey(key);
    await keyboard.releaseKey(key);
    return;
  }

  let point = getMouseTargetPoint(settings);
  if (!point) {
    const current = await mouse.getPosition();
    point = { x: current.x, y: current.y };
  }

  if (proUnlocked && settings.positionJitterPx > 0) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * settings.positionJitterPx;
    point = {
      x: Math.round(point.x + Math.cos(angle) * r),
      y: Math.round(point.y + Math.sin(angle) * r),
    };
  }

  await mouse.setPosition(new Point(point.x, point.y));

  if (settings.button === "right") {
    await mouse.click(Button.RIGHT);
  } else if (settings.button === "double") {
    await mouse.doubleClick(Button.LEFT);
  } else {
    await mouse.click(Button.LEFT);
  }
}

// --- Color trigger (click only when a watched pixel matches a target color, Pro) ---

async function colorConditionMet(settings) {
  const trigger = settings.colorTrigger;
  if (!proUnlocked || !trigger || !trigger.enabled || !trigger.point || !trigger.color) return true;
  try {
    const sample = await nutScreen.colorAt(new Point(trigger.point.x, trigger.point.y));
    const dr = sample.R - trigger.color.r;
    const dg = sample.G - trigger.color.g;
    const db = sample.B - trigger.color.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    return distance <= trigger.tolerance;
  } catch (e) {
    return true; // не блокируем клики, если чтение экрана не удалось
  }
}

function checkAutoStop(settings) {
  if (!proUnlocked && sessionClicks >= FREE_SESSION_CLICK_CAP) {
    stopClicking(`Бесплатная версия: лимит ${FREE_SESSION_CLICK_CAP} кликов за запуск. Pro снимает ограничение.`);
    return true;
  }
  if (settings.stopAfterClicks > 0 && sessionClicks >= settings.stopAfterClicks) {
    stopClicking("Остановлено: набран лимит кликов");
    return true;
  }
  if (settings.stopAfterMs > 0 && Date.now() - sessionStartedAt >= settings.stopAfterMs) {
    stopClicking("Остановлено: вышло время");
    return true;
  }
  return false;
}

function scheduleNext() {
  if (!running) return;
  const settings = store.getAll();
  const jitter = settings.jitterMs > 0 ? (Math.random() * 2 - 1) * settings.jitterMs : 0;
  const delay = Math.max(10, settings.intervalMs + jitter);

  timerId = setTimeout(async () => {
    try {
      if (await colorConditionMet(settings)) {
        await performClick();
        sessionClicks++;
        updateHud(`● ${sessionClicks} кликов`);
      }
    } catch (e) {
      stopClicking(`Ошибка: ${e.message}`);
      return;
    }
    sendStatus();
    if (!checkAutoStop(settings)) scheduleNext();
  }, delay);
}

function startClicking() {
  if (running) return;
  const settings = store.getAll();
  if (settings.mode === "point" && !settings.fixedPoint) {
    sendNote("Сначала выбери точку на экране");
    return;
  }
  if (settings.mode === "sequence" && (!proUnlocked || settings.sequencePoints.length === 0)) {
    sendNote(proUnlocked ? "Добавь хотя бы одну точку в последовательность" : "Последовательность точек — Pro-функция");
    return;
  }
  running = true;
  sessionClicks = 0;
  sequenceIndex = 0;
  sessionStartedAt = Date.now();
  sendStatus();
  createHud();
  updateHud("● 0 кликов");
  scheduleNext();
}

function stopClicking(note) {
  running = false;
  clearTimeout(timerId);
  sendStatus();
  destroyHud();
  if (note) sendNote(note);
}

function toggleClicking() {
  if (running) stopClicking();
  else startClicking();
  return { running, clickCount: sessionClicks };
}

// --- HUD overlay (click counter while running) ---

function createHud() {
  if (hudWindow) return;
  const display = screen.getPrimaryDisplay();
  hudWindow = new BrowserWindow({
    x: display.bounds.x + 16,
    y: display.bounds.y + 16,
    width: 160,
    height: 36,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true },
  });
  hudWindow.setIgnoreMouseEvents(true);
  hudWindow.setAlwaysOnTop(true, "screen-saver");
  hudWindow.loadFile(path.join(__dirname, "renderer", "hud.html"));
  hudWindow.once("ready-to-show", () => hudWindow && hudWindow.show());
}

function updateHud(text) {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.webContents.executeJavaScript(`document.getElementById("t").textContent = ${JSON.stringify(text)};`).catch(() => {});
  }
}

function destroyHud() {
  if (hudWindow) {
    hudWindow.close();
    hudWindow = null;
  }
}

// --- Point picking overlay (multi-monitor) ---

function pickPoint() {
  return new Promise((resolve) => {
    const displays = screen.getAllDisplays();
    const overlays = [];
    let done = false;

    const finish = (absolute) => {
      if (done) return;
      done = true;
      for (const w of overlays) {
        if (!w.isDestroyed()) w.close();
      }
      resolve(absolute);
    };

    for (const display of displays) {
      const overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
          contextIsolation: true,
          preload: path.join(__dirname, "pick-preload.js"),
        },
      });
      overlay.setAlwaysOnTop(true, "screen-saver");
      overlay.loadFile(path.join(__dirname, "renderer", "pick-overlay.html"));
      overlay.webContents.once("did-finish-load", () => {
        overlay.webContents.executeJavaScript(`window.__offsetX = ${display.bounds.x}; window.__offsetY = ${display.bounds.y};`);
      });
      overlay.on("closed", () => {
        if (!done) finish(null);
      });
      overlays.push(overlay);
    }

    const handler = (event, absolute) => {
      ipcMain.removeListener("pick:done", handler);
      finish(absolute);
    };
    ipcMain.once("pick:done", handler);
  });
}

// --- Screen region picker (multi-monitor) — тот же приём, что и pickPoint, но с рамкой
// выделения вместо одной точки. Используется для OCR: выделяешь область, а не кликаешь в точку.
function pickRegion() {
  return new Promise((resolve) => {
    const displays = screen.getAllDisplays();
    const overlays = [];
    let done = false;

    const finish = (absoluteRegion) => {
      if (done) return;
      done = true;
      for (const w of overlays) {
        if (!w.isDestroyed()) w.close();
      }
      resolve(absoluteRegion);
    };

    for (const display of displays) {
      const overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
          contextIsolation: true,
          preload: path.join(__dirname, "pick-preload.js"),
        },
      });
      overlay.setAlwaysOnTop(true, "screen-saver");
      overlay.loadFile(path.join(__dirname, "renderer", "region-overlay.html"));
      overlay.webContents.once("did-finish-load", () => {
        overlay.webContents.executeJavaScript(`window.__offsetX = ${display.bounds.x}; window.__offsetY = ${display.bounds.y};`);
      });
      overlay.on("closed", () => {
        if (!done) finish(null);
      });
      overlays.push(overlay);
    }

    const handler = (event, region) => {
      ipcMain.removeListener("region:done", handler);
      finish(region);
    };
    ipcMain.once("region:done", handler);
  });
}

// --- OCR: захват выделенной области экрана + распознавание текста (Pro) ---
//
// Кроп делаем через nut-js screen.captureRegion() (та же библиотека, что уже используется для
// клика/цвета — без новых нативных зависимостей), а распознавание — через tesseract.js (чистый
// JS+WASM, тоже без пересборки под Electron). Языковые данные (.traineddata) tesseract.js по
// умолчанию скачивает с CDN при первом использовании конкретного языка и кеширует у себя —
// поэтому первое распознавание на новом языке требует интернет разово, дальше работает офлайн.
// Кеш кладём в userData (а не в cwd, куда по умолчанию метит библиотека, — cwd упакованного .exe
// может быть недоступен для записи или просто непредсказуем).
const OCR_CACHE_DIR = () => {
  const dir = path.join(app.getPath("userData"), "tessdata");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

async function runOcr(region, lang) {
  let imagePath = null;
  try {
    imagePath = await nutScreen.captureRegion(
      `multitool-ocr-${Date.now()}`,
      new Region(region.x, region.y, region.width, region.height),
      FileType.PNG,
      os.tmpdir()
    );
    const result = await Tesseract.recognize(imagePath, lang || "rus+eng", { cachePath: OCR_CACHE_DIR() });
    return { ok: true, text: (result.data.text || "").trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (imagePath) fs.unlink(imagePath, () => {});
  }
}

// --- Key capture (for keyboard auto-press mode) ---

function captureNextKey() {
  return new Promise((resolve) => {
    if (recording) {
      resolve(null);
      return;
    }
    const handler = (e) => {
      uIOhook.removeListener("keydown", handler);
      uIOhook.stop();
      resolve({ name: keycodeToName(e.keycode), code: e.keycode });
    };
    uIOhook.on("keydown", handler);
    uIOhook.start();
  });
}

// --- Sequence point markers (numbered dots shown on screen while configuring) ---

function hideSeqMarkers() {
  for (const w of seqMarkerWindows) {
    if (!w.isDestroyed()) w.close();
  }
  seqMarkerWindows = [];
}

function showSeqMarkers(points) {
  hideSeqMarkers();
  points.forEach((p, i) => {
    const w = new BrowserWindow({
      x: Math.round(p.x - 12),
      y: Math.round(p.y - 12),
      width: 24,
      height: 24,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: { contextIsolation: true },
    });
    w.setIgnoreMouseEvents(true);
    w.setAlwaysOnTop(true, "screen-saver");
    w.loadFile(path.join(__dirname, "renderer", "seq-marker.html"), { query: { n: String(i + 1) } });
    w.once("ready-to-show", () => w.show());
    seqMarkerWindows.push(w);
  });
}

function refreshSeqMarkers() {
  const settings = store.getAll();
  if (settings.mode === "sequence" && settings.sequencePoints.length > 0) {
    showSeqMarkers(settings.sequencePoints);
  } else {
    hideSeqMarkers();
  }
}

// --- Macro recording (клики мыши + нажатия клавиш) ---

let recordedKeysDown = new Set();

function reportRecordProgress() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("recording:progress", recordedEvents.length);
  }
}

// Хоткей остановки записи (F10 по умолчанию) сам проходит через тот же глобальный перехват
// клавиатуры (uiohook), которым мы записываем макрос — без этого фильтра последним событием
// каждого макроса всегда оказывалось бы нажатие самого хоткея остановки.
function getRecordStopKeyName() {
  const hotkey = store.get("recordHotkey") || "";
  const parts = hotkey.split("+");
  return parts[parts.length - 1];
}

function onRecordClick(e) {
  recordedEvents.push({ type: "click", x: Math.round(e.x), y: Math.round(e.y), t: Date.now() - recordStartTime });
  reportRecordProgress();
}

function onRecordKeydown(e) {
  const name = keycodeToName(e.keycode);
  if (!name || name === getRecordStopKeyName()) return;
  if (recordedKeysDown.has(name)) return; // автоповтор ОС при удержании клавиши — не плодим события
  recordedKeysDown.add(name);
  recordedEvents.push({ type: "keydown", key: name, t: Date.now() - recordStartTime });
  reportRecordProgress();
}

function onRecordKeyup(e) {
  const name = keycodeToName(e.keycode);
  if (!name || name === getRecordStopKeyName()) return;
  recordedKeysDown.delete(name);
  recordedEvents.push({ type: "keyup", key: name, t: Date.now() - recordStartTime });
  reportRecordProgress();
}

function startRecording() {
  if (recording) return { ok: true };
  try {
    recordedEvents = [];
    recordedKeysDown = new Set();
    recordStartTime = Date.now();
    uIOhook.on("click", onRecordClick);
    uIOhook.on("keydown", onRecordKeydown);
    uIOhook.on("keyup", onRecordKeyup);
    uIOhook.start();
    recording = true;
    return { ok: true };
  } catch (e) {
    uIOhook.removeListener("click", onRecordClick);
    uIOhook.removeListener("keydown", onRecordKeydown);
    uIOhook.removeListener("keyup", onRecordKeyup);
    recording = false;
    return { ok: false, error: e.message };
  }
}

function stopRecordingInternal() {
  if (!recording) return [];
  recording = false;
  uIOhook.stop();
  uIOhook.removeListener("click", onRecordClick);
  uIOhook.removeListener("keydown", onRecordKeydown);
  uIOhook.removeListener("keyup", onRecordKeyup);
  return recordedEvents;
}

// Макросы, записанные до этой версии, хранились как голый массив кликов — приводим к единой форме,
// чтобы не потерять уже сохранённые у пользователей макросы при обновлении.
function normalizeMacro(value) {
  if (Array.isArray(value)) return { events: value, repeat: 1 };
  return { events: (value && value.events) || [], repeat: Math.max(1, Math.min(50, (value && value.repeat) || 1)) };
}

async function playMacro(events, repeat = 1) {
  for (let i = 0; i < repeat; i++) {
    let prevT = 0;
    for (const ev of events) {
      const delay = Math.min(3000, Math.max(0, ev.t - prevT));
      await sleep(delay);
      if (ev.type === "keydown") {
        await keyboard.pressKey(resolveNutjsKey({ name: ev.key }));
      } else if (ev.type === "keyup") {
        await keyboard.releaseKey(resolveNutjsKey({ name: ev.key }));
      } else {
        // легаси-формат без type (и обычные клики) — как и раньше, клик левой кнопкой
        await mouse.setPosition(new Point(ev.x, ev.y));
        await mouse.click(Button.LEFT);
      }
      prevT = ev.t;
    }
  }
}

// --- Startup apps manager (включить/выключить чужие программы в автозагрузке) ---
//
// Два источника, оба не требуют прав администратора (в отличие от HKLM\...\Run или общей папки
// автозагрузки "для всех пользователей"):
//  1. HKCU\...\CurrentVersion\Run — команды автозапуска для текущего пользователя. Выключение —
//     не удаление: переносим значение в свой раздел HKCU\Software\МультиТул\DisabledRun, обратно —
//     при включении. Это НЕ тот же механизм, что использует сам Task Manager (у него недокументированный
//     бинарный формат в HKCU\...\StartupApproved\Run) — свой раздел проще и полностью обратим, но
//     переключатель в самом Task Manager это не отразит (запись остаётся видна там как "включена",
//     потому что физически убрана из Run, а не помечена флагом).
//  2. Папка автозагрузки текущего пользователя (%APPDATA%\...\Startup) — ярлыки .lnk. Выключение —
//     просто переименование в *.lnk.disabled (Explorer не запускает файлы с таким расширением),
//     включение — переименование обратно. Ничего не удаляется.
// Работаем через reg.exe (встроен в Windows) — без новых нативных зависимостей.

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const DISABLED_RUN_KEY = "HKCU\\Software\\МультиТул\\DisabledRun";

function getStartupFolder() {
  return path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

function regQuery(key) {
  return new Promise((resolve) => {
    execFile("reg", ["query", key], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve({});
      const entries = {};
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^ {4}(\S.*?) {4}(REG_\w+) {4}(.*)$/);
        if (m) entries[m[1]] = { type: m[2], value: m[3] };
      }
      resolve(entries);
    });
  });
}

function regAdd(key, name, type, value) {
  return new Promise((resolve, reject) => {
    execFile("reg", ["add", key, "/v", name, "/t", type, "/d", value, "/f"], { windowsHide: true }, (err) =>
      err ? reject(err) : resolve()
    );
  });
}

function regDelete(key, name) {
  return new Promise((resolve, reject) => {
    execFile("reg", ["delete", key, "/v", name, "/f"], { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

async function listStartupApps() {
  const [active, disabled] = await Promise.all([regQuery(RUN_KEY), regQuery(DISABLED_RUN_KEY)]);
  const apps = [];
  for (const [name, info] of Object.entries(active)) {
    apps.push({ name, command: info.value, source: "registry", enabled: true });
  }
  for (const [name, info] of Object.entries(disabled)) {
    apps.push({ name, command: info.value, source: "registry", enabled: false });
  }

  let files = [];
  try {
    files = fs.readdirSync(getStartupFolder());
  } catch (e) {
    files = [];
  }
  for (const file of files) {
    if (file.toLowerCase().endsWith(".lnk")) {
      apps.push({ name: file.replace(/\.lnk$/i, ""), command: file, source: "folder", enabled: true });
    } else if (file.toLowerCase().endsWith(".lnk.disabled")) {
      apps.push({ name: file.replace(/\.lnk\.disabled$/i, ""), command: file, source: "folder", enabled: false });
    }
  }
  apps.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return apps;
}

async function toggleStartupApp(name, source, enable) {
  try {
    if (source === "registry") {
      if (enable) {
        const disabled = await regQuery(DISABLED_RUN_KEY);
        const entry = disabled[name];
        if (!entry) return { ok: false, error: "not-found" };
        await regAdd(RUN_KEY, name, entry.type, entry.value);
        await regDelete(DISABLED_RUN_KEY, name);
      } else {
        const active = await regQuery(RUN_KEY);
        const entry = active[name];
        if (!entry) return { ok: false, error: "not-found" };
        await regAdd(DISABLED_RUN_KEY, name, entry.type, entry.value);
        await regDelete(RUN_KEY, name);
      }
      return { ok: true };
    }
    if (source === "folder") {
      const folder = getStartupFolder();
      const activePath = path.join(folder, `${name}.lnk`);
      const disabledPath = path.join(folder, `${name}.lnk.disabled`);
      fs.renameSync(enable ? disabledPath : activePath, enable ? activePath : disabledPath);
      return { ok: true };
    }
    return { ok: false, error: "unknown-source" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// --- Binds (global hotkey -> types fixed text, Pro) ---

async function typeBindText(text) {
  try {
    await keyboard.type(text);
  } catch (e) {
    console.error("Не удалось напечатать текст бинда:", e.message);
  }
}

// --- Window / tray ---

function createWindow(startHidden) {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 720,
    minWidth: 560,
    minHeight: 480,
    show: !startHidden,
    icon: path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  let trayHintShown = false;
  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
      if (!trayHintShown && Notification.isSupported()) {
        trayHintShown = true;
        new Notification({
          title: "МультиТул продолжает работать",
          body: "Окно свёрнуто в трей (значок рядом с часами). Чтобы закрыть совсем — правый клик по значку → «Выход».",
        }).show();
      }
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: "Показать окно", click: () => mainWindow.show() },
    { label: running ? "Стоп" : "Старт", click: () => toggleClicking() },
    { type: "separator" },
    {
      label: "Перезапустить",
      click: () => {
        app.relaunch();
        app.isQuiting = true;
        app.quit();
      },
    },
    {
      label: "Выход",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("МультиТул");
  tray.on("click", () => mainWindow.show());
  updateTrayMenu();
}

// --- Global hotkeys ---

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const settings = store.getAll();

  if (settings.hotkey) {
    try {
      globalShortcut.register(settings.hotkey, () => toggleClicking());
    } catch (e) {
      console.error("Не удалось зарегистрировать хоткей старт/стоп:", e.message);
    }
  }
  if (settings.panicHotkey) {
    try {
      globalShortcut.register(settings.panicHotkey, () => stopClicking("Остановлено аварийным хоткеем"));
    } catch (e) {
      console.error("Не удалось зарегистрировать аварийный хоткей:", e.message);
    }
  }
  if (settings.recordHotkey) {
    try {
      globalShortcut.register(settings.recordHotkey, () => {
        if (!recording) return;
        const events = stopRecordingInternal();
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("recording:stopped", events);
        }
      });
    } catch (e) {
      console.error("Не удалось зарегистрировать хоткей остановки записи:", e.message);
    }
  }

  if (proUnlocked) {
    for (const bind of settings.binds || []) {
      if (!bind.hotkey || !bind.text) continue;
      try {
        globalShortcut.register(bind.hotkey, () => typeBindText(bind.text));
      } catch (e) {
        console.error(`Не удалось зарегистрировать бинд "${bind.hotkey}":`, e.message);
      }
    }
  }
}

// --- IPC ---

ipcMain.handle("settings:get", async () => {
  const result = await refreshLicense();
  return { settings: store.getAll(), proUnlocked: result.valid };
});

ipcMain.handle("settings:set", (event, partial) => {
  store.set(partial);
  registerShortcuts();
  if ("launchOnStartup" in partial) {
    app.setLoginItemSettings({ openAtLogin: partial.launchOnStartup });
  }
  if ("mode" in partial || "sequencePoints" in partial) {
    refreshSeqMarkers();
  }
  return store.getAll();
});

ipcMain.handle("license:verify", async (event, key) => {
  store.set({ licenseKey: key });
  const result = await refreshLicense();
  return result;
});

ipcMain.handle("system:getMachineId", () => getMachineId());

ipcMain.handle("click:toggle", () => toggleClicking());
ipcMain.handle("click:status", () => ({ running, clickCount: sessionClicks }));
ipcMain.handle("point:pick", () => pickPoint());
ipcMain.handle("key:capture", () => captureNextKey());

ipcMain.handle("color:sample", async (event, point) => {
  try {
    const c = await nutScreen.colorAt(new Point(point.x, point.y));
    return { r: c.R, g: c.G, b: c.B };
  } catch (e) {
    return null;
  }
});

ipcMain.handle("donate:open", () => {
  if (!DONATE_URL) return { ok: false, error: "not-configured" };
  shell.openExternal(DONATE_URL);
  return { ok: true };
});

ipcMain.handle("schedule:set", (event, hhmm) => {
  if (!proUnlocked) return { scheduledAt: null, error: "pro-required" };
  if (scheduledTimerId) {
    clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
  }
  if (!hhmm) {
    scheduledAt = null;
    return { scheduledAt: null };
  }
  const [h, m] = hhmm.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  scheduledAt = target.getTime();
  scheduledTimerId = setTimeout(() => {
    scheduledTimerId = null;
    scheduledAt = null;
    startClicking();
  }, scheduledAt - Date.now());
  return { scheduledAt };
});

ipcMain.handle("schedule:cancel", () => {
  if (scheduledTimerId) {
    clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
  }
  scheduledAt = null;
  return { scheduledAt: null };
});

ipcMain.handle("macro:startRecording", () => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  return startRecording();
});

ipcMain.handle("macro:stopRecording", () => {
  const events = stopRecordingInternal();
  return { events };
});

ipcMain.handle("macro:save", (event, name, events, repeat) => {
  if (!name || !events || !events.length) return store.get("macros");
  const macros = { ...store.get("macros"), [name]: { events, repeat: Math.max(1, Math.min(50, repeat || 1)) } };
  store.set({ macros });
  return macros;
});

ipcMain.handle("macro:play", async (event, name) => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  const macros = store.get("macros") || {};
  const raw = macros[name];
  if (!raw) return { ok: false };
  const { events, repeat } = normalizeMacro(raw);
  playMacro(events, repeat);
  return { ok: true };
});

ipcMain.handle("macro:delete", (event, name) => {
  const macros = { ...store.get("macros") };
  delete macros[name];
  store.set({ macros });
  return macros;
});

ipcMain.handle("macro:update", (event, oldName, newName, repeat) => {
  const macros = { ...store.get("macros") };
  const raw = macros[oldName];
  if (!raw) return macros;
  const normalized = normalizeMacro(raw);
  normalized.repeat = Math.max(1, Math.min(50, repeat || 1));
  delete macros[oldName];
  macros[newName || oldName] = normalized;
  store.set({ macros });
  return macros;
});

ipcMain.handle("startup:list", () => listStartupApps());

ipcMain.handle("startup:toggle", (event, name, source, enable) => toggleStartupApp(name, source, enable));

ipcMain.handle("ocr:capture", async () => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  const region = await pickRegion();
  if (!region || region.width < 4 || region.height < 4) return { ok: false, error: "cancelled" };
  const lang = store.get("ocrLang") || "rus+eng";
  return runOcr(region, lang);
});

ipcMain.handle("settings:export", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Экспорт настроек",
    defaultPath: "autoclicker-settings.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };

  const settings = store.getAll();
  const exportData = { profiles: settings.profiles, macros: settings.macros, binds: settings.binds };
  for (const field of PROFILE_FIELDS) exportData[field] = settings[field];

  fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2));
  return { ok: true };
});

ipcMain.handle("settings:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Импорт настроек",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };

  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], "utf8"));
    const partial = {};
    for (const field of PROFILE_FIELDS) {
      if (field in data) partial[field] = data[field];
    }
    if (data.profiles && typeof data.profiles === "object") {
      partial.profiles = { ...store.get("profiles"), ...data.profiles };
    }
    if (data.macros && typeof data.macros === "object") {
      partial.macros = { ...store.get("macros"), ...data.macros };
    }
    if (Array.isArray(data.binds)) {
      partial.binds = data.binds;
    }
    store.set(partial);
    registerShortcuts();
    return { ok: true, settings: store.getAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- Lifecycle ---

app.whenReady().then(async () => {
  store = new Store(path.join(app.getPath("userData"), "settings.json"));
  await refreshLicense();
  app.setLoginItemSettings({ openAtLogin: !!store.get("launchOnStartup") });

  const loginInfo = app.getLoginItemSettings();
  const startHidden = loginInfo.wasOpenedAtLogin && store.get("launchMinimized");

  createWindow(startHidden);
  createTray();
  registerShortcuts();
  refreshSeqMarkers();
});

app.on("window-all-closed", () => {
  // Приложение живёт в трее — не закрываем по крестику на окне.
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (recording) stopRecordingInternal();
});
