'use strict';
// 自动观星：报告解析、内容指纹去重、304、失败退避、健康统计与本地快照。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const report = require('../core/stargaze-report');
const { createStargazeWatcher } = require('../core/stargaze-watch');
const { createReportFetch } = require('../core/stargaze-fetch');

function activityHtml(options = {}) {
  const version = options.version || '6.4.4';
  const date = options.date || '2026-10-17';
  const richness = options.richness || '7/8';
  const payload = {
    数据: { win: [date, '2026-10-23'], version, najian_updates: [], activity_groups: [], shop_items: {} },
    指标: { stats: [['活动截止', '2026-10-23', '', true], ['活动丰度', richness, '缺 1 项', false], ['奖励档位', '169', '条件 169', false], ['概率公示', '17', '349 行', false]], audit: 'ok' },
    生成方式: '确定性渲染',
  };
  return `<!doctype html><html><head><title>观星报告 · ${date}</title><style>.x{content:"活动丰度 9/8"}</style></head><body><main>活动周</main><script type="application/json">${JSON.stringify(payload)}</script></body></html>`;
}
function generalsHtml(options = {}) {
  const version = options.version || '6.4.4';
  const date = options.date || '2026-10-19';
  const added = options.added === undefined ? 2 : options.added;
  const names = options.names || ['舒劭一号', '舒劭二号'];
  return `<!doctype html><html><head><title>后台武将观星 · ${date}</title><style>.x{content:"新增 99 人"}</style></head><body><p class="summary">新增 <b>${added}</b> 人　·　变动 <b>0</b> 人　·　移除 <b>0</b> 人</p>${names.map(name => `<span class="gen-name">${name}</span>`).join('')}<p>版本号 ${version}　·　最近更新 ${date}</p><script>window.fake = '新增 99 人';</script></body></html>`;
}
function withCloudflare(html, nonce) {
  return html.replace('</body>', `<script>window.__CF$cv$params={r:'${nonce}',t:'${nonce}'};</script></body>`);
}

const activity = report.parseActivityReport(activityHtml());
assert.equal(activity.title, '观星报告 · 2026-10-17');
assert.equal(activity.reportDate, '2026-10-17');
assert.equal(activity.configVersion, '6.4.4');
assert.equal(activity.summary, '活动周 10-17 ~ 10-23 · 丰度 7/8 · 169 档奖励 · 17 组概率');
const generals = report.parseGeneralsReport(generalsHtml());
assert.equal(generals.reportDate, '2026-10-19');
assert.equal(generals.configVersion, '6.4.4');
assert.equal(generals.summary, '新增 2 · 变动 0 · 移除 0');
assert.deepEqual(generals.names, ['舒劭一号', '舒劭二号']);
assert.throws(() => report.parseActivityReport('<html><title>Just a moment...</title><body>Enable JavaScript</body></html>'), /(缺少日期|内嵌数据缺失)/);
assert.throws(() => report.parseGeneralsReport('<html><title>Just a moment...</title><body>Enable JavaScript</body></html>'), /缺少日期/);
assert.equal(report.normalizeSettings({ intervalMinutes: 12, delivery: 'bad' }).intervalMinutes, 5);
assert.equal(report.normalizeSettings({ intervalMinutes: 15, delivery: 'online' }).delivery, 'online');

