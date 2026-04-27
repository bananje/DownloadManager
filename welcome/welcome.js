"use strict";

const STEPS = ["welcome", "preview", "notifications", "filters", "done"];
const THEME_STORAGE_KEY = "themePreference";
const NOTIFICATIONS_ENABLED_STORAGE_KEY = "notificationsEnabled";
const WELCOME_DONE_KEY = "welcomeCompleted";
const PERSONA_STORAGE_KEY = "welcomePersona";
const LOCALE_STORAGE_KEY = "welcomeLocale";

const isExtension = typeof chrome !== "undefined" && !!chrome?.runtime?.id;

const SUPPORTED_LOCALES = ["en", "ru", "de", "zh"];
const LOCALE_META = {
  en: { code: "EN", label: "English (US)", short: "English" },
  ru: { code: "RU", label: "Русский", short: "Русский" },
  de: { code: "DE", label: "Deutsch", short: "Deutsch" },
  zh: { code: "ZH", label: "中文", short: "中文" }
};

const I18N = {
  en: {
    welcome_title: "Welcome to Downloads History",
    welcome_subtitle:
      "A cleaner, faster way to keep track of everything you download — right from your toolbar.",
    welcome_feature_1: "Instant preview of your recent downloads",
    welcome_feature_2: "Timely notifications for every download",
    welcome_feature_3: "Powerful search, intelligent filters and a refined dark mode",
    welcome_feature_4: "Localized into multiple languages, right out of the box",

    preview_title: "Choose the popup theme",
    preview_subtitle: "The preview on the left shows the real extension popup.",

    theme_title: "Theme",
    theme_subtitle: "You can change it at any time from the popup settings.",
    theme_system: "System default",
    theme_light: "Light",
    theme_dark: "Dark",
    theme_hint_system: "Follows your device",
    theme_hint_light: "Bright interface",
    theme_hint_dark: "Easier in low light",

    notif_title: "Stay in the loop",
    notif_subtitle:
      "Receive a discreet heads-up the moment a download is complete. You can disable this at any time.",
    notif_toggle_title: "Browser notifications",
    notif_toggle_sub: "Show a system notification when a file is saved",
    notif_demo_title: "Download complete",
    notif_demo_sub: "Saved: report.pdf",
    notif_btn_enable: "Enable notifications",
    notif_btn_disable: "Disable",
    notif_demo_status_success: "Downloaded",
    notif_demo_status_error: "Error",
    notif_demo_error_meta: "Connection lost",
    notif_demo_error_meta_2: "Network interrupted",
    notif_demo_error_meta_3: "Not enough disk space",
    notif_demo_meta_now: "just now",
    notif_demo_meta_seconds: "2 seconds ago",
    notif_demo_meta_minute: "1 min ago",

    filters_title: "Shape your downloads with smart filters",
    filters_subtitle:
      "The extension lets you manage files through a set of advanced filters — sort, narrow down by date and pick just the file types you need.",
    filters_list_label: "Filters you can combine",
    filters_list_sub:
      "Active filters appear as chips at the top of the popup — remove any of them in a single click.",
    filters_item_name_title: "Sort by name",
    filters_item_name_sub: "Arrange files alphabetically, ascending or descending.",
    filters_item_size_title: "Sort by size",
    filters_item_size_sub: "Find the heaviest or the lightest files at a glance.",
    filters_item_date_title: "Date range",
    filters_item_date_sub: "Pick today, this week, this month or a custom interval.",
    filters_item_type_title: "File types",
    filters_item_type_sub: "Show only images, video, archives, programs or documents.",

    persona_title: "I would like Downloads History to help me:",
    persona_group_productivity: "Productivity",
    persona_group_workflow: "Everyday workflow",
    persona_group_other: "Other",
    persona_find_fast: "Find the files I need more quickly",
    persona_declutter: "Keep the browser interface uncluttered",
    persona_track: "Stay on top of ongoing downloads",
    persona_retry: "Restart failed downloads in a single click",
    persona_open_folder: "Open files in their folder without delay",
    persona_try: "I simply want to try it out",
    persona_other: "Something else",

    done_title: "You are all set!",
    done_subtitle:
      "Pin Downloads History to your toolbar so that it is always within easy reach.",
    done_pin_1: "Click the puzzle icon in the upper-right corner",
    done_pin_2: "Locate the entry “Download Manager”",
    done_pin_3: "Click the pin icon to keep it visible",
    done_cta: "Open Downloads",

    btn_next: "Next",
    btn_back: "Back",
    btn_skip: "Skip",
    btn_done: "Done",

    lang_switch_label: "Language"
  },

  ru: {
    welcome_title: "Добро пожаловать в Downloads History",
    welcome_subtitle:
      "Удобный и быстрый способ следить за всеми вашими загрузками — прямо с панели инструментов браузера.",
    welcome_feature_1: "Мгновенный предпросмотр ваших недавних загрузок",
    welcome_feature_2: "Своевременные уведомления о каждой загрузке",
    welcome_feature_3: "Мощный поиск, продуманные фильтры и аккуратная тёмная тема",
    welcome_feature_4: "Поддержка нескольких языков прямо «из коробки»",

    preview_title: "Тема всплывающего окна",
    preview_subtitle: "Слева — как будет выглядеть настоящее окно расширения.",

    theme_title: "Тема",
    theme_subtitle: "Его всегда можно изменить в настройках всплывающего окна.",
    theme_system: "Как в системе",
    theme_light: "Светлое",
    theme_dark: "Тёмное",
    theme_hint_system: "Автоматически как в системе",
    theme_hint_light: "Светлый интерфейс",
    theme_hint_dark: "Удобно при слабом освещении",

    notif_title: "Будьте в курсе",
    notif_subtitle:
      "Получайте ненавязчивое уведомление сразу после завершения загрузки. Отключить его можно в любой момент.",
    notif_toggle_title: "Уведомления браузера",
    notif_toggle_sub: "Показывать системное уведомление при сохранении файла",
    notif_demo_title: "Загрузка завершена",
    notif_demo_sub: "Сохранено: report.pdf",
    notif_btn_enable: "Включить уведомления",
    notif_btn_disable: "Отключить",
    notif_demo_status_success: "Готово",
    notif_demo_status_error: "Ошибка",
    notif_demo_error_meta: "Соединение прервано",
    notif_demo_error_meta_2: "Сеть недоступна",
    notif_demo_error_meta_3: "Недостаточно места на диске",
    notif_demo_meta_now: "только что",
    notif_demo_meta_seconds: "2 секунды назад",
    notif_demo_meta_minute: "1 мин назад",

    filters_title: "Управляйте загрузками с помощью продвинутых фильтров",
    filters_subtitle:
      "В расширении можно управлять файлами через набор продвинутых фильтров — сортируйте список, сужайте по дате и показывайте только нужные типы файлов.",
    filters_list_label: "Фильтры, которые можно комбинировать",
    filters_list_sub:
      "Активные фильтры отображаются плашками в верхней части окна — снять их можно одним нажатием.",
    filters_item_name_title: "Сортировка по имени",
    filters_item_name_sub: "Расставьте файлы по алфавиту — по возрастанию или убыванию.",
    filters_item_size_title: "Сортировка по размеру",
    filters_item_size_sub: "Быстро найдите самые большие или самые маленькие файлы.",
    filters_item_date_title: "Диапазон дат",
    filters_item_date_sub: "Выберите «сегодня», «неделю», «месяц» или произвольный интервал.",
    filters_item_type_title: "Типы файлов",
    filters_item_type_sub: "Оставьте в списке только изображения, видео, архивы, программы или документы.",

    persona_title: "Я хочу, чтобы Downloads History помогало мне:",
    persona_group_productivity: "Продуктивность",
    persona_group_workflow: "Повседневная работа",
    persona_group_other: "Иное",
    persona_find_fast: "Быстрее находить нужные файлы",
    persona_declutter: "Сделать интерфейс браузера чище",
    persona_track: "Следить за текущими загрузками",
    persona_retry: "Перезапускать неудавшиеся загрузки одним нажатием",
    persona_open_folder: "Быстро открывать файлы в их папке",
    persona_try: "Просто хочу попробовать",
    persona_other: "Что-то иное",

    done_title: "Всё готово!",
    done_subtitle:
      "Закрепите Downloads History на панели инструментов, чтобы оно всегда было под рукой.",
    done_pin_1: "Нажмите на значок пазла в правом верхнем углу",
    done_pin_2: "Найдите пункт «Download Manager»",
    done_pin_3: "Нажмите на булавку, чтобы закрепить расширение",
    done_cta: "Открыть загрузки",

    btn_next: "Далее",
    btn_back: "Назад",
    btn_skip: "Пропустить",
    btn_done: "Готово",

    lang_switch_label: "Язык"
  },

  de: {
    welcome_title: "Willkommen bei Downloads History",
    welcome_subtitle:
      "Eine übersichtliche und komfortable Möglichkeit, sämtliche Downloads im Blick zu behalten – direkt aus der Symbolleiste Ihres Browsers.",
    welcome_feature_1: "Sofortige Vorschau Ihrer zuletzt heruntergeladenen Dateien",
    welcome_feature_2: "Rechtzeitige Benachrichtigungen zu jedem Download",
    welcome_feature_3: "Leistungsstarke Suche, intelligente Filter und ein gepflegter Dunkelmodus",
    welcome_feature_4: "Mehrsprachige Unterstützung – bereits ab Installation enthalten",

    preview_title: "Erscheinungsbild des Popups",
    preview_subtitle: "Links sehen Sie eine Vorschau des echten Erweiterungs-Popups.",

    theme_title: "Thema",
    theme_subtitle: "Sie können es jederzeit in den Einstellungen des Popup-Fensters ändern.",
    theme_system: "Systemstandard",
    theme_light: "Hell",
    theme_dark: "Dunkel",
    theme_hint_system: "Wie auf dem Gerät eingestellt",
    theme_hint_light: "Helle Oberfläche",
    theme_hint_dark: "Angenehm bei wenig Licht",

    notif_title: "Bleiben Sie auf dem Laufenden",
    notif_subtitle:
      "Erhalten Sie einen dezenten Hinweis, sobald ein Download abgeschlossen ist. Sie können diese Funktion jederzeit deaktivieren.",
    notif_toggle_title: "Browser-Benachrichtigungen",
    notif_toggle_sub: "Eine Systembenachrichtigung anzeigen, sobald eine Datei gespeichert wurde",
    notif_demo_title: "Download abgeschlossen",
    notif_demo_sub: "Gespeichert: report.pdf",
    notif_btn_enable: "Benachrichtigungen aktivieren",
    notif_btn_disable: "Deaktivieren",
    notif_demo_status_success: "Fertig",
    notif_demo_status_error: "Fehler",
    notif_demo_error_meta: "Verbindung unterbrochen",
    notif_demo_error_meta_2: "Netzwerk gestört",
    notif_demo_error_meta_3: "Nicht genügend Speicherplatz",
    notif_demo_meta_now: "gerade eben",
    notif_demo_meta_seconds: "vor 2 Sekunden",
    notif_demo_meta_minute: "vor 1 Min.",

    filters_title: "Verwalten Sie Downloads mit intelligenten Filtern",
    filters_subtitle:
      "Die Erweiterung ermöglicht es Ihnen, Dateien mithilfe verschiedener fortgeschrittener Filter zu verwalten – sortieren, nach Datum eingrenzen und nur die benötigten Dateitypen anzeigen.",
    filters_list_label: "Kombinierbare Filter",
    filters_list_sub:
      "Aktive Filter erscheinen als Chips am oberen Rand des Popups und lassen sich jederzeit mit einem Klick entfernen.",
    filters_item_name_title: "Nach Name sortieren",
    filters_item_name_sub: "Ordnen Sie Ihre Dateien alphabetisch auf- oder absteigend.",
    filters_item_size_title: "Nach Größe sortieren",
    filters_item_size_sub: "Finden Sie die größten oder kleinsten Dateien auf einen Blick.",
    filters_item_date_title: "Zeitraum",
    filters_item_date_sub: "Wählen Sie heute, diese Woche, diesen Monat oder ein eigenes Intervall.",
    filters_item_type_title: "Dateitypen",
    filters_item_type_sub: "Zeigen Sie ausschließlich Bilder, Videos, Archive, Programme oder Dokumente an.",

    persona_title: "Ich möchte, dass Downloads History mir dabei hilft:",
    persona_group_productivity: "Produktivität",
    persona_group_workflow: "Alltäglicher Arbeitsablauf",
    persona_group_other: "Sonstiges",
    persona_find_fast: "Gewünschte Dateien schneller aufzufinden",
    persona_declutter: "Die Oberfläche des Browsers übersichtlich zu halten",
    persona_track: "Laufende Downloads stets im Blick zu behalten",
    persona_retry: "Fehlgeschlagene Downloads mit einem einzigen Klick zu wiederholen",
    persona_open_folder: "Dateien zügig in ihrem Ordner zu öffnen",
    persona_try: "Ich möchte es schlicht ausprobieren",
    persona_other: "Etwas anderes",

    done_title: "Alles bereit!",
    done_subtitle:
      "Heften Sie Downloads History an Ihre Symbolleiste, damit es stets in Reichweite ist.",
    done_pin_1: "Klicken Sie oben rechts auf das Puzzle-Symbol",
    done_pin_2: "Suchen Sie den Eintrag „Download Manager“",
    done_pin_3: "Klicken Sie auf das Stecknadel-Symbol, um es anzuheften",
    done_cta: "Downloads öffnen",

    btn_next: "Weiter",
    btn_back: "Zurück",
    btn_skip: "Überspringen",
    btn_done: "Fertig",

    lang_switch_label: "Sprache"
  },

  zh: {
    welcome_title: "欢迎使用 Downloads History",
    welcome_subtitle: "以更简洁、更高效的方式管理您的全部下载——一切尽在浏览器工具栏中。",
    welcome_feature_1: "即时预览您最近的下载记录",
    welcome_feature_2: "为每一次下载及时送达通知",
    welcome_feature_3: "强大的搜索、智能的筛选，以及雅致的深色模式",
    welcome_feature_4: "开箱即用的多语言支持",

    preview_title: "选择弹出窗口主题",
    preview_subtitle: "左侧预览与工具栏中的真实扩展弹窗一致。",

    theme_title: "主题",
    theme_subtitle: "您可以随时在弹出窗口的设置中进行更改。",
    theme_system: "跟随系统",
    theme_light: "浅色",
    theme_dark: "深色",
    theme_hint_system: "与系统设置一致",
    theme_hint_light: "明亮界面",
    theme_hint_dark: "弱光环境更护眼",

    notif_title: "随时掌握下载动态",
    notif_subtitle: "下载完成之时，您将收到一则简洁的提醒。此功能可随时关闭。",
    notif_toggle_title: "浏览器通知",
    notif_toggle_sub: "文件保存时显示系统通知",
    notif_demo_title: "下载已完成",
    notif_demo_sub: "已保存：report.pdf",
    notif_btn_enable: "启用通知",
    notif_btn_disable: "停用",
    notif_demo_status_success: "已完成",
    notif_demo_status_error: "失败",
    notif_demo_error_meta: "连接已中断",
    notif_demo_error_meta_2: "网络已中断",
    notif_demo_error_meta_3: "磁盘空间不足",
    notif_demo_meta_now: "刚刚",
    notif_demo_meta_seconds: "2 秒前",
    notif_demo_meta_minute: "1 分钟前",

    filters_title: "用智能筛选器打理您的下载记录",
    filters_subtitle:
      "扩展提供一整套进阶筛选器，助您轻松管理文件——排序、按日期精简结果，并仅保留所需的文件类型。",
    filters_list_label: "可自由组合的筛选器",
    filters_list_sub: "已启用的筛选器会以标签形式显示在弹窗顶部，可随时一键移除。",
    filters_item_name_title: "按名称排序",
    filters_item_name_sub: "按字母升序或降序整齐排列您的文件。",
    filters_item_size_title: "按大小排序",
    filters_item_size_sub: "一眼便能找出最大或最小的文件。",
    filters_item_date_title: "日期范围",
    filters_item_date_sub: "可选今天、本周、本月或自定义区间。",
    filters_item_type_title: "文件类型",
    filters_item_type_sub: "仅显示图片、视频、压缩包、程序或文档。",

    persona_title: "我希望 Downloads History 能够助我：",
    persona_group_productivity: "提升效率",
    persona_group_workflow: "日常工作",
    persona_group_other: "其他",
    persona_find_fast: "更迅速地找到所需文件",
    persona_declutter: "使浏览器界面更加整洁",
    persona_track: "随时了解当前下载状态",
    persona_retry: "一键重试失败的下载",
    persona_open_folder: "迅速在所在文件夹中打开文件",
    persona_try: "只是想先行体验",
    persona_other: "其他想法",

    done_title: "一切就绪！",
    done_subtitle: "请将 Downloads History 固定在工具栏中，使其随时触手可及。",
    done_pin_1: "请点击浏览器右上角的拼图图标",
    done_pin_2: "找到条目「Download Manager」",
    done_pin_3: "点击图钉图标，将其固定",
    done_cta: "打开下载",

    btn_next: "下一步",
    btn_back: "上一步",
    btn_skip: "跳过",
    btn_done: "完成",

    lang_switch_label: "语言"
  }
};

