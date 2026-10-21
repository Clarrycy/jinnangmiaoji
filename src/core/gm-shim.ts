'use strict';
// preload 侧的 GM API 替身（contextIsolation=false：preload 与页面同一 JS 环境）。
// 为随包 userscript 提供 GM_xmlhttpRequest／GM_getValue／GM_setValue／GM_deleteValue／
// GM_listValues／GM_info／unsafeWindow。存储按组件分文件，由主进程持久化；
// 读取同步（启动时整份取回），写入异步送主进程，页面内即时可见。

function createGmShim(ipcRenderer, component, info) {
  const componentId = String(component.id);
  const store = new Map();
  try {
    const loaded = ipcRenderer.sendSync('jnd-gm-store-load', componentId);
    if (loaded && typeof loaded === 'object') {
      for (const [key, value] of Object.entries(loaded)) store.set(key, value);
    }
  } catch (_) {}

  let requestSerial = 0;

  function GM_getValue(key, fallback) {
    const name = String(key);
    if (!store.has(name)) return fallback;
    const value = store.get(name);
    // 返回副本，避免脚本原地修改后与持久化副本脱节。
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  }
  function GM_setValue(key, value) {
    const name = String(key);
    const plain = value === undefined ? null : JSON.parse(JSON.stringify(value));
    store.set(name, plain);
    try { ipcRenderer.send('jnd-gm-store-set', componentId, name, plain); } catch (_) {}
  }
  function GM_deleteValue(key) {
    const name = String(key);
    store.delete(name);
    try { ipcRenderer.send('jnd-gm-store-delete', componentId, name); } catch (_) {}
  }
  function GM_listValues() { return [...store.keys()]; }

  function GM_xmlhttpRequest(details) {
    if (!details || typeof details !== 'object' || !details.url) throw new Error('GM_xmlhttpRequest 缺少 url');
    requestSerial += 1;
    const id = `${componentId}:${Date.now()}:${requestSerial}`;
    let settled = false;
    const callbacks = {
      load: details.onload, error: details.onerror, timeout: details.ontimeout, abort: details.onabort,
    };
    const deliver = result => {
      if (settled) return;
      settled = true;
      const response: Record<string, any> = {
        status: Number(result?.status || 0),
        statusText: String(result?.statusText || ''),
        responseHeaders: String(result?.responseHeaders || ''),
        finalUrl: String(result?.finalUrl || details.url),
        readyState: 4,
        context: details.context,
      };
      if (result?.kind === 'load') {
        if (details.responseType === 'arraybuffer') {
          const bytes = result.response;
          response.response = bytes instanceof ArrayBuffer ? bytes
            : ArrayBuffer.isView(bytes) ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            : new ArrayBuffer(0);
          response.responseText = undefined;
        } else {
          response.responseText = typeof result.responseText === 'string' ? result.responseText : '';
          response.response = response.responseText;
        }
      } else {
        response.error = String(result?.error || result?.kind || 'error');
      }
      const handler = callbacks[result?.kind] || callbacks.error;
      if (typeof handler === 'function') {
        try { handler(response); } catch (error) { console.error('[JND-MICRO] GM 回调异常', error); }
      }
    };
    const request = {
      method: details.method, url: String(details.url), headers: details.headers || {},
      data: details.data == null ? undefined : String(details.data),
      timeout: details.timeout, redirect: details.redirect, anonymous: details.anonymous,
      cookie: details.cookie, responseType: details.responseType,
    };
    ipcRenderer.invoke('jnd-gm-xhr', componentId, id, request).then(deliver, error => deliver({ kind: 'error', error: String(error?.message || error) }));
    return {
      abort() {
        try { ipcRenderer.send('jnd-gm-xhr-abort', id); } catch (_) {}
        deliver({ kind: 'abort' });
      },
    };
  }

  return Object.freeze({
    GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_deleteValue, GM_listValues,
    GM_info: Object.freeze({
      scriptHandler: 'JinnangdaiMicro',
      version: String(info?.shellVersion || ''),
      script: Object.freeze({ name: String(info?.name || component.label || componentId), version: String(info?.version || '') }),
    }),
  });
}

// 把脚本包成一个带 GM 形参的 IIFE；脚本内对 GM_* 与 unsafeWindow 的引用都落到形参上。
const GM_PARAMETERS = ['GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_info', 'unsafeWindow'];

function wrapWithGm(code, slotName, sourceName) {
  return `(function(${GM_PARAMETERS.join(', ')}) {\n${code}\n}).call(window, `
    + `${GM_PARAMETERS.slice(0, -1).map(name => `window[${JSON.stringify(slotName)}].${name}`).join(', ')}, window);\n`
    + `//# sourceURL=${sourceName}`;
}

export = { createGmShim, wrapWithGm, GM_PARAMETERS };
