/* ============================================================
   联机大厅：登录注册、在线列表、邀请信令
   ============================================================ */

(function () {
  "use strict";

  var Net = window.CYBNet;
  var cfg = Net.config;
  var TTL = (cfg.invites && cfg.invites.ttlSeconds) || 30;

  var $ = function (id) { return document.getElementById(id); };

  var S = {
    sb: null,
    user: null,
    profile: null,
    channel: null,
    players: new Map(),
    mode: "signin",          // signin | signup
    outgoing: null,          // { id, toId, gameKey, timer }
    incoming: null,          // { row, timer }
    heartbeat: null,
    state: "idle",
    busy: false
  };

  /* ---------------- UI 工具 ---------------- */

  function toast(text, kind) {
    var el = $("toast");
    el.textContent = text;
    el.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.className = "toast"; }, 3600);
  }

  function setMsg(text, kind) {
    var el = $("authMsg");
    el.textContent = text || "";
    el.className = "auth-msg" + (kind ? " " + kind : "");
  }

  function showAuth() {
    $("authView").hidden = false;
    $("lobbyView").hidden = true;
    $("inviteModal").hidden = true;
  }

  function showLobby() {
    $("authView").hidden = true;
    $("lobbyView").hidden = false;
  }

  function nickOf(p) {
    return (p && (p.nick || p.nickname)) || "玩家";
  }

  /* ---------------- 认证 ---------------- */

  function boot() {
    if (!Net.configured()) {
      $("authView").hidden = false;
      setMsg("联机服务未配置：缺少 Supabase 项目地址与公钥。", "error");
      $("authSubmit").disabled = true;
      return;
    }

    Net.client()
      .then(function (sb) {
        S.sb = sb;
        return sb.auth.getSession();
      })
      .then(function (res) {
        var session = res && res.data && res.data.session;
        watchAuth();
        if (session) return enter(session.user);
        showAuth();
        return null;
      })
      .catch(function (err) {
        showAuth();
        setMsg(err.message || "联机服务连接失败", "error");
      });
  }

  function watchAuth() {
    if (!S.sb) return;
    S.sb.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") leave();
      if (session && session.user && (!S.user || S.user.id !== session.user.id)) {
        enter(session.user);
      }
    });
  }

  function submitAuth(ev) {
    if (ev) ev.preventDefault();
    if (S.busy) return;

    var email = $("email").value.trim();
    var password = $("password").value;
    var nickname = $("nickname").value.trim();

    if (!email || !password) { setMsg("请填写邮箱和密码", "error"); return; }
    if (password.length < 6) { setMsg("密码至少 6 位", "error"); return; }
    if (S.mode === "signup" && (nickname.length < 2 || nickname.length > 16)) {
      setMsg("昵称需 2–16 个字符", "error");
      return;
    }

    S.busy = true;
    $("authSubmit").disabled = true;
    setMsg(S.mode === "signup" ? "正在注册…" : "正在登录…");

    var task = S.mode === "signup"
      ? S.sb.auth.signUp({ email: email, password: password, options: { data: { nickname: nickname } } })
      : S.sb.auth.signInWithPassword({ email: email, password: password });

    task
      .then(function (res) {
        if (res.error) throw res.error;
        // 开启邮箱确认时 signUp 返回 session = null
        if (S.mode === "signup" && !res.data.session) {
          setMsg("注册成功，请到邮箱点击确认链接后再登录。", "ok");
          S.mode = "signin";
          paintMode();
          return null;
        }
        var user = res.data.session && res.data.session.user;
        if (user) return enter(user);
        return null;
      })
      .catch(function (err) {
        setMsg(err.message || "操作失败", "error");
      })
      .then(function () {
        S.busy = false;
        $("authSubmit").disabled = false;
      });
  }

  function resetPassword() {
    var email = $("email").value.trim();
    if (!email) { setMsg("请先填写邮箱，再点找回密码", "error"); return; }
    S.sb.auth
      .resetPasswordForEmail(email, { redirectTo: location.origin + "/lobby.html?reset=1" })
      .then(function (res) {
        if (res.error) throw res.error;
        setMsg("如果该邮箱已注册，重置邮件已发送。", "ok");
      })
      .catch(function (err) { setMsg(err.message || "发送失败", "error"); });
  }

  function paintMode() {
    var signup = S.mode === "signup";
    $("nicknameField").hidden = !signup;
    $("authSubmit").textContent = signup ? "注 册" : "登 录";
    $("authToggle").textContent = signup ? "已有账号？去登录" : "没有账号？注册";
    $("authTitle").textContent = signup ? "注册账号" : "登录联机";
    setMsg("");
  }

  function logout() {
    if (!S.sb) return;
    S.sb.auth.signOut({ scope: "local" }).then(function () {
      leave();
      showAuth();
      setMsg("已退出登录");
    });
  }

  /* ---------------- 进入大厅 ---------------- */

  function enter(user) {
    S.user = user;
    showLobby();
    $("meName").textContent = "连接中…";

    return S.sb
      .from("profiles")
      .select("id,nickname")
      .eq("id", user.id)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        S.profile = res.data || { id: user.id, nickname: "玩家" };
        $("meName").textContent = S.profile.nickname;
        return joinPresence();
      })
      .catch(function (err) {
        $("meName").textContent = "资料读取失败";
        toast(err.message || "无法读取昵称", "error");
      });
  }

  function presencePayload() {
    return {
      uid: S.user.id,
      nick: S.profile ? S.profile.nickname : "玩家",
      state: S.state,
      game: null,
      ts: Date.now()
    };
  }

  function joinPresence() {
    if (S.channel) return Promise.resolve();

    S.channel = S.sb.channel("lobby:global", {
      config: { presence: { key: S.user.id, enabled: true } }
    });

    S.channel
      .on("presence", { event: "sync" }, renderPlayers)
      .on("presence", { event: "join" }, renderPlayers)
      .on("presence", { event: "leave" }, renderPlayers)
      .subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          S.channel.track(presencePayload());
          clearInterval(S.heartbeat);
          S.heartbeat = setInterval(function () {
            if (S.channel) S.channel.track(presencePayload());
          }, 15000);
          subscribeInvites();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          toast("在线状态连接中断，正在重试", "error");
        }
      });

    return Promise.resolve();
  }

  function renderPlayers() {
    if (!S.channel) return;
    var state = S.channel.presenceState() || {};
    var merged = new Map();

    Object.keys(state).forEach(function (key) {
      var list = state[key] || [];
      var best = null;
      list.forEach(function (p) {
        if (!best || (p.ts || 0) > (best.ts || 0)) best = p;
      });
      if (best && best.uid) merged.set(best.uid, best);
    });

    var now = Date.now();
    var stale = [];
    merged.forEach(function (p, uid) {
      if (uid === S.user.id) return;
      if (now - (p.ts || 0) > 60000) stale.push(uid);
    });
    stale.forEach(function (uid) { merged.delete(uid); });

    S.players = merged;
    var others = Array.from(merged.values()).filter(function (p) { return p.uid !== S.user.id; });
    others.sort(function (a, b) {
      if (a.state !== b.state) return a.state === "idle" ? -1 : 1;
      return String(a.nick).localeCompare(String(b.nick), "zh");
    });

    $("onlineCount").textContent = others.length + 1;

    if (!others.length) {
      $("playerList").innerHTML =
        '<p class="empty">还没有其他人在线。把联机大厅地址发给朋友，登录后就能互相看见。</p>';
      return;
    }

    var games = Net.onlineGames();
    $("playerList").innerHTML = others
      .map(function (p) {
        var badge = p.state === "idle"
          ? '<span class="badge ok">空闲</span>'
          : p.state === "dnd"
            ? '<span class="badge warn">勿扰</span>'
            : '<span class="badge busy">游戏中</span>';
        var options = games
          .map(function (g) { return '<option value="' + g.key + '">' + g.name + "</option>"; })
          .join("");
        var disabled = p.state !== "idle" ? " disabled" : "";
        return (
          '<div class="player" data-uid="' + p.uid + '">' +
            '<div class="player-main">' +
              '<strong>' + escapeHtml(nickOf(p)) + "</strong>" + badge +
            "</div>" +
            '<div class="player-actions">' +
              '<select class="game-pick" aria-label="选择游戏">' + options + "</select>" +
              '<button class="btn small invite-btn" type="button"' + disabled + ">邀请联机</button>" +
            "</div>" +
          "</div>"
        );
      })
      .join("");

    Array.prototype.forEach.call(document.querySelectorAll(".invite-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".player");
        var pick = row.querySelector(".game-pick");
        sendInvite(row.dataset.uid, pick.value, btn);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- 邀请 ---------------- */

  function subscribeInvites() {
    if (!S.sb) return;
    S.sb
      .channel("invites:" + S.user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_invites", filter: "to_id=eq." + S.user.id },
        function (payload) { onIncoming(payload.new); }
      )
      .subscribe();
  }

  function sendInvite(toId, gameKey, btn) {
    if (S.outgoing) { toast("已有邀请等待回应", "warn"); return; }
    if (!toId || !gameKey) return;

    btn.disabled = true;
    btn.textContent = "发送中…";

    S.sb
      .from("game_invites")
      .insert({ from_id: S.user.id, to_id: toId, game_key: gameKey })
      .select()
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        var row = res.data;
        S.outgoing = { id: row.id, toId: toId, gameKey: gameKey, timer: null };
        toast("邀请已发送，等待对方接受（30 秒）", "ok");
        watchOutgoing(row);
      })
      .catch(function (err) {
        toast(err.message || "邀请发送失败", "error");
        btn.disabled = false;
        btn.textContent = "邀请联机";
      });
  }

  function watchOutgoing(row) {
    var timer = setTimeout(function () {
      if (!S.outgoing || S.outgoing.id !== row.id) return;
      cancelOutgoing("邀请超时，已自动取消");
    }, TTL * 1000);

    S.outgoing.timer = timer;

    S.sb
      .channel("out:" + row.id)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_invites", filter: "id=eq." + row.id },
        function (payload) {
          var r = payload.new;
          if (!S.outgoing || S.outgoing.id !== r.id) return;
          if (r.status === "accepted") {
            clearTimeout(S.outgoing.timer);
            var info = S.outgoing;
            S.outgoing = null;
            toast("对方已接受，正在进入房间…", "ok");
            gotoGame(info.gameKey, r.id, "host");
          } else if (r.status === "declined") {
            clearTimeout(S.outgoing.timer);
            S.outgoing = null;
            toast("对方拒绝了邀请");
          }
        }
      )
      .subscribe();
  }

  function cancelOutgoing(msg) {
    if (!S.outgoing) return;
    var id = S.outgoing.id;
    clearTimeout(S.outgoing.timer);
    S.outgoing = null;
    S.sb.from("game_invites").update({ status: "cancelled" }).eq("id", id).eq("status", "pending")
      .then(function () {});
    toast(msg || "已取消邀请", "warn");
  }

  function onIncoming(row) {
    if (!row || S.incoming || row.from_id === S.user.id) return;
    if (S.outgoing) {
      // 双方同时互邀时，拒绝后到的一条，避免死锁
      respond(row.id, false);
      return;
    }

    S.incoming = { row: row, timer: null };
    var game = Net.gameMeta(row.game_key);
    $("inviteFrom").textContent = "匿名玩家";
    $("inviteGame").textContent = game ? game.name : row.game_key;
    $("inviteModal").hidden = false;

    S.sb.from("profiles").select("nickname").eq("id", row.from_id).maybeSingle().then(function (res) {
      if (res.data && res.data.nickname) $("inviteFrom").textContent = res.data.nickname;
    });

    S.incoming.timer = setTimeout(function () {
      if (!S.incoming) return;
      S.incoming = null;
      $("inviteModal").hidden = true;
      toast("邀请已过期");
    }, TTL * 1000);
  }

  function respond(inviteId, accept) {
    if (!S.incoming || S.incoming.row.id !== inviteId) return;
    var row = S.incoming.row;
    clearTimeout(S.incoming.timer);
    S.incoming = null;
    $("inviteModal").hidden = true;

    S.sb
      .rpc("respond_invite", { p_invite_id: inviteId, p_accept: accept })
      .then(function (res) {
        if (res.error) throw res.error;
        if (accept) {
          toast("已接受，正在准备房间…", "ok");
          gotoGame(row.game_key, row.id, "guest");
        } else {
          toast("已拒绝该邀请");
        }
      })
      .catch(function (err) {
        var m = err.message || "操作失败";
        toast(m.indexOf("invite_unavailable") >= 0 ? "邀请已失效或已被处理" : m, "error");
      });
  }

  function gotoGame(gameKey, inviteId, role) {
    var game = Net.gameMeta(gameKey);
    if (!game) { toast("未知游戏：" + gameKey, "error"); return; }
    var url = game.href + "?online=1&invite=" + encodeURIComponent(inviteId) + "&role=" + role;
    location.href = url;
  }

  /* ---------------- 房间码 ---------------- */

  function joinByCode() {
    var code = $("roomCode").value.trim();
    var gameKey = $("joinGame").value;
    var game = Net.gameMeta(gameKey);
    if (!code || !game) { toast("请填写房间码", "warn"); return; }
    if (code.length < 4 || code.length > 32) { toast("房间码长度不正确", "warn"); return; }
    location.href = game.href + "?online=1&room=" + encodeURIComponent(code);
  }

  function leave() {
    clearInterval(S.heartbeat);
    S.heartbeat = null;
    if (S.channel) {
      try { S.channel.untrack(); } catch (e) {}
      try { S.sb.removeChannel(S.channel); } catch (e) {}
      S.channel = null;
    }
    S.players = new Map();
    S.user = null;
    S.profile = null;
    if (S.outgoing) clearTimeout(S.outgoing.timer);
    if (S.incoming) clearTimeout(S.incoming.timer);
    S.outgoing = null;
    S.incoming = null;
  }

  /* ---------------- 绑定 ---------------- */

  function bind() {
    $("authForm").addEventListener("submit", submitAuth);
    $("authToggle").addEventListener("click", function (e) {
      e.preventDefault();
      S.mode = S.mode === "signup" ? "signin" : "signup";
      paintMode();
    });
    $("resetBtn").addEventListener("click", resetPassword);
    $("logoutBtn").addEventListener("click", logout);
    $("joinBtn").addEventListener("click", joinByCode);

    $("myState").addEventListener("change", function () {
      S.state = this.value;
      if (S.channel) S.channel.track(presencePayload());
      toast(S.state === "dnd" ? "已切换为勿扰，其他人无法邀请你" : "已切换为空闲");
    });

    $("inviteAccept").addEventListener("click", function () {
      if (S.incoming) respond(S.incoming.row.id, true);
    });
    $("inviteDecline").addEventListener("click", function () {
      if (S.incoming) respond(S.incoming.row.id, false);
    });

    var games = Net.onlineGames();
    $("joinGame").innerHTML = games
      .map(function (g) { return '<option value="' + g.key + '">' + g.name + "</option>"; })
      .join("");

    window.addEventListener("beforeunload", function () {
      if (S.channel) {
        try { S.channel.untrack(); } catch (e) {}
      }
    });
  }

  S.state = "idle";
  bind();
  paintMode();
  boot();
})();
