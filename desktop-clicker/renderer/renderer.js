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

let settings = {};
let proUnlocked = false;

function fields() {
  return {
    intervalMs: document.getElementById("intervalMs"),
    jitterMs: document.getElementById("jitterMs"),
    positionJitterPx: document.getElementById("positionJitterPx"),
    actionType: document.getElementById("actionType"),
    button: document.getElementById("button"),
    hotkey: document.getElementById("hotkey"),
    panicHotkey: document.getElementById("panicHotkey"),
    recordHotkey: document.getElementById("recordHotkey"),
    stopAfterClicks: document.getElementById("stopAfterClicks"),
    stopAfterSeconds: document.getElementById("stopAfterSeconds"),
    launchOnStartup: document.getElementById("launchOnStartup"),
    launchMinimized: document.getElementById("launchMinimized"),
  };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function keyLabel(info) {
  if (!info || !info.name) return "—";
  return info.name;
}

// --- Навигация: постоянный сайдбар, справа всегда ровно одна "страница" ---

function showPanel(name) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const show = panel.dataset.panel === name;
    panel.hidden = !show;
    if (show) {
      // Перезапускаем CSS-анимацию появления (иначе сыграет только один раз).
      panel.classList.remove("tab-panel");
      void panel.offsetWidth;
      panel.classList.add("tab-panel");
    }
  });
  document.querySelector(".content").scrollTo({ top: 0, behavior: "smooth" });
}

function initNavigation() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPanel(btn.dataset.target);
      if (btn.dataset.target === "startup") renderStartupList();
    });
  });
  showPanel("home");
}

// --- Sliders (range <-> number two-way sync) ---

function bindSlider(key, onChange) {
  const slider = document.getElementById(`${key}Slider`);
  const number = document.getElementById(key);
  const badge = document.getElementById(`${key}Value`);

  slider.addEventListener("input", () => {
    number.value = slider.value;
    if (badge) badge.textContent = slider.value;
  });
  slider.addEventListener("change", () => onChange(parseInt(slider.value, 10)));

  number.addEventListener("input", () => {
    const v = parseInt(number.value, 10) || 0;
    slider.value = Math.min(Math.max(v, parseInt(slider.min, 10)), parseInt(slider.max, 10));
    if (badge) badge.textContent = v;
  });
  number.addEventListener("change", () => onChange(parseInt(number.value, 10) || 0));
}

// --- UI state ---

function updateActionVisibility() {
  const isKeyboard = settings.actionType === "keyboard";
  document.getElementById("buttonField").hidden = isKeyboard;
  document.getElementById("keyField").hidden = !isKeyboard;
  document.getElementById("keyName").textContent = keyLabel(settings.keyToPress);
}

function renderModeSegmented() {
  document.querySelectorAll("#modeSegmented .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === settings.mode);
  });
}

function updateModeVisibility() {
  document.getElementById("pickField").hidden = settings.mode !== "point";
  document.getElementById("sequenceField").hidden = settings.mode !== "sequence";
  const hint = document.getElementById("pointHint");
  hint.textContent = settings.fixedPoint ? `Точка: ${settings.fixedPoint.x}, ${settings.fixedPoint.y}` : "Точка не выбрана.";
  renderModeSegmented();
  if (settings.mode === "sequence") renderSeqList();
}

function renderColorTrigger() {
  const trigger = settings.colorTrigger || {};
  document.getElementById("colorTriggerEnabled").checked = !!trigger.enabled;

  const swatch = document.getElementById("colorSwatch");
  swatch.style.background = trigger.color ? `rgb(${trigger.color.r}, ${trigger.color.g}, ${trigger.color.b})` : "";

  const hint = document.getElementById("colorTriggerHint");
  const parts = [];
  parts.push(trigger.point ? `Точка: ${trigger.point.x}, ${trigger.point.y}` : "Точка не выбрана.");
  parts.push(trigger.color ? `Цвет: rgb(${trigger.color.r}, ${trigger.color.g}, ${trigger.color.b})` : "Цвет не взят.");
  hint.textContent = parts.join(" ");
}

function updateProUI() {
  document.getElementById("tierBadge").textContent = proUnlocked ? "👑 Pro" : "Free";
  document.getElementById("tierBadge").classList.toggle("pro", proUnlocked);

  document.getElementById("posJitterBadge").hidden = proUnlocked;
  document.getElementById("positionJitterPx").disabled = !proUnlocked;
  document.getElementById("positionJitterPxSlider").disabled = !proUnlocked;

  document.getElementById("modeSequenceBtn").disabled = !proUnlocked;

  document.getElementById("scheduleBadge").hidden = proUnlocked;
  document.getElementById("recordHotkeyBadge").hidden = proUnlocked;
  document.getElementById("macroBadge").hidden = proUnlocked;
  document.getElementById("profilesBadge").hidden = proUnlocked;
  document.getElementById("exportBadge").hidden = proUnlocked;
  document.getElementById("macroTabBadge").hidden = proUnlocked;
  document.getElementById("profilesTabBadge").hidden = proUnlocked;
  document.getElementById("bindsBadge").hidden = proUnlocked;
  document.getElementById("bindsTabBadge").hidden = proUnlocked;
  document.getElementById("colorTriggerBadge").hidden = proUnlocked;
  document.getElementById("ocrBadge").hidden = proUnlocked;
  document.getElementById("ocrTabBadge").hidden = proUnlocked;
  document.getElementById("textTriggerBadge").hidden = proUnlocked;
  document.getElementById("recordBadge").hidden = proUnlocked;
  document.getElementById("recordTabBadge").hidden = proUnlocked;
  document.getElementById("idleStartBadge").hidden = proUnlocked;
  document.getElementById("telegramBadge").hidden = proUnlocked;
  document.getElementById("imageTriggerBadge").hidden = proUnlocked;
  document.getElementById("turboModeBadge").hidden = proUnlocked;
  document.getElementById("sequenceClickAllBadge").hidden = proUnlocked;

  const proOnlyIds = [
    "scheduleTime",
    "scheduleSetBtn",
    "scheduleCancelBtn",
    "recordBtn",
    "profileSelect",
    "applyProfileBtn",
    "deleteProfileBtn",
    "newProfileName",
    "saveProfileBtn",
    "exportBtn",
    "importBtn",
    "bindHotkey",
    "bindText",
    "bindAddBtn",
    "colorTriggerEnabled",
    "colorPickPointBtn",
    "colorSampleBtn",
    "colorToleranceSlider",
    "colorTolerance",
    "ocrCaptureBtn",
    "ocrLang",
    "textTriggerEnabled",
    "textTriggerPickBtn",
    "textTriggerExpected",
    "scheduleRepeat",
    "scheduleIntervalMin",
    "recordStartBtn",
    "recordOpenFolderBtn",
    "recordMode",
    "recordAudio",
    "recordIndicatorEnabled",
    "idleStartEnabled",
    "idleStartThresholdSec",
    "telegramEnabled",
    "telegramBotToken",
    "telegramChatId",
    "telegramTestBtn",
    "telegramOnTrigger",
    "imageTriggerEnabled",
    "imageTriggerPickBtn",
    "imageTriggerConfidenceSlider",
    "imageTriggerConfidence",
    "turboModeEnabled",
    "sequenceClickAllEnabled",
  ];
  for (const id of proOnlyIds) document.getElementById(id).disabled = !proUnlocked;

  const proStatus = document.getElementById("proStatus");
  proStatus.textContent = proUnlocked
    ? "Pro активирован — без лимита кликов, разброс позиции, триггер по цвету, дождаться текста, последовательность точек, макросы, бинды, профили, расписание, текст с экрана, запись экрана."
    : "Бесплатная версия: лимит 5000 кликов за запуск, курсор/одна точка.";
}

