const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, screen, nativeImage, dialog, shell, Notification, session, desktopCapturer, powerMonitor, clipboard } = require("electron");

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
const { pathToFileURL } = require("url");
const { execFile } = require("child_process");
const { Store, PROFILE_FIELDS } = require("./store");
const { verifyLicenseKey, getMachineId } = require("./license");
const { mouse, keyboard, screen: nutScreen, Point, Button, Region, FileType, getActiveWindow, imageResource, providerRegistry } = require("@nut-tree-fork/nut-js");
const { JimpImageFinder } = require("./image-finder");
const { uIOhook } = require("uiohook-napi");
const { keycodeToName, resolveNutjsKey } = require("./keymap");
const Tesseract = require("tesseract.js");

mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

// В турбо-режиме кликер вызывает click()/pressKey()/releaseKey() чаще, чем что-либо ещё в этом
// файле, поэтому именно здесь имеет смысл срезать последний лишний слой: у mouse.click()/
// mouse.doubleClick()/keyboard.pressKey()/keyboard.releaseKey() (обёртки nut-js) ПЕРЕД самим
// нативным вызовом всегда стоит `await sleep(this.config.autoDelayMs)` — и даже когда autoDelayMs
// уже обнулён (см. выше), это всё равно один реальный `setTimeout(fn, 0)`, то есть лишний проход
// через таймер-хип event loop'а на каждый клик. Внутри же сам providerRegistry.getMouse()/
// getKeyboard() — это уже голый нативный биндинг (`libnut.mouseClick(...)` и т.п.) без единой
// задержки. Идём напрямую к нему в горячем пути (clickButton/performClick), а не через обёртку —
// это не требует переписывать сам nut-js.
const nativeMouse = providerRegistry.getMouse();
const nativeKeyboard = providerRegistry.getKeyboard();

// Следующий рывок после прямого нативного биндинга выше — уже не в самом клике (там уже нечего
// ускорять), а в JS/event-loop накладных расходах ВОКРУГ него: несколько await на тик, планирование
// следующего тика через setImmediate. Настоящий выигрыш даёт перенос ВСЕГО цикла кликов в нативный
// код (см. native-clicker/), а не замена одного нативного вызова на другой — JS вызывается один раз
// на старте burst'а и один раз на остановке, а не сотни/тысячи раз в секунду. См. startNativeTurbo().
// Модуль опционален: если файл не собран под текущую платформу — просто нет нативного турбо-режима,
// обычный (JS) турбо-режим работает как и раньше.
let nativeClicker = null;
try {
  nativeClicker = require("./native-clicker/native-clicker.win32-x64-msvc.node");
} catch (e) {
  nativeClicker = null;
}

const FREE_SESSION_CLICK_CAP = 5000;

let store;
let mainWindow = null;
let tray = null;
let hudWindow = null;
let seqMarkerWindows = [];
let running = false;
let proUnlocked = false;
let timerId = null;
let nativeBurstActive = false;
let nativeBurstStatusTimer = null;
let sessionClicks = 0;
let sessionStartedAt = 0;
let sequenceIndex = 0;
let scheduledTimerId = null;
let scheduledAt = null;
let scheduledHhmm = null;
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

function applyJitter(point, settings) {
  if (!proUnlocked || settings.positionJitterPx <= 0) return point;
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * settings.positionJitterPx;
  return {
    x: Math.round(point.x + Math.cos(angle) * r),
    y: Math.round(point.y + Math.sin(angle) * r),
  };
}

async function clickButton(settings) {
  if (settings.button === "right") {
    await nativeMouse.click(Button.RIGHT);
  } else if (settings.button === "double") {
    await nativeMouse.doubleClick(Button.LEFT);
  } else {
    await nativeMouse.click(Button.LEFT);
  }
}

async function performClick() {
  const settings = store.getAll();

  if (settings.actionType === "keyboard") {
    const key = resolveNutjsKey(settings.keyToPress);
    await nativeKeyboard.pressKey(key);
    await nativeKeyboard.releaseKey(key);
    return;
  }

  // Pro: вместо обхода последовательности по одной точке за тик — на каждый тик жмём сразу во ВСЕ
  // сохранённые точки подряд (например, несколько кнопок одного действия на экране, которые нужно
  // нажать все разом, а не одну за другой в течение нескольких тиков интервала).
  if (settings.mode === "sequence" && proUnlocked && settings.sequenceClickAll && settings.sequencePoints.length > 0) {
    for (const rawPoint of settings.sequencePoints) {
      const point = applyJitter(rawPoint, settings);
      await mouse.setPosition(new Point(point.x, point.y));
      await clickButton(settings);
    }
    return;
  }

  let point = getMouseTargetPoint(settings);
  const jitterActive = proUnlocked && settings.positionJitterPx > 0;

  // В режиме "по курсору" без разброса позиции точка не нужна вообще — курсор и так уже стоит
  // там, где надо, а getPosition()+setPosition() это два лишних нативных вызова на каждый клик
  // (setPosition() ставил курсор туда же, где он и был). В турбо-режиме это заметно на скорости.
  if (point || jitterActive) {
    if (!point) {
      const current = await mouse.getPosition();
      point = { x: current.x, y: current.y };
    }
    point = applyJitter(point, settings);
    await mouse.setPosition(new Point(point.x, point.y));
  }

  await clickButton(settings);
}

// --- Color trigger (click only when a watched pixel matches a target color, Pro) ---

let colorTriggerLastMatch = false;

async function colorConditionMet(settings) {
  const trigger = settings.colorTrigger;
  if (!proUnlocked || !trigger || !trigger.enabled || !trigger.point || !trigger.color) return true;
  try {
    const sample = await nutScreen.colorAt(new Point(trigger.point.x, trigger.point.y));
    const dr = sample.R - trigger.color.r;
    const dg = sample.G - trigger.color.g;
    const db = sample.B - trigger.color.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const matched = distance <= trigger.tolerance;
    if (matched && !colorTriggerLastMatch && store.get("telegramOnTrigger")) {
      notifyTelegram("🎯 Триггер по цвету сработал");
    }
    colorTriggerLastMatch = matched;
    return matched;
  } catch (e) {
    return true; // не блокируем клики, если чтение экрана не удалось
  }
}

// --- Привязка к окну (клик срабатывает только пока активно нужное окно) ---

async function windowFocusConditionMet(settings) {
  const title = (settings.targetWindowTitle || "").trim();
  if (!title) return true;
  try {
    const active = await getActiveWindow();
    const activeTitle = await active.title;
    return activeTitle.toLowerCase().includes(title.toLowerCase());
  } catch (e) {
    return true; // не блокируем клики, если не удалось прочитать активное окно
  }
}

// --- "Дождаться текста" — клик только когда в заданной области экрана появился нужный текст (Pro) ---
//
// OCR — тяжёлая операция (доли секунды), гонять его на каждый тик клика (может быть каждые 50мс)
// нельзя — поэтому опрашиваем область РЕЖЕ, в отдельном таймере, и кэшируем последний результат.
// Сам клик каждый раз просто читает кэш (мгновенно), а не ждёт OCR.

let textTriggerLastMatch = true;
let textTriggerPolling = false;
let textTriggerTimer = null;

