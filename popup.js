/** After resume: if a download fails without a new request, we automatically retry (window, ms). */
const RESUME_FAIL_WATCH_MS = 25000;
const FALLBACK_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='%23D1D5DB'/><path d='M22 16h14l10 10v22a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z' fill='%239CA3AF'/><path d='M36 16v10h10' fill='none' stroke='%23E5E7EB' stroke-width='3'/></svg>";

const SVG_ERROR_ICON = `<svg class="download-item__error-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;

const SVG_PENDING_ICON = `<svg class="download-item__pending-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;

const SVG_DOTS_VERTICAL = `<svg class="download-item__menu-btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;

const SVG_PAUSE = `<svg class="download-item__pause-btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

const SVG_RESUME = `<svg class="download-item__pause-btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;

function i18nMessage(key, substitutions) {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n?.getMessage) {
      const m =
        substitutions === undefined
          ? chrome.i18n.getMessage(key)
          : chrome.i18n.getMessage(key, substitutions);
      if (m) return m;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function getFeedbackConfigUrl(fieldName) {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.getManifest) return "";
    const cfg = chrome.runtime.getManifest()?.feedback_config || {};
    const rawUrl = typeof cfg[fieldName] === "string" ? cfg[fieldName].trim() : "";
    if (!rawUrl) return "";
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function openExternalUrl(url) {
  if (!url) return Promise.resolve(false);
  try {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      return new Promise((resolve) => {
        chrome.tabs.create({ url }, () => {
          resolve(!chrome.runtime?.lastError);
        });
      });
    }
  } catch {
    /* Fall through to window.open for non-extension previews. */
  }
  try {
    return Promise.resolve(Boolean(window.open(url, "_blank", "noopener")));
  } catch {
    return Promise.resolve(false);
  }
}

function openFeedbackConfigUrl(fieldName) {
  return openExternalUrl(getFeedbackConfigUrl(fieldName));
}

async function activatePinnedRatingStar(starEl) {
  const rating = Number(starEl?.dataset?.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
  starEl.blur?.();
  permanentlyHidePinnedTile();
  await openFeedbackConfigUrl(rating <= 3 ? "form" : "review");
}

function getUiLocale() {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
      const locale = chrome.i18n.getUILanguage();
      if (locale) return locale;
    }
  } catch {
    /* ignore */
  }
  return navigator.language || "en";
}

const UI_LOCALE = getUiLocale();
const CALENDAR_MONTH_FORMATTER = new Intl.DateTimeFormat(UI_LOCALE, {
  month: "long",
  year: "numeric"
});
const CALENDAR_RANGE_FORMATTER = new Intl.DateTimeFormat(UI_LOCALE, {
  day: "numeric",
  month: "short"
});
const ABSOLUTE_DATE_FORMATTER = new Intl.DateTimeFormat(UI_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric"
});
const EXACT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(UI_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(UI_LOCALE, { numeric: "auto" });

function getCalendarWeekdayLabels() {
  const formatter = new Intl.DateTimeFormat(UI_LOCALE, { weekday: "short" });
  const mondayUtc = Date.UTC(2024, 0, 1);
  const labels = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(mondayUtc + i * 86400000);
    labels.push(formatter.format(day));
  }
  return labels;
}

/** Tooltip text for the error icon — language matches the Chrome UI (chrome.i18n). */
function getLocalizedDownloadErrorTooltip(item) {
  const code = item?.error;
  if (code) {
    const localized = i18nMessage(`dlerr_${code}`);
    if (localized) return localized;
    return String(code);
  }
  if (item?.state === "interrupted") {
    return i18nMessage("downloadStatusInterrupted") || "Download interrupted";
  }
  if (item?.state === "in_progress") {
    return i18nMessage("downloadStatusInProgress") || "Downloading…";
  }
  return i18nMessage("downloadStatusIncomplete") || "Download not completed";
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let openDownloadMenuCtx = null;
let openFiltersMenuCtx = null;

function hideErrorFloatTip() {
  const tip = document.getElementById("error-float-tip");
  if (!tip) return;
  tip.hidden = true;
  tip.textContent = "";
}

function positionErrorFloatTip(anchorEl, tipEl) {
  const r = anchorEl.getBoundingClientRect();
  const pad = 6;
  const gap = 6;
  const tw = tipEl.offsetWidth;
  const th = tipEl.offsetHeight;
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
  let top = r.top - th - gap;
  if (top < pad) top = r.bottom + gap;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}

function showErrorFloatTip(anchorEl, text) {
  const tip = document.getElementById("error-float-tip");
  if (!tip || !text) return;
  tip.textContent = text;
  tip.hidden = false;
  positionErrorFloatTip(anchorEl, tip);
  requestAnimationFrame(() => positionErrorFloatTip(anchorEl, tip));
}

function closeDownloadMenu() {
  if (!openDownloadMenuCtx) return;
  const { menu, btn, onDocClick, onDocKey, row } = openDownloadMenuCtx;
  menu.hidden = true;
  menu.style.visibility = "";
  menu.style.left = "";
  menu.style.top = "";
  btn.setAttribute("aria-expanded", "false");
  row?.classList.remove("download-item--menu-open");
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKey, true);
  openDownloadMenuCtx = null;
}

function openDownloadMenu(menu, btn) {
  hideErrorFloatTip();
  closeFiltersMenu();
  closeDateFilterPopover();
  closeTypeFilterPopover();
  closeClearAllPopover();
  if (openDownloadMenuCtx?.btn === btn) {
    closeDownloadMenu();
    return;
  }
  closeDownloadMenu();

  const onDocClick = (e) => {
    if (!openDownloadMenuCtx) return;
    const ctx = openDownloadMenuCtx;
    if (ctx.row?.contains(e.target)) return;
    closeDownloadMenu();
  };

  const onDocKey = (e) => {
    if (e.key === "Escape") closeDownloadMenu();
  };

  const row = btn.closest("li.download-item");
  row?.classList.add("download-item--menu-open");
  openDownloadMenuCtx = { menu, btn, onDocClick, onDocKey, row };
  btn.setAttribute("aria-expanded", "true");
  menu.hidden = false;
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKey, true);
}

const THEME_STORAGE_KEY = "themePreference";
const FILTERS_STORAGE_KEY = "filtersState";
const NOTIFICATIONS_ENABLED_STORAGE_KEY = "notificationsEnabled";
const PINNED_TILE_DISMISSED_STORAGE_KEY = "pinnedTileDismissed";
const PINNED_TILE_DISMISSED_AT_STORAGE_KEY = "pinnedTileDismissedAt";
const PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY = "pinnedTilePermanentlyHidden";
const PINNED_TILE_INSTALLED_AT_STORAGE_KEY = "pinnedTileInstalledAt";
const PINNED_TILE_FIRST_SHOW_DELAY_MS = 2 * 24 * 60 * 60 * 1000;
const THEME_ORDER = ["system", "light", "dark"];
const NAME_SORT_MODES = ["none", "name-asc", "name-desc"];
const SIZE_SORT_MODES = ["none", "size-asc", "size-desc"];

function getExtensionStorageLocal() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      return chrome.storage.local;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function storageGetTheme(defaultTheme, callback) {
  const defaults = { [THEME_STORAGE_KEY]: defaultTheme };
  const local = getExtensionStorageLocal();
  if (local) {
    local.get(defaults, (r) => {
      if (chrome.runtime?.lastError) {
        callback(defaults);
        return;
      }
      callback(r);
    });
    return;
  }
  let value = defaultTheme;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && THEME_ORDER.includes(raw)) value = raw;
  } catch {
    /* ignore */
  }
  callback({ [THEME_STORAGE_KEY]: value });
}

function storageSetTheme(theme) {
  const local = getExtensionStorageLocal();
  if (local) {
    local.set({ [THEME_STORAGE_KEY]: theme });
    return;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function storageGetFilters(callback) {
  const defaults = {
    [FILTERS_STORAGE_KEY]: {
      nameSortMode: "none",
      sizeSortMode: "none",
      dateRange: { start: null, end: null },
      typeFilters: [...TYPE_FILTER_KEYS]
    }
  };
  const local = getExtensionStorageLocal();
  if (local) {
    local.get(defaults, (r) => {
      if (chrome.runtime?.lastError) {
        callback(defaults[FILTERS_STORAGE_KEY]);
        return;
      }
      callback(r[FILTERS_STORAGE_KEY] || defaults[FILTERS_STORAGE_KEY]);
    });
    return;
  }
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) {
      callback(defaults[FILTERS_STORAGE_KEY]);
      return;
    }
    const parsed = JSON.parse(raw);
    callback(parsed || defaults[FILTERS_STORAGE_KEY]);
  } catch {
    callback(defaults[FILTERS_STORAGE_KEY]);
  }
}

function storageSetFilters(filtersState) {
  const payload = { [FILTERS_STORAGE_KEY]: filtersState };
  const local = getExtensionStorageLocal();
  if (local) {
    local.set(payload);
    return;
  }
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filtersState));
  } catch {
    /* ignore */
  }
}

function storageGetNotificationsEnabled(callback) {
  const defaults = { [NOTIFICATIONS_ENABLED_STORAGE_KEY]: true };
  const local = getExtensionStorageLocal();
  if (local) {
    local.get(defaults, (r) => {
      if (chrome.runtime?.lastError) {
        callback(true);
        return;
      }
      callback(r[NOTIFICATIONS_ENABLED_STORAGE_KEY] !== false);
    });
    return;
  }
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_ENABLED_STORAGE_KEY);
    if (raw === null) {
      callback(true);
      return;
    }
    callback(raw === "true");
  } catch {
    callback(true);
  }
}

function storageSetNotificationsEnabled(enabled) {
  const normalized = enabled !== false;
  const payload = { [NOTIFICATIONS_ENABLED_STORAGE_KEY]: normalized };
  const local = getExtensionStorageLocal();
  if (local) {
    local.set(payload);
    return;
  }
  try {
    localStorage.setItem(NOTIFICATIONS_ENABLED_STORAGE_KEY, String(normalized));
  } catch {
    /* ignore */
  }
}

function storageGetPinnedTileDismissed(callback) {
  const defaults = { [PINNED_TILE_DISMISSED_STORAGE_KEY]: false };
  const local = getExtensionStorageLocal();
  if (local) {
    local.get(defaults, (r) => {
      if (chrome.runtime?.lastError) {
        callback(false);
        return;
      }
      callback(r[PINNED_TILE_DISMISSED_STORAGE_KEY] === true);
    });
    return;
  }
  try {
    callback(localStorage.getItem(PINNED_TILE_DISMISSED_STORAGE_KEY) === "true");
  } catch {
    callback(false);
  }
}

function storageSetPinnedTileDismissed(dismissed) {
  const normalized = dismissed === true;
  const payload = {
    [PINNED_TILE_DISMISSED_STORAGE_KEY]: normalized,
    [PINNED_TILE_DISMISSED_AT_STORAGE_KEY]: normalized ? Date.now() : 0
  };
  const local = getExtensionStorageLocal();
  if (local) {
    local.set(payload);
    return;
  }
  try {
    localStorage.setItem(PINNED_TILE_DISMISSED_STORAGE_KEY, String(normalized));
    localStorage.setItem(PINNED_TILE_DISMISSED_AT_STORAGE_KEY, String(payload[PINNED_TILE_DISMISSED_AT_STORAGE_KEY]));
  } catch {
    /* ignore */
  }
}

function storageGetPinnedTilePermanentlyHidden(callback) {
  const defaults = { [PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY]: false };
  const local = getExtensionStorageLocal();
  if (local) {
    local.get(defaults, (r) => {
      if (chrome.runtime?.lastError) {
        callback(false);
        return;
      }
      callback(r[PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY] === true);
    });
    return;
  }
  try {
    callback(localStorage.getItem(PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY) === "true");
  } catch {
    callback(false);
  }
}

function storageSetPinnedTilePermanentlyHidden(hidden) {
  const normalized = hidden === true;
  const payload = { [PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY]: normalized };
  const local = getExtensionStorageLocal();
  if (local) {
    local.set(payload);
    return;
  }
  try {
    localStorage.setItem(PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY, String(normalized));
  } catch {
    /* ignore */
  }
}

function storageGetPinnedTileEligibleForDisplay(callback) {
  const defaults = { [PINNED_TILE_INSTALLED_AT_STORAGE_KEY]: 0 };
  const local = getExtensionStorageLocal();
  const resolveEligibility = (rawValue, persistMissingValue) => {
    const installedAt = Number(rawValue);
    if (!Number.isFinite(installedAt) || installedAt <= 0) {
      const now = Date.now();
      persistMissingValue(now);
      callback(false);
      return;
    }
    callback(Date.now() - installedAt >= PINNED_TILE_FIRST_SHOW_DELAY_MS);
  };

  if (local) {
    local.get(defaults, (r) => {
      if (chrome.runtime?.lastError) {
        callback(false);
        return;
      }
      resolveEligibility(r?.[PINNED_TILE_INSTALLED_AT_STORAGE_KEY], (now) => {
        local.set({ [PINNED_TILE_INSTALLED_AT_STORAGE_KEY]: now });
      });
    });
    return;
  }

  try {
    resolveEligibility(localStorage.getItem(PINNED_TILE_INSTALLED_AT_STORAGE_KEY), (now) => {
      localStorage.setItem(PINNED_TILE_INSTALLED_AT_STORAGE_KEY, String(now));
    });
  } catch {
    callback(false);
  }
}

const stateMessageEl = document.getElementById("state-message");
const downloadsListEl = document.getElementById("downloads-list");
const emptyStateEl = document.getElementById("empty-state");
const emptyStateTitleEl = document.getElementById("empty-state-title");
const pinnedStaticItemEl = document.getElementById("pinned-static-item");
const pinnedItemDismissBtnEl = document.getElementById("pinned-static-item-dismiss");
const pinnedRatingEl = document.querySelector(".pinned-rating");
const searchInputEl = document.getElementById("search-input");
const searchLabelEl = document.querySelector(".search-field .visually-hidden");
const notificationsToggleEl = document.getElementById("notifications-toggle");
const clearAllPopoverEl = document.getElementById("clear-all-popover");
const clearAllConfirmEl = document.getElementById("clear-all-confirm");
const themeToggleEl = document.getElementById("theme-toggle");
const filtersToggleEl = document.getElementById("filters-toggle");
const filtersMenuEl = document.getElementById("filters-menu");
const nameSortToggleEl = document.getElementById("name-sort-toggle");
const sizeSortToggleEl = document.getElementById("size-sort-toggle");
const dateFilterToggleEl = document.getElementById("date-filter-toggle");
const dateFilterPopoverEl = document.getElementById("date-filter-popover");
const activeFiltersBarEl = document.getElementById("active-filters-bar");
const datePresetTodayEl = document.getElementById("date-preset-today");
const datePresetWeekEl = document.getElementById("date-preset-week");
const datePresetMonthEl = document.getElementById("date-preset-month");
const dateCalendarPrevEl = document.getElementById("date-calendar-prev");
const dateCalendarNextEl = document.getElementById("date-calendar-next");
const dateCalendarMonthLabelEl = document.getElementById("date-calendar-month-label");
const dateCalendarGridEl = document.getElementById("date-calendar-grid");
const dateFilterCancelEl = document.getElementById("date-filter-cancel");
const dateFilterApplyEl = document.getElementById("date-filter-apply");
const typeFilterToggleEl = document.getElementById("type-filter-toggle");
const typeFilterPopoverEl = document.getElementById("type-filter-popover");
const typeFilterTitleEl = document.getElementById("type-filter-title");
const typeFilterAllEl = document.getElementById("type-filter-all");
const typeFilterImagesEl = document.getElementById("type-filter-images");
const typeFilterVideoEl = document.getElementById("type-filter-video");
const typeFilterArchivesEl = document.getElementById("type-filter-archives");
const typeFilterProgramsEl = document.getElementById("type-filter-programs");
const typeFilterDocumentsEl = document.getElementById("type-filter-documents");
const typeFilterCloseEl = document.getElementById("type-filter-close");
const typeFilterAllLabelEl = document.getElementById("type-filter-all-label");
const typeFilterImagesLabelEl = document.getElementById("type-filter-images-label");
const typeFilterVideoLabelEl = document.getElementById("type-filter-video-label");
const typeFilterArchivesLabelEl = document.getElementById("type-filter-archives-label");
const typeFilterProgramsLabelEl = document.getElementById("type-filter-programs-label");
const typeFilterDocumentsLabelEl = document.getElementById("type-filter-documents-label");

const THEME_UI = {
  system: {
    titleKey: "theme_toggle_title_system",
    titleFallback: "Theme: system",
    ariaKey: "theme_toggle_aria_system",
    ariaFallback: "Switch theme. Current: system"
  },
  light: {
    titleKey: "theme_toggle_title_light",
    titleFallback: "Theme: light",
    ariaKey: "theme_toggle_aria_light",
    ariaFallback: "Switch theme. Current: light"
  },
  dark: {
    titleKey: "theme_toggle_title_dark",
    titleFallback: "Theme: dark",
    ariaKey: "theme_toggle_aria_dark",
    ariaFallback: "Switch theme. Current: dark"
  }
};

function getThemeUi(theme) {
  const ui = THEME_UI[theme] || THEME_UI.system;
  return {
    title: i18nMessage(ui.titleKey) || ui.titleFallback,
    aria: i18nMessage(ui.ariaKey) || ui.ariaFallback
  };
}

function applyTheme(theme) {
  const t = THEME_ORDER.includes(theme) ? theme : "system";
  document.documentElement.dataset.theme = t;
  if (!themeToggleEl) return;
  themeToggleEl.classList.remove("theme-toggle--system", "theme-toggle--light", "theme-toggle--dark");
  themeToggleEl.classList.add(`theme-toggle--${t}`);
  const ui = getThemeUi(t);
  themeToggleEl.setAttribute("title", ui.title);
  themeToggleEl.setAttribute("aria-label", ui.aria);
}

function cycleTheme(current) {
  const i = THEME_ORDER.indexOf(current);
  const idx = i === -1 ? 0 : i;
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
}

let allDownloads = [];
let downloads = [];
let scrollRaf = null;
let nameSortMode = "none";
let sizeSortMode = "none";
let openDateFilterCtx = null;
let openTypeFilterCtx = null;
let openClearAllCtx = null;
let activeDateRange = { start: null, end: null };
let draftDateRange = { start: null, end: null };
let dateSelectionAnchor = null;
let dateCalendarViewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const LIST_LAYOUT_ANIMATION_MS = 300;
const LIST_LAYOUT_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const LOCAL_LIST_REBUILD_SUPPRESSION_MS = 900;
/**
 * true — the list has already been rendered at least once during the popup's
 * lifetime; used to avoid playing the per-row cascading appearance animation
 * on the very first render (which visually "jerks" the UI when the popup
 * opens), and instead show a single smooth fade/slide for the whole list.
 */
let hasRenderedOnce = false;
let pinnedTileDismissed = false;
let pinnedTilePermanentlyHidden = false;
let pinnedTileEligibleForDisplay = false;
const TYPE_FILTER_KEYS = ["images", "video", "archives", "programs", "documents"];
let activeTypeFilters = new Set(TYPE_FILTER_KEYS);
const fileNameSorter = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const DATE_GROUPS = [
  { key: "today", i18nKey: "group_today", fallbackLabel: "Today" },
  { key: "yesterday", i18nKey: "group_yesterday", fallbackLabel: "Yesterday" },
  { key: "weekAgo", i18nKey: "group_earlier_this_week", fallbackLabel: "Earlier this week" },
  { key: "older", i18nKey: "group_older", fallbackLabel: "Earlier" }
];
const dateGroupOpenState = new Map();
const FILE_TYPE_EXTENSIONS = {
  images: new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "webp",
    "svg",
    "ico",
    "tif",
    "tiff",
    "heic",
    "heif",
    "avif",
    "raw",
    "cr2",
    "nef",
    "dng",
    "psd"
  ]),
  video: new Set([
    "mp4",
    "mkv",
    "avi",
    "mov",
    "wmv",
    "flv",
    "webm",
    "m4v",
    "3gp",
    "mpg",
    "mpeg",
    "ts",
    "m2ts",
    "vob",
    "ogv"
  ]),
  archives: new Set([
    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
    "tgz",
    "bz2",
    "xz",
    "lz",
    "lzma",
    "cab",
    "iso",
    "z",
    "arj"
  ]),
  programs: new Set([
    "exe",
    "msi",
    "msix",
    "msixbundle",
    "appx",
    "appxbundle",
    "bat",
    "cmd",
    "com",
    "scr",
    "ps1",
    "jar",
    "apk",
    "deb",
    "rpm"
  ]),
  documents: new Set([
    "pdf",
    "doc",
    "docx",
    "docm",
    "dot",
    "dotx",
    "odt",
    "rtf",
    "txt",
    "csv",
    "xls",
    "xlsx",
    "xlsm",
    "ods",
    "ppt",
    "pptx",
    "pps",
    "ppsx",
    "odp",
    "epub",
    "md",
    "log"
  ])
};

function hideMessage() {
  if (stateMessageEl) {
    stateMessageEl.classList.add("hidden");
    stateMessageEl.hidden = true;
  }
}

function showEmptyState() {
  if (downloadsListEl) {
    downloadsListEl.classList.add("hidden");
  }
  if (emptyStateEl) {
    emptyStateEl.classList.remove("hidden");
    emptyStateEl.hidden = false;
  }
}

function hideEmptyState() {
  if (downloadsListEl) {
    downloadsListEl.classList.remove("hidden");
  }
  if (emptyStateEl) {
    emptyStateEl.classList.add("hidden");
    emptyStateEl.hidden = true;
  }
}

function getClearAllToggleEl() {
  return document.getElementById("clear-all-toggle");
}

function getClearAllLabelText() {
  return i18nMessage("clear_all") || "Clear all";
}

function createClearAllToggleButton() {
  const btn = document.createElement("button");
  const label = getClearAllLabelText();
  btn.type = "button";
  btn.className = "clear-all-toggle";
  btn.id = "clear-all-toggle";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("title", label);
  btn.innerHTML = `
    <svg class="clear-all-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.4 5.4c0-.77.63-1.4 1.4-1.4h12.4c.77 0 1.4.63 1.4 1.4v1.05c0 .37-.15.73-.41.99l-4.94 4.94a1.4 1.4 0 0 0-.41.99v3.55c0 .5-.27.96-.71 1.21l-2.38 1.36c-.93.53-2.09-.14-2.09-1.21v-4.91c0-.37-.15-.73-.41-.99L3.81 7.44a1.4 1.4 0 0 1-.41-.99V5.4z"
        fill="currentColor"
        opacity="0.62"
      />
      <path
        d="M5 4h12c.55 0 1 .45 1 1v1H4V5c0-.55.45-1 1-1z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="m15 15 4 4m0-4-4 4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
      />
    </svg>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openClearAllPopover();
  });
  return btn;
}