const state = {
  index: 0,
  lang: "en",
  /**
   * Single theme shared between the welcome wizard chrome, the extension popup
   * radio cards and the popup preview iframe. Persisted as {@link THEME_STORAGE_KEY}
   * (same storage key as popup.js).
   */
  theme: "system",
  notifications: true,
  persona: []
};

/* ---------- storage helpers ---------- */

function storageGet(keys) {
  return new Promise((resolve) => {
    if (isExtension && chrome.storage?.local) {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
      return;
    }
    try {
      const out = {};
      const arr = Array.isArray(keys) ? keys : Object.keys(keys || {});
      for (const k of arr) {
        const raw = localStorage.getItem(k);
        if (raw !== null) {
          try {
            out[k] = JSON.parse(raw);
          } catch {
            out[k] = raw;
          }
        }
      }
      resolve(out);
    } catch {
      resolve({});
    }
  });
}

function storageSet(payload) {
  return new Promise((resolve) => {
    if (isExtension && chrome.storage?.local) {
      chrome.storage.local.set(payload, () => resolve());
      return;
    }
    try {
      for (const [k, v] of Object.entries(payload)) {
        localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
      }
    } catch {
      /* ignore */
    }
    resolve();
  });
}

/* ---------- i18n ---------- */

function normalizeLocale(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.startsWith("ru")) return "ru";
  if (s.startsWith("de")) return "de";
  if (s.startsWith("zh")) return "zh";
  if (s.startsWith("en")) return "en";
  return null;
}

