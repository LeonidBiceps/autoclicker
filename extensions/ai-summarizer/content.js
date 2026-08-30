const MAX_CHARS = 8000;

const STYLES = [
  { id: "bullets", label: "Тезисно", instruction: "Сократи статью до 4-6 пунктов на русском языке, кратко и по делу, без вступлений. Каждый пункт — отдельная строка." },
  { id: "detailed", label: "Подробно", instruction: "Сделай подробный пересказ статьи на русском языке в 2-3 абзацах, сохрани ключевые детали и аргументы." },
  { id: "worth-reading", label: "Стоит ли читать?", instruction: "В 2-3 предложениях на русском языке объясни, о чём статья и стоит ли её читать полностью — и почему." },
];

function extractArticleText() {
  const candidates = document.querySelectorAll("article, main, [role='main']");
  let best = "";
  for (const el of candidates) {
    const text = el.innerText || "";
    if (text.length > best.length) best = text;
  }
  if (!best) best = document.body.innerText || "";
  return best.trim().slice(0, MAX_CHARS);
}

function cacheKey(styleId) {
  return `ais-cache:${location.href}:${styleId}`;
}

function buildButton() {
  const btn = document.createElement("button");
  btn.className = "ais-fab";
  btn.textContent = "TL;DR";
  btn.title = "Сократить эту статью";
  document.documentElement.appendChild(btn);
  return btn;
}

function buildModal() {
  const modal = document.createElement("div");
  modal.className = "ais-modal";
  modal.innerHTML = `
    <div class="ais-modal-card">
      <div class="ais-modal-header">
        <span>Краткое содержание</span>
        <button class="ais-modal-close">×</button>
      </div>
      <div class="ais-modal-body"></div>
    </div>
  `;
  modal.querySelector(".ais-modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  document.documentElement.appendChild(modal);
  return modal;
}

function renderStylePicker(modal) {
  const body = modal.querySelector(".ais-modal-body");
  body.innerHTML = `
    <p class="ais-picker-label">Выбери формат сводки:</p>
    <div class="ais-styles">
      ${STYLES.map((s) => `<button class="ais-style-btn" data-style="${s.id}">${s.label}</button>`).join("")}
    </div>
  `;
  body.querySelectorAll(".ais-style-btn").forEach((btn) => {
    btn.addEventListener("click", () => runSummary(modal, btn.dataset.style, false));
  });
}

function runSummary(modal, styleId, forceRefresh) {
  const style = STYLES.find((s) => s.id === styleId);
  if (!style) return;

  if (forceRefresh) {
    fetchSummary(modal, style);
    return;
  }

  const key = cacheKey(styleId);
  chrome.storage.local.get([key], (data) => {
    if (data[key]) {
      renderResult(modal, { summary: data[key].summary }, style, true);
    } else {
      fetchSummary(modal, style);
    }
  });
}

function fetchSummary(modal, style) {
  const body = modal.querySelector(".ais-modal-body");
  body.innerHTML = `<p class="ais-loading">Готовим сокращение…</p>`;
  const text = extractArticleText();
  chrome.runtime.sendMessage(
    { type: "SUMMARIZE", title: document.title, text, instruction: style.instruction },
    (result) => {
      if (result && result.summary) {
        chrome.storage.local.set({ [cacheKey(style.id)]: { summary: result.summary, ts: Date.now() } });
      }
      renderResult(modal, result || { error: "Нет ответа от расширения." }, style, false);
    }
  );
}

function renderResult(modal, result, style, fromCache) {
  const body = modal.querySelector(".ais-modal-body");

  if (result.error === "no-api-key") {
    body.innerHTML = `
      <p>Сначала добавь свой API-ключ Anthropic в настройках расширения.</p>
      <button class="ais-open-options">Открыть настройки</button>
    `;
    body.querySelector(".ais-open-options").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    });
    return;
  }
  if (result.error) {
    body.innerHTML = `
      <p class="ais-error">${result.error}</p>
      <div class="ais-actions"><button class="ais-back">← Назад</button></div>
    `;
    body.querySelector(".ais-back").addEventListener("click", () => renderStylePicker(modal));
    return;
  }

  const lines = result.summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const resultHtml =
    style.id === "bullets"
      ? `<ul>${lines.map((p) => `<li>${p.replace(/^[-•*]\s*/, "")}</li>`).join("")}</ul>`
      : lines.map((p) => `<p>${p}</p>`).join("");

  body.innerHTML = `
    ${fromCache ? `<div class="ais-cache-note">Из кеша этой страницы</div>` : ""}
    <div class="ais-result">${resultHtml}</div>
    <div class="ais-actions">
      <button class="ais-back">← Другой формат</button>
      <button class="ais-refresh">Обновить</button>
    </div>
  `;
  body.querySelector(".ais-back").addEventListener("click", () => renderStylePicker(modal));
  body.querySelector(".ais-refresh").addEventListener("click", () => runSummary(modal, style.id, true));
}

function init() {
  const btn = buildButton();
  btn.addEventListener("click", () => {
    const modal = buildModal();
    renderStylePicker(modal);
  });
}

init();
