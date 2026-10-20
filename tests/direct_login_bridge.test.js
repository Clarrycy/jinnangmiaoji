'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { installDirectEventBridge } = require('../core/direct-login-bridge');

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

const sent = [], reports = [], storage = createStorage(), host = {};
assert.equal(installDirectEventBridge({window: host, storage, send: (channel, payload) => sent.push({channel, payload}),
  report: (level, message) => reports.push({level, message})}), true);
assert.equal(typeof host.__SGS_DIRECT_EVENT__, 'function');
assert.equal(installDirectEventBridge({window: host, storage, send() {}}), false, 'existing hook must not be replaced');

assert.equal(host.__SGS_DIRECT_EVENT__({type: 'ready', provider: 'xiaomi', identityAccount: '1234567890'}),
  '1234567890');
assert.equal(storage.getItem('sgs-direct-profile-v1'), '1234567890');
assert.deepEqual(sent.at(-1), {channel: 'jnd-direct-login-event',
  payload: {type: 'ready', provider: 'xiaomi', profileId: '1234567890'}});

const hashed = host.__SGS_DIRECT_EVENT__({type: 'ready', provider: 'vivo', account: '账号 一号'});
assert.match(hashed, /^vivo:[a-f0-9]{8}$/);
assert.equal(host.__SGS_DIRECT_EVENT__({type: 'ready', provider: 'vivo', account: '账号 一号'}), hashed,
  'fallback identities must be deterministic');
assert.equal(storage.getItem('sgs-direct-profile-v1'), hashed);

host.__SGS_DIRECT_EVENT__({type: 'navigate', provider: 'vivo', profileId: hashed});
assert.equal(storage.getItem('sgs-direct-profile-v1'), hashed);
host.__SGS_DIRECT_EVENT__({type: 'navigate', provider: 'vivo'});
assert.equal(storage.getItem('sgs-direct-profile-v1'), null);

assert.equal(host.__SGS_DIRECT_EVENT__({type: 'game-auth', provider: 'xiaomi', success: false,
  code: 'PLATFORM_GAME_CALLBACK_UNAVAILABLE'}), '');
assert.deepEqual(sent.at(-1).payload, {type: 'game-auth', provider: 'xiaomi', success: false,
  code: 'PLATFORM_GAME_CALLBACK_UNAVAILABLE'});
assert.equal(reports.at(-1).level, 'warn');
assert.match(reports.at(-1).message, /PLATFORM_GAME_CALLBACK_UNAVAILABLE/);

host.__SGS_DIRECT_EVENT__({type: 'error', provider: 'oppo', code: 'OPPO_TE_UNAVAILABLE', stage: 'oppo_token',
  responseText: 'must not leave the page'});
assert.deepEqual(sent.at(-1).payload, {type: 'error', provider: 'oppo', code: 'OPPO_TE_UNAVAILABLE',
  stage: 'oppo_token'});
assert.equal(host.__SGS_DIRECT_EVENT__({type: 'unknown', provider: 'xiaomi'}), '');
assert.equal(host.__SGS_DIRECT_EVENT__(null), '');

const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'injector-preload.ts'), 'utf8');
assert.match(preload, /installHostFacts\(\);\r?\n\s+installDirectEventHost\(\);/,
  'the direct event hook must be installed before component injection');
console.log('direct login bridge tests passed');