let statusHideTimer = null;

function showStatus(text) {
  const el = document.getElementById("saveStatus");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(statusHideTimer);
  statusHideTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, 1500);
}

async function save(partial) {
  settings = await window.api.setSettings(partial);
  showStatus("Сохранено");
}

function loadIntoForm() {
  const f = fields();
  f.intervalMs.value = settings.intervalMs;
  f.jitterMs.value = settings.jitterMs;
  f.positionJitterPx.value = settings.positionJitterPx;
  f.actionType.value = settings.actionType;
  f.button.value = settings.button;
  f.hotkey.value = settings.hotkey;
  f.panicHotkey.value = settings.panicHotkey;
  f.recordHotkey.value = settings.recordHotkey;
  f.stopAfterClicks.value = settings.stopAfterClicks;
  f.stopAfterSeconds.value = settings.stopAfterMs / 1000;
  f.launchOnStartup.checked = !!settings.launchOnStartup;
  f.launchMinimized.checked = !!settings.launchMinimized;
  document.getElementById("launchMinimizedRow").style.opacity = settings.launchOnStartup ? "1" : "0.5";
  document.getElementById("licenseKey").value = settings.licenseKey;
  document.getElementById("ocrLang").value = settings.ocrLang || "rus+eng";
  document.getElementById("recordMode").value = settings.recordMode || "timelapse";
  updateRecordModeHint();

  document.getElementById("intervalMsSlider").value = Math.min(2000, settings.intervalMs);
  document.getElementById("intervalMsValue").textContent = settings.intervalMs;
  document.getElementById("jitterMsSlider").value = Math.min(500, settings.jitterMs);
  document.getElementById("jitterMsValue").textContent = settings.jitterMs;
  document.getElementById("positionJitterPxSlider").value = Math.min(200, settings.positionJitterPx);
  document.getElementById("positionJitterPxValue").textContent = settings.positionJitterPx;

  document.getElementById("turboModeEnabled").checked = !!settings.turboMode;
  updateTurboModeHint();
  document.getElementById("sequenceClickAllEnabled").checked = !!settings.sequenceClickAll;

  const tolerance = (settings.colorTrigger && settings.colorTrigger.tolerance) || 0;
  document.getElementById("colorToleranceSlider").value = Math.min(150, tolerance);
  document.getElementById("colorTolerance").value = tolerance;
  renderColorTrigger();

  document.getElementById("targetWindowTitle").value = settings.targetWindowTitle || "";
  updateTargetWindowHint();

  renderTextTrigger();
  renderImageTrigger();

  document.getElementById("antiAfkEnabled").checked = !!settings.antiAfkEnabled;
  document.getElementById("antiAfkIntervalSec").value = settings.antiAfkIntervalSec || 45;

  document.getElementById("scheduleRepeat").value = settings.scheduleRepeat || "once";
  document.getElementById("scheduleIntervalMin").value = settings.scheduleIntervalMin || 30;
  updateScheduleFieldsVisibility();

  document.getElementById("idleStartEnabled").checked = !!settings.idleStartEnabled;
  document.getElementById("idleStartThresholdSec").value = settings.idleStartThresholdSec || 60;

  document.getElementById("telegramEnabled").checked = !!settings.telegramEnabled;
  document.getElementById("telegramBotToken").value = settings.telegramBotToken || "";
  document.getElementById("telegramChatId").value = settings.telegramChatId || "";
  document.getElementById("telegramOnTrigger").checked = !!settings.telegramOnTrigger;

  document.getElementById("clipboardHistoryEnabled").checked = settings.clipboardHistoryEnabled !== false;

  document.getElementById("recordAudio").checked = !!settings.recordAudio;
  document.getElementById("recordIndicatorEnabled").checked = settings.recordIndicatorEnabled !== false;

  updateActionVisibility();
  updateModeVisibility();
}

function updateTurboModeHint() {
  const turboOn = document.getElementById("turboModeEnabled").checked && proUnlocked;
  for (const id of ["intervalMsSlider", "intervalMs", "jitterMsSlider", "jitterMs"]) {
    document.getElementById(id).disabled = turboOn;
  }
  document.getElementById("intervalMsSlider").closest(".field").style.opacity = turboOn ? "0.5" : "1";
  document.getElementById("jitterMsSlider").closest(".field").style.opacity = turboOn ? "0.5" : "1";
}

function updateTargetWindowHint() {
  const title = (settings.targetWindowTitle || "").trim();
  document.getElementById("targetWindowHint").textContent = title
    ? `Клики работают только пока активно окно с заголовком, содержащим «${title}».`
    : "Пусто — кликер работает всегда, независимо от того, какое окно активно.";
}

function renderTextTrigger() {
  const trigger = settings.textTrigger || {};
  document.getElementById("textTriggerEnabled").checked = !!trigger.enabled;
  document.getElementById("textTriggerExpected").value = trigger.expectedText || "";
  const hint = document.getElementById("textTriggerRegionHint");
  hint.textContent = trigger.region
    ? `Область: ${trigger.region.width}×${trigger.region.height} в точке ${trigger.region.x}, ${trigger.region.y}`
    : "Область не выбрана.";
}

function renderImageTrigger() {
  const trigger = settings.imageTrigger || {};
  document.getElementById("imageTriggerEnabled").checked = !!trigger.enabled;
  const confidence = Math.round((trigger.confidence || 0.9) * 100);
  document.getElementById("imageTriggerConfidenceSlider").value = confidence;
  document.getElementById("imageTriggerConfidence").value = confidence;
  const hint = document.getElementById("imageTriggerHint");
  hint.textContent = trigger.templateFile ? `Образец: ${trigger.width}×${trigger.height}` : "Образец не выбран.";
}

