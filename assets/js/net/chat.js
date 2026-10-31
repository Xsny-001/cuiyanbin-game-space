/* ============================================================
   悬浮聊天组件
   ------------------------------------------------------------
   依赖：window.P2P（assets/js/net/p2p.js）
   暴露：window.Chat
   约束：fixed 定位，绝不修改页面布局，不挤压 canvas
   ============================================================ */

(function (global) {
  "use strict";

  var MAX_MSG = 200;
  var msgs = [];
  var seen = Object.create(null);
  var unread = 0;
  var mounted = false;
  var open = false;
  var opts = { title: "大厅", subtitle: "", offsetBottom: 16 };

  var root, fab, badge, panel, listEl, inputEl, countEl, formEl;

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  }

  function build() {
    if (root) return;

    root = el("div", "cyb-chat");
    root.id = "cyb-chat";
    root.setAttribute("data-open", "false");
    root.hidden = true;

    fab = el("button", "cyb-chat-fab");
    fab.type = "button";
    fab.setAttribute("aria-label", "打开聊天");
    fab.innerHTML =
      '<span class="cyb-chat-fab-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>' +
      "</svg></span>" +
      '<span class="cyb-chat-badge" hidden>0</span>';
    badge = fab.querySelector(".cyb-chat-badge");

    panel = el("section", "cyb-chat-panel");
    panel.hidden = true;
    panel.innerHTML =
      '<header class="cyb-chat-head">' +
      '<strong class="cyb-chat-title"></strong>' +
      '<span class="cyb-chat-count">0 人在线</span>' +
      '<button class="cyb-chat-close" type="button" aria-label="收起">×</button>' +
      "</header>" +
      '<ul class="cyb-chat-list" role="log" aria-live="polite"></ul>' +
      '<form class="cyb-chat-form">' +
      '<input class="cyb-chat-input" type="text" maxlength="200" placeholder="说点什么…" autocomplete="off" />' +
      '<button class="cyb-chat-send" type="submit">发送</button>' +
      "</form>";

    listEl = panel.querySelector(".cyb-chat-list");
    countEl = panel.querySelector(".cyb-chat-count");
    inputEl = panel.querySelector(".cyb-chat-input");
    formEl = panel.querySelector(".cyb-chat-form");
    panel.querySelector(".cyb-chat-title").textContent = opts.title;

    root.appendChild(fab);
    root.appendChild(panel);
    document.body.appendChild(root);

    fab.addEventListener("click", function () {
      toggle(!open);
    });
    panel.querySelector(".cyb-chat-close").addEventListener("click", function () {
      toggle(false);
    });
    formEl.addEventListener("submit", function (e) {
      e.preventDefault();
      submit();
    });

    /* 输入法选词时按 Enter 不发送 */
    var composing = false;
    inputEl.addEventListener("compositionstart", function () {
      composing = true;
    });
    inputEl.addEventListener("compositionend", function () {
      composing = false;
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && composing) e.stopPropagation();
    });

    /* 移动端软键盘：把面板抬到键盘上方 */
    if (global.visualViewport) {
      global.visualViewport.addEventListener("resize", fixBottom);
      global.visualViewport.addEventListener("scroll", fixBottom);
    }
    global.addEventListener("resize", fixBottom);

    bindP2P();
  }

  function fixBottom() {
    if (!root) return;
    var vv = global.visualViewport;
    var lift = 0;
    if (vv && open && document.activeElement === inputEl) {
      lift = Math.max(0, global.innerHeight - vv.height - vv.offsetTop);
    }
    root.style.bottom = opts.offsetBottom + lift + "px";
  }

  function bindP2P() {
    if (!global.P2P) return;
    global.P2P.on("message", function (msg) {
      if (!msg || msg.t !== "chat") return;
      var d = msg.d || {};
      push({ from: d.from || "同学", text: d.text || "", ts: msg.ts, self: false });
    });
  }

  function appendItem(item) {
    var li = el("li", "cyb-chat-item" + (item.self ? " is-self" : ""));
    var who = el("span", "cyb-chat-who", escapeHtml(item.from || "同学"));
    var text = el("span", "cyb-chat-text");
    text.textContent = item.text;
    li.appendChild(who);
    li.appendChild(text);
    if (item.pending) li.classList.add("is-pending");
    listEl.appendChild(li);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function push(msg) {
    if (!msg || !msg.text) return;
    var key = (msg.from || "") + "|" + (msg.ts || 0) + "|" + msg.text;
    if (seen[key]) return;
    seen[key] = 1;

    var item = {
      from: msg.from || "同学",
      text: String(msg.text).slice(0, 200),
      ts: msg.ts || Date.now(),
      self: !!msg.self
    };

    msgs.push(item);
    if (msgs.length > MAX_MSG) msgs.shift();

    if (listEl) appendItem(item);

    if (!open && !item.self) {
      unread += 1;
      renderBadge();
      if (fab) {
        fab.classList.remove("is-pulse");
        void fab.offsetWidth;
        fab.classList.add("is-pulse");
      }
    }
  }

  function renderBadge() {
    if (!badge) return;
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
      badge.textContent = "0";
    }
  }

  function toggle(next) {
    if (!root) return;
    open = typeof next === "boolean" ? next : !open;
    root.setAttribute("data-open", open ? "true" : "false");
    panel.hidden = !open;
    fab.hidden = open;

    if (open) {
      unread = 0;
      renderBadge();
      listEl.scrollTop = listEl.scrollHeight;
      if (!global.matchMedia("(pointer: coarse)").matches) inputEl.focus();
    } else if (inputEl) {
      inputEl.blur();
    }
    fixBottom();
  }

  function submit() {
    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;
    if (!global.P2P) return;

    var nick = global.P2P.nickOf();
    var ts = Date.now();
    var payload = { text: text, from: nick, ts: ts };

    push({ from: nick, text: text, ts: ts, self: true });

    if (!global.P2P.broadcast("chat", payload)) {
      markPending();
      retry(payload, 2);
    }

    inputEl.value = "";
  }

  function markPending() {
    if (!listEl) return;
    var nodes = listEl.querySelectorAll(".cyb-chat-item");
    var node = nodes[nodes.length - 1];
    if (node) node.classList.add("is-pending");
  }

  function clearPending() {
    if (!listEl) return;
    var nodes = listEl.querySelectorAll(".cyb-chat-item.is-pending");
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.remove("is-pending");
  }

  /* 通道刚建立时首包可能发不出去，补发两次（接收端按 f+ts 去重，不会重复显示） */
  function retry(payload, left) {
    if (left <= 0) return;
    global.setTimeout(function () {
      if (!global.P2P || !global.P2P.connected) return;
      if (global.P2P.broadcast("chat", payload)) {
        clearPending();
        return;
      }
      retry(payload, left - 1);
    }, 1500);
  }

  var Chat = {
    mount: function (o) {
      opts = {
        title: (o && o.title) || "大厅",
        subtitle: (o && o.subtitle) || "",
        offsetBottom: (o && o.offsetBottom) || 16
      };
      build();
      if (!mounted) {
        mounted = true;
        for (var i = 0; i < msgs.length; i++) appendItem(msgs[i]);
      }
      if (panel) panel.querySelector(".cyb-chat-title").textContent = opts.title;
      root.hidden = false;
      root.style.bottom = opts.offsetBottom + "px";
      return Chat;
    },

    unmount: function () {
      if (root) {
        root.hidden = true;
        toggle(false);
      }
      return Chat;
    },

    push: push,

    setOnline: function (n) {
      if (!countEl) return;
      countEl.textContent = (n || 0) + " 人在线";
      return Chat;
    },

    setEnabled: function (on) {
      if (!root) return Chat;
      root.hidden = !on;
      if (!on) toggle(false);
      return Chat;
    },

    toggle: toggle,

    clear: function () {
      msgs.length = 0;
      seen = Object.create(null);
      unread = 0;
      if (listEl) listEl.innerHTML = "";
      renderBadge();
      return Chat;
    },

    size: function () {
      return msgs.length;
    }
  };

  global.Chat = Chat;
})(window);
