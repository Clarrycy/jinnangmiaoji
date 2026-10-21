'use strict';
// 登录录制器（作者 10-21）：脱敏在记下来之前做；录制器操作契约（AGENTS：录制、暂停、继续、停止、清空、复制、导出）
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const { createLoginRecorder, redactUrl, redactText, shape, shapeBody } = require('../core/login-recorder.js');

assert.equal(redactUrl('https://a.vivo.com.cn/p/x?token=abc&code=123#frag'), 'https://a.vivo.com.cn/p/x?token&code#…', 'query keeps names only, hash dropped');
assert.equal(redactText('will-navigate https://web.sanguosha.com/x?ticket=SECRET done'), 'will-navigate https://web.sanguosha.com/x?ticket done');
assert.deepEqual(shape({ code: 0, msg: '账号未实名', data: { subAccounts: [{ subOpenId: 'abcDEF123456', lastLogin: true, frozenFlag: false, nickName: '张三' }, { lastLogin: false }], token: 'eyJhbGciOiJIUzI1NiJ9.x' } }),
  { code: 0, msg: '账号未实名', data: { subAccounts: { length: 2, items: [{ subOpenId: '<str:12>', lastLogin: true, frozenFlag: false, nickName: '<str:2>' }, { lastLogin: false }] }, token: '<str:22>' } }, 'identifiers and tokens keep only their length');
assert.equal(shape({ code: 'aB3dE5fG7h' }).code, '<str:10>', 'a mixed-case code may be an auth code: length only');
assert.equal(shape({ code: 'FAKECODE123456789' }).code, '<str:17>', 'a code field is never kept: in OAuth it is the authorization code');
assert.equal(shape({ errcode: 'QR_EXPIRED', code: 0 }).errcode, 'QR_EXPIRED', 'error code fields stay readable'); assert.equal(shape({ code: 0 }).code, 0, 'numeric codes stay');
assert.equal(shape({ uid: 1234567890123 }).uid, '<num:13>', 'large numbers may be ids');
assert.deepEqual(shapeBody('a=1&ticket=xyz'), { form: ['a', 'ticket'] });
assert.equal(shapeBody('<html><body>x</body></html>'), '<html:27>');

const r = createLoginRecorder({ meta: () => ({ shell: 'test' }) });
r.gm({ id: '1', hop: 0, method: 'GET', url: 'https://x.com/a?k=v', reqHeaders: { Cookie: 'sid=SECRET' }, reqData: null, status: 200, resHeaders: {}, body: '{}' });
assert.equal(r.state().count, 0, 'nothing is recorded before 录制');
r.start(); r.gm({ id: '1', hop: 0, method: 'GET', url: 'https://x.com/a?k=v', reqHeaders: { Cookie: 'sid=SECRET' }, reqData: null, status: 302, location: 'https://y.com/b?code=SECRET', resHeaders: { 'set-cookie': ['t=SECRET; Path=/'] }, setCookie: ['t=SECRET; Path=/'], body: '' });
r.log(['login-trace', 'stage', 'slot=', 1]); r.log(['CONSOLE', 'game says hi']); r.log(['metrics', 'x']);
assert.equal(r.state().count, 3, 'start mark + gm + login line; unrelated console and metrics are skipped');
r.pause(); r.log(['login-trace', 'x']); assert.equal(r.state().count, 3, 'paused: nothing added, nothing cleared');
r.resume(); r.log(['login-trace', 'y']); assert.equal(r.state().count, 4);
const before = r.state(); const dump = r.dump(); assert.deepEqual(r.state(), before, 'copy/export do not change state');
assert(!/SECRET/.test(dump), 'no secret survives the dump');
r.stop(); assert.equal(r.state().status, 'stopped'); assert(r.state().count > 0, 'stop keeps records');
r.clear(); assert.equal(r.state().count, 0);
// 壳里的接线：快捷键走引擎命令、录制窗口用系统边框（可拖动、可最小化恢复）、关窗不清记录
const main = fs.readFileSync(path.join(__dirname, '../src/core/main-app.ts'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '../src/core/chrome/engine.ts'), 'utf8');
assert(engine.includes("if (c && e.shiftKey && e.altKey && e.code === 'KeyR') return 'recorder';") && main.includes("if (c && input.shift && input.alt && input.code === 'KeyR') return 'recorder';") && main.includes("else if (cmd === 'recorder') openLoginRecorder();"));
assert(main.includes("title: '登录录制器', resizable: false, maximizable: false, minimizable: true") && main.includes("recorderWin.on('closed', () => { recorderWin = null; });"));
for (const label of ['录制', '暂停', '继续', '停止', '清空', '复制', '导出']) assert(main.includes(`>${label}</button>`), label);
const unified = fs.readFileSync(path.join(__dirname, '../jinnangdai/payload/unified-login.user.js'), 'utf8');
assert(unified.includes("stage: 'vivo_account_shape'") && unified.includes("stage: 'oppo_game_account_shape'") && !/vivo_account_shape[^\n]*subOpenId:/.test(unified), 'account diagnostics log counts and flags, never ids');
assert.equal(unified, fs.readFileSync(path.join(__dirname, '../jinnangdai/payload/unified-login.user.js'), 'utf8'), 'payload copy in sync');
console.log('micro login recorder tests passed');
// 正式版不指望玩家操作（作者 10-21）：录制器只在开发版能打开；跨域请求一直脱敏进环形缓冲，登录失败时自动写进日志
{
  const r2 = createLoginRecorder({ meta: () => ({}) });
  for (let i = 0; i < 50; i++) r2.gm({ id: String(i), hop: 0, method: 'GET', url: 'https://x.com/a?t=SECRET', reqHeaders: {}, reqData: null, status: 200, resHeaders: {}, body: '{"token":"SECRET"}' });
  const ev = r2.takeEvidence();
  assert.equal(ev.length, 40, 'bounded ring without recording'); assert.equal(r2.state().count, 0, 'evidence does not need 录制');
  assert(!/SECRET/.test(JSON.stringify(ev))); assert.equal(r2.takeEvidence().length, 0, 'taken evidence is cleared');
  const m = fs.readFileSync(path.join(__dirname, '../src/core/main-app.ts'), 'utf8');
  assert(m.includes("if (app.isPackaged && process.env.JND_DEV !== '1') return;") && m.includes("if (evidence.length) setImmediate(() => log('login-evidence', JSON.stringify(evidence)));") && m.includes("String(args[0]).startsWith('login-error')"));
  console.log('micro login recorder evidence tests passed');
}
for (const raw of ['https://game.test/callback?code=credential#token=credential', 'auth://tauth.qq.com/?access_token=credential', 'com.huawei.apps.111830943:/oauth2redirect?code=credential']) {
  assert(!redactText('redirect ' + raw).includes('credential'));
}
assert(main.includes("login_recorder_.redactText(args.join(' '))"), 'launcher log redacts URLs before disk persistence');
