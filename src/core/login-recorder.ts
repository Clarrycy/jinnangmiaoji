'use strict';
// 登录录制器（作者 10-21：vivo 玩家扫码后进不去，要看完整活动）。录：统一登录器的每个跨域请求与返回（每一跳）、登录流程日志、页面导航。
// 脱敏在记下来之前就做（AGENTS：凭据、请求头、URL query/hash 落地前拦截）：地址只留来源＋路径＋参数名；请求头只留名字；Cookie 只留名字；
// 返回体只留结构——字段名、数组长度、真假值、小整数；字符串只记长度（code／msg 一类服务端提示短文本除外）。不上传，只在本机复制或导出。
// 面板契约：录制、暂停、继续、停止、清空、复制、导出；显示状态与错误；独立窗口可拖动、可最小化恢复；暂停与最小化不清记录，复制导出不停止不删除。
const MAX_EVENTS = 4000;
// 「code」「result」不在内：授权流程里 code 装的就是授权码（实测 OPPO 回调 code 全大写时会被当成错误码放行）。数字错误码按小整数规则保留
const SAFE_TEXT_KEYS = /^(msg|message|toast|desc|description|stage|status|retcode|errcode|errmsg|error|reason|type|kind|resultCode|resultMsg)$/i;

function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const keys = [...new Set([...u.searchParams.keys()])];
    return `${u.origin}${u.pathname}${keys.length ? `?${keys.join('&')}` : ''}${u.hash ? '#…' : ''}`;
  } catch (_) { return `<url:${String(raw || '').length}>`; }
}
// 一行日志里出现的地址都换成脱敏形式
function redactText(text: string): string {
  return String(text).replace(/https?:\/\/[^\s"'<>]+/g, m => redactUrl(m)).replace(/data:[^\s"']{40,}/g, m => `<data:${m.length}>`);
}
// 提示类字段也只放行三种：带中文的服务端提示、全大写或数字的错误码、小写单词；大小写混排的字母数字串（可能是授权码、票据）只记长度
function safeText(v: string): boolean {
  if (/[\u4e00-\u9fff]/.test(v)) return !/[A-Za-z0-9+/=_-]{12,}/.test(v);
  return /^[A-Z0-9_.:-]{1,40}$/.test(v) || /^[a-z][a-z _-]{0,30}$/.test(v);
}
function shape(v: any, key = '', depth = 0): any {
  if (v === null || v === undefined || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 100000 ? v : `<num:${String(Math.trunc(Math.abs(v))).length}>`;
  if (typeof v === 'string') return SAFE_TEXT_KEYS.test(key) && v.length <= 120 && safeText(v) ? v : `<str:${v.length}>`;
  if (depth >= 6) return Array.isArray(v) ? `<array:${v.length}>` : '<object>';
  if (Array.isArray(v)) return { length: v.length, items: v.slice(0, 5).map(x => shape(x, key, depth + 1)) };
  if (typeof v === 'object') { const out: Record<string, any> = {}; for (const k of Object.keys(v).slice(0, 60)) out[k] = shape(v[k], k, depth + 1); return out; }
  return `<${typeof v}>`;
}
function shapeBody(body: any, contentType = ''): any {
  if (body == null || body === '') return null;
  if (typeof body !== 'string') return `<bytes:${body.byteLength ?? body.length ?? 0}>`;
  const t = body.trim();
  if (/^[{[]/.test(t)) { try { return { json: shape(JSON.parse(t)) }; } catch (_) {} }
  if (/json/i.test(contentType)) return `<text:${body.length}>`;
  if (/^<!doctype|^<html|<\/html>/i.test(t)) return `<html:${body.length}>`;
  if (/^[\w.%-]+=[^&]*(&[\w.%-]+=[^&]*)*$/.test(t)) return { form: [...new URLSearchParams(t).keys()] };
  return `<text:${body.length}>`;
}
function headerNames(h: any): string[] {
  if (!h) return [];
  if (typeof h === 'string') return h.split(/\r?\n/).map(l => l.split(':')[0].trim().toLowerCase()).filter(Boolean);
  return Object.keys(h).map(k => k.toLowerCase());
}
function cookieNames(lines: any): string[] {
  const arr = Array.isArray(lines) ? lines : lines ? [lines] : [];
  return arr.map((l: string) => String(l).split('=')[0].trim()).filter(Boolean);
}

type Status = 'idle' | 'recording' | 'paused' | 'stopped';
function createLoginRecorder(opts: { meta: () => Record<string, unknown> }) {
  let status: Status = 'idle', events: any[] = [], dropped = 0, startedAt = 0, lastError = '';
  // 正式版的自动证据（作者 10-21：不能指望玩家操作任何东西，最多发一份日志）：跨域请求一直按同样规则脱敏后进这个环形缓冲，登录失败时由壳整段写进日志
  let evidence: any[] = [];
  const listeners = new Set<() => void>();
  const changed = () => { for (const fn of listeners) { try { fn(); } catch (_) {} } };
  function push(kind: string, data: Record<string, unknown>) {
    if (status !== 'recording') return;
    events.push({ t: Date.now(), kind, ...data });
    if (events.length > MAX_EVENTS) { events.shift(); dropped += 1; }
    changed();
  }
  return {
    // 统一登录器跨域请求的每一跳（gm-request-host 回调）
    gm(e: { id: string; hop: number; method: string; url: string; reqHeaders: any; reqData: any; status?: number; location?: string; resHeaders?: any; setCookie?: any; contentType?: string; body?: any; error?: string; kind?: string }) {
      const item = {
        id: e.id, hop: e.hop, method: e.method, url: redactUrl(e.url), reqHeaders: headerNames(e.reqHeaders), reqBody: shapeBody(e.reqData),
        ...(e.error ? { error: redactText(e.error), errorKind: e.kind } : { status: e.status, location: e.location ? redactUrl(e.location) : undefined, resHeaders: headerNames(e.resHeaders), setCookie: cookieNames(e.setCookie), body: shapeBody(e.body, e.contentType) }),
      };
      evidence.push({ t: Date.now(), ...item }); if (evidence.length > 40) evidence.shift();
      push('gm', item);
    },
    // 取走上次失败以来的请求经过（取完清空，下次失败只写新的）
    takeEvidence() { const out = evidence; evidence = []; return out; },
    // 壳日志里与登录有关的行
    log(args: any[]) {
      if (status !== 'recording') return;
      const head = String(args[0] || '');
      const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (head === 'CONSOLE' && !/\[统一登录器\]|\[JND-MICRO\]/.test(line)) return;
      if (!/^(login-|CONSOLE|will-navigate|did-start-loading|did-fail-load|did-navigate|GM request failed|landing|tab created|tab closed|chrome-tab)/.test(head)) return;
      push('log', { line: redactText(line).slice(0, 2000) });
    },
    start() { if (status === 'recording') return; if (status === 'idle' || status === 'stopped') { startedAt = Date.now(); events.push({ t: startedAt, kind: 'mark', note: 'start' }); } status = 'recording'; lastError = ''; changed(); },
    pause() { if (status === 'recording') { status = 'paused'; changed(); } },
    resume() { if (status === 'paused') { status = 'recording'; changed(); } },
    stop() { if (status === 'recording' || status === 'paused') { events.push({ t: Date.now(), kind: 'mark', note: 'stop' }); status = 'stopped'; changed(); } },
    clear() { events = []; dropped = 0; startedAt = status === 'recording' ? Date.now() : 0; changed(); },
    setError(message: string) { lastError = String(message || ''); changed(); },
    state() { return { status, count: events.length, dropped, startedAt, error: lastError }; },
    // 复制与导出用：不改状态、不删记录
    dump() { return JSON.stringify({ format: 'jnd-login-recording/1', exportedAt: new Date().toISOString(), ...opts.meta(), redaction: '地址只留路径和参数名；请求头与 Cookie 只留名字；返回体只留结构；字符串只记长度', dropped, events }, null, 1); },
    onChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export = { createLoginRecorder, redactUrl, redactText, shape, shapeBody };
