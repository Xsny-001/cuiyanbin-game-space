/* ============================================================
   俄罗斯方块
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;
  var utils = App.utils;

  var COLS = 10;
  var ROWS = 20;
  var CELL = 30;
  var W = COLS * CELL;
  var H = ROWS * CELL;

  var SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0]
    ],
    O: [
      [1, 1],
      [1, 1]
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0]
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0]
    ]
  };

  var COLORS = {
    I: "#22d3ee",
    J: "#6b8cff",
    L: "#ffa94d",
    O: "#ffd166",
    S: "#5ee6a8",
    T: "#c084fc",
    Z: "#ff6b8a"
  };

  var canvas = document.getElementById("board");
  var ctx = App.setupCanvas(canvas, W, H);
  var nextCanvas = document.getElementById("next");
  var nctx = App.setupCanvas(nextCanvas, 120, 120);

  var scoreEl = document.getElementById("score");
  var levelEl = document.getElementById("level");
  var linesEl = document.getElementById("lines");
  var bestEl = document.getElementById("best");
  var overlay = document.getElementById("overlay");
  var kickerEl = document.getElementById("kicker");
  var titleEl = document.getElementById("overlayTitle");
  var textEl = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var restartBtn = document.getElementById("restartBtn");
  var pauseBtn = document.getElementById("pauseBtn");

  var board = emptyBoard();
  var bag = [];
  var current = null;
  var nextType = null;
  var score = 0;
  var lines = 0;
  var level = 1;
  var best = 0;
  var mode = "idle";
  var dropAcc = 0;
  var lastFrame = 0;

  /* ---------------- 基础 ---------------- */

  function emptyBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) {
      b.push(new Array(COLS).fill(null));
    }
    return b;
  }

  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
    bestEl.textContent = best;
  }

  function setOverlay(kicker, title, html, buttonText) {
    kickerEl.textContent = kicker;
    titleEl.textContent = title;
    textEl.innerHTML = html;
    primaryBtn.textContent = buttonText;
    overlay.hidden = false;
  }

  function nextFromBag() {
    if (!bag.length) {
      bag = Object.keys(SHAPES);
      bag = utils.shuffle(bag);
    }
    return bag.pop();
  }

  function spawn() {
    var type = nextType || nextFromBag();
    nextType = nextFromBag();

    var matrix = SHAPES[type].map(function (row) {
      return row.slice();
    });

    current = {
      type: type,
      matrix: matrix,
      color: COLORS[type],
      x: Math.floor((COLS - matrix[0].length) / 2),
      y: 0
    };

    drawNext();

    if (collides(current.matrix, current.x, current.y)) {
      current = null;
      gameOver();
      return false;
    }
    return true;
  }

  /* ---------------- 碰撞 ---------------- */

  function collides(matrix, px, py) {
    for (var r = 0; r < matrix.length; r++) {
      for (var c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        var x = px + c;
        var y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board[y][x]) return true;
      }
    }
    return false;
  }

  function rotateCW(matrix) {
    var n = matrix.length;
    var out = [];
    for (var r = 0; r < n; r++) out.push(new Array(n).fill(0));
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        out[col][n - 1 - row] = matrix[row][col];
      }
    }
    return out;
  }

  /* ---------------- 操作 ---------------- */

  function move(dx) {
    if (mode !== "running" || !current) return;
    if (!collides(current.matrix, current.x + dx, current.y)) {
      current.x += dx;
      sound.play("move");
      draw();
    }
  }

  function rotate() {
    if (mode !== "running" || !current) return;
    var rotated = rotateCW(current.matrix);
    var kicks = [0, -1, 1, -2, 2];

    for (var i = 0; i < kicks.length; i++) {
      for (var d = 0; d >= -1; d--) {
        if (!collides(rotated, current.x + kicks[i], current.y + d)) {
          current.matrix = rotated;
          current.x += kicks[i];
          current.y += d;
          sound.play("click");
          draw();
          return;
        }
      }
    }
  }

  function softDrop() {
    if (mode !== "running" || !current) return;
    dropAcc = 0;
    if (!collides(current.matrix, current.x, current.y + 1)) {
      current.y += 1;
      score += 1;
      updateHud();
      draw();
    } else {
      lockPiece();
      draw();
    }
  }

  function hardDrop() {
    if (mode !== "running" || !current) return;
    while (!collides(current.matrix, current.x, current.y + 1)) {
      current.y += 1;
      score += 2;
    }
    lockPiece();
    updateHud();
    draw();
  }

  function lockPiece() {
    if (!current) return;

    var piece = current;
    for (var r = 0; r < piece.matrix.length; r++) {
      for (var c = 0; c < piece.matrix[r].length; c++) {
        if (!piece.matrix[r][c]) continue;
        var y = piece.y + r;
        var x = piece.x + c;
        if (y >= 0) board[y][x] = piece.color;
      }
    }

    var fullRows = [];
    for (var row = 0; row < ROWS; row++) {
      var full = true;
      for (var col = 0; col < COLS; col++) {
        if (!board[row][col]) {
          full = false;
          break;
        }
      }
      if (full) fullRows.push(row);
    }

    if (fullRows.length) {
      board = board.filter(function (rowData, index) {
        return fullRows.indexOf(index) === -1;
      });
      while (board.length < ROWS) board.unshift(new Array(COLS).fill(null));

      lines += fullRows.length;
      var points = [0, 100, 300, 500, 800][fullRows.length] || 800;
      score += points * level;
      level = 1 + Math.floor(lines / 10);

      sound.play(fullRows.length === 4 ? "win" : "clear");
      if (fullRows.length === 4) App.toast("四行消除！+" + points * level);
    }

    current = null;
    updateHud();
    spawn();
  }

  /* ---------------- 结束与暂停 ---------------- */

  function gameOver() {
    mode = "over";
    var result = scores.submit("tetris", score);
    best = result.best;
    updateHud();
    sound.play("lose");
    setOverlay(
      "游戏结束",
      "方块堆到顶了",
      "本局得分 <b>" + score + "</b> 分 · 消除 " + lines + " 行" +
        (result.isRecord && score > 0 ? " · 新纪录！" : ""),
      "再来一局"
    );
  }

  function newGame() {
    board = emptyBoard();
    bag = [];
    current = null;
    nextType = null;
    score = 0;
    lines = 0;
    level = 1;
    dropAcc = 0;
    mode = "idle";
    best = scores.best("tetris") || 0;

    nextType = nextFromBag();
    spawn();
    updateHud();
    setOverlay(
      "准备开始",
      "俄罗斯方块",
      "旋转并堆叠方块，填满一整行即可消除。每消 10 行，下落速度提升一级。",
      "开始游戏"
    );
  }

  function begin() {
    if (mode === "over") newGame();
    mode = "running";
    dropAcc = 0;
    lastFrame = performance.now();
    overlay.hidden = true;
    sound.play("click");
    draw();
  }

  function pause() {
    if (mode !== "running") return;
    mode = "paused";
    setOverlay("已暂停", "休息一下", "按 P 或点击按钮继续这场游戏。", "继续游戏");
  }

  function resume() {
    if (mode !== "paused") return;
    mode = "running";
    dropAcc = 0;
    lastFrame = performance.now();
    overlay.hidden = true;
    draw();
  }

  /* ---------------- 绘制 ---------------- */

  function drawBlock(context, px, py, size, color) {
    context.save();
    context.fillStyle = color;
    App.roundRect(context, px + 1.5, py + 1.5, size - 3, size - 3, 5);
    context.fill();

    context.fillStyle = "rgba(255, 255, 255, 0.22)";
    App.roundRect(context, px + 4, py + 4, size - 8, 4, 2);
    context.fill();

    context.strokeStyle = "rgba(0, 0, 0, 0.28)";
    context.lineWidth = 1;
    App.roundRect(context, px + 1.5, py + 1.5, size - 3, size - 3, 5);
    context.stroke();
    context.restore();
  }

  function draw() {
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a1020");
    bg.addColorStop(1, "#080b16");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.038)";
    ctx.lineWidth = 1;
    for (var i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, H);
      ctx.stroke();
    }
    for (var j = 1; j < ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * CELL + 0.5);
      ctx.lineTo(W, j * CELL + 0.5);
      ctx.stroke();
    }

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c]) drawBlock(ctx, c * CELL, r * CELL, CELL, board[r][c]);
      }
    }

    if (current && mode !== "over") {
      var ghostY = current.y;
      while (!collides(current.matrix, current.x, ghostY + 1)) ghostY += 1;

      if (ghostY > current.y) {
        ctx.save();
        ctx.globalAlpha = 0.24;
        for (var gr = 0; gr < current.matrix.length; gr++) {
          for (var gc = 0; gc < current.matrix[gr].length; gc++) {
            if (!current.matrix[gr][gc]) continue;
            var gy = ghostY + gr;
            if (gy < 0) continue;
            ctx.fillStyle = current.color;
            App.roundRect(
              ctx,
              (current.x + gc) * CELL + 2,
              gy * CELL + 2,
              CELL - 4,
              CELL - 4,
              5
            );
            ctx.fill();
          }
        }
        ctx.restore();
      }

      for (var pr = 0; pr < current.matrix.length; pr++) {
        for (var pc = 0; pc < current.matrix[pr].length; pc++) {
          if (!current.matrix[pr][pc]) continue;
          var py = current.y + pr;
          if (py < 0) continue;
          drawBlock(
            ctx,
            (current.x + pc) * CELL,
            py * CELL,
            CELL,
            current.color
          );
        }
      }
    }
  }

  function drawNext() {
    nctx.clearRect(0, 0, 120, 120);
    if (!nextType) return;

    var matrix = SHAPES[nextType];
    var minR = 99;
    var maxR = -1;
    var minC = 99;
    var maxC = -1;

    for (var r = 0; r < matrix.length; r++) {
      for (var c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }

    var rows = maxR - minR + 1;
    var cols = maxC - minC + 1;
    var cell = Math.min(24, 92 / Math.max(rows, cols));
    var ox = (120 - cols * cell) / 2;
    var oy = (120 - rows * cell) / 2;

    for (var rr = minR; rr <= maxR; rr++) {
      for (var cc = minC; cc <= maxC; cc++) {
        if (!matrix[rr][cc]) continue;
        drawBlock(
          nctx,
          ox + (cc - minC) * cell,
          oy + (rr - minR) * cell,
          cell,
          COLORS[nextType]
        );
      }
    }
  }

  /* ---------------- 主循环 ---------------- */

  function frame(time) {
    window.requestAnimationFrame(frame);

    if (!lastFrame) lastFrame = time;
    var dt = Math.min(time - lastFrame, 100);
    lastFrame = time;

    if (mode === "running" && current) {
      dropAcc += dt;
      var interval = Math.max(80, 800 - (level - 1) * 65);

      while (dropAcc >= interval) {
        dropAcc -= interval;
        if (!collides(current.matrix, current.x, current.y + 1)) {
          current.y += 1;
        } else {
          lockPiece();
          break;
        }
        if (mode !== "running") break;
      }
    }

    draw();
  }

  /* ---------------- 输入 ---------------- */

  document.addEventListener("keydown", function (event) {
    var key = event.key;

    if (key === "ArrowLeft" || key === "a" || key === "A") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (key === "ArrowRight" || key === "d" || key === "D") {
      event.preventDefault();
      move(1);
      return;
    }
    if (key === "ArrowDown" || key === "s" || key === "S") {
      event.preventDefault();
      softDrop();
      return;
    }
    if (key === "ArrowUp" || key === "w" || key === "W" || key === "x" || key === "X") {
      event.preventDefault();
      rotate();
      return;
    }
    if (key === " ") {
      event.preventDefault();
      if (mode === "running") hardDrop();
      else if (mode === "idle") begin();
      else if (mode === "paused") resume();
      else if (mode === "over") {
        newGame();
        begin();
      }
      return;
    }
    if (key === "p" || key === "P") {
      if (mode === "running") pause();
      else if (mode === "paused") resume();
      return;
    }
    if (key === "Enter") {
      if (mode === "idle" || mode === "over") {
        if (mode === "over") newGame();
        begin();
      }
    }
  });

  document.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var action = btn.dataset.action;
      if (action === "left") move(-1);
      else if (action === "right") move(1);
      else if (action === "rotate") rotate();
      else if (action === "down") softDrop();
      else if (action === "drop") hardDrop();
    });
  });

  primaryBtn.addEventListener("click", function () {
    if (mode === "idle") begin();
    else if (mode === "paused") resume();
    else if (mode === "over") {
      newGame();
      begin();
    }
  });

  pauseBtn.addEventListener("click", function () {
    if (mode === "running") pause();
    else if (mode === "paused") resume();
    else if (mode === "idle") begin();
  });

  restartBtn.addEventListener("click", function () {
    newGame();
    begin();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && mode === "running") pause();
  });

  /* ---------------- 启动 ---------------- */

  newGame();
  window.requestAnimationFrame(frame);
})();