// Настройки триггера читаем заново на каждый опрос (а не один раз при запуске цикла) — иначе
// изменение области/образца/порога во вкладке «Клик», пока кликер уже работает, тихо игнорировалось
// бы до перезапуска (был реальный баг: обновлённая на лету настройка триггера не подхватывалась).
async function pollTextTrigger() {
  if (textTriggerPolling) return;
  const trigger = store.get("textTrigger");
  if (!proUnlocked || !trigger || !trigger.enabled || !trigger.region || !trigger.expectedText) return;
  textTriggerPolling = true;
  try {
    const result = await runOcr(trigger.region, trigger.lang || "rus+eng");
    if (result.ok) {
      const text = (result.text || "").toLowerCase();
      const matched = text.includes((trigger.expectedText || "").toLowerCase());
      if (matched && !textTriggerLastMatch && store.get("telegramOnTrigger")) {
        notifyTelegram("🎯 Триггер по тексту сработал");
      }
      textTriggerLastMatch = matched;
    }
    // при неудачном OCR намеренно не трогаем textTriggerLastMatch — единичный сбой не должен
    // мгновенно перекрыть клики, которые до этого честно шли
  } finally {
    textTriggerPolling = false;
  }
}

function startTextTriggerPolling() {
  stopTextTriggerPolling();
  textTriggerLastMatch = false; // до первого успешного опроса — считаем, что текста ещё нет
  pollTextTrigger();
  textTriggerTimer = setInterval(() => pollTextTrigger(), 1500);
}

function stopTextTriggerPolling() {
  if (textTriggerTimer) clearInterval(textTriggerTimer);
  textTriggerTimer = null;
}

function textConditionMet(settings) {
  const trigger = settings.textTrigger;
  if (!proUnlocked || !trigger || !trigger.enabled || !trigger.region || !trigger.expectedText) return true;
  return textTriggerLastMatch;
}

// --- "Триггер по картинке" — клик только когда на экране найден сохранённый образец (Pro) ---
//
// nut-js сам по себе НЕ ищет картинку на экране "из коробки" — начиная с v4 это вынесено в
// отдельный ImageFinder-провайдер, а готового провайдера ни под этот форк (@nut-tree-fork/*),
// ни под оригинальный (@nut-tree/*) на npm нет. Поэтому используем свой матчер на jimp без
// нативных зависимостей (см. image-finder.js), зарегистрированный через providerRegistry в
// app.whenReady(). Как и текстовый триггер — опрашивается редко, в фоне, не на каждый тик
// клика (поиск по шаблону не бесплатный).

