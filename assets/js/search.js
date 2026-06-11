/**
 * 镇海 — Zhenhai Theme Search
 *
 * Features:
 *  - Load search-index.json on demand
 *  - Fuzzy search (case-insensitive substring + scoring)
 *  - Results displayed in a modal
 *  - Highlight matched keywords
 *  - Debounce input (300ms)
 *  - Keyboard navigation: up/down, Enter, Esc, Ctrl+K
 */

(function () {
  "use strict";

  /* ================================================================ */
  /*  1. State                                                        */
  /* ================================================================ */

  var searchIndex = [];
  var searchIndexLoaded = false;
  var searchIndexLoading = false;

  var searchOverlay = document.getElementById("search-overlay");
  var searchModal = document.getElementById("search-modal");
  var searchInput = document.getElementById("search-input");
  var searchResults = document.getElementById("search-results");

  var activeResultIdx = -1;
  var debounceTimer = null;
  var searchIndexLoadFailed = false;

  /* ================================================================ */
  /*  2. Load Search Index                                            */
  /* ================================================================ */

  function loadSearchIndex(callback) {
    if (searchIndexLoaded) {
      if (callback) callback();
      return;
    }
    if (searchIndexLoading) {
      var checkLoaded = function () {
        if (searchIndexLoaded) {
          if (callback) callback();
        } else {
          setTimeout(checkLoaded, 50);
        }
      };
      checkLoaded();
      return;
    }

    searchIndexLoading = true;
    if (searchResults) {
      searchResults.textContent = "正在加载搜索索引...";
    }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/search-index.json", true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          searchIndex = JSON.parse(xhr.responseText);
          searchIndexLoaded = true;
          searchIndexLoadFailed = false;
        } catch (e) {
          console.error("Search: failed to parse search-index.json", e);
          searchIndex = [];
          searchIndexLoaded = true;
          searchIndexLoadFailed = true;
        }
      } else {
        console.error("Search: failed to load search-index.json, status:", xhr.status);
        searchIndex = [];
        searchIndexLoaded = true;
        searchIndexLoadFailed = true;
      }
      searchIndexLoading = false;
      if (callback) callback();
    };
    xhr.onerror = function () {
      console.error("Search: network error loading search-index.json");
      searchIndex = [];
      searchIndexLoaded = true;
      searchIndexLoadFailed = true;
      searchIndexLoading = false;
      if (callback) callback();
    };
    xhr.send();
  }

  /* ================================================================ */
  /*  3. Custom Scoring Search (weighted + recency boost)              */
  /* ================================================================ */

  function search(query) {
    if (!query || query.trim() === "") return [];
    var terms = query.trim().toLowerCase().split(/\s+/).filter(function (t) { return t.length > 0; });
    if (terms.length === 0) return [];

    var now = Date.now();
    var yearMs = 365.25 * 24 * 60 * 60 * 1000;
    var results = [];

    for (var i = 0; i < searchIndex.length; i++) {
      var entry = searchIndex[i];
      var titleLower = (entry.title || "").toLowerCase();
      var contentLower = (entry.content || "").toLowerCase();
      var summaryLower = (entry.summary || "").toLowerCase();
      var score = 0;

      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        if (titleLower.indexOf(term) >= 0) score += 10;
        if (entry.tags && entry.tags.some(function (tag) { return tag.toLowerCase().indexOf(term) >= 0; })) score += 5;
        if (summaryLower.indexOf(term) >= 0) score += 3;
        if (contentLower.indexOf(term) >= 0) score += 1;
      }

      if (score > 0) {
        // Recency boost: newer articles get up to +5 extra points
        if (entry.date) {
          var entryDate = new Date(entry.date).getTime();
          if (!isNaN(entryDate)) {
            var ageMs = now - entryDate;
            if (ageMs < yearMs) {
              score += 5;
            } else if (ageMs < 2 * yearMs) {
              score += 3;
            } else if (ageMs < 3 * yearMs) {
              score += 1;
            }
          }
        }
        results.push({ entry: entry, score: score });
      }
    }

    results.sort(function (a, b) { return b.score - a.score; });
    return results.slice(0, 20).map(function (r) { return r.entry; });
  }

  /* ================================================================ */
  /*  4. Render Results                                               */
  /* ================================================================ */

  function highlightKeyword(text, query) {
    if (!text || !query) return escapeHtml(text || "");
    var escaped = escapeHtml(text);
    var terms = query.trim().split(/\s+/).filter(function (t) { return t.length > 0; });
    var result = escaped;

    terms.forEach(function (term) {
      var regex = new RegExp("(" + escapeRegex(term) + ")", "gi");
      result = result.replace(regex, "<mark>$1</mark>");
    });

    return result;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderResults(results, query) {
    if (!searchResults) return;

    if (!query || query.trim() === "") {
      searchResults.textContent = "输入关键词搜索文章...";
      activeResultIdx = -1;
      return;
    }

    if (results.length === 0) {
      searchResults.textContent = "未找到相关内容，请尝试其他关键词";
      activeResultIdx = -1;
      return;
    }

    var html = "";
    for (var i = 0; i < results.length; i++) {
      var entry = results[i];
      var summary = entry.summary || "";
      if (!summary && entry.content) {
        summary = entry.content.substring(0, 150);
      }

      html +=
        '<a class="search-result-item" href="' +
        escapeHtml(entry.url) +
        '" data-index="' +
        i +
        '">' +
        '<div class="search-result-title">' +
        highlightKeyword(entry.title, query) +
        "</div>" +
        '<div class="search-result-summary">' +
        highlightKeyword(summary, query) +
        "</div>" +
        '<div class="search-result-meta">' +
        escapeHtml(entry.date || "") +
        (entry.category ? " / " + escapeHtml(entry.category) : "") +
        "</div>" +
        "</a>";
    }

    searchResults.innerHTML = html;
    activeResultIdx = -1;
  }

  /* ================================================================ */
  /*  5. Perform Search (debounced)                                   */
  /* ================================================================ */

  function performSearch(query) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      if (searchIndexLoadFailed) {
        if (searchResults) searchResults.textContent = "搜索索引加载失败，请刷新页面重试";
        return;
      }
      if (!searchIndexLoaded) {
        loadSearchIndex(function () {
          renderResults(search(query), query);
        });
      } else {
        renderResults(search(query), query);
      }
    }, 300);
  }

  /* ================================================================ */
  /*  6. Open / Close                                                 */
  /* ================================================================ */

  function openSearch() {
    if (!searchOverlay || !searchModal) return;

    searchOverlay.classList.add("active");
    searchModal.classList.add("active");

    if (searchIndexLoadFailed) {
      searchResults.textContent = "搜索索引加载失败，请刷新页面重试";
    } else {
      searchResults.textContent = searchIndexLoaded
        ? "输入关键词搜索文章..."
        : "正在加载搜索索引...";
    }

    setTimeout(function () {
      if (searchInput) searchInput.focus();
    }, 100);

    activeResultIdx = -1;

    if (!searchIndexLoaded) {
      loadSearchIndex(function () {
        if (searchInput && searchInput.value.trim()) {
          renderResults(search(searchInput.value), searchInput.value);
        } else if (searchResults) {
          searchResults.textContent = "输入关键词搜索文章...";
        }
      });
    }
  }

  function closeSearch() {
    if (!searchOverlay || !searchModal) return;
    searchOverlay.classList.remove("active");
    searchModal.classList.remove("active");
    if (searchInput) searchInput.value = "";
    if (searchResults) searchResults.textContent = "";
    activeResultIdx = -1;
    if (document.activeElement) document.activeElement.blur();
  }

  /* ================================================================ */
  /*  7. Keyboard Navigation                                          */
  /* ================================================================ */

  function navigateResults(direction) {
    var items = searchResults.querySelectorAll(".search-result-item");
    if (items.length === 0) return;

    if (activeResultIdx >= 0 && activeResultIdx < items.length) {
      items[activeResultIdx].classList.remove("active");
    }

    activeResultIdx += direction;
    if (activeResultIdx < 0) activeResultIdx = 0;
    if (activeResultIdx >= items.length) activeResultIdx = items.length - 1;

    items[activeResultIdx].classList.add("active");
    items[activeResultIdx].scrollIntoView({ block: "nearest" });
  }

  function activateCurrentResult() {
    var items = searchResults.querySelectorAll(".search-result-item");
    if (activeResultIdx >= 0 && activeResultIdx < items.length) {
      var url = items[activeResultIdx].getAttribute("href");
      if (url) window.location.href = url;
    }
  }

  /* ================================================================ */
  /*  8. Event Wiring                                                 */
  /* ================================================================ */

  function init() {
    document.querySelectorAll(".search-open-btn").forEach(function (btn) {
      btn.addEventListener("click", openSearch);
    });

    var closeBtn = document.getElementById("search-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeSearch);
    if (searchOverlay) searchOverlay.addEventListener("click", closeSearch);

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        performSearch(searchInput.value);
      });

      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          navigateResults(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          navigateResults(-1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (activeResultIdx >= 0) {
            activateCurrentResult();
          } else {
            var first = searchResults.querySelector(".search-result-item");
            if (first) window.location.href = first.getAttribute("href");
          }
        } else if (e.key === "Escape") {
          closeSearch();
        }
      });
    }

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (searchModal && searchModal.classList.contains("active")) {
          closeSearch();
        } else {
          openSearch();
        }
      }
      if (e.key === "Escape" && searchModal && searchModal.classList.contains("active")) {
        closeSearch();
      }
    });

    if (searchModal) {
      searchModal.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
  }

  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
