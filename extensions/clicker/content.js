const DEFAULT_SETTINGS = {
  intervalMs: 100,
  jitterMs: 20,
  actionType: "mouse", // 'mouse' | 'keyboard'
  button: "left", // 'left' | 'right' | 'double'
  keyToPress: { key: " ", code: "Space", keyCode: 32 },
  hotkey: "F8",
  stopAfterClicks: 0, // 0 = не останавливать
  stopAfterMs: 0, // 0 = не останавливать
  positionJitterPx: 0, // 0 = кликать точно в точку, без разброса
  licenseKey: "", // проверяется офлайн, без сети — см. license-tools/
};

const FREE_SESSION_CLICK_CAP = 5000; // бесплатная версия: лимит на один непрерывный запуск

const STORAGE_KEY = `ac-site-state:${location.hostname}`;

let settings = { ...DEFAULT_SETTINGS };
let proUnlocked = false; // производное от settings.licenseKey, не хранится напрямую
let running = false;
let panelVisible = false; // по умолчанию панель полностью скрыта, открывается из popup
let collapsed = false; // когда видима — свёрнута в маленький значок или показана целиком
let mode = "cursor"; // 'cursor' | 'point' | 'sequence'
let fixedPoint = null; // { x, y } — для режима 'point'
let sequencePoints = []; // [{ x, y }, ...] — для режима 'sequence'
let sequenceIndex = 0;
let pickingPoint = false;
let addingSequencePoint = false;
let listeningForKey = false;
let lastMouse = { x: 0, y: 0 };
let clickCount = 0; // счётчик за всё время жизни вкладки, для отображения
let sessionClicks = 0; // счётчик с момента последнего старта, для автостопа
let sessionStartedAt = 0;
let timerId = null;

function isEditable(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

document.addEventListener(
  "mousemove",
  (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (pickingPoint || addingSequencePoint) positionMarker(lastMouse);
  },
  true
);

// --- Mouse action ---

function applyPositionJitter(point) {
  if (!proUnlocked || !settings.positionJitterPx) return point;
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * settings.positionJitterPx;
  return { x: point.x + Math.cos(angle) * r, y: point.y + Math.sin(angle) * r };
}

function getMouseTargetPoint() {
  if (mode === "point" && fixedPoint) return fixedPoint;
  if (mode === "sequence" && proUnlocked && sequencePoints.length > 0) {
    const point = sequencePoints[sequenceIndex % sequencePoints.length];
    sequenceIndex++;
    return point;
  }
  return lastMouse;
}

function fireClickAt(target, x, y, buttonNum) {
  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: buttonNum };
  target.dispatchEvent(new MouseEvent("mousedown", opts));
  target.dispatchEvent(new MouseEvent("mouseup", opts));
  target.click();
  return opts;
}

function performMouseClick() {
  const point = applyPositionJitter(getMouseTargetPoint());
  const target = document.elementFromPoint(point.x, point.y);
  if (!target) return;

  if (settings.button === "right") {
    const opts = { bubbles: true, cancelable: true, view: window, clientX: point.x, clientY: point.y, button: 2 };
    target.dispatchEvent(new MouseEvent("mousedown", opts));
    target.dispatchEvent(new MouseEvent("mouseup", opts));
    target.dispatchEvent(new MouseEvent("contextmenu", opts));
  } else if (settings.button === "double") {
    const opts = fireClickAt(target, point.x, point.y, 0);
    setTimeout(() => {
      fireClickAt(target, point.x, point.y, 0);
      target.dispatchEvent(new MouseEvent("dblclick", opts));
    }, 40);
  } else {
    fireClickAt(target, point.x, point.y, 0);
  }

  flashMarker(point);
}

// --- Keyboard action ---

function patchKeyCode(event, keyCode) {
  if (keyCode == null) return;
  Object.defineProperty(event, "keyCode", { get: () => keyCode });
  Object.defineProperty(event, "which", { get: () => keyCode });
}