function getImageTemplatesDir() {
  const dir = path.join(app.getPath("userData"), "image-templates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let imageTriggerLastMatch = true;
let imageTriggerPolling = false;
let imageTriggerTimer = null;

// Как и текстовый триггер (см. pollTextTrigger) — настройки читаем заново на каждый опрос, а не
// один раз при запуске цикла, чтобы изменение образца/порога на лету реально применялось.
async function pollImageTrigger() {
  if (imageTriggerPolling) return;
  const trigger = store.get("imageTrigger");
  if (!proUnlocked || !trigger || !trigger.enabled || !trigger.templateFile) return;
  imageTriggerPolling = true;
  try {
    await nutScreen.find(imageResource(trigger.templateFile), { confidence: trigger.confidence || 0.9 });
    if (!imageTriggerLastMatch && store.get("telegramOnTrigger")) {
      notifyTelegram("🎯 Триггер по картинке сработал");
    }
    imageTriggerLastMatch = true;
  } catch (e) {
    // find() отклоняет промис, если картинка не найдена на экране — это ожидаемый штатный случай,
    // не ошибка, поэтому здесь ничего не логируем
    imageTriggerLastMatch = false;
  } finally {
    imageTriggerPolling = false;
  }
}

function startImageTriggerPolling() {
  stopImageTriggerPolling();
  imageTriggerLastMatch = false;
  pollImageTrigger();
  imageTriggerTimer = setInterval(() => pollImageTrigger(), 1500);
}

function stopImageTriggerPolling() {
  if (imageTriggerTimer) clearInterval(imageTriggerTimer);
  imageTriggerTimer = null;
}

function imageConditionMet(settings) {
  const trigger = settings.imageTrigger;
  if (!proUnlocked || !trigger || !trigger.enabled || !trigger.templateFile) return true;
  return imageTriggerLastMatch;
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

// Раз в сколько кликов обновлять HUD/статус/меню трея в турбо-режиме — на сотнях кликов в секунду
// делать это на каждый тик означало бы гонять IPC в HUD-окно и пересобирать меню трея сотни раз в
// секунду, а это не бесплатно и реально тормозит именно турбо-режим, который весь смысл имеет в
// максимальной скорости. В обычном режиме (клики и так редкие) частота не меняется.
const TURBO_STATUS_THROTTLE = 20;

function scheduleNext() {
  if (!running) return;
  const settings = store.getAll();
  const turbo = proUnlocked && settings.turboMode;

  const tick = async () => {
    try {
      const canClick =
        (await windowFocusConditionMet(settings)) &&
        (await colorConditionMet(settings)) &&
        textConditionMet(settings) &&
        imageConditionMet(settings);
      if (canClick) {
        await performClick();
        sessionClicks++;
        if (!turbo || sessionClicks % TURBO_STATUS_THROTTLE === 0) {
          updateHud(`● ${sessionClicks} кликов`);
        }
      }
    } catch (e) {
      stopClicking(`Ошибка: ${e.message}`);
      return;
    }
    if (!turbo || sessionClicks % TURBO_STATUS_THROTTLE === 0) sendStatus();
    if (!checkAutoStop(settings)) scheduleNext();
  };

  if (turbo) {
    // setImmediate вместо setTimeout(fn, 0) — на Windows таймеры libuv квантуются под системную
    // гранулярность (обычно ~15мс), а setImmediate выполняется сразу после текущей фазы цикла
    // событий, без ожидания таймера. В турбо-режиме, где вся цель — максимальная скорость, это
    // даёт заметный прирост кликов в секунду.
    timerId = setImmediate(tick);
  } else {
    const jitter = settings.jitterMs > 0 ? (Math.random() * 2 - 1) * settings.jitterMs : 0;
    const delay = Math.max(10, settings.intervalMs + jitter);
    timerId = setTimeout(tick, delay);
  }
}

// Нативный турбо годится только для самого простого случая — чистый спам-клик мышью без ничего
// сверху. Всё, что требует принятия решения НА КАЖДЫЙ клик (условие триггера, следующая точка
// последовательности, случайный разброс позиции), нативный burst сделать не может — он крутится
// сам по себе в отдельном потоке, JS не участвует, пока не позовут stopBurst(). В любом из этих
// случаев тихо остаёмся на обычном (JS) турбо-режиме — никакого предупреждения не нужно, разница
// не в корректности, а только в скорости.
function canUseNativeTurbo(settings) {
  if (!nativeClicker || !proUnlocked || !settings.turboMode || !settings.nativeTurboMode) return false;
  if (settings.actionType !== "mouse" || settings.button === "double") return false;
  if (settings.mode === "sequence") return false;
  if (settings.positionJitterPx > 0) return false;
  if (settings.colorTrigger && settings.colorTrigger.enabled) return false;
  if (settings.textTrigger && settings.textTrigger.enabled) return false;
  if (settings.imageTrigger && settings.imageTrigger.enabled) return false;
  if ((settings.targetWindowTitle || "").trim()) return false;
  if (settings.mode === "point" && !settings.fixedPoint) return false;
  return true;
}

function startNativeTurbo(settings) {
  const action = settings.button === "right" ? "mouse-right" : "mouse-left";
  const durationMs = settings.stopAfterMs > 0 ? settings.stopAfterMs : 0;
  const beginBurst = () => {
    nativeClicker.startBurst(action, 0, 0, durationMs);
    nativeBurstActive = true;
    // Опрашиваем счётчик редко (не на каждый клик — их сотни/тысячи в секунду, сам смысл нативного
    // режима как раз в том, чтобы JS в это не лез) — только чтобы обновлять HUD и проверять лимиты
    // остановки. Из-за этого лимит "остановить после N кликов" в нативном режиме может немного
    // "перебрать" (до нескольких сотен кликов сверху при таких скоростях) —цена простоты, турбо и
    // так не про точность, а про скорость.
    nativeBurstStatusTimer = setInterval(() => {
      sessionClicks = nativeClicker.getBurstCount();
      updateHud(`● ${sessionClicks} кликов`);
      sendStatus();
      if (settings.stopAfterClicks > 0 && sessionClicks >= settings.stopAfterClicks) {
        stopClicking("Остановлено: набран лимит кликов");
      } else if (!nativeClicker.isBurstRunning()) {
        stopClicking(durationMs > 0 ? "Остановлено: вышло время" : undefined);
      }
    }, 200);
  };
  if (settings.mode === "point" && settings.fixedPoint) {
    mouse.setPosition(new Point(settings.fixedPoint.x, settings.fixedPoint.y)).then(beginBurst);
  } else {
    beginBurst();
  }
}

function finishNativeTurbo() {
  if (!nativeBurstActive) return;
  sessionClicks = nativeClicker.stopBurst();
  if (nativeBurstStatusTimer) clearInterval(nativeBurstStatusTimer);
  nativeBurstStatusTimer = null;
  nativeBurstActive = false;
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
  if (canUseNativeTurbo(settings)) {
    startNativeTurbo(settings);
  } else {
    // Опрос всегда запускается на весь сеанс клика, а не только когда триггер включён в этот момент —
    // сам опрос дешёвый (проверяет настройки и сразу выходит, если триггер выключен), а взамен
    // включение/изменение триггера прямо во время работы кликера подхватывается само, без рестарта.
    startTextTriggerPolling();
    startImageTriggerPolling();
    scheduleNext();
  }
  logActivity("🟢 Кликер запущен");
  notifyTelegram("🟢 Кликер запущен");
}

function stopClicking(note) {
  running = false;
  clearTimeout(timerId);
  clearImmediate(timerId);
  finishNativeTurbo();
  stopTextTriggerPolling();
  stopImageTriggerPolling();
  sendStatus();
  destroyHud();
  if (note) sendNote(note);
  logActivity(note ? `🔴 Кликер остановлен: ${note}` : "🔴 Кликер остановлен");
  notifyTelegram(note ? `🔴 Кликер остановлен: ${note}` : "🔴 Кликер остановлен");
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

// Монитор для записи хранится по id (screen.getAllDisplays()[i].id), не по индексу массива —
// desktopCapturer.getSources() и screen.getAllDisplays() не гарантируют одинаковый порядок,
// поэтому сопоставлять их можно только через стабильный id, а не позицию в списке (проверено
// вживую: индексы реально не совпадали на этой двухмониторной машине).
function getRecordDisplay() {
  const id = store.get("recordMonitorId");
  if (id == null) return screen.getPrimaryDisplay();
  return screen.getAllDisplays().find((d) => d.id === id) || screen.getPrimaryDisplay();
}

// --- HUD "идёт запись" (независим от счётчика кликов выше) ---

let recordHudWindow = null;

function createRecordHud() {
  if (recordHudWindow) return;
  if (!store.get("recordIndicatorEnabled")) return;
  const target = getRecordDisplay();
  recordHudWindow = new BrowserWindow({
    x: target.bounds.x + target.bounds.width - 100,
    y: target.bounds.y + 16,
    width: 84,
    height: 32,
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
  recordHudWindow.setIgnoreMouseEvents(true);
  recordHudWindow.setAlwaysOnTop(true, "screen-saver");
  recordHudWindow.loadFile(path.join(__dirname, "renderer", "record-hud.html"));
  recordHudWindow.once("ready-to-show", () => recordHudWindow && recordHudWindow.show());
}

function destroyRecordHud() {
  if (recordHudWindow) {
    recordHudWindow.close();
    recordHudWindow = null;
  }
}

// --- Журнал активности: краткая история значимых событий (для отладки автоматизации) ---
// Храним последние 100 записей в settings.json — этого достаточно, чтобы понять, что произошло,
// пока не смотрел на экран, не разрастаясь бесконечно с каждым запуском.

// --- Проверка обновлений: просто ссылка, без автозагрузки/установки ---
//
// Раньше был баннер, который "выглядел плохо" — сейчас просто кладём результат в переменную и
// показываем маленькую строку-ссылку на Главной, если версия новее. Тот же источник (GitHub
// releases), что уже используют браузерные расширения для своей проверки обновлений.

let latestUpdateInfo = null;

function isNewerVersion(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch("https://api.github.com/repos/LeonidBiceps/autoclicker/releases/latest");
    if (!res.ok) return;
    const data = await res.json();
    const latestVersion = (data.tag_name || "").replace(/^v/, "");
    const current = app.getVersion();
    if (latestVersion && isNewerVersion(latestVersion, current)) {
      latestUpdateInfo = { available: true, latestVersion, url: data.html_url };
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("update:available", latestUpdateInfo);
      }
    }
  } catch (e) {
    // нет интернета/GitHub недоступен — тихо, не мешаем работе приложения
  }
}

function logActivity(message) {
  if (!store) return;
  const log = [...(store.get("activityLog") || []), { ts: Date.now(), message }].slice(-100);
  store.set({ activityLog: log });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("activity:new", { ts: Date.now(), message });
  }
}

// --- Уведомления в Telegram (Pro) — на старт/стоп кликера, чтобы знать, что происходит, пока
// не смотришь на экран (дальний фарм). Через обычный Bot API, без библиотек — global fetch есть
// в Node/Electron этой версии из коробки. Молча проглатываем сетевые ошибки — уведомление не
// должно ронять или тормозить сам автокликер.
async function notifyTelegram(text) {
  if (!store || !proUnlocked) return;
  const settings = store.getAll();
  if (!settings.telegramEnabled || !settings.telegramBotToken || !settings.telegramChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: settings.telegramChatId, text: `МультиТул: ${text}` }),
    });
  } catch (e) {
    // нет интернета/неверный токен — не мешаем автоматизации работать дальше
  }
}

// --- Менеджер буфера обмена: история скопированного текста ---
//
// Electron не даёт подписаться на "буфер обмена изменился" напрямую — опрашиваем clipboard.readText()
// по таймеру (как и везде в этом файле, где нет события от ОС) и добавляем в историю только при
// реальном изменении текста, без дублей подряд.

let clipboardPollTimer = null;
let lastClipboardText = null;

function clipboardPollTick() {
  try {
    const text = clipboard.readText();
    if (text && text !== lastClipboardText) {
      lastClipboardText = text;
      const history = [...(store.get("clipboardHistory") || []), { ts: Date.now(), text }].slice(-50);
      store.set({ clipboardHistory: history });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("clipboard:new", { ts: Date.now(), text });
      }
    }
  } catch (e) {
    // буфер обмена временно занят другим процессом — пропускаем тик, не страшно
  }
  clipboardPollTimer = setTimeout(clipboardPollTick, 1000);
}

function startClipboardPolling() {
  if (clipboardPollTimer) return;
  lastClipboardText = clipboard.readText();
  clipboardPollTimer = setTimeout(clipboardPollTick, 1000);
}

function stopClipboardPolling() {
  if (clipboardPollTimer) clearTimeout(clipboardPollTimer);
  clipboardPollTimer = null;
}

