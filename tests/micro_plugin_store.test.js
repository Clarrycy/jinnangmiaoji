'use strict';
// 插件库：装（文件／链接）、头部解析、@match 匹配、停用／卸载、注入记录、按 @updateURL 检查更新。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPluginStore, parseHeader, matchesUrl, slugOf } = require('../core/plugin-store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-plugins-'));
const script = (version, extra = '') => `// ==UserScript==\n// @name         斗地主助手\n// @namespace    jnd\n// @version      ${version}\n// @match        https://web.sanguosha.com/x/pc/*\n// @include      https://*.4399iw2.com/yxxsgs/*\n// @grant        GM_setValue\n// @connect      sh-sgs.net\n${extra}// ==/UserScript==\n(function(){ window.__ddz = ${JSON.stringify(version)}; })();\n`;
const file = path.join(dir, 'ddz-assist.user.js');
fs.writeFileSync(file, script('1.0.0'));
const fetched = new Map();
const store = createPluginStore({ directory: path.join(dir, 'store'), fetch: async url => { if (!fetched.has(url)) throw new Error(`HTTP 404 ${url}`); return Buffer.from(fetched.get(url)); } });

(async () => {
  // 头部解析与 @match 通配
  const header = parseHeader(script('1.0.0', '// @updateURL    https://example.com/ddz.meta.js\n'));
  assert.equal(header.name, '斗地主助手'); assert.equal(header.version, '1.0.0'); assert.equal(header.grant, true);
  assert.deepEqual(header.match, ['https://web.sanguosha.com/x/pc/*', 'https://*.4399iw2.com/yxxsgs/*']);
  assert.deepEqual(header.connect, ['sh-sgs.net']); assert.equal(header.updateUrl, 'https://example.com/ddz.meta.js');
  assert.equal(matchesUrl(header.match, 'https://web.sanguosha.com/x/pc/index.php?x=1'), true);
  assert.equal(matchesUrl(header.match, 'https://game.4399iw2.com/yxxsgs/index.php'), true);
  assert.equal(matchesUrl(header.match, 'https://web.sanguosha.com/login/x/index'), false);
  assert.equal(slugOf('C:\\Users\\kiwi\\Downloads\\My Plugin.user.js'), 'my-plugin');
  assert.equal(slugOf('https://sh-sgs.net/ddz-assist.user.js?v=3'), 'ddz-assist');

  // 从文件安装：id 取文件名；没有 @updateURL 的文件安装没有更新地址
  const first = await store.install(file);
  assert.equal(first.updated, false); assert.equal(first.meta.id, 'ddz-assist'); assert.equal(first.meta.version, '1.0.0'); assert.equal(first.meta.updateUrl, '');
  assert.equal(store.list().length, 1);
  assert(fs.existsSync(path.join(dir, 'store', 'ddz-assist.user.js')));
  await assert.rejects(store.check('ddz-assist'), /没有更新地址/);

  // 从链接安装同 id：覆盖更新，更新地址＝安装链接
  fetched.set('https://sh-sgs.net/ddz-assist.user.js', script('1.1.0'));
  const second = await store.install('https://sh-sgs.net/ddz-assist.user.js');
  assert.equal(second.updated, true); assert.equal(second.from, '1.0.0'); assert.equal(second.meta.version, '1.1.0'); assert.equal(second.meta.updateUrl, 'https://sh-sgs.net/ddz-assist.user.js');
  await assert.rejects(store.install('http://sh-sgs.net/x.user.js'), /https:\/\//);
  fs.writeFileSync(path.join(dir, 'plain.js'), 'console.log(1)');
  await assert.rejects(store.install(path.join(dir, 'plain.js')), /不是 user\.js/);

  // 注入记录：启用的才有；@grant 过就要 GM 桥
  let records = store.startupRecords();
  assert.deepEqual(Object.keys(records), ['ddz-assist']);
  assert.equal(records['ddz-assist'].gm, true); assert(records['ddz-assist'].code.includes('__ddz'));
  store.setEnabled('ddz-assist', false);
  assert.deepEqual(store.startupRecords(), {});
  store.setEnabled('ddz-assist', true);

  // 检查更新：同版本不动；更高版本换文件
  const same = await store.check('ddz-assist');
  assert.deepEqual(same, { updated: false, version: '1.1.0', from: '1.1.0' });
  fetched.set('https://sh-sgs.net/ddz-assist.user.js', script('1.2.0'));
  const newer = await store.check('ddz-assist');
  assert.deepEqual(newer, { updated: true, version: '1.2.0', from: '1.1.0' });
  assert(fs.readFileSync(path.join(dir, 'store', 'ddz-assist.user.js'), 'utf8').includes('"1.2.0"'));

  // 索引落盘，重开可见；卸载删文件与索引
  const reopened = createPluginStore({ directory: path.join(dir, 'store'), fetch: async () => Buffer.alloc(0) });
  assert.equal(reopened.get('ddz-assist').version, '1.2.0');
  reopened.remove('ddz-assist');
  assert.equal(reopened.list().length, 0); assert(!fs.existsSync(path.join(dir, 'store', 'ddz-assist.user.js')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('micro plugin store tests passed');
})().catch(error => { console.error(error); process.exit(1); });
