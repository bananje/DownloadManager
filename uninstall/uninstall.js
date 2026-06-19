"use strict";

/**
 * Uninstall feedback page.
 *
 * The page can run inside the extension context during local development, and
 * it also keeps support for externally hosted feedback pages by accepting the
 * same values through URL query parameters.
 */

const THEME_ORDER = ["system", "light", "dark"];
const THEME_LS_KEY = "uninstallFeedbackTheme";

const state = {
  theme: "system",
  submitting: false
};

/* ---------- helpers ---------- */

function readQueryParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(name);
    return value ? String(value) : null;
  } catch {
    return null;
  }
}

/**
 * Google Apps Script Web App that receives the feedback payload and
 * forwards it as a plain-text email via the script owner's Gmail.
 *
 * The endpoint URL and the shared `token` live under the custom
 * `feedback_config` key in the extension's `manifest.json`. When the page is
 * opened outside the extension context, the background service worker appends
 * them to the uninstall URL as `?endpoint=…&token=…` query params.
 *
 * Deployment notes:
 *   - The endpoint must be deployed as a Web App with "Execute as: Me"
 *     and "Who has access: Anyone".
 *   - We always POST with `Content-Type: text/plain` so the browser
 *     classifies the request as a CORS "simple request" and skips the
 *     preflight `OPTIONS` (which Apps Script does not handle).
 *   - `token` is not a secret in the cryptographic sense (it is visible
 *     in client-side JS / URL) — it just lets the Apps Script reject
 *     random drive-by POSTs that don't know the agreed value.
 */
function readFeedbackConfigFromManifest() {
  try {
    const cfg = chrome.runtime?.getManifest?.()?.feedback_config || {};
    return {
      endpoint: typeof cfg.endpoint === "string" ? cfg.endpoint : "",
      token: typeof cfg.token === "string" ? cfg.token : ""
    };
  } catch {
    return { endpoint: "", token: "" };
  }
}

const FEEDBACK_CONFIG = readFeedbackConfigFromManifest();
const FEEDBACK_ENDPOINT = FEEDBACK_CONFIG.endpoint || readQueryParam("endpoint") || "";
const FEEDBACK_TOKEN = FEEDBACK_CONFIG.token || readQueryParam("token") || "";

function readLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / disabled storage — ignore */
  }
}

function normalizeTheme(value) {
  return THEME_ORDER.includes(value) ? value : null;
}

/* ---------- theme ---------- */

function syncThemeToggleButton(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  btn.setAttribute("data-theme", theme);
  const label =
    theme === "light" ? "Light theme" :
    theme === "dark"  ? "Dark theme"  :
    "System theme";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("title", label);
}

function applyTheme(value, { persist = true } = {}) {
  const theme = normalizeTheme(value) || "system";
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  syncThemeToggleButton(theme);
  if (persist) writeLocalStorage(THEME_LS_KEY, theme);
}

function cycleTheme() {
  const idx = THEME_ORDER.indexOf(state.theme);
  const next = THEME_ORDER[(idx + 1 + THEME_ORDER.length) % THEME_ORDER.length];
  applyTheme(next);
}

/**
 * Resolve initial theme with the following priority:
 *   1. ?theme= query param forwarded by the extension (authoritative
 *      because it reflects the value the user just saw inside the popup);
 *   2. localStorage override on this same page from a previous session;
 *   3. "system" fallback.
 */
function resolveInitialTheme() {
  const fromQuery = normalizeTheme(readQueryParam("theme"));
  if (fromQuery) return fromQuery;
  const fromLocal = normalizeTheme(readLocalStorage(THEME_LS_KEY));
  if (fromLocal) return fromLocal;
  return "system";
}

/* ---------- form ---------- */

function getSelectedReasons() {
  const nodes = document.querySelectorAll("input[name='reason']:checked");
  return Array.from(nodes).map((el) => el.value);
}