// --- Плавающие заметки (Sticky Notes) — бесплатно, без лимита ---
//
// Каждая заметка — своё отдельное окно (frame:false, alwaysOnTop), а не одна общая панель с
// вкладками — так их можно свободно раскидать по экрану(-ам), как настоящие бумажные стикеры.
// Какая заметка открыта в конкретном окне main-процесс знает по webContents.id (noteWindowIdMap),
// а не по параметру в URL — не завязано на то, что рендерер честно вернёт свой же id обратно.

const NOTE_COLORS = ["#fff59d", "#f8bbd0", "#b3e5fc", "#c8e6c9", "#e1bee7", "#ffccbc"];
const NOTE_DEFAULT_WIDTH = 220;
const NOTE_DEFAULT_HEIGHT = 260; // выше, чем раньше, — теперь есть ещё строка тулбара форматирования

const noteWindows = new Map(); // id -> BrowserWindow
const noteWindowIdMap = new Map(); // webContents.id -> note id

function clampNoteBounds(bounds) {
  // Если экран, на котором лежала заметка, отключили (например, был подключён второй монитор, а
  // теперь ноутбук работает один) — не даём заметке потеряться за пределами всех текущих дисплеев.
  const displays = screen.getAllDisplays();
  const onAnyDisplay = displays.some((d) => {
    const b = d.bounds;
    return bounds.x + bounds.width > b.x && bounds.x < b.x + b.width && bounds.y + bounds.height > b.y && bounds.y < b.y + b.height;
  });
  if (onAnyDisplay) return bounds;
  const primary = screen.getPrimaryDisplay().bounds;
  return { ...bounds, x: primary.x + 40, y: primary.y + 40 };
}

function persistNoteBounds(id, winBounds) {
  const notes = store.get("stickyNotes") || [];
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const updated = [...notes];
  updated[idx] = { ...updated[idx], x: winBounds.x, y: winBounds.y, width: winBounds.width, height: winBounds.height };
  store.set({ stickyNotes: updated });
}

function notifyNotesChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("notes:changed", store.get("stickyNotes") || []);
  }
}

function createStickyNoteWindow(note) {
  const bounds = clampNoteBounds({
    x: note.x,
    y: note.y,
    width: note.width || NOTE_DEFAULT_WIDTH,
    height: note.height || NOTE_DEFAULT_HEIGHT,
  });
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 140,
    minHeight: 120,
    frame: false,
    resizable: true,
    alwaysOnTop: note.pinned !== false, // по умолчанию закреплена (поверх всех окон), как и раньше
    skipTaskbar: false,
    hasShadow: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "sticky-note-preload.js"),
    },
  });
  const webContentsId = win.webContents.id; // захватываем до закрытия — в 'closed' webContents уже уничтожен
  noteWindows.set(note.id, win);
  noteWindowIdMap.set(webContentsId, note.id);
  win.loadFile(path.join(__dirname, "renderer", "sticky-note.html"));

  let boundsSaveTimer = null;
  const scheduleBoundsSave = () => {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(() => {
      if (!win.isDestroyed()) persistNoteBounds(note.id, win.getBounds());
    }, 400);
  };
  win.on("move", scheduleBoundsSave);
  win.on("resize", scheduleBoundsSave);
  win.on("closed", () => {
    noteWindows.delete(note.id);
    noteWindowIdMap.delete(webContentsId);
  });
  return win;
}

function createStickyNote() {
  const existing = store.get("stickyNotes") || [];
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const offset = (existing.length % 8) * 24;
  const primary = screen.getPrimaryDisplay().bounds;
  const note = {
    id,
    text: "",
    color: NOTE_COLORS[existing.length % NOTE_COLORS.length],
    x: primary.x + 80 + offset,
    y: primary.y + 80 + offset,
    width: NOTE_DEFAULT_WIDTH,
    height: NOTE_DEFAULT_HEIGHT,
  };
  store.set({ stickyNotes: [...existing, note] });
  createStickyNoteWindow(note);
  notifyNotesChanged();
  return note;
}

