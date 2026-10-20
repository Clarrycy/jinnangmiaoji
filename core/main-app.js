// 由 src/core/main-app.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const electron_ = require("electron");
const { app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, safeStorage, screen, shell, net, Notification } = electron_;
const fs = require("fs");
const path = require("path");
const https = require("https");
const attachMainInjector = require("./main-injector");
const node_update_host_ = require("./node-update-host");
const { createNodeUpdateHost, requestBuffer } = node_update_host_;
const component_update_host_ = require("./component-update-host");
const { createComponentUpdateHost } = component_update_host_;
const gm_request_host_ = require("./gm-request-host");
const { createGmRequestHost } = gm_request_host_;
const shell_update_host_ = require("./shell-update-host");
const { createShellUpdateHost } = shell_update_host_;
const credential_store_ = require("./credential-store");
const { createCredentialStore } = credential_store_;
const plugin_store_ = require("./plugin-store");
const { createPluginStore } = plugin_store_;
const components_ = require("./components");
const { COMPONENTS, parseUserScriptHeader } = components_;
const entries_ = require("./entries");
const { ENTRIES, PROVIDERS, entryById, providerById, matchesAnyEntry, TEST_ORIGIN } = entries_;
const game_shell_ = require("./game-shell");
const { TITLE_HEIGHT, FRAME, BAR_COLOR, frameDocument, chromeDocument, viewportBounds } = game_shell_;
const UpdateCore = require("./update-core");
const popup_window_ = require("./popup-window");
const { createOverlays } = popup_window_;
const stargaze_watch_ = require("./stargaze-watch");
const { createStargazeWatcher } = stargaze_watch_;
const stargaze_fetch_ = require("./stargaze-fetch");
const { createReportFetch } = stargaze_fetch_;
const stargaze_report_ = require("./stargaze-report");
const { normalizeSettings: normalizeStargazeSettings } = stargaze_report_;
const configuredSessions = /* @__PURE__ */ new WeakSet();
const windows = /* @__PURE__ */ new Map();
const occupiedSlots = /* @__PURE__ */ new Set();
let nextSlot = 1;
const crashHistory = /* @__PURE__ */ new WeakMap();
const recoveryTimers = /* @__PURE__ */ new Map();
let updateHost = null;
let componentHost = null;
let gmHost = null;
let shellUpdateHost = null;
let credentials = null;
let pluginStore = null;
let stargazeWatcher = null;
const stargazeNotifications = /* @__PURE__ */ new Set();
const OFFICIAL_LOGIN_PATHS = ["/login/index.html", "/login/x/index"];
const PROVIDER_CHIP = { qq: "WeGame", wx: "WeGame", bilibili: "哔哩哔哩", steam: "Steam", oppo: "OPPO", xiaomi: "小米", vivo: "VIVO", huawei: "华为", honor: "荣耀" };
const UI_DEFAULTS = Object.freeze({ restore: true, confirmClose: true, muteNew: false, manager: true, stats: true });
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
function agoText(ms) {
  if (!ms) return "";
  const d = Date.now() - ms;
  if (d < 6e4) return "刚刚";
  if (d < 36e5) return `${Math.floor(d / 6e4)} 分钟前`;
  if (d < 864e5) return `${Math.floor(d / 36e5)} 小时前`;
  const days = Math.floor(d / 864e5);
  return days === 1 ? "昨天" : `${days} 天前`;
}
function whenText(ms) {
  if (!ms) return "";
  const d = new Date(ms), now = /* @__PURE__ */ new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 864e5);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (days <= 0) return `今天 ${hm}`;
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
module.exports = function startMicroClient(config) {
  const channel = Object.freeze({ ...config });
  if (!/^[a-z0-9-]+$/.test(channel.id)) throw new Error("INVALID_MICRO_CHANNEL");
  if (process.env.JND_NO_SHARED_CACHE !== "1") {
    try {
      electron_.protocol.registerSchemesAsPrivileged([{ scheme: "jnd-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true } }]);
    } catch (_) {
    }
  }
  const profileSuffix = String(process.env.JND_MICRO_PROFILE || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const userData = path.join(app.getPath("appData"), process.env.JND_MICRO_TEST_ORIGIN ? "jinnangdai-micro-test" : profileSuffix ? `jinnangdai-micro-${profileSuffix}` : "jinnangdai-micro", channel.id);
  fs.mkdirSync(userData, { recursive: true });
  app.setPath("userData", userData);
  app.setPath("sessionData", userData);
  app.setAppUserModelId(`com.jinnangdai.micro.${channel.id}`);
  const logDirectory = (() => {
    try {
      return path.dirname(process.execPath);
    } catch (_) {
      return path.join(__dirname, "..", channel.id);
    }
  })();
  const displayVersion = (v) => `${channel.codename ? `${channel.codename} ` : ""}${v}`;
  const matchesGame = (url) => {
    try {
      if (channel.matchesUrl(url)) return true;
    } catch (_) {
    }
    return matchesAnyEntry(url);
  };
  let logBuffer = "";
  let logTimer = null;
  function flushLog(sync = false) {
    if (!logBuffer) return;
    const chunk = logBuffer;
    logBuffer = "";
    clearTimeout(logTimer);
    logTimer = null;
    for (const file of [path.join(logDirectory, channel.logName), path.join(app.getPath("userData"), channel.logName)]) {
      if (sync) {
        try {
          fs.appendFileSync(file, chunk);
        } catch (_) {
        }
      } else fs.appendFile(file, chunk, () => {
      });
    }
  }
  function log(...args) {
    logBuffer += `[${(/* @__PURE__ */ new Date()).toISOString()}] ${args.join(" ")}
`;
    const head = String(args[0] || "");
    if (head.startsWith("login-trace") || head === "will-navigate" || head === "did-start-loading" || head.startsWith("chrome-")) {
      flushLog(true);
      return;
    }
    if (!logTimer) logTimer = setTimeout(() => flushLog(false), 300);
  }
  const settingsFile = () => path.join(app.getPath("userData"), "shell-settings.json");
  function readSettings() {
    try {
      return JSON.parse(fs.readFileSync(settingsFile(), "utf8")) || {};
    } catch (_) {
      return {};
    }
  }
  function writeSettings(patch) {
    const next = { ...readSettings(), ...patch };
    try {
      fs.writeFileSync(settingsFile(), JSON.stringify(next));
    } catch (error) {
      log("settings write failed", error?.message || error);
    }
  }
  const uiSettings = () => ({ ...UI_DEFAULTS, ...readSettings().ui || {} });
  const stargazeSettings = () => normalizeStargazeSettings(readSettings().stargaze || {});
  const defaultStargazeDirectory = () => path.join(app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, ".."), "stargaze");
  const storedStargazeDirectory = () => {
    const saved = String(readSettings().stargaze?.directory || "").trim();
    return saved && path.isAbsolute(saved) ? path.resolve(saved) : "";
  };
  const preferredStargazeDirectory = () => storedStargazeDirectory() || defaultStargazeDirectory();
  function writeStargazeSettings(patch) {
    const saved = readSettings();
    const current = saved.stargaze && typeof saved.stargaze === "object" ? saved.stargaze : {};
    writeSettings({ stargaze: { ...current, ...patch } });
  }
  function prepareStargazeDirectory(target) {
    const raw = String(target || "").trim();
    if (!raw) throw new Error("报告保存目录为空");
    const resolved = path.resolve(raw);
    fs.mkdirSync(path.join(resolved, "reports"), { recursive: true });
    const probe = path.join(resolved, `.write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return resolved;
  }
  function defaultEntryId() {
    const saved = String(readSettings().lastEntry || "");
    if (entryById(saved)) return saved;
    return entryById(channel.id) ? channel.id : ENTRIES[0].id;
  }
  const entryByLabel = (label) => ENTRIES.find((e) => e.label === label) || null;
  const entryUrl = (entry) => TEST_ORIGIN ? `${TEST_ORIGIN}/login/x/index` : entry.entry;
  const ASSET_HOSTS = /(^|\.)(sanguosha\.com|yokaverse\.com|4399ytzg2\.com|4399iw\d*\.com|iwan4399\.com)$/i;
  const ASSET_EXT = /\.(?:js|css|json|png|jpe?g|webp|gif|svg|atlas|sgs|bin|wasm|mp3|ogg|wav|m4a|ttf|otf|woff2?|fnt|ani|sk|skel|plist|txt|lh|ls|lmat|lm|lani|lav|ltc|lsani|ktx|pvr|astc|mp4)$/i;
  const ASSET_TYPES = /* @__PURE__ */ new Set(["script", "image", "xhr", "fetch", "media", "font", "stylesheet", "other"]);
  const SHARED_CACHE = process.env.JND_NO_SHARED_CACHE !== "1";
  function isSharedAsset(url) {
    if (!ASSET_HOSTS.test(url.hostname)) return false;
    if (/\.php$|\/login\//i.test(url.pathname) || /api/i.test(url.hostname)) return false;
    return ASSET_EXT.test(url.pathname);
  }
  function installSharedAssetRedirect(session) {
    if (!SHARED_CACHE) return;
    session.webRequest.onBeforeRequest({ urls: ["https://*/*"] }, (details, callback) => {
      if (details.method !== "GET" || !ASSET_TYPES.has(String(details.resourceType))) {
        callback({});
        return;
      }
      let url = null;
      try {
        url = new URL(details.url);
      } catch (_) {
      }
      if (!url || !isSharedAsset(url)) {
        callback({});
        return;
      }
      callback({ redirectURL: `jnd-asset://shared/${encodeURIComponent(details.url)}` });
    });
  }
  function installSharedAssetScheme() {
    if (!SHARED_CACHE) return;
    const { protocol } = electron_;
    protocol.handle("jnd-asset", async (request) => {
      let original = "";
      try {
        original = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ""));
      } catch (_) {
      }
      if (!/^https:\/\//i.test(original)) return new Response("", { status: 400 });
      const headers = new Headers();
      for (const key of ["accept", "range", "referer", "origin"]) {
        const value = request.headers.get(key);
        if (value && /^[\x20-\x7e]*$/.test(value)) headers.set(key, value);
      }
      try {
        const upstream = await net.fetch(original, { method: "GET", headers, redirect: "follow" });
        const out = new Headers();
        for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control", "expires", "date"]) {
          const value = upstream.headers.get(key);
          if (value) out.set(key, value);
        }
        out.set("access-control-allow-origin", "*");
        return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
      } catch (error) {
        log("shared asset fetch failed", original.slice(0, 120), error?.message || error);
        return new Response("", { status: 502 });
      }
    });
  }
  function configureSession(session) {
    if (configuredSessions.has(session)) return;
    configuredSessions.add(session);
    installSharedAssetRedirect(session);
    try {
      const appToken = `${app.getName()}/${app.getVersion()}`;
      const ua = session.getUserAgent().replace(/\s+Electron\/\S+/i, "").split(` ${appToken}`).join("").replace(/\s+[A-Za-z0-9_.-]*jinnangdai[A-Za-z0-9_.-]*\/\S+/i, "").replace(/\s+\S*[^\x20-\x7e]\S*\/\S+/g, "");
      session.setUserAgent(ua);
    } catch (error) {
      log("user agent normalize failed", error?.message || error);
    }
    const loginApi = { urls: ["https://web-login-api.sanguosha.com/*", "https://web-login-apitest.sanguosha.com/*"] };
    const started = /* @__PURE__ */ new Map();
    session.webRequest.onBeforeRequest(loginApi, (details, callback) => {
      started.set(details.id, Date.now());
      callback({});
    });
    session.webRequest.onCompleted(loginApi, (details) => {
      const ms = Date.now() - (started.get(details.id) || Date.now());
      started.delete(details.id);
      log("login-api", details.method, details.url.split("?")[0], "status=", details.statusCode, "ms=", ms);
    });
    session.webRequest.onErrorOccurred(loginApi, (details) => {
      const ms = Date.now() - (started.get(details.id) || Date.now());
      started.delete(details.id);
      log("login-api ERROR", details.method, details.url.split("?")[0], details.error, "ms=", ms);
    });
    session.webRequest.onHeadersReceived((details, callback) => {
      let matched = false;
      try {
        matched = matchesGame(new URL(details.url));
      } catch (_) {
      }
      if (!matched) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      const headers = { ...details.responseHeaders || {} };
      for (const key of Object.keys(headers)) {
        if (/^content-security-policy(?:-report-only)?$/i.test(key)) delete headers[key];
      }
      callback({ responseHeaders: headers });
    });
  }
  function showErrorPage(contents, text) {
    const html = `<meta charset="utf-8"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1a1a1a;color:#fff;font:13px/1.7 'Segoe UI Variable Text','Segoe UI','Microsoft YaHei UI',sans-serif;text-align:center"><div><h2 style="margin:0 0 6px;font-size:14px;font-weight:400">页面没能加载</h2><p style="margin:0;color:rgba(255,255,255,.78)">${escapeHtml(text)}</p><p style="margin:14px 0 0;color:rgba(255,255,255,.45);font-size:11px">详情已写入程序目录的 ${escapeHtml(channel.logName)}</p></div></body>`;
    if (contents.isDestroyed()) return;
    contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error) => log("error page failed", error?.message || error));
  }
  function handleRendererGone(contents, details) {
    log("render-process-gone", JSON.stringify(details || {}));
    if (contents.isDestroyed()) return;
    clearTimeout(recoveryTimers.get(contents));
    recoveryTimers.delete(contents);
    const now = Date.now();
    const recent = (crashHistory.get(contents) || []).filter((timestamp) => now - timestamp < 5 * 60 * 1e3);
    recent.push(now);
    crashHistory.set(contents, recent);
    if (recent.length <= 2 && ["crashed", "oom", "killed", "launch-failed"].includes(String(details?.reason || ""))) {
      recoveryTimers.set(contents, setTimeout(() => {
        recoveryTimers.delete(contents);
        if (!contents.isDestroyed()) contents.reload();
      }, 1500));
      return;
    }
    showErrorPage(contents, `游戏渲染进程已退出：${String(details?.reason || "unknown")}`);
  }
  function windowOfChrome(sender) {
    for (const [, record] of windows) if (record.chromeContents === sender) return record;
    return null;
  }
  function tabOf(sender) {
    for (const [, record] of windows) for (const [, tab] of record.tabs) if (tab.contents === sender) return { record, tab };
    return null;
  }
  function chromeSend(record, channelName, ...args) {
    if (record.win.isDestroyed() || record.chromeContents.isDestroyed()) return;
    record.chromeContents.send(channelName, ...args);
  }
  const broadcast = (channelName, ...args) => {
    for (const [, record] of windows) chromeSend(record, channelName, ...args);
  };
  function layoutWindow(record) {
    const { win } = record;
    if (win.isDestroyed()) return;
    const { width, height } = win.getContentBounds();
    const chromeBounds = record.covered ? { x: 0, y: 0, width, height } : { x: 0, y: 0, width, height: TITLE_HEIGHT };
    const chromeKey = JSON.stringify(chromeBounds);
    if (record.chromeKey !== chromeKey) {
      record.chromeKey = chromeKey;
      record.chrome.setBounds(chromeBounds);
    }
    const bounds = viewportBounds(width, height);
    const viewKey = JSON.stringify(bounds);
    if (record.viewKey !== viewKey) {
      record.viewKey = viewKey;
      for (const [, tab] of record.tabs) if (!tab.contents.isDestroyed()) tab.view.setBounds(bounds);
    }
    record.overlays.relayout();
  }
  function raiseTab(record, tab) {
    const cv = record.win.contentView;
    try {
      cv.addChildView(tab.view);
      cv.addChildView(record.chrome);
      record.overlays.raise();
    } catch (error) {
      log("raise tab failed", error?.message || error);
    }
  }
  function pushTabState(record, tab, extra = {}) {
    const c = tab.contents;
    if (c.isDestroyed()) return;
    let canBack = false, canFwd = false;
    try {
      canBack = c.navigationHistory.canGoBack();
      canFwd = c.navigationHistory.canGoForward();
    } catch (_) {
      try {
        canBack = c.canGoBack();
        canFwd = c.canGoForward();
      } catch (_2) {
      }
    }
    const c2 = getContainer(tab.slot);
    let mem = 0;
    try {
      const pid = c.getOSProcessId();
      const m = app.getAppMetrics().find((x) => x.pid === pid);
      mem = m ? Math.round(Number(m.memory?.workingSetSize || 0) / 1024) : 0;
    } catch (_) {
    }
    chromeSend(record, "jnd-chrome-tab-state", tab.id, { loading: c.isLoading(), hist: [canBack ? 1 : 0, canFwd ? 1 : 0], audible: c.isCurrentlyAudible(), muted: c.isAudioMuted(), mem, nick: c2.nick, status: c2.status, entry: chipLabel(c2), provider: providerLabel(c2), ...extra });
  }
  function setTitle(record) {
    const tab = record.cur !== null ? record.tabs.get(record.cur) : null;
    const k = tab ? getContainer(tab.slot) : null;
    record.win.setTitle(`锦囊妙计 · 一将成名${k ? `  ${chipLabel(k)}${k.nick ? ` · ${k.nick}` : ""}` : ""}`);
  }
  function createTab(record, msg) {
    if (record.tabs.has(msg.id)) return;
    let slot = Number(msg.slot) || 0;
    if (!slot || occupiedSlots.has(slot)) {
      slot = nextSlot;
    }
    if (closedList().some((c) => c.slot === slot)) {
      writeSettings({ closedTabs: closedList().filter((c) => c.slot !== slot) });
      pushClosed();
    }
    if (slot >= nextSlot) {
      nextSlot = slot + 1;
      writeSettings({ nextSlot });
    }
    occupiedSlots.add(slot);
    const known = slot in containers ? containers[slot] : null;
    const entry = known && entryById(known.entryId) || entryByLabel(msg.entry) || entryById(defaultEntryId()) || ENTRIES[0];
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "..", channel.id, "preload.js"),
        contextIsolation: false,
        sandbox: false,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
        backgroundThrottling: true,
        // 分区按槽位：槽 1 就是旧版单窗口的会话，老用户的登录态不丢
        partition: `persist:jinnangdai-${channel.id}-${slot}`
      }
    });
    const contents = view.webContents;
    const providerId = known ? known.provider : msg.provider ? PROVIDERS.find((p) => p.label === msg.provider)?.id || "" : "";
    if (!known) setContainer(slot, { entryId: entry.id, provider: "", nick: "", uid: "", status: "none" });
    const tab = { id: msg.id, owner: record, view, contents, slot, entryId: entry.id, provider: providerId, pendingCredential: null, loginProvider: null, loginSeen: "", loginPrev: null, preferredAccount: String(msg.account || ""), lastAccount: "", muted: false, nick: "", uid: "" };
    record.tabs.set(msg.id, tab);
    const { win } = record;
    win.contentView.addChildView(view, 0);
    try {
      view.setBackgroundColor("#1a1a1a");
    } catch (_) {
    }
    if (process.env.JND_NO_VIEW_RADIUS !== "1") {
      try {
        if (typeof view.setBorderRadius === "function") view.setBorderRadius(FRAME.radius - 1);
      } catch (_) {
      }
    }
    {
      const { width, height } = win.getContentBounds();
      view.setBounds(viewportBounds(width, height));
    }
    if (uiSettings().muteNew) {
      contents.setAudioMuted(true);
      tab.muted = true;
    }
    configureSession(contents.session);
    attachMainInjector(contents, { matches: matchesGame, log });
    const tag = `slot=${slot} tab=${msg.id}`;
    const pushLater = () => {
      if (!contents.isDestroyed()) setImmediate(() => {
        if (!contents.isDestroyed()) pushTabState(tab.owner, tab);
      });
    };
    contents.on("did-start-loading", () => {
      log("did-start-loading", tag);
      pushLater();
    });
    contents.on("did-stop-loading", pushLater);
    contents.on("audio-state-changed", pushLater);
    contents.on("did-finish-load", () => {
      const url = contents.getURL();
      log("did-finish-load", tag, "url=", url);
      pushTabState(tab.owner, tab);
      let parsed = null;
      try {
        parsed = new URL(url);
      } catch (_) {
      }
      if (parsed && /^https?:$/.test(parsed.protocol) && !matchesGame(parsed)) {
        contents.insertCSS("html,body{overflow:hidden!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}").catch((error) => log("landing css failed", error?.message || error));
      }
    });
    contents.on("did-frame-navigate", (_event, url, code, text, isMainFrame) => {
      log("did-frame-navigate", tag, "url=", url, "code=", code, "text=", text, "mainFrame=", isMainFrame);
    });
    const onGameFrame = (url) => {
      let parsed = null;
      try {
        parsed = new URL(url);
      } catch (_) {
      }
      if (!parsed || !matchesGame(parsed)) return;
      if (tab.loginProvider) {
        tab.loginProvider = null;
        tab.loginPrev = null;
        qrClose(tab.owner, tab, "game-started");
      }
      if (!contents.isDestroyed()) contents.send("jnd-landing-game-started");
      settleCredential(tab.owner, tab);
    };
    contents.on("did-navigate", (_event, url) => {
      if (tab.pendingCredential) settleCredential(tab.owner, tab);
      let parsed = null;
      try {
        parsed = new URL(url);
      } catch (_) {
      }
      onGameFrame(url);
      pushTabState(tab.owner, tab);
    });
    contents.on("did-frame-navigate", (_event, url, _code, _text, isMainFrame) => {
      if (!isMainFrame) onGameFrame(url);
    });
    contents.on("console-message", (_event, level, message, line, sourceId) => {
      if (/JND-MICRO|锦囊袋|注入|统一登录器/i.test(message)) {
        log("CONSOLE", tag, "level=", level, "message=", message, "line=", line, "source=", sourceId);
      }
    });
    contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      log("did-fail-load", tag, "code=", code, "desc=", description, "url=", url, "mainFrame=", isMainFrame);
      if (isMainFrame && code !== -3) showErrorPage(contents, `加载 ${url} 失败：${description} (code ${code})`);
    });
    contents.on("render-process-gone", (_event, details) => handleRendererGone(contents, details));
    contents.on("page-title-updated", (event) => event.preventDefault());
    contents.on("unresponsive", () => log("unresponsive", tag));
    contents.on("certificate-error", (_event, url, error) => log("certificate-error", url, error));
    contents.on("will-navigate", (event, url) => {
      log("will-navigate", tag, "url=", url);
      const appNavigation = Boolean(channel.handleAppNavigation || entryById(tab.entryId)?.appNavigation);
      if (!appNavigation || !/^app:/i.test(url)) return;
      event.preventDefault();
      if (/^app:\/\/minimize/i.test(url)) tab.owner.win.minimize();
      else if (/^app:\/\/exitgame/i.test(url)) closeTab(tab.owner, tab.id, true);
      else if (/^app:\/\/delcache/i.test(url)) contents.session.clearCache().catch((error) => log("clearCache failed", error));
      else if (/^app:\/\/openurls\|/i.test(url)) {
        const target = url.slice(url.indexOf("|") + 1);
        if (/^https?:/i.test(target)) shell.openExternal(target).catch((error) => log("openExternal failed", error));
      } else if (/^app:\/\/loadgame:/i.test(url) && url.includes("|")) {
        const target = url.slice(url.indexOf("|") + 1);
        if (/^https?:/i.test(target)) contents.loadURL(target).catch((error) => log("loadgame failed", error));
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      log("window-open", tag, "url=", url);
      if (/\.(?:user|meta)\.js(?:[?#]|$)/i.test(url)) return { action: "deny" };
      if (/^https?:/i.test(url)) contents.loadURL(url).catch((error) => log("open-loadURL-threw", error));
      return { action: "deny" };
    });
    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      if (handleMacEditShortcut(contents, input, tab.owner.win)) {
        event.preventDefault();
        return;
      }
      const name = shortcutName(input);
      if (!name) return;
      event.preventDefault();
      chromeSend(tab.owner, "jnd-chrome-command", name);
    });
    if (providerId && !msg.restored) startProviderLogin(tab.owner, tab, providerId);
    else contents.loadURL(entryUrl(entry)).catch((error) => {
      log("loadURL-threw", error?.message || error);
      showErrorPage(contents, `无法加载入口：${error?.message || error}`);
    });
    if (process.env.JND_DEVTOOLS === "1") contents.openDevTools({ mode: "detach" });
    log("tab created", tag, "entry=", entry.id);
  }
  function handleMacEditShortcut(contents, input, win) {
    if (process.platform !== "darwin" || input.type !== "keyDown" || !input.meta || input.control || input.alt) return false;
    const k = String(input.key || "").toLowerCase();
    if (k === "c") contents.copy();
    else if (k === "v") contents.paste();
    else if (k === "x") contents.cut();
    else if (k === "a") contents.selectAll();
    else if (k === "z" && input.shift) contents.redo();
    else if (k === "z") contents.undo();
    else if (k === "q") {
      log("app.quit: Cmd+Q");
      app.quit();
    } else if (k === "m") win.minimize();
    else return false;
    return true;
  }
  function shortcutName(input) {
    const k = String(input.key || "").toLowerCase(), c = input.control || input.meta;
    if (c && input.shift && k === "a") return "tabList";
    if (c && input.shift && k === "m") return "pm";
    if (c && input.shift && k === "s") return "settings";
    if (c && !input.shift && k === "t") return "newTab";
    if (c && !input.shift && k === "w") return "closeTab";
    if (c && k === "tab") return input.shift ? "prevTab" : "nextTab";
    if (input.alt && k === "f") return "menu";
    return null;
  }
  const partitionName = (slot) => `persist:jinnangdai-${channel.id}-${slot}`;
  function wipeSlot(slot) {
    try {
      const ses = electron_.session.fromPartition(partitionName(slot));
      ses.clearStorageData().catch((error) => log("wipe slot failed", slot, error?.message || error));
    } catch (error) {
      log("wipe slot failed", slot, error?.message || error);
    }
    for (const key of [...gmStores.keys()]) if (key.startsWith(`slot-${slot}/`)) {
      gmStores.delete(key);
      clearTimeout(gmFlushTimers.get(key));
    }
    try {
      fs.rmSync(path.join(gmStoreDirectory(), `slot-${slot}`), { recursive: true, force: true });
    } catch (_) {
    }
    delete containers[slot];
    if (!containersTimer) containersTimer = setTimeout(flushContainers, 300);
    log("wiped slot", slot);
  }
  const containers = (() => {
    const raw = readSettings().containers;
    return raw && typeof raw === "object" ? raw : {};
  })();
  let containersTimer = null;
  const flushContainers = () => {
    clearTimeout(containersTimer);
    containersTimer = null;
    writeSettings({ containers });
  };
  function getContainer(slot) {
    return containers[slot] || (containers[slot] = { entryId: defaultEntryId(), provider: "", nick: "", uid: "", status: "none", seenAt: Date.now() });
  }
  function setContainer(slot, patch) {
    const c = getContainer(slot);
    Object.assign(c, patch, { seenAt: Date.now() });
    if (!containersTimer) containersTimer = setTimeout(flushContainers, 300);
    for (const [, record] of windows) for (const [, tab] of record.tabs) if (tab.slot === slot) {
      pushTabState(record, tab);
      setTitle(record);
    }
    pushClosed();
  }
  const chipLabel = (c) => c.provider ? PROVIDER_CHIP[c.provider] || entryById(c.entryId)?.label || ENTRIES[0].label : entryById(c.entryId)?.label || ENTRIES[0].label;
  const providerLabel = (c) => c.provider ? providerById(c.provider)?.label || null : null;
  const CLOSED_MAX = 12;
  const closedList = () => Array.isArray(readSettings().closedTabs) ? readSettings().closedTabs : [];
  function closedRows() {
    return closedList().map((c) => {
      const k = getContainer(c.slot);
      return { slot: c.slot, entry: chipLabel(k), provider: providerLabel(k), nick: k.nick, closedAt: agoText(c.closedAt) };
    });
  }
  const pushClosed = () => broadcast("jnd-chrome-data", "closed", closedRows());
  function rememberClosed(tab) {
    const list = closedList().filter((c) => c.slot !== tab.slot);
    list.unshift({ slot: tab.slot, closedAt: Date.now() });
    for (const old of list.splice(CLOSED_MAX)) wipeSlot(old.slot);
    writeSettings({ closedTabs: list });
    pushClosed();
  }
  function forgetClosed(slot) {
    const list = closedList();
    if (!list.some((c) => c.slot === slot)) return;
    writeSettings({ closedTabs: list.filter((c) => c.slot !== slot) });
    wipeSlot(slot);
    pushClosed();
  }
  function closeTab(record, id, fromGame = false, opts = {}) {
    const tab = record.tabs.get(id);
    if (!tab) return;
    record.tabs.delete(id);
    record.order = record.order.filter((x) => x !== id);
    clearTimeout(recoveryTimers.get(tab.contents));
    recoveryTimers.delete(tab.contents);
    try {
      record.win.contentView.removeChildView(tab.view);
    } catch (_) {
    }
    if (!tab.contents.isDestroyed()) tab.contents.close({ waitForBeforeUnload: false });
    occupiedSlots.delete(tab.slot);
    if (tab.loginProvider) qrClose(record, tab, "tab-closed");
    log("tab closed slot=", tab.slot, "tab=", id);
    if (opts.wipe) {
      const c = getContainer(tab.slot);
      if (c.nick || c.status !== "none") rememberClosed(tab);
      else wipeSlot(tab.slot);
    }
    if (fromGame) chromeSend(record, "jnd-chrome-command", "closeTab");
  }
  function activateTab(record, id, kind) {
    record.cur = id;
    record.curKind = kind;
    setTitle(record);
    const tab = record.tabs.get(id);
    if (!tab || kind !== "game" || tab.contents.isDestroyed()) return;
    const settle = () => {
      if (record.cur !== id || tab.contents.isDestroyed()) return;
      raiseTab(record, tab);
      record.active = tab;
      for (const [, other] of record.tabs) if (other !== tab && !other.contents.isDestroyed()) {
        try {
          other.view.setVisible(false);
        } catch (_) {
        }
      }
      tab.contents.focus();
      pushTabState(record, tab);
    };
    if (record.active === tab) {
      settle();
      return;
    }
    try {
      tab.view.setVisible(true);
    } catch (_) {
    }
    const painted = tab.contents.executeJavaScript("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))", true).catch(() => 0);
    Promise.race([painted, new Promise((r) => setTimeout(r, 150))]).then(settle, settle);
  }
  function detachTab(record, msg) {
    if (msg.kind && msg.kind !== "game") {
      const [width2, height2] = record.win.getSize();
      const target2 = createWindow({ pageKind: msg.kind, bounds: { x: Math.round(Number(msg.x) - Number(msg.grabX) - 102), y: Math.round(Number(msg.y) - TITLE_HEIGHT / 2), width: width2, height: height2 } });
      const next2 = windows.get(target2);
      if (next2) startFollow(next2, Number(msg.grabX) + 102, TITLE_HEIGHT / 2, true);
      return;
    }
    const tab = record.tabs.get(Number(msg.id));
    if (!tab || record.tabs.size === 0) return;
    record.tabs.delete(tab.id);
    record.order = record.order.filter((x2) => x2 !== tab.id);
    if (record.active === tab) record.active = null;
    try {
      record.win.contentView.removeChildView(tab.view);
    } catch (_) {
    }
    const [width, height] = record.win.getSize();
    const TAB_LEFT = 102;
    const x = Math.round(Number(msg.x) - Number(msg.grabX) - TAB_LEFT), y = Math.round(Number(msg.y) - TITLE_HEIGHT / 2);
    const target = createWindow({ adopt: tab, bounds: { x, y, width, height } });
    const next = windows.get(target);
    if (!next) return;
    startFollow(next, Number(msg.grabX) + TAB_LEFT, TITLE_HEIGHT / 2, true);
    log("tab detached slot=", tab.slot, "to new window");
  }
  function startFollow(record, offX, offY, merge) {
    stopFollow(record);
    const { win } = record;
    record.follow = setInterval(() => {
      if (win.isDestroyed()) {
        stopFollow(record);
        return;
      }
      const p = screen.getCursorScreenPoint();
      win.setPosition(Math.round(p.x - offX), Math.round(p.y - offY));
      if (!merge || !(record.tabs.size === 1 || record.tabs.size === 0 && record.pageKind)) return;
      for (const [, other] of windows) {
        if (other === record || other.win.isDestroyed() || !other.ready) continue;
        const b = other.win.getContentBounds();
        if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y - 8 && p.y <= b.y + TITLE_HEIGHT + 8) {
          mergeInto(record, other, p.x - b.x);
          return;
        }
      }
    }, 16);
    setTimeout(() => stopFollow(record), 2e4);
  }
  function stopFollow(record) {
    if (record.follow) {
      clearInterval(record.follow);
      record.follow = null;
    }
  }
  function mergeInto(src, target, localX) {
    stopFollow(src);
    if (src.tabs.size === 0 && src.pageKind) {
      chromeSend(target, "jnd-chrome-adopt", { kind: src.pageKind, x: localX });
      src.merged = true;
      src.closing = true;
      try {
        target.win.focus();
      } catch (_) {
      }
      log("win.close: page merged");
      try {
        src.win.hide();
      } catch (_) {
      }
      src.win.close();
      return;
    }
    const tab = [...src.tabs.values()][0];
    if (!tab) return;
    src.tabs.delete(tab.id);
    src.order = [];
    src.active = null;
    src.merged = true;
    try {
      src.win.contentView.removeChildView(tab.view);
    } catch (_) {
    }
    target.pendingAdopt = tab;
    {
      const k = getContainer(tab.slot);
      chromeSend(target, "jnd-chrome-adopt", { entry: chipLabel(k), provider: providerLabel(k), slot: tab.slot, nick: k.nick, muted: tab.muted, x: localX });
    }
    try {
      target.win.focus();
    } catch (_) {
    }
    src.closing = true;
    log("win.close: merged into another window");
    try {
      src.win.hide();
    } catch (_) {
    }
    src.win.close();
    log("tab merged slot=", tab.slot, "into another window");
  }
  function adoptTab(record, id) {
    const tab = record.pendingAdopt;
    record.pendingAdopt = null;
    if (!tab) return false;
    tab.id = id;
    tab.owner = record;
    record.tabs.set(id, tab);
    record.order.push(id);
    record.win.contentView.addChildView(tab.view, 0);
    const { width, height } = record.win.getContentBounds();
    tab.view.setBounds(viewportBounds(width, height));
    try {
      tab.view.setVisible(true);
    } catch (_) {
    }
    pushTabState(record, tab);
    return true;
  }
  async function logoutSlot(tab) {
    try {
      await tab.contents.session.clearStorageData();
    } catch (error) {
      log("logout slot clearStorageData failed", tab.slot, error?.message || error);
    }
    for (const key of [...gmStores.keys()]) if (key.startsWith(`slot-${tab.slot}/`)) {
      gmStores.delete(key);
      clearTimeout(gmFlushTimers.get(key));
    }
    try {
      fs.rmSync(path.join(gmStoreDirectory(), `slot-${tab.slot}`), { recursive: true, force: true });
    } catch (_) {
    }
    log("login-trace logout slot=", tab.slot);
  }
  function switchEntry(record, tab, entryId, opts = {}) {
    const entry = entryById(entryId);
    if (!entry || tab.contents.isDestroyed()) return;
    const from = `${tab.entryId}${tab.provider ? "+" + tab.provider : ""}`;
    tab.entryId = entry.id;
    tab.provider = "";
    setContainer(tab.slot, { entryId: entry.id, provider: "", nick: "", uid: "", status: "none" });
    tab.pendingCredential = null;
    if (tab.loginProvider) {
      tab.loginProvider = null;
      qrClose(record, tab, "switch-entry");
    }
    writeSettings({ lastEntry: entry.id, guideDone: true });
    setTitle(record);
    log("login-trace switch entry slot=", tab.slot, "from=", from, "to=", entry.id, "logout=", Boolean(opts.logout), entry.verified ? "" : "(unverified)");
    const go = () => tab.contents.loadURL(entryUrl(entry)).catch((error) => showErrorPage(tab.contents, `无法加载入口：${error?.message || error}`));
    if (opts.logout) logoutSlot(tab).then(go);
    else go();
  }
  function qrOpen(record, tab, provider) {
    tab.loginSeen = "loading";
    chromeSend(record, "jnd-chrome-qr", { action: "open", id: tab.id, provider: provider.label, stage: "loading", qr: "", text: "" });
    log("login-trace qr open slot=", tab.slot, "provider=", provider.id);
  }
  function qrClose(record, tab, reason) {
    chromeSend(record, "jnd-chrome-qr", { action: "close", id: tab.id });
    log("login-trace qr close slot=", tab.slot, "reason=", reason);
  }
  function qrStage(tab, state) {
    const stage = String(state?.stage || "");
    if (/captcha|identify/i.test(stage)) return "yield";
    if (state?.error) return "error";
    if (stage === "waiting_confirmation") return "confirm";
    if (state?.qr) return "scan";
    if (tab.loginSeen === "scan" || tab.loginSeen === "confirm" || tab.loginSeen === "exchanging") return "exchanging";
    return "loading";
  }
  function startProviderLogin(record, tab, providerId, opts = {}) {
    const provider = providerById(providerId);
    if (!provider || tab.contents.isDestroyed()) return;
    if (tab.loginProvider === provider.id) {
      log("login-trace provider re-pick ignored slot=", tab.slot, provider.id);
      return;
    }
    const k = getContainer(tab.slot);
    if (!tab.loginPrev) tab.loginPrev = { entryId: k.entryId, provider: k.provider };
    tab.loginProvider = provider.id;
    tab.loginSeen = "";
    setContainer(tab.slot, { entryId: "guanfu", provider: provider.id, nick: "", uid: "", status: "none" });
    log("login-trace provider pick slot=", tab.slot, "provider=", provider.id, "logout=", Boolean(opts.logout));
    const contents = tab.contents;
    const onLoginPage = () => {
      try {
        const url = new URL(contents.getURL());
        return (url.origin === "https://web.sanguosha.com" || TEST_ORIGIN && url.origin === TEST_ORIGIN) && OFFICIAL_LOGIN_PATHS.includes(url.pathname);
      } catch (_) {
        return false;
      }
    };
    const begin = () => {
      if (contents.isDestroyed() || tab.loginProvider !== provider.id) return;
      qrOpen(record, tab, provider);
      contents.send("jnd-login-start", provider.id);
    };
    const official = entryById("guanfu");
    if (tab.entryId !== official.id) {
      tab.entryId = official.id;
      setTitle(record);
    }
    if (opts.logout) {
      logoutSlot(tab).then(() => {
        contents.once("did-finish-load", () => setTimeout(begin, 300));
        contents.loadURL(entryUrl(official)).catch((error) => showErrorPage(contents, `无法加载入口：${error?.message || error}`));
      });
      return;
    }
    if (onLoginPage()) {
      begin();
      return;
    }
    contents.once("did-finish-load", () => setTimeout(begin, 300));
    contents.loadURL(entryUrl(official)).catch((error) => showErrorPage(contents, `无法加载入口：${error?.message || error}`));
  }
  function cancelProviderLogin(record, tab, reason) {
    if (!tab.loginProvider) return;
    tab.loginProvider = null;
    qrClose(record, tab, reason);
    if (!tab.contents.isDestroyed()) tab.contents.send("jnd-login-cancel");
    const prev = tab.loginPrev;
    tab.loginPrev = null;
    if (prev) setContainer(tab.slot, { entryId: prev.entryId, provider: prev.provider, status: "none", nick: "", uid: "" });
    log("login-trace cancel slot=", tab.slot, "reason=", reason, "restore=", JSON.stringify(prev));
  }
  function settleCredential(record, tab) {
    const pending = tab.pendingCredential;
    if (!pending) return;
    tab.pendingCredential = null;
    if (!uiSettings().manager) return;
    if (Date.now() - pending.at > 12e4) return;
    const mode = credentials.compare(pending.entryId, pending.account, pending.password);
    if (!mode) {
      credentials.touch(pending.entryId, pending.account);
      pushAccounts();
      return;
    }
    log("credential prompt for entry", pending.entryId, mode);
    chromeSend(record, "jnd-chrome-save-prompt", { id: tab.id, entryId: pending.entryId, account: pending.account, password: pending.password, mode });
  }
  function accountRows() {
    const rows = [];
    for (const entry of ENTRIES) {
      for (const item of credentials.list(entry.id)) rows.push({ entry: entry.label, nick: String(item.nick || ""), uid: entry.id, account: item.account, password: item.password, via: "账号密码", last: whenText(item.lastUsedAt) });
    }
    return rows;
  }
  const pushAccounts = () => broadcast("jnd-chrome-data", "accounts", accountRows());
  function updateRows() {
    const comp = componentHost.getState(), shellInfo = comp.shell, shellSt = shellUpdateHost.getState(), rt = updateHost.getState();
    const checkedAt = Math.max(Number(comp.checkedAt) || 0, Number(rt.checkedAt) || 0);
    const checked = comp.checkError || rt.checkError ? "失败，无法连接更新服务器" : checkedAt ? whenText(checkedAt) : "尚未检查";
    const newer = (latest, current) => {
      try {
        return Boolean(latest) && UpdateCore.compareVersions(latest, current) > 0;
      } catch (_) {
        return false;
      }
    };
    const client = { name: "客户端", current: displayVersion(shellInfo.current), latest: displayVersion(shellInfo.latest || shellInfo.current), state: "latest", progress: 0, checked, restart: true };
    if (shellSt.phase === "ready") {
      client.state = "ready";
      client.current = displayVersion(shellSt.version || shellInfo.latest);
    } else if (shellSt.phase === "downloading") {
      client.state = "downloading";
      client.progress = Number(shellSt.progress) || 0;
    } else if (shellInfo.outdated && shellInfo.asar && newer(shellInfo.latest, shellInfo.current)) client.state = "available";
    const jnd = { name: "锦囊妙计", current: rt.currentVersion, latest: rt.targetVersion || rt.currentVersion, state: "latest", progress: 0, checked, restart: false };
    const rtNewer = newer(rt.targetVersion, rt.currentVersion);
    if (rt.phase === "ready" && rtNewer) {
      jnd.state = "ready";
      jnd.current = rt.targetVersion;
    } else if (["downloading", "verifying", "caching"].includes(rt.phase)) {
      jnd.state = "downloading";
      jnd.progress = Number(rt.progress) || 0;
    } else if (rt.phase === "available" && rtNewer) jnd.state = "available";
    return [client, jnd];
  }
  const pushUpds = () => broadcast("jnd-chrome-data", "upds", updateRows());
  const stargazeState = () => stargazeWatcher?.getState() || null;
  async function openStargazeReport(kind) {
    if (!stargazeWatcher) throw new Error("自动观星尚未启动");
    if (!["activity", "generals"].includes(String(kind))) throw new Error("未知的观星报告类型");
    const delivery = stargazeSettings().delivery;
    if (delivery === "online") {
      await shell.openExternal(stargazeWatcher.onlineReportUrl(kind));
      return;
    }
    const file = stargazeWatcher.localReportPath(kind);
    if (!fs.existsSync(file)) throw new Error("本地报告尚未生成，请先检查一次");
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
  }
  async function openStargazeFolder() {
    const target = stargazeWatcher?.getState().directory || preferredStargazeDirectory();
    fs.mkdirSync(target, { recursive: true });
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  }
  function notifyStargazeUpdates(updates) {
    const current = stargazeSettings();
    for (const update of updates || []) {
      if (!current.notify || !Notification.isSupported()) continue;
      try {
        const notification = new Notification({
          title: `${update.label}报告已更新`,
          body: String(update.report?.summary || update.report?.title || "点击查看最新报告")
        });
        notification.on("click", () => {
          void openStargazeReport(update.kind).catch((error) => log("stargaze notification open failed", error?.message || error));
        });
        notification.on("close", () => stargazeNotifications.delete(notification));
        stargazeNotifications.add(notification);
        notification.show();
      } catch (error) {
        log("stargaze notification failed", error?.message || error);
      }
    }
    if (updates?.length) {
      broadcast("jnd-chrome-stargaze-update", {
        delivery: current.delivery,
        items: updates.map((update) => ({
          kind: update.kind,
          label: update.label,
          title: update.report?.title || "",
          summary: update.report?.summary || "",
          reportDate: update.report?.reportDate || ""
        }))
      });
    }
  }
  function pluginRows() {
    const rows = [];
    const removed = new Set(readSettings().removedPlugins || []);
    const disabled = new Set(readSettings().disabledPlugins || []);
    const xc = componentHost.getStartupRecords()["daxiaochao"];
    if (xc && !removed.has("daxiaochao")) {
      const header = parseUserScriptHeader(xc.code || "");
      let date = whenText(Number(xc.cachedAt) || 0);
      if (!date) {
        try {
          date = whenText(fs.statSync(path.join(__dirname, "..", channel.id, "payload", "daxiaochao.user.js")).mtimeMs);
        } catch (_) {
          date = "";
        }
      }
      rows.push({ id: "daxiaochao", name: header.name || "小抄", version: componentHost.getState().components.daxiaochao?.current || xc.version, source: "https://sh-sgs.net/script/micro/", updateUrl: "manifest", date, enabled: !disabled.has("daxiaochao") });
    }
    for (const m of pluginStore.list()) rows.push({ id: m.id, name: m.name, version: m.version, source: m.source, updateUrl: m.updateUrl || void 0, date: whenText(m.updatedAt), enabled: m.enabled });
    return rows;
  }
  const pushPlugins = () => broadcast("jnd-chrome-data", "plugins", pluginRows());
  function createWindow(options = {}) {
    const iconPath = path.join(__dirname, "..", channel.id, "build", "icon.ico");
    const iconPng = path.join(__dirname, "icon-256.png");
    log("createWindow");
    const workArea = screen.getPrimaryDisplay().workAreaSize;
    const saved = readSettings().windowBounds;
    const fitsSaved = saved && Number.isFinite(saved.width) && Number.isFinite(saved.height) && saved.width >= 960 && saved.height >= 600 + TITLE_HEIGHT && saved.width <= workArea.width && saved.height <= workArea.height;
    const defaultWidth = Math.min(1600, workArea.width);
    const LANDING_HEIGHT = 900;
    const defaultHeight = Math.min(LANDING_HEIGHT + TITLE_HEIGHT + FRAME.top + FRAME.bottom + 2, workArea.height);
    const win = new BrowserWindow({
      width: options.bounds ? options.bounds.width : fitsSaved ? saved.width : defaultWidth,
      height: options.bounds ? options.bounds.height : fitsSaved ? saved.height : defaultHeight,
      ...options.bounds ? { x: options.bounds.x, y: options.bounds.y } : fitsSaved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? { x: saved.x, y: saved.y } : {},
      minWidth: 960,
      minHeight: 600 + TITLE_HEIGHT,
      title: "锦囊妙计 · 一将成名",
      icon: iconPath,
      frame: false,
      // 标题栏连同右上三键都由 chrome 视图自绘
      autoHideMenuBar: true,
      show: true,
      backgroundColor: BAR_COLOR,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    const chrome = new WebContentsView({
      webPreferences: { transparent: true, contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, "shell-preload.js") }
    });
    try {
      chrome.setBackgroundColor("#00000000");
    } catch (_) {
    }
    const overlays = createOverlays({ WebContentsView, ipcMain, win, titleHeight: TITLE_HEIGHT, log });
    const record = { win, chrome, chromeContents: chrome.webContents, tabs: /* @__PURE__ */ new Map(), order: [], cur: null, curKind: "game", overlays, covered: false, closing: false, ready: false, pendingAdopt: options.adopt || null, pageKind: options.pageKind || null, follow: null, active: null };
    windows.set(win, record);
    win.contentView.addChildView(chrome);
    chrome.webContents.on("will-navigate", (event) => event.preventDefault());
    chrome.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    chrome.webContents.on("render-process-gone", (_event, details) => {
      log("chrome render-process-gone", JSON.stringify(details || {}));
    });
    chrome.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) log("CHROME-CONSOLE level=", level, String(message).slice(0, 600));
    });
    chrome.webContents.on("before-input-event", (event, input) => {
      if (handleMacEditShortcut(chrome.webContents, input, win)) event.preventDefault();
    });
    chrome.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(chromeDocument("锦囊妙计 · 一将成名", iconPng))}`).catch((error) => {
      log("chrome load failed", error?.message || error);
    });
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.on("page-title-updated", (event) => event.preventDefault());
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(frameDocument("锦囊妙计 · 一将成名"))}`).catch((error) => {
      log("frame load failed", error?.message || error);
      if (!win.isDestroyed()) win.close();
    });
    const relayout = () => {
      if (win.isDestroyed()) return;
      layoutWindow(record);
      const { width, height } = win.getContentBounds();
      chromeSend(record, "jnd-chrome-size", width, height);
    };
    win.on("resize", relayout);
    relayout();
    const windowState = () => chromeSend(record, "jnd-chrome-window-state", { maximized: win.isMaximized(), focused: win.isFocused() });
    win.on("focus", windowState);
    win.on("blur", windowState);
    const memTimer = setInterval(() => {
      for (const [, tab] of record.tabs) pushTabState(record, tab);
    }, 15e3);
    win.once("closed", () => clearInterval(memTimer));
    win.on("maximize", () => {
      windowState();
      relayout();
    });
    win.on("unmaximize", () => {
      windowState();
      relayout();
    });
    if (process.env.JND_DEVTOOLS === "1") chrome.webContents.openDevTools({ mode: "detach" });
    win.on("close", (event) => {
      if (win.isDestroyed()) return;
      log("window close event closing=", record.closing, "tabs=", record.tabs.size);
      if (!record.closing && uiSettings().confirmClose && record.tabs.size >= 2 && record.ready) {
        event.preventDefault();
        chromeSend(record, "jnd-chrome-close-request");
        return;
      }
      try {
        if (win.isVisible()) win.hide();
      } catch (_) {
      }
      if (record.merged || record.tabs.size === 0 && record.pageKind) return;
      const tabs = record.order.map((id) => record.tabs.get(id)).filter(Boolean).map((t) => ({ slot: t.slot, entry: chipLabel(getContainer(t.slot)) }));
      const curIndex = record.order.indexOf(record.cur);
      const patch = { session: { tabs, cur: curIndex >= 0 ? curIndex : 0 } };
      if (!win.isMinimized() && !win.isFullScreen()) {
        if (win.isMaximized()) Object.assign(patch, { windowBounds: null, maximized: true });
        else Object.assign(patch, { windowBounds: win.getBounds(), maximized: false });
      }
      writeSettings(patch);
    });
    if (!options.bounds && readSettings().maximized) win.maximize();
    win.on("closed", () => {
      stopFollow(record);
      win.removeListener("resize", relayout);
      const keep = uiSettings().restore && !record.merged;
      for (const id of [...record.tabs.keys()]) closeTab(record, id, false, { wipe: !keep });
      try {
        record.overlays.dispose();
      } catch (_) {
      }
      try {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.close();
      } catch (_) {
      }
      windows.delete(win);
      log("window closed");
    });
    return win;
  }
  async function logoutAll() {
    for (const [, record] of windows) {
      for (const [, tab] of record.tabs) {
        if (tab.contents.isDestroyed()) continue;
        try {
          await tab.contents.session.clearStorageData();
        } catch (error) {
          log("logout clearStorageData failed", error?.message || error);
        }
        for (const key of [...gmStores.keys()]) if (key.startsWith(`slot-${tab.slot}/`)) {
          gmStores.delete(key);
          clearTimeout(gmFlushTimers.get(key));
        }
        try {
          fs.rmSync(path.join(gmStoreDirectory(), `slot-${tab.slot}`), { recursive: true, force: true });
        } catch (_) {
        }
        tab.pendingCredential = null;
        if (tab.loginProvider) {
          tab.loginProvider = null;
          tab.loginPrev = null;
          qrClose(record, tab, "logout-all");
        }
        const entry = entryById(tab.entryId) || ENTRIES[0];
        tab.contents.loadURL(entryUrl(entry)).catch((error) => log("logout reload failed", error?.message || error));
      }
    }
    for (const c of closedList()) wipeSlot(c.slot);
    writeSettings({ closedTabs: [] });
    pushClosed();
    log("logout all");
  }
  const gmStoreDirectory = () => path.join(app.getPath("userData"), "gm-store");
  const gmKey = (sender, componentId) => `slot-${tabOf(sender)?.tab.slot || 0}/${componentId}`;
  const gmStores = /* @__PURE__ */ new Map();
  const gmFlushTimers = /* @__PURE__ */ new Map();
  function gmStore(componentId) {
    if (gmStores.has(componentId)) return gmStores.get(componentId);
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(path.join(gmStoreDirectory(), `${componentId}.json`), "utf8")) || {};
    } catch (_) {
    }
    gmStores.set(componentId, data);
    return data;
  }
  function gmFlush(componentId) {
    clearTimeout(gmFlushTimers.get(componentId));
    gmFlushTimers.set(componentId, setTimeout(() => {
      gmFlushTimers.delete(componentId);
      const file = path.join(gmStoreDirectory(), `${componentId}.json`);
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(temporary, JSON.stringify(gmStores.get(componentId) || {}));
        fs.renameSync(temporary, file);
      } catch (error) {
        log("gm store flush failed", componentId, error?.message || error);
        try {
          fs.unlinkSync(temporary);
        } catch (_) {
        }
      }
    }, 300));
  }
  const gmAllowed = (id) => Boolean(COMPONENTS.find((component) => component.id === id && component.gm)) || Boolean(pluginStore?.get(id)?.grant);
  const gmConnectHosts = (id) => {
    const plugin = pluginStore?.get(id);
    if (plugin) return plugin.connect;
    const record = componentHost.getStartupRecords()[id];
    return parseUserScriptHeader(record?.code || "").connect;
  };
  function installIpc() {
    ipcMain.on("jnd-preload-log", (_event, data) => log("PRELOAD", JSON.stringify(data || {})));
    ipcMain.on("jnd-update-get-startup-sync", (event) => {
      event.returnValue = updateHost?.getStartupRecord() || null;
    });
    ipcMain.on("jnd-update-get-state-sync", (event) => {
      event.returnValue = updateHost?.getState() || null;
    });
    ipcMain.handle("jnd-update-check", async () => await updateHost.checkMetadata());
    ipcMain.handle("jnd-update-download", async () => await updateHost.downloadUpdate());
    ipcMain.handle("jnd-update-reload-game", async (event) => {
      const contents = event.sender;
      return await updateHost.reloadGame({
        reload() {
          if (contents.isDestroyed()) throw new Error("游戏窗口已关闭");
          contents.reload();
          return true;
        }
      });
    });
    ipcMain.on("jnd-update-applied", (_event, data) => {
      const version = String(data?.version || "");
      if (version) updateHost.markApplied(version);
    });
    updateHost.subscribe((state) => {
      for (const [, record] of windows) for (const [, tab] of record.tabs) if (!tab.contents.isDestroyed()) tab.contents.send("jnd-update-state", state);
      pushUpds();
    });
    ipcMain.on("jnd-components-get-startup-sync", (event) => {
      const records = componentHost?.getStartupRecords() || {};
      const removed = new Set(readSettings().removedPlugins || []), disabled = new Set(readSettings().disabledPlugins || []);
      for (const id of Object.keys(records)) if (removed.has(id) || disabled.has(id) || !records[id]) delete records[id];
      event.returnValue = records;
    });
    ipcMain.on("jnd-plugins-get-startup-sync", (event) => {
      event.returnValue = pluginStore?.startupRecords() || {};
    });
    ipcMain.on("jnd-components-get-state-sync", (event) => {
      event.returnValue = componentHost?.getState() || null;
    });
    ipcMain.on("jnd-gm-store-load", (event, componentId) => {
      event.returnValue = gmAllowed(String(componentId)) ? { ...gmStore(gmKey(event.sender, String(componentId))) } : {};
    });
    ipcMain.on("jnd-gm-store-set", (event, componentId, key, value) => {
      const id = String(componentId);
      if (!gmAllowed(id) || typeof key !== "string") return;
      gmStore(gmKey(event.sender, id))[key] = value;
      gmFlush(gmKey(event.sender, id));
    });
    ipcMain.on("jnd-gm-store-delete", (event, componentId, key) => {
      const id = String(componentId);
      if (!gmAllowed(id) || typeof key !== "string") return;
      delete gmStore(gmKey(event.sender, id))[key];
      gmFlush(gmKey(event.sender, id));
    });
    ipcMain.handle("jnd-gm-xhr", async (event, componentId, requestId, request) => {
      const id = String(componentId);
      if (!gmAllowed(id)) return { kind: "error", error: "组件没有 GM 请求权限" };
      const allowHosts = gmConnectHosts(id);
      return await gmHost.request(String(requestId), request || {}, { allowHosts, session: event.sender.session });
    });
    ipcMain.on("jnd-gm-xhr-abort", (_event, requestId) => {
      gmHost.abort(String(requestId));
    });
    componentHost.subscribe(() => {
      pushUpds();
      pushPlugins();
    });
    shellUpdateHost.subscribe(() => pushUpds());
    ipcMain.handle("jnd-components-check", async () => await componentHost.checkManifest());
    ipcMain.on("jnd-shell-open-version", (event) => {
      const found = tabOf(event.sender);
      if (found) chromeSend(found.record, "jnd-chrome-command", "update");
    });
    ipcMain.on("jnd-shell-current-entry-sync", (event) => {
      const found = tabOf(event.sender);
      event.returnValue = found?.tab.entryId || defaultEntryId();
    });
    ipcMain.on("jnd-stargaze-get-sync", (event) => {
      event.returnValue = stargazeState();
    });
    ipcMain.handle("jnd-stargaze-config", async (_event, patch) => {
      const next = normalizeStargazeSettings({ ...stargazeSettings(), ...patch && typeof patch === "object" ? patch : {} });
      writeStargazeSettings(next);
      log("stargaze config", JSON.stringify(next));
      return stargazeWatcher?.configure(next) || null;
    });
    ipcMain.handle("jnd-stargaze-check", async () => await stargazeWatcher?.checkNow() || null);
    ipcMain.handle("jnd-stargaze-open", async (_event, kind) => {
      await openStargazeReport(kind);
      return true;
    });
    ipcMain.handle("jnd-stargaze-open-folder", async () => {
      await openStargazeFolder();
      return true;
    });
    ipcMain.handle("jnd-stargaze-choose-folder", async (event) => {
      if (!stargazeWatcher) throw new Error("自动观星尚未启动");
      const record = windowOfChrome(event.sender);
      const options = {
        title: "选择观星报告保存目录",
        defaultPath: stargazeWatcher.getState().directory,
        properties: ["openDirectory", "createDirectory"]
      };
      const picked = record ? await dialog.showOpenDialog(record.win, options) : await dialog.showOpenDialog(options);
      if (picked.canceled || !picked.filePaths?.[0]) return null;
      const state = stargazeWatcher.setDirectory(picked.filePaths[0]);
      writeStargazeSettings({ directory: state.directory });
      log("stargaze directory", state.directory);
      return state;
    });
    ipcMain.on("jnd-chrome-init", (event) => {
      const record = windowOfChrome(event.sender);
      const ui = uiSettings();
      const session = ui.restore ? readSettings().session : null;
      const { width, height } = record ? record.win.getContentBounds() : { width: 1280, height: 720 };
      event.returnValue = {
        settings: ui,
        accounts: accountRows(),
        plugins: pluginRows(),
        upds: updateRows(),
        tabs: record?.pageKind ? [{ kind: record.pageKind, adopt: true }] : record?.pendingAdopt ? [{ entry: chipLabel(getContainer(record.pendingAdopt.slot)), provider: providerLabel(getContainer(record.pendingAdopt.slot)), slot: record.pendingAdopt.slot, adopt: true, nick: getContainer(record.pendingAdopt.slot).nick, muted: record.pendingAdopt.muted }] : Array.isArray(session?.tabs) && session.tabs.length ? session.tabs.map((t) => {
          const k = t.slot && containers[t.slot] ? containers[t.slot] : null;
          return k ? { entry: chipLabel(k), provider: providerLabel(k), slot: Number(t.slot), nick: k.nick, status: k.status } : { entry: entryByLabel(t.entry) ? t.entry : ENTRIES[0].label, slot: Number(t.slot) || void 0, provider: null };
        }) : [],
        cur: Number(session?.cur) || 0,
        defaultEntry: entryById(defaultEntryId())?.label || ENTRIES[0].label,
        width,
        height,
        maximized: record ? record.win.isMaximized() : false,
        focused: record ? record.win.isFocused() : true,
        feedback: Boolean(channel.feedbackUrl),
        closed: closedRows(),
        stargaze: stargazeState()
      };
    });
    ipcMain.on("jnd-chrome-ready", (event) => {
      const record = windowOfChrome(event.sender);
      if (record) {
        record.ready = true;
        layoutWindow(record);
      }
    });
    ipcMain.on("jnd-chrome-cover", (event, full) => {
      log("chrome-cover", full ? "full" : "bar");
      const record = windowOfChrome(event.sender);
      if (!record) return;
      record.covered = Boolean(full);
      layoutWindow(record);
      const tab = record.cur !== null ? record.tabs.get(record.cur) : null;
      try {
        if (record.covered) record.chromeContents.focus();
        else if (tab && record.curKind === "game" && !tab.contents.isDestroyed()) tab.contents.focus();
      } catch (_) {
      }
    });
    ipcMain.on("jnd-chrome-save-result", (_event, r) => {
      if (!r || !r.save || !r.account || !entryById(String(r.entryId))) return;
      credentials.set(String(r.entryId), String(r.account), String(r.password || ""));
      log("credential saved for entry", r.entryId);
      pushAccounts();
    });
    ipcMain.on("jnd-chrome-open-external", (_event, url) => {
      if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url)).catch((error) => log("openExternal failed", error?.message || error));
    });
    ipcMain.on("jnd-chrome-tab", (event, msg) => {
      const record = windowOfChrome(event.sender);
      if (!record || !msg) return;
      const tab = record.tabs.get(Number(msg.id));
      log("chrome-tab", msg.type, "id=", msg.id);
      try {
        if (msg.type === "open") {
          if (!(msg.adopt && adoptTab(record, Number(msg.id)))) {
            createTab(record, { id: Number(msg.id), entry: String(msg.entry || ""), provider: msg.provider || null, slot: msg.slot, account: msg.account, restored: Boolean(msg.restored) });
            if (!record.order.includes(Number(msg.id))) record.order.push(Number(msg.id));
          }
        } else if (msg.type === "detach") detachTab(record, { id: Number(msg.id), x: Number(msg.x), y: Number(msg.y), grabX: Number(msg.grabX) || 0, kind: msg.kind });
        else if (msg.type === "carry") {
          if (msg.kind && msg.kind !== "game") record.pageKind = String(msg.kind);
          const b = record.win.getPosition();
          startFollow(record, Number(msg.x) - b[0], Number(msg.y) - b[1], true);
        } else if (msg.type === "dragEnd") {
          for (const [, other] of windows) stopFollow(other);
        } else if (msg.type === "close") closeTab(record, Number(msg.id), false, { wipe: true });
        else if (msg.type === "activate") activateTab(record, Number(msg.id), String(msg.kind || "game"));
        else if (msg.type === "order" && Array.isArray(msg.ids)) record.order = msg.ids.map(Number).filter((id) => record.tabs.has(id));
        else if (!tab || tab.contents.isDestroyed()) return;
        else if (msg.type === "nav") {
          const c = tab.contents;
          if (msg.action === "back") c.navigationHistory.goBack();
          else if (msg.action === "fwd") c.navigationHistory.goForward();
          else if (msg.action === "reload") c.reload();
          else if (msg.action === "stop") c.stop();
        } else if (msg.type === "mute") {
          tab.muted = Boolean(msg.muted);
          tab.contents.setAudioMuted(tab.muted);
          pushTabState(record, tab);
        } else if (msg.type === "entry") {
          const entry = entryByLabel(String(msg.entry));
          if (entry) switchEntry(record, tab, entry.id, { logout: Boolean(msg.logout) });
        } else if (msg.type === "provider") {
          const provider = PROVIDERS.find((p) => p.label === String(msg.provider));
          if (provider) startProviderLogin(record, tab, provider.id, { logout: Boolean(msg.logout) });
        }
      } catch (error) {
        log("chrome tab action failed", msg.type, error?.message || error);
      }
    });
    ipcMain.on("jnd-chrome-window", (event, cmd, reason) => {
      const record = windowOfChrome(event.sender);
      if (!record) return;
      const { win } = record;
      if (cmd && typeof cmd === "object") {
        if (cmd.cmd === "dragStart") {
          const b = win.getPosition();
          startFollow(record, Number(cmd.x) - b[0], Number(cmd.y) - b[1], false);
        } else if (cmd.cmd === "dragEnd") stopFollow(record);
        return;
      }
      if (cmd === "minimize") win.minimize();
      else if (cmd === "maximize") {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      } else if (cmd === "close") {
        record.closing = true;
        log("win.close: chrome asked (tabs=", record.tabs.size, ") reason=", String(reason || ""));
        try {
          win.hide();
        } catch (_) {
        }
        win.close();
      }
    });
    ipcMain.on("jnd-chrome-closed", (_event, msg) => {
      if (msg?.type === "forget") forgetClosed(Number(msg.slot));
    });
    ipcMain.on("jnd-chrome-settings", (_event, msg) => {
      if (!msg || !(msg.key in UI_DEFAULTS)) return;
      writeSettings({ ui: { ...uiSettings(), [msg.key]: Boolean(msg.value) } });
      log("setting", msg.key, Boolean(msg.value));
    });
    ipcMain.handle("jnd-chrome-logout-all", async () => {
      await logoutAll();
    });
    ipcMain.on("jnd-chrome-account", (_event, msg) => {
      if (!msg) return;
      if (msg.type === "clear") {
        for (const entry of ENTRIES) for (const item of credentials.list(entry.id)) credentials.remove(entry.id, item.account);
        log("credentials cleared");
      } else if (entryById(String(msg.entryId))) {
        const entryId = String(msg.entryId), account = String(msg.account || "");
        if (msg.type === "remove") credentials.remove(entryId, account);
        else if (msg.type === "update" && msg.key === "password") credentials.set(entryId, account, String(msg.value || ""));
        else if (msg.type === "update" && msg.key === "account") {
          const old = credentials.list(entryId).find((i) => i.account === account);
          if (old) {
            credentials.remove(entryId, account);
            credentials.set(entryId, String(msg.value || ""), old.password);
          }
        }
      }
      pushAccounts();
    });
    ipcMain.on("jnd-chrome-plugin", (_event, msg) => {
      if (!msg) return;
      const id = String(msg.id || "");
      if (id === "daxiaochao") {
        const s = readSettings();
        if (msg.type === "enable") {
          const set = new Set(s.disabledPlugins || []);
          if (msg.enabled) set.delete(id);
          else set.add(id);
          writeSettings({ disabledPlugins: [...set] });
        } else if (msg.type === "remove") writeSettings({ removedPlugins: [.../* @__PURE__ */ new Set([...s.removedPlugins || [], id])] });
      } else if (msg.type === "enable") pluginStore.setEnabled(id, Boolean(msg.enabled));
      else if (msg.type === "remove") pluginStore.remove(id);
      pushPlugins();
    });
    ipcMain.handle("jnd-chrome-plugin-check", async (_event, id) => {
      const key = String(id || "");
      if (key === "daxiaochao") {
        const before = componentHost.getState().components.daxiaochao?.current || "";
        await componentHost.checkManifest();
        if (componentHost.getState().checkError) throw new Error("无法连接更新服务器");
        const state = await componentHost.updateComponent("daxiaochao");
        const c = state.components.daxiaochao;
        if (c?.error) throw new Error(String(c.error.message || c.error));
        pushPlugins();
        return { updated: c?.phase === "ready" && c.latest !== before, from: before, version: c?.latest || before };
      }
      const result = await pluginStore.check(key);
      pushPlugins();
      return result;
    });
    ipcMain.handle("jnd-chrome-plugin-install", async (_event, source) => {
      const result = await pluginStore.install(String(source || ""));
      pushPlugins();
      return { name: result.meta.name, updated: result.updated, from: result.from, version: result.meta.version };
    });
    ipcMain.handle("jnd-chrome-plugin-pick", async (event) => {
      const record = windowOfChrome(event.sender);
      const { canceled, filePaths } = await dialog.showOpenDialog(record ? record.win : void 0, { title: "选择插件文件", properties: ["openFile"], filters: [{ name: "user.js 插件", extensions: ["js"] }] });
      return canceled ? void 0 : filePaths?.[0];
    });
    ipcMain.on("jnd-chrome-update", (_event, msg) => {
      if (!msg) return;
      const run = async () => {
        if (msg.type === "check") {
          await Promise.allSettled([updateHost.checkMetadata(), componentHost.checkManifest()]);
          pushUpds();
          const rows = updateRows();
          const row = rows.find((r) => r.name === msg.name) || rows[0];
          const failed = componentHost.getState().checkError || updateHost.getState().checkError;
          broadcast("jnd-chrome-toast", failed ? "无法连接更新服务器" : row.state === "latest" ? `${row.name}已是最新版本` : row.state === "available" ? `${row.name}有可用更新` : `${row.name}更新已完成`);
          return;
        }
        if (msg.type === "download") {
          if (msg.name === "客户端") {
            const info = componentHost.getState().shell;
            if (info.asar) await shellUpdateHost.download({ ...info.asar, version: info.latest });
          } else await updateHost.downloadUpdate();
          pushUpds();
          return;
        }
        if (msg.type === "restart") {
          log("restart requested");
          app.relaunch();
          app.quit();
        }
      };
      run().catch((error) => {
        log("update action failed", msg.type, error?.message || error);
        pushUpds();
      });
    });
    ipcMain.handle("jnd-chrome-feedback", async (_event, note) => {
      if (!channel.feedbackUrl) throw new Error("反馈服务尚未开通");
      let tail = "";
      try {
        tail = fs.readFileSync(path.join(app.getPath("userData"), channel.logName), "utf8").split("\n").slice(-300).join("\n");
      } catch (_) {
      }
      tail = tail.replace(/(account|password|pwd|token)[^\s,}]*/gi, "$1=***");
      const body = Buffer.from(JSON.stringify({ note: String(note || "").slice(0, 2e3), shell: displayVersion(channel.shellVersion), log: tail }), "utf8");
      const response = await new Promise((resolve, reject) => {
        const request = https.request(channel.feedbackUrl, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": body.length }, timeout: 2e4 }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            if (res.statusCode === 200) resolve(buf);
            else reject(new Error(`HTTP ${res.statusCode}`));
          });
        });
        request.on("timeout", () => request.destroy(new Error("连接超时")));
        request.on("error", reject);
        request.end(body);
      });
      const parsed = JSON.parse(response.toString("utf8"));
      if (!parsed?.id) throw new Error("服务器没有返回编号");
      return { id: String(parsed.id) };
    });
    ipcMain.on("jnd-landing-state", (event, state) => {
      const found = tabOf(event.sender);
      if (!found) return;
      const slot = found.tab.slot;
      if (state?.loggedIn) {
        const patch = { status: "landing", entryId: found.tab.entryId };
        if (state.nickname) patch.nick = String(state.nickname);
        if (state.provider) patch.provider = String(state.provider);
        setContainer(slot, patch);
        log("login-trace landing slot=", slot, "loggedIn=", true, "nick=", state.nickname ? "yes" : "no", "provider=", state.provider || "");
        if (found.tab.loginProvider) {
          found.tab.loginProvider = null;
          found.tab.loginPrev = null;
          qrClose(found.record, found.tab, "landing");
        }
      } else {
        setContainer(slot, { status: "none", nick: "", uid: "" });
        log("login-trace landing slot=", slot, "loggedIn=", false);
      }
    });
    ipcMain.on("jnd-login-state", (event, state) => {
      const found = tabOf(event.sender);
      if (state?.error) log("login-error slot=", found?.tab.slot, "provider=", state.provider, "stage=", state.stage, JSON.stringify(state.error));
      if (!found || !found.tab.loginProvider) return;
      const { record, tab } = found;
      if (String(state?.stage || "") === "ready") {
        tab.loginProvider = null;
        tab.loginPrev = null;
        qrClose(record, tab, "ready");
        setContainer(tab.slot, { provider: String(state.provider || tab.provider || ""), status: "landing" });
        log("login-trace ready slot=", tab.slot, "provider=", state.provider);
        return;
      }
      const stage = qrStage(tab, state);
      if (stage !== tab.loginSeen || stage === "scan") {
        if (stage !== tab.loginSeen) log("login-trace stage slot=", tab.slot, "script=", state?.stage, "card=", stage, "qr=", state?.qr ? "yes" : "no", state?.error ? JSON.stringify(state.error) : "");
        tab.loginSeen = stage;
        chromeSend(record, "jnd-chrome-qr", { action: "update", id: tab.id, provider: providerById(tab.loginProvider)?.label || "", stage, qr: String(state?.qr || ""), text: String(state?.text || "") });
      }
    });
    ipcMain.on("jnd-chrome-qr-cancel", (event, m) => {
      const record = [...windows.values()].find((r) => r.chrome.webContents === event.sender);
      const tab = record?.tabs.get(Number(m?.id));
      if (record && tab) cancelProviderLogin(record, tab, "card-cancel");
    });
    ipcMain.on("jnd-chrome-qr-retry", (event, m) => {
      const record = [...windows.values()].find((r) => r.chrome.webContents === event.sender);
      const tab = record?.tabs.get(Number(m?.id));
      if (!record || !tab || !tab.loginProvider) return;
      const id = tab.loginProvider;
      tab.loginProvider = null;
      log("login-trace retry slot=", tab.slot, id);
      if (!tab.contents.isDestroyed()) tab.contents.send("jnd-login-cancel");
      qrClose(record, tab, "retry");
      setTimeout(() => startProviderLogin(record, tab, id), 200);
    });
    ipcMain.on("jnd-open-page", (event, kind) => {
      const found = tabOf(event.sender);
      if (found && ["pm", "settings", "update", "about"].includes(String(kind))) chromeSend(found.record, "jnd-chrome-command", String(kind));
    });
    ipcMain.on("jnd-account-identity", (event, info) => {
      const found = tabOf(event.sender);
      if (!found) return;
      const nick = String(info?.nickname || ""), uid = String(info?.userId || "");
      found.tab.nick = nick;
      found.tab.uid = uid;
      setContainer(found.tab.slot, nick || uid ? { nick, uid, status: "game" } : { nick: "", uid: "", status: "none" });
      if (nick && found.tab.lastAccount) {
        credentials.setNick(found.tab.entryId, found.tab.lastAccount, nick);
        pushAccounts();
      }
      log("identity", "slot=", found.tab.slot, "uid=", uid, "nick=", nick ? "yes" : "no");
    });
    ipcMain.on("jnd-credential-get-sync", (event, entryId) => {
      const found = tabOf(event.sender);
      event.returnValue = found && entryById(String(entryId)) && uiSettings().manager ? credentials.get(String(entryId)) : null;
    });
    ipcMain.on("jnd-credential-list-sync", (event, entryId) => {
      const found = tabOf(event.sender);
      if (!found || !entryById(String(entryId)) || !uiSettings().manager) {
        event.returnValue = [];
        return;
      }
      const list = credentials.list(String(entryId));
      const preferred = found.tab.preferredAccount;
      event.returnValue = preferred ? [...list.filter((i) => i.account === preferred), ...list.filter((i) => i.account !== preferred)] : list;
    });
    ipcMain.on("jnd-credential-offer", (event, offer) => {
      const found = tabOf(event.sender);
      if (!found || !offer || typeof offer.account !== "string" || !entryById(String(offer.entryId))) return;
      found.tab.pendingCredential = { entryId: String(offer.entryId), account: offer.account, password: String(offer.password || ""), at: Date.now() };
      found.tab.lastAccount = String(offer.account);
      const remembered = credentials.list(String(offer.entryId)).find((i) => i.account === offer.account)?.nick || "";
      setContainer(found.tab.slot, { entryId: String(offer.entryId), provider: "", ...remembered && !getContainer(found.tab.slot).nick ? { nick: remembered } : {} });
      log("credential offer received for entry", offer.entryId);
      settleCredential(found.record, found.tab);
    });
  }
  process.on("uncaughtException", (error) => {
    log("UNCAUGHT", error?.stack || error);
    flushLog(true);
  });
  process.on("exit", () => flushLog(true));
  process.on("unhandledRejection", (error) => log("UNHANDLED_REJECTION", error?.stack || error));
  Menu.setApplicationMenu(null);
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    if (app.isReady()) createWindow();
  });
  app.whenReady().then(async () => {
    const payloadDirectory = process.env.JND_MICRO_PAYLOAD_DIR || path.join(__dirname, "..", channel.id, "payload");
    updateHost = await createNodeUpdateHost({
      cacheDirectory: path.join(app.getPath("userData"), "runtime-cache"),
      seedPath: path.join(payloadDirectory, "jinnangdai.runtime.js"),
      seedVersion: channel.seedVersion,
      releaseChannel: "stable",
      log,
      async reloadGame(context) {
        return context.reload();
      }
    });
    componentHost = await createComponentUpdateHost({
      cacheRoot: path.join(app.getPath("userData"), "component-cache"),
      // 清单按渠道分文件：组件相同，壳 asar（渠道配置与种子）不同。
      manifestUrl: `https://sh-sgs.net/script/micro/${channel.id}.json`,
      shellVersion: channel.shellVersion,
      log,
      components: COMPONENTS.map((component) => {
        const seedPath = path.join(payloadDirectory, component.file);
        let seedVersion = "0.0.0";
        try {
          seedVersion = parseUserScriptHeader(fs.readFileSync(seedPath, "utf8")).version || "0.0.0";
        } catch (_) {
        }
        return { id: component.id, seedPath, seedVersion };
      })
    });
    gmHost = createGmRequestHost({ log, net });
    let stargazeDirectory = preferredStargazeDirectory();
    try {
      stargazeDirectory = prepareStargazeDirectory(stargazeDirectory);
    } catch (error) {
      log("stargaze directory unavailable", stargazeDirectory, error?.message || error);
      stargazeDirectory = prepareStargazeDirectory(path.join(app.getPath("userData"), "stargaze"));
    }
    stargazeWatcher = createStargazeWatcher({
      directory: stargazeDirectory,
      settings: stargazeSettings(),
      fetch: createReportFetch(),
      log,
      onState: (state) => broadcast("jnd-chrome-stargaze", state),
      onUpdate: (updates) => notifyStargazeUpdates(updates)
    });
    shellUpdateHost = createShellUpdateHost({
      log,
      shellVersion: channel.shellVersion,
      stagingDirectory: path.join(app.getPath("userData"), "shell-update"),
      // 便携目录里本壳就是 resources/app.asar；源码直跑时 getAppPath 是目录，宿主会跳过换文件。
      asarPath: app.getAppPath()
    });
    credentials = process.platform === "win32" ? createCredentialStore({ file: path.join(app.getPath("userData"), "credentials.json"), safeStorage, log }) : createCredentialStore({ file: path.join(app.getPath("userData"), "credentials.json"), keyFile: path.join(app.getPath("userData"), "credentials.key"), log });
    pluginStore = createPluginStore({ directory: path.join(app.getPath("userData"), "plugins"), log, fetch: (url) => requestBuffer(url, { accept: "application/javascript", timeoutMs: 6e4, maxBytes: 4 * 1024 * 1024 }) });
    nextSlot = Math.max(1, Number(readSettings().nextSlot) || 1);
    try {
      const keepSlots = new Set([...uiSettings().restore ? readSettings().session?.tabs || [] : [], ...closedList()].map((t) => Number(t.slot) || 0));
      const prefix = `jinnangdai-${channel.id}-`;
      for (const name of fs.readdirSync(path.join(app.getPath("userData"), "Partitions"))) {
        if (!name.startsWith(prefix)) continue;
        const slot = Number(name.slice(prefix.length));
        if (!slot || keepSlots.has(slot)) continue;
        wipeSlot(slot);
      }
    } catch (_) {
    }
    installSharedAssetScheme();
    installIpc();
    createWindow();
    setInterval(() => {
      try {
        const owners = /* @__PURE__ */ new Map();
        for (const [, record] of windows) {
          for (const [, tab] of record.tabs) if (!tab.contents.isDestroyed()) owners.set(tab.contents.getOSProcessId(), `tab slot=${tab.slot}${record.cur === tab.id ? "*" : ""}`);
          if (!record.chromeContents.isDestroyed()) owners.set(record.chromeContents.getOSProcessId(), "chrome");
        }
        const rows = app.getAppMetrics().map((m) => `${m.type}${owners.has(m.pid) ? `(${owners.get(m.pid)})` : ""} cpu=${Math.round(m.cpu.percentCPUUsage)}% mem=${Math.round(Number(m.memory?.workingSetSize || 0) / 1024)}MB`);
        log("metrics", rows.join(" | "));
      } catch (error) {
        log("metrics failed", error?.message || error);
      }
    }, 3e4);
    let started = false;
    const startBackgroundUpdates = () => {
      if (started) return;
      started = true;
      void updateHost.startBackgroundUpdate().catch((error) => {
        log("startup update failed", JSON.stringify({ code: error?.code || "UPDATE_FAILED", message: error?.message }));
      }).then(() => componentHost.startBackgroundUpdate()).catch((error) => {
        log("component update failed", JSON.stringify({ message: error?.message }));
      });
    };
    setTimeout(startBackgroundUpdates, 8e3);
  }).catch((error) => {
    log("app initialization failed", error?.stack || error);
    app.quit();
  });
  app.on("window-all-closed", () => {
    log("app.quit: window-all-closed");
    app.quit();
  });
  app.on("will-quit", () => {
    try {
      stargazeWatcher?.dispose();
    } catch (error) {
      log("stargaze dispose failed", error?.message || error);
    }
    try {
      shellUpdateHost?.applyOnQuit();
    } catch (error) {
      log("shell apply failed", error?.message || error);
    }
    if (containersTimer) flushContainers();
    flushLog(true);
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && updateHost) createWindow();
  });
};
