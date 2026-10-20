import electron_ = require('electron');
const { ipcRenderer, webFrame } = electron_;
import components_ = require('./components');
const { COMPONENTS, parseUserScriptHeader } = components_;
import entries_ = require('./entries');
const { ENTRIES, matchesAnyEntry, TEST_ORIGIN } = entries_;
import gm_shim_ = require('./gm-shim');
const { createGmShim, wrapWithGm } = gm_shim_;
import direct_login_bridge_ = require('./direct-login-bridge');
const { installDirectEventBridge } = direct_login_bridge_;

// 主进程打开的渠道官方登录窗口用 additionalArguments 把桥接名带进 preload。
// 必须在页面脚本之前设置 window.name；Vivo／OPPO 的回调桥用它关联本次登录。
const AUTH_WINDOW_NAME = (() => {
  const prefix = '--jnd-auth-window-name=';
  const value = (process.argv || []).find(argument => argument.startsWith(prefix))?.slice(prefix.length) || '';
  return /^sgs-(?:vivo|oppo|steam|xiaomi)-[a-f0-9]{32}$/.test(value) ? value : '';
})();
if (AUTH_WINDOW_NAME) { try { window.name = AUTH_WINDOW_NAME; } catch (_) {} }

export = function startInjector(config) {
  const channel = String(config?.hostChannel || config?.id || 'unknown');

  function report(level, message, extra = {}) {
    const payload = {
      level,
      message: String(message || ''),
      url: String(location.href || ''),
      frame: process.isMainFrame ? 'main' : 'sub',
      channel,
      ...extra,
    };
    try { ipcRenderer.send('jnd-preload-log', payload); } catch (_) {}
    const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    try { writer(`[JND-MICRO] ${payload.message}`, payload); } catch (_) {}
  }

  function currentUrl() {
    try { return new URL(location.href); } catch (_) { return null; }
  }

  // 游戏页：本渠道规则 ∪ 入口表（壳可在运行时切换入口）。
  function isGameDocument() {
    const url = currentUrl();
    if (!url) return false;
    try { if (config?.matchesUrl?.(url)) return true; } catch (_) {}
    return matchesAnyEntry(url);
  }

  // 渠道事实按当前入口（统一微端运行时切换）；拿不到入口时退回渠道配置。
  function currentHostChannel() {
    try {
      const entryId = String(ipcRenderer.sendSync('jnd-shell-current-entry-sync') || '');
      const entry = ENTRIES.find(item => item.id === entryId);
      if (entry) return String(entry.hostChannel || entry.id);
    } catch (_) {}
    return channel;
  }
  function installHostFacts() {
    window.__JND_HOST = {
      ...(window.__JND_HOST || {}),
      kind: 'micro',
      source: 'sgs-multichannel',
      shell: 'Electron',
      shellVersion: String(config?.shellVersion || ''),
      engine: 'Chromium',
      channel: currentHostChannel(),
    };
  }

  function installDirectEventHost() {
    installDirectEventBridge({
      window,
      storage: window.sessionStorage,
      send: (name, payload) => ipcRenderer.send(name, payload),
      report,
    });
  }

  function installUpdateBridge(startupRecord) {
    let lastState = null;
    const listeners = new Set<(state: any) => void>();
    const publish = state => {
      if (!state || typeof state !== 'object') return;
      lastState = state;
      for (const listener of [...listeners]) {
        try { listener(state); } catch (_) {}
      }
    };
    ipcRenderer.on('jnd-update-state', (_event, state) => publish(state));
    try { lastState = ipcRenderer.sendSync('jnd-update-get-state-sync') || null; } catch (_) {}
    const bridge = {
      kind: 'electron',
      metadataUrl: 'https://sh-sgs.net/script/jinnangdai.version.json',
      currentRuntimeVersion: String(startupRecord?.version || ''),
      currentRuntimeSource: String(startupRecord?.source || 'cache'),
      getUpdateState() { return lastState; },
      subscribeUpdateState(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        if (lastState) {
          try { listener(lastState); } catch (_) {}
        }
        return () => listeners.delete(listener);
      },
      async checkMetadata() {
        const state = await ipcRenderer.invoke('jnd-update-check');
        publish(state);
        return state;
      },
      async downloadUpdate() {
        const state = await ipcRenderer.invoke('jnd-update-download');
        publish(state);
        return state;
      },
      async reloadGame() {
        return await ipcRenderer.invoke('jnd-update-reload-game');
      },
    };
    window.__JND_BOOTSTRAP = bridge;
    return bridge;
  }

  async function executeRuntime(record) {
    if (window.__JND_RUNTIME_STARTED) return true;
    if (!record?.code || !record?.version) throw new Error('没有可注入的 runtime 记录');
    window.__JND_RUNTIME_STARTED = true;
    window.__JND_RUNTIME_OWNER = {
      channel,
      source: String(record.source || 'cache'),
      version: String(record.version),
      startedAt: Date.now(),
    };
    try {
      const wrapped = `(() => {\n${record.code}\n})();\n//# sourceURL=jnd-micro-runtime-${record.version}.js`;
      await webFrame.executeJavaScript(wrapped, true);
      ipcRenderer.send('jnd-update-applied', { version: String(record.version) });
      report('info', `锦囊袋 runtime 注入成功 v${record.version}`);
      return true;
    } catch (error) {
      window.__JND_RUNTIME_STARTED = false;
      delete window.__JND_RUNTIME_OWNER;
      throw error;
    }
  }

  // 随包组件：代码来自主进程选定的种子或已校验缓存，按 components.js 决定注入位置。
  let componentRecords = null;
  function loadComponentRecords() {
    if (componentRecords) return componentRecords;
    try { componentRecords = ipcRenderer.sendSync('jnd-components-get-startup-sync') || {}; }
    catch (_) { componentRecords = {}; }
    return componentRecords;
  }

  const injectedComponents = new Set();
  async function injectComponent(component) {
    if (injectedComponents.has(component.id)) return false;
    const record = loadComponentRecords()[component.id];
    if (!record?.code) return false;
    injectedComponents.add(component.id);
    const sourceName = `jnd-micro-${component.id}-${record.version}.user.js`;
    let wrapped;
    if (component.gm) {
      const header = parseUserScriptHeader(record.code);
      const slot = `__JND_GM_${component.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
      window[slot] = createGmShim(ipcRenderer, component, {
        name: header.name, version: header.version || record.version, shellVersion: config?.shellVersion,
      });
      wrapped = wrapWithGm(record.code, slot, sourceName);
    } else {
      wrapped = `(() => {\n${record.code}\n})();\n//# sourceURL=${sourceName}`;
    }
    await webFrame.executeJavaScript(wrapped, true);
    report('info', `组件 ${component.label} 注入 v${record.version}（${record.source}）`);
    return true;
  }

  // 玩家自装的 user.js 插件：主进程插件库给代码与 @match；只在游戏文档里按 @match 注入，@grant 了就给 GM 桥。
  const injectedPlugins = new Set<string>();
  const globToRegExp = (glob: string) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
  function pluginMatches(patterns: string[], href: string) {
    let plain = href; try { const u = new URL(href); plain = `${u.origin}${u.pathname}`; } catch (_) {}
    return (patterns || []).some(p => { try { return globToRegExp(p).test(plain) || globToRegExp(p).test(href); } catch (_) { return false; } });
  }
  async function injectPlugins() {
    let records = {};
    try { records = ipcRenderer.sendSync('jnd-plugins-get-startup-sync') || {}; } catch (_) { return; }
    for (const record of Object.values<any>(records)) {
      if (!record?.code || injectedPlugins.has(record.id) || !pluginMatches(record.match, location.href)) continue;
      injectedPlugins.add(record.id);
      const sourceName = `jnd-plugin-${record.id}-${record.version}.user.js`;
      try {
        let wrapped;
        if (record.gm) {
          const slot = `__JND_GM_${String(record.id).replace(/[^a-zA-Z0-9]/g, '_')}`;
          window[slot] = createGmShim(ipcRenderer, { id: record.id, gm: true }, { name: record.name, version: record.version, shellVersion: config?.shellVersion });
          wrapped = wrapWithGm(record.code, slot, sourceName);
        } else wrapped = `(() => {\n${record.code}\n})();\n//# sourceURL=${sourceName}`;
        await webFrame.executeJavaScript(wrapped, true);
        report('info', `插件 ${record.name} 注入 v${record.version}`);
      } catch (error) { report('warn', `插件 ${record.name} 注入失败：${error.message}`); }
    }
  }

  // 小抄设置面板的「更新」(#checkUpdate) 原本去拉油猴安装地址；在壳里改为打开壳的更新页，
  // 更新与反馈都在那里；按钮本身不换字。捕获阶段截停原处理器。
  function adoptXiaochaoUpdateButton() {
    if (window.__JND_XIAOCHAO_UPDATE_ADOPTED) return;
    window.__JND_XIAOCHAO_UPDATE_ADOPTED = true;
    document.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('#checkUpdate') : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try { ipcRenderer.send('jnd-shell-open-version'); } catch (_) {}
    }, true);
  }


  // 落地页（非游戏主文档）：官方 /login/x/index 的 .container 固定 1600×900 居中，视口不足就溢出成滚动条。
  // 原生客户端不该出现滚动条：隐藏滚动条，视口比内容矮时整页等比缩小到正好放下；游戏页（Laya 画布）不缩放。
  // 官方落地页的 XHR 5 秒超时后会 alert「请求超时，请稍后再试」。壳里：超时放宽到 30 秒，
  // 这两条网络错误不再弹给玩家，只记日志（其他 alert 原样）。
  function installLandingNetworkGuard() {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'timeout');
      if (descriptor?.set && descriptor.get) {
        Object.defineProperty(XMLHttpRequest.prototype, 'timeout', {
          configurable: true,
          get() { return descriptor.get.call(this); },
          set(value) { descriptor.set.call(this, Number(value) > 0 ? Math.max(Number(value), 30000) : value); },
        });
      }
    } catch (error) { report('warn', `XHR 超时放宽失败：${error.message}`); }
    const nativeAlert = window.alert;
    window.alert = function guardedAlert(message) {
      if (/^请求(超时|出错)，请稍后再试$/.test(String(message ?? '').trim())) {
        report('warn', `落地页网络提示已拦下：${String(message)}`);
        return undefined;
      }
      return nativeAlert.call(window, message);
    };
  }

  function installLandingFit() {
    const style = document.createElement('style');
    style.id = 'jnd-micro-landing-fit';
    // 能放下时隐藏滚动条；放不下（长门户页）时恢复滚动，不缩到看不清。
    const HIDE = 'html,body{overflow:hidden!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}';
    style.textContent = HIDE;
    // document-start 时 <html> 还不存在：等它出现立刻挂上（先于首帧，避免滚动条闪现导致内容左右跳）。
    const mount = () => {
      const root = document.head || document.documentElement;
      if (!root) return false;
      if (!style.isConnected) root.append(style);
      return true;
    };
    if (!mount()) {
      const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
      observer.observe(document, { childList: true, subtree: true });
    }
    const MIN_ZOOM = 0.6;
    let timer = null;
    let stopped = false;
    let lastLogged = '';
    // 包围盒：官方 .container 是 top:50% 居中的固定 900px 块，视口不够时上头溢出到负坐标，
    // scrollHeight 量不到那一截；必须按所有元素的 rect 并集算真实高度。
    const contentExtent = () => {
      const nodes = document.body ? document.body.querySelectorAll('*') : [];
      let top = 0;
      let bottom = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      let count = 0;
      for (const node of nodes) {
        if (count++ > 3000) break;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const style = getComputedStyle(node);
        if (style.position === 'fixed' || style.visibility === 'hidden' || style.display === 'none') continue;
        top = Math.min(top, rect.top + window.scrollY);
        bottom = Math.max(bottom, rect.bottom + window.scrollY);
      }
      return bottom - top;
    };
    const fit = () => {
      if (stopped) return;
      const html = document.documentElement;
      html.style.zoom = '';
      const height = contentExtent();
      if (!height || !window.innerHeight) return;
      const zoom = window.innerHeight / height;
      const applied = zoom >= 0.999 ? 1 : zoom < MIN_ZOOM ? 0 : zoom;
      if (lastLogged !== `${Math.round(height)}:${applied.toFixed(3)}`) {
        lastLogged = `${Math.round(height)}:${applied.toFixed(3)}`;
        report('info', `落地页适配 viewport=${window.innerWidth}x${window.innerHeight} content=${Math.round(height)} zoom=${applied === 0 ? 'scroll' : applied.toFixed(3)}`);
      }
      if (zoom >= 0.999) { style.textContent = HIDE; return; }
      if (zoom < MIN_ZOOM) { style.textContent = ''; return; } // 长页面：正常滚动
      style.textContent = HIDE;
      html.style.zoom = String(zoom);
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(fit, 80); };
    // 游戏在本文档的 iframe 里开始加载后停止缩放并复位：Laya 画布不能被缩。
    ipcRenderer.on('jnd-landing-game-started', () => {
      stopped = true;
      window.removeEventListener('resize', schedule);
      clearTimeout(timer);
      document.documentElement.style.zoom = '';
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    document.addEventListener('DOMContentLoaded', schedule);
    setTimeout(fit, 500);
    setTimeout(fit, 2000);
  }

  // 官方登录页：把统一登录器的二维码／状态投影给壳（扫码窗），并接受壳的发起／取消。
  const OFFICIAL_LOGIN_PATHS = ['/login/index.html', '/login/x/index'];
  function isOfficialLoginPage(url) {
    if (TEST_ORIGIN && url.origin === TEST_ORIGIN) return OFFICIAL_LOGIN_PATHS.includes(url.pathname);
    return url.origin === 'https://web.sanguosha.com' && OFFICIAL_LOGIN_PATHS.includes(url.pathname);
  }
  // 落地页登录态：官方页登录后画「昵称／退出登录／进入游戏」面板（#nickName／#logoutBtn）；官服账号这里有昵称，渠道账号没有。
  // 变化就报给壳：已登录＋昵称＋这次用的第三方方式（来自统一登录器的快照），回到登录表单＝退出。
  function installLandingWatcher() {
    let last = '', lastProvider = null, attached = false;
    const attachProvider = () => { const bridge = window.__JND_UNIFIED_LOGIN; if (!bridge || attached) return; attached = true; try { bridge.subscribe(state => { if (state?.provider) lastProvider = String(state.provider); }); } catch (_) {} };
    const tick = () => {
      attachProvider();
      const loggedIn = Boolean(document.getElementById('logoutBtn'));
      const nickname = loggedIn ? String(document.getElementById('nickName')?.textContent || '').trim() : '';
      const form = Boolean(document.getElementById('SGS_login-account'));
      if (!loggedIn && !form) return; // 页面还没画完
      const key = `${loggedIn ? 1 : 0}:${nickname}:${lastProvider || ''}`; if (key === last) return; last = key;
      try { ipcRenderer.send('jnd-landing-state', { loggedIn, nickname, provider: lastProvider }); } catch (_) {}
    };
    setInterval(tick, 500);
  }
  function installLoginBridge() {
    let unsubscribe = null;
    let pending: { provider: string; mode: 'qr' | 'browser'; nonce: string; state: string } | null = null;
    const startLogin = request => {
      const provider = String(request?.provider || '');
      if (!provider) return;
      const options = {
        mode: request?.mode === 'browser' ? 'browser' : 'qr',
        ...(request?.nonce ? { nonce: String(request.nonce) } : {}),
        ...(request?.state ? { state: String(request.state) } : {}),
      };
      return window.__JND_UNIFIED_LOGIN.start(provider, options).catch(error => report('warn', `统一登录器发起失败：${error?.message || error}`));
    };
    const attach = () => {
      const bridge = window.__JND_UNIFIED_LOGIN;
      if (!bridge || unsubscribe) return Boolean(bridge);
      unsubscribe = bridge.subscribe(state => { try { ipcRenderer.send('jnd-login-state', state); } catch (_) {} });
      /* 订阅只在二维码变化时通知；「已扫码待确认」这种阶段变化靠轮询快照拿 */
      let last = ''; setInterval(() => { try { const s = bridge.get(); const key = `${s.stage}|${s.qr ? 1 : 0}|${s.error ? s.error.code : ''}`; if (key !== last) { last = key; ipcRenderer.send('jnd-login-state', s); } } catch (_) {} }, 400);
      if (pending) { const request = pending; pending = null; void startLogin(request); }
      return true;
    };
    ipcRenderer.on('jnd-login-start', (_event, request) => {
      const value = typeof request === 'string' ? { provider: request } : request;
      const normalized = { provider: String(value?.provider || ''), mode: value?.mode === 'browser' ? 'browser' as const : 'qr' as const,
        nonce: String(value?.nonce || ''), state: String(value?.state || '') };
      if (!normalized.provider) return;
      if (attach()) void startLogin(normalized); else pending = normalized;
    });
    ipcRenderer.on('jnd-login-cancel', () => { pending = null; try { window.__JND_UNIFIED_LOGIN?.cancel(); } catch (_) {} });
    // 脚本在 DOMContentLoaded 挂载；轮询到桥出现为止（最多 20 秒）。
    let tries = 0;
    const timer = setInterval(() => { tries += 1; if (attach() || tries > 80) clearInterval(timer); }, 250);
  }

  // 账号簿：官方「游卡通行证」表单（sgslogin-sdk：#SGS_login-account／#SGS_login-password／#SGS_login-btn）。
  // 进页面自动填上次账号；提交时把账号密码交给主进程，进入游戏页后由主进程询问是否保存。
  function installCredentialAutofill() {
    let entryId = '';
    try { entryId = String(ipcRenderer.sendSync('jnd-shell-current-entry-sync') || ''); } catch (_) {}
    if (!entryId) return;
    const field = (id: string) => document.getElementById(id) as HTMLInputElement | null;
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // 提交那一刻读当前输入框（官方 SDK 会重建表单，不能绑在首次出现的节点上）。
    const offer = source => {
      const account = field('SGS_login-account');
      const password = field('SGS_login-password');
      const value = String(account?.value || '').trim();
      if (!value) return;
      try { ipcRenderer.send('jnd-credential-offer', { entryId, account: value, password: String(password?.value || '') }); } catch (_) {}
      report('info', `账号簿：已记录待保存账号（${source}）`);
    };
    document.addEventListener('submit', event => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.querySelector('#SGS_login-account')) offer('submit');
    }, true);
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('#SGS_login-btn')) offer('click');
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target instanceof Element && event.target.closest('#SGS_login-account, #SGS_login-password')) offer('enter');
    }, true);

    let saved = [];
    try { saved = ipcRenderer.sendSync('jnd-credential-list-sync', entryId) || []; } catch (_) {}
    if (!saved.length) { report('info', '账号簿：本入口没有保存过账号'); return; }
    const fillWith = item => {
      const account = field('SGS_login-account');
      const password = field('SGS_login-password');
      if (!account || !password) return;
      setValue(account, item.account);
      if (item.password) setValue(password, item.password);
    };
    // Chrome 式账号下拉：贴在账号框下方，同一套样式令牌（shadow DOM 隔离官方样式）。
    const overlay_style_ = require('./overlay-style'); const icons_ = require('./chrome/icons');
    const { TOKENS, ICON_DATA } = overlay_style_;
    const host = document.createElement('div');
    host.id = 'jnd-micro-autofill';
    host.style.cssText = 'position:absolute;z-index:2147483000;display:none';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    /* 菜单家族的皮：圆角 8、环＋投影、内边距 4、行 28、字 13；底部一行「管理密码」开账号内页（文案草稿） */
    style.textContent = `:host{all:initial}.card{box-sizing:border-box;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14),0 0 0 1px rgba(0,0,0,.06);padding:4px;font:13px "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif;color:${TOKENS.ink};user-select:none}
      .item{display:flex;align-items:center;gap:10px;height:28px;padding:0 10px;border-radius:4px;white-space:nowrap;cursor:default}.item:hover{background:rgba(0,0,0,.05)}
      .fav{width:16px;height:16px;border-radius:3px;flex:none}.v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}.dots{color:${TOKENS.ink3};letter-spacing:1px}
      .sep{border-top:1px solid ${TOKENS.line};margin:4px 8px}.item.manage{color:${TOKENS.ink2}}.item.manage:hover{color:${TOKENS.ink}}.pi{width:16px;height:16px;flex:none;display:grid;place-items:center}.pi svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}`;
    const card = document.createElement('div'); card.className = 'card';
    shadow.append(style, card);
    const iconData = ICON_DATA; // 随 core 打包的产品图标；工作区目录在 asar 里不存在
    const renderList = () => {
      card.textContent = '';
      for (const item of saved) {
        const node = document.createElement('div'); node.className = 'item';
        if (iconData) { const img = document.createElement('img'); img.className = 'fav'; img.src = iconData; node.append(img); }
        const v = document.createElement('span'); v.className = 'v'; v.textContent = item.account; node.append(v);
        const dots = document.createElement('span'); dots.className = 'dots'; dots.textContent = '•'.repeat(Math.min(12, (item.password || '').length || 6)); node.append(dots);
        node.addEventListener('mousedown', event => { event.preventDefault(); fillWith(item); hideList(); });
        card.append(node);
      }
      const sep = document.createElement('div'); sep.className = 'sep'; card.append(sep);
      const manage = document.createElement('div'); manage.className = 'item manage'; const mi = document.createElement('span'); mi.className = 'pi'; mi.innerHTML = icons_.SVG.person; manage.append(mi); const mt = document.createElement('span'); mt.className = 'v'; mt.textContent = '管理账号'; manage.append(mt); /* 与账号行同款：16px 图标占位＋文字；图标用「账号」内页的那个 */
      manage.addEventListener('mousedown', event => { event.preventDefault(); hideList(); try { ipcRenderer.send('jnd-open-page', 'pm'); } catch (_) {} });
      card.append(manage);
    };
    // 落地页适配会给 <html> 加 zoom（<1）。getBoundingClientRect 给的是缩放后的视觉像素，而挂在 body 下的
    // 下拉用这些数做 left/top 会再被 zoom 乘一次，于是整体往左上偏、变小。给下拉自己设 zoom=1/页面 zoom 抵消，
    // 此后它的 left/top/width 都按视觉像素算，字号也回到原生 12px（Chrome 的下拉本来就不随页面缩放）。
    const pageZoom = () => { const z = parseFloat(getComputedStyle(document.documentElement).zoom); return Number.isFinite(z) && z > 0 ? z : 1; };
    const tune = { x: 0, y: 4, w: 0 }; // 相对账号框的偏移：x、y（框底往下）、宽度差
    const place = () => {
      const account = field('SGS_login-account');
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
      const account = field('SGS_login-account');
      if (!account || saved.length === 0) return;
      try {
        if (!host.isConnected) document.body.append(host);
        renderList();
        place();
        host.style.display = 'block';
      } catch (error) { report('warn', `账号簿：下拉绘制失败：${error?.message || error}`); } /* 26.0.16–26.0.18 这里抛错（图标模块键名写错）把整个下拉吞掉了，却没留一行日志 */
    };
    // 调参面板（仅 JND_MICRO_TUNE=1 启动时出现）：作者在真实登录页上拖 x／y／宽度，读数直接回填 tune。
    if (process.env.JND_MICRO_TUNE === '1') {
      const panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483001;zoom:1';
      const ps = panel.attachShadow({ mode: 'closed' });
      ps.innerHTML = `<style>:host{all:initial}.p{box-sizing:border-box;width:260px;background:${TOKENS.surface};border:1px solid ${TOKENS.line};border-radius:${TOKENS.cardRadius}px;box-shadow:${TOKENS.shadow};padding:10px 12px;font:${TOKENS.font};color:${TOKENS.ink};user-select:none;display:flex;flex-direction:column;gap:6px}
        label{display:flex;align-items:center;gap:8px;height:22px}label span{width:48px;color:${TOKENS.ink2}}input{flex:1}output{width:34px;text-align:right;font-variant-numeric:tabular-nums}.o{color:${TOKENS.ink2};white-space:pre-wrap;line-height:1.5}</style>
        <div class="p"><b>账号下拉调参</b>
        <label><span>偏移 X</span><input type="range" min="-60" max="60" value="0" data-k="x"><output>0</output></label>
        <label><span>偏移 Y</span><input type="range" min="-30" max="40" value="4" data-k="y"><output>4</output></label>
        <label><span>宽度差</span><input type="range" min="-120" max="120" value="0" data-k="w"><output>0</output></label>
        <div class="o" id="o"></div></div>`;
      const out = ps.getElementById('o');
      const refresh = () => {
        const info = place();
        const z = info ? info.zoom : pageZoom();
        const r = info ? info.rect : null;
        out.textContent = `页面 zoom ${z.toFixed(3)}  下拉 zoom ${(1 / z).toFixed(3)}\n账号框 ${r ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}` : '未找到'}\n结果 tune = { x: ${tune.x}, y: ${tune.y}, w: ${tune.w} }`;
      };
      for (const input of ps.querySelectorAll('input')) input.addEventListener('input', () => { tune[input.dataset.k] = Number(input.value); (input.nextElementSibling as HTMLOutputElement).value = input.value; if (host.isConnected && saved.length) { renderList(); host.style.display = 'block'; } refresh(); });
      document.addEventListener('DOMContentLoaded', () => document.body.append(panel));
      if (document.body) document.body.append(panel);
      setInterval(refresh, 500);
    }
    const hideList = () => { host.style.display = 'none'; };
    document.addEventListener('focusin', event => { if (event.target instanceof Element && event.target.id === 'SGS_login-account') showList(); });
    document.addEventListener('click', event => { if (event.target instanceof Element && event.target.id === 'SGS_login-account') showList(); else hideList(); }, true);
    document.addEventListener('focusout', event => { if (event.target instanceof Element && event.target.id === 'SGS_login-account') setTimeout(hideList, 150); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideList(); });
    // 只有一个账号：表单出现后直接填（SDK 初始化可能清空，2 秒内复查）。多账号：等玩家从下拉里选。
    if (saved.length === 1) {
      let tries = 0, filledOnce = false;
      const timer = setInterval(() => {
        tries += 1;
        const account = field('SGS_login-account');
        if (account && field('SGS_login-password')) {
          if (!account.value) fillWith(saved[0]);
          if (!filledOnce) { filledOnce = true; report('info', '账号簿：已自动填入'); }
          if (tries > 8) clearInterval(timer);
        } else if (tries > 120) clearInterval(timer);
      }, 250);
    } else {
      report('info', `账号簿：${saved.length} 个账号，账号框聚焦出下拉`);
    }
  }

  function componentApplies(component, url) {
    if (component.frame === 'main' && !process.isMainFrame) return false;
    if (component.frame === 'game' && !isGameDocument()) return false;
    try { return Boolean(component.matches(url, config?.matchesUrl)); }
    catch (_) { return false; }
  }

  async function injectStartupRuntime() {
    installHostFacts();
    installDirectEventHost();
    const url = currentUrl();
    if (!url) return false;
    const game = isGameDocument();
    const record = game ? ipcRenderer.sendSync('jnd-update-get-startup-sync') : null;
    if (game) installUpdateBridge(record);
    // 顺序固定：小抄（建立 SGSMODULE）→ 统一登录器 → 锦囊袋追加自己的桥接。
    for (const component of COMPONENTS) {
      if (!componentApplies(component, url)) continue;
      if (component.id === 'daxiaochao' && Array.isArray(window.SGSMODULE)) continue;
      try {
        await injectComponent(component);
        if (component.id === 'daxiaochao') adoptXiaochaoUpdateButton();
      } catch (error) { report('warn', `组件 ${component.label} 注入失败：${error.message}`); }
    }
    if (process.isMainFrame && isOfficialLoginPage(url)) {
      try { installLoginBridge(); } catch (error) { report('warn', `统一登录器桥失败：${error.message}`); }
      try { installLandingWatcher(); } catch (error) { report('warn', `落地页登录态失败：${error.message}`); }
      try { installCredentialAutofill(); } catch (error) { report('warn', `账号簿失败：${error.message}`); }
    }
    if (game) { try { await injectPlugins(); } catch (error) { report('warn', `插件注入失败：${error.message}`); } }
    if (!game) {
      if (process.isMainFrame && isOfficialLoginPage(url)) {
        try { installLandingNetworkGuard(); } catch (error) { report('warn', `落地页网络守卫失败：${error.message}`); }
        try { installLandingFit(); } catch (error) { report('warn', `落地页适配失败：${error.message}`); }
      }
      return false;
    }
    await executeRuntime(record);
    try { installIdentityBridge(); } catch (error) { report('warn', `昵称桥失败：${error.message}`); }
    setTimeout(reportDiagnostics, 8000);
    return true;
  }

  // 昵称：runtime 的 PlayerState identity（selfNickname／selfUserId）→ 壳；官服与渠道服走的都是同一条游戏协议，所以一个口子够用
  function installIdentityBridge() {
    let last = null; // 第一次空值不报（还没登录），登录过再变空＝退出了，要报，标签标题才能实时跟着变
    // PlayerState 快照把各域放在 domains 下（snapshot.domains.identity.value）；账号状态快照直接带 selfNickname
    const push = snapshot => {
      const v = snapshot?.domains?.identity?.value || snapshot?.identity?.value || (snapshot && 'selfNickname' in snapshot ? snapshot : null); if (!v) return;
      const nickname = String(v.selfNickname || ''), userId = String(v.selfUserId || '');
      const key = `${userId}:${nickname}`; if (key === last || (last === null && !nickname && !userId)) return; last = key;
      try { ipcRenderer.send('jnd-account-identity', { nickname, userId }); } catch (_) {}
    };
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const G = window.__JND;
      if (G && (typeof G.onPlayerState === 'function' || typeof G.onAccountStatus === 'function')) {
        clearInterval(timer);
        try {
          push(G.getAccountStatus?.()); push(G.getPlayerState?.());
          if (typeof G.onAccountStatus === 'function') G.onAccountStatus(status => push(status));
          if (typeof G.onPlayerState === 'function') G.onPlayerState(snapshot => push(snapshot));
          report('info', '昵称桥已接到 PlayerState／AccountStatus');
        } catch (error) { report('warn', `昵称桥失败：${error.message}`); }
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
      report(state?.jinnangdai ? 'info' : 'error', `注入复核 ${JSON.stringify(state)}`);
    } catch (error) {
      report('error', `注入复核失败：${error.message}`);
    }
  }

  window.__JND_MICRO_RECOVER = () => injectStartupRuntime();
  injectStartupRuntime().catch(error => report('error', `注入器异常：${error.stack || error.message}`));
};
