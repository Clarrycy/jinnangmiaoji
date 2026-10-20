// 由 src/core/gm-shim.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
function createGmShim(ipcRenderer, component, info) {
  const shimComponentId = String(component.id);
  const store = /* @__PURE__ */ new Map();
  try {
    const loaded = ipcRenderer.sendSync("jnd-gm-store-load", shimComponentId);
    if (loaded && typeof loaded === "object") {
      for (const [key, value] of Object.entries(loaded)) store.set(key, value);
    }
  } catch (_) {
  }
  let requestSerial = 0;
  try {
    ipcRenderer.on("jnd-gm-store-changed", (_event, componentId, key, value, deleted) => {
      if (String(componentId) !== shimComponentId) return;
      const name = String(key);
      if (deleted) store.delete(name);
      else store.set(name, value);
    });
  } catch (_) {
  }
  function GM_getValue(key, fallback) {
    const name = String(key);
    if (!store.has(name)) return fallback;
    const value = store.get(name);
    return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
  }
  function GM_setValue(key, value) {
    const name = String(key);
    const plain = value === void 0 ? null : JSON.parse(JSON.stringify(value));
    store.set(name, plain);
    try {
      ipcRenderer.send("jnd-gm-store-set", shimComponentId, name, plain);
    } catch (_) {
    }
  }
  function GM_deleteValue(key) {
    const name = String(key);
    store.delete(name);
    try {
      ipcRenderer.send("jnd-gm-store-delete", shimComponentId, name);
    } catch (_) {
    }
  }
  function GM_listValues() {
    return [...store.keys()];
  }
  function GM_xmlhttpRequest(details) {
    if (!details || typeof details !== "object" || !details.url) throw new Error("GM_xmlhttpRequest 缺少 url");
    requestSerial += 1;
    const id = `${shimComponentId}:${Date.now()}:${requestSerial}`;
    let settled = false;
    const callbacks = {
      load: details.onload,
      error: details.onerror,
      timeout: details.ontimeout,
      abort: details.onabort
    };
    const deliver = (result) => {
      if (settled) return;
      settled = true;
      const response = {
        status: Number(result?.status || 0),
        statusText: String(result?.statusText || ""),
        responseHeaders: String(result?.responseHeaders || ""),
        finalUrl: String(result?.finalUrl || details.url),
        readyState: 4,
        context: details.context
      };
      if (result?.kind === "load") {
        if (details.responseType === "arraybuffer") {
          const bytes = result.response;
          response.response = bytes instanceof ArrayBuffer ? bytes : ArrayBuffer.isView(bytes) ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0);
          response.responseText = void 0;
        } else {
          response.responseText = typeof result.responseText === "string" ? result.responseText : "";
          response.response = response.responseText;
        }
      } else {
        response.error = String(result?.error || result?.kind || "error");
      }
      const handler = callbacks[result?.kind] || callbacks.error;
      if (typeof handler === "function") {
        try {
          handler(response);
        } catch (error) {
          console.error("[JND-MICRO] GM 回调异常", error);
        }
      }
    };
    const request = {
      method: details.method,
      url: String(details.url),
      headers: details.headers || {},
      data: details.data == null ? void 0 : String(details.data),
      timeout: details.timeout,
      redirect: details.redirect,
      anonymous: details.anonymous,
      cookie: details.cookie,
      responseType: details.responseType
    };
    ipcRenderer.invoke("jnd-gm-xhr", shimComponentId, id, request).then(deliver, (error) => deliver({ kind: "error", error: String(error?.message || error) }));
    return {
      abort() {
        try {
          ipcRenderer.send("jnd-gm-xhr-abort", id);
        } catch (_) {
        }
        deliver({ kind: "abort" });
      }
    };
  }
  return Object.freeze({
    GM_xmlhttpRequest,
    GM_getValue,
    GM_setValue,
    GM_deleteValue,
    GM_listValues,
    GM_info: Object.freeze({
      scriptHandler: "JinnangdaiMicro",
      version: String(info?.shellVersion || ""),
      script: Object.freeze({ name: String(info?.name || component.label || shimComponentId), version: String(info?.version || "") })
    })
  });
}
const GM_PARAMETERS = ["GM_xmlhttpRequest", "GM_getValue", "GM_setValue", "GM_deleteValue", "GM_listValues", "GM_info", "unsafeWindow"];
function wrapWithGm(code, slotName, sourceName) {
  return `(function(${GM_PARAMETERS.join(", ")}) {
${code}
}).call(window, ${GM_PARAMETERS.slice(0, -1).map((name) => `window[${JSON.stringify(slotName)}].${name}`).join(", ")}, window);
//# sourceURL=${sourceName}`;
}
module.exports = { createGmShim, wrapWithGm, GM_PARAMETERS };