function detectLang() {
  try {
    if (isExtension && chrome.i18n?.getUILanguage) {
      const detected = normalizeLocale(chrome.i18n.getUILanguage());
      if (detected) return detected;
    }
  } catch {}
  const detected = normalizeLocale(navigator.language);
  return detected || "en";
}

function applyI18n(lang) {
  const code = SUPPORTED_LOCALES.includes(lang) ? lang : "en";
  const dict = I18N[code] || I18N.en;
  state.lang = code;
  document.documentElement.lang = code === "zh" ? "zh-CN" : code;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });

  const label = document.getElementById("langSwitchLabel");
  if (label) label.textContent = LOCALE_META[code].short;

  const btn = document.getElementById("langSwitchBtn");
  if (btn) btn.setAttribute("aria-label", dict.lang_switch_label || "Language");

  document.querySelectorAll("#langSwitchMenu [data-lang]").forEach((el) => {
    el.classList.toggle("is-active", el.getAttribute("data-lang") === code);
    el.setAttribute("aria-selected", el.getAttribute("data-lang") === code ? "true" : "false");
  });

  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    const themeLabel =
      state.theme === "light" ? (dict.theme_light || "Light") :
      state.theme === "dark"  ? (dict.theme_dark  || "Dark")  :
      (dict.theme_system || "System");
    themeToggleBtn.setAttribute("aria-label", themeLabel);
    themeToggleBtn.setAttribute("title", themeLabel);
  }

  updateBar();
}

