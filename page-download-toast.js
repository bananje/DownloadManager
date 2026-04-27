(function () {
  const ROOT_ID = "dhe-page-download-toast-root";
  const STYLE_ID = `${ROOT_ID}-styles`;
  const FALLBACK_ICON =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='%23D1D5DB'/><path d='M22 16h14l10 10v22a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z' fill='%239CA3AF'/><path d='M36 16v10h10' fill='none' stroke='%23E5E7EB' stroke-width='3'/></svg>";
  const UI_LOCALE =
    (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage?.()) || navigator.language || "en";
  const EXACT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(UI_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

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

  const ALLOWED_THEMES = ["system", "light", "dark"];
  const DEFAULT_THEME = "system";
  const HOVER_HIDE_DELAY_MS = 1000;

  let activeToastId = "";
  let dismissTimer = null;
  let removeTimer = null;
  let hoverLeaveTimer = null;

  function normalizeTheme(value) {
    return ALLOWED_THEMES.includes(value) ? value : DEFAULT_THEME;
  }

  function applyThemeToRoot(root, theme) {
    if (!(root instanceof HTMLElement)) return;
    root.setAttribute("data-theme", normalizeTheme(theme));
  }

  function ensureStyles() {
    document.querySelectorAll(`#${STYLE_ID}, style[data-dhe-toast="1"]`).forEach((el) => el.remove());
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.setAttribute("data-dhe-toast", "1");
    style.textContent = `
      #${ROOT_ID} {
        position: fixed !important;
        top: 8px !important;
        right: 8px !important;
        left: auto !important;
        bottom: auto !important;
        width: auto !important;
        max-width: calc(100vw - 16px) !important;
        margin: 0 !important;
        padding: 0 !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        transform: none !important;
        float: none !important;
        clear: none !important;
      }
      #${ROOT_ID} {
        --dhe-toast-bg: rgba(17, 24, 39, 0.96);
        --dhe-toast-border: rgba(148, 163, 184, 0.24);
        --dhe-toast-shadow: 0 7px 16px rgba(0, 0, 0, 0.28);
        --dhe-toast-hover-bg: rgba(30, 41, 59, 0.98);
        --dhe-toast-hover-border: rgba(125, 211, 252, 0.42);
        --dhe-toast-hover-shadow: 0 12px 28px rgba(14, 165, 233, 0.2);
        --dhe-toast-title: #f9fafb;
        --dhe-toast-meta: #cbd5e1;
        --dhe-toast-icon-bg: rgba(148, 163, 184, 0.15);
        --dhe-toast-success: #93c5fd;
        --dhe-toast-success-bg: rgba(96, 165, 250, 0.16);
        --dhe-toast-error: #fda4af;
        --dhe-toast-error-bg: rgba(248, 113, 113, 0.16);
      }
      #${ROOT_ID}[data-theme="light"] {
        --dhe-toast-bg: rgba(255, 255, 255, 0.96);
        --dhe-toast-border: rgba(148, 163, 184, 0.22);
        --dhe-toast-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
        --dhe-toast-hover-bg: rgba(248, 250, 252, 0.99);
        --dhe-toast-hover-border: rgba(59, 130, 246, 0.34);
        --dhe-toast-hover-shadow: 0 14px 30px rgba(59, 130, 246, 0.18);
        --dhe-toast-title: #111827;
        --dhe-toast-meta: #6b7280;
        --dhe-toast-icon-bg: rgba(148, 163, 184, 0.18);
        --dhe-toast-success: #1d4ed8;
        --dhe-toast-success-bg: rgba(37, 99, 235, 0.1);
        --dhe-toast-error: #dc2626;
        --dhe-toast-error-bg: rgba(220, 38, 38, 0.1);
      }
      #${ROOT_ID}[data-theme="dark"] {
        --dhe-toast-bg: rgba(17, 24, 39, 0.96);
        --dhe-toast-border: rgba(148, 163, 184, 0.24);
        --dhe-toast-shadow: 0 16px 32px rgba(0, 0, 0, 0.42);
        --dhe-toast-hover-bg: rgba(30, 41, 59, 0.98);
        --dhe-toast-hover-border: rgba(125, 211, 252, 0.42);
        --dhe-toast-hover-shadow: 0 18px 36px rgba(14, 165, 233, 0.22);
        --dhe-toast-title: #f9fafb;
        --dhe-toast-meta: #cbd5e1;
        --dhe-toast-icon-bg: rgba(148, 163, 184, 0.15);
        --dhe-toast-success: #93c5fd;
        --dhe-toast-success-bg: rgba(96, 165, 250, 0.16);
        --dhe-toast-error: #fda4af;
        --dhe-toast-error-bg: rgba(248, 113, 113, 0.16);
      }
      #${ROOT_ID}[data-theme="system"] {
        --dhe-toast-bg: rgba(255, 255, 255, 0.96);
        --dhe-toast-border: rgba(148, 163, 184, 0.22);
        --dhe-toast-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
        --dhe-toast-hover-bg: rgba(248, 250, 252, 0.99);
        --dhe-toast-hover-border: rgba(59, 130, 246, 0.34);
        --dhe-toast-hover-shadow: 0 14px 30px rgba(59, 130, 246, 0.18);
        --dhe-toast-title: #111827;
        --dhe-toast-meta: #6b7280;
        --dhe-toast-icon-bg: rgba(148, 163, 184, 0.18);
        --dhe-toast-success: #1d4ed8;
        --dhe-toast-success-bg: rgba(37, 99, 235, 0.1);
        --dhe-toast-error: #dc2626;
        --dhe-toast-error-bg: rgba(220, 38, 38, 0.1);
      }
      @media (prefers-color-scheme: dark) {
        #${ROOT_ID}[data-theme="system"] {
          --dhe-toast-bg: rgba(17, 24, 39, 0.96);
          --dhe-toast-border: rgba(148, 163, 184, 0.24);
          --dhe-toast-shadow: 0 16px 32px rgba(0, 0, 0, 0.42);
          --dhe-toast-hover-bg: rgba(30, 41, 59, 0.98);
          --dhe-toast-hover-border: rgba(125, 211, 252, 0.42);
          --dhe-toast-hover-shadow: 0 18px 36px rgba(14, 165, 233, 0.22);
          --dhe-toast-title: #f9fafb;
          --dhe-toast-meta: #cbd5e1;
          --dhe-toast-icon-bg: rgba(148, 163, 184, 0.15);
          --dhe-toast-success: #93c5fd;
          --dhe-toast-success-bg: rgba(96, 165, 250, 0.16);
          --dhe-toast-error: #fda4af;
          --dhe-toast-error-bg: rgba(248, 113, 113, 0.16);
        }
      }
      #${ROOT_ID} .dhe-page-toast {
        position: relative;
        box-sizing: border-box !important;
        display: grid !important;
        grid-template-columns: 24px minmax(0, 1fr);
        gap: 0 8px;
        align-items: center;
        width: 288px !important;
        max-width: 100% !important;
        padding: 9px 26px 9px 10px !important;
        border-radius: 10px;
        border: 1px solid var(--dhe-toast-border);
        background: var(--dhe-toast-bg);
        color: var(--dhe-toast-title);
        box-shadow: var(--dhe-toast-shadow);
        backdrop-filter: blur(12px);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(-6px) scale(0.985);
        caret-color: transparent;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        -webkit-user-select: none;
        user-select: none;
        transition:
          opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1),
          transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
          background-color 0.22s ease,
          border-color 0.22s ease,
          box-shadow 0.22s ease;
      }
      #${ROOT_ID} .dhe-page-toast * {
        caret-color: transparent;
      }
      #${ROOT_ID} .dhe-page-toast--interactive {
        cursor: pointer;
      }
      #${ROOT_ID} .dhe-page-toast:is(:hover, :focus-within) {
        background: var(--dhe-toast-hover-bg);
      }
      #${ROOT_ID} .dhe-page-toast--interactive:is(:hover, :focus-visible, :focus-within) {
        transform: translateY(-1px) scale(1);
      }
      #${ROOT_ID} .dhe-page-toast--visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      #${ROOT_ID} .dhe-page-toast--hiding {
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
      }
      #${ROOT_ID} .dhe-page-toast__icon-wrap {
        grid-row: 1 / span 2;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 7px;
        background: var(--dhe-toast-icon-bg);
        overflow: hidden;
      }
      #${ROOT_ID} .dhe-page-toast__icon {
        width: 15px;
        height: 15px;
        object-fit: contain;
        display: block;
      }
      #${ROOT_ID} .dhe-page-toast__content {
        min-width: 0;
      }
      #${ROOT_ID} .dhe-page-toast__header {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      #${ROOT_ID} .dhe-page-toast__title {
        min-width: 0;
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.25;
        color: var(--dhe-toast-title);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .dhe-page-toast__status {
        flex-shrink: 0;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 600;
        line-height: 1.2;
      }
      #${ROOT_ID} .dhe-page-toast--success .dhe-page-toast__status {
        color: var(--dhe-toast-success);
        background: var(--dhe-toast-success-bg);
      }
      #${ROOT_ID} .dhe-page-toast--error .dhe-page-toast__status {
        color: var(--dhe-toast-error);
        background: var(--dhe-toast-error-bg);
      }
      #${ROOT_ID} .dhe-page-toast__meta {
        margin: 3px 0 0;
        font-size: 10px;
        line-height: 1.3;
        color: var(--dhe-toast-meta);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .dhe-page-toast__close {
        position: absolute !important;
        top: 5px;
        right: 5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        padding: 0;
        margin: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--dhe-toast-meta);
        cursor: pointer;
        opacity: 0.75;
        transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
        -webkit-appearance: none;
        appearance: none;
        font: inherit;
      }
      #${ROOT_ID} .dhe-page-toast__close:hover {
        opacity: 1;
        color: var(--dhe-toast-title);
        background: var(--dhe-toast-icon-bg);
      }
      #${ROOT_ID} .dhe-page-toast__close:focus-visible {
        outline: 2px solid var(--dhe-toast-success);
        outline-offset: 1px;
        opacity: 1;
      }
      #${ROOT_ID} .dhe-page-toast--interactive:focus-visible {
        outline: 2px solid var(--dhe-toast-success);
        outline-offset: 2px;
      }
      #${ROOT_ID} .dhe-page-toast__close svg {
        width: 10px;
        height: 10px;
        display: block;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .dhe-page-toast {
          transition: opacity 0.01s linear;
          transform: none;
        }
        #${ROOT_ID} .dhe-page-toast--visible,
        #${ROOT_ID} .dhe-page-toast--hiding {
          transform: none;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtmlText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatExactDateTime(value) {
    const unknown = i18nMessage("time_unknown") || "Unknown time";
    if (value == null) return unknown;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return unknown;
    return EXACT_DATE_TIME_FORMATTER.format(date);
  }

  function clearTimers() {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (removeTimer !== null) {
      window.clearTimeout(removeTimer);
      removeTimer = null;
    }
    if (hoverLeaveTimer !== null) {
      window.clearTimeout(hoverLeaveTimer);
      hoverLeaveTimer = null;
    }
  }

  function scheduleHide(expectedToastId = activeToastId, delayMs = HOVER_HIDE_DELAY_MS) {
    if (!expectedToastId || activeToastId !== expectedToastId) return;
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (hoverLeaveTimer !== null) {
      window.clearTimeout(hoverLeaveTimer);
    }
    hoverLeaveTimer = window.setTimeout(() => {
      hoverLeaveTimer = null;
      hideToast(expectedToastId);
    }, delayMs);
  }

  function getRoot() {
    ensureStyles();
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-atomic", "true");
    (document.documentElement || document.body).appendChild(root);
    return root;
  }

  function hideToast(expectedToastId = activeToastId, force = false) {
    const root = document.getElementById(ROOT_ID);
    if (!root || !expectedToastId || activeToastId !== expectedToastId) return;
    const toastEl = root.firstElementChild;
    if (!force && toastEl instanceof HTMLElement) {
      let isHovered = false;
      try {
        isHovered = toastEl.matches(":hover");
      } catch {
        isHovered = false;
      }
      if (isHovered) {
        if (dismissTimer !== null) {
          window.clearTimeout(dismissTimer);
          dismissTimer = null;
        }
        if (removeTimer !== null) {
          window.clearTimeout(removeTimer);
          removeTimer = null;
        }
        if (hoverLeaveTimer !== null) {
          window.clearTimeout(hoverLeaveTimer);
          hoverLeaveTimer = null;
        }
        if (toastEl.classList.contains("dhe-page-toast--hiding")) {
          toastEl.classList.remove("dhe-page-toast--hiding");
          toastEl.classList.add("dhe-page-toast--visible");
        }
        return;
      }
    }
    clearTimers();
    if (!(toastEl instanceof HTMLElement)) {
      root.remove();
      activeToastId = "";
      return;
    }
    toastEl.classList.remove("dhe-page-toast--visible");
    toastEl.classList.add("dhe-page-toast--hiding");
    removeTimer = window.setTimeout(() => {
      if (activeToastId !== expectedToastId) return;
      const currentRoot = document.getElementById(ROOT_ID);
      currentRoot?.remove();
      activeToastId = "";
      removeTimer = null;
    }, 340);
  }

  function getIconUrl(downloadId) {
    return new Promise((resolve) => {
      const id = Number(downloadId);
      if (!Number.isFinite(id) || !chrome.downloads?.getFileIcon) {
        resolve(FALLBACK_ICON);
        return;
      }
      chrome.downloads.getFileIcon(id, { size: 32 }, (iconUrl) => {
        if (chrome.runtime.lastError || !iconUrl) {
          resolve(FALLBACK_ICON);
          return;
        }
        const normalized = String(iconUrl).trim();
        resolve(!normalized || /^file:/i.test(normalized) ? FALLBACK_ICON : normalized);
      });
    });
  }

  function requestOpenDownloadedFile(downloadId) {
    return new Promise((resolve) => {
      if (!chrome.runtime?.sendMessage) {
        resolve({ ok: false, error: "runtime.sendMessage is unavailable" });
        return;
      }
      chrome.runtime.sendMessage({ type: "page-download-toast-open-file", downloadId }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response && typeof response === "object" ? response : { ok: false, error: "Open failed" });
      });
    });
  }

  async function showToast(toast) {
    if (!toast || typeof toast !== "object") return;
    clearTimers();

    const status = toast.status === "error" ? "error" : "success";
    const toastId = String(
      toast.id || `${toast.downloadId ?? "download"}:${status}:${toast.eventTimeMs ?? Date.now()}`
    );
    activeToastId = toastId;

    const iconUrl = await getIconUrl(toast.downloadId);
    if (activeToastId !== toastId) return;

    const root = getRoot();
    applyThemeToRoot(root, toast.theme);
    const fileName = toast.fileName ? String(toast.fileName) : i18nMessage("untitled_file") || "Untitled";
    const sizeLabel = toast.sizeLabel ? String(toast.sizeLabel) : i18nMessage("unknown_file_size") || "Unknown size";
    const exactTime = formatExactDateTime(toast.eventTimeMs);
    const statusLabel =
      status === "success"
        ? i18nMessage("page_toast_status_success") || "Downloaded"
        : i18nMessage("page_toast_status_error") || "Error";
    const closeTitle = i18nMessage("type_filter_close") || "Close";
    const closeAria = i18nMessage("page_toast_close_aria") || closeTitle;
    const canOpenFile = status === "success" && Number.isFinite(Number(toast.downloadId));
    const openAria =
      i18nMessage("download_item_open_file", [fileName]) || `Open file: ${fileName}`;
    const toastRole = canOpenFile ? "button" : "status";

    root.innerHTML = `
      <article class="dhe-page-toast dhe-page-toast--${status}${canOpenFile ? " dhe-page-toast--interactive" : ""}" role="${escapeAttr(toastRole)}" aria-live="polite"${canOpenFile ? ` tabindex="0" aria-label="${escapeAttr(openAria)}"` : ""}>
        <span class="dhe-page-toast__icon-wrap">
          <img class="dhe-page-toast__icon" src="${escapeAttr(iconUrl)}" alt="" draggable="false" />
        </span>
        <div class="dhe-page-toast__content">
          <div class="dhe-page-toast__header">
            <p class="dhe-page-toast__title" title="${escapeAttr(fileName)}">${escapeHtmlText(fileName)}</p>
            <span class="dhe-page-toast__status">${escapeHtmlText(statusLabel)}</span>
          </div>
          <p class="dhe-page-toast__meta">${escapeHtmlText(`${sizeLabel} • ${exactTime}`)}</p>
        </div>
        <button type="button" class="dhe-page-toast__close" aria-label="${escapeAttr(closeAria)}" title="${escapeAttr(closeTitle)}">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10"/></svg>
        </button>
      </article>`;

    const toastEl = root.firstElementChild;
    if (!(toastEl instanceof HTMLElement)) return;
    let openInFlight = false;

    const closeBtn = toastEl.querySelector(".dhe-page-toast__close");
    if (closeBtn instanceof HTMLElement) {
      closeBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        hideToast(toastId, true);
      });
    }

    const suspendAutoHide = () => {
      if (activeToastId !== toastId) return;
      clearTimers();
      if (toastEl.classList.contains("dhe-page-toast--hiding")) {
        toastEl.classList.remove("dhe-page-toast--hiding");
        toastEl.classList.add("dhe-page-toast--visible");
      }
    };

    const resumeAutoHide = () => {
      if (activeToastId !== toastId) return;
      scheduleHide(toastId);
    };

    toastEl.addEventListener("mouseenter", suspendAutoHide);
    toastEl.addEventListener("mouseleave", resumeAutoHide);
    toastEl.addEventListener("focusin", suspendAutoHide);
    toastEl.addEventListener("focusout", () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof Node && toastEl.contains(active)) return;
        resumeAutoHide();
      }, 0);
    });

    if (canOpenFile) {
      const openToastFile = async () => {
        if (openInFlight || activeToastId !== toastId) return;
        openInFlight = true;
        suspendAutoHide();
        try {
          const result = await requestOpenDownloadedFile(toast.downloadId);
          if (result?.ok) {
            hideToast(toastId, true);
          } else {
            scheduleHide(toastId);
          }
        } finally {
          openInFlight = false;
        }
      };

      toastEl.addEventListener("click", (ev) => {
        if (ev.target instanceof Element && ev.target.closest(".dhe-page-toast__close")) return;
        ev.preventDefault();
        void openToastFile();
      });

      toastEl.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        void openToastFile();
      });
    }

    requestAnimationFrame(() => {
      if (activeToastId !== toastId) return;
      toastEl.classList.add("dhe-page-toast--visible");
    });

    const expiresAtMs = Number(toast.expiresAtMs);
    const dismissInMs = Number.isFinite(expiresAtMs) ? Math.max(1200, expiresAtMs - Date.now()) : 4800;
    dismissTimer = window.setTimeout(() => hideToast(toastId), dismissInMs);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "page-download-toast-show" && message.toast && typeof message.toast === "object") {
      void showToast(message.toast);
    }
    return undefined;
  });

  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes?.themePreference) return;
      const root = document.getElementById(ROOT_ID);
      if (root) applyThemeToRoot(root, changes.themePreference.newValue);
    });
  } catch {
    /* some contexts block chrome.storage.onChanged from content scripts */
  }
})();