function showThanks() {
  const formStep = document.getElementById("formStep");
  const thanksStep = document.getElementById("thanksStep");
  if (formStep) {
    formStep.classList.remove("is-active");
    formStep.setAttribute("aria-hidden", "true");
  }
  if (thanksStep) {
    thanksStep.classList.add("is-active");
    thanksStep.setAttribute("aria-hidden", "false");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateCommentCounter() {
  const area = document.getElementById("feedbackComment");
  const counter = document.getElementById("commentCounter");
  if (!area || !counter) return;
  const max = Number(area.getAttribute("maxlength")) || 1000;
  counter.textContent = `${area.value.length} / ${max}`;
}

function setSubmitButtonDisabled(disabled) {
  const btn = document.getElementById("submitBtn");
  if (btn) btn.disabled = !!disabled;
}

function setCommentError(show) {
  const area = document.getElementById("feedbackComment");
  const error = document.getElementById("commentError");
  if (area) area.setAttribute("aria-invalid", show ? "true" : "false");
  if (area) area.classList.toggle("is-invalid", !!show);
  if (error) error.hidden = !show;
}

const MIN_COMMENT_LENGTH = 5;

function isFormValid() {
  const comment = (document.getElementById("feedbackComment")?.value || "").trim();
  // A comment (min length) is always required: it covers both selecting a
  // reason and submitting feedback without picking any reason. An empty form
  // is not submittable.
  return comment.length >= MIN_COMMENT_LENGTH;
}

/** Keep the submit button in sync with the form validity. */
function refreshSubmitState() {
  if (state.submitting) return;
  setSubmitButtonDisabled(!isFormValid());
}

/**
 * Send the payload to the Apps Script Web App.
 *
 * We intentionally use `mode: "no-cors"` + `Content-Type: text/plain`:
 *   - "text/plain" keeps the request inside the CORS "simple request"
 *     bucket so the browser skips the preflight OPTIONS that Apps Script
 *     would not be able to answer correctly.
 *   - "no-cors" means we cannot read the response from JS, which is fine —
 *     we optimistically show the thank-you screen straight away. Apps Script
 *     still receives, parses and processes the body server-side.
 *   - `keepalive: true` makes sure the request still completes even if the
 *     user closes the tab right after pressing the button (which is a very
 *     common scenario on an uninstall feedback page).
 */
function sendFeedback(payload) {
  if (!FEEDBACK_ENDPOINT) return Promise.resolve();
  try {
    const body = JSON.stringify(payload);
    return fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
      keepalive: true,
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow"
    }).catch(() => {
      /* network or tab-close — best-effort, swallow */
    });
  } catch {
    return Promise.resolve();
  }
}

function handleSubmit(event) {
  if (event) event.preventDefault();
  if (state.submitting) return;

  const reasons = getSelectedReasons();
  const comment = (document.getElementById("feedbackComment")?.value || "").trim();

  if (!isFormValid()) {
    if (comment.length < MIN_COMMENT_LENGTH) {
      setCommentError(true);
      const area = document.getElementById("feedbackComment");
      if (area) area.focus();
    }
    refreshSubmitState();
    return;
  }
  setCommentError(false);

  state.submitting = true;
  setSubmitButtonDisabled(true);

  const payload = {
    token: FEEDBACK_TOKEN,
    reasons,
    comment,
    locale: navigator.language || "",
    userAgent: navigator.userAgent || "",
    submittedAtIso: new Date().toISOString()
  };

  void sendFeedback(payload);
  showThanks();
}

/* ---------- bindings ---------- */

function bindThemeToggle() {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", cycleTheme);
}

function bindForm() {
  const form = document.getElementById("feedbackForm");
  if (form) form.addEventListener("submit", handleSubmit);

  const skip = document.getElementById("skipBtn");
  if (skip) skip.addEventListener("click", showThanks);

  const reasonInputs = document.querySelectorAll("input[name='reason']");
  reasonInputs.forEach((input) => {
    input.addEventListener("change", refreshSubmitState);
  });

  const area = document.getElementById("feedbackComment");
  if (area) {
    area.addEventListener("input", () => {
      updateCommentCounter();
      if (area.value.trim().length >= MIN_COMMENT_LENGTH) setCommentError(false);
      refreshSubmitState();
    });
    updateCommentCounter();
  }

  refreshSubmitState();
}

function init() {
  applyTheme(resolveInitialTheme(), { persist: false });
  bindThemeToggle();
  bindForm();
}

document.addEventListener("DOMContentLoaded", init);