function setLanguage(lang, { persist = true } = {}) {
  const code = SUPPORTED_LOCALES.includes(lang) ? lang : "en";
  applyI18n(code);
  if (persist) void storageSet({ [LOCALE_STORAGE_KEY]: code });
}

/* ---------- theme ---------- */

const THEME_ORDER = ["system", "light", "dark"];

function syncThemeToggleButton(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  const dict = I18N[state.lang] || I18N.en;
  btn.setAttribute("data-theme", theme);
  const title =
    theme === "light" ? (dict.theme_light || "Light") :
    theme === "dark"  ? (dict.theme_dark  || "Dark")  :
    (dict.theme_system || "System");
  btn.setAttribute("aria-label", title);
  btn.setAttribute("title", title);
}

function syncExtensionThemeRadios(theme) {
  const t = THEME_ORDER.includes(theme) ? theme : "system";
  document.querySelectorAll("input[name='theme']").forEach((inp) => {
    inp.checked = inp.value === t;
  });
}

function syncPopupPreviewTheme(theme) {
  const t = THEME_ORDER.includes(theme) ? theme : "system";
  const frames = document.querySelectorAll(
    "#popupPreviewFrame, #notifPopupPreviewFrame, #filtersPopupPreviewFrame"
  );
  frames.forEach((frame) => {
    try {
      const doc = frame.contentWindow?.document;
      if (doc?.documentElement) {
        doc.documentElement.setAttribute("data-theme", t);
      }
    } catch {
      /* cross-origin or not ready */
    }
  });
}