function localizeStaticText() {
  if (searchInputEl) {
    searchInputEl.setAttribute(
      "placeholder",
      i18nMessage("search_placeholder") || "Search by file name..."
    );
  }
  if (searchLabelEl) {
    searchLabelEl.textContent = i18nMessage("search_label") || "Search by file name";
  }
  if (filtersToggleEl) {
    const filtersText = i18nMessage("filters_toggle") || "Filters";
    filtersToggleEl.setAttribute("title", filtersText);
    filtersToggleEl.setAttribute("aria-label", filtersText);
  }
  if (downloadsListEl) {
    downloadsListEl.setAttribute("aria-label", i18nMessage("downloads_list_aria") || "Downloads list");
  }
  if (notificationsToggleEl) {
    const notificationsText =
      i18nMessage("notifications_enabled") || "Notifications are enabled";
    notificationsToggleEl.setAttribute("title", notificationsText);
    notificationsToggleEl.setAttribute("aria-label", notificationsText);
  }
  const clearAllToggleEl = getClearAllToggleEl();
  if (clearAllToggleEl) {
    const clearAllText = getClearAllLabelText();
    clearAllToggleEl.setAttribute("title", clearAllText);
    clearAllToggleEl.setAttribute("aria-label", clearAllText);
  }
  if (clearAllPopoverEl) {
    clearAllPopoverEl.setAttribute("aria-label", i18nMessage("clear_all_confirm") || "Confirm");
  }
  if (clearAllConfirmEl) {
    clearAllConfirmEl.textContent = i18nMessage("clear_all_confirm") || "Confirm";
  }
  if (themeToggleEl) {
    applyTheme(document.documentElement.dataset.theme || "system");
  }
  if (emptyStateTitleEl) {
    emptyStateTitleEl.textContent = i18nMessage("empty_state_no_files") || "There are no files right now";
  }
  const pinnedTitleEl = document.getElementById("pinned-static-item-title");
  const pinnedTitleText = i18nMessage("pinned_tile_title") || "Your value is important!";
  if (pinnedTitleEl) {
    pinnedTitleEl.textContent = pinnedTitleText;
    pinnedTitleEl.setAttribute("title", pinnedTitleText);
  }
  if (pinnedStaticItemEl) {
    pinnedStaticItemEl.setAttribute("aria-label", pinnedTitleText);
  }
  if (pinnedItemDismissBtnEl) {
    const closeText = i18nMessage("type_filter_close") || "Close";
    pinnedItemDismissBtnEl.setAttribute("aria-label", closeText);
    pinnedItemDismissBtnEl.setAttribute("title", closeText);
  }
  if (dateFilterPopoverEl) {
    dateFilterPopoverEl.setAttribute(
      "aria-label",
      i18nMessage("date_filter_dialog_aria") || "Date filter"
    );
  }
  if (datePresetTodayEl) {
    datePresetTodayEl.textContent = i18nMessage("date_filter_preset_today") || "Today";
  }
  if (datePresetWeekEl) {
    datePresetWeekEl.textContent = i18nMessage("date_filter_preset_week") || "Week";
  }
  if (datePresetMonthEl) {
    datePresetMonthEl.textContent = i18nMessage("date_filter_preset_month") || "Month";
  }
  if (dateCalendarPrevEl) {
    dateCalendarPrevEl.setAttribute(
      "aria-label",
      i18nMessage("date_filter_prev_month") || "Previous month"
    );
  }
  if (dateCalendarNextEl) {
    dateCalendarNextEl.setAttribute(
      "aria-label",
      i18nMessage("date_filter_next_month") || "Next month"
    );
  }
  if (dateFilterCancelEl) {
    dateFilterCancelEl.textContent = i18nMessage("date_filter_reset") || "Reset";
  }
  if (dateFilterApplyEl) {
    dateFilterApplyEl.textContent = i18nMessage("date_filter_apply") || "OK";
  }
  const weekdayLabels = getCalendarWeekdayLabels();
  const weekdayEls = dateFilterPopoverEl?.querySelectorAll(".date-filter-popover__weekdays span");
  if (weekdayEls && weekdayEls.length === 7) {
    weekdayEls.forEach((el, idx) => {
      el.textContent = weekdayLabels[idx] || "";
    });
  }
  if (typeFilterPopoverEl) {
    typeFilterPopoverEl.setAttribute("aria-label", i18nMessage("type_filter_dialog_aria") || "Type filter");
  }
  if (typeFilterTitleEl) {
    typeFilterTitleEl.textContent = i18nMessage("type_filter_label") || "Type";
  }
  if (typeFilterAllLabelEl) {
    typeFilterAllLabelEl.textContent = i18nMessage("type_filter_select_all") || "Select all";
  }
  if (typeFilterImagesLabelEl) {
    typeFilterImagesLabelEl.textContent = i18nMessage("type_filter_images") || "Images";
  }
  if (typeFilterVideoLabelEl) {
    typeFilterVideoLabelEl.textContent = i18nMessage("type_filter_video") || "Video";
  }
  if (typeFilterArchivesLabelEl) {
    typeFilterArchivesLabelEl.textContent =
      i18nMessage("type_filter_archives") || "Archives (ZIP, RAR, 7z)";
  }
  if (typeFilterProgramsLabelEl) {
    typeFilterProgramsLabelEl.textContent =
      i18nMessage("type_filter_programs") || "Programs (EXE, MSI)";
  }
  if (typeFilterDocumentsLabelEl) {
    typeFilterDocumentsLabelEl.textContent = i18nMessage("type_filter_documents") || "Documents";
  }
  if (typeFilterCloseEl) {
    const closeText = i18nMessage("type_filter_close") || "Close";
    typeFilterCloseEl.setAttribute("aria-label", closeText);
    typeFilterCloseEl.setAttribute("title", closeText);
  }
}

function applyNotificationsToggleState(enabled, animateSlash = false) {
  if (!notificationsToggleEl) return;
  const isEnabled = enabled !== false;
  notificationsToggleEl.classList.remove("notifications-toggle--slash-animating");
  if (isEnabled) {
    notificationsToggleEl.classList.remove("notifications-toggle--slashed");
  } else {
    notificationsToggleEl.classList.add("notifications-toggle--slashed");
    if (animateSlash) {
      void notificationsToggleEl.offsetWidth;
      notificationsToggleEl.classList.add("notifications-toggle--slash-animating");
    }
  }
  notificationsToggleEl.setAttribute("aria-pressed", isEnabled ? "true" : "false");
  const msgKey = isEnabled ? "notifications_enabled" : "notifications_disabled";
  const fallback = isEnabled ? "Notifications are enabled" : "Notifications are disabled";
  const label = i18nMessage(msgKey) || fallback;
  notificationsToggleEl.setAttribute("title", label);
  notificationsToggleEl.setAttribute("aria-label", label);
}

function shortenTooltipText(text, maxLen = 120) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function setDownloadRowExtensionErrorTip(li, message) {
  if (!li || !message) return;
  li.dataset.extensionErrorTip = shortenTooltipText(message, 160);
}

