/* ============================================================
   2048
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;
  var utils = App.utils;

  var SIZE = 4;

  var boardEl = document.getElementById("board");
  var tilesEl = document.getElementById("tiles");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var maxTileEl = document.getElementById("maxTile");
  var overlay = document.getElementById("overlay");
  var kickerEl = document.getElementById("kicker");
  var titleEl = document.getElementById("overlayTitle");
  var textEl = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var secondaryBtn = document.getElementById("secondaryBtn");
  var restartBtn = document.getElementById("restartBtn");

  var grid = emptyGrid();
  var tiles = [];
  var tileSeq = 0;
  var score = 0;
  var best = 0;
  var status = "running";
  var hasWon = false;
  var swipeStart = null;

  /* ---------------- 基础 ---------------- */

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < SIZE; r++) g.push([null, null, null, null]);
    return g;
  }

  function valueClass(value) {
    return value > 2048 ? "super" : String(value);
  }

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    var max = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var tile = grid[r][c];
        if (tile && tile.value > max) max = tile.value;
      }
    }
    maxTileEl.textContent = max;
  }

  function refreshBest() {
    var stored = scores.best("2048");
    best = stored === null ? 0 : stored;
    bestEl.textContent = best;
  }

  /* ---------------- 布局 ---------------- */

  function layout() {
    var size = boardEl.clientWidth;
    if (!size) return;

    var pad = Math.max(8, Math.round(size * 0.028));
    var gap = Math.max(7, Math.round(size * 0.026));
    var cell = (size - pad * 2 - gap * (SIZE - 1)) / SIZE;

    boardEl.style.setProperty("--pad", pad + "px");
    boardEl.style.setProperty("--gap", gap + "px");

    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var digits = String(tile.value).length;
      var factor = digits >= 5 ? 0.25 : digits === 4 ? 0.31 : digits === 3 ? 0.37 : 0.43;
      var x = pad + tile.c * (cell + gap);
      var y = pad + tile.r * (cell + gap);

      tile.el.style.width = cell + "px";
      tile.el.style.height = cell + "px";
      tile.el.style.fontSize = Math.round(cell * factor) + "px";
      tile.el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }
  }

  /* ---------------- 方块 ---------------- */

  function createTile(r, c, value, isNew) {
    var el = document.createElement("div");
    el.className = "num-tile tile-" + valueClass(value);
    el.textContent = value;
    tilesEl.appendChild(el);

    var tile = {
      id: ++tileSeq,
      value: value,
      r: r,
      c: c,
      el: el
    };
    tiles.push(tile);
    grid[r][c] = tile;

    if (isNew) {
      el.classList.add("is-new");
      window.setTimeout(function () {
        el.classList.remove("is-new");
      }, 200);
    }
    return tile;
  }

  function addRandom() {
    var free = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!grid[r][c]) free.push([r, c]);
      }
    }
    if (!free.length) return null;
    var spot = utils.pick(free);
    return createTile(spot[0], spot[1], Math.random() < 0.9 ? 2 : 4, true);
  }

  /* ---------------- 新局 ---------------- */

  function newGame() {
    tilesEl.innerHTML = "";
    grid = emptyGrid();
    tiles = [];
    score = 0;
    hasWon = false;
    status = "running";
    overlay.hidden = true;
    secondaryBtn.hidden = true;
    refreshBest();

    addRandom();
    addRandom();
    layout();
    updateHud();
  }

  /* ---------------- 移动 ---------------- */

  function targetCell(dir, lineIndex, k) {
    if (dir === "left") return { r: lineIndex, c: k };
    if (dir === "right") return { r: lineIndex, c: SIZE - 1 - k };
    if (dir === "up") return { r: k, c: lineIndex };
    return { r: SIZE - 1 - k, c: lineIndex };
  }

  function buildLines(dir) {
    var lines = [];
    for (var lineIndex = 0; lineIndex < SIZE; lineIndex++) {
      var line = [];
      for (var k = 0; k < SIZE; k++) {
        var r, c;
        if (dir === "left") {
          r = lineIndex;
          c = k;
        } else if (dir === "right") {
          r = lineIndex;
          c = SIZE - 1 - k;
        } else if (dir === "up") {
          r = k;
          c = lineIndex;
        } else {
          r = SIZE - 1 - k;
          c = lineIndex;
        }
        if (grid[r][c]) line.push(grid[r][c]);
      }
      lines.push(line);
    }
    return lines;
  }

  function move(dir) {
    if (status !== "running") return;

    var lines = buildLines(dir);
    var newGrid = emptyGrid();
    var moved = false;
    var gained = 0;

    lines.forEach(function (line, lineIndex) {
      var results = [];
      for (var i = 0; i < line.length; i++) {
        var current = line[i];
        var next = line[i + 1];
        if (next && next.value === current.value) {
          results.push({ value: current.value * 2, sources: [current, next] });
          i += 1;
        } else {
          results.push({ value: current.value, sources: [current] });
        }
      }

      results.forEach(function (result, k) {
        var pos = targetCell(dir, lineIndex, k);
        var primary = result.sources[0];

        if (primary.r !== pos.r || primary.c !== pos.c) moved = true;
        primary.r = pos.r;
        primary.c = pos.c;
        newGrid[pos.r][pos.c] = primary;

        if (result.sources[1]) {
          moved = true;
          gained += result.value;

          var second = result.sources[1];
          second.r = pos.r;
          second.c = pos.c;
          second.dead = true;
          second.el.style.zIndex = "1";

          primary.value = result.value;
          primary.el.className = "num-tile tile-" + valueClass(result.value);
          primary.el.textContent = result.value;
          primary.el.classList.add("is-new");
          (function (el) {
            window.setTimeout(function () {
              el.classList.remove("is-new");
            }, 220);
          })(primary.el);

          window.setTimeout(function () {
            if (second.el.parentNode) second.el.parentNode.removeChild(second.el);
            var index = tiles.indexOf(second);
            if (index !== -1) tiles.splice(index, 1);
          }, 150);
        }
      });
    });

    if (!moved) return;

    grid = newGrid;
    score += gained;
    if (gained > 0) sound.play("merge");

    layout();
    addRandom();
    layout();
    updateHud();

    checkState();
  }

  /* ---------------- 胜负判断 ---------------- */

  function hasMoves() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!grid[r][c]) return true;
        var value = grid[r][c].value;
        if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].value === value) return true;
        if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].value === value) return true;
      }
    }
    return false;
  }

  function submitRun() {
    var result = scores.submit("2048", score);
    refreshBest();
    return result;
  }

  function checkState() {
    if (!hasWon) {
      var won = false;
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          if (grid[r][c] && grid[r][c].value >= 2048) won = true;
        }
      }
      if (won) {
        hasWon = true;
        submitRun();
        sound.play("win");
        status = "win";
        showOverlay("win");
        return;
      }
    }

    if (!hasMoves()) {
      var result = submitRun();
      sound.play("lose");
      status = "over";
      showOverlay("over", result.isRecord);
    }
  }

  function showOverlay(kind, isRecord) {
    overlay.hidden = false;
    if (kind === "win") {
      kickerEl.textContent = "达成目标";
      titleEl.textContent = "2048 到手！";
      textEl.innerHTML = "当前得分 <b>" + score + "</b> 分，还能走得更远吗？";
      primaryBtn.textContent = "继续挑战";
      secondaryBtn.hidden = false;
      secondaryBtn.textContent = "重新开始";
    } else {
      kickerEl.textContent = "游戏结束";
      titleEl.textContent = "没有可移动的方块了";
      textEl.innerHTML =
        "本局得分 <b>" + score + "</b> 分" + (isRecord ? " · 新纪录！" : "");
      primaryBtn.textContent = "再来一局";
      secondaryBtn.hidden = true;
    }
  }

  /* ---------------- 输入 ---------------- */

  var KEY_MAP = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    a: "left",
    d: "right",
    w: "up",
    s: "down",
    A: "left",
    D: "right",
    W: "up",
    S: "down"
  };

  document.addEventListener("keydown", function (event) {
    var dir = KEY_MAP[event.key];
    if (!dir) return;
    event.preventDefault();
    move(dir);
  });

  boardEl.addEventListener("pointerdown", function (event) {
    if (status !== "running") return;
    swipeStart = { x: event.clientX, y: event.clientY };
  });

  boardEl.addEventListener("pointerup", function (event) {
    if (!swipeStart) return;
    var dx = event.clientX - swipeStart.x;
    var dy = event.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  });

  boardEl.addEventListener("pointercancel", function () {
    swipeStart = null;
  });

  primaryBtn.addEventListener("click", function () {
    if (status === "win") {
      status = "running";
      overlay.hidden = true;
      checkState();
    } else if (status === "over") {
      newGame();
    }
  });

  secondaryBtn.addEventListener("click", newGame);

  restartBtn.addEventListener("click", newGame);

  window.addEventListener("resize", utils.debounce(layout, 120));

  /* ---------------- 启动 ---------------- */

  newGame();
})();
