// 由 src/core/stargaze-report.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var stargaze_report_exports = {};
__export(stargaze_report_exports, {
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  REPORT_KINDS: () => REPORT_KINDS,
  SCHEMA: () => SCHEMA,
  SNAPSHOTS_PER_KIND: () => SNAPSHOTS_PER_KIND,
  SOURCES: () => SOURCES,
  dateFromTitle: () => dateFromTitle,
  dateStamp: () => dateStamp,
  emptyState: () => emptyState,
  extractActivityPayload: () => extractActivityPayload,
  humanError: () => humanError,
  localBaseName: () => localBaseName,
  normalizeSettings: () => normalizeSettings,
  normalizeState: () => normalizeState,
  parseActivityReport: () => parseActivityReport,
  parseGeneralsReport: () => parseGeneralsReport,
  parseReport: () => parseReport,
  publicReport: () => publicReport,
  reportSignature: () => reportSignature,
  sha256: () => sha256,
  stripCloudflareInjection: () => stripCloudflareInjection,
  stripTags: () => stripTags
});
module.exports = __toCommonJS(stargaze_report_exports);
const crypto = require("crypto");
const SCHEMA = 1;
const SNAPSHOTS_PER_KIND = 12;
const REPORT_KINDS = ["activity", "generals"];
const DEFAULT_SETTINGS = Object.freeze({ enabled: false, delivery: "local", intervalMinutes: 5, notify: true });
const SOURCES = Object.freeze({
  activity: { label: "活动观星", url: "https://activity.xinghantujian.top/" },
  generals: { label: "后台武将观星", url: "https://generals.xinghantujian.top/" }
});
const ALLOWED_INTERVALS = /* @__PURE__ */ new Set([5, 10, 15, 30, 60]);
function normalizeSettings(input = {}) {
  const interval = Number(input.intervalMinutes);
  return {
    enabled: Boolean(input.enabled),
    delivery: input.delivery === "online" ? "online" : "local",
    intervalMinutes: ALLOWED_INTERVALS.has(interval) ? interval : DEFAULT_SETTINGS.intervalMinutes,
    notify: input.notify === void 0 ? DEFAULT_SETTINGS.notify : Boolean(input.notify)
  };
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = stableValue(value[key]);
  return sorted;
}
function stripCloudflareInjection(html) {
  return String(html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => /__CF\$cv\$params|challenge-platform|cloudflareinsights\.com|\/cdn-cgi\/challenge-platform/i.test(block) ? "" : block);
}
function decodeEntities(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}
function stripTags(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}
function visibleText(html) {
  return stripTags(String(html || "").replace(/<(style|script|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " "));
}
function normalizedVisibleText(html) {
  return visibleText(stripCloudflareInjection(html)).replace(/生成时间\s*20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/g, "生成时间 <time>").replace(/\s+/g, " ").trim();
}
function pageTitle(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}
function extractActivityPayload(html) {
  for (const match of String(html || "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    const text = match[2].trim();
    if (!text.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && parsed["数据"] && typeof parsed["数据"] === "object") return parsed;
    } catch (_) {
    }
  }
  throw new Error("活动报告内嵌数据缺失");
}
function dateFromTitle(title) {
  return String(title || "").match(/(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
}
function activitySummary(root) {
  const data = root?.["数据"] || {};
  const win = Array.isArray(data?.win) ? data.win : [];
  const range = win.length >= 2 ? `${String(win[0]).slice(5)} ~ ${String(win[1]).slice(5)}` : "";
  const stats = Array.isArray(root?.["指标"]?.stats) ? root["指标"].stats : [];
  const row = (name) => stats.find((item) => Array.isArray(item) && item[0] === name);
  const abundance = row("活动丰度");
  const tiers = row("奖励档位");
  const publicity = row("概率公示");
  return [
    range ? `活动周 ${range}` : "",
    abundance ? `丰度 ${abundance[1]}` : "",
    tiers ? `${tiers[1]} 档奖励` : "",
    publicity ? `${publicity[1]} 组概率` : ""
  ].filter(Boolean).join(" · ") || "活动周报告已更新";
}
function parseActivityReport(html) {
  const root = extractActivityPayload(html);
  const data = root["数据"] || {};
  const title = pageTitle(html) || "活动观星报告";
  const reportDate = dateFromTitle(title) || String(Array.isArray(data.win) ? data.win[0] : "") || "";
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("活动报告标题缺少日期，可能不是有效报告");
  return {
    title,
    reportDate,
    configVersion: String(data.version || ""),
    summary: activitySummary(root),
    names: [],
    payload: root
  };
}
function parseGeneralsReport(html) {
  const title = pageTitle(html) || "后台武将观星报告";
  const reportDate = dateFromTitle(title);
  if (!reportDate) throw new Error("武将报告标题缺少日期，可能不是有效报告");
  const text = visibleText(html);
  const count = (label) => text.match(new RegExp(`${label}\\s*(\\d+)\\s*人`))?.[1] || "";
  const added = count("新增");
  const changed = count("变动");
  const removed = count("移除");
  const summary = [added !== "" ? `新增 ${added}` : "", changed !== "" ? `变动 ${changed}` : "", removed !== "" ? `移除 ${removed}` : ""].filter(Boolean).join(" · ") || "武将报告已更新";
  const names = [...String(html || "").matchAll(/<span[^>]*class=["'][^"']*\bgen-name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map((match) => stripTags(match[1])).filter(Boolean);
  return {
    title,
    reportDate,
    configVersion: text.match(/版本号\s*([0-9][0-9.]*)/)?.[1] || "",
    summary,
    names: [...new Set(names)].slice(0, 8)
  };
}
function parseReport(kind, html) {
  return kind === "activity" ? parseActivityReport(html) : parseGeneralsReport(html);
}
function reportSignature(kind, parsed, html) {
  const source = {
    kind,
    title: parsed.title,
    reportDate: parsed.reportDate,
    configVersion: parsed.configVersion,
    summary: parsed.summary,
    names: parsed.names
  };
  if (kind === "activity" && parsed.payload) source.payload = parsed.payload;
  else source.text = normalizedVisibleText(html);
  return sha256(JSON.stringify(stableValue(source)));
}
function emptyState() {
  return {
    schema: SCHEMA,
    reports: {},
    health: {
      checks: 0,
      successes: 0,
      failures: 0,
      updates: 0,
      notifications: 0,
      lastDurationMs: 0,
      lastBytes: 0,
      consecutiveFailures: 0
    },
    lastCheckAt: 0,
    lastSuccessAt: 0,
    nextCheckAt: 0,
    lastError: ""
  };
}
function normalizeState(saved) {
  const base = emptyState();
  if (!saved || typeof saved !== "object") return base;
  return {
    ...base,
    ...saved,
    schema: SCHEMA,
    reports: saved.reports && typeof saved.reports === "object" ? saved.reports : {},
    health: { ...base.health, ...saved.health && typeof saved.health === "object" ? saved.health : {} }
  };
}
function publicReport(record) {
  if (!record) return null;
  return {
    title: record.title,
    reportDate: record.reportDate,
    configVersion: record.configVersion,
    summary: record.summary,
    names: record.names || [],
    digest: record.digest,
    fingerprint: record.digest ? record.digest.slice(0, 12) : "",
    checkedAt: Number(record.checkedAt) || 0,
    changedAt: Number(record.changedAt) || 0,
    firstSeenAt: Number(record.firstSeenAt) || 0,
    localReady: Boolean(record.localFile),
    status: record.status || "ok",
    error: record.error || ""
  };
}
function humanError(error) {
  const message = String(error?.message || error || "未知错误").trim();
  if (/aborted|abort/i.test(message)) return "检查已取消";
  return message.slice(0, 240);
}
function dateStamp(reportDate) {
  if (/^20\d{2}-\d{2}-\d{2}$/.test(reportDate)) return reportDate;
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function localBaseName(kind, report, digest) {
  return `${kind}-${dateStamp(report.reportDate)}-${digest.slice(0, 8)}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_SETTINGS,
  REPORT_KINDS,
  SCHEMA,
  SNAPSHOTS_PER_KIND,
  SOURCES,
  dateFromTitle,
  dateStamp,
  emptyState,
  extractActivityPayload,
  humanError,
  localBaseName,
  normalizeSettings,
  normalizeState,
  parseActivityReport,
  parseGeneralsReport,
  parseReport,
  publicReport,
  reportSignature,
  sha256,
  stripCloudflareInjection,
  stripTags
});