function performKeyPress() {
  const info = settings.keyToPress || DEFAULT_SETTINGS.keyToPress;
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
  const init = { key: info.key, code: info.code, bubbles: true, cancelable: true };

  const down = new KeyboardEvent("keydown", init);
  const up = new KeyboardEvent("keyup", init);
  patchKeyCode(down, info.keyCode);
  patchKeyCode(up, info.keyCode);

  target.dispatchEvent(down);
  target.dispatchEvent(up);
  flashKeyIndicator();
}

function keyLabel(info) {
  if (!info) return "—";
  if (info.key === " ") return "Space";
  return info.key.length === 1 ? info.key.toUpperCase() : info.key;
}

// --- Shared loop ---

function performAction() {
  if (settings.actionType === "keyboard") {
    performKeyPress();
  } else {
    performMouseClick();
  }
  clickCount++;
  sessionClicks++;
  updateStatusUI();
  checkAutoStop();
}

function checkAutoStop() {
  if (!proUnlocked && sessionClicks >= FREE_SESSION_CLICK_CAP) {
    stop(`Бесплатная версия: лимит ${FREE_SESSION_CLICK_CAP} кликов за один запуск. Жми «Старт» ещё раз, или сними лимит в Pro.`);
    return;
  }
  if (settings.stopAfterClicks > 0 && sessionClicks >= settings.stopAfterClicks) {
    stop("Остановлено: набран лимит кликов");
    return;
  }
  if (settings.stopAfterMs > 0 && Date.now() - sessionStartedAt >= settings.stopAfterMs) {
    stop("Остановлено: вышло время");
  }
}

function scheduleNext() {
  if (!running) return;
  const jitter = settings.jitterMs > 0 ? (Math.random() * 2 - 1) * settings.jitterMs : 0;
  const delay = Math.max(10, settings.intervalMs + jitter);
  timerId = setTimeout(() => {
    performAction();
    scheduleNext();
  }, delay);
}

function start() {
  if (running) return;
  if (settings.actionType === "mouse" && mode === "point" && !fixedPoint) {
    startPickingPoint();
    return;
  }
  if (settings.actionType === "mouse" && mode === "sequence" && sequencePoints.length === 0) {
    showNote("Сначала добавь хотя бы одну точку в последовательность");
    return;
  }
  running = true;
  sessionClicks = 0;
  sessionStartedAt = Date.now();
  updatePanelUI();
  updateStatusDot();
  scheduleNext();
}

function stop(reason) {
  running = false;
  clearTimeout(timerId);
  updatePanelUI();
  updateStatusDot();
  if (reason) showNote(reason);
}

function toggle() {
  if (running) stop();
  else start();
}

// --- Fixed point picking (mouse mode) ---

function startPickingPoint() {
  pickingPoint = true;
  ensureMarker();
  updatePanelUI();
}

function handlePickClick(e) {
  e.preventDefault();
  e.stopPropagation();
  fixedPoint = { x: e.clientX, y: e.clientY };
  pickingPoint = false;
  positionMarker(fixedPoint);
  running = true;
  sessionClicks = 0;
  sessionStartedAt = Date.now();
  updatePanelUI();
  updateStatusDot();
  scheduleNext();
  saveSiteState();
}

function handleAddSequencePoint(e) {
  e.preventDefault();
  e.stopPropagation();
  sequencePoints.push({ x: e.clientX, y: e.clientY });
  addingSequencePoint = false;
  if (markerEl) markerEl.style.display = "none";
  updatePanelUI();
  saveSiteState();
}

document.addEventListener(
  "click",
  (e) => {
    if (panelEl && panelEl.contains(e.target)) return;
    if (addingSequencePoint) {
      handleAddSequencePoint(e);
    } else if (pickingPoint) {
      handlePickClick(e);
    }
  },
  true
);

// --- Hotkeys + key capture ---

