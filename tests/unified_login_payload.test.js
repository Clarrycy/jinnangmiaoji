'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isUnifiedLoginPage, parseUserScriptHeader } = require('../core/components');
const { PROVIDERS } = require('../core/entries');

const file = path.join(__dirname, '..', 'jinnangdai', 'payload', 'unified-login.user.js');
const code = fs.readFileSync(file, 'utf8');
const header = parseUserScriptHeader(code);
assert.equal(header.name, '统一登录器 · 多渠道直连');
assert.equal(header.version, '1.1.1');
for (const host of ['hnoauth-login.cloud.hihonor.com', 'hnid-drcn.cloud.hihonor.com',
  'hnid-drcn.platform.hihonorcloud.com', 'gamecenter-api-drcn.hispace.hihonorcloud.com']) {
  assert(header.connect.includes(host), `missing Honor @connect ${host}`);
}
for (const grant of ['unsafeWindow', 'GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues']) {
  assert.match(code, new RegExp(`// @grant\\s+${grant}`));
}
for (const grant of ['GM_addValueChangeListener', 'GM_removeValueChangeListener', 'GM_registerMenuCommand', 'GM_openInTab']) {
  assert.doesNotMatch(code, new RegExp(`// @grant\\s+${grant}`), `unused grant ${grant}`);
}
assert.match(code, /\/\* DIRECT-ENGINE-BEGIN \*\//);
assert.match(code, /\/\* DIRECT-ENGINE-END \*\//);
assert.match(code, /const VERSION = '1\.1\.1'/);
assert.match(code, /source: 'sgs-multichannel'/);
assert.match(code, /const HONOR_CHANNEL = 320463/);
assert.match(code, /function honorURL\(/);
assert.match(code, /async function exchangeHonor\(/);
assert.match(code, /honor: Object\.freeze\(\{path: '\/10\/pc\/index\.php', channel: HONOR_CHANNEL/);
assert.match(code, /const honor = document\.createElement\('button'\)/);
assert.match(code, /let lastSig = '', lastR = null;/);
assert.match(code, /OPPO_TE_SANITIZED/);
assert.match(code, /return \{'x-euler-const': sanitized, 'x-euler-headers'/);
assert.match(code, /bar\.textContent = 'OPPO 安全验证/);
assert.match(code, /a\.stage = 'oppo_verify_done'/);
assert.match(code, /OPPO_TE_UNAVAILABLE: '登录环境校验失败，请重试'/);
assert.match(code, /OPPO_IDENTIFY_TIMEOUT: '安全验证超时，请重试'/);
assert.match(code, /OPPO_IDENTIFY_CLOSED: '已取消安全验证'/);
assert.equal((code.match(/page\.__JND_UNIFIED_LOGIN\?\.notify\?\.\(\)/g) || []).length, 4,
  'OPPO identify/captcha must release and restore the shell QR card');
assert.match(code, /notify,\r?\n\s+providers:/, 'the bridge must expose notify');

const providersMatch = /providers:\s*Object\.freeze\(\[([^\]]+)\]\)/.exec(code);
assert(providersMatch, 'the embedded API must declare its providers');
const providers = [...providersMatch[1].matchAll(/'([a-z]+)'/g)].map(match => match[1]);
assert.deepEqual(providers, PROVIDERS.filter(provider => provider.mode === 'qr').map(provider => provider.provider),
  'bridge provider order must match the shell menu');
assert.match(code, /const XIAOMI_PAGE_RESULT_PREFIX = 'sgs-xiaomi-page-result-v1:'/);
assert.match(code, /function waitForXiaomiPage\(/);
assert.match(code, /const mode = \['vivo', 'oppo', 'steam', 'xiaomi'\]\.includes\(provider\)/);
assert.match(code, /if \(a\.mode === 'browser'\) a\.xiaomiCode = await waitForXiaomiPage\(a\)/);
assert.match(code, /XIAOMI_PAGE_RESULT_KEY \+ nonce/);
assert.match(code, /XIAOMI_BROWSER_TIMEOUT: '等待小米官方登录超时/);

const callbackPages = [
  'https://web.sanguosha.com/login/x/index',
  'https://web.sanguosha.com/10/pc/index.php',
  'https://passport.vivo.com.cn/login',
  'https://joint.vivo.com.cn/game-subaccount-login/?from=auth',
  'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?code=x',
  'http://game.xiaomi.com/oauthcallback/mioauth?code=x',
  'https://10th-ly-login.sanguosha.com/steam/oauth/callback.html?state=x',
];
for (const value of callbackPages) assert.equal(isUnifiedLoginPage(new URL(value)), true, value);
assert.equal(isUnifiedLoginPage(new URL('https://web.sanguosha.com/news/1')), false);
assert.equal(isUnifiedLoginPage(new URL('https://example.com/game-union-h5/h5/client-login/')), false);

// DIRECT-ENGINE 是独立 IIFE，不能直接读主机 IIFE 里的局部常量。用最小 DOM 桩执行它的
// 顶层声明和函数定义，把 mount 留到浏览器里；跨 IIFE 的 ReferenceError 会在这里直接失败。
const begin = code.indexOf('/* DIRECT-ENGINE-BEGIN */');
const end = code.indexOf('/* DIRECT-ENGINE-END */');
const directEngine = code.slice(begin, end)
  .replace(/if \(document\.body\) mount\(\); else document\.addEventListener\('DOMContentLoaded', mount, \{once: true\}\);/, 'void mount;');
const element = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, append() {}, appendChild() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, attachShadow: () => ({ append() {} }) });
const sandbox = {
  console, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  location: new URL('https://web.sanguosha.com/login/x/index'),
  navigator: { userAgent: 'test', language: 'zh-CN' },
  document: { body: {}, documentElement: {}, getElementById: () => null, addEventListener() {}, createElement: element },
  GM_xmlhttpRequest: () => ({ abort() {} }), GM_getValue: () => null, GM_setValue() {}, GM_deleteValue() {},
  GM_listValues: () => [], GM_info: {}, performance: { now: () => 0 },
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  Event: class {}, CustomEvent: class {}, EventTarget: class { addEventListener() {} removeEventListener() {} dispatchEvent() {} },
  MessageChannel: class { constructor() { this.port1 = {}; this.port2 = {}; } },
  fetch: async () => { throw new Error('no fetch'); }, Image: class {}, MutationObserver: class { observe() {} disconnect() {} },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox; sandbox.top = sandbox;
sandbox.unsafeWindow = sandbox;
vm.runInContext(directEngine, vm.createContext(sandbox), { filename: 'unified-login-direct-engine.js' });

console.log('unified login payload tests passed');