function getErrorTooltipForRow(item, li) {
  const ext = li?.dataset?.extensionErrorTip;
  if (ext) return shortenTooltipText(ext, 140);
  return shortenTooltipText(getLocalizedDownloadErrorTooltip(item), 140);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return i18nMessage("unknown_file_size") || "Unknown size";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function formatDownloadSpeed(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatDownloadEta(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const secU = i18nMessage("eta_unit_sec") || "sec";
  const minU = i18nMessage("eta_unit_min") || "min";
  const hrU = i18nMessage("eta_unit_hour") || "hr";
  const s = Math.round(totalSeconds);

  let timeStr;
  if (s < 60) {
    timeStr = `${s} ${secU}`;
  } else if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    timeStr = rem > 0 ? `${m} ${minU} ${rem} ${secU}` : `${m} ${minU}`;
  } else {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    timeStr = m > 0 ? `${h} ${hrU} ${m} ${minU}` : `${h} ${hrU}`;
  }

  return i18nMessage("download_eta", [timeStr]) || timeStr;
}

/**
 * Builds the meta line for an in-progress download: "size • speed • eta".
 * `sampledSpeed` (bytes/sec) is the smoothed speed measured across poll ticks;
 * when unavailable we fall back to deriving speed from `estimatedEndTime`.
 */
function deriveProgressMetaText(item, sampledSpeed) {
  const recv = Number(item.bytesReceived) || 0;
  const total =
    (Number(item.totalBytes) > 0 ? Number(item.totalBytes) : 0) ||
    (Number(item.fileSize) > 0 ? Number(item.fileSize) : 0);
  const size = formatBytes(total > 0 ? total : recv);

  if (item.paused) {
    return `${size} • ${i18nMessage("download_status_paused") || "Paused"}`;
  }

  const remaining = total > 0 ? Math.max(0, total - recv) : NaN;

  let endMs = NaN;
  if (item.estimatedEndTime) {
    const parsed = new Date(item.estimatedEndTime).getTime();
    if (Number.isFinite(parsed)) endMs = parsed;
  }

  let speed = Number.isFinite(sampledSpeed) && sampledSpeed > 0 ? sampledSpeed : NaN;
  if (!Number.isFinite(speed) && Number.isFinite(endMs) && Number.isFinite(remaining)) {
    const secs = (endMs - Date.now()) / 1000;
    if (secs > 0.5) speed = remaining / secs;
  }

  let etaSec = NaN;
  if (Number.isFinite(speed) && speed > 0 && Number.isFinite(remaining)) {
    etaSec = remaining / speed;
  } else if (Number.isFinite(endMs)) {
    etaSec = Math.max(0, (endMs - Date.now()) / 1000);
  }

  const parts = [size];
  if (Number.isFinite(speed) && speed > 0) parts.push(formatDownloadSpeed(speed));
  if (Number.isFinite(etaSec)) parts.push(formatDownloadEta(etaSec));
  return parts.join(" • ");
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fullMonthsBetween(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

function fullYearsBetween(from, to) {
  let y = to.getFullYear() - from.getFullYear();
  const beforeAnniversary =
    to.getMonth() < from.getMonth() ||
    (to.getMonth() === from.getMonth() && to.getDate() < from.getDate());
  if (beforeAnniversary) y -= 1;
  return y;
}

function cloneDateOrNull(value) {
  if (!(value instanceof Date)) return null;
  return new Date(value.getTime());
}

function normalizeDateRange(start, end) {
  const left = start ? startOfDay(start) : null;
  const right = end ? startOfDay(end) : null;
  if (!left || !right) {
    if (left && !right) return { start: left, end: left };
    if (!left && right) return { start: right, end: right };
    return { start: null, end: null };
  }
  if (left.getTime() <= right.getTime()) return { start: left, end: right };
  return { start: right, end: left };
}

function cloneDateRange(range) {
  return {
    start: cloneDateOrNull(range?.start),
    end: cloneDateOrNull(range?.end)
  };
}

function hasDateRange(range) {
  return range?.start instanceof Date && range?.end instanceof Date;
}

function areSameDay(left, right) {
  if (!(left instanceof Date) || !(right instanceof Date)) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function toDayKey(date) {
  if (!(date instanceof Date)) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function updateDateFilterToggleUi() {
  if (!dateFilterToggleEl) return;
  const active = hasDateRange(activeDateRange);
  const labelEl = dateFilterToggleEl.querySelector(".toolbar-filter-menu__label");
  const dateFilterTitle = i18nMessage("date_filter_label") || "Date";
  if (labelEl) {
    labelEl.textContent = dateFilterTitle;
  }
  dateFilterToggleEl.classList.toggle("toolbar-filter-menu__item--active", active);
  dateFilterToggleEl.setAttribute("aria-checked", active ? "true" : "false");
}

function normalizeTypeFilterState() {
  for (const key of [...activeTypeFilters]) {
    if (!TYPE_FILTER_KEYS.includes(key)) {
      activeTypeFilters.delete(key);
    }
  }
}

function serializeFiltersState() {
  return {
    nameSortMode,
    sizeSortMode,
    dateRange: {
      start: hasDateRange(activeDateRange) ? activeDateRange.start.toISOString() : null,
      end: hasDateRange(activeDateRange) ? activeDateRange.end.toISOString() : null
    },
    typeFilters: TYPE_FILTER_KEYS.filter((key) => activeTypeFilters.has(key))
  };
}

function persistFiltersState() {
  storageSetFilters(serializeFiltersState());
}

function restoreFiltersState(rawState) {
  const state = rawState && typeof rawState === "object" ? rawState : {};
  const nextNameSort = NAME_SORT_MODES.includes(state.nameSortMode) ? state.nameSortMode : "none";
  const nextSizeSort = SIZE_SORT_MODES.includes(state.sizeSortMode) ? state.sizeSortMode : "none";
  if (nextNameSort !== "none" && nextSizeSort !== "none") {
    nameSortMode = nextNameSort;
    sizeSortMode = "none";
  } else {
    nameSortMode = nextNameSort;
    sizeSortMode = nextSizeSort;
  }

  const rawStart = state?.dateRange?.start;
  const rawEnd = state?.dateRange?.end;
  const start = rawStart ? new Date(rawStart) : null;
  const end = rawEnd ? new Date(rawEnd) : null;
  if (start instanceof Date && !Number.isNaN(start.getTime()) && end instanceof Date && !Number.isNaN(end.getTime())) {
    const normalized = normalizeDateRange(start, end);
    activeDateRange = { start: normalized.start, end: normalized.end };
  } else {
    activeDateRange = { start: null, end: null };
  }

  const rawTypeFilters = Array.isArray(state.typeFilters) ? state.typeFilters : TYPE_FILTER_KEYS;
  activeTypeFilters = new Set(rawTypeFilters.filter((key) => TYPE_FILTER_KEYS.includes(key)));
}

function areAllTypeFiltersEnabled() {
  return TYPE_FILTER_KEYS.every((key) => activeTypeFilters.has(key));
}

function updateTypeFilterToggleUi() {
  if (!typeFilterToggleEl) return;
  normalizeTypeFilterState();
  const allEnabled = areAllTypeFiltersEnabled();
  const active = !allEnabled;
  const labelEl = typeFilterToggleEl.querySelector(".toolbar-filter-menu__label");
  const typeTitle = i18nMessage("type_filter_label") || "Type";
  if (labelEl) {
    labelEl.textContent = typeTitle;
  }
  typeFilterToggleEl.classList.toggle("toolbar-filter-menu__item--active", active);
  typeFilterToggleEl.setAttribute("aria-checked", active ? "true" : "false");
}

function syncTypeFilterPopoverCheckboxes() {
  if (!typeFilterPopoverEl) return;
  normalizeTypeFilterState();
  if (typeFilterImagesEl) typeFilterImagesEl.checked = activeTypeFilters.has("images");
  if (typeFilterVideoEl) typeFilterVideoEl.checked = activeTypeFilters.has("video");
  if (typeFilterArchivesEl) typeFilterArchivesEl.checked = activeTypeFilters.has("archives");
  if (typeFilterProgramsEl) typeFilterProgramsEl.checked = activeTypeFilters.has("programs");
  if (typeFilterDocumentsEl) typeFilterDocumentsEl.checked = activeTypeFilters.has("documents");
  if (typeFilterAllEl) {
    typeFilterAllEl.indeterminate = false;
  }
}

function closeDateFilterPopover() {
  if (!openDateFilterCtx || !dateFilterPopoverEl || !dateFilterToggleEl) return;
  const { onDocClick, onDocKey } = openDateFilterCtx;
  dateFilterPopoverEl.hidden = true;
  dateFilterToggleEl.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKey, true);
  openDateFilterCtx = null;
}

function closeTypeFilterPopover() {
  if (!openTypeFilterCtx || !typeFilterPopoverEl || !typeFilterToggleEl) return;
  const { onDocClick, onDocKey } = openTypeFilterCtx;
  typeFilterPopoverEl.hidden = true;
  typeFilterToggleEl.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKey, true);
  openTypeFilterCtx = null;
}

function closeClearAllPopover() {
  const clearAllToggleEl = getClearAllToggleEl();
  if (!openClearAllCtx || !clearAllPopoverEl) return;
  const { onDocClick, onDocKey } = openClearAllCtx;
  clearAllPopoverEl.hidden = true;
  clearAllToggleEl?.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKey, true);
  openClearAllCtx = null;
}

function positionDateFilterPopover() {
  if (!dateFilterPopoverEl || !dateFilterToggleEl) return;
  const hasVisibleFiltersMenu = Boolean(filtersMenuEl && !filtersMenuEl.hidden);
  const anchorRect = hasVisibleFiltersMenu
    ? filtersMenuEl.getBoundingClientRect()
    : dateFilterToggleEl.getBoundingClientRect();
  dateFilterPopoverEl.hidden = false;
  dateFilterPopoverEl.style.visibility = "hidden";
  const ph = dateFilterPopoverEl.offsetHeight;
  let left = anchorRect.right + 6;
  let top = anchorRect.top;
  if (top + ph > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - ph - 8);
  }
  dateFilterPopoverEl.style.left = `${left}px`;
  dateFilterPopoverEl.style.top = `${top}px`;
  dateFilterPopoverEl.style.visibility = "";
}

function positionTypeFilterPopover() {
  if (!typeFilterPopoverEl || !typeFilterToggleEl) return;
  const hasVisibleFiltersMenu = Boolean(filtersMenuEl && !filtersMenuEl.hidden);
  const anchorRect = hasVisibleFiltersMenu
    ? filtersMenuEl.getBoundingClientRect()
    : typeFilterToggleEl.getBoundingClientRect();
  typeFilterPopoverEl.hidden = false;
  typeFilterPopoverEl.style.visibility = "hidden";
  const ph = typeFilterPopoverEl.offsetHeight;
  const left = anchorRect.right + 6;
  let top = anchorRect.top;
  if (top + ph > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - ph - 8);
  }
  typeFilterPopoverEl.style.left = `${left}px`;
  typeFilterPopoverEl.style.top = `${top}px`;
  typeFilterPopoverEl.style.visibility = "";
}

function positionClearAllPopover() {
  const clearAllToggleEl = getClearAllToggleEl();
  if (!clearAllPopoverEl || !clearAllToggleEl) return;
  const br = clearAllToggleEl.getBoundingClientRect();
  clearAllPopoverEl.hidden = false;
  clearAllPopoverEl.style.visibility = "hidden";
  const pw = clearAllPopoverEl.offsetWidth;
  const ph = clearAllPopoverEl.offsetHeight;
  let left = br.right - pw;
  left = Math.max(6, Math.min(left, window.innerWidth - pw - 6));
  let top = br.bottom + 4;
  if (top + ph > window.innerHeight - 8) {
    top = Math.max(8, br.top - ph - 4);
  }
  clearAllPopoverEl.style.left = `${left}px`;
  clearAllPopoverEl.style.top = `${top}px`;
  clearAllPopoverEl.style.visibility = "";
}

function openClearAllPopover() {
  const clearAllToggleEl = getClearAllToggleEl();
  if (!clearAllPopoverEl || !clearAllToggleEl) return;
  if (openClearAllCtx) {
    closeClearAllPopover();
    return;
  }
  hideErrorFloatTip();
  closeDownloadMenu();
  closeFiltersMenu();
  closeDateFilterPopover();
  closeTypeFilterPopover();

  const onDocClick = (e) => {
    if (!clearAllPopoverEl || !clearAllToggleEl) return;
    if (clearAllPopoverEl.contains(e.target) || clearAllToggleEl.contains(e.target)) return;
    closeClearAllPopover();
  };
  const onDocKey = (e) => {
    if (e.key === "Escape") closeClearAllPopover();
  };

  openClearAllCtx = { onDocClick, onDocKey };
  clearAllToggleEl.setAttribute("aria-expanded", "true");
  positionClearAllPopover();
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKey, true);
}

function shiftMonth(monthDate, delta) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1);
}

function buildCalendarDays(viewMonth) {
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() - firstWeekday);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return { days, monthStart };
}

function selectDraftDate(clickedDate) {
  const day = startOfDay(clickedDate);
  const start = draftDateRange.start ? startOfDay(draftDateRange.start) : null;
  const end = draftDateRange.end ? startOfDay(draftDateRange.end) : null;
  if (!start || (start && end)) {
    draftDateRange = { start: day, end: null };
    dateSelectionAnchor = day;
    return;
  }
  if (dateSelectionAnchor && areSameDay(dateSelectionAnchor, day)) {
    draftDateRange = { start: day, end: day };
    return;
  }
  const normalized = normalizeDateRange(dateSelectionAnchor || start, day);
  draftDateRange = { start: normalized.start, end: normalized.end };
}

function renderDateCalendar() {
  if (!dateCalendarGridEl || !dateCalendarMonthLabelEl) return;
  dateCalendarGridEl.innerHTML = "";
  dateCalendarMonthLabelEl.textContent = CALENDAR_MONTH_FORMATTER.format(dateCalendarViewMonth);
  const { days, monthStart } = buildCalendarDays(dateCalendarViewMonth);
  const normalizedDraft = normalizeDateRange(draftDateRange.start, draftDateRange.end);
  const rangeStartMs = normalizedDraft.start?.getTime() ?? null;
  const rangeEndMs = normalizedDraft.end?.getTime() ?? null;
  const today = startOfDay(new Date());
  for (const day of days) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-filter-popover__day";
    btn.textContent = String(day.getDate());
    btn.dataset.dateKey = toDayKey(day);
    if (day.getMonth() !== monthStart.getMonth()) {
      btn.classList.add("date-filter-popover__day--outside");
    }
    if (areSameDay(day, today)) {
      btn.classList.add("date-filter-popover__day--today");
    }
    const ms = day.getTime();
    const inRange = rangeStartMs !== null && rangeEndMs !== null && ms >= rangeStartMs && ms <= rangeEndMs;
    if (inRange) {
      btn.classList.add("date-filter-popover__day--in-range");
      if (ms === rangeStartMs || ms === rangeEndMs) {
        btn.classList.add("date-filter-popover__day--edge");
      }
    }
    btn.addEventListener("click", () => {
      selectDraftDate(day);
      renderDateCalendar();
    });
    dateCalendarGridEl.appendChild(btn);
  }
}

function openDateFilterPopover() {
  if (!dateFilterPopoverEl || !dateFilterToggleEl) return;
  if (openDateFilterCtx) {
    closeDateFilterPopover();
    return;
  }
  closeTypeFilterPopover();
  closeClearAllPopover();
  closeDownloadMenu();
  hideErrorFloatTip();

  const normalized = normalizeDateRange(activeDateRange.start, activeDateRange.end);
  draftDateRange = cloneDateRange(normalized);
  dateSelectionAnchor = cloneDateOrNull(normalized.start);
  dateCalendarViewMonth = new Date(
    (normalized.start || new Date()).getFullYear(),
    (normalized.start || new Date()).getMonth(),
    1
  );
  renderDateCalendar();
  positionDateFilterPopover();

  const onDocClick = (e) => {
    if (!dateFilterPopoverEl || !dateFilterToggleEl) return;
    if (dateFilterPopoverEl.contains(e.target) || dateFilterToggleEl.contains(e.target)) return;
    closeDateFilterPopover();
  };
  const onDocKey = (e) => {
    if (e.key === "Escape") {
      closeDateFilterPopover();
    }
  };
  openDateFilterCtx = { onDocClick, onDocKey };
  dateFilterToggleEl.setAttribute("aria-expanded", "true");
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKey, true);
}

function openTypeFilterPopover() {
  if (!typeFilterPopoverEl || !typeFilterToggleEl) return;
  if (openTypeFilterCtx) {
    closeTypeFilterPopover();
    return;
  }
  closeDateFilterPopover();
  closeClearAllPopover();
  closeDownloadMenu();
  hideErrorFloatTip();
  syncTypeFilterPopoverCheckboxes();
  positionTypeFilterPopover();

  const onDocClick = (e) => {
    if (!typeFilterPopoverEl || !typeFilterToggleEl) return;
    if (typeFilterPopoverEl.contains(e.target) || typeFilterToggleEl.contains(e.target)) return;
    closeTypeFilterPopover();
  };
  const onDocKey = (e) => {
    if (e.key === "Escape") closeTypeFilterPopover();
  };
  openTypeFilterCtx = { onDocClick, onDocKey };
  typeFilterToggleEl.setAttribute("aria-expanded", "true");
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKey, true);
}

