const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ENTRIES, PROVIDERS, entryById, providerById, providerByLabel, matchesAnyEntry } = require('../core/entries');
const { createCredentialStore } = require('../core/credential-store');

assert.deepEqual(ENTRIES.map(entry => entry.id), ['guanfu', '4399', 'qqgame', '7k7k', 'baidu', '360']);
const qrLabels = ['WeGame - QQ', 'WeGame - 微信', 'bilibili 扫码登录', 'Steam 扫码登录', 'OPPO 扫码登录', '小米扫码登录', 'VIVO 扫码登录', '华为扫码登录', '荣耀扫码登录'];
assert.deepEqual(PROVIDERS.filter(provider => provider.mode === 'qr').map(provider => provider.label), qrLabels);
assert.deepEqual(PROVIDERS.filter(provider => provider.mode === 'browser').map(provider => provider.id),
  ['steam-web', 'oppo-web', 'xiaomi-web', 'vivo-web']);
for (const provider of PROVIDERS) {
  assert.match(provider.provider, /^(?:qq|wx|bilibili|steam|oppo|xiaomi|vivo|huawei|honor)$/, provider.id);
  assert(provider.brand, `${provider.id} must expose a brand`);
  if (provider.mode === 'browser') assert.match(provider.page, /^https:\/\//, provider.id);
}
for (const entry of ENTRIES) assert.match(entry.entry, /^https:\/\//, entry.id);
assert.equal(entryById('guanfu').verified, true);
assert.equal(entryById('baidu').verified, false, 'unverified entries stay flagged until checked live');
assert.equal(providerById('bilibili')?.label, 'bilibili 扫码登录', 'bilibili 走统一登录器，不是入口');
assert.deepEqual(PROVIDERS.filter(p => p.mode === 'qr').map(p => p.id), ['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei', 'honor'], '扫码登录顺序与统一登录器菜单一致');
assert.equal(providerById('xiaomi')?.provider, 'xiaomi');
assert.equal(providerById('xiaomi-web')?.provider, 'xiaomi', '官方网页登录仍复用统一登录器的小米链路');
assert.equal(providerByLabel('小米官方登录（账号密码 / 短信）')?.id, 'xiaomi-web');
const url = value => new URL(value);
assert.equal(matchesAnyEntry(url('https://web.sanguosha.com/x/pc/index.php')), true);
assert.equal(matchesAnyEntry(url('https://game.4399iw2.com/yxxsgs/index.php')), true);
assert.equal(matchesAnyEntry(url('https://s118.app1107877410.qqopenapp.com/pc/qqLobby_index.php?x=1')), true);
assert.equal(matchesAnyEntry(url('https://web.sanguosha.com/login/x/index')), false, 'login pages are not game frames');
assert.equal(matchesAnyEntry(url('https://example.com/x/pc/')), false);

// 账号簿：每入口多账号；safeStorage 可用时密码加密落盘；不可用时只记账号；旧单账号记录迁移。
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-cred-'));
const fake = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(`enc:${text}`), decryptString: buffer => buffer.toString().replace(/^enc:/, '') };
const store = createCredentialStore({ file: path.join(tmp, 'credentials.json'), safeStorage: fake });
assert.deepEqual(store.list('guanfu'), []);
assert.equal(store.compare('guanfu', 'user', 'pw'), 'new');
assert.equal(store.set('guanfu', 'user', 'pw'), true);
assert.equal(store.compare('guanfu', 'user', 'pw'), null);
assert.equal(store.compare('guanfu', 'user', 'other'), 'changed');
store.set('guanfu', 'second', 'pw2');
assert.deepEqual(store.list('guanfu').map(i => i.account), ['second', 'user'], 'most recently used first');
store.touch('guanfu', 'user');
assert.deepEqual(store.list('guanfu').map(i => i.account), ['user', 'second']);
assert.equal(store.get('guanfu').account, 'user');
const raw = fs.readFileSync(path.join(tmp, 'credentials.json'), 'utf8');
assert(!raw.includes('pw2') && !raw.includes('"pw"'), 'plaintext password never hits disk');
const reopened = createCredentialStore({ file: path.join(tmp, 'credentials.json'), safeStorage: fake });
assert.equal(reopened.list('guanfu').find(i => i.account === 'second').password, 'pw2');
store.set('guanfu', 'user', 'newpw');
assert.equal(store.list('guanfu').find(i => i.account === 'user').password, 'newpw');
store.remove('guanfu', 'second');
assert.deepEqual(store.list('guanfu').map(i => i.account), ['user']);
const plain = createCredentialStore({ file: path.join(tmp, 'plain.json'), safeStorage: { isEncryptionAvailable: () => false } });
plain.set('4399', 'acct', 'secret');
assert.equal(plain.get('4399').password, '', 'no encryption → password not stored');
fs.writeFileSync(path.join(tmp, 'legacy.json'), JSON.stringify({ schema: 1, entries: { guanfu: { account: 'old', password: Buffer.from('enc:oldpw').toString('base64'), savedAt: 5 } } }));
const migrated = createCredentialStore({ file: path.join(tmp, 'legacy.json'), safeStorage: fake });
assert.deepEqual(migrated.list('guanfu').map(i => [i.account, i.password]), [['old', 'oldpw']], 'schema 1 records migrate');
console.log('micro entries tests passed');
