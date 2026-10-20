const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createComponentUpdateHost, validateManifest } = require('../core/component-update-host');
const { sha256 } = require('../core/node-update-host');

function script(version, body) {
  return `// ==UserScript==\n// @name test\n// @version ${version}\n// @connect example.com\n// ==/UserScript==\n${body}\n`;
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-component-host-'));
  const seedA = path.join(directory, 'a.user.js');
  const seedB = path.join(directory, 'b.user.js');
  fs.writeFileSync(seedA, script('1.0.0', 'window.a = 1;'));
  fs.writeFileSync(seedB, script('2.0.0', 'window.b = 1;'));
  const newer = script('1.1.0', 'window.a = 2;');
  const newerBytes = Buffer.from(newer, 'utf8');
  const logs = [];
  const fetched = [];
  const manifest = {
    schema: 1,
    publishedAt: '2026-10-14T00:00:00Z',
    shell: { version: '1.5.0', minimum: '1.4.0', downloadUrl: 'https://sh-sgs.net/micro/latest.zip' },
    components: {
      a: { version: '1.1.0', url: `https://sh-sgs.net/micro/a-${sha256(newerBytes)}.js`, sha256: sha256(newerBytes), bytes: newerBytes.length },
      b: { version: '1.5.0', url: 'https://sh-sgs.net/micro/b-old.js', sha256: 'f'.repeat(64), bytes: 10 },
    },
  };
  const build = () => createComponentUpdateHost({
    cacheRoot: path.join(directory, 'cache'),
    shellVersion: '1.4.0',
    manifestUrl: 'https://sh-sgs.net/script/jinnangdai.micro.json',
    log: (...args) => logs.push(args.join(' ')),
    components: [
      { id: 'a', seedPath: seedA, seedVersion: '1.0.0' },
      { id: 'b', seedPath: seedB, seedVersion: '2.0.0' },
    ],
    adapter: {
      async fetchManifest() { return manifest; },
      async fetchComponent(entry, onProgress) { fetched.push(entry.url); onProgress?.(10); return newerBytes; },
    },
  });

  const host = await build();
  const records = host.getStartupRecords();
  assert.equal(records.a.version, '1.0.0');
  assert.equal(records.a.source, 'seed');
  assert.match(records.a.code, /window\.a = 1/);
  const states = [];
  host.subscribe(state => states.push(state));
  const first = host.startBackgroundUpdate();
  assert.strictEqual(host.startBackgroundUpdate(), first, 'in-flight check is shared');
  const state = await first;
  assert.equal(fetched.length, 1, 'only the newer component downloads');
  assert.equal(state.components.a.phase, 'ready');
  assert.equal(state.components.a.latest, '1.1.0');
  assert.equal(state.components.b.phase, 'current', 'older manifest version never replaces the seed');
  assert.equal(state.shell.outdated, true);
  assert.equal(state.shell.required, false);
  assert.equal(state.shell.downloadUrl, 'https://sh-sgs.net/micro/latest.zip');
  assert(states.some(item => item.components.a.phase === 'downloading'));
  assert.match(host.getStartupRecords().a.code, /window\.a = 2/, 'next page load sees the cached component');
  assert.equal(host.getStartupRecords().a.source, 'cache');

  // 重启：缓存版本高于种子时选缓存，并复核 SHA-256。
  const restarted = await build();
  assert.equal(restarted.getStartupRecords().a.version, '1.1.0');
  const cached = path.join(directory, 'cache', 'a', `runtime-${sha256(newerBytes)}.js`);
  fs.writeFileSync(cached, `${newer}tampered`);
  const repaired = await build();
  assert.equal(repaired.getStartupRecords().a.version, '1.0.0', 'tampered cache falls back to the seed');

  // 哈希不符的下载不落盘。
  manifest.components.a = { ...manifest.components.a, version: '1.2.0', sha256: 'a'.repeat(64) };
  const rejecting = await build();
  const rejected = await rejecting.checkManifest();
  assert.equal(rejected.components.a.phase, 'error');
  assert.match(rejected.components.a.error.message, /SHA-256/);
  assert.equal(rejecting.getStartupRecords().a.version, '1.0.0');

  // 清单失败只记录，不影响启动记录。
  const offline = await createComponentUpdateHost({
    cacheRoot: path.join(directory, 'cache-offline'), shellVersion: '1.4.0',
    components: [{ id: 'a', seedPath: seedA, seedVersion: '1.0.0' }],
    adapter: { async fetchManifest() { throw new Error('HTTP 404'); } },
  });
  const offlineState = await offline.checkManifest();
  assert.equal(offlineState.checkError.message, 'HTTP 404');
  assert.equal(offlineState.components.a.phase, 'idle');

  assert.throws(() => validateManifest({ schema: 1, publishedAt: 'x' }, ['a']), /publishedAt/);
  assert.throws(() => validateManifest({ schema: 1, publishedAt: '2026-10-14T00:00:00Z', components: { a: { version: '1.0.0', url: 'http://x/y.js', sha256: 'a'.repeat(64), bytes: 1 } } }, ['a']), /HTTPS/);
  assert.throws(() => validateManifest({ schema: 1, publishedAt: '2026-10-14T00:00:00Z', shell: { version: 'latest' } }, []), /格式无效/);
  const partial = validateManifest({ schema: 1, publishedAt: '2026-10-14T00:00:00Z', components: { zzz: { version: '1.0.0' } } }, ['a']);
  assert.deepEqual(Object.keys(partial.components), [], 'unknown components are ignored');
  console.log('micro component host tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
