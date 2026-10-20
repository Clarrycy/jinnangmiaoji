'use strict';
// 随包组件（小抄、统一登录器）与壳版本的更新宿主。
// 与锦囊袋 runtime 的 node-update-host 平行：各组件独立 PayloadStore（种子＋已校验缓存），
// 启动用已选记录注入，后台只查一次清单；下载经字节数与 SHA-256 校验后原子落盘，
// 下次页面加载生效，不打断牌局。壳本身不自替换，只给出新版与下载地址。
import path = require('path');
const UpdateCore = require('./update-core'); // UMD 脚本，不是 TS 模块；浏览器侧也要原样跑
import node_update_host_ = require('./node-update-host');
const { PayloadStore, requestBuffer, sha256 } = node_update_host_;

const MANIFEST_URL = 'https://sh-sgs.net/script/jinnangdai.micro.json';
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_COMPONENT_BYTES = 8 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function httpsUrl(value, field) {
  let url;
  try { url = new URL(String(value || '')); } catch (_) { throw new Error(`${field} 不是有效 URL`); }
  if (url.protocol !== 'https:') throw new Error(`${field} 必须使用 HTTPS`);
  return url.href;
}

function validateManifest(input, knownIds) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('组件清单必须是对象');
  if (Number(input.schema) !== 1) throw new Error('组件清单 schema 不受支持');
  const publishedAt = String(input.publishedAt || '');
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) throw new Error('组件清单 publishedAt 无效');
  const components = {};
  const source = input.components && typeof input.components === 'object' ? input.components : {};
  for (const id of knownIds) {
    const entry = source[id];
    if (!entry || typeof entry !== 'object') continue; // 清单可以只覆盖部分组件
    const digest = String(entry.sha256 || '').trim().toLowerCase();
    if (!SHA256_PATTERN.test(digest)) throw new Error(`components.${id}.sha256 无效`);
    const bytes = Number(entry.bytes);
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_COMPONENT_BYTES) throw new Error(`components.${id}.bytes 无效`);
    components[id] = Object.freeze({
      version: UpdateCore.normalizeVersion(entry.version, `components.${id}.version`),
      url: httpsUrl(entry.url, `components.${id}.url`),
      sha256: digest,
      bytes,
    });
  }
  let shell = null;
  if (input.shell && typeof input.shell === 'object') {
    // shell.asar：壳自更新用的 app.asar；downloadUrl：完整便携包（Electron 运行时也要换时用）。
    let asar = null;
    if (input.shell.asar && typeof input.shell.asar === 'object') {
      const digest = String(input.shell.asar.sha256 || '').trim().toLowerCase();
      const bytes = Number(input.shell.asar.bytes);
      if (!SHA256_PATTERN.test(digest)) throw new Error('shell.asar.sha256 无效');
      if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('shell.asar.bytes 无效');
      asar = Object.freeze({ url: httpsUrl(input.shell.asar.url, 'shell.asar.url'), sha256: digest, bytes });
    }
    shell = Object.freeze({
      version: UpdateCore.normalizeVersion(input.shell.version, 'shell.version'),
      minimum: input.shell.minimum ? UpdateCore.normalizeVersion(input.shell.minimum, 'shell.minimum') : '',
      downloadUrl: input.shell.downloadUrl ? httpsUrl(input.shell.downloadUrl, 'shell.downloadUrl') : '',
      asar,
    });
  }
  return Object.freeze({ schema: 1, publishedAt: new Date(publishedAt).toISOString(), components: Object.freeze(components), shell });
}

