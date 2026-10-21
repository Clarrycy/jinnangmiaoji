const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { createGmRequestHost, hostAllowed, parseSetCookie } = require('../core/gm-request-host');

// 白名单：@connect 后缀匹配，官方源常驻。
assert.equal(hostAllowed('openmobile.qq.com', ['qq.com']), true);
assert.equal(hostAllowed('qq.com', ['qq.com']), true);
assert.equal(hostAllowed('evilqq.com', ['qq.com']), false);
assert.equal(hostAllowed('web.sanguosha.com', []), true);
assert.equal(hostAllowed('example.com', []), false);

const cookie = parseSetCookie('pt_key=abc; Domain=.qq.com; Path=/; Secure; HttpOnly; Max-Age=60', new URL('https://ssl.ptlogin2.qq.com/x'));
assert.equal(cookie.name, 'pt_key');
assert.equal(cookie.value, 'abc');
assert.equal(cookie.domain, '.qq.com');
assert.equal(cookie.secure, true);
assert.equal(cookie.httpOnly, true);
assert(cookie.expirationDate > Date.now() / 1000);

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-gm-host-'));
  const key = path.join(directory, 'key.pem');
  const cert = path.join(directory, 'cert.pem');
  const openssl = childProcess.spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  if (openssl.status !== 0) {
    console.log('gm request host tests skipped: openssl unavailable');
    return;
  }
  const seen = [];
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      seen.push({ method: request.method, url: request.url, cookie: request.headers.cookie || '', body, ua: request.headers['user-agent'] || '' });
      if (request.url === '/redirect') {
        response.writeHead(302, { Location: '/landing', 'Set-Cookie': ['hop=1; Path=/'] });
        response.end();
      } else if (request.url === '/landing') {
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Set-Cookie': ['a=1; Path=/', 'b=2; Path=/; HttpOnly'] });
        response.end('landed');
      } else if (request.url === '/gzip') {
        response.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' });
        response.end(zlib.gzipSync('{"ok":true}'));
      } else if (request.url === '/png') {
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]));
      } else if (request.url === '/slow') {
        setTimeout(() => { response.writeHead(200); response.end('late'); }, 3000);
      } else {
        response.writeHead(404); response.end('nope');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `https://localhost:${server.address().port}`;
  const host = createGmRequestHost({ tlsOptions: { rejectUnauthorized: false } });
  const sessionCookies = [];
  const session = { cookies: {
    async get() { return [{ name: 'sess', value: 'xyz' }]; },
    async set(value) { sessionCookies.push(value); },
  } };
  const context = { allowHosts: ['localhost'], session };

  // 跟随重定向 + 浏览器会话 cookie（非 anonymous、无显式 cookie）
  const followed = await host.request('r1', { method: 'POST', url: `${base}/redirect`, data: 'x=1' }, context);
  assert.equal(followed.kind, 'load');
  assert.equal(followed.status, 200);
  assert.equal(followed.finalUrl, `${base}/landing`);
  assert.equal(followed.responseText, 'landed');
  assert.match(followed.responseHeaders, /set-cookie: a=1/i);
  assert.match(followed.responseHeaders, /set-cookie: b=2/i);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[1].method, 'GET', '302 after POST becomes GET');
  assert.equal(seen[0].cookie, 'sess=xyz', 'session cookies are sent when not anonymous');
  assert.deepEqual(sessionCookies.map(item => item.name).sort(), ['a', 'b', 'hop'], 'set-cookie persists into the session');

  // redirect:'manual' + anonymous + 显式 cookie：不跟随、不用会话 cookie
  seen.length = 0;
  const manual = await host.request('r2', { url: `${base}/redirect`, redirect: 'manual', anonymous: true, cookie: 'mine=1' }, context);
  assert.equal(manual.status, 302);
  assert.equal(manual.finalUrl, `${base}/redirect`);
  assert.match(manual.responseHeaders, /location: \/landing/i);
  assert.equal(seen[0].cookie, 'mine=1');

  // gzip 解码、二进制、白名单、超时、中止
  const gz = await host.request('r3', { url: `${base}/gzip` }, context);
  assert.equal(gz.responseText, '{"ok":true}');
  const png = await host.request('r4', { url: `${base}/png`, responseType: 'arraybuffer' }, context);
  assert(Buffer.isBuffer(png.response) && png.response[0] === 137 && png.response.length === 11);
  assert.equal(png.responseText, undefined);
  const denied = await host.request('r5', { url: 'https://evil.example/x' }, context);
  assert.equal(denied.kind, 'error');
  assert.match(denied.error, /白名单/);
  const insecure = await host.request('r6', { url: `http://localhost:${server.address().port}/landing` }, context);
  assert.equal(insecure.kind, 'error');
  const timeout = await host.request('r7', { url: `${base}/slow`, timeout: 1000 }, context);
  assert.equal(timeout.kind, 'timeout');
  const aborting = host.request('r8', { url: `${base}/slow`, timeout: 5000 }, context);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(host.abort('r8'), true);
  assert.equal((await aborting).kind, 'abort');
  assert.equal(host.activeCount(), 0);
  server.close();
  console.log('gm request host tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

// PR #1（heqinjian）：头值含控制字节时直接报出码点，不再伪装成网络失败
{
  const { createGmRequestHost } = require('../core/gm-request-host');
  const host = createGmRequestHost({ log: () => {} });
  host.request('bad-header', { url: 'https://web.sanguosha.com/x', headers: { 'x-euler-const': 'abc\u0014def' } }, { allowHosts: [], session: null }).then(r => {
    assert.equal(r.kind, 'error'); assert(/U\+14/.test(r.error), 'bad header reported with code point: ' + r.error);
    console.log('gm request host: bad header value reported');
  });
}
