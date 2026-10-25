/* ============================================================
   扫雷
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;
  var utils = App.utils;
  var store = App.store;

  var LEVELS = {
    easy: { cols: 9, rows: 9, mines: 10, label: "初级" },
    medium: { cols: 16, rows: 16, mines: 40, label: "中级" },
    hard: { cols: 30, rows: 16, mines: 99, label: "高级" }
  };

  var board = document.getElementById("board");
  var wrap = document.getElementById("wrap");
  var stage = document.getElementById("stage");
  var flagToggle = document.getElementById("flagToggle");
  var minesLeftEl = document.getElementById("minesLeft");
  var timerEl = document.getElementById("timer");
  var bestTimeEl = document.getElementById("bestTime");
  var overlay = document.getElementById("overlay");
  var kickerEl = document.getElementById("kicker");
  var titleEl = document.getElementById("overlayTitle");
  var textEl = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var restartBtn = document.getElementById("restartBtn");

  var levelKey = "easy";
  var config = LEVELS.easy;
  var cells = [];
  var state = "idle";
  var flags = 0;
  var revealedCount = 0;
  var startedAt = 0;
  var elapsed = 0;
  var timerId = null;
  var flagMode = false;
  var suppressClickUntil = 0;
  var pressTimer = null;
  var pressCell = null;

  /* 纪录结构版本：v1 纪录已被首点假胜利污染，v2 起按难度独立存储 */
  var RECORD_SCHEMA = 2;
  var RECORD_PREFIX = "minesweeper.v" + RECORD_SCHEMA + ".best.";
  var RECORD_SCHEMA_KEY = "minesweeper.records.schema";
  var GLOBAL_RECORD_ID = "minesweeper.v2";
  var LEVEL_KEYS = ["easy", "medium", "hard"];

  /* ---------------- 基础 ---------------- */

  function neighborsOf(index) {
    var row = Math.floor(index / config.cols);
    var col = index % config.cols;
    var out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = row + dr;
        var nc = col + dc;
        if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols) {
          out.push(nr * config.cols + nc);
        }
      }
    }
    return out;
  }

  function clearTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function currentSeconds() {
    if (!startedAt) return 0;
    return Math.max(0, (performance.now() - startedAt) / 1000);
  }

  function startTimer() {
    clearTimer();
    startedAt = performance.now();
    elapsed = 0;
    timerEl.textContent = "0";
    timerId = window.setInterval(function () {
      if (state !== "playing") return;
      elapsed = currentSeconds();
      timerEl.textContent = Math.floor(elapsed);
    }, 200);
  }

  function ensureRecordSchema() {
    var current = Number(store.get(RECORD_SCHEMA_KEY, 0));
    if (current >= RECORD_SCHEMA) return;

    // v1 的“1 秒”纪录来自首点误判，无法区分真伪，统一作废。
    LEVEL_KEYS.forEach(function (key) {
      store.remove("minesweeper.best." + key);
    });
    store.remove("best.minesweeper");
    store.remove("best." + GLOBAL_RECORD_ID);
    store.set(RECORD_SCHEMA_KEY, RECORD_SCHEMA);
  }

  function bestKey(level) {
    return RECORD_PREFIX + level;
  }

  function readBest(level) {
    var record = store.get(bestKey(level), null);
    if (
      record &&
      typeof record === "object" &&
      typeof record.seconds === "number" &&
      isFinite(record.seconds) &&
      record.seconds >= 0
    ) {
      return record.seconds;
    }
    // 兼容 v2 早期可能写入的纯数字形式
    if (typeof record === "number" && isFinite(record) && record >= 0) {
      return record;
    }
    if (record !== null) store.remove(bestKey(level));
    return null;
  }

  function saveBest(level, seconds, elapsedSeconds) {
    var previous = readBest(level);
    var valid =
      isFinite(seconds) &&
      seconds > 0 &&
      isFinite(elapsedSeconds) &&
      elapsedSeconds > 0;
    if (!valid) {
      return { best: previous, isRecord: false };
    }
    if (previous !== null && seconds >= previous) {
      return { best: previous, isRecord: false };
    }
    var saved = store.set(bestKey(level), {
      seconds: seconds,
      elapsedMs: Math.round(elapsedSeconds * 1000),
      savedAt: Date.now()
    });
    if (!saved) return { best: previous, isRecord: false };
    return { best: seconds, isRecord: true };
  }

  function refreshBest() {
    var value = readBest(levelKey);
    bestTimeEl.textContent = value === null ? "—" : value + " 秒";
  }

  function updateMineCount() {
    minesLeftEl.textContent = String(config.mines - flags);
  }

  function updateDifficultyButtons() {
    document.querySelectorAll("[data-level]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.level === levelKey);
    });
  }

  /* ---------------- 建立棋盘 ---------------- */

  function resizeBoard() {
    if (!wrap || !config) return;
    var available = Math.max(200, (wrap.clientWidth || stage.clientWidth) - 8);
    var size = Math.floor((available - 2 * (config.cols - 1)) / config.cols);
    size = Math.max(16, Math.min(36, size));
    board.style.setProperty("--cell", size + "px");
  }

  function buildBoard() {
    board.innerHTML = "";
    cells = [];
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < config.cols * config.rows; i++) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "ms-cell";
      el.dataset.index = String(i);
      el.setAttribute("role", "gridcell");
      el.setAttribute("aria-label", "未翻开");

      cells.push({
        index: i,
        mine: false,
        revealed: false,
        flagged: false,
        count: 0,
        el: el
      });
      fragment.appendChild(el);
    }

    board.appendChild(fragment);
    board.style.gridTemplateColumns =
      "repeat(" + config.cols + ", var(--cell, 28px))";
    board.setAttribute("aria-rowcount", String(config.rows));
    board.setAttribute("aria-colcount", String(config.cols));
    resizeBoard();
  }

  /* ---------------- 新局 ---------------- */

  function newGame(key) {
    levelKey = key || levelKey;
    config = LEVELS[levelKey];
    state = "idle";
    flags = 0;
    revealedCount = 0;
    elapsed = 0;
    startedAt = 0;
    suppressClickUntil = 0;
    clearTimer();
    overlay.hidden = true;
    timerEl.textContent = "0";

    updateDifficultyButtons();
    buildBoard();
    refreshBest();
    updateMineCount();
  }

  /* ---------------- 布雷 ---------------- */

  function placeMines(safeIndex) {
    var forbidden = {};
    forbidden[safeIndex] = true;
    neighborsOf(safeIndex).forEach(function (i) {
      forbidden[i] = true;
    });

    var pool = [];
    for (var i = 0; i < cells.length; i++) {
      if (!forbidden[i]) pool.push(i);
    }

    // 极端情况下（雷太多）只保证首点本身安全
    if (pool.length < config.mines) {
      pool = [];
      for (var j = 0; j < cells.length; j++) {
        if (j !== safeIndex) pool.push(j);
      }
    }

    // utils.shuffle 返回新数组，必须接收返回值，否则雷会固定堆在左上角
    pool = utils.shuffle(pool);
    for (var k = 0; k < config.mines; k++) {
      cells[pool[k]].mine = true;
    }

    for (var n = 0; n < cells.length; n++) {
      if (cells[n].mine) continue;
      var count = 0;
      var around = neighborsOf(n);
      for (var a = 0; a < around.length; a++) {
        if (cells[around[a]].mine) count += 1;
      }
      cells[n].count = count;
    }
  }

  /* ---------------- 渲染 ---------------- */

  function renderCell(cell) {
    var el = cell.el;
    el.className = "ms-cell";

    if (cell.revealed) {
      el.classList.add("is-revealed");
      if (cell.mine) {
        el.classList.add("is-mine");
        el.textContent = "💣";
        el.setAttribute("aria-label", "地雷");
      } else if (cell.count > 0) {
        el.classList.add("n" + cell.count);
        el.textContent = String(cell.count);
        el.setAttribute("aria-label", cell.count + " 颗相邻地雷");
      } else {
        el.textContent = "";
        el.setAttribute("aria-label", "空格");
      }
      return;
    }

    if (cell.flagged) {
      el.classList.add("is-flagged");
      el.textContent = "🚩";
      el.setAttribute("aria-label", "已插旗");
    } else {
      el.textContent = "";
      el.setAttribute("aria-label", "未翻开");
    }
  }

  /* ---------------- 操作 ---------------- */

  function toggleFlag(index) {
    if (state === "won" || state === "lost") return;
    var cell = cells[index];
    if (!cell || cell.revealed) return;

    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    if (flags < 0) flags = 0;

    renderCell(cell);
    updateMineCount();
    sound.play("flag");
  }

  function openRegion(index) {
    var stack = [index];

    while (stack.length) {
      var i = stack.pop();
      var cell = cells[i];
      if (!cell || cell.revealed || cell.flagged || cell.mine) continue;

      cell.revealed = true;
      revealedCount += 1;
      renderCell(cell);

      if (cell.count === 0) {
        var around = neighborsOf(i);
        for (var k = 0; k < around.length; k++) {
          var next = cells[around[k]];
          if (!next.revealed && !next.flagged && !next.mine) {
            stack.push(around[k]);
          }
        }
      }
    }
  }

  function reveal(index) {
    if (state === "won" || state === "lost") return;
    var cell = cells[index];
    if (!cell || cell.revealed || cell.flagged) return;

    if (state === "idle") {
      placeMines(index);
      state = "playing";
      startTimer();
    }

    if (cell.mine) {
      lose(index);
      return;
    }

    openRegion(index);
    updateMineCount();
    sound.play("click");
    checkWin();
  }

  /* ---------------- 结束 ---------------- */

  function lose(hitIndex) {
    state = "lost";
    clearTimer();
    elapsed = currentSeconds();
    timerEl.textContent = Math.floor(elapsed);
    sound.play("lose");

    cells.forEach(function (cell) {
      if (cell.mine && !cell.flagged) {
        cell.revealed = true;
        renderCell(cell);
      } else if (cell.flagged && !cell.mine) {
        cell.el.classList.add("is-wrong");
        cell.el.textContent = "✖";
        cell.el.setAttribute("aria-label", "错误的旗子");
      }
    });

    var hit = cells[hitIndex];
    if (hit) hit.el.classList.add("is-exploded");

    kickerEl.textContent = "踩到地雷";
    titleEl.textContent = "游戏结束";
    textEl.innerHTML =
      "坚持了 <b>" + Math.floor(elapsed) + "</b> 秒 · " +
      config.label + "难度";
    primaryBtn.textContent = "再来一局";
    overlay.hidden = false;
  }

  function checkWin() {
    if (state !== "playing") return;

    var totalSafe = config.rows * config.cols - config.mines;
    if (revealedCount !== totalSafe) return;

    // 再逐格核对，避免计数被复用或异常修改时误判
    var safeRevealed = 0;
    for (var i = 0; i < cells.length; i++) {
      if (!cells[i].mine && cells[i].revealed) safeRevealed += 1;
    }
    if (safeRevealed !== totalSafe) return;

    state = "won";
    clearTimer();
    elapsed = currentSeconds();
    var seconds = Math.round(elapsed);
    timerEl.textContent = String(seconds);

    var record = saveBest(levelKey, seconds, elapsed);
    // 首页“最快”使用独立的 v2 汇总键，不再读取被污染的旧键
    scores.submit(GLOBAL_RECORD_ID, seconds);

    // 不自动插旗：剩余雷数始终等于“总雷数 − 玩家已插旗数”
    updateMineCount();
    refreshBest();
    sound.play("win");

    if (record.isRecord) App.toast("新纪录：" + seconds + " 秒！");

    kickerEl.textContent = "排雷成功";
    titleEl.textContent = "安全了！";
    textEl.innerHTML =
      "用时 <b>" + seconds + "</b> 秒 · " + config.label + "难度" +
      (record.isRecord ? " · 新纪录！" : "");
    primaryBtn.textContent = "再来一局";
    overlay.hidden = false;
  }

  /* ---------------- 输入 ---------------- */

  board.addEventListener("click", function (event) {
    var el = event.target.closest(".ms-cell");
    if (!el) return;
    if (Date.now() < suppressClickUntil) return;
    var index = Number(el.dataset.index);
    if (flagMode) toggleFlag(index);
    else reveal(index);
  });

  board.addEventListener("contextmenu", function (event) {
    var el = event.target.closest(".ms-cell");
    if (!el) return;
    event.preventDefault();
    if (Date.now() < suppressClickUntil) return;
    toggleFlag(Number(el.dataset.index));
  });

  function cancelPress() {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressCell = null;
  }

  board.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" || event.button !== 0) return;
    var el = event.target.closest(".ms-cell");
    if (!el) return;

    pressCell = Number(el.dataset.index);
    if (pressTimer !== null) window.clearTimeout(pressTimer);

    pressTimer = window.setTimeout(function () {
      if (pressCell === null) return;
      toggleFlag(pressCell);
      suppressClickUntil = Date.now() + 650;
      if (navigator.vibrate) navigator.vibrate(18);
      pressCell = null;
    }, 420);
  });

  board.addEventListener("pointerup", cancelPress);
  board.addEventListener("pointercancel", cancelPress);
  board.addEventListener("pointerleave", cancelPress);

  document.querySelectorAll("[data-level]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      sound.play("click");
      newGame(btn.dataset.level);
    });
  });

  flagToggle.addEventListener("click", function () {
    flagMode = !flagMode;
    flagToggle.setAttribute("aria-pressed", flagMode ? "true" : "false");
    sound.play("click");
  });

  primaryBtn.addEventListener("click", function () {
    newGame(levelKey);
  });

  restartBtn.addEventListener("click", function () {
    newGame(levelKey);
  });

  window.addEventListener("resize", utils.debounce(resizeBoard, 120));

  /* ---------------- 启动 ---------------- */

  ensureRecordSchema();
  newGame("easy");
})();