function updateScheduleFieldsVisibility() {
  const mode = document.getElementById("scheduleRepeat").value;
  document.getElementById("scheduleTimeField").hidden = mode === "interval";
  document.getElementById("scheduleIntervalField").hidden = mode !== "interval";
}

// --- Sequence points ---

function renderSeqList() {
  const list = document.getElementById("seqList");
  const points = settings.sequencePoints || [];
  if (points.length === 0) {
    list.innerHTML = `<div class="empty-hint">🎯 Точек пока нет</div>`;
    return;
  }
  list.innerHTML = points
    .map((p, i) => `<div class="seq-item"><span>Точка ${i + 1}: ${p.x}, ${p.y}</span><button data-i="${i}" class="seq-remove">×</button></div>`)
    .join("");
  list.querySelectorAll(".seq-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const points2 = [...settings.sequencePoints];
      points2.splice(parseInt(btn.dataset.i, 10), 1);
      await save({ sequencePoints: points2 });
      renderSeqList();
    });
  });
}

// --- Profiles ---

function renderProfileSelect() {
  const select = document.getElementById("profileSelect");
  const names = Object.keys(settings.profiles || {});
  select.innerHTML = names.length
    ? names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("")
    : `<option value="">— нет сохранённых —</option>`;
}

// --- Macros ---

// Старые макросы хранились как голый массив кликов — main.js хранит их так же, если их ни разу
// не пересохраняли через новую версию, поэтому рендер тоже должен понимать обе формы.
function normalizeMacroClient(value) {
  if (Array.isArray(value)) return { events: value, repeat: 1, hotkey: "" };
  return {
    events: (value && value.events) || [],
    repeat: (value && value.repeat) || 1,
    hotkey: (value && value.hotkey) || "",
  };
}

function describeMacroEvents(events) {
  const clicks = events.filter((e) => !e.type || e.type === "click").length;
  const keys = events.filter((e) => e.type === "keydown").length;
  const parts = [];
  if (clicks > 0) parts.push(`${clicks} клик${clicks === 1 ? "" : "ов"}`);
  if (keys > 0) parts.push(`${keys} нажат${keys === 1 ? "ие" : "ий"} клавиш`);
  return parts.length ? parts.join(", ") : "пусто";
}

function renderMacroList() {
  const list = document.getElementById("macroList");
  const names = Object.keys(settings.macros || {});
  if (names.length === 0) {
    list.innerHTML = `<div class="empty-hint">🎬 Пока нет записанных макросов</div>`;
    return;
  }
  list.innerHTML = names
    .map((n) => {
      const { events, repeat, hotkey } = normalizeMacroClient(settings.macros[n]);
      const repeatSuffix = repeat > 1 ? ` × ${repeat}` : "";
      const hotkeySuffix = hotkey ? ` · <code>${escapeHtml(hotkey)}</code>` : "";
      return `<div class="macro-item">
        <label class="macro-chain-check">
          <input type="checkbox" class="macro-chain-checkbox" data-name="${escapeHtml(n)}" />
          <span>${escapeHtml(n)} (${describeMacroEvents(events)}${repeatSuffix})${hotkeySuffix}</span>
        </label>
        <div class="item-actions">
          <button class="play-btn" data-name="${escapeHtml(n)}">▶ Играть</button>
          <button class="edit-btn" data-name="${escapeHtml(n)}">✎</button>
          <button class="delete-btn" data-name="${escapeHtml(n)}">×</button>
        </div>
      </div>`;
    })
    .join("");
  list.querySelectorAll(".play-btn").forEach((btn) => {
    btn.addEventListener("click", () => window.api.playMacro(btn.dataset.name));
  });
  list.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openMacroEditModal(btn.dataset.name));
  });
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      settings.macros = await window.api.deleteMacro(btn.dataset.name);
      renderMacroList();
    });
  });
}

// --- Binds (hotkey -> type text) ---

function renderBindList() {
  const list = document.getElementById("bindList");
  const binds = settings.binds || [];
  if (binds.length === 0) {
    list.innerHTML = `<div class="empty-hint">⌨️ Пока нет биндов</div>`;
    return;
  }
  list.innerHTML = binds
    .map(
      (b) => `<div class="macro-item">
        <span><code>${escapeHtml(b.hotkey)}</code> → ${escapeHtml(b.text)}</span>
        <div class="item-actions">
          <button class="delete-btn" data-id="${escapeHtml(b.id)}">×</button>
        </div>
      </div>`
    )
    .join("");
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const binds2 = (settings.binds || []).filter((b) => b.id !== btn.dataset.id);
      await save({ binds: binds2 });
      renderBindList();
    });
  });
}

// --- Автозагрузка (управление автозапуском других программ) ---

async function renderStartupList() {
  const list = document.getElementById("startupList");
  list.innerHTML = `<div class="empty-hint">Загрузка…</div>`;
  const apps = await window.api.listStartupApps();
  if (apps.length === 0) {
    list.innerHTML = `<div class="empty-hint">🚀 Автозагрузка пуста</div>`;
    return;
  }
  list.innerHTML = apps
    .map(
      (a) => `<div class="macro-item">
        <span title="${escapeHtml(a.command)}">${escapeHtml(a.name)}</span>
        <label class="switch">
          <input type="checkbox" class="startup-toggle" data-name="${escapeHtml(a.name)}" data-source="${a.source}" ${a.enabled ? "checked" : ""} />
          <span class="switch-slider"></span>
        </label>
      </div>`
    )
    .join("");
  list.querySelectorAll(".startup-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const status = document.getElementById("startupStatus");
      toggle.disabled = true;
      status.textContent = "";
      const result = await window.api.toggleStartupApp(toggle.dataset.name, toggle.dataset.source, toggle.checked);
      if (!result.ok) {
        toggle.checked = !toggle.checked; // откатываем визуально, если не получилось
        status.textContent = `Не удалось изменить «${toggle.dataset.name}»: ${result.error || "неизвестная ошибка"}.`;
      }
      toggle.disabled = false;
    });
  });
}

let pendingMacroEvents = null;
let macroModalMode = "save"; // 'save' — только что записанный макрос, 'edit' — уже сохранённый
let editingMacroName = null;

