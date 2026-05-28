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
      searchResults.textContent = "Loading search index...";
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
  /*  3. Fuzzy Search + Scoring                                       */
  /* ================================================================ */

  function scoreMatch(entry, query) {
    var q = query.toLowerCase();
    var title = (entry.title || "").toLowerCase();
    var summary = (entry.summary || "").toLowerCase();
    var content = (entry.content || "").toLowerCase();
    var tags = (entry.tags || []).join(" ").toLowerCase();
    var category = (entry.category || "").toLowerCase();

    if (
      title.indexOf(q) === -1 &&
      summary.indexOf(q) === -1 &&
      content.indexOf(q) === -1 &&
      tags.indexOf(q) === -1 &&
      category.indexOf(q) === -1
    ) {
      return 0;
    }

    var score = 0;
    if (title.indexOf(q) !== -1) score += 100;
    if (title.indexOf(q) === 0) score += 50;
    if (tags.indexOf(q) !== -1) score += 30;
    if (category.indexOf(q) !== -1) score += 20;
    if (summary.indexOf(q) !== -1) score += 15;
    if (content.indexOf(q) !== -1) score += 5;
    if (title === q) score += 80;

    var tagArr = entry.tags || [];
    for (var t = 0; t < tagArr.length; t++) {
      if (tagArr[t].toLowerCase() === q) {
        score += 40;
        break;
      }
    }

    return score;
  }

  function search(query) {
    if (!query || query.trim() === "") return [];

    var q = query.trim().toLowerCase();
    var terms = q.split(/\s+/).filter(function (t) { return t.length > 0; });
    var results = [];

    for (var i = 0; i < searchIndex.length; i++) {
      var entry = searchIndex[i];
      var totalScore = 0;
      var allTermsMatch = true;

      for (var ti = 0; ti < terms.length; ti++) {
        var termScore = scoreMatch(entry, terms[ti]);
        if (termScore === 0) {
          allTermsMatch = false;
          break;
        }
        totalScore += termScore;
      }

      if (!allTermsMatch) continue;
      totalScore += scoreMatch(entry, q);

      if (entry.date) {
        var dateParts = entry.date.split("-");
        if (dateParts.length === 3) {
          var year = parseInt(dateParts[0], 10);
          var month = parseInt(dateParts[1], 10);
          var recencyScore = (year - 2020) * 2 + month / 12;
          if (recencyScore > 0) totalScore += recencyScore;
        }
      }

      results.push({ entry: entry, score: totalScore });
    }

    results.sort(function (a, b) { return b.score - a.score; });
    return results.map(function (r) { return r.entry; });
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
      searchResults.textContent = "Enter keyword to search...";
      activeResultIdx = -1;
      return;
    }

    if (results.length === 0) {
      searchResults.textContent = "未找到相关内容";
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
        if (searchResults) searchResults.textContent = "搜索不可用";
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
      searchResults.textContent = "搜索不可用";
    } else {
      searchResults.textContent = searchIndexLoaded
        ? "Enter keyword to search..."
        : "Loading search index...";
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
          searchResults.textContent = "Enter keyword to search...";
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