document.addEventListener("keydown", (e) => {
  if (listeningForKey) {
    e.preventDefault();
    e.stopPropagation();
    settings.keyToPress = { key: e.key, code: e.code, keyCode: e.keyCode };
    listeningForKey = false;
    chrome.storage.sync.set({ keyToPress: settings.keyToPress });
    updatePanelUI();
    return;
  }

  // Аварийный стоп: работает всегда, независимо от настроенного хоткея.
  if (e.key === "Escape" && running) {
    stop("Остановлено клавишей Esc");
    return;
  }

  if (isEditable(document.activeElement)) return;
  if (e.key.toUpperCase() === settings.hotkey.toUpperCase()) {
    e.preventDefault();
    toggle();
  }
});

// --- Marker (visual indicator for fixed point / click flash) ---

let markerEl = null;

function ensureMarker() {
  if (markerEl) return markerEl;
  markerEl = document.createElement("div");
  markerEl.className = "ac-marker";
  document.documentElement.appendChild(markerEl);
  return markerEl;
}

function positionMarker(point) {
  const m = ensureMarker();
  m.style.left = `${point.x}px`;
  m.style.top = `${point.y}px`;
  m.style.display = "block";
}

function flashMarker(point) {
  const m = ensureMarker();
  positionMarker(point);
  m.classList.add("ac-flash");
  setTimeout(() => m.classList.remove("ac-flash"), 150);
}

function flashKeyIndicator() {
  if (!panelEl) return;
  const el = panelEl.querySelector(".ac-key-flash");
  if (!el) return;
  el.classList.add("ac-flash");
  setTimeout(() => el.classList.remove("ac-flash"), 150);
}

// --- Sequence point markers (shown only while panel is open) ---

let sequenceMarkersEl = null;

function renderSequenceMarkers() {
  if (sequenceMarkersEl) {
    sequenceMarkersEl.remove();
    sequenceMarkersEl = null;
  }
  if (!panelVisible || mode !== "sequence" || sequencePoints.length === 0) return;

  sequenceMarkersEl = document.createElement("div");
  sequenceMarkersEl.className = "ac-seq-markers";
  sequencePoints.forEach((point, i) => {
    const dot = document.createElement("div");
    dot.className = "ac-seq-dot";
    dot.style.left = `${point.x}px`;
    dot.style.top = `${point.y}px`;
    dot.textContent = i + 1;
    sequenceMarkersEl.appendChild(dot);
  });
  document.documentElement.appendChild(sequenceMarkersEl);
}

// --- Always-visible status dot (independent of panel visibility) ---

let statusDotEl = null;

function ensureStatusDot() {
  if (statusDotEl) return statusDotEl;
  statusDotEl = document.createElement("div");
  statusDotEl.className = "ac-status-dot";
  statusDotEl.title = "Автокликер активен — клик остановит";
  statusDotEl.addEventListener("click", () => stop("Остановлено кликом по индикатору"));
  document.documentElement.appendChild(statusDotEl);
  return statusDotEl;
}

function updateStatusDot() {
  const dot = ensureStatusDot();
  dot.classList.toggle("ac-visible", running);
}

// --- Toast note ---

let noteTimer = null;

function showNote(text) {
  if (!panelEl) return;
  const note = panelEl.querySelector(".ac-note");
  note.textContent = text;
  note.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    note.hidden = true;
  }, 4000);
}

// --- Per-site persistence (panel position, points, mode, visibility) ---

function saveSiteState() {
  const rect = panelEl ? panelEl.getBoundingClientRect() : null;
  chrome.storage.local.set({
    [STORAGE_KEY]: {
      left: rect ? rect.left : null,
      top: rect ? rect.top : null,
      mode,
      fixedPoint,
      sequencePoints,
      panelVisible,
      collapsed,
    },
  });
}

function loadSiteState(callback) {
  chrome.storage.local.get([STORAGE_KEY], (data) => callback(data[STORAGE_KEY] || null));
}

// --- Floating panel ---

let panelEl = null;

