import crypto = require('crypto');

export type ReportKind = 'activity' | 'generals';
export type StargazeDelivery = 'local' | 'online';
export type StargazeSettings = { enabled: boolean; delivery: StargazeDelivery; intervalMinutes: number; notify: boolean };
export type ParsedReport = { title: string; reportDate: string; configVersion: string; summary: string; names: string[]; payload?: any };
export type ResultRecord = {
  title: string; reportDate: string; configVersion: string; summary: string; names: string[];
  digest: string; etag: string; lastModified: string; checkedAt: number; changedAt: number; firstSeenAt: number;
  localFile: string; localSnapshot: string; status: 'ok' | 'error'; error: string;
};
export type StargazeHealth = { checks: number; successes: number; failures: number; updates: number; notifications: number; lastDurationMs: number; lastBytes: number; consecutiveFailures: number };
export type PersistedState = {
  schema: number; reports: Partial<Record<ReportKind, ResultRecord>>; health: StargazeHealth;
  lastCheckAt: number; lastSuccessAt: number; nextCheckAt: number; lastError: string;
};
export type ReportSource = { label: string; url: string };
export type ReportSources = Record<ReportKind, ReportSource>;

export const SCHEMA = 1;
export const SNAPSHOTS_PER_KIND = 12;
export const REPORT_KINDS: ReportKind[] = ['activity', 'generals'];
export const DEFAULT_SETTINGS: StargazeSettings = Object.freeze({ enabled: false, delivery: 'local', intervalMinutes: 5, notify: true });
export const SOURCES: ReportSources = Object.freeze({
  activity: { label: '活动观星', url: 'https://activity.xinghantujian.top/' },
  generals: { label: '后台武将观星', url: 'https://generals.xinghantujian.top/' },
});
const ALLOWED_INTERVALS = new Set([5, 10, 15, 30, 60]);

export function normalizeSettings(input: any = {}): StargazeSettings {
  const interval = Number(input.intervalMinutes);
  return {
    enabled: Boolean(input.enabled),
    delivery: input.delivery === 'online' ? 'online' : 'local',
    intervalMinutes: ALLOWED_INTERVALS.has(interval) ? interval : DEFAULT_SETTINGS.intervalMinutes,
    notify: input.notify === undefined ? DEFAULT_SETTINGS.notify : Boolean(input.notify),
  };
}

export function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = stableValue(value[key]);
  return sorted;
}

// Cloudflare 会在每次响应末尾注入带随机 r/t 的挑战脚本；它不属于报告内容，必须先剔除，
// 否则同一份报告每次拉取都会被误判成“已更新”。只删除 Cloudflare 的注入块，保留报告自身脚本。
export function stripCloudflareInjection(html: string) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, block => (
    /__CF\$cv\$params|challenge-platform|cloudflareinsights\.com|\/cdn-cgi\/challenge-platform/i.test(block) ? '' : block
  ));
}

function decodeEntities(value: string) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

