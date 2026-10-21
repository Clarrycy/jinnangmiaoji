// 由 src/core/gm-request-host.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 2e4;
const MAX_TIMEOUT_MS = 315e3;
const ALWAYS_ALLOWED = ["sanguosha.com"];
function hostAllowed(hostname, allowHosts) {
  const host = String(hostname || "").toLowerCase();
  for (const entry of [...ALWAYS_ALLOWED, ...allowHosts]) {
    if (host === entry || host.endsWith(`.${entry}`)) return true;
  }
  return false;
}
function rawHeaders(response) {
  const lines = [];
  const raw = response.rawHeaders || [];
  for (let index = 0; index + 1 < raw.length; index += 2) lines.push(`${raw[index]}: ${raw[index + 1]}`);
  return lines.join("\r\n");
}
function setCookieLines(response) {
  const raw = response.rawHeaders || [];
  const lines = [];
  for (let index = 0; index + 1 < raw.length; index += 2) {
    if (String(raw[index]).toLowerCase() === "set-cookie") lines.push(raw[index + 1]);
  }
  return lines;
}
function parseSetCookie(line, url) {
  const parts = String(line).split(";").map((part) => part.trim()).filter(Boolean);
  const [name, ...valueParts] = (parts.shift() || "").split("=");
  if (!name) return null;
  const cookie = { url: url.origin + "/", name: name.trim(), value: valueParts.join("=") };
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    const attribute = key.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (attribute === "domain" && value) cookie.domain = value;
    else if (attribute === "path" && value) cookie.path = value;
    else if (attribute === "secure") cookie.secure = true;
    else if (attribute === "httponly") cookie.httpOnly = true;
    else if (attribute === "expires" && Number.isFinite(Date.parse(value))) cookie.expirationDate = Date.parse(value) / 1e3;
    else if (attribute === "max-age" && Number.isFinite(Number(value))) cookie.expirationDate = Date.now() / 1e3 + Number(value);
  }
  return cookie;
}
function createGmRequestHost(options = {}) {
  const log = typeof options.log === "function" ? options.log : () => {
  };
  const trace = (event) => {
    try {
      options.trace?.(event);
    } catch (_) {
    }
  };
  const electronNet = options.net && typeof options.net.request === "function" && process.env.JND_GM_NODE !== "1" ? options.net : null;
  const tlsOptions = options.tlsOptions && typeof options.tlsOptions === "object" ? options.tlsOptions : {};
  const active = /* @__PURE__ */ new Map();
  async function sessionCookieHeader(session, url) {
    if (!session?.cookies) return "";
    try {
      const cookies = await session.cookies.get({ url: url.href });
      return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    } catch (_) {
      return "";
    }
  }
  async function persistCookies(session, response, url) {
    if (!session?.cookies) return;
    for (const line of setCookieLines(response)) {
      const cookie = parseSetCookie(line, url);
      if (!cookie) continue;
      try {
        await session.cookies.set(cookie);
      } catch (_) {
      }
    }
  }
  function onceNet(url, request, settle, session) {
    const method = String(request.method || "GET").toUpperCase();
    const headers = { ...request.headers };
    const body = request.data == null ? null : Buffer.from(String(request.data), "utf8");
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn();
      };
      const hasReferer = Object.keys(headers).some((k) => k.toLowerCase() === "referer");
      const req = electronNet.request({ method, url: url.href, useSessionCookies: false, redirect: "manual", ...hasReferer ? { referrerPolicy: "unsafe-url" } : {} });
      for (const [k, v] of Object.entries(headers)) {
        try {
          req.setHeader(k, String(v));
        } catch (_) {
        }
      }
      const timer = setTimeout(() => {
        finish(() => reject(Object.assign(new Error("timeout"), { kind: "timeout" })));
        try {
          req.abort();
        } catch (_) {
        }
      }, request.timeout);
      settle.cancel = (reason) => {
        finish(() => reject(reason));
        try {
          req.abort();
        } catch (_) {
        }
      };
      req.on("redirect", (statusCode, _method, redirectUrl, responseHeaders) => {
        const raw = [];
        for (const [k, v] of Object.entries(responseHeaders || {})) for (const one of Array.isArray(v) ? v : [v]) raw.push(k, String(one));
        const loc = Object.entries(responseHeaders || {}).find(([k]) => k.toLowerCase() === "location");
        finish(() => resolve({ response: { statusCode, statusMessage: "", headers: { location: loc ? String(Array.isArray(loc[1]) ? loc[1][0] : loc[1]) : void 0 }, rawHeaders: raw }, body: Buffer.alloc(0) }));
        try {
          req.abort();
        } catch (_) {
        }
      });
      req.on("response", (response) => {
        const chunks = [];
        let total = 0;
        response.on("data", (chunk) => {
          total += chunk.length;
          if (total > MAX_RESPONSE_BYTES) {
            finish(() => reject(new Error("响应超过大小限制")));
            try {
              req.abort();
            } catch (_) {
            }
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const raw = Array.isArray(response.rawHeaders) ? response.rawHeaders.map(String) : [];
          if (!raw.length) for (const [k, v] of Object.entries(response.headers || {})) for (const one of Array.isArray(v) ? v : [v]) raw.push(k, String(one));
          const headersObj = {};
          for (const [k, v] of Object.entries(response.headers || {})) headersObj[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
          finish(() => resolve({ response: { statusCode: Number(response.statusCode || 0), statusMessage: String(response.statusMessage || ""), headers: headersObj, rawHeaders: raw }, body: Buffer.concat(chunks) }));
        });
        response.on("error", (e) => finish(() => reject(e)));
        response.on("aborted", () => finish(() => reject(new Error("Response aborted"))));
      });
      req.on("error", (e) => finish(() => reject(e)));
      if (body) req.write(body);
      req.end();
    });
  }
  function once(url, request, settle, session) {
    if (electronNet) return onceNet(url, request, settle, session);
    const method = String(request.method || "GET").toUpperCase();
    const client = url.protocol === "https:" ? https : http;
    const headers = { ...request.headers };
    const body = request.data == null ? null : Buffer.from(String(request.data), "utf8");
    if (body && !Object.keys(headers).some((key) => key.toLowerCase() === "content-length")) headers["Content-Length"] = body.length;
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "accept-encoding")) headers["Accept-Encoding"] = "gzip, deflate, br";
    return new Promise((resolve, reject) => {
      const req = client.request(url, { method, headers, ...tlsOptions }, (response) => {
        let stream = response;
        const encoding = String(response.headers["content-encoding"] || "").toLowerCase();
        if (encoding === "br") stream = response.pipe(zlib.createBrotliDecompress());
        else if (encoding === "gzip") stream = response.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = response.pipe(zlib.createInflate());
        const chunks = [];
        let total = 0;
        stream.on("data", (chunk) => {
          total += chunk.length;
          if (total > MAX_RESPONSE_BYTES) {
            req.destroy(new Error("响应超过大小限制"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ response, body: Buffer.concat(chunks) }));
        stream.on("error", reject);
        response.on("aborted", () => reject(new Error("Response aborted")));
      });
      settle.cancel = (reason) => req.destroy(reason);
      req.setTimeout(request.timeout, () => req.destroy(Object.assign(new Error("timeout"), { kind: "timeout" })));
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }
  async function perform(id, input, context) {
    const request = {
      method: String(input.method || "GET").toUpperCase(),
      headers: {},
      data: input.data,
      timeout: Math.max(1e3, Math.min(Number(input.timeout) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)),
      manualRedirect: input.redirect === "manual",
      anonymous: Boolean(input.anonymous),
      explicitCookie: typeof input.cookie === "string" ? input.cookie : null,
      binary: input.responseType === "arraybuffer"
    };
    for (const [key, value] of Object.entries(input.headers || {})) {
      if (typeof value !== "string" || !/^[\w-]+$/.test(key)) continue;
      if (!/^[\t\x20-\x7E\x80-\xFF]*$/.test(value)) {
        const bad = [...new Set([...value].filter((ch) => !/[\t\x20-\x7E\x80-\xFF]/.test(ch)))];
        throw new Error(`请求头 ${key} 含非法字符：` + bad.slice(0, 8).map((ch) => "U+" + ch.codePointAt(0).toString(16).toUpperCase()).join(","));
      }
      request.headers[key] = value;
    }
    let url = new URL(String(input.url || ""));
    if (url.protocol !== "https:") throw new Error(`GM 请求只允许 HTTPS：${url.protocol}`);
    if (!hostAllowed(url.hostname, context.allowHosts)) throw new Error(`域名不在 @connect 白名单：${url.hostname}`);
    const useSessionCookies = !request.anonymous && request.explicitCookie == null;
    const settle = { cancel: null };
    active.set(id, settle);
    try {
      let method = request.method;
      let data = request.data;
      for (let hop = 0; ; hop += 1) {
        const headers = { ...request.headers };
        if (request.explicitCookie != null) {
          if (request.explicitCookie) headers.Cookie = request.explicitCookie;
        } else if (useSessionCookies) {
          const cookie = await sessionCookieHeader(context.session, url);
          if (cookie) headers.Cookie = cookie;
        }
        const { response, body } = await once(url, { method, headers, data, timeout: request.timeout }, settle, context.session);
        if (useSessionCookies) await persistCookies(context.session, response, url);
        const status = Number(response.statusCode || 0);
        const location = response.headers.location;
        trace({ id, hop, method, url: url.href, reqHeaders: headers, reqData: data, status, location, resHeaders: response.headers, setCookie: response.headers["set-cookie"], contentType: String(response.headers["content-type"] || ""), body: request.binary ? body : body.toString("utf8") });
        if (!request.manualRedirect && [301, 302, 303, 307, 308].includes(status) && location) {
          if (hop >= MAX_REDIRECTS) throw new Error("重定向次数过多");
          const next = new URL(location, url);
          if (next.protocol !== "https:") throw new Error("重定向到非 HTTPS 地址");
          if (!hostAllowed(next.hostname, context.allowHosts)) throw new Error(`重定向域名不在白名单：${next.hostname}`);
          if (status === 303 || (status === 301 || status === 302) && method === "POST") {
            method = "GET";
            data = void 0;
          }
          url = next;
          continue;
        }
        return {
          kind: "load",
          status,
          statusText: String(response.statusMessage || ""),
          responseHeaders: rawHeaders(response),
          finalUrl: url.href,
          ...request.binary ? { response: body } : { responseText: body.toString("utf8") }
        };
      }
    } finally {
      active.delete(id);
    }
  }
  return Object.freeze({
    async request(id, input, context) {
      try {
        return await perform(id, input, context);
      } catch (error) {
        const kind = error?.kind === "timeout" ? "timeout" : error?.kind === "abort" ? "abort" : "error";
        let u = null;
        try {
          u = new URL(String(input?.url || ""));
        } catch (_) {
        }
        trace({ id, hop: -1, method: String(input?.method || "GET"), url: String(input?.url || ""), reqHeaders: input?.headers, reqData: input?.data, error: String(error?.message || error), kind });
        log("GM request failed", JSON.stringify({ id, kind, message: String(error?.message || error), host: u?.hostname, path: u?.pathname, method: input?.method || "GET", headers: Object.keys(input?.headers || {}), binary: input?.responseType === "arraybuffer", redirect: input?.redirect || "follow", anonymous: Boolean(input?.anonymous), cookie: typeof input?.cookie === "string" ? input.cookie.length : null, transport: electronNet ? "net" : "node" }));
        return { kind, status: 0, statusText: "", responseHeaders: "", finalUrl: String(input?.url || ""), error: String(error?.message || error) };
      }
    },
    abort(id) {
      const settle = active.get(id);
      if (settle?.cancel) settle.cancel(Object.assign(new Error("abort"), { kind: "abort" }));
      return Boolean(settle);
    },
    activeCount: () => active.size
  });
}
module.exports = { createGmRequestHost, hostAllowed, parseSetCookie, MAX_RESPONSE_BYTES };