function buildPanel() {
  const panel = document.createElement("div");
  panel.className = "ac-panel";
  panel.innerHTML = `
    <div class="ac-header">
      <span class="ac-drag" title="Перетащи, чтобы передвинуть панель">⠿ Автокликер</span>
      <button class="ac-minimize" title="Свернуть в значок">─</button>
      <button class="ac-hide" title="Закрыть полностью. Открыть обратно можно из иконки расширения на панели инструментов">✕</button>
      <button class="ac-expand" title="Развернуть панель" hidden>🖱</button>
    </div>
    <div class="ac-body">
      <div class="ac-note" hidden></div>

      <button class="ac-toggle" title="Хоткей ${settings.hotkey} делает то же самое. Esc — всегда аварийный стоп. Глобальные хоткеи — в настройках.">Старт (${settings.hotkey})</button>

      <div class="ac-row">
        <label title="Пауза между кликами/нажатиями">Интервал, мс</label>
        <input type="number" class="ac-interval" min="10" step="10" value="${settings.intervalMs}" />
      </div>

      <div class="ac-row">
        <label title="Что именно автоматизируем">Действие</label>
        <select class="ac-action-type">
          <option value="mouse">Мышь</option>
          <option value="keyboard">Клавиатура</option>
        </select>
      </div>

      <div class="ac-mouse-controls">
        <div class="ac-row">
          <label>Кнопка</label>
          <select class="ac-button">
            <option value="left">Левая</option>
            <option value="right">Правая</option>
            <option value="double">Двойной</option>
          </select>
        </div>
        <div class="ac-row">
          <label title="Курсор — под мышью. Точка — одно зафиксированное место. Последовательность — несколько точек по очереди">Куда кликать</label>
          <select class="ac-mode">
            <option value="cursor">Под курсором</option>
            <option value="point">В точке</option>
            <option value="sequence" class="ac-sequence-option">Последовательность точек 🔒 Pro</option>
          </select>
        </div>
        <button class="ac-pick" hidden>Выбрать точку</button>

        <div class="ac-sequence-controls" hidden>
          <div class="ac-seq-list"></div>
          <button class="ac-seq-add">Добавить точку</button>
          <button class="ac-seq-clear">Очистить точки</button>
        </div>
      </div>

      <div class="ac-keyboard-controls" hidden>
        <div class="ac-row">
          <label>Клавиша</label>
          <span class="ac-key-flash ac-key-name">Space</span>
        </div>
        <button class="ac-set-key">Установить клавишу</button>
        <p class="ac-hint">Не печатает текст в поля — только события нажатия для игр и скриптов.</p>
      </div>

      <div class="ac-limits">
        <div class="ac-row">
          <label title="Случайное смещение точки клика в пикселях, чтобы клики не были идеально точными">Разброс позиции, px 🔒 Pro</label>
          <input type="number" class="ac-pos-jitter" min="0" step="1" value="${settings.positionJitterPx}" />
        </div>
        <div class="ac-row">
          <label title="0 — без ограничения">Стоп после кликов</label>
          <input type="number" class="ac-stop-clicks" min="0" step="1" value="${settings.stopAfterClicks}" />
        </div>
        <div class="ac-row">
          <label title="0 — без ограничения">Стоп через, сек</label>
          <input type="number" class="ac-stop-seconds" min="0" step="1" value="${settings.stopAfterMs / 1000}" />
        </div>
      </div>

      <div class="ac-count">Кликов: <span class="ac-count-value">0</span></div>
    </div>
  `;
  document.documentElement.appendChild(panel);
  return panel;
}

function renderSequenceList() {
  const list = panelEl.querySelector(".ac-seq-list");
  if (sequencePoints.length === 0) {
    list.innerHTML = `<div class="ac-seq-empty">Точек пока нет</div>`;
  } else {
    list.innerHTML = sequencePoints
      .map((_, i) => `<div class="ac-seq-item"><span>Точка ${i + 1}</span><button class="ac-seq-remove" data-i="${i}">×</button></div>`)
      .join("");
    list.querySelectorAll(".ac-seq-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        sequencePoints.splice(parseInt(btn.dataset.i, 10), 1);
        renderSequenceList();
        renderSequenceMarkers();
        saveSiteState();
      });
    });
  }
}

