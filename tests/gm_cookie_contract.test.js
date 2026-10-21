const assert = require('node:assert/strict');
const test = require('node:test');
const { cookieDetails, changed, seed, createPool } = require('../core/gm-cookie-jar');
const { parseSetCookie } = require('../core/gm-request-host');

test('cookie copy supplies a URL and retains host-only, domain and SameSite scope', () => {
  const c = { domain: 'login.example.test', name: 'sid', value: 'v', path: '/account', hostOnly: true, secure: true, sameSite: 'no_restriction', expirationDate: 10000 };
  assert.deepEqual(cookieDetails(c), {url: 'https://login.example.test/account', name: 'sid', value: 'v', path: '/account', secure: true, httpOnly: false, sameSite: 'no_restriction', expirationDate: 10000});
  assert.equal(cookieDetails({...c, domain: '.example.test', hostOnly: false}).domain, '.example.test');
  const parsed = parseSetCookie('sid=v; Max-Age=0; Expires=Wed, 21 Oct 2037 07:28:00 GMT; SameSite=None; Secure', new URL('https://login.example.test/account/login'));
  assert.equal(parsed.path, '/account'); assert.equal(parsed.sameSite, 'no_restriction'); assert(parsed.expirationDate <= Date.now() / 1000);
});
test('cookie updates include metadata and deletions, without rewriting unchanged account cookies', async () => {
  const c = {domain: 'example.test', name: 'sid', value: 'v', path: '/', hostOnly: true, expirationDate: 10000};
  const before = new Map([['example.test\n/\nsid', c], ['example.test\n/\nold', {...c, name: 'old'}]]), sets = [], removes = [];
  const source = {cookies: {set: async v => sets.push(v), remove: async (...v) => removes.push(v)}};
  const response = {rawHeaders: []};
  await changed(before, {cookies: {get: async () => [{...c, expirationDate: 20000, sameSite: 'no_restriction'}]}}, source, response);
  assert.equal(sets.length, 1); assert.equal(sets[0].expirationDate, 20000);
  assert.deepEqual(removes, [['http://example.test/', 'old']]);
  assert.match(response.rawHeaders.join('\n'), /SameSite=None/); assert.match(response.rawHeaders.join('\n'), /old=; Path=\/; Max-Age=0/);
});
test('explicit headers never import account cookies; only allowed hosts are seeded', async () => {
  const sets = [], target = {cookies: {set: async v => sets.push(v)}};
  const source = {cookies: {get: async () => [{domain:'allowed.test', name:'a', value:'1'}, {domain:'foreign.test', name:'b', value:'2'}]}};
  await seed(source, target, new URL('https://allowed.test/x'), null, h => h === 'allowed.test');
  assert.deepEqual(sets.map(c => c.name), ['a']); sets.length = 0;
  await seed(source, target, new URL('https://allowed.test/x'), 'explicit=1', () => true);
  assert.deepEqual(sets.map(c => c.name), ['explicit']); assert.equal(sets[0].url, 'https://allowed.test/');
});
test('pool reuses a cleared session, bounds concurrency, and aborts queued requests', async () => {
  let created = 0, cleared = 0;
  const pool = createPool(() => ({clearStorageData: async () => {cleared++;}, id: ++created}), 1);
  const a = await pool.acquire(new AbortController().signal), control = new AbortController();
  const waiting = pool.acquire(control.signal); control.abort(new Error('cancelled'));
  await assert.rejects(waiting, /cancelled/); await a.release();
  const b = await pool.acquire(new AbortController().signal);
  assert.equal(a.session, b.session); assert.equal(created, 1); assert.equal(cleared, 1); await b.release();
});
test('a session that failed to clear cannot be lent to another account', async () => {
  const pool = createPool(() => ({clearStorageData: async () => {throw new Error('clear failed');}}), 1);
  const lease = await pool.acquire(new AbortController().signal);
  await assert.rejects(lease.release(), /clear failed/);
  await assert.rejects(pool.acquire(new AbortController().signal), /COOKIE_SESSION_UNAVAILABLE/);
});
