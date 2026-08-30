const FB_REELS_SELECTORS = [
  "a[href^='/reel/']",
  "a[href*='facebook.com/reel/']",
  "svg[aria-label='Reels']",
  "svg[aria-label='Клипы']",
].join(", ");

let styleEl = null;
const counted = new WeakSet();

function hideMatches() {
  document.querySelectorAll(FB_REELS_SELECTORS).forEach((el) => {
    const link = el.closest("a") || el;
    const container = link.closest("div[role='article'], li, div") || link;
    if (!counted.has(container)) {
      counted.add(container);
      incrementBlockedCount("facebookReels");
    }
    container.style.setProperty("display", "none", "important");
  });
}

let observer = null;

function applyBlocking(enabled) {
  if (enabled && !observer) {
    styleEl = document.createElement("style");
    styleEl.id = "distraction-blocker-facebook";
    styleEl.textContent = `a[href^="/reel/"] { display: none !important; }`;
    (document.head || document.documentElement).appendChild(styleEl);

    hideMatches();
    observer = new MutationObserver(() => hideMatches());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } else if (!enabled && observer) {
    observer.disconnect();
    observer = null;
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
  }
}

getSettings((settings) => applyBlocking(settings.facebookReels));
onSettingsChanged((settings) => applyBlocking(settings.facebookReels));
