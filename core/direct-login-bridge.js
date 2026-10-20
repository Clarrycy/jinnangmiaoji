// 由 src/core/direct-login-bridge.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const PROFILE_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
const EVENT_TYPES = /* @__PURE__ */ new Set(["ready", "navigate", "game-auth", "error", "cancel"]);
function text(value, limit) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, limit) : "";
}
function stableKey(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function profileId(provider, value) {
  const raw = text(value, 256);
  if (!raw) return "";
  if (PROFILE_PATTERN.test(raw)) return raw;
  const prefix = /^[A-Za-z0-9_-]{1,24}$/.test(provider) ? provider : "channel";
  return prefix + ":" + stableKey(raw);
}
function installDirectEventBridge(options) {
  const target = options?.window;
  if (!target || typeof target.__SGS_DIRECT_EVENT__ === "function") return false;
  target.__SGS_DIRECT_EVENT__ = (event) => {
    try {
      if (!event || typeof event !== "object" || Array.isArray(event)) return "";
      const type = text(event.type, 32);
      if (!EVENT_TYPES.has(type)) return "";
      const provider = text(event.provider, 32);
      const readyId = type === "ready" ? profileId(provider, event.identityAccount) || profileId(provider, event.account) : "";
      const navigateId = type === "navigate" ? profileId(provider, event.profileId) : "";
      if (type === "ready" && readyId) {
        try {
          options.storage?.setItem("sgs-direct-profile-v1", readyId);
        } catch (_) {
        }
      } else if (type === "navigate") {
        try {
          if (navigateId) options.storage?.setItem("sgs-direct-profile-v1", navigateId);
          else options.storage?.removeItem("sgs-direct-profile-v1");
        } catch (_) {
        }
      }
      const payload = { type, provider };
      if (readyId || navigateId) payload.profileId = readyId || navigateId;
      if (type === "game-auth") {
        payload.success = event.success !== false;
        const code = text(event.code, 64);
        if (code) payload.code = code;
      } else if (type === "error") {
        const code = text(event.code, 64), stage = text(event.stage, 64);
        if (code) payload.code = code;
        if (stage) payload.stage = stage;
      } else if (type === "cancel") {
        const reason = text(event.reason, 64);
        if (reason) payload.reason = reason;
      }
      try {
        options.send("jnd-direct-login-event", payload);
      } catch (_) {
      }
      if (type === "game-auth" && payload.success === false) {
        try {
          options.report?.("warn", `游戏没有接受${provider || "渠道"}登录票据` + (payload.code ? `：${payload.code}` : ""));
        } catch (_) {
        }
      }
      return type === "ready" ? readyId : "";
    } catch (_) {
      return "";
    }
  };
  return true;
}
module.exports = { installDirectEventBridge };