/**
 * Single entry point that keeps the welcome chrome, the top-right toggle,
 * the Step 2 radio cards and the popup preview iframe in sync.
 */
function applyTheme(value, { persist = true } = {}) {
  const theme = THEME_ORDER.includes(value) ? value : "system";
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  syncThemeToggleButton(theme);
  syncExtensionThemeRadios(theme);
  syncPopupPreviewTheme(theme);
  if (persist) void storageSet({ [THEME_STORAGE_KEY]: theme });
}

function cycleTheme() {
  const idx = THEME_ORDER.indexOf(state.theme);
  const next = THEME_ORDER[(idx + 1 + THEME_ORDER.length) % THEME_ORDER.length];
  applyTheme(next);
}

/* ---------- step navigation ---------- */

function renderDots() {
  const host = document.getElementById("barDots");
  if (!host) return;
  host.innerHTML = "";
  for (let i = 0; i < STEPS.length; i++) {
    const d = document.createElement("span");
    d.className = "dot";
    if (i === state.index) d.classList.add("is-active");
    else if (i < state.index) d.classList.add("is-done");
    host.appendChild(d);
  }
}

function updateBar() {
  const current = document.getElementById("stepCurrent");
  const total = document.getElementById("stepTotal");
  if (current) current.textContent = String(state.index + 1);
  if (total) total.textContent = String(STEPS.length);

  const backBtn = document.getElementById("backBtn");
  const skipBtn = document.getElementById("skipBtn");
  const nextBtn = document.getElementById("nextBtn");
  const nextLabel = document.getElementById("nextLabel");

  if (backBtn) backBtn.hidden = state.index === 0;

  const isLast = state.index === STEPS.length - 1;
  if (skipBtn) skipBtn.hidden = isLast;
  if (nextBtn) nextBtn.hidden = isLast;
  if (nextLabel) {
    const dict = I18N[state.lang] || I18N.en;
    nextLabel.textContent = isLast
      ? (dict.btn_done || "Done")
      : (dict.btn_next || "Next");
  }

  renderDots();
}

