/**
 * 镇海 — Zhenhai Theme Main JavaScript
 *
 * Features:
 *  - Dark/light mode toggle (respects system pref, saves to localStorage)
 *  - Floating TOC with IntersectionObserver for active heading tracking
 *  - Code block copy button
 *  - Archive year/month expand/collapse
 *  - Mobile hamburger menu toggle
 *  - Reading progress bar
 *  - Mermaid initialization & re-render on theme switch
 */

(function () {
  "use strict";

  /* ================================================================ */
  /*  1. Dark/Light Mode Toggle                                       */
  /* ================================================================ */

  var STORAGE_KEY = "zhenhai-color-mode";

  function getTheme() {
    return document.body.classList.contains("dark") ? "dark" : "light";
  }

  function setTheme(mode, save) {
    document.body.classList.toggle("dark", mode === "dark");
    if (save !== false) {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    document.dispatchEvent(new CustomEvent("zhenhai-theme-change", { detail: { mode: mode } }));
  }

  function toggleTheme() {
    var next = getTheme() === "dark" ? "light" : "dark";
    setTheme(next);
  }

  // Init: only set localStorage if explicitly stored (not auto)
  var stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    setTheme(stored, false); // don't re-save, already stored
  }

  // Listen for system changes — always active
  var sysDark = window.matchMedia("(prefers-color-scheme: dark)");
  sysDark.addEventListener("change", function (e) {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTheme(e.matches ? "dark" : "light", false);
    }
  });

  /* ================================================================ */
  /*  2. Floating TOC                                                 */
  /* ================================================================ */

  function initTOC() {
    var tocList = document.getElementById("floating-toc-list");
    if (!tocList) return;

    // Build TOC from article content headings (h2, h3, h4)
    var article = document.querySelector(".article-content");
    if (!article) return;

    var headings = article.querySelectorAll("h2, h3, h4");
    if (headings.length < 2) return; // No TOC for fewer than 2 headings

    var tocEntries = [];

    headings.forEach(function (heading) {
      var level = parseInt(heading.tagName.substring(1), 10);
      var id = heading.getAttribute("id");
      if (!id) {
        // Generate an id if missing
        id = "heading-" + Math.random().toString(36).substring(2, 8);
        heading.setAttribute("id", id);
      }

      var li = document.createElement("li");
      var a = document.createElement("a");
      a.setAttribute("href", "#" + id);
      a.className = "toc-h" + level;
      a.textContent = heading.textContent;
      li.appendChild(a);
      tocList.appendChild(li);

      tocEntries.push({ el: heading, link: a });
    });

    if (tocEntries.length === 0) return;

    // IntersectionObserver for active heading tracking
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            tocEntries.forEach(function (te) {
              te.link.classList.remove("active");
            });
            for (var i = 0; i < tocEntries.length; i++) {
              if (tocEntries[i].el === entry.target) {
                tocEntries[i].link.classList.add("active");
                tocEntries[i].link.scrollIntoView({ block: "nearest", behavior: "smooth" });
                break;
              }
            }
          }
        });
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    tocEntries.forEach(function (te) {
      observer.observe(te.el);
    });

    // Smooth scroll on click with header offset
    tocEntries.forEach(function (te) {
      te.link.addEventListener("click", function (e) {
        e.preventDefault();
        var target = document.getElementById(te.link.getAttribute("href").substring(1));
        if (target) {
          var headerOffset = 80;
          var targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
          window.scrollTo({ top: targetPosition, behavior: "smooth" });
          history.pushState(null, null, "#" + target.id);
        }
      });
    });
  }

  /* ================================================================ */
  /*  3. Code Copy Button                                             */
  /* ================================================================ */

  function initCopyButtons() {
    document.querySelectorAll(".code-wrapper, .article-content pre.chroma").forEach(function (wrapper) {
      // Skip pre.chroma that is inside a code-wrapper (already handled by wrapper)
      if (!wrapper.classList.contains("code-wrapper") && wrapper.closest(".code-wrapper")) return;
      if (wrapper.querySelector(".copy-btn")) return;

      var codeBlock;
      if (wrapper.classList.contains("code-wrapper")) {
        codeBlock = wrapper.querySelector(".code-body code");
      } else {
        codeBlock = wrapper.querySelector("code");
      }
      if (!codeBlock) return;

      var btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");

      btn.addEventListener("click", function () {
        var text = codeBlock.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              btn.textContent = "Copied!";
              btn.classList.add("copied");
              setTimeout(function () {
                btn.textContent = "Copy";
                btn.classList.remove("copied");
              }, 2000);
            },
            function () {
              fallbackCopy(text, btn);
            }
          );
        } else {
          fallbackCopy(text, btn);
        }
      });

      wrapper.style.position = "relative";
      wrapper.appendChild(btn);
    });
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(function () {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 2000);
    } catch (e) {
      btn.textContent = "Failed";
    }
    document.body.removeChild(ta);
  }

  /* ================================================================ */
  /*  3.5. Highlight Lines                                             */
  /* ================================================================ */

  function initHighlightLines() {
    document.querySelectorAll('pre.chroma[data-hl-lines]').forEach(function (pre) {
      var ranges = pre.getAttribute('data-hl-lines');
      if (!ranges) return;
      var hlSet = new Set();
      ranges.split(',').forEach(function (part) {
        part = part.trim();
        if (part.includes('-')) {
          var segs = part.split('-');
          var start = parseInt(segs[0], 10);
          var end = parseInt(segs[1], 10);
          for (var i = start; i <= end; i++) hlSet.add(i);
        } else {
          hlSet.add(parseInt(part, 10));
        }
      });

      var lines = pre.querySelectorAll('.line');
      lines.forEach(function (line, i) {
        if (hlSet.has(i + 1)) {
          line.classList.add('hl');
        }
      });
    });
  }

  /* ================================================================ */
  /*  4. Archive Expand / Collapse                                    */
  /* ================================================================ */

  function initArchiveToggle() {
    // Year toggles
    document.querySelectorAll(".archive-year-marker").forEach(function (marker) {
      marker.addEventListener("click", function () {
        var months = marker.nextElementSibling;
        if (months && months.classList.contains("archive-months")) {
          months.classList.toggle("collapsed");
          var toggle = marker.querySelector(".archive-year-toggle");
          if (toggle) {
            toggle.textContent = months.classList.contains("collapsed") ? "[+]" : "[-]";
          }
        }
      });
      // Trigger click to collapse by default (years expanded, months initially shown)
      // We'll leave them expanded by default
    });

    // Month toggles
    document.querySelectorAll(".archive-month-header").forEach(function (header) {
      header.addEventListener("click", function () {
        var posts = header.nextElementSibling;
        if (posts && posts.classList.contains("archive-month-posts")) {
          posts.classList.toggle("collapsed");
        }
      });
    });
  }

  /* ================================================================ */
  /*  5. Mobile Hamburger Menu                                        */
  /* ================================================================ */

  function initMobileMenu() {
    var hamburger = document.getElementById("hamburger-btn");
    var overlay = document.getElementById("mobile-menu-overlay");
    var panel = document.getElementById("mobile-menu-panel");
    var closeBtn = document.getElementById("mobile-menu-close");

    if (!hamburger || !overlay || !panel) return;

    function openMenu() {
      overlay.classList.add("active");
      panel.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    function closeMenu() {
      overlay.classList.remove("active");
      panel.classList.remove("active");
      document.body.style.overflow = "";
    }

    hamburger.addEventListener("click", openMenu);
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    overlay.addEventListener("click", closeMenu);

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("active")) {
        closeMenu();
      }
    });
  }

  /* ================================================================ */
  /*  6. Reading Progress Bar                                         */
  /* ================================================================ */

  function initReadingProgress() {
    var bar = document.getElementById("reading-progress-bar");
    if (!bar) return;

    function updateProgress() {
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (docHeight <= 0) {
        bar.style.width = "0%";
        return;
      }
      var progress = (scrollTop / docHeight) * 100;
      bar.style.width = Math.min(progress, 100) + "%";
    }

    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
    updateProgress();
  }

  /* ================================================================ */
  /*  7. Mermaid Initialization                                       */
  /* ================================================================ */

  function initMermaid() {
    if (typeof mermaid === "undefined") return;

    var isDark = document.body.classList.contains("dark");

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      themeVariables: isDark
        ? {
            primaryColor: "#2e2e36",
            primaryTextColor: "#e8e0d0",
            primaryBorderColor: "#3a3a42",
            lineColor: "#d4af37",
            secondaryColor: "#1e2a36",
            tertiaryColor: "#222228",
          }
        : {
            primaryColor: "#f0ece4",
            primaryTextColor: "#2c2c2c",
            primaryBorderColor: "#d4c9a8",
            lineColor: "#b8962e",
            secondaryColor: "#eef4f8",
            tertiaryColor: "#f7f4ef",
          },
    });

    // Render all mermaid diagrams
    document.querySelectorAll(".mermaid").forEach(function (el) {
      mermaid.run({ nodes: [el] });
    });
  }

  // Re-render Mermaid on theme change
  document.addEventListener("zhenhai-theme-change", function () {
    if (typeof mermaid === "undefined") return;
    // Re-initialize with new theme and re-render
    initMermaid();
  });

  /* ================================================================ */
  /*  7.5. Heading Anchor Links                                        */
  /* ================================================================ */

  function initHeadingAnchors() {
    document.querySelectorAll('.article-content h2[id], .article-content h3[id], .article-content h4[id]').forEach(function (h) {
      var a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = '#' + h.id;
      a.textContent = '#';
      a.setAttribute('aria-label', 'Link to this heading');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        location.hash = h.id;
        navigator.clipboard.writeText(location.origin + location.pathname + '#' + h.id).catch(function () {});
      });
      h.appendChild(a);
    });
  }

  /* ================================================================ */
  /*  Keyboard Shortcuts (E8)                                          */
  /* ================================================================ */

  function initKeyboardShortcuts() {
    var shortcutsPanel = document.getElementById('shortcuts-panel');
    if (!shortcutsPanel) return;

    var ghTimer = null;

    document.addEventListener('keydown', function (e) {
      // Don't trigger in inputs
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      // ? toggle shortcuts (no modifier)
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        shortcutsPanel.classList.toggle('active');
        return;
      }

      // Esc close
      if (e.key === 'Escape' && shortcutsPanel.classList.contains('active')) {
        shortcutsPanel.classList.remove('active');
        return;
      }

      // j/k navigation (only on single post pages)
      if (e.key === 'j' && !e.ctrlKey && !e.metaKey) {
        var next = document.querySelector('.post-nav-link.next');
        if (next) { e.preventDefault(); next.click(); }
      }
      if (e.key === 'k' && !e.ctrlKey && !e.metaKey) {
        var prev = document.querySelector('.post-nav-link.prev');
        if (prev) { e.preventDefault(); prev.click(); }
      }

      // g + h → home, g + t → top (vim-style)
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        if (ghTimer) clearTimeout(ghTimer);
        ghTimer = setTimeout(function () { ghTimer = null; }, 500);
        return;
      }
      if (e.key === 'h' && ghTimer) {
        e.preventDefault();
        window.location.href = '/';
        ghTimer = null;
      }
      if (e.key === 't' && ghTimer) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        ghTimer = null;
      }
    });

    // Close shortcuts on click outside
    shortcutsPanel.addEventListener('click', function (e) {
      if (e.target === shortcutsPanel) shortcutsPanel.classList.remove('active');
    });
  }

  /* ================================================================ */
  /*  Tag Cloud Sort (E14)                                             */
  /* ================================================================ */

  /* ================================================================ */
  /*  Archive Heatmap (E13)                                            */
  /* ================================================================ */

  function initHeatmap() {
    var container = document.getElementById('archive-heatmap');
    if (!container) return;
    var raw = container.dataset.heatmap;
    if (!raw) return;
    var hm;
    try { hm = JSON.parse(raw); } catch (e) { return; }
    if (!hm.years || !hm.years.length) { container.style.display = 'none'; return; }

    var countMap = hm.data;
    var currentYear = hm.years[0];
    var DAY_MS = 86400000;
    var dayNames = ['', '一', '', '三', '', '五', '']; // Mon, Wed, Fri labels

    function renderHeatmap(year) {
      container.innerHTML = '';

      // Year switcher
      if (hm.years.length > 1) {
        var switcher = document.createElement('div');
        switcher.className = 'heatmap-year-switcher';
        hm.years.forEach(function (y) {
          var btn = document.createElement('button');
          btn.className = 'heatmap-year-btn' + (y === year ? ' active' : '');
          btn.textContent = y + '年';
          btn.addEventListener('click', function () { renderHeatmap(y); });
          switcher.appendChild(btn);
        });
        container.appendChild(switcher);
      }

      var wrapper = document.createElement('div');
      wrapper.className = 'heatmap-wrapper';

      // Build week-based grid for the year
      var yearStart = new Date(year, 0, 1);
      var yearEnd = new Date(year, 11, 31);
      var today = new Date();
      if (yearEnd > today) yearEnd = today;

      // Find the Monday on or before Jan 1
      var gridStart = new Date(yearStart);
      var startDay = gridStart.getDay(); // 0=Sun, 1=Mon, ...
      var daysToMonday = startDay === 0 ? 6 : startDay - 1;
      gridStart.setDate(gridStart.getDate() - daysToMonday);

      // Build weeks: each week is 7 cells (Mon-Sun)
      var weeks = [];
      var weekLabels = []; // month labels per week
      var currentMonth = -1;
      var d = new Date(gridStart);

      while (d <= yearEnd) {
        var week = [];
        for (var i = 0; i < 7; i++) {
          var ds = d.toISOString().slice(0, 10);
          var isInYear = d.getFullYear() === year;
          week.push({
            date: ds,
            count: isInYear ? (countMap[ds] || 0) : -1,
            inYear: isInYear,
            month: d.getMonth()
          });
          d = new Date(d.getTime() + DAY_MS);
        }
        weeks.push(week);

        // Check if a new month starts in this week
        var firstInYear = null;
        for (var j = 0; j < 7; j++) {
          if (week[j].inYear) { firstInYear = week[j]; break; }
        }
        if (firstInYear && firstInYear.month !== currentMonth) {
          currentMonth = firstInYear.month;
          weekLabels.push({ weekIdx: weeks.length - 1, label: (currentMonth + 1) + '月' });
        }
      }

      // Month labels — absolutely positioned over the grid
      var COL_W = 14; // 12px cell + 2px gap
      var DAY_W = 20; // day label column width
      var monthBar = document.createElement('div');
      monthBar.className = 'heatmap-month-bar';
      weekLabels.forEach(function (wl) {
        var label = document.createElement('span');
        label.className = 'heatmap-month-label';
        label.textContent = wl.label;
        label.style.left = (DAY_W + wl.weekIdx * COL_W) + 'px';
        monthBar.appendChild(label);
      });
      wrapper.appendChild(monthBar);

      // Render grid with day labels
      var gridContainer = document.createElement('div');
      gridContainer.className = 'heatmap-grid-container';

      // Day labels (left side)
      var dayCol = document.createElement('div');
      dayCol.className = 'heatmap-day-labels';
      for (var di = 0; di < 7; di++) {
        var dl = document.createElement('div');
        dl.className = 'heatmap-day-label';
        dl.textContent = dayNames[di];
        dayCol.appendChild(dl);
      }
      gridContainer.appendChild(dayCol);

      // Cell grid
      var cellGrid = document.createElement('div');
      cellGrid.className = 'heatmap-cell-grid';

      for (var wi2 = 0; wi2 < weeks.length; wi2++) {
        var col = document.createElement('div');
        col.className = 'heatmap-week-col';
        for (var di2 = 0; di2 < 7; di2++) {
          var cellData = weeks[wi2][di2];
          var cellEl = document.createElement('div');
          cellEl.className = 'heatmap-cell';
          if (cellData.count < 0) {
            cellEl.style.visibility = 'hidden';
          } else {
            var c = cellData.count;
            if (c > 0) cellEl.dataset.count = Math.min(c, 5);
            cellEl.title = cellData.date + ': ' + c + ' 篇';
          }
          col.appendChild(cellEl);
        }
        cellGrid.appendChild(col);
      }
      gridContainer.appendChild(cellGrid);
      wrapper.appendChild(gridContainer);

      // Legend
      var legend = document.createElement('div');
      legend.className = 'heatmap-legend';
      legend.innerHTML = '少 <span style="background:var(--color-border-light)"></span> <span style="background:#9be9a8"></span> <span style="background:#40c463"></span> <span style="background:#30a14e"></span> <span style="background:#216e39"></span> <span style="background:#0e4429"></span> 多';
      wrapper.appendChild(legend);

      container.appendChild(wrapper);
    }

    renderHeatmap(currentYear);
  }

  function initTagSort() {
    var bar = document.querySelector('.tag-sort-bar');
    if (!bar) return;
    var cloud = document.querySelector('.tag-cloud');
    if (!cloud) return;

    // Collect tag data from DOM
    function getItems() {
      return Array.from(cloud.querySelectorAll('.tag-cloud-item')).map(function (el) {
        return {
          el: el,
          name: (el.querySelector('.tag-cloud-name') || {}).textContent || '',
          count: parseInt(el.dataset.count) || 0
        };
      });
    }

    bar.querySelectorAll('.tag-sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        bar.querySelectorAll('.tag-sort-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var sort = btn.dataset.sort;
        var items = getItems();
        if (sort === 'name') {
          items.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
        } else if (sort === 'count') {
          items.sort(function (a, b) { return b.count - a.count; });
        }
        items.forEach(function (item) { cloud.appendChild(item.el); });
      });
    });
  }

  /* ================================================================ */
  /*  8. Initialization on DOM ready                                  */
  /* ================================================================ */

  function ready(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  ready(function () {
    // Theme toggle buttons
    document.querySelectorAll(".theme-toggle-btn").forEach(function (btn) {
      btn.addEventListener("click", toggleTheme);
    });

    initTOC();
    initHeadingAnchors();
    initCopyButtons();
    initHighlightLines();
    initArchiveToggle();
    initMobileMenu();
    initReadingProgress();
    initSettingsPanel();
    initTagSort();
    initKeyboardShortcuts();
    initHeatmap();

    // Delay Mermaid init slightly to ensure DOM is fully rendered
    setTimeout(initMermaid, 100);

    /* Image lightbox — click to enlarge */
    document.querySelectorAll('.article-content figure img').forEach(function(img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function() {
        var overlay = document.createElement('div');
        overlay.className = 'lightbox-overlay';
        var clone = img.cloneNode(true);
        clone.style.cursor = 'zoom-out';
        overlay.appendChild(clone);
        var escHandler = function(e) {
          if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
        };
        overlay.addEventListener('click', function() { overlay.remove(); document.removeEventListener('keydown', escHandler); });
        document.addEventListener('keydown', escHandler);
        document.body.appendChild(overlay);
      });
    });

    /* Back to top */
    var backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      window.addEventListener('scroll', function() {
        backToTop.classList.toggle('visible', window.scrollY > 400);
      }, { passive: true });
      backToTop.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  });
})();

  /* ================================================================ */
  /*  Settings Panel (E1/E2/E3)                                       */
  /* ================================================================ */

  function initSettingsPanel() {
    var btn = document.getElementById('settings-btn');
    var panel = document.getElementById('settings-panel');
    var close = document.getElementById('settings-close');
    if (!btn || !panel) return;

    function open() {
      panel.classList.add('active');
      panel.setAttribute('aria-hidden', 'false');
    }
    function closeFn() {
      panel.classList.remove('active');
      panel.setAttribute('aria-hidden', 'true');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.contains('active') ? closeFn() : open();
    });
    if (close) close.addEventListener('click', closeFn);

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('active') &&
          !panel.contains(e.target) &&
          e.target !== btn) {
        closeFn();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('active')) {
        closeFn();
      }
    });

    // Hide dark level settings when in light mode
    var darkGroup = document.getElementById('dark-level-group');
    function updateDarkLevelVisibility() {
      if (darkGroup) {
        darkGroup.style.display = document.body.classList.contains('dark') ? '' : 'none';
      }
    }
    updateDarkLevelVisibility();
    document.addEventListener('zhenhai-theme-change', updateDarkLevelVisibility);

    // Load saved settings on init
    ['font-size', 'reading-width', 'dark-level'].forEach(function (key) {
      var val = localStorage.getItem('zhenhai-' + key);
      if (val) {
        applySetting(key, val, false);
      }
    });

    // Bind option buttons
    panel.querySelectorAll('.settings-options').forEach(function (group) {
      var key = group.dataset.setting;
      group.querySelectorAll('.setting-option').forEach(function (opt) {
        opt.addEventListener('click', function () {
          group.querySelectorAll('.setting-option').forEach(function (o) { o.classList.remove('active'); });
          opt.classList.add('active');
          var val = opt.dataset.value;
          localStorage.setItem('zhenhai-' + key, val);
          applySetting(key, val, true);
        });
      });
    });
  }

  function applySetting(key, val, updateUI) {
    if (key === 'font-size') {
      document.documentElement.setAttribute('data-font-size', val);
      if (updateUI) {
        var group = document.querySelector('[data-setting="font-size"]');
        if (group) {
          group.querySelectorAll('.setting-option').forEach(function (o) {
            o.classList.toggle('active', o.dataset.value === val);
          });
        }
      }
    }
    if (key === 'reading-width') {
      document.documentElement.setAttribute('data-reading-width', val);
      if (updateUI) {
        var group = document.querySelector('[data-setting="reading-width"]');
        if (group) {
          group.querySelectorAll('.setting-option').forEach(function (o) {
            o.classList.toggle('active', o.dataset.value === val);
          });
        }
      }
    }
    if (key === 'dark-level') {
      document.documentElement.setAttribute('data-dark-level', val);
      if (updateUI) {
        var group = document.querySelector('[data-setting="dark-level"]');
        if (group) {
          group.querySelectorAll('.setting-option').forEach(function (o) {
            o.classList.toggle('active', o.dataset.value === val);
          });
        }
      }
    }
  }
