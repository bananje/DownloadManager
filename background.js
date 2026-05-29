const DOWNLOADS_LIMIT = 200;
const DOWNLOADS_SYNC_ALARM = "downloads-sync-alarm";
const PINNED_TILE_RESHOW_ALARM = "pinned-tile-reshow-alarm";
const DOWNLOADS_SYNC_INTERVAL_MIN = 0.5;
const DOWNLOAD_TOAST_LIFETIME_MS = 6500;
const THEME_STORAGE_KEY = "themePreference";
const NOTIFICATIONS_ENABLED_STORAGE_KEY = "notificationsEnabled";
const PINNED_TILE_DISMISSED_STORAGE_KEY = "pinnedTileDismissed";
const PINNED_TILE_DISMISSED_AT_STORAGE_KEY = "pinnedTileDismissedAt";
const PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY = "pinnedTilePermanentlyHidden";
const PINNED_TILE_INSTALLED_AT_STORAGE_KEY = "pinnedTileInstalledAt";
const PINNED_TILE_FIRST_SHOW_DELAY_MS = 2 * 24 * 60 * 60 * 1000;
const PINNED_TILE_RESHOW_DELAY_MS = 2 * 24 * 60 * 60 * 1000;
const ALLOWED_THEMES = ["system", "light", "dark"];

/**
 * `chrome.runtime.setUninstallURL()` only accepts http(s) URLs. Extension
 * pages can be opened on install, but not after Chrome has removed the
 * extension during uninstall.
 */
const UNINSTALL_FEEDBACK_FALLBACK_URL = "https://example.com/uninstall.html";

const SILENCED_REJECTION_MESSAGES = [
  "No SW",
  "Could not establish connection",
  "Receiving end does not exist",
  "The message port closed before a response was received",
  "Extension context invalidated"
];

try {
  self.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const message =
      (reason && typeof reason === "object" && "message" in reason ? String(reason.message) : String(reason || "")) ||
      "";
    if (SILENCED_REJECTION_MESSAGES.some((needle) => message.includes(needle))) {
      event.preventDefault();
    }
  });
} catch {
  /* non-SW environments */
}

let lastFingerprint = "";
let downloadsSyncChain = Promise.resolve();

function safeRuntimeSendMessage(message) {
  try {
    if (!chrome.runtime?.sendMessage) return;
    const ret = chrome.runtime.sendMessage(message);
    if (ret && typeof ret.then === "function") {
      ret.then(
        () => {
          void chrome.runtime.lastError;
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } else {
      void chrome.runtime.lastError;
    }
  } catch {
    /* ignore sendMessage transport errors (no receiver / no SW races) */
  }
}

function searchDownloads() {
  return new Promise((resolve, reject) => {
    chrome.downloads.search({ orderBy: ["-startTime"], limit: DOWNLOADS_LIMIT }, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items || []);
    });
  });
}

function getDownloadById(downloadId) {
  return new Promise((resolve) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(Array.isArray(items) && items.length > 0 ? items[0] : null);
    });
  });
}

function storageLocalGet(defaults) {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve(defaults);
      return;
    }
    chrome.storage.local.get(defaults, (result) => {
      if (chrome.runtime.lastError) {
        resolve(defaults);
        return;
      }
      resolve(result || defaults);
    });
  });
}