function openMacroSaveModal(events) {
  macroModalMode = "save";
  editingMacroName = null;
  pendingMacroEvents = events;
  document.getElementById("macroSaveTitle").textContent = "Сохранить макрос";
  document.getElementById("macroSaveInfo").textContent = `Записано: ${describeMacroEvents(events)}.`;
  const nameInput = document.getElementById("macroSaveName");
  nameInput.value = "";
  document.getElementById("macroSaveRepeat").value = "1";
  document.getElementById("macroSaveHotkey").value = "";
  document.getElementById("macroSaveOverlay").hidden = false;
  nameInput.focus();
}

function openMacroEditModal(name) {
  const { events, repeat, hotkey } = normalizeMacroClient(settings.macros[name]);
  macroModalMode = "edit";
  editingMacroName = name;
  pendingMacroEvents = null;
  document.getElementById("macroSaveTitle").textContent = "Изменить макрос";
  document.getElementById("macroSaveInfo").textContent = `Записано: ${describeMacroEvents(events)}. Можно переименовать и задать число повторов — сами события записаны заново не будут.`;
  const nameInput = document.getElementById("macroSaveName");
  nameInput.value = name;
  document.getElementById("macroSaveRepeat").value = String(repeat);
  document.getElementById("macroSaveHotkey").value = hotkey || "";
  document.getElementById("macroSaveOverlay").hidden = false;
  nameInput.focus();
}

function closeMacroSaveModal() {
  pendingMacroEvents = null;
  editingMacroName = null;
  document.getElementById("macroSaveOverlay").hidden = true;
}

async function promptAndSaveMacro(events) {
  setRecordingUI(false);
  if (!events || events.length === 0) {
    document.getElementById("recordStatus").textContent = "Ничего не записано (не было кликов).";
    return;
  }
  document.getElementById("recordStatus").textContent = `Запись остановлена — задай имя в открывшемся окне.`;
  openMacroSaveModal(events);
}

function setRecordingUI(active) {
  document.getElementById("recordBtn").disabled = active || !proUnlocked;
  document.getElementById("stopRecordBtn").disabled = !active;
  if (active) {
    document.getElementById("recordStatus").textContent = `Идёт запись… 0 событий. Кликай и/или печатай, потом жми «Остановить» или ${settings.recordHotkey}.`;
  }
}

// --- Status / render ---

function renderStatus(status) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  const count = document.getElementById("count");
  const toggleBtn = document.getElementById("toggleBtn");

  dot.classList.toggle("on", status.running);
  text.textContent = status.running ? "Активен" : "Остановлен";
  count.textContent = `Кликов: ${status.clickCount}`;
  toggleBtn.textContent = status.running ? `Стоп (${settings.hotkey})` : `Старт (${settings.hotkey})`;
  toggleBtn.classList.toggle("running", status.running);
}

