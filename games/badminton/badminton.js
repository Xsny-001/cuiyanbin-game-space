/* ============================================================
   PIXEL BADMINTON · 像素羽毛球
   - 原生 Canvas，无外部依赖
   - 11 分制：10 平后需领先 2 分，15 分封顶
   - 三种操作：拖拽 / 双摇杆 / 时机挥拍
   - 过网滞空：球飞向玩家时短暂慢动作
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;
  var store = App.store;
  var clamp = App.utils.clamp;

  /* ---------------- 常量 ---------------- */

  var W = 480;
  var H = 270;
  var FLOOR = 236;
  var NET_X = 240;
  var NET_TOP = 168;
  var COURT_L = 44;
  var COURT_R = 436;
  var GRAVITY = 300;
  var BALL_R = 4;
  var RACKET_R = 30;
  var SERVE_HOLD = 0.85;
  var POINT_HOLD = 1.05;

  var HUMAN_COLOR = "#ffd85e";
  var HUMAN_DARK = "#b3421f";
  var AI_COLOR = "#ff6b8a";
  var AI_DARK = "#7a2440";

  var SETTINGS_KEY = "badminton.settings";

  /* ---------------- DOM ---------------- */

  var canvas = document.getElementById("cv");
  var stage = document.getElementById("stage");
  var ctx = App.setupCanvas(canvas, W, H);

  var menuEl = document.getElementById("menu");
  var resultEl = document.getElementById("result");
  var startBtn = document.getElementById("startBtn");
  var againBtn = document.getElementById("againBtn");
  var menuBtn = document.getElementById("menuBtn");
  var resultKicker = document.getElementById("resultKicker");
  var resultTitle = document.getElementById("resultTitle");
  var resultScore = document.getElementById("resultScore");
  var resultText = document.getElementById("resultText");

  var scLEl = document.getElementById("scL");
  var scREl = document.getElementById("scR");
  var sbLEl = document.getElementById("sbL");
  var sbREl = document.getElementById("sbR");
  var nameLEl = document.getElementById("nameL");
  var nameREl = document.getElementById("nameR");
  var tipEl = document.getElementById("tip");
  var gestEl = document.getElementById("gest");
  var flashEl = document.getElementById("flash");
  var slowEl = document.getElementById("slow");

  var joyLEl = document.getElementById("joyL");
  var joyREl = document.getElementById("joyR");
  var swingBtn = document.getElementById("swingBtn");

  /* ---------------- 状态 ---------------- */

  var state = "menu"; // menu | serve | rally | point | over
  var humanSide = "L";
  var mode = 0; // 0 拖拽 / 1 摇杆 / 2 时机
  var hang = true;

  var matchScore = { L: 0, R: 0 };
  var matchWinner = null;
  var server = "L";
  var lastHitter = null;
  var rallyHits = 0;
  var pointTimer = 0;
  var serveTimer = 0;

  var slowOn = false;
  var flashTimer = 0;
  var clock = 0;

  var ball = {
    x: 200,
    y: 150,
    vx: 0,
    vy: 0,
    trail: []
  };

  var dragging = false;
  var keys = { left: false, right: false, up: false, down: false };
  var joyL = { x: 0, y: 0, active: false };
  var joyR = { x: 0, y: 0, active: false, fired: false };

  function other(side) {
    return side === "L" ? "R" : "L";
  }

  function homeX(side) {
    return side === "L" ? 156 : 324;
  }

  function makeRacket(side, human) {
    var hx = homeX(side);
    return {
      side: side,
      human: !!human,
      x: hx,
      y: 190,
      tx: hx,
      ty: 190,
      speed: 640,
      cd: 0,
      swingT: 0,
      react: 0,
      aim: 0
    };
  }

  var rackets = { L: makeRacket("L", true), R: makeRacket("R", false) };

  /* ---------------- 设置存档 ---------------- */

  function loadSettings() {
    var saved = store.get(SETTINGS_KEY, null);
    if (!saved || typeof saved !== "object") return;
    if (saved.side === "L" || saved.side === "R") humanSide = saved.side;
    if (saved.mode === 0 || saved.mode === 1 || saved.mode === 2) mode = saved.mode;
    hang = saved.hang !== false;
  }

  function saveSettings() {
    store.set(SETTINGS_KEY, { side: humanSide, mode: mode, hang: hang });
  }

  function syncOptionButtons() {
    var i;
    var sides = menuEl.querySelectorAll("[data-side]");
    for (i = 0; i < sides.length; i++) {
      sides[i].classList.toggle("sel", sides[i].getAttribute("data-side") === humanSide);
    }
    var modes = menuEl.querySelectorAll("[data-mode]");
    for (i = 0; i < modes.length; i++) {
      modes[i].classList.toggle("sel", Number(modes[i].getAttribute("data-mode")) === mode);
    }
    var hangs = menuEl.querySelectorAll("[data-hang]");
    for (i = 0; i < hangs.length; i++) {
      hangs[i].classList.toggle(
        "sel",
        (hangs[i].getAttribute("data-hang") === "1") === hang
      );
    }
    document.body.setAttribute("data-mode", String(mode));
  }

  /* ---------------- 界面 ---------------- */

  function updateOrientation() {
    var portrait = window.innerHeight > window.innerWidth;
    document.body.setAttribute("data-orient", portrait ? "portrait" : "landscape");
  }

  function updateScoreboard() {
    scLEl.textContent = String(matchScore.L);
    scREl.textContent = String(matchScore.R);
    sbLEl.classList.toggle("me", humanSide === "L");
    sbREl.classList.toggle("me", humanSide === "R");
    nameLEl.textContent = humanSide === "L" ? "YOU" : "P1";
    nameREl.textContent = humanSide === "R" ? "YOU" : "P2";
  }

  function updateServeDot() {
    var show = state === "serve" || state === "rally" || state === "point";
    sbLEl.classList.toggle("serving", show && server === "L");
    sbREl.classList.toggle("serving", show && server === "R");
  }

  var MODE_TIPS = [
    "拖动鼠标 / 手指移动球拍，碰到羽毛球自动回击",
    "左摇杆移动球拍 · 右摇杆推一下挥拍，左右方向决定落点",
    "球拍自动跟随羽毛球 · 进入范围时点击「挥拍」或按空格"
  ];

  function updateTip() {
    if (state === "serve") {
      tipEl.innerHTML =
        (server === humanSide ? "<span class=\"k\">你</span>发球" : "对手发球") +
        " · " +
        MODE_TIPS[mode];
      return;
    }
    tipEl.innerHTML = MODE_TIPS[mode];
  }

  function showFlash(text, duration) {
    flashEl.textContent = text;
    flashEl.classList.add("on");
    flashTimer = duration || 0.9;
  }

  function setScreen(screen) {
    document.body.setAttribute("data-screen", screen);
    menuEl.classList.toggle("hidden", screen !== "menu");
    resultEl.classList.toggle("hidden", screen !== "result");
  }

  /* ---------------- 音效 ---------------- */

  function play(name) {
    try {
      sound.play(name);
    } catch (err) {
      /* 音效失败不影响比赛 */
    }
  }

  /* ---------------- 比赛流程 ---------------- */

  function resetRackets() {
    rackets.L = makeRacket("L", humanSide === "L");
    rackets.R = makeRacket("R", humanSide === "R");
    rackets.L.human = humanSide === "L";
    rackets.R.human = humanSide === "R";
    rackets[humanSide].speed = 640;
    rackets[other(humanSide)].speed = 330;
  }

  function resetBall() {
    ball.trail.length = 0;
    ball.vx = 0;
    ball.vy = 0;
  }

  function beginServe() {
    state = "serve";
    serveTimer = SERVE_HOLD;
    lastHitter = null;
    rallyHits = 0;
    var isLeft = server === "L";
    resetBall();
    ball.x = isLeft ? NET_X - 36 : NET_X + 36;
    ball.y = 148;
    updateServeDot();
    updateTip();
    gestEl.textContent = "";
  }

  function startServe() {
    var target;
    if (server === "L") target = 300 + Math.random() * 80;
    else target = 100 + Math.random() * 80;
    var flight = 1.5;

    ball.vx = (target - ball.x) / flight;
    ball.vy = (FLOOR - 10 - ball.y - 0.5 * GRAVITY * flight * flight) / flight;
    lastHitter = server;
    rallyHits = 0;
    state = "rally";
    showFlash("发 球", 0.65);
    play("pop");
    updateServeDot();
    updateTip();
  }

  function startMatch() {
    loadSettings();
    syncOptionButtons();
    matchScore.L = 0;
    matchScore.R = 0;
    matchWinner = null;
    server = humanSide;
    lastHitter = null;
    rallyHits = 0;
    state = "serve";
    resetRackets();
    resetBall();
    ball.x = humanSide === "L" ? NET_X - 36 : NET_X + 36;
    ball.y = 148;
    serveTimer = SERVE_HOLD;
    slowOn = false;
    slowEl.classList.remove("on");
    flashEl.classList.remove("on");
    flashTimer = 0;
    setScreen("play");
    updateScoreboard();
    updateServeDot();
    updateTip();
    gestEl.textContent = "";
    play("click");
  }

  function showMenu() {
    state = "menu";
    setScreen("menu");
    syncOptionButtons();
    updateScoreboard();
    updateServeDot();
    tipEl.textContent = "选择位置与操作模式，然后开始比赛";
    gestEl.textContent = "";
    slowOn = false;
    slowEl.classList.remove("on");
    flashEl.classList.remove("on");
    flashTimer = 0;
  }

  function matchWon(side) {
    var mine = matchScore[side];
    var theirs = matchScore[other(side)];
    return mine >= 15 || (mine >= 11 && mine - theirs >= 2);
  }

  function awardPoint(winner, reason) {
    if (state !== "rally") return;
    matchScore[winner] += 1;
    server = winner;
    state = "point";
    pointTimer = POINT_HOLD;
    matchWinner = matchWon(winner) ? winner : null;
    resetBall();
    updateScoreboard();
    updateServeDot();

    if (winner === humanSide) {
      showFlash("得 分", 0.9);
      play("pop");
    } else {
      showFlash("失 分", 0.9);
      play("lose");
    }
    gestEl.textContent = reason || "";
  }

  function endMatch() {
    state = "over";
    var won = matchWinner === humanSide;
    if (won) scores.addWin("badminton");
    else scores.addLoss("badminton");

    resultKicker.textContent = "比赛结束 · 11 分制";
    resultTitle.textContent = won ? "你赢了！" : "对手获胜";
    resultTitle.style.color = won ? "#4ce07a" : "#ffd85e";
    resultScore.textContent = matchScore.L + " : " + matchScore.R;
    var wins = scores.wins("badminton");
    resultText.textContent = won
      ? "本场胜场 +1 · 累计 " + wins + " 胜"
      : "别灰心，再战一局 · 累计 " + wins + " 胜";
    setScreen("result");
    play(won ? "win" : "lose");
  }

  /* ---------------- 击球 ---------------- */

  function ballOnSide(p) {
    return p.side === "L" ? ball.x < NET_X : ball.x > NET_X;
  }

  function distance(p) {
    var dx = ball.x - p.x;
    var dy = ball.y - p.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function inReach(p) {
    return distance(p) <= RACKET_R + BALL_R;
  }

  function canHit(p) {
    return (
      state === "rally" &&
      lastHitter !== p.side &&
      p.cd <= 0 &&
      ballOnSide(p)
    );
  }

  function humanTargetX(p) {
    // 落点随机分布在对手半场，避免每次都是同一条线路
    var jitter = (Math.random() - 0.5) * 50;
    if (p.side === "L") return clamp(332 + p.aim * 46 + jitter, 262, 414);
    return clamp(148 - p.aim * 46 + jitter, 66, 218);
  }

  function aiTargetX(p) {
    var roll = Math.random();
    if (p.side === "R") {
      if (roll < 0.45) return 72 + Math.random() * 58;
      if (roll < 0.8) return 140 + Math.random() * 58;
      return 194 + Math.random() * 26;
    }
    if (roll < 0.45) return 350 + Math.random() * 58;
    if (roll < 0.8) return 282 + Math.random() * 58;
    return 260 + Math.random() * 26;
  }

  function predictAtHeight(targetY) {
    var a = 0.5 * GRAVITY;
    var b = ball.vy;
    var c = ball.y - targetY;
    var disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    var sq = Math.sqrt(disc);
    var t1 = (-b - sq) / (2 * a);
    var t2 = (-b + sq) / (2 * a);
    var t = Math.max(t1, t2);
    if (!isFinite(t) || t <= 0) return null;
    return { x: ball.x + ball.vx * t, y: targetY, t: t };
  }

  function doHit(p, targetX) {
    var h = clamp((226 - ball.y) / 106, 0, 1);
    var flight = 1.15 + (1 - h) * 0.45;
    targetX = clamp(targetX, 60, 420);

    // 贴网低球需要把球挑高才能过网：适当拉长滞空时间，避免必吃下网
    var landY = FLOOR - 8;
    var toTarget = targetX - ball.x;
    var toNet = NET_X - ball.x;
    if (Math.abs(toTarget) > 1 && toTarget * toNet > 0) {
      var k = toNet / toTarget;
      if (k > 0.04 && k < 0.96) {
        var need = ball.y + k * (landY - ball.y) - (NET_TOP - 4);
        if (need > 0) {
          var lift = Math.sqrt((2 * need) / (GRAVITY * k * (1 - k)));
          flight = Math.max(flight, Math.min(lift, 1.9));
        }
      }
    }

    ball.vx = (targetX - ball.x) / flight;
    ball.vy =
      (landY - ball.y - 0.5 * GRAVITY * flight * flight) / flight;
    lastHitter = p.side;
    rallyHits += 1;
    p.cd = 0.28;
    p.swingT = 0.18;
    ball.trail.length = 0;
    gestEl.textContent = "第 " + rallyHits + " 拍";
    play("hit");
  }

  function tryHit(p, aim) {
    if (!canHit(p) || !inReach(p)) return false;
    p.aim = clamp(aim || 0, -1, 1);
    doHit(p, p.human ? humanTargetX(p) : aiTargetX(p));
    return true;
  }

  function tryHumanSwing(aim) {
    if (state !== "rally") return;
    var p = rackets[humanSide];
    p.swingT = 0.18;
    tryHit(p, aim || 0);
  }

  /* ---------------- 输入 ---------------- */

  function clampRacket(p) {
    var lo = p.side === "L" ? COURT_L + 4 : NET_X + 22;
    var hi = p.side === "L" ? NET_X - 22 : COURT_R - 4;
    p.tx = clamp(p.tx, lo, hi);
    p.ty = clamp(p.ty, 116, 224);
    p.x = clamp(p.x, lo, hi);
    p.y = clamp(p.y, 116, 224);
  }

  function moveRacket(p, dt) {
    var dx = p.tx - p.x;
    var dy = p.ty - p.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var step = p.speed * dt;
    if (dist <= step) {
      p.x = p.tx;
      p.y = p.ty;
    } else {
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
    }
    clampRacket(p);
  }

  function worldFromPointer(event) {
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || W;
    var h = rect.height || H;
    return {
      x: ((event.clientX - rect.left) / w) * W,
      y: ((event.clientY - rect.top) / h) * H
    };
  }

  function pointRacketAt(event) {
    var p = rackets[humanSide];
    var pos = worldFromPointer(event);
    p.tx = pos.x;
    p.ty = pos.y;
    clampRacket(p);
  }

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

  function isTypingTarget(target) {
    return !!(target && /input|textarea|select/i.test(target.tagName));
  }

  document.addEventListener("keydown", function (event) {
    if (isTypingTarget(event.target)) return;
    if (event.key === " " || event.code === "Space") {
      if (state === "rally" || state === "serve") {
        event.preventDefault();
        tryHumanSwing(0);
      }
      return;
    }
    var key = KEY_MAP[event.key];
    if (!key) return;
    if (state === "menu" || state === "over") return;
    event.preventDefault();
    keys[key] = true;
  });

  document.addEventListener("keyup", function (event) {
    var key = KEY_MAP[event.key];
    if (key) keys[key] = false;
  });

  stage.addEventListener("pointerdown", function (event) {
    if (state === "menu" || state === "over" || state === "point") return;
    if (mode === 0) {
      dragging = true;
      pointRacketAt(event);
      if (stage.setPointerCapture) {
        try {
          stage.setPointerCapture(event.pointerId);
        } catch (err) {
          /* 忽略 */
        }
      }
    } else if (mode === 2) {
      tryHumanSwing(0);
    }
    event.preventDefault();
  });

  stage.addEventListener("pointermove", function (event) {
    if (!dragging || mode !== 0) return;
    pointRacketAt(event);
    event.preventDefault();
  });

  window.addEventListener("pointerup", function () {
    dragging = false;
  });

  window.addEventListener("pointercancel", function () {
    dragging = false;
  });

  swingBtn.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    event.stopPropagation();
    var p = rackets[humanSide];
    var aim = inReach(p) && distance(p) < 14 ? 0.5 : 0;
    tryHumanSwing(aim);
  });

  function setupJoystick(el, joy) {
    var knob = el.querySelector(".knob");

    function setFromEvent(event) {
      var rect = el.getBoundingClientRect();
      var radius = Math.max(1, rect.width / 2);
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = event.clientX - cx;
      var dy = event.clientY - cy;
      var len = Math.sqrt(dx * dx + dy * dy);
      var ratio = Math.min(1, len / radius);
      if (len > 0.0001) {
        dx = (dx / len) * ratio;
        dy = (dy / len) * ratio;
      } else {
        dx = 0;
        dy = 0;
      }
      joy.x = dx;
      joy.y = dy;
      joy.active = true;
      if (knob) {
        knob.style.transform =
          "translate(" + dx * radius * 0.5 + "px," + dy * radius * 0.5 + "px)";
      }
    }

    function release(event) {
      joy.x = 0;
      joy.y = 0;
      joy.active = false;
      joy.fired = false;
      if (knob) knob.style.transform = "";
      if (el.releasePointerCapture && event && event.pointerId != null) {
        try {
          el.releasePointerCapture(event.pointerId);
        } catch (err) {
          /* 忽略 */
        }
      }
    }

    el.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      if (el.setPointerCapture && event.pointerId != null) {
        try {
          el.setPointerCapture(event.pointerId);
        } catch (err) {
          /* 忽略 */
        }
      }
      setFromEvent(event);
    });
    el.addEventListener("pointermove", function (event) {
      if (!joy.active) return;
      event.preventDefault();
      setFromEvent(event);
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
  }

  setupJoystick(joyLEl, joyL);
  setupJoystick(joyREl, joyR);

  /* ---------------- 选手更新 ---------------- */

  function updateHuman(dt) {
    var p = rackets[humanSide];
    if (!p) return;
    p.cd = Math.max(0, p.cd - dt);
    p.swingT = Math.max(0, p.swingT - dt);

    if (state === "menu" || state === "over") return;

    var ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    var ay = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (ax || ay) {
      p.tx += ax * 300 * dt;
      p.ty += ay * 300 * dt;
    }

    if (mode === 1 && joyL.active) {
      p.tx += joyL.x * 420 * dt;
      p.ty += joyL.y * 420 * dt;
    }

    if (mode === 2 && state === "rally" && ballOnSide(p) && lastHitter !== p.side) {
      var ip = predictAtHeight(192);
      var canWait = ip && (p.side === "L" ? ip.x < NET_X - 8 : ip.x > NET_X + 8);
      if (canWait) {
        p.tx = ip.x;
        p.ty = 188;
      } else {
        p.tx = ball.x + ball.vx * 0.12;
        p.ty = ball.y + ball.vy * 0.12;
      }
    } else if (mode === 2 && state !== "rally") {
      p.tx = homeX(humanSide);
      p.ty = 190;
    }

    clampRacket(p);
    moveRacket(p, dt);

    if (mode === 0 && state === "rally" && canHit(p) && inReach(p)) {
      tryHit(p, 0);
    }

    if (mode === 1 && joyR.active) {
      var mag = Math.sqrt(joyR.x * joyR.x + joyR.y * joyR.y);
      if (mag > 0.5 && !joyR.fired) {
        joyR.fired = true;
        // 朝网前推 = 短球，向后场推 = 深球
        var depth = humanSide === "L" ? -joyR.x : joyR.x;
        tryHumanSwing(depth * 1.6);
      } else if (mag < 0.3) {
        joyR.fired = false;
      }
    }

    var hot = mode === 2 && state === "rally" && canHit(p) && inReach(p);
    swingBtn.classList.toggle("hot", !!hot);
  }

  function updateAI(dt) {
    var p = rackets[other(humanSide)];
    if (!p) return;
    p.cd = Math.max(0, p.cd - dt);
    p.swingT = Math.max(0, p.swingT - dt);
    p.react = Math.max(0, p.react - dt);

    if (state !== "rally") {
      p.tx = homeX(p.side);
      p.ty = 190;
      clampRacket(p);
      moveRacket(p, dt);
      return;
    }

    var incoming = ballOnSide(p) && lastHitter !== p.side;
    if (incoming) {
      var ip = predictAtHeight(192);
      var canWait = ip && (p.side === "L" ? ip.x < NET_X - 8 : ip.x > NET_X + 8);
      if (canWait) {
        p.tx = ip.x;
        p.ty = 188;
      } else {
        p.tx = ball.x + ball.vx * 0.12;
        p.ty = ball.y + ball.vy * 0.12;
      }
    } else {
      p.tx = homeX(p.side);
      p.ty = 190;
    }
    clampRacket(p);
    p.speed = 330;
    moveRacket(p, dt);

    if (incoming && p.react <= 0 && canHit(p) && inReach(p)) {
      // 有概率判断失误，给玩家留出得分机会
      if (Math.random() < 0.1) {
        p.react = 0.7;
      } else {
        p.react = 0.26;
        doHit(p, aiTargetX(p));
      }
    }
  }

  /* ---------------- 球 ---------------- */

  function updateBall(dt) {
    if (state !== "rally") return;

    var prevX = ball.x;
    ball.x += ball.vx * dt;
    ball.vy += GRAVITY * dt;
    ball.y += ball.vy * dt;

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 9) ball.trail.shift();

    // 过网：低于网带算下网
    if (
      (prevX - NET_X) * (ball.x - NET_X) <= 0 &&
      Math.abs(ball.x - prevX) > 0.01
    ) {
      if (ball.y >= NET_TOP) {
        ball.x = prevX < NET_X ? NET_X - 4 : NET_X + 4;
        ball.y = Math.max(ball.y, NET_TOP + 2);
        awardPoint(other(lastHitter), "下网");
        return;
      }
    }

    // 出界（安全兜底）
    if (ball.x < 4 || ball.x > W - 4) {
      awardPoint(other(lastHitter), "出界");
      return;
    }

    // 落地
    if (ball.y >= FLOOR - BALL_R) {
      ball.y = FLOOR - BALL_R;
      var landed = ball.x < NET_X ? "L" : "R";
      awardPoint(other(landed), "落地");
    }
  }

  function isSlowMoment() {
    if (!hang || state !== "rally") return false;
    if (lastHitter === humanSide) return false;
    var towardHuman = humanSide === "L" ? ball.vx < -4 : ball.vx > 4;
    var onHumanSide = humanSide === "L" ? ball.x < NET_X : ball.x > NET_X;
    return towardHuman && onHumanSide && ball.y < FLOOR - 10;
  }

  function updateEffects(dt) {
    clock += dt;
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) flashEl.classList.remove("on");
    }
    if (state === "serve") {
      // 发球点上下漂浮
      ball.y = 148 + Math.sin(clock * 5) * 3;
    }
  }

  /* ---------------- 主循环 ---------------- */

  function update(dt) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);

    if (state === "menu" || state === "over") {
      updateEffects(dt);
      return;
    }

    var slow = isSlowMoment();
    if (slow !== slowOn) {
      slowOn = slow;
      slowEl.classList.toggle("on", slow);
    }
    var sdt = dt * (slow ? 0.45 : 1);

    updateHuman(sdt);
    updateAI(sdt);
    updateEffects(dt);

    if (state === "point") {
      pointTimer -= dt;
      if (pointTimer <= 0) {
        if (matchWinner) {
          endMatch();
        } else {
          beginServe();
        }
      }
      return;
    }

    if (state === "serve") {
      serveTimer -= dt;
      if (serveTimer <= 0) startServe();
      return;
    }

    if (state === "rally") updateBall(sdt);
  }

  /* ---------------- 绘制 ---------------- */

  var crowd = [];

  function makeCrowd() {
    var palette = ["#3b4776", "#4a5a9c", "#5b6fb8", "#33406f", "#6c7cc0"];
    for (var row = 0; row < 4; row++) {
      for (var i = 0; i < 34; i++) {
        crowd.push({
          x: 8 + i * 14 + (row % 2) * 7,
          y: 44 + row * 12,
          c: palette[(i + row * 3) % palette.length]
        });
      }
    }
  }

  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#141c3a");
    g.addColorStop(0.55, "#0b1126");
    g.addColorStop(1, "#070a16");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 顶部灯带
    ctx.fillStyle = "rgba(143, 232, 255, .06)";
    ctx.beginPath();
    ctx.moveTo(70, 0);
    ctx.lineTo(180, 132);
    ctx.lineTo(300, 132);
    ctx.lineTo(410, 0);
    ctx.closePath();
    ctx.fill();

    // 看台
    for (var i = 0; i < crowd.length; i++) {
      ctx.fillStyle = crowd[i].c;
      ctx.fillRect(crowd[i].x, crowd[i].y, 3, 3);
    }
    ctx.fillStyle = "rgba(10, 14, 30, .72)";
    ctx.fillRect(0, 96, W, 12);

    // 场馆横幅
    ctx.fillStyle = "rgba(255, 216, 94, .16)";
    ctx.fillRect(150, 108, 180, 12);
    ctx.fillStyle = "rgba(255, 216, 94, .5)";
    ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("P I X E L   B A D M I N T O N", W / 2, 117);
  }

  function drawCourt() {
    // 地板
    ctx.fillStyle = "#241f3a";
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = "#332a52";
    ctx.fillRect(0, FLOOR, W, 3);

    // 木地板纹理
    ctx.fillStyle = "rgba(255, 255, 255, .035)";
    for (var x = -20; x < W; x += 26) {
      ctx.fillRect(x, FLOOR + 4, 1, H - FLOOR - 4);
    }
    ctx.fillStyle = "rgba(0, 0, 0, .28)";
    ctx.fillRect(0, H - 10, W, 10);

    // 场地边线
    ctx.strokeStyle = "rgba(176, 196, 255, .55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(COURT_L, FLOOR + 6);
    ctx.lineTo(COURT_R, FLOOR + 6);
    ctx.moveTo(COURT_L, FLOOR + 6);
    ctx.lineTo(COURT_L, H - 10);
    ctx.moveTo(COURT_R, FLOOR + 6);
    ctx.lineTo(COURT_R, H - 10);
    ctx.moveTo(NET_X, FLOOR + 6);
    ctx.lineTo(NET_X, H - 10);
    ctx.stroke();

    // 网柱
    ctx.fillStyle = "#4a5a9c";
    ctx.fillRect(NET_X - 3, NET_TOP - 6, 6, FLOOR - NET_TOP + 6);
    ctx.fillStyle = "#26305c";
    ctx.fillRect(NET_X - 3, NET_TOP - 6, 2, FLOOR - NET_TOP + 6);

    // 网面（侧视：尽量画薄，避免挡住球）
    ctx.fillStyle = "rgba(210, 224, 255, .18)";
    ctx.fillRect(NET_X - 6, NET_TOP, 12, FLOOR - NET_TOP);
    ctx.strokeStyle = "rgba(210, 224, 255, .5)";
    ctx.lineWidth = 1;
    var y;
    for (y = NET_TOP; y < FLOOR; y += 6) {
      ctx.beginPath();
      ctx.moveTo(NET_X - 6, y + 0.5);
      ctx.lineTo(NET_X + 6, y + 0.5);
      ctx.stroke();
    }
    for (var x2 = NET_X - 6; x2 <= NET_X + 6; x2 += 6) {
      ctx.beginPath();
      ctx.moveTo(x2 + 0.5, NET_TOP);
      ctx.lineTo(x2 + 0.5, FLOOR);
      ctx.stroke();
    }

    // 网带
    ctx.fillStyle = "#f4f7ff";
    ctx.fillRect(NET_X - 14, NET_TOP - 3, 28, 4);
    ctx.fillStyle = "rgba(255, 255, 255, .35)";
    ctx.fillRect(NET_X - 14, NET_TOP + 1, 28, 2);
  }

  function drawShadow(x, y, size) {
    ctx.fillStyle = "rgba(0, 0, 0, .3)";
    ctx.beginPath();
    ctx.ellipse(x, FLOOR + 2, size, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (y < FLOOR - 20) {
      var k = clamp((FLOOR - y) / 140, 0, 1);
      ctx.fillStyle = "rgba(0, 0, 0, .16)";
      ctx.beginPath();
      ctx.ellipse(x, FLOOR + 1, size * (1 + k * 0.4), 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(p) {
    var dir = p.side === "L" ? 1 : -1;
    var x = Math.round(p.x);
    var y = Math.round(p.y);
    var color = p.human ? HUMAN_COLOR : AI_COLOR;
    var dark = p.human ? HUMAN_DARK : AI_DARK;
    var bodyX = Math.round(x - dir * 11);
    var bodyY = Math.round(Math.min(FLOOR - 18, y + 13));

    drawShadow(bodyX, y, 10);

    // 腿
    ctx.fillStyle = dark;
    ctx.fillRect(bodyX - 4, bodyY + 8, 3, 9);
    ctx.fillRect(bodyX + 3, bodyY + 8, 3, 9);

    // 身体
    ctx.fillStyle = color;
    ctx.fillRect(bodyX - 6, bodyY - 2, 13, 12);
    ctx.fillStyle = dark;
    ctx.fillRect(bodyX - 6, bodyY + 6, 13, 2);

    // 头
    ctx.fillStyle = "#ffd7b0";
    ctx.fillRect(bodyX - 4, bodyY - 11, 9, 9);
    ctx.fillStyle = dark;
    ctx.fillRect(bodyX - 5, bodyY - 12, 11, 3);
    ctx.fillStyle = "#141a33";
    ctx.fillRect(bodyX + (dir > 0 ? 2 : -2), bodyY - 7, 2, 2);

    // 手臂
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bodyX + dir * 4, bodyY + 2);
    ctx.lineTo(x, y);
    ctx.stroke();

    // 挥拍轨迹
    if (p.swingT > 0) {
      ctx.strokeStyle = p.human ? "rgba(255, 216, 94, .55)" : "rgba(255, 107, 138, .55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 15, dir > 0 ? -1.2 : 1.9, dir > 0 ? 1.2 : 4.4);
      ctx.stroke();
    }

    // 球拍
    ctx.save();
    ctx.translate(x, y);
    var tilt = dir * 0.35 + (p.swingT > 0 ? dir * 0.7 : 0);
    ctx.rotate(tilt);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-dir * 8, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.strokeStyle = "#cfe0ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(dir * 4, 0, 10, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(207, 224, 255, .45)";
    ctx.lineWidth = 1;
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(dir * 4 + i * 3, -6);
      ctx.lineTo(dir * 4 + i * 3, 6);
      ctx.stroke();
    }
    ctx.restore();

    // 玩家标记
    if (p.human) {
      ctx.fillStyle = "rgba(255, 216, 94, .85)";
      ctx.beginPath();
      ctx.moveTo(bodyX, bodyY - 20);
      ctx.lineTo(bodyX - 3, bodyY - 25);
      ctx.lineTo(bodyX + 3, bodyY - 25);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBall() {
    if (state === "menu") return;

    var i;
    for (i = 0; i < ball.trail.length; i++) {
      var t = ball.trail[i];
      ctx.fillStyle = "rgba(232, 236, 255, " + (i / ball.trail.length) * 0.22 + ")";
      ctx.fillRect(t.x - 1, t.y - 1, 2, 2);
    }

    if (state === "serve") {
      ctx.strokeStyle = "rgba(76, 224, 122, .8)";
      ctx.lineWidth = 2;
      var pulse = 5 + Math.sin(clock * 6) * 2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 9 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 地面投影
    drawShadow(ball.x, ball.y, 4);

    var ang = Math.atan2(-ball.vy, -ball.vx);
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ang);

    // 羽毛
    ctx.fillStyle = "rgba(232, 236, 255, .9)";
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(10, -4.5);
    ctx.lineTo(12, 0);
    ctx.lineTo(10, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(143, 160, 216, .9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, -1);
    ctx.lineTo(10, -3);
    ctx.moveTo(3, 1);
    ctx.lineTo(10, 3);
    ctx.stroke();

    // 球头
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8fa0d8";
    ctx.stroke();
    ctx.restore();
  }

  function drawScoreMark() {
    if (state === "menu") return;
    ctx.save();
    ctx.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(8, 11, 26, .7)";
    ctx.strokeText(matchScore.L + " : " + matchScore.R, W / 2, 146);
    ctx.fillStyle = "rgba(232, 236, 255, .85)";
    ctx.fillText(matchScore.L + " : " + matchScore.R, W / 2, 146);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawCourt();
    drawScoreMark();
    drawPlayer(rackets.L);
    drawPlayer(rackets.R);
    drawBall();
  }

  /* ---------------- 循环 ---------------- */

  var lastTime = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    draw();
    window.requestAnimationFrame(frame);
  }

  /* ---------------- 事件绑定 ---------------- */

  startBtn.addEventListener("click", startMatch);
  againBtn.addEventListener("click", startMatch);
  menuBtn.addEventListener("click", showMenu);

  menuEl.addEventListener("click", function (event) {
    var btn = event.target.closest ? event.target.closest("button") : null;
    if (!btn) return;
    var side = btn.getAttribute("data-side");
    var m = btn.getAttribute("data-mode");
    var h = btn.getAttribute("data-hang");
    if (side) humanSide = side;
    if (m !== null) mode = Number(m);
    if (h !== null) hang = h === "1";
    syncOptionButtons();
    saveSettings();
    if (state === "menu") {
      matchScore.L = 0;
      matchScore.R = 0;
      updateScoreboard();
    }
  });

  window.addEventListener("resize", updateOrientation);
  window.addEventListener("orientationchange", updateOrientation);

  document.addEventListener("visibilitychange", function () {
    lastTime = 0;
  });

  /* ---------------- 启动 ---------------- */

  loadSettings();
  makeCrowd();
  resetRackets();
  updateOrientation();
  syncOptionButtons();
  updateScoreboard();
  updateServeDot();
  setScreen("menu");
  tipEl.textContent = "选择位置与操作模式，然后开始比赛";

  // 无头测试 / 调试入口：?debug=1 时只暴露状态与单步推进，不启动动画循环
  var DEBUG = /[?&]debug=1(?:&|$)/.test(window.location.search);
  if (DEBUG) {
    window.__bmt = {
      get state() {
        return state;
      },
      get score() {
        return { L: matchScore.L, R: matchScore.R };
      },
      get ball() {
        return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
      },
      get human() {
        var p = rackets[humanSide];
        return {
          side: humanSide,
          mode: mode,
          hang: hang,
          x: p.x,
          y: p.y,
          tx: p.tx,
          ty: p.ty
        };
      },
      get lastHitter() {
        return lastHitter;
      },
      get slow() {
        return slowOn;
      },
      start: startMatch,
      menu: showMenu,
      step: function (dt) {
        update(dt);
      },
      setBall: function (x, y, vx, vy) {
        ball.x = x;
        ball.y = y;
        ball.vx = vx;
        ball.vy = vy;
        ball.trail.length = 0;
        state = "rally";
        matchWinner = null;
        pointTimer = 0;
        if (lastHitter === null) lastHitter = other(humanSide);
      },
      setLastHitter: function (side) {
        lastHitter = side;
      },
      setScore: function (l, r) {
        matchScore.L = l;
        matchScore.R = r;
        updateScoreboard();
      },
      setRacket: function (x, y) {
        var p = rackets[humanSide];
        p.x = x;
        p.y = y;
        p.tx = x;
        p.ty = y;
        clampRacket(p);
      },
      serve: startServe,
      swing: tryHumanSwing,
      hit: tryHit,
      award: awardPoint,
      end: endMatch,
      draw: draw
    };
  } else {
    window.requestAnimationFrame(frame);
  }
})();
