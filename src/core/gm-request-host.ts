'use strict';
// 主进程侧的 GM_xmlhttpRequest 替身：为随包 userscript（统一登录器）提供跨域请求。
// 语义对齐 Tampermonkey 原生 XHR 模式：返回原始响应头（含每条 Set-Cookie）、finalUrl、
// 可选 redirect:'manual'、anonymous（不带浏览器 cookie）、显式 cookie 头。
// 域名白名单来自脚本自身的 @connect，加上官方源；其他域名直接拒绝。
import http = require('http');
import https = require('https');
import zlib = require('zlib');
import cookieJar = require('./gm-cookie-jar');
import steam_direct_ = require('./steam-direct-agent');
type SteamConnector = ReturnType<typeof steam_direct_.createSteamDirectConnector>;
type SteamConnection = Awaited<ReturnType<SteamConnector['prepare']>>;

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 20000;
// Xiaomi's QR endpoint holds one request for up to five minutes. Preserve
// callers' bounded long-poll deadlines instead of cutting them off at 60 s.
const MAX_TIMEOUT_MS = 315000;
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
  const cookie: Record<string, any> = { url: url.href, name: name.trim(), value: valueParts.join('='), path: url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1).replace(/\/$/, '') || '/' };
  let maxAge: number | undefined;
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const attribute = key.trim().toLowerCase();
    const value = rest.join('=').trim();
    if (attribute === 'domain' && value) cookie.domain = value;
    else if (attribute === 'path' && value) cookie.path = value;
    else if (attribute === 'secure') cookie.secure = true;
    else if (attribute === 'httponly') cookie.httpOnly = true;
    else if (attribute === 'expires' && Number.isFinite(Date.parse(value))) cookie.expirationDate = Date.parse(value) / 1000;
    else if (attribute === 'max-age' && /^-?\d+$/.test(value)) maxAge = Number(value);
    else if (attribute === 'samesite') cookie.sameSite = { none: 'no_restriction', lax: 'lax', strict: 'strict' }[value.toLowerCase()];
  }
  if (maxAge !== undefined) cookie.expirationDate = Math.max(0, Date.now() / 1000 + maxAge);
  return cookie;
}