function updatePanelUI() {
  if (!panelEl) return;

  panelEl.classList.toggle("ac-hidden", !panelVisible);
  panelEl.classList.toggle("ac-collapsed", collapsed);
  panelEl.querySelector(".ac-minimize").hidden = collapsed;
  panelEl.querySelector(".ac-hide").hidden = collapsed;
  panelEl.querySelector(".ac-expand").hidden = !collapsed;

  const toggleBtn = panelEl.querySelector(".ac-toggle");
  const pickBtn = panelEl.querySelector(".ac-pick");
  const setKeyBtn = panelEl.querySelector(".ac-set-key");
  const seqControls = panelEl.querySelector(".ac-sequence-controls");

  setKeyBtn.textContent = listeningForKey ? "Нажми клавишу…" : "Установить клавишу";
  panelEl.querySelector(".ac-key-name").textContent = keyLabel(settings.keyToPress);

  if (pickingPoint) {
    toggleBtn.textContent = "Кликни на странице…";
    toggleBtn.disabled = true;
  } else if (addingSequencePoint) {
    toggleBtn.textContent = "Кликни, чтобы добавить точку…";
    toggleBtn.disabled = true;
  } else {
    toggleBtn.disabled = false;
    toggleBtn.textContent = running ? `Стоп (${settings.hotkey})` : `Старт (${settings.hotkey})`;
    toggleBtn.classList.toggle("ac-running", running);
  }

  panelEl.querySelector(".ac-mouse-controls").hidden = settings.actionType !== "mouse";
  panelEl.querySelector(".ac-keyboard-controls").hidden = settings.actionType !== "keyboard";
  pickBtn.hidden = settings.actionType !== "mouse" || mode !== "point";
  pickBtn.textContent = fixedPoint ? "Выбрать точку заново" : "Выбрать точку";
  seqControls.hidden = settings.actionType !== "mouse" || mode !== "sequence";

  panelEl.querySelector(".ac-sequence-option").disabled = !proUnlocked;
  panelEl.querySelector(".ac-pos-jitter").disabled = !proUnlocked;

  if (mode === "sequence") {
    renderSequenceList();
  }
  renderSequenceMarkers();
}

function updateStatusUI() {
  if (!panelEl) return;
  panelEl.querySelector(".ac-count-value").textContent = clickCount;
}

