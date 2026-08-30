const WORDS_PER_MINUTE = 200;
const MIN_CHARS_TO_SHOW = 1;

const PROFILE_LIMITS = {
  general: null,
  title: 60,
  meta: 155,
  tweet: 280,
  instagram: 2200,
};

let badge = null;
let activeField = null;
let enabled = true;
let profile = "general";
let keyword = "";

function isTextField(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return ["text", "search", "email", "url"].includes(type);
  }
  return false;
}

function getText(el) {
  if (el.isContentEditable) return el.innerText || "";
  return el.value || "";
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  const haystack = text.toLowerCase();
  const term = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(term, idx)) !== -1) {
    count++;
    idx += term.length;
  }
  return count;
}

function ensureBadge() {
  if (badge) return badge;
  badge = document.createElement("div");
  badge.className = "tc-badge";
  document.documentElement.appendChild(badge);
  return badge;
}

function positionBadge(el) {
  const rect = el.getBoundingClientRect();
  const b = ensureBadge();
  const top = window.scrollY + rect.bottom + 4;
  const left = window.scrollX + rect.left;
  b.style.top = `${top}px`;
  b.style.left = `${left}px`;
}

function updateBadge(el) {
  const text = getText(el);
  const chars = text.length;
  if (chars < MIN_CHARS_TO_SHOW) {
    hideBadge();
    return;
  }

  const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
  const minutes = words / WORDS_PER_MINUTE;
  const readTime = minutes < 1 ? `${Math.max(1, Math.round(minutes * 60))} сек` : `${minutes.toFixed(1)} мин`;

  let line = `${chars} симв. · ${words} слов · ~${readTime} чтения`;

  const limit = PROFILE_LIMITS[profile];
  const b = ensureBadge();
  b.classList.remove("tc-long", "tc-warn", "tc-over");

  if (limit) {
    line += ` · ${chars}/${limit}`;
    if (chars > limit) {
      b.classList.add("tc-over");
    } else if (chars >= limit * 0.9) {
      b.classList.add("tc-warn");
    }
  } else {
    b.classList.toggle("tc-long", chars > 2000);
  }

  if (keyword.trim()) {
    const occurrences = countOccurrences(text, keyword.trim());
    const density = words > 0 ? ((occurrences / words) * 100).toFixed(1) : "0.0";
    line += ` · «${keyword.trim()}»: ${occurrences}× (${density}%)`;
  }

  b.textContent = line;
  positionBadge(el);
  b.style.display = "block";
}

function hideBadge() {
  if (badge) badge.style.display = "none";
}

function onFocusIn(event) {
  if (!enabled) return;
  const el = event.target;
  if (!isTextField(el)) return;
  activeField = el;
  updateBadge(el);
}

function onFocusOut(event) {
  if (event.target === activeField) {
    activeField = null;
    hideBadge();
  }
}

function onInput(event) {
  if (activeField && event.target === activeField) {
    updateBadge(activeField);
  }
}

function onScrollOrResize() {
  if (activeField) positionBadge(activeField);
}

document.addEventListener("focusin", onFocusIn, true);
document.addEventListener("focusout", onFocusOut, true);
document.addEventListener("input", onInput, true);
window.addEventListener("scroll", onScrollOrResize, true);
window.addEventListener("resize", onScrollOrResize);

const DEFAULT_SETTINGS = { enabled: true, profile: "general", keyword: "" };

chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  enabled = settings.enabled;
  profile = settings.profile;
  keyword = settings.keyword;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if ("enabled" in changes) enabled = changes.enabled.newValue;
  if ("profile" in changes) profile = changes.profile.newValue;
  if ("keyword" in changes) keyword = changes.keyword.newValue;
  if (!enabled) hideBadge();
  else if (activeField) updateBadge(activeField);
});
