const PROFILE_FIELDS = [
  "intervalMs",
  "jitterMs",
  "actionType",
  "button",
  "keyToPress",
  "positionJitterPx",
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

// --- Tabs ---

function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        const show = panel.dataset.panel === btn.dataset.tab;
        panel.hidden = !show;
        if (show) {
          // Перезапускаем CSS-анимацию появления (иначе сыграет только один раз).
          panel.classList.remove("tab-panel");
          void panel.offsetWidth;
          panel.classList.add("tab-panel");
        }
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
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
  ];
  for (const id of proOnlyIds) document.getElementById(id).disabled = !proUnlocked;

  const proStatus = document.getElementById("proStatus");
  proStatus.textContent = proUnlocked
    ? "Pro активирован — без лимита кликов, разброс позиции, последовательность точек, макросы, профили, расписание."
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

  document.getElementById("intervalMsSlider").value = Math.min(2000, settings.intervalMs);
  document.getElementById("intervalMsValue").textContent = settings.intervalMs;
  document.getElementById("jitterMsSlider").value = Math.min(500, settings.jitterMs);
  document.getElementById("jitterMsValue").textContent = settings.jitterMs;
  document.getElementById("positionJitterPxSlider").value = Math.min(200, settings.positionJitterPx);
  document.getElementById("positionJitterPxValue").textContent = settings.positionJitterPx;

  updateActionVisibility();
  updateModeVisibility();
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

function renderMacroList() {
  const list = document.getElementById("macroList");
  const names = Object.keys(settings.macros || {});
  if (names.length === 0) {
    list.innerHTML = `<div class="empty-hint">🎬 Пока нет записанных макросов</div>`;
    return;
  }
  list.innerHTML = names
    .map(
      (n) => `<div class="macro-item">
        <span>${escapeHtml(n)} (${settings.macros[n].length} кликов)</span>
        <div class="item-actions">
          <button class="play-btn" data-name="${escapeHtml(n)}">▶ Играть</button>
          <button class="delete-btn" data-name="${escapeHtml(n)}">×</button>
        </div>
      </div>`
    )
    .join("");
  list.querySelectorAll(".play-btn").forEach((btn) => {
    btn.addEventListener("click", () => window.api.playMacro(btn.dataset.name));
  });
  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      settings.macros = await window.api.deleteMacro(btn.dataset.name);
      renderMacroList();
    });
  });
}

async function promptAndSaveMacro(events) {
  setRecordingUI(false);
  if (!events || events.length === 0) {
    document.getElementById("recordStatus").textContent = "Ничего не записано (не было кликов).";
    return;
  }
  const name = window.prompt(`Записано кликов: ${events.length}. Название макроса:`, "");
  if (!name) {
    document.getElementById("recordStatus").textContent = "Запись не сохранена.";
    return;
  }
  settings.macros = await window.api.saveMacro(name, events);
  renderMacroList();
  document.getElementById("recordStatus").textContent = `Сохранено: «${name}».`;
}

function setRecordingUI(active) {
  document.getElementById("recordBtn").disabled = active || !proUnlocked;
  document.getElementById("stopRecordBtn").disabled = !active;
  if (active) {
    document.getElementById("recordStatus").textContent = `Идёт запись… кликай, потом жми «Остановить» или ${settings.recordHotkey}.`;
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

  initTabs();

  bindSlider("intervalMs", (v) => save({ intervalMs: Math.max(10, v || 100) }));
  bindSlider("jitterMs", (v) => save({ jitterMs: Math.max(0, v || 0) }));
  bindSlider("positionJitterPx", (v) => save({ positionJitterPx: Math.max(0, v || 0) }));

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

  document.getElementById("donateBtn").addEventListener("click", async () => {
    const result = await window.api.openDonate();
    const message = document.getElementById("donateMessage");
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

  document.getElementById("seqAddBtn").addEventListener("click", async () => {
    const point = await window.api.pickPoint();
    if (point) {
      const points = [...(settings.sequencePoints || []), point];
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
      message.textContent = "Импортировано.";
    } else if (result.error) {
      message.textContent = `Ошибка: ${result.error}`;
    }
  });

  // Расписание
  document.getElementById("scheduleSetBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const time = document.getElementById("scheduleTime").value;
    if (!time) return;
    const result = await window.api.setSchedule(time);
    const status = document.getElementById("scheduleStatus");
    status.textContent = result.scheduledAt
      ? `Запланировано на ${new Date(result.scheduledAt).toLocaleString("ru-RU")}`
      : "";
  });
  document.getElementById("scheduleCancelBtn").addEventListener("click", async () => {
    await window.api.cancelSchedule();
    document.getElementById("scheduleStatus").textContent = "";
  });

  // Макросы
  document.getElementById("recordBtn").addEventListener("click", async () => {
    if (!proUnlocked) return;
    const result = await window.api.startRecording();
    if (result.ok) setRecordingUI(true);
  });
  document.getElementById("stopRecordBtn").addEventListener("click", async () => {
    const result = await window.api.stopRecording();
    await promptAndSaveMacro(result.events);
  });

  window.api.onStatus((status) => renderStatus(status));
  window.api.onNote((text) => {
    const note = document.getElementById("note");
    note.textContent = text;
    note.hidden = false;
    setTimeout(() => (note.hidden = true), 4000);
  });
  window.api.onRecordingStopped((events) => promptAndSaveMacro(events));
}

async function init() {
  const result = await window.api.getSettings();
  settings = result.settings;
  proUnlocked = result.proUnlocked;
  loadIntoForm();
  updateProUI();
  renderProfileSelect();
  renderMacroList();
  bindHandlers();
  const status = await window.api.getStatus();
  renderStatus(status);

  document.getElementById("machineIdValue").textContent = await window.api.getMachineId();
}

init();
