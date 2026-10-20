// 由 src/core/node-update-host.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const zlib = require("zlib");
const UpdateCore = require("./update-core");
const METADATA_URL = "https://sh-sgs.net/script/jinnangdai.version.json";
const REQUEST_TIMEOUT_MS = 12e3;
const MAX_METADATA_BYTES = 256 * 1024;
const MAX_RUNTIME_BYTES = 24 * 1024 * 1024;
function sha256(payload) {
  const value = typeof payload === "string" ? Buffer.from(payload, "utf8") : Buffer.from(payload);
  return crypto.createHash("sha256").update(value).digest("hex");
}
function requestBuffer(url, options = {}, redirectCount = 0) {
  const limit = Number(options.maxBytes) || MAX_RUNTIME_BYTES;
  const timeoutMs = Number(options.timeoutMs) || REQUEST_TIMEOUT_MS;
  if (redirectCount > 4) return Promise.reject(new Error("重定向次数过多"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const client = String(url).startsWith("https:") ? https : http;
    const request = client.get(url, {
      headers: {
        Accept: options.accept || "*/*",
        "Accept-Encoding": "br, gzip, deflate",
        "User-Agent": "Jinnangdai-MicroClient/1.2"
      }
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        let redirected;
        try {
          redirected = new URL(response.headers.location, url).href;
        } catch (error) {
          finish(reject, error);
          return;
        }
        requestBuffer(redirected, options, redirectCount + 1).then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error)
        );
        return;
      }
      if (status !== 200) {
        response.resume();
        finish(reject, new Error(`HTTP ${status}`));
        return;
      }
      let stream = response;
      const encoding = String(response.headers["content-encoding"] || "").toLowerCase();
      if (encoding === "br") stream = response.pipe(zlib.createBrotliDecompress());
      else if (encoding === "gzip") stream = response.pipe(zlib.createGunzip());
      else if (encoding === "deflate") stream = response.pipe(zlib.createInflate());
      const chunks = [];
      let total = 0;
      stream.on("data", (chunk) => {
        total += chunk.length;
        if (total > limit) {
          request.destroy(new Error("响应超过大小限制"));
          return;
        }
        chunks.push(chunk);
        options.onProgress?.(total);
      });
      stream.on("end", () => finish(resolve, Buffer.concat(chunks)));
      stream.on("error", (error) => finish(reject, error));
      response.on("aborted", () => finish(reject, new Error("Response aborted")));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("请求超时")));
    request.on("error", (error) => finish(reject, error));
  });
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, file);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch (_) {
    }
  }
}
class PayloadStore {
  directory;
  seedPath;
  seedVersion;
  log;
  currentDescriptor;
  lkgDescriptor;
  constructor(options) {
    this.directory = path.resolve(options.directory);
    this.seedPath = path.resolve(options.seedPath);
    this.seedVersion = UpdateCore.normalizeVersion(options.seedVersion, "seedVersion");
    this.log = typeof options.log === "function" ? options.log : () => {
    };
    this.currentDescriptor = path.join(this.directory, "current.json");
    this.lkgDescriptor = path.join(this.directory, "last-known-good.json");
  }
  descriptorRecord(descriptor) {
    if (!descriptor || typeof descriptor !== "object") return null;
    const codePath = path.join(this.directory, `runtime-${String(descriptor.sha256 || "")}.js`);
    let code = "";
    try {
      code = fs.readFileSync(codePath, "utf8");
    } catch (_) {
      return null;
    }
    return { ...descriptor, code };
  }
  async readDescriptor(file) {
    try {
      const descriptor = JSON.parse(fs.readFileSync(file, "utf8"));
      return await UpdateCore.verifyCachedRuntime(this.descriptorRecord(descriptor), sha256);
    } catch (_) {
      return null;
    }
  }
  async seedRecord() {
    let code = "";
    try {
      code = fs.readFileSync(this.seedPath, "utf8");
    } catch (_) {
      this.log("no seed file", this.seedPath);
      return null;
    }
    return {
      schema: UpdateCore.SCHEMA_VERSION,
      version: this.seedVersion,
      sha256: sha256(code),
      bytes: Buffer.byteLength(code, "utf8"),
      url: "app://jinnangdai-seed",
      publishedAt: "",
      cachedAt: 0,
      code,
      source: "seed"
    };
  }
  async selectStartupRecord() {
    const [current, lkg, seed] = await Promise.all([
      this.readDescriptor(this.currentDescriptor),
      this.readDescriptor(this.lkgDescriptor),
      this.seedRecord()
    ]);
    const candidates = [seed, current, lkg].filter(Boolean);
    candidates.sort((left, right) => UpdateCore.compareVersions(right.version, left.version));
    const selected = candidates[0];
    return selected || null;
  }
  async commit(record) {
    const verified = await UpdateCore.verifyCachedRuntime(record, sha256);
    if (!verified) throw new Error("拒绝保存未通过校验的 runtime");
    fs.mkdirSync(this.directory, { recursive: true });
    const codePath = path.join(this.directory, `runtime-${verified.sha256}.js`);
    atomicWrite(codePath, verified.code);
    const descriptor = { ...verified };
    delete descriptor.code;
    const previous = await this.readDescriptor(this.currentDescriptor);
    if (previous) {
      const lkg = { ...previous };
      delete lkg.code;
      atomicWrite(this.lkgDescriptor, `${JSON.stringify(lkg, null, 2)}
`);
    }
    atomicWrite(this.currentDescriptor, `${JSON.stringify(descriptor, null, 2)}
`);
    this.log("runtime cache committed", verified.version, verified.sha256);
    return verified;
  }
}
async function createNodeUpdateHost(options) {
  const log = typeof options.log === "function" ? options.log : () => {
  };
  const store = new PayloadStore({
    directory: options.cacheDirectory,
    seedPath: options.seedPath,
    seedVersion: options.seedVersion,
    log
  });
  let startupRecord = await store.selectStartupRecord();
  const seedless = !startupRecord;
  const stateListeners = /* @__PURE__ */ new Set();
  const client = UpdateCore.createUpdateClient({
    metadataUrl: options.metadataUrl || METADATA_URL,
    channel: options.releaseChannel || "stable",
    currentVersion: startupRecord?.version || "0.0.0",
    adapter: {
      async fetchMetadata(url) {
        const body = await requestBuffer(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
          maxBytes: MAX_METADATA_BYTES,
          accept: "application/json"
        });
        return JSON.parse(body.toString("utf8"));
      },
      async fetchRuntime(url, metadata, onProgress) {
        const expected = Number(metadata?.runtime?.bytes || 0);
        return await requestBuffer(url, {
          maxBytes: expected > 0 ? Math.min(MAX_RUNTIME_BYTES, expected + 1024) : MAX_RUNTIME_BYTES,
          accept: "application/javascript",
          timeoutMs: 3e4,
          onProgress
        });
      },
      sha256,
      async getCachedRuntime(metadata) {
        if (startupRecord?.version !== metadata.version || startupRecord?.sha256 !== metadata.runtime.sha256) return null;
        return await UpdateCore.verifyCachedRuntime(startupRecord, sha256);
      },
      async commitRuntime(record) {
        await store.commit(record);
        startupRecord = { ...record, source: "cache" };
      },
      async reloadGame(context) {
        if (typeof options.reloadGame !== "function") throw new Error("微端未绑定重载目标");
        return await options.reloadGame(context);
      },
      onStateChange(state) {
        if (state.phase !== "downloading") log("update state", JSON.stringify({
          phase: state.phase,
          currentVersion: state.currentVersion,
          targetVersion: state.targetVersion,
          error: state.error || null
        }));
        for (const listener of [...stateListeners]) {
          try {
            listener(state);
          } catch (_) {
          }
        }
      }
    }
  });
  async function importRuntime(payload, source) {
    const code = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload || "");
    const version = code.match(/^\/\/\s*jinnangdai-runtime-version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1];
    if (!version) throw new UpdateCore.UpdateContractError("IMPORT_NOT_RUNTIME", "这不是锦囊袋更新文件");
    if (Buffer.byteLength(code, "utf8") > MAX_RUNTIME_BYTES) throw new UpdateCore.UpdateContractError("PAYLOAD_TOO_LARGE", "runtime 超过大小限制");
    const record = {
      schema: UpdateCore.SCHEMA_VERSION,
      version,
      sha256: sha256(code),
      bytes: Buffer.byteLength(code, "utf8"),
      url: String(source || "import://manual"),
      publishedAt: "",
      cachedAt: Date.now(),
      code
    };
    await store.commit(record);
    startupRecord = { ...record, source: "import" };
    log("runtime imported", version, record.sha256, String(source || ""));
    return { version, sha256: record.sha256, bytes: record.bytes };
  }
  if (seedless) {
    log("no runtime seed or cache; fetching latest before first launch");
    await client.checkMetadata();
    await client.downloadUpdate();
    if (!startupRecord) throw new Error("没有 runtime 种子，也无法从更新服务器取得 runtime");
  }
  return Object.freeze({
    importRuntime,
    checkMetadata: () => client.checkMetadata(),
    startBackgroundUpdate: () => client.startBackgroundUpdate(),
    downloadUpdate: () => client.downloadUpdate(),
    async reloadGame(context) {
      const state = client.getState();
      if (!state.ready) throw new UpdateCore.UpdateContractError("CACHE_NOT_READY", "Verified cache required before reload");
      if (typeof options.reloadGame !== "function") throw new Error("微端未绑定重载目标");
      return await options.reloadGame({ ...context, targetVersion: state.targetVersion });
    },
    getState: () => client.getState(),
    getStartupRecord: () => ({ ...startupRecord }),
    markApplied: (version) => ({ version: UpdateCore.normalizeVersion(version), recorded: true }),
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    }
  });
}
module.exports = {
  METADATA_URL,
  PayloadStore,
  createNodeUpdateHost,
  requestBuffer,
  sha256
};