function setPresetToday() {
  const today = startOfDay(new Date());
  draftDateRange = { start: today, end: today };
  dateSelectionAnchor = today;
  dateCalendarViewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  renderDateCalendar();
}

function setPresetWeek() {
  const today = startOfDay(new Date());
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const normalized = normalizeDateRange(from, today);
  draftDateRange = { start: normalized.start, end: normalized.end };
  dateSelectionAnchor = normalized.start;
  dateCalendarViewMonth = new Date(normalized.start.getFullYear(), normalized.start.getMonth(), 1);
  renderDateCalendar();
}

function setPresetMonth() {
  const today = startOfDay(new Date());
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const normalized = normalizeDateRange(from, today);
  draftDateRange = { start: normalized.start, end: normalized.end };
  dateSelectionAnchor = normalized.start;
  dateCalendarViewMonth = new Date(from.getFullYear(), from.getMonth(), 1);
  renderDateCalendar();
}

function extractExtensionFromDownload(item) {
  const fileName = getFileName(item);
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

function getTypeKeyForDownload(item) {
  const ext = extractExtensionFromDownload(item);
  if (!ext) return "";
  for (const key of TYPE_FILTER_KEYS) {
    if (FILE_TYPE_EXTENSIONS[key]?.has(ext)) return key;
  }
  return "";
}

function isDownloadVisibleByType(item) {
  if (areAllTypeFiltersEnabled()) return true;
  const typeKey = getTypeKeyForDownload(item);
  if (!typeKey) return false;
  return activeTypeFilters.has(typeKey);
}

function applyTypeFilterSelection(typeKey, checked) {
  if (!TYPE_FILTER_KEYS.includes(typeKey)) return;
  if (checked) {
    activeTypeFilters.add(typeKey);
  } else {
    activeTypeFilters.delete(typeKey);
  }
  if (typeFilterAllEl) {
    typeFilterAllEl.checked = false;
  }
  syncTypeFilterPopoverCheckboxes();
  updateTypeFilterToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  void rerenderPreservingScrollPosition();
}

function toggleAllTypeFilters(checked) {
  if (checked) {
    activeTypeFilters = new Set(TYPE_FILTER_KEYS);
    if (typeFilterAllEl) {
      typeFilterAllEl.checked = true;
      typeFilterAllEl.indeterminate = false;
    }
  }
  syncTypeFilterPopoverCheckboxes();
  updateTypeFilterToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  void rerenderPreservingScrollPosition();
}

function applyDateFilterFromDraft() {
  const normalized = normalizeDateRange(draftDateRange.start, draftDateRange.end);
  activeDateRange = cloneDateRange(normalized);
  updateDateFilterToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  closeDateFilterPopover();
  void rerenderPreservingScrollPosition();
}

function resetDateFilter() {
  activeDateRange = { start: null, end: null };
  draftDateRange = { start: null, end: null };
  dateSelectionAnchor = null;
  updateDateFilterToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  closeDateFilterPopover();
  void rerenderPreservingScrollPosition();
}

function isDateInsideActiveRange(itemDate) {
  if (!hasDateRange(activeDateRange)) return true;
  if (!(itemDate instanceof Date)) return false;
  const dayMs = startOfDay(itemDate).getTime();
  const startMs = activeDateRange.start.getTime();
  const endMs = activeDateRange.end.getTime();
  return dayMs >= startMs && dayMs <= endMs;
}

function formatRelativeTime(isoDate) {
  if (!isoDate) return i18nMessage("time_unknown") || "Unknown time";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return i18nMessage("time_unknown") || "Unknown time";

  const now = new Date();
  const diffMs = now - date;
  if (diffMs < 0) {
    return ABSOLUTE_DATE_FORMATTER.format(date);
  }

  const totalSec = Math.floor(diffMs / 1000);
  const totalMin = Math.max(1, Math.floor(totalSec / 60));
  const totalHr = Math.max(1, Math.floor(totalMin / 60));

  const todayStart = startOfDay(now);
  const dateStart = startOfDay(date);
  const calendarDaysDiff = Math.floor((todayStart - dateStart) / 86400000);

  if (totalSec < 45) return i18nMessage("time_just_now") || "just now";
  if (totalMin < 60) return RELATIVE_TIME_FORMATTER.format(-totalMin, "minute");
  if (calendarDaysDiff === 0) return RELATIVE_TIME_FORMATTER.format(-totalHr, "hour");
  if (calendarDaysDiff < 7) return RELATIVE_TIME_FORMATTER.format(-calendarDaysDiff, "day");
  if (calendarDaysDiff < 30) return RELATIVE_TIME_FORMATTER.format(-Math.max(1, Math.floor(calendarDaysDiff / 7)), "week");

  const months = fullMonthsBetween(date, now);
  if (months >= 1 && months < 12) {
    return RELATIVE_TIME_FORMATTER.format(-months, "month");
  }

  const years = fullYearsBetween(date, now);
  if (years >= 1) {
    return RELATIVE_TIME_FORMATTER.format(-years, "year");
  }

  return ABSOLUTE_DATE_FORMATTER.format(date);
}

function parseDownloadDate(item) {
  const raw = item?.endTime || item?.startTime;
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function getDateGroupKey(item, now = new Date()) {
  const dt = parseDownloadDate(item);
  if (!dt) return "older";
  const nowStart = startOfDay(now);
  const itemStart = startOfDay(dt);
  const diffDays = Math.floor((nowStart - itemStart) / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return "weekAgo";
  return "older";
}

function groupDownloadsByDate(items) {
  const groupsMap = new Map(DATE_GROUPS.map((g) => [g.key, []]));
  const now = new Date();
  for (const item of items) {
    const key = getDateGroupKey(item, now);
    const bucket = groupsMap.get(key);
    if (bucket) bucket.push(item);
  }
  return DATE_GROUPS.map((g) => ({ ...g, items: groupsMap.get(g.key) || [] })).filter(
    (group) => group.items.length > 0
  );
}

function getGroupLabel(group) {
  return i18nMessage(group.i18nKey) || group.fallbackLabel;
}

function captureGroupOpenStateFromDom() {
  if (!downloadsListEl) return;
  const detailsNodes = downloadsListEl.querySelectorAll("details.downloads-group__details[data-group-key]");
  detailsNodes.forEach((node) => {
    const key = node.dataset.groupKey;
    if (key) dateGroupOpenState.set(key, node.open);
  });
}

function getGroupOpenState(groupKey) {
  if (dateGroupOpenState.has(groupKey)) {
    return dateGroupOpenState.get(groupKey) === true;
  }
  return true;
}

function getFileName(item) {
  if (item.filename) {
    const parts = item.filename.split(/[\\/]/);
    return parts[parts.length - 1] || i18nMessage("untitled_file") || "Untitled";
  }
  return item.finalUrl
    ? new URL(item.finalUrl).pathname.split("/").pop() || i18nMessage("untitled_file") || "Untitled"
    : i18nMessage("untitled_file") || "Untitled";
}

function getNameSortButtonLabel() {
  if (nameSortMode === "name-desc") {
    return i18nMessage("name_sort_direction_desc") || "Z–A";
  }
  return i18nMessage("name_sort_direction_asc") || "A–Z";
}

function getNameSortTitleText() {
  return i18nMessage("filter_sort_title") || "Title";
}

function updateNameSortToggleUi() {
  if (!nameSortToggleEl) return;
  const active = nameSortMode !== "none";
  const labelEl = nameSortToggleEl.querySelector(".toolbar-filter-menu__label");
  if (labelEl) {
    labelEl.textContent = `${getNameSortTitleText()} ${getNameSortButtonLabel()}`;
  }
  nameSortToggleEl.classList.toggle("toolbar-filter-menu__item--active", active);
  nameSortToggleEl.setAttribute("aria-checked", active ? "true" : "false");
}

function getSizeSortButtonLabel() {
  if (sizeSortMode === "size-desc") {
    return i18nMessage("size_sort_direction_desc") || "DESC";
  }
  return i18nMessage("size_sort_direction_asc") || "ASC";
}

function getSizeSortTitleText() {
  return i18nMessage("filter_sort_size") || "Size";
}

function getTypeLabelsForChip() {
  const keyMap = {
    images: "type_filter_images",
    video: "type_filter_video",
    archives: "type_filter_archives_short",
    programs: "type_filter_programs_short",
    documents: "type_filter_documents"
  };
  return TYPE_FILTER_KEYS.filter((key) => activeTypeFilters.has(key)).map(
    (key) => i18nMessage(keyMap[key]) || key
  );
}

function clearSortFilter(kind) {
  if (kind === "name") {
    if (nameSortMode === "none") return;
    nameSortMode = "none";
  } else if (kind === "size") {
    if (sizeSortMode === "none") return;
    sizeSortMode = "none";
  } else {
    return;
  }
  updateNameSortToggleUi();
  updateSizeSortToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  void rerenderPreservingScrollPosition();
}

function clearTypeFilter() {
  activeTypeFilters = new Set(TYPE_FILTER_KEYS);
  syncTypeFilterPopoverCheckboxes();
  updateTypeFilterToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  void rerenderPreservingScrollPosition();
}

function buildActiveFilters() {
  const list = [];
  if (nameSortMode !== "none") {
    list.push({
      key: "name",
      text: `${getNameSortTitleText()}: ${getNameSortButtonLabel()}`,
      onClear: () => clearSortFilter("name")
    });
  }
  if (sizeSortMode !== "none") {
    list.push({
      key: "size",
      text: `${getSizeSortTitleText()}: ${getSizeSortButtonLabel()}`,
      onClear: () => clearSortFilter("size")
    });
  }
  if (hasDateRange(activeDateRange)) {
    const dateText = areSameDay(activeDateRange.start, activeDateRange.end)
      ? CALENDAR_RANGE_FORMATTER.format(activeDateRange.start)
      : `${CALENDAR_RANGE_FORMATTER.format(activeDateRange.start)} - ${CALENDAR_RANGE_FORMATTER.format(activeDateRange.end)}`;
    list.push({
      key: "date",
      text: `${i18nMessage("date_filter_label") || "Date"}: ${dateText}`,
      onClear: () => resetDateFilter()
    });
  }
  if (!areAllTypeFiltersEnabled()) {
    const typeLabel = i18nMessage("type_filter_label") || "Type";
    const selected = getTypeLabelsForChip();
    const text = selected.length > 0 ? `${typeLabel}: ${selected.join(", ")}` : `${typeLabel}: -`;
    list.push({
      key: "type",
      text,
      onClear: () => clearTypeFilter()
    });
  }
  return list;
}

function renderActiveFilterChips() {
  if (!activeFiltersBarEl) return;
  const items = buildActiveFilters();
  activeFiltersBarEl.innerHTML = "";
  if (items.length === 0) {
    activeFiltersBarEl.classList.add("hidden");
    activeFiltersBarEl.hidden = true;
    return;
  }
  activeFiltersBarEl.classList.remove("hidden");
  activeFiltersBarEl.hidden = false;
  for (const item of items) {
    const chip = document.createElement("article");
    chip.className = "active-filter-chip";
    chip.dataset.filterChip = item.key;

    const text = document.createElement("span");
    text.className = "active-filter-chip__text";
    text.textContent = item.text;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "active-filter-chip__close";
    close.setAttribute("aria-label", i18nMessage("chip_close_filter") || "Clear filter");
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.onClear();
    });

    chip.append(text, close);
    activeFiltersBarEl.appendChild(chip);
  }
}

function updateSizeSortToggleUi() {
  if (!sizeSortToggleEl) return;
  const active = sizeSortMode !== "none";
  const labelEl = sizeSortToggleEl.querySelector(".toolbar-filter-menu__label");
  if (labelEl) {
    labelEl.textContent = `${getSizeSortTitleText()} ${getSizeSortButtonLabel()}`;
  }
  sizeSortToggleEl.classList.toggle("toolbar-filter-menu__item--active", active);
  sizeSortToggleEl.setAttribute("aria-checked", active ? "true" : "false");
}

function closeFiltersMenu() {
  if (!openFiltersMenuCtx) return;
  const { menu, btn, onDocClick, onDocKey } = openFiltersMenuCtx;
  menu.hidden = true;
  btn.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onDocKey, true);
  openFiltersMenuCtx = null;
}

function positionFiltersMenu(menu, anchorBtn) {
  const br = anchorBtn.getBoundingClientRect();
  menu.style.visibility = "hidden";
  menu.style.left = "-9999px";
  menu.style.top = "0px";
  menu.hidden = false;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = br.left;
  left = Math.max(6, Math.min(left, window.innerWidth - mw - 6));
  let top = br.bottom + 4;
  if (top + mh > window.innerHeight - 8) {
    top = Math.max(8, br.top - mh - 4);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "";
}

function openFiltersMenu(menu, btn) {
  hideErrorFloatTip();
  closeDownloadMenu();
  closeDateFilterPopover();
  closeTypeFilterPopover();
  closeClearAllPopover();
  if (openFiltersMenuCtx?.btn === btn) {
    closeFiltersMenu();
    return;
  }
  closeFiltersMenu();

  const onDocClick = (e) => {
    if (!openFiltersMenuCtx) return;
    const ctx = openFiltersMenuCtx;
    if (
      ctx.menu.contains(e.target) ||
      ctx.btn.contains(e.target) ||
      (dateFilterPopoverEl && !dateFilterPopoverEl.hidden && dateFilterPopoverEl.contains(e.target)) ||
      (typeFilterPopoverEl && !typeFilterPopoverEl.hidden && typeFilterPopoverEl.contains(e.target))
    ) {
      return;
    }
    closeFiltersMenu();
  };

  const onDocKey = (e) => {
    if (e.key === "Escape") closeFiltersMenu();
  };

  openFiltersMenuCtx = { menu, btn, onDocClick, onDocKey };
  btn.setAttribute("aria-expanded", "true");
  positionFiltersMenu(menu, btn);
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onDocKey, true);
}

function getDownloadSortSize(item) {
  const primary = Number(item?.fileSize);
  if (Number.isFinite(primary) && primary > 0) return primary;
  const total = Number(item?.totalBytes);
  if (Number.isFinite(total) && total > 0) return total;
  const received = Number(item?.bytesReceived);
  if (Number.isFinite(received) && received > 0) return received;
  return 0;
}

function applyCombinedSort(items) {
  if (nameSortMode === "none" && sizeSortMode === "none") return items;
  return [...items].sort((a, b) => {
    if (sizeSortMode !== "none") {
      const sizeDiff = getDownloadSortSize(a) - getDownloadSortSize(b);
      if (sizeDiff !== 0) {
        return sizeSortMode === "size-desc" ? -sizeDiff : sizeDiff;
      }
    }
    if (nameSortMode !== "none") {
      const nameDiff = fileNameSorter.compare(getFileName(a), getFileName(b));
      if (nameDiff !== 0) {
        return nameSortMode === "name-desc" ? -nameDiff : nameDiff;
      }
    }
    return 0;
  });
}

async function rerenderPreservingScrollPosition() {
  const list = downloadsListEl;
  const prevScrollTop = list ? list.scrollTop : 0;
  await resetAndRender();
  if (!list) return;
  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  list.scrollTop = Math.min(prevScrollTop, maxScroll);
}

