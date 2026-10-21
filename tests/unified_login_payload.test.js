/* Protocol/security regressions. These do not replace Tampermonkey runtime QA. */
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/../jinnangdai/payload/unified-login.user.js', 'utf8');

function harness(gm = () => { throw new Error('unexpected request'); }) {
  const window = {}; window.top = window;
  const exports = {}, storage = new Map(), imageURLs = [];
  const routes = [], tabStorage = new Map();
  const context = {window, location: {origin: 'https://web.sanguosha.com', pathname: '/login/index.html', assign: url => routes.push(url)},
    sessionStorage: {getItem: key => tabStorage.get(key) ?? null, setItem: (key, value) => tabStorage.set(key, String(value)), removeItem: key => tabStorage.delete(key)},
    navigator: {locks: {request: async (_name, _options, callback) => callback({})}},
    unsafeWindow: {}, crypto, URL, URLSearchParams, Blob, Uint8Array, DataView, TextEncoder, TextDecoder, performance, atob, btoa,
    Image: class {set src(value) {imageURLs.push(value); queueMicrotask(() => this.onload?.());} removeAttribute() {}},
    setTimeout, clearTimeout, setInterval, clearInterval, console: {info() {}, error() {}},
    GM_xmlhttpRequest: gm, GM_getValue: (key, fallback) => storage.has(key) ? structuredClone(storage.get(key)) : fallback,
    GM_setValue: (key, value) => storage.set(key, structuredClone(value)), GM_deleteValue: key => storage.delete(key), exports};
  const tail = "if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, {once: true});";
  assert.ok(source.includes(tail));
  vm.runInNewContext(source.replace(tail, `Object.assign(exports, {
    webURL, applyWebResult, takeWebState, webStates,
    expireWebState() { webDeadline = 0; },
    Cookies, hash33, uniqueParams, callback, proxy, validateGrant, isProxy, parseURL,
    QQ_HOSTS, prepare, prepareWX, wxPollResult, wxCallback, exchange, transport, clearAttempt, diagnostics,
    oppoSDKHeaders, oppoGameCredentials, exchangeOppoGameAccount, exchangeOppoGrant,
    md5, biliSigned, biliQRURL, encodeBiliQR, prepareBili, validateBiliAuth, BILI_CONFIG,
    steamSigned, steamQRURL, steamOAuthCallback, prepareSteam, prepareSteamSession, steamAPI, validateSteamGrant, validateSteamAuth,
    steamCheckpoint, restoreSteamCheckpoint, STEAM_PENDING_KEY, authorizeSteam,
    xiaomiRequest, xiaomiChallenge, prepareXiaomi, waitForXiaomi, xiaomiCallback, xiaomiCipher, xiaomiJSON, xiaomiGameCredentials,
    vivoURL, vivoRequest, vivoCipher, vivoWeb, prepareVivo, waitForVivo, vivoAccountChoice, exchangeVivo, authorizeVivo,
    huaweiURL, huaweiText, huaweiRequest, huaweiCallbackParams, huaweiCode, huaweiIdentity, authorizeHuawei, exchangeHuawei,
    honorURL, honorXML, honorLoginResult, prepareHonor, authorizeHonor, exchangeHonor, honorRequest, errorUI,
    remember, remembered, forget, openGame, enterGame, logoutAccount, SESSION_KEY, HANDOFF_KEY, TAB_KEY, nativeSession, refreshNative,
    resume, start, prefetchEntryArtwork, entryArtwork,
    setShowMiddle(fn) {showMiddle = fn;},
    currentAttempt() {return attempt;},
    output() {return ui.output.textContent;},
    setLogoutTransition(fn) {logoutTransition = fn;},
    setupMiddle() {middle = {enter: {disabled: false}};},
    setup() { attempt = {state: 'owned-state', device: 'owned-device', expires: Date.now() + 180000,
      stage: 'setup', requests: new Set(), cookies: new Cookies()};
      ui = {screen: {hidden: true, removeAttribute() {}}, oppoLink: {hidden: true, removeAttribute() {}}, qq: {}, menu: {}, output: {}, handle: {setAttribute() {}}}; return attempt; },
    confirmation() {return ui.oppoLink;},
    setAttempt(a) {attempt = a;}, image() {return ui.screen.src;}
  });`), context);
  return Object.assign(exports, {storage, routes, window, tabStorage, imageURLs});
}
// The lifecycle audit log is expected state; session assertions ignore it.
const LIFECYCLE_KEY = 'unified.lifecycle.v1';
const sessionStateSize = h => [...h.storage.keys()].filter(key => key !== LIFECYCLE_KEY).length;
const lifecycleEvents = h => h.storage.get(LIFECYCLE_KEY)?.events || [];
const sessionState = h => [...h.storage].filter(([key]) => key !== LIFECYCLE_KEY);
const plain = value => JSON.parse(JSON.stringify(value)); // vm objects have another realm's prototypes
function loadResponse(details, body, extra = {}) {
  queueMicrotask(() => details.onload({status: 200, finalUrl: details.url, responseText: body,
    responseHeaders: '', ...extra}));
  return {abort() {}};
}

