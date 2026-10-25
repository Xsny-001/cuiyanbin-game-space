/* ============================================================
   打地鼠
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;
  var utils = App.utils;

  var ROUND_SECONDS = 30;

  var holes = Array.prototype.slice.call(document.querySelectorAll(".hole"));
  var scoreEl = document.getElementById("score");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var overlay = document.getElementById("overlay");
  var kickerEl = document.getElementById("kicker");
  var titleEl = document.getElementById("overlayTitle");
  var textEl = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var restartBtn = document.getElementById("restartBtn");

  var mode = "idle";
  var score = 0;
  var best = 0;
  var endAt = 0;
  var tickId = null;
  var spawnTimer = null;
  var hideTimer = null;
  var activeIndex = -1;
  var activeGolden = false;
  var lastIndex = -1;

  /* ---------------- 界面 ---------------- */

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    timeEl.textContent = Math.max(
      0,
      Math.ceil((endAt - performance.now()) / 1000)
    );
  }

  function refreshBest() {
    var stored = scores.best("whack");
    best = stored === null ? 0 : stored;
    bestEl.textContent = best;
  }

  /* ---------------- 地鼠 ---------------- */

  function clearTimers() {
    if (tickId !== null) {
      window.clearInterval(tickId);
      tickId = null;
    }
    if (spawnTimer !== null) {
      window.clearTimeout(spawnTimer);
      spawnTimer = null;
    }
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function hideMole() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (activeIndex >= 0 && holes[activeIndex]) {
      holes[activeIndex].classList.remove("is-up", "is-golden");
    }
    activeIndex = -1;
    activeGolden = false;
  }

  function scheduleSpawn(delay) {
    if (spawnTimer !== null) window.clearTimeout(spawnTimer);
    spawnTimer = window.setTimeout(function () {
      if (mode !== "playing") return;
      spawnMole();
    }, delay);
  }

  function spawnMole() {
    if (mode !== "playing") return;
    hideMole();

    var index = utils.randomInt(0, holes.length - 1);
    if (index === lastIndex) {
      index = (index + 1 + utils.randomInt(0, holes.length - 2)) % holes.length;
    }
    lastIndex = index;

    var elapsed = ROUND_SECONDS - Math.max(0, (endAt - performance.now()) / 1000);
    var upTime = Math.max(430, 920 - elapsed * 16);

    activeIndex = index;
    activeGolden = Math.random() < 0.14;
    holes[index].classList.add("is-up");
    if (activeGolden) holes[index].classList.add("is-golden");

    hideTimer = window.setTimeout(function () {
      if (mode !== "playing") return;
      hideMole();
      scheduleSpawn(utils.randomInt(110, 330));
    }, upTime);
  }

  /* ---------------- 命中 ---------------- */

  function showPopup(hole, text) {
    var pop = document.createElement("span");
    pop.className = "hit-pop";
    pop.textContent = text;
    hole.appendChild(pop);
    window.setTimeout(function () {
      if (pop.parentNode) pop.parentNode.removeChild(pop);
    }, 560);
  }

  function hit(index) {
    if (mode !== "playing" || index !== activeIndex) return;
    var hole = holes[index];
    if (!hole || !hole.classList.contains("is-up")) return;

    var points = activeGolden ? 3 : 1;
    score += points;
    updateHud();
    sound.play("hit");
    if (activeGolden) sound.play("match");

    hole.classList.add("is-hit");
    showPopup(hole, "+" + points);
    window.setTimeout(function () {
      hole.classList.remove("is-hit");
    }, 200);

    hideMole();
    scheduleSpawn(utils.randomInt(90, 250));
  }

  /* ---------------- 流程 ---------------- */

  function startGame() {
    clearTimers();
    hideMole();

    holes.forEach(function (hole) {
      hole.classList.remove("is-up", "is-golden", "is-hit");
      var pop = hole.querySelector(".hit-pop");
      if (pop) pop.remove();
    });

    score = 0;
    mode = "playing";
    lastIndex = -1;
    endAt = performance.now() + ROUND_SECONDS * 1000;
    refreshBest();
    updateHud();
    timeEl.textContent = ROUND_SECONDS;
    overlay.hidden = true;

    tickId = window.setInterval(function () {
      if (mode !== "playing") return;
      var remain = Math.max(0, endAt - performance.now());
      timeEl.textContent = Math.ceil(remain / 1000);
      if (remain <= 0) endGame();
    }, 100);

    scheduleSpawn(420);
  }

  function endGame() {
    if (mode === "over") return;
    mode = "over";
    clearTimers();
    hideMole();
    timeEl.textContent = "0";

    var result = scores.submit("whack", score);
    best = result.best;
    bestEl.textContent = best;
    sound.play(score > 0 ? "win" : "lose");

    kickerEl.textContent = "时间到";
    titleEl.textContent = score >= 20 ? "手速惊人！" : "本轮结束";
    textEl.innerHTML =
      "敲中 <b>" + score + "</b> 分" + (result.isRecord ? " · 新纪录！" : "");
    primaryBtn.textContent = "再玩一次";
    overlay.hidden = false;
  }

  /* ---------------- 输入 ---------------- */

  holes.forEach(function (hole, index) {
    hole.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      hit(index);
    });

    hole.addEventListener("keydown", function (event) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        hit(index);
      }
    });
  });

  primaryBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && mode === "playing") {
      // 切走时直接结束本轮，避免回来时已经超时
      endGame();
    }
  });

  /* ---------------- 启动 ---------------- */

  refreshBest();
  updateHud();
  timeEl.textContent = ROUND_SECONDS;
})();
