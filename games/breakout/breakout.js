/* ============================================================
   打砖块
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;

  var W = 480;
  var H = 640;
  var COLS = 7;
  var ROWS = 5;
  var BRICK_GAP = 6;
  var BRICK_H = 22;
  var BRICK_TOP = 78;
  var BRICK_PAD = 12;
  var STEP = 1000 / 120;

  var COLORS = ["#ff6b8a", "#ffb347", "#ffd166", "#5ee6a8", "#22d3ee"];

  var canvas = document.getElementById("board");
  var ctx = App.setupCanvas(canvas, W, H);

  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var levelEl = document.getElementById("level");
  var overlay = document.getElementById("overlay");
  var kickerEl = document.getElementById("kicker");
  var titleEl = document.getElementById("overlayTitle");
  var textEl = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var restartBtn = document.getElementById("restartBtn");

  var game = {
    mode: "idle",
    score: 0,
    lives: 3,
    level: 1,
    bricks: [],
    keys: { left: false, right: false },
    paddle: { x: 192, y: H - 54, w: 96, h: 12 },
    ball: { x: W / 2, y: 0, r: 8, vx: 0, vy: 0 },
    acc: 0,
    last: 0
  };

  /* ---------------- 界面 ---------------- */

  function updateHud() {
    scoreEl.textContent = game.score;
    livesEl.textContent = game.lives;
    levelEl.textContent = game.level;
  }

  function setOverlay(kicker, title, html, buttonText) {
    kickerEl.textContent = kicker;
    titleEl.textContent = title;
    textEl.innerHTML = html;
    primaryBtn.textContent = buttonText;
    overlay.hidden = false;
  }

  /* ---------------- 场景 ---------------- */

  function buildBricks() {
    game.bricks = [];
    var brickW = (W - BRICK_PAD * 2 - BRICK_GAP * (COLS - 1)) / COLS;

    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        game.bricks.push({
          x: BRICK_PAD + col * (brickW + BRICK_GAP),
          y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
          w: brickW,
          h: BRICK_H,
          row: row,
          color: COLORS[row % COLORS.length],
          alive: true
        });
      }
    }
  }

  function resetBall() {
    game.ball.x = game.paddle.x + game.paddle.w / 2;
    game.ball.y = game.paddle.y - game.ball.r - 1;
    game.ball.vx = 0;
    game.ball.vy = 0;
  }

  function newGame() {
    game.score = 0;
    game.lives = 3;
    game.level = 1;
    game.mode = "idle";
    game.paddle.w = 96;
    game.paddle.x = (W - game.paddle.w) / 2;
    game.acc = 0;
    buildBricks();
    resetBall();
    updateHud();
    setOverlay(
      "准备开始",
      "打砖块",
      "移动挡板接住弹球，敲碎全部砖块进入下一关。三条生命，别让球掉下去。",
      "开始游戏"
    );
  }

  function begin() {
    if (game.mode === "idle") {
      game.mode = "ready";
      resetBall();
    }
    overlay.hidden = true;
    sound.play("click");
  }

  function launch() {
    if (game.mode !== "ready") return;
    var speed = 5 + (game.level - 1) * 0.35;
    var angle = (Math.random() * 0.9 - 0.45);
    game.ball.vx = Math.sin(angle) * speed;
    game.ball.vy = -Math.cos(angle) * speed;
    game.mode = "running";
    sound.play("pop");
  }

  function pause() {
    if (game.mode !== "running") return;
    game.mode = "paused";
    setOverlay("已暂停", "休息一下", "按 P 或点击按钮继续这场游戏。", "继续游戏");
  }

  function resume() {
    if (game.mode !== "paused") return;
    game.mode = "running";
    overlay.hidden = true;
  }

  function nextLevel() {
    game.level += 1;
    game.score += 100;
    game.paddle.w = Math.max(64, 96 - (game.level - 1) * 6);
    game.paddle.x = Math.min(
      Math.max(0, game.paddle.x + (96 - game.paddle.w) / 2),
      W - game.paddle.w
    );
    buildBricks();
    resetBall();
    game.mode = "ready";
    game.acc = 0;
    updateHud();
    sound.play("clear");
    App.toast("进入第 " + game.level + " 关，球速提升！");
  }

  function loseLife() {
    game.lives -= 1;
    updateHud();
    sound.play("lose");

    if (game.lives <= 0) {
      gameOver();
      return;
    }

    resetBall();
    game.mode = "ready";
    App.toast("还剩 " + game.lives + " 条命");
  }

  function gameOver() {
    game.mode = "over";
    var result = scores.submit("breakout", game.score);
    setOverlay(
      "游戏结束",
      "弹球掉光了",
      "得分 <b>" + game.score + "</b> · 到达第 " + game.level + " 关" +
        (result.isRecord && game.score > 0 ? " · 新纪录！" : ""),
      "再来一局"
    );
  }

  /* ---------------- 物理 ---------------- */

  function bouncePaddle() {
    var paddle = game.paddle;
    var ball = game.ball;
    var center = paddle.x + paddle.w / 2;
    var relative = App.utils.clamp((ball.x - center) / (paddle.w / 2), -1, 1);
    var angle = relative * 1.02;
    var speed = Math.min(Math.hypot(ball.vx, ball.vy) + 0.015, 10);

    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.y = paddle.y - ball.r - 0.6;
    sound.play("bounce");
  }

  function update(scale) {
    var ball = game.ball;
    var paddle = game.paddle;

    if (game.keys.left) paddle.x -= 8 * scale;
    if (game.keys.right) paddle.x += 8 * scale;
    paddle.x = App.utils.clamp(paddle.x, 0, W - paddle.w);

    if (game.mode === "ready") {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
      ball.vx = 0;
      ball.vy = 0;
      return;
    }

    if (game.mode !== "running") return;

    ball.x += ball.vx * scale;
    ball.y += ball.vy * scale;

    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx);
      sound.play("bounce");
    } else if (ball.x + ball.r > W) {
      ball.x = W - ball.r;
      ball.vx = -Math.abs(ball.vx);
      sound.play("bounce");
    }

    if (ball.y - ball.r < 0) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
      sound.play("bounce");
    }

    // 挡板
    if (
      ball.vy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h &&
      ball.x + ball.r >= paddle.x &&
      ball.x - ball.r <= paddle.x + paddle.w
    ) {
      bouncePaddle();
    }

    // 砖块
    for (var i = 0; i < game.bricks.length; i++) {
      var brick = game.bricks[i];
      if (!brick.alive) continue;

      if (
        ball.x + ball.r > brick.x &&
        ball.x - ball.r < brick.x + brick.w &&
        ball.y + ball.r > brick.y &&
        ball.y - ball.r < brick.y + brick.h
      ) {
        var overlapX = Math.min(
          ball.x + ball.r - brick.x,
          brick.x + brick.w - (ball.x - ball.r)
        );
        var overlapY = Math.min(
          ball.y + ball.r - brick.y,
          brick.y + brick.h - (ball.y - ball.r)
        );

        if (overlapX < overlapY) {
          ball.vx = -ball.vx;
          ball.x += ball.vx > 0 ? overlapX : -overlapX;
        } else {
          ball.vy = -ball.vy;
          ball.y += ball.vy > 0 ? overlapY : -overlapY;
        }

        brick.alive = false;
        game.score += 10;
        updateHud();
        sound.play("break");
        break;
      }
    }

    // 掉落
    if (ball.y - ball.r > H) {
      loseLife();
      return;
    }

    // 过关
    var remaining = 0;
    for (var b = 0; b < game.bricks.length; b++) {
      if (game.bricks[b].alive) remaining += 1;
    }
    if (remaining === 0) nextLevel();
  }

  /* ---------------- 绘制 ---------------- */

  function draw() {
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1224");
    bg.addColorStop(0.55, "#090e1b");
    bg.addColorStop(1, "#080b15");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 背景光晕
    var glow = ctx.createRadialGradient(W / 2, 110, 20, W / 2, 110, 330);
    glow.addColorStop(0, "rgba(124, 92, 255, 0.16)");
    glow.addColorStop(1, "rgba(124, 92, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // 砖块
    for (var i = 0; i < game.bricks.length; i++) {
      var brick = game.bricks[i];
      if (!brick.alive) continue;

      ctx.save();
      ctx.shadowColor = brick.color;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = brick.color;
      App.roundRect(ctx, brick.x, brick.y, brick.w, brick.h, 5);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      App.roundRect(ctx, brick.x + 2, brick.y + 2, brick.w - 4, 4, 2);
      ctx.fill();
    }

    // 挡板
    var paddle = game.paddle;
    var paddleGradient = ctx.createLinearGradient(
      paddle.x,
      paddle.y,
      paddle.x + paddle.w,
      paddle.y
    );
    paddleGradient.addColorStop(0, "#22d3ee");
    paddleGradient.addColorStop(0.5, "#8be9ff");
    paddleGradient.addColorStop(1, "#c4b5fd");

    ctx.save();
    ctx.shadowColor = "rgba(34, 211, 238, 0.6)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = paddleGradient;
    App.roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6);
    ctx.fill();
    ctx.restore();

    // 弹球
    var ball = game.ball;
    ctx.save();
    ctx.shadowColor = "rgba(255, 255, 255, 0.85)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(34, 211, 238, 0.85)";
    ctx.beginPath();
    ctx.arc(ball.x - 2, ball.y - 2, ball.r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // 发球提示
    if (game.mode === "ready") {
      ctx.fillStyle = "rgba(238, 241, 255, 0.6)";
      ctx.font = '600 16px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("点击画布 / 空格 发球", W / 2, paddle.y - 72);
    }
  }

  /* ---------------- 主循环 ---------------- */

  function frame(time) {
    window.requestAnimationFrame(frame);

    if (!game.last) game.last = time;
    var dt = Math.min(time - game.last, 100);
    game.last = time;

    if (game.mode === "running") {
      game.acc += dt;
      var guard = 0;
      while (game.acc >= STEP && guard < 20) {
        game.acc -= STEP;
        update(STEP / (1000 / 60));
        guard += 1;
      }
    }

    draw();
  }

  /* ---------------- 输入 ---------------- */

  function pointerToPaddle(event) {
    var rect = canvas.getBoundingClientRect();
    var x = ((event.clientX - rect.left) / rect.width) * W;
    game.paddle.x = App.utils.clamp(x - game.paddle.w / 2, 0, W - game.paddle.w);
  }

  canvas.addEventListener("pointermove", function (event) {
    if (event.pointerType === "mouse" || event.buttons > 0) {
      pointerToPaddle(event);
    }
  });

  canvas.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    pointerToPaddle(event);
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        /* 忽略 */
      }
    }
    if (game.mode === "ready") launch();
  });

  canvas.addEventListener("pointercancel", function () {
    /* 无需处理 */
  });

  var KEY_LEFT = { ArrowLeft: true, a: true, A: true };
  var KEY_RIGHT = { ArrowRight: true, d: true, D: true };

  document.addEventListener("keydown", function (event) {
    if (KEY_LEFT[event.key]) {
      event.preventDefault();
      game.keys.left = true;
      return;
    }
    if (KEY_RIGHT[event.key]) {
      event.preventDefault();
      game.keys.right = true;
      return;
    }
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      if (game.mode === "ready") launch();
      else if (game.mode === "running") pause();
      else if (game.mode === "paused") resume();
      else if (game.mode === "idle" || game.mode === "over") {
        newGame();
        begin();
      }
      return;
    }
    if (event.key === "p" || event.key === "P") {
      if (game.mode === "running") pause();
      else if (game.mode === "paused") resume();
      return;
    }
    if (event.key === "Enter") {
      if (game.mode === "idle" || game.mode === "over") {
        newGame();
        begin();
      }
    }
  });

  document.addEventListener("keyup", function (event) {
    if (KEY_LEFT[event.key]) game.keys.left = false;
    if (KEY_RIGHT[event.key]) game.keys.right = false;
  });

  primaryBtn.addEventListener("click", function () {
    if (game.mode === "idle") begin();
    else if (game.mode === "paused") resume();
    else if (game.mode === "over") {
      newGame();
      begin();
    }
  });

  restartBtn.addEventListener("click", function () {
    newGame();
    begin();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && game.mode === "running") pause();
  });

  /* ---------------- 启动 ---------------- */

  newGame();
  window.requestAnimationFrame(frame);
})();
