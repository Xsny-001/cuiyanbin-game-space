/* ============================================================
   崔彦斌的游戏空间 · 首页交互
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  if (!App) return;

  var store = App.store;
  var utils = App.utils;

  var grid = document.getElementById("gameGrid");
  var cards = grid ? Array.prototype.slice.call(grid.querySelectorAll(".game-card")) : [];
  var searchInput = document.getElementById("search");
  var emptyState = document.getElementById("emptyState");
  var gameCount = document.getElementById("gameCount");

  var activeTag = "全部";
  var total = cards.length;

  /* ---------------- 成绩展示 ---------------- */

  function renderBestScores() {
    cards.forEach(function (card) {
      var el = card.querySelector(".card-best");
      if (!el) return;
      var id = el.dataset.game;
      var mode = el.dataset.mode || "best";

      if (mode === "wins") {
        var wins = App.scores.wins(id);
        el.textContent = wins > 0 ? wins + " 胜" : "暂无战绩";
        if (wins > 0) el.classList.add("is-record");
        return;
      }

      var value = store.get("best." + id, null);
      var prefix = el.dataset.prefix || "最高";
      var unit = el.dataset.unit || "分";
      if (typeof value === "number" && isFinite(value)) {
        el.textContent = prefix + " " + value + " " + unit;
        el.classList.add("is-record");
      } else {
        el.textContent = prefix + " —";
      }
    });
  }

  /* ---------------- 筛选 ---------------- */

  function applyFilters() {
    var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var visible = 0;

    cards.forEach(function (card) {
      var tags = (card.dataset.tags || "").split(/\s+/);
      var haystack = (
        (card.dataset.name || "") +
        " " +
        (card.textContent || "")
      ).toLowerCase();
      var matchTag = activeTag === "全部" || tags.indexOf(activeTag) !== -1;
      var matchQuery = !query || haystack.indexOf(query) !== -1;
      var show = matchTag && matchQuery;

      if (card.parentElement) card.parentElement.hidden = !show;
      if (show) visible += 1;
    });

    if (emptyState) emptyState.classList.toggle("is-visible", visible === 0);
    if (gameCount) {
      gameCount.textContent =
        visible === total ? total + " 款" : visible + " / " + total + " 款";
    }
  }

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      activeTag = chip.dataset.filter || "全部";
      document.querySelectorAll(".chip").forEach(function (other) {
        other.setAttribute("aria-pressed", other === chip ? "true" : "false");
      });
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        searchInput.value = "";
        applyFilters();
        searchInput.blur();
      }
    });
  }

  /* ---------------- 随机游戏 ---------------- */

  var jumpToRandom = function () {
    var pool = cards.filter(function (card) {
      return !card.parentElement || !card.parentElement.hidden;
    });
    if (pool.length === 0) pool = cards;
    if (pool.length === 0) return;
    App.sound.play("click");
    var target = pool[Math.floor(Math.random() * pool.length)];
    window.location.href = target.getAttribute("href");
  };

  ["randomGame", "heroRandom"].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", jumpToRandom);
  });

  /* ---------------- 导航与入场 ---------------- */

  var nav = document.getElementById("siteNav");
  var onScroll = function () {
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 8);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("is-in");
    });
  }

  /* ---------------- 键盘快捷键 ---------------- */

  document.addEventListener("keydown", function (event) {
    var tag = (event.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || event.target.isContentEditable;
    if (event.key === "/" && !typing && searchInput) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  /* ---------------- 联机大厅 ---------------- */

  var lobbyBtn = document.getElementById("lobbyBtn");
  var lobbyBusy = false;

  function narrowScreen() {
    return window.matchMedia("(max-width: 780px)").matches;
  }

  function paintLobby() {
    if (!lobbyBtn || !window.P2P) return;
    var label = lobbyBtn.querySelector(".nav-label");
    var brief = narrowScreen();
    if (P2P.connected) {
      lobbyBtn.dataset.state = "connected";
      if (label) {
        label.textContent = (brief ? "联机 · " : "联机大厅 · ") + P2P.peerCount;
      }
      lobbyBtn.title = "已连接大厅，共 " + P2P.peerCount + " 人在线";
    } else if (P2P.state === "signaling" || P2P.state === "searching") {
      lobbyBtn.dataset.state = "connecting";
      if (label) label.textContent = brief ? "连接中" : "连接中…";
    } else {
      lobbyBtn.dataset.state = "idle";
      if (label) label.textContent = brief ? "联机" : "联机大厅";
    }
  }

  window.addEventListener("resize", paintLobby);

  function enterLobby() {
    if (!window.P2P) return Promise.reject(new Error("no p2p"));
    if (P2P.connected) return Promise.resolve();
    if (lobbyBusy) return Promise.resolve();
    lobbyBusy = true;

    return P2P.enter("lobby", {
      onStatus: paintLobby,
      onPeerJoin: function () {
        paintLobby();
        if (window.Chat && Chat.setOnline) Chat.setOnline(P2P.peerCount);
      },
      onPeerLeave: function () {
        paintLobby();
        if (window.Chat && Chat.setOnline) Chat.setOnline(P2P.peerCount);
      }
    })
      .then(function () {
        if (window.Chat) {
          Chat.mount({ title: "大厅" });
          Chat.setOnline(P2P.peerCount);
        }
        paintLobby();
        lobbyBusy = false;
      })
      .catch(function (e) {
        lobbyBusy = false;
        paintLobby();
        if (e && e.code === "auth") return;
        if (App.toast) App.toast("大厅连接失败，请稍后再试");
        throw e;
      });
  }

  if (lobbyBtn) {
    lobbyBtn.addEventListener("click", function () {
      if (P2P.connected) {
        if (window.Chat) Chat.toggle();
        return;
      }
      enterLobby().catch(function () {});
    });
  }

  /* 已登录就静默恢复大厅，不弹任何窗 */
  if (window.P2P && P2P.current()) {
    window.setTimeout(enterLobby, 300);
  }

  /* 进入联机游戏前提示会断线；单机游戏完全不拦 */
  document.addEventListener(
    "click",
    function (event) {
      var link = event.target.closest ? event.target.closest('a[href^="games/"]') : null;
      if (!link) return;
      if (!link.getAttribute("data-online")) return;
      if (!window.P2P || !P2P.connected) return;

      event.preventDefault();
      if (window.confirm("即将进入游戏房间，大厅连接将断开，请在游戏内重新交流。")) {
        var target = link.getAttribute("href");
        var jumped = false;
        var go = function () {
          if (jumped) return;
          jumped = true;
          window.location.href = target;
        };
        /* 先退房再跳，避免旧连接占着信令，新页面建连超时 */
        try {
          P2P.leave();
        } catch (e) {}
        window.setTimeout(go, 220);
      }
    },
    true
  );

  /* ---------------- 初始化 ---------------- */

  paintLobby();
  renderBestScores();
  applyFilters();

  // 从游戏页返回时刷新成绩
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) renderBestScores();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) renderBestScores();
  });
})();
