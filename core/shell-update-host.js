// 由 src/core/shell-update-host.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const UpdateCore = require("./update-core");
const MAX_REDIRECTS = 5;
const MAX_ASAR_BYTES = 256 * 1024 * 1024;
function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}
function createShellUpdateHost(options) {
  const log = typeof options.log === "function" ? options.log : () => {
  };
  const shellVersion = UpdateCore.normalizeVersion(options.shellVersion, "shellVersion");
  const directory = path.resolve(options.stagingDirectory);
  const pendingFile = path.join(directory, "pending.json");
  const listeners = /* @__PURE__ */ new Set();
  let state = { phase: "idle", progress: 0, version: "", error: null };
  let current = null;
  function publish(patch) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) {
      try {
        listener({ ...state });
      } catch (_) {
      }
    }
  }
  function readPending() {
    try {
      const pending = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
      const file = path.join(directory, `app-${pending.sha256}.asar`);
      if (!/^[0-9a-f]{64}$/.test(String(pending.sha256 || ""))) return null;
      if (UpdateCore.compareVersions(pending.version, shellVersion) <= 0) return null;
      if (fs.statSync(file).size !== Number(pending.bytes)) return null;
      return { ...pending, file };
    } catch (_) {
      return null;
    }
  }
  function clearPending() {
    try {
      fs.unlinkSync(pendingFile);
    } catch (_) {
    }
    try {
      for (const name of fs.readdirSync(directory)) {
        if (/^app-[0-9a-f]{64}\.asar(?:\.part)?$/.test(name)) fs.unlinkSync(path.join(directory, name));
      }
    } catch (_) {
    }
  }
  const restored = readPending();
  if (restored) publish({ phase: "ready", progress: 100, version: restored.version });
  else clearPending();
  function fetchToFile(url, target, expectedBytes, redirectCount = 0) {
    if (redirectCount > MAX_REDIRECTS) return Promise.reject(new Error("重定向次数过多"));
    return new Promise((resolve, reject) => {
      const client = url.startsWith("https:") ? https : http;
      const request = client.get(url, { headers: { "User-Agent": "Jinnangdai-MicroClient/1.4" } }, (response) => {
        const status = Number(response.statusCode || 0);
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          let next;
          try {
            next = new URL(response.headers.location, url).href;
          } catch (error) {
            reject(error);
            return;
          }
          if (!next.startsWith("https:")) {
            reject(new Error("重定向到非 HTTPS 地址"));
            return;
          }
          fetchToFile(next, target, expectedBytes, redirectCount + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const file = fs.createWriteStream(`${target}.part`);
        let received = 0;
        let lastProgress = -1;
        const fail = (error) => {
          try {
            fs.unlinkSync(`${target}.part`);
          } catch (_) {
          }
          reject(error);
        };
        response.on("data", (chunk) => {
          received += chunk.length;
          if (received > expectedBytes) {
            request.destroy(new Error("文件超过清单字节数"));
            return;
          }
          const progress = Math.min(99, Math.floor(received * 100 / expectedBytes));
          if (progress !== lastProgress) {
            lastProgress = progress;
            publish({ progress });
          }
        });
        response.pipe(file);
        file.on("finish", () => {
          if (received !== expectedBytes) {
            fail(new Error("下载不完整"));
            return;
          }
          try {
            fs.renameSync(`${target}.part`, target);
            resolve(received);
          } catch (error) {
            fail(error);
          }
        });
        file.on("error", fail);
        response.on("error", fail);
        response.on("aborted", () => fail(new Error("连接中断")));
      });
      request.setTimeout(6e4, () => request.destroy(new Error("请求超时")));
      request.on("error", reject);
    });
  }
  async function download(entry) {
    if (current) return current;
    if (state.phase === "ready") return state;
    if (!entry || !/^https:/i.test(String(entry.url || ""))) throw new Error("清单没有给出新版微端");
    const bytes = Number(entry.bytes);
    const digest = String(entry.sha256 || "").toLowerCase();
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_ASAR_BYTES || !/^[0-9a-f]{64}$/.test(digest)) throw new Error("清单 shell.asar 无效");
    const version = UpdateCore.normalizeVersion(entry.version, "shell.version");
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, `app-${digest}.asar`);
    publish({ phase: "downloading", progress: 0, version, error: null });
    current = (async () => {
      if (!(fs.existsSync(target) && fs.statSync(target).size === bytes && sha256File(target) === digest)) {
        await fetchToFile(String(entry.url), target, bytes);
        if (sha256File(target) !== digest) {
          fs.unlinkSync(target);
          throw new Error("SHA-256 不匹配");
        }
      }
      const temporary = `${pendingFile}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ version, sha256: digest, bytes, stagedAt: (/* @__PURE__ */ new Date()).toISOString() }));
      fs.renameSync(temporary, pendingFile);
      log("shell update staged", version, digest);
      publish({ phase: "ready", progress: 100 });
    })().catch((error) => {
      log("shell update failed", String(error?.message || error));
      publish({ phase: "error", error: String(error?.message || error) });
    }).finally(() => {
      current = null;
    });
    return current;
  }
  function applyOnQuit() {
    const pending = readPending();
    if (!pending) return false;
    const asarPath = String(options.asarPath || "");
    if (!asarPath || !/\.asar$/i.test(asarPath) || !fs.existsSync(asarPath)) {
      log("shell apply skipped: not running from app.asar");
      return false;
    }
    if (process.platform !== "win32") {
      log("shell apply skipped: platform", process.platform);
      return false;
    }
    const script = path.join(directory, "apply.cmd");
    const lines = [
      "@echo off",
      "chcp 65001 >nul",
      `set "SRC=${pending.file}"`,
      `set "DST=${asarPath}"`,
      "for /l %%i in (1,1,30) do (",
      "  timeout /t 1 /nobreak >nul",
      '  move /y "%DST%" "%DST%.bak" >nul 2>&1 && goto swap',
      ")",
      "exit /b 1",
      ":swap",
      'move /y "%SRC%" "%DST%" >nul 2>&1 || (move /y "%DST%.bak" "%DST%" >nul 2>&1 & exit /b 1)',
      `del /q "${pendingFile}" >nul 2>&1`,
      "exit /b 0"
    ];
    fs.writeFileSync(script, `${lines.join("\r\n")}\r
`);
    try {
      const child = childProcess.spawn("cmd.exe", ["/d", "/c", script], { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
      log("shell apply scheduled", pending.version);
      return true;
    } catch (error) {
      log("shell apply spawn failed", String(error?.message || error));
      return false;
    }
  }
  return Object.freeze({
    download,
    applyOnQuit,
    getState: () => ({ ...state }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
module.exports = { createShellUpdateHost, sha256File };
