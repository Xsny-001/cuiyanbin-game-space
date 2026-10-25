/* ============================================================
   记忆翻牌
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;
  var utils = App.utils;

  var EMOJIS = ["🦊", "🐼", "🐸", "🦄", "🐙", "🦋", "🍉", "🌵"];
  var PAIRS = EMOJIS.length;

  var board = document.getElementById("board");
  var movesEl = document.getElementById("moves");
  var pairsEl = document.getElementById("pairs");
  var timeEl = document.getElementById("time");
  var bestEl = document.getElementById("best");
  var overlay = document.getElementById("overlay");
  var overlayText = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var restartBtn = document.getElementById("restartBtn");

  var openCards = [];
  var matched = 0;
  var moves = 0;
  var lock = false;
  var startedAt = 0;
  var timerId = null;
  var elapsed = 0;
  var mode = "playing";
  var round = 0;

  /* ---------------- 界面 ---------------- */

  function updateHud() {
    movesEl.textContent = moves;
    pairsEl.textContent = matched + " / " + PAIRS;
    timeEl.textContent = utils.formatClock(elapsed);
    var best = scores.best("memory");
    bestEl.textContent = best === null ? "—" : best;
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function tick() {
    if (!startedAt) return;
    elapsed = (performance.now() - startedAt) / 1000;
    timeEl.textContent = utils.formatClock(elapsed);
  }

  function startTimer() {
    startedAt = performance.now();
    stopTimer();
    timerId = window.setInterval(tick, 250);
  }

  /* ---------------- 新局 ---------------- */

  function buildDeck() {
    var deck = [];
    EMOJIS.forEach(function (emoji) {
      deck.push(emoji);
      deck.push(emoji);
    });
    return utils.shuffle(deck);
  }

  function newGame() {
    stopTimer();
    round += 1;
    board.innerHTML = "";
    openCards = [];
    matched = 0;
    moves = 0;
    lock = false;
    startedAt = 0;
    elapsed = 0;
    mode = "playing";
    overlay.hidden = true;

    var deck = buildDeck();
    var fragment = document.createDocumentFragment();

    deck.forEach(function (emoji) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "mem-card";
      card.dataset.emoji = emoji;
      card.setAttribute("aria-label", "未翻开的卡片");
      card.innerHTML =
        '<span class="mem-inner">' +
        '<span class="mem-face front" aria-hidden="true">?</span>' +
        '<span class="mem-face back" aria-hidden="true">' +
        emoji +
        "</span>" +
        "</span>";
      fragment.appendChild(card);
    });

    board.appendChild(fragment);
    updateHud();
  }

  /* ---------------- 翻牌逻辑 ---------------- */

  function flip(card) {
    if (lock || mode !== "playing") return;
    if (card.classList.contains("is-open") || card.classList.contains("is-matched")) {
      return;
    }

    if (!startedAt) startTimer();

    card.classList.add("is-open");
    card.setAttribute("aria-label", "已翻开，图案是 " + card.dataset.emoji);
    openCards.push(card);
    sound.play("flip");

    if (openCards.length < 2) return;

    lock = true;
    moves += 1;
    updateHud();

    var first = openCards[0];
    var second = openCards[1];
    var myRound = round;

    if (first.dataset.emoji === second.dataset.emoji) {
      window.setTimeout(function () {
        if (round !== myRound) return;
        first.classList.add("is-matched");
        second.classList.add("is-matched");
        matched += 1;
        openCards = [];
        lock = false;
        sound.play("match");
        updateHud();

        if (matched === PAIRS) win();
      }, 300);
    } else {
      window.setTimeout(function () {
        if (round !== myRound) return;
        first.classList.remove("is-open");
        second.classList.remove("is-open");
        first.setAttribute("aria-label", "未翻开的卡片");
        second.setAttribute("aria-label", "未翻开的卡片");
        openCards = [];
        lock = false;
      }, 680);
    }
  }

  function win() {
    mode = "won";
    stopTimer();
    elapsedAtWin = elapsed;
    var seconds = Math.max(1, Math.round(elapsed));
    timeEl.textContent = utils.formatClock(elapsed);

    var result = scores.submit("memory", moves);
    updateHud();
    sound.play("win");

    App.toast(
      result.isRecord ? "新纪录：" + moves + " 步！" : "完成！用了 " + moves + " 步"
    );

    overlayText.innerHTML =
      "用了 <b>" + moves + "</b> 步 · " +
      utils.formatClock(elapsed) +
      (result.isRecord ? " · 新纪录！" : "");
    overlay.hidden = false;
  }

  /* ---------------- 输入 ---------------- */

  board.addEventListener("click", function (event) {
    var card = event.target.closest(".mem-card");
    if (card) flip(card);
  });

  primaryBtn.addEventListener("click", newGame);
  restartBtn.addEventListener("click", newGame);

  document.addEventListener("visibilitychange", function () {
    // 页面隐藏时暂停计时，回来继续
    if (document.hidden) {
      if (timerId !== null) {
        elapsed = startedAt ? (performance.now() - startedAt) / 1000 : 0;
        stopTimer();
      }
    } else if (startedAt && mode === "playing" && timerId === null) {
      startedAt = performance.now() - elapsed * 1000;
      timerId = window.setInterval(tick, 250);
    }
  });

  /* ---------------- 启动 ---------------- */

  newGame();
})();
