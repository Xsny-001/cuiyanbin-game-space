/* ============================================================
   联机基建 v3 · 纯静态 P2P
   ------------------------------------------------------------
   依赖：assets/vendor/netlib.js（IIFE，挂 window.netlib）
   暴露：window.P2P
   说明：账号密码硬编码在前端，只用于区分同学，不构成安全边界。
   ============================================================ */

(function (global) {
  "use strict";

  /* ---------------- 全局常量：只改这里 ---------------- */

  var SITE_LOBBY = "cybmy78_main_lobby"; // 大厅房间名
  var GAME_PASSWORD = "1949101"; // 所有房间共用的密码

  var CONFIG = {
    ACCOUNT: { user: "admin", pass: "1949101" },
    STORAGE_KEY: "cyb.auth.v1",
    ROOMS: {
      lobby: {
        name: SITE_LOBBY,
        gameId: "9f2c1d47-6b8e-4a03-9c55-2e7d81b4f0aa",
        maxPlayers: 8
      },
      gomoku: {
        name: "cybmy78_gomoku",
        gameId: "5b3e8c21-7d4f-4a96-b1c2-8e6f0a39d7b4",
        maxPlayers: 2
      }
    },
    TIMEOUT: {
      ready: 8000,
      settle: 500,
      ping: 20000,
      stale: 60000,
      beat: 30000,
      revive: 3000,
      roomTtl: 120000
    },
    RETRY: { times: 3, backoff: [300, 600, 1200] }
  };

  var ERR = {
    AUTH: "auth",
    READY: "ready",
    TIMEOUT: "timeout",
    FULL: "full",
    NET: "net",
    UNSUPPORTED: "unsupported"
  };

  /* ---------------- 内部状态 ---------------- */

  var state = "idle"; // idle | signaling | searching | hosting | guest | closed | error
  var net = null;
  var handlers = {};
  var roomKey = null;
  var roomCfg = null;
  var host = false;
  var selfId = "";
  var entering = null;
  var pingTimer = null;
  var beatTimer = null;
  var reviveTried = false;
  var lastRecvAt = 0;
  var seen = Object.create(null);
  var peerNames = Object.create(null);
  var readyPeers = Object.create(null);
  var bus = Object.create(null);

  /* ---------------- 小工具 ---------------- */

  function fail(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, ms);
    });
  }

  function emit(type, payload, peerId) {
    var list = bus[type];
    if (list) {
      for (var i = 0; i < list.length; i++) {
        try {
          list[i](payload, peerId);
        } catch (e) {
          /* 单个订阅者异常不影响其它订阅者 */
        }
      }
    }
    if (type === "message" && handlers.onMessage) {
      try {
        handlers.onMessage(payload, peerId);
      } catch (e) {}
    }
    if (type === "peer-join" && handlers.onPeerJoin) {
      try {
        handlers.onPeerJoin(payload);
      } catch (e) {}
    }
    if (type === "peer-leave" && handlers.onPeerLeave) {
      try {
        handlers.onPeerLeave(payload);
      } catch (e) {}
    }
  }

  function setState(next, detail) {
    state = next;
    emit("status", { state: next, detail: detail || null });
    if (handlers.onStatus) {
      try {
        handlers.onStatus(next, detail || null);
      } catch (e) {}
    }
  }

  function toast(text) {
    if (global.CYB && typeof global.CYB.toast === "function") global.CYB.toast(text);
  }

  /* ---------------- 门禁 ---------------- */

  var auth = {
    current: function () {
      try {
        var raw = global.localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (!obj || !obj.u) return null;
        return { user: obj.u, nick: obj.n || obj.u, at: obj.at || 0 };
      } catch (e) {
        return null;
      }
    },

    login: function (user, pass, nick) {
      var u = String(user || "").trim();
      var p = String(pass || "");
      var n = String(nick || "").trim() || u;
      if (u !== CONFIG.ACCOUNT.user || p !== CONFIG.ACCOUNT.pass) return false;
      if (n.length < 2) n = CONFIG.ACCOUNT.user;
      if (n.length > 12) n = n.slice(0, 12);
      try {
        global.localStorage.setItem(
          CONFIG.STORAGE_KEY,
          JSON.stringify({ u: u, n: n, at: Date.now() })
        );
      } catch (e) {
        return false;
      }
      return true;
    },

    logout: function () {
      try {
        global.localStorage.removeItem(CONFIG.STORAGE_KEY);
      } catch (e) {}
    }
  };

  var gateEl = null;
  var gateResolve = null;

  function buildGate() {
    if (gateEl) return gateEl;

    var wrap = document.createElement("div");
    wrap.className = "cyb-gate";
    wrap.id = "cyb-gate";
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="cyb-gate-card" role="dialog" aria-modal="true" aria-labelledby="cyb-gate-title">' +
      '<p class="cyb-gate-kicker">ONLINE</p>' +
      '<h2 id="cyb-gate-title">进入联机大厅</h2>' +
      '<p class="cyb-gate-lead">输入账号即可和同学碰面，单机游戏不需要登录。</p>' +
      '<label class="cyb-field"><span>账号</span>' +
      '<input id="cyb-gate-user" type="text" autocomplete="username" spellcheck="false" /></label>' +
      '<label class="cyb-field"><span>密码</span>' +
      '<input id="cyb-gate-pass" type="password" autocomplete="current-password" /></label>' +
      '<label class="cyb-field"><span>昵称</span>' +
      '<input id="cyb-gate-nick" type="text" maxlength="12" autocomplete="nickname" placeholder="显示给同学看" /></label>' +
      '<p class="cyb-gate-err" id="cyb-gate-err" role="alert"></p>' +
      '<div class="cyb-gate-actions">' +
      '<button class="cyb-btn ghost" id="cyb-gate-cancel" type="button">取消</button>' +
      '<button class="cyb-btn primary" id="cyb-gate-ok" type="button">进入</button>' +
      "</div>" +
      "</div>";

    document.body.appendChild(wrap);

    var userEl = wrap.querySelector("#cyb-gate-user");
    var passEl = wrap.querySelector("#cyb-gate-pass");
    var nickEl = wrap.querySelector("#cyb-gate-nick");
    var errEl = wrap.querySelector("#cyb-gate-err");

    function submit() {
      if (auth.login(userEl.value, passEl.value, nickEl.value)) {
        var saved = auth.current();
        errEl.textContent = "";
        closeGate(true);
        toast("欢迎，" + saved.nick);
        return;
      }
      errEl.textContent = "账号或密码不正确";
      passEl.value = "";
      passEl.focus();
    }

    wrap.querySelector("#cyb-gate-ok").addEventListener("click", submit);
    wrap.querySelector("#cyb-gate-cancel").addEventListener("click", function () {
      closeGate(false);
    });
    wrap.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        closeGate(false);
      }
    });
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) closeGate(false);
    });

    gateEl = wrap;
    return wrap;
  }

  function closeGate(ok) {
    if (gateEl) {
      gateEl.hidden = true;
      document.body.classList.remove("cyb-gate-open");
    }
    if (gateResolve) {
      var resolve = gateResolve;
      gateResolve = null;
      resolve(!!ok);
    }
  }

  function openGate() {
    return new Promise(function (resolve) {
      var wrap = buildGate();
      gateResolve = resolve;
      wrap.hidden = false;
      document.body.classList.add("cyb-gate-open");
      var userEl = wrap.querySelector("#cyb-gate-user");
      var nickEl = wrap.querySelector("#cyb-gate-nick");
      var passEl = wrap.querySelector("#cyb-gate-pass");
      var errEl = wrap.querySelector("#cyb-gate-err");
      errEl.textContent = "";
      if (!userEl.value) userEl.value = CONFIG.ACCOUNT.user;
      if (!nickEl.value) nickEl.value = CONFIG.ACCOUNT.user;
      passEl.value = "";
      (userEl.value ? passEl : userEl).focus();
    });
  }

  function requireAuth() {
    if (auth.current()) return Promise.resolve(true);
    return openGate();
  }

  /* ---------------- Netlib 封装 ---------------- */

  function waitReady(n, ms) {
    return new Promise(function (resolve, reject) {
      if (n.id) return resolve();
      var done = false;
      var timer = global.setTimeout(function () {
        if (done) return;
        done = true;
        reject(fail(ERR.TIMEOUT, "信令服务器连接超时"));
      }, ms || CONFIG.TIMEOUT.ready);

      n.on("ready", function () {
        if (done) return;
        done = true;
        global.clearTimeout(timer);
        resolve();
      });
    });
  }

  function nickOf() {
    var cur = auth.current();
    return cur ? cur.nick : CONFIG.ACCOUNT.user;
  }

  function bindLink(n) {
    n.on("connected", function (peer) {
      if (!peer) return;
      readyPeers[peer.id] = true;
      sendEnvelope("__hello", { nick: nickOf() }, peer.id);
      emit("peer-join", peer.id);
    });

    n.on("disconnected", function (peer) {
      if (!peer) return;
      delete peerNames[peer.id];
      delete readyPeers[peer.id];
      emit("peer-leave", peer.id);
    });

    n.on("message", function (peer, channel, data) {
      onMessage(peer, channel, data);
    });

    n.on("failed", function () {
      if (global.console) global.console.warn("[P2P] peer connection failed");
      setState("error", "连接失败");
      emit("error", fail(ERR.NET, "连接失败"));
    });

    n.on("signalingerror", function (e) {
      if (global.console) global.console.warn("[P2P] signaling error:", String(e));
      emit("error", fail(ERR.NET, String(e)));
    });

    n.on("rtcerror", function (e) {
      emit("error", fail(ERR.NET, String(e)));
    });
  }

  function onMessage(peer, channel, raw) {
    lastRecvAt = Date.now();
    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!msg || !msg.t) return;

    if (msg.t === "__ping") {
      sendEnvelope("__pong", {}, peer ? peer.id : "");
      return;
    }
    if (msg.t === "__pong") return;

    if (msg.t === "__hello") {
      var pid = peer ? peer.id : "";
      if (pid && msg.d && msg.d.nick) peerNames[pid] = String(msg.d.nick);
      emit("peer-hello", { id: pid, nick: peerNames[pid] || "" });
      return;
    }

    /* 去重：同一发送者 + 同一毫秒只处理一次 */
    var key = (msg.f || "") + "|" + msg.ts;
    if (seen[key]) return;
    seen[key] = 1;

    emit("message", msg, peer ? peer.id : "");
  }

  function livePeers() {
    var out = [];
    for (var k in readyPeers) {
      if (readyPeers[k]) out.push(k);
    }
    return out;
  }

  function sendEnvelope(type, data, peerId, channel) {
    if (!net) return false;
    var msg = { t: type, d: data || {}, f: selfId || net.id || "", ts: Date.now() };
    var raw = JSON.stringify(msg);
    var ch = channel || "reliable";
    try {
      if (peerId) {
        /* 通道还没 open 时发送会被静默丢弃，这里直接判失败 */
        if (type !== "__hello" && !readyPeers[peerId]) return false;
        net.send(ch, peerId, raw);
        return true;
      }
      var ids = livePeers();
      if (!ids.length) return false;
      for (var i = 0; i < ids.length; i++) net.send(ch, ids[i], raw);
      return true;
    } catch (e) {
      return false;
    }
  }

  function startPing() {
    stopPing();
    pingTimer = global.setInterval(function () {
      if (!net || !livePeers().length) return;
      sendEnvelope("__ping", {});
      if (lastRecvAt && Date.now() - lastRecvAt > CONFIG.TIMEOUT.stale) {
        emit("status", { state: state, detail: "stale" });
        if (handlers.onStatus) {
          try {
            handlers.onStatus(state, "stale");
          } catch (e) {}
        }
      }
    }, CONFIG.TIMEOUT.ping);

    /* 房主定期刷新房间心跳，让客机能判断这个房还活着 */
    beatTimer = global.setInterval(function () {
      if (!net || !host || !roomCfg) return;
      try {
        net.setLobbySettings({
          customData: { room: roomCfg.name, ts: Date.now() }
        });
      } catch (e) {}
    }, CONFIG.TIMEOUT.beat);
  }

  function stopPing() {
    if (pingTimer !== null) {
      global.clearInterval(pingTimer);
      pingTimer = null;
    }
    if (beatTimer !== null) {
      global.clearInterval(beatTimer);
      beatTimer = null;
    }
  }

  /* ---------------- 房间发现与建立 ---------------- */

  function findRoom(name, maxPlayers, excludeCode) {
    if (!net) return Promise.resolve(null);
    return net
      .list({}, { createdAt: -1 }, 50)
      .then(function (list) {
        if (!list || !list.length) return null;
        var best = null;
        var bestTs = -1;
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          if (!item || !item.code) continue;
          if (excludeCode && item.code === excludeCode) continue;
          var cd = item.customData;
          if (!cd || cd.room !== name) continue;
          if (!item.hasPassword) continue; /* 只认我们自己的加密房 */
          if ((item.playerCount || 0) < 1) continue; /* 空房是残骸，不进去 */
          if (item.playerCount >= maxPlayers) continue;
          /* 优先选心跳最新的房；超过 TTL 没心跳的视为残骸，直接忽略 */
          var ts = cd.ts || 0;
          if (!ts || Date.now() - ts > CONFIG.TIMEOUT.roomTtl) continue;
          if (ts > bestTs) {
            bestTs = ts;
            best = item;
          }
        }
        return best;
      })
      .catch(function () {
        return null;
      });
  }

  function tryJoin(code) {
    return net
      .join(code, GAME_PASSWORD)
      .then(function (info) {
        return info || null;
      })
      .catch(function () {
        return null;
      });
  }

  /* 权威端判定：房主还在就听房主的；房主已掉线则由新加入者接管 */
  function hostByInfo(info) {
    if (!info) return false;
    var peers = info.peers || [];
    var leader = info.leader || info.creator || "";
    if (!peers.length) return true;
    if (leader && peers.indexOf(leader) === -1) return true;
    return false;
  }

  function createRoom(cfg) {
    var stamp = { room: cfg.name, ts: Date.now() };
    var payload = {
      public: true,
      password: GAME_PASSWORD,
      customData: stamp
    };
    if (cfg.maxPlayers) payload.maxPlayers = cfg.maxPlayers;

    return net.create(payload).catch(function () {
      /* 服务端不支持自定义人数时退回默认 */
      return net.create({ public: true, password: GAME_PASSWORD, customData: stamp });
    });
  }

  function selfInfo(code, cfg) {
    return net
      .list({}, { createdAt: -1 }, 50)
      .then(function (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].code === code) return list[i];
        }
        return null;
      })
      .catch(function () {
        return null;
      })
      .then(function (info) {
        return (
          info || {
            code: code,
            playerCount: 1,
            creator: net.id,
            maxPlayers: cfg.maxPlayers,
            hasPassword: true,
            customData: { room: cfg.name }
          }
        );
      });
  }

  function adopt(isHost, info) {
    host = !!isHost;
    selfId = net.id || "";
    lastRecvAt = Date.now();
    startPing();
    setState(host ? "hosting" : "guest", { code: info && info.code, isHost: host });
    if (!host && !reviveTried) {
      reviveTried = true;
      scheduleRevive(info);
    }
    if (handlers.onReady) {
      try {
        handlers.onReady({ isHost: host, code: info && info.code, info: info });
      } catch (e) {}
    }
    return { isHost: host, code: info && info.code, info: info };
  }

  /* 进房后探活：3 秒内连不上任何真 peer，说明是残骸房，自己重建 */
  function scheduleRevive(info) {
    var deadline = Date.now() + CONFIG.TIMEOUT.revive;

    function tick() {
      if (state !== "guest" || !net) return;
      if (livePeers().length > 0) return; /* 有人真正连上了，正常 */
      if (Date.now() >= deadline) {
        rebuild();
        return;
      }
      global.setTimeout(tick, 250);
    }

    global.setTimeout(tick, 250);

    function rebuild() {
      if (state !== "guest" || !net || !roomCfg) return;
      var cfg = roomCfg;
      var stale = (info && info.code) || "";

      try {
        net.leave();
      } catch (e) {}

      sleep(240)
        .then(function () {
          /* 先看有没有别人已经建好的活跃房，有就并过去，避免两个人各建一个 */
          return findRoom(cfg.name, cfg.maxPlayers, stale);
        })
        .then(function (found) {
          if (found) {
            return tryJoin(found.code).then(function (joined) {
              if (joined) {
                roomCfg = cfg;
                return adopt(hostByInfo(joined), joined);
              }
              return buildOwn(cfg);
            });
          }
          return buildOwn(cfg);
        })
        .catch(function () {
          setState("error", "房间重建失败");
        });

      function buildOwn(c) {
        return createRoom(c)
          .then(function (code) {
            return sleep(260).then(function () {
              return selfInfo(code, c);
            });
          })
          .then(function (own) {
            roomCfg = c;
            adopt(true, own);
            toast("原房间已失效，已为你重建");
          });
      }
    }
  }

  function searchAndJoin(cfg) {
    var attempt = 0;

    function createAndSettle(c) {
      return createRoom(c).then(function (code) {
        if (!code) throw fail(ERR.NET, "建房失败");
        /* 等一会儿再看有没有人和我同时建房 */
        return sleep(CONFIG.TIMEOUT.settle + Math.random() * 300).then(function () {
          return findRoom(c.name, c.maxPlayers, code).then(function (rival) {
            if (rival && code && rival.code < code) {
              /* 对方房间码更小，让给对方当房主 */
              return net
                .leave()
                .catch(function () {})
                .then(function () {
                  return sleep(120);
                })
                .then(function () {
                  return tryJoin(rival.code);
                })
                .then(function (info) {
                  if (info) return adopt(hostByInfo(info), info);
                  return selfInfo(code, c).then(function (own) {
                    return adopt(true, own);
                  });
                });
            }
            return selfInfo(code, c).then(function (own) {
              return adopt(true, own);
            });
          });
        });
      });
    }

    function step() {
      return findRoom(cfg.name, cfg.maxPlayers).then(function (found) {
        if (found) {
          return tryJoin(found.code).then(function (info) {
            if (info) return adopt(hostByInfo(info), info);
            return createAndSettle(cfg);
          });
        }
        return createAndSettle(cfg);
      });
    }

    function loop() {
      return step().catch(function (e) {
        attempt += 1;
        if (attempt >= CONFIG.RETRY.times) throw e || fail(ERR.FULL, "房间已满");
        var wait = CONFIG.RETRY.backoff[Math.min(attempt - 1, CONFIG.RETRY.backoff.length - 1)];
        return sleep(wait).then(loop);
      });
    }

    return loop();
  }

  function enter(key, cb) {
    if (entering) return entering;
    if (state === "hosting" || state === "guest") {
      if (roomKey === key) {
        return Promise.resolve({ isHost: host, code: net ? net.currentLobby : "" });
      }
      return Promise.reject(fail(ERR.NET, "已在其它房间中"));
    }
    if (!global.netlib) return Promise.reject(fail(ERR.UNSUPPORTED, "联机组件未加载"));

    var cfg = CONFIG.ROOMS[key];
    if (!cfg) return Promise.reject(fail(ERR.NET, "未知房间：" + key));

    handlers = cb || {};
    roomKey = key;
    roomCfg = cfg;
    reviveTried = false;

    var retried = false;

    function openSignaling() {
      setState("signaling");
      net = new global.netlib.Network(cfg.gameId);
      bindLink(net);
      return waitReady(net, CONFIG.TIMEOUT.ready).catch(function (e) {
        /* 信令偶发超时（Poki 限流或网络抖动）时重连一次 */
        if (retried || e.code !== ERR.TIMEOUT) throw e;
        retried = true;
        try {
          net.close();
        } catch (err) {}
        return openSignaling();
      });
    }

    entering = requireAuth()
      .then(function (ok) {
        if (!ok) throw fail(ERR.AUTH, "未登录");
        return openSignaling();
      })
      .then(function () {
        setState("searching");
        return searchAndJoin(cfg);
      })
      .then(function (result) {
        entering = null;
        return result;
      })
      .catch(function (e) {
        entering = null;
        if (e && e.code === ERR.AUTH) {
          setState("idle");
          throw e;
        }
        setState("error", e && e.message);
        if (handlers.onError) {
          try {
            handlers.onError(e);
          } catch (e2) {}
        }
        throw e;
      });

    return entering;
  }

  function leave() {
    stopPing();
    var closing = net;
    net = null;
    host = false;
    selfId = "";
    roomCfg = null;
    entering = null;
    reviveTried = false;
    peerNames = Object.create(null);
    readyPeers = Object.create(null);
    seen = Object.create(null);
    lastRecvAt = 0;
    setState("closed");

    if (!closing) return Promise.resolve();
    var step;
    try {
      step = Promise.resolve(closing.leave()).catch(function () {});
    } catch (e) {
      step = Promise.resolve();
    }
    return step.then(function () {
      try {
        if (closing.close) closing.close();
      } catch (e) {}
    });
  }

  /* ---------------- 对外接口 ---------------- */

  var P2P = {
    config: CONFIG,
    ERR: ERR,
    SITE_LOBBY: SITE_LOBBY,
    GAME_PASSWORD: GAME_PASSWORD,

    login: function (user, pass, nick) {
      return auth.login(user, pass, nick);
    },
    logout: function () {
      auth.logout();
      leave();
    },
    current: auth.current,
    requireAuth: requireAuth,

    enter: enter,
    leave: leave,

    broadcast: function (type, data, opts) {
      return sendEnvelope(type, data, "", opts && opts.channel);
    },
    send: function (type, data, peerId, opts) {
      return sendEnvelope(type, data, peerId, opts && opts.channel);
    },

    on: function (type, fn) {
      if (typeof fn !== "function") return P2P;
      (bus[type] || (bus[type] = [])).push(fn);
      return P2P;
    },
    off: function (type, fn) {
      var list = bus[type];
      if (!list) return P2P;
      if (!fn) {
        delete bus[type];
        return P2P;
      }
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i] === fn) list.splice(i, 1);
      }
      return P2P;
    },

    nickOf: nickOf,
    peerName: function (id) {
      return peerNames[id] || "";
    }
  };

  Object.defineProperty(P2P, "state", {
    get: function () {
      return state;
    }
  });
  Object.defineProperty(P2P, "connected", {
    get: function () {
      return state === "hosting" || state === "guest";
    }
  });
  Object.defineProperty(P2P, "isHost", {
    get: function () {
      return host;
    }
  });
  Object.defineProperty(P2P, "selfId", {
    get: function () {
      return selfId || (net ? net.id : "");
    }
  });
  Object.defineProperty(P2P, "peerIds", {
    get: function () {
      if (!net || !net.peers) return [];
      var out = [];
      net.peers.forEach(function (value, key) {
        out.push(key);
      });
      return out;
    }
  });
  Object.defineProperty(P2P, "peerCount", {
    get: function () {
      return net ? 1 + livePeers().length : 0;
    }
  });
  Object.defineProperty(P2P, "roomKey", {
    get: function () {
      return roomKey;
    }
  });

  global.P2P = P2P;

  /* 页面卸载前主动退房，减少服务端残留 */
  global.addEventListener("pagehide", function () {
    if (state === "hosting" || state === "guest") leave();
  });
})(window);
