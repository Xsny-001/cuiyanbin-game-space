/* ============================================================
   贪吃蛇
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var utils = App.utils;
  var sound = App.sound;
  var scores = App.scores;

  var COLS = 20;
  var ROWS = 20;
  var CELL = 28;
  var W = COLS * CELL;
  var H = ROWS * CELL;

  var canvas = document.getElementById("board");
  var ctx = App.setupCanvas(canvas, W, H);

  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var speedEl = document.getElementById("speed");
  var overlay = document.getElementById("overlay");
  var kickerEl = document.getElementById("kicker");
  var titleEl = document.getElementById("overlayTitle");
  var textEl = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var restartBtn = document.getElementById("restartBtn");

  var game = {
    mode: "ready",
    snake: [],
    dir: { x: 1, y: 0 },
    queue: [],
    food: { x: 0, y: 0 },
    score: 0,
    level: 1,
    stepMs: 150,
    acc: 0,
    last: 0
  };

  var swipe = null;

  /* ---------------- 界面 ---------------- */

  function setOverlay(kicker, title, html, buttonText) {
    kickerEl.textContent = kicker;
    titleEl.textContent = title;
    textEl.innerHTML = html;
    primaryBtn.textContent = buttonText;
    overlay.hidden = false;
  }

  function updateHud() {
    scoreEl.textContent = game.score;
    speedEl.textContent = game.level;
  }

  function refreshBest() {
    var best = scores.best("snake");
    bestEl.textContent = best === null ? 0 : best;
  }

  /* ---------------- 游戏状态 ---------------- */

  function spawnFood() {
    var free = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var occupied = false;
        for (var i = 0; i < game.snake.length; i++) {
          if (game.snake[i].x === x && game.snake[i].y === y) {
            occupied = true;
            break;
          }
        }
        if (!occupied) free.push({ x: x, y: y });
      }
    }
    return free.length ? utils.pick(free) : null;
  }

  function reset() {
    game.mode = "ready";
    game.snake = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 }
    ];
    game.dir = { x: 1, y: 0 };
    game.queue = [];
    game.score = 0;
    game.level = 1;
    game.stepMs = 150;
    game.acc = 0;
    game.food = spawnFood();
    updateHud();
    setOverlay(
      "准备开始",
      "贪吃蛇",
      "吃掉红色果实让身体变长，撞墙或咬到自己就结束。",
      "开始游戏"
    );
  }

  function begin() {
    if (game.mode === "over") reset();
    game.mode = "running";
    game.acc = 0;
    overlay.hidden = true;
    sound.play("click");
  }

  function pause() {
    if (game.mode !== "running") return;
    game.mode = "paused";
    setOverlay("已暂停", "先休息一下", "按空格或点击按钮继续这场游戏。", "继续游戏");
  }

  function resume() {
    if (game.mode !== "paused") return;
    game.mode = "running";
    game.acc = 0;
    overlay.hidden = true;
  }

  function gameOver() {
    game.mode = "over";
    var result = scores.submit("snake", game.score);
    refreshBest();
    sound.play("lose");
    if (result.isRecord && game.score > 0) App.toast("新纪录：" + game.score + " 分！");
    setOverlay(
      "游戏结束",
      "撞到啦",
      "本局得分 <b>" + game.score + "</b> 分" +
        (result.isRecord && game.score > 0 ? " · 新纪录！" : ""),
      "再来一局"
    );
  }

  /* ---------------- 核心逻辑 ---------------- */

  function queueDir(x, y) {
    if (game.mode === "ready") begin();
    if (game.mode !== "running") return;

    var last = game.queue.length ? game.queue[game.queue.length - 1] : game.dir;
    if (last.x === -x && last.y === -y) return;
    if (last.x === x && last.y === y) return;
    if (game.queue.length < 2) game.queue.push({ x: x, y: y });
  }

  function step() {
    if (game.queue.length) game.dir = game.queue.shift();

    var head = {
      x: game.snake[0].x + game.dir.x,
      y: game.snake[0].y + game.dir.y
    };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      gameOver();
      return;
    }

    var willEat = game.food && head.x === game.food.x && head.y === game.food.y;
    var limit = game.snake.length - (willEat ? 0 : 1);
    for (var i = 0; i < limit; i++) {
      if (game.snake[i].x === head.x && game.snake[i].y === head.y) {
        gameOver();
        return;
      }
    }

    game.snake.unshift(head);

    if (willEat) {
      game.score += 10;
      sound.play("eat");

      var nextLevel = 1 + Math.floor(game.score / 50);
      if (nextLevel !== game.level) {
        game.level = nextLevel;
        game.stepMs = Math.max(72, 150 - (nextLevel - 1) * 9);
        App.toast("速度提升到 " + nextLevel + " 级");
      }

      game.food = spawnFood();
      updateHud();

      if (!game.food) {
        // 填满整个棋盘，直接获胜
        game.mode = "over";
        var perfect = scores.submit("snake", game.score + 100);
        refreshBest();
        sound.play("win");
        setOverlay(
          "完美通关",
          "你填满了整个棋盘！",
          "最终得分 <b>" + (game.score + 100) + "</b> 分" +
            (perfect.isRecord ? " · 新纪录！" : ""),
          "再来一局"
        );
      }
    } else {
      game.snake.pop();
    }
  }

  /* ---------------- 绘制 ---------------- */

  function drawBoard(time) {
    ctx.clearRect(0, 0, W, H);

    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0a0f1e");
    bg.addColorStop(1, "#0b1324");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.032)";
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

    // 食物
    if (game.food) {
      var fx = game.food.x * CELL + CELL / 2;
      var fy = game.food.y * CELL + CELL / 2;
      var pulse = 1 + Math.sin(time / 220) * 0.08;

      ctx.save();
      ctx.shadowColor = "rgba(255, 93, 108, 0.75)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#ff5d6c";
      ctx.beginPath();
      ctx.arc(fx, fy, CELL * 0.31 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.beginPath();
      ctx.arc(fx - CELL * 0.1, fy - CELL * 0.11, CELL * 0.075, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#5ee6a8";
      ctx.beginPath();
      ctx.ellipse(
        fx + CELL * 0.08,
        fy - CELL * 0.33,
        CELL * 0.15,
        CELL * 0.08,
        -0.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // 蛇身
    var len = game.snake.length;
    for (var k = len - 1; k >= 0; k--) {
      var seg = game.snake[k];
      var t = len > 1 ? k / (len - 1) : 0;
      var hue = 156 + t * 42;
      var light = 66 - t * 14;
      var pad = k === 0 ? 1.5 : 3;

      ctx.fillStyle = "hsl(" + hue + ", 78%, " + light + "%)";
      if (k === 0) {
        ctx.save();
        ctx.shadowColor = "rgba(94, 230, 168, 0.55)";
        ctx.shadowBlur = 16;
      }
      App.roundRect(
        ctx,
        seg.x * CELL + pad,
        seg.y * CELL + pad,
        CELL - pad * 2,
        CELL - pad * 2,
        8
      );
      ctx.fill();
      if (k === 0) ctx.restore();
    }

    if (game.snake.length) {
      drawEyes(game.snake[0], game.dir);
    }
  }

  function drawEyes(head, dir) {
    var cx = head.x * CELL + CELL / 2;
    var cy = head.y * CELL + CELL / 2;
    var forward = 5.5;
    var side = 5;
    var perpX = -dir.y;
    var perpY = dir.x;

    var e1x = cx + dir.x * forward + perpX * side;
    var e1y = cy + dir.y * forward + perpY * side;
    var e2x = cx + dir.x * forward - perpX * side;
    var e2y = cy + dir.y * forward - perpY * side;

    ctx.fillStyle = "#06121a";
    ctx.beginPath();
    ctx.arc(e1x, e1y, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e2x, e2y, 3.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(e1x + dir.x * 0.8, e1y + dir.y * 0.8, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e2x + dir.x * 0.8, e2y + dir.y * 0.8, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------- 主循环 ---------------- */

  function frame(time) {
    window.requestAnimationFrame(frame);

    if (!game.last) game.last = time;
    var dt = Math.min(time - game.last, 120);
    game.last = time;

    if (game.mode === "running") {
      game.acc += dt;
      while (game.acc >= game.stepMs) {
        game.acc -= game.stepMs;
        step();
        if (game.mode !== "running") break;
      }
    }

    drawBoard(time);
  }

  /* ---------------- 输入 ---------------- */

  var KEY_DIRS = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0],
    W: [0, -1],
    S: [0, 1],
    A: [-1, 0],
    D: [1, 0]
  };

  document.addEventListener("keydown", function (event) {
    var dir = KEY_DIRS[event.key];
    if (dir) {
      event.preventDefault();
      queueDir(dir[0], dir[1]);
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      if (game.mode === "running") pause();
      else if (game.mode === "paused") resume();
      else begin();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (game.mode === "over") {
        reset();
        begin();
      } else if (game.mode === "ready") {
        begin();
      }
    }
  });

  document.querySelectorAll("[data-dir]").forEach(function (btn) {
    btn.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      var map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      var dir = map[btn.dataset.dir];
      if (dir) queueDir(dir[0], dir[1]);
    });
  });

  canvas.addEventListener("pointerdown", function (event) {
    swipe = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("pointerup", function (event) {
    if (!swipe) return;
    var dx = event.clientX - swipe.x;
    var dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) {
      if (game.mode === "ready") begin();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? 1 : -1, 0);
    else queueDir(0, dy > 0 ? 1 : -1);
  });

  canvas.addEventListener("pointercancel", function () {
    swipe = null;
  });

  primaryBtn.addEventListener("click", function () {
    if (game.mode === "ready") begin();
    else if (game.mode === "paused") resume();
    else if (game.mode === "over") {
      reset();
      begin();
    }
  });

  restartBtn.addEventListener("click", function () {
    reset();
    begin();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && game.mode === "running") pause();
  });

  /* ---------------- 启动 ---------------- */

  refreshBest();
  reset();
  window.requestAnimationFrame(frame);
})();
