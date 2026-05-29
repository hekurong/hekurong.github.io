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

  const STORAGE_KEY = "zhenhai-color-mode";

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    // Respect system preference
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }

  function setTheme(mode) {
    document.body.classList.toggle("dark", mode === "dark");
    localStorage.setItem(STORAGE_KEY, mode);
    // Dispatch custom event for Mermaid and other listeners
    document.dispatchEvent(new CustomEvent("zhenhai-theme-change", { detail: { mode: mode } }));
  }

  function toggleTheme() {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    setTheme(next);
  }

  // Init theme on page load
  setTheme(getPreferredTheme());

  // Listen for system preference changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTheme(e.matches ? "dark" : "light");
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
    document.querySelectorAll(".code-wrapper, .article-content pre:not(.code-ln pre)").forEach(function (wrapper) {
      if (wrapper.querySelector(".copy-btn")) return;

      var codeBlock = wrapper.querySelector("code");
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
    initCopyButtons();
    initHighlightLines();
    initArchiveToggle();
    initMobileMenu();
    initReadingProgress();

    // Delay Mermaid init slightly to ensure DOM is fully rendered
    setTimeout(initMermaid, 100);
  });
})();
