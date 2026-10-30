/* ============================================================
   联机核心：配置、按需加载、Supabase 单例、会话
   依赖：无（supabase-js / netlib 均动态注入）
   ============================================================ */

(function (global) {
  "use strict";

  var cfg = global.CYB_NET_CONFIG || {};
  var scriptCache = {};
  var clientPromise = null;

  function asset(path) {
    var base = cfg.assetBase || "/";
    return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  }

  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("资源加载失败：" + src)); };
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }

  function configured() {
    return !!(cfg.supabaseUrl && cfg.supabaseKey);
  }

  /* ---------------- Supabase ---------------- */

  function client() {
    if (clientPromise) return clientPromise;

    if (!configured()) {
      return Promise.reject(
        new Error("联机服务尚未配置：请填写 assets/js/net/config.js 中的 supabaseUrl 与 supabaseKey")
      );
    }

    clientPromise = loadScript(asset("assets/vendor/supabase.js")).then(function () {
      if (!global.supabase || !global.supabase.createClient) {
        throw new Error("supabase-js 未正确加载");
      }
      return global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    });

    return clientPromise;
  }

  function session() {
    return client().then(function (c) {
      return c.auth.getSession().then(function (res) {
        return (res && res.data && res.data.session) || null;
      });
    });
  }

  /* ---------------- Netlib ---------------- */

  function netlib() {
    if (global.netlib && global.netlib.Network) return Promise.resolve(global.netlib);
    return loadScript(asset("assets/vendor/netlib.js")).then(function () {
      if (!global.netlib || !global.netlib.Network) {
        throw new Error("Netlib 未正确加载");
      }
      return global.netlib;
    });
  }

  function newNetwork() {
    return netlib().then(function (lib) {
      return new lib.Network(cfg.netlibGameId, undefined, cfg.signalingUrl || undefined);
    });
  }

  /* ---------------- 杂项 ---------------- */

  function gameMeta(key) {
    return (cfg.games && cfg.games[key]) || null;
  }

  function onlineGames() {
    var out = [];
    Object.keys(cfg.games || {}).forEach(function (k) {
      var g = cfg.games[k];
      if (g && g.href) out.push({ key: k, name: g.name || k, href: g.href, maxPlayers: g.maxPlayers || 2 });
    });
    return out;
  }

  function safeText(v, max) {
    var s = String(v == null ? "" : v);
    return s.length > (max || 64) ? s.slice(0, max || 64) : s;
  }

  global.CYBNet = {
    config: cfg,
    asset: asset,
    loadScript: loadScript,
    configured: configured,
    client: client,
    session: session,
    netlib: netlib,
    newNetwork: newNetwork,
    gameMeta: gameMeta,
    onlineGames: onlineGames,
    safeText: safeText
  };
})(window);