function toggleNameSortMode() {
  if (nameSortMode === "none") {
    nameSortMode = "name-asc";
    sizeSortMode = "none";
  } else if (nameSortMode === "name-asc") {
    nameSortMode = "name-desc";
    sizeSortMode = "none";
  } else {
    nameSortMode = "none";
  }
  updateNameSortToggleUi();
  updateSizeSortToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  void rerenderPreservingScrollPosition();
}

function toggleSizeSortMode() {
  if (sizeSortMode === "none") {
    sizeSortMode = "size-asc";
    nameSortMode = "none";
  } else if (sizeSortMode === "size-asc") {
    sizeSortMode = "size-desc";
    nameSortMode = "none";
  } else {
    sizeSortMode = "none";
  }
  updateNameSortToggleUi();
  updateSizeSortToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
  void rerenderPreservingScrollPosition();
}

/** Records without a file on disk (deleted) are not shown. */
function getVisibleDownloads() {
  return allDownloads.filter((item) => item.exists !== false);
}

function applySearchFilter() {
  const filtered = getVisibleDownloads();
  const dateFiltered = filtered.filter((item) => isDateInsideActiveRange(parseDownloadDate(item)));
  const typeFiltered = dateFiltered.filter((item) => isDownloadVisibleByType(item));
  const q = (searchInputEl?.value ?? "").trim().toLowerCase();
  const searchFiltered = q
    ? typeFiltered.filter((item) => getFileName(item).toLowerCase().includes(q))
    : typeFiltered;
  downloads = applyCombinedSort(searchFiltered);
}

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

function captureRenderedDownloadRowPositions() {
  const positions = new Map();
  if (!downloadsListEl) return positions;
  const rows = downloadsListEl.querySelectorAll("li.download-item[data-download-id]");
  rows.forEach((li) => {
    if (li.classList.contains("download-item--filtered-out")) return;
    if (li.getClientRects().length === 0) return;
    const id = li.dataset.downloadId;
    if (!id) return;
    const rect = li.getBoundingClientRect();
    positions.set(id, {
      left: rect.left,
      top: rect.top
    });
  });
  return positions;
}

function animateRenderedDownloadLayout(previousPositions) {
  if (!downloadsListEl || prefersReducedMotion()) return;
  /*
   * On the very first render of the popup, no row has a previous position,
   * and the cascade of individual download-item--appearing visually "jerks".
   * Instead, we play a single smooth fade-in for the whole list via a CSS class.
   */
  const isInitialRender = previousPositions.size === 0 && !hasRenderedOnce;
  if (isInitialRender) {
    downloadsListEl.classList.remove("downloads-list--initial-fade");
    void downloadsListEl.offsetWidth;
    downloadsListEl.classList.add("downloads-list--initial-fade");
    return;
  }
  const rows = downloadsListEl.querySelectorAll("li.download-item[data-download-id]");
  rows.forEach((li) => {
    if (li.classList.contains("download-item--filtered-out")) return;
    if (li.getClientRects().length === 0) return;
    const id = li.dataset.downloadId;
    if (!id) return;
    const prev = previousPositions.get(id);
    if (!prev) {
      li.classList.remove("download-item--appearing");
      requestAnimationFrame(() => {
        li.classList.add("download-item--appearing");
      });
      return;
    }
    const rect = li.getBoundingClientRect();
    const dx = prev.left - rect.left;
    const dy = prev.top - rect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    li.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0, 0)" }
      ],
      {
        duration: LIST_LAYOUT_ANIMATION_MS,
        easing: LIST_LAYOUT_ANIMATION_EASING
      }
    );
  });
}

/**
 * Chrome 123+: downloads.open/show return a Promise; errors come via rejection, not lastError.
 */
function downloadsOpenCompat(id) {
  const ret = chrome.downloads.open(id);
  if (ret && typeof ret.then === "function") {
    return ret;
  }
  return new Promise((resolve, reject) => {
    const err = chrome.runtime?.lastError;
    if (err) reject(new Error(err.message));
    else resolve();
  });
}

function downloadsShowCompat(id) {
  const ret = chrome.downloads.show(id);
  if (ret && typeof ret.then === "function") {
    return ret;
  }
  return new Promise((resolve, reject) => {
    const err = chrome.runtime?.lastError;
    if (err) reject(new Error(err.message));
    else resolve();
  });
}

function downloadsEraseCompat(query) {
  const ret = chrome.downloads.erase(query);
  if (ret && typeof ret.then === "function") {
    return ret;
  }
  return new Promise((resolve, reject) => {
    chrome.downloads.erase(query, (ids) => {
      const err = chrome.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve(ids || []);
    });
  });
}

function downloadsRemoveFileCompat(id) {
  const ret = chrome.downloads.removeFile(id);
  if (ret && typeof ret.then === "function") {
    return ret;
  }
  return new Promise((resolve, reject) => {
    chrome.downloads.removeFile(id, () => {
      const err = chrome.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function downloadsDownloadCompat(options) {
  let ret;
  try {
    ret = chrome.downloads.download(options);
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    return Promise.reject(new Error(msg));
  }
  if (ret && typeof ret.then === "function") {
    return ret.then(
      (id) => id,
      (e) => {
        const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
        return Promise.reject(new Error(msg));
      }
    );
  }
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const err = chrome.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve(downloadId);
    });
  });
}

function getDownloadsViaBackground() {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.sendMessage) {
      reject(new Error("runtime.sendMessage is unavailable"));
      return;
    }
    chrome.runtime.sendMessage({ type: "downloads-get-current" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.ok !== true || !Array.isArray(response.items)) {
        const msg = response?.error ? String(response.error) : "Background returned invalid data";
        reject(new Error(msg));
        return;
      }
      resolve(response.items);
    });
  });
}

function searchDownloadsDirectly() {
  return new Promise((resolve, reject) => {
    chrome.downloads.search({ orderBy: ["-startTime"], limit: 200 }, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items || []);
    });
  });
}

async function fetchLatestDownloads() {
  try {
    return await getDownloadsViaBackground();
  } catch {
    return searchDownloadsDirectly();
  }
}

function pullAllDownloadsFromChrome() {
  return fetchLatestDownloads().then((items) => {
    allDownloads = items || [];
    applySearchFilter();
  });
}