function bindHandlers() {
  const f = fields();

  initNavigation();

  bindSlider("intervalMs", (v) => save({ intervalMs: Math.max(10, v || 100) }));
  bindSlider("jitterMs", (v) => save({ jitterMs: Math.max(0, v || 0) }));
  bindSlider("positionJitterPx", (v) => save({ positionJitterPx: Math.max(0, v || 0) }));
  document.getElementById("turboModeEnabled").addEventListener("change", async (e) => {
    await save({ turboMode: e.target.checked });
    updateTurboModeHint();
  });
  document.getElementById("sequenceClickAllEnabled").addEventListener("change", async (e) => {
    await save({ sequenceClickAll: e.target.checked });
  });
  bindSlider("colorTolerance", (v) =>
    save({ colorTrigger: { ...settings.colorTrigger, tolerance: Math.max(0, v || 0) } })
  );

  document.querySelectorAll("#modeSegmented .seg-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      await save({ mode: btn.dataset.value });
      updateModeVisibility();
    });
  });
  f.actionType.addEventListener("change", () => {
    save({ actionType: f.actionType.value });
    updateActionVisibility();
  });
  f.button.addEventListener("change", () => save({ button: f.button.value }));
  f.hotkey.addEventListener("change", () => save({ hotkey: f.hotkey.value.trim() || "F8" }));
  f.panicHotkey.addEventListener("change", () => save({ panicHotkey: f.panicHotkey.value.trim() || "F9" }));
  f.recordHotkey.addEventListener("change", () => save({ recordHotkey: f.recordHotkey.value.trim() || "F10" }));
  f.stopAfterClicks.addEventListener("change", () => {
    save({ stopAfterClicks: Math.max(0, parseInt(f.stopAfterClicks.value, 10) || 0) });
  });
  f.stopAfterSeconds.addEventListener("change", () => {
    const seconds = Math.max(0, parseFloat(f.stopAfterSeconds.value) || 0);
    save({ stopAfterMs: seconds * 1000 });
  });
  f.launchOnStartup.addEventListener("change", async () => {
    await save({ launchOnStartup: f.launchOnStartup.checked });
    document.getElementById("launchMinimizedRow").style.opacity = f.launchOnStartup.checked ? "1" : "0.5";
  });
  f.launchMinimized.addEventListener("change", () => save({ launchMinimized: f.launchMinimized.checked }));

  document.getElementById("extensionLink").addEventListener("click", (e) => {
    e.preventDefault();
    window.api.openExternal("https://github.com/LeonidBiceps/autoclicker/releases/latest");
  });

  document.getElementById("donateBtn").addEventListener("click", async () => {
    const result = await window.api.openDonate();
    const message = document.getElementById("donateMessage");
    message.textContent = result.ok ? "" : "Ссылка ещё не настроена (DONATE_URL в main.js).";
  });

  document.getElementById("donateForProBtn").addEventListener("click", async () => {
    const result = await window.api.openDonate();
    const message = document.getElementById("donateForProMessage");
    message.textContent = result.ok ? "" : "Ссылка ещё не настроена (DONATE_URL в main.js).";
  });

  document.getElementById("setKeyBtn").addEventListener("click", async () => {
    const btn = document.getElementById("setKeyBtn");
    btn.disabled = true;
    btn.textContent = "Нажми клавишу…";
    const captured = await window.api.captureKey();
    btn.disabled = false;
    btn.textContent = "Установить клавишу";
    if (captured && captured.name) {
      await save({ keyToPress: captured });
      document.getElementById("keyName").textContent = keyLabel(captured);
    }
  });

  document.getElementById("toggleBtn").addEventListener("click", async () => {
    const status = await window.api.toggle();
    renderStatus(status);
  });

  document.getElementById("pickBtn").addEventListener("click", async () => {
    const point = await window.api.pickPoint();
    if (point) {
      await save({ fixedPoint: point });
      updateModeVisibility();
    }
  });

  document.getElementById("colorTriggerEnabled").addEventListener("change", async (e) => {
    if (!proUnlocked) return;
    await save({ colorTrigger: { ...settings.colorTrigger, enabled: e.target.checked } });
  });
  document.getElementById("colorPickPointBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const point = await window.api.pickPoint();
    if (point) {
      await save({ colorTrigger: { ...settings.colorTrigger, point } });
      renderColorTrigger();
    }
  });
  document.getElementById("colorSampleBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const point = settings.colorTrigger && settings.colorTrigger.point;
    if (!point) {
      document.getElementById("colorTriggerHint").textContent = "Сначала выбери точку проверки.";
      return;
    }
    const color = await window.api.sampleColor(point);
    if (color) {
      await save({ colorTrigger: { ...settings.colorTrigger, color } });
      renderColorTrigger();
    }
  });

  // Привязка к окну
  document.getElementById("targetWindowTitle").addEventListener("change", async (e) => {
    await save({ targetWindowTitle: e.target.value.trim() });
    updateTargetWindowHint();
  });
  document.getElementById("pickActiveWindowBtn").addEventListener("click", async () => {
    const btn = document.getElementById("pickActiveWindowBtn");
    const hint = document.getElementById("targetWindowHint");
    btn.disabled = true;
    hint.textContent = "Переключись на нужное окно (Alt+Tab) — берём заголовок через 3 секунды…";
    const title = await window.api.pickActiveWindowTitle();
    btn.disabled = false;
    if (title) {
      document.getElementById("targetWindowTitle").value = title;
      await save({ targetWindowTitle: title });
    }
    updateTargetWindowHint();
  });

  // "Дождаться текста"
  document.getElementById("textTriggerEnabled").addEventListener("change", async (e) => {
    if (!proUnlocked) return;
    await save({ textTrigger: { ...settings.textTrigger, enabled: e.target.checked } });
  });
  document.getElementById("textTriggerPickBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const result = await window.api.pickTextTriggerRegion();
    if (result.ok) {
      await save({ textTrigger: { ...settings.textTrigger, region: result.region } });
      renderTextTrigger();
    }
  });
  document.getElementById("textTriggerExpected").addEventListener("change", async (e) => {
    if (!proUnlocked) return;
    await save({ textTrigger: { ...settings.textTrigger, expectedText: e.target.value } });
  });

  // "Триггер по картинке"
  document.getElementById("imageTriggerEnabled").addEventListener("change", async (e) => {
    if (!proUnlocked) return;
    await save({ imageTrigger: { ...settings.imageTrigger, enabled: e.target.checked } });
  });
  document.getElementById("imageTriggerPickBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const result = await window.api.pickImageTriggerTemplate();
    if (result.ok) {
      await save({
        imageTrigger: {
          ...settings.imageTrigger,
          templateFile: result.templateFile,
          width: result.width,
          height: result.height,
        },
      });
      renderImageTrigger();
    }
  });
  document.getElementById("imageTriggerConfidenceSlider").addEventListener("input", (e) => {
    document.getElementById("imageTriggerConfidence").value = e.target.value;
  });
  const saveImageConfidence = async (v) => {
    const confidence = Math.max(50, Math.min(100, parseInt(v, 10) || 90)) / 100;
    document.getElementById("imageTriggerConfidenceSlider").value = Math.round(confidence * 100);
    document.getElementById("imageTriggerConfidence").value = Math.round(confidence * 100);
    await save({ imageTrigger: { ...settings.imageTrigger, confidence } });
  };
  document.getElementById("imageTriggerConfidenceSlider").addEventListener("change", (e) => saveImageConfidence(e.target.value));
  document.getElementById("imageTriggerConfidence").addEventListener("change", (e) => saveImageConfidence(e.target.value));

  // Анти-АФК
  document.getElementById("antiAfkEnabled").addEventListener("change", async (e) => {
    await save({ antiAfkEnabled: e.target.checked });
  });
  document.getElementById("antiAfkIntervalSec").addEventListener("change", async (e) => {
    await save({ antiAfkIntervalSec: Math.max(5, parseInt(e.target.value, 10) || 45) });
  });

  // Расписание с повтором
  document.getElementById("scheduleRepeat").addEventListener("change", () => updateScheduleFieldsVisibility());
  document.getElementById("scheduleIntervalMin").addEventListener("change", async (e) => {
    await save({ scheduleIntervalMin: Math.max(1, parseInt(e.target.value, 10) || 30) });
  });

  document.getElementById("seqAddBtn").addEventListener("click", async () => {
    const newPoints = await window.api.pickPoints();
    if (newPoints && newPoints.length) {
      const points = [...(settings.sequencePoints || []), ...newPoints];
      await save({ sequencePoints: points });
      renderSeqList();
    }
  });
  document.getElementById("seqClearBtn").addEventListener("click", async () => {
    await save({ sequencePoints: [] });
    renderSeqList();
  });

  document.getElementById("activateBtn").addEventListener("click", async () => {
    const key = document.getElementById("licenseKey").value.trim();
    if (!key) return;
    const message = document.getElementById("licenseMessage");
    message.textContent = "Проверяем…";
    const result = await window.api.verifyLicense(key);
    proUnlocked = result.valid;
    updateProUI();
    if (result.valid) {
      const until = new Date(result.payload.expiresAt).toLocaleDateString("ru-RU");
      message.textContent = `Готово, Pro активирован до ${until}.`;
    } else if (result.expired) {
      message.textContent = "Этот ключ истёк — нужен новый.";
    } else if (result.wrongMachine) {
      message.textContent = "Этот ключ привязан к другому компьютеру.";
    } else {
      message.textContent = "Ключ не подошёл.";
    }
  });

  document.getElementById("copyMachineIdBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(document.getElementById("machineIdValue").textContent);
    showStatus("ID скопирован");
  });

  // Профили
  document.getElementById("saveProfileBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const nameInput = document.getElementById("newProfileName");
    const name = nameInput.value.trim();
    if (!name) return;
    const snapshot = {};
    for (const field of PROFILE_FIELDS) snapshot[field] = settings[field];
    const profiles = { ...(settings.profiles || {}), [name]: snapshot };
    await save({ profiles });
    nameInput.value = "";
    renderProfileSelect();
    document.getElementById("profileSelect").value = name;
  });
  document.getElementById("applyProfileBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const name = document.getElementById("profileSelect").value;
    const profile = (settings.profiles || {})[name];
    if (!profile) return;
    await save({ ...profile });
    loadIntoForm();
    showStatus(`Применён профиль «${name}»`);
  });
  document.getElementById("deleteProfileBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const name = document.getElementById("profileSelect").value;
    if (!name || !(settings.profiles || {})[name]) return;
    const profiles = { ...settings.profiles };
    delete profiles[name];
    await save({ profiles });
    renderProfileSelect();
  });

  // Экспорт/импорт
  document.getElementById("exportBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const result = await window.api.exportSettings();
    document.getElementById("importMessage").textContent = result.ok ? "Экспортировано." : "";
  });
  document.getElementById("importBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const result = await window.api.importSettings();
    const message = document.getElementById("importMessage");
    if (result.ok) {
      settings = result.settings;
      loadIntoForm();
      renderProfileSelect();
      renderMacroList();
      renderBindList();
      message.textContent = "Импортировано.";
    } else if (result.error) {
      message.textContent = `Ошибка: ${result.error}`;
    }
  });

  // Расписание
  document.getElementById("scheduleSetBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const repeat = document.getElementById("scheduleRepeat").value;
    const time = document.getElementById("scheduleTime").value;
    const intervalMin = Math.max(1, parseInt(document.getElementById("scheduleIntervalMin").value, 10) || 30);
    if (repeat !== "interval" && !time) return;
    const result = await window.api.setSchedule(time, repeat, intervalMin);
    const status = document.getElementById("scheduleStatus");
    if (!result.scheduledAt) {
      status.textContent = "";
      return;
    }
    const when = new Date(result.scheduledAt).toLocaleString("ru-RU");
    const suffix = repeat === "daily" ? " (повтор каждый день)" : repeat === "interval" ? ` (повтор каждые ${intervalMin} мин)` : "";
    status.textContent = `Запланировано на ${when}${suffix}`;
  });
  document.getElementById("scheduleCancelBtn").addEventListener("click", async () => {
    await window.api.cancelSchedule();
    document.getElementById("scheduleStatus").textContent = "";
  });

  // Макросы
  document.getElementById("recordBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const result = await window.api.startRecording();
    if (result.ok) {
      setRecordingUI(true);
    } else {
      document.getElementById("recordStatus").textContent =
        result.error === "pro-required"
          ? "Запись макросов — Pro-функция."
          : `Не удалось начать запись: ${result.error || "неизвестная ошибка"}.`;
    }
  });
  document.getElementById("stopRecordBtn").addEventListener("click", async () => {
    const result = await window.api.stopRecording();
    await promptAndSaveMacro(result.events);
  });

  document.getElementById("macroSaveConfirmBtn").addEventListener("click", async () => {
    const name = document.getElementById("macroSaveName").value.trim();
    const repeat = Math.max(1, Math.min(50, parseInt(document.getElementById("macroSaveRepeat").value, 10) || 1));
    const hotkey = document.getElementById("macroSaveHotkey").value.trim();
    if (!name) return;

    if (macroModalMode === "edit") {
      const oldName = editingMacroName;
      closeMacroSaveModal();
      try {
        settings.macros = await window.api.updateMacro(oldName, name, repeat, hotkey);
        renderMacroList();
        document.getElementById("recordStatus").textContent = `Изменено: «${name}».`;
      } catch (e) {
        document.getElementById("recordStatus").textContent = `Не удалось изменить: ${e.message}`;
      }
      return;
    }

    if (!pendingMacroEvents) return;
    const events = pendingMacroEvents;
    closeMacroSaveModal();
    try {
      settings.macros = await window.api.saveMacro(name, events, repeat, hotkey);
      renderMacroList();
      document.getElementById("recordStatus").textContent = `Сохранено: «${name}».`;
    } catch (e) {
      document.getElementById("recordStatus").textContent = `Не удалось сохранить: ${e.message}`;
    }
  });
  document.getElementById("macroSaveCancelBtn").addEventListener("click", () => {
    const wasEdit = macroModalMode === "edit";
    closeMacroSaveModal();
    document.getElementById("recordStatus").textContent = wasEdit ? "Изменения отменены." : "Запись не сохранена.";
  });
  document.getElementById("macroSaveName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("macroSaveConfirmBtn").click();
    if (e.key === "Escape") document.getElementById("macroSaveCancelBtn").click();
  });
  // Запасные пути закрытия — на случай если по каким-то причинам сама модалка "зависнет"
  // и надо выбраться без перезапуска приложения: клик по тёмному фону и Esc откуда угодно
  // в документе (не только пока фокус в поле имени).
  document.getElementById("macroSaveOverlay").addEventListener("click", (e) => {
    if (e.target.id === "macroSaveOverlay") document.getElementById("macroSaveCancelBtn").click();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("macroSaveOverlay").hidden) {
      document.getElementById("macroSaveCancelBtn").click();
    }
  });

  // Бинды
  document.getElementById("bindAddBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const message = document.getElementById("bindMessage");
    const hotkeyInput = document.getElementById("bindHotkey");
    const textInput = document.getElementById("bindText");
    const hotkey = hotkeyInput.value.trim();
    const text = textInput.value;
    if (!hotkey || !text) {
      message.textContent = "Заполни хоткей и текст.";
      return;
    }
    if ((settings.binds || []).some((b) => b.hotkey.toLowerCase() === hotkey.toLowerCase())) {
      message.textContent = "Такой хоткей уже занят другим биндом.";
      return;
    }
    const bind = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, hotkey, text };
    await save({ binds: [...(settings.binds || []), bind] });
    renderBindList();
    hotkeyInput.value = "";
    textInput.value = "";
    message.textContent = "Бинд добавлен.";
  });

  // Автозагрузка
  document.getElementById("startupRefreshBtn").addEventListener("click", () => renderStartupList());

  // Текст с экрана (OCR)
  document.getElementById("ocrLang").addEventListener("change", (e) => save({ ocrLang: e.target.value }));
  document.getElementById("recordMode").addEventListener("change", (e) => {
    save({ recordMode: e.target.value });
    updateRecordModeHint();
  });
  document.getElementById("ocrCaptureBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const status = document.getElementById("ocrStatus");
    const btn = document.getElementById("ocrCaptureBtn");
    btn.disabled = true;
    status.textContent = "Выдели область на экране (Esc — отмена)…";
    try {
      const result = await window.api.captureAndRecognizeText();
      if (!result.ok) {
        status.textContent =
          result.error === "cancelled"
            ? "Отменено."
            : result.error === "pro-required"
              ? "Распознавание текста — Pro-функция."
              : `Не удалось распознать: ${result.error || "неизвестная ошибка"}.`;
      } else {
        document.getElementById("ocrResult").value = result.text || "";
        status.textContent = result.text ? "Готово." : "Текст не найден в выделенной области.";
      }
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById("ocrCopyBtn").addEventListener("click", () => {
    const text = document.getElementById("ocrResult").value;
    if (!text) return;
    window.api.copyText(text);
    const status = document.getElementById("ocrStatus");
    status.textContent = "Скопировано в буфер обмена.";
  });

  // Цепочка макросов
  document.getElementById("macroChainPlayBtn").addEventListener("click", () => {
    if (!proUnlocked) return;
    const names = Array.from(document.querySelectorAll(".macro-chain-checkbox:checked")).map((el) => el.dataset.name);
    if (names.length === 0) return;
    window.api.playMacroChain(names);
  });

  // Запись экрана
  document.getElementById("recordStartBtn").addEventListener("click", () => startScreenRecording());
  document.getElementById("recordStopBtn").addEventListener("click", () => stopScreenRecording());
  document.getElementById("recordOpenFolderBtn").addEventListener("click", () => window.api.openRecordingsFolder());
  document.getElementById("recordMonitor").addEventListener("change", (e) => save({ recordMonitorId: parseInt(e.target.value, 10) }));
  document.getElementById("recordAudio").addEventListener("change", (e) => save({ recordAudio: e.target.checked }));
  document.getElementById("recordIndicatorEnabled").addEventListener("change", (e) => save({ recordIndicatorEnabled: e.target.checked }));

  // Автостарт при простое ("обратный анти-АФК")
  document.getElementById("idleStartEnabled").addEventListener("change", (e) => {
    if (!proUnlocked) return;
    save({ idleStartEnabled: e.target.checked });
  });
  document.getElementById("idleStartThresholdSec").addEventListener("change", (e) => {
    save({ idleStartThresholdSec: Math.max(5, parseInt(e.target.value, 10) || 60) });
  });

  // Уведомления в Telegram
  document.getElementById("telegramEnabled").addEventListener("change", (e) => {
    if (!proUnlocked) return;
    save({ telegramEnabled: e.target.checked });
  });
  document.getElementById("telegramBotToken").addEventListener("change", (e) => save({ telegramBotToken: e.target.value.trim() }));
  document.getElementById("telegramChatId").addEventListener("change", (e) => save({ telegramChatId: e.target.value.trim() }));
  document.getElementById("telegramTestBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const status = document.getElementById("telegramTestStatus");
    status.textContent = "Отправляем…";
    const result = await window.api.testTelegram();
    status.textContent = result.ok ? "Отправлено — проверь Telegram." : `Не удалось: ${result.error}`;
  });
  document.getElementById("telegramOnTrigger").addEventListener("change", async (e) => {
    if (!proUnlocked) return;
    await save({ telegramOnTrigger: e.target.checked });
  });

  // Журнал активности
  document.getElementById("logClearBtn").addEventListener("click", async () => {
    const log = await window.api.clearActivityLog();
    renderActivityLog(log);
  });

  // Буфер обмена
  document.getElementById("clipboardHistoryEnabled").addEventListener("change", async (e) => {
    await save({ clipboardHistoryEnabled: e.target.checked });
  });
  document.getElementById("clipboardClearBtn").addEventListener("click", async () => {
    const list = await window.api.clearClipboardHistory();
    renderClipboardList(list);
  });

  window.api.onStatus((status) => renderStatus(status));
  window.api.onNote((text) => {
    const note = document.getElementById("note");
    note.textContent = text;
    note.hidden = false;
    setTimeout(() => (note.hidden = true), 4000);
  });
  window.api.onRecordingStopped((events) => promptAndSaveMacro(events));
  window.api.onRecordingProgress((count) => {
    const status = document.getElementById("recordStatus");
    if (!document.getElementById("stopRecordBtn").disabled) {
      status.textContent = `Идёт запись… ${count} событий. Кликай и/или печатай, потом жми «Остановить» или ${settings.recordHotkey}.`;
    }
  });
  window.api.onActivityNew((entry) => {
    activityLogCache = [...activityLogCache, entry].slice(-100);
    renderActivityLog(activityLogCache);
  });
  window.api.onUpdateAvailable((info) => showUpdateNotice(info));
  window.api.onClipboardNew((entry) => {
    clipboardHistoryCache = [...clipboardHistoryCache, entry].slice(-50);
    renderClipboardList(clipboardHistoryCache);
  });
  window.api.onPanicStopRecording(() => {
    if (!document.getElementById("recordStopBtn").disabled) stopScreenRecording();
  });
}

