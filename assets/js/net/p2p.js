/* ============================================================
   Netlib 封装：建房、加入、等待对端、定向发送
   约定：业务层只在 connected 之后发首包（实测 peers.size 会早于 connected 有值）
   ============================================================ */

(function (global) {
  "use strict";

  var Net = global.CYBNet;

  function whenReady(net, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish(err) {
        if (done) return;
        done = true;
        if (err) reject(err); else resolve(net);
      }
      net.on("ready", function () { finish(null); });
      net.on("failed", function () { finish(new Error("信令连接失败")); });
      net.on("signalingerror", function (e) { finish(new Error("信令错误：" + (e && e.message ? e.message : e))); });
      setTimeout(function () { finish(new Error("信令连接超时")); }, timeoutMs || 15000);
    });
  }

  function waitPeer(net, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var existing = Array.from(net.peers.values())[0];
      if (existing) { resolve(existing); return; }

      var done = false;
      function finish(peer, err) {
        if (done) return;
        done = true;
        if (err) reject(err); else resolve(peer);
      }
      net.on("connected", function (peer) { finish(peer, null); });
      net.on("failed", function () { finish(null, new Error("连接失败")); });
      setTimeout(function () { finish(null, new Error("等待对手超时")); }, timeoutMs || 60000);
    });
  }

  function createRoom(options) {
    return Net.newNetwork()
      .then(function (net) { return whenReady(net).then(function () { return net; }); })
      .then(function (net) {
        return net
          .create({
            public: false,
            maxPlayers: (options && options.maxPlayers) || 2,
            customData: (options && options.customData) || {}
          })
          .then(function (code) {
            // 实测为 13 位小写字母+数字，原样保留，绝不裁剪
            return { net: net, code: String(code) };
          });
      });
  }

  function joinRoom(code, options) {
    return Net.newNetwork()
      .then(function (net) { return whenReady(net).then(function () { return net; }); })
      .then(function (net) {
        return net.join(String(code)).then(function (info) {
          if (!info) {
            try { net.close(); } catch (e) {}
            throw new Error("房间不存在、已满或已关闭");
          }
          return { net: net, info: info };
        });
      });
  }

  function send(net, peer, payload) {
    if (!net || !peer) return false;
    try {
      net.send("reliable", peer.id, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  function close(net) {
    if (!net) return;
    try { net.close(); } catch (e) {}
  }

  global.CYBP2P = {
    whenReady: whenReady,
    waitPeer: waitPeer,
    createRoom: createRoom,
    joinRoom: joinRoom,
    send: send,
    close: close
  };
})(window);
