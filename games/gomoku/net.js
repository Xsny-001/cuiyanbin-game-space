/* ============================================================
   五子棋联机层
   进入条件：?online=1 且满足以下之一
     role=host&invite=<id>   邀请方，建房并把房间码写回邀请
     role=guest&invite=<id>  被邀请方，等房间码后加入
     host=1                  无账号兜底，建房并展示房间码
     room=<code>             房间码加入
   ============================================================ */

(function () {
  "use strict";

  var qs = new URLSearchParams(location.search);
  var Net = window.CYBNet;
  var P2P = window.CYBP2P;

  if (!Net || !P2P) return;
  if (qs.get("online") !== "1" && !qs.has("room") && !qs.has("host")) return;

  var INV = (Net.config.invites) || {};
  var WAIT_CODE_MS = (INV.codeWaitSeconds || 20) * 1000;
  var WAIT_PEER_MS = (INV.hostWaitSeconds || 180) * 1000;
  var JOIN_MS = (INV.joinSeconds || 15) * 1000;

  var S = {
    invite: qs.get("invite") || "",
    room: qs.get("room") || "",
    role: qs.get("role") || (qs.has("host") ? "host" : "guest"),
    net: null,
    peer: null,
    code: null,
    color: 1,
    connected: false,
    closed: false,
    timer: null
  };

  /* 注入给 gomoku.js 的钩子；连接成功前 online 保持 false，单机逻辑不受影响 */
  var HOOK = (window.__GOMOKU_NET__ = {
    online: false,
    color: 1,
    afterLocalMove: null
  });

  var bar = null;

  function ui() {
    if (bar) return bar;
    bar = document.getElementById("netBar");
    return bar;
  }

  function setBar(html, kind) {
    var el = ui();
    if (!el) return;
    el.hidden = false;
    el.className = "net-bar" + (kind ? " " + kind : "");
    el.innerHTML = html;
  }

  function copyCode(code) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () {
        setBar("房间码 <code>" + code + "</code> 已复制", "ok");
      }, function () {
        setBar("房间码 <code>" + code + "</code>（请手动选中复制）", "");
      });
    } else {
      setBar("房间码 <code>" + code + "</code>（请手动选中复制）", "");
    }
  }

  function fail(msg) {
    S.closed = true;
    if (S.timer) clearTimeout(S.timer);
    setBar(String(msg) + "　<a href=\"/lobby.html\">返回联机大厅</a>", "bad");
  }

  function whenGomoku() {
    return new Promise(function (resolve) {
      if (window.__GOMOKU__) { resolve(window.__GOMOKU__); return; }
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        if (window.__GOMOKU__) { clearInterval(timer); resolve(window.__GOMOKU__); }
        else if (tries > 60) { clearInterval(timer); resolve(null); }
      }, 100);
    });
  }

  function publishCode(code) {
    if (!S.invite) return Promise.resolve();
    return Net.client()
      .then(function (sb) {
        return sb.rpc("attach_room_code", { p_invite_id: S.invite, p_room_code: code });
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
      })
      .catch(function (err) {
        setBar("房间码 <code>" + code + "</code>（自动发送失败，请手动发给对方）", "warn");
        return null;
      });
  }

  function waitForCode() {
    return Net.client().then(function (sb) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = null;
        var channel = null;

        function finish(code, err) {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (channel) { try { sb.removeChannel(channel); } catch (e) {} }
          if (err) reject(err); else resolve(code);
        }

        sb.from("game_invites")
          .select("room_code,status,expires_at")
          .eq("id", S.invite)
          .single()
          .then(function (res) {
            if (res.error) { finish(null, res.error); return; }
            if (res.data.room_code) { finish(res.data.room_code); return; }
            if (res.data.status !== "accepted") {
              finish(null, new Error("邀请已失效"));
              return;
            }

            channel = sb
              .channel("code:" + S.invite)
              .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "game_invites", filter: "id=eq." + S.invite },
                function (payload) {
                  if (payload.new && payload.new.room_code) finish(payload.new.room_code);
                }
              )
              .subscribe();

            timer = setTimeout(function () {
              finish(null, new Error("对方未能在 " + Math.round(WAIT_CODE_MS / 1000) + " 秒内创建房间"));
            }, WAIT_CODE_MS);
          });
      });
    });
  }

  function begin(peer) {
    S.peer = peer;
    S.connected = true;
    HOOK.online = true;
    HOOK.color = S.color;

    HOOK.afterLocalMove = function (r, c) {
      P2P.send(S.net, S.peer, { k: "move", r: r, c: c, v: 1 });
    };

    setBar(
      S.color === 1
        ? '你是 <b>黑棋</b>，先行　·　对手已连接'
        : '你是 <b>白棋</b>，等对方落子　·　对手已连接',
      "ok"
    );

    P2P.send(S.net, peer, { k: "hello", v: 1 });

    var hint = document.querySelector(".hint");
    if (hint) {
      hint.innerHTML =
        "联机对局：你与对手轮流落子，先连成五子者获胜。<br />联机模式不记录本地战绩，也不能悔棋或重新开始。";
    }

    whenGomoku().then(function (g) {
      if (g) g.refresh();
    });
  }

  function attachNet(net) {
    net.on("message", function (peer, channel, data) {
      var msg;
      try { msg = JSON.parse(data); } catch (e) { return; }

      if (msg.k === "move" && typeof msg.r === "number" && typeof msg.c === "number") {
        whenGomoku().then(function (g) {
          if (!g) return;
          g.place(msg.r, msg.c, S.color === 1 ? 2 : 1);
        });
      } else if (msg.k === "hello") {
        setBar(
          (S.color === 1 ? "你是 <b>黑棋</b>，先行" : "你是 <b>白棋</b>") + "　·　对手已就位",
          "ok"
        );
      } else if (msg.k === "bye") {
        fail("对手已离开房间");
      }
    });

    net.on("disconnected", function () {
      if (!S.connected) return;
      S.connected = false;
      HOOK.online = false;
      setBar("对手已断开连接　<a href=\"/lobby.html\">返回联机大厅</a>", "bad");
    });

    net.on("failed", function () {
      fail("连接失败，可能是网络限制导致无法建立 P2P");
    });
  }

  function startHost() {
    S.color = 1;
    setBar("正在创建房间…", "");
    P2P.createRoom({ maxPlayers: 2, customData: { game: "gomoku" } })
      .then(function (r) {
        S.net = r.net;
        S.code = r.code;
        attachNet(S.net);
        setBar('房间码 <code id="netCode">' + r.code + '</code> <button class="net-copy" type="button">复制</button>　等待对手加入…', "");
        var btn = document.querySelector(".net-copy");
        if (btn) btn.addEventListener("click", function () { copyCode(r.code); });
        return publishCode(r.code);
      })
      .then(function () {
        return P2P.waitPeer(S.net, WAIT_PEER_MS);
      })
      .then(function (peer) {
        begin(peer);
      })
      .catch(function (err) {
        fail(err.message || "创建房间失败");
      });
  }

  function startJoin(code) {
    S.color = 2;
    setBar("正在加入房间 <code>" + code + "</code>…", "");
    P2P.joinRoom(code)
      .then(function (r) {
        S.net = r.net;
        S.code = code;
        attachNet(S.net);
        return P2P.waitPeer(S.net, JOIN_MS);
      })
      .then(function (peer) {
        begin(peer);
      })
      .catch(function (err) {
        fail((err.message || "加入失败") + "　房间码：" + code);
      });
  }

  function startGuest() {
    setBar("正在等待对方创建房间…", "");
    whenGomoku();
    waitForCode()
      .then(function (code) { startJoin(code); })
      .catch(function (err) { fail(err.message || "未能获取房间码"); });
  }

  function start() {
    if (S.role === "host") startHost();
    else if (S.invite) startGuest();
    else if (S.room) startJoin(S.room);
    else fail("缺少房间信息，请从联机大厅发起邀请");
  }

  window.addEventListener("beforeunload", function () {
    if (S.net && S.connected) P2P.send(S.net, S.peer, { k: "bye" });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