test('one-file release has no executable external dependencies or loopback URLs', () => {
  assert.doesNotMatch(source, /__OFFICIAL_CONFIG__|127\.0\.0\.1|localhost|@require|@resource/);
  // The approved vendored OPPO SDK is a string, not this adapter's executable transport.
  const adapter = source.replace(/^  const OPPO_BSP_SRC = .*;$/m, '');
  assert.doesNotMatch(adapter, /\b(?:eval|fetch)\s*\(|\bnew Function\s*\(/);
  assert.equal(source.includes(String.fromCodePoint(0x731c)), false);
});
test('Vivo refuses foreign destinations, unexpected account paths, and redirect transport fallback', async () => {
  const h = harness(details => loadResponse(details, '', {status: 302,
    finalUrl: 'https://attacker.test/', responseHeaders: 'Set-Cookie: should_not_store=secret; Domain=.vivo.com.cn'}));
  for (const url of ['http://passport.vivo.com.cn/pass/QRCode/login/generateQRCode',
    'https://passport.vivo.com.cn.attacker.test/pass/QRCode/login/generateQRCode',
    'https://passport.vivo.com.cn/account/delete', 'https://joint.vivo.com.cn/h5/union/use#fragment']) {
    assert.throws(() => h.vivoURL(url, 'vivo_qr'), /ENDPOINT_DENIED/);
  }
  const a = h.setup(); a.provider = 'vivo';
  await assert.rejects(h.vivoRequest(a, 'vivo_qr', 'https://passport.vivo.com.cn/pass/QRCode/login/generateQRCode', {}), /REDIRECT_TRANSPORT_UNAVAILABLE/);
  assert.equal(a.cookies.header('https://passport.vivo.com.cn/'), '');
});
test('Vivo sends encrypted fields and rejects a stale reply before advancing the attempt', async () => {
  let captured;
  const h = harness(details => {captured = details; return {abort() {}};});
  const a = h.setup(); a.provider = 'vivo';
  const pending = h.vivoWeb(a, 'generateQRCode', {QRCodeScene: 'pcLogin'});
  while (!captured) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(captured.redirect, 'manual'); assert.equal(captured.anonymous, true);
  const body = new URLSearchParams(captured.data);
  assert.deepEqual([...body.keys()].sort(), ['encData', 'encKey', 'encVer']);
  assert.equal(body.get('encVer'), '1_1_2'); assert.ok(!captured.data.includes('pcLogin'));
  h.setAttempt(null);
  captured.onload({status: 200, finalUrl: captured.url, responseText: '{"code":0,"data":{}}', responseHeaders: ''});
  await assert.rejects(pending, /ATTEMPT_EXPIRED/);
});
test('Vivo rejects account changes between scan and confirmation and clears an expired QR', async () => {
  let code = 0;
  const h = harness(details => loadResponse(details, JSON.stringify(code ? {code} : {code: 0, data: {openid: 'different-owner'}})));
  const a = h.setup(); a.provider = 'vivo'; a.vivoQR = 'owned-qr'; a.vivoScanned = 'original-owner';
  await assert.rejects(h.waitForVivo(a), /ACCOUNT_MISMATCH/);
  assert.equal(a.vivoConfirmed, undefined);
  code = 15016;
  await assert.rejects(h.waitForVivo(a), /QR_EXPIRED/);
  assert.equal(a.vivoQR, undefined); assert.equal(a.vivoScanned, undefined);
});
test('Vivo requires real-name clearance and a single available game account', () => {
  const h = harness(), realName = {data: {accountRealName: true}};
  const account = {data: {subAccounts: [{subOpenId: 'game-owner', lastLogin: true}]}};
  assert.equal(h.vivoAccountChoice(account, realName), 'game-owner');
  assert.throws(() => h.vivoAccountChoice(account, {data: {accountRealName: false}}), /REAL_NAME_REQUIRED/);
  assert.throws(() => h.vivoAccountChoice({...account, extraData: {minor: true}}, realName), /NATIVE_CONFIRMATION_REQUIRED/);
  assert.throws(() => h.vivoAccountChoice({data: {subAccounts: [...account.data.subAccounts, {subOpenId: 'other'}]}}, realName), /ACCOUNT_SELECTION_REQUIRED/);
  assert.throws(() => h.vivoAccountChoice({data: {subAccounts: [{subOpenId: 'owner', lastLogin: true, frozenFlag: true}]}}, realName), /ACCOUNT_UNAVAILABLE/);
});
test('Vivo renders URL-safe QR payloads without changing their bytes', async () => {
  const ticket = 'VIVO_ACCOUNT:' + 'ab-_'.repeat(32);
  let issued = 0;
  const h = harness(d => {issued++; return loadResponse(d, JSON.stringify({code: 0, data: {scanCodeNum: ticket}}));});
  const a = h.setup(); a.provider = 'vivo';
  await h.prepareVivo(a);
  assert.equal(a.vivoQR, ticket); assert.ok(h.image().startsWith('blob:'));
  const image = a.image;
  await h.prepareVivo(a);
  assert.equal(a.vivoQR, ticket); assert.notEqual(a.image, image); assert.equal(issued, 1);
  h.clearAttempt();
});
test('Vivo rejects changed OAuth app bindings before following a redirect', async () => {
  let calls = 0;
  const target = 'https://joint.vivo.com.cn/game-subaccount-login/?from=login';
  const h = harness(d => {calls++; return loadResponse(d, '', {status: 302,
    responseHeaders: 'Location: https://passport.vivo.com.cn/v3/web/login/authorize?' +
      new URLSearchParams({client_id: 'other-app', redirect_uri: target})});});
  const a = h.setup(); a.provider = 'vivo';
  await assert.rejects(h.authorizeVivo(a), /ENDPOINT_DENIED/);
  assert.equal(calls, 1); assert.equal(a.vivoAuthorized, undefined);
});
test('Vivo cancellation aborts the pending request and leaves no account state', async () => {
  let captured, aborted = false;
  const h = harness(d => {captured = d; return {abort() {aborted = true;}};});
  const a = h.setup(); a.provider = 'vivo';
  const pending = h.vivoWeb(a, 'checkQRCodeState', {scanCodeNum: 'owned-qr'});
  while (!captured) await new Promise(resolve => setTimeout(resolve, 1));
  h.clearAttempt();
  await assert.rejects(pending, /REQUEST_CANCELLED/);
  assert.equal(aborted, true); assert.equal(Object.keys(a).length, 0);
});
test('Vivo authorization accepts only the confirmed account in its official callback', async () => {
  for (const owner of ['same-owner', 'different-owner']) {
    let calls = 0;
    const h = harness(d => {calls++; return loadResponse(d, '', calls === 1 ? {status: 302,
      responseHeaders: 'Location: https://joint.vivo.com.cn/game-subaccount-login/?from=login&openid=' + owner} : {});});
    const a = h.setup(); a.provider = 'vivo'; a.vivoIdentity = 'same-owner';
    if (owner === 'same-owner') {
      await h.authorizeVivo(a); assert.equal(a.vivoAuthorized, true); assert.equal(calls, 2);
    } else {
      await assert.rejects(h.authorizeVivo(a), /ENDPOINT_DENIED/); assert.equal(calls, 1);
    }
  }
});
test('Vivo game handoff is consumed once and rejects a forgotten or replaced saved account', () => {
  for (const condition of ['valid', 'forgotten', 'switched']) {
    const h = harness(), a = h.setup(); a.provider = 'vivo';
    a.vivo = {uid: 'vivo-owner', session: 'vivo-session'}; a.account = 'owned-account';
    h.remember(a);
    a.grant = {account: 'owned-account', token: 'owned-token', sign: 'owned-sign', timestamp: 123456};
    a.grantExpires = Date.now() + 90000; h.openGame(a);
    assert.equal(h.routes[0], 'https://web.sanguosha.com/10/pc/index.php?channel_id=320056');
    const nonce = h.window.name, saved = h.storage.get(h.SESSION_KEY);
    if (condition === 'forgotten') h.storage.delete(h.SESSION_KEY);
    if (condition === 'switched') saved.id = 'different-account';
    const b = gameBootstrap(h.storage, nonce, h.tabStorage);
    if (condition === 'valid') {
      assert.equal(b.page.ReqObj.channel_id, 320056); assert.equal(b.page.ReqObj.token, 'owned-token');
    } else assert.equal(b.page.ReqObj, undefined);
    assert.equal(h.storage.has(h.HANDOFF_KEY), false);
    assert.equal(gameBootstrap(h.storage, nonce, h.tabStorage).page.ReqObj, undefined);
  }
});
test('Vivo keeps its channel game session in private storage and restores it after reload', () => {
  const h = harness(), a = h.setup(); a.provider = 'vivo';
  a.vivo = {uid: 'vivo-owner', session: 'vivo-session', username: 'nick'}; a.account = 'game-account';
  a.vivoQR = 'qr-secret'; a.session = 'sgs-ticket-secret'; a.grant = {token: 'grant-secret'};
  h.remember(a);
  const r = h.remembered();
  assert.equal(r.provider, 'vivo'); assert.equal(r.account, 'game-account');
  assert.deepEqual(plain(r.vivo), {uid: 'vivo-owner', session: 'vivo-session', username: 'nick'});
  const persisted = JSON.stringify(sessionState(h));
  for (const secret of ['qr-secret', 'sgs-ticket-secret', 'grant-secret']) assert.equal(persisted.includes(secret), false);
  h.clearAttempt(); assert.equal(Object.keys(a).length, 0);
});
test('hash matches known QQ qrsig token arithmetic and handles overflow', () => {
  const h = harness();
  for (const s of ['', 'abc', '0123456789'.repeat(100)]) {
    let expected = 0n;
    for (const c of s) expected = (expected * 33n + BigInt(c.charCodeAt(0))) & 0xffffffffn;
    assert.equal(h.hash33(s), Number(expected & 0x7fffffffn));
  }
});
test('response cookie capture rejects foreign domain and path confusion', () => {
  const h = harness(), jar = new h.Cookies();
  jar.read('Set-Cookie: qrsig=owned; Domain=.ptlogin2.qq.com; Path=/; HttpOnly\r\n' +
    'Set-Cookie: qrsig=foreign; Domain=attacker.test; Path=/\r\n' +
    'Set-Cookie: scoped=yes; Path=/ptqr\r\n', 'https://ssl.ptlogin2.qq.com/ptqrshow');
  assert.equal(jar.qrsig(), 'owned');
  assert.equal(jar.header('https://ssl.ptlogin2.qq.com/ptqrlogin'), 'qrsig=owned');
  assert.equal(jar.header('https://m.wegame.com.cn/'), '');
  jar.read('Set-Cookie: qrsig=; Domain=.ptlogin2.qq.com; Path=/; Max-Age=0', 'https://ssl.ptlogin2.qq.com/ptqrshow');
  assert.throws(() => jar.qrsig(), /QQ_QRSIG_UNAVAILABLE/);
});
test('combined Set-Cookie with Expires comma keeps both bound cookies', () => {
  const jar = new (harness().Cookies)();
  jar.read('set-cookie: first=x; Expires=Wed, 01 Jan 2099 00:00:00 GMT; Path=/, qrsig=own; Path=/',
    'https://ssl.ptlogin2.qq.com/ptqrshow');
  assert.equal(jar.qrsig(), 'own');
  assert.equal(jar.header('https://ssl.ptlogin2.qq.com/ptqrlogin'), 'first=x; qrsig=own');
});
test('callback refuses foreign state, duplicate parameters, foreign app and proxy path', async () => {
  const h = harness(), a = h.setup();
  const data = new URLSearchParams({state: a.state, openid: 'own-id', access_token: 'own-token'});
  assert.equal(h.callback(a, 'auth://tauth.qq.com/#' + data).openid, 'own-id');
  assert.throws(() => h.callback(a, 'auth://tauth.qq.com/#' + data + '&state=foreign'), /DUPLICATE_FIELD/);
  assert.throws(() => h.callback(a, 'auth://evil.test/#' + data), /TARGET_MISMATCH/);
  assert.throws(() => h.callback({...a, state: 'other'}, 'auth://tauth.qq.com/#' + data), /STATE_MISMATCH/);
  assert.equal(h.isProxy('https://imgcache.qq.com/other/proxy.htm'), false);
  await assert.rejects(h.proxy(a, 'https://imgcache.qq.com/open/connect/widget/mobile/login/proxy.htm?appid=wrong'), /APPLICATION_MISMATCH/);
});
test('official proxy credentials are accepted only on exact application binding', async () => {
  const h = harness(), a = h.setup();
  const url = 'https://imgcache.qq.com/open/connect/widget/mobile/login/proxy.htm?appid=101790992' +
    '&openid=' + 'a'.repeat(32) + '#access_token=' + 'b'.repeat(32);
  assert.equal((await h.proxy(a, url)).access_token, 'b'.repeat(32));
});
test('HTTP failure retains acquired authorization and does not restart QR', async () => {
  let calls = 0;
  const h = harness(d => { calls++; return loadResponse(d, '{}', {status: 503}); });
  const a = h.setup(); a.qq = {openid: 'id', access_token: 'token'};
  await assert.rejects(h.exchange(a), /HTTP_503/);
  assert.equal(a.qq.openid, 'id'); assert.equal(calls, 1);
  assert.equal(a.requests.size, 0);
  assert.equal(JSON.stringify(h.diagnostics).includes('token'), false);
});
test('late replies from a replaced attempt cannot advance credentials', async () => {
  let reply;
  const h = harness(d => { reply = d; return {abort() {}}; });
  const a = h.setup();
  const pending = h.transport(a, 'https://m.wegame.com.cn/web/oauth2.0/union_login', {});
  h.setAttempt(null);
  reply.onload({status: 200, finalUrl: reply.url, responseText: '{}'});
  await assert.rejects(pending, /ATTEMPT_EXPIRED/);
});
test('exchange keeps AnySDK routing at root and never confuses QQ with game credentials', async () => {
  const calls = [];
  const h = harness(d => {
    const u = new URL(d.url), body = d.data ? JSON.parse(d.data) : null;
    calls.push({host: u.hostname, path: u.pathname, body});
    let reply;
    if (u.pathname.endsWith('/union_login')) {
      assert.equal(body.login_type, 'game_login'); assert.equal(body.third_type, 0);
      assert.equal(body.login_state_token, 'qq-token');
      reply = {code: 0, openid: 'wg-id', access_token: 'wg-token', pc_rail_id: 'rail-id'};
    } else if (u.pathname.endsWith('/get_channel_info')) {
      assert.equal(u.searchParams.get('access_token'), 'wg-token'); reply = {code: 0, last_month_channel: 'source'};
    } else if (u.pathname === '/v1/login') {
      assert.equal(body.appid, '485'); assert.equal(body.platform_id, '326');
      assert.equal(body.package_id, '60'); assert.equal(body.platform_name, 'wegame');
      assert.equal(body.base.appid, undefined); assert.equal(body.data.session, 'wg-token');
      assert.equal(JSON.parse(body.ext).openid, 'wg-id');
      reply = {code: 0, data: JSON.stringify({session: 'sgs-ticket'})};
    } else if (u.pathname === '/wegame/app/login') {
      assert.equal(u.searchParams.get('ticket'), 'sgs-ticket');
      reply = {code: 0, data: {account: 'game-account', token: 'game-token', sign: 'game-sign', timestamp: '123456'}};
    } else throw new Error('unexpected endpoint');
    return loadResponse(d, JSON.stringify(reply));
  });
  const a = h.setup(); a.qq = {openid: 'qq-id', access_token: 'qq-token'};
  const grant = await h.exchange(a);
  assert.equal(grant.token, 'game-token'); assert.equal(grant.timestamp, 123456);
  assert.equal(calls.length, 4);
  assert.equal((await h.exchange(a)).token, 'game-token'); assert.equal(calls.length, 4);
  const diagnostic = JSON.stringify(h.diagnostics);
  for (const secret of ['qq-token', 'wg-token', 'sgs-ticket', 'game-token', 'game-account']) {
    assert.equal(diagnostic.includes(secret), false);
  }
});
function gameBootstrap(storage, name, tabStorage = new Map(), pathname = '/10/pc/index.php') {
  const window = {name}; window.top = window;
  const page = {}, routes = [];
  vm.runInNewContext(source, {window, unsafeWindow: page, Date,
    GM_getValue: (key, fallback) => storage.get(key) ?? fallback,
    GM_setValue: (key, value) => storage.set(key, structuredClone(value)),
    GM_deleteValue: key => storage.delete(key),
    sessionStorage: {getItem: key => tabStorage.get(key) ?? null},
    location: {origin: 'https://web.sanguosha.com', pathname, replace: url => routes.push(url)}});
  return {window, page, routes};
}
test('same-tab handoff is one-use, expires, and preserves mandatory bootstrap channel', () => {
  const h = harness(), a = h.setup();
  a.grant = {account: 'account-id', token: 'token-value', sign: 'signature', timestamp: 123456};
  a.grantExpires = Date.now() + 90000;
  h.openGame(a);
  assert.deepEqual(h.routes, ['https://web.sanguosha.com/10/pc/index.php?channel_id=320023']);
  assert.ok(!h.routes[0].includes('token'));
  const nonce = h.window.name;
  const {page, window} = gameBootstrap(h.storage, nonce);
  assert.equal(window.name, ''); assert.equal(h.storage.has(h.HANDOFF_KEY), false);
  page.ReqObj = {channel_id: 9, token: 'stale', custom: 1}; page.channel_id = 9;
  assert.equal(page.ReqObj.channel_id, 320023); assert.equal(page.channel_id, 320023);
  assert.equal(page.ReqObj.token, 'token-value'); assert.equal(page.ReqObj.custom, 1);
  assert.equal(gameBootstrap(h.storage, nonce).page.ReqObj, undefined);
  h.storage.set(h.HANDOFF_KEY, {name: nonce, expires: Date.now() - 1, grant: {}});
  assert.equal(gameBootstrap(h.storage, nonce).page.ReqObj, undefined);
  assert.equal(h.storage.has(h.HANDOFF_KEY), false);
});
test('remembering stores one account without QQ cookies or consumed game tickets; original creation time is retained', () => {
  const h = harness(), a = h.setup();
  a.wegame = {openid: 'wg-id', access_token: 'wg-token', uid: 'rail-id', channel: '00000000'};
  a.account = 'game-account'; a.qq = {access_token: 'qq-secret'}; a.session = 'ticket-secret';
  a.grant = {token: 'game-secret'};
  h.remember(a);
  const r = h.remembered(), created = r.created;
  assert.equal(r.account, 'game-account'); assert.equal(r.wegame.access_token, 'wg-token');
  const persisted = JSON.stringify([...h.storage.values()]);
  for (const secret of ['qq-secret', 'ticket-secret', 'game-secret']) assert.equal(persisted.includes(secret), false);
  h.remember(a); assert.equal(h.remembered().created, created);
  h.clearAttempt(); assert.equal(h.remembered().created, created);
  h.forget({savedId: r.id}); assert.equal(h.remembered(), null);
});
test('expired or malformed stored sessions are removed and cannot start a QR on refresh', () => {
  const h = harness();
  h.storage.set(h.SESSION_KEY, {v: 1, provider: 'qq', id: 'a'.repeat(32), created: 1, expires: 2});
  assert.equal(h.remembered(), null); assert.equal(sessionStateSize(h), 0);
  assert.deepEqual(lifecycleEvents(h).map(e => [e.type, e.reason]), [['session.forgotten', 'RESPONSE_SCHEMA_CHANGED']]);
});
test('restored channel authorization skips QQ and obtains a fresh game grant', async () => {
  const calls = [];
  const h = harness(d => {
    const p = new URL(d.url).pathname; calls.push(p);
    const value = p.endsWith('/get_channel_info') ? {code: 0, last_month_channel: '00000000'} :
      p === '/v1/login' ? {code: 0, data: {session: 'new-ticket'}} :
      p === '/wegame/app/login' ? {code: 0, data: {account: 'game-account', token: 'new-game-token', sign: 'sign', timestamp: 123}} : null;
    assert.ok(value); return loadResponse(d, JSON.stringify(value));
  });
  const a = h.setup(); a.account = 'game-account';
  a.wegame = {openid: 'wg-id', access_token: 'wg-token', uid: 'rail-id', channel: '00000000'};
  h.remember(a);
  delete a.session; delete a.grant;
  assert.equal((await h.exchange(a)).token, 'new-game-token');
  assert.deepEqual(calls, ['/web/oauth2.0/get_channel_info', '/v1/login', '/wegame/app/login']);
  h.forget(a);
  await assert.rejects(h.exchange(a), /SAVED_SESSION_EXPIRED/);
});
test('expired selection-page grant is renewed before same-tab navigation; double clicks are ignored', async () => {
  const calls = [];
  const h = harness(d => {
    const path = new URL(d.url).pathname; calls.push(path);
    const reply = path === '/v1/login' ? {code: 0, data: {session: 'new-ticket'}} :
      {code: 0, data: {account: 'game-account', token: 'new-token', sign: 'sign', timestamp: 123}};
    return loadResponse(d, JSON.stringify(reply));
  });
  const a = h.setup(); a.account = 'game-account';
  a.wegame = {openid: 'wg-id', access_token: 'wg-token', uid: 'rail-id', channel: '00000000'};
  a.channel = '00000000'; a.grant = {token: 'old-token'}; a.grantExpires = Date.now() - 1;
  a.session = 'old-ticket'; h.remember(a); h.setupMiddle();
  await Promise.all([h.enterGame(a), h.enterGame(a)]);
  assert.deepEqual(calls, ['/v1/login', '/wegame/app/login']);
  assert.equal(h.routes.length, 1);
  assert.equal(h.storage.get(h.HANDOFF_KEY).grant.token, 'new-token');
  h.clearAttempt();
});
test('restoration rejects an official response for a different account before granting entry', async () => {
  const h = harness(d => loadResponse(d, JSON.stringify({code: 0,
    data: {account: 'other-account', token: 'token', sign: 'sign', timestamp: 123}})));
  const a = h.setup(); a.account = 'owned-account';
  a.wegame = {openid: 'wg-id', access_token: 'wg-token', uid: 'rail-id', channel: '00000000'};
  a.channel = '00000000'; a.session = 'ticket'; h.remember(a);
  await assert.rejects(h.exchange(a), /ACCOUNT_MISMATCH/);
  assert.equal(a.grant, undefined); assert.equal(h.remembered().account, 'owned-account');
});

test('game refresh returns only the marked WeGame tab to the login landing page', () => {
  const h = harness(), a = h.setup();
  a.account = 'game-account';
  a.wegame = {openid: 'id', access_token: 'token', uid: 'rail', channel: '0'};
  h.remember(a);
  h.tabStorage.set(h.TAB_KEY, a.savedId);
  for (const path of ['/10/pc/index.php', '/login/x/index']) {
    const result = gameBootstrap(h.storage, '', h.tabStorage, path);
    assert.deepEqual(result.routes, ['https://web.sanguosha.com/login/index.html']);
  }
  assert.deepEqual(gameBootstrap(h.storage, '').routes, []);
  h.tabStorage.set(h.TAB_KEY, 'different-account');
  assert.deepEqual(gameBootstrap(h.storage, '', h.tabStorage).routes, []);
});
test('native refresh follows official token lifetime and rotates authorization without QQ', async () => {
  const calls = [];
  const h = harness(d => {
    calls.push(d);
    assert.equal(new URL(d.url).pathname, '/web/oauth2.0/refresh_ct_proxy');
    const body = JSON.parse(d.data);
    assert.equal(body.openid, 'owned-id'); assert.equal(body.ct, 'old-ct');
    return loadResponse(d, JSON.stringify({access_token: 'new-at', ct: 'new-ct', at_expires: 3600, is_timeout: 0}));
  });
  const a = h.setup(); a.account = 'game-account';
  a.wegame = {openid: 'owned-id', access_token: 'old-at', ct: 'old-ct', atExpires: 1, uid: 'rail', channel: '0'};
  h.remember(a);
  const before = Date.now();
  await h.refreshNative(a);
  const saved = h.remembered();
  assert.equal(saved.wegame.access_token, 'new-at'); assert.equal(saved.wegame.ct, 'new-ct');
  assert.ok(saved.wegame.atExpires >= before + 3599000);
  assert.ok(saved.wegame.atExpires <= Date.now() + 3599000);
  assert.equal(calls.length, 1);
  assert.equal(saved.expires, undefined);
});
test('expired tokens without renewal are removed; legacy lifetime is validated by server', () => {
  const h = harness(), a = h.setup();
  a.account = 'game-account';
  a.wegame = {openid: 'id', access_token: 'token', uid: 'rail', channel: '0', atExpires: 1};
  h.remember(a); assert.equal(h.remembered(), null);
  a.wegame.atExpires = 0; h.remember(a);
  const legacy = h.storage.get(h.SESSION_KEY); legacy.v = 1; legacy.expires = 1;
  h.storage.set(h.SESSION_KEY, legacy);
  assert.equal(h.remembered().account, 'game-account');
});
test('native timeout and account mismatch never replace the saved token', async () => {
  for (const response of [{is_timeout: 1}, {openid: 'foreign-id', ct: 'new', access_token: 'new', at_expires: 60}]) {
    const h = harness(d => loadResponse(d, JSON.stringify(response))), a = h.setup();
    a.wegame = {openid: 'owned-id', access_token: 'old', ct: 'old-ct'};
    await assert.rejects(h.refreshNative(a), /SAVED_SESSION_EXPIRED|ACCOUNT_MISMATCH/);
    assert.equal(a.wegame.access_token, 'old');
  }
});

function saveWeGame(h, provider, atExpires) {
  const a = h.setup();
  Object.assign(a, {provider, account: 'game-account', wegame: {
    openid: 'owned-id', access_token: 'old-at', ct: 'old-ct', atExpires, uid: 'rail', channel: '0'
  }});
  h.remember(a); h.clearAttempt();
  h.setShowMiddle(async () => {});
}
function gameExchangeReply(d) {
  const path = new URL(d.url).pathname;
  const reply = path.endsWith('/get_channel_info') ? {last_month_channel: '0'} :
    path === '/v1/login' ? {code: 0, data: {session: 'new-ticket'}} :
    {code: 0, data: {account: 'game-account', token: 'new-game-token', sign: 'sign', timestamp: 123}};
  return loadResponse(d, JSON.stringify(reply));
}
test('page restoration reuses unexpired QQ and WX tokens without forced renewal', async () => {
  for (const provider of ['qq', 'wx']) {
    const calls = [];
    const h = harness(d => { calls.push(new URL(d.url).pathname); return gameExchangeReply(d); });
    saveWeGame(h, provider, Date.now() + 3600000);
    await h.resume();
    assert.equal(h.currentAttempt().grant?.token, 'new-game-token');
    assert.deepEqual(calls, ['/web/oauth2.0/get_channel_info', '/v1/login', '/wegame/app/login']);
    h.clearAttempt();
  }
});
test('expired page restoration renews once before requesting a fresh game grant', async () => {
  const calls = [];
  const h = harness(d => {
    const path = new URL(d.url).pathname; calls.push(path);
    return path.endsWith('/refresh_ct_proxy') ? loadResponse(d, JSON.stringify({
      access_token: 'new-at', ct: 'new-ct', at_expires: 3600, is_timeout: 0
    })) : gameExchangeReply(d);
  });
  saveWeGame(h, 'qq', 1);
  await h.resume();
  assert.equal(h.currentAttempt().grant?.token, 'new-game-token');
  assert.deepEqual(calls, ['/web/oauth2.0/refresh_ct_proxy', '/web/oauth2.0/get_channel_info', '/v1/login', '/wegame/app/login']);
  h.clearAttempt();
});
test('malformed renewal stops restoration; explicit channel click starts fresh authorization', async () => {
  // Negative protocol cases, not recordings of the reported server response.
  for (const provider of ['qq', 'wx']) {
    for (const response of [{}, [], {access_token: 'new', at_expires: 3600},
      {access_token: 'new', ct: 'new'}, {ct: 'new', at_expires: 3600}]) {
      const calls = [];
      const h = harness(d => {
        calls.push(new URL(d.url).hostname);
        return calls.length === 1 ? loadResponse(d, JSON.stringify(response)) :
          loadResponse(d, '{}', {status: 503});
      });
      saveWeGame(h, provider, 1);
      const saved = h.storage.get(h.SESSION_KEY);
      await h.resume();
      assert.match(h.output(), /RESPONSE_SCHEMA_CHANGED/);
      assert.equal(h.currentAttempt().grant, undefined);
      assert.deepEqual(h.storage.get(h.SESSION_KEY), saved);
      assert.deepEqual(calls, ['m.wegame.com.cn']);
      await h.start(provider);
      assert.deepEqual(calls, ['m.wegame.com.cn', provider === 'qq' ? 'openmobile.qq.com' : 'open.weixin.qq.com']);
      assert.equal(h.remembered(), null);
      h.clearAttempt();
    }
  }
});
test('temporary renewal failure retries saved authorization without another scan', async () => {
  const calls = [];
  const h = harness(d => {
    const path = new URL(d.url).pathname; calls.push(path);
    if (calls.length === 1) return loadResponse(d, '{}', {status: 503});
    return path.endsWith('/refresh_ct_proxy') ? loadResponse(d, JSON.stringify({
      access_token: 'new-at', ct: 'new-ct', at_expires: 3600
    })) : gameExchangeReply(d);
  });
  saveWeGame(h, 'qq', 1);
  await h.resume();
  assert.equal(h.remembered().wegame.access_token, 'old-at');
  await h.start('qq');
  assert.equal(h.currentAttempt().grant?.token, 'new-game-token');
  assert.deepEqual(calls, ['/web/oauth2.0/refresh_ct_proxy', '/web/oauth2.0/refresh_ct_proxy',
    '/web/oauth2.0/get_channel_info', '/v1/login', '/wegame/app/login']);
  h.clearAttempt();
});

test('logout revokes restoration and handoff before animation, including repeated clicks', async () => {
  const h = harness(), a = h.setup();
  a.account = 'game-account';
  a.wegame = {openid: 'id', access_token: 'token', uid: 'rail', channel: '0'};
  h.remember(a);
  h.storage.set(h.HANDOFF_KEY, {id: a.savedId, grant: {token: 'pending'}});
  h.tabStorage.set(h.TAB_KEY, a.savedId);
  let finish, calls = 0;
  h.setLogoutTransition(() => { calls++; return new Promise(resolve => {finish = resolve;}); });
  const pending = h.logoutAccount(a);
  assert.equal(h.remembered(), null);
  assert.equal(h.storage.has(h.HANDOFF_KEY), false);
  assert.equal(h.tabStorage.has(h.TAB_KEY), false);
  await h.logoutAccount(a);
  assert.equal(calls, 1);
  finish(); await pending;
});
test('an unavailable logout animation cannot revive deleted authorization', async () => {
  const h = harness(), a = h.setup();
  a.account = 'game-account';
  a.wegame = {openid: 'id', access_token: 'token', uid: 'rail', channel: '0'};
  h.remember(a);
  h.setLogoutTransition(async () => {throw Object.assign(new Error('LOGOUT_ASSET_UNAVAILABLE'), {stage: 'logout'});});
  await h.logoutAccount(a);
  assert.equal(h.remembered(), null);
  assert.equal(h.diagnostics.at(-1).code, 'LOGOUT_ASSET_UNAVAILABLE');
});

module.exports = {harness};

test('WeChat polling parses literal data only and binds callback to app and state', () => {
  const h = harness(), a = h.setup();
  assert.equal(h.wxPollResult("window.wx_errcode=408;window.wx_redirecturl='';window.wx_nickname='';").wx_errcode, 408);
  assert.throws(() => h.wxPollResult('window.wx_errcode=405;alert(1);'), /RESPONSE_CHANGED/);
  assert.throws(() => h.wxPollResult('window.wx_errcode=405;window.wx_errcode=408;'), /RESPONSE_CHANGED/);
  const callback = 'wxba26a260a325b6f8://oauth?code=owned_code_123&state=owned-state';
  assert.equal(h.wxCallback(a, callback), 'owned_code_123');
  assert.throws(() => h.wxCallback(a, callback.replace('owned-state', 'foreign')), /STATE_MISMATCH/);
  assert.throws(() => h.wxCallback(a, callback.replace('wxba26a260a325b6f8', 'wxOtherApp')), /APPLICATION_MISMATCH/);
  assert.throws(() => h.wxCallback(a, callback + '&code=duplicate'), /DUPLICATE_FIELD/);
});
test('WeChat code exchanges through native game login and survives restore without QQ routing', async () => {
  const calls = [];
  const h = harness(d => {
    const u = new URL(d.url), body = d.data ? JSON.parse(d.data) : null;
    calls.push(u.pathname);
    let r;
    if (u.pathname.endsWith('/union_login')) {
      assert.equal(body.login_type, 'game_login'); assert.equal(body.third_type, 1);
      assert.equal(body.login_state_type, 1); assert.equal(body.login_state_openid, '');
      assert.equal(body.login_state_token, 'wx_code_123');
      r = {code: 0, openid: 'wx-wg-id', access_token: 'wx-wg-token', pc_rail_id: 'wx-rail'};
    } else if (u.pathname.endsWith('/get_channel_info')) r = {last_month_channel: '00000000'};
    else if (u.pathname === '/v1/login') {
      assert.ok(JSON.parse(body.ext).pf.startsWith('WeChat_m-'));
      r = {code: 0, data: {session: 'wx-sgs-ticket'}};
    } else if (u.pathname === '/wegame/app/login') r = {code: 0, data: {account: 'wx-account', token: 'wx-grant', sign: 'wx-sign', timestamp: 123456}};
    else throw new Error('Unexpected endpoint');
    return loadResponse(d, JSON.stringify(r));
  });
  const a = h.setup(); a.provider = 'wx'; a.wxCode = 'wx_code_123';
  await h.exchange(a);
  assert.equal(h.remembered().provider, 'wx');
  assert.equal(a.wxCode, undefined);
  const saved = h.remembered(), restored = h.setup();
  Object.assign(restored, {provider: saved.provider, wegame: saved.wegame, savedId: saved.id, account: saved.account});
  await h.exchange(restored);
  assert.equal(calls.filter(p => p.endsWith('/union_login')).length, 1);
  assert.equal(h.storage.get(h.SESSION_KEY).wxCode, undefined);
});

test('Bilibili SDK signatures hash sorted raw UTF-8 values before form encoding', () => {
  const h = harness(), digest = require('node:crypto').createHash;
  for (const value of ['', 'abc', 'a'.repeat(55), 'b'.repeat(64), '三国杀 + &=扫码']) {
    assert.equal(h.md5(value), digest('md5').update(value).digest('hex'));
  }
  const values = {zone_id: '9037', ticket: 'a+ b&=', merchant_id: '239', mac_id: 'test-device', is_gov_ver: '1', game_id: '9869'};
  const signed = h.biliSigned(values, 'test-application-key', 1000);
  assert.equal(signed.sign, digest('md5').update('98691test-device239a+ b&=10009037test-application-key').digest('hex'));
  assert.ok(new URLSearchParams(signed).toString().includes('ticket=a%2B+b%26%3D'));
  assert.throws(() => h.biliSigned(values, ''), /APPLICATION_CONFIG_MISSING/);
  assert.throws(() => h.biliSigned({...values, sign: 'unexpected'}, 'key'), /DUPLICATE_SIGNATURE/);
});
test('Bilibili QR is bound to the documented official app URL and game base id', async () => {
  const h = harness(), input = {ticket: 'own-ticket', redirect_url: 'https://game.bilibili.com/sdk/scanH5/', game_base_id: 110547};
  const url = h.biliQRURL(input);
  assert.equal(url, 'https://game.bilibili.com/sdk/scanH5/?ticket=own-ticket&fromNative=1&id=110547');
  assert.throws(() => h.biliQRURL({...input, redirect_url: 'https://foreign.example/sdk/scanH5/'}), /ENDPOINT_DENIED/);
  assert.throws(() => h.biliQRURL({...input, game_base_id: 9869}), /TARGET_MISMATCH/);
  assert.throws(() => h.biliQRURL({...input, redirect_url: input.redirect_url + '?next=foreign'}), /TARGET_MISMATCH/);
  const matrix = h.encodeBiliQR(url, {ecc: 'M'});
  assert.ok(matrix && matrix.modules.length === matrix.size);
  assert.equal(matrix.modules[6][8], 1);
  assert.equal(matrix.modules[8][6], 1);
  // Missing application metadata must fail before any request or scan is requested.
  h.BILI_CONFIG.appKey = '';
  await assert.rejects(h.prepareBili(h.setup()), /APPLICATION_CONFIG_MISSING/);
});
test('Bilibili authorized session restores through its own endpoint and retains server expiry', async () => {
  const calls = [];
  const h = harness(d => {
    const u = new URL(d.url); calls.push(u);
    assert.equal(u.hostname, '10th-ly-login.sanguosha.com');
    assert.equal(u.pathname, '/bilibili/login'); assert.equal(u.searchParams.get('access_key'), 'owned-access');
    return loadResponse(d, JSON.stringify({code: 0, data: {account: 'bili-account', token: 'game-token', sign: 'game-sign', timestamp: '123456', channel_id: '120133'}}));
  });
  const a = h.setup(); a.provider = 'bilibili';
  a.bili = {uid: 'own-uid', access_key: 'owned-access', uname: 'bili-name', expires: Math.floor(Date.now() / 1000) + 3600};
  await h.exchange(a);
  const saved = h.remembered();
  assert.equal(saved.provider, 'bilibili'); assert.equal(saved.bili.expires, a.bili.expires);
  assert.equal(saved.wegame, undefined); assert.equal(saved.bili.ticket, undefined);
  const resumed = h.setup(); Object.assign(resumed, {provider: saved.provider, savedId: saved.id, bili: saved.bili, account: saved.account});
  await h.exchange(resumed); assert.equal(calls.length, 2);
  h.openGame(resumed);
  assert.equal(h.routes.at(-1), 'https://web.sanguosha.com/10/pc/bilibiliWD_index.php?channel_id=120133');
  const handoff = h.storage.get(h.HANDOFF_KEY);
  assert.equal(handoff.provider, 'bilibili'); assert.equal(handoff.bili.access_key, 'owned-access');
  assert.equal(handoff.grant.token, 'game-token');
  assert.equal(handoff.grant.channel_id, '120133');
  assert.equal(JSON.stringify(h.diagnostics).includes('owned-access'), false);
  const expired = h.storage.get(h.SESSION_KEY); expired.bili.expires = 1; h.storage.set(h.SESSION_KEY, expired);
  assert.equal(h.remembered(), null);
});
test('Bilibili rejects a wrong channel before storing a game grant', async () => {
  const h = harness(d => loadResponse(d, JSON.stringify({code: 0, data: {account: 'id', token: 'token', sign: 'sign', timestamp: 123456, channel_id: '320023'}})));
  const a = h.setup(); a.provider = 'bilibili';
  a.bili = {uid: 'uid', access_key: 'access', uname: '', expires: Math.floor(Date.now()/1000)+300};
  await assert.rejects(h.exchange(a), /CHANNEL_MISMATCH/);
  assert.equal(h.storage.has(h.SESSION_KEY), false);
});
function biliBootstrap(options = {}) {
  const h = harness(), a = h.setup(); a.provider = 'bilibili'; a.account = 'account';
  a.bili = {uid: 'uid', access_key: 'access', uname: 'name', expires: Math.floor(Date.now()/1000)+300};
  a.grant = {account: 'account', token: 'token', sign: 'sign', timestamp: 123456,
    channel_id: '120133', channel_account: 'bili-channel-account'};
  a.grantExpires = Date.now()+90000;
  h.remember(a); h.openGame(a);
  const messages = [], timers = new Map(), events = {}, received = [], grants = [];
  let buttons = 0, exchanges = 0, entered = 0;
  const game = {
    parseConfiged: false, preloaded: false,
    EnterLoginScene(force = false) {
      if (!this.parseConfiged || !this.preloaded) return;
      if (force) entered++; else buttons++;
    },
    LoginTicketResult(args) { received.push([...args]); this.GetWeGameToken(); },
    GetWeGameToken() { exchanges++; },
    platformLoginBack(result) { grants.push(JSON.parse(JSON.stringify(result))); this.EnterLoginScene(true); }
  };
  const originals = {entry: game.EnterLoginScene, exchange: game.GetWeGameToken};
  const page = {gameFlag: 'Sgs', BiLiBiLiLoginResult(...args) {page.Sgs.LoginTicketResult(args);}};
  if (options.lockedExport) Object.defineProperty(page, 'Sgs', {value: undefined, configurable: false});
  const window = {name: h.window.name, addEventListener: (name, fn) => {events[name] = fn;}}; window.top = window;
  const context = {window, unsafeWindow: page, Date, console: {info: (...x) => messages.push(x), error: (...x) => messages.push(x)},
    GM_getValue: (k,f) => h.storage.get(k) ?? f, GM_deleteValue: k => h.storage.delete(k),
    location: {origin: 'https://web.sanguosha.com', pathname: '/10/pc/bilibiliWD_index.php'},
    setInterval: fn => {timers.set(1,fn);return 1;}, clearInterval: id => timers.delete(id)};
  vm.runInNewContext(source, context);
  return {h, page, window, game, originals, messages, timers, events, received, grants,
    counts: () => ({buttons, exchanges, entered}),
    exportGame(channel = '120133') {page.ReqObj = {channel_id: channel}; page.Sgs = game;},
    ready() {game.parseConfiged = game.preloaded = true; game.EnterLoginScene();}};
}
test('Bilibili transfers the existing grant at official readiness without a login button or second exchange', () => {
  const b = biliBootstrap();
  assert.equal(b.h.storage.has(b.h.HANDOFF_KEY), false); assert.equal(b.window.name, '');
  // document-start precedes both ReqObj initialization and the exported Sgs class.
  b.timers.get(1)();
  assert.equal(b.received.length, 0);
  b.exportGame();
  assert.equal(Object.getOwnPropertyDescriptor(b.page, 'Sgs').value, b.game);
  b.game.EnterLoginScene(); assert.deepEqual(b.counts(), {buttons: 0, exchanges: 0, entered: 0});
  b.ready();
  assert.deepEqual(b.received, [[0, '', 'access', 'name', '9869']]);
  assert.deepEqual(b.grants, [{code: 0, data: {account: 'account', token: 'token', sign: 'sign', timestamp: 123456,
    channel_id: '120133', channel_account: 'bili-channel-account'}}]);
  assert.deepEqual(b.counts(), {buttons: 0, exchanges: 0, entered: 1});
  assert.equal(b.game.EnterLoginScene, b.originals.entry);
  assert.equal(b.game.GetWeGameToken, b.originals.exchange);
  assert.equal(b.timers.size, 0);
  b.game.EnterLoginScene(true); assert.equal(b.received.length, 1);
  assert.equal(b.page.channel_id, undefined); assert.equal(b.page.ReqObj.channel_id, '120133');
});
test('Bilibili cancels a pending handoff when the stored account logs out', () => {
  const b = biliBootstrap(); b.exportGame();
  b.h.storage.delete(b.h.SESSION_KEY); b.ready();
  assert.equal(b.received.length, 0); assert.equal(b.grants.length, 0);
  assert.deepEqual(b.counts(), {buttons: 0, exchanges: 0, entered: 0});
  assert.equal(b.game.EnterLoginScene, b.originals.entry); assert.equal(b.timers.size, 0);
  assert.match(JSON.stringify(b.messages), /SAVED_SESSION_EXPIRED/);
});
test('Bilibili refuses a changed channel and restores official methods', () => {
  const b = biliBootstrap(); b.exportGame('320023'); b.ready();
  assert.equal(b.received.length, 0); assert.equal(b.timers.size, 0);
  assert.equal(b.game.EnterLoginScene, b.originals.entry);
  assert.match(JSON.stringify(b.messages), /BILI_CHANNEL_MISMATCH/);
});
test('Bilibili missing public capability fails closed without keeping hooks or timers', () => {
  const b = biliBootstrap(); delete b.game.platformLoginBack; b.exportGame();
  assert.equal(b.received.length, 0); assert.equal(b.timers.size, 0);
  assert.equal(b.game.EnterLoginScene, b.originals.entry);
  assert.match(JSON.stringify(b.messages), /BILI_GAME_CALLBACK_UNAVAILABLE/);
  const locked = biliBootstrap({lockedExport: true});
  assert.equal(locked.timers.size, 0);
  assert.match(JSON.stringify(locked.messages), /BILI_EXPORT_UNAVAILABLE/);
});
test('Bilibili leaving before official export removes the temporary accessor', () => {
  const b = biliBootstrap(); b.events.pagehide();
  assert.equal(Object.hasOwn(b.page, 'Sgs'), false); assert.equal(b.timers.size, 0);
  assert.equal(b.received.length, 0);
});

function steamAuth() {
  return {access_token: 'application-oauth-token', steamID: '76561198000000000', expires: Date.now() + 3600000,
    retainedUntil: Date.now() + 86400000};
}
test('Steam application signing matches the official sorted raw-value signature', () => {
  const h = harness();
  const expected = require('node:crypto').createHash('md5')
    .update('access_token=token&timestamp=1700000000' + '9YeFQW05TdB8JHjDsc1XiU6tOrm4xvk2').digest('hex');
  assert.equal(h.steamSigned('token', 1700000000).sign, expected);
});
test('Steam QR and OAuth callbacks reject foreign destinations, state, duplicate values and different accounts', () => {
  const h = harness(), a = h.setup(); a.steamWeb = {steamID: '76561198000000000'};
  assert.equal(h.steamQRURL('https://s.team/q/1/123456'), 'https://s.team/q/1/123456');
  assert.throws(() => h.steamQRURL('https://s.team.example/q/1/123456'), /ENDPOINT_DENIED/);
  assert.throws(() => h.steamQRURL('https://s.team/q/1/123456?redirect=bad'), /TARGET_MISMATCH/);
  const base = 'https://10th-ly-login.sanguosha.com/steam/oauth/callback#';
  const data = new URLSearchParams({state: a.state, access_token: 'application-token', expires_in: '3600'}).toString();
  assert.equal(h.steamOAuthCallback(a, base + data).access_token, 'application-token');
  assert.throws(() => h.steamOAuthCallback(a, base + data + '&state=wrong'), /DUPLICATE_FIELD/);
  assert.throws(() => h.steamOAuthCallback({...a, state: 'different'}, base + data), /STATE_MISMATCH/);
  assert.throws(() => h.steamOAuthCallback(a, base + data + '&steamid=76561198000000001'), /ACCOUNT_MISMATCH/);
  assert.throws(() => h.steamOAuthCallback(a, base.replace('10th-ly-login.sanguosha.com', 'foreign.example') + data), /ENDPOINT_DENIED/);
});
test('Steam Community session setup still fails when redirect or cookie visibility is unavailable', async () => {
  for (const headers of ['', 'Location: https://steamcommunity.com/oauth/loginform/?goto=owned\r\n']) {
    let calls = 0;
    const h = harness(d => { calls++; return loadResponse(d, '', {status: calls === 1 ? 302 : 200, responseHeaders: calls === 1 ? headers : ''}); });
    await assert.rejects(h.prepareSteamSession(h.setup()), /STEAM_REDIRECT_UNAVAILABLE|STEAM_SESSION_COOKIE_UNAVAILABLE/);
    assert.equal(calls, headers ? 2 : 1);
  }
});
test('Steam independent QR keeps client ids as strings without first requesting Community', async () => {
  const calls = [], id = '2680247938130677005';
  const h = harness(d => {
    calls.push(d);
    if (d.url.startsWith('https://steamcommunity.com/oauth/login?')) {
      assert.equal(d.redirect, 'manual');
      return loadResponse(d, '', {status: 302, responseText: undefined, responseHeaders: 'Location: https://steamcommunity.com/oauth/loginform/?goto=owned\r\nSet-Cookie: sessionid=0123456789abcdef01234567; Path=/; Secure\r\n'});
    }
    assert.equal(new URL(d.url).pathname, '/IAuthenticationService/BeginAuthSessionViaQR/v1/');
    assert.equal(JSON.parse(new URLSearchParams(d.data).get('input_json')).device_details.platform_type, 2);
    return loadResponse(d, JSON.stringify({response: {client_id: id, request_id: 'owned-request-id',
      challenge_url: 'https://s.team/q/1/' + id, interval: 5}}), {responseHeaders: 'x-eresult: 1\r\n'});
  });
  const a = h.setup(); await h.prepareSteam(a);
  assert.equal(a.steamChallenge.client_id, id); assert.match(h.image(), /^blob:/);
  assert.equal(calls.length, 1); assert.equal(JSON.stringify(h.diagnostics).includes(id), false);
  h.clearAttempt();
});
test('Steam reads the official login page session when manual redirects hide cookies', async () => {
  const calls = [], sid = '0123456789abcdef01234567';
  const h = harness(d => {
    calls.push(d);
    if (calls.length === 1) return loadResponse(d, '', {status: 301, responseText: undefined,
      responseHeaders: 'Location: https://steamcommunity.com/oauth/loginform/?goto=owned\r\n'});
    if (calls.length === 2) {
      assert.equal(d.redirect, undefined);
      return loadResponse(d, '<script>g_sessionID = "' + sid + '";</script>');
    }
    return loadResponse(d, JSON.stringify({response: {client_id: '1234567890123456789', request_id: 'owned',
      challenge_url: 'https://s.team/q/1/1234567890123456789', interval: 5}}), {responseHeaders: 'x-eresult: 1\r\n'});
  });
  const a = h.setup(); await h.prepareSteamSession(a);
  assert.equal(a.steamSessionID, sid);
  assert.equal(a.cookies.header('https://steamcommunity.com/'), 'sessionid=' + sid);
  assert.equal(calls.length, 2); h.clearAttempt();
});
test('Steam checkpoint retains a completed scan across reload but never extends its retention', () => {
  const h = harness(), a = h.setup(); a.state = 'a'.repeat(32); a.provider = 'steam';
  a.steamWeb = {refresh_token: 'owned-refresh', steamID: '76561198000000000', sessionid: '0123456789abcdef01234567'};
  a.cookies.read('Set-Cookie: sessionid=0123456789abcdef01234567; Path=/; Secure', 'https://steamcommunity.com/');
  h.steamCheckpoint(a); const expiry = a.steamPendingUntil;
  const b = h.setup(); b.provider = 'steam'; h.restoreSteamCheckpoint(b);
  assert.equal(b.steamWeb.refresh_token, 'owned-refresh'); assert.equal(b.steamPendingUntil, expiry);
  assert.equal(b.cookies.header('https://steamcommunity.com/'), 'sessionid=0123456789abcdef01234567');
  h.steamCheckpoint(b); assert.equal(h.storage.get(h.STEAM_PENDING_KEY).expires, expiry);
  h.storage.get(h.STEAM_PENDING_KEY).expires = Date.now() - 1;
  const c = h.setup(); h.restoreSteamCheckpoint(c); assert.equal(c.steamWeb, undefined);
});
test('Steam browser authentication never sends a web JWT to SGS and binds transfer to the scanned account', async () => {
  const calls = [];
  const h = harness(d => {
    calls.push(d.url);
    if (d.url.endsWith('/jwt/finalizelogin')) return loadResponse(d, JSON.stringify({steamID: '76561198000000000',
      transfer_info: [{url: 'https://steamcommunity.com/login/settoken', params: {nonce: 'one-use', auth: 'owned-auth'}}]}));
    if (d.url.endsWith('/login/settoken')) return loadResponse(d, '{"result":1}');
    return loadResponse(d, '', {status: 302, responseHeaders:
      'Location: https://10th-ly-login.sanguosha.com/steam/oauth/callback#state=' + 'a'.repeat(32) + '&access_token=app-token&expires_in=3600\r\n'});
  });
  const a = h.setup(); a.provider = 'steam'; a.state = 'a'.repeat(32);
  a.steamWeb = {refresh_token: 'browser-refresh', steamID: '76561198000000000', sessionid: 'owned'};
  await h.authorizeSteam(a);
  assert.equal(a.steam.access_token, 'app-token'); assert.equal(calls.length, 3);
  assert.ok(calls.every(u => !u.startsWith('https://10th-ly-login')));
});
test('Steam saved application authorization gets fresh game grants, preserves channel and navigates in the same tab', async () => {
  let calls = 0;
  const h = harness(d => {
    calls++; assert.equal(d.url, 'https://10th-ly-login.sanguosha.com/steam/oauth/login');
    assert.equal(new URLSearchParams(d.data).get('access_token'), 'application-oauth-token');
    return loadResponse(d, JSON.stringify({code: 0, data: {account: 'steam-account', token: 'game-token-' + calls,
      sign: 'game-sign', timestamp: 1700000000, channel_id: '320061'}}));
  });
  const a = h.setup(); a.provider = 'steam'; a.steam = steamAuth(); await h.exchange(a);
  const saved = h.remembered(); assert.equal(saved.steam.retainedUntil, a.steam.retainedUntil);
  assert.equal(saved.steamWeb, undefined); assert.equal(saved.wegame, undefined);
  const b = h.setup(); Object.assign(b, {provider: 'steam', savedId: saved.id, account: saved.account, steam: saved.steam});
  await h.exchange(b); h.openGame(b);
  assert.equal(calls, 2); assert.equal(h.routes.at(-1), 'https://web.sanguosha.com/10/pc/index.php?channel_id=320061');
  assert.equal(h.storage.get(h.HANDOFF_KEY).grant.token, 'game-token-2');
  assert.equal(h.storage.get(h.HANDOFF_KEY).grant.channel_id, '320061');
  assert.equal(JSON.stringify(h.diagnostics).includes('application-oauth-token'), false);
  assert.throws(() => h.validateSteamGrant({...h.storage.get(h.HANDOFF_KEY).grant, channel_id: '320023'}), /CHANNEL_MISMATCH/);
});

function steamBootstrap(channel = '120061') {
  const h = harness(), a = h.setup(); a.provider = 'steam'; a.account = 'account'; a.steam = steamAuth();
  a.grant = {account: 'account', token: 'one-use', sign: 'signature', timestamp: 1700000000, channel_id: channel};
  a.grantExpires = Date.now() + 90000; h.remember(a); h.openGame(a);
  const timers = new Map(), events = {}, received = [], messages = [];
  let entered = 0, nativeRequests = 0;
  const game = {parseConfiged: false, preloaded: false,
    EnterLoginScene(force) {
      if (!this.parseConfiged || !this.preloaded) return;
      if (force) entered++; else nativeRequests++;
    },
    platformLoginBack(result) {received.push(structuredClone(result)); this.EnterLoginScene(true);}
  };
  const original = game.EnterLoginScene, page = {};
  const window = {name: h.window.name, addEventListener: (n,f) => {events[n] = f;}}; window.top = window;
  vm.runInNewContext(source, {window, unsafeWindow: page,
    location: {origin: 'https://web.sanguosha.com', pathname: '/10/pc/index.php'},
    GM_getValue: (k,f) => h.storage.get(k) ?? f, GM_deleteValue: k => h.storage.delete(k),
    setTimeout: f => {timers.set(1,f);return 1;}, clearTimeout: id => timers.delete(id),
    console: {info: (...x) => messages.push(x), error: (...x) => messages.push(x)}});
  return {h, game, original, page, window, timers, events, received, messages,
    counts: () => ({entered, nativeRequests}),
    exportGame() {page.ReqObj = {channel_id: 'overwritten-by-official-bootstrap'}; page.Sgs = game;},
    ready() {game.parseConfiged = game.preloaded = true; game.EnterLoginScene();}};
}
test('Steam game handoff preserves server channel and waits for both official readiness flags', () => {
  for (const channel of ['120061', '320061']) {
    const b = steamBootstrap(channel); b.exportGame();
    assert.equal(b.h.storage.has(b.h.HANDOFF_KEY), false); assert.equal(b.window.name, '');
    assert.equal(String(b.page.channel_id), channel); assert.equal(b.page.ReqObj.channel_id, channel);
    b.game.parseConfiged = true; b.game.EnterLoginScene(); assert.equal(b.received.length, 0);
    b.ready(); assert.equal(b.received.length, 1); assert.equal(b.received[0].data.channel_id, channel);
    assert.deepEqual(b.counts(), {entered: 1, nativeRequests: 0});
    assert.equal(b.game.EnterLoginScene, b.original); assert.equal(b.timers.size, 0);
    b.game.EnterLoginScene(true); assert.equal(b.received.length, 1);
  }
});
test('Steam cancels handoff after account switch, missing export, timeout, and page departure', () => {
  const switched = steamBootstrap(); switched.exportGame(); switched.h.storage.delete(switched.h.SESSION_KEY); switched.ready();
  assert.equal(switched.received.length, 0); assert.equal(switched.game.EnterLoginScene, switched.original);
  assert.match(JSON.stringify(switched.messages), /SAVED_SESSION_EXPIRED/);
  const missing = steamBootstrap(); delete missing.game.platformLoginBack; missing.exportGame();
  assert.equal(missing.timers.size, 0); assert.match(JSON.stringify(missing.messages), /STEAM_GAME_CALLBACK_UNAVAILABLE/);
  const timeout = steamBootstrap(); timeout.timers.get(1)();
  assert.equal(Object.hasOwn(timeout.page, 'Sgs'), false); assert.equal(timeout.timers.size, 0);
  const departed = steamBootstrap(); departed.events.pagehide();
  assert.equal(Object.hasOwn(departed.page, 'Sgs'), false); assert.equal(departed.timers.size, 0);
});

// Synthetic protocol inputs validate boundaries only, not live OPPO acceptance.
function oppoResponse() {
  return {code: 200, userDto: {userId: 'parent-id'}, ticket: 'game-ticket-test',
    gameAccounts: [{id: 'game-id-test', userId: 'parent-id', pkgName: 'com.sgs10th.nearme.gamecenter',
      accountSharingTag: 0, needFaceScan: false, needLoginPop: false}]};
}
test('OPPO SDK signature matches Python reference with escaped query and UTF-16 length', () => {
  const h = harness();
  const url = 'https://isdk.heytapmobi.com/gamesdk/v2/user/login?adId=&pkgName=' +
    'com.sgs10th.nearme.gamecenter&token=' + encodeURIComponent('test+/=%& space😀');
  assert.equal(h.oppoSDKHeaders(url, 1727000000000).sign, '32949ee64ad6d8f03320d72a7ec7e396');
  const base = 'https://isdk.heytapmobi.com/gamesdk/v2/user/login?token=';
  assert.equal(h.oppoSDKHeaders(base + '%2B', 1).sign, h.oppoSDKHeaders(base + '+', 1).sign);
  assert.notEqual(h.oppoSDKHeaders(base + '%20', 1).sign, h.oppoSDKHeaders(base + '+', 1).sign);
});
test('OPPO game credentials bind the sole owned game ID to the same response ticket', () => {
  const h = harness(), result = h.oppoGameCredentials(oppoResponse());
  assert.equal(result.ssoid, 'game-id-test');
  assert.equal(result.token, 'game-ticket-test');
  assert.equal(result.credentialType, 'game-ticket');
  for (const mutate of [
    r => r.code = 412,
    r => r.gameAccounts = [],
    r => r.gameAccounts.push({...r.gameAccounts[0]}),
    r => r.gameAccounts[0].pkgName = 'other.game',
    r => r.gameAccounts[0].userId = 'other-parent',
    r => r.gameAccounts[0].accountSharingTag = 2,
    r => r.gameAccounts[0].needFaceScan = true,
    r => r.gameAccounts[0].needLoginPop = true,
    r => r.gameAccounts[0].accountIsProtected = '1',
    r => delete r.ticket,
    r => delete r.gameAccounts[0].id
  ]) {
    const value = oppoResponse(); mutate(value);
    assert.throws(() => h.oppoGameCredentials(value));
  }
});
test('OPPO game exchange uses GET, keeps account token out of diagnostics and saved state', async () => {
  let requested;
  const h = harness(d => { requested = d; return loadResponse(d, JSON.stringify(oppoResponse())); });
  const a = h.setup(); a.provider = 'oppo'; a.oppoAccount = {accountToken: 'account+token/private'};
  a.oppo = await h.exchangeOppoGameAccount(a);
  assert.equal(requested.method, 'GET');
  assert.equal(requested.data, undefined);
  assert.equal(new URL(requested.url).searchParams.get('token'), a.oppoAccount.accountToken);
  assert.equal(requested.headers.sign, h.oppoSDKHeaders(requested.url, requested.headers.t).sign);
  a.account = 'sgs-test'; h.remember(a);
  const saved = h.remembered();
  assert.equal(saved.oppo.ssoid, 'game-id-test');
  assert.equal(saved.oppo.token, 'game-ticket-test');
  assert.equal(JSON.stringify([...h.storage.values()]).includes(a.oppoAccount.accountToken), false);
  assert.equal(JSON.stringify(h.diagnostics).includes(a.oppoAccount.accountToken), false);
});
test('legacy OPPO session cannot resume with a fixed ID or a token used as UID', async () => {
  const h = harness(), a = h.setup(); a.provider = 'oppo'; a.account = 'sgs-test';
  a.oppo = {token: 'legacy-token', ssoid: 'legacy-id'};
  h.remember(a);
  assert.equal(h.remembered(), null);
  assert.equal(h.storage.has(h.SESSION_KEY), true);
  await assert.rejects(h.exchangeOppoGrant(a), /OPPO_TOKEN_SCHEMA_CHANGED/);
  a.oppo = {credentialType: 'game-ticket', token: 'ticket-without-id'};
  await assert.rejects(h.exchangeOppoGrant(a), /OPPO_TOKEN_SCHEMA_CHANGED/);
});
test('OPPO interrupted game exchange retries account token without requesting another QR', async () => {
  let count = 0;
  const h = harness(d => { count++; assert.match(d.url, /gamesdk\/v2\/user\/login/);
    return loadResponse(d, '{}', {status: 503}); });
  const a = h.setup(); a.provider = 'oppo'; a.oppoAccount = {accountToken: 'account-token-test'};
  await assert.rejects(h.exchange(a), /HTTP_503/);
  await assert.rejects(h.exchange(a), /HTTP_503/);
  assert.equal(count, 2);
  assert.equal(a.oppoAccount.accountToken, 'account-token-test');
});

test('Xiaomi QR and confirmation link must refer to the same official ticket', () => {
  const h = harness();
  const params = 'ticket=owned-ticket&dc=sgp&sid=oauth2.0&ts=123';
  const value = {code: 0, timeout: 300,
    qr: 'https://account.xiaomi.com/pass/qr/login?' + params,
    loginUrl: 'https://sgp.account.xiaomi.com/longPolling/login?' + params,
    lp: 'https://sgp.lp.account.xiaomi.com/lp/s?k=poll-ticket'};
  assert.equal(h.xiaomiChallenge(value).link, value.loginUrl);
  assert.throws(() => h.xiaomiChallenge({...value, loginUrl: value.loginUrl.replace('owned-ticket', 'other-ticket')}), /QR_TICKET_MISMATCH/);
  assert.throws(() => h.xiaomiChallenge({...value, loginUrl: value.loginUrl.replace('sgp.account.xiaomi.com', 'evil.test')}), /ENDPOINT_DENIED/);
  assert.throws(() => h.xiaomiChallenge({...value, qr: value.qr + '&ticket=duplicate'}), /DUPLICATE_FIELD/);
  assert.throws(() => h.xiaomiChallenge({...value, timeout: 301}), /QR_EXPIRY_INVALID/);
});

test('Xiaomi button preparation uses the official image and exposes only its paired link', async () => {
  const params = 'ticket=owned-ticket&dc=sgp&sid=oauth2.0&ts=123';
  const link = 'https://sgp.account.xiaomi.com/longPolling/login?' + params;
  const calls = [];
  const h = harness(d => {
    calls.push(new URL(d.url).pathname);
    assert.equal(d.redirect, 'manual');
    const u = new URL(d.url);
    if (u.pathname === '/oauth2/authorize') {
      assert.equal(d.anonymous, true);
      assert.equal(u.searchParams.get('client_id'), '2882303761517516898');
      assert.equal(u.searchParams.get('state'), 'owned-state');
      return loadResponse(d, '', {status: 302, responseHeaders:
        'Location: /fe/service/login?client_id=2882303761517516898&sid=oauth2.0\r\nSet-Cookie: flow=owned; Path=/; Secure'});
    }
    if (u.pathname === '/fe/service/login') {
      assert.equal(d.cookie, 'flow=owned'); return loadResponse(d, '<html></html>');
    }
    if (u.pathname === '/longPolling/loginUrl') {
      assert.equal(u.searchParams.has('_json'), false);
      return loadResponse(d, '&&&START&&&' + JSON.stringify({code: 0, timeout: 300,
      qr: 'https://account.xiaomi.com/pass/qr/login?' + params, loginUrl: link,
      lp: 'https://sgp.lp.account.xiaomi.com/lp/s?k=owned-poll'}));
    }
    if (u.pathname === '/pass/qr/login') return loadResponse(d, '', {
      response: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).buffer});
    throw new Error('unexpected endpoint');
  });
  const a = h.setup(); a.provider = 'xiaomi'; await h.prepareXiaomi(a);
  assert.equal(h.confirmation().href, link); assert.equal(h.confirmation().hidden, false);
  assert.match(h.image(), /^blob:/); assert.equal(h.storage.size, 0);
  assert.equal(a.cookies.header('https://account.xiaomi.com/'), 'flow=owned'); assert.equal(a.requests.size, 0);
  assert.equal(a.xiaomiChallenge.poll, 'https://sgp.lp.account.xiaomi.com/lp/s?k=owned-poll');
  assert.deepEqual(calls, ['/oauth2/authorize', '/fe/service/login', '/longPolling/loginUrl', '/pass/qr/login']);
  assert.doesNotMatch(JSON.stringify(h.diagnostics), /owned-ticket|owned-poll|flow=owned/);
  h.clearAttempt(); assert.equal(h.confirmation().hidden, true);
});

test('Xiaomi rejects a transport that follows redirects and a replaced attempt', async () => {
  let reply;
  const h = harness(d => { reply = d; return {abort() {}}; }), a = h.setup();
  const pending = h.xiaomiRequest(a, 'https://account.xiaomi.com/oauth2/authorize');
  reply.onload({status: 200, finalUrl: 'https://evil.test/', responseText: ''});
  await assert.rejects(pending, /REDIRECT_TRANSPORT_UNAVAILABLE/);
  const stale = h.xiaomiRequest(a, 'https://account.xiaomi.com/oauth2/authorize');
  h.clearAttempt(); await assert.rejects(stale, /REQUEST_CANCELLED/);
  reply.onload({status: 200, finalUrl: reply.url, responseText: ''});
  assert.equal(h.storage.size, 0);
});

test('Xiaomi native cipher agrees with independent AES ECB and preserves Java long IDs', async () => {
  const h = harness(), nodeCrypto = require('node:crypto');
  for (const text of ['', 'a', '1234567890123456', 'accountType=40001&code=owned-code&appid=2000202', '中文字段']) {
    const cipher = nodeCrypto.createCipheriv('aes-128-ecb', Buffer.from('migc_game_sdkkey'), null);
    const expected = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
    assert.equal(await h.xiaomiCipher(text), expected);
    assert.equal(await h.xiaomiCipher(expected, true), text);
  }
  const v = h.xiaomiJSON('{"uuid":9223372036854775807,"appAccountId":9007199254740993,"nickname":"x\\\"uuid\\\":123"}', 'test');
  assert.equal(v.uuid, '9223372036854775807'); assert.equal(v.appAccountId, '9007199254740993');
  assert.equal(v.nickname, 'x"uuid":123');
  await assert.rejects(h.xiaomiCipher('YWJj', true), /CIPHER_INVALID/);
  assert.throws(() => h.xiaomiGameCredentials({retCode: 8003, appAccountId: '123', session: 'restricted'}), /GAME_ACCOUNT_REJECTED/);
});

test('Xiaomi confirmation polling returns to the initiating state without sending the HTTP callback', async () => {
  const calls = [];
  const h = harness(d => {
    const u = new URL(d.url); calls.push(u.hostname + u.pathname);
    assert.equal(u.protocol, 'https:');
    if (u.pathname === '/lp/s') {
      assert.ok(d.timeout > 150000);
      return loadResponse(d, '&&&START&&&' + JSON.stringify({code: 0, location: 'https://account.xiaomi.com/sts/oauth?ticket=owned'}));
    }
    if (u.pathname === '/sts/oauth') return loadResponse(d, '', {status: 302,
      responseHeaders: 'Location: http://game.xiaomi.com/oauthcallback/mioauth?code=owned-code&state=owned-state'});
    throw new Error('unexpected request');
  });
  const a = h.setup(); a.xiaomiChallenge = {poll: 'https://c1.lp.account.xiaomi.com/lp/s?k=owned'};
  await h.waitForXiaomi(a);
  assert.equal(a.xiaomiCode, 'owned-code'); assert.equal(a.xiaomiChallenge, undefined);
  assert.deepEqual(calls, ['c1.lp.account.xiaomi.com/lp/s', 'account.xiaomi.com/sts/oauth']);
  assert.throws(() => h.xiaomiCallback(a, 'http://game.xiaomi.com/oauthcallback/mioauth?code=x&state=foreign'), /STATE_MISMATCH/);
  assert.throws(() => h.xiaomiCallback(a, 'http://game.xiaomi.com/oauthcallback/mioauth?code=x&code=y&state=owned-state'), /DUPLICATE_FIELD/);
  assert.throws(() => h.xiaomiCallback(a, 'http://evil.test/oauthcallback/mioauth?code=x&state=owned-state'), /TARGET_MISMATCH/);
  assert.equal(h.storage.size, 0);
});

test('Xiaomi authenticated exchange uses its verified game route and keeps only the game session for restore', async () => {
  let calls = 0;
  const {createCipheriv, createDecipheriv} = require('node:crypto');
  const sdkCipher = (text, decrypt = false) => {
    const c = (decrypt ? createDecipheriv : createCipheriv)('aes-128-ecb', Buffer.from('migc_game_sdkkey'), null);
    return Buffer.concat([c.update(Buffer.from(text, decrypt ? 'base64' : 'utf8')), c.final()]).toString(decrypt ? 'utf8' : 'base64');
  };
  const h = harness(d => {
    calls++; const u = new URL(d.url);
    if (u.pathname === '/misdk/v2/oauth') {
      const p = new URLSearchParams(sdkCipher(u.searchParams.get('p'), true));
      assert.equal(p.get('accountType'), '4'); assert.equal(p.get('code'), 'owned-code');
      return loadResponse(d, sdkCipher('{"code":0,"uuid":999999999999999999,"st":"owned-st","needBindMid":false}'));
    }
    if (u.pathname === '/migc-sdk-account/getLoginAppAccount_v2') {
      const p = new URLSearchParams(sdkCipher(new URLSearchParams(d.data).get('p'), true));
      assert.equal(p.get('fuid'), '999999999999999999'); assert.equal(p.get('toke'), 'owned-st');
      assert.equal(p.get('devAppId'), '2882303761520011303');
      return loadResponse(d, sdkCipher('{"retCode":200,"appAccountId":888888888888888888,"session":"owned-game-session"}'));
    }
    if (u.pathname === '/v1/login') {
      const v = JSON.parse(d.data);
      assert.equal(v.platform_id, '10038'); assert.equal(v.package_id, '117');
      assert.equal(v.data.uid, '888888888888888888'); assert.equal(v.data.session, 'owned-game-session');
      return loadResponse(d, JSON.stringify({code: 0, data: {session: 'owned-anysdk-ticket'}}));
    }
    assert.equal(u.pathname, '/xiaomi2/app/login');
    assert.equal(u.searchParams.get('ticket'), 'owned-anysdk-ticket');
    return loadResponse(d, JSON.stringify({code: 0, data: {account: 'owned-account', token: 'owned-token', sign: 'owned-sign', timestamp: 123456}}));
  });
  const a = h.setup(); a.provider = 'xiaomi'; a.xiaomiCode = 'owned-code';
  await h.exchange(a); assert.equal(calls, 4);
  // Restore needs only the Xiaomi game session; OAuth service token, SGS ticket and grant stay in memory.
  assert.doesNotMatch(JSON.stringify([...h.storage.values()]), /owned-st|owned-token|owned-anysdk/);
  const r = h.remembered();
  assert.equal(r.provider, 'xiaomi'); assert.equal(r.account, 'owned-account');
  assert.deepEqual(plain(r.xiaomi), {uid: '888888888888888888', session: 'owned-game-session', username: ''});
  h.setupMiddle(); await h.enterGame(a);
  assert.equal(h.routes.at(-1), 'https://web.sanguosha.com/10/pc/index.php?channel_id=320052');
  const b = gameBootstrap(h.storage, h.window.name, h.tabStorage);
  assert.equal(b.page.ReqObj.channel_id, 320052); assert.equal(b.page.ReqObj.token, 'owned-token');
  assert.equal(h.storage.has(h.HANDOFF_KEY), false);
});

test('Huawei only accepts official account routes and preserves config encoding', () => {
  const h = harness();
  for (const url of ['https://id1.cloud.huawei.com/account/delete', 'http://id1.cloud.huawei.com/qrcode/login.jsp',
    'https://id1.cloud.huawei.com.attacker.test/qrcode/login.jsp', 'https://oauth-login.cloud.huawei.com/oauth2/v3/token#x']) {
    assert.throws(() => h.huaweiURL(url), /ENDPOINT_DENIED/);
  }
  assert.equal(h.huaweiText('https&#x3a;&#x2f;&#x2f;id1.cloud.huawei.com/?a=1&amp;regionCode=CN'), 'https://id1.cloud.huawei.com/?a=1&regionCode=CN');
});
test('Huawei callback binds application, PKCE, state, nonce and scope', () => {
  const h = harness(), a = h.setup(); a.provider = 'huawei'; a.huawei = {nonce: 'request-nonce', params: {code_challenge: 'challenge'}};
  const p = {client_id: '111830943', redirect_uri: 'com.huawei.apps.111830943:/oauth2redirect', state: a.state,
    nonce: 'request-nonce', response_type: 'code', scope: 'openid profile', code_challenge_method: 'S256', code_challenge: 'challenge'};
  const url = v => 'https://oauth-login1.cloud.huawei.com/oauth2/v3/loginCallback?' + new URLSearchParams(v);
  assert.equal(h.huaweiCallbackParams(a, url(p)).state, a.state);
  for (const [key, value] of Object.entries({client_id: 'other', state: 'other', nonce: 'other', scope: 'openid email', code_challenge: 'other'})) {
    assert.throws(() => h.huaweiCallbackParams(a, url({...p, [key]: value})), /BINDING_MISMATCH/);
  }
  assert.throws(() => h.huaweiCallbackParams(a, url(p) + '&state=duplicate'), /DUPLICATE_FIELD/);
  const codeUrl = 'com.huawei.apps.111830943:/oauth2redirect?code=one-time&state=' + a.state;
  assert.equal(h.huaweiCode(a, codeUrl), 'one-time');
  assert.throws(() => h.huaweiCode({...a, state: 'other'}, codeUrl), /STATE_MISMATCH/);
  assert.throws(() => h.huaweiCode(a, codeUrl.replace('111830943', 'other')), /CALLBACK_INVALID/);
});
test('Huawei token verification rejects changed signatures, owners, nonce, expiry and access tokens', async () => {
  const h = harness(), a = h.setup(); a.provider = 'huawei'; a.huawei = {nonce: 'owned-nonce'};
  const keyPair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const jwk = {...await crypto.subtle.exportKey('jwk', keyPair.publicKey), kid: 'test-key', use: 'sig'};
  const b64 = value => Buffer.from(value).toString('base64url');
  const access = 'owned-access';
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(access)));
  const claims = {iss: 'https://accounts.huawei.com', aud: '111830943', azp: '111830943', nonce: 'owned-nonce',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, at_hash: b64(digest.slice(0, 16)), openid: 'owned-openid'};
  const sign = async patch => {
    const input = b64(JSON.stringify({alg: 'RS256', kid: 'test-key'})) + '.' + b64(JSON.stringify({...claims, ...patch}));
    return input + '.' + b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(input)));
  };
  const tokens = {access_token: access, expires_in: 3600, id_token: await sign({})};
  assert.equal((await h.huaweiIdentity(a, tokens, {keys: [jwk]})).uid, 'owned-openid');
  for (const patch of [{aud: 'other'}, {nonce: 'other'}, {exp: 1}, {iss: 'https://attacker.test'}]) {
    await assert.rejects(h.huaweiIdentity(a, {...tokens, id_token: await sign(patch)}, {keys: [jwk]}), /TOKEN_BINDING_MISMATCH/);
  }
  await assert.rejects(h.huaweiIdentity(a, {...tokens, access_token: 'different'}, {keys: [jwk]}), /ACCESS_TOKEN_MISMATCH/);
  const parts = tokens.id_token.split('.'); parts[1] = b64(JSON.stringify({...claims, openid: 'other'}));
  await assert.rejects(h.huaweiIdentity(a, {...tokens, id_token: parts.join('.')}, {keys: [jwk]}), /SIGNATURE_INVALID/);
  await assert.rejects(h.huaweiIdentity(a, tokens, {keys: [{...jwk, kid: 'other'}]}), /SIGNING_KEY_UNAVAILABLE/);
  h.clearAttempt();
});
test('Huawei isolated requests supply official headers, reject redirects and cancel stale responses', async () => {
  let captured, aborted = false;
  const h = harness(d => {captured = d; return {abort() {aborted = true;}};});
  const a = h.setup(); a.provider = 'huawei';
  const p = h.huaweiRequest(a, 'huawei_authorize', 'https://oauth-login-drcn.platform.dbankcloud.com/oauth2/ajax/login', {ticket: 'memory-ticket'}, true);
  assert.equal(captured.headers.fromLoginAuth, 'true'); assert.equal(captured.headers.interfaceVersion, 'v3');
  assert.equal(captured.anonymous, true); assert.equal(captured.redirect, 'manual');
  h.clearAttempt(); await assert.rejects(p, /REQUEST_CANCELLED/); assert.equal(aborted, true);
  assert.ok(!JSON.stringify(h.diagnostics).includes('memory-ticket'));
});
test('Huawei QR polling keeps its own configured endpoint when Honor is available', async () => {
  const calls = [];
  const url = 'https://id1.cloud.huawei.com/DimensionalCode/async';
  const h = harness(d => {calls.push(d.url); return loadResponse(d, '{"resultCode":"103000201"}');});
  const a = h.setup(); a.provider = 'huawei';
  a.huawei = {qr: {qrToken: 'huawei-qr'}, cfg: {asyncURL: url}};
  await assert.rejects(h.authorizeHuawei(a), /QR_EXPIRED/);
  assert.deepEqual(calls, [url]);
  h.clearAttempt();
});
test('Huawei consumed QR confirmation is never exchanged twice', async () => {
  let calls = 0;
  const h = harness(() => {calls++; throw new Error('unexpected request');});
  const a = h.setup(); a.provider = 'huawei'; a.huawei = {qr: {}, confirmationUsed: true};
  await assert.rejects(h.authorizeHuawei(a), /CONFIRMATION_CONSUMED/); assert.equal(calls, 0);
});
test('Huawei game grants are bound to the server-issued subaccount', async () => {
  let calls = 0;
  const h = harness(d => {calls++; return loadResponse(d, JSON.stringify({code: 0, data: {
    account: 'game-account', token: 'grant-token', sign: 'grant-sign', timestamp: 12345, third_account_id: 'wrong-account'}}));});
  const a = h.setup(); a.provider = 'huawei'; a.session = 'owned-session';
  a.huawei = {auth: {expires: Date.now() + 60000}, gameUID: 'owned-subaccount'};
  await assert.rejects(h.exchangeHuawei(a), /ACCOUNT_MISMATCH/);
  assert.equal(a.grant, undefined); assert.equal(h.storage.size, 0); assert.equal(calls, 1); assert.equal(a.renewalFailed, true);
});
test('Huawei handoff is consumed once and rejects forgotten or switched saved accounts', () => {
  for (const condition of ['valid', 'forgotten', 'switched']) {
    const h = harness(), a = h.setup(); a.provider = 'huawei';
    a.huawei = {auth: {uid: 'hw-owner', session: 'hw-access', expires: Date.now() + 3600000}, gameUID: 'hw-game'};
    a.account = 'owned-account'; h.remember(a);
    a.grant = {account: 'owned-account', token: 'owned-token', sign: 'owned-sign', timestamp: 123456};
    a.grantExpires = Date.now() + 90000; h.openGame(a);
    assert.equal(h.routes[0], 'https://web.sanguosha.com/10/pc/index.php?channel_id=320459');
    const nonce = h.window.name, saved = h.storage.get(h.SESSION_KEY);
    if (condition === 'forgotten') h.storage.delete(h.SESSION_KEY);
    if (condition === 'switched') saved.provider = 'vivo';
    const b = gameBootstrap(h.storage, nonce, h.tabStorage);
    if (condition === 'valid') assert.equal(b.page.ReqObj.channel_id, 320459);
    else assert.equal(b.page.ReqObj, undefined);
    assert.equal(h.storage.has(h.HANDOFF_KEY), false);
    assert.equal(gameBootstrap(h.storage, nonce, h.tabStorage).page.ReqObj, undefined);
  }
});
test('Huawei restores its access token until the server expiry, then forgets it', () => {
  const h = harness(), a = h.setup(); a.provider = 'huawei';
  a.huawei = {auth: {uid: 'hw-owner', session: 'hw-access', username: 'nick', expires: Date.now() + 3600000},
    gameUID: 'hw-game', cfg: {localStorageID: 'private-cas'}, nonce: 'private-nonce'};
  a.account = 'game-account'; h.remember(a);
  const r = h.remembered();
  assert.equal(r.huawei.auth.session, 'hw-access'); assert.equal(r.huawei.gameUID, 'hw-game');
  assert.ok(!JSON.stringify(sessionState(h)).includes('private'));
  h.storage.get(h.SESSION_KEY).huawei.auth.expires = Date.now() - 1;
  assert.equal(h.remembered(), null); assert.equal(sessionStateSize(h), 0);
  assert.equal(lifecycleEvents(h).at(-1).reason, 'SAVED_SESSION_EXPIRED');
  h.clearAttempt(); assert.equal(Object.keys(a).length, 0);
});


