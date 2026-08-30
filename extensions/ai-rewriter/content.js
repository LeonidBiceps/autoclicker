const TONES = [
  { id: "shorter", label: "Короче", instruction: "Сократи этот текст, сохрани смысл и тот же язык оригинала. Верни только переписанный текст, без пояснений и кавычек." },
  { id: "polite", label: "Вежливее", instruction: "Перепиши текст вежливее и мягче, сохрани смысл и язык оригинала. Верни только переписанный текст, без пояснений и кавычек." },
  { id: "confident", label: "Увереннее", instruction: "Перепиши текст увереннее и напористее, сохрани смысл и язык оригинала. Верни только переписанный текст, без пояснений и кавычек." },
  { id: "simple", label: "Проще", instruction: "Перепиши текст проще и понятнее, сохрани смысл и язык оригинала. Верни только переписанный текст, без пояснений и кавычек." },
];

let toolbar = null;
let pending = null; // { kind: 'input', el, start, end } | { kind: 'contenteditable', range }
let lastRect = null;

function isInputLike(el) {
  return el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && ["text", "search", "email", "url"].includes((el.getAttribute("type") || "text").toLowerCase())));
}

function getEditableAncestor(node) {
  let el = node && node.nodeType === 3 ? node.parentElement : node;
  while (el) {
    if (el.isContentEditable) return el;
    el = el.parentElement;
  }
  return null;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function ensureToolbar() {
  if (toolbar) return toolbar;
  toolbar = document.createElement("div");
  toolbar.className = "air-toolbar";
  toolbar.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "INPUT") return;
    e.preventDefault();
  });
  document.documentElement.appendChild(toolbar);
  return toolbar;
}

function renderTonesUI() {
  const bar = ensureToolbar();
  bar.innerHTML = `
    <div class="air-tones">${TONES.map((t) => `<button data-tone="${t.id}">${t.label}</button>`).join("")}</div>
    <div class="air-custom-row">
      <input type="text" class="air-custom-input" placeholder="свой тон..." />
      <button class="air-custom-apply" title="Переписать в своём тоне">→</button>
    </div>
  `;

  bar.querySelectorAll(".air-tones button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tone = TONES.find((t) => t.id === btn.dataset.tone);
      if (tone) runRewrite(tone.instruction);
    });
  });

  const customInput = bar.querySelector(".air-custom-input");
  const applyCustom = () => {
    const value = customInput.value.trim();
    if (!value) return;
    runRewrite(`Перепиши текст в следующем тоне: "${value}". Сохрани смысл и язык оригинала. Верни только переписанный текст, без пояснений и кавычек.`);
  };
  bar.querySelector(".air-custom-apply").addEventListener("click", applyCustom);
  customInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyCustom();
    }
  });
}

function positionToolbar(rect) {
  const bar = ensureToolbar();
  lastRect = rect;
  const top = window.scrollY + rect.top - bar.offsetHeight - 6;
  const left = window.scrollX + rect.left;
  bar.style.top = `${Math.max(4, top)}px`;
  bar.style.left = `${left}px`;
  bar.style.display = "flex";
}

function showToolbarForSelection(rect) {
  renderTonesUI();
  positionToolbar(rect);
}

function hideToolbar() {
  if (toolbar) toolbar.style.display = "none";
  pending = null;
}

function checkSelection() {
  const active = document.activeElement;

  if (toolbar && toolbar.contains(active)) return;

  if (isInputLike(active) && active.selectionStart !== active.selectionEnd) {
    pending = { kind: "input", el: active, start: active.selectionStart, end: active.selectionEnd };
    showToolbarForSelection(active.getBoundingClientRect());
    return;
  }

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim()) {
    const range = sel.getRangeAt(0);
    const editable = getEditableAncestor(range.commonAncestorContainer);
    if (editable) {
      pending = { kind: "contenteditable", range: range.cloneRange() };
      showToolbarForSelection(range.getBoundingClientRect());
      return;
    }
  }

  hideToolbar();
}

function getSelectedText(job) {
  if (job.kind === "input") return job.el.value.slice(job.start, job.end);
  return job.range.toString();
}

function applyReplacement(job, newText) {
  if (job.kind === "input") {
    const el = job.el;
    const original = el.value;
    el.value = original.slice(0, job.start) + newText + original.slice(job.end);
    el.selectionStart = job.start;
    el.selectionEnd = job.start + newText.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    job.range.deleteContents();
    job.range.insertNode(document.createTextNode(newText));
  }
}

function showLoading() {
  const bar = ensureToolbar();
  bar.innerHTML = `<div class="air-loading">Переписываем…</div>`;
  if (lastRect) positionToolbar(lastRect);
}

function showPreview(job, original, rewritten) {
  const bar = ensureToolbar();
  bar.innerHTML = `
    <div class="air-preview">
      <div class="air-preview-block">
        <span class="air-preview-label">Было</span>
        <div class="air-preview-text air-old">${escapeHtml(original)}</div>
      </div>
      <div class="air-preview-block">
        <span class="air-preview-label">Станет</span>
        <div class="air-preview-text air-new">${escapeHtml(rewritten)}</div>
      </div>
      <div class="air-preview-actions">
        <button class="air-cancel">Отмена</button>
        <button class="air-apply">Применить</button>
      </div>
    </div>
  `;
  bar.querySelector(".air-cancel").addEventListener("click", () => hideToolbar());
  bar.querySelector(".air-apply").addEventListener("click", () => {
    applyReplacement(job, rewritten);
    hideToolbar();
  });
  if (lastRect) positionToolbar(lastRect);
}

function runRewrite(instruction) {
  if (!pending) return;
  const job = pending;
  const text = getSelectedText(job);
  if (!text.trim()) return;

  showLoading();
  chrome.runtime.sendMessage({ type: "REWRITE", text, instruction }, (result) => {
    if (!result || result.error === "no-api-key") {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      hideToolbar();
      return;
    }
    if (result.error) {
      alert(`Не получилось переписать: ${result.error}`);
      hideToolbar();
      return;
    }
    showPreview(job, text, result.rewritten);
  });
}

document.addEventListener("selectionchange", checkSelection);
document.addEventListener("scroll", () => pending && hideToolbar(), true);