function getStickyNoteImagesDir(noteId) {
  const dir = path.join(app.getPath("userData"), "sticky-note-images", noteId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function deleteStickyNote(id) {
  const win = noteWindows.get(id);
  if (win && !win.isDestroyed()) win.close(); // сам уберёт себя из noteWindows через 'closed'
  const notes = (store.get("stickyNotes") || []).filter((n) => n.id !== id);
  store.set({ stickyNotes: notes });
  fs.rm(path.join(app.getPath("userData"), "sticky-note-images", id), { recursive: true, force: true }, () => {}); // вставленные картинки этой заметки больше никому не нужны
  notifyNotesChanged();
}

function showStickyNote(id) {
  const win = noteWindows.get(id);
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.setBounds(clampNoteBounds(win.getBounds()));
  win.show();
  win.focus();
}

function restoreStickyNotes() {
  for (const note of store.get("stickyNotes") || []) {
    createStickyNoteWindow(note);
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

// --- Multi-point picking (multi-monitor) — тот же приём, что и pickPoint, но окна выделения не
// закрываются после первого клика: кликаешь сколько нужно точек подряд, Enter/ПКМ завершает и
// возвращает их все разом (для цепочки точек — раньше приходилось жать "Добавить точку" на каждую).
function pickPoints() {
  return new Promise((resolve) => {
    const displays = screen.getAllDisplays();
    const overlays = [];
    let done = false;
    const points = [];

    const broadcastCount = () => {
      for (const w of overlays) {
        if (!w.isDestroyed()) w.webContents.send("points:count", points.length);
      }
    };

    const cleanup = () => {
      ipcMain.removeListener("points:add", addHandler);
      ipcMain.removeListener("points:undo", undoHandler);
      ipcMain.removeListener("points:finish", finishHandler);
      ipcMain.removeListener("points:cancel", cancelHandler);
    };

    const finish = (result) => {
      if (done) return;
      done = true;
      cleanup();
      for (const w of overlays) {
        if (!w.isDestroyed()) w.close();
      }
      resolve(result);
    };

    const addHandler = (event, point) => {
      points.push(point);
      broadcastCount();
    };
    const undoHandler = () => {
      points.pop();
      broadcastCount();
    };
    const finishHandler = () => finish(points.length ? points.slice() : null);
    const cancelHandler = () => finish(null);

    ipcMain.on("points:add", addHandler);
    ipcMain.on("points:undo", undoHandler);
    ipcMain.on("points:finish", finishHandler);
    ipcMain.on("points:cancel", cancelHandler);

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
      overlay.loadFile(path.join(__dirname, "renderer", "multi-point-overlay.html"));
      overlay.webContents.once("did-finish-load", () => {
        overlay.webContents.executeJavaScript(`window.__offsetX = ${display.bounds.x}; window.__offsetY = ${display.bounds.y};`);
      });
      overlay.on("closed", () => {
        if (!done) finish(points.length ? points.slice() : null);
      });
      overlays.push(overlay);
    }
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

// --- Наблюдатель за значением на экране (Pro) ---
//
// В отличие от "Текстового триггера" (проверяет, появился ли ОЖИДАЕМЫЙ текст, чтобы разрешить
// клик), это отдельная функция: следит за ЛЮБЫМ значением в выбранной области (цена, счёт в игре,
// таймер, что угодно — работает в любом приложении, не только в браузере) и уведомляет, когда оно
// МЕНЯЕТСЯ — не важно, работает ли в этот момент сам кликер. Полностью независимый таймер.
let valueWatcherTimer = null;
let valueWatcherPolling = false;

function normalizeWatcherValue(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function valueWatcherPollTick() {
  if (valueWatcherPolling) return; // OCR — не мгновенная операция, не запускаем второй проход поверх первого
  const cfg = store.get("valueWatcher");
  if (!proUnlocked || !cfg.enabled || !cfg.region) return;
  valueWatcherPolling = true;
  try {
    const result = await runOcr(cfg.region, cfg.lang || "rus+eng");
    if (!result.ok) return;
    const value = normalizeWatcherValue(result.text);
    if (!value) return; // пустое распознавание (ничего не видно/область пуста) — не считаем это "изменением"
    const fresh = store.get("valueWatcher"); // могло измениться, пока шёл OCR (пользователь поменял настройку)
    if (value === fresh.lastValue) return;
    const previous = fresh.lastValue;
    const history = [...(fresh.history || []), { ts: Date.now(), value }].slice(-50);
    store.set({ valueWatcher: { ...fresh, lastValue: value, history } });
    notifyValueWatcher({ value, previous, at: Date.now() });
    // Первое чтение после включения — это просто база для сравнения, не "изменение", уведомлять не о чем.
    if (previous !== null) {
      logActivity(`📊 Значение изменилось: ${previous} → ${value}`);
      if (fresh.notifyTelegram) notifyTelegram(`📊 Значение изменилось: ${previous} → ${value}`);
    }
  } catch (e) {
    // сбой одного опроса не должен останавливать наблюдение целиком
  } finally {
    valueWatcherPolling = false;
  }
}

function notifyValueWatcher(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("valueWatcher:changed", payload);
}

function startValueWatcherPolling(cfg) {
  stopValueWatcherPolling();
  valueWatcherPolling = false;
  valueWatcherTimer = setInterval(valueWatcherPollTick, Math.max(3, cfg.pollIntervalSec || 15) * 1000);
  valueWatcherPollTick();
}

function stopValueWatcherPolling() {
  if (valueWatcherTimer) clearInterval(valueWatcherTimer);
  valueWatcherTimer = null;
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
  if (Array.isArray(value)) return { events: value, repeat: 1, hotkey: "" };
  return {
    events: (value && value.events) || [],
    repeat: Math.max(1, Math.min(50, (value && value.repeat) || 1)),
    hotkey: (value && value.hotkey) || "",
  };
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

// --- Анти-АФК (двигает мышь туда-сюда по таймеру, чтобы не срабатывал статус "отошёл" / блокировка экрана) ---
//
// Независим от автокликера — свой собственный таймер, свой собственный флаг. Двигаем на 1px и
// сразу обратно (а не в случайную сторону) — реальный курсор не съезжает никуда, только сам факт
// движения обновляет системный таймер бездействия.

let antiAfkTimer = null;

async function antiAfkTick() {
  try {
    const pos = await mouse.getPosition();
    await mouse.setPosition(new Point(pos.x + 1, pos.y));
    await mouse.setPosition(new Point(pos.x, pos.y));
  } catch (e) {
    // молча пропускаем один тик — например, если экран заблокирован и координаты недоступны
  }
  const sec = Math.max(5, store.get("antiAfkIntervalSec") || 45);
  antiAfkTimer = setTimeout(antiAfkTick, sec * 1000);
}

function startAntiAfk() {
  if (antiAfkTimer) return;
  antiAfkTick();
}

function stopAntiAfk() {
  if (antiAfkTimer) clearTimeout(antiAfkTimer);
  antiAfkTimer = null;
}

// --- "Обратный анти-АФК" — запустить кликер САМ после простоя (для дальнего фарма), в отличие от
// анти-АФК выше, который простою как раз мешает. powerMonitor.getSystemIdleTime() — секунды с
// последнего реального ввода с клавиатуры/мыши, штатный Electron API, не нужен uiohook.

let idleStartTimer = null;
let idleStartArmed = true; // взводится заново после того, как пользователь вернулся (идёт активность)

function idleStartTick() {
  if (!store.get("idleStartEnabled")) return;
  const idleSec = powerMonitor.getSystemIdleTime();
  const threshold = Math.max(5, store.get("idleStartThresholdSec") || 60);
  if (idleSec >= threshold) {
    if (idleStartArmed && !running) {
      idleStartArmed = false; // не перезапускать снова и снова, пока простой продолжается
      startClicking();
    }
  } else {
    idleStartArmed = true; // пользователь снова активен — следующий простой опять сработает
  }
  idleStartTimer = setTimeout(idleStartTick, 5000);
}

function startIdleStartPolling() {
  if (idleStartTimer) return;
  idleStartArmed = true;
  idleStartTick();
}

function stopIdleStartPolling() {
  if (idleStartTimer) clearTimeout(idleStartTimer);
  idleStartTimer = null;
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
  // Загрузочный экран: окно и так не мгновенно готово (нативные модули — nut-js/uiohook —
  // подключаются при старте), без сплэша был бы момент пустого/белого окна. Не показываем его при
  // тихом автозапуске в трей — незачем мигать окном, которое тут же спрячется.
  let splash = null;
  if (!startHidden) {
    splash = new BrowserWindow({
      width: 260,
      height: 260,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      icon: path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png"),
      webPreferences: { contextIsolation: true },
    });
    splash.loadFile(path.join(__dirname, "renderer", "splash.html"));
  }

  mainWindow = new BrowserWindow({
    width: 720,
    height: 720,
    minWidth: 560,
    minHeight: 480,
    show: false,
    icon: path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (splash && !splash.isDestroyed()) splash.close();
    if (!startHidden) mainWindow.show();
  });

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
    { label: "🗒 Новая заметка", click: () => createStickyNote() },
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
      globalShortcut.register(settings.panicHotkey, () => panicStopAll());
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

    for (const [name, raw] of Object.entries(settings.macros || {})) {
      const { events, repeat, hotkey } = normalizeMacro(raw);
      if (!hotkey) continue;
      try {
        globalShortcut.register(hotkey, () => playMacro(events, repeat));
      } catch (e) {
        console.error(`Не удалось зарегистрировать хоткей макроса "${name}":`, e.message);
      }
    }
  }
}

// --- Аварийный стоп: гасит и кликер, и запись экрана разом ---
//
// Оба режима записи (таймлапс и видео) в итоге останавливаются через renderer.js'ную
// stopScreenRecording() — она уже умеет и то, и другое; здесь просто просим рендерер её позвать,
// как по кнопке "Остановить", а не дублируем логику остановки записи в main-процессе.
function panicStopAll() {
  stopClicking("Остановлено аварийным хоткеем");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("panic:stopRecording");
  }
}

// --- IPC ---

ipcMain.handle("settings:get", async () => {
  const result = await refreshLicense();
  return {
    settings: store.getAll(),
    proUnlocked: result.valid,
    appVersion: app.getVersion(),
    licenseExpiresAt: result.valid && result.payload ? result.payload.expiresAt : null,
  };
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
  if ("antiAfkEnabled" in partial) {
    if (partial.antiAfkEnabled) startAntiAfk();
    else stopAntiAfk();
  }
  if ("idleStartEnabled" in partial) {
    if (partial.idleStartEnabled) startIdleStartPolling();
    else stopIdleStartPolling();
  }
  if ("clipboardHistoryEnabled" in partial) {
    if (partial.clipboardHistoryEnabled) startClipboardPolling();
    else stopClipboardPolling();
  }
  if ("valueWatcher" in partial) {
    const cfg = store.get("valueWatcher");
    if (cfg.enabled && cfg.region) startValueWatcherPolling(cfg);
    else stopValueWatcherPolling();
  }
  return store.getAll();
});

ipcMain.handle("license:verify", async (event, key) => {
  store.set({ licenseKey: key });
  const result = await refreshLicense();
  return result;
});

ipcMain.handle("system:getMachineId", () => getMachineId());

ipcMain.handle("update:get", () => latestUpdateInfo);


ipcMain.handle("record:listMonitors", () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    width: d.bounds.width,
    height: d.bounds.height,
    negativeCoords: d.bounds.x < 0 || d.bounds.y < 0,
    label: `Монитор ${i + 1} (${d.bounds.width}×${d.bounds.height}${d.id === primaryId ? ", основной" : ""}${
      d.bounds.x < 0 || d.bounds.y < 0 ? " — «Таймлапс» тут недоступен, переключим на «Видео»" : ""
    })`,
  }));
});

ipcMain.handle("telegram:test", async () => {
  const settings = store.getAll();
  if (!settings.telegramBotToken || !settings.telegramChatId) return { ok: false, error: "Заполни токен бота и ID чата" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: settings.telegramChatId, text: "МультиТул: тестовое уведомление ✅" }),
    });
    const data = await res.json();
    return data.ok ? { ok: true } : { ok: false, error: data.description || "Telegram отклонил запрос" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("activity:get", () => store.get("activityLog") || []);

ipcMain.handle("activity:clear", () => {
  store.set({ activityLog: [] });
  return [];
});

ipcMain.handle("clipboard:getHistory", () => store.get("clipboardHistory") || []);

ipcMain.handle("clipboard:clear", () => {
  store.set({ clipboardHistory: [] });
  return [];
});

ipcMain.handle("clipboard:copy", (event, text) => {
  lastClipboardText = text; // не даём собственной же вставке снова попасть в историю как "новую"
  clipboard.writeText(text);
});

ipcMain.handle("notes:list", () => store.get("stickyNotes") || []);
ipcMain.handle("notes:create", () => createStickyNote());
ipcMain.handle("notes:show", (event, id) => showStickyNote(id));
ipcMain.handle("notes:delete", (event, id) => deleteStickyNote(id));
ipcMain.handle("notes:getInitialData", (event) => {
  const id = noteWindowIdMap.get(event.sender.id);
  return (store.get("stickyNotes") || []).find((n) => n.id === id) || null;
});
ipcMain.on("notes:updateContent", (event, { text, html }) => {
  const id = noteWindowIdMap.get(event.sender.id);
  if (!id) return;
  const notes = store.get("stickyNotes") || [];
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const updated = [...notes];
  updated[idx] = { ...updated[idx], text, html };
  store.set({ stickyNotes: updated });
  notifyNotesChanged();
});
// Картинки, вставленные в заметку (Ctrl+V, drag-and-drop или кнопкой), сохраняются файлом в папке
// данных приложения (своя подпапка на каждую заметку, чистится целиком при удалении заметки — см.
// deleteStickyNote), а не base64 прямо внутри settings.json — иначе один вставленный скриншот раздул
// бы файл настроек на мегабайты и замедлил каждую операцию store.set(), которая читает/пишет его целиком.
const IMAGE_EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
ipcMain.handle("notes:saveImage", (event, arrayBuffer, mimeType) => {
  const id = noteWindowIdMap.get(event.sender.id);
  if (!id) return { ok: false, error: "unknown-note" };
  const ext = IMAGE_EXT_BY_MIME[mimeType] || "png";
  const fileName = `img-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  const filePath = path.join(getStickyNoteImagesDir(id), fileName);
  try {
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return { ok: true, url: pathToFileURL(filePath).href };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.on("notes:updateColor", (event, color) => {
  const id = noteWindowIdMap.get(event.sender.id);
  if (!id) return;
  const notes = store.get("stickyNotes") || [];
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const updated = [...notes];
  updated[idx] = { ...updated[idx], color };
  store.set({ stickyNotes: updated });
  notifyNotesChanged();
});
ipcMain.on("notes:deleteSelf", (event) => {
  const id = noteWindowIdMap.get(event.sender.id);
  if (id) deleteStickyNote(id);
});
ipcMain.handle("notes:togglePinned", (event) => {
  const id = noteWindowIdMap.get(event.sender.id);
  if (!id) return null;
  const win = noteWindows.get(id);
  const notes = store.get("stickyNotes") || [];
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1 || !win || win.isDestroyed()) return null;
  const newPinned = !(notes[idx].pinned !== false);
  win.setAlwaysOnTop(newPinned);
  const updated = [...notes];
  updated[idx] = { ...updated[idx], pinned: newPinned };
  store.set({ stickyNotes: updated });
  notifyNotesChanged();
  return newPinned;
});

// Пауза перед считыванием заголовка: если сделать это сразу, "активным окном" всегда будет само
// МультиТул (пользователь только что кликнул кнопку в нём) — даём 3 секунды переключиться на
// реальное целевое окно (Alt+Tab и т.п.), окно МультиТула при этом можно свернуть или нет.
ipcMain.handle("system:pickActiveWindowTitle", async () => {
  await sleep(3000);
  try {
    const active = await getActiveWindow();
    return await active.title;
  } catch (e) {
    return "";
  }
});

ipcMain.handle("click:toggle", () => toggleClicking());
ipcMain.handle("click:status", () => ({ running, clickCount: sessionClicks }));
ipcMain.handle("point:pick", () => pickPoint());
ipcMain.handle("points:pick", () => pickPoints());
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

// Только https — используется для ссылки "скачать новую версию" (страница релиза на GitHub),
// не для произвольных адресов откуда угодно.
ipcMain.handle("system:openExternal", (event, url) => {
  if (typeof url === "string" && url.startsWith("https://")) shell.openExternal(url);
});

// Отложенный старт: разово ("once"), каждый день в это же время ("daily"), или каждые N минут
// ("interval", hhmm не участвует). daily/interval сами себя перезаводят после каждого срабатывания —
// работают, пока не нажать "Отменить" явно.
function computeNextScheduleTarget(hhmm, repeat, intervalMin) {
  if (repeat === "interval") {
    return Date.now() + Math.max(1, intervalMin || 30) * 60 * 1000;
  }
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function armSchedule(hhmm, repeat, intervalMin) {
  if (scheduledTimerId) clearTimeout(scheduledTimerId);
  scheduledHhmm = hhmm;
  scheduledAt = computeNextScheduleTarget(hhmm, repeat, intervalMin);
  scheduledTimerId = setTimeout(() => {
    startClicking();
    if (repeat === "once") {
      scheduledTimerId = null;
      scheduledAt = null;
    } else {
      armSchedule(hhmm, repeat, intervalMin);
    }
    sendStatus();
  }, scheduledAt - Date.now());
}

ipcMain.handle("schedule:set", (event, hhmm, repeat, intervalMin) => {
  if (!proUnlocked) return { scheduledAt: null, error: "pro-required" };
  const mode = repeat || "once";
  if (mode !== "interval" && !hhmm) {
    if (scheduledTimerId) clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
    scheduledAt = null;
    return { scheduledAt: null };
  }
  store.set({ scheduleRepeat: mode, scheduleIntervalMin: intervalMin || store.get("scheduleIntervalMin") || 30 });
  armSchedule(hhmm, mode, intervalMin || store.get("scheduleIntervalMin") || 30);
  return { scheduledAt, scheduleRepeat: mode };
});

ipcMain.handle("schedule:cancel", () => {
  if (scheduledTimerId) {
    clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
  }
  scheduledAt = null;
  scheduledHhmm = null;
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

ipcMain.handle("macro:save", (event, name, events, repeat, hotkey) => {
  if (!name || !events || !events.length) return store.get("macros");
  const macros = { ...store.get("macros"), [name]: { events, repeat: Math.max(1, Math.min(50, repeat || 1)), hotkey: hotkey || "" } };
  store.set({ macros });
  registerShortcuts();
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

// Цепочка макросов: несколько выбранных играются один за другим, в указанном порядке. Каждый —
// со своим сохранённым числом повторов. Не блокирует IPC на всё время цепочки (аналогично одиночному
// macro:play) — воспроизведение идёт в фоне, ответ уходит сразу.
ipcMain.handle("macro:playChain", (event, names) => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  const macros = store.get("macros") || {};
  (async () => {
    for (const name of names || []) {
      const raw = macros[name];
      if (!raw) continue;
      const { events, repeat } = normalizeMacro(raw);
      await playMacro(events, repeat);
    }
  })();
  return { ok: true };
});

ipcMain.handle("macro:delete", (event, name) => {
  const macros = { ...store.get("macros") };
  delete macros[name];
  store.set({ macros });
  registerShortcuts();
  return macros;
});

ipcMain.handle("macro:update", (event, oldName, newName, repeat, hotkey) => {
  const macros = { ...store.get("macros") };
  const raw = macros[oldName];
  if (!raw) return macros;
  const normalized = normalizeMacro(raw);
  normalized.repeat = Math.max(1, Math.min(50, repeat || 1));
  normalized.hotkey = hotkey || "";
  delete macros[oldName];
  macros[newName || oldName] = normalized;
  store.set({ macros });
  registerShortcuts();
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

// Выбор области для триггера "дождаться текста" — та же рамка выделения, что и у OCR-вкладки,
// но результат не распознаётся сразу, а сохраняется как регион для последующего опроса при клике.
ipcMain.handle("textTrigger:pickRegion", async () => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  const region = await pickRegion();
  if (!region || region.width < 4 || region.height < 4) return { ok: false, error: "cancelled" };
  return { ok: true, region };
});

ipcMain.handle("valueWatcher:pickRegion", async () => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  const region = await pickRegion();
  if (!region || region.width < 4 || region.height < 4) return { ok: false, error: "cancelled" };
  return { ok: true, region };
});
ipcMain.handle("valueWatcher:clearHistory", () => {
  const cfg = store.get("valueWatcher");
  store.set({ valueWatcher: { ...cfg, history: [], lastValue: null } });
});

// Выделяешь область с иконкой/кнопкой на экране — сохраняем её как картинку-образец (PNG) в свою
// папку, дальше nut-js screen.find() ищет её на экране целиком.
ipcMain.handle("imageTrigger:pickTemplate", async () => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  const region = await pickRegion();
  if (!region || region.width < 4 || region.height < 4) return { ok: false, error: "cancelled" };
  const dir = getImageTemplatesDir();
  const baseName = `template-${Date.now()}`;
  try {
    await nutScreen.captureRegion(baseName, new Region(region.x, region.y, region.width, region.height), FileType.PNG, dir);
    return { ok: true, templateFile: `${baseName}.png`, width: region.width, height: region.height };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- Запись экрана (Pro) ---
//
// Первая версия делала это через desktopCapturer + MediaRecorder (стандартный веб-путь) — но в
// одном из тестовых окружений (похоже, виртуальная машина/RDP без полноценной поддержки
// Desktop Duplication API у Chromium) это намертво вешало процесс рендерера прямо во время
// захвата, без какой-либо ошибки, которую можно было бы поймать в JS. Вместо этого — свой пайплайн
// на уже проверенных вживую компонентах: кадры снимаются по одному через nut-js screen.captureRegion()
// (тот же механизм, что и OCR/цвет-триггер — обычный BitBlt, не GPU-путь Chromium), а по
// остановке собираются в .mp4 через ffmpeg (пакет ffmpeg-static — бинарник ffmpeg внутри npm-
// зависимости, ничего ставить пользователю не нужно). Плата за надёжность — это не плавное видео
// с фиксированным FPS, а последовательность кадров с реальным темпом захвата (обычно единицы fps,
// не 30-60) — по сути таймлапс, а не видеозапись в привычном смысле.

// require("ffmpeg-static") возвращает путь ВНУТРИ app.asar — реальный бинарник туда не попадает
// (asarUnpack в package.json кладёт его в app.asar.unpacked), а спавнить процесс из архива
// напрямую нельзя (это виртуальная ФС, понятная только патченому fs/require у Electron, не
// настоящему CreateProcess у Windows). В dev-режиме "app.asar" в пути просто не встречается,
// .replace() безопасно ничего не делает.
const ffmpegPath = require("ffmpeg-static").replace("app.asar", "app.asar.unpacked");

let recordingFrames = false;
let recordFrameDir = null;
let recordFrameCount = 0;
let recordStartedAt = 0;
const RECORD_TARGET_FPS = 4; // полноэкранный кадр — тяжёлая операция, не гонимся за высоким fps
const RECORD_FRAME_INTERVAL_MS = 1000 / RECORD_TARGET_FPS;

async function recordingLoop() {
  const { x, y, width, height } = getRecordDisplay().bounds;
  while (recordingFrames) {
    const frameStart = Date.now();
    const frameBase = `frame-${String(recordFrameCount + 1).padStart(6, "0")}`;
    try {
      // Тайм-аут на отдельный кадр: если снимок всего экрана (в разы тяжелее маленькой области,
      // которую захватывают OCR/цвет-триггер) вдруг подвиснет на уровне нативного вызова —
      // проверено вживую, такое бывает — цикл всё равно должен продолжиться и рано или поздно
      // увидеть recordingFrames=false, а не встать намертво в ожидании одного кадра навсегда.
      await Promise.race([
        nutScreen.captureRegion(frameBase, new Region(x, y, width, height), FileType.JPG, recordFrameDir),
        new Promise((_, reject) => setTimeout(() => reject(new Error("frame capture timeout")), 3000)),
      ]);
      recordFrameCount++;
    } catch (e) {
      // пропускаем неудавшийся/зависший кадр, не прерывая всю запись
    }
    // Обязательная пауза каждую итерацию (не только когда захват уложился в бюджет) — иначе при
    // медленном захвате (весь экран — не маленькая область, как у OCR/цвет-триггера) цикл ни разу
    // не отдаёт управление event loop'у между кадрами, и IPC-сообщение "остановить запись" физически
    // не может быть обработано, пока не закончится вся запись. Проверено вживую: без этого минимума
    // процесс реально "зависал" (растущий CPU, Responding=False) на неопределённое время.
    const wait = Math.max(10, RECORD_FRAME_INTERVAL_MS - (Date.now() - frameStart));
    await sleep(wait);
  }
}

ipcMain.handle("record:start", (event) => {
  if (!proUnlocked) return { ok: false, error: "pro-required" };
  if (recordingFrames) return { ok: false, error: "already-recording" };
  // nut-js captureRegion() отказывается захватывать отрицательные координаты ("x coordinate
  // outside of display") — проверено вживую: это реальный случай для монитора, расположенного
  // левее/выше основного в многомониторной раскладке. Таймлапс такой монитор снять не может —
  // честно говорим об этом, а не тихо пишем 0 кадров.
  const targetBounds = getRecordDisplay().bounds;
  if (targetBounds.x < 0 || targetBounds.y < 0) {
    return { ok: false, error: "Этот монитор нельзя записать в режиме «Таймлапс» — переключись на «Видео»" };
  }
  recordingFrames = true;
  recordFrameCount = 0;
  recordStartedAt = Date.now();
  recordFrameDir = fs.mkdtempSync(path.join(os.tmpdir(), "multitool-rec-"));
  recordingLoop();
  createRecordHud();
  logActivity("🎥 Запись экрана начата (таймлапс)");
  return { ok: true };
});

// Видео-режим стартует/останавливается в рендерере (getDisplayMedia+MediaRecorder) — HUD и журнал
// для него включаются отдельно этими двумя вызовами, а не через record:start/record:stop выше.
ipcMain.handle("record:hudShow", () => {
  createRecordHud();
  logActivity("🎥 Запись экрана начата (видео)");
});
ipcMain.handle("record:hudHide", () => destroyRecordHud());

ipcMain.handle("record:stop", async () => {
  if (!recordingFrames) return { ok: false, error: "not-recording" };
  destroyRecordHud();
  recordingFrames = false;
  await sleep(RECORD_FRAME_INTERVAL_MS + 100); // дать текущему кадру дозахватиться перед кодированием

  const elapsedSec = Math.max(0.1, (Date.now() - recordStartedAt) / 1000);
  const fps = recordFrameCount > 0 ? Math.max(1, Math.round((recordFrameCount / elapsedSec) * 100) / 100) : RECORD_TARGET_FPS;
  const frameDir = recordFrameDir;
  const frameCount = recordFrameCount;

  if (frameCount === 0) {
    fs.rm(frameDir, { recursive: true, force: true }, () => {});
    return { ok: false, error: "Не записано ни одного кадра" };
  }

  // Важно: сохраняем НЕ в папку "Видео" — если у пользователя включён "Controlled folder access"
  // в Защитнике Windows (реальная, часто включённая по умолчанию функция — проверено вживую именно
  // на этом баге), запись туда от малоизвестного .exe молча блокируется ("No such file or
  // directory", хотя сама папка существует и доступна). Причём это специфично именно для процесса
  // Electron — та же операция из чистого node.exe на этой же машине отрабатывала мгновенно, то
  // есть дело не в самом файле/пути, а в том, как антивирус относится конкретно к этому процессу.
  // Простое и надёжное решение — писать в папку данных приложения (userData), которая никогда не
  // входит в список защищённых системных папок: там и так уже спокойно живут settings.json и кеш
  // OCR весь этот сеанс, без единой заминки.
  const recordingsDir = path.join(app.getPath("userData"), "recordings");
  fs.mkdirSync(recordingsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(recordingsDir, `clip-${stamp}.mp4`);
  const framePattern = path.join(frameDir, "frame-%06d.jpg");

  return new Promise((resolve) => {
    execFile(
      ffmpegPath,
      ["-y", "-framerate", String(fps), "-i", framePattern, "-c:v", "libx264", "-pix_fmt", "yuv420p", outFile],
      (err) => {
        fs.rm(frameDir, { recursive: true, force: true }, () => {});
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true, path: outFile, frames: frameCount, fps });
      }
    );
  });
});

// --- Запись экрана, режим "видео" (Pro, экспериментально) ---
//
// Настоящий видеопоток через getDisplayMedia()+MediaRecorder — плавное видео с реальным fps (до
// 60), а не таймлапс из отдельных кадров, как режим выше. Проверено вживую: РАНЬШЕ этот же подход
// (через устаревший getUserMedia+chromeMediaSourceId) периодически подвешивал рендерер намертво во
// время самого захвата на одной из тестовых машин — неясно, было ли дело именно в устаревшем API
// или в конкретной среде (виртуалка/RDP без Desktop Duplication). Современный getDisplayMedia +
// setDisplayMediaRequestHandler (выше, в app.whenReady) — как минимум чище по коду; если он тоже
// окажется нестабильным на каких-то машинах, режим "таймлапс" рядом остаётся надёжным запасным
// вариантом, поэтому оба режима — выбор в интерфейсе, а не взаимная замена.
// Сохранённый MediaRecorder-поток (кодек vp9 в контейнере .webm) на многих машинах вообще не
// открывается штатным плеером Windows — "Кино и ТВ"/Проводник без отдельно поставленных кодеков
// не умеют VP9/WebM, и получается честный баг с точки зрения пользователя: "видео записалось, а
// открыть не могу", хотя в Chrome/VLC всё проигрывалось нормально. Прогоняем через тот же ffmpeg,
// что и таймлапс, и отдаём .mp4 (H.264) — он открывается везде из коробки без доп. кодеков.
ipcMain.handle("record:saveVideo", async (event, arrayBuffer) => {
  const recordingsDir = path.join(app.getPath("userData"), "recordings");
  fs.mkdirSync(recordingsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tmpWebm = path.join(os.tmpdir(), `multitool-rec-${stamp}.webm`);
  const outFile = path.join(recordingsDir, `clip-${stamp}.mp4`);

  try {
    fs.writeFileSync(tmpWebm, Buffer.from(arrayBuffer));
  } catch (e) {
    return { ok: false, error: e.message };
  }

  return new Promise((resolve) => {
    execFile(
      ffmpegPath,
      ["-y", "-i", tmpWebm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outFile],
      (err) => {
        fs.rm(tmpWebm, { force: true }, () => {});
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true, path: outFile });
      }
    );
  });
});

ipcMain.handle("record:openFolder", () => {
  const dir = path.join(app.getPath("userData"), "recordings"); // та же папка, что и при сохранении записи
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
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
  if (store.get("antiAfkEnabled")) startAntiAfk();
  if (store.get("idleStartEnabled")) startIdleStartPolling();
  if (store.get("clipboardHistoryEnabled")) startClipboardPolling();
  if (store.get("valueWatcher").enabled && store.get("valueWatcher").region) startValueWatcherPolling(store.get("valueWatcher"));
  restoreStickyNotes();
  nutScreen.config.resourceDirectory = getImageTemplatesDir(); // для триггера по картинке — imageResource() ищет файлы относительно этой папки
  providerRegistry.registerImageFinder(new JimpImageFinder()); // в nut-js нет готового ImageFinder — используем свой (см. image-finder.js)
  // У nut-js по умолчанию встроена скрытая пауза ПЕРЕД каждым кликом/нажатием клавиши —
  // mouse.config.autoDelayMs = 100 и keyboard.config.autoDelayMs = 300 (задумано как "человечнее",
  // но здесь автоматизация, не ручной ввод). Из-за этого слайдер интервала на вкладке "Клик" врал:
  // выставленные там 10мс на деле оборачивались в ~110мс на клик (и ~600мс на "клик" в режиме
  // клавиатуры — pressKey + releaseKey, каждый со своей паузой в 300мс), а для игры с несколькими
  // точками — то же самое умножается на каждую точку. Обнаружено по жалобе "поставил минимум, а всё
  // равно медленно, особенно с несколькими точками". Обнуляем обе паузы — реальная скорость клика
  // теперь наконец соответствует тому, что показывает интерфейс.
  mouse.config.autoDelayMs = 0;
  keyboard.config.autoDelayMs = 0;
  checkForUpdate();

  // Позволяет рендереру звать navigator.mediaDevices.getDisplayMedia() без системного диалога
  // выбора окна — сразу отдаём выбранный монитор (+ системный звук петлёй, если включено).
  // Нужно для режима "видео" в записи экрана.
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
        // Сопоставляем по display_id, а не по индексу в массиве — screen.getAllDisplays() (тот, что
        // показывает список мониторов в интерфейсе) и desktopCapturer.getSources() не гарантируют
        // одинаковый порядок (проверено вживую: реально не совпадал на двухмониторной машине).
        const wantedId = store.get("recordMonitorId");
        const source = (wantedId != null && sources.find((s) => String(s.display_id) === String(wantedId))) || sources[0];
        if (!source) {
          callback({});
          return;
        }
        callback({ video: source, audio: store.get("recordAudio") ? "loopback" : undefined });
      });
    },
    { useSystemPicker: false }
  );
});

app.on("window-all-closed", () => {
  // Приложение живёт в трее — не закрываем по крестику на окне.
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (recording) stopRecordingInternal();
});
