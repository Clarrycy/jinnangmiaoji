// 壳 chrome 视图的页面脚本（sandbox preload，打包成单文件）：把共用引擎挂到 body 上，宿主能力全部走固定 IPC。
// 主进程是事实源：标签、账号、设置、更新、插件的状态都由它推；这里只画、只转发动作。
import electron_ = require('electron');
const { ipcRenderer } = electron_;
import mountChrome = require('./chrome/engine');
import icons = require('./chrome/icons');
import SPEC = require('./chrome/tab-spec');

window.addEventListener('DOMContentLoaded', () => {
  const init = ipcRenderer.sendSync('jnd-chrome-init') || {};
  const settings = init.settings || { restore: true, confirmClose: true, muteNew: false, manager: true, stats: true };
  const accounts: any[] = init.accounts || [], plugins: any[] = init.plugins || [], upds: any[] = init.upds || [], closed: any[] = init.closed || [];
  const send = (channel: string, ...args: any[]) => { try { ipcRenderer.send(channel, ...args); } catch (_) {} };
  const call = (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args);
  const api = mountChrome({ S: icons.SVG, ICON: document.body.dataset.icon || '', SPEC, host: {
    desk: () => document.body,
    openExternal: url => send('jnd-chrome-open-external', url),
    data: { settings, accounts, plugins, upds, closed },
    closed: { forget: c => send('jnd-chrome-closed', { type: 'forget', slot: c.slot }) },
    tabs: {
      open: (t, extra) => send('jnd-chrome-tab', { type: 'open', id: t.id, entry: t.entry, provider: t.provider, slot: extra?.slot, account: extra?.account, adopt: extra?.adopt, restored: extra?.restored }),
      detach: (t, at) => send('jnd-chrome-tab', { type: 'detach', id: t.id, ...at }),
      carry: at => send('jnd-chrome-tab', { type: 'carry', ...at }),
      dragEnd: () => send('jnd-chrome-tab', { type: 'dragEnd' }),
      close: t => send('jnd-chrome-tab', { type: 'close', id: t.id }),
      activate: t => send('jnd-chrome-tab', { type: 'activate', id: t.id, kind: t.kind }),
      order: ids => send('jnd-chrome-tab', { type: 'order', ids }),
      nav: (t, action) => send('jnd-chrome-tab', { type: 'nav', id: t.id, action }),
      mute: (t, muted) => send('jnd-chrome-tab', { type: 'mute', id: t.id, muted }),
      entry: (t, entry, opts) => send('jnd-chrome-tab', { type: 'entry', id: t.id, entry, logout: Boolean(opts?.logout) }),
      provider: (t, provider, opts) => send('jnd-chrome-tab', { type: 'provider', id: t.id, provider, logout: Boolean(opts?.logout) }),
    },
    window: { command: (cmd, reason) => send('jnd-chrome-window', cmd, reason), dragStart: at => send('jnd-chrome-window', { cmd: 'dragStart', ...at }), dragEnd: () => send('jnd-chrome-window', { cmd: 'dragEnd' }) },
    cover: full => send('jnd-chrome-cover', full),
    settings: { set: (key, value) => send('jnd-chrome-settings', { key, value }), logoutAll: () => call('jnd-chrome-logout-all') },
    accounts: {
      // 账号行的 uid 字段在壳里装的是入口 id（主进程给的），account 是定位记录用的旧值
      update: (a, key, value) => send('jnd-chrome-account', { type: 'update', entryId: a.uid, account: a.account, key, value }),
      remove: a => send('jnd-chrome-account', { type: 'remove', entryId: a.uid, account: a.account }),
      clear: () => send('jnd-chrome-account', { type: 'clear' }),
    },
    plugins: {
      setEnabled: (p, on) => send('jnd-chrome-plugin', { type: 'enable', id: p.id, enabled: on }),
      check: p => call('jnd-chrome-plugin-check', p.id),
      remove: p => send('jnd-chrome-plugin', { type: 'remove', id: p.id }),
      install: source => call('jnd-chrome-plugin-install', source),
      pickFile: () => call('jnd-chrome-plugin-pick'),
    },
    updates: { check: u => send('jnd-chrome-update', { type: 'check', name: u.name }), download: u => send('jnd-chrome-update', { type: 'download', name: u.name }), restart: u => send('jnd-chrome-update', { type: 'restart', name: u.name }) },
    ...(init.feedback ? { feedback: { upload: (note: string) => call('jnd-chrome-feedback', note) } } : {}),
  } });
  // 主进程回推
  ipcRenderer.on('jnd-chrome-tab-state', (_e, id: number, patch: any) => api.updateTab(id, patch));
  ipcRenderer.on('jnd-chrome-data', (_e, kind: 'settings' | 'accounts' | 'plugins' | 'upds' | 'closed', data: any) => { api.setData(kind as any, data); if (kind === 'closed') api.renderAll(); });
  ipcRenderer.on('jnd-chrome-toast', (_e, text: string) => api.toast(String(text || '')));
  ipcRenderer.on('jnd-chrome-window-state', (_e, state: any) => api.setWindow(state));
  ipcRenderer.on('jnd-chrome-size', (_e, width: number, height: number) => api.setSize(width, height));
  ipcRenderer.on('jnd-chrome-command', (_e, name: string) => api.command(name));
  ipcRenderer.on('jnd-chrome-close-request', () => api.requestClose());
  ipcRenderer.on('jnd-chrome-adopt', (_e, info: any) => api.adoptAt(info, Number(info?.x) || 0)); // info.provider＝第三方方式的菜单文案，chip 显示其简称
  /* 扫码卡由引擎画：open／update／close 三个动作；取消与重试回宿主 */
  ipcRenderer.on('jnd-chrome-qr', (_e, m: any) => {
    const tabId = Number(m.id);
    if (!Number.isInteger(tabId)) return;
    if (m.action === 'close') { api.closeQr(tabId); return; }
    const model = { provider: String(m.provider || ''), stage: m.stage, qr: String(m.qr || ''), text: String(m.text || ''), code: String(m.code || ''), retry: Number(m.retry) || 0 };
    if (m.action === 'open') api.qrPrompt(model, () => send('jnd-chrome-qr-cancel', { id: m.id }), () => send('jnd-chrome-qr-retry', { id: m.id }), tabId); else if (m.action === 'update') api.updateQr(model, tabId);
  });
  ipcRenderer.on('jnd-chrome-save-prompt', (_e, m: any) => api.savePrompt({ account: String(m.account || ''), password: String(m.password || ''), mode: m.mode === 'changed' ? 'changed' : 'new' }, r => send('jnd-chrome-save-result', { entryId: m.entryId, ...r }), m.id === undefined ? undefined : Number(m.id)));
  // 建窗：恢复的标签或一个默认标签；标签 id 由引擎分配，宿主按 open 消息建视图
  const w = api.makeWin([]);
  const restore: Array<{ entry: string; slot?: number; provider?: string | null; adopt?: boolean; nick?: string; muted?: boolean; kind?: string }> = Array.isArray(init.tabs) && init.tabs.length ? init.tabs : [{ entry: init.defaultEntry || '官服' }];
  for (const r of restore) { if (r.kind && r.kind !== 'game') { api.openTab(w, api.makeTab({ kind: r.kind as any })); continue; } api.openTab(w, api.makeTab({ entry: r.entry, provider: r.provider || null, nick: r.nick || '', muted: r.adopt ? Boolean(r.muted) : Boolean(settings.muteNew) }), undefined, { slot: r.slot, adopt: r.adopt, restored: !r.adopt }); }
  if (Number.isInteger(init.cur) && w.tabs[init.cur]) w.cur = w.tabs[init.cur].id;
  api.setSize(Number(init.width) || window.innerWidth, Number(init.height) || window.innerHeight); // 含首次渲染
  api.setWindow({ maximized: Boolean(init.maximized), focused: init.focused !== false, fullscreen: Boolean(init.fullscreen) });
  send('jnd-chrome-ready');
});