// --- Журнал активности ---

let activityLogCache = [];

function renderActivityLog(log) {
  activityLogCache = log;
  const list = document.getElementById("logList");
  if (!log || log.length === 0) {
    list.innerHTML = `<div class="empty-hint">📋 Пока пусто</div>`;
    return;
  }
  list.innerHTML = [...log]
    .reverse()
    .map(
      (e) =>
        `<div class="macro-item"><span>${escapeHtml(new Date(e.ts).toLocaleString("ru-RU"))} — ${escapeHtml(e.message)}</span></div>`
    )
    .join("");
}

// --- Буфер обмена ---

let clipboardHistoryCache = [];

function renderClipboardList(history) {
  clipboardHistoryCache = history;
  const list = document.getElementById("clipboardList");
  if (!history || history.length === 0) {
    list.innerHTML = `<div class="empty-hint">📎 Пока пусто</div>`;
    return;
  }
  list.innerHTML = [...history]
    .reverse()
    .map((e, i) => {
      const preview = e.text.length > 80 ? `${e.text.slice(0, 80)}…` : e.text;
      return `<div class="macro-item">
        <span title="${escapeHtml(e.text)}">${escapeHtml(preview)}</span>
        <div class="item-actions">
          <button class="clipboard-copy-btn" data-i="${i}">Копировать</button>
        </div>
      </div>`;
    })
    .join("");
  const reversed = [...history].reverse();
  list.querySelectorAll(".clipboard-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => window.api.copyFromClipboardHistory(reversed[Number(btn.dataset.i)].text));
  });
}

