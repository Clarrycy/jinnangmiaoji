// 由 src/core/injector-preload.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const electron_ = require("electron");
const { ipcRenderer, webFrame } = electron_;
const components_ = require("./components");
const { COMPONENTS, parseUserScriptHeader } = components_;
const entries_ = require("./entries");
const { ENTRIES, matchesAnyEntry, TEST_ORIGIN, landingTrimCss } = entries_;
const gm_shim_ = require("./gm-shim");
const { createGmShim, wrapWithGm } = gm_shim_;
module.exports = function startInjector(config) {
  const channel = String(config?.hostChannel || config?.id || "unknown");
  function report(level, message, extra = {}) {
    const payload = {
      level,
      message: String(message || ""),
      url: String(location.href || ""),
      frame: process.isMainFrame ? "main" : "sub",
      channel,
      ...extra
    };
    try {
      ipcRenderer.send("jnd-preload-log", payload);
    } catch (_) {
    }
    const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    try {
      writer(`[JND-MICRO] ${payload.message}`, payload);
    } catch (_) {
    }
  }
  function currentUrl() {
    try {
      return new URL(location.href);
    } catch (_) {
      return null;
    }
  }
  function isGameDocument() {
    const url = currentUrl();
    if (!url) return false;
    try {
      if (config?.matchesUrl?.(url)) return true;
    } catch (_) {
    }
    return matchesAnyEntry(url);
  }
  function currentHostChannel() {
    try {
      const entryId = String(ipcRenderer.sendSync("jnd-shell-current-entry-sync") || "");
      const entry = ENTRIES.find((item) => item.id === entryId);
      if (entry) return String(entry.hostChannel || entry.id);
    } catch (_) {
    }
    return channel;
  }
  function installHostFacts() {
    window.__JND_HOST = {
      ...window.__JND_HOST || {},
      kind: "micro",
      shell: "Electron",
      shellVersion: String(config?.shellVersion || ""),
      engine: "Chromium",
      channel: currentHostChannel()
    };
  }
  function installUpdateBridge(startupRecord) {
    let lastState = null;
    const listeners = /* @__PURE__ */ new Set();
    const publish = (state) => {
      if (!state || typeof state !== "object") return;
      lastState = state;
      for (const listener of [...listeners]) {
        try {
          listener(state);
        } catch (_) {
        }
      }
    };
    ipcRenderer.on("jnd-update-state", (_event, state) => publish(state));
    try {
      lastState = ipcRenderer.sendSync("jnd-update-get-state-sync") || null;
    } catch (_) {
    }
    const bridge = {
      kind: "electron",
      metadataUrl: "https://sh-sgs.net/script/jinnangdai.version.json",
      currentRuntimeVersion: String(startupRecord?.version || ""),
      currentRuntimeSource: String(startupRecord?.source || "cache"),
      getUpdateState() {
        return lastState;
      },
      subscribeUpdateState(listener) {
        if (typeof listener !== "function") return () => {
        };
        listeners.add(listener);
        if (lastState) {
          try {
            listener(lastState);
          } catch (_) {
          }
        }
        return () => listeners.delete(listener);
      },
      async checkMetadata() {
        const state = await ipcRenderer.invoke("jnd-update-check");
        publish(state);
        return state;
      },
      async downloadUpdate() {
        const state = await ipcRenderer.invoke("jnd-update-download");
        publish(state);
        return state;
      },
      async reloadGame() {
        return await ipcRenderer.invoke("jnd-update-reload-game");
      }
    };
    window.__JND_BOOTSTRAP = bridge;
    return bridge;
  }
  async function executeRuntime(record) {
    if (window.__JND_RUNTIME_STARTED) return true;
    if (!record?.code || !record?.version) throw new Error("没有可注入的 runtime 记录");
    window.__JND_RUNTIME_STARTED = true;
    window.__JND_RUNTIME_OWNER = {
      channel,
      source: String(record.source || "cache"),
      version: String(record.version),
      startedAt: Date.now()
    };
    try {
      const wrapped = `(() => {
${record.code}
})();
//# sourceURL=jnd-micro-runtime-${record.version}.js`;
      await webFrame.executeJavaScript(wrapped, true);
      ipcRenderer.send("jnd-update-applied", { version: String(record.version) });
      report("info", `锦囊袋 runtime 注入成功 v${record.version}`);
      return true;
    } catch (error) {
      window.__JND_RUNTIME_STARTED = false;
      delete window.__JND_RUNTIME_OWNER;
      throw error;
    }
  }
  let componentRecords = null;
  function loadComponentRecords() {
    if (componentRecords) return componentRecords;
    try {
      componentRecords = ipcRenderer.sendSync("jnd-components-get-startup-sync") || {};
    } catch (_) {
      componentRecords = {};
    }
    return componentRecords;
  }
  const injectedComponents = /* @__PURE__ */ new Set();
  async function injectComponent(component) {
    if (injectedComponents.has(component.id)) return false;
    const record = loadComponentRecords()[component.id];
    if (!record?.code) return false;
    injectedComponents.add(component.id);
    const sourceName = `jnd-micro-${component.id}-${record.version}.user.js`;
    let wrapped;
    if (component.gm) {
      const header = parseUserScriptHeader(record.code);
      const slot = `__JND_GM_${component.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
      window[slot] = createGmShim(ipcRenderer, component, {
        name: header.name,
        version: header.version || record.version,
        shellVersion: config?.shellVersion
      });
      wrapped = wrapWithGm(record.code, slot, sourceName);
    } else {
      wrapped = `(() => {
${record.code}
})();
//# sourceURL=${sourceName}`;
    }
    await webFrame.executeJavaScript(wrapped, true);
    report("info", `组件 ${component.label} 注入 v${record.version}（${record.source}）`);
    return true;
  }
  const injectedPlugins = /* @__PURE__ */ new Set();
  const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
  function pluginMatches(patterns, href) {
    let plain = href;
    try {
      const u = new URL(href);
      plain = `${u.origin}${u.pathname}`;
    } catch (_) {
    }
    return (patterns || []).some((p) => {
      try {
        return globToRegExp(p).test(plain) || globToRegExp(p).test(href);
      } catch (_) {
        return false;
      }
    });
  }
  async function injectPlugins() {
    let records = {};
    try {
      records = ipcRenderer.sendSync("jnd-plugins-get-startup-sync") || {};
    } catch (_) {
      return;
    }
    for (const record of Object.values(records)) {
      if (!record?.code || injectedPlugins.has(record.id) || !pluginMatches(record.match, location.href) || pluginMatches(record.exclude || [], location.href)) continue;
      injectedPlugins.add(record.id);
      const sourceName = `jnd-plugin-${record.id}-${record.version}.user.js`;
      try {
        let wrapped;
        if (record.gm) {
          const slot = `__JND_GM_${String(record.id).replace(/[^a-zA-Z0-9]/g, "_")}`;
          window[slot] = createGmShim(ipcRenderer, { id: record.id, gm: true }, { name: record.name, version: record.version, shellVersion: config?.shellVersion });
          wrapped = wrapWithGm(record.code, slot, sourceName);
        } else wrapped = `(() => {
${record.code}
})();
//# sourceURL=${sourceName}`;
        await webFrame.executeJavaScript(wrapped, true);
        report("info", `插件 ${record.name} 注入 v${record.version}`);
      } catch (error) {
        report("warn", `插件 ${record.name} 注入失败：${error.message}`);
      }
    }
  }
  function adoptXiaochaoUpdateButton() {
    if (window.__JND_XIAOCHAO_UPDATE_ADOPTED) return;
    window.__JND_XIAOCHAO_UPDATE_ADOPTED = true;
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("#checkUpdate") : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        ipcRenderer.send("jnd-shell-open-version");
      } catch (_) {
      }
    }, true);
  }
  function installLandingNetworkGuard() {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "timeout");
      if (descriptor?.set && descriptor.get) {
        Object.defineProperty(XMLHttpRequest.prototype, "timeout", {
          configurable: true,
          get() {
            return descriptor.get.call(this);
          },
          set(value) {
            descriptor.set.call(this, Number(value) > 0 ? Math.max(Number(value), 3e4) : value);
          }
        });
      }
    } catch (error) {
      report("warn", `XHR 超时放宽失败：${error.message}`);
    }
    const nativeAlert = window.alert;
    window.alert = function guardedAlert(message) {
      if (/^请求(超时|出错)，请稍后再试$/.test(String(message ?? "").trim())) {
        report("warn", `落地页网络提示已拦下：${String(message)}`);
        return void 0;
      }
      return nativeAlert.call(window, message);
    };
  }
  function installLandingFit() {
    const style = document.createElement("style");
    style.id = "jnd-micro-landing-fit";
    const HIDE = "html,body{overflow:hidden!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}";
    if (!isOfficialLoginPage(currentUrl() || new URL("about:blank"))) {
      style.textContent = "::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}";
      const mountPlain = () => {
        const root = document.head || document.documentElement;
        if (!root) return false;
        if (!style.isConnected) root.append(style);
        return true;
      };
      if (!mountPlain()) {
        const mo = new MutationObserver(() => {
          if (mountPlain()) mo.disconnect();
        });
        mo.observe(document, { childList: true, subtree: true });
      }
      return;
    }
    style.textContent = HIDE;
    const mount = () => {
      const root = document.head || document.documentElement;
      if (!root) return false;
      if (!style.isConnected) root.append(style);
      return true;
    };
    if (!mount()) {
      const observer = new MutationObserver(() => {
        if (mount()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
    const MIN_ZOOM = 0.6;
    let timer = null;
    let stopped = false;
    let lastLogged = "";
    const contentExtent = () => {
      const nodes = document.body ? document.body.querySelectorAll("*") : [];
      let top = 0;
      let bottom = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      let count = 0;
      for (const node of nodes) {
        if (count++ > 3e3) break;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const style2 = getComputedStyle(node);
        if (style2.position === "fixed" || style2.visibility === "hidden" || style2.display === "none") continue;
        top = Math.min(top, rect.top + window.scrollY);
        bottom = Math.max(bottom, rect.bottom + window.scrollY);
      }
      return bottom - top;
    };
    const fit = () => {
      if (stopped) return;
      const html = document.documentElement;
      html.style.zoom = "";
      const height = contentExtent();
      if (!height || !window.innerHeight) return;
      const zoom = window.innerHeight / height;
      const applied = zoom >= 0.999 ? 1 : zoom < MIN_ZOOM ? 0 : zoom;
      if (lastLogged !== `${Math.round(height)}:${applied.toFixed(3)}`) {
        lastLogged = `${Math.round(height)}:${applied.toFixed(3)}`;
        report("info", `落地页适配 viewport=${window.innerWidth}x${window.innerHeight} content=${Math.round(height)} zoom=${applied === 0 ? "scroll" : applied.toFixed(3)}`);
      }
      if (zoom >= 0.999) {
        style.textContent = HIDE;
        return;
      }
      if (zoom < MIN_ZOOM) {
        style.textContent = "";
        return;
      }
      style.textContent = HIDE;
      html.style.zoom = String(zoom);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(fit, 80);
    };
    const sizeWatch = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    const watchBody = () => {
      if (!document.body) return false;
      sizeWatch?.observe(document.body);
      return true;
    };
    if (!watchBody()) document.addEventListener("DOMContentLoaded", watchBody, { once: true });
    ipcRenderer.on("jnd-landing-game-started", () => {
      stopped = true;
      sizeWatch?.disconnect();
      window.removeEventListener("resize", schedule);
      clearTimeout(timer);
      document.documentElement.style.zoom = "";
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    document.addEventListener("DOMContentLoaded", schedule);
    setTimeout(fit, 500);
    setTimeout(fit, 2e3);
  }
  function installLandingAutoLogin(url) {
    if (url.hostname !== "my.4399.com" || !/^\/yxsgs\/?$/.test(url.pathname)) return;
    const script = `(() => { let n = 0; const t = setInterval(() => { n += 1; const u = document.querySelector('.my_unlogin'); const api = window.UniLogin;
      if (api && typeof api.showPopupLogin === 'function' && u) { clearInterval(t); if (u.offsetWidth || u.offsetHeight) api.showPopupLogin('', '', true); }
      else if (n > 60) clearInterval(t); }, 250); })();`;
    void webFrame.executeJavaScript(script, true).catch((error) => report("warn", `4399 登录框唤起失败：${error?.message || error}`));
  }
  const OFFICIAL_LOGIN_PATHS = ["/login/index.html", "/login/x/index"];
  function isOfficialLoginPage(url) {
    if (TEST_ORIGIN && url.origin === TEST_ORIGIN) return OFFICIAL_LOGIN_PATHS.includes(url.pathname);
    return url.origin === "https://web.sanguosha.com" && OFFICIAL_LOGIN_PATHS.includes(url.pathname);
  }
  {
    const css = landingTrimCss(location.hostname);
    const mount = () => {
      if (!css) return true;
      try {
        if (!document.documentElement || document.getElementById("jnd-landing-trim")) return false;
        const st = document.createElement("style");
        st.id = "jnd-landing-trim";
        st.textContent = css;
        document.documentElement.append(st);
        return true;
      } catch (_) {
        return false;
      }
    };
    if (!mount()) {
      const mo = new MutationObserver(() => {
        if (mount()) mo.disconnect();
      });
      mo.observe(document, { childList: true, subtree: true });
    }
  }
  function installLandingWatcher() {
    let last = "";
    const tick = () => {
      const loggedIn = Boolean(document.getElementById("logoutBtn"));
      const nickname = loggedIn ? String(document.getElementById("nickName")?.textContent || "").trim() : "";
      const form = Boolean(document.getElementById("SGS_login-account"));
      if (!loggedIn && !form) return;
      const key = `${loggedIn ? 1 : 0}:${nickname}`;
      if (key === last) return;
      last = key;
      try {
        ipcRenderer.send("jnd-landing-state", { loggedIn, nickname });
      } catch (_) {
      }
    };
    setInterval(tick, 500);
  }
  function installLoginBridge() {
    let unsubscribe = null;
    let pending = null, current = null;
    let draining = false, accepting = false, revision = 0;
    const forward = (state) => {
      if (!accepting || !current || state.provider && state.provider !== current.provider) return;
      try {
        ipcRenderer.send("jnd-login-state", { ...state, requestId: current.requestId, requestProvider: current.provider });
      } catch (_) {
      }
    };
    const drain = async () => {
      const bridge = window.__JND_UNIFIED_LOGIN;
      if (draining || !bridge || !pending) return;
      draining = true;
      try {
        while (pending) {
          const request = pending, ownRevision = revision;
          pending = null;
          accepting = false;
          bridge.cancel();
          while (bridge.get().busy && ownRevision === revision) await new Promise((resolve) => setTimeout(resolve, 100));
          if (ownRevision !== revision) continue;
          current = request;
          accepting = true;
          try {
            await (request.web && bridge.webFinish ? bridge.webFinish(request.provider, request.web) : bridge.start(request.provider));
          } catch (error) {
            if (ownRevision === revision) forward({ provider: request.provider, stage: "", qr: "", text: "", error: { code: "LOGIN_START_FAILED" } });
            report("warn", `统一登录器发起失败：${error?.message || error}`);
          }
        }
      } finally {
        draining = false;
      }
    };
    const attach = () => {
      const bridge = window.__JND_UNIFIED_LOGIN;
      if (!bridge || unsubscribe) return Boolean(bridge);
      unsubscribe = bridge.subscribe(forward);
      ipcRenderer.send("jnd-login-bridge-ready");
      let last = "";
      setInterval(() => {
        try {
          if (!accepting || !current) return;
          const s = bridge.get();
          const key = `${current.requestId}|${s.provider}|${s.stage}|${s.qr ? 1 : 0}|${s.error ? s.error.code : ""}`;
          if (key !== last) {
            last = key;
            forward(s);
          }
        } catch (_) {
        }
      }, 400);
      return true;
    };
    ipcRenderer.on("jnd-login-start", (_event, request) => {
      if (!request || typeof request.provider !== "string" || !Number.isSafeInteger(request.requestId)) return;
      revision += 1;
      accepting = false;
      pending = { provider: request.provider, requestId: request.requestId };
      try {
        window.__JND_UNIFIED_LOGIN?.cancel();
      } catch (_) {
      }
      if (attach()) void drain();
    });
    ipcRenderer.on("jnd-login-web-url", (_event, request) => {
      const reply = (url, error) => {
        try {
          ipcRenderer.send("jnd-login-web-url-result", { reqId: request?.reqId, url, error });
        } catch (_) {
        }
      };
      Promise.resolve().then(() => window.__JND_UNIFIED_LOGIN?.webURL?.(String(request?.provider || ""))).then((url) => reply(String(url || ""), ""), (e) => reply("", String(e?.message || e?.code || e)));
    });
    ipcRenderer.on("jnd-login-web-finish", (_event, request) => {
      if (!request || typeof request.provider !== "string" || !Number.isSafeInteger(request.requestId) || !request.web || typeof request.web !== "object") return;
      revision += 1;
      accepting = false;
      pending = { provider: request.provider, requestId: request.requestId, web: request.web };
      try {
        window.__JND_UNIFIED_LOGIN?.cancel();
      } catch (_) {
      }
      if (attach()) void drain();
    });
    ipcRenderer.on("jnd-login-cancel", () => {
      revision += 1;
      pending = null;
      accepting = false;
      current = null;
      try {
        window.__JND_UNIFIED_LOGIN?.cancel();
      } catch (_) {
      }
    });
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (attach()) {
        clearInterval(timer);
        void drain();
      } else if (tries > 80) {
        clearInterval(timer);
        report("warn", "统一登录器 20 秒内没有挂载，扫码无法发起");
      }
    }, 250);
  }
  function installCredentialAutofill() {
    let entryId = "";
    try {
      entryId = String(ipcRenderer.sendSync("jnd-shell-current-entry-sync") || "");
    } catch (_) {
    }
    if (!entryId) return;
    const field = (id) => document.getElementById(id);
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const offer = (source) => {
      const account = field("SGS_login-account");
      const password = field("SGS_login-password");
      const value = String(account?.value || "").trim();
      if (!value) return;
      try {
        ipcRenderer.send("jnd-credential-offer", { entryId, account: value, password: String(password?.value || "") });
      } catch (_) {
      }
      report("info", `账号簿：已记录待保存账号（${source}）`);
    };
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.querySelector("#SGS_login-account")) offer("submit");
    }, true);
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("#SGS_login-btn")) offer("click");
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target instanceof Element && event.target.closest("#SGS_login-account, #SGS_login-password")) offer("enter");
    }, true);
    let saved = [];
    try {
      saved = ipcRenderer.sendSync("jnd-credential-list-sync", entryId) || [];
    } catch (_) {
    }
    if (!saved.length) {
      report("info", "账号簿：本入口没有保存过账号");
      return;
    }
    const fillWith = (item) => {
      const account = field("SGS_login-account");
      const password = field("SGS_login-password");
      if (!account || !password) return;
      setValue(account, item.account);
      if (item.password) setValue(password, item.password);
    };
    const overlay_style_ = require("./overlay-style");
    const icons_ = require("./chrome/icons");
    const { TOKENS, ICON_DATA } = overlay_style_;
    const host = document.createElement("div");
    host.id = "jnd-micro-autofill";
    host.style.cssText = "position:absolute;z-index:2147483000;display:none";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial}.card{box-sizing:border-box;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14),0 0 0 1px rgba(0,0,0,.06);padding:4px;font:13px "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif;color:${TOKENS.ink};user-select:none}
      .item{display:flex;align-items:center;gap:10px;height:28px;padding:0 10px;border-radius:4px;white-space:nowrap;cursor:default}.item:hover{background:rgba(0,0,0,.05)}
      .fav{width:16px;height:16px;border-radius:3px;flex:none}.v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}.dots{color:${TOKENS.ink3};letter-spacing:1px}
      .sep{border-top:1px solid ${TOKENS.line};margin:4px 8px}.item.manage{color:${TOKENS.ink2}}.item.manage:hover{color:${TOKENS.ink}}.pi{width:16px;height:16px;flex:none;display:grid;place-items:center}.pi svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}`;
    const card = document.createElement("div");
    card.className = "card";
    shadow.append(style, card);
    const iconData = ICON_DATA;
    const renderList = () => {
      card.textContent = "";
      for (const item of saved) {
        const node = document.createElement("div");
        node.className = "item";
        if (iconData) {
          const img = document.createElement("img");
          img.className = "fav";
          img.src = iconData;
          node.append(img);
        }
        const v = document.createElement("span");
        v.className = "v";
        v.textContent = item.account;
        node.append(v);
        const dots = document.createElement("span");
        dots.className = "dots";
        dots.textContent = "•".repeat(Math.min(12, (item.password || "").length || 6));
        node.append(dots);
        node.addEventListener("mousedown", (event) => {
          event.preventDefault();
          fillWith(item);
          hideList();
        });
        card.append(node);
      }
      const sep = document.createElement("div");
      sep.className = "sep";
      card.append(sep);
      const manage = document.createElement("div");
      manage.className = "item manage";
      const mi = document.createElement("span");
      mi.className = "pi";
      mi.innerHTML = icons_.SVG.person;
      manage.append(mi);
      const mt = document.createElement("span");
      mt.className = "v";
      mt.textContent = "管理账号";
      manage.append(mt);
      manage.addEventListener("mousedown", (event) => {
        event.preventDefault();
        hideList();
        try {
          ipcRenderer.send("jnd-open-page", "pm");
        } catch (_) {
        }
      });
      card.append(manage);
    };
    const pageZoom = () => {
      const z = parseFloat(getComputedStyle(document.documentElement).zoom);
      return Number.isFinite(z) && z > 0 ? z : 1;
    };
    const tune = { x: 0, y: 4, w: 0 };
    const place = () => {
      const account = field("SGS_login-account");
      if (!account) return null;
      const zoom = pageZoom();
      const rect = account.getBoundingClientRect();
      host.style.zoom = String(1 / zoom);
      host.style.left = `${rect.left + window.scrollX + tune.x}px`;
      host.style.top = `${rect.bottom + window.scrollY + tune.y}px`;
      host.style.width = `${Math.max(rect.width + tune.w, 220)}px`;
      return { zoom, rect };
    };
    const showList = () => {
      const account = field("SGS_login-account");
      if (!account || saved.length === 0) return;
      try {
        if (!host.isConnected) document.body.append(host);
        renderList();
        place();
        host.style.display = "block";
      } catch (error) {
        report("warn", `账号簿：下拉绘制失败：${error?.message || error}`);
      }
    };
    if (process.env.JND_MICRO_TUNE === "1") {
      const panel = document.createElement("div");
      panel.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483001;zoom:1";
      const ps = panel.attachShadow({ mode: "closed" });
      ps.innerHTML = `<style>:host{all:initial}.p{box-sizing:border-box;width:260px;background:${TOKENS.surface};border:1px solid ${TOKENS.line};border-radius:${TOKENS.cardRadius}px;box-shadow:${TOKENS.shadow};padding:10px 12px;font:${TOKENS.font};color:${TOKENS.ink};user-select:none;display:flex;flex-direction:column;gap:6px}
        label{display:flex;align-items:center;gap:8px;height:22px}label span{width:48px;color:${TOKENS.ink2}}input{flex:1}output{width:34px;text-align:right;font-variant-numeric:tabular-nums}.o{color:${TOKENS.ink2};white-space:pre-wrap;line-height:1.5}</style>
        <div class="p"><b>账号下拉调参</b>
        <label><span>偏移 X</span><input type="range" min="-60" max="60" value="0" data-k="x"><output>0</output></label>
        <label><span>偏移 Y</span><input type="range" min="-30" max="40" value="4" data-k="y"><output>4</output></label>
        <label><span>宽度差</span><input type="range" min="-120" max="120" value="0" data-k="w"><output>0</output></label>
        <div class="o" id="o"></div></div>`;
      const out = ps.getElementById("o");
      const refresh = () => {
        const info = place();
        const z = info ? info.zoom : pageZoom();
        const r = info ? info.rect : null;
        out.textContent = `页面 zoom ${z.toFixed(3)}  下拉 zoom ${(1 / z).toFixed(3)}