async function createComponentUpdateHost(options) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const shellVersion = UpdateCore.normalizeVersion(options.shellVersion, 'shellVersion');
  const manifestUrl = options.manifestUrl || MANIFEST_URL;
  const adapter: any = options.adapter || {};
  const fetchManifest = adapter.fetchManifest || (async url => {
    const body = await requestBuffer(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      maxBytes: MAX_MANIFEST_BYTES, accept: 'application/json',
    });
    return JSON.parse(body.toString('utf8'));
  });
  const fetchComponent = adapter.fetchComponent || (async (entry, onProgress) => requestBuffer(entry.url, {
    maxBytes: Math.min(MAX_COMPONENT_BYTES, entry.bytes + 1024), accept: 'application/javascript', timeoutMs: 30000, onProgress,
  }));

  const stores = new Map();
  const records = new Map();
  for (const component of options.components) {
    const store = new PayloadStore({
      directory: path.join(options.cacheRoot, component.id),
      seedPath: component.seedPath,
      seedVersion: component.seedVersion,
      log: (...args) => log(`[${component.id}]`, ...args),
    });
    stores.set(component.id, store);
    records.set(component.id, await store.selectStartupRecord());
  }

  const listeners = new Set<(state: any) => void>();
  const state = {
    checkedAt: 0,
    checkError: null,
    checking: false,
    manifestPublishedAt: '',
    shell: { current: shellVersion, latest: '', minimum: '', downloadUrl: '', asar: null, outdated: false, required: false },
    components: Object.fromEntries([...records].map(([id, record]) => [id, {
      current: record?.version || '0.0.0', source: record?.source || 'none', latest: '', phase: 'idle', error: null,
    }])),
  };
  let checkPromise = null;
  let lastManifest = null;

  function snapshot() { return JSON.parse(JSON.stringify(state)); }
  function publish() {
    const copy = snapshot();
    for (const listener of [...listeners]) {
      try { listener(copy); } catch (_) {}
    }
  }

  async function updateComponent(id, entry) {
    const component = state.components[id];
    component.latest = entry.version;
    const current = records.get(id);
    if (current && (UpdateCore.compareVersions(entry.version, current.version) <= 0 || current.sha256 === entry.sha256)) {
      // 已缓存但本次运行还没用上的，保持 ready（「下次进入游戏生效」），不降级成 current。
      if (component.phase !== 'ready') component.phase = 'current';
      component.current = current.version;
      return;
    }
    component.phase = 'downloading';
    component.error = null;
    component.progress = { downloaded: 0, total: entry.bytes };
    publish();
    let lastPublish = 0;
    try {
      const payload = await fetchComponent(entry, downloaded => {
        component.progress = { downloaded, total: entry.bytes };
        const now = Date.now();
        if (now - lastPublish >= 200) { lastPublish = now; publish(); }
      });
      const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      if (bytes.length !== entry.bytes) throw new Error(`字节数不匹配：期望 ${entry.bytes}，实际 ${bytes.length}`);
      const digest = sha256(bytes);
      if (digest !== entry.sha256) throw new Error('SHA-256 不匹配');
      const record = {
        schema: UpdateCore.SCHEMA_VERSION,
        version: entry.version,
        sha256: digest,
        bytes: bytes.length,
        url: entry.url,
        publishedAt: state.manifestPublishedAt,
        cachedAt: Date.now(),
        code: bytes.toString('utf8'),
      };
      await stores.get(id).commit(record);
      // 已提交的新版从下一次页面加载起注入；当前已运行的页面不动。
      records.set(id, { ...record, source: 'cache' });
      component.current = entry.version;
      component.phase = 'ready';
      log('component updated', id, current?.version || '(none)', '->', entry.version);
    } catch (error) {
      component.phase = 'error';
      component.error = { code: error?.code || 'COMPONENT_UPDATE_FAILED', message: String(error?.message || error) };
      log('component update failed', id, component.error.message);
    }
  }

  async function runCheck() {
    state.checking = true;
    state.checkError = null;
    publish();
    try {
      const manifest = validateManifest(await fetchManifest(manifestUrl), [...stores.keys()]);
      lastManifest = manifest;
      state.checkedAt = Date.now();
      state.manifestPublishedAt = manifest.publishedAt;
      if (manifest.shell) {
        state.shell.latest = manifest.shell.version;
        state.shell.minimum = manifest.shell.minimum;
        state.shell.downloadUrl = manifest.shell.downloadUrl;
        state.shell.asar = manifest.shell.asar;
        state.shell.outdated = UpdateCore.compareVersions(manifest.shell.version, shellVersion) > 0;
        state.shell.required = Boolean(manifest.shell.minimum)
          && UpdateCore.compareVersions(manifest.shell.minimum, shellVersion) > 0;
      }
      for (const [id, entry] of Object.entries(manifest.components)) await updateComponent(id, entry);
    } catch (error) {
      state.checkedAt = Date.now();
      state.checkError = { code: error?.code || 'MANIFEST_FAILED', message: String(error?.message || error) };
      log('component manifest failed', state.checkError.message);
    } finally {
      state.checking = false;
      publish();
    }
    return snapshot();
  }

  function check() {
    if (!checkPromise) checkPromise = runCheck().finally(() => { checkPromise = null; });
    return checkPromise;
  }

  /* 无种子模式：有组件既无种子也无缓存，首启先查一次清单把缺的下下来；网络不通就空着，注入时跳过 */
  if ([...records.values()].some(record => !record)) { try { await runCheck(); } catch (error) { log('first-run component fetch failed', error?.message || error); } }
  return Object.freeze({
    MANIFEST_URL: manifestUrl,
    // 每个宿主启动只查一次；再次调用并入在途请求。
    startBackgroundUpdate: () => check(),
    checkManifest: () => check(),
    // 版本页按钮：只更新指定组件（清单取上次检查结果；没检查过就先检查）。
    async updateComponent(id) {
      if (!lastManifest) await check();
      const entry = lastManifest?.components?.[id];
      if (!entry) throw new Error('清单里没有这个组件');
      await updateComponent(id, entry);
      publish();
      return snapshot();
    },
    getState: () => snapshot(),
    getStartupRecords() {
      const result = {};
      for (const [id, record] of records) result[id] = { ...record };
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export = { MANIFEST_URL, MAX_COMPONENT_BYTES, createComponentUpdateHost, validateManifest };
