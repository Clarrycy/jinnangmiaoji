// 由 src/core/component-update-host.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const path = require("path");
const UpdateCore = require("./update-core");
const node_update_host_ = require("./node-update-host");
const { PayloadStore, requestBuffer, sha256 } = node_update_host_;
const MANIFEST_URL = "https://sh-sgs.net/script/jinnangdai.micro.json";
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_COMPONENT_BYTES = 8 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
function httpsUrl(value, field) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch (_) {
    throw new Error(`${field} 不是有效 URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${field} 必须使用 HTTPS`);
  return url.href;
}
function validateManifest(input, knownIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("组件清单必须是对象");
  if (Number(input.schema) !== 1) throw new Error("组件清单 schema 不受支持");
  const publishedAt = String(input.publishedAt || "");
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) throw new Error("组件清单 publishedAt 无效");
  const components = {};
  const source = input.components && typeof input.components === "object" ? input.components : {};
  for (const id of knownIds) {
    const entry = source[id];
    if (!entry || typeof entry !== "object") continue;
    const digest = String(entry.sha256 || "").trim().toLowerCase();
    if (!SHA256_PATTERN.test(digest)) throw new Error(`components.${id}.sha256 无效`);
    const bytes = Number(entry.bytes);
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_COMPONENT_BYTES) throw new Error(`components.${id}.bytes 无效`);
    components[id] = Object.freeze({
      version: UpdateCore.normalizeVersion(entry.version, `components.${id}.version`),
      url: httpsUrl(entry.url, `components.${id}.url`),
      sha256: digest,
      bytes
    });
  }
  let shell = null;
  if (input.shell && typeof input.shell === "object") {
    let asar = null;
    if (input.shell.asar && typeof input.shell.asar === "object") {
      const digest = String(input.shell.asar.sha256 || "").trim().toLowerCase();
      const bytes = Number(input.shell.asar.bytes);
      if (!SHA256_PATTERN.test(digest)) throw new Error("shell.asar.sha256 无效");
      if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("shell.asar.bytes 无效");
      asar = Object.freeze({ url: httpsUrl(input.shell.asar.url, "shell.asar.url"), sha256: digest, bytes });
    }
    shell = Object.freeze({
      version: UpdateCore.normalizeVersion(input.shell.version, "shell.version"),
      minimum: input.shell.minimum ? UpdateCore.normalizeVersion(input.shell.minimum, "shell.minimum") : "",
      downloadUrl: input.shell.downloadUrl ? httpsUrl(input.shell.downloadUrl, "shell.downloadUrl") : "",
      asar
    });
  }
  return Object.freeze({ schema: 1, publishedAt: new Date(publishedAt).toISOString(), components: Object.freeze(components), shell });
}
async function createComponentUpdateHost(options) {
  const log = typeof options.log === "function" ? options.log : () => {
  };
  const shellVersion = UpdateCore.normalizeVersion(options.shellVersion, "shellVersion");
  const manifestUrl = options.manifestUrl || MANIFEST_URL;
  const adapter = options.adapter || {};
  const fetchManifest = adapter.fetchManifest || (async (url) => {
    const body = await requestBuffer(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      maxBytes: MAX_MANIFEST_BYTES,
      accept: "application/json"
    });
    return JSON.parse(body.toString("utf8"));
  });
  const fetchComponent = adapter.fetchComponent || (async (entry, onProgress) => requestBuffer(entry.url, {
    maxBytes: Math.min(MAX_COMPONENT_BYTES, entry.bytes + 1024),
    accept: "application/javascript",
    timeoutMs: 3e4,
    onProgress
  }));
  const stores = /* @__PURE__ */ new Map();
  const records = /* @__PURE__ */ new Map();
  for (const component of options.components) {
    const store = new PayloadStore({
      directory: path.join(options.cacheRoot, component.id),
      seedPath: component.seedPath,
      seedVersion: component.seedVersion,
      log: (...args) => log(`[${component.id}]`, ...args)
    });
    stores.set(component.id, store);
    records.set(component.id, await store.selectStartupRecord());
  }
  const listeners = /* @__PURE__ */ new Set();
  const state = {
    checkedAt: 0,
    checkError: null,
    checking: false,
    manifestPublishedAt: "",
    shell: { current: shellVersion, latest: "", minimum: "", downloadUrl: "", asar: null, outdated: false, required: false },
    components: Object.fromEntries([...records].map(([id, record]) => [id, {
      current: record?.version || "0.0.0",
      source: record?.source || "none",
      latest: "",
      phase: "idle",
      error: null
    }]))
  };
  let checkPromise = null;
  let lastManifest = null;
  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }
  function publish() {
    const copy = snapshot();
    for (const listener of [...listeners]) {
      try {
        listener(copy);
      } catch (_) {
      }
    }
  }
  async function updateComponent(id, entry) {
    const component = state.components[id];
    component.latest = entry.version;
    const current = records.get(id);
    if (current && (UpdateCore.compareVersions(entry.version, current.version) <= 0 || current.sha256 === entry.sha256)) {
      if (component.phase !== "ready") component.phase = "current";
      component.current = current.version;
      return;
    }
    component.phase = "downloading";
    component.error = null;
    component.progress = { downloaded: 0, total: entry.bytes };
    publish();
    let lastPublish = 0;
    try {
      const payload = await fetchComponent(entry, (downloaded) => {
        component.progress = { downloaded, total: entry.bytes };
        const now = Date.now();
        if (now - lastPublish >= 200) {
          lastPublish = now;
          publish();
        }
      });
      const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      if (bytes.length !== entry.bytes) throw new Error(`字节数不匹配：期望 ${entry.bytes}，实际 ${bytes.length}`);
      const digest = sha256(bytes);
      if (digest !== entry.sha256) throw new Error("SHA-256 不匹配");
      const record = {
        schema: UpdateCore.SCHEMA_VERSION,
        version: entry.version,
        sha256: digest,
        bytes: bytes.length,
        url: entry.url,
        publishedAt: state.manifestPublishedAt,
        cachedAt: Date.now(),
        code: bytes.toString("utf8")
      };
      await stores.get(id).commit(record);
      records.set(id, { ...record, source: "cache" });
      component.current = entry.version;
      component.phase = "ready";
      log("component updated", id, current?.version || "(none)", "->", entry.version);
    } catch (error) {
      component.phase = "error";
      component.error = { code: error?.code || "COMPONENT_UPDATE_FAILED", message: String(error?.message || error) };
      log("component update failed", id, component.error.message);
    }
  }
  async function runCheck() {
    state.checking = true;
    state.checkError = null;
    publish();
    try {
      const manifest = validateManifest(await fetchManifest(manifestUrl), [...stores.keys()]);
      lastManifest = manifest;
      state.checkedAt = Date.now();
      state.manifestPublishedAt = manifest.publishedAt;
      if (manifest.shell) {
        state.shell.latest = manifest.shell.version;
        state.shell.minimum = manifest.shell.minimum;
        state.shell.downloadUrl = manifest.shell.downloadUrl;
        state.shell.asar = manifest.shell.asar;
        state.shell.outdated = UpdateCore.compareVersions(manifest.shell.version, shellVersion) > 0;
        state.shell.required = Boolean(manifest.shell.minimum) && UpdateCore.compareVersions(manifest.shell.minimum, shellVersion) > 0;
      }
      for (const [id, entry] of Object.entries(manifest.components)) await updateComponent(id, entry);
    } catch (error) {
      state.checkedAt = Date.now();
      state.checkError = { code: error?.code || "MANIFEST_FAILED", message: String(error?.message || error) };
      log("component manifest failed", state.checkError.message);
    } finally {
      state.checking = false;
      publish();
    }
    return snapshot();
  }
  function check() {
    if (!checkPromise) checkPromise = runCheck().finally(() => {
      checkPromise = null;
    });
    return checkPromise;
  }
  if ([...records.values()].some((record) => !record)) {
    try {
      await runCheck();
    } catch (error) {
      log("first-run component fetch failed", error?.message || error);
    }
  }
  return Object.freeze({
    MANIFEST_URL: manifestUrl,
    // 每个宿主启动只查一次；再次调用并入在途请求。
    startBackgroundUpdate: () => check(),
    checkManifest: () => check(),
    // 版本页按钮：只更新指定组件（清单取上次检查结果；没检查过就先检查）。
    async updateComponent(id) {
      if (!lastManifest) await check();
      const entry = lastManifest?.components?.[id];
      if (!entry) throw new Error("清单里没有这个组件");
      await updateComponent(id, entry);
      publish();
      return snapshot();
    },
    getState: () => snapshot(),
    getStartupRecords() {
      const result = {};
      for (const [id, record] of records) result[id] = { ...record };
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
module.exports = { MANIFEST_URL, MAX_COMPONENT_BYTES, createComponentUpdateHost, validateManifest };
