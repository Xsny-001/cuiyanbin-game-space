/* ============================================================
   五子棋 · 联机适配层
   ------------------------------------------------------------
   依赖：window.P2P（纯静态 P2P）、window.__GOMOKU__（由 gomoku.js 提供）
   原则：未登录或连接失败时完全不干扰单机对局
   ============================================================ */

(function (global) {
  "use strict";

  var hook = {
    online: false,
    color: 1, // 1 黑（房主/先手） 2 白（客机）
    readonly: false,
    pending: false, // 客机刚进房、还没和房主握手时先禁止落子
    afterLocalMove: function (r, c) {
      if (!hook.online || hook.readonly || hook.pending) return;
      global.P2P.broadcast("move", { r: r, c: c });
    }
  };

  /* 先挂上去，gomoku.js 启动时读到的是单机态，不阻塞渲染 */
  global.__GOMOKU_NET__ = hook;

  var bar = document.getElementById("netBar");
  var connecting = false;

  function G() {
    return global.__GOMOKU__ || null;
  }

  function paint(text, kind) {
    if (!bar) return;
    if (!text) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.className = "net-bar" + (kind ? " " + kind : "");
    bar.innerHTML = text;
  }

  function otherColor() {
    return hook.color === 1 ? 2 : 1;
  }

  function setReadonly(on, text) {
    hook.readonly = !!on;
    if (on) paint(text || "对方已离开，本局结束", "bad");
    var g = G();
    if (g && g.refresh) g.refresh();
  }

  /* ---------------- 连接 ---------------- */

  function connect() {
    if (connecting || hook.online) return;
    if (!global.P2P) return;
    connecting = true;
    paint("正在连接联机服务器…", "warn");

    global.P2P.enter("gomoku", {
      onStatus: function (state, detail) {
        if (state === "signaling" || state === "searching") {
          paint("正在寻找对局…", "warn");
        } else if (state === "error") {
          paint("连接失败，可继续单机对战", "bad");
        } else if (detail === "stale") {
          paint("网络不太稳定…", "warn");
        }
      },

      onReady: function (r) {
        hook.online = true;
        hook.color = r.isHost ? 1 : 2;
        hook.readonly = false;
        hook.pending = !r.isHost;

        if (!r.isHost) {
          global.setTimeout(function () {
            hook.pending = false;
          }, 4200);
        }

        var g = G();
        if (g && g.restart) g.restart();
        if (g && g.refresh) g.refresh();

        var hint = document.querySelector(".hint");
        if (hint) {
          hint.innerHTML =
            "联机对局：房主执黑先行，客机执白，横竖斜任意方向先连成五子即获胜。" +
            "<br />断线后棋盘会锁定，刷新页面可重新匹配。";
        }

        var btn = document.getElementById("undoBtn");
        if (btn) {
          btn.disabled = true;
          btn.title = "联机对局不支持悔棋";
        }

        paint(
          r.isHost ? "房间已建好，等同学进来 · 你是黑棋" : "已加入对局 · 你是白棋",
          "ok"
        );

        if (global.Chat) {
          global.Chat.mount({
            title: "五子棋",
            offsetBottom: global.matchMedia("(pointer: coarse)").matches ? 76 : 20
          });
          global.Chat.setOnline(global.P2P.peerCount);
        }
      },

      onPeerJoin: function () {
        if (!hook.online) return;
        hook.pending = false;
        var g = G();
        if (g && g.restart) g.restart();
        paint("对手已就位 · " + (hook.color === 1 ? "你执黑先行" : "你执白"), "ok");
        if (global.Chat) global.Chat.setOnline(global.P2P.peerCount);
      },

      onPeerLeave: function () {
        if (!hook.online) return;
        setReadonly(true, "对方已离开，可刷新页面重新匹配");
        if (global.Chat) global.Chat.setOnline(global.P2P.peerCount);
      },

      onMessage: function (msg) {
        if (!hook.online) return;
        var d = msg.d || {};

        if (msg.t === "move") {
          if (typeof d.r !== "number" || typeof d.c !== "number") return;
          if (d.r < 0 || d.r > 14 || d.c < 0 || d.c > 14) return;
          if (hook.readonly) return;
          var g = G();
          if (g && g.place) g.place(d.r, d.c, otherColor());
          return;
        }

        if (msg.t === "restart") {
          var g2 = G();
          if (g2 && g2.restart) {
            g2.restart();
            hook.readonly = false;
            paint("新的一局开始 · " + (hook.color === 1 ? "你执黑先行" : "你执白"), "ok");
          }
          return;
        }

        if (msg.t === "restart-req") {
          if (!global.P2P.isHost) return;
          var g3 = G();
          if (g3 && g3.restart) {
            g3.restart();
            hook.readonly = false;
            global.P2P.broadcast("restart", {});
            paint("已按对方请求重开 · 你执黑先行", "ok");
          }
          return;
        }

        if (msg.t === "resign") {
          setReadonly(true, "对方认输");
        }
      },

      onError: function (e) {
        connecting = false;
        paint("连接失败：" + ((e && e.message) || "未知错误"), "bad");
      }
    })
      .then(function () {
        connecting = false;
      })
      .catch(function (e) {
        connecting = false;
        if (e && e.code === "auth") {
          paint("未登录，当前为单机模式", "");
          return;
        }
        /* 失败时退回单机，不打断玩家 */
        hook.online = false;
        paint("联机不可用，已回到单机", "bad");
      });
  }

  /* ---------------- 重开按钮接管 ---------------- */

  function bindRestart(id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener(
      "click",
      function (e) {
        if (!hook.online) return; /* 单机走 gomoku.js 原逻辑 */
        e.preventDefault();
        e.stopImmediatePropagation();

        if (global.P2P.isHost) {
          var g = G();
          if (g && g.restart) g.restart();
          global.P2P.broadcast("restart", {});
          paint("已重开 · 你执黑先行", "ok");
        } else {
          global.P2P.broadcast("restart-req", {});
          paint("已请求重开，等对方点「再来一局」", "warn");
        }
      },
      true
    );
  }

  bindRestart("primaryBtn");
  bindRestart("restartBtn");

  /* ---------------- 入口 ---------------- */

  if (!global.P2P) {
    paint("联机组件未加载", "bad");
    return;
  }

  if (global.P2P.current()) {
    global.setTimeout(connect, 220);
  } else {
    paint(
      '<span>想和朋友下？</span>' +
        '<button class="btn ghost small" id="netJoin" type="button">联机对战</button>',
      "idle"
    );
    var join = document.getElementById("netJoin");
    if (join) {
      join.addEventListener("click", function () {
        global.P2P.requireAuth()
          .then(function (ok) {
            if (ok) connect();
          })
          .catch(function () {});
      });
    }
  }
})(window);
