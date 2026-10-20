// 由 src/core/popup-window.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const path = require("path");
const overlay_style_ = require("./overlay-style");
const { TOKENS, CARD_CSS, ICON_DATA } = overlay_style_;
const METRICS = Object.freeze({ width: 150, itemHeight: 26, pad: 3, padX: 10, radius: 6, itemRadius: 3, fontSize: 12, shadow: 0.1, gap: 2, subWidth: 160 });
const CARD_WIDTH = 340;
const SAVE_WIDTH = 300;
const CARD_MARGIN = 8;
const SHADOW_ROOM = 24;
const QR_CARD = Object.freeze({ width: 320, height: 320, qr: 200 });
const FOLDER = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const HEAD = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
    <style>${CARD_CSS}`;
function popupDocument() {
  const m = METRICS;
  return `${HEAD}
    body { position: relative; width: 100vw; height: 100vh; }
    .menu { position: absolute; width: ${m.width}px; background: ${TOKENS.surface}; border: 1px solid ${TOKENS.line}; border-radius: ${m.radius}px;
      box-shadow: 0 6px 18px rgba(0,0,0,${m.shadow}); padding: ${m.pad}px; box-sizing: border-box; font-size: ${m.fontSize}px; }
    #sub { width: ${m.subWidth}px; }
    #sub[hidden] { display: none; }
    .menu .item { justify-content: space-between; height: ${m.itemHeight}px; padding: 0 ${m.padX}px; border-radius: ${m.itemRadius}px; }
    .menu .item.sub.open { background: ${TOKENS.hover}; }
    .chk { width: 9px; height: 5px; border-left: 1.5px solid ${TOKENS.ink2}; border-bottom: 1.5px solid ${TOKENS.ink2}; transform: rotate(-45deg) translateY(-1px); }
    .item.sub::after { content: ""; width: 5px; height: 5px; border-right: 1.3px solid ${TOKENS.ink3}; border-top: 1.3px solid ${TOKENS.ink3}; transform: rotate(45deg); }
    .sep { border-top: 1px solid ${TOKENS.line}; margin: ${m.pad}px 6px; }
    </style></head><body><div class="menu" id="main"></div><div class="menu" id="sub" hidden></div></body></html>`;
}
function saveDocument() {
  return `${HEAD}
    body { width: 100vw; height: 100vh; position: relative; }
    .card { position: absolute; left: var(--x, 0px); top: 4px; width: ${SAVE_WIDTH}px; }
    </style></head><body><div class="card" id="card">
      <div class="row">${ICON_DATA ? `<img class="fav" src="${ICON_DATA}" alt="">` : ""}<h1 id="title">保存密码？</h1></div>
      <div class="row"><label>账号</label><input type="text" id="account" spellcheck="false"></div>
      <div class="row"><label>密码</label><div class="pw"><input type="password" id="password"><span class="icon-btn" id="eye">${EYE}</span></div></div>
      <div class="row actions"><button id="no" type="button">不保存</button><button id="yes" type="button" class="primary">保存</button></div>
    </div></body></html>`;
}
function qrDocument() {
  return `${HEAD}
    body { width: 100vw; height: 100vh; display: grid; place-items: center; background: rgba(0,0,0,.35); opacity: 0; transition: opacity .16s ease; }
    body.in { opacity: 1; }
    .card { width: ${QR_CARD.width}px; height: ${QR_CARD.height}px; align-items: center; gap: 10px; padding: 14px 20px; box-shadow: 0 16px 48px rgba(0,0,0,.25); transform: scale(.96); transition: transform .16s ease; }
    body.in .card { transform: scale(1); }
    h1 { flex: none; font-weight: 400; color: ${TOKENS.ink2}; }
    .frame { width: ${QR_CARD.qr + 16}px; height: ${QR_CARD.qr + 16}px; border: 1px solid ${TOKENS.line}; border-radius: 6px; display: grid; place-items: center; background: ${TOKENS.surface}; }
    img { width: ${QR_CARD.qr}px; height: ${QR_CARD.qr}px; image-rendering: pixelated; }
    img[hidden] { display: none; }
    #text { min-height: 2.6em; text-align: center; color: ${TOKENS.ink2}; white-space: pre-wrap; max-width: 280px; }
    </style></head><body><div class="card" id="card"><h1 id="title"></h1><div class="frame"><img id="qr" alt="" hidden></div><div id="text"></div></div></body></html>`;
}
function versionDocument() {
  return `${HEAD}
    body { width: 100vw; height: 100vh; position: relative; }
    .card { position: absolute; left: var(--x, 0px); top: 4px; width: ${CARD_WIDTH}px; padding: 0; gap: 0; }
    .block { padding: ${TOKENS.pad}px; display: flex; flex-direction: column; gap: ${TOKENS.gap}px; }
    .block + .block { border-top: 1px solid ${TOKENS.line}; }
    .vn { flex: 1; color: ${TOKENS.ink}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vd { color: ${TOKENS.accent}; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .vd.ok { color: ${TOKENS.ok}; } .vd.quiet { color: ${TOKENS.ink2}; }
    .row.note { color: ${TOKENS.ink2}; }
    .row.more { cursor: pointer; } .row.more:hover { color: ${TOKENS.ink}; }
    .pad { flex: 1; min-width: 0; height: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 9px; border: 1px solid transparent; border-radius: ${TOKENS.controlRadius}px; background: ${TOKENS.surface2}; }
    .padlist { background: ${TOKENS.surface2}; border-radius: ${TOKENS.controlRadius}px; padding: 4px 9px; }
    .padlist[hidden] { display: none; }
    .padlist .row .vn, .padlist .row .vd { color: ${TOKENS.ink3}; }
    .plus { position: relative; width: 14px; height: 14px; margin-left: auto; flex: none; transition: transform .2s; }
    .plus::before, .plus::after { content: ""; position: absolute; left: 50%; top: 50%; background: currentColor; transform: translate(-50%,-50%); }
    .plus::before { width: 10px; height: 1.4px; } .plus::after { width: 1.4px; height: 10px; }
    .plus.open { transform: rotate(45deg); }
    #status.busy { color: ${TOKENS.accent}; } #status.ok { color: ${TOKENS.ok}; }
    </style></head><body><div class="card" id="card">
      <div class="block">
        <div class="row"><h1>版本信息</h1></div>
        <div id="focus"></div>
        <div class="row note more" id="more"><span id="more-text"></span><span class="plus" id="plus"></span></div>
        <div id="list" class="padlist" hidden></div>
      </div>
      <div class="block">
        <div class="row"><h1>手动更新</h1></div>
        <div class="row"><div class="pw"><input type="text" id="url" placeholder="粘贴更新链接，或选择文件" spellcheck="false"><span class="icon-btn" id="file" title="选择文件">${FOLDER}</span></div><button id="go" type="button">导入</button></div>
        <div class="row note"><span id="status">等待输入链接…</span></div>
      </div>
    </div></body></html>`;
}
function popupSize(entryCount, providerCount) {
  const m = METRICS;
  const mainHeight = m.pad * 2 + (entryCount + 1) * m.itemHeight + m.pad * 2 + 1 + 2;
  const subHeight = m.pad * 2 + providerCount * m.itemHeight + 2;
  return { width: 40 + m.width + m.gap + m.subWidth, height: 40 + Math.max(mainHeight, mainHeight - m.itemHeight + subHeight) };
}
function createOverlays({ WebContentsView, ipcMain, win, titleHeight, log }) {
  const views = /* @__PURE__ */ new Map();
  const docs = { menu: popupDocument, save: saveDocument, qr: qrDocument, version: versionDocument };
  const SAVE_HEIGHT = 4 * TOKENS.rowHeight + 3 * TOKENS.gap + 2 * TOKENS.pad + 2 + 24;
  function ensure(kind) {
    if (views.has(kind)) return views.get(kind);
    const view = new WebContentsView({
      webPreferences: { transparent: true, contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, "overlay-preload.js") }
    });
    const record = { view, ready: false, pending: null, callback: null, shown: false, yielded: false };
    try {
      view.setBackgroundColor("#00000000");
    } catch (_) {
    }
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event) => event.preventDefault());
    view.webContents.once("did-finish-load", () => {
      record.ready = true;
      if (record.pending) {
        view.webContents.send("jnd-overlay-model", record.pending);
        record.pending = null;
      }
    });
    view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(docs[kind]())}`).catch((error) => log?.("overlay load failed", kind, error?.message || error));
    views.set(kind, record);
    return record;
  }
  function warm(kinds = Object.keys(docs)) {
    for (const kind of kinds) ensure(kind);
  }
  function hide(kind) {
    const record = views.get(kind);
    if (!record) return;
    record.yielded = false;
    if (!record.shown) {
      record.callback = null;
      return;
    }
    record.shown = false;
    record.callback = null;
    try {
      win.contentView.removeChildView(record.view);
    } catch (_) {
    }
  }
  function send(record, model) {
    if (record.ready) record.view.webContents.send("jnd-overlay-model", model);
    else record.pending = { ...record.pending || {}, ...model };
  }
  function show(kind, bounds, model, callback) {
    const record = ensure(kind);
    record.callback = callback;
    if (!record.shown) {
      win.contentView.addChildView(record.view);
      record.shown = true;
    }
    record.view.setBounds(bounds);
    send(record, model);
  }
  const full = () => {
    const { width, height } = win.getContentBounds();
    return { x: 0, y: titleHeight, width, height: Math.max(0, height - titleHeight) };
  };
  const whole = () => {
    const { width, height } = win.getContentBounds();
    return { x: 0, y: 0, width, height };
  };
  const saveBounds = () => {
    const { width } = win.getContentBounds();
    const viewWidth = SAVE_WIDTH + CARD_MARGIN + SHADOW_ROOM;
    return { x: width - viewWidth, y: titleHeight, width: viewWidth, height: SAVE_HEIGHT };
  };
  const cardX = (anchorRight) => {
    const { width } = win.getContentBounds();
    return Math.max(CARD_MARGIN, Math.min(width - CARD_WIDTH - CARD_MARGIN, Math.round(Number(anchorRight) || width - CARD_MARGIN) - CARD_WIDTH));
  };
  ipcMain.on("jnd-overlay-action", (event, action) => {
    for (const [kind, record] of views) {
      if (record.view.webContents !== event.sender) continue;
      const callback = record.callback;
      if (!action?.keep) hide(kind);
      if (action?.type !== "close" && typeof callback === "function") {
        try {
          callback(action);
        } catch (error) {
          log?.("overlay action failed", kind, error?.message || error);
        }
      }
    }
  });
  return Object.freeze({
    warm,
    openMenu(anchor, model, callback) {
      show("menu", whole(), { kind: "menu", anchor, ...model }, callback);
      try {
        views.get("menu").view.webContents.focus();
      } catch (_) {
      }
    },
    closeMenu: () => hide("menu"),
    isMenuOpen: () => Boolean(views.get("menu")?.shown),
    // 保存密码：右上角，只占卡片区域；卡片右沿距窗口边 8px，阴影余量留在左侧。
    openSave(model, callback) {
      show("save", saveBounds(), { kind: "save", x: SHADOW_ROOM, ...model }, callback);
    },
    closeSave: () => hide("save"),
    openQr(model, callback) {
      show("qr", full(), { kind: "qr", ...model }, callback);
    },
    updateQr(model) {
      const record = views.get("qr");
      if (record?.shown) send(record, { kind: "qr", ...model });
    },
    closeQr: () => hide("qr"),
    setQrYield(yielding) {
      const record = views.get("qr");
      if (!record) return;
      if (yielding && record.shown) {
        record.yielded = true;
        try {
          win.contentView.removeChildView(record.view);
        } catch (_) {
        }
        record.shown = false;
      } else if (!yielding && record.yielded) {
        record.yielded = false;
        win.contentView.addChildView(record.view);
        record.view.setBounds(full());
        record.shown = true;
      }
    },
    // 版本信息：全窗透明叠层（点空白关闭），卡片右沿对齐「版本」按钮。
    openVersion(model, callback, anchorRight) {
      show("version", full(), { kind: "version", x: cardX(anchorRight), ...model }, callback);
      try {
        views.get("version").view.webContents.focus();
      } catch (_) {
      }
    },
    updateVersion(model) {
      const record = views.get("version");
      if (record?.shown) send(record, { kind: "version", ...model });
    },
    isVersionOpen: () => Boolean(views.get("version")?.shown),
    closeVersion: () => hide("version"),
    // 游戏视图被提到最上后，正在显示的叠层要压回 chrome 之上
    raise() {
      for (const [, record] of views) if (record.shown) {
        try {
          win.contentView.addChildView(record.view);
        } catch (_) {
        }
      }
    },
    relayout() {
      for (const kind of ["qr", "version"]) {
        const record = views.get(kind);
        if (record?.shown) record.view.setBounds(full());
      }
      const menu = views.get("menu");
      if (menu?.shown) menu.view.setBounds(whole());
      const save = views.get("save");
      if (save?.shown) save.view.setBounds(saveBounds());
    },
    dispose() {
      for (const [kind] of views) hide(kind);
      for (const [, record] of views) {
        try {
          record.view.webContents.close();
        } catch (_) {
        }
      }
      views.clear();
    }
  });
}
module.exports = { createOverlays, popupDocument, saveDocument, qrDocument, versionDocument, popupSize, METRICS, QR_CARD, CARD_WIDTH, SAVE_WIDTH };
