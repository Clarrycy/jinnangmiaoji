// 由 src/core/plugin-store.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const fs = require("fs");
const path = require("path");
const components_ = require("./components");
const { parseUserScriptHeader } = components_;
const UpdateCore = require("./update-core");
const MAX_BYTES = 4 * 1024 * 1024;
function parseHeader(code) {
  const base = parseUserScriptHeader(code);
  const header = String(code || "").split("// ==/UserScript==", 1)[0];
  const all = (key) => [...header.matchAll(new RegExp(`^\\/\\/\\s*@${key}\\s+(\\S.*?)\\s*$`, "gm"))].map((m) => m[1]);
  const grants = all("grant").filter((g) => g !== "none");
  return { ...base, match: [...all("match"), ...all("include")], exclude: all("exclude"), grant: grants.length > 0, updateUrl: all("updateURL")[0] || all("downloadURL")[0] || "" };
}
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}
function matchesUrl(patterns, url) {
  let plain = url;
  try {
    const u = new URL(url);
    plain = `${u.origin}${u.pathname}`;
  } catch (_) {
  }
  return patterns.some((p) => {
    try {
      return globToRegExp(p).test(plain) || globToRegExp(p).test(url);
    } catch (_) {
      return false;
    }
  });
}
function slugOf(source) {
  const base = String(source).replace(/[?#].*$/, "").replace(/^.*[\\/]/, "").replace(/\.(?:user|meta)\.js$/i, "").replace(/\.js$/i, "");
  const slug = base.replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return slug || "plugin";
}
function createPluginStore(options) {
  const directory = path.resolve(options.directory);
  const log = typeof options.log === "function" ? options.log : () => {
  };
  const indexFile = path.join(directory, "index.json");
  let store = { schema: 1, plugins: {} };
  try {
    const loaded = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    if (loaded && loaded.plugins) store = { schema: 1, plugins: loaded.plugins };
  } catch (_) {
  }
  const codeFile = (id) => path.join(directory, `${id}.user.js`);
  function flush() {
    const temporary = `${indexFile}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify(store));
      fs.renameSync(temporary, indexFile);
    } catch (error) {
      log("plugin index flush failed", error?.message || error);
      try {
        fs.unlinkSync(temporary);
      } catch (_) {
      }
    }
  }
  function readCode(id) {
    try {
      return fs.readFileSync(codeFile(id), "utf8");
    } catch (_) {
      return "";
    }
  }
  async function load(source) {
    const value = String(source || "").trim();
    if (/^https:\/\//i.test(value)) {
      const bytes = await options.fetch(value);
      if (bytes.length > MAX_BYTES) throw new Error("插件文件超过 4 MB");
      return { code: bytes.toString("utf8"), fromUrl: true };
    }
    if (/^https?:\/\//i.test(value)) throw new Error("插件链接需要以 https:// 开头");
    if (!fs.existsSync(value)) throw new Error("找不到这个文件");
    if (fs.statSync(value).size > MAX_BYTES) throw new Error("插件文件超过 4 MB");
    return { code: fs.readFileSync(value, "utf8"), fromUrl: false };
  }
  function commit(id, code, header, source, fromUrl, existing) {
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${codeFile(id)}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, code);
    fs.renameSync(temporary, codeFile(id));
    const now = Date.now();
    const meta = {
      id,
      name: header.name || id,
      version: header.version || "0.0.0",
      source: fromUrl ? source : `file://${source}`,
      updateUrl: header.updateUrl || (fromUrl ? source : existing?.updateUrl || ""),
      match: header.match,
      grant: header.grant,
      connect: header.connect,
      enabled: existing ? existing.enabled : true,
      installedAt: existing?.installedAt || now,
      updatedAt: now
    };
    store.plugins[id] = meta;
    flush();
    return meta;
  }
  return Object.freeze({
    parseHeader,
    matchesUrl,
    list() {
      return Object.values(store.plugins).map((m) => ({ ...m }));
    },
    get(id) {
      return store.plugins[id] ? { ...store.plugins[id] } : null;
    },
    // 安装或更新（同 id 覆盖）：返回 { meta, updated, from }
    async install(source) {
      const { code, fromUrl } = await load(source);
      const header = parseHeader(code);
      if (!/\/\/\s*==UserScript==/.test(code) || !header.name) throw new Error("这不是 user.js 插件文件");
      const id = slugOf(source);
      const existing = store.plugins[id] || null;
      const meta = commit(id, code, header, String(source).trim(), fromUrl, existing);
      log("plugin installed", id, meta.version, existing ? `(was ${existing.version})` : "");
      return { meta, updated: Boolean(existing), from: existing?.version || "" };
    },
    // 检查更新：拉 @updateURL（没有就用安装来源链接）；版本更高才换
    async check(id) {
      const existing = store.plugins[id];
      if (!existing) throw new Error("没有这个插件");
      const url = existing.updateUrl;
      if (!url) throw new Error("这个插件没有更新地址");
      const bytes = await options.fetch(url);
      const code = bytes.toString("utf8");
      const header = parseHeader(code);
      if (!header.version) throw new Error("更新地址返回的不是 user.js 文件");
      let newer = false;
      try {
        newer = UpdateCore.compareVersions(header.version, existing.version) > 0;
      } catch (_) {
        newer = header.version !== existing.version;
      }
      if (!newer) return { updated: false, version: existing.version, from: existing.version };
      let full = code;
      if (!/\n[^/\n]/.test(code.split("// ==/UserScript==")[1] || "")) {
        const dl = header.updateUrl && header.updateUrl !== url ? header.updateUrl : url.replace(/\.meta\.js(?=[?#]|$)/i, ".user.js");
        full = (await options.fetch(dl)).toString("utf8");
      }
      const meta = commit(id, full, parseHeader(full), url, true, existing);
      log("plugin updated", id, existing.version, "->", meta.version);
      return { updated: true, version: meta.version, from: existing.version };
    },
    setEnabled(id, enabled) {
      const m = store.plugins[id];
      if (!m) return;
      m.enabled = Boolean(enabled);
      flush();
    },
    remove(id) {
      if (!store.plugins[id]) return;
      delete store.plugins[id];
      flush();
      try {
        fs.unlinkSync(codeFile(id));
      } catch (_) {
      }
      log("plugin removed", id);
    },
    // 注入器用：启用的插件带代码
    startupRecords() {
      const result = {};
      for (const m of Object.values(store.plugins)) {
        if (!m.enabled) continue;
        const code = readCode(m.id);
        if (!code) continue;
        result[m.id] = { id: m.id, name: m.name, version: m.version, code, match: m.match, exclude: parseHeader(code).exclude, gm: m.grant, connect: m.connect, source: "plugin" };
      }
      return result;
    }
  });
}
module.exports = { createPluginStore, parseHeader, matchesUrl, slugOf, globToRegExp };