// Cloudflare 每次注入的挑战脚本带随机参数；清理后同一报告必须得到相同指纹。
const noisyActivityA = withCloudflare(activityHtml(), 'aaaa');
const noisyActivityB = withCloudflare(activityHtml(), 'bbbb');
const cleanActivityA = report.stripCloudflareInjection(noisyActivityA);
const cleanActivityB = report.stripCloudflareInjection(noisyActivityB);
assert(!cleanActivityA.includes('__CF$cv$params'));
assert.equal(
  report.reportSignature('activity', report.parseActivityReport(cleanActivityA), cleanActivityA),
  report.reportSignature('activity', report.parseActivityReport(cleanActivityB), cleanActivityB),
);
const generalsWithTime = time => generalsHtml().replace('</body>', `<div class="footer">生成时间 ${time}</div></body>`);
const generalsA = generalsWithTime('2026-10-19 19:18:09');
const generalsB = generalsWithTime('2026-10-20 08:00:00');
assert.equal(
  report.reportSignature('generals', report.parseGeneralsReport(generalsA), generalsA),
  report.reportSignature('generals', report.parseGeneralsReport(generalsB), generalsB),
);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-stargaze-'));
const directory = path.join(root, 'stargaze');
let clock = Date.UTC(2026, 9, 20, 12, 0, 0);
let currentActivity = activityHtml();
let currentGenerals = generalsHtml();
let etag = '"v1"';
let offline = false;
let force304 = false;
let timerId = 0;
const timers = new Map();
const updates = [];
const calls = [];

const fetch = async (url, options = {}) => {
  calls.push({ url, etag: options.etag || '' });
  if (offline) throw new Error('network offline');
  if (force304 && options.etag) return { status: 304, url, text: '', etag: options.etag, bytes: 0 };
  const html = url.includes('generals') ? currentGenerals : currentActivity;
  return { status: 200, url, text: html, etag, bytes: Buffer.byteLength(html) };
};

const watcher = createStargazeWatcher({
  directory,
  fetch,
  settings: { enabled: false, delivery: 'local', intervalMinutes: 5, notify: true },
  now: () => clock,
  setTimer: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
  clearTimer: id => timers.delete(id),
  onUpdate: list => updates.push(...list),
});

