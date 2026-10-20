'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { createGmRequestHost } = require('../core/gm-request-host');

function cookieKey(cookie) {
  return [cookie.domain || '', cookie.path || '/', cookie.name].join('\n');
}

function createSession(initial = []) {
  const cookies = new Map(initial.map(cookie => [cookieKey(cookie), { ...cookie }]));
  const calls = { get: 0, set: [], cleared: 0 };
  let userAgent = 'TestUA/1.0';
  return {
    calls,
    cookies: {
      async get() { calls.get += 1; return [...cookies.values()].map(cookie => ({ ...cookie })); },
      async set(cookie) {
        calls.set.push({ ...cookie });
        const domain = String(cookie.domain || new URL(cookie.url).hostname).replace(/^\./, '');
        const value = { ...cookie, domain, path: cookie.path || '/', hostOnly: cookie.hostOnly ?? !cookie.domain };
        delete value.url;
        cookies.set(cookieKey(value), value);
      },
    },
    clearStorageData() { calls.cleared += 1; cookies.clear(); return Promise.resolve(); },
    getUserAgent() { return userAgent; },
    setUserAgent(value) { userAgent = value; },
  };
}

function createNet(handler) {
  const seen = [];
  return {
    seen,
    request(options) {
      const request = new EventEmitter();
      const record = { options, headers: {} };
      seen.push(record);
      request.setHeader = (name, value) => { record.headers[name] = value; };
      request.write = () => {};
      request.abort = () => { record.aborted = true; };
      request.end = () => setImmediate(() => {
        Promise.resolve(handler(request, record)).catch(error => request.emit('error', error));
      });
      return request;
    },
  };
}

function respond(request, status, headers, body) {
  const response = new EventEmitter();
  response.statusCode = status;
  response.statusMessage = status === 200 ? 'OK' : '';
  response.headers = headers;
  response.rawHeaders = Object.entries(headers).flatMap(([name, value]) => [name, String(value)]);
  request.emit('response', response);
  setImmediate(() => {
    response.emit('data', Buffer.from(body));
    response.emit('end');
  });
}

(async () => {
  const source = createSession();
  const jar = createSession();
  const net = createNet(async (request, record) => {
    assert.equal(record.options.useSessionCookies, true);
    assert.equal(record.options.session, jar);
    assert.equal(record.headers.Cookie, undefined, 'explicit cookies must enter the session jar, not overwrite it');
    await jar.cookies.set({ url: 'https://login.example.test/', name: 'hop', value: '1' });
    request.emit('redirect', 302, 'GET', 'https://login.example.test/landing', { location: '/landing' });
  });
  const host = createGmRequestHost({ net, isolatedSession: () => jar });
  const result = await host.request('manual', {
    url: 'https://login.example.test/redirect', redirect: 'manual', anonymous: true,
    cookie: 'first=one; second=two', timeout: 2000,
  }, { allowHosts: ['example.test'], session: source });

  assert.equal(result.status, 302);
  assert.match(result.responseHeaders, /^set-cookie: hop=1; Path=\/$/im,
    'the cookie stored by Electron for a hidden 302 must be exposed to GM callers');
  assert.deepEqual(jar.calls.set.map(cookie => cookie.name).sort(), ['first', 'hop', 'second']);
  assert.equal(source.calls.set.length, 0, 'a temporary jar must not write into the game tab session');
  assert.equal(jar.calls.cleared, 1, 'the temporary jar must be cleared after the request');
  assert.equal(jar.getUserAgent(), 'TestUA/1.0');
  assert.equal(host.activeCount(), 0);

  const sourceWithCookie = createSession([{ name: 'browser', value: 'yes', domain: 'login.example.test', path: '/' }]);
  const followJar = createSession();
  const followNet = createNet(async (request, record) => {
    assert.equal(record.options.session, followJar);
    assert.equal(record.headers.Cookie, undefined, 'Chromium session cookies must not be overridden by a manual header');
    if (new URL(record.options.url).pathname === '/auto') {
      await followJar.cookies.set({ url: 'https://login.example.test/', name: 'auto', value: '1' });
      request.emit('redirect', 302, 'GET', 'https://login.example.test/landing', { location: '/landing' });
    } else {
      await followJar.cookies.set({ url: 'https://login.example.test/', name: 'landing', value: '2' });
      respond(request, 200, { 'content-type': 'text/plain' }, 'landed');
    }
  });
  const followHost = createGmRequestHost({ net: followNet, isolatedSession: () => followJar });
  const followed = await followHost.request('follow', { url: 'https://login.example.test/auto', timeout: 2000 },
    { allowHosts: ['example.test'], session: sourceWithCookie });

  assert.equal(followed.status, 200);
  assert.equal(followed.responseText, 'landed');
  assert.match(followed.responseHeaders, /^set-cookie: auto=1;/im);
  assert.match(followed.responseHeaders, /^set-cookie: landing=2;/im);
  assert.deepEqual(followJar.calls.set.map(cookie => cookie.name).sort(), ['auto', 'browser', 'landing']);
  assert.equal(sourceWithCookie.calls.set.length, 0);
  assert.equal(followJar.calls.cleared, 1);
  assert.equal(followHost.activeCount(), 0);
  console.log('gm request cookie jar tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
