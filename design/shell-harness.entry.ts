'use strict';
// 壳 1:1 harness 的页面脚本：把共用引擎挂到 #desk 上，喂示例数据；由 build-shell-harness.js 用 esbuild 打成一段脚本。
import mountChrome = require('../src/core/chrome/engine');
import icons = require('../src/core/chrome/icons');
import SPEC = require('../src/core/chrome/tab-spec');
declare const ICON: string; // 产品图标 data URL，由 builder 注入

const settings = { restore: true, confirmClose: true, muteNew: false, manager: true, stats: true };
const accounts = [
  { entry: '官服', nick: '范例玩家甲', uid: '10000001', account: 'demo_user_01', password: 'demo-password-01', via: '账号密码', last: '今天 14:02' },
  { entry: '官服', nick: '范例玩家乙七个字', uid: '10000002', account: '13800000000', password: 'demo-password-02', via: '账号密码', last: '昨天' },
  { entry: '4399', nick: '小号二', uid: '77120011', account: '', password: '', via: '渠道登录', last: '3 天前' },
  { entry: '哔哩哔哩', nick: '范例玩家丙', uid: '10000003', account: '', password: '', via: 'bilibili 扫码', last: '10 月 9 日' },
];const plugins = [
  // 小抄的更新地址来自它 @namespace 指向的 Greasy Fork 脚本页（dist 头部没写 @updateURL，按 Greasy Fork 约定拼）
  { id: 'daxiaochao', name: '三国杀打小抄一将成名', version: '1.19.5', source: 'https://greasyfork.org/scripts/448004', updateUrl: 'https://greasyfork.org/scripts/448004/code/daxiaochao.user.js', date: '10 月 12 日', enabled: true },
  { id: 'ddz-assist', name: '斗地主助手', version: '1.0.1', source: 'https://sh-sgs.net/ddz-assist.user.js', updateUrl: 'https://sh-sgs.net/ddz-assist.user.js', date: '10 月 9 日', enabled: true }];const closed = [{ slot: 9, entry: '官服', provider: null, nick: '范例玩家丁', closedAt: '10 分钟前' }];
const upds = [
  { name: '客户端', current: 'Zephyr 26.0.0', latest: 'Zephyr 26.0.1', state: 'available', progress: 0, checked: '今天 14:02', restart: true },
  { name: '锦囊妙计', current: '1.7.1', latest: '1.7.1', state: 'latest', progress: 0, checked: '今天 14:02', restart: false }];
const LIVE = !new URLSearchParams(location.search).has('noframe'); // 官服标签真实嵌入 web.sanguosha.com；离屏渲染用 ?noframe 关掉
const ENTRY_URL: Record<string, string> = { '官服': 'https://web.sanguosha.com/login/x/index' };
const api = mountChrome({ S: icons.SVG, ICON, SPEC, host: {
  desk: () => document.getElementById('desk') as HTMLElement,
  openExternal: url => { window.open(url, '_blank', 'noopener'); },
  liveUrl: entry => (LIVE ? ENTRY_URL[entry] : undefined),
  data: { settings, accounts: accounts as any, plugins: plugins as any, upds: upds as any, closed: closed as any },
  feedback: { upload: async () => ({ id: Math.random().toString(36).slice(2, 6).toUpperCase() }) }, // harness：假上传，只为了反馈行在
} });
// 离屏探针与控制台直接用这些全局
Object.assign(window as any, api, { settings, accounts, plugins, upds, closedTabs: closed }); // window.closed 是只读属性，不能用这个名
api.makeWin([api.makeTab({ entry: '官服', nick: '范例玩家甲', audible: true, hist: [1, 0] }), api.makeTab({ entry: '4399', nick: '小号二' }), api.makeTab({ entry: '官服', hist: [2, 0] })]);
api.renderAll();
