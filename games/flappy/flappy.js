/* ============================================================
   Flappy Bird
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;

  var W = 360;
  var H = 640;
  var GROUND_Y = 560;

  var canvas = document.getElementById("board");
  var ctx = App.setupCanvas(canvas, W, H);
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var statusEl = document.getElementById("status");
  var overlay = document.getElementById("overlay");
  var kickerEl = document.getElementById("kicker");
  var titleEl = document.getElementById("overlayTitle");
  var textEl = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var restartBtn = document.getElementById("restartBtn");

  var GRAVITY = 1450;
  var FLAP = -420;
  var BIRD_X = 96;
  var BIRD_R = 13;
  var PIPE_W = 62;
  var PIPE_GAP = 160;

  var mode = "ready";
  var bird = { y: 300, vy: 0, rot: 0, wing: 0 };
  var pipes = [];
  var score = 0;
  var best = 0;
  var spawnTimer = 0;
  var speed = 138;
  var worldOffset = 0;
  var last = 0;
  var deadAt = 0;
  var clouds = [];
  var hills = [];

  function makeScenery() {
    clouds = [];
    for (var i = 0; i < 7; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 40 + Math.random() * 210,
        s: 0.6 + Math.random() * 0.9,
        v: 8 + Math.random() * 12
      });
    }
    hills = [];
    for (var j = 0; j < 5; j++) {
      hills.push({
        x: j * 110 - 30,
        h: 50 + Math.random() * 60,
        w: 130 + Math.random() * 70
      });
    }
  }

  function refreshBest() {
    best = scores.best("flappy") || 0;
    bestEl.textContent = best;
  }

  function setOverlay(kicker, title, html, button) {
    kickerEl.textContent = kicker;
    titleEl.textContent = title;
    textEl.innerHTML = html;
    primaryBtn.textContent = button;
    overlay.hidden = false;
  }

  function reset() {
    mode = "ready";
    bird.y = 300;
    bird.vy = 0;
    bird.rot = 0;
    bird.wing = 0;
    pipes = [];
    score = 0;
    spawnTimer = 0.7;
    speed = 138;
    worldOffset = 0;
    scoreEl.textContent = "0";
    statusEl.textContent = "准备";
    statusEl.className = "";
    overlay.hidden = true;
    refreshBest();
    last = performance.now();
  }

  function start() {
    reset();
    mode = "playing";
    statusEl.textContent = "飞行中";
    flap();
  }

  function flap() {
    if (mode !== "playing") return;
    bird.vy = FLAP;
    bird.wing = 1;
    sound.play("click");
  }

  function end() {
    if (mode === "over") return;
    mode = "over";
    deadAt = performance.now();
    statusEl.textContent = "结束";
    statusEl.className = "is-hot";
    sound.play("hit");
    var result = scores.submit("flappy", score);
    best = result.best;
    bestEl.textContent = best;
    setTimeout(function () {
      sound.play("lose");
    }, 90);
    setOverlay(
      "撞到了",
      "游戏结束",
      "本局得分 <b>" + score + "</b> 分 · 最高 <b>" + best + "</b> 分" +
        (result.isRecord && score > 0 ? " · 新纪录！" : ""),
      "再来一局"
    );
  }

  function spawnPipe() {
    var margin = 54;
    var gap = Math.max(132, PIPE_GAP - Math.floor(score / 8) * 4);
    var minCenter = margin + gap / 2;
    var maxCenter = GROUND_Y - margin - gap / 2;
    var center = minCenter + Math.random() * (maxCenter - minCenter);
    pipes.push({
      x: W + 10,
      top: center - gap / 2,
      gap: gap,
      passed: false
    });
  }

  function update(dt) {
    if (mode === "playing") {
      bird.vy += GRAVITY * dt;
      bird.y += bird.vy * dt;
      bird.rot = Math.max(-0.5, Math.min(1.15, bird.vy / 620));
      bird.wing = Math.max(0, bird.wing - dt * 5);
      speed = Math.min(205, 138 + score * 1.8);
      worldOffset += speed * dt;

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnPipe();
        spawnTimer = Math.max(1.02, 1.48 - score * 0.012);
      }

      var i;
      for (i = pipes.length - 1; i >= 0; i--) {
        var pipe = pipes[i];
        pipe.x -= speed * dt;
        if (!pipe.passed && pipe.x + PIPE_W < BIRD_X - BIRD_R) {
          pipe.passed = true;
          score += 1;
          scoreEl.textContent = score;
          sound.play("pop");
        }
        if (pipe.x + PIPE_W < -20) pipes.splice(i, 1);
      }

      if (bird.y - BIRD_R <= 0) {
        bird.y = BIRD_R;
        bird.vy = Math.max(0, bird.vy);
      }

      for (i = 0; i < pipes.length; i++) {
        var p = pipes[i];
        if (BIRD_X + BIRD_R < p.x || BIRD_X - BIRD_R > p.x + PIPE_W) continue;
        if (bird.y - BIRD_R < p.top || bird.y + BIRD_R > p.top + p.gap) {
          end();
          return;
        }
      }

      if (bird.y + BIRD_R >= GROUND_Y) {
        bird.y = GROUND_Y - BIRD_R;
        end();
        return;
      }
    } else if (mode === "ready") {
      bird.y = 300 + Math.sin(performance.now() / 380) * 8;
      bird.rot = 0;
      bird.wing = 0;
      worldOffset += 24 * dt;
    }

    for (var c = 0; c < clouds.length; c++) {
      clouds[c].x -= clouds[c].v * dt;
      if (clouds[c].x < -90) clouds[c].x = W + 60;
    }
    for (var h = 0; h < hills.length; h++) {
      hills[h].x -= 10 * dt;
      if (hills[h].x + hills[h].w < -20) hills[h].x = W + 40;
    }
  }

  /* ---------------- 绘制 ---------------- */

  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, "#6ec6ff");
    sky.addColorStop(0.62, "#a9e2ff");
    sky.addColorStop(1, "#e6f7ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);

    ctx.fillStyle = "rgba(255, 245, 190, .88)";
    ctx.beginPath();
    ctx.arc(292, 94, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 245, 190, .28)";
    ctx.beginPath();
    ctx.arc(292, 94, 56, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      drawCloud(c.x, c.y, c.s);
    }

    ctx.fillStyle = "#8fd694";
    for (var h = 0; h < hills.length; h++) {
      var hill = hills[h];
      ctx.beginPath();
      ctx.moveTo(hill.x, GROUND_Y);
      ctx.quadraticCurveTo(
        hill.x + hill.w / 2,
        GROUND_Y - hill.h * 2.1,
        hill.x + hill.w,
        GROUND_Y
      );
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#6cbf7b";
    ctx.fillRect(0, GROUND_Y - 18, W, 18);
  }

  function drawCloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 17 * s, 0, Math.PI * 2);
    ctx.arc(x + 19 * s, y - 8 * s, 21 * s, 0, Math.PI * 2);
    ctx.arc(x + 42 * s, y, 15 * s, 0, Math.PI * 2);
    ctx.arc(x + 20 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPipe(pipe) {
    var x = Math.round(pipe.x);
    var topH = Math.round(pipe.top);
    var bottomY = Math.round(pipe.top + pipe.gap);
    var bottomH = GROUND_Y - bottomY;

    function body(px, py, pw, ph) {
      ctx.fillStyle = "#4fae3e";
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = "#66c94f";
      ctx.fillRect(px + 7, py, 9, ph);
      ctx.fillStyle = "#2f7d2a";
      ctx.fillRect(px + pw - 9, py, 9, ph);
      ctx.strokeStyle = "#1f5e20";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    }

    body(x, 0, PIPE_W, topH);
    body(x, bottomY, PIPE_W, bottomH);

    // 管口
    var capW = PIPE_W + 10;
    var capX = x - 5;
    function cap(y) {
      ctx.fillStyle = "#5ec247";
      ctx.fillRect(capX, y, capW, 24);
      ctx.fillStyle = "#83e36a";
      ctx.fillRect(capX + 5, y + 4, 10, 16);
      ctx.fillStyle = "#2f7d2a";
      ctx.fillRect(capX + capW - 9, y + 4, 6, 16);
      ctx.strokeStyle = "#1f5e20";
      ctx.lineWidth = 2;
      ctx.strokeRect(capX + 1, y + 1, capW - 2, 22);
    }
    cap(topH - 24);
    cap(bottomY);
  }

  function drawBird() {
    var x = BIRD_X;
    var y = Math.round(bird.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bird.rot);

    // 尾巴
    ctx.fillStyle = "#e8a91f";
    ctx.beginPath();
    ctx.moveTo(-14, 1);
    ctx.lineTo(-25, -5);
    ctx.lineTo(-24, 7);
    ctx.closePath();
    ctx.fill();

    // 身体
    ctx.fillStyle = "#ffd93d";
    ctx.strokeStyle = "#3b2a12";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 翅膀
    var wingY = -2 + Math.sin((bird.wing || 0) * Math.PI) * 4;
    ctx.fillStyle = "#fff4c2";
    ctx.beginPath();
    ctx.ellipse(-4, wingY + 3, 9, 6, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3b2a12";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 眼睛
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(7, -5, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3b2a12";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#1b1b1b";
    ctx.beginPath();
    ctx.arc(8.5, -5, 2.3, 0, Math.PI * 2);
    ctx.fill();

    // 嘴
    ctx.fillStyle = "#ff8a1e";
    ctx.beginPath();
    ctx.moveTo(14, -1);
    ctx.lineTo(25, 2);
    ctx.lineTo(14, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3b2a12";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  function drawGround() {
    ctx.fillStyle = "#d7b46a";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#9ed36a";
    ctx.fillRect(0, GROUND_Y, W, 9);
    ctx.fillStyle = "#77b84f";
    ctx.fillRect(0, GROUND_Y + 9, W, 5);

    var stripe = 24;
    var offset = worldOffset % (stripe * 2);
    ctx.fillStyle = "#c9a35d";
    for (var x = -offset - stripe * 2; x < W + stripe; x += stripe * 2) {
      ctx.fillRect(x, GROUND_Y + 22, stripe, 9);
    }
    ctx.fillStyle = "rgba(0,0,0,.08)";
    ctx.fillRect(0, H - 24, W, 24);
  }

  function drawScore() {
    if (mode === "ready") return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 44px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(20, 26, 44, .85)";
    ctx.strokeText(String(score), W / 2, 78);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(score), W / 2, 78);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    for (var i = 0; i < pipes.length; i++) drawPipe(pipes[i]);
    drawBird();
    drawGround();
    drawScore();
  }

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }

  /* ---------------- 输入 ---------------- */

  function handleFlap(event) {
    if (event) event.preventDefault();
    if (mode === "ready") start();
    else if (mode === "playing") flap();
    else if (mode === "over" && performance.now() - deadAt > 550) start();
  }

  canvas.addEventListener("pointerdown", handleFlap);
  document.addEventListener("keydown", function (event) {
    if (event.key === " " || event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
      if (event.target && /input|textarea|button/i.test(event.target.tagName)) return;
      handleFlap(event);
    }
  });
  primaryBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    start();
  });
  restartBtn.addEventListener("click", function () {
    reset();
    setOverlay(
      "准备起飞",
      "Flappy Bird",
      "点击画面、按空格或 ↑ 拍翅膀，穿过水管。撞到水管或地面就结束。",
      "开始游戏"
    );
  });

  /* ---------------- 启动 ---------------- */

  // 无头测试入口：?debug=1 时暴露只读状态和摆管工具
  var DEBUG = /[?&]debug=1(?:&|$)/.test(window.location.search);
  if (DEBUG) {
    window.__flappy = {
      get mode() {
        return mode;
      },
      get score() {
        return score;
      },
      get best() {
        return best;
      },
      get bird() {
        return { y: bird.y, vy: bird.vy };
      },
      get pipes() {
        return pipes.map(function (p) {
          return { x: p.x, top: p.top, gap: p.gap, passed: p.passed };
        });
      },
      start: start,
      reset: reset,
      flap: flap,
      setBird: function (y, vy) {
        bird.y = y;
        bird.vy = typeof vy === "number" ? vy : 0;
      },
      addPipe: function (x, top, gap) {
        pipes.push({ x: x, top: top, gap: gap, passed: false });
      },
      clearPipes: function () {
        pipes.length = 0;
      }
    };
  }

  makeScenery();
  refreshBest();
  setOverlay(
    "准备起飞",
    "Flappy Bird",
    "点击画面、按空格或 ↑ 拍翅膀，穿过水管。撞到水管或地面就结束。",
    "开始游戏"
  );
  window.requestAnimationFrame(frame);
})();
