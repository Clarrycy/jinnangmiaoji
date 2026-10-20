'use strict';
// 主进程侧的 GM_xmlhttpRequest 替身：为随包 userscript（统一登录器）提供跨域请求。
// 语义对齐 Tampermonkey 原生 XHR 模式：返回原始响应头（含每条 Set-Cookie）、finalUrl、
// 可选 redirect:'manual'、anonymous（不带浏览器 cookie）、显式 cookie 头。
// 域名白名单来自脚本自身的 @connect，加上官方源；其他域名直接拒绝。
import http = require('http');
import https = require('https');
import zlib = require('zlib');

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const ALWAYS_ALLOWED = ['sanguosha.com'];

function hostAllowed(hostname, allowHosts) {
  const host = String(hostname || '').toLowerCase();
  for (const entry of [...ALWAYS_ALLOWED, ...allowHosts]) {
    if (host === entry || host.endsWith(`.${entry}`)) return true;
  }
  return false;
}

function rawHeaders(response) {
  const lines = [];
  const raw = response.rawHeaders || [];
  for (let index = 0; index + 1 < raw.length; index += 2) lines.push(`${raw[index]}: ${raw[index + 1]}`);
  return lines.join('\r\n');
}

function setCookieLines(response) {
  const raw = response.rawHeaders || [];
  const lines = [];
  for (let index = 0; index + 1 < raw.length; index += 2) {
    if (String(raw[index]).toLowerCase() === 'set-cookie') lines.push(raw[index + 1]);
  }
  return lines;
}

function parseSetCookie(line, url) {
  const parts = String(line).split(';').map(part => part.trim()).filter(Boolean);
  const [name, ...valueParts] = (parts.shift() || '').split('=');
  if (!name) return null;
  const cookie: Record<string, any> = { url: url.origin + '/', name: name.trim(), value: valueParts.join('=') };
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const attribute = key.trim().toLowerCase();
    const value = rest.join('=').trim();
    if (attribute === 'domain' && value) cookie.domain = value;
    else if (attribute === 'path' && value) cookie.path = value;
    else if (attribute === 'secure') cookie.secure = true;
    else if (attribute === 'httponly') cookie.httpOnly = true;
    else if (attribute === 'expires' && Number.isFinite(Date.parse(value))) cookie.expirationDate = Date.parse(value) / 1000;
    else if (attribute === 'max-age' && Number.isFinite(Number(value))) cookie.expirationDate = Date.now() / 1000 + Number(value);
  }
  return cookie;
}

function cookieKey(cookie) {
  return `${String(cookie?.domain || '').replace(/^\./, '')}\n${cookie?.path || '/'}\n${cookie?.name || ''}`;
}

function cookieLine(cookie) {
  const clean = value => String(value == null ? '' : value).replace(/[\r\n]/g, '');
  let line = `${clean(cookie.name)}=${clean(cookie.value)}; Path=${clean(cookie.path || '/')}`;
  if (cookie.domain && !cookie.hostOnly) line += `; Domain=${clean(cookie.domain)}`;
  if (cookie.secure) line += '; Secure';
  if (cookie.httpOnly) line += '; HttpOnly';
  if (Number.isFinite(cookie.expirationDate)) line += `; Expires=${new Date(cookie.expirationDate * 1000).toUTCString()}`;
  if (/^(strict|lax|none)$/i.test(String(cookie.sameSite || ''))) line += `; SameSite=${cookie.sameSite}`;
  return line;
}

function expiredCookieLine(cookie) {
  const clean = value => String(value == null ? '' : value).replace(/[\r\n]/g, '');
  let line = `${clean(cookie.name)}=; Max-Age=0; Path=${clean(cookie.path || '/')}`;
  if (cookie.domain && !cookie.hostOnly) line += `; Domain=${clean(cookie.domain)}`;
  return line;
}

async function cookieSnapshot(session) {
  const snapshot = new Map();
  if (!session?.cookies?.get) return snapshot;
  const cookies = await session.cookies.get({});
  for (const cookie of cookies || []) snapshot.set(cookieKey(cookie), cookie);
  return snapshot;
}

function changedCookieLines(before, after) {
  const lines = [];
  for (const [key, cookie] of after) {
    const previous = before.get(key);
    if (!previous || String(previous.value) !== String(cookie.value)) lines.push(cookieLine(cookie));
  }
  for (const [key, cookie] of before) if (!after.has(key)) lines.push(expiredCookieLine(cookie));
  return lines;
}