function showUpdateNotice(info) {
  if (!info || !info.available) return;
  const el = document.getElementById("updateNotice");
  el.innerHTML = `Доступна новая версия <strong>v${escapeHtml(info.latestVersion)}</strong> — <a href="#" id="updateNoticeLink">скачать</a>.`;
  el.hidden = false;
  document.getElementById("updateNoticeLink").addEventListener("click", (e) => {
    e.preventDefault();
    window.api.openExternal(info.url);
  });
}

// --- Запись экрана (Pro) — два режима на выбор ---
//
// "Таймлапс": захват кадров и кодирование в ffmpeg целиком в main-процессе (main.js) — надёжно
// проверено вживую, но реальный темп захвата единицы fps (полноэкранный снимок — тяжёлая операция).
//
// "Видео": настоящий видеопоток через getDisplayMedia()+MediaRecorder прямо в рендерере — плавно,
// до 60 fps, но это тот класс API, что на одной из тестовых машин раньше (через устаревший
// getUserMedia+chromeMediaSourceId) подвешивал процесс намертво во время захвата. Современный
// getDisplayMedia — по крайней мере чище, но не проверено на такой же нестабильной машине, поэтому
// оба режима остаются рядом как явный выбор, а не тихая замена одного другим.

function updateRecordModeHint() {
  const mode = document.getElementById("recordMode").value;
  const hint = document.getElementById("recordModeHint");
  hint.textContent =
    mode === "video"
      ? "Плавное видео с реальным fps экрана. Экспериментально — если зависнет во время записи, переключись на «Таймлапс»."
      : "Надёжный режим: отдельные кадры собираются в .mp4 по остановке. Не плавное видео — 2-4 кадра в секунду.";
  document.getElementById("recordAudioField").hidden = mode !== "video";
}

