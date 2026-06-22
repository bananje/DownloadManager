"use strict";

(function initPreviewHints() {
  var params = new URLSearchParams(window.location.search);
  var target = (params.get("hint") || "theme").toLowerCase();

  if (target === "filters") {
    runFiltersDemo();
    return;
  }

  var btn = document.querySelector('[data-hint-target="' + target + '"]');
  if (!btn) return;
  btn.classList.add("icon-btn--preview-hint");
  var SVG_NS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "preview-cursor-hint");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  var path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M5 3 L5 17 L9 13 L11.5 19 L14 18 L11.5 12 L17 12 Z");
  path.setAttribute("stroke-width", "1");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  btn.appendChild(svg);
})();

function runFiltersDemo() {
  document.documentElement.classList.add("is-filters-demo");

  var app = document.querySelector(".app");
  var header = document.querySelector(".app__header");
  var filtersBtn = document.querySelector('[data-hint-target="filters"]');
  if (!app || !header || !filtersBtn) return;

  // Items that should "disappear" when the Images/Documents type filter
  // is applied: the .exe (program) and the .zip (archive).
  var downloadItems = Array.prototype.slice.call(
    document.querySelectorAll(".downloads-list .download-item")
  );
  var filteredOutItems = [downloadItems[1], downloadItems[3]].filter(Boolean);

  var FILTERS = [
    { key: "date", chipKey: "chipDate" },
    { key: "type", chipKey: "chipType" }
  ];

  var LABELS = {
    itemName: "Name (A \u2192 Z)",
    itemSize: "Size (largest first)",
    itemStatus: "Status",
    itemDate: "Date range",
    itemType: "File types",
    chipDate: "Date: last 7 days",
    chipType: "Type: Images, Documents"
  };

  var SVG_NS = "http://www.w3.org/2000/svg";

  var cursor = document.createElement("div");
  cursor.className = "demo-cursor";
  var cursorSvg = document.createElementNS(SVG_NS, "svg");
  cursorSvg.setAttribute("viewBox", "0 0 24 24");
  cursorSvg.setAttribute("width", "20");
  cursorSvg.setAttribute("height", "20");
  cursorSvg.setAttribute("aria-hidden", "true");
  var cursorPath = document.createElementNS(SVG_NS, "path");
  cursorPath.setAttribute("d", "M5 3 L5 17 L9 13 L11.5 19 L14 18 L11.5 12 L17 12 Z");
  cursorSvg.appendChild(cursorPath);
  cursor.appendChild(cursorSvg);
  app.appendChild(cursor);

  var ripple = document.createElement("span");
  ripple.className = "demo-click-ripple";
  app.appendChild(ripple);

  var menu = document.createElement("ul");
  menu.className = "toolbar-filter-menu demo-filter-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  [
    { key: "name", label: LABELS.itemName },
    { key: "size", label: LABELS.itemSize },
    { key: "status", label: LABELS.itemStatus },
    { key: "date", label: LABELS.itemDate },
    { key: "type", label: LABELS.itemType }
  ].forEach(function (entry) {
    var li = document.createElement("li");
    li.setAttribute("role", "presentation");
    var itemBtn = document.createElement("button");
    itemBtn.type = "button";
    itemBtn.className = "toolbar-filter-menu__item";
    itemBtn.setAttribute("role", "menuitemcheckbox");
    itemBtn.setAttribute("aria-checked", "false");
    itemBtn.setAttribute("tabindex", "-1");
    itemBtn.dataset.filterKey = entry.key;
    var dot = document.createElement("span");
    dot.className = "toolbar-filter-menu__dot";
    dot.setAttribute("aria-hidden", "true");
    var label = document.createElement("span");
    label.className = "toolbar-filter-menu__label";
    label.textContent = entry.label;
    itemBtn.appendChild(dot);
    itemBtn.appendChild(label);
    li.appendChild(itemBtn);
    menu.appendChild(li);
  });
  app.appendChild(menu);

  var filtersBar = document.createElement("section");
  filtersBar.className = "active-filters-bar demo-active-filters-bar";
  filtersBar.setAttribute("aria-live", "polite");
  header.insertAdjacentElement("afterend", filtersBar);

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function centerOf(el) {
    var appRect = app.getBoundingClientRect();
    var rect = el.getBoundingClientRect();
    return {
      x: rect.left - appRect.left + rect.width / 2,
      y: rect.top - appRect.top + rect.height / 2
    };
  }

  // Cursor arrow tip in the SVG is at roughly (5, 3); offset so that
  // the tip lands on the target center rather than the SVG top-left.
  var CURSOR_TIP_X = 5;
  var CURSOR_TIP_Y = 3;

  function moveCursorTo(el, offsetX, offsetY) {
    var c = centerOf(el);
    var x = c.x + (offsetX || 0) - CURSOR_TIP_X;
    var y = c.y + (offsetY || 0) - CURSOR_TIP_Y;
    cursor.classList.add("is-visible");
    cursor.style.setProperty("--demo-cursor-x", x + "px");
    cursor.style.setProperty("--demo-cursor-y", y + "px");
    return sleep(560);
  }

  function pulseClick() {
    var x = parseFloat(cursor.style.getPropertyValue("--demo-cursor-x")) || 0;
    var y = parseFloat(cursor.style.getPropertyValue("--demo-cursor-y")) || 0;
    cursor.classList.add("is-pressing");
    ripple.style.setProperty("--demo-ripple-x", (x + CURSOR_TIP_X) + "px");
    ripple.style.setProperty("--demo-ripple-y", (y + CURSOR_TIP_Y) + "px");
    ripple.classList.remove("is-active");
    void ripple.offsetWidth;
    ripple.classList.add("is-active");
    return sleep(200).then(function () {
      cursor.classList.remove("is-pressing");
      return sleep(240);
    });
  }

  function positionMenuUnderButton() {
    var appRect = app.getBoundingClientRect();
    var btnRect = filtersBtn.getBoundingClientRect();
    var left = btnRect.left - appRect.left;
    var top = btnRect.bottom - appRect.top + 4;
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function openMenu() {
    positionMenuUnderButton();
    menu.hidden = false;
    void menu.offsetWidth;
    menu.classList.add("is-open");
    filtersBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menu.classList.remove("is-open");
    filtersBtn.setAttribute("aria-expanded", "false");
    return sleep(200).then(function () {
      menu.hidden = true;
    });
  }

  function makeChip(text) {
    var chip = document.createElement("article");
    chip.className = "active-filter-chip";
    var span = document.createElement("span");
    span.className = "active-filter-chip__text";
    span.textContent = text;
    var close = document.createElement("button");
    close.type = "button";
    close.className = "active-filter-chip__close";
    close.setAttribute("tabindex", "-1");
    close.setAttribute("aria-hidden", "true");
    close.textContent = "\u00d7";
    chip.appendChild(span);
    chip.appendChild(close);
    return chip;
  }

  function showFiltersBar() {
    filtersBar.classList.add("is-visible");
  }

  function resetBar() {
    var chips = filtersBar.querySelectorAll(".active-filter-chip");
    chips.forEach(function (chip) {
      chip.classList.remove("is-visible");
    });
    return sleep(200).then(function () {
      filtersBar.classList.remove("is-visible");
      filtersBar.innerHTML = "";
    });
  }

  function collapseFilteredItems() {
    filteredOutItems.forEach(function (item, i) {
      setTimeout(function () {
        item.classList.add("is-filtered-out");
      }, i * 90);
    });
  }

  function restoreFilteredItems() {
    filteredOutItems.forEach(function (item) {
      item.classList.remove("is-filtered-out");
    });
  }

  function resetMenuState() {
    menu.querySelectorAll(".toolbar-filter-menu__item").forEach(function (item) {
      item.classList.remove("toolbar-filter-menu__item--active");
      item.setAttribute("aria-checked", "false");
    });
  }

  var running = true;

  async function runCycle() {
    await moveCursorTo(filtersBtn);
    await sleep(140);
    await pulseClick();
    openMenu();
    await sleep(360);

    for (var i = 0; i < FILTERS.length; i++) {
      if (!running) return;
      var entry = FILTERS[i];
      var item = menu.querySelector('[data-filter-key="' + entry.key + '"]');
      if (!item) continue;
      await moveCursorTo(item);
      await sleep(120);
      await pulseClick();
      item.classList.add("toolbar-filter-menu__item--active");
      item.setAttribute("aria-checked", "true");

      var chip = makeChip(LABELS[entry.chipKey]);
      filtersBar.appendChild(chip);
      showFiltersBar();
      void chip.offsetWidth;
      chip.classList.add("is-visible");
      await sleep(520);
    }

    collapseFilteredItems();
    await sleep(500);

    await moveCursorTo(filtersBtn, 60, 90);
    await sleep(120);
    await closeMenu();
    resetMenuState();
    await sleep(1700);

    if (!running) return;
    cursor.classList.remove("is-visible");
    await resetBar();
    restoreFilteredItems();
    await sleep(700);
  }

  async function loop() {
    await sleep(500);
    while (running) {
      try {
        await runCycle();
      } catch (err) {
        await sleep(1200);
      }
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      menu.classList.remove("is-open");
      menu.hidden = true;
      filtersBar.classList.remove("is-visible");
      filtersBar.innerHTML = "";
      resetMenuState();
      restoreFilteredItems();
      loop();
    }
  });

  loop();
}