function addSetCookieLines(response, lines) {
  if (!lines.length) return;
  const raw = Array.isArray(response.rawHeaders) ? response.rawHeaders.slice() : [];
  const existing = new Set();
  for (let index = 0; index + 1 < raw.length; index += 2) {
    if (String(raw[index]).toLowerCase() === 'set-cookie') existing.add(String(raw[index + 1]).trim());
  }
  for (const line of lines) {
    if (existing.has(line.trim())) continue;
    existing.add(line.trim());
    raw.push('Set-Cookie', line);
  }
  response.rawHeaders = raw;
}

function parseCookieHeader(header) {
  const cookies = [];
  for (const part of String(header || '').split(';')) {
    const pair = part.trim();
    const equal = pair.indexOf('=');
    if (equal < 1) continue;
    const name = pair.slice(0, equal).trim();
    const value = pair.slice(equal + 1).trim();
    if (!/^[\w!#$%&'*+.^`|~-]+$/.test(name) || /[\r\n]/.test(value)) continue;
    cookies.push({ name, value });
  }
  return cookies;
}

async function seedExplicitCookies(session, url, header) {
  if (!session?.cookies?.set) return;
  for (const cookie of parseCookieHeader(header)) {
    try { await session.cookies.set({ url: url.origin + '/', name: cookie.name, value: cookie.value }); } catch (_) {}
  }
}

async function copySessionCookies(source, target) {
  if (!source?.cookies?.get || !target?.cookies?.set) return;
  let cookies = [];
  try { cookies = await source.cookies.get({}); } catch (_) { return; }
  for (const cookie of cookies || []) {
    const value: Record<string, any> = {
      name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path || '/',
      secure: Boolean(cookie.secure), httpOnly: Boolean(cookie.httpOnly),
    };
    if (Number.isFinite(cookie.expirationDate)) value.expirationDate = cookie.expirationDate;
    if (cookie.sameSite) value.sameSite = cookie.sameSite;
    try { await target.cookies.set(value); } catch (_) {}
  }
}

function createGmRequestHost(options: {
  log?: (...args: any[]) => void;
  tlsOptions?: Record<string, unknown>;
  net?: any;
  isolatedSession?: () => any | Promise<any>;
} = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  /* 壳里传 Electron 的 net：请求走 Chromium 网络层（跟随系统代理、用 Chromium 的 DNS 与证书库）。
     原来走 Node https 不吃系统代理，国内挂代理的用户 Steam 三个域名全部超时（2026-10-20 多名用户反馈）。测试里没有 Electron 就还走 Node。 */
  const electronNet = options.net && typeof options.net.request === 'function' ? options.net : null;
  const isolatedSession = typeof options.isolatedSession === 'function' ? options.isolatedSession : null;
  // 仅测试用：对本地自签名服务放宽 TLS；生产不传。
  const tlsOptions = options.tlsOptions && typeof options.tlsOptions === 'object' ? options.tlsOptions : {};
  const active = new Map();

  async function sessionCookieHeader(session, url) {
    if (!session?.cookies) return '';
    try {
      const cookies = await session.cookies.get({ url: url.href });
      return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    } catch (_) { return ''; }
  }

  async function persistCookies(session, response, url) {
    if (!session?.cookies) return;
    for (const line of setCookieLines(response)) {
      const cookie = parseSetCookie(line, url);
      if (!cookie) continue;
      try { await session.cookies.set(cookie); } catch (_) {}
    }
  }

  function onceNet(url, request, settle, session, useSessionCookies) {
    const method = String(request.method || 'GET').toUpperCase();
    const headers = { ...request.headers };
    const body = request.data == null ? null : Buffer.from(String(request.data), 'utf8');
    return new Promise<{ response: any; body: Buffer }>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); fn(); };
      const req = electronNet.request({ method, url: url.href, session: session || undefined, useSessionCookies, redirect: 'manual' });
      for (const [k, v] of Object.entries(headers)) { try { req.setHeader(k, String(v)); } catch (_) {} }
      const timer = setTimeout(() => { finish(() => reject(Object.assign(new Error('timeout'), { kind: 'timeout' }))); try { req.abort(); } catch (_) {} }, request.timeout);
      settle.cancel = reason => { finish(() => reject(reason)); try { req.abort(); } catch (_) {} };
      /* 重定向一律不在这层跟：把 3xx 原样交给上层（上层按 manualRedirect 决定跟不跟、跟到哪、cookie 怎么存） */
      req.on('redirect', (statusCode, _method, redirectUrl, responseHeaders) => {
        const raw: string[] = []; for (const [k, v] of Object.entries(responseHeaders || {})) for (const one of (Array.isArray(v) ? v : [v])) raw.push(k, String(one));
        const loc = Object.entries(responseHeaders || {}).find(([k]) => k.toLowerCase() === 'location');
        finish(() => resolve({ response: { statusCode, statusMessage: '', headers: { location: loc ? String(Array.isArray(loc[1]) ? loc[1][0] : loc[1]) : undefined }, rawHeaders: raw }, body: Buffer.alloc(0) }));
        try { req.abort(); } catch (_) {}
      });
      req.on('response', (response: any) => {
        const chunks: Buffer[] = []; let total = 0;
        response.on('data', (chunk: Buffer) => { total += chunk.length; if (total > MAX_RESPONSE_BYTES) { finish(() => reject(new Error('响应超过大小限制'))); try { req.abort(); } catch (_) {} return; } chunks.push(chunk); });
        response.on('end', () => {
          const raw: string[] = Array.isArray(response.rawHeaders) ? response.rawHeaders.map(String) : [];
          if (!raw.length) for (const [k, v] of Object.entries(response.headers || {})) for (const one of (Array.isArray(v) ? v : [v])) raw.push(k, String(one));
          const headersObj: Record<string, any> = {}; for (const [k, v] of Object.entries(response.headers || {})) headersObj[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
          finish(() => resolve({ response: { statusCode: Number(response.statusCode || 0), statusMessage: String(response.statusMessage || ''), headers: headersObj, rawHeaders: raw }, body: Buffer.concat(chunks) }));
        });
        response.on('error', (e: any) => finish(() => reject(e)));
        response.on('aborted', () => finish(() => reject(new Error('Response aborted'))));
      });
      req.on('error', (e: any) => finish(() => reject(e)));
      if (body) req.write(body);
      req.end();
    });
  }

  function once(url, request, settle, session?, useSessionCookies = false) {
    if (electronNet) return onceNet(url, request, settle, session, useSessionCookies);
    const method = String(request.method || 'GET').toUpperCase();
    const client = url.protocol === 'https:' ? https : http;
    const headers = { ...request.headers };
    const body = request.data == null ? null : Buffer.from(String(request.data), 'utf8');
    if (body && !Object.keys(headers).some(key => key.toLowerCase() === 'content-length')) headers['Content-Length'] = body.length;
    if (!Object.keys(headers).some(key => key.toLowerCase() === 'accept-encoding')) headers['Accept-Encoding'] = 'gzip, deflate, br';
    return new Promise<{ response: any; body: Buffer }>((resolve, reject) => {
      const req = client.request(url, { method, headers, ...tlsOptions }, response => {
        let stream: NodeJS.ReadableStream = response;
        const encoding = String(response.headers['content-encoding'] || '').toLowerCase();
        if (encoding === 'br') stream = response.pipe(zlib.createBrotliDecompress());
        else if (encoding === 'gzip') stream = response.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = response.pipe(zlib.createInflate());
        const chunks = [];
        let total = 0;
        stream.on('data', chunk => {
          total += chunk.length;
          if (total > MAX_RESPONSE_BYTES) { req.destroy(new Error('响应超过大小限制')); return; }
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ response, body: Buffer.concat(chunks) }));
        stream.on('error', reject);
        response.on('aborted', () => reject(new Error('Response aborted')));
      });
      settle.cancel = reason => req.destroy(reason);
      req.setTimeout(request.timeout, () => req.destroy(Object.assign(new Error('timeout'), { kind: 'timeout' })));
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async function perform(id, input, context) {
    const request = {
      method: String(input.method || 'GET').toUpperCase(),
      headers: {},
      data: input.data,
      // Xiaomi's QR login holds one long-poll request for up to 315 seconds.
      // Capping every GM request at 60 seconds closes the QR before a slow scan.
      timeout: Math.max(1000, Math.min(Number(input.timeout) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)),
      manualRedirect: input.redirect === 'manual',
      anonymous: Boolean(input.anonymous),
      explicitCookie: typeof input.cookie === 'string' ? input.cookie : null,
      binary: input.responseType === 'arraybuffer',
    };
    for (const [key, value] of Object.entries(input.headers || {})) {
      if (typeof value !== 'string' || !/^[\w-]+$/.test(key)) continue;
      // Node only accepts ISO-8859-1 header values. A value carrying control
      // bytes or CJK text (the OPPO risk header x-euler-const is produced by a
      // wasm SDK and occasionally picks up stray bytes) makes client.request()
      // throw ERR_INVALID_CHAR synchronously — the request never leaves the
      // process, yet it used to be reported as a network failure. Reject it here
      // with the offending code points so the log says what actually happened.
      if (!/^[\t\x20-\x7E\x80-\xFF]*$/.test(value)) {
        const bad = [...new Set([...value].filter(ch => !/[\t\x20-\x7E\x80-\xFF]/.test(ch)))];
        throw new Error(`请求头 ${key} 含非法字符：` + bad.slice(0, 8)
          .map(ch => 'U+' + ch.codePointAt(0).toString(16).toUpperCase()).join(','));
      }
      request.headers[key] = value;
    }
    let url = new URL(String(input.url || ''));
    if (url.protocol !== 'https:') throw new Error(`GM 请求只允许 HTTPS：${url.protocol}`);
    if (!hostAllowed(url.hostname, context.allowHosts)) throw new Error(`域名不在 @connect 白名单：${url.hostname}`);
    const useSessionCookies = !request.anonymous && request.explicitCookie == null;
    const settle = { cancel: null };
    active.set(id, settle);
    let jar = null;
    try {
      if (isolatedSession) {
        jar = await isolatedSession();
        if (!jar) throw new Error('隔离 Cookie 会话不可用');
        if (context.session?.getUserAgent && jar.setUserAgent) {
          try { jar.setUserAgent(context.session.getUserAgent()); } catch (_) {}
        }
        if (request.explicitCookie != null) await seedExplicitCookies(jar, url, request.explicitCookie);
        else if (useSessionCookies) await copySessionCookies(context.session, jar);
      }
      let method = request.method;
      let data = request.data;
      const syntheticCookieLines = [];
      for (let hop = 0; ; hop += 1) {
        const headers: Record<string, any> = { ...request.headers };
        if (jar) {
          for (const name of Object.keys(headers)) if (name.toLowerCase() === 'cookie') delete headers[name];
        } else if (request.explicitCookie != null) {
          if (request.explicitCookie) headers.Cookie = request.explicitCookie;
        } else if (useSessionCookies) {
          const cookie = await sessionCookieHeader(context.session, url);
          if (cookie) headers.Cookie = cookie;
        }
        const before = jar ? await cookieSnapshot(jar) : null;
        const { response, body } = await once(url, { method, headers, data, timeout: request.timeout }, settle,
          jar || context.session, Boolean(jar) || useSessionCookies);
        if (jar && before) {
          const lines = changedCookieLines(before, await cookieSnapshot(jar));
          if (request.manualRedirect) addSetCookieLines(response, lines);
          else syntheticCookieLines.push(...lines);
        } else if (useSessionCookies) await persistCookies(context.session, response, url);
        const status = Number(response.statusCode || 0);
        const location = response.headers.location;
        if (!request.manualRedirect && [301, 302, 303, 307, 308].includes(status) && location) {
          if (hop >= MAX_REDIRECTS) throw new Error('重定向次数过多');
          const next = new URL(location, url);
          if (next.protocol !== 'https:') throw new Error('重定向到非 HTTPS 地址');
          if (!hostAllowed(next.hostname, context.allowHosts)) throw new Error(`重定向域名不在白名单：${next.hostname}`);
          if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) { method = 'GET'; data = undefined; }
          url = next;
          continue;
        }
        if (!request.manualRedirect) addSetCookieLines(response, syntheticCookieLines);
        return {
          kind: 'load',
          status,
          statusText: String(response.statusMessage || ''),
          responseHeaders: rawHeaders(response),
          finalUrl: url.href,
          ...(request.binary ? { response: body } : { responseText: body.toString('utf8') }),
        };
      }
    } finally {
      if (jar?.clearStorageData) try { await jar.clearStorageData(); } catch (_) {}
      active.delete(id);
    }
  }

  return Object.freeze({
    async request(id, input, context) {
      try {
        return await perform(id, input, context);
      } catch (error) {
        const kind = error?.kind === 'timeout' ? 'timeout' : error?.kind === 'abort' ? 'abort' : 'error';
        log('GM request failed', JSON.stringify({ id, kind, message: String(error?.message || error) }));
        return { kind, status: 0, statusText: '', responseHeaders: '', finalUrl: String(input?.url || ''), error: String(error?.message || error) };
      }
    },
    abort(id) {
      const settle = active.get(id);
      if (settle?.cancel) settle.cancel(Object.assign(new Error('abort'), { kind: 'abort' }));
      return Boolean(settle);
    },
    activeCount: () => active.size,
  });
}

export = { createGmRequestHost, hostAllowed, parseSetCookie, MAX_RESPONSE_BYTES };
