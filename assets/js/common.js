/* ============================================================
   崔彦斌的游戏空间 · 公共脚本
   - 本地存档（localStorage）
   - 合成音效（Web Audio，无音频文件）
   - 画布 / 提示 / 工具函数
   ============================================================ */

(function (global) {
  "use strict";

  var PREFIX = "cyb.";

  /* ---------------- 本地存档 ---------------- */

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      global.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  var store = {
    get: read,
    set: write,
    remove: function (key) {
      try {
        global.localStorage.removeItem(PREFIX + key);
      } catch (err) {
        /* 无痕模式下忽略 */
      }
    }
  };

  /* 数值越小越好的项目 */
  var LOWER_IS_BETTER = {
    minesweeper: true,
    "minesweeper.v2": true,
    memory: true
  };

  var scores = {
    best: function (id) {
      var value = read("best." + id, null);
      return typeof value === "number" && isFinite(value) ? value : null;
    },

    submit: function (id, value) {
      var prev = this.best(id);

      if (typeof value !== "number" || !isFinite(value) || value <= 0) {
        return { best: prev === null ? 0 : prev, isRecord: false };
      }

      value = Math.round(value);
      var lower = !!LOWER_IS_BETTER[id];
      var isRecord = prev === null || (lower ? value < prev : value > prev);
      if (isRecord) write("best." + id, value);
      return {
        best: isRecord ? value : prev,
        isRecord: isRecord
      };
    },

    wins: function (id) {
      var n = Number(read("wins." + id, 0));
      return isFinite(n) && n > 0 ? n : 0;
    },

    addWin: function (id) {
      var n = this.wins(id) + 1;
      write("wins." + id, n);
      return n;
    },

    losses: function (id) {
      var n = Number(read("losses." + id, 0));
      return isFinite(n) && n > 0 ? n : 0;
    },

    addLoss: function (id) {
      var n = this.losses(id) + 1;
      write("losses." + id, n);
      return n;
    }
  };

  /* ---------------- 音效 ---------------- */

  var sound = {
    _ctx: null,
    _enabled: null,

    get enabled() {
      if (this._enabled === null) {
        this._enabled = read("sound", true) !== false;
      }
      return this._enabled;
    },

    set enabled(value) {
      this._enabled = !!value;
      write("sound", this._enabled);
      syncSoundButtons();
    },

    context: function () {
      if (!this._ctx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try {
          this._ctx = new AC();
        } catch (err) {
          return null;
        }
      }
      if (this._ctx.state === "suspended") {
        this._ctx.resume().catch(function () {});
      }
      return this._ctx;
    },

    tone: function (freq, dur, type, gain, delay, slideTo) {
      if (!this.enabled) return;
      var ctx = this.context();
      if (!ctx) return;
      dur = dur || 0.08;
      type = type || "sine";
      gain = gain || 0.045;
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var vol = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      }
      vol.gain.setValueAtTime(0.0001, t0);
      vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },

    play: function (name) {
      switch (name) {
        case "click":
          this.tone(520, 0.05, "triangle", 0.035);
          break;
        case "move":
          this.tone(240, 0.045, "square", 0.02);
          break;
        case "eat":
          this.tone(640, 0.07, "triangle", 0.05);
          this.tone(960, 0.09, "triangle", 0.04, 0.07);
          break;
        case "merge":
          this.tone(520, 0.08, "sine", 0.045);
          this.tone(780, 0.1, "sine", 0.035, 0.06);
          break;
        case "flip":
          this.tone(680, 0.06, "triangle", 0.035);
          break;
        case "match":
          this.tone(720, 0.08, "sine", 0.045);
          this.tone(1080, 0.12, "sine", 0.04, 0.08);
          break;
        case "hit":
          this.tone(880, 0.06, "square", 0.035, 0, 460);
          break;
        case "pop":
          this.tone(760, 0.09, "sine", 0.045, 0, 1180);
          break;
        case "bounce":
          this.tone(330, 0.04, "square", 0.02);
          break;
        case "break":
          this.tone(560, 0.06, "triangle", 0.035, 0, 300);
          break;
        case "lose":
          this.tone(320, 0.14, "sawtooth", 0.035);
          this.tone(220, 0.18, "sawtooth", 0.035, 0.13);
          this.tone(150, 0.28, "sawtooth", 0.04, 0.28);
          break;
        case "win":
          this.tone(523, 0.11, "triangle", 0.045);
          this.tone(659, 0.11, "triangle", 0.045, 0.11);
          this.tone(784, 0.12, "triangle", 0.045, 0.22);
          this.tone(1047, 0.24, "triangle", 0.05, 0.34);
          break;
        case "flag":
          this.tone(900, 0.05, "triangle", 0.03);
          break;
        case "clear":
          this.tone(600, 0.08, "triangle", 0.04);
          this.tone(760, 0.08, "triangle", 0.04, 0.07);
          this.tone(980, 0.14, "triangle", 0.045, 0.14);
          break;
        case "toggle":
          this.tone(620, 0.07, "sine", 0.04);
          break;
        default:
          this.tone(440, 0.06, "sine", 0.035);
      }
    },

    toggle: function () {
      this.enabled = !this.enabled;
      if (this.enabled) this.play("toggle");
      return this.enabled;
    }
  };

  function syncSoundButtons() {
    if (typeof document === "undefined") return;
    var buttons = document.querySelectorAll("[data-sound-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.setAttribute("aria-pressed", sound.enabled ? "true" : "false");
      btn.setAttribute(
        "title",
        sound.enabled ? "关闭音效" : "开启音效"
      );
      btn.setAttribute(
        "aria-label",
        sound.enabled ? "关闭音效" : "开启音效"
      );
      var icon = btn.querySelector("[data-sound-icon]");
      if (icon) icon.textContent = sound.enabled ? "🔊" : "🔇";
      else btn.textContent = sound.enabled ? "🔊" : "🔇";
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", function (event) {
      var btn = event.target.closest && event.target.closest("[data-sound-toggle]");
      if (!btn) return;
      sound.toggle();
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", syncSoundButtons);
    } else {
      syncSoundButtons();
    }
  }

  /* ---------------- 提示条 ---------------- */

  var toast = {
    wrap: null,

    ensure: function () {
      if (this.wrap) return this.wrap;
      var el = document.createElement("div");
      el.className = "cyb-toast-wrap";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
      this.wrap = el;
      return el;
    },

    show: function (text, duration) {
      if (typeof document === "undefined") return;
      var wrap = this.ensure();
      var item = document.createElement("div");
      item.className = "cyb-toast";
      item.textContent = text;
      wrap.appendChild(item);
      var wait = duration || 2100;
      global.setTimeout(function () {
        item.classList.add("is-out");
        global.setTimeout(function () {
          if (item.parentNode) item.parentNode.removeChild(item);
        }, 260);
      }, wait);
    }
  };

  /* ---------------- 工具 ---------------- */

  var utils = {
    clamp: function (value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    randomInt: function (min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    pick: function (list) {
      return list[Math.floor(Math.random() * list.length)];
    },

    shuffle: function (list) {
      var arr = list.slice();
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },

    formatClock: function (totalSeconds) {
      var s = Math.max(0, Math.floor(totalSeconds));
      var m = Math.floor(s / 60);
      s = s % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    },

    prefersReducedMotion: function () {
      return !!(
        global.matchMedia &&
        global.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    },

    isTouch: function () {
      return (
        "ontouchstart" in global ||
        (global.matchMedia && global.matchMedia("(pointer: coarse)").matches)
      );
    },

    debounce: function (fn, wait) {
      var timer = null;
      return function () {
        var args = arguments;
        var self = this;
        global.clearTimeout(timer);
        timer = global.setTimeout(function () {
          fn.apply(self, args);
        }, wait);
      };
    }
  };

  /* ---------------- 画布 ---------------- */

  function setupCanvas(canvas, width, height) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    return ctx;
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* ---------------- 页脚年份 ---------------- */

  function fillYear() {
    var els = document.querySelectorAll("[data-year]");
    var year = new Date().getFullYear();
    for (var i = 0; i < els.length; i++) els[i].textContent = year;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fillYear);
    } else {
      fillYear();
    }
  }

  /* ---------------- 导出 ---------------- */

  global.CYB = {
    store: store,
    scores: scores,
    sound: sound,
    toast: toast.show.bind(toast),
    utils: utils,
    setupCanvas: setupCanvas,
    roundRect: roundRect
  };
})(window);