export function stripTags(value: string) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function visibleText(html: string) {
  return stripTags(String(html || '')
    .replace(/<(style|script|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' '));
}

function normalizedVisibleText(html: string) {
  return visibleText(stripCloudflareInjection(html))
    .replace(/生成时间\s*20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/g, '生成时间 <time>')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageTitle(html: string) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

export function extractActivityPayload(html: string): any {
  for (const match of String(html || '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    const text = match[2].trim();
    if (!text.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && parsed['数据'] && typeof parsed['数据'] === 'object') return parsed;
    } catch (_) {}
  }
  throw new Error('活动报告内嵌数据缺失');
}

export function dateFromTitle(title: string) {
  return String(title || '').match(/(20\d{2}-\d{2}-\d{2})/)?.[1] || '';
}

function activitySummary(root: any) {
  const data = root?.['数据'] || {};
  const win = Array.isArray(data?.win) ? data.win : [];
  const range = win.length >= 2 ? `${String(win[0]).slice(5)} ~ ${String(win[1]).slice(5)}` : '';
  const stats = Array.isArray(root?.['指标']?.stats) ? root['指标'].stats : [];
  const row = (name: string) => stats.find((item: any) => Array.isArray(item) && item[0] === name);
  const abundance = row('活动丰度');
  const tiers = row('奖励档位');
  const publicity = row('概率公示');
  return [
    range ? `活动周 ${range}` : '',
    abundance ? `丰度 ${abundance[1]}` : '',
    tiers ? `${tiers[1]} 档奖励` : '',
    publicity ? `${publicity[1]} 组概率` : '',
  ].filter(Boolean).join(' · ') || '活动周报告已更新';
}

export function parseActivityReport(html: string): ParsedReport {
  const root = extractActivityPayload(html);
  const data = root['数据'] || {};
  const title = pageTitle(html) || '活动观星报告';
  const reportDate = dateFromTitle(title) || String(Array.isArray(data.win) ? data.win[0] : '') || '';
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(reportDate)) throw new Error('活动报告标题缺少日期，可能不是有效报告');
  return {
    title,
    reportDate,
    configVersion: String(data.version || ''),
    summary: activitySummary(root),
    names: [],
    payload: root,
  };
}

export function parseGeneralsReport(html: string): ParsedReport {
  const title = pageTitle(html) || '后台武将观星报告';
  const reportDate = dateFromTitle(title);
  if (!reportDate) throw new Error('武将报告标题缺少日期，可能不是有效报告');
  const text = visibleText(html);
  const count = (label: string) => text.match(new RegExp(`${label}\\s*(\\d+)\\s*人`))?.[1] || '';
  const added = count('新增');
  const changed = count('变动');
  const removed = count('移除');
  const summary = [added !== '' ? `新增 ${added}` : '', changed !== '' ? `变动 ${changed}` : '', removed !== '' ? `移除 ${removed}` : '']
    .filter(Boolean).join(' · ') || '武将报告已更新';
  const names = [...String(html || '').matchAll(/<span[^>]*class=["'][^"']*\bgen-name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
    .map(match => stripTags(match[1]))
    .filter(Boolean);
  return {
    title,
    reportDate,
    configVersion: text.match(/版本号\s*([0-9][0-9.]*)/)?.[1] || '',
    summary,
    names: [...new Set(names)].slice(0, 8),
  };
}

export function parseReport(kind: ReportKind, html: string): ParsedReport {
  return kind === 'activity' ? parseActivityReport(html) : parseGeneralsReport(html);
}

// 指纹只覆盖报告语义内容：活动报告用内嵌数据，武将报告用清理后的可见文本。
// 页面外壳、Cloudflare 注入和报告生成时间的变化不应触发提醒。
export function reportSignature(kind: ReportKind, parsed: ParsedReport, html: string) {
  const source: any = {
    kind,
    title: parsed.title,
    reportDate: parsed.reportDate,
    configVersion: parsed.configVersion,
    summary: parsed.summary,
    names: parsed.names,
  };
  if (kind === 'activity' && parsed.payload) source.payload = parsed.payload;
  else source.text = normalizedVisibleText(html);
  return sha256(JSON.stringify(stableValue(source)));
}

export function emptyState(): PersistedState {
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
      consecutiveFailures: 0,
    },
    lastCheckAt: 0,
    lastSuccessAt: 0,
    nextCheckAt: 0,
    lastError: '',
  };
}

export function normalizeState(saved: any): PersistedState {
  const base = emptyState();
  if (!saved || typeof saved !== 'object') return base;
  return {
    ...base,
    ...saved,
    schema: SCHEMA,
    reports: saved.reports && typeof saved.reports === 'object' ? saved.reports : {},
    health: { ...base.health, ...(saved.health && typeof saved.health === 'object' ? saved.health : {}) },
  };
}

export function publicReport(record: ResultRecord | undefined) {
  if (!record) return null;
  return {
    title: record.title,
    reportDate: record.reportDate,
    configVersion: record.configVersion,
    summary: record.summary,
    names: record.names || [],
    digest: record.digest,
    fingerprint: record.digest ? record.digest.slice(0, 12) : '',
    checkedAt: Number(record.checkedAt) || 0,
    changedAt: Number(record.changedAt) || 0,
    firstSeenAt: Number(record.firstSeenAt) || 0,
    localReady: Boolean(record.localFile),
    status: record.status || 'ok',
    error: record.error || '',
  };
}

export function humanError(error: any) {
  const message = String(error?.message || error || '未知错误').trim();
  if (/aborted|abort/i.test(message)) return '检查已取消';
  return message.slice(0, 240);
}

export function dateStamp(reportDate: string) {
  if (/^20\d{2}-\d{2}-\d{2}$/.test(reportDate)) return reportDate;
  return new Date().toISOString().slice(0, 10);
}

export function localBaseName(kind: ReportKind, report: ParsedReport, digest: string) {
  return `${kind}-${dateStamp(report.reportDate)}-${digest.slice(0, 8)}`;
}
