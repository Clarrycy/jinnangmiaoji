// 由 src/core/main-app.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const electron_ = require("electron");
const { app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, safeStorage, screen, shell, net, clipboard } = electron_;
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
const steam_direct_ = require("./steam-direct-agent");
const { createSteamDirectConnector } = steam_direct_;
const shell_update_host_ = require("./shell-update-host");
const { createShellUpdateHost } = shell_update_host_;
const credential_store_ = require("./credential-store");
const { createCredentialStore } = credential_store_;
const plugin_store_ = require("./plugin-store");
const { createPluginStore } = plugin_store_;
const components_ = require("./components");
const { COMPONENTS, parseUserScriptHeader } = components_;
const entries_ = require("./entries");
const landing_pack_ = require("./landing-pack");
const login_recorder_ = require("./login-recorder");
const { createLoginRecorder } = login_recorder_;
const { createLandingPack } = landing_pack_;
const { ENTRIES, PROVIDERS, entryById, providerById, matchesAnyEntry, TEST_ORIGIN, landingTrimCss } = entries_;
const game_shell_ = require("./game-shell");
const { TITLE_HEIGHT, FRAME, BAR_COLOR, MAC_LIGHTS, MAC_INSET, frameDocument, chromeDocument, viewportBounds } = game_shell_;
const IS_MAC = process.platform === "darwin";
const UpdateCore = require("./update-core");
const popup_window_ = require("./popup-window");
const { createOverlays } = popup_window_;
const configuredSessions = /* @__PURE__ */ new WeakSet();
const windows = /* @__PURE__ */ new Map();
const occupiedSlots = /* @__PURE__ */ new Set();
let nextSlot = 1;
const crashHistory = /* @__PURE__ */ new WeakMap();
const recoveryTimers = /* @__PURE__ */ new Map();
const pendingErrorPages = /* @__PURE__ */ new WeakMap();
let updateHost = null;
let componentHost = null;
let gmHost = null;
let shellUpdateHost = null;
let credentials = null;
let pluginStore = null;
const OFFICIAL_LOGIN_PATHS = ["/login/index.html", "/login/x/index"];
const PROVIDER_CHIP = { qq: "WeGame", wx: "WeGame", bilibili: "bilibili", steam: "Steam", oppo: "OPPO", xiaomi: "小米", vivo: "VIVO", huawei: "华为", honor: "荣耀" };
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
  const loginRecorder = createLoginRecorder({ meta: () => ({ shell: channel.shellVersion, platform: process.platform, arch: process.arch, electron: process.versions.electron }) });
  let lastEvidenceAt = 0;
  function log(...args) {
    loginRecorder.log(args);
    if (String(args[0]).startsWith("login-error") && Date.now() - lastEvidenceAt > 3e3) {
      lastEvidenceAt = Date.now();
      const evidence = loginRecorder.takeEvidence();
      if (evidence.length) setImmediate(() => log("login-evidence", JSON.stringify(evidence)));
    }
    logBuffer += `[${(/* @__PURE__ */ new Date()).toISOString()}] ${login_recorder_.redactText(args.join(" "))}
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
  function defaultEntryId() {
    return entryById(channel.id) ? channel.id : ENTRIES[0].id;
  }
  const entryByLabel = (label) => ENTRIES.find((e) => e.label === label) || null;
  const entryUrl = (entry) => TEST_ORIGIN ? `${TEST_ORIGIN}/login/x/index` : entry.entry;
  const ASSET_HOSTS = /(^|\.)(sanguosha\.com|yokaverse\.com|4399ytzg2\.com|4399iw\d*\.com|iwan4399\.com)$/i;
  const ASSET_EXT = /\.(?:css|json|png|jpe?g|webp|gif|svg|atlas|sgs|bin|wasm|mp3|ogg|wav|m4a|ttf|otf|woff2?|fnt|ani|sk|skel|plist|txt|lh|ls|lmat|lm|lani|lav|ltc|lsani|ktx|pvr|astc|mp4)$/i;
  const ASSET_TYPES = /* @__PURE__ */ new Set(["image", "xhr", "fetch", "media", "font", "stylesheet", "other"]);
  const SHARED_CACHE = process.env.JND_NO_SHARED_CACHE !== "1";
  function isSharedAsset(url) {
    if (!ASSET_HOSTS.test(url.hostname)) return false;
    if (/\.php$|\/login\//i.test(url.pathname) || /api/i.test(url.hostname)) return false;
    return ASSET_EXT.test(url.pathname);
  }
  const LOGIN_API = /^https:\/\/web-login-api(?:test)?\.sanguosha\.com\//i;
  function installRequestHooks(session, loginStarted) {
    session.webRequest.onBeforeRequest({ urls: ["https://*/*"] }, (details, callback) => {
      if (LOGIN_API.test(details.url)) {
        loginStarted.set(details.id, Date.now());
        callback({});
        return;
      }
      if (/\/img\/10th_tmp\/yjcm_n_ban\.png$/i.test(details.url)) {
        callback({ cancel: true });
        return;
      }
      if (!SHARED_CACHE || details.method !== "GET") {
        callback({});
        return;
      }
      const localDocumentScript = details.resourceType === "script" && Boolean(landingPack && (landingPack.isDocumentScript(details.url, details.frame?.url || "") || landingPack.isDocumentScript(details.url, details.referrer || "")));
      let url = null;
      try {
        url = new URL(details.url);
      } catch (_) {
      }
      if (!localDocumentScript && (!url || !ASSET_TYPES.has(String(details.resourceType)) || !isSharedAsset(url))) {
        callback({});
        return;
      }
      let from = details.referrer || "";
      try {
        if (!from && details.frame?.url) from = new URL(details.frame.url).origin + "/";
      } catch (_) {
      }
      callback({ redirectURL: `jnd-asset://shared/${encodeURIComponent(details.url)}${from ? `?from=${encodeURIComponent(from)}` : ""}` });
    });
  }
  async function serveSharedAsset(request) {
    let original = "", from = "";
    try {
      const u = new URL(request.url);
      original = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      from = u.searchParams.get("from") || "";
    } catch (_) {
    }
    if (!/^https:\/\//i.test(original)) return new Response("", { status: 400 });
    const headers = new Headers();
    for (const key of ["accept", "range", "origin"]) {
      const value = request.headers.get(key);
      if (value && /^[\x20-\x7e]*$/.test(value)) headers.set(key, value);
    }
    const referrer = from || request.headers.get("referer") || "";
    if (referrer && /^https?:\/\/[\x21-\x7e]+$/.test(referrer)) headers.set("referer", referrer);
    const local = landingPack?.serveAsset(original, request.headers.get("range"));
    if (local) return local;
    try {
      const upstream = await net.fetch(original, { method: "GET", headers, redirect: "follow", referrerPolicy: "unsafe-url" });
      const out = new Headers();
      for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control", "expires", "date"]) {
        const value = upstream.headers.get(key);
        if (value) out.set(key, value);
      }
      out.set("access-control-allow-origin", "*");
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
    } catch (error) {
      log("shared asset fetch failed", original.slice(0, 120), "referer=", referrer ? "yes" : "no", error?.message || error);
      return new Response("", { status: 502 });
    }
  }
  let landingPack = null;
  function loadEntry(contents, url) {
    const ses = contents.session;
    if (landingPack?.has() && landingPack.isDoc(url) && !ses.protocol.isProtocolHandled("https")) {
      let armed = true;
      const t0 = Date.now();
      const release = () => {
        if (!armed) return;
        armed = false;
        try {
          ses.protocol.unhandle("https");
        } catch (_) {
        }
        installSessionHooks(ses);
      };
      removeSessionHooks(ses);
      ses.protocol.handle("https", (request) => {
        try {
          const doc = armed && request.method === "GET" && landingPack.isDoc(request.url);
          setImmediate(release);
          const local = doc ? landingPack.serveDoc() : null;
          if (local) {
            log("landing doc from pack ms=", Date.now() - t0);
            setTimeout(() => landingPack?.refresh(), 15e3);
            return local;
          }
        } catch (error) {
          log("landing doc serve failed", error?.stack || error);
        }
        return ses.fetch(request, { bypassCustomProtocolHandlers: true });
      });
      setTimeout(release, 15e3);
    }
    return contents.loadURL(url);
  }
  function installSharedAssetScheme() {
    try {
      app.userAgentFallback = cleanUserAgent(app.userAgentFallback);
    } catch (error) {
      log("user agent fallback failed", error?.message || error);
    }
    if (process.env.JND_NO_LANDING_PACK !== "1") landingPack = createLandingPack({
      dir: path.join(app.getPath("userData"), "landing-pack"),
      seedDir: path.join(__dirname, "landing-seed"),
      log,
      fetch: (url) => net.fetch(url, { headers: { referer: "https://web.sanguosha.com/" }, referrerPolicy: "unsafe-url", bypassCustomProtocolHandlers: true })
    });
    if (!SHARED_CACHE) return;
    normalizeUserAgent(electron_.session.defaultSession);
    electron_.protocol.handle("jnd-asset", serveSharedAsset);
  }
  function cleanUserAgent(ua) {
    const appToken = `${app.getName()}/${app.getVersion()}`;
    return ua.replace(/\s+Electron\/\S+/i, "").split(` ${appToken}`).join("").replace(/\s+[A-Za-z0-9_.-]*jinnangdai[A-Za-z0-9_.-]*\/\S+/i, "").replace(/\s+\S*[^\x20-\x7e]\S*\/\S+/g, "").replace(/[^\x20-\x7e]+/g, "").replace(/\s{2,}/g, " ").trim();
  }
  function normalizeUserAgent(session) {
    try {
      session.setUserAgent(cleanUserAgent(session.getUserAgent()));
    } catch (error) {
      log("user agent normalize failed", error?.message || error);
    }
  }
  function configureSession(session) {
    if (configuredSessions.has(session)) return;
    configuredSessions.add(session);
    if (SHARED_CACHE) {
      try {
        if (!session.protocol.isProtocolHandled("jnd-asset")) session.protocol.handle("jnd-asset", serveSharedAsset);
      } catch (error) {
        log("shared asset scheme failed", error?.message || error);
      }
    }
    normalizeUserAgent(session);
    installSessionHooks(session);
    session.setPermissionRequestHandler((_wc, permission, callback, details) => {
      if (permission === "openExternal") {
        let scheme = "";
        try {
          scheme = new URL(String(details?.externalURL || "")).protocol;
        } catch (_) {
        }
        log("external protocol blocked", scheme || "?");
        callback(false);
        return;
      }
      callback(true);
    });
  }
  function installSessionHooks(session) {
    const started = /* @__PURE__ */ new Map();
    installRequestHooks(session, started);
    const loginApi = { urls: ["https://web-login-api.sanguosha.com/*", "https://web-login-apitest.sanguosha.com/*"] };
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
  function removeSessionHooks(session) {
    for (const ev of ["onBeforeRequest", "onCompleted", "onErrorOccurred", "onHeadersReceived"]) {
      try {
        session.webRequest[ev](null);
      } catch (_) {
      }
    }
  }
  function showErrorPage(contents, text, error) {
    if (contents.isDestroyed()) return;
    if (error?.code === "ERR_ABORTED" || error?.errno === -3) {
      log("login-trace navigation superseded webContents=", contents.id);
      return;
    }
    const html = `<meta charset="utf-8"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1a1a1a;color:#fff;font:13px/1.7 'Segoe UI Variable Text','Segoe UI','Microsoft YaHei UI',sans-serif;text-align:center"><div><h2 style="margin:0 0 6px;font-size:14px;font-weight:400">页面没能加载</h2><p style="margin:0;color:rgba(255,255,255,.78)">${escapeHtml(text)}</p><p style="margin:14px 0 0;color:rgba(255,255,255,.45);font-size:11px">详情已写入程序目录的 ${escapeHtml(channel.logName)}</p></div></body>`;
    clearImmediate(pendingErrorPages.get(contents));
    const pending = setImmediate(() => {
      if (pendingErrorPages.get(contents) !== pending) return;
      pendingErrorPages.delete(contents);
      if (contents.isDestroyed()) return;
      contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error2) => log("error page failed", error2?.message || error2));
    });
    pendingErrorPages.set(contents, pending);
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
    const chromeBounds = record.covered ? { x: 0, y: 0, width, height } : { x: 0, y: 0, width, height: win.isFullScreen() ? 0 : TITLE_HEIGHT };
    const chromeKey = JSON.stringify(chromeBounds);
    if (record.chromeKey !== chromeKey) {
      record.chromeKey = chromeKey;
      record.chrome.setBounds(chromeBounds);
    }
    const bounds = viewportBounds(width, height, win.isFullScreen());
    const viewKey = JSON.stringify(bounds);
    if (record.viewKey !== viewKey) {
      record.viewKey = viewKey;
      for (const [, tab] of record.tabs) if (!tab.contents.isDestroyed()) tab.view.setBounds(bounds);
    }
    record.overlays.relayout();
  }
  let recorderWin = null;
  const RECORDER_LABELS = { idle: "未录制", recording: "录制中", paused: "已暂停", stopped: "已停止" };
  function recorderPage() {
    return `<!doctype html><meta charset="utf-8"><title>登录录制器</title><style>
      body{margin:0;padding:14px 16px;font:13px/1.6 -apple-system,"PingFang SC","Segoe UI","Microsoft YaHei UI",sans-serif;color:#1b1b1f;background:#fff;-webkit-user-select:none;user-select:none}
      .st{display:flex;align-items:center;gap:8px;height:22px}.dot{width:8px;height:8px;border-radius:50%;background:#c9c9cd}.rec .dot{background:#cd8676}
      .n{color:#5c5c63;margin-left:auto}.err{min-height:20px;color:#b4534a;font-size:12px}
      .row{display:flex;gap:6px;margin-top:8px}button{flex:1;height:28px;font:inherit;border:1px solid #e1e1e3;background:#fff;color:#1b1b1f;border-radius:6px;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
      button:hover:not(:disabled){background:#f3f3f3}button:disabled{color:#b8b8bd;cursor:default}
    </style><div class="st" id="st"><span class="dot"></span><span id="label"></span><span class="n" id="n"></span></div><div class="err" id="err"></div>
    <div class="row"><button id="start">录制</button><button id="pause">暂停</button><button id="resume">继续</button><button id="stop">停止</button></div>
    <div class="row"><button id="clear">清空</button><button id="copy">复制</button><button id="export">导出</button></div>
    <script>
      const L=${JSON.stringify(RECORDER_LABELS)};const $=id=>document.getElementById(id);
      for(const id of ['start','pause','resume','stop','clear','copy','export'])$(id).onclick=()=>window.jndRecorder.cmd(id);
      window.jndRecorder.onState(s=>{$('label').textContent=L[s.status]||s.status;$('n').textContent=s.count+' 条'+(s.dropped?'（最早的 '+s.dropped+' 条已滚出）':'');$('err').textContent=s.error||s.note||'';
        $('st').className='st'+(s.status==='recording'?' rec':'');
        $('start').disabled=s.status==='recording'||s.status==='paused';$('pause').disabled=s.status!=='recording';$('resume').disabled=s.status!=='paused';$('stop').disabled=!(s.status==='recording'||s.status==='paused');
        $('clear').disabled=$('copy').disabled=$('export').disabled=!s.count;});
    </script>`;
  }
  let recorderNote = "";
  function pushRecorderState() {
    if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send("jnd-recorder-state", { ...loginRecorder.state(), note: recorderNote });
  }
  loginRecorder.onChange(pushRecorderState);
  function openLoginRecorder() {
    if (app.isPackaged && process.env.JND_DEV !== "1") return;
    if (recorderWin && !recorderWin.isDestroyed()) {
      if (recorderWin.isMinimized()) recorderWin.restore();
      recorderWin.show();
      recorderWin.focus();
      return;
    }
    recorderWin = new BrowserWindow({
      width: 360,
      height: 168,
      useContentSize: true,
      title: "登录录制器",
      resizable: false,
      maximizable: false,
      minimizable: true,
      fullscreenable: false,
      alwaysOnTop: true,
      show: false,
      backgroundColor: "#ffffff",
      webPreferences: { preload: path.join(__dirname, "recorder-preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    recorderWin.setMenuBarVisibility?.(false);
    recorderWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(recorderPage())}`).catch((error) => log("recorder load failed", error?.message || error));
    recorderWin.once("ready-to-show", () => recorderWin?.show());
    recorderWin.on("closed", () => {
      recorderWin = null;
    });
    log("login recorder opened");
  }
  function installRecorderIpc() {
    ipcMain.on("jnd-recorder-cmd", async (event, cmd) => {
      if (!recorderWin || event.sender !== recorderWin.webContents) return;
      recorderNote = "";
      try {
        if (cmd === "start") loginRecorder.start();
        else if (cmd === "pause") loginRecorder.pause();
        else if (cmd === "resume") loginRecorder.resume();
        else if (cmd === "stop") loginRecorder.stop();
        else if (cmd === "clear") loginRecorder.clear();
        else if (cmd === "copy") {
          clipboard.writeText(loginRecorder.dump());
          recorderNote = "已复制到剪贴板";
        } else if (cmd === "export") {
          const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
          const r = process.env.JND_RECORDER_EXPORT_PATH ? { canceled: false, filePath: process.env.JND_RECORDER_EXPORT_PATH } : await dialog.showSaveDialog(recorderWin, { defaultPath: path.join(app.getPath("downloads"), `锦囊妙计-登录录制-${stamp}.json`), filters: [{ name: "JSON", extensions: ["json"] }] });
          if (!r.canceled && r.filePath) {
            fs.writeFileSync(r.filePath, loginRecorder.dump());
            recorderNote = `已导出：${path.basename(r.filePath)}`;
          }
        }
        loginRecorder.setError("");
      } catch (error) {
        loginRecorder.setError(`${cmd === "export" ? "导出" : cmd === "copy" ? "复制" : "操作"}失败：${error?.message || error}`);
        log("login recorder error", cmd, error?.message || error);
      }
      pushRecorderState();
    });
  }
  function isFullscreenEsc(win, input) {
    return input.type === "keyDown" && input.key === "Escape" && !input.control && !input.meta && !input.alt && !input.shift && !win.isDestroyed() && win.isFullScreen();
  }
  function raiseTab(record, tab) {
    const cv = record.win.contentView;
    try {
      cv.addChildView(tab.view);
      cv.addChildView(record.chrome);
      record.overlays.raise();
      if (tab.webSheet) cv.addChildView(tab.webSheet.view);
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
    const tab = { id: msg.id, owner: record, view, contents, slot, entryId: entry.id, pendingCredential: null, loginProvider: null, loginRequest: 0, loginSeen: "", loginRetries: 0, qrModel: null, preferredAccount: String(msg.account || ""), lastAccount: "", muted: false, nick: "", uid: "" };
    record.tabs.set(msg.id, tab);
    const { win } = record;
    win.contentView.addChildView(view, 0);
    try {
      view.setBackgroundColor("#fafafa");
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
      view.setBounds(viewportBounds(width, height, win.isFullScreen()));
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
    contents.on("dom-ready", () => {
      if (!landingPack || !landingPack.isDoc(contents.getURL())) return;
      setTimeout(() => {
        if (contents.isDestroyed() || !landingPack?.isDoc(contents.getURL())) return;
        contents.executeJavaScript(`(() => { const v = document.getElementById("sgsBgVideo"), d = document.getElementById("sgsVideoImg"); const m = d && /url\\(["']?([^"')]+)/.exec(d.style.backgroundImage || ""); return { mp4: v ? v.getAttribute("src") : "", img: m ? m[1] : "" }; })()`, true).then((bg) => landingPack?.noteBackground(bg)).catch(() => {
        });
      }, 4e3);
    });
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
        contents.insertCSS("::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}" + landingTrimCss(parsed.hostname)).catch((error) => log("landing css failed", error?.message || error));
      }
    });
    contents.on("did-start-navigation", (_event, _url, inPlace, isMainFrame) => {
      if (isMainFrame && !inPlace) {
        tab.loginBridgeReady = false;
        clearImmediate(pendingErrorPages.get(contents));
        pendingErrorPages.delete(contents);
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
      if (/JND-MICRO|锦囊袋|注入|统一登录器/i.test(message) || /jnd-plugin-/.test(String(sourceId || "")) || level >= 2 && /\.user\.js/.test(String(sourceId || ""))) {
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
      if (isFullscreenEsc(tab.owner.win, input)) {
        event.preventDefault();
        log("fullscreen esc from=game");
        tab.owner.win.setFullScreen(false);
        return;
      }
      if (handleMacEditShortcut(contents, input, tab.owner.win)) {
        event.preventDefault();
        return;
      }
      const name = shortcutName(input);
      if (!name) return;
      event.preventDefault();
      chromeSend(tab.owner, "jnd-chrome-command", name);
    });
    if (known && msg.restored) log("login-trace restore slot=", slot, "entry=", entry.id, "provider=", providerId || "-", "status=", known.status, "nick=", known.nick ? "yes" : "no", "gmSession=", fs.existsSync(path.join(gmStoreDirectory(), `slot-${slot}`, "unified-login.json")) ? "file" : "none");
    if (providerId && !msg.restored) startProviderLogin(tab.owner, tab, providerId);
    else loadEntry(contents, entryUrl(entry)).catch((error) => {
      log("loadURL-threw", error?.message || error);
      showErrorPage(contents, `无法加载入口：${error?.message || error}`, error);
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
    if (c && input.shift && input.alt && input.code === "KeyR") return "recorder";
    if (c && input.shift && k === "a") return "tabList";
    if (c && input.shift && k === "m") return "pm";
    if (c && input.shift && k === "s") return "settings";
    if (c && !input.shift && k === "t") return "newTab";
    if (c && !input.shift && k === "w") return "closeTab";
    if (c && k === "tab") return input.shift ? "prevTab" : "nextTab";
    if (input.alt && k === "f") return "menu";
    if (!IS_MAC && k === "f11") return "fullscreen";
    if (IS_MAC && input.control && input.meta && k === "f") return "fullscreen";
    return null;
  }
  const partitionName = (slot) => `persist:jinnangdai-${channel.id}-${slot}`;
  function wipeSlot(slot) {
    try {
      const ses = electron_.session.fromPartition(partitionName(slot));
      ses.clearStorageData().catch((error) => log("wipe slot failed", slot, error?.message || error));
      ses.clearCache().catch((error) => log("wipe slot cache failed", slot, error?.message || error));
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
    tab.webSheet?.close("tab-closed");
    record.tabs.delete(id);
    record.order = record.order.filter((x) => x !== id);
    clearTimeout(recoveryTimers.get(tab.contents));
    recoveryTimers.delete(tab.contents);
    if (record.active === tab && record.tabs.size > 0) {
      record.active = null;
      dropLeaving(record);
      try {
        tab.contents.setAudioMuted(true);
      } catch (_) {
      }
      record.leaving = tab;
      record.leavingTimer = setTimeout(() => dropLeaving(record), 1200);
    } else disposeTabView(record, tab);
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
  function disposeTabView(record, tab) {
    try {
      record.win.contentView.removeChildView(tab.view);
    } catch (_) {
    }
    if (!tab.contents.isDestroyed()) tab.contents.close({ waitForBeforeUnload: false });
  }
  function dropLeaving(record) {
    clearTimeout(record.leavingTimer);
    record.leavingTimer = null;
    const tab = record.leaving;
    record.leaving = null;
    if (tab) disposeTabView(record, tab);
  }
  async function whenPainted(tab, budgetMs) {
    const until = Date.now() + budgetMs, contents = tab.contents;
    while (Date.now() < until && !contents.isDestroyed()) {
      try {
        const b = tab.view.getBounds();
        const img = await Promise.race([contents.capturePage({ x: Math.floor(b.width / 2), y: Math.floor(b.height / 2), width: 1, height: 1 }), new Promise((r) => setTimeout(() => r(null), 120))]);
        if (img && !img.isEmpty()) return true;
      } catch (_) {
      }
      await new Promise((r) => setTimeout(r, 16));
    }
    return false;
  }
  function activateTab(record, id, kind) {
    for (const [, other] of record.tabs) if (other.id !== id) other.webSheet?.close("tab-switched");
    record.cur = id;
    record.curKind = kind;
    setTitle(record);
    const tab = record.tabs.get(id);
    if (!tab || kind !== "game" || tab.contents.isDestroyed()) return;
    const settle = () => {
      if (record.closing || record.win.isDestroyed() || record.cur !== id || record.curKind !== "game" || record.tabs.get(id) !== tab || tab.owner !== record || tab.contents.isDestroyed()) return;
      raiseTab(record, tab);
      record.active = tab;
      dropLeaving(record);
      for (const [, other] of record.tabs) if (other !== tab && !other.contents.isDestroyed()) {
        try {
          other.view.setVisible(false);
        } catch (_) {
        }
      }
      restoreWindowFocus(record);
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
    const t0 = Date.now();
    const budget = tab.shownOnce ? 600 : 300;
    tab.shownOnce = true;
    whenPainted(tab, budget).then((ok) => {
      log("tab shown slot=", tab.slot, "painted=", ok, "ms=", Date.now() - t0);
      settle();
    }, settle);
  }
  function detachTab(record, msg) {
    if (msg.kind && msg.kind !== "game") {
      const [width2, height2] = record.win.getSize();
      const PAGE_LEFT = 102 + (IS_MAC ? MAC_INSET : 0);
      const target2 = createWindow({ pageKind: msg.kind, bounds: { x: Math.round(Number(msg.x) - Number(msg.grabX) - PAGE_LEFT), y: Math.round(Number(msg.y) - TITLE_HEIGHT / 2), width: width2, height: height2 } });
      const next2 = windows.get(target2);
      if (next2) startFollow(next2, Number(msg.grabX) + PAGE_LEFT, TITLE_HEIGHT / 2, true);
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
    const TAB_LEFT = 102 + (IS_MAC ? MAC_INSET : 0);
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
    const card = tab.qrModel;
    if (card) chromeSend(tab.owner, "jnd-chrome-qr", { action: "close", id: tab.id });
    tab.id = id;
    tab.owner = record;
    record.tabs.set(id, tab);
    record.order.push(id);
    if (card && tab.loginProvider) chromeSend(record, "jnd-chrome-qr", { action: "open", id, ...card });
    else tab.qrModel = null;
    record.win.contentView.addChildView(tab.view, 0);
    registerTaskWindow(record);
    const { width, height } = record.win.getContentBounds();
    tab.view.setBounds(viewportBounds(width, height, record.win.isFullScreen()));
    try {
      tab.view.setVisible(true);
    } catch (_) {
    }
    pushTabState(record, tab);
    return true;
  }
  function commitLogin(tab, why) {
    try {
      void tab.contents.session.cookies.flushStore().catch((error) => log("cookie flush failed", tab.slot, error?.message || error));
    } catch (_) {
    }
    for (const key of [...gmFlushTimers.keys()]) if (key.startsWith(`slot-${tab.slot}/`)) {
      clearTimeout(gmFlushTimers.get(key));
      gmWrite(key);
    }
    log("login-trace commit slot=", tab.slot, "why=", why);
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
    const was = getContainer(tab.slot);
    const from = `${tab.entryId}${was.provider ? "+" + was.provider : ""}`;
    tab.entryId = entry.id;
    setContainer(tab.slot, { entryId: entry.id, provider: "", nick: "", uid: "", status: "none" });
    tab.pendingCredential = null;
    if (tab.loginProvider) {
      tab.loginProvider = null;
      qrClose(record, tab, "switch-entry");
    }
    writeSettings({ guideDone: true });
    setTitle(record);
    log("login-trace switch entry slot=", tab.slot, "from=", from, "to=", entry.id, "logout=", Boolean(opts.logout), entry.verified ? "" : "(unverified)");
    const go = () => loadEntry(tab.contents, entryUrl(entry)).catch((error) => showErrorPage(tab.contents, `无法加载入口：${error?.message || error}`, error));
    if (opts.logout) logoutSlot(tab).then(go);
    else go();
  }
  function qrUpdate(tab, model) {
    tab.qrModel = model;
    chromeSend(tab.owner, "jnd-chrome-qr", { action: "update", id: tab.id, ...model });
  }
  function qrOpen(record, tab, provider) {
    tab.loginSeen = "loading";
    const model = { provider: provider.label, stage: "loading", qr: "", text: "" };
    if (tab.qrModel) {
      qrUpdate(tab, model);
      return;
    }
    tab.qrModel = model;
    chromeSend(record, "jnd-chrome-qr", { action: "open", id: tab.id, ...model });
    log("login-trace qr open slot=", tab.slot, "provider=", provider.id);
  }
  function qrClose(record, tab, reason) {
    tab.qrModel = null;
    chromeSend(record, "jnd-chrome-qr", { action: "close", id: tab.id });
    log("login-trace qr close slot=", tab.slot, "reason=", reason);
  }
  function qrStage(tab, state) {
    const stage = String(state?.stage || "");
    if (state?.error) return "error";
    if (/captcha|identify/i.test(stage)) return "yield";
    if (stage === "entry_config") return "entering";
    if (stage === "waiting_confirmation") return "confirm";
    if (state?.qr && /_poll$/.test(stage) && tab.loginSeen === "confirm") return "confirm";
    if (state?.qr) return "scan";
    if (/check|validate|judge|verify_done|verify_prepare/i.test(stage)) return "verify";
    if (tab.loginSeen === "entering") return "entering";
    if (["scan", "confirm", "exchanging", "yield", "verify"].includes(tab.loginSeen)) return "exchanging";
    return "loading";
  }
  function loginStateMatches(tab, state) {
    return Boolean(tab.loginProvider && state?.requestId === tab.loginRequest && state.requestProvider === tab.loginProvider && (!state.provider || state.provider === tab.loginProvider));
  }
  const WEB_TITLES = { steam: "Steam 账号登录", oppo: "OPPO 账号登录", vivo: "vivo 账号登录", xiaomi: "小米账号登录", qq: "QQ 账号登录", huawei: "华为账号登录", honor: "荣耀账号登录" };
  const WEB_WIDTH = { huawei: 880, honor: 880 };
  const webUrlWaiters = /* @__PURE__ */ new Map();
  let webUrlSeq = 0;
  function requestWebURL(tab, provider) {
    return new Promise((resolve) => {
      const reqId = ++webUrlSeq;
      const timer = setTimeout(() => {
        webUrlWaiters.delete(reqId);
        resolve({ url: "", error: "BRIDGE_TIMEOUT" });
      }, 4e3);
      webUrlWaiters.set(reqId, { sender: tab.contents, done: (m) => {
        clearTimeout(timer);
        resolve({ url: String(m?.url || ""), error: String(m?.error || "") });
      } });
      try {
        tab.contents.send("jnd-login-web-url", { provider, reqId });
      } catch (_) {
        clearTimeout(timer);
        webUrlWaiters.delete(reqId);
        resolve({ url: "", error: "SEND_FAILED" });
      }
    });
  }
  function webCallback(provider, raw) {
    let u;
    try {
      u = new URL(raw);
    } catch (_) {
      return null;
    }
    if (provider === "steam") return u.origin === "https://10th-ly-login.sanguosha.com" && u.pathname === "/steam/oauth/callback.html" && /access_token=/.test(u.hash) ? { href: u.href } : null;
    if (provider === "qq") return u.origin === "https://imgcache.qq.com" && u.pathname === "/open/connect/widget/mobile/login/proxy.htm" || u.protocol === "auth:" && u.host === "tauth.qq.com" ? { href: u.href } : null;
    if (provider === "huawei") return u.protocol === "com.huawei.apps.111830943:" && u.pathname === "/oauth2redirect" && /[?&]code=/.test(u.search) ? { href: u.href } : null;
    if (provider === "honor") return u.protocol === "hms:" && u.host === "redirect_url" && u.pathname === "" && /[?&]code=/.test(raw) ? { href: raw } : null;
    if (provider === "xiaomi") return u.origin === "http://game.xiaomi.com" && u.pathname === "/oauthcallback/mioauth" && u.searchParams.get("code") ? { href: u.href } : null;
    if (provider === "oppo") {
      if (u.origin !== "https://game-login.heytap.com" || !u.pathname.startsWith("/game-union-h5/h5/client-login/")) return null;
      const params = new URLSearchParams(u.search);
      const hash = u.hash.replace(/^#/, "");
      const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
      try {
        for (const [k, v] of new URLSearchParams(q)) if (!params.has(k)) params.set(k, v);
      } catch (_) {
      }
      const code = String(params.get("code") || "");
      return /^[A-Za-z0-9+/=_.~-]{8,4096}$/.test(code) ? { code } : null;
    }
    return null;
  }
  async function openWebSheet(record, tab) {
    const provider = String(tab.loginProvider || "");
    if (!WEB_TITLES[provider] || tab.webSheet || tab.contents.isDestroyed()) return;
    const loginRequest = tab.loginRequest, openSeq = tab.webOpenSeq = (tab.webOpenSeq || 0) + 1;
    const { url, error } = await requestWebURL(tab, provider);
    if (tab.webOpenSeq !== openSeq || tab.owner !== record || record.closing || tab.loginProvider !== provider || tab.loginRequest !== loginRequest) return;
    if (!url || !/^https:\/\//.test(url) || tab.webSheet || tab.contents.isDestroyed()) {
      log("login-trace web open failed slot=", tab.slot, provider, error || "no-url");
      return;
    }
    const ses = tab.contents.session;
    const view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      view.setBackgroundColor("#ffffff");
      view.setBorderRadius?.(5);
      view.setVisible(false);
    } catch (_) {
    }
    const wc = view.webContents;
    let done = false;
    let vivoBase = "", cookieTimer = null;
    const vivoUrl = "https://joint.vivo.com.cn/game-subaccount-login/";
    const readVivo = async () => {
      const list = await ses.cookies.get({ url: vivoUrl }).catch(() => []);
      const get = (n) => String(list.find((c) => c.name === n)?.value || "");
      return { subOpenId: get("vvf_subopenid"), openToken: get("vvf_opentoken") };
    };
    const onCookie = (_e, cookie, _cause, removed) => {
      if (removed || done || !/^(vvf_subopenid|vvf_opentoken)$/.test(cookie?.name || "") || !/(^|\.)vivo\.com\.cn$/.test(String(cookie?.domain || "").replace(/^\./, ""))) return;
      if (cookieTimer) clearTimeout(cookieTimer);
      cookieTimer = setTimeout(async () => {
        const v = await readVivo();
        if (!done && v.subOpenId && v.openToken && `${v.subOpenId}
${v.openToken}` !== vivoBase) finish(v);
      }, 800);
    };
    const close = (reason) => {
      if (tab.webSheet !== sheet) return;
      tab.webSheet = null;
      done = true;
      if (cookieTimer) clearTimeout(cookieTimer);
      try {
        ses.cookies.removeListener("changed", onCookie);
      } catch (_) {
      }
      try {
        record.win.contentView.removeChildView(view);
      } catch (_) {
      }
      if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false });
      chromeSend(record, "jnd-chrome-websheet", { action: "close", id: tab.id });
      log("login-trace web close slot=", tab.slot, provider, "reason=", reason);
      if (reason !== "done") restoreWindowFocus(tab.owner);
    };
    const finish = (payload) => {
      if (done) return;
      done = true;
      close("done");
      if (tab.contents.isDestroyed() || tab.loginProvider !== provider || tab.loginRequest !== loginRequest || tab.owner !== record) return;
      const requestId = ++tab.loginRequest;
      tab.loginStartedFor = requestId;
      tab.loginSeen = "exchanging";
      tab.loginRetries = 0;
      log("login-trace web finish slot=", tab.slot, provider);
      qrUpdate(tab, { provider: providerById(provider)?.label || "", stage: "exchanging", qr: "", text: "" });
      tab.contents.send("jnd-login-web-finish", { provider, requestId, web: payload });
    };
    const sheet = { view, provider, close };
    tab.webSheet = sheet;
    if (provider === "vivo") {
      const v = await readVivo();
      vivoBase = `${v.subOpenId}
${v.openToken}`;
      ses.cookies.on("changed", onCookie);
    }
    const watch = (event, raw) => {
      const result = webCallback(provider, String(raw || ""));
      if (result) {
        try {
          event?.preventDefault?.();
        } catch (_) {
        }
        finish(result);
      }
    };
    wc.on("will-redirect", (e, u) => watch(e, u));
    wc.on("will-navigate", (e, u) => watch(e, u));
    wc.on("did-start-navigation", (e, u, _inPage, isMain) => {
      if (isMain) watch(null, u);
    });
    wc.on("did-navigate-in-page", (_e, u, isMain) => {
      if (isMain) watch(null, u);
    });
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("dom-ready", () => {
      wc.insertCSS("::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}").catch(() => {
      });
    });
    wc.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        close("esc");
      }
    });
    wc.on("did-fail-load", (_e, code, desc, failedUrl, isMain) => {
      if (isMain && !done) {
        const result = webCallback(provider, String(failedUrl || ""));
        if (result) {
          finish(result);
          return;
        }
      }
      if (!isMain || code === -3 || done) return;
      log("login-trace web load failed slot=", tab.slot, provider, "code=", code);
      showErrorPage(wc, `${WEB_TITLES[provider].replace(" 账号登录", "")} 官方登录页没能打开（${desc || code}）`, { code: desc, errno: code });
    });
    chromeSend(record, "jnd-chrome-websheet", { action: "open", id: tab.id, title: WEB_TITLES[provider], provider: providerById(provider)?.label || "", width: WEB_WIDTH[provider] || 440 });
    log("login-trace web open slot=", tab.slot, provider);
    wc.loadURL(url).catch(() => {
    });
  }
  function startProviderLogin(record, tab, providerId, opts = {}) {
    const provider = providerById(providerId);
    if (!provider || tab.contents.isDestroyed()) return;
    if (tab.loginProvider === provider.id) {
      log("login-trace provider re-pick ignored slot=", tab.slot, provider.id);
      return;
    }
    const requestId = ++tab.loginRequest;
    tab.loginProvider = provider.id;
    tab.loginSeen = "";
    tab.loginRetries = 0;
    setContainer(tab.slot, { entryId: "guanfu", provider: provider.id, nick: "", uid: "", status: "none" });
    log("login-trace provider pick slot=", tab.slot, "provider=", provider.id, "logout=", Boolean(opts.logout), opts.reload ? "reload" : "");
    qrOpen(record, tab, provider);
    setTimeout(() => {
      if (tab.contents.isDestroyed() || tab.loginRequest !== requestId || tab.loginProvider !== provider.id || tab.loginStartedFor === requestId) return;
      tab.loginSeen = "error";
      log("login-trace bridge timeout slot=", tab.slot, "provider=", provider.id);
      qrUpdate(tab, { provider: provider.label, stage: "error", qr: "", text: "", code: "LOGIN_BRIDGE_UNAVAILABLE" });
    }, 3e4);
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
      if (tab.loginStartedFor === requestId || !tab.loginBridgeReady || contents.isDestroyed() || tab.loginProvider !== provider.id || tab.loginRequest !== requestId) return;
      tab.loginStartedFor = requestId;
      contents.send("jnd-login-start", { provider: provider.id, requestId });
    };
    tab.loginBegin = begin;
    const official = entryById("guanfu");
    if (tab.entryId !== official.id) {
      tab.entryId = official.id;
      setTitle(record);
    }
    const navigate = () => {
      if (contents.isDestroyed() || tab.loginRequest !== requestId) return;
      if (!tab.loginNavigation) {
        const pending = loadEntry(contents, entryUrl(official));
        tab.loginNavigation = pending;
        void pending.finally(() => {
          if (tab.loginNavigation === pending) tab.loginNavigation = null;
        }).catch(() => {
        });
      }
      tab.loginNavigation.then(begin, (error) => {
        if (!contents.isDestroyed() && tab.loginRequest === requestId) showErrorPage(contents, `无法加载入口：${error?.message || error}`, error);
      });
    };
    if (opts.logout) {
      void (tab.loginNavigation || Promise.resolve()).catch(() => {
      }).then(async () => {
        if (contents.isDestroyed() || tab.loginRequest !== requestId) return;
        await logoutSlot(tab);
        navigate();
      });
      return;
    }
    if (!opts.reload && onLoginPage() && tab.loginBridgeReady) {
      begin();
      return;
    }
    if (tab.loginNavigation) {
      navigate();
      return;
    }
    if (!opts.reload && onLoginPage()) return;
    navigate();
  }
  function cancelProviderLogin(record, tab, reason) {
    if (!tab.loginProvider) return;
    const picked = tab.loginProvider;
    tab.loginProvider = null;
    qrClose(record, tab, reason);
    if (!tab.contents.isDestroyed()) tab.contents.send("jnd-login-cancel");
    setContainer(tab.slot, { entryId: "guanfu", provider: "", status: "none", nick: "", uid: "" });
    log("login-trace cancel slot=", tab.slot, "reason=", reason, "was=", picked, "now= guanfu");
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
  function registerTaskWindow(record) {
    const { win } = record;
    if (process.platform !== "win32" || record.closing || win.isDestroyed()) return;
    try {
      win.setParentWindow(null);
      win.setSkipTaskbar(false);
      log("window-shell registration requested id=", win.id, "visible=", win.isVisible(), "focusable=", win.isFocusable());
    } catch (error) {
      log("window-shell registration failed id=", win.id, "code=", error?.code || "WINDOW_REGISTRATION_FAILED");
    }
  }
  function focusContents(record, contents) {
    if (record.closing || record.win.isDestroyed() || !record.win.isVisible() || !record.win.isFocused() || !contents || contents.isDestroyed()) return;
    try {
      if (!contents.isFocused()) contents.focus();
    } catch (_) {
    }
  }
  function restoreWindowFocus(record) {
    const tab = record.cur !== null ? record.tabs.get(record.cur) : null;
    const contents = record.chromeKeys || record.curKind !== "game" ? record.chromeContents : tab?.webSheet?.view.webContents || tab?.contents;
    focusContents(record, contents);
  }
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
      /* Windows：标题栏连同右上三键都由 chrome 视图自绘。macOS（作者 10-21）：保留系统红绿灯，标题栏其余部分仍自绘 */
      ...IS_MAC ? { titleBarStyle: "hidden", trafficLightPosition: { ...MAC_LIGHTS } } : { frame: false },
      autoHideMenuBar: true,
      focusable: true,
      skipTaskbar: false,
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
    registerTaskWindow(record);
    win.on("show", () => registerTaskWindow(record));
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
    chrome.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(chromeDocument("锦囊妙计 · 一将成名", iconPng, process.platform))}`).catch((error) => {
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
    const windowState = () => chromeSend(record, "jnd-chrome-window-state", { maximized: win.isMaximized(), focused: win.isFocused(), fullscreen: win.isFullScreen() });
    win.on("focus", () => {
      windowState();
      restoreWindowFocus(record);
    });
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
    win.on("enter-full-screen", () => {
      windowState();
      relayout();
      const tab = record.cur !== null ? record.tabs.get(record.cur) : null;
      log("fullscreen enter focus=", win.webContents.isFocused() ? "frame" : record.chromeContents.isFocused() ? "chrome" : tab && !tab.contents.isDestroyed() && tab.contents.isFocused() ? "game" : "none", "covered=", record.covered);
      if (!record.covered && tab && record.curKind === "game") restoreWindowFocus(record);
    });
    win.on("leave-full-screen", () => {
      log("fullscreen leave");
      windowState();
      relayout();
    });
    win.webContents.on("before-input-event", (event, input) => {
      if (isFullscreenEsc(win, input)) {
        event.preventDefault();
        log("fullscreen esc from=frame");
        win.setFullScreen(false);
      }
    });
    chrome.webContents.on("before-input-event", (event, input) => {
      if (!record.covered && isFullscreenEsc(win, input)) {
        event.preventDefault();
        log("fullscreen esc from=chrome");
        win.setFullScreen(false);
      }
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
      if (process.platform === "win32") try {
        win.setSkipTaskbar(true);
      } catch (_) {
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
          qrClose(record, tab, "logout-all");
        }
        const entry = entryById(tab.entryId) || ENTRIES[0];
        loadEntry(tab.contents, entryUrl(entry)).catch((error) => log("logout reload failed", error?.message || error));
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
    gmFlushTimers.set(componentId, setTimeout(() => gmWrite(componentId), 300));
  }
  function gmFlushAll() {
    for (const componentId of [...gmFlushTimers.keys()]) {
      clearTimeout(gmFlushTimers.get(componentId));
      gmWrite(componentId);
    }
  }
  function gmWrite(componentId) {
    {
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
    }
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
        fullscreen: record ? record.win.isFullScreen() : false,
        feedback: Boolean(channel.feedbackUrl),
        closed: closedRows()
      };
    });
    ipcMain.on("jnd-chrome-ready", (event) => {
      const record = windowOfChrome(event.sender);
      if (record) {
        record.ready = true;
        layoutWindow(record);
      }
    });
    ipcMain.on("jnd-chrome-cover", (event, full, keys) => {
      const record = windowOfChrome(event.sender);
      if (!record) return;
      const covered = Boolean(full), chromeKeys = covered && keys !== false;
      log("chrome-cover", covered ? "full" : "bar", chromeKeys ? "keys=chrome" : "keys=game");
      if (record.covered !== covered) {
        record.covered = covered;
        layoutWindow(record);
      }
      const wasKeys = Boolean(record.chromeKeys);
      record.chromeKeys = chromeKeys;
      const tab = record.cur !== null ? record.tabs.get(record.cur) : null;
      try {
        if (chromeKeys && !wasKeys) restoreWindowFocus(record);
        else if (!chromeKeys && (wasKeys || !covered && record.chromeContents.isFocused()) && tab && record.curKind === "game") restoreWindowFocus(record);
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
        if (win.isFullScreen()) win.setFullScreen(false);
        else if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      } else if (cmd === "fullscreen") win.setFullScreen(!win.isFullScreen());
      else if (cmd === "recorder") openLoginRecorder();
      else if (cmd === "close") {
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
        const request = net.request({ url: channel.feedbackUrl, method: "POST", useSessionCookies: false });
        request.setHeader("Content-Type", "application/json");
        const timer = setTimeout(() => {
          request.abort();
          reject(new Error("连接超时"));
        }, 2e4);
        request.on("response", (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            clearTimeout(timer);
            const buf = Buffer.concat(chunks);
            if (res.statusCode === 200) resolve(buf);
            else reject(new Error(`HTTP ${res.statusCode}`));
          });
        });
        request.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
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
      if (state?.loggedIn && found.tab.loginProvider) return;
      if (state?.loggedIn) {
        const patch = { status: "landing", entryId: found.tab.entryId };
        if (state.nickname) patch.nick = String(state.nickname);
        setContainer(slot, patch);
        commitLogin(found.tab, "landing");
        log("login-trace landing slot=", slot, "loggedIn=", true, "nick=", state.nickname ? "yes" : "no", "provider=", state.provider || "");
      } else {
        setContainer(slot, { status: "none", nick: "", uid: "" });
        log("login-trace landing slot=", slot, "loggedIn=", false);
      }
    });
    ipcMain.on("jnd-login-bridge-ready", (event) => {
      const found = tabOf(event.sender);
      if (!found) return;
      const tab = found.tab;
      tab.loginBridgeReady = true;
      if (tab.loginProvider && tab.loginStartedFor === tab.loginRequest) {
        const requestId = ++tab.loginRequest;
        tab.loginStartedFor = requestId;
        tab.loginSeen = "loading";
        tab.loginRetries = 0;
        qrUpdate(tab, { provider: providerById(tab.loginProvider)?.label || "", stage: "loading", qr: "", text: "" });
        log("login-trace restart after page reload slot=", tab.slot, "provider=", tab.loginProvider);
        tab.contents.send("jnd-login-start", { provider: tab.loginProvider, requestId });
        return;
      }
      tab.loginBegin?.();
    });
    ipcMain.on("jnd-login-state", (event, state) => {
      const found = tabOf(event.sender);
      if (!found || !loginStateMatches(found.tab, state)) return;
      if (state?.error) log("login-error slot=", found?.tab.slot, "provider=", state.provider, "stage=", state.stage, JSON.stringify(state.error));
      const { record, tab } = found;
      if (String(state?.stage || "") === "ready") {
        const picked = tab.loginProvider;
        tab.loginProvider = null;
        qrClose(record, tab, "ready");
        commitLogin(tab, "ready");
        setContainer(tab.slot, { provider: String(state.provider || picked || ""), status: "landing" });
        log("login-trace ready slot=", tab.slot, "provider=", state.provider);
        return;
      }
      const code = String(state?.error?.code || "");
      const retryable = state?.error && (tab.loginSeen === "" || tab.loginSeen === "loading" || tab.loginSeen === "retrying") && /TIMEOUT|NETWORK|^ERR_/i.test(code);
      if (retryable && tab.loginRetries < 3) {
        tab.loginRetries += 1;
        tab.loginSeen = "retrying";
        const n = tab.loginRetries;
        const id = tab.loginProvider;
        const requestId = ++tab.loginRequest;
        log("login-trace retry-auto slot=", tab.slot, "n=", n, "code=", code);
        qrUpdate(tab, { provider: providerById(id)?.label || "", stage: "retrying", qr: "", text: "", retry: n });
        setTimeout(() => {
          if (tab.loginRequest !== requestId || tab.loginProvider !== id || tab.contents.isDestroyed()) return;
          tab.loginStartedFor = requestId;
          tab.contents.send("jnd-login-start", { provider: id, requestId });
        }, 1500);
        return;
      }
      if (tab.loginSeen === "retrying" && !state?.error && !state?.qr && !/ready/.test(String(state?.stage || ""))) return;
      const stage = qrStage(tab, state);
      if (stage !== tab.loginSeen || stage === "scan") {
        if (stage !== tab.loginSeen) log("login-trace stage slot=", tab.slot, "script=", state?.stage, "card=", stage, "qr=", state?.qr ? "yes" : "no", state?.error ? JSON.stringify(state.error) : "");
        tab.loginSeen = stage;
        qrUpdate(tab, { provider: providerById(tab.loginProvider)?.label || "", stage, qr: String(state?.qr || ""), text: String(state?.text || ""), code: String(state?.error?.code || "") });
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
      if (!record || !tab || !tab.loginProvider || tab.contents.isDestroyed()) return;
      const id = tab.loginProvider;
      if (tab.loginStartedFor !== tab.loginRequest) {
        log("login-trace retry reload slot=", tab.slot, id);
        tab.loginProvider = null;
        startProviderLogin(record, tab, id, { reload: true });
        return;
      }
      const requestId = ++tab.loginRequest;
      tab.loginStartedFor = requestId;
      log("login-trace retry slot=", tab.slot, id);
      tab.loginSeen = "loading";
      tab.loginRetries = 0;
      qrUpdate(tab, { provider: providerById(id)?.label || "", stage: "loading", qr: "", text: "" });
      tab.contents.send("jnd-login-start", { provider: id, requestId });
    });
    ipcMain.on("jnd-chrome-qr-web", (event, m) => {
      const record = [...windows.values()].find((r) => r.chrome.webContents === event.sender);
      const tab = record?.tabs.get(Number(m?.id));
      if (record && tab) void openWebSheet(record, tab);
    });
    ipcMain.on("jnd-chrome-websheet-rect", (event, m) => {
      const record = [...windows.values()].find((r) => r.chrome.webContents === event.sender);
      const tab = record?.tabs.get(Number(m?.id));
      const sheet = tab?.webSheet;
      if (!record || !sheet) return;
      const rect = { x: Math.round(Number(m.x)), y: Math.round(Number(m.y)), width: Math.round(Number(m.w)), height: Math.round(Number(m.h)) };
      if (!(rect.width > 0 && rect.height > 0)) return;
      try {
        sheet.view.setBounds(rect);
        record.win.contentView.addChildView(sheet.view);
        sheet.view.setVisible(true);
        if (record.cur === tab.id) restoreWindowFocus(record);
      } catch (_) {
      }
    });
    ipcMain.on("jnd-chrome-websheet-close", (event, m) => {
      const record = [...windows.values()].find((r) => r.chrome.webContents === event.sender);
      record?.tabs.get(Number(m?.id))?.webSheet?.close("user");
    });
    ipcMain.on("jnd-login-web-url-result", (event, m) => {
      const waiter = webUrlWaiters.get(Number(m?.reqId));
      if (waiter?.sender === event.sender) {
        webUrlWaiters.delete(Number(m.reqId));
        waiter.done(m);
      }
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
      if (nick || uid) commitLogin(found.tab, "identity");
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
    node_update_host_.useNet(net);
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
    gmHost = createGmRequestHost({
      log,
      net,
      isolatedSession: (index) => electron_.session.fromPartition(`jnd-gm-${process.pid}-${index}`, { cache: false }),
      trace: (e) => loginRecorder?.gm(e),
      steamDirect: createSteamDirectConnector({
        log,
        cacheFile: path.join(app.getPath("userData"), "steam-direct-addresses.json"),
        resolveProxy: (url) => electron_.session.defaultSession.resolveProxy(url)
      })
    });
    shellUpdateHost = createShellUpdateHost({
      log,
      net,
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
      const partitions = path.join(app.getPath("userData"), "Partitions");
      let removed = 0;
      for (const name of fs.existsSync(partitions) ? fs.readdirSync(partitions) : []) {
        if (!name.startsWith(prefix)) continue;
        const slot = Number(name.slice(prefix.length));
        if (!slot || keepSlots.has(slot)) continue;
        try {
          fs.rmSync(path.join(partitions, name), { recursive: true, force: true });
          removed += 1;
        } catch (error) {
          log("partition gc failed", slot, error?.message || error);
        }
        try {
          fs.rmSync(path.join(gmStoreDirectory(), `slot-${slot}`), { recursive: true, force: true });
        } catch (_) {
        }
        delete containers[slot];
      }
      let dropped = 0;
      for (const key of Object.keys(containers)) if (!keepSlots.has(Number(key))) {
        delete containers[key];
        dropped += 1;
      }
      if (removed || dropped) {
        writeSettings({ containers });
        log("startup partition gc removed=", removed, "containers dropped=", dropped, "kept=", keepSlots.size);
      }
    } catch (error) {
      log("startup partition gc failed", error?.message || error);
    }
    installSharedAssetScheme();
    installIpc();
    installRecorderIpc();
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
      shellUpdateHost?.applyOnQuit();
    } catch (error) {
      log("shell apply failed", error?.message || error);
    }
    if (containersTimer) flushContainers();
    gmFlushAll();
    flushLog(true);
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && updateHost) createWindow();
  });
};