test('Honor accepts only the observed HTTPS QR, account and game endpoints', () => {
  const h = harness();
  for (const url of ['https://hnoauth-login.cloud.hihonor.com/oauth2/v3/silent_token',
    'https://hnid-drcn.platform.hihonorcloud.com/AccountServer/IDM/loginByQrCode']) assert.equal(h.honorURL(url).href, url);
  assert.match(source, /@connect\s+hnid-drcn\.platform\.hihonorcloud\.com/);
  for (const u of ['http://hnoauth-login.cloud.hihonor.com/oauth2/v3/silent_token',
    'https://hnoauth-login.cloud.hihonor.com.evil.test/oauth2/v3/silent_token',
    'https://hnoauth-login.cloud.hihonor.com/account/delete',
    'https://hnoauth-login.cloud.hihonor.com/oauth2/v3/login',
    'https://hnid-drcn.platform.hihonorcloud.com/AccountServer/IDM/changePassword',
    'https://hnid-drcn.cloud.hihonor.com/DimensionalCode/async#secret']) assert.throws(() => h.honorURL(u), /ENDPOINT_DENIED/);
});
test('Honor account exchange escapes XML and binds a single credential to the scanned owner', () => {
  const h = harness();
  assert.equal(h.honorXML({userAccount: '<&"'}), '<userAccount>&lt;&amp;&quot;</userAccount>');
  const xml = '<?xml version="1.0"?><result resultCode="0"><LoginByQrCodeRsp><userID>owned</userID><serviceToken>service&amp;token</serviceToken></LoginByQrCodeRsp></result>';
  assert.equal(h.honorLoginResult(xml, 'owned'), 'service&token');
  assert.throws(() => h.honorLoginResult(xml, 'foreign'), /ACCOUNT_MISMATCH/);
  assert.throws(() => h.honorLoginResult(xml.replace('<serviceToken>', '<userID>other</userID><serviceToken>'), 'owned'), /FIELD_INVALID/);
  assert.throws(() => h.honorLoginResult(xml.replace('</serviceToken>', '</serviceToken><serviceToken>other</serviceToken>'), 'owned'), /FIELD_INVALID/);
  assert.throws(() => h.honorLoginResult('<!DOCTYPE result>' + xml, 'owned'), /XML_INVALID/);
  assert.throws(() => h.honorLoginResult('<result resultCode="70001201"><CException/></result>', 'owned'), /HONOR_ACCOUNT_70001201/);
});
test('Honor QR preserves official payload bytes and rejects foreign sites or duplicate identifiers', async () => {
  const valid = 'https://hnid-drcn.cloud.hihonor.com/qrcode/login.jsp?loginChannel=7000700&reqClientType=701&qRCode=owned-qr&qrSiteID=1';
  for (const [content, accepted] of [[valid, true], [valid.replace('qrSiteID=1', 'qrSiteID=2'), false],
    [valid.replace('reqClientType=701', 'reqClientType=700'), false], [valid + '&qRCode=other', false],
    [valid.replace('hnid-drcn.cloud.hihonor.com', 'evil.test'), false]]) {
    const h = harness(d => {
      assert.equal(new URL(d.url).pathname, '/DimensionalCode/getqrInfo');
      assert.equal(new URLSearchParams(d.data).get('reqClientType'), '701');
      return loadResponse(d, JSON.stringify({content, qrToken: 'qr-token'}));
    });
    const a = h.setup(); a.provider = 'honor';
    if (accepted) { await h.prepareHonor(a); assert.equal(h.confirmation().href, content); assert.ok(h.image().startsWith('blob:')); }
    else { await assert.rejects(h.prepareHonor(a)); assert.equal(h.image(), undefined); }
    h.clearAttempt();
  }
});
test('Honor never sends an unbound QR result or a rejected account credential to the game service', async () => {
  for (const mode of ['site', 'owner', 'server']) {
    const calls = [];
    const h = harness(d => {
      calls.push(new URL(d.url).pathname);
      if (calls.length === 1) return loadResponse(d, JSON.stringify({resultCode: 0, userID: 'owner', userAccount: 'account',
        code: 'confirmed', accountType: 1, siteID: mode === 'site' ? 2 : 1}));
      assert.equal(calls.at(-1), '/AccountServer/IDM/loginByQrCode');
      return loadResponse(d, mode === 'server' ? '<result resultCode="70001201"><CException/></result>' :
        '<result resultCode="0"><LoginByQrCodeRsp><userID>foreign</userID><serviceToken>private-service-token</serviceToken></LoginByQrCodeRsp></result>');
    });
    const a = h.setup(); a.provider = 'honor'; a.honor = {qr: {qrToken: 'qr-token', code: 'qr-code', siteID: '1'}};
    await assert.rejects(h.authorizeHonor(a), mode === 'site' ? /BINDING_MISMATCH/ : mode === 'owner' ? /ACCOUNT_MISMATCH/ : /HONOR_ACCOUNT_70001201/);
    assert.equal(calls.length, mode === 'site' ? 1 : 2); assert.equal(a.honor.auth, undefined);
    assert.equal(h.storage.size, 0); assert.equal(JSON.stringify(h.diagnostics).includes('private-service-token'), false);
  }
});
test('Honor uses the gamecenter OpenID for SGS binding rather than AnySDK identifier namespaces', async () => {
  const calls = [];
  const h = harness(d => {
    const u = new URL(d.url); calls.push(u.pathname);
    if (u.pathname === '/v1/login') {
      const body = JSON.parse(d.data); assert.equal(body.platform_id, '50027'); assert.equal(body.package_id, '377');
      assert.equal(body.data.uid, 'honor-owner'); assert.equal(body.data.session, 'honor-game-token');
      return loadResponse(d, JSON.stringify({code: 0, data: {thirdparty: 'honor', cId: '50027', uid: 'anysdk-owner', session: 'sgs-ticket'}, ext: {uid: 'channel-owner', isAdult: 0}}));
    }
    assert.equal(u.pathname, '/honor/app/login'); assert.equal(u.searchParams.get('ticket'), 'sgs-ticket');
    return loadResponse(d, JSON.stringify({code: 0, data: {account: 'sgs-owner', token: 'game-token', timestamp: 123, sign: 'game-sign', third_account_id: 'honor-owner'}}));
  });
  const a = h.setup(); a.provider = 'honor'; a.honor = {auth: {uid: 'honor-owner', session: 'honor-game-token', expires: 0}};
  assert.equal((await h.exchangeHonor(a)).account, 'sgs-owner'); assert.equal(calls.length, 2);
  assert.equal((await h.exchangeHonor(a)).account, 'sgs-owner'); assert.equal(calls.length, 2);
  // Only the Honor game token is kept for restore; SGS ticket and grant are one-use.
  const stored = JSON.stringify([...h.storage.values()]);
  for (const v of ['"sgs-ticket"', '"game-token"', '"game-sign"']) assert.equal(stored.includes(v), false);
  assert.deepEqual(plain(h.remembered().honor), {auth: {uid: 'honor-owner', session: 'honor-game-token', expires: 0}});
});
test('Honor refuses a foreign SGS account and expired game credentials', async () => {
  let calls = 0;
  const h = harness(d => {calls++; return loadResponse(d, JSON.stringify({code: 0, data: {account: 'foreign', third_account_id: 'other', token: 'token', timestamp: 123, sign: 'sign'}}));});
  const a = h.setup(); a.provider = 'honor'; a.session = 'owned-ticket';
  a.honor = {auth: {uid: 'owned', session: 'token', expires: Date.now() + 1000}};
  await assert.rejects(h.exchangeHonor(a), /ACCOUNT_MISMATCH/); assert.equal(a.grant, undefined);
  a.honor.auth.expires = 1;
  await assert.rejects(h.exchangeHonor(a), /SAVED_SESSION_EXPIRED/); assert.equal(calls, 1);
});
test('Honor handoff fixes the channel and consumes its grant once', () => {
  const h = harness(), a = h.setup(); a.provider = 'honor';
  a.honor = {auth: {uid: 'honor-owner', session: 'honor-token', expires: 0}}; a.account = 'owned'; h.remember(a);
  a.grant = {account: 'owned', token: 'token', sign: 'sign', timestamp: 123}; a.grantExpires = Date.now() + 90000;
  h.openGame(a); assert.equal(h.routes[0], 'https://web.sanguosha.com/10/pc/index.php?channel_id=320463');
  const nonce = h.window.name, game = gameBootstrap(h.storage, nonce);
  assert.equal(game.page.channel_id, 320463); assert.equal(game.page.ReqObj.account, 'owned');
  assert.equal(gameBootstrap(h.storage, nonce).page.ReqObj, undefined);
});
test('Honor cancellation aborts polling, erases the attempt and ignores late replies', async () => {
  let pendingRequest, aborted = false;
  const h = harness(d => {pendingRequest = d; return {abort() {aborted = true;}};});
  const a = h.setup(); a.provider = 'honor';
  a.honor = {qr: {qrToken: 'owned-qr-token'}, cfg: {asyncURL: 'https://hnid-drcn.cloud.hihonor.com/DimensionalCode/async'}};
  const pending = h.authorizeHonor(a);
  h.clearAttempt();
  await assert.rejects(pending, /REQUEST_CANCELLED/);
  assert.equal(aborted, true); assert.equal(Object.keys(a).length, 0);
  pendingRequest.onload({status: 200, finalUrl: pendingRequest.url, responseHeaders: '', responseText: '{"resultCode":0}'});
  assert.equal(h.currentAttempt(), null); assert.equal(h.storage.size, 0);
  assert.equal(JSON.stringify(h.diagnostics).includes('owned-qr-token'), false);
});
test('Honor displays the active request and retains GM error details without credentials', async () => {
  let pending;
  const h = harness(d => { pending = d; return {abort() {}}; });
  const a = h.setup(); a.provider = 'honor';
  const first = h.honorRequest(a, 'honor_poll', 'https://hnid-drcn.cloud.hihonor.com/DimensionalCode/async', {code: 'secret-body'});
  assert.equal(JSON.parse(h.output()).event, 'request');
  pending.onload({status: 200, finalUrl: pending.url, responseHeaders: '', responseText: '{}'});
  await first;
  const next = h.honorRequest(a, 'honor_auth', 'https://hnoauth-login.cloud.hihonor.com/oauth2/v3/silent_token?ticket=secret-query');
  assert.equal(JSON.parse(h.output()).lastResponse.stage, 'honor_poll');
  pending.onerror({status: 0, readyState: 4, statusText: 'Failed to fetch https://secret.test/?ticket=secret-error',
    responseHeaders: 'Location: honorid://redirect_url?code=secret-code\r\nSet-Cookie: sid=secret-cookie',
    responseText: 'secret-response'});
  const error = await next.catch(e => e); h.errorUI(error);
  const detail = JSON.parse(h.output());
  assert.equal(detail.stage, 'honor_auth'); assert.equal(detail.request.event, 'onerror');
  assert.equal(detail.request.status, 0); assert.equal(detail.request.readyState, 4);
  assert.equal(detail.request.reason, 'Failed to fetch'); assert.equal(detail.request.locationScheme, 'honorid:');
  assert.equal(detail.request.endpoint, 'https://hnoauth-login.cloud.hihonor.com/oauth2/v3/silent_token');
  assert.equal(h.diagnostics.at(-2).status, 0);
  for (const secret of ['secret-body', 'secret-query', 'secret-error', 'secret-code', 'secret-cookie', 'secret-response']) {
    assert.equal(h.output().includes(secret), false);
    assert.equal(JSON.stringify(h.diagnostics).includes(secret), false);
  }
  const snapshot = h.output(); pending.ontimeout({status: 0});
  assert.equal(h.output(), snapshot); assert.equal(sessionStateSize(h), 0);
});
test('Honor preserves HTTP failures and native GM exception reasons in the UI', async () => {
  const h = harness(d => loadResponse(d, 'private-body', {status: 503}));
  const a = h.setup(); a.provider = 'honor';
  const error = await h.honorRequest(a, 'honor_auth', 'https://hnoauth-login.cloud.hihonor.com/oauth2/v3/silent_token').catch(e => e);
  h.errorUI(error);
  assert.equal(JSON.parse(h.output()).request.status, 503);
  assert.equal(h.diagnostics.at(-2).status, 503);
  const thrown = harness(() => {throw new TypeError('Failed to execute: net::ERR_FAILED https://secret.test/?ticket=secret');});
  const b = thrown.setup(); b.provider = 'honor';
  const e = await thrown.honorRequest(b, 'honor_setup', 'https://hnoauth-login.cloud.hihonor.com/oauth2/v3/silent_token').catch(e => e);
  thrown.errorUI(e);
  const d = JSON.parse(thrown.output()).request;
  assert.equal(d.event, 'throw'); assert.equal(d.networkCode, 'net::ERR_FAILED');
  assert.equal(d.reason, 'Failed to execute'); assert.equal(thrown.output().includes('secret'), false);
});
test('Honor expired or consumed QR cannot proceed to authorization', async () => {
  let calls = 0;
  const h = harness(d => {calls++; return loadResponse(d, '{"resultCode":"103000201"}');});
  const a = h.setup(); a.provider = 'honor';
  a.honor = {qr: {qrToken: 'owned'}, cfg: {asyncURL: 'https://hnid-drcn.cloud.hihonor.com/DimensionalCode/async'}};
  await assert.rejects(h.authorizeHonor(a), /QR_EXPIRED/);
  assert.equal(calls, 1); assert.equal(a.honor.auth, undefined);
  a.honor.confirmationUsed = true;
  await assert.rejects(h.authorizeHonor(a), /CONFIRMATION_CONSUMED/);
  assert.equal(calls, 1);
});
test('Honor game handoff refuses forgotten or replaced saved accounts', () => {
  for (const condition of ['forgotten', 'replaced']) {
    const h = harness(), a = h.setup(); a.provider = 'honor';
    a.honor = {auth: {uid: 'honor-owner', session: 'honor-token', expires: 0}}; a.account = 'owned'; h.remember(a);
    a.grant = {account: 'owned', token: 'token', sign: 'sign', timestamp: 123}; a.grantExpires = Date.now() + 90000;
    h.openGame(a);
    const saved = h.storage.get(h.SESSION_KEY);
    if (condition === 'forgotten') h.storage.delete(h.SESSION_KEY); else saved.id = 'other';
    assert.equal(gameBootstrap(h.storage, h.window.name).page.ReqObj, undefined);
    assert.equal(h.storage.has(h.HANDOFF_KEY), false);
  }
});
test('Honor gamecenter rejects changed app, owner, missing real-name capability and service failure', async () => {
  const valid = {errorCode: 0, data: {appId: '104459689', unionToken: {openId: 'same-owner', token: 'game-token'},
    realInfo: {hasRealName: true, isAdult: true}, isChildAccount: false}};
  const cases = [
    [{...valid, errorCode: 7005}, /HONOR_GAME_REJECTED/],
    [{...valid, data: {...valid.data, appId: 'other'}}, /ACCOUNT_MISMATCH/],
    [{...valid, data: {...valid.data, unionToken: {openId: 'other', token: 'token'}}}, /ACCOUNT_MISMATCH/],
    [{...valid, data: {...valid.data, realInfo: undefined}}, /NATIVE_CONFIRMATION_REQUIRED/],
    [{...valid, data: {...valid.data, isChildAccount: true}}, /NATIVE_CONFIRMATION_REQUIRED/]
  ];
  for (const [loginData, expected] of cases) {
    let a;
    const h = harness(d => {
      const path = new URL(d.url).pathname;
      if (path === '/DimensionalCode/async') return loadResponse(d, JSON.stringify({resultCode: 0, userID: 'user', code: 'code', userAccount: 'account', siteID: 1, accountType: 1}));
      if (path === '/AccountServer/IDM/loginByQrCode') {
        assert.match(d.data, /^<\?xml/); assert.match(d.data, /<qrCode>qr-code<\/qrCode>/);
        assert.ok(Math.abs(Number(d.headers.Authorization) - Date.now()) < 10000);
        assert.equal(d.headers.PKG, 'com.hihonor.id');
        return loadResponse(d, '<result resultCode="0"><LoginByQrCodeRsp><userID>user</userID><serviceToken>account-service-token-for-test</serviceToken></LoginByQrCodeRsp></result>');
      }
      if (path === '/oauth2/v3/silent_token') {
        assert.equal(new URL(d.url).searchParams.get('client_id'), '104459689');
        const body = new URLSearchParams(d.data);
        assert.equal(body.get('need_code'), 'true'); assert.equal(body.get('client_id'), '104459689');
        assert.equal(body.get('service_token'), 'account-service-toke' + require('node:crypto').createHash('sha256').update('account-service-token-for-test:com.yoka.sgs.x.honor').digest('hex'));
        return loadResponse(d, JSON.stringify({open_id: 'same-owner', code: 'game-code'}));
      }
      assert.equal(path, '/game/union/sdk/v1/aggregate/login');
      const body = JSON.parse(d.data);
      assert.equal(body.oauthCode, 'game-code'); assert.equal(body.tInfo.pName, 'com.yoka.sgs.x.honor');
      assert.equal(Object.hasOwn(body, 'terminalInfo'), false);
      return loadResponse(d, JSON.stringify({loginData}));
    });
    a = h.setup(); a.provider = 'honor';
    a.honor = {qr: {qrToken: 'qr-token', code: 'qr-code', siteID: '1'}};
    await assert.rejects(h.authorizeHonor(a), expected);
    assert.equal(a.honor.auth, undefined); assert.equal(h.storage.size, 0);
  }
});