function storageLocalSet(payload) {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve(false);
      return;
    }
    chrome.storage.local.set(payload, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function i18nMessage(key, substitutions) {
  try {
    if (chrome.i18n?.getMessage) {
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

function getFileName(item) {
  const path = item?.filename ? String(item.filename) : "";
  if (path) {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || "";
  }
  const finalUrl = item?.finalUrl ? String(item.finalUrl) : "";
  if (finalUrl) {
    try {
      const parsed = new URL(finalUrl);
      const fromUrl = parsed.pathname.split("/").pop();
      if (fromUrl) return fromUrl;
    } catch {
      /* ignore invalid URL */
    }
  }
  return "";
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

function getDownloadSizeLabel(item) {
  const candidates = [Number(item?.fileSize), Number(item?.totalBytes), Number(item?.bytesReceived)];
  for (const value of candidates) {
    if (Number.isFinite(value) && value >= 0) {
      return formatBytes(value);
    }
  }
  return i18nMessage("unknown_file_size") || "Unknown size";
}

function getDownloadEventTimeMs(item, state) {
  const preferredRaw = state === "complete" ? item?.endTime || item?.startTime : item?.endTime;
  const parsed = preferredRaw ? Date.parse(String(preferredRaw)) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function buildDownloadToast(item, state, theme) {
  const eventTimeMs = getDownloadEventTimeMs(item, state);
  const downloadId = Number(item?.id);
  const fileName = getFileName(item) || i18nMessage("untitled_file") || "Untitled";
  const status = state === "complete" ? "success" : "error";
  const normalizedTheme = ALLOWED_THEMES.includes(theme) ? theme : "system";

  return {
    id: `${Number.isFinite(downloadId) ? downloadId : "unknown"}:${status}:${eventTimeMs}`,
    downloadId: Number.isFinite(downloadId) ? downloadId : null,
    status,
    title:
      status === "success"
        ? i18nMessage("download_notification_title") || "Download complete"
        : i18nMessage("download_failed_notification_title") || "Download failed",
    fileName,
    sizeLabel: getDownloadSizeLabel(item),
    eventTimeMs,
    expiresAtMs: Date.now() + DOWNLOAD_TOAST_LIFETIME_MS,
    theme: normalizedTheme
  };
}

async function getCurrentThemePreference() {
  const defaults = { [THEME_STORAGE_KEY]: "system" };
  const result = await storageLocalGet(defaults);
  const value = result?.[THEME_STORAGE_KEY];
  return ALLOWED_THEMES.includes(value) ? value : "system";
}

async function areNotificationsEnabled() {
  const defaults = { [NOTIFICATIONS_ENABLED_STORAGE_KEY]: true };
  const result = await storageLocalGet(defaults);
  return result?.[NOTIFICATIONS_ENABLED_STORAGE_KEY] !== false;
}

async function isPinnedTileDismissed() {
  const defaults = { [PINNED_TILE_DISMISSED_STORAGE_KEY]: false };
  const result = await storageLocalGet(defaults);
  return result?.[PINNED_TILE_DISMISSED_STORAGE_KEY] === true;
}

async function getPinnedTileDismissedAt() {
  const defaults = { [PINNED_TILE_DISMISSED_AT_STORAGE_KEY]: 0 };
  const result = await storageLocalGet(defaults);
  const value = Number(result?.[PINNED_TILE_DISMISSED_AT_STORAGE_KEY]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function isPinnedTilePermanentlyHidden() {
  const defaults = { [PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY]: false };
  const result = await storageLocalGet(defaults);
  return result?.[PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY] === true;
}

async function ensurePinnedTileInstalledAt() {
  const defaults = { [PINNED_TILE_INSTALLED_AT_STORAGE_KEY]: 0 };
  const result = await storageLocalGet(defaults);
  const value = Number(result?.[PINNED_TILE_INSTALLED_AT_STORAGE_KEY]);
  if (Number.isFinite(value) && value > 0) return value;
  const now = Date.now();
  await storageLocalSet({ [PINNED_TILE_INSTALLED_AT_STORAGE_KEY]: now });
  return now;
}

async function isPinnedTileEligibleForDisplay() {
  const installedAt = await ensurePinnedTileInstalledAt();
  return Date.now() - installedAt >= PINNED_TILE_FIRST_SHOW_DELAY_MS;
}

async function showPinnedTileIfPreviouslyDismissed() {
  if (await isPinnedTilePermanentlyHidden()) return false;
  if (!(await isPinnedTileEligibleForDisplay())) return false;
  if (!(await isPinnedTileDismissed())) return false;
  const dismissedAt = (await getPinnedTileDismissedAt()) || Date.now();
  if (Date.now() - dismissedAt < PINNED_TILE_RESHOW_DELAY_MS) return false;
  const ok = await storageLocalSet({
    [PINNED_TILE_DISMISSED_STORAGE_KEY]: false,
    [PINNED_TILE_DISMISSED_AT_STORAGE_KEY]: 0
  });
  if (!ok) return false;
  safeRuntimeSendMessage({ type: "pinned-tile-show" });
  return true;
}

function stopPinnedTileReshowAlarm() {
  try {
    chrome.alarms?.clear?.(PINNED_TILE_RESHOW_ALARM);
  } catch {
    /* ignore alarm API failures */
  }
}

async function ensurePinnedTileReshowAlarm() {
  if (await isPinnedTilePermanentlyHidden()) {
    stopPinnedTileReshowAlarm();
    return;
  }
  if (!(await isPinnedTileDismissed())) {
    stopPinnedTileReshowAlarm();
    return;
  }
  const dismissedAt = (await getPinnedTileDismissedAt()) || Date.now();
  const remainingMs = dismissedAt + PINNED_TILE_RESHOW_DELAY_MS - Date.now();
  if (remainingMs <= 0) {
    const shown = await showPinnedTileIfPreviouslyDismissed();
    if (shown) stopPinnedTileReshowAlarm();
    return;
  }
  try {
    chrome.alarms?.create?.(PINNED_TILE_RESHOW_ALARM, {
      delayInMinutes: Math.max(1, Math.ceil(remainingMs / 60000))
    });
  } catch {
    /* ignore alarm API failures */
  }
}

function queryActiveTab() {
  return new Promise((resolve) => {
    if (!chrome.tabs?.query) {
      resolve(null);
      return;
    }
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(Array.isArray(tabs) && tabs.length > 0 ? tabs[0] : null);
    });
  });
}

function sendToastToTab(tabId, toast) {
  return new Promise((resolve, reject) => {
    try {
      const ret = chrome.tabs.sendMessage(
        tabId,
        { type: "page-download-toast-show", toast },
        () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || "sendMessage failed"));
            return;
          }
          resolve();
        }
      );
      if (ret && typeof ret.then === "function") {
        ret.catch(() => {
          /* already handled via callback/lastError */
        });
      }
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function executeScriptInTab(tabId, files) {
  return new Promise((resolve, reject) => {
    if (!chrome.scripting?.executeScript) {
      reject(new Error("scripting.executeScript is unavailable"));
      return;
    }
    try {
      const ret = chrome.scripting.executeScript({ target: { tabId }, files }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "executeScript failed"));
          return;
        }
        resolve();
      });
      if (ret && typeof ret.then === "function") {
        ret.catch(() => {
          /* already handled via callback/lastError */
        });
      }
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

async function showToastInActivePage(toast) {
  const tab = await queryActiveTab();
  const tabId = Number(tab?.id);
  if (!Number.isFinite(tabId)) return;
  try {
    await sendToastToTab(tabId, toast);
  } catch {
    try {
      await executeScriptInTab(tabId, ["page-download-toast.js"]);
      await sendToastToTab(tabId, toast);
    } catch {
      /* ignore tabs/pages where content scripts cannot run */
    }
  }
}

function openDownloadedFile(downloadId) {
  const normalizedId = Number(downloadId);
  if (!Number.isFinite(normalizedId)) {
    return Promise.resolve({ ok: false, error: "Invalid download id" });
  }

  let openInvocation;
  try {
    openInvocation = chrome.downloads.open(normalizedId);
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
    return Promise.resolve({ ok: false, error: message || "Could not open downloaded file" });
  }

  if (openInvocation && typeof openInvocation.then === "function") {
    return openInvocation
      .then(() => ({ ok: true, opened: "file" }))
      .catch((error) => {
        const message =
          error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
        return { ok: false, error: message || "Could not open downloaded file" };
      });
  }

  const lastError = chrome.runtime?.lastError;
  if (lastError) {
    return Promise.resolve({ ok: false, error: lastError.message || "Could not open downloaded file" });
  }
  return Promise.resolve({ ok: true, opened: "file" });
}

function disableBrowserDownloadsUi() {
  try {
    if (chrome.downloads?.setUiOptions) {
      const ret = chrome.downloads.setUiOptions({ enabled: false });
      if (ret && typeof ret.then === "function") {
        ret.catch(() => {
          /* ignore unsupported browser/runtime failures */
        });
      }
      return;
    }

    if (chrome.downloads?.setShelfEnabled) {
      chrome.downloads.setShelfEnabled(false);
    }
  } catch {
    /* ignore unsupported browser/runtime failures */
  }
}

async function handleDownloadChanged(delta) {
  const state = delta?.state?.current;
  if (state !== "complete" && state !== "interrupted") return;

  if (!(await areNotificationsEnabled())) return;

  const downloadId = Number(delta?.id);
  const item = Number.isFinite(downloadId) ? await getDownloadById(downloadId) : null;
  const theme = await getCurrentThemePreference();
  const toast = buildDownloadToast(item, state, theme);
  await showToastInActivePage(toast);
}

function buildFingerprint(items) {
  return items
    .map((item) => `${item.id}|${item.state}|${item.exists}|${item.filename || ""}|${item.endTime || ""}`)
    .join(";");
}

async function performDownloadsSync(options = {}) {
  const items = await searchDownloads();
  const nextFingerprint = buildFingerprint(items);

  if (nextFingerprint !== lastFingerprint) {
    lastFingerprint = nextFingerprint;
    safeRuntimeSendMessage({ type: "downloads-updated" });
  } else {
    lastFingerprint = nextFingerprint;
  }

  return items;
}

function syncDownloadsState(options = {}) {
  downloadsSyncChain = downloadsSyncChain
    .catch(() => undefined)
    .then(() => performDownloadsSync(options));
  downloadsSyncChain.catch(() => {
    /* swallow at the chain level so background-level fire-and-forget never leaks */
  });
  return downloadsSyncChain;
}

function getFreshDownloads() {
  return syncDownloadsState({ notifyTransitions: false });
}

function ensureSyncAlarm() {
  chrome.alarms.create(DOWNLOADS_SYNC_ALARM, { periodInMinutes: DOWNLOADS_SYNC_INTERVAL_MIN });
}

function openWelcomePageIfNeeded(details) {
  if (!details || details.reason !== "install") return;
  try {
    const url = chrome.runtime.getURL("welcome/welcome.html");
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url }, () => {
        void chrome.runtime.lastError;
      });
    }
  } catch {
    /* ignore — welcome page is best-effort */
  }
}

/**
 * Read the feedback endpoint + token from the manifest.
 *
 * The values live under the custom `feedback_config` key in `manifest.json`.
 * `manifest.json` itself is git-ignored — `manifest_example.json` is the
 * checked-in stub that contributors copy locally and fill with their own
 * Apps Script deployment URL and shared token.
 */
function getFeedbackConfigFromManifest() {
  try {
    const manifest = chrome.runtime?.getManifest?.() || {};
    const cfg = manifest.feedback_config || {};
    return {
      endpoint: typeof cfg.endpoint === "string" ? cfg.endpoint : "",
      token: typeof cfg.token === "string" ? cfg.token : ""
    };
  } catch {
    return { endpoint: "", token: "" };
  }
}

function getFeedbackUrlFromManifest(fieldName) {
  try {
    const manifest = chrome.runtime?.getManifest?.() || {};
    const cfg = manifest.feedback_config || {};
    const rawUrl = typeof cfg[fieldName] === "string" ? cfg[fieldName].trim() : "";
    if (!rawUrl) return "";
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function openFeedbackUrlFromManifest(fieldName) {
  const url = getFeedbackUrlFromManifest(fieldName);
  if (!url || !chrome.tabs?.create) return Promise.resolve({ ok: false });
  return new Promise((resolve) => {
    chrome.tabs.create({ url }, () => {
      const err = chrome.runtime.lastError;
      resolve(err ? { ok: false, error: err.message } : { ok: true });
    });
  });
}

function buildUninstallUrl(theme) {
  const normalizedTheme = ALLOWED_THEMES.includes(theme) ? theme : "system";
  const { endpoint, token } = getFeedbackConfigFromManifest();
  const baseUrl = getFeedbackUrlFromManifest("uninstall") || UNINSTALL_FEEDBACK_FALLBACK_URL;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("theme", normalizedTheme);
    if (endpoint) url.searchParams.set("endpoint", endpoint);
    if (token) url.searchParams.set("token", token);
    return url.toString();
  } catch {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const params = new URLSearchParams();
    params.set("theme", normalizedTheme);
    if (endpoint) params.set("endpoint", endpoint);
    if (token) params.set("token", token);
    return `${baseUrl}${sep}${params.toString()}`;
  }
}

async function refreshUninstallUrl() {
  if (!chrome.runtime?.setUninstallURL) return;
  try {
    const theme = await getCurrentThemePreference();
    const url = buildUninstallUrl(theme);
    const ret = chrome.runtime.setUninstallURL(url, () => {
      void chrome.runtime.lastError;
    });
    if (ret && typeof ret.then === "function") {
      ret.catch(() => {
        /* ignore — Chrome may reject malformed URLs */
      });
    }
  } catch {
    /* best-effort: don't let uninstall-URL setup break the SW */
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  disableBrowserDownloadsUi();
  ensureSyncAlarm();
  if (details?.reason === "install") {
    void storageLocalSet({ [PINNED_TILE_INSTALLED_AT_STORAGE_KEY]: Date.now() });
  } else {
    void ensurePinnedTileInstalledAt();
  }
  void syncDownloadsState({ notifyTransitions: false });
  void refreshUninstallUrl();
  openWelcomePageIfNeeded(details);
});

chrome.runtime.onStartup.addListener(() => {
  disableBrowserDownloadsUi();
  ensureSyncAlarm();
  void ensurePinnedTileInstalledAt();
  void syncDownloadsState({ notifyTransitions: false });
  void refreshUninstallUrl();
});

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes && Object.prototype.hasOwnProperty.call(changes, THEME_STORAGE_KEY)) {
      void refreshUninstallUrl();
    }
    if (
      changes &&
      changes[PINNED_TILE_DISMISSED_STORAGE_KEY]?.newValue === true
    ) {
      void ensurePinnedTileReshowAlarm();
    }
    if (
      changes &&
      changes[PINNED_TILE_PERMANENTLY_HIDDEN_STORAGE_KEY]?.newValue === true
    ) {
      stopPinnedTileReshowAlarm();
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === DOWNLOADS_SYNC_ALARM) {
    void syncDownloadsState();
    return;
  }
  if (alarm?.name === PINNED_TILE_RESHOW_ALARM) {
    void showPinnedTileIfPreviouslyDismissed().then((shown) => {
      if (!shown) void ensurePinnedTileReshowAlarm();
    });
  }
});

if (chrome.downloads?.onChanged) {
  chrome.downloads.onChanged.addListener((delta) => {
    void handleDownloadChanged(delta);
    void syncDownloadsState();
  });
}
if (chrome.downloads?.onCreated) {
  chrome.downloads.onCreated.addListener(() => {
    void syncDownloadsState();
  });
}
if (chrome.downloads?.onErased) {
  chrome.downloads.onErased.addListener(() => {
    void syncDownloadsState();
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;

  if (message.type === "downloads-get-current") {
    void getFreshDownloads()
      .then((items) => sendResponse({ ok: true, items }))
      .catch((error) => {
        const msg =
          error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
        sendResponse({ ok: false, error: msg });
      });
    return true;
  }

  if (message.type === "downloads-check-updates") {
    void syncDownloadsState();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "feedback-open-url") {
    void openFeedbackUrlFromManifest(message.fieldName).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === "page-download-toast-open-file") {
    void openDownloadedFile(message.downloadId).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  return undefined;
});

ensureSyncAlarm();
disableBrowserDownloadsUi();
void refreshUninstallUrl();
void ensurePinnedTileInstalledAt();
void Promise.all([
  isPinnedTileDismissed(),
  isPinnedTilePermanentlyHidden(),
  isPinnedTileEligibleForDisplay()
]).then(
  ([dismissed, permanentlyHidden, eligibleForDisplay]) => {
    if (dismissed && !permanentlyHidden && eligibleForDisplay) void ensurePinnedTileReshowAlarm();
  }
);
