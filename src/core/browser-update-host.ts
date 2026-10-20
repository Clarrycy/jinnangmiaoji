(function installJinnangdaiBrowserUpdateHost(root, factory) {
  const api = factory(root?.__JND_UPDATE_CORE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.__JND_BROWSER_UPDATE_HOST = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBrowserUpdateHost(UpdateCore) {
  'use strict';

  if (!UpdateCore) throw new Error('Jinnangdai update core is required');
  const DATABASE = 'jnd-runtime-cache';
  const STORE = 'kv';
  const CURRENT_KEY = 'runtime-current-v1';
  const LKG_KEY = 'runtime-lkg-v1';
  const DEFAULT_METADATA_URL = 'https://sh-sgs.net/script/jinnangdai.version.json';

  function openDatabase(databaseName = DATABASE) {
    return new Promise((resolve, reject) => {
      // 1.x 迁移期沿用现有库版本；旧启动器仍以版本 1 打开同一库。
      // kv 的记录键已隔离新旧缓存，无需为新 host 升库；已有版本 2 也原样读取。
      const request = indexedDB.open(databaseName);
      let abandoned = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const database = request.result;
        if (abandoned) {
          database.close();
          return;
        }
        if (!database.objectStoreNames.contains(STORE)) {
          database.close();
          reject(new Error('runtime cache store missing'));
          return;
        }
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        abandoned = true;
        reject(new Error('runtime cache blocked'));
      };
    });
  }

  async function readValue(key, databaseName) {
    const database: any = await openDatabase(databaseName);
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result?.value || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  async function commitValue(record, databaseName?) {
    const database: any = await openDatabase(databaseName);
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite');
        const store = transaction.objectStore(STORE);
        const currentRequest = store.get(CURRENT_KEY);
        currentRequest.onsuccess = () => {
          const current = currentRequest.result?.value;
          if (current) store.put({ key: LKG_KEY, value: current });
          store.put({ key: CURRENT_KEY, value: record });
        };
        transaction.oncomplete = () => resolve(undefined);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async function sha256(payload) {
    const bytes = typeof payload === 'string'
      ? new TextEncoder().encode(payload)
      : payload instanceof ArrayBuffer
        ? new Uint8Array(payload)
        : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function loadCachedCandidates(databaseName?) {
    const [current, lkg] = await Promise.all([
      readValue(CURRENT_KEY, databaseName).catch(() => null),
      readValue(LKG_KEY, databaseName).catch(() => null),
    ]);
    const verified = await Promise.all([
      UpdateCore.verifyCachedRuntime(current, sha256),
      UpdateCore.verifyCachedRuntime(lkg, sha256),
    ]);
    return verified.filter(Boolean);
  }

  function installEarlyAccountCapture() {
    const messages = window.__JND_EARLY_ACCOUNT_MESSAGES = Array.isArray(window.__JND_EARLY_ACCOUNT_MESSAGES)
      ? window.__JND_EARLY_ACCOUNT_MESSAGES
      : [];
    const original = console.log;
    function capture(...args) {
      try {
        const markerIndex = args.findIndex(value => typeof value === 'string' && value.includes('--------['));
        if (markerIndex >= 0) {
          const marker = args[markerIndex];
          const inbound = !/\[\s*(?:send|sent)\s*\]/i.test(marker);
          const payload = args.find(value => value && typeof value === 'object');
          let name = (marker.match(/name:\s*((?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*)/) || [])[1] || '';
          if (!name) {
            for (let index = markerIndex + 1; index < args.length; index += 1) {
              const value = args[index];
              if (typeof value === 'string' && /^(?:cmsg\.)?(?:CRespAuth|CRespLogin|ClientLoginRep|CReqNotifyUserData|CNotifyUser(?:Modify|OfficialRank)?Data|CReqLogout|CRespLogout|ClientLogoutReq|ClientLogoutRep|ClientUserDataCounterNtf|ClientNetSpeedNtf|ClinetNetSpeedNtf|SmsgUpdateTaskListToClient|ClientGuildMemberChangeNtf)$/.test(value)) {
                name = value;
                break;
              }
            }
          }
          const short = String(name || '').split('.').pop();
          const relevantInitial = short === 'CNotifyUserData' && inbound;
          const relevantBoundary = inbound
            ? /^(?:CRespAuth|CRespLogin|ClientLoginRep|CNotifyUserModifyData|CNotifyUserOfficialRankData|CRespLogout|ClientLogoutRep|ClientUserDataCounterNtf|ClientNetSpeedNtf|ClinetNetSpeedNtf|SmsgUpdateTaskListToClient|ClientGuildMemberChangeNtf)$/.test(short)
            : /^(?:CReqNotifyUserData|CReqLogout|ClientLogoutReq)$/.test(short);
          if (payload && (relevantInitial || relevantBoundary)) {
            const busSeq = Number((marker.match(/(?:busSeq|seq):\s*(\d+)/i) || [])[1]) || 0;
            messages.push({ name: short, payload, sent: !inbound, busSeq });
            if (messages.length > 512) messages.splice(0, messages.length - 512);
          }
        }
      } catch (_) {}
      return original.apply(this, args);
    }
    console.log = capture;
    return () => {
      if (console.log === capture) console.log = original;
    };
  }

  function builtInRecord(code, version) {
    return {
      schema: UpdateCore.SCHEMA_VERSION,
      version: UpdateCore.normalizeVersion(version),
      sha256: '',
      bytes: new TextEncoder().encode(code).byteLength,
      url: 'app://jinnangdai-built-in',
      code,
      source: 'built-in',
    };
  }

  function createBrowserClient(options) {
    return UpdateCore.createUpdateClient({
      metadataUrl: options.metadataUrl || DEFAULT_METADATA_URL,
      channel: options.releaseChannel || 'stable',
      currentVersion: options.currentVersion,
      adapter: {
        async fetchMetadata(url) {
          await options.waitForPreviousUpdate?.();
          return UpdateCore.fetchMetadataJson(url);
        },
        fetchRuntime: UpdateCore.fetchRuntimeBytes,
        sha256,
        async getCachedRuntime(metadata) {
          const records = await loadCachedCandidates();
          return records.find(record => record.version === metadata.version
            && record.sha256 === metadata.runtime.sha256) || null;
        },
        async commitRuntime(record) {
          await commitValue(record);
        },
        async reloadGame() {
          const reload = window.__JND?.requestOfficialResourceRepairReload;
          if (typeof reload === 'function') {
            reload();
            return true;
          }
          location.reload();
          return true;
        },
      },
    });
  }

  function createBrowserBridge(client, options) {
    return {
      kind: 'browser',
      metadataUrl: options.metadataUrl || DEFAULT_METADATA_URL,
      currentRuntimeVersion: options.currentVersion,
      currentRuntimeSource: options.currentRuntimeSource || 'cache',
      getUpdateState: () => client.getState(),
      subscribeUpdateState: listener => client.subscribe(listener),
      checkMetadata: () => client.checkMetadata(),
      downloadUpdate: () => client.downloadUpdate(),
      reloadGame: () => client.reloadGame(),
    };
  }

  function upgradeLegacyBrowserBridge(options) {
    const previous = window.__JND_BOOTSTRAP;
    if (typeof previous?.checkMetadata === 'function' && typeof previous?.downloadUpdate === 'function') return previous;
    // Web and WeGame share this browser cache owner. Native IPC hosts are not silently replaced.
    if (previous?.kind !== 'browser' || typeof previous?.checkNow !== 'function'
      || typeof previous?.getUpdateState !== 'function') return previous || null;
    const previousPhase = previous.getUpdateState()?.phase;
    const pending = ['checking-metadata', 'downloading'].includes(previousPhase)
      ? Promise.resolve().then(() => previous.checkNow()).catch(error => {
        console.error('[锦囊袋] update', { stage: 'legacy-transfer', code: error?.code || 'UPDATE_FAILED', message: error?.message });
      })
      : Promise.resolve();
    const context = {
      ...options,
      metadataUrl: previous.metadataUrl || DEFAULT_METADATA_URL,
      currentRuntimeSource: previous.currentRuntimeSource || 'cache',
      waitForPreviousUpdate: () => pending,
    };
    const client = createBrowserClient(context);
    const bridge = createBrowserBridge(client, context);
    window.__JND_BOOTSTRAP = bridge;
    void client.startBackgroundUpdate().catch(error => {
      console.error('[锦囊袋] update', { stage: 'startup', code: error?.code || 'UPDATE_FAILED', message: error?.message });
    });
    return bridge;
  }

  async function boot(options) {
    if (window.__JND_META_RUNTIME_BOOTING) return window.__JND_BOOTSTRAP || null;
    window.__JND_META_RUNTIME_BOOTING = true;
    const stopEarlyCapture = installEarlyAccountCapture();
    const fallback = builtInRecord(String(options.fallbackCode || ''), options.fallbackVersion);
    const cached = await loadCachedCandidates().catch(() => []);
    // 同版本重新安装时，以当前安装包内置的内容为准；更高版本缓存仍优先。
    const candidates = [fallback, ...cached].sort(
      (left, right) => UpdateCore.compareVersions(right.version, left.version),
    );
    let startupRecord = candidates[0] || fallback;
    const context = { ...options, currentVersion: startupRecord.version, currentRuntimeSource: startupRecord.source };
    const client = createBrowserClient(context);
    const bridge = createBrowserBridge(client, context);
    window.__JND_BOOTSTRAP = bridge;

    if (window.__JND_META_RUNTIME_STARTED) return bridge;
    window.__JND_META_RUNTIME_STARTED = true;
    window.__JND_RUNTIME_STARTED = true;
    window.__JND_RUNTIME_OWNER = {
      channel: 'release',
      source: startupRecord.source || 'built-in',
      version: startupRecord.version,
      generation: 1,
      startedAt: Date.now(),
    };
    bridge.currentRuntimeVersion = startupRecord.version;
    bridge.currentRuntimeSource = startupRecord.source || 'built-in';
    stopEarlyCapture();
    try {
      (0, eval)(`${startupRecord.code}\n//# sourceURL=jinnangdai-${startupRecord.source || 'runtime'}-${startupRecord.version}.js`);
      client.markApplied(startupRecord.version);
    } catch (error) {
      window.__JND_META_RUNTIME_STARTED = false;
      window.__JND_RUNTIME_STARTED = false;
      window.__JND_META_RUNTIME_BOOTING = false;
      throw error;
    }
    // Start the existing runtime first. Network work never delays game startup or applies code in place.
    void client.startBackgroundUpdate().catch(error => {
      console.error('[锦囊袋] update', { stage: 'startup', code: error?.code || 'UPDATE_FAILED', message: error?.message });
    });
    return bridge;
  }

  return Object.freeze({
    DATABASE,
    CURRENT_KEY,
    LKG_KEY,
    sha256,
    loadCachedCandidates,
    commitValue,
    upgradeLegacyBrowserBridge,
    boot,
  });
});