test('lifecycle log records save, renewal, overwrite and logout with durations and no credentials', async () => {
  const h = harness(), a = h.setup();
  a.provider = 'qq'; a.account = 'first-account';
  a.wegame = {openid: 'open-1', access_token: 'secret-token-1', uid: 'rail', channel: '0',
    ct: 'secret-refresh-1', atExpires: Date.now() + 7200000};
  h.remember(a);
  a.wegame = {...a.wegame, access_token: 'secret-token-2', atExpires: Date.now() + 9000000};
  h.remember(a);
  h.remember(a); // unchanged expiry is not a renewal
  const b = h.setup(); b.provider = 'wx'; b.account = 'second-account';
  b.wegame = {openid: 'open-2', access_token: 'secret-token-3', uid: 'rail', channel: '0'};
  h.remember(b);
  h.setLogoutTransition(async () => {});
  await h.logoutAccount(b);
  const events = lifecycleEvents(h);
  assert.deepEqual(events.map(e => e.type),
    ['session.saved', 'session.renewed', 'session.overwritten', 'session.saved', 'logout', 'session.forgotten']);
  assert.equal(events[0].account, 'first-account');
  assert.ok(events[1].expiresAt > events[0].expiresAt);
  assert.equal(events[2].account, 'first-account'); assert.equal(events[2].byAccount, 'second-account');
  assert.ok(events[2].ageMs >= 0);
  assert.equal(events[4].account, 'second-account'); assert.equal(events[4].serverRevoked, false);
  assert.equal(events[5].reason, 'LOGOUT');
  assert.equal(h.remembered(), null); assert.equal(events.length, 6, 'forget keeps the history');
  const persisted = JSON.stringify(h.storage.get(LIFECYCLE_KEY));
  for (const secret of ['secret-token', 'secret-refresh', 'open-1', 'open-2']) assert.equal(persisted.includes(secret), false);
});
test('lifecycle log records account and server expiry for channel logins', () => {
  const h = harness(), a = h.setup();
  a.provider = 'huawei'; a.account = 'hw-game-account';
  a.huawei = {auth: {uid: 'hw-owner', session: 'hw-access', expires: Date.now() + 3600000}, gameUID: 'hw-game'};
  h.remember(a);
  const [saved] = lifecycleEvents(h);
  assert.equal(saved.type, 'session.saved'); assert.equal(saved.account, 'hw-game-account');
  assert.equal(saved.expiresAt, a.huawei.auth.expires);
  assert.equal(JSON.stringify(saved).includes('hw-access'), false);
});
test('lifecycle log is bounded and counts dropped events', () => {
  const h = harness();
  h.storage.set(LIFECYCLE_KEY, {v: 1, seq: 500, dropped: 3,
    events: Array.from({length: 500}, (_, i) => ({seq: i + 1, type: 'restore.none'}))});
  h.storage.set(h.SESSION_KEY, {v: 1, provider: 'qq', id: 'a'.repeat(32), created: 1, expires: 2});
  h.remembered();
  const log = h.storage.get(LIFECYCLE_KEY);
  assert.equal(log.events.length, 500); assert.equal(log.dropped, 4);
  assert.equal(log.events.at(-1).seq, 501); assert.equal(log.events[0].seq, 2);
});
test('lifecycle log marks game entry, one-use handoff and reload bounce', () => {
  const h = harness(), a = h.setup();
  a.account = 'game-account';
  a.wegame = {openid: 'id', access_token: 'token', uid: 'rail', channel: '0'};
  h.remember(a);
  a.grant = {account: 'account-id', token: 'token-value', sign: 'signature', timestamp: 123456};
  a.grantExpires = Date.now() + 90000;
  h.openGame(a);
  const nonce = h.window.name;
  gameBootstrap(h.storage, nonce);
  gameBootstrap(h.storage, nonce);
  h.tabStorage.set(h.TAB_KEY, a.savedId);
  gameBootstrap(h.storage, '', h.tabStorage);
  const events = lifecycleEvents(h).slice(1);
  assert.deepEqual(events.map(e => [e.type, e.result ?? null]),
    [['game.enter', null], ['game.handoff', 'ok'], ['game.handoff', 'missing'], ['game.reload_bounced', null]]);
  assert.equal(events[0].account, 'game-account'); assert.equal(events[3].savedId, a.savedId);
  assert.equal(JSON.stringify(events).includes('token-value'), false);
});
test('a reload restores a saved Vivo account through AnySDK without another scan', async () => {
  const paths = [];
  const h = harness(d => {
    const u = new URL(d.url); paths.push(u.pathname);
    if (u.pathname === '/v1/login') {
      const body = JSON.parse(d.data);
      assert.equal(body.platform_id, '10031'); assert.equal(body.data.uid, 'vivo-owner'); assert.equal(body.data.session, 'vivo-session');
      return loadResponse(d, JSON.stringify({code: 0, data: {session: 'fresh-sgs-ticket'}}));
    }
    assert.equal(u.pathname, '/vivo/app/login'); assert.equal(u.searchParams.get('ticket'), 'fresh-sgs-ticket');
    return loadResponse(d, JSON.stringify({code: 0, data: {account: 'game-account', token: 'fresh-token', sign: 's', timestamp: 1}}));
  });
  const a = h.setup(); a.provider = 'vivo';
  a.vivo = {uid: 'vivo-owner', session: 'vivo-session'}; a.account = 'game-account'; h.remember(a);
  h.clearAttempt();
  let shown = null; h.setShowMiddle(async attempt => { shown = attempt; });
  await h.resume();
  assert.deepEqual(paths, ['/v1/login', '/vivo/app/login']);
  assert.equal(shown.grant.token, 'fresh-token'); assert.equal(shown.account, 'game-account');
  assert.deepEqual(lifecycleEvents(h).slice(-2).map(e => e.type), ['restore.begin', 'restore.ok']);
});
test('channel QR poll retries a timed-out long-poll instead of killing the login', async () => {
  let polls = 0;
  const h = harness(d => {
    if (!new URL(d.url).pathname.endsWith('/DimensionalCode/async')) return loadResponse(d, '{"resultCode":"103000202"}');
    polls++;
    if (polls === 1) { queueMicrotask(() => d.ontimeout({})); return {abort() {}}; } // first poll long-poll times out
    if (polls === 2) return loadResponse(d, '{"resultCode":"103000202"}');           // scanned, pending confirm
    return loadResponse(d, '{"resultCode":"103000201"}');                            // QR expired -> deterministic stop
  });
  const a = h.setup(); a.provider = 'honor'; a.honor = {qr: {qrToken: 'tok'}};
  // Before the fix this rejected with REQUEST_TIMEOUT on the first poll; now it survives and keeps polling.
  await assert.rejects(h.authorizeHonor(a), /QR_EXPIRED/);
  assert.ok(polls >= 3, 'the loop should re-poll past the transient timeout');
});