function showStep(idx) {
  const clamped = Math.max(0, Math.min(STEPS.length - 1, idx));
  state.index = clamped;
  const sections = document.querySelectorAll(".step");
  sections.forEach((s) => {
    const on = s.getAttribute("data-step") === STEPS[clamped];
    s.classList.toggle("is-active", on);
  });
  updateBar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goNext() {
  if (state.index >= STEPS.length - 1) {
    finish();
    return;
  }
  showStep(state.index + 1);
}

function goBack() {
  if (state.index <= 0) return;
  showStep(state.index - 1);
}

function skip() {
  showStep(STEPS.length - 1);
}

/* ---------- finish ---------- */

/**
 * Tries to open the extension's toolbar popup programmatically.
 *
 * `chrome.action.openPopup()` in MV3 requires a recent user gesture (the
 * click on the "Open Downloads" button). The call is issued synchronously
 * from inside the click handler so the transient activation is not lost
 * across a task boundary; no `chrome.windows.getCurrent` is chained in
 * front of it. Without an explicit `windowId` Chrome targets the currently
 * focused window, which is the one hosting the welcome tab.
 */
function openExtensionPopupIfPossible() {
  if (!isExtension || !chrome.action?.openPopup) {
    return Promise.resolve(false);
  }
  try {
    const ret = chrome.action.openPopup();
    if (ret && typeof ret.then === "function") {
      return ret.then(
        () => true,
        () => false
      );
    }
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

function closeWelcomeTab() {
  if (isExtension && chrome.tabs?.getCurrent) {
    try {
      chrome.tabs.getCurrent((tab) => {
        if (tab?.id) chrome.tabs.remove(tab.id);
      });
      return;
    } catch {
      /* fall back to window.close() */
    }
  }
  window.close();
}

async function finish() {
  // Kick off openPopup synchronously while the user-gesture activation is
  // still fresh; persisting welcomeCompleted happens in parallel.
  const popupOpened = openExtensionPopupIfPossible();
  const persisted = storageSet({ [WELCOME_DONE_KEY]: true });

  const opened = await popupOpened;
  await persisted;

  // Keep the welcome tab open if the popup could not be opened, so the user
  // is not left with a blank window; otherwise tidy up.
  if (opened) {
    closeWelcomeTab();
  }
}

/* ---------- bindings ---------- */

function bindTheme() {
  document.querySelectorAll("input[name='theme']").forEach((inp) => {
    inp.addEventListener("change", () => {
      if (inp.checked) applyTheme(inp.value);
    });
  });
}

function applyNotificationsUi(enabled) {
  const stage = document.getElementById("notifStage");
  if (stage) stage.classList.toggle("is-enabled", enabled);

  const enableBtn = document.getElementById("notifEnableBtn");
  const disableBtn = document.getElementById("notifDisableBtn");
  if (enableBtn) {
    enableBtn.classList.toggle("is-active", enabled);
    enableBtn.setAttribute("aria-checked", enabled ? "true" : "false");
  }
  if (disableBtn) {
    disableBtn.classList.toggle("is-active", !enabled);
    disableBtn.setAttribute("aria-checked", !enabled ? "true" : "false");
  }
}

function setNotifications(enabled, { persist = true } = {}) {
  state.notifications = !!enabled;
  applyNotificationsUi(state.notifications);
  if (persist) void storageSet({ [NOTIFICATIONS_ENABLED_STORAGE_KEY]: state.notifications });
}

function bindNotifications() {
  const enableBtn = document.getElementById("notifEnableBtn");
  const disableBtn = document.getElementById("notifDisableBtn");
  if (!enableBtn || !disableBtn) return;
  enableBtn.addEventListener("click", () => setNotifications(true));
  disableBtn.addEventListener("click", () => setNotifications(false));
}

function bindPersona() {
  document.querySelectorAll("input[name='persona']").forEach((inp) => {
    inp.addEventListener("change", () => {
      const all = Array.from(document.querySelectorAll("input[name='persona']:checked")).map(
        (el) => el.value
      );
      state.persona = all;
      void storageSet({ [PERSONA_STORAGE_KEY]: all });
    });
  });
}

function bindThemeToggle() {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    cycleTheme();
  });
}

function bindPopupPreviewFrame() {
  const frames = [
    document.getElementById("popupPreviewFrame"),
    document.getElementById("notifPopupPreviewFrame"),
    document.getElementById("filtersPopupPreviewFrame")
  ].filter(Boolean);
  frames.forEach((frame) => {
    frame.addEventListener("load", () => {
      syncPopupPreviewTheme(state.theme);
    });
  });
}

function bindLangSwitch() {
  const host = document.getElementById("langSwitch");
  const btn = document.getElementById("langSwitchBtn");
  const menu = document.getElementById("langSwitchMenu");
  if (!host || !btn || !menu) return;

  const closeMenu = () => {
    host.classList.remove("is-open");
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  const openMenu = () => {
    host.classList.add("is-open");
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-lang]");
    if (!item) return;
    const lang = item.getAttribute("data-lang");
    setLanguage(lang);
    closeMenu();
    btn.focus();
  });

  menu.addEventListener("keydown", (e) => {
    const item = e.target.closest("[data-lang]");
    if (!item) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setLanguage(item.getAttribute("data-lang"));
      closeMenu();
      btn.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (!host.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      closeMenu();
      btn.focus();
    }
  });
}

