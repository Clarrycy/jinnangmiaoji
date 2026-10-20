// 由 src/core/update-core.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
(function installJinnangdaiUpdateCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.__JND_UPDATE_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : exports, function createJinnangdaiUpdateCore() {
  "use strict";
  const SCHEMA_VERSION = 1;
  const PHASES = Object.freeze([
    "idle",
    "available",
    "current",
    "downloading",
    "verifying",
    "caching",
    "ready",
    "reloading",
    "applied",
    "error"
  ]);
  const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
  const SHA256_PATTERN = /^[0-9a-f]{64}$/;
  class UpdateContractError extends Error {
    code;
    details;
    constructor(code, message, details) {
      super(message);
      this.name = "UpdateContractError";
      this.code = String(code || "UPDATE_CONTRACT_ERROR");
      if (details !== void 0) this.details = details;
    }
  }
  function normalizeVersion(value, field = "version") {
    const text = String(value || "").trim();
    const match = text.match(VERSION_PATTERN);
    if (!match) throw new UpdateContractError("INVALID_VERSION", `${field} 格式无效`, { field });
    return text.replace(/^v/i, "");
  }
  function versionParts(value) {
    const version = normalizeVersion(value);
    const match = version.match(VERSION_PATTERN);
    return {
      numeric: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: String(match[4] || "")
    };
  }
  function compareVersions(leftValue, rightValue) {
    const left = versionParts(leftValue);
    const right = versionParts(rightValue);
    for (let index = 0; index < 3; index += 1) {
      if (left.numeric[index] !== right.numeric[index]) {
        return left.numeric[index] > right.numeric[index] ? 1 : -1;
      }
    }
    if (left.prerelease === right.prerelease) return 0;
    if (!left.prerelease) return 1;
    if (!right.prerelease) return -1;
    return left.prerelease.localeCompare(right.prerelease, "en", { numeric: true }) > 0 ? 1 : -1;
  }
  function assertHttpsUrl(value, field) {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch (_) {
      throw new UpdateContractError("INVALID_URL", `${field} 不是有效 URL`, { field });
    }
    if (url.protocol !== "https:") {
      throw new UpdateContractError("INSECURE_URL", `${field} 必须使用 HTTPS`, { field });
    }
    return url.href;
  }
  function optionalVersion(value, field) {
    return value == null || value === "" ? "" : normalizeVersion(value, field);
  }
  function validateMetadata(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new UpdateContractError("INVALID_METADATA", "版本元数据必须是对象");
    }
    if (Number(input.schema) !== SCHEMA_VERSION) {
      throw new UpdateContractError("UNSUPPORTED_SCHEMA", "版本元数据 schema 不受支持", {
        expected: SCHEMA_VERSION,
        received: input.schema
      });
    }
    const channel = String(input.channel || "").trim();
    if (!channel) throw new UpdateContractError("INVALID_CHANNEL", "版本元数据缺少 channel");
    const publishedAt = String(input.publishedAt || "").trim();
    if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) {
      throw new UpdateContractError("INVALID_PUBLISHED_AT", "版本元数据 publishedAt 无效");
    }
    const runtime = input.runtime;
    if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
      throw new UpdateContractError("INVALID_RUNTIME", "版本元数据缺少 runtime");
    }
    const sha256 = String(runtime.sha256 || "").trim().toLowerCase();
    if (!SHA256_PATTERN.test(sha256)) {
      throw new UpdateContractError("INVALID_SHA256", "runtime.sha256 无效");
    }
    const bytes = Number(runtime.bytes);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      throw new UpdateContractError("INVALID_BYTES", "runtime.bytes 无效");
    }
    const config = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? Object.fromEntries(Object.entries(input.config).map(([key, value]) => [key, assertHttpsUrl(value, `config.${key}`)])) : {};
    const metadata = {
      schema: SCHEMA_VERSION,
      channel,
      version: normalizeVersion(input.version),
      publishedAt: new Date(publishedAt).toISOString(),
      runtime: {
        url: assertHttpsUrl(runtime.url, "runtime.url"),
        sha256,
        bytes
      },
      minimum: {
        bootstrap: optionalVersion(input.minimum?.bootstrap, "minimum.bootstrap"),
        shell: optionalVersion(input.minimum?.shell, "minimum.shell")
      },
      seed: {
        version: optionalVersion(input.seed?.version, "seed.version")
      },
      config,
      rollout: input.rollout && typeof input.rollout === "object" && !Array.isArray(input.rollout) ? { ...input.rollout } : {}
    };
    return Object.freeze({
      ...metadata,
      runtime: Object.freeze(metadata.runtime),
      minimum: Object.freeze(metadata.minimum),
      seed: Object.freeze(metadata.seed),
      config: Object.freeze(metadata.config),
      rollout: Object.freeze(metadata.rollout)
    });
  }
  function byteLength(payload) {
    if (typeof payload === "string") {
      if (typeof TextEncoder === "function") return new TextEncoder().encode(payload).byteLength;
      if (typeof Buffer !== "undefined") return Buffer.byteLength(payload, "utf8");
    }
    if (payload instanceof ArrayBuffer) return payload.byteLength;
    if (ArrayBuffer.isView(payload)) return payload.byteLength;
    throw new UpdateContractError("INVALID_PAYLOAD", "runtime payload 类型无效");
  }
  function payloadText(payload) {
    if (typeof payload === "string") return payload;
    const view = payload instanceof ArrayBuffer ? new Uint8Array(payload) : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    if (typeof TextDecoder === "function") return new TextDecoder("utf-8", { fatal: true }).decode(view);
    if (typeof Buffer !== "undefined") return Buffer.from(view).toString("utf8");
    throw new UpdateContractError("TEXT_DECODER_UNAVAILABLE", "宿主缺少 UTF-8 解码能力");
  }
  async function verifyRuntimePayload(metadata, payload, sha256) {
    const expected = metadata.runtime;
    const actualBytes = byteLength(payload);
    if (actualBytes !== expected.bytes) {
      throw new UpdateContractError("PAYLOAD_SIZE_MISMATCH", "runtime 字节数不匹配", {
        expected: expected.bytes,
        actual: actualBytes
      });
    }
    const actualHash = String(await sha256(payload)).trim().toLowerCase();
    if (actualHash !== expected.sha256) {
      throw new UpdateContractError("PAYLOAD_HASH_MISMATCH", "runtime SHA-256 不匹配", {
        expected: expected.sha256,
        actual: actualHash
      });
    }
    return {
      schema: SCHEMA_VERSION,
      version: metadata.version,
      sha256: actualHash,
      bytes: actualBytes,
      url: metadata.runtime.url,
      publishedAt: metadata.publishedAt,
      cachedAt: Date.now(),
      code: payloadText(payload)
    };
  }
  async function verifyCachedRuntime(record, sha256) {
    if (!record || typeof record !== "object" || Number(record.schema) !== SCHEMA_VERSION) return null;
    let version;
    try {
      version = normalizeVersion(record.version, "cached.version");
    } catch (_) {
      return null;
    }
    const expectedHash = String(record.sha256 || "").trim().toLowerCase();
    if (!SHA256_PATTERN.test(expectedHash) || typeof record.code !== "string" || !record.code) return null;
    const actualBytes = byteLength(record.code);
    if (Number(record.bytes) !== actualBytes) return null;
    const actualHash = String(await sha256(record.code)).trim().toLowerCase();
    if (actualHash !== expectedHash) return null;
    return { ...record, schema: SCHEMA_VERSION, version, sha256: actualHash, bytes: actualBytes };
  }
  function publicError(error) {
    return Object.freeze({
      code: String(error?.code || "UPDATE_FAILED"),
      message: String(error?.message || error || "更新失败")
    });
  }
  async function fetchMetadataJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12e3);
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  async function fetchRuntimeBytes(url, metadata, onProgress) {
    const expected = metadata.runtime.bytes;
    if (expected > 24 * 1024 * 1024) throw new UpdateContractError("PAYLOAD_TOO_LARGE", "Runtime exceeds cache limit");
    const controller = new AbortController();
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), 3e4);
    };
    let reader;
    arm();
    try {
      const response = await fetch(url, { cache: "force-cache", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body?.getReader) throw new UpdateContractError("STREAM_UNAVAILABLE", "Response stream unavailable");
      reader = response.body.getReader();
      const bytes = new Uint8Array(expected);
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.byteLength > expected) {
          throw new UpdateContractError("PAYLOAD_SIZE_MISMATCH", "Runtime exceeds declared size");
        }
        bytes.set(value, received);
        received += value.byteLength;
        onProgress(received);
        arm();
      }
      return bytes.subarray(0, received);
    } catch (error) {
      controller.abort();
      try {
        await reader?.cancel();
      } catch (_) {
      }
      throw error;
    } finally {
      clearTimeout(timer);
      reader?.releaseLock();
    }
  }
  function createUpdateClient(options) {
    const adapter = options?.adapter;
    if (!adapter || typeof adapter.fetchMetadata !== "function" || typeof adapter.fetchRuntime !== "function" || typeof adapter.sha256 !== "function" || typeof adapter.commitRuntime !== "function") {
      throw new UpdateContractError("INVALID_ADAPTER", "更新宿主适配器不完整");
    }
    const metadataUrl = assertHttpsUrl(options.metadataUrl, "metadataUrl");
    let currentVersion = normalizeVersion(options.currentVersion, "currentVersion");
    let state = Object.freeze({
      phase: "idle",
      currentVersion,
      targetVersion: "",
      latestVersion: "",
      checkedAt: 0,
      checking: false,
      ready: false,
      error: null,
      checkError: null,
      receivedBytes: 0,
      totalBytes: 0,
      progress: 0
    });
    let activeCheck = null;
    let activeDownload = null;
    let startupUpdate = null;
    let latestMetadata = null;
    const listeners = /* @__PURE__ */ new Set();
    function publish(patch) {
      state = Object.freeze({ ...state, ...patch, currentVersion });
      for (const listener of [...listeners]) {
        try {
          listener(state);
        } catch (_) {
        }
      }
      try {
        adapter.onStateChange?.(state);
      } catch (_) {
      }
      return state;
    }
    async function performCheck() {
      publish({ checking: true, checkError: null });
      try {
        const metadata = validateMetadata(await adapter.fetchMetadata(metadataUrl));
        if (metadata.channel !== String(options.channel || metadata.channel)) {
          throw new UpdateContractError("CHANNEL_MISMATCH", "版本元数据 channel 不匹配");
        }
        latestMetadata = metadata;
        const facts = { latestVersion: metadata.version, metadata, checkedAt: Date.now(), checkError: null, checking: false };
        if (activeDownload) return publish({ ...facts, checking: false });
        const newer = compareVersions(metadata.version, currentVersion) > 0;
        if (state.ready && state.targetVersion === metadata.version && state.targetSha256 === metadata.runtime.sha256) return publish(facts);
        publish({
          ...facts,
          phase: newer ? "available" : "current",
          targetVersion: metadata.version,
          targetSha256: metadata.runtime.sha256,
          ready: false,
          error: null,
          progress: 0,
          receivedBytes: 0,
          totalBytes: metadata.runtime.bytes
        });
        if (newer && typeof adapter.getCachedRuntime === "function") {
          const cached = await adapter.getCachedRuntime(metadata);
          if (cached?.version === metadata.version && cached.sha256 === metadata.runtime.sha256) {
            return publish({ phase: "ready", ready: true, progress: 100, checking: false });
          }
        }
        return publish({ checking: false });
      } catch (error) {
        publish({
          checking: false,
          checkError: publicError(error),
          ...!activeDownload && !state.ready ? { phase: "error", error: publicError(error) } : {}
        });
        throw error;
      }
    }
    function checkMetadata() {
      if (!activeCheck) {
        activeCheck = Promise.resolve().then(performCheck).finally(() => {
          activeCheck = null;
        });
      }
      return activeCheck;
    }
    async function performDownload(metadata) {
      publish({
        phase: "downloading",
        targetVersion: metadata.version,
        targetSha256: metadata.runtime.sha256,
        ready: false,
        error: null,
        receivedBytes: 0,
        totalBytes: metadata.runtime.bytes,
        progress: 0
      });
      try {
        const payload = await adapter.fetchRuntime(metadata.runtime.url, metadata, (receivedBytes) => {
          const progress = Math.min(100, Math.floor(receivedBytes * 100 / metadata.runtime.bytes));
          if (progress !== state.progress) publish({ receivedBytes, progress });
        });
        publish({ phase: "verifying", receivedBytes: byteLength(payload), progress: 100 });
        const record = await verifyRuntimePayload(metadata, payload, adapter.sha256);
        publish({ phase: "caching" });
        await adapter.commitRuntime(record, metadata);
        return publish({ phase: "ready", ready: true, error: null });
      } catch (error) {
        publish({ phase: "error", ready: false, error: publicError(error) });
        throw error;
      }
    }
    async function downloadUpdate() {
      if (activeDownload) return activeDownload;
      if (activeCheck) await activeCheck;
      if (activeDownload) return activeDownload;
      if (state.ready) return state;
      if (!latestMetadata || state.checkError) {
        throw new UpdateContractError("METADATA_REQUIRED", "Check metadata before downloading");
      }
      if (compareVersions(latestMetadata.version, currentVersion) <= 0) return state;
      const metadata = latestMetadata;
      activeDownload = Promise.resolve().then(() => performDownload(metadata)).finally(() => {
        activeDownload = null;
      });
      return activeDownload;
    }
    function startBackgroundUpdate() {
      if (!startupUpdate) {
        startupUpdate = checkMetadata().then((state2) => {
          if (state2.phase === "available" || state2.phase === "downloading") return downloadUpdate();
          return state2;
        });
      }
      return startupUpdate;
    }
    async function reloadGame(context = {}) {
      if (!state.ready) throw new UpdateContractError("CACHE_NOT_READY", "Verified cache required before reload");
      if (typeof adapter.reloadGame !== "function") {
        throw new UpdateContractError("RELOAD_UNAVAILABLE", "宿主未提供重载游戏能力");
      }
      const targetVersion = state.targetVersion;
      publish({ phase: "reloading", ready: false, error: null });
      try {
        return await adapter.reloadGame({ ...context, targetVersion });
      } catch (error) {
        publish({ phase: "ready", ready: true, error: publicError(error) });
        throw error;
      }
    }
    function markApplied(version) {
      currentVersion = normalizeVersion(version || currentVersion, "applied.version");
      return publish({ phase: "applied", targetVersion: currentVersion, ready: false, error: null });
    }
    return Object.freeze({
      checkMetadata,
      downloadUpdate,
      startBackgroundUpdate,
      reloadGame,
      markApplied,
      setCurrentVersion(version) {
        currentVersion = normalizeVersion(version, "currentVersion");
        return publish({ phase: "idle", ready: false, targetVersion: "", error: null });
      },
      getState: () => state,
      subscribe(listener) {
        if (typeof listener !== "function") return () => {
        };
        listeners.add(listener);
        try {
          listener(state);
        } catch (_) {
        }
        return () => listeners.delete(listener);
      }
    });
  }
  return Object.freeze({
    SCHEMA_VERSION,
    PHASES,
    UpdateContractError,
    normalizeVersion,
    compareVersions,
    validateMetadata,
    verifyRuntimePayload,
    verifyCachedRuntime,
    createUpdateClient,
    fetchMetadataJson,
    fetchRuntimeBytes
  });
});