// Prefetch boundary checks, not network performance simulations.
test('entry artwork prefetch preserves scan progress and is reused only by its attempt', async () => {
  let calls = 0;
  const h = harness(d => { calls++; return loadResponse(d, JSON.stringify({code: 0,
    data: {'100client_game': {img: 'https://wwwoss.sanguosha.com/game.png', flag_img: 'https://wwwoss.sanguosha.com/flag.png'}}})); });
  const a = h.setup(); a.stage = 'waiting_confirmation';
  h.prefetchEntryArtwork(a); h.prefetchEntryArtwork(a);
  await a.entryArtwork;
  assert.equal(a.stage, 'waiting_confirmation');
  assert.deepEqual(h.imageURLs, ['https://wwwoss.sanguosha.com/game.png', 'https://wwwoss.sanguosha.com/flag.png']);
  assert.equal((await h.entryArtwork(a)).img, 'https://wwwoss.sanguosha.com/game.png');
  assert.equal(calls, 1);
  const next = h.setup();
  await assert.rejects(h.entryArtwork(a), /ATTEMPT_EXPIRED/);
  await h.entryArtwork(next); assert.equal(calls, 2);
});
test('failed speculative artwork request is consumed and retried on the required path', async () => {
  let calls = 0;
  const h = harness(d => loadResponse(d, ++calls === 1 ? '{}' : JSON.stringify({code: 0,
    data: {'100client_game': {img: 'https://wwwoss.sanguosha.com/game.png', flag_img: 'https://wwwoss.sanguosha.com/flag.png'}}})));
  const a = h.setup(); h.prefetchEntryArtwork(a); await a.entryArtwork;
  assert.equal((await h.entryArtwork(a)).flag_img, 'https://wwwoss.sanguosha.com/flag.png');
  assert.equal(calls, 2);
});
test('cancelled speculative artwork cannot advance an abandoned attempt', async () => {
  let aborted = 0;
  const h = harness(() => ({abort() {aborted++;}}));
  const a = h.setup(); h.prefetchEntryArtwork(a); h.clearAttempt();
  await a.entryArtwork;
  assert.equal(aborted, 1);
  await assert.rejects(h.entryArtwork(a), /ATTEMPT_EXPIRED/);
});
test('a cancelled attempt does not report its leftover failure as the current error', async () => {
  let captured = null;
  const h = harness(details => { captured = details; return {abort() {}}; });
  h.setup(); h.setAttempt(null); // ui exists, no attempt yet
  const pending = h.start('qq');
  while (!captured) await new Promise(resolve => setTimeout(resolve, 1));
  h.clearAttempt(); // what the shell's cancel / a provider switch does
  await pending;
  assert.doesNotMatch(String(h.output() || ''), /REQUEST_CANCELLED|ATTEMPT_EXPIRED/);
  assert.equal(h.currentAttempt(), null);
});

