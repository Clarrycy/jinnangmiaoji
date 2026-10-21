// 由 src/core/chrome/engine.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const BRAND_ICON = require("./brand-icons");
const qrCopy = require("./qr-copy");
const jsQR = require("jsqr");
const qrcodegen = require("qrcode-generator");
function mountChrome(opts) {
  const { S, ICON, SPEC, host } = opts;
  const ENTRIES = ["官服", "4399", "QQ 大厅", "百度", "360"];
  const PROVIDERS = ["WeGame - QQ", "WeGame - 微信", "bilibili 扫码登录", "Steam 扫码登录", "OPPO 扫码登录", "小米扫码登录", "VIVO 扫码登录", "华为扫码登录", "荣耀扫码登录"];
  const PROVIDER_CHIP = { "WeGame - QQ": "WeGame", "WeGame - 微信": "WeGame", "bilibili 扫码登录": "bilibili", "Steam 扫码登录": "Steam", "OPPO 扫码登录": "OPPO", "小米扫码登录": "小米", "VIVO 扫码登录": "VIVO", "华为扫码登录": "华为", "荣耀扫码登录": "荣耀" };
  const TAB_MAX = 240, STRIP_PAD = 6, BAR = SPEC.bar, LIST_BTN = 32, NEW_BTN = 44, DETACH_DY = 28, DRAG_SLOP = 3;
  const NICKS = ["范例玩家甲", "范例玩家乙", "范例玩家丙", "小号二", "小号三"];
  const settings = host.data.settings;
  const q = (root, sel) => root.querySelector(sel);
  let nextTabId = 1, nextWinId = 1;
  const wins = [];
  function makeTab(p = {}) {
    return { id: nextTabId++, kind: "game", entry: "官服", provider: null, nick: "", audible: false, muted: false, hist: [0, 0], loading: false, born: false, ...p };
  }
  function makeWin(tabs, p = {}) {
    const w = { id: nextWinId++, float: false, x: 0, y: 0, scroll: 0, lastCur: null, tabs, cur: tabs[0]?.id ?? null, ...p };
    wins.push(w);
    return w;
  }
  const winOf = (t) => wins.find((w) => w.tabs.includes(t));
  const curTab = (w) => w.tabs.find((t) => t.id === w.cur) || w.tabs[0];
  const tabLabel = (t) => t.kind === "game" ? t.nick || (t.status === "landing" ? "已登录" : "未登录") : PAGE_TITLE[t.kind];
  const allMuted = () => wins.flatMap((w) => w.tabs).filter((t) => t.kind === "game").every((t) => t.muted);
  function insertTab(w, t, index = w.tabs.length) {
    w.tabs.splice(index, 0, t);
    w.cur = t.id;
  }
  function openTab(w, t, index = w.tabs.length, extra) {
    if (t.kind !== "game") {
      const had = w.tabs.find((x) => x.kind !== "game");
      if (had) {
        had.kind = t.kind;
        w.cur = had.id;
        return had;
      }
    }
    insertTab(w, t, index);
    if (t.kind === "game") host.tabs?.open(t, extra);
    return t;
  }
  function removeTab(w, t, opts2 = {}) {
    const i = w.tabs.indexOf(t);
    if (i < 0) return i;
    w.tabs.splice(i, 1);
    if (t.kind === "game" && !opts2.detach) host.tabs?.close(t);
    if (w.cur === t.id && w.tabs.length) w.cur = w.tabs[Math.min(i, w.tabs.length - 1)].id;
    if (!w.tabs.length) {
      if (host.window) host.window.command("close", `last-tab-removed:${t.id}:${opts2.detach ? "detach" : "close"}`);
      else if (wins.length > 1) destroyWin(w);
      else openTab(w, makeTab({ born: true }));
    }
    return i;
  }
  function destroyWin(w) {
    const i = wins.indexOf(w);
    if (i >= 0) wins.splice(i, 1);
    document.querySelector(`.win[data-win="${w.id}"]`)?.remove();
  }
  function moveTab(w, t, toIndex) {
    const i = w.tabs.indexOf(t);
    if (i < 0 || i === toIndex) return;
    w.tabs.splice(i, 1);
    w.tabs.splice(toIndex, 0, t);
  }
  function freshTab() {
    return makeTab({ entry: "官服", born: true });
  }
  function newTabAfter(w, t) {
    const n = freshTab();
    openTab(w, n, w.tabs.indexOf(t) + 1);
    return n;
  }
  function closeWindow(w, reason = "caption") {
    const go = () => {
      if (host.window) host.window.command("close", reason);
      else if (wins.length > 1) destroyWin(w);
    };
    if (settings.confirmClose && w.tabs.length >= 2) confirmCloseWindow(w.tabs.length, go);
    else go();
  }
  const PASSIVE_COVER = /* @__PURE__ */ new Set(["tip", "toast", "leave", "web"]);
  const coverReasons = /* @__PURE__ */ new Set();
  let coverSent = false, keysSent = false, coverQueued = false;
  function setCover(reason, on) {
    if (on) coverReasons.add(reason);
    else coverReasons.delete(reason);
    if (coverQueued) return;
    coverQueued = true;
    queueMicrotask(() => {
      coverQueued = false;
      const full = coverReasons.size > 0, keys = [...coverReasons].some((r) => !PASSIVE_COVER.has(r));
      if (full !== coverSent || keys !== keysSent) {
        coverSent = full;
        keysSent = keys;
        host.cover?.(full, keys);
      }
    });
  }
  const chipWidthCache = {};
  let chipProbe = null;
  function chipWidth(label) {
    if (chipWidthCache[label]) return chipWidthCache[label];
    if (!chipProbe) {
      chipProbe = document.createElement("div");
      chipProbe.className = "tab";
      chipProbe.style.cssText = "visibility:hidden;pointer-events:none;left:-9999px;width:auto";
      chipProbe.innerHTML = `<span class="entry"><span class="el"></span>${S.caret}</span>`;
      document.body.append(chipProbe);
    }
    q(chipProbe, ".el").textContent = label;
    return chipWidthCache[label] = Math.ceil(q(chipProbe, ".entry").getBoundingClientRect().width);
  }
  function minTabWidth(w) {
    const widest = Math.max(0, ...w.tabs.filter((t) => t.kind === "game").map((t) => chipWidth(t.entry)));
    return SPEC.pillSide * 2 + SPEC.padL + SPEC.icon + SPEC.gap + widest + 8 + SPEC.ctl + SPEC.ctl + SPEC.padR;
  }
  function hasList(w) {
    return w.tabs.length >= 2 || (host.data.closed?.length || 0) > 0;
  }
  function layout(w, stripWidth) {
    const n = w.tabs.length, leftGap = hasList(w) ? LIST_BTN : 0, min = minTabWidth(w);
    let avail = stripWidth - leftGap - STRIP_PAD - NEW_BTN;
    let width = Math.max(min, Math.min(TAB_MAX, Math.floor(avail / n)));
    const overflow = n * width > avail;
    if (overflow) {
      width = min;
      avail = stripWidth - leftGap - NEW_BTN - 4;
    }
    const total = n * width + STRIP_PAD;
    w.scroll = overflow ? Math.max(0, Math.min(w.scroll, total - avail)) : 0;
    return { width, leftGap, avail, overflow, total, lefts: w.tabs.map((_, i) => STRIP_PAD + i * width), newTabLeft: leftGap + STRIP_PAD + n * width + 8, sizeClass: width >= 200 ? "" : width >= 160 ? "w-mid" : "w-narrow" };
  }
  function scrollToActive(w, L) {
    if (!L.overflow || w.cur === w.lastCur) {
      w.lastCur = w.cur;
      return L;
    }
    const i = w.tabs.findIndex((t) => t.id === w.cur), l = i * L.width, r = l + L.width + STRIP_PAD;
    if (l < w.scroll) w.scroll = l;
    else if (r > w.scroll + L.avail) w.scroll = r - L.avail;
    w.lastCur = w.cur;
    return layout(w, L.stripWidth ?? L.avail + L.leftGap + NEW_BTN + (L.overflow ? 4 : STRIP_PAD));
  }
  const WIN_HTML = `<header>
  <div class="nav"><button class="ib back" data-tip="后退" data-key="Alt+←">${S.back}</button><button class="ib fwd" data-tip="前进" data-key="Alt+→">${S.fwd}</button><button class="ib reload" data-tip="刷新" data-key="Ctrl+R">${S.reload}</button></div>
  <div class="tabs"><button class="ib tablist" data-tip="所有标签页" data-key="Ctrl+Shift+A">${S.chevDown}</button><div class="clip"><div class="rail"></div></div><button class="ib newtab" data-tip="新标签页" data-key="Ctrl+T">${S.plus}</button></div>
  <div class="caption"><span class="more" data-tip="菜单" data-key="Alt+F">${S.menu}<span class="dot"></span></span><span class="mn" data-tip="最小化">${S.min}</span><span class="mx" data-tip="最大化">${S.max}</span><span class="cx" data-tip="关闭" data-key="Alt+F4">${S.x}</span></div>
</header>
<div id="viewport"><div class="game"></div><div class="pg" hidden></div></div>
<div class="menu entrymenu" hidden></div><div class="menu submenu" hidden></div>
<div class="amenu" hidden><div class="item" data-act="pm"><i>${S.person}</i><span>账号</span><span class="hint">Ctrl+Shift+M</span></div><div class="item" data-act="settings"><i>${S.sliders}</i><span>设置</span><span class="hint">Ctrl+Shift+S</span></div><div class="sep"></div><div class="item" data-act="update"><i>${S.update}</i><span>更新</span><i class="dot2"></i></div><div class="item" data-act="about"><i>${S.info}</i><span>关于</span></div></div>`;
  const BORN_CLIP = `polygon(0 0, 100% 0, 100% calc(100% - ${SPEC.radius}px), calc(100% + ${SPEC.radius}px) calc(100% - ${SPEC.radius}px), calc(100% + ${SPEC.radius}px) 100%, -${SPEC.radius}px 100%, -${SPEC.radius}px calc(100% - ${SPEC.radius}px), 0 calc(100% - ${SPEC.radius}px))`;
  const TAB_GAME = `<i class="pill"></i><span class="sep"></span><img class="fav" src="${ICON}" draggable="false"><span class="entry" data-tip="切换渠道服"><span class="el"></span>${S.caret}</span><span class="t"></span><span class="snd" hidden></span><span class="x" data-tip="关闭" data-key="Ctrl+W">${S.close}</span>`;
  const tabPageHtml = (t) => `<i class="pill"></i><span class="sep"></span><span class="fav page">${S[PAGE_ICON[t.kind]]}</span><span class="t"></span><span class="x" data-tip="关闭" data-key="Ctrl+W">${S.close}</span>`;
  function winEl(w) {
    let el = document.querySelector(`.win[data-win="${w.id}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "win" + (w.float ? " float" : "");
      el.dataset.win = String(w.id);
      el.innerHTML = WIN_HTML;
      host.desk().append(el);
      q(el, ".back").onclick = () => {
        const t = curTab(w);
        if (host.tabs) {
          host.tabs.nav(t, "back");
          return;
        }
        t.hist = [t.hist[0] - 1, t.hist[1] + 1];
        render(w);
      };
      q(el, ".fwd").onclick = () => {
        const t = curTab(w);
        if (host.tabs) {
          host.tabs.nav(t, "fwd");
          return;
        }
        t.hist = [t.hist[0] + 1, t.hist[1] - 1];
        render(w);
      };
      q(el, ".reload").onclick = () => {
        const t = curTab(w);
        if (host.tabs) {
          host.tabs.nav(t, t.loading ? "stop" : "reload");
          return;
        }
        const f = el.querySelector(`iframe[data-id="${t.id}"]`);
        if (f) {
          f.src = f.src;
          return;
        }
        t.loading = !t.loading;
        render(w);
        if (t.loading) setTimeout(() => {
          t.loading = false;
          render(w);
        }, 1500);
      };
      q(el, ".newtab").onclick = () => {
        openTab(w, freshTab());
        render(w);
      };
      q(el, ".tablist").onclick = (e) => {
        e.stopPropagation();
        toggleTabList(w);
      };
      q(el, ".tabs").addEventListener("wheel", (e) => {
        const L = layout(w, q(el, ".tabs").clientWidth);
        if (!L.overflow) return;
        e.preventDefault();
        w.scroll += e.deltaY || e.deltaX;
        render(w);
      }, { passive: false });
      q(el, ".more").onclick = (e) => {
        e.stopPropagation();
        const m = q(el, ".amenu");
        const open = m.hidden || leaving.has(m);
        closeAll();
        if (open) {
          cancelLeave(m);
          m.hidden = false;
          setCover("menu", true);
        }
      };
      q(el, ".amenu").onclick = (e) => {
        e.stopPropagation();
        const it = e.target.closest(".item");
        closeAll();
        const act = it?.dataset.act;
        if (act) openPage(w, act);
      };
      q(el, ".caption .cx").onclick = () => closeWindow(w);
      q(el, ".caption .mn").onclick = () => host.window?.command("minimize");
      q(el, ".caption .mx").onclick = () => host.window?.command("maximize");
      q(el, "header").addEventListener("pointerdown", (e) => {
        const tg = e.target;
        if (e.button !== 0 || tg.closest(".tab,.ib,.caption span,.menu,.amenu")) return;
        if (host.window) {
          if (!host.window.dragStart) return;
          host.window.dragStart({ x: e.screenX, y: e.screenY });
          const up = () => {
            window.removeEventListener("pointerup", up);
            host.window.dragEnd?.();
          };
          window.addEventListener("pointerup", up);
          return;
        }
        winDrag.start(e, w);
      });
    }
    if (w.float) {
      el.style.left = w.x + "px";
      el.style.top = w.y + "px";
    }
    return el;
  }
  function render(w) {
    const el = winEl(w), strip = q(el, ".tabs"), rail = q(strip, ".rail");
    let L = layout(w, strip.clientWidth);
    L.stripWidth = strip.clientWidth;
    L = scrollToActive(w, L);
    strip.classList.toggle("overflow", L.overflow);
    strip.classList.toggle("multi", hasList(w));
    rail.style.transform = `translateX(${-w.scroll}px)`;
    rail.parentElement.classList.toggle("scrolled", w.scroll > 0);
    const seen = /* @__PURE__ */ new Set();
    w.tabs.forEach((t2, i) => {
      let d = q(rail, `.tab[data-id="${t2.id}"]`);
      if (!d) {
        d = document.createElement("div");
        d.dataset.id = String(t2.id);
        d.style.left = L.lefts[i] + "px";
        d.style.width = t2.born ? "0px" : L.width + "px";
        if (t2.born) d.style.clipPath = BORN_CLIP;
        rail.append(d);
        d.getBoundingClientRect();
        if (t2.born) {
          t2.born = false;
          setTimeout(() => {
            d.style.clipPath = "";
          }, 220);
        }
        bindTab(d, w, t2);
      }
      seen.add(d);
      d.className = `tab ${t2.id === w.cur ? "on" : ""} ${d.classList.contains("drag") ? "drag" : ""} ${d.classList.contains("ctx") ? "ctx" : ""} ${L.sizeClass}`.replace(/\s+/g, " ").trim();
      if (!d.classList.contains("drag")) d.style.left = L.lefts[i] + "px";
      d.style.width = L.width + "px";
      const html = t2.kind === "game" ? TAB_GAME : tabPageHtml(t2);
      if (d.dataset.html !== html) {
        d.innerHTML = html;
        d.dataset.html = html;
      }
      q(d, ".t").textContent = tabLabel(t2);
      q(d, ".t").classList.toggle("dim", t2.kind === "game" && !t2.nick);
      if (t2.kind === "game") {
        q(d, ".el").textContent = t2.entry;
        const snd = q(d, ".snd");
        const on = t2.audible || t2.muted;
        snd.hidden = !on;
        if (on) {
          snd.innerHTML = t2.muted ? S.volOff : S.volUp;
          snd.dataset.tip = t2.muted ? "取消静音" : "静音此标签页";
        }
      }
    });
    for (const d of [...rail.querySelectorAll(".tab")]) if (!seen.has(d)) {
      d.remove();
      el.querySelector(`.game iframe[data-id="${d.dataset.id}"]`)?.remove();
    }
    const nt = q(strip, ".newtab");
    nt.classList.toggle("pin", L.overflow);
    if (!L.overflow) nt.style.left = L.newTabLeft + "px";
    const t = curTab(w);
    if (!t) {
      syncCardTabs(w);
      return;
    }
    if (host.tabs) {
      if (w.sentCur !== t.id) {
        w.sentCur = t.id;
        host.tabs.activate(t);
      }
      const order = w.tabs.map((x) => x.id).join(",");
      if (w.sentOrder !== order) {
        w.sentOrder = order;
        host.tabs.order?.(w.tabs.map((x) => x.id));
      }
    }
    setCover("page", t.kind !== "game");
    const hasUpdate = upds.some((u) => u.state === "available" || u.state === "ready");
    q(el, ".more .dot").hidden = !hasUpdate;
    q(el, ".amenu .dot2").hidden = !hasUpdate;
    q(el, ".back").disabled = !t.hist[0];
    q(el, ".fwd").disabled = !t.hist[1];
    q(el, ".reload").innerHTML = t.loading ? S.stop : S.reload;
    q(el, ".pg").hidden = t.kind === "game";
    q(el, ".game").hidden = t.kind !== "game";
    q(el, "#viewport").classList.toggle("page", t.kind !== "game");
    if (t.kind === "game") {
      const g = q(el, ".game");
      const url = host.liveUrl ? host.liveUrl(t.entry) : void 0;
      for (const f of g.querySelectorAll("iframe")) f.hidden = f.getAttribute("data-id") !== String(t.id);
      let ph = g.querySelector(".ph");
      if (!ph) {
        ph = document.createElement("span");
        ph.className = "ph";
        g.append(ph);
      }
      if (url) {
        let f = g.querySelector(`iframe[data-id="${t.id}"]`);
        if (!f) {
          f = document.createElement("iframe");
          f.dataset.id = String(t.id);
          f.src = url;
          f.setAttribute("allow", "autoplay; fullscreen; clipboard-write");
          g.append(f);
        }
        f.hidden = false;
        ph.hidden = true;
      } else {
        ph.hidden = false;
        ph.textContent = `${t.entry}  ${t.nick || "未登录"}${t.muted ? "  已静音" : t.audible ? "  正在播放声音" : ""}`;
      }
    }
    if (t.kind !== "game") renderPage(w, t);
    syncCardTabs(w);
  }
  const renderAll = () => wins.forEach(render);
  function bindTab(d, w, t) {
    d.addEventListener("pointerdown", (e) => {
      const target = e.target;
      if (e.button !== 0 || target.closest(".x,.snd")) return;
      const chip = target.closest(".entry");
      const reopen = Boolean(chip) && !chip.classList.contains("open");
      w.cur = t.id;
      closeAll();
      render(w);
      drag.start(e, w, t, reopen ? () => openEntryMenu(w, t) : null);
    });
    d.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTabMenu(w, t, e.clientX, e.clientY);
      d.classList.add("ctx");
    });
    d.addEventListener("click", (e) => {
      const target = e.target;
      const x = target.closest(".x"), snd = target.closest(".snd");
      if (x) {
        e.stopPropagation();
        removeTab(w, t);
        closeAll();
        renderAll();
      } else if (snd) {
        e.stopPropagation();
        t.muted = !t.muted;
        host.tabs?.mute(t, t.muted);
        renderAll();
      }
    });
    q(d, ".entry")?.addEventListener("click", (e) => e.stopPropagation());
  }
  function floatify(w, el) {
    if (w.float) return;
    const r = el.getBoundingClientRect(), d = host.desk().getBoundingClientRect();
    w.float = true;
    w.x = r.left - d.left;
    w.y = r.top - d.top;
    el.classList.add("float");
    el.style.left = w.x + "px";
    el.style.top = w.y + "px";
  }
  const winDrag = {
    // 按住标题栏空白处拖整窗（对应 -webkit-app-region: drag）
    start(e, w) {
      const el = winEl(w);
      floatify(w, el);
      const d = host.desk().getBoundingClientRect();
      const offX = e.pageX - d.left - w.x, offY = e.pageY - d.top - w.y;
      let raf = 0;
      const move = (ev) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          w.x = ev.pageX - d.left - offX;
          w.y = ev.pageY - d.top - offY;
          el.style.left = w.x + "px";
          el.style.top = w.y + "px";
        });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }
  };
  const drag = {
    s: null,
    start(e, w, t, onClick) {
      const el = document.querySelector(`.win[data-win="${w.id}"] .tab[data-id="${t.id}"]`);
      this.s = { w, t, el, grabX: e.clientX - el.getBoundingClientRect().left, x0: e.clientX, y0: e.clientY, moved: false, carry: null, onClick };
      window.addEventListener("pointermove", this.move);
      window.addEventListener("pointerup", this.up);
    },
    raf: 0,
    pending: null,
    move: (e) => {
      drag.pending = e;
      if (!drag.raf) drag.raf = requestAnimationFrame(() => {
        drag.raf = 0;
        const ev = drag.pending;
        drag.pending = null;
        if (ev) drag._move(ev);
      });
    },
    up: () => {
      if (drag.pending) {
        drag._move(drag.pending);
        drag.pending = null;
      }
      drag._up();
    },
    stripRect(w) {
      return document.querySelector(`.win[data-win="${w.id}"] .tabs`).getBoundingClientRect();
    },
    _move(e) {
      const s = this.s;
      if (!s) return;
      if (s.detached) return;
      if (!s.moved && Math.abs(e.clientX - s.x0) < DRAG_SLOP && Math.abs(e.clientY - s.y0) < DRAG_SLOP) return;
      s.moved = true;
      if (s.carry) return this._carry(e);
      const sr = this.stripRect(s.w);
      if (Math.abs(e.clientY - (sr.top + BAR / 2)) > DETACH_DY) return this._detach(e);
      this._reorder(e, sr);
    },
    _reorder(e, sr) {
      const s = this.s, strip = document.querySelector(`.win[data-win="${s.w.id}"] .tabs`);
      const L = layout(s.w, strip.clientWidth);
      const n = s.w.tabs.length, left = Math.max(STRIP_PAD, Math.min(STRIP_PAD + (n - 1) * L.width, e.clientX - sr.left - L.leftGap - s.grabX + s.w.scroll));
      s.el.classList.add("drag");
      s.el.style.left = left + "px";
      const idx = Math.round((left - STRIP_PAD) / L.width), ci = s.w.tabs.indexOf(s.t);
      if (idx !== ci) {
        moveTab(s.w, s.t, idx);
        render(s.w);
      }
    },
    _detach(e) {
      const s = this.s, src = winEl(s.w), r = src.getBoundingClientRect();
      if (host.tabs) {
        if (s.w.tabs.length === 1) {
          s.el?.classList.remove("drag");
          s.el.style.left = "";
          render(s.w);
          host.tabs.carry?.({ x: e.screenX, y: e.screenY, kind: s.t.kind });
          s.detached = true;
          s.el = null;
          return;
        }
        if (!host.tabs.detach) {
          s.el?.classList.remove("drag");
          return;
        }
        s.el?.classList.remove("drag");
        removeTab(s.w, s.t, { detach: true });
        render(s.w);
        host.tabs.detach(s.t, { x: e.screenX, y: e.screenY, grabX: s.grabX, kind: s.t.kind });
        s.detached = true;
        s.el = null;
        return;
      }
      if (s.w.tabs.length === 1) {
        s.el.classList.remove("drag");
        s.el.style.left = "";
        floatify(s.w, src);
        s.carry = { w: s.w, el: src, offX: s.x0 - r.left, offY: s.y0 - r.top };
        src.classList.add("carry");
        return this._carry(e);
      }
      s.el.classList.remove("drag");
      removeTab(s.w, s.t);
      if (wins.includes(s.w)) render(s.w);
      const nw = makeWin([s.t], { float: true });
      const nel = winEl(nw);
      nel.classList.add("carry");
      s.carry = { w: nw, el: nel, offX: s.x0 - r.left, offY: s.y0 - r.top };
      s.w = nw;
      render(nw);
      s.el = q(nel, ".tab");
      this._carry(e);
    },
    _carry(e) {
      const s = this.s, d = host.desk().getBoundingClientRect();
      s.carry.w.x = e.pageX - s.carry.offX - d.left - window.scrollX;
      s.carry.w.y = e.pageY - s.carry.offY - d.top - window.scrollY;
      winEl(s.carry.w);
      for (const other of wins) {
        if (other === s.carry.w) continue;
        const os = this.stripRect(other);
        if (e.clientX < os.left - 8 || e.clientX > os.right + 8 || e.clientY < os.top - 10 || e.clientY > os.bottom + 10) continue;
        destroyWin(s.carry.w);
        s.carry = null;
        s.w = other;
        const L = layout(other, os.width);
        const idx = Math.max(0, Math.min(other.tabs.length, Math.round((e.clientX - os.left - L.leftGap - s.grabX - STRIP_PAD + other.scroll) / L.width)));
        insertTab(other, s.t, idx);
        render(other);
        s.el = document.querySelector(`.win[data-win="${other.id}"] .tab[data-id="${s.t.id}"]`);
        s.el.classList.add("drag");
        s.grabX = Math.min(s.grabX, L.width - 10);
        return this._reorder(e, os);
      }
    },
    _up() {
      const s = this.s;
      this.s = null;
      window.removeEventListener("pointermove", this.move);
      window.removeEventListener("pointerup", this.up);
      if (!s) return;
      if (s.detached) {
        host.tabs?.dragEnd?.();
        return;
      }
      if (s.carry) s.carry.el.classList.remove("carry");
      s.el?.classList.remove("drag");
      renderAll();
      if (!s.moved && s.onClick) s.onClick();
    }
  };
  const leaving = /* @__PURE__ */ new Map();
  const MENU_SEL = ".menu,.amenu,.tlmenu";
  function menusShowing() {
    return [...document.querySelectorAll(MENU_SEL)].some((p) => !p.hidden && !leaving.has(p));
  }
  function cancelLeave(p) {
    const t = leaving.get(p);
    if (t === void 0) return;
    clearTimeout(t);
    leaving.delete(p);
    p.classList.remove("leaving");
    if (!leaving.size) setCover("leave", false);
  }
  function hideMenu(p) {
    if (p.hidden || leaving.has(p)) return;
    p.classList.add("leaving");
    setCover("leave", true);
    leaving.set(p, window.setTimeout(() => {
      leaving.delete(p);
      p.classList.remove("leaving");
      p.hidden = true;
      if (!leaving.size) setCover("leave", false);
    }, 110));
    if (!menusShowing()) setCover("menu", false);
  }
  function closeAll() {
    for (const p of document.querySelectorAll(MENU_SEL)) hideMenu(p);
    for (const t of document.querySelectorAll(".tab.ctx")) t.classList.remove("ctx");
    document.querySelectorAll(".entry.open,.ib.s.op.open").forEach((x) => x.classList.remove("open"));
    if (!menusShowing()) setCover("menu", false);
  }
  function menuItem(label, onClick, extra = {}) {
    const d = document.createElement("div");
    d.className = "item" + (extra.sub ? " sub" : "") + (extra.open ? " open" : "") + (extra.disabled ? " disabled" : "");
    const txt = document.createElement("span");
    txt.textContent = label;
    d.append(txt);
    if (extra.checked) {
      const c = document.createElement("i");
      c.className = "chk";
      d.append(c);
    }
    if (onClick && !extra.disabled) d.onclick = (ev) => {
      ev.stopPropagation();
      onClick();
    };
    return d;
  }
  function openEntryMenu(w, t) {
    closeAll();
    const el = winEl(w), a = q(el, ".tab.on .entry");
    if (!a) return;
    a.classList.add("open");
    const m = q(el, ".entrymenu"), sub = q(el, ".submenu"), r = a.getBoundingClientRect(), wr = el.getBoundingClientRect();
    let subOpen = false;
    const draw = () => {
      m.textContent = "";
      const loggedIn = () => Boolean(t.status && t.status !== "none");
      const switchEntry = (e) => {
        t.entry = e;
        t.provider = null;
        t.nick = "";
        t.status = "none";
        host.tabs?.entry(t, e, { logout: true });
        render(w);
      };
      for (const e of ENTRIES) m.append(menuItem(e, () => {
        closeAll();
        if (e === t.entry && !t.provider) return;
        if (loggedIn()) dialog({ title: "切换服务器？", body: "切换服务器会退出当前账号，确定要切换吗？", cancel: "取消", ok: "切换服务器", onOk: () => switchEntry(e) });
        else {
          t.entry = e;
          t.provider = null;
          host.tabs?.entry(t, e);
          render(w);
        }
      }, { checked: e === t.entry && !t.provider }));
      const sep = document.createElement("div");
      sep.className = "sep";
      m.append(sep);
      const other = menuItem(t.provider ? PROVIDER_CHIP[t.provider] : "其他渠道服", () => {
        subOpen = !subOpen;
        draw();
      }, { sub: true, open: subOpen });
      other.onmouseenter = () => {
        if (!subOpen) {
          subOpen = true;
          draw();
        }
      };
      m.append(other);
      if (subOpen) {
        cancelLeave(sub);
        sub.hidden = false;
      } else hideMenu(sub);
      const pickProvider = (p, logout) => {
        t.provider = p;
        t.entry = PROVIDER_CHIP[p];
        t.nick = "";
        t.status = "none";
        render(w);
        if (host.tabs) host.tabs.provider(t, p, { logout });
        else {
          q(el, ".game").textContent = "";
          qrPrompt({ provider: p, stage: "loading", qr: "", text: "" });
        }
      };
      if (subOpen) {
        sub.textContent = "";
        for (const p of PROVIDERS) sub.append(menuItem(p, () => {
          closeAll();
          if (loggedIn()) dialog({ title: "切换登录方式？", body: "切换服务器会退出当前账号，确定要切换吗？", cancel: "取消", ok: "切换登录方式", onOk: () => pickProvider(p, true) });
          else pickProvider(p, false);
        }, { checked: t.provider === p }));
        sub.style.left = r.left - wr.left - 8 + 176 + 2 + "px";
        sub.style.top = r.bottom - wr.top + 2 + other.offsetTop + "px";
      }
    };
    cancelLeave(m);
    draw();
    m.hidden = false;
    m.style.left = r.left - wr.left - 8 + "px";
    m.style.top = r.bottom - wr.top + 2 + "px";
    setCover("menu", true);
  }
  function openTabMenu(w, t, x, y) {
    closeAll();
    const el = winEl(w);
    let m = q(el, ".cmenu");
    if (!m) {
      m = document.createElement("div");
      m.className = "menu cmenu";
      el.append(m);
    }
    m.textContent = "";
    const wr = el.getBoundingClientRect(), i = w.tabs.indexOf(t);
    const items = [
      ["在右侧新建标签页", () => {
        newTabAfter(w, t);
        render(w);
      }],
      ["移到新窗口", () => {
        if (w.tabs.length < 2) return;
        const r = el.getBoundingClientRect(), d = host.desk().getBoundingClientRect();
        removeTab(w, t);
        makeWin([t], { float: true, x: r.left - d.left + 40, y: r.top - d.top + 40 });
        renderAll();
      }, w.tabs.length < 2 || Boolean(host.tabs)],
      null,
      ["刷新", () => {
        if (host.tabs) {
          host.tabs.nav(t, "reload");
          return;
        }
        t.loading = true;
        render(w);
        setTimeout(() => {
          t.loading = false;
          render(w);
        }, 1500);
      }],
      [t.muted ? "取消静音" : "静音此标签页", () => {
        t.muted = !t.muted;
        host.tabs?.mute(t, t.muted);
        render(w);
      }],
      [allMuted() ? "取消全部静音" : "静音全部标签页", () => {
        const all = !allMuted();
        for (const x2 of wins) for (const y2 of x2.tabs) if (y2.kind === "game") {
          y2.muted = all;
          host.tabs?.mute(y2, all);
        }
        renderAll();
      }],
      null,
      ["关闭", () => {
        removeTab(w, t);
        renderAll();
      }],
      ["关闭其他标签页", () => {
        for (const x2 of [...w.tabs]) if (x2 !== t) removeTab(w, x2);
        w.cur = t.id;
        render(w);
      }, w.tabs.length < 2],
      ["关闭右侧标签页", () => {
        for (const x2 of w.tabs.slice(i + 1)) removeTab(w, x2);
        if (!w.tabs.find((x2) => x2.id === w.cur)) w.cur = t.id;
        render(w);
      }, i === w.tabs.length - 1]
    ];
    for (const it of items) {
      if (!it) {
        const sp = document.createElement("div");
        sp.className = "sep";
        m.append(sp);
        continue;
      }
      const [label, fn, disabled] = it;
      m.append(menuItem(label, () => {
        closeAll();
        fn();
      }, { disabled }));
    }
    cancelLeave(m);
    m.hidden = false;
    m.style.left = Math.min(x - wr.left, wr.width - 218) + "px";
    m.style.top = y - wr.top + "px";
    setCover("menu", true);
  }
  function toggleTabList(w) {
    const el = winEl(w);
    const m = q(el, ".tlmenu");
    const open = m && !m.hidden && !leaving.has(m);
    closeAll();
    if (open) return;
    fillTabList(w);
  }
  function fillTabList(w) {
    const el = winEl(w);
    let m = q(el, ".tlmenu");
    if (!m) {
      m = document.createElement("div");
      m.className = "tlmenu";
      el.append(m);
    }
    const closed = host.data.closed || [];
    if (w.tabs.length < 2 && !closed.length) {
      m.hidden = true;
      return;
    }
    cancelLeave(m);
    m.textContent = "";
    m.hidden = false;
    setCover("menu", true);
    const r = q(el, ".tablist").getBoundingClientRect(), wr = el.getBoundingClientRect();
    m.style.left = r.left - wr.left + "px";
    const colW = Math.max(0, ...w.tabs.filter((t) => t.kind === "game").map((t) => chipWidth(t.entry)), ...closed.map((c) => chipWidth(c.entry))) - 12;
    const NAME_W = 7 * 13 + 6;
    m.style.width = 6 * 2 + 10 * 2 + 16 + 10 + colW + 10 + NAME_W + 10 + 64 + 6 + 14 + 2 + 20 + "px";
    for (const t of w.tabs) {
      const d = document.createElement("div");
      d.className = "item" + (t.id === w.cur ? " on" : "");
      const icon = t.kind === "game" ? `<img src="${ICON}">` : `<i class="pi">${S[PAGE_ICON[t.kind]]}</i>`;
      d.innerHTML = `${icon}<span class="e"></span><span class="n"></span><span class="st"></span><span class="cx" data-tip="关闭">${S.close}</span>`;
      q(d, ".e").textContent = t.kind === "game" ? t.entry : "";
      q(d, ".e").style.width = colW + "px";
      q(d, ".n").textContent = tabLabel(t);
      const mem = host.tabs ? t.mem || 0 : t.mem || (t.mem = 180 + t.id * 97 % 260);
      q(d, ".st").innerHTML = `<span class="mem">${t.kind === "game" && mem ? `${mem} MB` : ""}</span><i class="mute">${t.muted ? S.volOff : ""}</i>`;
      q(d, ".cx").onclick = (ev) => {
        ev.stopPropagation();
        removeTab(w, t);
        renderAll();
        fillTabList(w);
      };
      d.onclick = () => {
        w.cur = t.id;
        closeAll();
        render(w);
      };
      m.append(d);
    }
    if (closed.length) {
      {
        const h = document.createElement("div");
        h.className = "sh";
        h.textContent = "最近关闭";
        m.append(h);
      }
      for (const c of closed) {
        const d = document.createElement("div");
        d.className = "item closed";
        d.innerHTML = `<img src="${ICON}"><span class="e"></span><span class="n"></span><span class="st"><span class="mem"></span><i class="mute"></i></span><span class="cx" data-tip="忘记此账号">${S.close}</span>`;
        q(d, ".e").textContent = c.entry;
        q(d, ".e").style.width = colW + "px";
        q(d, ".n").textContent = c.nick || "未登录";
        q(d, ".mem").textContent = c.closedAt;
        q(d, ".cx").onclick = (ev) => {
          ev.stopPropagation();
          closed.splice(closed.indexOf(c), 1);
          host.closed?.forget(c);
          fillTabList(w);
        };
        d.onclick = () => {
          closed.splice(closed.indexOf(c), 1);
          closeAll();
          openTab(w, makeTab({ entry: c.entry, provider: c.provider, nick: c.nick, born: true }), void 0, { slot: c.slot, restored: true });
          render(w);
        };
        m.append(d);
      }
    }
  }
  const tip = document.createElement("div");
  tip.className = "tip";
  document.body.append(tip);
  let tipTimer = null;
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      tip.innerHTML = "<span></span>" + (el.dataset.key ? "<kbd></kbd>" : "");
      tip.firstChild.textContent = el.dataset.tip;
      if (el.dataset.key) tip.lastChild.textContent = el.dataset.key;
      const r = el.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + "px";
      tip.style.top = r.bottom + 6 + "px";
      tip.classList.add("in");
      setCover("tip", true);
    }, 500);
  });
  const hideTip = () => {
    clearTimeout(tipTimer);
    tip.classList.remove("in");
    setCover("tip", false);
  };
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest("[data-tip]")) hideTip();
  });
  document.addEventListener("pointerdown", hideTip);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu,.entry,.amenu,.more,.tlmenu,.tablist,.pmenu")) closeAll();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
  window.addEventListener("resize", renderAll);
  function command(name) {
    const w = wins[0];
    if (!w) return;
    const t = curTab(w);
    if (name === "newTab") {
      openTab(w, freshTab());
      render(w);
    } else if (name === "closeTab") {
      removeTab(w, t);
      closeAll();
      renderAll();
    } else if (name === "reload") {
      if (t.kind === "game") q(winEl(w), ".reload").click();
    } else if (name === "back") {
      if (t.kind === "game" && t.hist[0]) q(winEl(w), ".back").click();
    } else if (name === "fwd") {
      if (t.kind === "game" && t.hist[1]) q(winEl(w), ".fwd").click();
    } else if (name === "tabList") {
      if (hasList(w)) toggleTabList(w);
    } else if (name === "menu") q(winEl(w), ".more").click();
    else if (name === "fullscreen") host.window?.command("fullscreen");
    else if (name === "recorder") host.window?.command("recorder");
    else if (name === "pm" || name === "settings" || name === "update" || name === "about") {
      closeAll();
      openPage(w, name);
    } else if (name === "nextTab" || name === "prevTab") {
      const i = w.tabs.indexOf(t);
      w.cur = w.tabs[(i + (name === "nextTab" ? 1 : w.tabs.length - 1)) % w.tabs.length].id;
      closeAll();
      render(w);
    } else if (name === "closeWindow") closeWindow(w, "command");
  }
  function shortcutOf(e) {
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    if (c && e.shiftKey && e.altKey && e.code === "KeyR") return "recorder";
    if (c && e.shiftKey && k === "a") return "tabList";
    if (c && e.shiftKey && k === "m") return "pm";
    if (c && e.shiftKey && k === "s") return "settings";
    if (c && !e.shiftKey && k === "t") return "newTab";
    if (c && !e.shiftKey && k === "w") return "closeTab";
    if (c && !e.shiftKey && k === "r") return "reload";
    if (e.key === "F5") return "reload";
    if (c && k === "tab") return e.shiftKey ? "prevTab" : "nextTab";
    if (e.altKey && k === "f") return "menu";
    if (e.altKey && e.key === "ArrowLeft") return "back";
    if (e.altKey && e.key === "ArrowRight") return "fwd";
    if (e.key === "F11" && !document.body.classList.contains("mac")) return "fullscreen";
    if (document.body.classList.contains("mac") && e.ctrlKey && e.metaKey && k === "f") return "fullscreen";
    if (e.key === "Escape" && !c && document.body.classList.contains("full") && !document.querySelector(".scrim, .save, .menu:not([hidden]), .amenu:not([hidden]), .tlmenu:not([hidden])")) return "fullscreen";
    return null;
  }
  document.addEventListener("keydown", (e) => {
    const name = shortcutOf(e);
    if (!name) return;
    e.preventDefault();
    command(name);
  });
  const PAGE_TITLE = { pm: "账号", settings: "设置", update: "更新", about: "关于" };
  const PAGE_ICON = { pm: "person", settings: "sliders", update: "update", about: "info" };
  const PAGE_ORDER = ["pm", "settings", "update", "about"];
  function openPage(w, kind) {
    let t = w.tabs.find((x) => x.kind !== "game");
    if (!t) {
      t = makeTab({ kind, born: true });
      insertTab(w, t);
    }
    t.kind = kind;
    w.cur = t.id;
    render(w);
  }
  function renderPage(w, t) {
    const pg = q(winEl(w), ".pg");
    pg.textContent = "";
    pg.dataset.kind = t.kind;
    const nav = document.createElement("nav");
    nav.className = "pnav";
    for (const k of PAGE_ORDER) {
      const a = document.createElement("a");
      a.className = "nitem" + (k === t.kind ? " on" : "");
      a.innerHTML = `<i>${S[PAGE_ICON[k]]}</i><span></span>`;
      q(a, "span").textContent = PAGE_TITLE[k];
      a.onclick = () => {
        t.kind = k;
        render(w);
      };
      nav.append(a);
    }
    const left = document.createElement("div");
    left.className = "pcol l";
    left.append(nav);
    const body = document.createElement("div");
    body.className = "pbody";
    const right = document.createElement("div");
    right.className = "pcol r";
    pg.append(left, body, right);
    if (t.kind === "pm") renderAccounts(w, body);
    else if (t.kind === "settings") renderSettings(body);
    else if (t.kind === "update") renderUpdate(w, body);
    else if (t.kind === "about") renderAbout(body);
  }
  function pageHead(pg, title, desc) {
    const h = document.createElement("div");
    h.className = "phead";
    h.innerHTML = "<h1></h1><p></p>";
    q(h, "h1").textContent = title;
    q(h, "p").textContent = desc;
    if (!desc) q(h, "p").remove();
    pg.append(h);
  }
  function section(pg, title) {
    const s = document.createElement("section");
    s.className = "psec";
    const h = document.createElement("h2");
    h.textContent = title;
    s.append(h);
    pg.append(s);
    return s;
  }
  function settingRow(sec, title, desc, control) {
    const r = document.createElement("div");
    r.className = "prow";
    r.innerHTML = '<div class="l"><div class="t"></div><div class="d"></div></div><div class="r"></div>';
    q(r, ".t").textContent = title;
    q(r, ".d").textContent = desc;
    if (!desc) q(r, ".d").remove();
    q(r, ".r").append(control);
    sec.append(r);
    return r;
  }
  function toggle(on, onChange) {
    const s = document.createElement("div");
    s.className = "sw" + (on ? " on" : "");
    s.onclick = () => {
      s.classList.toggle("on");
      onChange?.(s.classList.contains("on"));
    };
    return s;
  }
  function segmented(options, index, onChange) {
    const s = document.createElement("div");
    s.className = "seg2";
    const thumb = document.createElement("i");
    thumb.className = "thumb";
    s.append(thumb);
    const place = (b) => {
      thumb.style.width = b.offsetWidth + "px";
      thumb.style.transform = `translateX(${b.offsetLeft - 2}px)`;
    };
    options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = o;
      b.className = i === index ? "on" : "";
      b.onclick = () => {
        if (b.className === "on") return;
        for (const x of s.querySelectorAll("button")) x.className = "";
        b.className = "on";
        place(b);
        onChange?.(i);
      };
      s.append(b);
    });
    requestAnimationFrame(() => {
      const on = s.querySelector("button.on");
      if (on) {
        thumb.style.transition = "none";
        place(on);
        requestAnimationFrame(() => {
          thumb.style.transition = "";
        });
      }
    });
    return s;
  }
  function button(label, primary = false) {
    const b = document.createElement("button");
    b.className = "tb" + (primary ? " primary" : "");
    b.textContent = label;
    return b;
  }
  function iconButton(icon, tipText) {
    const b = document.createElement("button");
    b.className = "ib s";
    b.innerHTML = icon;
    b.dataset.tip = tipText;
    b.onmousedown = (e) => e.preventDefault();
    return b;
  }
  function copyButton(text, what) {
    const b = iconButton("", "复制");
    b.classList.add("cp");
    b.innerHTML = `<span class="ic ic-copy">${S.copy}</span><span class="ic ic-check">${S.check}</span>`;
    b.onclick = (e) => {
      e.stopPropagation();
      if (b.classList.contains("done")) return;
      try {
        navigator.clipboard.writeText(text).catch(() => {
        });
      } catch (_) {
      }
      b.classList.add("done");
      b.dataset.tip = "已复制";
      toast(what === "pw" ? "已复制密码" : "已复制账号");
      setTimeout(() => {
        b.classList.remove("done");
        b.dataset.tip = "复制";
      }, 1500);
    };
    return b;
  }
  function collapse(el, done) {
    el.style.height = el.getBoundingClientRect().height + "px";
    el.getBoundingClientRect();
    el.classList.add("faded");
    setTimeout(() => {
      el.classList.add("gone");
      setTimeout(done, 210);
    }, 120);
  }
  function expand(el) {
    const h = el.getBoundingClientRect().height;
    el.style.transition = "none";
    el.classList.add("faded", "gone");
    el.style.height = "0px";
    el.getBoundingClientRect();
    el.style.transition = "";
    el.classList.remove("gone");
    el.style.height = h + "px";
    setTimeout(() => {
      el.classList.remove("faded");
      setTimeout(() => {
        el.style.height = "";
      }, 130);
    }, 200);
  }
  function toastHost() {
    const vp = document.querySelector(".win #viewport");
    let h = vp.querySelector(".toasts");
    if (!h) {
      h = document.createElement("div");
      h.className = "toasts";
      vp.append(h);
    }
    return h;
  }
  function toast(text, action, ms = action ? 6e3 : 2e3, key) {
    const host2 = toastHost();
    if (key) {
      const same = host2.querySelector(`.toast[data-key="${key}"]:not(.out)`);
      if (same) {
        q(same, "span").textContent = text;
        clearTimeout(same._timer);
        same._timer = setTimeout(() => dismissToast(same), ms);
        return;
      }
    }
    const t = document.createElement("div");
    t.className = "toast grow";
    if (key) t.dataset.key = key;
    t.innerHTML = '<div class="tc"><span></span></div>';
    q(t, "span").textContent = text;
    if (action) {
      const a = document.createElement("a");
      a.textContent = action.label;
      a.onclick = () => {
        action.onClick();
        dismissToast(t);
      };
      q(t, ".tc").append(a);
    }
    const others = host2.children.length > 0;
    host2.prepend(t);
    while (host2.children.length > 3) host2.lastElementChild.remove();
    setCover("toast", true);
    t.getBoundingClientRect();
    t.classList.remove("grow");
    setTimeout(() => t.classList.add("in"), others ? 200 : 0);
    t._timer = setTimeout(() => dismissToast(t), ms);
  }
  function dismissToast(t) {
    clearTimeout(t._timer);
    if (!t.isConnected || t.classList.contains("out")) return;
    t.classList.remove("in");
    t.classList.add("out");
    setTimeout(() => {
      t.classList.add("grow");
      setTimeout(() => {
        t.remove();
        if (!document.querySelector(".toasts .toast")) setCover("toast", false);
      }, 250);
    }, 160);
  }
  function hideToast() {
    for (const t of document.querySelectorAll(".win #viewport .toast")) dismissToast(t);
  }
  function dialog(o) {
    const vp = document.querySelector(".win #viewport");
    const prev = vp.querySelector(".scrim:not(.qr-scrim)");
    if (prev) {
      if (prev._dispose) prev._dispose();
      else prev.remove();
    }
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.innerHTML = '<div class="dlg" role="dialog"><h3></h3><p></p><label class="dchk" hidden><input type="checkbox"><span></span></label><textarea class="dnote" hidden rows="3"></textarea><div class="acts"><button class="tb"></button><button class="tb primary"></button></div></div>';
    q(scrim, "h3").textContent = o.title;
    q(scrim, "p").textContent = o.body;
    if (!o.body) q(scrim, "p").remove();
    if (o.content) q(scrim, ".dlg").insertBefore(o.content, q(scrim, ".dchk"));
    const cancel = q(scrim, ".acts .tb:not(.primary)"), ok = q(scrim, ".acts .primary");
    cancel.textContent = o.cancel;
    ok.textContent = o.ok;
    if (o.danger) ok.classList.add("danger");
    if (o.check) {
      const l = q(scrim, ".dchk");
      l.hidden = false;
      q(l, "span").textContent = o.check;
    }
    const note = q(scrim, ".dnote");
    if (o.note !== void 0) {
      note.hidden = false;
      note.placeholder = o.note;
    }
    const close = () => {
      scrim.classList.remove("in");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => {
        scrim.remove();
        if (!document.querySelector(".scrim:not(.qr-scrim)")) setCover("dialog", false);
      }, 160);
    };
    scrim._dispose = () => {
      document.removeEventListener("keydown", onKey);
      scrim.remove();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "Enter" && document.activeElement !== note) ok.click();
    };
    cancel.onclick = close;
    ok.onclick = () => {
      o.onOk(scrim.querySelector("input").checked, note.value.trim());
      if (!o.stay) close();
    };
    scrim.onclick = (e) => {
      if (e.target === scrim) close();
    };
    document.addEventListener("keydown", onKey);
    vp.append(scrim);
    setCover("dialog", true);
    const dlgEl = q(scrim, ".dlg");
    dlgEl.tabIndex = -1;
    requestAnimationFrame(() => {
      scrim.classList.add("in");
      (o.note !== void 0 ? note : dlgEl).focus();
    });
  }
  const qrCards = /* @__PURE__ */ new Map();
  let qrClosing = 0;
  function qrCoverSync() {
    setCover("qr", qrClosing > 0 || [...qrCards.values()].some((c) => !c.el.hidden));
  }
  function syncCardTabs(w) {
    for (const c of qrCards.values()) c.el.hidden = c.yielded || c.webOpen || c.tab !== null && c.tab !== w.cur;
    qrCoverSync();
    if (saveEl) {
      saveEl.hidden = saveTab !== null && saveTab !== w.cur;
      setCover("save", !saveEl.hidden);
    }
  }
  const winOfTab = (tab) => wins.find((x) => x.tabs.some((t) => t.id === tab)) || wins[0];
  document.addEventListener("keydown", onQrKey);
  const { qrSteps } = qrCopy;
  const qrCache = /* @__PURE__ */ new Map();
  function normalizeQr(src) {
    const key = src;
    if (qrCache.has(key)) return qrCache.get(key);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height);
          const decode = jsQR.default || jsQR;
          const r = decode(d.data, d.width, d.height);
          if (!r || !r.data) {
            resolve(src);
            return;
          }
          const utf8 = new TextEncoder().encode(r.data);
          if (utf8.length !== r.binaryData.length) {
            resolve(src);
            return;
          }
          const q2 = qrcodegen(0, "M");
          q2.addData(r.data);
          q2.make();
          const n = q2.getModuleCount(), quiet = 3, scale = Math.max(2, Math.floor(352 / (n + quiet * 2)));
          const size = (n + quiet * 2) * scale;
          const o = document.createElement("canvas");
          o.width = o.height = size;
          const og = o.getContext("2d");
          og.fillStyle = "#fff";
          og.fillRect(0, 0, size, size);
          og.fillStyle = "#000";
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q2.isDark(y, x)) og.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
          resolve(o.toDataURL("image/png"));
        } catch (_) {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
    qrCache.set(key, p);
    return p;
  }
  function qrHeader(el, provider) {
    if (el.dataset.provider === provider) return;
    el.dataset.provider = provider;
    q(el, "h3").textContent = provider.replace(/ ?扫码登录$/, "").replace(" - ", " · ");
    const bi = q(el, ".bi");
    const icon = BRAND_ICON[provider];
    if (icon) {
      bi.src = icon;
      bi.hidden = false;
    } else {
      bi.removeAttribute("src");
      bi.hidden = true;
    }
  }
  function closeQr(tabId) {
    const key = tabId ?? null;
    const card = qrCards.get(key);
    if (!card) return;
    qrCards.delete(key);
    const el = card.el;
    el.classList.add("closing");
    el.classList.remove("in");
    qrClosing += 1;
    setTimeout(() => {
      el.remove();
      qrClosing -= 1;
      qrCoverSync();
    }, 240);
  }
  function onQrKey(e) {
    if (e.key !== "Escape" || document.querySelector(".scrim:not(.qr-scrim)")) return;
    const card = [...qrCards.values()].find((c) => !c.el.hidden);
    if (!card) return;
    const cb = card.cancel;
    closeQr(card.tab ?? void 0);
    cb?.();
  }
  function updateQr(m, tabId) {
    const card = qrCards.get(tabId ?? null);
    if (!card) return;
    const el = card.el;
    card.yielded = m.stage === "yield";
    syncCardTabs(winOfTab(card.tab));
    if (card.yielded) return;
    qrHeader(el, m.provider);
    const live = () => qrCards.get(card.tab) === card;
    const img = q(el, ".qrbox img");
    const qrbox = img.parentElement;
    if (m.qr && img.dataset.src !== m.qr) {
      qrbox.classList.remove("has-qr");
      img.hidden = true;
      img.removeAttribute("src");
      img.dataset.src = m.qr;
      normalizeQr(m.qr).then((u) => {
        if (!live() || img.dataset.src !== m.qr) return;
        img.onload = () => {
          if (!live() || img.dataset.src !== m.qr) return;
          img.hidden = false;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (live() && img.dataset.src === m.qr) {
              qrbox.classList.add("has-qr");
              card.qrShown = (card.qrShown || 0) + 1;
              const wb = q(el, ".wl");
              if (!wb.hidden && card.qrShown > 1) armWeb(wb);
            }
          }));
        };
        img.src = u;
      });
    } else if (!m.qr && img.dataset.src) {
      delete img.dataset.src;
      qrbox.classList.remove("has-qr");
      setTimeout(() => {
        if (!img.dataset.src) {
          img.hidden = true;
          img.removeAttribute("src");
        }
      }, 240);
    }
    const sm = qrSteps(m);
    const lis = el.querySelectorAll(".steps li");
    sm.steps.forEach((t, i) => {
      const li = lis[i];
      const span = li.querySelector("span"), mark = li.querySelector("i");
      if (li.className !== sm.state[i]) li.className = sm.state[i];
      if (span.textContent !== t) span.textContent = t;
      const markHtml = sm.state[i] === "done" ? S.check : sm.state[i] === "busy" ? "" : String(i + 1);
      if (mark.dataset.v !== markHtml) {
        mark.dataset.v = markHtml;
        mark.innerHTML = markHtml;
      }
    });
    const inTile = TILE_STAGES.has(m.stage);
    const ovt = q(el, ".ovt");
    const ovtText = inTile && m.stage !== "error" ? sm.foot : "";
    if (ovt.textContent !== ovtText) ovt.textContent = ovtText;
    const why = q(el, ".rb span");
    const whyText = m.stage === "error" ? sm.foot || qrCopy.RETRY_ACTION : qrCopy.RETRY_ACTION;
    if (why.textContent !== whyText) why.textContent = whyText;
    const footText = inTile ? "" : sm.foot;
    const wl = q(el, ".wl");
    const showWeb = Boolean(card.web) && WEB_LOGIN_PROVIDERS.has(m.provider) && WEB_FALLBACK_STAGES.has(m.stage);
    if (wl.hidden === showWeb) {
      wl.hidden = !showWeb;
      if (showWeb) armWeb(wl);
    }
    const foot = q(el, ".qst");
    if (foot.textContent !== footText) {
      foot.getAnimations().forEach((a) => a.cancel());
      foot.textContent = footText;
      if (footText) foot.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "ease-out" });
    }
    q(el, ".dlg").dataset.stage = m.stage;
  }
  const WEB_LOGIN_PROVIDERS = /* @__PURE__ */ new Set(["Steam 扫码登录", "OPPO 扫码登录", "VIVO 扫码登录", "小米扫码登录", "WeGame - QQ", "华为扫码登录", "荣耀扫码登录"]);
  const WEB_FALLBACK_STAGES = /* @__PURE__ */ new Set(["loading", "retrying", "scan", "error"]);
  const TILE_STAGES = /* @__PURE__ */ new Set(["loading", "retrying", "error"]);
  const WEB_ARM_MS = 500;
  function armWeb(b) {
    clearTimeout(b._arm);
    b.classList.add("arming");
    b._arm = setTimeout(() => b.classList.remove("arming"), WEB_ARM_MS);
  }
  let webSheetEl = null;
  let webSheetOff = null;
  function webSheet(tabId, opts2, onRect, onClose) {
    const card = qrCards.get(tabId);
    if (!opts2) {
      webSheetOff?.();
      webSheetOff = null;
      const el2 = webSheetEl;
      webSheetEl = null;
      if (el2) {
        el2.classList.remove("in");
        setTimeout(() => el2.remove(), 160);
      }
      if (card) {
        card.webOpen = false;
        syncCardTabs(winOfTab(tabId));
      }
      setCover("web", false);
      return;
    }
    const vp = document.querySelector(".win #viewport");
    if (!vp) return;
    webSheetEl?.remove();
    webSheetOff?.();
    const el = document.createElement("div");
    el.className = "ws-scrim";
    el.innerHTML = `<div class="ws" role="dialog"><div class="hd"><img class="bi" alt="" hidden><span class="t"></span><span class="src">官方网页</span><span class="wsx" data-tip="关闭" data-key="Esc">${S.close}</span></div><div class="page"></div></div>`;
    q(el, ".t").textContent = opts2.title;
    if (opts2.width && opts2.width !== 440) q(el, ".ws").style.width = `${opts2.width + 6}px`;
    const icon = BRAND_ICON[opts2.provider || ""];
    const bi = q(el, ".bi");
    if (icon) {
      bi.src = icon;
      bi.hidden = false;
    }
    q(el, ".wsx").onclick = (e) => {
      e.stopPropagation();
      onClose?.();
    };
    vp.append(el);
    webSheetEl = el;
    if (card) {
      card.webOpen = true;
      syncCardTabs(winOfTab(tabId));
    }
    setCover("web", true);
    const report = () => {
      const r = q(el, ".page").getBoundingClientRect();
      if (r.height > 80) onRect?.({ x: r.left + 1, y: r.top + 1, w: r.width - 2, h: r.height - 2 });
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("resize", report);
    document.addEventListener("keydown", onKey);
    webSheetOff = () => {
      window.removeEventListener("resize", report);
      document.removeEventListener("keydown", onKey);
    };
    requestAnimationFrame(() => {
      el.classList.add("in");
      report();
    });
  }
  function qrPrompt(m, onCancel, onRetry, tabId, onWeb) {
    const vp = document.querySelector(".win #viewport");
    const key = tabId ?? null;
    const old = qrCards.get(key);
    if (old) {
      qrCards.delete(key);
      old.el.remove();
    }
    const scrim = document.createElement("div");
    scrim.className = "scrim center qr-scrim";
    scrim.innerHTML = `<div class="dlg qr" role="dialog"><div class="side"><div class="hd"><img class="bi" alt="" hidden><h3></h3></div><ol class="steps"><li><i></i><span></span></li><li><i></i><span></span></li><li><i></i><span></span></li></ol><button class="tb wl" type="button" hidden>${S.arrowUpRight}<span>使用网页登录</span></button><div class="qst"></div></div><div class="stage"><div class="qrbox"><img alt="" hidden></div><div class="ov"><i class="spin"></i><span class="dots" aria-hidden="true"><b></b><b></b><b></b></span><i class="ok">${S.check}</i><span class="ovt"></span></div><div class="retry"><button class="rb" type="button" aria-label="${qrCopy.RETRY_ACTION}">${S.refresh || S.update || ""}<span></span></button></div></div></div>`;
    const card = { el: scrim, tab: key, cancel: onCancel || null, retry: onRetry || null, yielded: false, web: onWeb || null, webOpen: false };
    q(scrim, ".wl").onclick = (e) => {
      e.stopPropagation();
      card.web?.();
    };
    const cancel = () => {
      const cb = card.cancel;
      closeQr(tabId);
      cb?.();
    };
    q(scrim, ".rb span").textContent = qrCopy.RETRY_ACTION;
    q(scrim, ".rb").onclick = (e) => {
      e.stopPropagation();
      if (q(scrim, ".dlg").dataset.stage === "error") card.retry?.();
    };
    scrim.onclick = (e) => {
      if (e.target === scrim) cancel();
    };
    qrCards.set(key, card);
    vp.insertBefore(scrim, vp.querySelector(".scrim:not(.qr-scrim)"));
    updateQr(m, tabId);
    const dlgEl = q(scrim, ".dlg");
    dlgEl.tabIndex = -1;
    requestAnimationFrame(() => {
      scrim.classList.add("in");
      dlgEl.focus();
    });
  }
  function confirmCloseWindow(n, onClose) {
    dialog({ title: "关闭窗口？", body: `有 ${n} 个标签页正在打开。`, check: "不再提示", cancel: "取消", ok: "关闭窗口", stay: Boolean(host.window), onOk: (checked) => {
      if (checked) {
        settings.confirmClose = false;
        host.settings?.set("confirmClose", false);
      }
      onClose();
    } });
  }
  function confirmLogoutAll() {
    dialog({ title: "退出所有账号？", body: "所有标签页将返回登录页。保存的账号不会被删除。", cancel: "取消", ok: "退出所有账号", onOk: () => {
      Promise.resolve(host.settings?.logoutAll()).then(() => toast("已退出所有账号"), (e) => toast(`退出失败：${e?.message || e}`));
    } });
  }
  let saveEl = null;
  let saveTab = null;
  function closeSave(result, done) {
    const el = saveEl;
    if (!el) return;
    saveEl = null;
    el.classList.remove("in");
    setTimeout(() => el.remove(), 170);
    setCover("save", false);
    if (result && done) done(result);
  }
  function savePrompt(o, done, tabId) {
    const vp = document.querySelector(".win #viewport");
    closeSave(null);
    saveTab = tabId ?? null;
    const el = document.createElement("div");
    el.className = "save";
    el.innerHTML = `<div class="hd"><h3></h3></div><div class="row"><label>账号</label><span class="fld"><input class="acc" type="text" spellcheck="false" autocomplete="off"></span></div><div class="row"><label>密码</label><span class="fld pw"><input class="pwd" type="password" autocomplete="off"></span></div><div class="acts"><button class="tb no" type="button"></button><button class="tb primary yes" type="button"></button></div>`;
    const acc = q(el, ".acc"), pwd = q(el, ".pwd"), no = q(el, ".no"), yes = q(el, ".yes");
    q(el, "h3").textContent = o.mode === "changed" ? "在此设备上更新密码？" : "在此设备上保存密码？";
    acc.value = o.account;
    pwd.value = o.password;
    no.textContent = "不保存";
    yes.textContent = o.mode === "changed" ? "更新密码" : "保存密码";
    const eye = iconButton(S.eye, "显示密码");
    eye.onclick = (e) => {
      e.stopPropagation();
      const show = pwd.type === "password";
      pwd.type = show ? "text" : "password";
      eye.innerHTML = show ? S.eyeOff : S.eye;
      eye.dataset.tip = show ? "隐藏密码" : "显示密码";
    };
    q(el, ".fld.pw").append(eye);
    const finish = (save) => closeSave({ save, account: acc.value.trim(), password: pwd.value }, done);
    no.onclick = () => finish(false);
    yes.onclick = () => finish(true);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el._done = done;
    saveEl = el;
    vp.append(el);
    setCover("save", true);
    requestAnimationFrame(() => el.classList.add("in"));
  }
  document.addEventListener("click", () => {
    if (saveEl) closeSave({ save: false, account: "", password: "" }, saveEl._done);
  });
  let acctBorn = null, acctEdit = null;
  const acctShow = /* @__PURE__ */ new Set();
  const accounts = host.data.accounts;
  function cell(cls, value, opts2 = {}) {
    const c = document.createElement("span");
    c.className = "cell " + cls + (opts2.dim ? " dim" : "") + (opts2.field ? " field" : "") + (opts2.editing ? " edit" : "");
    if (opts2.editing) {
      const inp = document.createElement("input");
      inp.className = "inline";
      inp.value = value;
      inp.type = "text";
      inp.spellcheck = false;
      c.append(inp);
      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        opts2.onCommit(inp.value);
      };
      const cancel = () => {
        if (done) return;
        done = true;
        opts2.onCancel();
      };
      inp.onkeydown = (ev) => {
        if (ev.key === "Enter") commit();
        else if (ev.key === "Escape") cancel();
      };
      inp.onblur = commit;
      requestAnimationFrame(() => {
        inp.focus();
        inp.select();
      });
    } else {
      const v = document.createElement("span");
      v.className = "v" + (opts2.secret && !opts2.shown ? " dots" : "");
      v.textContent = opts2.secret && !opts2.shown ? "•".repeat(value.length) : value;
      c.append(v);
      if (opts2.onEdit) {
        c.dataset.tip = "点击修改";
        c.onclick = () => opts2.onEdit();
      }
    }
    if (opts2.secret && opts2.onToggle) {
      const eye = iconButton(opts2.shown ? S.eyeOff : S.eye, opts2.shown ? "隐藏密码" : "显示密码");
      eye.onclick = (e) => {
        e.stopPropagation();
        opts2.onToggle();
      };
      c.append(eye);
    }
    if (opts2.copy !== void 0) c.append(copyButton(opts2.copy, opts2.secret ? "pw" : "acc"));
    return c;
  }
  function renderEmpty(w, pg) {
    const e = document.createElement("div");
    e.className = "pempty";
    e.innerHTML = "<p></p>";
    q(e, "p").textContent = "当前没有保存的账号";
    const b = settings.manager ? button("前往游戏登录页") : button("打开账号管理器");
    b.onclick = settings.manager ? () => {
      openTab(w, makeTab({ entry: "官服", born: true }));
      render(w);
    } : () => {
      openPage(w, "settings");
      const row = document.querySelector('.prow[data-key="manager"]');
      if (row) {
        row.classList.add("hl");
        row.scrollIntoView({ block: "center" });
        setTimeout(() => row.classList.remove("hl"), 2400);
      }
    };
    e.append(b);
    pg.append(e);
  }
  function renderAccounts(w, pg) {
    pageHead(pg, "账号", "保存在此电脑上的账号，登录时可直接选用");
    const rerender = () => renderPage(w, curTab(w));
    const groups = [...new Set(accounts.map((a) => a.entry))];
    if (!groups.length) renderEmpty(w, pg);
    if (accounts.length) queueMicrotask(() => {
      const s = document.createElement("section");
      s.className = "psec lone";
      pg.append(s);
      const clr = button("清除保存的账号");
      clr.onclick = () => dialog({ title: "清除保存的账号？", body: "只会清除保存在此电脑上的所有登录信息，不会删除游戏数据。", cancel: "取消", ok: "清除保存的账号", danger: true, onOk: () => {
        accounts.splice(0);
        host.accounts?.clear();
        toast("已清除保存的账号");
        rerender();
      } });
      settingRow(s, "清除此电脑上保存的所有账号和密码", "", clr);
    });
    for (const g of groups) {
      const sec = section(pg, g);
      for (const a of accounts.filter((x) => x.entry === g)) {
        const show = acctShow.has(a);
        const r = document.createElement("div");
        r.className = "arow";
        r.append(cell("c-nick", a.nick || "未命名", {}));
        if (a.via === "账号密码") {
          const ed = (key) => ({ editing: acctEdit?.a === a && acctEdit.key === key, onEdit: () => {
            acctEdit = { a, key };
            rerender();
          }, onCommit: (v) => {
            const nv = key === "account" ? v.trim() : v;
            if (nv && nv !== a[key]) {
              host.accounts?.update(a, key, nv);
              a[key] = nv;
            }
            acctEdit = null;
            rerender();
          }, onCancel: () => {
            acctEdit = null;
            rerender();
          } });
          r.append(cell("c-acc", a.account, { copy: a.account, field: true, ...ed("account") }));
          r.append(cell("c-pw", a.password, { copy: a.password, secret: true, shown: show, onToggle: () => {
            show ? acctShow.delete(a) : acctShow.add(a);
            rerender();
          }, field: true, ...ed("password") }));
        } else {
          r.append(cell("c-acc", a.via, { dim: true }));
          r.append(cell("c-pw", "", {}));
        }
        const last = document.createElement("span");
        last.className = "cell c-last";
        last.textContent = a.last;
        r.append(last);
        const ops = document.createElement("span");
        ops.className = "cell c-ops";
        const open = iconButton(S.arrowUpRight, "打开");
        open.classList.add("op");
        open.onclick = () => {
          openTab(w, makeTab({ entry: a.entry, nick: a.nick, born: true }), void 0, { account: a.account });
          render(w);
        };
        ops.append(open);
        const del = iconButton(S.trash, "删除");
        del.classList.add("op");
        del.onclick = () => {
          dialog({ title: `删除 ${a.nick || "未命名"} 的账号与密码？`, body: "只会删除保存在此电脑上的登录信息，不会删除游戏数据。", cancel: "取消", ok: "删除账号与密码", danger: true, onOk: () => {
            const lastInGroup = accounts.filter((x) => x.entry === a.entry).length === 1;
            collapse(lastInGroup ? sec : r, () => {
              accounts.splice(accounts.indexOf(a), 1);
              host.accounts?.remove(a);
              rerender();
              toast(`已删除 ${a.nick || "未命名"} 的账号与密码`);
            });
          } });
        };
        ops.append(del);
        r.append(ops);
        sec.append(r);
        if (acctBorn === a) {
          acctBorn = null;
          expand(accounts.filter((x) => x.entry === a.entry).length === 1 ? sec : r);
        }
      }
    }
  }
  function renderSettings(pg) {
    pageHead(pg, "设置", "更改会自动保存，立即生效");
    const saved = () => toast("已保存设置", void 0, 1600);
    const bind = (key) => (on) => {
      settings[key] = on;
      host.settings?.set(key, on);
      saved();
    };
    let s = section(pg, "启动");
    settingRow(s, "恢复上次打开的账号", "打开锦囊妙计客户端时，自动恢复上次关闭前打开的账号。", toggle(settings.restore, bind("restore")));
    s = section(pg, "标签页");
    settingRow(s, "关闭窗口前确认", "同时开着多个标签页时，关闭窗口会先询问。", toggle(settings.confirmClose, bind("confirmClose")));
    settingRow(s, "新标签页默认静音", "新打开的标签页默认不播放声音，可随时点击标签上的声音图标恢复。", toggle(settings.muteNew, bind("muteNew")));
    s = section(pg, "账号");
    settingRow(s, "启用账号管理器", "登录后询问是否保存账号和密码，保存过的账号可在登录页一键选用。", toggle(settings.manager, bind("manager"))).dataset.key = "manager";
    const out = button("退出所有账号");
    out.onclick = confirmLogoutAll;
    settingRow(s, "退出登录", "将所有已登录的标签页退回到初始登录页。已保存的账号和密码不会删除。", out);
    s = section(pg, "问题反馈");
    settingRow(s, "发送匿名使用统计", "包含功能使用次数与崩溃信息，用于改进锦囊妙计，提升游戏稳定性。不包含游戏内敏感信息。", toggle(settings.stats, bind("stats")));
    if (host.feedback) {
      const fb = button("上传日志并反馈");
      fb.onclick = () => dialog({ title: "上传日志并反馈", body: "将上传最近的运行日志（不含账号和密码）。留言写清遇到的问题和大致时间。", note: "遇到了什么问题，大约什么时候", cancel: "取消", ok: "上传", onOk: (_c, n) => {
        host.feedback.upload(n).then((r) => toast(`已上传，反馈编号 ${r.id}`, { label: "复制编号", onClick: () => {
          navigator.clipboard?.writeText(r.id).catch(() => {
          });
        } }, 8e3), (e) => toast(`上传失败：${e?.message || e}`));
      } });
      settingRow(s, "反馈问题", "上传最近的运行日志并留言，上传后会得到一个反馈编号，联系时报编号即可。", fb);
    }
  }
  const plugins = host.data.plugins;
  const KNOWN_NAMES = { "ddz-assist": "斗地主助手", daxiaochao: "三国杀打小抄一将成名" };
  function bump(v) {
    const a = v.split(".").map(Number);
    a[a.length - 1]++;
    return a.join(".");
  }
  const upds = host.data.upds;
  function renderUpdate(w, pg) {
    const rerender = () => renderPage(w, curTab(w));
    pageHead(pg, "更新", "有新版本时自动下载，下次进入游戏时生效");
    const list = document.createElement("div");
    list.className = "ulist";
    pg.append(list);
    for (const u of upds) {
      const st = document.createElement("div");
      st.className = "ustat " + u.state;
      st.innerHTML = '<span class="uicon"></span><div class="utext"><div class="t"></div><div class="d"></div></div><div class="uact"></div>';
      list.append(st);
      const icon = q(st, ".uicon"), t = q(st, ".t"), d = q(st, ".d"), act = q(st, ".uact");
      const startDownload = () => {
        u.state = "downloading";
        u.progress = 0;
        rerender();
        const tick = () => {
          u.progress = Math.min(100, u.progress + 9);
          if (u.progress < 100) {
            const row = [...document.querySelectorAll(".ustat")][upds.indexOf(u)];
            const bar = row?.querySelector(".bar i"), pct = row?.querySelector(".pct");
            if (bar) bar.style.width = u.progress + "%";
            if (pct) pct.textContent = u.progress + "%";
            setTimeout(tick, 120);
          } else {
            u.current = u.latest;
            u.state = "ready";
            rerender();
          }
        };
        setTimeout(tick, 120);
      };
      if (u.state === "latest") {
        icon.innerHTML = S.okCircle;
        t.textContent = `${u.name} 已是最新版本`;
        d.textContent = `${u.current} · 上次检查 ${u.checked}`;
        const b = button("检查更新");
        b.onclick = () => {
          if (host.updates) {
            host.updates.check(u);
            return;
          }
          u.checked = "刚刚";
          rerender();
        };
        act.append(b);
      } else if (u.state === "available") {
        icon.innerHTML = S.upCircle;
        t.textContent = `${u.name} 有可用更新`;
        d.textContent = `${u.current} → ${u.latest}`;
        const b = button("下载并安装", true);
        b.classList.add("ok");
        b.onclick = () => host.updates ? host.updates.download(u) : startDownload();
        act.append(b);
      } else if (u.state === "downloading") {
        icon.innerHTML = S.upCircle;
        t.textContent = `${u.name} 正在下载更新`;
        d.innerHTML = '<span class="bar"><i></i></span><span class="pct"></span>';
        q(d, ".bar i").style.width = u.progress + "%";
        q(d, ".pct").textContent = u.progress + "%";
      } else {
        icon.innerHTML = S.okCircle;
        t.textContent = `${u.name} 更新已完成`;
        if (u.restart) {
          d.textContent = `${u.current} · 重新启动后生效`;
          const b = button("重新启动", true);
          b.classList.add("ok");
          b.onclick = () => {
            if (host.updates) {
              host.updates.restart(u);
              return;
            }
            u.state = "latest";
            u.checked = "刚刚";
            rerender();
          };
          act.append(b);
        } else {
          d.textContent = `${u.current} · 下次进入游戏时生效`;
        }
      }
    }
    const sec = document.createElement("section");
    sec.className = "psec";
    sec.innerHTML = '<div class="sh"><h2></h2><div class="sa"></div></div>';
    pg.append(sec);
    q(sec, "h2").innerHTML = '已安装的插件<span class="cnt"></span>';
    q(sec, ".cnt").textContent = String(plugins.length);
    for (const p of plugins) {
      const row = document.createElement("div");
      row.className = "prow plug";
      row.innerHTML = `<span class="ic">${S.script}</span><div class="l"><div class="t"></div><div class="d"></div></div><div class="r"></div>`;
      q(row, ".t").textContent = p.name;
      const ver = document.createElement("code");
      ver.className = "ver";
      ver.textContent = p.version;
      q(row, ".t").append(ver);
      q(row, ".d").textContent = p.builtin ? p.note || "" : /^https?:/.test(p.source) ? `更新于 ${p.date}` : `来自文件 · ${p.date}`;
      q(row, ".r").append(toggle(p.enabled, (on) => {
        p.enabled = on;
        host.plugins?.setEnabled(p, on);
        toast(on ? `已启用 ${p.name}，下次进入游戏时生效` : `已停用 ${p.name}，下次进入游戏时生效`);
      }));
      const slot = document.createElement("span");
      slot.className = "slot";
      q(row, ".r").append(slot);
      const more = iconButton(S.kebab, "更多");
      more.classList.add("op");
      more.onclick = (e) => {
        e.stopPropagation();
        rowMenu(w, more, [
          [S.sync, "检查更新", () => {
            if (!host.plugins) {
              toast(`${p.name} 已是最新版本`);
              return;
            }
            host.plugins.check(p).then((r) => toast(r.updated ? `已更新 ${p.name} ${r.from} → ${r.version}，下次进入游戏时生效` : `${p.name} 已是最新版本`), (e2) => toast(`无法检查更新：${e2?.message || e2}`));
          }, !p.updateUrl],
          [S.trash, "卸载", () => dialog({ title: `卸载 ${p.name}？`, body: "将从此电脑移除该插件，不会影响游戏数据和保存的账号。", cancel: "取消", ok: "卸载插件", danger: true, onOk: () => {
            plugins.splice(plugins.indexOf(p), 1);
            host.plugins?.remove(p);
            rerender();
          } }), !!p.builtin]
        ]);
      };
      slot.append(more);
      sec.append(row);
    }
    const adv = section(pg, "高级");
    const inst = button("安装插件…");
    inst.onclick = () => installPluginDialog(rerender);
    settingRow(adv, "从 user.js 链接或本地文件手动安装", "", inst);
  }
  function rowMenu(w, anchor, items) {
    const wasOpen = anchor.classList.contains("open");
    closeAll();
    if (wasOpen) return;
    const el = winEl(w);
    let m = q(el, ".pmenu");
    if (!m) {
      m = document.createElement("div");
      m.className = "menu pmenu";
      el.append(m);
    }
    m.textContent = "";
    for (const [icon, label, fn, disabled] of items) {
      const it = document.createElement("div");
      it.className = "item" + (disabled ? " disabled" : "");
      it.innerHTML = `<i>${icon}</i><span></span>`;
      q(it, "span").textContent = label;
      if (!disabled) it.onclick = (ev) => {
        ev.stopPropagation();
        closeAll();
        fn();
      };
      m.append(it);
    }
    anchor.classList.add("open");
    const r = anchor.getBoundingClientRect(), wr = el.getBoundingClientRect();
    cancelLeave(m);
    m.hidden = false;
    m.style.left = r.right - 7 - wr.left - m.offsetWidth + "px";
    m.style.top = r.bottom - wr.top + 6 + "px";
  }
  function installPluginDialog(rerender) {
    const box = document.createElement("div");
    box.className = "manual wide";
    box.innerHTML = `<div class="pick"><button type="button" class="pk" data-tip="选择文件">${S.folder}</button><input type="text" placeholder="粘贴 user.js 链接，或从本机选择文件"></div>`;
    const input = q(box, "input");
    q(box, ".pk").onclick = () => {
      if (host.plugins?.pickFile) {
        host.plugins.pickFile().then((f) => {
          if (f) {
            input.value = f;
            input.focus();
          }
        });
        return;
      }
      input.value = "C:\\Users\\kiwi\\Downloads\\ddz-assist.user.js";
      input.focus();
    };
    dialog({ title: "安装插件", body: "插件会在游戏页面中运行，随时可以在插件列表里停用或删除。", content: box, cancel: "取消", ok: "安装", onOk: () => {
      const v = input.value.trim();
      if (!v) return;
      if (host.plugins) {
        host.plugins.install(v).then((r) => toast(r.updated ? `已更新 ${r.name} ${r.from} → ${r.version}，下次进入游戏时生效` : `已安装 ${r.name}，下次进入游戏时生效`), (e) => toast(`安装失败：${e?.message || e}`));
        return;
      }
      const id = v.replace(/^.*[\\/]/, "").replace(/\.user\.js$/i, "") || "plugin";
      const name = KNOWN_NAMES[id] || id;
      const fromUrl = /^https?:\/\//i.test(v);
      const existing = plugins.find((p) => p.id === id);
      if (existing) {
        const old = existing.version;
        existing.version = bump(existing.version);
        existing.source = fromUrl ? v : "文件";
        if (fromUrl) existing.updateUrl = v;
        existing.date = "刚刚";
        toast(`已更新 ${name} ${old} → ${existing.version}，下次进入游戏时生效`);
      } else {
        plugins.push({ id, name, version: "1.0.0", source: fromUrl ? v : "文件", updateUrl: fromUrl ? v : void 0, date: "刚刚", enabled: true });
        toast(`已安装 ${name}，下次进入游戏时生效`);
      }
      rerender();
    } });
  }
  function renderAbout(pg) {
    pageHead(pg, "关于", "锦囊妙计客户端");
    const list = document.createElement("div");
    list.className = "about";
    const items = [
      { icon: S.github, title: "GitHub 开源仓库", desc: "客户端源码与版本记录", btn: "打开 GitHub", url: "https://github.com/Clarrycy/jinnangmiaoji" },
      { icon: S.channel, title: "QQ 频道", desc: "玩家交流、更新公告与使用帮助", btn: "加入 QQ 频道", url: "https://pd.qq.com/s/476n0o4be" }
    ];
    for (const it of items) {
      const r = document.createElement("div");
      r.className = "arow2";
      r.innerHTML = `<span class="av">${it.img ? `<img src="${it.img}" alt="">` : it.icon}</span><div class="l"><div class="t"></div><div class="d"></div></div><div class="r"></div>`;
      q(r, ".t").textContent = it.title;
      q(r, ".d").textContent = it.desc;
      const b = button(it.btn);
      b.innerHTML = `<span></span>${S.arrowUpRight}`;
      q(b, "span").textContent = it.btn;
      b.onclick = () => host.openExternal(it.url);
      q(r, ".r").append(b);
      list.append(r);
    }
    pg.append(list);
  }
  const findTab = (id) => {
    for (const w of wins) {
      const t = w.tabs.find((x) => x.id === id);
      if (t) return { w, t };
    }
    return null;
  };
  function updateTab(id, patch) {
    const f = findTab(id);
    if (!f) return;
    Object.assign(f.t, patch);
    render(f.w);
  }
  function setData(kind, next) {
    const cur = host.data[kind];
    if (Array.isArray(cur)) cur.splice(0, cur.length, ...next);
    else Object.assign(cur, next);
    for (const w of wins) {
      const t = curTab(w);
      if (t && t.kind !== "game") renderPage(w, t);
    }
    if (kind === "closed") for (const w of wins) render(w);
  }
  const winState = { maximized: false, fullscreen: false };
  function setWindow(state) {
    if (state.maximized !== void 0) winState.maximized = Boolean(state.maximized);
    if (state.fullscreen !== void 0) {
      winState.fullscreen = Boolean(state.fullscreen);
      document.body.classList.toggle("full", winState.fullscreen);
    }
    if (state.maximized !== void 0 || state.fullscreen !== void 0) for (const w of wins) {
      const mx = q(winEl(w), ".caption .mx");
      const restore = winState.fullscreen || winState.maximized;
      mx.innerHTML = restore ? S.restore : S.max;
      mx.dataset.tip = winState.fullscreen ? "退出全屏" : winState.maximized ? "向下还原" : "最大化";
    }
    if (state.focused !== void 0) document.body.classList.toggle("inactive", !state.focused);
  }
  function setSize(width, height) {
    for (const w of wins) {
      const el = winEl(w);
      el.style.width = width + "px";
      el.style.height = height + "px";
    }
    renderAll();
  }
  const requestClose = () => {
    const w = wins[0];
    if (w) closeWindow(w, "close-request");
  };
  function adoptAt(info, x) {
    const w = wins[0];
    if (!w) return;
    const strip = q(winEl(w), ".tabs");
    const sr = strip.getBoundingClientRect();
    const L = layout(w, strip.clientWidth);
    const idx = Math.max(0, Math.min(w.tabs.length, Math.round((x - sr.left - L.leftGap - STRIP_PAD + w.scroll) / L.width)));
    if (info.kind && info.kind !== "game") {
      openTab(w, makeTab({ kind: info.kind, born: true }), idx);
      render(w);
      return;
    }
    openTab(w, makeTab({ entry: info.entry, provider: info.provider || null, nick: info.nick || "", muted: Boolean(info.muted), born: true }), idx, { slot: info.slot, adopt: true });
    render(w);
  }
  return { webSheet, wins, makeWin, makeTab, insertTab, openTab, removeTab, curTab, render, renderAll, openPage, toast, dialog, confirmCloseWindow, confirmLogoutAll, openTabMenu, openEntryMenu, toggleTabList, installPluginDialog, closeAll, command, updateTab, setData, setWindow, setSize, requestClose, savePrompt, closeSave, qrPrompt, updateQr, closeQr, adoptAt };
}
module.exports = mountChrome;
