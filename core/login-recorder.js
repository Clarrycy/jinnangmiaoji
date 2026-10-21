// 由 src/core/login-recorder.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const MAX_EVENTS = 4e3;
const SAFE_TEXT_KEYS = /^(msg|message|toast|desc|description|stage|status|retcode|errcode|errmsg|error|reason|type|kind|resultCode|resultMsg)$/i;
function redactUrl(raw) {
  try {
    const u = new URL(raw);
    const keys = [.../* @__PURE__ */ new Set([...u.searchParams.keys()])];
    return `${u.origin}${u.pathname}${keys.length ? `?${keys.join("&")}` : ""}${u.hash ? "#…" : ""}`;
  } catch (_) {
    return `<url:${String(raw || "").length}>`;
  }
}
function redactText(text) {
  return String(text).replace(/https?:\/\/[^\s"'<>]+/g, (m) => redactUrl(m)).replace(/data:[^\s"']{40,}/g, (m) => `<data:${m.length}>`);
}
function safeText(v) {
  if (/[\u4e00-\u9fff]/.test(v)) return !/[A-Za-z0-9+/=_-]{12,}/.test(v);
  return /^[A-Z0-9_.:-]{1,40}$/.test(v) || /^[a-z][a-z _-]{0,30}$/.test(v);
}
function shape(v, key = "", depth = 0) {
  if (v === null || v === void 0 || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 1e5 ? v : `<num:${String(Math.trunc(Math.abs(v))).length}>`;
  if (typeof v === "string") return SAFE_TEXT_KEYS.test(key) && v.length <= 120 && safeText(v) ? v : `<str:${v.length}>`;
  if (depth >= 6) return Array.isArray(v) ? `<array:${v.length}>` : "<object>";
  if (Array.isArray(v)) return { length: v.length, items: v.slice(0, 5).map((x) => shape(x, key, depth + 1)) };
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).slice(0, 60)) out[k] = shape(v[k], k, depth + 1);
    return out;
  }
  return `<${typeof v}>`;
}
function shapeBody(body, contentType = "") {
  if (body == null || body === "") return null;
  if (typeof body !== "string") return `<bytes:${body.byteLength ?? body.length ?? 0}>`;
  const t = body.trim();
  if (/^[{[]/.test(t)) {
    try {
      return { json: shape(JSON.parse(t)) };
    } catch (_) {
    }
  }
  if (/json/i.test(contentType)) return `<text:${body.length}>`;
  if (/^<!doctype|^<html|<\/html>/i.test(t)) return `<html:${body.length}>`;
  if (/^[\w.%-]+=[^&]*(&[\w.%-]+=[^&]*)*$/.test(t)) return { form: [...new URLSearchParams(t).keys()] };
  return `<text:${body.length}>`;
}
function headerNames(h) {
  if (!h) return [];
  if (typeof h === "string") return h.split(/\r?\n/).map((l) => l.split(":")[0].trim().toLowerCase()).filter(Boolean);
  return Object.keys(h).map((k) => k.toLowerCase());
}
function cookieNames(lines) {
  const arr = Array.isArray(lines) ? lines : lines ? [lines] : [];
  return arr.map((l) => String(l).split("=")[0].trim()).filter(Boolean);
}
function createLoginRecorder(opts) {
  let status = "idle", events = [], dropped = 0, startedAt = 0, lastError = "";
  let evidence = [];
  const listeners = /* @__PURE__ */ new Set();
  const changed = () => {
    for (const fn of listeners) {
      try {
        fn();
      } catch (_) {
      }
    }
  };
  function push(kind, data) {
    if (status !== "recording") return;
    events.push({ t: Date.now(), kind, ...data });
    if (events.length > MAX_EVENTS) {
      events.shift();
      dropped += 1;
    }
    changed();
  }
  return {
    // 统一登录器跨域请求的每一跳（gm-request-host 回调）
    gm(e) {
      const item = {
        id: e.id,
        hop: e.hop,
        method: e.method,
        url: redactUrl(e.url),
        reqHeaders: headerNames(e.reqHeaders),
        reqBody: shapeBody(e.reqData),
        ...e.error ? { error: redactText(e.error), errorKind: e.kind } : { status: e.status, location: e.location ? redactUrl(e.location) : void 0, resHeaders: headerNames(e.resHeaders), setCookie: cookieNames(e.setCookie), body: shapeBody(e.body, e.contentType) }
      };
      evidence.push({ t: Date.now(), ...item });
      if (evidence.length > 40) evidence.shift();
      push("gm", item);
    },
    // 取走上次失败以来的请求经过（取完清空，下次失败只写新的）
    takeEvidence() {
      const out = evidence;
      evidence = [];
      return out;
    },
    // 壳日志里与登录有关的行
    log(args) {
      if (status !== "recording") return;
      const head = String(args[0] || "");
      const line = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
      if (head === "CONSOLE" && !/\[统一登录器\]|\[JND-MICRO\]/.test(line)) return;
      if (!/^(login-|CONSOLE|will-navigate|did-start-loading|did-fail-load|did-navigate|GM request failed|landing|tab created|tab closed|chrome-tab)/.test(head)) return;
      push("log", { line: redactText(line).slice(0, 2e3) });
    },
    start() {
      if (status === "recording") return;
      if (status === "idle" || status === "stopped") {
        startedAt = Date.now();
        events.push({ t: startedAt, kind: "mark", note: "start" });
      }
      status = "recording";
      lastError = "";
      changed();
    },
    pause() {
      if (status === "recording") {
        status = "paused";
        changed();
      }
    },
    resume() {
      if (status === "paused") {
        status = "recording";
        changed();
      }
    },
    stop() {
      if (status === "recording" || status === "paused") {
        events.push({ t: Date.now(), kind: "mark", note: "stop" });
        status = "stopped";
        changed();
      }
    },
    clear() {
      events = [];
      dropped = 0;
      startedAt = status === "recording" ? Date.now() : 0;
      changed();
    },
    setError(message) {
      lastError = String(message || "");
      changed();
    },
    state() {
      return { status, count: events.length, dropped, startedAt, error: lastError };
    },
    // 复制与导出用：不改状态、不删记录
    dump() {
      return JSON.stringify({ format: "jnd-login-recording/1", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), ...opts.meta(), redaction: "地址只留路径和参数名；请求头与 Cookie 只留名字；返回体只留结构；字符串只记长度", dropped, events }, null, 1);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
module.exports = { createLoginRecorder, redactUrl, redactText, shape, shapeBody };