function createGmRequestHost(options: { log?: (...args: any[]) => void; tlsOptions?: Record<string, unknown>; net?: any; trace?: (event: any) => void; steamDirect?: SteamConnector; isolatedSession?: (index: number) => any } = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  /* 登录录制器：每一跳的请求与返回原样交出，脱敏由录制器在记下来之前做（login-recorder.ts）；录制器没开就是空函数 */
  const trace = (event) => { try { options.trace?.(event); } catch (_) {} };
  /* 壳里传 Electron 的 net：默认走 Chromium 网络层（跟随系统代理、用 Chromium 的 DNS 与证书库）。
     指定的 Steam 认证接口在代理策略明确为 DIRECT 时才尝试独立 TLS 连接，见 once()。
     原来走 Node https 不吃系统代理，国内挂代理的用户 Steam 三个域名全部超时（2026-10-20 多名用户反馈）。测试里没有 Electron 就还走 Node。 */
  const electronNet = options.net && typeof options.net.request === 'function' && process.env.JND_GM_NODE !== '1' ? options.net : null; /* JND_GM_NODE=1：排查用，强制走 Node */
  // 仅测试用：对本地自签名服务放宽 TLS；生产不传。
  const tlsOptions = options.tlsOptions && typeof options.tlsOptions === 'object' ? options.tlsOptions : {};
  const active = new Map();
  const pool = options.isolatedSession ? cookieJar.createPool(options.isolatedSession) : null;

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
      await session.cookies.set(cookie);
    }
  }

  function onceNet(url, request, settle, session) {
    const method = String(request.method || 'GET').toUpperCase();
    const headers = { ...request.headers };
    const body = request.data == null ? null : Buffer.from(String(request.data), 'utf8');
    return new Promise<{ response: any; body: Buffer }>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); fn(); };
      // The isolated session has no game webRequest hooks; never pass the caller session here.
      /* 跨源 Referer：Chromium 网络层会按默认 referrer 策略把这种请求整个拒掉（ERR_BLOCKED_BY_CLIENT，2026-10-20 实测），脚本模拟浏览器时又必须带它——指定 unsafe-url 让 referrer 原样带过去 */
      const hasReferer = Object.keys(headers).some(k => k.toLowerCase() === 'referer');
      for (const k of Object.keys(headers)) if (session && k.toLowerCase() === 'cookie') delete headers[k];
      const req = electronNet.request({ method, url: url.href, ...(session ? { session } : {}), useSessionCookies: Boolean(session), redirect: 'manual', ...(hasReferer ? { referrerPolicy: 'unsafe-url' } : {}) });
      for (const [k, v] of Object.entries(headers)) { try { req.setHeader(k, String(v)); } catch (_) {} }
      const timer = setTimeout(() => { finish(() => reject(Object.assign(new Error('timeout'), { kind: 'timeout' }))); try { req.abort(); } catch (_) {} }, request.timeout);
      settle.cancel = reason => { finish(() => reject(reason)); try { req.abort(); } catch (_) {} };
      /* 重定向一律不在这层跟：把 3xx 原样交给上层（上层按 manualRedirect 决定跟不跟、跟到哪、cookie 怎么存） */
      req.on('redirect', (statusCode, _method, redirectUrl, responseHeaders) => {
        const raw: string[] = []; for (const [k, v] of Object.entries(responseHeaders || {})) for (const one of (Array.isArray(v) ? v : [v])) raw.push(k, String(one));
        const loc = Object.entries(responseHeaders || {}).find(([k]) => k.toLowerCase() === 'location');
        finish(() => resolve({ response: { cookiesHandled: Boolean(session), statusCode, statusMessage: '', headers: { location: loc ? String(Array.isArray(loc[1]) ? loc[1][0] : loc[1]) : undefined }, rawHeaders: raw }, body: Buffer.alloc(0) }));
        try { req.abort(); } catch (_) {}
      });
      req.on('response', (response: any) => {
        const chunks: Buffer[] = []; let total = 0;
        response.on('data', (chunk: Buffer) => { total += chunk.length; if (total > MAX_RESPONSE_BYTES) { finish(() => reject(new Error('响应超过大小限制'))); try { req.abort(); } catch (_) {} return; } chunks.push(chunk); });
        response.on('end', () => {
          const raw: string[] = Array.isArray(response.rawHeaders) ? response.rawHeaders.map(String) : [];
          if (!raw.length) for (const [k, v] of Object.entries(response.headers || {})) for (const one of (Array.isArray(v) ? v : [v])) raw.push(k, String(one));
          const headersObj: Record<string, any> = {}; for (const [k, v] of Object.entries(response.headers || {})) headersObj[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
          finish(() => resolve({ response: { cookiesHandled: Boolean(session), statusCode: Number(response.statusCode || 0), statusMessage: String(response.statusMessage || ''), headers: headersObj, rawHeaders: raw }, body: Buffer.concat(chunks) }));
        });
        response.on('error', (e: any) => finish(() => reject(e)));
        response.on('aborted', () => finish(() => reject(new Error('Response aborted'))));
      });
      req.on('error', (e: any) => finish(() => reject(e)));
      if (body) req.write(body);
      req.end();
    });
  }

  async function once(url, request, settle, session?) {
    if (!electronNet || !options.steamDirect || !steam_direct_.isSteamDirectUrl(url))
      return electronNet ? onceNet(url, request, settle, session) : onceNode(url, request, settle);
    const started = Date.now(), control = new AbortController();
    settle.cancel = reason => control.abort(reason);
    const deadline = setTimeout(() => settle.cancel?.(Object.assign(new Error('timeout'), { kind: 'timeout' })), request.timeout);
    let direct: SteamConnection = null;
    try {
      try { direct = await options.steamDirect.prepare(url, control.signal); }
      catch (error) {
        if (control.signal.aborted) throw control.signal.reason;
        // Only connection establishment may fall back: no auth HTTP bytes sent yet.
        log('steam-direct fallback', url.hostname, 'code=', error?.code || 'CONNECT_FAILED');
      }
      if (control.signal.aborted) throw control.signal.reason;
      const remaining = request.timeout - (Date.now() - started);
      if (remaining <= 0) throw Object.assign(new Error('timeout'), { kind: 'timeout' });
      const bounded = { ...request, timeout: remaining };
      // Once HTTP starts, never replay an authorization POST on another transport.
      return await (direct ? onceNode(url, bounded, settle, direct) : onceNet(url, bounded, settle, session));
    } finally { clearTimeout(deadline); direct?.cancel(); }
  }

  function onceNode(url, request, settle, direct: SteamConnection = null) {
    const method = String(request.method || 'GET').toUpperCase();
    const client = url.protocol === 'https:' ? https : http;
    const headers = { ...request.headers };
    const body = request.data == null ? null : Buffer.from(String(request.data), 'utf8');
    if (body && !Object.keys(headers).some(key => key.toLowerCase() === 'content-length')) headers['Content-Length'] = body.length;
    if (!Object.keys(headers).some(key => key.toLowerCase() === 'accept-encoding')) headers['Accept-Encoding'] = 'gzip, deflate, br';
    return new Promise<{ response: any; body: Buffer }>((resolve, reject) => {
      const req = client.request(url, { method, headers, ...tlsOptions, ...(direct ? { agent: direct.agent, rejectUnauthorized: true } : {}) }, response => {
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
        stream.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 400) direct?.success(); else direct?.failure();
          resolve({ response, body: Buffer.concat(chunks) });
        });
        stream.on('error', error => { direct?.failure(); reject(error); });
        response.on('aborted', () => { direct?.failure(); reject(new Error('Response aborted')); });
      });
      settle.cancel = reason => req.destroy(reason);
      req.setTimeout(request.timeout, () => req.destroy(Object.assign(new Error('timeout'), { kind: 'timeout' })));
      req.on('error', error => { direct?.failure(); reject(error); });
      if (body) req.write(body);
      req.end();
    });
  }

  async function perform(id, input, context) {
    const request = {
      method: String(input.method || 'GET').toUpperCase(),
      headers: {},
      data: input.data,
      timeout: Math.max(1000, Math.min(Number(input.timeout) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)),
      manualRedirect: input.redirect === 'manual',
      anonymous: Boolean(input.anonymous),
      explicitCookie: typeof input.cookie === 'string' ? input.cookie : null,
      binary: input.responseType === 'arraybuffer',
    };
    for (const [key, value] of Object.entries(input.headers || {})) {
      if (typeof value !== 'string' || !/^[\w-]+$/.test(key)) continue;
      // 头值只允许 ISO-8859-1 可打印字符（PR #1 by heqinjian）：OPPO 风控头 x-euler-const 由 wasm SDK 生成，偶尔混入控制字节，
      // Node 的 http 层会同步抛 ERR_INVALID_CHAR、Chromium 也拒收，而上层把它当成网络失败。这里直接报出码点，日志才说得清。
      if (!/^[\t\x20-\x7E\x80-\xFF]*$/.test(value)) {
        const bad = [...new Set([...value].filter(ch => !/[\t\x20-\x7E\x80-\xFF]/.test(ch)))];
        throw new Error(`请求头 ${key} 含非法字符：` + bad.slice(0, 8).map(ch => 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase()).join(','));
      }
      if (key.toLowerCase() === 'cookie') { if (request.explicitCookie == null) request.explicitCookie = value; }
      else request.headers[key] = value;
    }
    let url = new URL(String(input.url || ''));
    if (url.protocol !== 'https:') throw new Error(`GM 请求只允许 HTTPS：${url.protocol}`);
    if (!hostAllowed(url.hostname, context.allowHosts)) throw new Error(`域名不在 @connect 白名单：${url.hostname}`);
    const useSessionCookies = !request.anonymous && request.explicitCookie == null;
    const settle = { cancel: null };
    const control = new AbortController(), deadline = Date.now() + request.timeout;
    active.set(id, { cancel(reason) { control.abort(reason); settle.cancel?.(reason); } });
    const timer = setTimeout(() => { const e = Object.assign(new Error('timeout'), { kind: 'timeout' }); control.abort(e); settle.cancel?.(e); }, request.timeout);
    let lease = null;
    const check = () => { if (control.signal.aborted) throw control.signal.reason; };
    try {
      if (pool) {
        lease = await pool.acquire(control.signal); check();
        await cookieJar.seed(useSessionCookies ? context.session : null, lease.session, url, request.explicitCookie,
          host => hostAllowed(host, context.allowHosts));
        check();
      }
      let method = request.method;
      let data = request.data;
      for (let hop = 0; ; hop += 1) {
        const headers: Record<string, any> = { ...request.headers };
        check();
        const jar = lease?.session, before = jar ? await cookieJar.snapshot(jar) : null;
        if (jar || useSessionCookies) {
          const cookie = await sessionCookieHeader(jar || context.session, url);
          if (cookie) headers.Cookie = cookie;
        } else if (request.explicitCookie && url.origin === new URL(input.url).origin) headers.Cookie = request.explicitCookie;
        check();
        const { response, body } = await once(url, { method, headers, data, timeout: Math.max(1, deadline - Date.now()) }, settle, jar);
        check();
        if (jar) {
          // Explicit headers are needed for Node Steam TLS; Chromium stores its own response cookies.
          if (!response.cookiesHandled) await persistCookies(jar, response, url);
          await cookieJar.changed(before, jar, useSessionCookies ? context.session : null, response);
        } else if (useSessionCookies) await persistCookies(context.session, response, url);
        const status = Number(response.statusCode || 0);
        const location = response.headers.location;
        trace({ id, hop, method, url: url.href, reqHeaders: headers, reqData: data, status, location, resHeaders: response.headers, setCookie: response.headers['set-cookie'], contentType: String(response.headers['content-type'] || ''), body: request.binary ? body : body.toString('utf8') });
        if (!request.manualRedirect && [301, 302, 303, 307, 308].includes(status) && location) {
          if (hop >= MAX_REDIRECTS) throw new Error('重定向次数过多');
          const next = new URL(location, url);
          if (next.protocol !== 'https:') throw new Error('重定向到非 HTTPS 地址');
          if (!hostAllowed(next.hostname, context.allowHosts)) throw new Error(`重定向域名不在白名单：${next.hostname}`);
          if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) { method = 'GET'; data = undefined; }
          url = next;
          continue;
        }
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
      clearTimeout(timer); active.delete(id);
      if (lease) await lease.release();
    }
  }

  return Object.freeze({
    async request(id, input, context) {
      try {
        return await perform(id, input, context);
      } catch (error) {
        const kind = error?.kind === 'timeout' ? 'timeout' : error?.kind === 'abort' ? 'abort' : 'error';
        let u: any = null; try { u = new URL(String(input?.url || '')); } catch (_) {}
        trace({ id, hop: -1, method: String(input?.method || 'GET'), url: String(input?.url || ''), reqHeaders: input?.headers, reqData: input?.data, error: String(error?.message || error), kind });
        log('GM request failed', JSON.stringify({ id, kind, code: String(error?.code || 'GM_REQUEST_FAILED'), host: u?.hostname, path: u?.pathname, method: input?.method || 'GET', headers: Object.keys(input?.headers || {}), binary: input?.responseType === 'arraybuffer', redirect: input?.redirect || 'follow', anonymous: Boolean(input?.anonymous), cookie: typeof input?.cookie === 'string' ? input.cookie.length : null, transport: electronNet ? 'net' : 'node' }));
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
