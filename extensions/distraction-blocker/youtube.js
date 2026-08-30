const YT_SHORTS_SELECTORS = [
  "ytd-reel-shelf-renderer",
  "ytd-rich-shelf-renderer[is-shorts]",
  "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
  "ytd-guide-entry-renderer:has(a[title='Shorts'])",
  "ytd-mini-guide-entry-renderer:has(a[href='/shorts'])",
  "a[href^='/shorts/']",
  "ytd-video-renderer:has(a[href^='/shorts/'])",
  "ytd-grid-video-renderer:has(a[href^='/shorts/'])",
].join(", ");

let styleEl = null;
let observer = null;
const counted = new WeakSet();

function countNewMatches() {
  document.querySelectorAll(YT_SHORTS_SELECTORS).forEach((el) => {
    if (counted.has(el)) return;
    counted.add(el);
    incrementBlockedCount("youtubeShorts");
  });
}

function applyStyle(enabled) {
  if (enabled && !styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "distraction-blocker-youtube";
    styleEl.textContent = `${YT_SHORTS_SELECTORS} { display: none !important; }`;
    (document.head || document.documentElement).appendChild(styleEl);

    countNewMatches();
    observer = new MutationObserver(() => countNewMatches());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } else if (!enabled && styleEl) {
    styleEl.remove();
    styleEl = null;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }
}

getSettings((settings) => applyStyle(settings.youtubeShorts));
onSettingsChanged((settings) => applyStyle(settings.youtubeShorts));