// Authorization callbacks are consumed in memory, bound to one outstanding state.
test('Xiaomi web callback is single-use, expires, and never enters GM storage', async () => {
  const h = harness(), a = h.setup();
  const u = new URL(await h.webURL('xiaomi')), state = u.searchParams.get('state');
  const web = { href: 'http://game.xiaomi.com/oauthcallback/mioauth?code=auth-code&state=' + state };
  h.applyWebResult(a, 'xiaomi', web);
  assert.equal(a.xiaomiCode, 'auth-code');
  assert.throws(() => h.applyWebResult(a, 'xiaomi', web), /WEB_RESULT_INVALID/);
  assert.doesNotMatch(JSON.stringify([...h.storage]), /auth-code|oauthcallback/);
  await h.webURL('xiaomi'); h.expireWebState();
  assert.throws(() => h.takeWebState('xiaomi'), /WEB_RESULT_INVALID/);
});
test('web state is replaced across providers and rejects an unrelated callback', async () => {
  const h = harness(), a = h.setup();
  await h.webURL('xiaomi'); await h.webURL('steam');
  assert.equal(h.webStates.has('xiaomi'), false);
  assert.throws(() => h.applyWebResult(a, 'steam', {href: 'https://10th-ly-login.sanguosha.com/steam/oauth/callback.html#state=foreign&access_token=secret'}), /STEAM_STATE_MISMATCH/);
});
