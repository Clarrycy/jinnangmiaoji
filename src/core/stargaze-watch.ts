import fs = require('fs');
import path = require('path');
import report_ = require('./stargaze-report');
import fetch_ = require('./stargaze-fetch');

type ReportKind = report_.ReportKind;
type StargazeSettings = report_.StargazeSettings;
type ResultRecord = report_.ResultRecord;
type StargazeHealth = report_.StargazeHealth;
type PersistedState = report_.PersistedState;
type ReportSources = report_.ReportSources;
type ParsedReport = report_.ParsedReport;
type ReportFetcher = fetch_.ReportFetcher;
type PublicReport = ReturnType<typeof report_.publicReport>;

const {
  DEFAULT_SETTINGS, REPORT_KINDS, SCHEMA, SNAPSHOTS_PER_KIND, SOURCES,
  dateStamp, emptyState, humanError, localBaseName, normalizeSettings, normalizeState,
  parseReport, publicReport, reportSignature, stripCloudflareInjection,
} = report_;

const STATE_FILE = 'watch-state.json';
const HEALTH_FILE = 'health.json';
const INITIAL_DELAY_MS = 1500;
const MAX_BACKOFF_MINUTES = 60;

export type StargazeUpdate = {
  kind: ReportKind;
  label: string;
  record: ResultRecord;
  report: PublicReport;
};

export type StargazePublicState = {
  schema: number;
  settings: StargazeSettings;
  reports: Record<ReportKind, PublicReport | null>;
  health: StargazeHealth;
  lastCheckAt: number;
  lastSuccessAt: number;
  nextCheckAt: number;
  lastError: string;
  checking: boolean;
  directory: string;
  sources: ReportSources;
};

export type StargazeCheckResult = {
  ok: boolean;
  updates: StargazeUpdate[];
  state: StargazePublicState;
};

export type StargazeWatcher = {
  getState(): StargazePublicState;
  configure(settings?: Partial<StargazeSettings>): StargazePublicState;
  setDirectory(directory: string): StargazePublicState;
  checkNow(): Promise<StargazeCheckResult>;
  localReportPath(kind: ReportKind): string;
  onlineReportUrl(kind: ReportKind): string;
  dispose(): void;
};

export type StargazeWatcherOptions = {
  directory: string;
  fetch: ReportFetcher;
  settings?: Partial<StargazeSettings>;
  sources?: Partial<ReportSources>;
  onState?: (state: StargazePublicState) => void;
  onUpdate?: (updates: StargazeUpdate[]) => void;
  log?: (...args: any[]) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => any;
  clearTimer?: (timer: any) => void;
};

function readJson(file: string) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function writeAtomic(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, data);
  try { fs.renameSync(temporary, file); }
  catch (_) {
    try { fs.unlinkSync(file); } catch (_) {}
    fs.renameSync(temporary, file);
  }
}

function writeJson(file: string, value: any) {
  writeAtomic(file, JSON.stringify(value, null, 2));
}

function cleanRecord(raw: any): ResultRecord | undefined {
  if (!raw || typeof raw !== 'object' || !raw.digest) return undefined;
  return {
    title: String(raw.title || ''),
    reportDate: String(raw.reportDate || ''),
    configVersion: String(raw.configVersion || ''),
    summary: String(raw.summary || ''),
    names: Array.isArray(raw.names) ? raw.names.map(String).filter(Boolean).slice(0, 8) : [],
    digest: String(raw.digest),
    etag: String(raw.etag || ''),
    lastModified: String(raw.lastModified || ''),
    checkedAt: Number(raw.checkedAt) || 0,
    changedAt: Number(raw.changedAt) || 0,
    firstSeenAt: Number(raw.firstSeenAt) || 0,
    localFile: String(raw.localFile || ''),
    localSnapshot: String(raw.localSnapshot || ''),
    status: raw.status === 'error' ? 'error' : 'ok',
    error: String(raw.error || ''),
  };
}

function copySources(input?: Partial<ReportSources>): ReportSources {
  return {
    activity: { ...SOURCES.activity, ...(input?.activity || {}) },
    generals: { ...SOURCES.generals, ...(input?.generals || {}) },
  };
}