function bindNav() {
  document.getElementById("nextBtn")?.addEventListener("click", goNext);
  document.getElementById("backBtn")?.addEventListener("click", goBack);
  document.getElementById("skipBtn")?.addEventListener("click", skip);
  document.getElementById("finishBtn")?.addEventListener("click", finish);

  document.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    if (tag && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(tag)) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goBack();
    }
  });
}

async function hydrate() {
  const data = await storageGet([
    THEME_STORAGE_KEY,
    NOTIFICATIONS_ENABLED_STORAGE_KEY,
    PERSONA_STORAGE_KEY,
    LOCALE_STORAGE_KEY
  ]);

  const storedTheme = data[THEME_STORAGE_KEY];
  if (storedTheme && THEME_ORDER.includes(storedTheme)) {
    applyTheme(storedTheme, { persist: false });
  } else {
    applyTheme(state.theme, { persist: false });
  }

  const storedLocale = normalizeLocale(data[LOCALE_STORAGE_KEY]);
  if (storedLocale && storedLocale !== state.lang) {
    setLanguage(storedLocale, { persist: false });
  }

  const notif = data[NOTIFICATIONS_ENABLED_STORAGE_KEY];
  if (typeof notif === "boolean") {
    setNotifications(notif, { persist: false });
  } else {
    applyNotificationsUi(state.notifications);
  }

  const persona = data[PERSONA_STORAGE_KEY];
  if (Array.isArray(persona)) {
    state.persona = persona;
    persona.forEach((v) => {
      const node = document.querySelector(`input[name='persona'][value='${v}']`);
      if (node) node.checked = true;
    });
  }
}

function init() {
  applyI18n(detectLang());
  applyTheme(state.theme, { persist: false });
  bindLangSwitch();
  bindThemeToggle();
  bindPopupPreviewFrame();
  bindNav();
  bindTheme();
  bindNotifications();
  bindPersona();
  void hydrate();
  showStep(0);
}

document.addEventListener("DOMContentLoaded", init);

["copy", "cut", "selectstart", "dragstart"].forEach((evt) => {
  document.addEventListener(evt, (e) => {
    e.preventDefault();
  });
});