let recordMonitorsCache = [];

async function populateRecordMonitors() {
  const select = document.getElementById("recordMonitor");
  recordMonitorsCache = await window.api.listRecordMonitors();
  select.innerHTML = recordMonitorsCache.map((m) => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("");
  if (settings.recordMonitorId != null) select.value = settings.recordMonitorId;
}

let videoRecorder = null;
let videoChunks = [];
let videoStream = null;

async function startVideoRecording(status) {
  // Без явных width/height getDisplayMedia() на этой машине игнорировал выбранный монитор и всё
  // равно отдавал разрешение другого экрана — проверено вживую. С явными ideal-размерами
  // выбранного монитора отдаёт корректный поток именно с него.
  const chosenMonitor = recordMonitorsCache.find((m) => m.id === settings.recordMonitorId);
  const videoConstraints = { frameRate: 60 };
  if (chosenMonitor) {
    videoConstraints.width = { ideal: chosenMonitor.width };
    videoConstraints.height = { ideal: chosenMonitor.height };
  }
  try {
    videoStream = await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints, audio: !!settings.recordAudio });
  } catch (e) {
    status.textContent = `Не удалось начать запись видео: ${e.message}`;
    return false;
  }
  videoChunks = [];
  videoRecorder = new MediaRecorder(videoStream, { mimeType: "video/webm;codecs=vp9" });
  videoRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) videoChunks.push(e.data);
  };
  videoRecorder.onstop = async () => {
    videoStream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(videoChunks, { type: "video/webm" });
    const buffer = await blob.arrayBuffer();
    status.textContent = "Конвертируем в MP4…";
    const result = await window.api.saveVideoRecording(buffer);
    document.getElementById("recordStartBtn").disabled = !proUnlocked;
    status.textContent = result.ok ? `Сохранено: ${result.path}` : `Не удалось сохранить: ${result.error}`;
  };
  videoRecorder.start();
  return true;
}

function stopVideoRecording() {
  if (videoRecorder && videoRecorder.state !== "inactive") videoRecorder.stop();
}

function countdown(status, seconds) {
  return new Promise((resolve) => {
    const tick = (n) => {
      if (n === 0) {
        resolve();
        return;
      }
      status.textContent = `Начинаем через ${n}…`;
      setTimeout(() => tick(n - 1), 1000);
    };
    tick(seconds);
  });
}

let activeRecordMode = null; // реальный режим текущей записи — может отличаться от settings.recordMode при авто-переключении ниже

async function startScreenRecording() {
  if (!proUnlocked) return;
  const status = document.getElementById("recordScreenStatus");
  const startBtn = document.getElementById("recordStartBtn");
  startBtn.disabled = true;
  await countdown(status, 3);
  let mode = settings.recordMode || "timelapse";
  // "Таймлапс" физически не может записать монитор левее/выше основного (отрицательные координаты
  // в общем виртуальном рабочем столе — nut-js captureRegion() такие отклоняет). Раньше это была
  // просто ошибка с советом переключиться на «Видео» вручную — теперь переключаем сами, раз второй
  // режим и так способен записать любой монитор.
  if (mode === "timelapse") {
    const chosenMonitor = recordMonitorsCache.find((m) => m.id === settings.recordMonitorId);
    if (chosenMonitor && chosenMonitor.negativeCoords) {
      mode = "video";
      status.textContent = "«Таймлапс» не может записать этот монитор — переключаемся на «Видео»…";
    }
  }
  activeRecordMode = mode;
  if (mode === "video") {
    const ok = await startVideoRecording(status);
    if (!ok) {
      startBtn.disabled = !proUnlocked;
      return;
    }
  } else {
    const result = await window.api.startRecordingScreen();
    if (!result.ok) {
      status.textContent = `Не удалось начать запись: ${result.error}`;
      startBtn.disabled = !proUnlocked;
      return;
    }
  }
  if (mode === "video") window.api.showRecordHud();
  document.getElementById("recordStopBtn").disabled = false;
  status.textContent = "Идёт запись…";
}

async function stopScreenRecording() {
  const status = document.getElementById("recordScreenStatus");
  document.getElementById("recordStopBtn").disabled = true;
  const mode = activeRecordMode || settings.recordMode || "timelapse";
  if (mode === "video") {
    window.api.hideRecordHud();
    status.textContent = "Собираем видео…";
    stopVideoRecording(); // recordStartBtn разблокируется внутри onstop — сохранение асинхронное
  } else {
    status.textContent = "Собираем видео из кадров…";
    const result = await window.api.stopRecordingScreen();
    document.getElementById("recordStartBtn").disabled = !proUnlocked;
    status.textContent = result.ok
      ? `Сохранено: ${result.path} (${result.frames} кадров, ~${result.fps} fps)`
      : `Не удалось сохранить: ${result.error}`;
  }
}

async function init() {
  const result = await window.api.getSettings();
  settings = result.settings;
  proUnlocked = result.proUnlocked;
  if (result.appVersion) document.getElementById("versionBadge").textContent = `v${result.appVersion}`;
  loadIntoForm();
  updateProUI();
  renderProfileSelect();
  renderMacroList();
  renderBindList();
  bindHandlers();
  const status = await window.api.getStatus();
  renderStatus(status);

  document.getElementById("machineIdValue").textContent = await window.api.getMachineId();

  populateRecordMonitors();
  renderActivityLog(await window.api.getActivityLog());
  renderClipboardList(await window.api.getClipboardHistory());
  showUpdateNotice(await window.api.getUpdateInfo());
}

init();