(async () => {
  await assert.rejects(createReportFetch()('http://example.com/report'), /HTTPS/);
  await assert.rejects(createReportFetch()('not-a-url'), /地址无效/);
  let result = await watcher.checkNow();
  assert.equal(result.ok, true);
  assert.equal(result.updates.length, 0, '首次同步只建立基线，不当作更新');
  assert.equal(watcher.getState().health.checks, 2);
  assert.equal(watcher.getState().health.successes, 2);
  assert.equal(watcher.getState().health.updates, 0);
  const activityPath = watcher.localReportPath('activity');
  const generalsPath = watcher.localReportPath('generals');
  assert(fs.existsSync(activityPath));
  assert(fs.existsSync(generalsPath));
  assert(fs.existsSync(path.join(directory, 'reports', 'latest-activity.html')));
  assert(fs.existsSync(path.join(directory, 'reports', 'latest-generals.json')));
  assert.equal(fs.readFileSync(activityPath, 'utf8'), currentActivity);
  const sidecar = JSON.parse(fs.readFileSync(path.join(directory, 'reports', 'latest-activity.json'), 'utf8'));
  const initialSignature = report.reportSignature('activity', report.parseActivityReport(currentActivity), currentActivity);
  assert.equal(sidecar.fingerprint, initialSignature.slice(0, 12));

  clock += 60000;
  result = await watcher.checkNow();
  assert.equal(result.updates.length, 0, '内容未变不应重复提醒');
  assert.equal(watcher.getState().health.updates, 0);

  // 云端页面外壳注入变化，但报告内容没变：不应提醒，也不应产生新的快照。
  clock += 60000;
  const cleanActivity = currentActivity;
  currentActivity = withCloudflare(cleanActivity, 'dynamic-nonce');
  result = await watcher.checkNow();
  assert.equal(result.updates.length, 0, 'Cloudflare 注入变化不应被当成报告更新');
  currentActivity = cleanActivity;

  clock += 60000;
  currentActivity = activityHtml({ richness: '8/8' });
  etag = '"v2"';
  result = await watcher.checkNow();
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].kind, 'activity');
  assert.equal(updates.length, 0, '停用状态只记录变化，不弹提醒');
  assert.equal(watcher.getState().health.updates, 1);
  assert.equal(fs.readFileSync(path.join(directory, 'reports', 'latest-activity.html'), 'utf8'), currentActivity);

  // 开启自动观星后，真实变化才累计提醒；304 仍算成功，不产生新更新。
  watcher.configure({ enabled: true, notify: true });
  clock += 60000;
  currentGenerals = generalsHtml({ added: 3, names: ['舒劭一号', '舒劭二号', '舒劭三号'] });
  etag = '"v3"';
  result = await watcher.checkNow();
  assert.equal(result.updates.length, 1);
  assert.equal(watcher.getState().health.notifications, 1);
  assert(watcher.getState().nextCheckAt > clock);
  assert.equal(timers.size, 1);

  force304 = true;
  clock += 60000;
  result = await watcher.checkNow();
  assert.equal(result.ok, true);
  assert.equal(result.updates.length, 0);
  assert.equal(watcher.getState().reports.generals.summary, '新增 3 · 变动 0 · 移除 0');
  force304 = false;

  // 两类报告都失败：保留旧报告、记录错误，并按 5 → 10 分钟退避。
  offline = true;
  clock += 60000;
  result = await watcher.checkNow();
  assert.equal(result.ok, false);
  assert.match(watcher.getState().lastError, /活动观星/);
  assert.equal(watcher.getState().health.consecutiveFailures, 1);
  assert.equal(watcher.getState().nextCheckAt, clock + 5 * 60000);
  assert.equal(watcher.getState().reports.activity.status, 'error');
  assert(fs.existsSync(activityPath));
  clock += 60000;
  await watcher.checkNow();
  assert.equal(watcher.getState().health.consecutiveFailures, 2);
  assert.equal(watcher.getState().nextCheckAt, clock + 10 * 60000);

  offline = false;
  clock += 60000;
  result = await watcher.checkNow();
  assert.equal(result.ok, true);
  assert.equal(watcher.getState().health.consecutiveFailures, 0);
  assert.equal(watcher.getState().lastError, '');
  assert.equal(watcher.getState().reports.activity.status, 'ok');
  assert.equal(watcher.getState().nextCheckAt, clock + 5 * 60000);

  assert.equal(watcher.onlineReportUrl('activity'), 'https://activity.xinghantujian.top/');
  assert.equal(watcher.onlineReportUrl('generals'), 'https://generals.xinghantujian.top/');
  watcher.configure({ delivery: 'online' });
  assert.equal(watcher.getState().settings.delivery, 'online');
  assert(fs.existsSync(watcher.localReportPath('activity')), '在线模式仍保留本地归档，便于离线复查');
  watcher.configure({ enabled: false });
  assert.equal(timers.size, 0);

  const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'watch-state.json'), 'utf8'));
  assert.equal(persisted.schema, report.SCHEMA);
  assert(fs.existsSync(path.join(directory, 'health.json')));

  // 用户改保存目录：状态、最新报告与 sidecar 跟着迁移，后续仍能从新目录打开。
  const alternate = path.join(root, '自定义报告目录');
  const moved = watcher.setDirectory(alternate);
  assert.equal(moved.directory, path.resolve(alternate));
  assert(fs.existsSync(path.join(alternate, 'watch-state.json')));
  assert(fs.existsSync(path.join(alternate, 'reports', 'latest-activity.html')));
  assert(fs.existsSync(path.join(alternate, 'reports', 'latest-generals.json')));
  assert(watcher.localReportPath('activity').startsWith(path.join(alternate, 'reports')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(alternate, 'reports', 'latest-generals.json'), 'utf8')).kind, 'generals');
  assert.throws(() => watcher.setDirectory('   '), /目录为空/);
  watcher.dispose();
  fs.rmSync(root, { recursive: true, force: true });
  console.log('micro stargaze tests passed');
})().catch(error => { console.error(error); process.exit(1); });
