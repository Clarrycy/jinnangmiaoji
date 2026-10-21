'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createSteamDirectConnector, isSteamDirectUrl } = require('../core/steam-direct-agent');

test('only the audited Steam authentication endpoints may use direct TLS', () => {
  for (const url of [
    'https://api.steampowered.com/IAuthenticationService/BeginAuthSessionViaQR/v1/',
    'https://api.steampowered.com/IAuthenticationService/PollAuthSessionStatus/v1/',
    'https://steamcommunity.com/oauth/login?client_id=1',
    'https://steamcommunity.com/oauth/loginform/',
    'https://steamcommunity.com/oauth/auth',
    'https://steamcommunity.com/oauth/auth_response',
    'https://steamcommunity.com/login/settoken',
    'https://login.steampowered.com/jwt/finalizelogin'
  ]) assert.equal(isSteamDirectUrl(new URL(url)), true, url);
  for (const url of [
    'http://steamcommunity.com/oauth/login', 'https://steamcommunity.com:8443/oauth/login',
    'https://steamcommunity.com.evil.test/oauth/login', 'https://steamcommunity.com/profiles/123',
    'https://user:pass@steamcommunity.com/oauth/login', 'https://steamcommunity.com./oauth/login',
    'https://api.steampowered.com/IAuthenticationService/UpdateAuthSessionWithSteamGuardCode/v1/',
    'https://10th-ly-login.sanguosha.com/steam/oauth/login'
  ]) assert.equal(isSteamDirectUrl(new URL(url)), false, url);
});

test('proxy, PAC alternatives and unknown policy stay on the existing transport', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-steam-policy-'));
  try {
    for (const route of ['PROXY localhost:8888', 'SOCKS5 localhost:1080', 'PROXY localhost:8888; DIRECT', 'DIRECT; PROXY localhost:8888', '']) {
      const connector = createSteamDirectConnector({ cacheFile: path.join(dir, 'addresses.json'), log() {}, resolveProxy: async () => route });
      assert.equal(await connector.prepare(new URL('https://steamcommunity.com/oauth/login'), new AbortController().signal), null);
    }
    const unavailable = createSteamDirectConnector({ cacheFile: path.join(dir, 'addresses.json'), log() {}, resolveProxy: async () => { throw new Error('unavailable'); } });
    assert.equal(await unavailable.prepare(new URL('https://steamcommunity.com/oauth/login'), new AbortController().signal), null);
    assert.equal(fs.existsSync(path.join(dir, 'addresses.json')), false, 'policy selection writes no credentials or cache');
    const control = new AbortController(), reason = Object.assign(new Error('cancelled'), { kind: 'abort' });
    control.abort(reason);
    await assert.rejects(unavailable.prepare(new URL('https://steamcommunity.com/oauth/login'), control.signal), error => error === reason);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('source retains TLS identity, bounded retries and deferred mandatory Community setup', () => {
  const agent = fs.readFileSync(path.join(__dirname, '../src/core/steam-direct-agent.ts'), 'utf8');
  assert(agent.includes('rejectUnauthorized: true'));
  assert(agent.includes('tls.checkServerIdentity(hostname, certificate)'));
  assert(agent.includes('seen.size >= 8'));
  const source = fs.readFileSync(path.join(__dirname, '../jinnangdai/payload/unified-login.user.js'), 'utf8');
  const prepare = source.slice(source.indexOf('async function prepareSteam(a)'), source.indexOf('async function waitForSteam(a)'));
  assert(!prepare.includes('steam_preflight'));
  assert(prepare.includes('attempt <= 4'));
  assert(source.includes('++transientFailures <= 3'));
  assert(source.includes("sessionid: a.steamSessionID || ''"));
  assert(source.includes("if (!w.finalized && !w.sessionid) {\n      await prepareSteamSession(a);"));
});
