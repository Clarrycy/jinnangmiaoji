// 由 src/core/main-injector.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const electron_ = require("electron");
const { webFrameMain } = electron_;
module.exports = function attachMainInjector(contents, options) {
  const log = typeof options?.log === "function" ? options.log : () => {
  };
  const matches = typeof options?.matches === "function" ? options.matches : () => false;
  const pending = /* @__PURE__ */ new Map();
  let disposed = false;
  function delay(callback, milliseconds) {
    if (disposed) {
      callback();
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(timer);
      callback();
    }, milliseconds);
    pending.set(timer, callback);
  }
  async function verifyOrRecover(frame) {
    if (disposed || contents.isDestroyed() || !frame || frame.detached) return;
    const url = String(frame.url || "");
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return;
    }
    if (!matches(parsed)) return;
    try {
      let state = await frame.executeJavaScript(`({
        started: Boolean(window.__JND_RUNTIME_STARTED),
        jinnangdai: Boolean(window.__JND),
        version: String(window.__JND_RUNTIME_OWNER?.version || ''),
        bridge: Boolean(window.__JND_BOOTSTRAP?.checkMetadata)
      })`);
      if (!state.started || !state.jinnangdai || !state.bridge) {
        log("MAIN-RECOVERY request url=", url, "state=", JSON.stringify(state));
        await frame.executeJavaScript("window.__JND_MICRO_RECOVER?.()");
        await new Promise((resolve) => delay(resolve, 500));
        if (disposed || contents.isDestroyed() || frame.detached) return;
        state = await frame.executeJavaScript(`({
          started: Boolean(window.__JND_RUNTIME_STARTED),
          jinnangdai: Boolean(window.__JND),
          version: String(window.__JND_RUNTIME_OWNER?.version || ''),
          bridge: Boolean(window.__JND_BOOTSTRAP?.checkMetadata)
        })`);
      }
      log("MAIN-INJECT-VERIFY url=", url, "state=", JSON.stringify(state));
    } catch (error) {
      log("MAIN-INJECT-ERROR url=", url, "error=", error?.stack || error);
    }
  }
  contents.on("did-frame-finish-load", (_event, _isMainFrame, processId, routingId) => {
    delay(() => {
      if (disposed || contents.isDestroyed()) return;
      verifyOrRecover(webFrameMain.fromId(processId, routingId));
    }, 250);
  });
  contents.once("destroyed", () => {
    disposed = true;
    for (const [timer, finish] of pending) {
      clearTimeout(timer);
      finish();
    }
    pending.clear();
  });
};
