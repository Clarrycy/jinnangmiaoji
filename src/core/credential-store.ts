'use strict';
// 账号簿：官方「游卡通行证」账号与密码，按入口保存多个账号（Chrome 式）。
// 密码用 Electron safeStorage 加密（Windows=DPAPI，与系统账户绑定）；明文不落盘、不出本机。
// safeStorage 不可用时只记账号不记密码。旧版单账号记录自动迁移。
import fs = require('fs');
import path = require('path');
import crypto = require('crypto');

// 本机密钥（macOS 用）：safeStorage 走钥匙串，ad-hoc 签名的包每次换签名钥匙串都会弹密码；这里改用 userData 里一把 0600 的随机密钥做 AES-256-GCM，
// 强度等同 Chrome 在 Linux 上的 basic 级，不弹窗。有 Developer ID 签名后可以再换回 safeStorage。
function createLocalCipher(keyFile: string, log) {
  let key: Buffer | null = null;
  const load = () => {
    if (key) return key;
    try { const raw = fs.readFileSync(keyFile); if (raw.length === 32) { key = raw; return key; } } catch (_) {}
    key = crypto.randomBytes(32);
    try { fs.mkdirSync(path.dirname(keyFile), { recursive: true }); fs.writeFileSync(keyFile, key, { mode: 0o600 }); } catch (error) { log('credential key write failed', error?.message || error); }
    return key;
  };
  return {
    isEncryptionAvailable: () => true,
    encryptString(text: string) { const k = load(); const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv); const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return Buffer.concat([Buffer.from('k1'), iv, c.getAuthTag(), body]); },
    decryptString(buffer: Buffer) { const k = load(); if (buffer.length < 2 + 12 + 16 || buffer.subarray(0, 2).toString() !== 'k1') throw new Error('not a local-key record'); const iv = buffer.subarray(2, 14), tag = buffer.subarray(14, 30), body = buffer.subarray(30); const d = crypto.createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(tag); return Buffer.concat([d.update(body), d.final()]).toString('utf8'); },
  };
}

function createCredentialStore(options) {
  const file = path.resolve(options.file);
  const safeStorage = options.safeStorage || (options.keyFile ? createLocalCipher(options.keyFile, typeof options.log === 'function' ? options.log : () => {}) : null);
  const log = typeof options.log === 'function' ? options.log : () => {};
  let data = { schema: 2, entries: {} };
  try {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (loaded && typeof loaded === 'object') {
      data = { schema: 2, entries: {} };
      for (const [entryId, record] of Object.entries<any>(loaded.entries || {})) {
        // schema 1：{account,password,savedAt}；schema 2：{accounts:[...]}
        if (Array.isArray(record?.accounts)) data.entries[entryId] = { accounts: record.accounts.filter(a => a && a.account) };
        else if (record?.account) data.entries[entryId] = { accounts: [{ account: String(record.account), password: record.password || '', savedAt: Number(record.savedAt || 0), lastUsedAt: Number(record.savedAt || 0) }] };
      }
    }
  } catch (_) {}

  const canEncrypt = () => Boolean(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
  function flush() {
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify(data));
      fs.renameSync(temporary, file);
    } catch (error) {
      log('credential store flush failed', error?.message || error);
      try { fs.unlinkSync(temporary); } catch (_) {}
    }
  }
  function decrypt(value) {
    if (!value || !canEncrypt()) return '';
    try { return safeStorage.decryptString(Buffer.from(value, 'base64')); }
    catch (error) { log('credential decrypt failed', error?.message || error); return ''; }
  }
  const bucket = entryId => { const id = String(entryId); if (!data.entries[id]) data.entries[id] = { accounts: [] }; return data.entries[id]; };

  return Object.freeze({
    encryptionAvailable: canEncrypt,
    // 全部账号，最近用过的在前；返回 { account, password, savedAt, lastUsedAt }。
    list(entryId) {
      const accounts = (data.entries[String(entryId)]?.accounts || []).slice();
      accounts.sort((a, b) => Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0));
      return accounts.map(item => ({ account: String(item.account), password: decrypt(item.password), nick: String(item.nick || ''), savedAt: Number(item.savedAt || 0), lastUsedAt: Number(item.lastUsedAt || 0) }));
    },
    // 最近用过的一个（单账号自动填入用）。
    get(entryId) { return this.list(entryId)[0] || null; },
    has(entryId, account) { return (data.entries[String(entryId)]?.accounts || []).some(item => item.account === String(account)); },
    // 新账号追加，同名账号更新密码；都刷新 lastUsedAt。
    set(entryId, account, password) {
      const name = String(account || '').trim();
      if (!name) return false;
      const encrypted = password && canEncrypt() ? safeStorage.encryptString(String(password)).toString('base64') : '';
      const accounts = bucket(entryId).accounts;
      const existing = accounts.find(item => item.account === name);
      // 同一毫秒内连续保存两个账号时也要「后存的在前」：时间戳至少比现有最大值大 1。
      const now = Math.max(Date.now(), ...accounts.map(item => Number(item.lastUsedAt || 0) + 1));
      if (existing) { if (password) existing.password = encrypted; existing.lastUsedAt = now; }
      else accounts.push({ account: name, password: encrypted, savedAt: now, lastUsedAt: now });
      flush();
      return true;
    },
    // 游戏里的昵称：登录后由注入器从 runtime 的 PlayerState 读到再回填
    setNick(entryId, account, nick) {
      const existing = bucket(entryId).accounts.find(item => item.account === String(account));
      if (existing && nick && existing.nick !== String(nick)) { existing.nick = String(nick); flush(); }
    },
    touch(entryId, account) {
      const existing = bucket(entryId).accounts.find(item => item.account === String(account));
      if (existing) { existing.lastUsedAt = Math.max(Date.now(), ...bucket(entryId).accounts.map(item => Number(item.lastUsedAt || 0) + 1)); flush(); }
    },
    remove(entryId, account) {
      const accounts = bucket(entryId).accounts;
      const index = accounts.findIndex(item => item.account === String(account));
      if (index >= 0) { accounts.splice(index, 1); flush(); }
    },
    // 保存提示的判断：'new'（没存过）／'changed'（存过但密码不同）／null（相同，不问）。
    compare(entryId, account, password) {
      const existing = this.list(entryId).find(item => item.account === String(account || '').trim());
      if (!existing) return 'new';
      return existing.password === String(password || '') ? null : 'changed';
    },
    differs(entryId, account, password) { return this.compare(entryId, account, password) !== null; },
  });
}

export = { createCredentialStore, createLocalCipher };