function downloadsPauseCompat(id) {
  let ret;
  try {
    ret = chrome.downloads.pause(id);
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    return Promise.reject(new Error(msg));
  }
  if (ret && typeof ret.then === "function") {
    return ret.then(undefined, (e) => {
      const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
      return Promise.reject(new Error(msg));
    });
  }
  return new Promise((resolve, reject) => {
    chrome.downloads.pause(id, () => {
      const err = chrome.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function downloadsResumeCompat(id) {
  let ret;
  try {
    ret = chrome.downloads.resume(id);
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    return Promise.reject(new Error(msg));
  }
  if (ret && typeof ret.then === "function") {
    return ret.then(undefined, (e) => {
      const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
      return Promise.reject(new Error(msg));
    });
  }
  return new Promise((resolve, reject) => {
    chrome.downloads.resume(id, () => {
      const err = chrome.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function searchDownloadById(downloadId) {
  return new Promise((resolve, reject) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items || []);
    });
  });
}

function getDownloadProgressPercent(item) {
  if (item.state !== "in_progress") return 0;
  const recv = Number(item.bytesReceived) || 0;
  const total =
    (Number(item.totalBytes) > 0 ? Number(item.totalBytes) : 0) ||
    (Number(item.fileSize) > 0 ? Number(item.fileSize) : 0);
  if (total > 0) return Math.min(100, (recv / total) * 100);
  if (recv > 0) return 6;
  return 0;
}

function updatePauseResumeButton(li, item) {
  const btn = li.querySelector("[data-dl-action='pause-resume']");
  if (!btn || item.state !== "in_progress") return;
  const pauseLabelPause = i18nMessage("btn_pause_download") || "Pause download";
  const pauseLabelResume = i18nMessage("btn_resume_download") || "Resume download";
  btn.setAttribute("aria-label", item.paused ? pauseLabelResume : pauseLabelPause);
  btn.dataset.paused = item.paused ? "1" : "0";
  const tpl = document.createElement("template");
  tpl.innerHTML = item.paused ? SVG_RESUME : SVG_PAUSE;
  const nextSvg = tpl.content.firstElementChild;
  const prev = btn.querySelector("svg");
  if (prev && nextSvg) prev.replaceWith(nextSvg);
  else if (nextSvg && !prev) btn.appendChild(nextSvg);
}

let progressPollIntervalId = null;
let progressPollBusy = false;
let progressAnimationFrameId = null;
let progressAnimationLastTimestamp = 0;
const DOWNLOAD_META_UPDATE_INTERVAL_MS = 1000;
let listRebuildTimerId = null;
let searchFilterRaf = null;
let suppressListRebuildUntil = 0;
const locallyHandledErasedIds = new Map();

function setRenderedDownloadProgress(li, pct) {
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
  li.dataset.progressRenderedPct = safePct.toFixed(4);
  li.style.setProperty("--dl-scale", (safePct / 100).toFixed(4));
}

function stepDownloadProgressAnimation(timestamp) {
  progressAnimationFrameId = null;
  if (!downloadsListEl) return;

  const rows = downloadsListEl.querySelectorAll("li.download-item--progress-overlay[data-download-id]");
  if (rows.length === 0) {
    progressAnimationLastTimestamp = 0;
    return;
  }

  const dt = progressAnimationLastTimestamp > 0 ? Math.min(64, timestamp - progressAnimationLastTimestamp) : 16;
  progressAnimationLastTimestamp = timestamp;
  const smoothing = 1 - Math.exp(-dt / 140);

  rows.forEach((row) => {
    const target = Math.max(0, Math.min(100, Number(row.dataset.progressTargetPct) || 0));
    const renderedRaw = Number(row.dataset.progressRenderedPct);
    const rendered = Number.isFinite(renderedRaw) ? renderedRaw : target;
    const diff = target - rendered;
    const next = Math.abs(diff) < 0.02 ? target : rendered + diff * smoothing;
    setRenderedDownloadProgress(row, next);
  });

  progressAnimationFrameId = requestAnimationFrame(stepDownloadProgressAnimation);
}

function ensureDownloadProgressAnimation() {
  if (progressAnimationFrameId !== null) return;
  progressAnimationFrameId = requestAnimationFrame(stepDownloadProgressAnimation);
}

function searchInProgressDownloads() {
  return new Promise((resolve, reject) => {
    chrome.downloads.search({ state: "in_progress", limit: 200 }, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items || []);
    });
  });
}

function tickDownloadProgressPoll() {
  if (!downloadsListEl || progressPollBusy) return;
  const rows = downloadsListEl.querySelectorAll("li.download-item[data-download-id]");
  if (rows.length === 0) {
    return;
  }

  progressPollBusy = true;
  void searchInProgressDownloads()
    .then((activeItems) => {
      const activeMap = new Map();
      activeItems.forEach((it) => {
        if (it && Number.isFinite(it.id)) activeMap.set(Number(it.id), it);
      });

      rows.forEach((row) => {
        const id = Number(row.dataset.downloadId);
        if (!Number.isFinite(id)) return;
        const active = activeMap.get(id);
        if (active) {
          patchAllDownloadsEntry(active);
          applyDownloadProgressVisual(row, active);
          return;
        }

        if (row.classList.contains("download-item--progress-overlay")) {
          scheduleDownloadRowUpdate(id);
        }
      });
    })
    .catch(() => {
      /* ignore: keep polling on next tick */
    })
    .finally(() => {
      progressPollBusy = false;
    });
}

function ensureDownloadProgressPoll() {
  if (progressPollIntervalId !== null) return;
  tickDownloadProgressPoll();
  progressPollIntervalId = window.setInterval(tickDownloadProgressPoll, 90);
}

function clearDownloadSpeedSamples(li) {
  delete li.dataset.speedLastBytes;
  delete li.dataset.speedLastTs;
  delete li.dataset.speedEma;
  delete li.dataset.progressMetaLastTs;
  delete li.dataset.progressMetaPaused;
}

/** Refreshes the "size • speed • eta" meta line of an in-progress row in place. */
function updateDownloadProgressMeta(li, item) {
  const metaEl = li.querySelector(".download-item__meta");
  if (!metaEl) return;

  const now = performance.now();
  const pausedKey = item.paused ? "1" : "0";
  const forceUpdate = li.dataset.progressMetaPaused !== pausedKey;
  const lastMetaTs = Number(li.dataset.progressMetaLastTs);
  if (
    !forceUpdate &&
    Number.isFinite(lastMetaTs) &&
    now - lastMetaTs < DOWNLOAD_META_UPDATE_INTERVAL_MS
  ) {
    return;
  }

  let speed = NaN;
  if (item.paused) {
    clearDownloadSpeedSamples(li);
  } else {
    const recv = Number(item.bytesReceived) || 0;
    const lastBytes = Number(li.dataset.speedLastBytes);
    const lastTs = Number(li.dataset.speedLastTs);
    let ema = Number(li.dataset.speedEma);

    if (Number.isFinite(lastBytes) && Number.isFinite(lastTs)) {
      const dtSec = (now - lastTs) / 1000;
      if (dtSec >= 0.2) {
        const inst = Math.max(0, (recv - lastBytes) / dtSec);
        ema = Number.isFinite(ema) ? ema * 0.7 + inst * 0.3 : inst;
        li.dataset.speedLastBytes = String(recv);
        li.dataset.speedLastTs = String(now);
        li.dataset.speedEma = String(ema);
      }
    } else {
      li.dataset.speedLastBytes = String(recv);
      li.dataset.speedLastTs = String(now);
    }
    speed = Number(li.dataset.speedEma);
  }

  metaEl.textContent = deriveProgressMetaText(item, speed);
  li.dataset.progressMetaLastTs = String(now);
  li.dataset.progressMetaPaused = pausedKey;
}

function applyDownloadProgressVisual(li, item) {
  if (!li || !item) return;
  const rowId = Number(li.dataset.downloadId);
  if (!Number.isFinite(rowId) || item.id !== rowId) return;
  if (item.state === "in_progress") {
    const pct = getDownloadProgressPercent(item);
    li.dataset.progressTargetPct = pct.toFixed(4);
    if (!Number.isFinite(Number(li.dataset.progressRenderedPct))) {
      setRenderedDownloadProgress(li, pct);
    }
    li.classList.add("download-item--progress-overlay");
    if (item.paused) {
      li.classList.add("download-item--download-paused");
    } else {
      li.classList.remove("download-item--download-paused");
    }
    updatePauseResumeButton(li, item);
    updateDownloadProgressMeta(li, item);
    ensureDownloadProgressAnimation();
    ensureDownloadProgressPoll();
  } else {
    delete li.dataset.progressTargetPct;
    delete li.dataset.progressRenderedPct;
    clearDownloadSpeedSamples(li);
    li.style.removeProperty("--dl-scale");
    li.classList.remove("download-item--progress-overlay", "download-item--download-paused");
    tickDownloadProgressPoll();
  }
}

function updateDownloadRowSearchIndex(li, item) {
  if (!li) return;
  const name = getFileName(item).toLowerCase();
  li.dataset.searchName = name;
}

function applyRenderedSearchVisibility() {
  if (!downloadsListEl) return;
  closeDownloadMenu();
  hideErrorFloatTip();
  const q = (searchInputEl?.value ?? "").trim().toLowerCase();
  let visibleRows = 0;
  const groupDetailsNodes = downloadsListEl.querySelectorAll("details.downloads-group__details");
  groupDetailsNodes.forEach((detailsEl) => {
    let groupVisibleRows = 0;
    const rows = detailsEl.querySelectorAll("li.download-item");
    rows.forEach((li) => {
      const isPinnedRow = li.dataset.pinned === "true";
      const rowName = li.dataset.searchName || "";
      const wasHidden = li.classList.contains("download-item--filtered-out");
      const rowVisible = isPinnedRow || !q || rowName.includes(q);
      li.classList.toggle("download-item--filtered-out", !rowVisible);
      li.setAttribute("aria-hidden", rowVisible ? "false" : "true");
      if (rowVisible && wasHidden) {
        li.classList.remove("download-item--appearing");
        requestAnimationFrame(() => {
          li.classList.add("download-item--appearing");
        });
      }
      if (rowVisible) groupVisibleRows += 1;
    });
    const groupRoot = detailsEl.closest("li.downloads-group");
    if (groupRoot) {
      groupRoot.classList.toggle("downloads-group--empty", groupVisibleRows === 0);
    }
    visibleRows += groupVisibleRows;
  });

  if (visibleRows === 0) {
    hideMessage();
    showEmptyState();
    return;
  }
  hideMessage();
  hideEmptyState();
}

function scheduleRenderedSearchVisibility() {
  if (searchFilterRaf !== null) return;
  searchFilterRaf = requestAnimationFrame(() => {
    searchFilterRaf = null;
    applyRenderedSearchVisibility();
  });
}

function patchAllDownloadsEntry(item) {
  const i = allDownloads.findIndex((d) => d.id === item.id);
  if (i >= 0) {
    Object.assign(allDownloads[i], item);
  }
}

function upsertAllDownloadsEntry(item) {
  if (!item || !Number.isFinite(item.id)) return;
  const i = allDownloads.findIndex((d) => d.id === item.id);
  if (i >= 0) {
    Object.assign(allDownloads[i], item);
    return;
  }
  allDownloads.unshift(item);
}

async function rebuildListPreservingScroll() {
  const list = downloadsListEl;
  const prevScrollTop = list ? list.scrollTop : 0;
  await pullAllDownloadsFromChrome();
  await resetAndRender();
  if (list) {
    const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    list.scrollTop = Math.min(prevScrollTop, maxScroll);
  }
}

function getListRebuildSuppressionDelay() {
  return Math.max(0, suppressListRebuildUntil - Date.now());
}

function suppressListRebuilds(ms = LOCAL_LIST_REBUILD_SUPPRESSION_MS) {
  suppressListRebuildUntil = Math.max(suppressListRebuildUntil, Date.now() + ms);
}

function rememberLocallyHandledErase(downloadId) {
  const id = Number(downloadId);
  if (!Number.isFinite(id)) return;
  const prevTimerId = locallyHandledErasedIds.get(id);
  if (prevTimerId) {
    window.clearTimeout(prevTimerId);
  }
  const timerId = window.setTimeout(() => {
    locallyHandledErasedIds.delete(id);
  }, LOCAL_LIST_REBUILD_SUPPRESSION_MS + 600);
  locallyHandledErasedIds.set(id, timerId);
}

function forgetLocallyHandledErase(downloadId) {
  const id = Number(downloadId);
  if (!Number.isFinite(id)) return;
  const timerId = locallyHandledErasedIds.get(id);
  if (timerId) {
    window.clearTimeout(timerId);
  }
  locallyHandledErasedIds.delete(id);
}

function scheduleListRebuild() {
  if (getListRebuildSuppressionDelay() > 0) return;
  if (listRebuildTimerId !== null) return;
  listRebuildTimerId = window.setTimeout(() => {
    listRebuildTimerId = null;
    void rebuildListPreservingScroll().catch(() => {
      loadDownloads();
    });
  }, 80);
}

/** Builds an up-to-date record from onChanged: search in the same tick often lags behind bytesReceived. */
function mergeDownloadItemWithDelta(item, delta) {
  const out = { ...item };
  const keys = [
    "url",
    "finalUrl",
    "referrer",
    "filename",
    "incognito",
    "mime",
    "startTime",
    "endTime",
    "state",
    "paused",
    "error",
    "bytesReceived",
    "totalBytes",
    "fileSize",
    "exists",
    "canResume",
    "danger"
  ];
  for (const key of keys) {
    const block = delta[key];
    if (block != null && typeof block === "object" && Object.prototype.hasOwnProperty.call(block, "current")) {
      out[key] = block.current;
    }
  }
  return out;
}

function handleDownloadsOnChanged(delta) {
  const id = delta.id;
  if (id === undefined || id === null) return;

  const li = downloadsListEl?.querySelector(`li[data-download-id="${id}"]`);
  if (!li) {
    scheduleDownloadRowUpdate(id);
    return;
  }

  let base = allDownloads.find((d) => d.id === id);
  if (!base) {
    base = resolveItemForLi(li);
  }
  if (!base || base.id !== id) {
    scheduleDownloadRowUpdate(id);
    return;
  }

  const merged = mergeDownloadItemWithDelta(base, delta);
  patchAllDownloadsEntry(merged);

  if (merged.state === "complete" || merged.state === "interrupted") {
    scheduleDownloadRowUpdate(id);
    return;
  }

  if (merged.state === "in_progress") {
    applyDownloadProgressVisual(li, merged);
  }
}

function handleDownloadsOnCreated(item) {
  if (!item || !Number.isFinite(item.id)) return;
  upsertAllDownloadsEntry(item);
  scheduleListRebuild();
}

function handleDownloadsOnErased(downloadId) {
  const id = Number(downloadId);
  if (!Number.isFinite(id)) return;
  allDownloads = allDownloads.filter((d) => d.id !== id);
  downloads = downloads.filter((d) => d.id !== id);
  if (locallyHandledErasedIds.has(id)) {
    forgetLocallyHandledErase(id);
    return;
  }
  scheduleListRebuild();
}

const downloadRowUpdateIds = new Set();
let downloadRowUpdateRaf = null;

function scheduleDownloadRowUpdate(downloadId) {
  const id = Number(downloadId);
  if (!Number.isFinite(id)) return;
  downloadRowUpdateIds.add(id);
  if (downloadRowUpdateRaf !== null) return;
  downloadRowUpdateRaf = requestAnimationFrame(() => {
    downloadRowUpdateRaf = null;
    const ids = [...downloadRowUpdateIds];
    downloadRowUpdateIds.clear();
    void Promise.all(ids.map((dId) => flushDownloadRowUpdate(dId)));
  });
}

async function flushDownloadRowUpdate(downloadId) {
  const li = downloadsListEl?.querySelector(`li[data-download-id="${downloadId}"]`);
  if (!li) return;
  try {
    const rows = await searchDownloadById(downloadId);
    const item = rows[0];
    if (!item) return;
    await syncListItemWithDownloadItem(li, item);
  } catch {
    /* ignore */
  }
}

async function syncListItemWithDownloadItem(li, item) {
  patchAllDownloadsEntry(item);
  if (item.state !== "in_progress") {
    await refreshListItemElement(li, item);
    return;
  }
  applyDownloadProgressVisual(li, item);
}

function resolveItemForLi(li) {
  const id = Number(li?.dataset?.downloadId);
  if (!Number.isFinite(id)) return null;
  return allDownloads.find((d) => d.id === id) || downloads.find((d) => d.id === id) || null;
}

function getPreferredDownloadFilename(item) {
  if (!item?.filename) return undefined;
  const normalized = String(item.filename).replace(/\\/g, "/");
  const parts = normalized.split("/");
  const base = parts[parts.length - 1];
  return base || undefined;
}

/** Characters and sequences that are not allowed in chrome.downloads.download filename (Windows/Chrome). */
function sanitizeDownloadFilenameForApi(name) {
  if (name == null) return "";
  let s = String(name).replace(/\\/g, "/").split("/").pop() || "";
  s = s.replace(/[\x00-\x1f<>:"|?*]/g, "_").replace(/\s+/g, " ").trim();
  s = s.replace(/[.\u3000\s]+$/g, "");
  if (!s || s === "." || s === "..") return "";
  const upper = s.toUpperCase();
  const winReserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/;
  if (winReserved.test(upper)) s = `_${s}`;
  if (s.length > 200) {
    const dot = s.lastIndexOf(".");
    if (dot > 0) {
      const ext = s.slice(dot);
      const base = s.slice(0, dot);
      s = `${base.slice(0, 200 - ext.length)}${ext}`;
    } else s = s.slice(0, 200);
  }
  return s;
}

/**
 * URL suitable for re-downloading via downloads.download (absolute, not javascript:, etc.).
 * We take the first suitable one from finalUrl and url: for interrupted downloads, finalUrl is sometimes blob:/data:, in which case the original url is used.
 */
function getRetryDownloadUrl(item) {
  const candidates = [];
  if (item?.finalUrl != null) candidates.push(String(item.finalUrl).trim());
  if (item?.url != null) candidates.push(String(item.url).trim());
  const seen = new Set();
  for (const raw of candidates) {
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    const p = parsed.protocol.toLowerCase();
    if (p === "http:" || p === "https:") {
      return { ok: true, url: parsed.href };
    }
  }
  const fallback = candidates[0] || "";
  if (!fallback) return { ok: false, url: "", reason: "empty" };
  return { ok: false, url: fallback, reason: "scheme" };
}

/**
 * Referrer for DownloadOptions: only a valid absolute http(s) URL, otherwise the property is omitted.
 */
function getOptionalDownloadReferrer(item) {
  const ref = item?.referrer;
  if (ref == null || typeof ref !== "string") return undefined;
  const t = ref.trim();
  if (!t) return undefined;
  try {
    const u = new URL(t);
    const p = u.protocol.toLowerCase();
    if (p !== "http:" && p !== "https:") return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

/**
 * Builds safe options for chrome.downloads.download (retry).
 * Invalid fields are omitted to avoid provoking "Error in invocation".
 */
function buildRetryDownloadOptions(item) {
  const urlCheck = getRetryDownloadUrl(item);
  if (!urlCheck.ok) {
    return {
      ok: false,
      message:
        urlCheck.reason === "scheme"
          ? i18nMessage("retry_unsupported_url") || "Only HTTP(S) links can be retried from here."
          : i18nMessage("retry_no_url") || "No address to download again."
    };
  }
  const opts = {
    url: urlCheck.url,
    saveAs: false,
    conflictAction: "uniquify"
  };
  const ref = getOptionalDownloadReferrer(item);
  if (ref) opts.referrer = ref;
  const rawName = getPreferredDownloadFilename(item);
  const safe = rawName ? sanitizeDownloadFilenameForApi(rawName) : "";
  if (safe) opts.filename = safe;
  return { ok: true, options: opts, retryBaseUrl: urlCheck.url };
}

function isDownloadsApiInvocationErrorMessage(msg) {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("invocation") ||
    m.includes("error at parameter") ||
    m.includes("error at property") ||
    m.includes("invalid type")
  );
}

function waitForLeavingAnimation(el) {
  return new Promise((resolve) => {
    const done = () => resolve();
    const tid = window.setTimeout(done, 650);
    el.addEventListener(
      "transitionend",
      (ev) => {
        if (ev.target !== el) return;
        if (ev.propertyName !== "max-height") return;
        window.clearTimeout(tid);
        done();
      },
      { once: true }
    );
  });
}

async function refreshDownloadsDataAfterMutation() {
  const items = await fetchLatestDownloads();
  allDownloads = items || [];
  await resetAndRender();
}

async function silentFullListReload() {
  const items = await fetchLatestDownloads();
  allDownloads = items || [];
  await resetAndRender();
}

function removeDownloadEntryFromState(downloadId) {
  const n = Number(downloadId);
  if (!Number.isFinite(n)) return;
  allDownloads = allDownloads.filter((item) => item.id !== n);
  downloads = downloads.filter((item) => item.id !== n);
}

function syncEmptyStateWithRenderedList() {
  if (!downloadsListEl) return;
  const visibleRows = downloadsListEl.querySelectorAll(
    "li.download-item[data-download-id]:not(.download-item--filtered-out)"
  ).length;
  if (visibleRows === 0) {
    hideMessage();
    showEmptyState();
    return;
  }
  hideMessage();
  hideEmptyState();
}

/** Smooth row hiding, scroll adjustment, silent data update without resetting scroll position to the top. */
async function removeDownloadRowAnimated(downloadId) {
  const n = Number(downloadId);
  if (!Number.isFinite(n)) return;

  const list = downloadsListEl;
  const li = list?.querySelector(`li[data-download-id="${n}"]`);

  if (!li || !list) {
    try {
      await silentFullListReload();
    } catch {
      loadDownloads();
    }
    return;
  }

  const prevScroll = list.scrollTop;
  const itemTop = li.offsetTop;
  const itemH = li.offsetHeight;
  const gap = 8;
  const block = itemH + gap;

  li.classList.add("download-item--removing");
  li.classList.add("download-item--filtered-out");
  li.setAttribute("aria-hidden", "true");
  await waitForLeavingAnimation(li);

  let nextScroll = prevScroll;
  if (itemTop < prevScroll) {
    nextScroll = Math.max(0, prevScroll - block);
  }
  li.remove();
  removeDownloadEntryFromState(n);
  const groupRoot = li.closest("li.downloads-group");
  const groupItemsList = li.parentElement;
  if (groupItemsList && !groupItemsList.querySelector("li.download-item[data-download-id]")) {
    groupRoot?.remove();
  }
  list.scrollTop = nextScroll;
  syncEmptyStateWithRenderedList();
}

async function eraseDownloadEntry(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  try {
    suppressListRebuilds();
    rememberLocallyHandledErase(n);
    await downloadsEraseCompat({ id: n });
    closeDownloadMenu();
    await removeDownloadRowAnimated(n);
  } catch (err) {
    forgetLocallyHandledErase(n);
    const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    const row = downloadsListEl?.querySelector(`li[data-download-id="${n}"]`);
    if (row) {
      setDownloadRowExtensionErrorTip(row, msg);
      const it = resolveItemForLi(row);
      if (it) await refreshListItemElement(row, it);
    }
  }
}

async function deleteDownloadedFile(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  try {
    suppressListRebuilds();
    await downloadsRemoveFileCompat(n);
    closeDownloadMenu();
    await removeDownloadRowAnimated(n);
  } catch (err) {
    const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    const row = downloadsListEl?.querySelector(`li[data-download-id="${n}"]`);
    if (row) {
      setDownloadRowExtensionErrorTip(row, msg);
      const it = resolveItemForLi(row);
      if (it) await refreshListItemElement(row, it);
    }
  }
}

function resetFiltersAfterClearAll() {
  if (searchInputEl) {
    searchInputEl.value = "";
  }
  nameSortMode = "none";
  sizeSortMode = "none";
  activeDateRange = { start: null, end: null };
  draftDateRange = { start: null, end: null };
  dateSelectionAnchor = null;
  activeTypeFilters = new Set(TYPE_FILTER_KEYS);
  dateGroupOpenState.clear();
  updateNameSortToggleUi();
  updateSizeSortToggleUi();
  updateDateFilterToggleUi();
  syncTypeFilterPopoverCheckboxes();
  updateTypeFilterToggleUi();
  renderActiveFilterChips();
  persistFiltersState();
}

async function clearAllDownloads() {
  if (clearAllConfirmEl?.dataset.busy === "true") return;
  if (clearAllConfirmEl) clearAllConfirmEl.dataset.busy = "true";
  try {
    suppressListRebuilds(2500);
    await downloadsEraseCompat({});
    closeClearAllPopover();
    closeDownloadMenu();
    resetFiltersAfterClearAll();
    allDownloads = [];
    downloads = [];
    if (downloadsListEl) downloadsListEl.scrollTop = 0;
    await resetAndRender();
  } catch {
    closeClearAllPopover();
  } finally {
    if (clearAllConfirmEl) delete clearAllConfirmEl.dataset.busy;
  }
}

async function showDownloadedFileInFolder(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  try {
    await downloadsShowCompat(n);
    closeDownloadMenu();
  } catch (err) {
    const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    const row = downloadsListEl?.querySelector(`li[data-download-id="${n}"]`);
    if (row) {
      setDownloadRowExtensionErrorTip(
        row,
        msg || i18nMessage("show_in_folder_failed") || "Could not show file in file manager."
      );
      const it = resolveItemForLi(row);
      if (it) await refreshListItemElement(row, it);
    }
  }
}

/** Requests the optional permission downloads.open (required for chrome.downloads.open in MV3). */
function ensureDownloadsOpenPermission() {
  return new Promise((resolve) => {
    if (!chrome.permissions?.contains) {
      resolve(true);
      return;
    }
    chrome.permissions.contains({ permissions: ["downloads.open"] }, (has) => {
      if (chrome.runtime.lastError) {
        resolve(true);
        return;
      }
      if (has) {
        resolve(true);
        return;
      }
      if (!chrome.permissions?.request) {
        resolve(false);
        return;
      }
      chrome.permissions.request({ permissions: ["downloads.open"] }, (granted) => {
        resolve(!!granted && !chrome.runtime.lastError);
      });
    });
  });
}

/** Opens the file in the default application; if the permission is denied — opens the folder in the file manager (downloads.show). */
async function openDownloadFile(item) {
  const id = Number(item?.id);
  if (!Number.isFinite(id)) return;

  const row = downloadsListEl?.querySelector(`li[data-download-id="${id}"]`);

  if (item.state !== "complete") {
    if (item.state === "in_progress") {
      return;
    }
    if (row) {
      setDownloadRowExtensionErrorTip(
        row,
        i18nMessage("open_interrupted_unavailable") || "Download interrupted, file cannot be opened."
      );
      await refreshListItemElement(row, item);
    }
    return;
  }

  const canOpen = await ensureDownloadsOpenPermission();
  if (!canOpen) {
    try {
      await downloadsShowCompat(id);
      if (row) {
        setDownloadRowExtensionErrorTip(
          row,
          i18nMessage("open_hint_permission_needed") ||
            "Open the file folder. To open files directly, allow extension access."
        );
        await refreshListItemElement(row, item);
      }
    } catch {
      if (row) {
        setDownloadRowExtensionErrorTip(
          row,
          i18nMessage("open_permission_downloads_required") ||
            "The extension needs the downloads.open permission."
        );
        await refreshListItemElement(row, item);
      }
    }
    return;
  }

  try {
    await downloadsOpenCompat(id);
    if (row) {
      delete row.dataset.extensionErrorTip;
      await refreshListItemElement(row, item);
    }
  } catch (err) {
    const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    try {
      await downloadsShowCompat(id);
      if (row) {
        setDownloadRowExtensionErrorTip(
          row,
          i18nMessage("open_file_fallback_folder_opened") ||
            "Could not open the file, folder opened in file manager."
        );
        await refreshListItemElement(row, item);
      }
    } catch {
      if (row) {
        setDownloadRowExtensionErrorTip(row, msg);
        await refreshListItemElement(row, item);
      }
    }
  }
}

function getFileIcon(downloadId) {
  return new Promise((resolve) => {
    chrome.downloads.getFileIcon(downloadId, { size: 32 }, (iconUrl) => {
      if (chrome.runtime.lastError || !iconUrl) {
        resolve(FALLBACK_ICON);
        return;
      }
      const normalized = String(iconUrl).trim();
      // Extension popup cannot directly load local file:// resources.
      if (!normalized || /^file:/i.test(normalized)) {
        resolve(FALLBACK_ICON);
        return;
      }
      resolve(normalized);
    });
  });
}

async function buildDownloadListItemPayload(item, li = null) {
  const iconUrl = await getFileIcon(item.id);
  const iconAttr = escapeAttr(iconUrl);
  const fileName = getFileName(item);
  const fileNameAttr = escapeAttr(fileName);
  const fileNameHtml = escapeHtmlText(fileName);
  const size = formatBytes(item.fileSize > 0 ? item.fileSize : item.totalBytes);
  const createdAt = formatRelativeTime(item.endTime || item.startTime);
  const isComplete = item.state === "complete";
  const metaText =
    item.state === "in_progress"
      ? deriveProgressMetaText(item, NaN)
      : `${size} • ${createdAt}`;
  const fileNameForAria = fileName.replace(/"/g, "'");
  const openHint =
    isComplete
      ? i18nMessage("download_item_open_file", [fileNameForAria]) || `Open file: ${fileNameForAria}`
      : item.state === "in_progress"
        ? i18nMessage("download_item_open_in_progress", [fileNameForAria]) ||
          `Download not completed: ${fileNameForAria}`
        : i18nMessage("download_item_open_interrupted", [fileNameForAria]) ||
          `Download interrupted: ${fileNameForAria}`;

  const menuId = `download-menu-${item.id}`;
  const extensionTip = Boolean(li?.dataset?.extensionErrorTip);
  const isFailed = item.state === "interrupted" || Boolean(item.error) || extensionTip;
  const errorTooltip = getErrorTooltipForRow(item, li);
  const statusBlockHtml = isFailed
    ? `<span class="download-item__status-wrap"><span class="download-item__error-hint" role="img" aria-label="${escapeAttr(
        errorTooltip
      )}">${SVG_ERROR_ICON}</span></span>`
    : `<span class="download-item__status-wrap">${SVG_PENDING_ICON}</span>`;
  const hideDeleteInMenu =
    !isComplete && (item.state === "interrupted" || Boolean(item.error));
  const retryLabel = escapeHtmlText(i18nMessage("menu_retry_download") || "Retry download");
  const menuRetryRow = hideDeleteInMenu
    ? `<li role="presentation">
            <button type="button" role="menuitem" class="download-item__menu-item" data-action="retry">${retryLabel}</button>
          </li>`
    : "";
  const showDeleteFileInMenu = isComplete;
  const showRemoveFromListInMenu = !isComplete;
  const menuRemoveRow = showRemoveFromListInMenu
    ? `
          <li role="presentation">
            <button type="button" role="menuitem" class="download-item__menu-item" data-action="erase">${escapeHtmlText(i18nMessage("menu_remove_from_list") || "Remove from list")}</button>
          </li>`
    : "";
  const menuDeleteRow = showDeleteFileInMenu
    ? `
          <li role="presentation">
            <button type="button" role="menuitem" class="download-item__menu-item download-item__menu-item--danger" data-action="delete-file">${escapeHtmlText(i18nMessage("menu_delete_file") || "Delete file")}</button>
          </li>`
    : "";
  const showInFolderLabel = escapeHtmlText(
    i18nMessage("menu_show_in_folder") || "Show in Explorer"
  );
  const menuShowInFolderRow = isComplete
    ? `
          <li role="presentation">
            <button type="button" role="menuitem" class="download-item__menu-item" data-action="show-in-folder">${showInFolderLabel}</button>
          </li>`
    : "";
  const showProgressControls = item.state === "in_progress";
  const pauseLabelPause = i18nMessage("btn_pause_download") || "Pause download";
  const pauseLabelResume = i18nMessage("btn_resume_download") || "Resume download";
  const fileActionsLabel =
    escapeAttr(i18nMessage("download_item_actions") || "File actions");
  const pauseResumeHtml = showProgressControls
    ? `<button type="button" class="download-item__pause-btn" data-dl-action="pause-resume" data-paused="${
        item.paused ? "1" : "0"
      }" aria-label="${escapeAttr(item.paused ? pauseLabelResume : pauseLabelPause)}">${
        item.paused ? SVG_RESUME : SVG_PAUSE
      }</button>`
    : "";
  const menuHtml = `
        <button type="button" class="download-item__menu-btn" aria-label="${fileActionsLabel}" aria-expanded="false" aria-haspopup="true" aria-controls="${menuId}">
          ${SVG_DOTS_VERTICAL}
        </button>
        <ul class="download-item__menu" id="${menuId}" role="menu" hidden>
          ${menuRetryRow}
          ${menuRemoveRow}${menuShowInFolderRow}${menuDeleteRow}
        </ul>`;
  const showStatusSlot =
    (!isComplete || extensionTip) && (item.state !== "in_progress" || isFailed);
  const useWideActions = showStatusSlot || showProgressControls;
  const actionsInner = `${showStatusSlot ? statusBlockHtml : ""}${pauseResumeHtml}${menuHtml}`;
  const actionsHtml = useWideActions
    ? `<div class="download-item__actions download-item__actions--with-status">${actionsInner}</div>`
    : `<div class="download-item__actions">${menuHtml}</div>`;

  const innerHtml = `
      <img class="download-item__icon" src="${iconAttr}" alt="" draggable="false" />
      <div class="download-item__body" role="button" tabindex="0" aria-label="${escapeAttr(openHint)}">
        <div class="download-item__content">
          <p class="download-item__title" title="${fileNameAttr}">${fileNameHtml}</p>
          <div class="download-item__meta">${escapeHtmlText(metaText)}</div>
        </div>
      </div>
      ${actionsHtml}`;

  return {
    innerHtml,
    className: isComplete ? "download-item download-item--complete" : "download-item download-item--incomplete",
    ariaLabel: openHint
  };
}

function wireDownloadListItem(li) {
  const iconEl = li.querySelector(".download-item__icon");
  if (iconEl) {
    iconEl.addEventListener("error", () => {
      if (iconEl.src === FALLBACK_ICON) return;
      iconEl.src = FALLBACK_ICON;
    });
  }

  const bodyEl = li.querySelector(".download-item__body");
  if (bodyEl) {
    bodyEl.addEventListener("click", (e) => {
      e.preventDefault();
      const it = resolveItemForLi(li);
      if (it) void openDownloadFile(it);
    });
    bodyEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const it = resolveItemForLi(li);
      if (it) void openDownloadFile(it);
    });
  }

  const menuBtn = li.querySelector(".download-item__menu-btn");
  const menu = li.querySelector(".download-item__menu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDownloadMenu(menu, menuBtn);
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    menu.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute("data-action");
        const it = resolveItemForLi(li);
        const id = Number(li.dataset.downloadId);
        if (action === "erase") void eraseDownloadEntry(id);
        else if (action === "delete-file") void deleteDownloadedFile(id);
        else if (action === "show-in-folder") void showDownloadedFileInFolder(id);
        else if (action === "retry" && it) void retryFailedDownload(it, li);
      });
    });
  }

  const errHint = li.querySelector(".download-item__error-hint");
  if (errHint) {
    errHint.addEventListener("mouseenter", () => {
      const it = resolveItemForLi(li);
      showErrorFloatTip(errHint, getErrorTooltipForRow(it || {}, li));
    });
    errHint.addEventListener("mouseleave", hideErrorFloatTip);
  }

  const pauseBtn = li.querySelector("[data-dl-action='pause-resume']");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(li.dataset.downloadId);
      if (!Number.isFinite(id) || pauseBtn.dataset.pauseBusy === "1") return;
      const wantResume = pauseBtn.dataset.paused === "1";
      pauseBtn.dataset.pauseBusy = "1";
      void (async () => {
        try {
          const rows = await searchDownloadById(id);
          const cur = rows[0];
          if (!cur || cur.state !== "in_progress") {
            if (cur) {
              patchAllDownloadsEntry(cur);
              await refreshListItemElement(li, cur);
            }
            return;
          }
          if (wantResume) {
            if (!cur.paused) {
              updatePauseResumeButton(li, cur);
              return;
            }
            await retryFailedDownload(cur, li);
          } else {
            if (cur.paused) {
              updatePauseResumeButton(li, cur);
              return;
            }
            await downloadsPauseCompat(id);
            await refreshListAfterSameIdResume(id, li);
          }
        } catch (err) {
          const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
          setDownloadRowExtensionErrorTip(li, msg);
          try {
            const rows = await searchDownloadById(id);
            const cur = rows[0];
            if (cur) await refreshListItemElement(li, cur);
            else {
              const stale = resolveItemForLi(li);
              if (stale) await refreshListItemElement(li, stale);
            }
          } catch {
            const stale = resolveItemForLi(li);
            if (stale) await refreshListItemElement(li, stale);
          }
        } finally {
          delete pauseBtn.dataset.pauseBusy;
        }
      })();
    });
  }
}