export function createStargazeWatcher(options: StargazeWatcherOptions): StargazeWatcher {
  function prepareDirectory(value: string) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error('报告保存目录为空');
    const target = path.resolve(raw);
    const reports = path.join(target, 'reports');
    fs.mkdirSync(reports, { recursive: true });
    const probe = path.join(target, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return { directory: target, reports };
  }

  const initialDirectory = prepareDirectory(String(options.directory));
  let directory = initialDirectory.directory;
  let reportsDirectory = initialDirectory.reports;
  let stateFile = path.join(directory, STATE_FILE);
  let healthFile = path.join(directory, HEALTH_FILE);
  const sources = copySources(options.sources);
  const now = options.now || Date.now;
  const setTimer = options.setTimer || ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer || ((timer: any) => clearTimeout(timer));
  const log = options.log || (() => {});
  let settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(options.settings || {}) });
  let state = normalizeState(readJson(stateFile));
  state.health = { ...emptyState().health, ...(readJson(healthFile) || {}), ...(state.health || {}) };
  state.reports = {
    activity: cleanRecord(state.reports?.activity),
    generals: cleanRecord(state.reports?.generals),
  };
  let timer: any = null;
  let inFlight: Promise<StargazeCheckResult> | null = null;
  let disposed = false;
  let controller: AbortController | null = null;

  function persist() {
    const saved: PersistedState = {
      schema: SCHEMA,
      reports: state.reports,
      health: state.health,
      lastCheckAt: Number(state.lastCheckAt) || 0,
      lastSuccessAt: Number(state.lastSuccessAt) || 0,
      nextCheckAt: Number(state.nextCheckAt) || 0,
      lastError: String(state.lastError || ''),
    };
    try {
      writeJson(stateFile, saved);
      writeJson(healthFile, state.health);
    } catch (error) {
      log('stargaze state write failed', error?.message || error);
    }
  }

  function snapshot(): StargazePublicState {
    return {
      schema: SCHEMA,
      settings: { ...settings },
      reports: {
        activity: publicReport(state.reports.activity),
        generals: publicReport(state.reports.generals),
      },
      health: { ...state.health },
      lastCheckAt: Number(state.lastCheckAt) || 0,
      lastSuccessAt: Number(state.lastSuccessAt) || 0,
      nextCheckAt: Number(state.nextCheckAt) || 0,
      lastError: String(state.lastError || ''),
      checking: Boolean(inFlight),
      directory,
      sources: copySources(sources),
    };
  }

  function emit() {
    try { options.onState?.(snapshot()); }
    catch (error) { log('stargaze state callback failed', error?.message || error); }
  }

  function clearSchedule() {
    if (timer !== null) { try { clearTimer(timer); } catch (_) {} }
    timer = null;
  }

  function schedule(delayMs: number) {
    clearSchedule();
    if (disposed || !settings.enabled) { state.nextCheckAt = 0; return; }
    const delay = Math.max(0, Number(delayMs) || 0);
    state.nextCheckAt = now() + delay;
    timer = setTimer(() => {
      timer = null;
      void checkNow();
    }, delay);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function pruneSnapshots(kind: ReportKind) {
    try {
      const namePattern = new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}-[a-f0-9]{8}\\.html$`, 'i');
      const files = fs.readdirSync(reportsDirectory)
        .filter(name => namePattern.test(name))
        .map(name => ({ name, time: fs.statSync(path.join(reportsDirectory, name)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      for (const item of files.slice(SNAPSHOTS_PER_KIND)) {
        for (const ext of ['.html', '.json']) {
          try { fs.unlinkSync(path.join(reportsDirectory, item.name.replace(/\.html$/i, ext))); } catch (_) {}
        }
      }
    } catch (error) {
      log('stargaze snapshot prune failed', kind, error?.message || error);
    }
  }

  function saveSnapshot(kind: ReportKind, html: string, report: ParsedReport, digest: string, checkedAt: number) {
    const baseName = localBaseName(kind, report, digest);
    const htmlFile = path.join(reportsDirectory, `${baseName}.html`);
    const jsonFile = path.join(reportsDirectory, `${baseName}.json`);
    const latestHtml = path.join(reportsDirectory, `latest-${kind}.html`);
    const latestJson = path.join(reportsDirectory, `latest-${kind}.json`);
    const meta = {
      schema: SCHEMA,
      kind,
      title: report.title,
      reportDate: report.reportDate,
      configVersion: report.configVersion,
      summary: report.summary,
      names: report.names,
      digest,
      fingerprint: digest.slice(0, 12),
      checkedAt,
      source: sources[kind].url,
    };
    const metaText = JSON.stringify(meta, null, 2);
    writeAtomic(htmlFile, html);
    writeAtomic(jsonFile, metaText);
    writeAtomic(latestHtml, html);
    writeAtomic(latestJson, metaText);
    pruneSnapshots(kind);
    return { htmlFile, jsonFile };
  }

  async function checkKind(kind: ReportKind, signal: AbortSignal) {
    const source = sources[kind];
    const previous = state.reports[kind];
    const checkedAt = now();
    let response = await options.fetch(source.url, {
      etag: previous?.etag || '',
      lastModified: previous?.lastModified || '',
      signal,
    });
    let usedValidators = true;
    if (response.status === 304) {
      if (previous?.localFile && fs.existsSync(previous.localFile)) {
        return {
          changed: false,
          bytes: 0,
          record: {
            ...previous,
            checkedAt,
            status: 'ok' as const,
            error: '',
          },
        };
      }
      // 本地快照被清理后，条件请求只能拿到 304；再无条件取一次，避免永远没有可读的本地报告。
      response = await options.fetch(source.url, { signal });
      usedValidators = false;
    }
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    const html = stripCloudflareInjection(response.text);
    const parsed = parseReport(kind, html);
    const digest = reportSignature(kind, parsed, html);
    const changed = Boolean(previous && previous.digest !== digest);
    let localFile = previous?.localFile || '';
    let localSnapshot = previous?.localSnapshot || '';
    if (changed || !usedValidators || !previous || !localFile || !fs.existsSync(localFile)) {
      const saved = saveSnapshot(kind, html, parsed, digest, checkedAt);
      localFile = saved.htmlFile;
      localSnapshot = saved.jsonFile;
    }
    return {
      changed,
      bytes: Number(response.bytes) || Buffer.byteLength(response.text, 'utf8'),
      record: {
        title: parsed.title,
        reportDate: parsed.reportDate,
        configVersion: parsed.configVersion,
        summary: parsed.summary,
        names: parsed.names,
        digest,
        etag: String(response.etag || ''),
        lastModified: String(response.lastModified || ''),
        checkedAt,
        changedAt: changed ? checkedAt : previous?.changedAt || checkedAt,
        firstSeenAt: previous?.firstSeenAt || checkedAt,
        localFile,
        localSnapshot,
        status: 'ok' as const,
        error: '',
      },
    };
  }

  function checkNow(): Promise<StargazeCheckResult> {
    if (inFlight) return inFlight;
    clearSchedule();
    state.nextCheckAt = 0;
    const run = async (): Promise<StargazeCheckResult> => {
      const started = now();
      const activeController = new AbortController();
      controller = activeController;
      const updates: StargazeUpdate[] = [];
      const errors: string[] = [];
      let successes = 0;
      let failures = 0;
      let bytes = 0;
      let aborted = false;
      for (const kind of REPORT_KINDS) {
        if (activeController.signal.aborted) { aborted = true; break; }
        state.health.checks += 1;
        try {
          const result = await checkKind(kind, activeController.signal);
          state.health.successes += 1;
          successes += 1;
          bytes += result.bytes;
          state.reports[kind] = result.record;
          if (result.changed) updates.push({
            kind,
            label: sources[kind].label,
            record: result.record,
            report: publicReport(result.record),
          });
        } catch (error) {
          if (activeController.signal.aborted) { aborted = true; break; }
          failures += 1;
          state.health.failures += 1;
          const message = humanError(error);
          const previous = state.reports[kind];
          if (previous) state.reports[kind] = { ...previous, checkedAt: now(), status: 'error', error: message };
          errors.push(`${sources[kind].label}：${message}`);
          log('stargaze check failed', kind, message);
        }
      }
      const finished = now();
      state.lastCheckAt = finished;
      state.health.lastDurationMs = Math.max(0, finished - started);
      state.health.lastBytes = bytes;
      state.lastError = errors.join('；');
      if (successes > 0) {
        state.lastSuccessAt = finished;
        state.health.consecutiveFailures = 0;
      } else if (!aborted) {
        state.health.consecutiveFailures += 1;
      }
      if (updates.length) {
        state.health.updates += updates.length;
        if (settings.enabled && settings.notify) state.health.notifications += updates.length;
      }
      if (settings.enabled && !disposed && !aborted) {
        const backoff = failures > 0 && successes === 0
          ? Math.min(MAX_BACKOFF_MINUTES, settings.intervalMinutes * Math.pow(2, Math.max(0, state.health.consecutiveFailures - 1)))
          : settings.intervalMinutes;
        schedule(backoff * 60000);
      } else {
        clearSchedule();
        state.nextCheckAt = 0;
      }
      persist();
      emit();
      if (updates.length && settings.enabled && !aborted) {
        try { options.onUpdate?.(updates); }
        catch (error) { log('stargaze update callback failed', error?.message || error); }
      }
      return { ok: failures === 0 && !aborted, updates, state: snapshot() };
    };
    const job = run()
      .catch(error => {
        log('stargaze check crashed', error?.stack || error);
        state.lastError = humanError(error);
        persist();
        return { ok: false, updates: [] as StargazeUpdate[], state: snapshot() };
      })
      .finally(() => {
        controller = null;
        inFlight = null;
        emit();
      });
    inFlight = job;
    return job;
  }

  function configure(next?: Partial<StargazeSettings>) {
    const previous = settings;
    settings = normalizeSettings({ ...settings, ...(next || {}) });
    if (!settings.enabled) {
      clearSchedule();
      state.nextCheckAt = 0;
    } else if (!previous.enabled) {
      schedule(1000);
    } else if (previous.intervalMinutes !== settings.intervalMinutes) {
      schedule(settings.intervalMinutes * 60000);
    }
    emit();
    return snapshot();
  }

  function setDirectory(value: string) {
    if (disposed) throw new Error('自动观星已经停止');
    const next = prepareDirectory(value);
    if (next.directory === directory) return snapshot();
    const previousReports = reportsDirectory;
    directory = next.directory;
    reportsDirectory = next.reports;
    stateFile = path.join(directory, STATE_FILE);
    healthFile = path.join(directory, HEALTH_FILE);
    // 切换目录后当前报告仍应可读：只迁移最新 HTML/JSON，不搬走整套历史快照。
    for (const kind of REPORT_KINDS) {
      const record = state.reports[kind];
      if (!record?.localFile || !fs.existsSync(record.localFile)) continue;
      try {
        const html = path.join(reportsDirectory, path.basename(record.localFile));
        fs.copyFileSync(record.localFile, html);
        fs.copyFileSync(html, path.join(reportsDirectory, `latest-${kind}.html`));
        if (record.localSnapshot && fs.existsSync(record.localSnapshot)) {
          const json = path.join(reportsDirectory, path.basename(record.localSnapshot));
          fs.copyFileSync(record.localSnapshot, json);
          fs.copyFileSync(json, path.join(reportsDirectory, `latest-${kind}.json`));
          record.localSnapshot = json;
        }
        record.localFile = html;
      } catch (error) {
        log('stargaze report migrate failed', kind, previousReports, error?.message || error);
      }
    }
    persist();
    emit();
    return snapshot();
  }

  function localReportPath(kind: ReportKind) {
    if (!REPORT_KINDS.includes(kind)) throw new Error('未知的观星报告类型');
    const record = state.reports[kind];
    if (record?.localFile && fs.existsSync(record.localFile)) return record.localFile;
    return path.join(reportsDirectory, `latest-${kind}.html`);
  }

  function onlineReportUrl(kind: ReportKind) {
    if (!REPORT_KINDS.includes(kind)) throw new Error('未知的观星报告类型');
    return sources[kind].url;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearSchedule();
    try { controller?.abort(); } catch (_) {}
    persist();
  }

  if (settings.enabled) schedule(INITIAL_DELAY_MS);

  return { getState: snapshot, configure, setDirectory, checkNow, localReportPath, onlineReportUrl, dispose };
}
