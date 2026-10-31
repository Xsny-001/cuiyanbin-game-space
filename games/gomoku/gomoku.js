/* ============================================================
   五子棋（人机对战）
   ============================================================ */

(function () {
  "use strict";

  var App = window.CYB;
  var sound = App.sound;
  var scores = App.scores;

  /* 联机钩子由 net.js 注入；单机模式下始终为 null，行为与原来完全一致 */
  function hook() {
    return window.__GOMOKU_NET__ || null;
  }
  function isOnline() {
    var h = hook();
    return !!(h && h.online);
  }
  function myColor() {
    var h = hook();
    return h && h.online ? h.color : HUMAN;
  }

  var SIZE = 15;
  var W = 600;
  var PAD = 34;
  var STEP = (W - PAD * 2) / (SIZE - 1);
  var R = STEP * 0.41;

  var HUMAN = 1;
  var AI = 2;
  var DIRS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  var canvas = document.getElementById("board");
  var ctx = App.setupCanvas(canvas, W, W);

  var winsEl = document.getElementById("wins");
  var lossesEl = document.getElementById("losses");
  var movesEl = document.getElementById("moves");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayText = document.getElementById("overlayText");
  var primaryBtn = document.getElementById("primaryBtn");
  var undoBtn = document.getElementById("undoBtn");
  var restartBtn = document.getElementById("restartBtn");
  var statusText = document.getElementById("statusText");
  var turnDot = document.getElementById("turnDot");

  var board = createBoard();
  var moves = [];
  var lastMove = null;
  var winLine = null;
  var gameOver = false;
  var thinking = false;
  var hover = null;
  var aiTimer = null;

  /* ---------------- 基础 ---------------- */

  function createBoard() {
    var b = [];
    for (var r = 0; r < SIZE; r++) b.push(new Array(SIZE).fill(0));
    return b;
  }

  function at(r, c) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
    return board[r][c];
  }

  function isHumanTurn() {
    if (isOnline()) return (moves.length % 2 === 0) === (myColor() === HUMAN);
    return moves.length % 2 === 0;
  }

  function updateHud() {
    winsEl.textContent = scores.wins("gomoku");
    lossesEl.textContent = scores.losses("gomoku");
    movesEl.textContent = moves.length;
  }

  function setStatus(humanTurn, text) {
    statusText.textContent = text;
    turnDot.classList.toggle("is-black", humanTurn);
  }

  /* ---------------- 新局 / 悔棋 ---------------- */

  function newGame(force) {
    if (isOnline() && moves.length && !gameOver && force !== true) {
      setStatus(isHumanTurn(), "联机对局进行中，不能重新开始");
      return;
    }
    if (aiTimer !== null) {
      window.clearTimeout(aiTimer);
      aiTimer = null;
    }
    board = createBoard();
    moves = [];
    lastMove = null;
    winLine = null;
    gameOver = false;
    thinking = false;
    hover = null;
    overlay.hidden = true;
    updateHud();
    if (isOnline()) {
      var mine = myColor() === HUMAN;
      setStatus(mine, mine ? "你执黑先行" : "你执白，等黑棋落子");
    } else {
      setStatus(true, "你执黑先行，点击棋盘落子");
    }
    draw();
  }

  function undo() {
    if (gameOver) return;
    if (isOnline()) {
      setStatus(isHumanTurn(), "联机对局不能悔棋");
      return;
    }

    if (aiTimer !== null) {
      window.clearTimeout(aiTimer);
      aiTimer = null;
    }
    thinking = false;

    var removed = 0;
    if (moves.length && moves[moves.length - 1].player === AI) {
      var aiMove = moves.pop();
      board[aiMove.r][aiMove.c] = 0;
      removed += 1;
    }
    if (moves.length && moves[moves.length - 1].player === HUMAN) {
      var humanMove = moves.pop();
      board[humanMove.r][humanMove.c] = 0;
      removed += 1;
    }

    if (!removed) return;

    lastMove = moves.length ? moves[moves.length - 1] : null;
    hover = null;
    winLine = null;
    updateHud();
    setStatus(true, "轮到你落子");
    sound.play("click");
    draw();
  }

  /* ---------------- 落子 ---------------- */

  function place(r, c, player) {
    board[r][c] = player;
    var move = { r: r, c: c, player: player };
    moves.push(move);
    lastMove = move;
    hover = null;

    sound.play(player === myColor() ? "click" : "move");
    updateHud();
    draw();

    var line = checkWin(r, c, player);
    if (line) {
      winLine = line;
      draw();
      endGame(player);
      return;
    }
    if (moves.length === SIZE * SIZE) {
      endGame(0);
      return;
    }

    if (isOnline()) {
      thinking = false;
      var h = hook();
      if (player === myColor() && h && h.afterLocalMove) h.afterLocalMove(r, c);
      setStatus(moves.length % 2 === 0, isHumanTurn() ? "轮到你落子" : "等待对方落子");
      return;
    }

    if (player === HUMAN) {
      thinking = true;
      setStatus(false, "电脑思考中…");
      aiTimer = window.setTimeout(function () {
        aiTimer = null;
        aiTurn();
      }, 240);
    } else {
      thinking = false;
      setStatus(true, "轮到你落子");
    }
  }

  function endGame(winner) {
    gameOver = true;
    thinking = false;
    if (aiTimer !== null) {
      window.clearTimeout(aiTimer);
      aiTimer = null;
    }

    if (isOnline()) {
      if (winner === 0) {
        overlayTitle.textContent = "平局";
        overlayText.textContent = "棋盘下满了。";
        sound.play("click");
      } else if (winner === myColor()) {
        overlayTitle.textContent = "你赢了！";
        overlayText.textContent = "五子连珠，对手已看到结果。";
        sound.play("win");
      } else {
        overlayTitle.textContent = "你输了";
        overlayText.textContent = "对手先连成五子。";
        sound.play("lose");
      }
      updateHud();
      setStatus(winner === myColor(), "对局结束");
      overlay.hidden = false;
      return;
    }

    if (winner === HUMAN) {
      scores.addWin("gomoku");
      overlayTitle.textContent = "你赢了！";
      overlayText.textContent = "漂亮的一局，五子连珠成功。";
      sound.play("win");
    } else if (winner === AI) {
      scores.addLoss("gomoku");
      overlayTitle.textContent = "电脑赢了";
      overlayText.textContent = "差一点，调整思路再来一局。";
      sound.play("lose");
    } else {
      overlayTitle.textContent = "平局";
      overlayText.textContent = "棋盘下满了，势均力敌。";
      sound.play("click");
    }

    updateHud();
    setStatus(true, "对局结束");
    overlay.hidden = false;
  }

  /* ---------------- 胜负判断 ---------------- */

  function checkWin(r, c, player) {
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var line = [{ r: r, c: c }];

      for (var sign = 1; sign >= -1; sign -= 2) {
        var i = 1;
        while (at(r + dr * i * sign, c + dc * i * sign) === player) {
          line.push({ r: r + dr * i * sign, c: c + dc * i * sign });
          i += 1;
        }
      }

      if (line.length >= 5) return line;
    }
    return null;
  }

  function wouldWin(r, c, player) {
    board[r][c] = player;
    var line = checkWin(r, c, player);
    board[r][c] = 0;
    return !!line;
  }

  /* ---------------- 电脑落子 ---------------- */

  function getCandidates() {
    if (!moves.length) return [{ r: 7, c: 7 }];
    var seen = {};
    var out = [];

    for (var m = 0; m < moves.length; m++) {
      for (var dr = -2; dr <= 2; dr++) {
        for (var dc = -2; dc <= 2; dc++) {
          var r = moves[m].r + dr;
          var c = moves[m].c + dc;
          if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
          if (board[r][c] !== 0) continue;
          var key = r * SIZE + c;
          if (seen[key]) continue;
          seen[key] = true;
          out.push({ r: r, c: c });
        }
      }
    }
    return out;
  }

  function patternScore(count, openEnds) {
    if (count >= 5) return 1000000;
    if (openEnds === 0) return 0;
    if (count === 4) return openEnds === 2 ? 150000 : 15000;
    if (count === 3) return openEnds === 2 ? 10000 : 900;
    if (count === 2) return openEnds === 2 ? 600 : 80;
    return openEnds === 2 ? 25 : 6;
  }

  function evalPoint(r, c, player) {
    var total = 0;

    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0];
      var dc = DIRS[d][1];
      var count = 1;
      var open = 0;

      for (var sign = 1; sign >= -1; sign -= 2) {
        var i = 1;
        var value = at(r + dr * i * sign, c + dc * i * sign);
        while (value === player) {
          count += 1;
          i += 1;
          value = at(r + dr * i * sign, c + dc * i * sign);
        }
        if (value === 0) open += 1;
      }

      total += patternScore(count, open);
    }

    return total;
  }

  function chooseAIMove() {
    if (!moves.length) return { r: 7, c: 7 };

    var candidates = getCandidates();
    var i;

    // 1. 自己能赢就直接赢
    for (i = 0; i < candidates.length; i++) {
      if (wouldWin(candidates[i].r, candidates[i].c, AI)) return candidates[i];
    }

    // 2. 挡住对手的致胜点
    for (i = 0; i < candidates.length; i++) {
      if (wouldWin(candidates[i].r, candidates[i].c, HUMAN)) return candidates[i];
    }

    // 3. 攻守综合评分
    var best = null;
    var bestScore = -Infinity;

    for (i = 0; i < candidates.length; i++) {
      var spot = candidates[i];
      var attack = evalPoint(spot.r, spot.c, AI);
      var defend = evalPoint(spot.r, spot.c, HUMAN);
      var center = (7 - Math.abs(spot.r - 7) + (7 - Math.abs(spot.c - 7))) * 0.6;
      var score = attack * 1.12 + defend * 0.98 + center + Math.random() * 6;

      if (score > bestScore) {
        bestScore = score;
        best = spot;
      }
    }

    return best;
  }

  function aiTurn() {
    if (gameOver) return;
    var move = chooseAIMove();
    thinking = false;
    if (!move) {
      endGame(0);
      return;
    }
    place(move.r, move.c, AI);
  }

  /* ---------------- 绘制 ---------------- */

  function drawStone(r, c, player, alpha) {
    var x = PAD + c * STEP;
    var y = PAD + r * STEP;
    var radius = R;

    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    var gradient = ctx.createRadialGradient(
      x - radius * 0.35,
      y - radius * 0.4,
      radius * 0.15,
      x,
      y,
      radius
    );

    if (player === HUMAN) {
      gradient.addColorStop(0, "#4d5468");
      gradient.addColorStop(0.55, "#161a26");
      gradient.addColorStop(1, "#05070c");
    } else {
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.62, "#e9ecf5");
      gradient.addColorStop(1, "#b8bfd2");
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle =
      player === HUMAN ? "rgba(255, 255, 255, 0.16)" : "rgba(10, 14, 24, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawWinLine() {
    if (!winLine || winLine.length < 2) return;

    var first = winLine[0];
    var last = winLine[0];
    var best = -1;

    for (var i = 0; i < winLine.length; i++) {
      for (var j = i + 1; j < winLine.length; j++) {
        var dr = winLine[i].r - winLine[j].r;
        var dc = winLine[i].c - winLine[j].c;
        var dist = dr * dr + dc * dc;
        if (dist > best) {
          best = dist;
          first = winLine[i];
          last = winLine[j];
        }
      }
    }

    ctx.save();
    ctx.strokeStyle = "rgba(34, 211, 238, 0.85)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(34, 211, 238, 0.9)";
    ctx.shadowBlur = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(PAD + first.c * STEP, PAD + first.r * STEP);
    ctx.lineTo(PAD + last.c * STEP, PAD + last.r * STEP);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    var bg = ctx.createLinearGradient(0, 0, W, W);
    bg.addColorStop(0, "#241c13");
    bg.addColorStop(1, "#15100a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, W);

    var glow = ctx.createRadialGradient(
      W / 2,
      W / 2,
      50,
      W / 2,
      W / 2,
      W * 0.72
    );
    glow.addColorStop(0, "rgba(255, 206, 140, 0.1)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, W);

    ctx.strokeStyle = "rgba(255, 220, 175, 0.22)";
    ctx.lineWidth = 1;

    for (var i = 0; i < SIZE; i++) {
      var p = PAD + i * STEP;
      ctx.beginPath();
      ctx.moveTo(PAD, p);
      ctx.lineTo(W - PAD, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, PAD);
      ctx.lineTo(p, W - PAD);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 220, 175, 0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, PAD, W - PAD * 2, W - PAD * 2);

    ctx.fillStyle = "rgba(255, 220, 175, 0.6)";
    var stars = [
      [3, 3],
      [3, 11],
      [11, 3],
      [11, 11],
      [7, 7]
    ];
    for (var s = 0; s < stars.length; s++) {
      ctx.beginPath();
      ctx.arc(
        PAD + stars[s][1] * STEP,
        PAD + stars[s][0] * STEP,
        3.2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    if (
      hover &&
      !gameOver &&
      !thinking &&
      isHumanTurn() &&
      board[hover.r][hover.c] === 0
    ) {
      drawStone(hover.r, hover.c, myColor(), 0.28);
    }

    for (var m = 0; m < moves.length; m++) {
      drawStone(moves[m].r, moves[m].c, moves[m].player, 1);
    }

    if (lastMove) {
      ctx.save();
      ctx.fillStyle = "rgba(34, 211, 238, 0.95)";
      ctx.shadowColor = "rgba(34, 211, 238, 0.9)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(
        PAD + lastMove.c * STEP,
        PAD + lastMove.r * STEP,
        4,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    drawWinLine();
  }

  /* ---------------- 输入 ---------------- */

  function cellFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    var x = ((event.clientX - rect.left) / rect.width) * W;
    var y = ((event.clientY - rect.top) / rect.height) * W;
    var c = Math.round((x - PAD) / STEP);
    var r = Math.round((y - PAD) / STEP);

    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;

    var cx = PAD + c * STEP;
    var cy = PAD + r * STEP;
    if (Math.hypot(x - cx, y - cy) > STEP * 0.62) return null;

    return { r: r, c: c };
  }

  canvas.addEventListener("pointermove", function (event) {
    if (gameOver || thinking || !isHumanTurn()) return;
    var cell = cellFromEvent(event);
    if (!cell) {
      if (hover) {
        hover = null;
        draw();
      }
      return;
    }
    if (!hover || hover.r !== cell.r || hover.c !== cell.c) {
      hover = cell;
      draw();
    }
  });

  canvas.addEventListener("pointerleave", function () {
    if (hover) {
      hover = null;
      draw();
    }
  });

  canvas.addEventListener("pointerdown", function (event) {
    if (event.button && event.button !== 0) return;
    var h = hook();
    if (h && (h.readonly || h.pending)) return;
    if (gameOver || thinking || !isHumanTurn()) return;

    var cell = cellFromEvent(event);
    if (!cell) return;
    if (board[cell.r][cell.c] !== 0) return;
    hover = null;
    place(cell.r, cell.c, myColor());
  });

  primaryBtn.addEventListener("click", function () {
    newGame(false);
  });
  restartBtn.addEventListener("click", function () {
    newGame(false);
  });
  undoBtn.addEventListener("click", undo);

  /* ---------------- 联机接口 ---------------- */

  window.__GOMOKU__ = {
    place: place,
    restart: function () {
      newGame(true);
    },
    state: function () {
      return {
        moves: moves.length,
        over: gameOver,
        turn: moves.length % 2 === 0 ? 1 : 2,
        color: myColor(),
        online: isOnline()
      };
    },
    refresh: function () {
      updateHud();
      if (isOnline() && !gameOver) {
        setStatus(moves.length % 2 === 0, isHumanTurn() ? "轮到你落子" : "等待对方落子");
      }
      draw();
    }
  };

  /* ---------------- 启动 ---------------- */

  newGame();
})();
