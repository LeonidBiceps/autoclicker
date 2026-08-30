const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, dialog, shell } = require("electron");

// Заполни своей страницей (Boosty, DonationAlerts и т.п. — то, что реально работает из России).
// Пустая строка = кнопка доната покажет честное сообщение «ссылка ещё не настроена», а не тихо
// откроет пустоту или чужую страницу.
const DONATE_URL = "";
const path = require("path");
const fs = require("fs");
const { Store, PROFILE_FIELDS } = require("./store");
const { verifyLicenseKey, getMachineId } = require("./license");
const { mouse, keyboard, Point, Button } = require("@nut-tree-fork/nut-js");
const { uIOhook } = require("uiohook-napi");
const { keycodeToName, resolveNutjsKey } = require("./keymap");

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
      await performClick();
    } catch (e) {
      stopClicking(`Ошибка: ${e.message}`);
      return;
    }
    sessionClicks++;
    sendStatus();
    updateHud(`● ${sessionClicks} кликов`);
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

// --- Macro recording (mouse clicks only, v1) ---

function onRecordClick(e) {
  recordedEvents.push({ x: Math.round(e.x), y: Math.round(e.y), t: Date.now() - recordStartTime });
}

function startRecording() {
  if (recording) return;
  recording = true;
  recordedEvents = [];
  recordStartTime = Date.now();
  uIOhook.on("click", onRecordClick);
  uIOhook.start();
}

function stopRecordingInternal() {
  if (!recording) return [];
  recording = false;
  uIOhook.stop();
  uIOhook.removeListener("click", onRecordClick);
  return recordedEvents;
}

async function playMacro(events) {
  let prevT = 0;
  for (const ev of events) {
    const delay = Math.min(3000, Math.max(0, ev.t - prevT));
    await sleep(delay);
    await mouse.setPosition(new Point(ev.x, ev.y));
    await mouse.click(Button.LEFT);
    prevT = ev.t;
  }
}

// --- Window / tray ---

function createWindow(startHidden) {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 860,
    show: !startHidden,
    icon: path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
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
  tray.setToolTip("Автокликер");
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
  startRecording();
  return { ok: true };
});

ipcMain.handle("macro:stopRecording", () => {
  const events = stopRecordingInternal();
  return { events };
});

ipcMain.handle("macro:save", (event, name, events) => {
  if (!name || !events || !events.length) return store.get("macros");
  const macros = { ...store.get("macros"), [name]: events };
  store.set({ macros });
  return macros;
});

ipcMain.handle("macro:play", async (event, name) => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  const macros = store.get("macros") || {};
  const events = macros[name];
  if (!events) return { ok: false };
  playMacro(events);
  return { ok: true };
});

ipcMain.handle("macro:delete", (event, name) => {
  const macros = { ...store.get("macros") };
  delete macros[name];
  store.set({ macros });
  return macros;
});

ipcMain.handle("settings:export", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Экспорт настроек",
    defaultPath: "autoclicker-settings.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };

  const settings = store.getAll();
  const exportData = { profiles: settings.profiles, macros: settings.macros };
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