function clearResumeFailureWatch(li) {
  if (!li) return;
  if (li._resumeFailListener) {
    chrome.downloads.onChanged.removeListener(li._resumeFailListener);
    li._resumeFailListener = null;
  }
  if (li._resumeFailTimer != null) {
    window.clearTimeout(li._resumeFailTimer);
    li._resumeFailTimer = null;
  }
}

function attachResumeFailureAutoRetryWatch(oldId, li) {
  clearResumeFailureWatch(li);
  const listener = (delta) => {
    if (delta.id !== oldId) return;
    const st = delta.state?.current;
    const errCur = delta.error?.current;
    if (st === "complete") {
      clearResumeFailureWatch(li);
      return;
    }
    if (st === "interrupted" || errCur) {
      clearResumeFailureWatch(li);
      void (async () => {
        try {
          const rows = await searchDownloadById(oldId);
          const it = rows[0];
          if (it) await restartDownloadWithNewRequest(it, li, oldId);
        } catch {
          /* ignore */
        }
      })();
    }
  };
  li._resumeFailListener = listener;
  chrome.downloads.onChanged.addListener(listener);
  li._resumeFailTimer = window.setTimeout(() => clearResumeFailureWatch(li), RESUME_FAIL_WATCH_MS);
}

async function refreshListItemElement(li, item) {
  hideErrorFloatTip();
  closeDownloadMenu();
  if (li._retryListener) {
    chrome.downloads.onChanged.removeListener(li._retryListener);
    li._retryListener = null;
  }
  clearResumeFailureWatch(li);
  if (item.state === "complete") {
    delete li.dataset.extensionErrorTip;
  }
  const payload = await buildDownloadListItemPayload(item, li);
  li.className = payload.className;
  li.dataset.downloadId = String(item.id);
  updateDownloadRowSearchIndex(li, item);
  li.setAttribute("aria-label", payload.ariaLabel);
  li.innerHTML = payload.innerHtml;
  wireDownloadListItem(li);
  applyDownloadProgressVisual(li, item);
  scheduleRenderedSearchVisibility();
}

async function finishRetryRow(li, downloadId) {
  delete li.dataset.retryBusy;
  try {
    await pullAllDownloadsFromChrome();
  } catch {
    loadDownloads();
    return;
  }
  const n = Number(downloadId);
  const fresh = allDownloads.find((d) => d.id === n);
  if (!fresh) {
    await refreshDownloadsDataAfterMutation();
    return;
  }
  await refreshListItemElement(li, fresh);
}

async function refreshListAfterSameIdResume(oldId, li) {
  try {
    await pullAllDownloadsFromChrome();
  } catch {
    loadDownloads();
    return;
  }
  const fresh = allDownloads.find((d) => d.id === oldId);
  if (fresh) await refreshListItemElement(li, fresh);
  else await refreshDownloadsDataAfterMutation();
}

/**
 * Restarts the download with a new request (downloads.download); the old record is erased — same as Retry.
 */