账号框 ${r ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}` : "未找到"}
结果 tune = { x: ${tune.x}, y: ${tune.y}, w: ${tune.w} }`;
      };
      for (const input of ps.querySelectorAll("input")) input.addEventListener("input", () => {
        tune[input.dataset.k] = Number(input.value);
        input.nextElementSibling.value = input.value;
        if (host.isConnected && saved.length) {
          renderList();
          host.style.display = "block";
        }
        refresh();
      });
      document.addEventListener("DOMContentLoaded", () => document.body.append(panel));
      if (document.body) document.body.append(panel);
      setInterval(refresh, 500);
    }
    const hideList = () => {
      host.style.display = "none";
    };
    document.addEventListener("focusin", (event) => {
      if (event.target instanceof Element && event.target.id === "SGS_login-account") showList();
    });
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.id === "SGS_login-account") showList();
      else hideList();
    }, true);
    document.addEventListener("focusout", (event) => {
      if (event.target instanceof Element && event.target.id === "SGS_login-account") setTimeout(hideList, 150);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideList();
    });
    if (saved.length === 1) {
      let tries = 0, filledOnce = false;
      const timer = setInterval(() => {
        tries += 1;
        const account = field("SGS_login-account");
        if (account && field("SGS_login-password")) {
          if (!account.value) fillWith(saved[0]);
          if (!filledOnce) {
            filledOnce = true;
            report("info", "账号簿：已自动填入");
          }
          if (tries > 8) clearInterval(timer);
        } else if (tries > 120) clearInterval(timer);
      }, 250);
    } else {
      report("info", `账号簿：${saved.length} 个账号，账号框聚焦出下拉`);
    }
  }
  function componentApplies(component, url) {
    if (component.frame === "main" && !process.isMainFrame) return false;
    if (component.frame === "game" && !isGameDocument()) return false;
    try {
      return Boolean(component.matches(url, config?.matchesUrl));
    } catch (_) {
      return false;
    }
  }
  async function injectStartupRuntime() {
    installHostFacts();
    const url = currentUrl();
    if (!url) return false;
    const game = isGameDocument();
    const record = game ? ipcRenderer.sendSync("jnd-update-get-startup-sync") : null;
    if (game) installUpdateBridge(record);
    for (const component of COMPONENTS) {
      if (!componentApplies(component, url)) continue;
      if (component.id === "daxiaochao" && Array.isArray(window.SGSMODULE)) continue;
      try {
        await injectComponent(component);
        if (component.id === "daxiaochao") adoptXiaochaoUpdateButton();
      } catch (error) {
        report("warn", `组件 ${component.label} 注入失败：${error.message}`);
      }
    }
    if (process.isMainFrame && isOfficialLoginPage(url)) {
      try {
        installLoginBridge();
      } catch (error) {
        report("warn", `统一登录器桥失败：${error.message}`);
      }
      try {
        installLandingWatcher();
      } catch (error) {
        report("warn", `落地页登录态失败：${error.message}`);
      }
      try {
        installCredentialAutofill();
      } catch (error) {
        report("warn", `账号簿失败：${error.message}`);
      }
    }
    if (game) {
      try {
        await injectPlugins();
      } catch (error) {
        report("warn", `插件注入失败：${error.message}`);
      }
    }
    if (!game) {
      if (process.isMainFrame && /^https?:$/.test(url.protocol)) {
        try {
          installLandingNetworkGuard();
        } catch (error) {
          report("warn", `落地页网络守卫失败：${error.message}`);
        }
        try {
          installLandingFit();
        } catch (error) {
          report("warn", `落地页适配失败：${error.message}`);
        }
        try {
          installLandingAutoLogin(url);
        } catch (error) {
          report("warn", `落地页登录唤起失败：${error.message}`);
        }
      }
      return false;
    }
    await executeRuntime(record);
    try {
      installIdentityBridge();
    } catch (error) {
      report("warn", `昵称桥失败：${error.message}`);
    }
    setTimeout(reportDiagnostics, 8e3);
    return true;
  }
  function installIdentityBridge() {
    let last = null;
    const push = (snapshot) => {
      const v = snapshot?.domains?.identity?.value || snapshot?.identity?.value || (snapshot && "selfNickname" in snapshot ? snapshot : null);
      if (!v) return;
      const nickname = String(v.selfNickname || ""), userId = String(v.selfUserId || "");
      const key = `${userId}:${nickname}`;
      if (key === last || last === null && !nickname && !userId) return;
      last = key;
      try {
        ipcRenderer.send("jnd-account-identity", { nickname, userId });
      } catch (_) {
      }
    };
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const G = window.__JND;
      if (G && (typeof G.onPlayerState === "function" || typeof G.onAccountStatus === "function")) {
        clearInterval(timer);
        try {
          push(G.getAccountStatus?.());
          push(G.getPlayerState?.());
          if (typeof G.onAccountStatus === "function") G.onAccountStatus((status) => push(status));
          if (typeof G.onPlayerState === "function") G.onPlayerState((snapshot) => push(snapshot));
          report("info", "昵称桥已接到 PlayerState／AccountStatus");
        } catch (error) {
          report("warn", `昵称桥失败：${error.message}`);
        }
      } else if (tries > 240) clearInterval(timer);
    }, 500);
  }
  async function reportDiagnostics() {
    try {
      const state = await webFrame.executeJavaScript(`({
        jinnangdai: Boolean(window.__JND),
        version: String(window.__JND_RUNTIME_OWNER?.version || ''),
        dot: Boolean(document.getElementById('jnd-dot')),
        panel: Boolean(document.getElementById('jnd-panel')),
        updateBridge: Boolean(window.__JND_BOOTSTRAP?.checkMetadata),
        daxiaochao: Array.isArray(window.SGSMODULE)
      })`, true);
      report(state?.jinnangdai ? "info" : "error", `注入复核 ${JSON.stringify(state)}`);
    } catch (error) {
      report("error", `注入复核失败：${error.message}`);
    }
  }
  window.__JND_MICRO_RECOVER = () => injectStartupRuntime();
  injectStartupRuntime().catch((error) => report("error", `注入器异常：${error.stack || error.message}`));
};