function initPanel(siteState) {
  panelEl = buildPanel();

  panelEl.querySelector(".ac-toggle").addEventListener("click", toggle);

  panelEl.querySelector(".ac-hide").addEventListener("click", () => {
    panelVisible = false;
    updatePanelUI();
    saveSiteState();
  });

  panelEl.querySelector(".ac-minimize").addEventListener("click", () => {
    collapsed = true;
    updatePanelUI();
    saveSiteState();
  });

  panelEl.querySelector(".ac-expand").addEventListener("click", () => {
    collapsed = false;
    updatePanelUI();
    saveSiteState();
  });

  panelEl.querySelector(".ac-interval").addEventListener("change", (e) => {
    settings.intervalMs = Math.max(10, parseInt(e.target.value, 10) || DEFAULT_SETTINGS.intervalMs);
    chrome.storage.sync.set({ intervalMs: settings.intervalMs });
  });

  const actionTypeSelect = panelEl.querySelector(".ac-action-type");
  actionTypeSelect.value = settings.actionType;
  actionTypeSelect.addEventListener("change", (e) => {
    settings.actionType = e.target.value;
    chrome.storage.sync.set({ actionType: settings.actionType });
    updatePanelUI();
  });

  panelEl.querySelector(".ac-button").value = settings.button;
  panelEl.querySelector(".ac-button").addEventListener("change", (e) => {
    settings.button = e.target.value;
    chrome.storage.sync.set({ button: settings.button });
  });

  panelEl.querySelector(".ac-mode").value = mode;
  panelEl.querySelector(".ac-mode").addEventListener("change", (e) => {
    mode = e.target.value;
    pickingPoint = false;
    addingSequencePoint = false;
    if (markerEl) markerEl.style.display = "none";
    updatePanelUI();
    saveSiteState();
  });

  panelEl.querySelector(".ac-pick").addEventListener("click", () => {
    stop();
    fixedPoint = null;
    startPickingPoint();
  });

  panelEl.querySelector(".ac-seq-add").addEventListener("click", () => {
    addingSequencePoint = true;
    ensureMarker();
    updatePanelUI();
  });

  panelEl.querySelector(".ac-seq-clear").addEventListener("click", () => {
    sequencePoints = [];
    sequenceIndex = 0;
    renderSequenceList();
    renderSequenceMarkers();
    saveSiteState();
  });

  panelEl.querySelector(".ac-set-key").addEventListener("click", () => {
    listeningForKey = true;
    updatePanelUI();
  });

  panelEl.querySelector(".ac-pos-jitter").addEventListener("change", (e) => {
    settings.positionJitterPx = Math.max(0, parseInt(e.target.value, 10) || 0);
    chrome.storage.sync.set({ positionJitterPx: settings.positionJitterPx });
  });

  panelEl.querySelector(".ac-stop-clicks").addEventListener("change", (e) => {
    settings.stopAfterClicks = Math.max(0, parseInt(e.target.value, 10) || 0);
    chrome.storage.sync.set({ stopAfterClicks: settings.stopAfterClicks });
  });

  panelEl.querySelector(".ac-stop-seconds").addEventListener("change", (e) => {
    const seconds = Math.max(0, parseFloat(e.target.value) || 0);
    settings.stopAfterMs = seconds * 1000;
    chrome.storage.sync.set({ stopAfterMs: settings.stopAfterMs });
  });

  makeDraggable(panelEl, panelEl.querySelector(".ac-drag"));

  if (siteState) {
    if (siteState.left != null && siteState.top != null) {
      panelEl.style.left = `${siteState.left}px`;
      panelEl.style.top = `${siteState.top}px`;
      panelEl.style.right = "auto";
      panelEl.style.bottom = "auto";
    }
    if (siteState.mode) {
      mode = siteState.mode;
      panelEl.querySelector(".ac-mode").value = mode;
    }
    if (siteState.fixedPoint) {
      fixedPoint = siteState.fixedPoint;
      positionMarker(fixedPoint);
    }
    if (Array.isArray(siteState.sequencePoints)) {
      sequencePoints = siteState.sequencePoints;
    }
    if (siteState.panelVisible) {
      panelVisible = true;
    }
    if (siteState.collapsed) {
      collapsed = true;
    }
  }

  updatePanelUI();
}

function makeDraggable(panel, handle) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top = `${e.clientY - offsetY}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (dragging) saveSiteState();
    dragging = false;
  });
}

// --- Messaging with popup / background ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATUS") {
    sendResponse({ running, clickCount, mode, panelVisible, settings });
  } else if (message.type === "TOGGLE") {
    toggle();
    sendResponse({ running });
  } else if (message.type === "PANIC_STOP") {
    stop("Остановлено глобальным хоткеем");
    sendResponse({ running });
  } else if (message.type === "TOGGLE_PANEL") {
    panelVisible = !panelVisible;
    updatePanelUI();
    saveSiteState();
    sendResponse({ panelVisible });
  } else if (message.type === "APPLY_SETTINGS") {
    settings = { ...settings, ...message.settings };
    updatePanelUI();
    sendResponse({ ok: true });
  }
});

// --- License (verifyLicenseKey живёт в license.js, общий для content/options/popup) ---

async function refreshLicenseStatus() {
  const result = await verifyLicenseKey(settings.licenseKey);
  proUnlocked = result.valid;
  updatePanelUI();
}

// --- Init ---

chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  loadSiteState((siteState) => initPanel(siteState));
  ensureStatusDot();
  refreshLicenseStatus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const key of Object.keys(changes)) {
    settings[key] = changes[key].newValue;
  }
  if ("licenseKey" in changes) {
    refreshLicenseStatus();
  } else {
    updatePanelUI();
  }
});