async function restartDownloadWithNewRequest(item, li, oldId) {
  const built = buildRetryDownloadOptions(item);
  if (!built.ok) {
    setDownloadRowExtensionErrorTip(li, built.message);
    await refreshListItemElement(li, item);
    return;
  }
  if (li.dataset.retryBusy === "1") return;
  li.dataset.retryBusy = "1";

  closeDownloadMenu();
  hideErrorFloatTip();

  const statusWrap = li.querySelector(".download-item__status-wrap");
  if (statusWrap) {
    statusWrap.innerHTML = `<span class="download-item__pending-in-retry" aria-hidden="true">${SVG_PENDING_ICON}</span>`;
  }

  let newId;
  try {
    newId = await downloadsDownloadCompat(built.options);
  } catch (err) {
    const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    const baseUrl = built.retryBaseUrl;
    if (baseUrl && isDownloadsApiInvocationErrorMessage(msg)) {
      try {
        newId = await downloadsDownloadCompat({
          url: baseUrl,
          saveAs: false,
          conflictAction: "uniquify"
        });
      } catch (err2) {
        delete li.dataset.retryBusy;
        try {
          await pullAllDownloadsFromChrome();
        } catch {
          /* ignore */
        }
        const freshOld = allDownloads.find((d) => d.id === oldId);
        const msg2 =
          err2 && typeof err2 === "object" && "message" in err2 ? String(err2.message) : String(err2);
        setDownloadRowExtensionErrorTip(li, msg2);
        await refreshListItemElement(li, freshOld || item);
        return;
      }
    } else {
      delete li.dataset.retryBusy;
      try {
        await pullAllDownloadsFromChrome();
      } catch {
        /* ignore */
      }
      const freshOld = allDownloads.find((d) => d.id === oldId);
      setDownloadRowExtensionErrorTip(li, msg);
      await refreshListItemElement(li, freshOld || item);
      return;
    }
  }

  try {
    await downloadsEraseCompat({ id: oldId });
  } catch {
    /* ignore */
  }

  li.dataset.downloadId = String(newId);

  let finished = false;
  const tryFinish = () => {
    if (finished) return;
    finished = true;
    if (li._retryListener) {
      chrome.downloads.onChanged.removeListener(li._retryListener);
      li._retryListener = null;
    }
    void finishRetryRow(li, newId);
  };

  const settleListener = (delta) => {
    if (delta.id !== newId) return;
    const st = delta.state?.current;
    if (st === "complete" || st === "interrupted") {
      tryFinish();
      return;
    }
    if (delta.error?.current) {
      tryFinish();
    }
  };
  li._retryListener = settleListener;
  chrome.downloads.onChanged.addListener(settleListener);

  try {
    await pullAllDownloadsFromChrome();
    const cur = allDownloads.find((d) => d.id === newId);
    if (cur) await refreshListItemElement(li, cur);
  } catch {
    /* ignore */
  }

  chrome.downloads.search({ id: newId }, (rows) => {
    const cur = rows && rows[0];
    if (!cur) return;
    if (cur.state === "complete" || cur.state === "interrupted" || cur.error) {
      tryFinish();
    }
  });
}

/**
 * Retry in the menu and the Resume button: when canResume is true — continue the same download; otherwise issue a new request (downloads.download).
 */
async function retryFailedDownload(item, li) {
  const oldId = Number(item?.id);
  if (!Number.isFinite(oldId)) {
    setDownloadRowExtensionErrorTip(li, i18nMessage("retry_no_url") || "No address to download again.");
    await refreshListItemElement(li, item);
    return;
  }
  if (item.canResume === true) {
    try {
      await downloadsResumeCompat(oldId);
      await refreshListAfterSameIdResume(oldId, li);
      const rows = await searchDownloadById(oldId);
      const after = rows[0];
      if (!after) {
        await restartDownloadWithNewRequest(item, li, oldId);
        return;
      }
      if (after.state === "interrupted" || Boolean(after.error)) {
        await restartDownloadWithNewRequest(after, li, oldId);
        return;
      }
      attachResumeFailureAutoRetryWatch(oldId, li);
      return;
    } catch {
      /* Fall through to restartDownloadWithNewRequest. */
    }
  }
  await restartDownloadWithNewRequest(item, li, oldId);
}

function wireGroupDetails(detailsEl, groupKey) {
  detailsEl.addEventListener("toggle", () => {
    dateGroupOpenState.set(groupKey, detailsEl.open);
  });
}

async function buildDownloadListItemElement(item) {
  const li = document.createElement("li");
  const payload = await buildDownloadListItemPayload(item);
  li.className = payload.className;
  li.dataset.downloadId = String(item.id);
  updateDownloadRowSearchIndex(li, item);
  li.setAttribute("role", "group");
  li.setAttribute("aria-label", payload.ariaLabel);
  li.innerHTML = payload.innerHtml;
  wireDownloadListItem(li);
  applyDownloadProgressVisual(li, item);
  return li;
}

async function renderGroupedDownloads(pinnedItemEl = null) {
  const groups = groupDownloadsByDate(downloads);
  /*
   * We build the entire list tree off-screen in a DocumentFragment and insert
   * it into the DOM in a single assignment — otherwise every appendChild
   * inside the loop triggers a reflow, and the list "jumps" while the popup
   * is loading.
   * File icons are fetched in parallel via Promise.all so we don't have to
   * wait for each record one by one: previously the longest delay accumulated.
   */
  const groupBuilds = groups.map(async (group, groupIndex) => {
    const groupLabel = getGroupLabel(group);
    const groupLi = document.createElement("li");
    groupLi.className = "downloads-group";

    const details = document.createElement("details");
    details.className = "downloads-group__details";
    details.dataset.groupKey = group.key;
    details.open = getGroupOpenState(group.key);
    wireGroupDetails(details, group.key);

    const summary = document.createElement("summary");
    summary.className = "downloads-group__summary";
    summary.innerHTML = `<span class="downloads-group__label">${escapeHtmlText(groupLabel)}</span>`;
    if (groupIndex === 0) {
      summary.appendChild(createClearAllToggleButton());
    }

    const groupItemsList = document.createElement("ul");
    groupItemsList.className = "downloads-group__items";
    groupItemsList.setAttribute("aria-label", groupLabel);

    if (
      groupIndex === 0 &&
      pinnedItemEl &&
      pinnedTileEligibleForDisplay &&
      !pinnedTileDismissed &&
      !pinnedTilePermanentlyHidden
    ) {
      pinnedItemEl.hidden = false;
      groupItemsList.appendChild(pinnedItemEl);
    }

    const itemEls = await Promise.all(group.items.map((it) => buildDownloadListItemElement(it)));
    for (const itemEl of itemEls) {
      groupItemsList.appendChild(itemEl);
    }

    details.append(summary, groupItemsList);
    groupLi.appendChild(details);
    return groupLi;
  });

  const groupLis = await Promise.all(groupBuilds);
  const fragment = document.createDocumentFragment();
  for (const groupLi of groupLis) {
    fragment.appendChild(groupLi);
  }
  downloadsListEl.appendChild(fragment);
}

async function resetAndRender() {
  hideErrorFloatTip();
  captureGroupOpenStateFromDom();
  const previousRowPositions = captureRenderedDownloadRowPositions();
  applySearchFilter();
  const pinnedItemEl = downloadsListEl.querySelector("#pinned-static-item") || pinnedStaticItemEl;
  downloadsListEl.innerHTML = "";

  if (downloads.length === 0) {
    if (
      pinnedItemEl &&
      pinnedTileEligibleForDisplay &&
      !pinnedTileDismissed &&
      !pinnedTilePermanentlyHidden
    ) {
      pinnedItemEl.hidden = true;
      downloadsListEl.appendChild(pinnedItemEl);
    }
    hideMessage();
    showEmptyState();
    return;
  }

  hideMessage();
  hideEmptyState();
  await renderGroupedDownloads(pinnedItemEl);
  animateRenderedDownloadLayout(previousRowPositions);
  scheduleRenderedSearchVisibility();
  hasRenderedOnce = true;
}

function dismissPinnedTile() {
  pinnedTileDismissed = true;
  storageSetPinnedTileDismissed(true);
  if (pinnedStaticItemEl) {
    pinnedStaticItemEl.remove();
  }
  scheduleRenderedSearchVisibility();
}

function permanentlyHidePinnedTile() {
  pinnedTilePermanentlyHidden = true;
  pinnedTileDismissed = false;
  storageSetPinnedTilePermanentlyHidden(true);
  storageSetPinnedTileDismissed(false);
  if (pinnedStaticItemEl) {
    pinnedStaticItemEl.remove();
  }
  scheduleRenderedSearchVisibility();
}

async function showPinnedTileFromBackground() {
  if (!pinnedTileEligibleForDisplay) return;
  if (pinnedTilePermanentlyHidden) return;
  if (!pinnedTileDismissed) return;
  pinnedTileDismissed = false;
  await resetAndRender();
}

function onListScroll() {
  if (scrollRaf !== null) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null;
    closeDownloadMenu();
    closeFiltersMenu();
    closeDateFilterPopover();
    closeTypeFilterPopover();
    closeClearAllPopover();
    hideErrorFloatTip();
  });
}

function loadDownloads() {
  hideMessage();
  void fetchLatestDownloads()
    .then(async (items) => {
      allDownloads = items || [];
      await resetAndRender();
    })
    .catch(() => {
      hideMessage();
    });
}

function initPopup() {
  if (!downloadsListEl) return;
  ensureDownloadProgressPoll();
  storageGetFilters((storedFilters) => {
    restoreFiltersState(storedFilters);
    localizeStaticText();
    updateNameSortToggleUi();
    updateSizeSortToggleUi();
    updateDateFilterToggleUi();
    updateTypeFilterToggleUi();
    renderActiveFilterChips();
    storageGetPinnedTileEligibleForDisplay((eligibleForDisplay) => {
      pinnedTileEligibleForDisplay = eligibleForDisplay;
      storageGetPinnedTilePermanentlyHidden((permanentlyHidden) => {
        pinnedTilePermanentlyHidden = permanentlyHidden;
        storageGetPinnedTileDismissed((dismissed) => {
          pinnedTileDismissed = permanentlyHidden || !eligibleForDisplay ? false : dismissed;
          loadDownloads();
        });
      });
    });
  });

  if (chrome.downloads?.onChanged) {
    chrome.downloads.onChanged.addListener(handleDownloadsOnChanged);
  }
  if (chrome.downloads?.onCreated) {
    chrome.downloads.onCreated.addListener(handleDownloadsOnCreated);
  }
  if (chrome.downloads?.onErased) {
    chrome.downloads.onErased.addListener(handleDownloadsOnErased);
  }
  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "downloads-updated") {
        if (getListRebuildSuppressionDelay() > 0) return;
        scheduleListRebuild();
      } else if (message.type === "pinned-tile-show") {
        void showPinnedTileFromBackground();
      }
    });
  }

  downloadsListEl.addEventListener("scroll", onListScroll, { passive: true });

  if (searchInputEl) {
    searchInputEl.addEventListener("input", () => {
      applySearchFilter();
      scheduleRenderedSearchVisibility();
    });
  }
  if (pinnedItemDismissBtnEl) {
    pinnedItemDismissBtnEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissPinnedTile();
    });
  }
  if (pinnedRatingEl) {
    pinnedRatingEl.addEventListener("click", (e) => {
      const starEl = e.target?.closest?.(".pinned-rating__star");
      if (!starEl) return;
      e.preventDefault();
      e.stopPropagation();
      activatePinnedRatingStar(starEl);
    });
    pinnedRatingEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const starEl = e.target?.closest?.(".pinned-rating__star");
      if (!starEl) return;
      e.preventDefault();
      e.stopPropagation();
      activatePinnedRatingStar(starEl);
    });
  }

  if (filtersToggleEl && filtersMenuEl) {
    filtersToggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFiltersMenu(filtersMenuEl, filtersToggleEl);
    });
  }
  if (nameSortToggleEl) {
    nameSortToggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleNameSortMode();
    });
  }
  if (sizeSortToggleEl) {
    sizeSortToggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSizeSortMode();
    });
  }
  if (dateFilterToggleEl) {
    dateFilterToggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDateFilterPopover();
    });
  }
  if (typeFilterToggleEl) {
    typeFilterToggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTypeFilterPopover();
    });
  }
  if (datePresetTodayEl) {
    datePresetTodayEl.addEventListener("click", (e) => {
      e.preventDefault();
      setPresetToday();
    });
  }
  if (datePresetWeekEl) {
    datePresetWeekEl.addEventListener("click", (e) => {
      e.preventDefault();
      setPresetWeek();
    });
  }
  if (datePresetMonthEl) {
    datePresetMonthEl.addEventListener("click", (e) => {
      e.preventDefault();
      setPresetMonth();
    });
  }
  if (dateCalendarPrevEl) {
    dateCalendarPrevEl.addEventListener("click", (e) => {
      e.preventDefault();
      dateCalendarViewMonth = shiftMonth(dateCalendarViewMonth, -1);
      renderDateCalendar();
    });
  }
  if (dateCalendarNextEl) {
    dateCalendarNextEl.addEventListener("click", (e) => {
      e.preventDefault();
      dateCalendarViewMonth = shiftMonth(dateCalendarViewMonth, 1);
      renderDateCalendar();
    });
  }
  if (dateFilterCancelEl) {
    dateFilterCancelEl.addEventListener("click", (e) => {
      e.preventDefault();
      resetDateFilter();
    });
  }
  if (dateFilterApplyEl) {
    dateFilterApplyEl.addEventListener("click", (e) => {
      e.preventDefault();
      applyDateFilterFromDraft();
    });
  }
  if (typeFilterAllEl) {
    typeFilterAllEl.addEventListener("change", (e) => {
      toggleAllTypeFilters(!!e.target.checked);
    });
  }
  if (typeFilterImagesEl) {
    typeFilterImagesEl.addEventListener("change", (e) => {
      applyTypeFilterSelection("images", !!e.target.checked);
    });
  }
  if (typeFilterVideoEl) {
    typeFilterVideoEl.addEventListener("change", (e) => {
      applyTypeFilterSelection("video", !!e.target.checked);
    });
  }
  if (typeFilterArchivesEl) {
    typeFilterArchivesEl.addEventListener("change", (e) => {
      applyTypeFilterSelection("archives", !!e.target.checked);
    });
  }
  if (typeFilterProgramsEl) {
    typeFilterProgramsEl.addEventListener("change", (e) => {
      applyTypeFilterSelection("programs", !!e.target.checked);
    });
  }
  if (typeFilterDocumentsEl) {
    typeFilterDocumentsEl.addEventListener("change", (e) => {
      applyTypeFilterSelection("documents", !!e.target.checked);
    });
  }
  if (typeFilterCloseEl) {
    typeFilterCloseEl.addEventListener("click", (e) => {
      e.preventDefault();
      closeTypeFilterPopover();
    });
  }
  window.addEventListener("resize", () => {
    if (openDateFilterCtx) {
      positionDateFilterPopover();
    }
    if (openTypeFilterCtx) {
      positionTypeFilterPopover();
    }
    if (openClearAllCtx) {
      positionClearAllPopover();
    }
  });

  if (themeToggleEl) {
    themeToggleEl.addEventListener("click", () => {
      const next = cycleTheme(document.documentElement.dataset.theme || "system");
      applyTheme(next);
      storageSetTheme(next);
    });
  }
  if (notificationsToggleEl) {
    notificationsToggleEl.addEventListener("click", () => {
      const currentlyEnabled = !notificationsToggleEl.classList.contains("notifications-toggle--slashed");
      const nextEnabled = !currentlyEnabled;
      applyNotificationsToggleState(nextEnabled, !nextEnabled);
      storageSetNotificationsEnabled(nextEnabled);
    });
  }
  if (clearAllConfirmEl) {
    clearAllConfirmEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void clearAllDownloads();
    });
  }

  storageGetTheme("system", (r) => {
    applyTheme(r[THEME_STORAGE_KEY]);
    chrome.runtime?.sendMessage?.({ type: "downloads-check-updates" }, () => {
      void chrome.runtime?.lastError;
    });
  });
  storageGetNotificationsEnabled((enabled) => {
    applyNotificationsToggleState(enabled, false);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPopup);
} else {
  initPopup();
}
