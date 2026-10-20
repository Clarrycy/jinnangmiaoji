'use strict';
// 壳 chrome 引擎：标签栏状态／布局／渲染／拖动、弹层、内页（账号／设置／更新／关于）、对话框与提示条。
// 不碰宿主：窗口操作、外链、数据都从 host 来。design/shell-harness 与 Electron 壳共用这一份。
import BRAND_ICON = require('./brand-icons');
import jsQR = require('jsqr');
import qrcodegen = require('qrcode-generator');
type Settings = { restore: boolean; confirmClose: boolean; muteNew: boolean; manager: boolean; stats: boolean };
type UserScript = { id: string; name: string; version: string; source: string; updateUrl?: string; date: string; enabled: boolean; builtin?: boolean; note?: string };
type UpdState = 'latest' | 'available' | 'downloading' | 'ready';
type UpdRow = { name: string; current: string; latest: string; state: UpdState; progress: number; checked: string; restart: boolean };
type ClosedTab = { slot: number; entry: string; provider: string | null; nick: string; closedAt: string };
type Host = {
  desk(): HTMLElement;                        // 窗口 DOM 的容器（harness：#desk；壳：body）
  openExternal(url: string): void;            // 外链在系统浏览器打开
  liveUrl?(entry: string): string | undefined; // harness：官服标签真实嵌入的地址；壳不用
  data: { settings: Settings; accounts: Account[]; plugins: UserScript[]; upds: UpdRow[]; closed?: ClosedTab[] }; // closed：最近关闭、带登录态的标签（容器还留着）
  // 以下都是壳才有的宿主能力；没有时引擎走 harness 的演示行为
  tabs?: { open(t: Tab, extra?: { slot?: number; account?: string; adopt?: boolean; restored?: boolean }): void; close(t: Tab): void; activate(t: Tab): void; order?(ids: number[]): void; nav(t: Tab, action: 'back' | 'fwd' | 'reload' | 'stop'): void; mute(t: Tab, muted: boolean): void; entry(t: Tab, entry: string, opts?: { logout?: boolean }): void; provider(t: Tab, provider: string, opts?: { logout?: boolean }): void; qrCancel?(t: Tab): void; detach?(t: Tab, at: { x: number; y: number; grabX: number; kind: string }): void; carry?(at: { x: number; y: number; kind: string }): void; dragEnd?(): void };
  closed?: { forget(c: ClosedTab): void };
  window?: { command(cmd: 'minimize' | 'maximize' | 'close', reason?: string): void; dragStart?(at: { x: number; y: number }): void; dragEnd?(): void };   // 右上三键；标题栏空白处拖窗由宿主跟鼠标
  cover?(full: boolean): void;                 // 壳：chrome 视图要不要盖住游戏区（弹层／对话框／内页打开时）
  settings?: { set(key: keyof Settings, value: boolean): void; logoutAll(): void | Promise<void> };
  accounts?: { update(a: Account, key: 'account' | 'password', value: string): void; remove(a: Account): void; clear(): void };
  plugins?: { setEnabled(p: UserScript, on: boolean): void; check(p: UserScript): Promise<{ updated: boolean; from?: string; version?: string }>; remove(p: UserScript): void; install(source: string): Promise<{ name: string; updated: boolean; from?: string; version: string }>; pickFile?(): Promise<string | undefined> };
  updates?: { check(u: UpdRow): void; download(u: UpdRow): void; restart(u: UpdRow): void };
  feedback?: { upload(note: string): Promise<{ id: string }> };
};
/* 壳 harness 页面脚本（TypeScript）。构建器注入 ICON（产品图标 data URL）、S（图标表）、SPEC（尺寸规格），再用 esbuild 转成页面脚本。
 * 结构：状态 → 布局（纯函数）→ 渲染（按 id 复用 DOM）→ 拖动状态机 → 弹层 → 页面 → 启动。
 * 每一层只依赖上一层；DOM 只在渲染层和弹层里出现。落 Electron 时状态／布局层原样搬，渲染层换成 WebContentsView。 */
declare const ICON: string;
declare const S: Record<string, string>;
declare const SPEC: { bar: number; tabTop: number; tab: number; radius: number; pill: number; pillGap: number; pillSide: number; padL: number; padR: number; icon: number; chip: number; ctl: number; gap: number; sep: { w: number; h: number }; newTab: number; nav: number; caption: { w: number; h: number; pillW: number; pillH: number } };

// ===== 类型 =====
type Tab = { id: number; kind: 'game' | 'pm' | 'settings' | 'update' | 'about'; entry: string; provider: string | null; nick: string; audible: boolean; muted: boolean; hist: [number, number]; loading: boolean; born: boolean; mem?: number; slot?: number; account?: string; status?: 'none' | 'landing' | 'game' };
type Win = { id: number; float: boolean; x: number; y: number; scroll: number; lastCur: number | null; tabs: Tab[]; cur: number | null; sentCur?: number | null; sentOrder?: string };
type Layout = { width: number; leftGap: number; avail: number; overflow: boolean; total: number; lefts: number[]; newTabLeft: number; sizeClass: string; stripWidth?: number };
type Account = { entry: string; nick: string; uid: string; account: string; password: string; via: string; last: string };
type DragState = { w: Win; t: Tab; el: HTMLElement | null; grabX: number; x0: number; y0: number; moved: boolean; carry: { w: Win; el: HTMLElement; offX: number; offY: number } | null; onClick: (() => void) | null; detached?: boolean };

function mountChrome(opts: { S: Record<string, string>; ICON: string; SPEC: any; host: Host }) {
  const { S, ICON, SPEC, host } = opts;
// ===== 0 常量 =====
const ENTRIES = ['官服', '4399', 'QQ 大厅', '7K7K', '百度', '360'];
const PROVIDERS = ['WeGame - QQ', 'WeGame - 微信', 'bilibili 扫码登录', 'Steam 扫码登录', 'OPPO 扫码登录', '小米扫码登录', 'VIVO 扫码登录', '华为扫码登录', '荣耀扫码登录', 'Steam 官方登录（账号密码 / Steam Guard）', 'OPPO 官方登录（账号密码 / 短信 / 扫码）', '小米官方登录（账号密码 / 短信）', 'VIVO 官方登录（账号密码 / 短信 / 扫码）'];
const PROVIDER_CHIP = { 'WeGame - QQ': 'WeGame', 'WeGame - 微信': 'WeGame', 'bilibili 扫码登录': '哔哩哔哩', 'Steam 扫码登录': 'Steam', 'OPPO 扫码登录': 'OPPO', '小米扫码登录': '小米', 'VIVO 扫码登录': 'VIVO', '华为扫码登录': '华为', '荣耀扫码登录': '荣耀', 'Steam 官方登录（账号密码 / Steam Guard）': 'Steam', 'OPPO 官方登录（账号密码 / 短信 / 扫码）': 'OPPO', '小米官方登录（账号密码 / 短信）': '小米', 'VIVO 官方登录（账号密码 / 短信 / 扫码）': 'VIVO' };
const TAB_MAX = 240, STRIP_PAD = 6, BAR = SPEC.bar, LIST_BTN = 32, NEW_BTN = 44, DETACH_DY = 28, DRAG_SLOP = 3;
const NICKS = ['范例玩家甲', '范例玩家乙', '范例玩家丙', '小号二', '小号三']; /* harness 里新标签的假昵称；不要放真实玩家名 */
const settings = host.data.settings;
const q = (root: ParentNode, sel: string) => root.querySelector(sel) as HTMLInputElement; // 页内元素都按最宽的控件类型用

// ===== 1 状态（纯数据，不碰 DOM） =====
let nextTabId = 1, nextWinId = 1;
const wins: Win[] = [];
function makeTab(p: Partial<Tab> = {}): Tab { return { id: nextTabId++, kind: 'game', entry: '官服', provider: null, nick: '', audible: false, muted: false, hist: [0, 0], loading: false, born: false, ...p }; }
function makeWin(tabs: Tab[], p: Partial<Win> = {}): Win { const w: Win = { id: nextWinId++, float: false, x: 0, y: 0, scroll: 0, lastCur: null, tabs, cur: tabs[0]?.id ?? null, ...p }; wins.push(w); return w; }
const winOf = (t: Tab) => wins.find(w => w.tabs.includes(t));
const curTab = (w: Win): Tab => w.tabs.find(t => t.id === w.cur) || w.tabs[0];
// 标题四档：有昵称显示昵称；落地页已登录但没昵称（渠道号还没进过游戏）显示「已登录」；其余「未登录」。文案草稿
const tabLabel = (t: Tab) => t.kind === 'game' ? (t.nick || (t.status === 'landing' ? '已登录' : '未登录')) : PAGE_TITLE[t.kind];
const allMuted = () => wins.flatMap(w => w.tabs).filter(t => t.kind === 'game').every(t => t.muted);
function insertTab(w: Win, t: Tab, index = w.tabs.length) { w.tabs.splice(index, 0, t); w.cur = t.id; }
// 新建标签（与 insertTab 的区别：这是一个全新的标签，要告诉宿主建游戏视图；拖拽并入用 insertTab）
function openTab(w: Win, t: Tab, index = w.tabs.length, extra?: { slot?: number; account?: string; adopt?: boolean; restored?: boolean }) {
  if (t.kind !== 'game') { const had = w.tabs.find(x => x.kind !== 'game'); if (had) { had.kind = t.kind; w.cur = had.id; return had; } }
  insertTab(w, t, index); if (t.kind === 'game') host.tabs?.open(t, extra); return t;
}
function removeTab(w: Win, t: Tab, opts: { detach?: boolean } = {}) { // 从窗口摘除；窗口空了：壳里关窗（Chrome 规则），harness 里销毁非主窗口或补一个新标签
  const i = w.tabs.indexOf(t); if (i < 0) return i; w.tabs.splice(i, 1); if (t.kind === 'game' && !opts.detach) host.tabs?.close(t);
  if (w.cur === t.id && w.tabs.length) w.cur = w.tabs[Math.min(i, w.tabs.length - 1)].id;
  if (!w.tabs.length) { if (host.window) host.window.command('close', `last-tab-removed:${t.id}:${opts.detach ? 'detach' : 'close'}`); else if (wins.length > 1) destroyWin(w); else openTab(w, makeTab({ born: true })); }
  return i;
}
function destroyWin(w: Win) { const i = wins.indexOf(w); if (i >= 0) wins.splice(i, 1); (document.querySelector(`.win[data-win="${w.id}"]`) as HTMLElement | null)?.remove(); }
function moveTab(w: Win, t: Tab, toIndex: number) { const i = w.tabs.indexOf(t); if (i < 0 || i === toIndex) return; w.tabs.splice(i, 1); w.tabs.splice(toIndex, 0, t); }
function newTabAfter(w: Win, t: Tab) { const n = makeTab({ entry: t.entry, provider: t.provider, born: true }); openTab(w, n, w.tabs.indexOf(t) + 1); return n; }
// 关闭窗口：多个标签且设置要求确认时先问；宿主在就交给宿主，否则 harness 里只销毁非主窗口
function closeWindow(w: Win, reason = 'caption') {
  const go = () => { if (host.window) host.window.command('close', reason); else if (wins.length > 1) destroyWin(w); };
  if (settings.confirmClose && w.tabs.length >= 2) confirmCloseWindow(w.tabs.length, go); else go();
}
// 壳：chrome 视图盖住游戏区的理由集合；任一理由在就盖
const coverReasons = new Set<string>(); let coverSent = false;
function setCover(reason: string, on: boolean) { if (on) coverReasons.add(reason); else coverReasons.delete(reason); const full = coverReasons.size > 0; if (full !== coverSent) { coverSent = full; host.cover?.(full); } }

// ===== 2 布局（纯函数：窗口状态 + 条宽 → 每个标签的位置） =====
const chipWidthCache: Record<string, number> = {}; let chipProbe: HTMLElement | null = null;
function chipWidth(label: string): number { // 服名 chip 的实际宽度：隐藏探针量一次
  if (chipWidthCache[label]) return chipWidthCache[label];
  if (!chipProbe) { chipProbe = document.createElement('div'); chipProbe.className = 'tab'; chipProbe.style.cssText = 'visibility:hidden;pointer-events:none;left:-9999px;width:auto'; chipProbe.innerHTML = `<span class="entry"><span class="el"></span>${S.caret}</span>`; document.body.append(chipProbe); }
  q(chipProbe, '.el').textContent = label;
  return chipWidthCache[label] = Math.ceil(q(chipProbe, '.entry').getBoundingClientRect().width);
}
function minTabWidth(w: Win): number { // 最窄：内缩 + 内边距 + 图标 + 间距 + 最宽服名 + 间距 + 声音 + × + 内边距
  const widest = Math.max(0, ...w.tabs.filter(t => t.kind === 'game').map(t => chipWidth(t.entry)));
  return SPEC.pillSide * 2 + SPEC.padL + SPEC.icon + SPEC.gap + widest + 8 + SPEC.ctl + SPEC.ctl + SPEC.padR;
}
/* 标签列表按钮什么时候在：≥2 个标签，或有「最近关闭」。布局占位与按钮显隐必须同一判据，否则「+」会给一个不存在的按钮让位 */
function hasList(w: Win): boolean { return w.tabs.length >= 2 || (host.data.closed?.length || 0) > 0; }
function layout(w: Win, stripWidth: number): Layout {
  const n = w.tabs.length, leftGap = hasList(w) ? LIST_BTN : 0, min = minTabWidth(w);
  let avail = stripWidth - leftGap - STRIP_PAD - NEW_BTN;
  let width = Math.max(min, Math.min(TAB_MAX, Math.floor(avail / n)));
  const overflow = n * width > avail;
  if (overflow) { width = min; avail = stripWidth - leftGap - NEW_BTN - 4; }
  const total = n * width + STRIP_PAD;
  w.scroll = overflow ? Math.max(0, Math.min(w.scroll, total - avail)) : 0;
  return { width, leftGap, avail, overflow, total, lefts: w.tabs.map((_, i) => STRIP_PAD + i * width), newTabLeft: leftGap + STRIP_PAD + n * width + 8, sizeClass: width >= 200 ? '' : width >= 160 ? 'w-mid' : 'w-narrow' };
}
function scrollToActive(w: Win, L: Layout): Layout { // 活动标签换了就滚到可见
  if (!L.overflow || w.cur === w.lastCur) { w.lastCur = w.cur; return L; }
  const i = w.tabs.findIndex(t => t.id === w.cur), l = i * L.width, r = l + L.width + STRIP_PAD;
  if (l < w.scroll) w.scroll = l; else if (r > w.scroll + L.avail) w.scroll = r - L.avail;
  w.lastCur = w.cur; return layout(w, L.stripWidth ?? (L.avail + L.leftGap + NEW_BTN + (L.overflow ? 4 : STRIP_PAD)));
}

// ===== 3 渲染（每窗口一棵 DOM，按 data-id 复用） =====
const WIN_HTML = `<header>
  <div class="nav"><button class="ib back" data-tip="后退" data-key="Alt+←">${S.back}</button><button class="ib fwd" data-tip="前进" data-key="Alt+→">${S.fwd}</button><button class="ib reload" data-tip="刷新" data-key="Ctrl+R">${S.reload}</button></div>
  <div class="tabs"><button class="ib tablist" data-tip="所有标签页" data-key="Ctrl+Shift+A">${S.chevDown}</button><div class="clip"><div class="rail"></div></div><button class="ib newtab" data-tip="新标签页" data-key="Ctrl+T">${S.plus}</button></div>
  <div class="caption"><span class="more" data-tip="菜单" data-key="Alt+F">${S.menu}<span class="dot"></span></span><span class="mn" data-tip="最小化">${S.min}</span><span class="mx" data-tip="最大化">${S.max}</span><span class="cx" data-tip="关闭" data-key="Alt+F4">${S.x}</span></div>
</header>
<div id="viewport"><div class="game"></div><div class="pg" hidden></div></div>
<div class="menu entrymenu" hidden></div><div class="menu submenu" hidden></div>
<div class="amenu" hidden><div class="item" data-act="pm"><i>${S.person}</i><span>账号</span><span class="hint">Ctrl+Shift+M</span></div><div class="item" data-act="settings"><i>${S.sliders}</i><span>设置</span><span class="hint">Ctrl+Shift+S</span></div><div class="sep"></div><div class="item" data-act="update"><i>${S.update}</i><span>更新</span><i class="dot2"></i></div><div class="item" data-act="about"><i>${S.info}</i><span>关于</span></div></div>`;
// 新建标签生长期的裁切：内容裁在标签盒内，底部两只脚（盒外各 radius）放行，圆角与 S 形从第一帧就在
const BORN_CLIP = `polygon(0 0, 100% 0, 100% calc(100% - ${SPEC.radius}px), calc(100% + ${SPEC.radius}px) calc(100% - ${SPEC.radius}px), calc(100% + ${SPEC.radius}px) 100%, -${SPEC.radius}px 100%, -${SPEC.radius}px calc(100% - ${SPEC.radius}px), 0 calc(100% - ${SPEC.radius}px))`;
const TAB_GAME = `<i class="pill"></i><span class="sep"></span><img class="fav" src="${ICON}" draggable="false"><span class="entry" data-tip="切换渠道服"><span class="el"></span>${S.caret}</span><span class="t"></span><span class="snd" hidden></span><span class="x" data-tip="关闭" data-key="Ctrl+W">${S.close}</span>`;
const tabPageHtml = (t: Tab) => `<i class="pill"></i><span class="sep"></span><span class="fav page">${S[PAGE_ICON[t.kind as PageKind]]}</span><span class="t"></span><span class="x" data-tip="关闭" data-key="Ctrl+W">${S.close}</span>`;

function winEl(w: Win): HTMLElement {
  let el = document.querySelector(`.win[data-win="${w.id}"]`) as HTMLElement | null;
  if (!el) {
    el = document.createElement('div'); el.className = 'win' + (w.float ? ' float' : ''); el.dataset.win = String(w.id); el.innerHTML = WIN_HTML; host.desk().append(el);
    q(el, '.back').onclick = () => { const t = curTab(w); if (host.tabs) { host.tabs.nav(t, 'back'); return; } t.hist = [t.hist[0] - 1, t.hist[1] + 1]; render(w); };
    q(el, '.fwd').onclick = () => { const t = curTab(w); if (host.tabs) { host.tabs.nav(t, 'fwd'); return; } t.hist = [t.hist[0] + 1, t.hist[1] - 1]; render(w); };
    q(el, '.reload').onclick = () => { const t = curTab(w); if (host.tabs) { host.tabs.nav(t, t.loading ? 'stop' : 'reload'); return; } const f = el.querySelector(`iframe[data-id="${t.id}"]`) as HTMLIFrameElement | null; if (f) { f.src = f.src; return; } t.loading = !t.loading; render(w); if (t.loading) setTimeout(() => { t.loading = false; render(w); }, 1500); };
    q(el, '.newtab').onclick = () => { openTab(w, makeTab({ entry: curTab(w).entry || '官服', provider: curTab(w).provider, born: true })); render(w); };
    q(el, '.tablist').onclick = e => { e.stopPropagation(); toggleTabList(w); };
    q(el, '.tabs').addEventListener('wheel', (e: WheelEvent) => { const L = layout(w, q(el, '.tabs').clientWidth); if (!L.overflow) return; e.preventDefault(); w.scroll += (e.deltaY || e.deltaX); render(w); }, { passive: false });
    q(el, '.more').onclick = e => { e.stopPropagation(); const m = q(el, '.amenu'); const open = m.hidden; closeAll(); m.hidden = !open; setCover('menu', open); };
    q(el, '.amenu').onclick = e => { e.stopPropagation(); const it = (e.target as Element).closest('.item') as HTMLElement | null; closeAll(); const act = it?.dataset.act; if (act) openPage(w, act as PageKind); };
    q(el, '.caption .cx').onclick = () => closeWindow(w);
    q(el, '.caption .mn').onclick = () => host.window?.command('minimize');
    q(el, '.caption .mx').onclick = () => host.window?.command('maximize');
    // 标题栏空白处拖窗：壳里由宿主跟着鼠标移动窗口（pointerup 仍会送到按下的视图，所以松手能收到）；harness 自己拖
    q(el, 'header').addEventListener('pointerdown', e => { const tg = e.target as Element; if (e.button !== 0 || tg.closest('.tab,.ib,.caption span,.menu,.amenu')) return; if (host.window) { if (!host.window.dragStart) return; host.window.dragStart({ x: e.screenX, y: e.screenY }); const up = () => { window.removeEventListener('pointerup', up); host.window!.dragEnd?.(); }; window.addEventListener('pointerup', up); return; } winDrag.start(e, w); });
  }
  if (w.float) { el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; }
  return el;
}
function render(w: Win) {
  const el = winEl(w), strip = q(el, '.tabs'), rail = q(strip, '.rail');
  let L = layout(w, strip.clientWidth); L.stripWidth = strip.clientWidth; L = scrollToActive(w, L);
  strip.classList.toggle('overflow', L.overflow); strip.classList.toggle('multi', hasList(w));
  rail.style.transform = `translateX(${-w.scroll}px)`; rail.parentElement.classList.toggle('scrolled', w.scroll > 0);
  const seen = new Set();
  w.tabs.forEach((t, i) => {
    let d = q(rail, `.tab[data-id="${t.id}"]`) as HTMLElement | null;
    if (!d) { d = document.createElement('div'); d.dataset.id = String(t.id); d.style.left = L.lefts[i] + 'px'; d.style.width = t.born ? '0px' : L.width + 'px'; if (t.born) d.style.clipPath = BORN_CLIP; rail.append(d); d.getBoundingClientRect(); if (t.born) { t.born = false; setTimeout(() => { d.style.clipPath = ''; }, 220); } bindTab(d, w, t); }
    seen.add(d);
    d.className = `tab ${t.id === w.cur ? 'on' : ''} ${d.classList.contains('drag') ? 'drag' : ''} ${d.classList.contains('ctx') ? 'ctx' : ''} ${L.sizeClass}`.replace(/\s+/g, ' ').trim();
    if (!d.classList.contains('drag')) d.style.left = L.lefts[i] + 'px';
    d.style.width = L.width + 'px';
    const html = t.kind === 'game' ? TAB_GAME : tabPageHtml(t); if (d.dataset.html !== html) { d.innerHTML = html; d.dataset.html = html; }
    q(d, '.t').textContent = tabLabel(t); q(d, '.t').classList.toggle('dim', t.kind === 'game' && !t.nick);
    if (t.kind === 'game') { q(d, '.el').textContent = t.entry; const snd = q(d, '.snd'); const on = t.audible || t.muted; snd.hidden = !on; if (on) { snd.innerHTML = t.muted ? S.volOff : S.volUp; snd.dataset.tip = t.muted ? '取消静音' : '静音此标签页'; } }
  });
  for (const d of [...rail.querySelectorAll('.tab')]) if (!seen.has(d)) { d.remove(); el.querySelector(`.game iframe[data-id="${(d as HTMLElement).dataset.id}"]`)?.remove(); }
  const nt = q(strip, '.newtab'); nt.classList.toggle('pin', L.overflow); if (!L.overflow) nt.style.left = L.newTabLeft + 'px';
  const t = curTab(w);
  if (!t) { syncCardTabs(w); return; } /* 最后一个标签刚关掉、窗口正在关：没有当前标签可画（原来这里读 undefined.id 抛错） */
  if (host.tabs) { // 宿主：活动标签与顺序只在变化时报
    if (w.sentCur !== t.id) { w.sentCur = t.id; host.tabs.activate(t); }
    const order = w.tabs.map(x => x.id).join(','); if (w.sentOrder !== order) { w.sentOrder = order; host.tabs.order?.(w.tabs.map(x => x.id)); }
  }
  setCover('page', t.kind !== 'game');
  const hasUpdate = upds.some(u => u.state === 'available' || u.state === 'ready'); q(el, '.more .dot').hidden = !hasUpdate; q(el, '.amenu .dot2').hidden = !hasUpdate; // ≡ 与「更新」项的蓝点只在有可装的更新时亮
  q(el, '.back').disabled = !t.hist[0]; q(el, '.fwd').disabled = !t.hist[1]; q(el, '.reload').innerHTML = t.loading ? S.stop : S.reload;
  q(el, '.pg').hidden = t.kind === 'game'; q(el, '.game').hidden = t.kind !== 'game'; q(el, '#viewport').classList.toggle('page', t.kind !== 'game');
  if (t.kind === 'game') { const g = q(el, '.game'); const url = host.liveUrl ? host.liveUrl(t.entry) : undefined;
    for (const f of g.querySelectorAll('iframe')) (f as HTMLElement).hidden = f.getAttribute('data-id') !== String(t.id);
    let ph = g.querySelector('.ph') as HTMLElement | null; if (!ph) { ph = document.createElement('span'); ph.className = 'ph'; g.append(ph); }
    if (url) { let f = g.querySelector(`iframe[data-id="${t.id}"]`) as HTMLIFrameElement | null; if (!f) { f = document.createElement('iframe'); f.dataset.id = String(t.id); f.src = url; f.setAttribute('allow', 'autoplay; fullscreen; clipboard-write'); g.append(f); } f.hidden = false; ph.hidden = true; }
    else { ph.hidden = false; ph.textContent = `${t.entry}  ${t.nick || '未登录'}${t.muted ? '  已静音' : t.audible ? '  正在播放声音' : ''}`; } }
  if (t.kind !== 'game') renderPage(w, t);
  syncCardTabs(w);
}
const renderAll = () => wins.forEach(render);
function bindTab(d: HTMLElement, w: Win, t: Tab) {
  d.addEventListener('pointerdown', e => { const target = e.target as Element; if (e.button !== 0 || target.closest('.x,.snd')) return; const chip = target.closest('.entry'); const reopen = Boolean(chip) && !chip!.classList.contains('open'); w.cur = t.id; closeAll(); render(w); drag.start(e, w, t, reopen ? () => openEntryMenu(w, t) : null); }); /* 入口菜单开着时再点小片＝关，不重开 */
  d.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); openTabMenu(w, t, e.clientX, e.clientY); d.classList.add('ctx'); });
  d.addEventListener('click', e => { const target = e.target as Element; const x = target.closest('.x'), snd = target.closest('.snd'); if (x) { e.stopPropagation(); removeTab(w, t); closeAll(); renderAll(); } else if (snd) { e.stopPropagation(); t.muted = !t.muted; host.tabs?.mute(t, t.muted); renderAll(); } });
  q(d, '.entry')?.addEventListener('click', e => e.stopPropagation());
}

function floatify(w: Win, el: HTMLElement) { // 固定在桌面上的主窗口被拖动时转成浮动窗口（harness 用；真实壳里就是移动窗口）
  if (w.float) return; const r = el.getBoundingClientRect(), d = host.desk().getBoundingClientRect(); w.float = true; w.x = r.left - d.left; w.y = r.top - d.top; el.classList.add('float'); el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
}
const winDrag = { // 按住标题栏空白处拖整窗（对应 -webkit-app-region: drag）
  start(e: PointerEvent, w: Win) { const el = winEl(w); floatify(w, el); const d = host.desk().getBoundingClientRect(); const offX = e.pageX - d.left - w.x, offY = e.pageY - d.top - w.y; let raf = 0; const move = (ev: PointerEvent) => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; w.x = ev.pageX - d.left - offX; w.y = ev.pageY - d.top - offY; el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; }); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); },
};
// ===== 4 拖动状态机：press → reorder → carry（脱出成窗）→ attach（并入别的窗口） =====
const drag = {
  s: null as DragState | null,
  start(e: PointerEvent, w: Win, t: Tab, onClick: (() => void) | null) {
    const el = document.querySelector(`.win[data-win="${w.id}"] .tab[data-id="${t.id}"]`) as HTMLElement;
    this.s = { w, t, el, grabX: e.clientX - el.getBoundingClientRect().left, x0: e.clientX, y0: e.clientY, moved: false, carry: null, onClick };
    window.addEventListener('pointermove', this.move); window.addEventListener('pointerup', this.up);
  },
  raf: 0, pending: null as PointerEvent | null,
  move: (e: PointerEvent) => { drag.pending = e; if (!drag.raf) drag.raf = requestAnimationFrame(() => { drag.raf = 0; const ev = drag.pending; drag.pending = null; if (ev) drag._move(ev); }); }, up: () => { if (drag.pending) { drag._move(drag.pending); drag.pending = null; } drag._up(); },
  stripRect(w: Win) { return (document.querySelector(`.win[data-win="${w.id}"] .tabs`) as HTMLElement | null).getBoundingClientRect(); },
  _move(e: PointerEvent) {
    const s = this.s; if (!s) return;
    if (s.detached) return; // 已交给宿主拖成新窗口，这里只等 pointerup
    if (!s.moved && Math.abs(e.clientX - s.x0) < DRAG_SLOP && Math.abs(e.clientY - s.y0) < DRAG_SLOP) return; s.moved = true;
    if (s.carry) return this._carry(e);
    const sr = this.stripRect(s.w);
    if (Math.abs(e.clientY - (sr.top + BAR / 2)) > DETACH_DY) return this._detach(e);
    this._reorder(e, sr);
  },
  _reorder(e: PointerEvent, sr: DOMRect) { // 标签在条内跟手；越过邻居中点即换位，其余标签按曲线滑开
    const s = this.s, strip = (document.querySelector(`.win[data-win="${s.w.id}"] .tabs`) as HTMLElement | null); const L = layout(s.w, strip.clientWidth);
    const n = s.w.tabs.length, left = Math.max(STRIP_PAD, Math.min(STRIP_PAD + (n - 1) * L.width, e.clientX - sr.left - L.leftGap - s.grabX + s.w.scroll));
    s.el!.classList.add('drag'); s.el!.style.left = left + 'px';
    const idx = Math.round((left - STRIP_PAD) / L.width), ci = s.w.tabs.indexOf(s.t);
    if (idx !== ci) { moveTab(s.w, s.t, idx); render(s.w); }
  },
  _detach(e: PointerEvent) { // 从源窗口摘出，建同尺寸浮动窗口，抓点保持在鼠标下；只有一个标签的窗口直接整窗跟手
    const s = this.s, src = winEl(s.w), r = src.getBoundingClientRect();
    if (host.tabs) { // 壳：真窗口由宿主建并跟着鼠标走；单标签时拖的就是整个窗口（宿主跟鼠标，可并入别的窗口）
      if (s.w.tabs.length === 1) { s.el?.classList.remove('drag'); s.el!.style.left = ''; render(s.w); host.tabs.carry?.({ x: e.screenX, y: e.screenY, kind: s.t.kind }); s.detached = true; s.el = null; return; }
      if (!host.tabs.detach) { s.el?.classList.remove('drag'); return; }
      s.el?.classList.remove('drag'); removeTab(s.w, s.t, { detach: true }); render(s.w);
      host.tabs.detach(s.t, { x: e.screenX, y: e.screenY, grabX: s.grabX, kind: s.t.kind }); s.detached = true; s.el = null; return; // 内页标签也能拖出去，宿主按 kind 建窗
    }
    if (s.w.tabs.length === 1) { s.el!.classList.remove('drag'); s.el!.style.left = ''; floatify(s.w, src); s.carry = { w: s.w, el: src, offX: s.x0 - r.left, offY: s.y0 - r.top }; src.classList.add('carry'); return this._carry(e); }
    s.el!.classList.remove('drag'); removeTab(s.w, s.t); if (wins.includes(s.w)) render(s.w);
    const nw = makeWin([s.t], { float: true }); const nel = winEl(nw); nel.classList.add('carry');
    s.carry = { w: nw, el: nel, offX: s.x0 - r.left, offY: s.y0 - r.top }; s.w = nw; render(nw); s.el = q(nel, '.tab') as HTMLElement;
    this._carry(e);
  },
  _carry(e: PointerEvent) { // 拖着窗口走；进入别的窗口标题栏即并入并继续排序
    const s = this.s, d = host.desk().getBoundingClientRect();
    s.carry.w.x = e.pageX - s.carry.offX - d.left - window.scrollX; s.carry.w.y = e.pageY - s.carry.offY - d.top - window.scrollY; winEl(s.carry.w);
    for (const other of wins) {
      if (other === s.carry.w) continue; const os = this.stripRect(other);
      if (e.clientX < os.left - 8 || e.clientX > os.right + 8 || e.clientY < os.top - 10 || e.clientY > os.bottom + 10) continue;
      destroyWin(s.carry.w); s.carry = null; s.w = other;
      const L = layout(other, os.width); const idx = Math.max(0, Math.min(other.tabs.length, Math.round((e.clientX - os.left - L.leftGap - s.grabX - STRIP_PAD + other.scroll) / L.width)));
      insertTab(other, s.t, idx); render(other);
      s.el = document.querySelector(`.win[data-win="${other.id}"] .tab[data-id="${s.t.id}"]`) as HTMLElement; s.el.classList.add('drag'); s.grabX = Math.min(s.grabX, L.width - 10);
      return this._reorder(e, os);
    }
  },
  _up() {
    const s = this.s; this.s = null; window.removeEventListener('pointermove', this.move); window.removeEventListener('pointerup', this.up); if (!s) return;
    if (s.detached) { host.tabs?.dragEnd?.(); return; }
    if (s.carry) s.carry.el.classList.remove('carry');
    s.el?.classList.remove('drag'); renderAll(); if (!s.moved && s.onClick) s.onClick();
  },
};

// ===== 5 弹层：服名菜单、标签右键、全部标签、tooltip =====
function closeAll() { for (const p of document.querySelectorAll<HTMLElement>('.menu,.amenu,.tlmenu')) p.hidden = true; for (const t of document.querySelectorAll<HTMLElement>('.tab.ctx')) t.classList.remove('ctx'); document.querySelectorAll<HTMLElement>('.entry.open,.ib.s.op.open').forEach(x => x.classList.remove('open')); setCover('menu', false); }
function menuItem(label: string, onClick: (() => void) | null, extra: { sub?: boolean; open?: boolean; disabled?: boolean; checked?: boolean } = {}) { const d = document.createElement('div'); d.className = 'item' + (extra.sub ? ' sub' : '') + (extra.open ? ' open' : '') + (extra.disabled ? ' disabled' : ''); const txt = document.createElement('span'); txt.textContent = label; d.append(txt); if (extra.checked) { const c = document.createElement('i'); c.className = 'chk'; d.append(c); } if (onClick && !extra.disabled) d.onclick = ev => { ev.stopPropagation(); onClick(); }; return d; }
function openEntryMenu(w: Win, t: Tab) {
  closeAll(); const el = winEl(w), a = q(el, '.tab.on .entry') as HTMLElement | null; if (!a) return; a.classList.add('open');
  const m = q(el, '.entrymenu') as HTMLElement, sub = q(el, '.submenu') as HTMLElement, r = a.getBoundingClientRect(), wr = el.getBoundingClientRect(); let subOpen = false;
  const draw = () => {
    m.textContent = '';
    const loggedIn = () => Boolean(t.status && t.status !== 'none');
    /* 已登录的容器换服务器＝退出当前账号，先问（正文是作者给的句子；标题与按钮是草稿） */
    const switchEntry = (e: string) => { t.entry = e; t.provider = null; t.nick = ''; t.status = 'none'; host.tabs?.entry(t, e, { logout: true }); render(w); };
    for (const e of ENTRIES) m.append(menuItem(e, () => { closeAll(); if (e === t.entry && !t.provider) return; if (loggedIn()) dialog({ title: '切换服务器？', body: '切换服务器会退出当前账号，确定要切换吗？', cancel: '取消', ok: '切换服务器', onOk: () => switchEntry(e) }); else { t.entry = e; t.provider = null; host.tabs?.entry(t, e); render(w); } }, { checked: e === t.entry && !t.provider }));
    const sep = document.createElement('div'); sep.className = 'sep'; m.append(sep);
    const providerName = t.provider ? (PROVIDER_CHIP[t.provider] || t.provider) : '';
    const providerAction = t.provider ? (/官方登录/.test(t.provider) ? ' 登录' : ' 扫码') : '';
    const other = menuItem(t.provider ? providerName + providerAction : '其他渠道服', () => { subOpen = !subOpen; draw(); }, { sub: true, open: subOpen }); other.onmouseenter = () => { if (!subOpen) { subOpen = true; draw(); } }; m.append(other);
    sub.hidden = !subOpen;
    const pickProvider = (p: string, logout: boolean) => { t.provider = p; t.entry = PROVIDER_CHIP[p]; t.nick = ''; t.status = 'none'; render(w); if (host.tabs) host.tabs.provider(t, p, { logout }); else { q(el, '.game').textContent = ''; qrPrompt({ provider: p, stage: 'loading', qr: '', text: '' }); } };
    if (subOpen) { sub.textContent = ''; for (const p of PROVIDERS) sub.append(menuItem(p, () => { closeAll(); if (loggedIn()) dialog({ title: '切换登录方式？', body: '切换服务器会退出当前账号，确定要切换吗？', cancel: '取消', ok: '切换登录方式', onOk: () => pickProvider(p, true) }); else pickProvider(p, false); }, { checked: t.provider === p })); sub.style.left = (r.left - wr.left - 8 + 176 + 2) + 'px'; sub.style.top = (r.bottom - wr.top + 2 + other.offsetTop) + 'px'; }
  };
  draw(); m.hidden = false; m.style.left = (r.left - wr.left - 8) + 'px'; m.style.top = (r.bottom - wr.top + 2) + 'px'; setCover('menu', true);
}
function openTabMenu(w: Win, t: Tab, x: number, y: number) {
  closeAll(); const el = winEl(w); let m = q(el, '.cmenu') as HTMLElement | null; if (!m) { m = document.createElement('div'); m.className = 'menu cmenu'; el.append(m); }
  m.textContent = ''; const wr = el.getBoundingClientRect(), i = w.tabs.indexOf(t);
  const items: Array<[string, () => void, boolean?] | null> = [
    ['在右侧新建标签页', () => { newTabAfter(w, t); render(w); }],
    ['移到新窗口', () => { if (w.tabs.length < 2) return; const r = el.getBoundingClientRect(), d = host.desk().getBoundingClientRect(); removeTab(w, t); makeWin([t], { float: true, x: r.left - d.left + 40, y: r.top - d.top + 40 }); renderAll(); }, w.tabs.length < 2 || Boolean(host.tabs)],
    null,
    ['刷新', () => { if (host.tabs) { host.tabs.nav(t, 'reload'); return; } t.loading = true; render(w); setTimeout(() => { t.loading = false; render(w); }, 1500); }],
    [t.muted ? '取消静音' : '静音此标签页', () => { t.muted = !t.muted; host.tabs?.mute(t, t.muted); render(w); }],
    [allMuted() ? '取消全部静音' : '静音全部标签页', () => { const all = !allMuted(); for (const x of wins) for (const y of x.tabs) if (y.kind === 'game') { y.muted = all; host.tabs?.mute(y, all); } renderAll(); }],
    null,
    ['关闭', () => { removeTab(w, t); renderAll(); }],
    ['关闭其他标签页', () => { for (const x of [...w.tabs]) if (x !== t) removeTab(w, x); w.cur = t.id; render(w); }, w.tabs.length < 2],
    ['关闭右侧标签页', () => { for (const x of w.tabs.slice(i + 1)) removeTab(w, x); if (!w.tabs.find(x => x.id === w.cur)) w.cur = t.id; render(w); }, i === w.tabs.length - 1],
  ];
  for (const it of items) { if (!it) { const sp = document.createElement('div'); sp.className = 'sep'; m.append(sp); continue; } const [label, fn, disabled] = it; m.append(menuItem(label, () => { closeAll(); fn(); }, { disabled })); }
  m.hidden = false; m.style.left = Math.min(x - wr.left, wr.width - 218) + 'px'; m.style.top = (y - wr.top) + 'px'; setCover('menu', true);
}
function toggleTabList(w: Win) {
  const el = winEl(w); const m = q(el, '.tlmenu') as HTMLElement | null; const open = m && !m.hidden; closeAll(); if (open) return;
  fillTabList(w);
}
function fillTabList(w: Win) { // 列表开着时可以连着关：每关一个只重绘列表，不关列表；少于两个标签才收
  const el = winEl(w); let m = q(el, '.tlmenu') as HTMLElement | null;
  if (!m) { m = document.createElement('div'); m.className = 'tlmenu'; el.append(m); }
  const closed = host.data.closed || [];
  if (w.tabs.length < 2 && !closed.length) { m.hidden = true; return; }
  m.textContent = ''; m.hidden = false; setCover('menu', true); const r = q(el, '.tablist').getBoundingClientRect(), wr = el.getBoundingClientRect(); m.style.left = (r.left - wr.left) + 'px';
  /* 入口列按本列表里最宽的标签算（打开的＋最近关闭的，「WeGame」「哔哩哔哩」都在），不按当前标签算 */
  const colW = Math.max(0, ...w.tabs.filter(t => t.kind === 'game').map(t => chipWidth(t.entry)), ...closed.map(c => chipWidth(c.entry))) - 12;
  // 名字列保证放得下 7 个汉字（官方昵称上限），列表宽度按各列实际加起来，不让名字被压省略号
  const NAME_W = 7 * 13 + 6; m.style.width = (6 * 2 + 10 * 2 + 16 + 10 + colW + 10 + NAME_W + 10 + 64 + 6 + 14 + 2 + 20) + 'px'; // 内边距 6、行内边距 10、图标 16、列距 10；名字列 7 个字；末列 64 放得下「12 分钟前」
  for (const t of w.tabs) {
    const d = document.createElement('div'); d.className = 'item' + (t.id === w.cur ? ' on' : '');
    const icon = t.kind === 'game' ? `<img src="${ICON}">` : `<i class="pi">${S[PAGE_ICON[t.kind as PageKind]]}</i>`; // 内页标签用它自己的图标，不是产品图标
    d.innerHTML = `${icon}<span class="e"></span><span class="n"></span><span class="st"></span><span class="cx" data-tip="关闭">${S.close}</span>`;
    q(d, '.e').textContent = t.kind === 'game' ? t.entry : ''; /* 内页标签没有入口，这一列留空 */ q(d, '.e').style.width = colW + 'px'; q(d, '.n').textContent = tabLabel(t);
    const mem = host.tabs ? (t.mem || 0) : (t.mem || (t.mem = 180 + (t.id * 97) % 260)); q(d, '.st').innerHTML = `<span class="mem">${t.kind === 'game' && mem ? `${mem} MB` : ''}</span><i class="mute">${t.muted ? S.volOff : ''}</i>`; // 顺序：内存 → 静音 → ×；静音是固定宽度的槽，没静音也占位，数字才能对齐成一列
    q(d, '.cx').onclick = ev => { ev.stopPropagation(); removeTab(w, t); renderAll(); fillTabList(w); };
    d.onclick = () => { w.cur = t.id; closeAll(); render(w); }; m.append(d);
  }
  // 最近关闭：关掉时带着登录态的标签，容器还留着；点一下原样开回来（同一个容器，不走扫码）；× 忘掉并清容器。文案草稿
  if (closed.length) {
    { const h = document.createElement('div'); h.className = 'sh'; h.textContent = '最近关闭'; m.append(h); } /* 只要有最近关闭就有这一段的标题，和打开的标签数无关 */
    for (const c of closed) {
      const d = document.createElement('div'); d.className = 'item closed';
      d.innerHTML = `<img src="${ICON}"><span class="e"></span><span class="n"></span><span class="st"><span class="mem"></span><i class="mute"></i></span><span class="cx" data-tip="忘记此账号">${S.close}</span>`;
      q(d, '.e').textContent = c.entry; q(d, '.e').style.width = colW + 'px'; q(d, '.n').textContent = c.nick || '未登录'; q(d, '.mem').textContent = c.closedAt;
      q(d, '.cx').onclick = ev => { ev.stopPropagation(); closed.splice(closed.indexOf(c), 1); host.closed?.forget(c); fillTabList(w); };
      d.onclick = () => { closed.splice(closed.indexOf(c), 1); closeAll(); openTab(w, makeTab({ entry: c.entry, provider: c.provider, nick: c.nick, born: true }), undefined, { slot: c.slot, restored: true }); render(w); };
      m.append(d);
    }
  }
}
// tooltip：悬停 500ms 出现，黑底白字，右侧灰色快捷键
const tip = document.createElement('div'); tip.className = 'tip'; document.body.append(tip); let tipTimer: ReturnType<typeof setTimeout> | null = null;
document.addEventListener('pointerover', e => { const el = (e.target as Element).closest('[data-tip]') as HTMLElement | null; if (!el) return; clearTimeout(tipTimer); tipTimer = setTimeout(() => { tip.innerHTML = '<span></span>' + (el.dataset.key ? '<kbd></kbd>' : ''); tip.firstChild.textContent = el.dataset.tip; if (el.dataset.key) tip.lastChild.textContent = el.dataset.key; const r = el.getBoundingClientRect(); tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px'; tip.style.top = (r.bottom + 6) + 'px'; tip.classList.add('in'); setCover('tip', true); }, 500); });
const hideTip = () => { clearTimeout(tipTimer); tip.classList.remove('in'); setCover('tip', false); };
document.addEventListener('pointerout', e => { if ((e.target as Element).closest('[data-tip]')) hideTip(); });
document.addEventListener('pointerdown', hideTip);
document.addEventListener('click', e => { if (!(e.target as Element).closest('.menu,.entry,.amenu,.more,.tlmenu,.tablist,.pmenu')) closeAll(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
window.addEventListener('resize', renderAll);
// 快捷键：标题栏 tooltip 里标的那几个；游戏视图有焦点时由壳转发同名命令
function command(name: string) {
  const w = wins[0]; if (!w) return; const t = curTab(w);
  if (name === 'newTab') { openTab(w, makeTab({ entry: t.entry || '官服', provider: t.provider, born: true })); render(w); }
  else if (name === 'closeTab') { removeTab(w, t); closeAll(); renderAll(); }
  else if (name === 'reload') { if (t.kind === 'game') q(winEl(w), '.reload').click(); }
  else if (name === 'back') { if (t.kind === 'game' && t.hist[0]) q(winEl(w), '.back').click(); }
  else if (name === 'fwd') { if (t.kind === 'game' && t.hist[1]) q(winEl(w), '.fwd').click(); }
  else if (name === 'tabList') { if (hasList(w)) toggleTabList(w); }
  else if (name === 'menu') q(winEl(w), '.more').click();
  else if (name === 'pm' || name === 'settings' || name === 'update' || name === 'about') { closeAll(); openPage(w, name); }
  else if (name === 'nextTab' || name === 'prevTab') { const i = w.tabs.indexOf(t); w.cur = w.tabs[(i + (name === 'nextTab' ? 1 : w.tabs.length - 1)) % w.tabs.length].id; closeAll(); render(w); }
  else if (name === 'closeWindow') closeWindow(w, 'command');
}
function shortcutOf(e: KeyboardEvent): string | null {
  const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
  if (c && e.shiftKey && k === 'a') return 'tabList'; if (c && e.shiftKey && k === 'm') return 'pm'; if (c && e.shiftKey && k === 's') return 'settings';
  if (c && !e.shiftKey && k === 't') return 'newTab'; if (c && !e.shiftKey && k === 'w') return 'closeTab'; if (c && !e.shiftKey && k === 'r') return 'reload'; if (e.key === 'F5') return 'reload';
  if (c && k === 'tab') return e.shiftKey ? 'prevTab' : 'nextTab';
  if (e.altKey && k === 'f') return 'menu'; if (e.altKey && e.key === 'ArrowLeft') return 'back'; if (e.altKey && e.key === 'ArrowRight') return 'fwd';
  return null;
}
document.addEventListener('keydown', e => { const name = shortcutOf(e); if (!name) return; e.preventDefault(); command(name); });

// ===== 6 壳内页面：账号 / 设置 / 更新 / 关于（同一套列表语法：左边标题＋说明，右边控件） =====
type PageKind = 'pm' | 'settings' | 'update' | 'about';
const PAGE_TITLE: Record<PageKind, string> = { pm: '账号', settings: '设置', update: '更新', about: '关于' };
const PAGE_ICON: Record<PageKind, string> = { pm: 'person', settings: 'sliders', update: 'update', about: 'info' };
const PAGE_ORDER: PageKind[] = ['pm', 'settings', 'update', 'about'];
// 壳页面只有一个标签：左侧导航切分区，标签的标题和图标跟着当前分区走（Chrome 设置页的做法）
function openPage(w: Win, kind: PageKind) { let t = w.tabs.find(x => x.kind !== 'game'); if (!t) { t = makeTab({ kind, born: true }); insertTab(w, t); } t.kind = kind; w.cur = t.id; render(w); }
function renderPage(w: Win, t: Tab) {
  const pg = q(winEl(w), '.pg'); pg.textContent = ''; pg.dataset.kind = t.kind;
  const nav = document.createElement('nav'); nav.className = 'pnav';
  for (const k of PAGE_ORDER) { const a = document.createElement('a'); a.className = 'nitem' + (k === t.kind ? ' on' : ''); a.innerHTML = `<i>${S[PAGE_ICON[k]]}</i><span></span>`; q(a, 'span').textContent = PAGE_TITLE[k]; a.onclick = () => { t.kind = k; render(w); }; nav.append(a); }
  // Chrome 设置页的三栏：左栏装导航、中栏装正文、右栏只配重，正文相对整页居中，窗口窄时左栏保底不压导航
  const left = document.createElement('div'); left.className = 'pcol l'; left.append(nav);
  const body = document.createElement('div'); body.className = 'pbody';
  const right = document.createElement('div'); right.className = 'pcol r';
  pg.append(left, body, right);
  if (t.kind === 'pm') renderAccounts(w, body); else if (t.kind === 'settings') renderSettings(body); else if (t.kind === 'update') renderUpdate(w, body); else if (t.kind === 'about') renderAbout(body);
}
function pageHead(pg: HTMLElement, title: string, desc: string) { const h = document.createElement('div'); h.className = 'phead'; h.innerHTML = '<h1></h1><p></p>'; q(h, 'h1').textContent = title; q(h, 'p').textContent = desc; if (!desc) q(h, 'p').remove(); pg.append(h); }
function section(pg: HTMLElement, title: string) { const s = document.createElement('section'); s.className = 'psec'; const h = document.createElement('h2'); h.textContent = title; s.append(h); pg.append(s); return s; }
function settingRow(sec: HTMLElement, title: string, desc: string, control: HTMLElement) { const r = document.createElement('div'); r.className = 'prow'; r.innerHTML = '<div class="l"><div class="t"></div><div class="d"></div></div><div class="r"></div>'; q(r, '.t').textContent = title; q(r, '.d').textContent = desc; if (!desc) q(r, '.d').remove(); q(r, '.r').append(control); sec.append(r); return r; }
function toggle(on: boolean, onChange?: (on: boolean) => void) { const s = document.createElement('div'); s.className = 'sw' + (on ? ' on' : ''); s.onclick = () => { s.classList.toggle('on'); onChange?.(s.classList.contains('on')); }; return s; }
function segmented(options: string[], index: number, onChange?: (i: number) => void) { // 滑块式：白色滑块滑到选中项的实际位置和宽度（文字长短不一也对得上）
  const s = document.createElement('div'); s.className = 'seg2';
  const thumb = document.createElement('i'); thumb.className = 'thumb'; s.append(thumb);
  const place = (b: HTMLElement) => { thumb.style.width = b.offsetWidth + 'px'; thumb.style.transform = `translateX(${b.offsetLeft - 2}px)`; };
  options.forEach((o, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o; b.className = i === index ? 'on' : ''; b.onclick = () => { if (b.className === 'on') return; for (const x of s.querySelectorAll('button')) x.className = ''; b.className = 'on'; place(b); onChange?.(i); }; s.append(b); });
  requestAnimationFrame(() => { const on = s.querySelector('button.on') as HTMLElement; if (on) { thumb.style.transition = 'none'; place(on); requestAnimationFrame(() => { thumb.style.transition = ''; }); } });
  return s;
}
function button(label: string, primary = false) { const b = document.createElement('button'); b.className = 'tb' + (primary ? ' primary' : ''); b.textContent = label; return b; }
function iconButton(icon: string, tipText: string) { const b = document.createElement('button'); b.className = 'ib s'; b.innerHTML = icon; b.dataset.tip = tipText; b.onmousedown = e => e.preventDefault(); return b; } // mousedown 不起选区、不抢焦点：连点眼睛不再把旁边的「今天」选中
// 与「频道」页复制频道号同一套：两枚图标叠放交叉淡变 .18s，按钮点亮 1.5s 后原样变回；反馈期内再点没有任何事发生
function copyButton(text: string, what: 'acc' | 'pw') { const b = iconButton('', '复制'); b.classList.add('cp'); b.innerHTML = `<span class="ic ic-copy">${S.copy}</span><span class="ic ic-check">${S.check}</span>`; b.onclick = e => { e.stopPropagation(); if (b.classList.contains('done')) return; try { navigator.clipboard.writeText(text).catch(() => {}); } catch (_) {} b.classList.add('done'); b.dataset.tip = '已复制'; toast(what === 'pw' ? '已复制密码' : '已复制账号'); setTimeout(() => { b.classList.remove('done'); b.dataset.tip = '复制'; }, 1500); }; return b; }
function collapse(el: HTMLElement, done: () => void) { el.style.height = el.getBoundingClientRect().height + 'px'; el.getBoundingClientRect(); el.classList.add('faded'); setTimeout(() => { el.classList.add('gone'); setTimeout(done, 210); }, 120); }
// 先量自然高度，再关掉过渡瞬间落到 0 高、0 透明度作为起点，然后开过渡长到自然高度；量高度那一步不能带过渡，否则起点会被记成 48
function expand(el: HTMLElement) { const h = el.getBoundingClientRect().height; el.style.transition = 'none'; el.classList.add('faded', 'gone'); el.style.height = '0px'; el.getBoundingClientRect(); el.style.transition = ''; el.classList.remove('gone'); el.style.height = h + 'px'; setTimeout(() => { el.classList.remove('faded'); setTimeout(() => { el.style.height = ''; }, 130); }, 200); }
// 提示条挂在 #viewport 里：不在滚动容器里、不出窗口；单实例，定时收起
function toastHost() { const vp = document.querySelector('.win #viewport') as HTMLElement; let h = vp.querySelector('.toasts') as HTMLElement | null; if (!h) { h = document.createElement('div'); h.className = 'toasts'; vp.append(h); } return h; }
function toast(text: string, action?: { label: string; onClick: () => void }, ms = action ? 6000 : 2000, key?: string) {
  const host = toastHost();
  if (key) { const same = host.querySelector(`.toast[data-key="${key}"]:not(.out)`) as HTMLElement | null; if (same) { q(same, 'span').textContent = text; clearTimeout((same as any)._timer); (same as any)._timer = setTimeout(() => dismissToast(same), ms); return; } }
  const t = document.createElement('div'); t.className = 'toast grow'; if (key) t.dataset.key = key; t.innerHTML = '<div class="tc"><span></span></div>'; q(t, 'span').textContent = text;
  if (action) { const a = document.createElement('a'); a.textContent = action.label; a.onclick = () => { action.onClick(); dismissToast(t); }; q(t, '.tc').append(a); }
  const others = host.children.length > 0; host.prepend(t); while (host.children.length > 3) host.lastElementChild!.remove(); setCover('toast', true);
  t.getBoundingClientRect(); t.classList.remove('grow'); setTimeout(() => t.classList.add('in'), others ? 200 : 0);
  (t as any)._timer = setTimeout(() => dismissToast(t), ms);
}
function dismissToast(t: HTMLElement) { clearTimeout((t as any)._timer); if (!t.isConnected || t.classList.contains('out')) return; t.classList.remove('in'); t.classList.add('out'); setTimeout(() => { t.classList.add('grow'); setTimeout(() => { t.remove(); if (!document.querySelector('.toasts .toast')) setCover('toast', false); }, 250); }, 160); }
function hideToast() { for (const t of document.querySelectorAll('.win #viewport .toast')) dismissToast(t as HTMLElement); }
// 对话框：自绘、居中、遮罩；Esc 或点遮罩＝取消，Enter＝确定
function dialog(o: { title: string; body: string; cancel: string; ok: string; danger?: boolean; check?: string; note?: string; content?: HTMLElement; stay?: boolean; onOk: (checked: boolean, note: string) => void }) {
  const vp = document.querySelector('.win #viewport') as HTMLElement; vp.querySelector('.scrim')?.remove();
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.innerHTML = '<div class="dlg" role="dialog"><h3></h3><p></p><label class="dchk" hidden><input type="checkbox"><span></span></label><textarea class="dnote" hidden rows="3"></textarea><div class="acts"><button class="tb"></button><button class="tb primary"></button></div></div>';
  q(scrim, 'h3').textContent = o.title; q(scrim, 'p').textContent = o.body; if (!o.body) q(scrim, 'p').remove(); if (o.content) q(scrim, '.dlg').insertBefore(o.content, q(scrim, '.dchk')); const cancel = q(scrim, '.acts .tb:not(.primary)'), ok = q(scrim, '.acts .primary'); cancel.textContent = o.cancel; ok.textContent = o.ok; if (o.danger) ok.classList.add('danger');
  if (o.check) { const l = q(scrim, '.dchk'); l.hidden = false; q(l, 'span').textContent = o.check; }
  const note = q(scrim, '.dnote') as unknown as HTMLTextAreaElement; if (o.note !== undefined) { note.hidden = false; note.placeholder = o.note; }
  const close = () => { scrim.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => { scrim.remove(); if (!document.querySelector('.scrim')) setCover('dialog', false); }, 160); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else if (e.key === 'Enter' && document.activeElement !== note) ok.click(); };
  cancel.onclick = close; ok.onclick = () => { o.onOk((scrim.querySelector('input') as HTMLInputElement).checked, note.value.trim()); if (!o.stay) close(); }; /* stay：确定后窗口随即关闭，对话框留着不收，免得先露一帧游戏画面 */ scrim.onclick = e => { if (e.target === scrim) close(); };
  document.addEventListener('keydown', onKey); vp.append(scrim); setCover('dialog', true); // 焦点落在对话框本体而不是按钮：按钮只有键盘 Tab 到它时才显示焦点环；Enter／Esc 由上面的 keydown 处理
  const dlgEl = q(scrim, '.dlg') as HTMLElement; dlgEl.tabIndex = -1; requestAnimationFrame(() => { scrim.classList.add('in'); (o.note !== undefined ? note : dlgEl).focus(); });
}
// 两处确认框的文案是草稿，等作者审定

// 扫码卡：与对话框同一张皮，居中（它不是决定，是等待）。阶段由宿主映射统一登录器的快照：loading／scan／confirm／exchanging／error；ready 由宿主直接收卡。
// 没有按钮：取消＝点卡外或 Esc；刷新＝点码上的刷新标识。状态都画在码里（转圈／已扫码／刷新），卡的骨架不变。文案全部是草稿，等作者审定。
type QrModel = { provider: string; brand?: string; mode?: 'qr' | 'browser'; stage: 'loading' | 'scan' | 'confirm' | 'exchanging' | 'error' | 'yield'; qr: string; text: string };
let qrEl: HTMLElement | null = null; let qrCancelCb: (() => void) | null = null; let qrRetryCb: (() => void) | null = null; let qrTab: number | null = null; let qrYield = false;
/* 卡片只属于一个标签：当前标签不是它的就藏起来（主进程切标签后会 render） */
function syncCardTabs(w: Win) { if (qrEl) qrEl.hidden = qrYield || (qrTab !== null && qrTab !== w.cur); if (saveEl) saveEl.hidden = saveTab !== null && saveTab !== w.cur; }
const QR_APP: Record<string, string> = { 'WeGame - QQ': 'QQ', 'WeGame - 微信': '微信', 'bilibili 扫码登录': '哔哩哔哩', 'Steam 扫码登录': 'Steam', 'OPPO 扫码登录': 'OPPO', '小米扫码登录': '小米', 'VIVO 扫码登录': 'VIVO', '华为扫码登录': '华为', '荣耀扫码登录': '荣耀', 'Steam 官方登录（账号密码 / Steam Guard）': 'Steam', 'OPPO 官方登录（账号密码 / 短信 / 扫码）': 'OPPO', '小米官方登录（账号密码 / 短信）': '小米', 'VIVO 官方登录（账号密码 / 短信 / 扫码）': 'VIVO' };
function qrTexts(m: QrModel): [string, string] {
  const app = m.brand || QR_APP[m.provider] || m.provider.replace(/ ?扫码登录$/, '');
  const sp = /^[A-Za-z]/.test(app) ? ` ${app} ` : app;
  if (m.stage === 'loading') return [m.mode === 'browser' ? (m.text || '正在打开官方登录窗口') : '正在获取二维码', m.mode === 'browser' ? '账号密码、验证码只输入渠道官方页面' : ''];
  if (m.stage === 'scan') return [m.mode === 'browser' ? (m.text || `请在${sp}官方窗口完成登录`) : `用手机${sp}扫码`, m.mode === 'browser' ? '完成后会自动继续，不需要回到本窗口' : '扫码后在手机上确认登录'];
  if (m.stage === 'confirm') return ['已扫码', '请在手机上确认登录'];
  if (m.stage === 'exchanging') return ['正在登录', ''];
  if (m.stage === 'error') return [m.text || '登录未完成', m.mode === 'browser' ? '点击此处重新打开官方登录窗口' : '点击二维码重新获取'];
  return ['', ''];
}
/* 私有二维码：各家给的码样式不一（中间带 logo、留白不同、尺寸不同），解出内容后用同一规格重画：
   纠错 M、4 模块留白、黑白、整数倍缩放不糊。解不出或内容含非 UTF-8 字节就原样用它的码。 */
const qrCache = new Map<string, Promise<string>>();
function normalizeQr(src: string): Promise<string> {
  if (qrCache.has(src)) return qrCache.get(src)!;
  const p = new Promise<string>(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height); const decode: any = (jsQR as any).default || jsQR; const r = decode(d.data, d.width, d.height);
        if (!r || !r.data) { resolve(src); return; }
        const utf8 = new TextEncoder().encode(r.data); if (utf8.length !== r.binaryData.length) { resolve(src); return; }
        const q = qrcodegen(0, 'M'); q.addData(r.data); q.make();
        const n = q.getModuleCount(), quiet = 3, scale = Math.max(2, Math.floor(496 / (n + quiet * 2))); /* 留白 3 模块：框已经把码圈住，留白只需保证可扫 */
        const size = (n + quiet * 2) * scale; const o = document.createElement('canvas'); o.width = o.height = size; const og = o.getContext('2d')!;
        og.fillStyle = '#fff'; og.fillRect(0, 0, size, size); og.fillStyle = '#000';
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) og.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
        resolve(o.toDataURL('image/png'));
      } catch (_) { resolve(src); }
    };
    img.onerror = () => resolve(src); img.src = src;
  });
  qrCache.set(src, p); return p;
}
function closeQr() {
  const el = qrEl; if (!el) return; qrEl = null; qrCancelCb = null; qrRetryCb = null; qrTab = null; el.classList.remove('in'); document.removeEventListener('keydown', onQrKey);
  setTimeout(() => { el.remove(); if (!document.querySelector('.scrim')) setCover('dialog', false); }, 160);
}
function onQrKey(e: KeyboardEvent) { if (e.key === 'Escape') { const cb = qrCancelCb; closeQr(); cb?.(); } }
function updateQr(m: QrModel) {
  const el = qrEl; if (!el) return;
  qrYield = m.stage === 'yield'; const w0 = wins.find(x => x.tabs.some(t => t.id === qrTab)) || wins[0]; if (w0) syncCardTabs(w0); if (qrYield) return; /* 页面里的滑块／身份核验阶段让开 */
  const img = q(el, '.qrbox img') as unknown as HTMLImageElement; const box = q(el, '.qrbox');
  if (m.qr) { if (img.dataset.src !== m.qr) { img.dataset.src = m.qr; img.src = m.qr; normalizeQr(m.qr).then(u => { if (img.dataset.src === m.qr) img.src = u; }); } img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); delete img.dataset.src; }
  const [t1, t2] = qrTexts(m); q(el, '.qst').textContent = t1; q(el, '.qsub').textContent = t2; (q(el, '.dlg') as HTMLElement).dataset.stage = m.stage; box.classList.toggle('act', m.stage === 'error');
}
function qrPrompt(m: QrModel, onCancel?: () => void, onRetry?: () => void, tabId?: number) {
  const vp = document.querySelector('.win #viewport') as HTMLElement; closeQr(); vp.querySelector('.scrim')?.remove(); qrTab = tabId ?? null; qrYield = false;
  const scrim = document.createElement('div'); scrim.className = 'scrim center'; scrim.innerHTML = `<div class="dlg qr" role="dialog"><div class="hd"><img class="bi" alt="" hidden><h3></h3></div><div class="qrbox"><img alt="" hidden><div class="ov"><i class="spin"></i><i class="ok">${S.check}</i><i class="again">${S.refresh || S.update || ''}</i></div></div><div class="qst"></div><div class="qsub"></div></div>`;
  q(scrim, 'h3').textContent = (m.brand || m.provider).replace(/ ?扫码登录$/, '').replace(' - ', ' · ');
  const bi = q(scrim, '.bi') as unknown as HTMLImageElement; const icon = BRAND_ICON[m.provider] || (m.brand ? BRAND_ICON[m.brand] : ''); if (icon) { bi.src = icon; bi.hidden = false; }
  const cancel = () => { const cb = qrCancelCb; closeQr(); cb?.(); };
  (q(scrim, '.qrbox') as HTMLElement).onclick = () => { if ((q(scrim, '.dlg') as HTMLElement).dataset.stage === 'error') qrRetryCb?.(); };
  scrim.onclick = e => { if (e.target === scrim) cancel(); };
  qrEl = scrim; qrCancelCb = onCancel || null; qrRetryCb = onRetry || null; vp.append(scrim); setCover('dialog', true); document.addEventListener('keydown', onQrKey);
  updateQr(m); const dlgEl = q(scrim, '.dlg') as HTMLElement; dlgEl.tabIndex = -1; requestAnimationFrame(() => { scrim.classList.add('in'); dlgEl.focus(); });
}
function confirmCloseWindow(n: number, onClose: () => void) { dialog({ title: '关闭窗口？', body: `有 ${n} 个标签页正在打开。`, check: '不再提示', cancel: '取消', ok: '关闭窗口', stay: Boolean(host.window), onOk: checked => { if (checked) { settings.confirmClose = false; host.settings?.set('confirmClose', false); } onClose(); } }); } // 「不再提示」＝关掉设置里的「关闭窗口前确认」
function confirmLogoutAll() { dialog({ title: '退出所有账号？', body: '所有标签页将返回登录页。保存的账号不会被删除。', cancel: '取消', ok: '退出所有账号', onOk: () => { Promise.resolve(host.settings?.logoutAll()).then(() => toast('已退出所有账号'), (e: any) => toast(`退出失败：${e?.message || e}`)); } }); }

// 保存密码卡（Chrome 规则：点「登录游戏」那一刻在右上角出现；账号密码可改；点卡外或 Esc＝不保存）。文案草稿，等作者审定
let saveEl: HTMLElement | null = null; let saveTab: number | null = null;
function closeSave(result: { save: boolean; account: string; password: string } | null, done?: (r: { save: boolean; account: string; password: string }) => void) {
  const el = saveEl; if (!el) return; saveEl = null; el.classList.remove('in'); setTimeout(() => el.remove(), 170); setCover('save', false);
  if (result && done) done(result);
}
function savePrompt(o: { account: string; password: string; mode: 'new' | 'changed' }, done?: (r: { save: boolean; account: string; password: string }) => void, tabId?: number) {
  const vp = document.querySelector('.win #viewport') as HTMLElement; closeSave(null); saveTab = tabId ?? null;
  const el = document.createElement('div'); el.className = 'save';
  el.innerHTML = `<div class="hd"><h3></h3></div><div class="row"><label>账号</label><span class="fld"><input class="acc" type="text" spellcheck="false" autocomplete="off"></span></div><div class="row"><label>密码</label><span class="fld pw"><input class="pwd" type="password" autocomplete="off"></span></div><div class="acts"><button class="tb no" type="button"></button><button class="tb primary yes" type="button"></button></div>`;
  const acc = q(el, '.acc') as HTMLInputElement, pwd = q(el, '.pwd') as HTMLInputElement, no = q(el, '.no'), yes = q(el, '.yes');
  q(el, 'h3').textContent = o.mode === 'changed' ? '在此设备上更新密码？' : '在此设备上保存密码？'; acc.value = o.account; pwd.value = o.password;
  no.textContent = '不保存'; yes.textContent = o.mode === 'changed' ? '更新密码' : '保存密码';
  const eye = iconButton(S.eye, '显示密码'); eye.onclick = e => { e.stopPropagation(); const show = pwd.type === 'password'; pwd.type = show ? 'text' : 'password'; eye.innerHTML = show ? S.eyeOff : S.eye; eye.dataset.tip = show ? '隐藏密码' : '显示密码'; }; q(el, '.fld.pw').append(eye);
  const finish = (save: boolean) => closeSave({ save, account: acc.value.trim(), password: pwd.value }, done);
  no.onclick = () => finish(false); yes.onclick = () => finish(true);
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
  el.addEventListener('click', e => e.stopPropagation()); el.addEventListener('pointerdown', e => e.stopPropagation());
  (el as any)._done = done; saveEl = el; vp.append(el); setCover('save', true); requestAnimationFrame(() => el.classList.add('in'));
}
document.addEventListener('click', () => { if (saveEl) closeSave({ save: false, account: '', password: '' }, (saveEl as any)._done); });

// —— 账号：每格悬停出复制；点文字就地改，回车保存、Esc 取消；行尾只剩打开和删除 ——
let acctBorn: Account | null = null, acctEdit: { a: Account; key: 'account' | 'password' } | null = null; const acctShow = new Set<Account>();
const accounts = host.data.accounts;
function cell(cls: string, value: string, opts: { copy?: string; secret?: boolean; shown?: boolean; onToggle?: () => void; dim?: boolean; editing?: boolean; onEdit?: () => void; onCommit?: (v: string) => void; onCancel?: () => void; field?: boolean } = {}) {
  const c = document.createElement('span'); c.className = 'cell ' + cls + (opts.dim ? ' dim' : '') + (opts.field ? ' field' : '') + (opts.editing ? ' edit' : '');
  if (opts.editing) {
    const inp = document.createElement('input'); inp.className = 'inline'; inp.value = value; inp.type = 'text'; inp.spellcheck = false; c.append(inp);
    let done = false; const commit = () => { if (done) return; done = true; opts.onCommit!(inp.value); }; const cancel = () => { if (done) return; done = true; opts.onCancel!(); };
    inp.onkeydown = ev => { if (ev.key === 'Enter') commit(); else if (ev.key === 'Escape') cancel(); }; inp.onblur = commit;
    requestAnimationFrame(() => { inp.focus(); inp.select(); });
  } else {
    const v = document.createElement('span'); v.className = 'v' + (opts.secret && !opts.shown ? ' dots' : ''); v.textContent = opts.secret && !opts.shown ? '•'.repeat(value.length) : value; c.append(v);
    if (opts.onEdit) { c.dataset.tip = '点击修改'; c.onclick = () => opts.onEdit!(); }
  }
  if (opts.secret && opts.onToggle) { const eye = iconButton(opts.shown ? S.eyeOff : S.eye, opts.shown ? '隐藏密码' : '显示密码'); eye.onclick = e => { e.stopPropagation(); opts.onToggle!(); }; c.append(eye); }
  if (opts.copy !== undefined) c.append(copyButton(opts.copy, opts.secret ? 'pw' : 'acc'));
  return c;
}
function renderEmpty(w: Win, pg: HTMLElement) { // 空状态：一句话，下面一个左对齐按钮；按钮随账号管理器开关变
  const e = document.createElement('div'); e.className = 'pempty'; e.innerHTML = '<p></p>'; q(e, 'p').textContent = '当前没有保存的账号';
  const b = settings.manager ? button('前往游戏登录页') : button('打开账号管理器');
  b.onclick = settings.manager ? () => { openTab(w, makeTab({ entry: '官服', born: true })); render(w); } : () => { openPage(w, 'settings'); const row = document.querySelector('.prow[data-key="manager"]'); if (row) { row.classList.add('hl'); row.scrollIntoView({ block: 'center' }); setTimeout(() => row.classList.remove('hl'), 2400); } };
  e.append(b); pg.append(e);
}
function renderAccounts(w: Win, pg: HTMLElement) {
  pageHead(pg, '账号', '保存在此电脑上的账号，登录时可直接选用');
  const rerender = () => renderPage(w, curTab(w));
  const groups = [...new Set(accounts.map(a => a.entry))];
  if (!groups.length) renderEmpty(w, pg);
  if (accounts.length) queueMicrotask(() => { const s = document.createElement('section'); s.className = 'psec lone'; pg.append(s); const clr = button('清除保存的账号'); clr.onclick = () => dialog({ title: '清除保存的账号？', body: '只会清除保存在此电脑上的所有登录信息，不会删除游戏数据。', cancel: '取消', ok: '清除保存的账号', danger: true, onOk: () => { accounts.splice(0); host.accounts?.clear(); toast('已清除保存的账号'); rerender(); } }); settingRow(s, '清除此电脑上保存的所有账号和密码', '', clr); });
  for (const g of groups) {
    const sec = section(pg, g);
    for (const a of accounts.filter(x => x.entry === g)) {
      const show = acctShow.has(a); const r = document.createElement('div'); r.className = 'arow';
      r.append(cell('c-nick', a.nick || '未命名', {})); // 昵称是游戏里的名字，这里只看不改
      if (a.via === '账号密码') {
        const ed = (key: 'account' | 'password') => ({ editing: acctEdit?.a === a && acctEdit.key === key, onEdit: () => { acctEdit = { a, key }; rerender(); }, onCommit: (v: string) => { const nv = key === 'account' ? v.trim() : v; if (nv && nv !== a[key]) { host.accounts?.update(a, key, nv); a[key] = nv; } /* 先报宿主（宿主要旧值定位记录），再改本地 */ acctEdit = null; rerender(); }, onCancel: () => { acctEdit = null; rerender(); } });
        r.append(cell('c-acc', a.account, { copy: a.account, field: true, ...ed('account') }));
        r.append(cell('c-pw', a.password, { copy: a.password, secret: true, shown: show, onToggle: () => { show ? acctShow.delete(a) : acctShow.add(a); rerender(); }, field: true, ...ed('password') }));
      } else { r.append(cell('c-acc', a.via, { dim: true })); r.append(cell('c-pw', '', {})); }
      const last = document.createElement('span'); last.className = 'cell c-last'; last.textContent = a.last; r.append(last);
      const ops = document.createElement('span'); ops.className = 'cell c-ops';
      const open = iconButton(S.arrowUpRight, '打开'); open.classList.add('op'); open.onclick = () => { openTab(w, makeTab({ entry: a.entry, nick: a.nick, born: true }), undefined, { account: a.account }); render(w); }; ops.append(open);
      const del = iconButton(S.trash, '删除'); del.classList.add('op'); del.onclick = () => {
        dialog({ title: `删除 ${a.nick || '未命名'} 的账号与密码？`, body: '只会删除保存在此电脑上的登录信息，不会删除游戏数据。', cancel: '取消', ok: '删除账号与密码', danger: true, onOk: () => {
          const lastInGroup = accounts.filter(x => x.entry === a.entry).length === 1; collapse(lastInGroup ? sec : r, () => { accounts.splice(accounts.indexOf(a), 1); host.accounts?.remove(a); rerender(); toast(`已删除 ${a.nick || '未命名'} 的账号与密码`); }); } });
      }; ops.append(del);
      r.append(ops); sec.append(r);
      if (acctBorn === a) { acctBorn = null; expand(accounts.filter(x => x.entry === a.entry).length === 1 ? sec : r); }
    }
  }
}

// —— 设置：写给玩家看，每行一句人话 ——
// 设置页：只放玩家能判断、改了有感的项；文案为草稿，等作者审定
function renderSettings(pg: HTMLElement) {
  pageHead(pg, '设置', '更改会自动保存，立即生效');
  const saved = () => toast('已保存设置', undefined, 1600);
  const bind = (key: keyof typeof settings) => (on: boolean) => { settings[key] = on; host.settings?.set(key, on); saved(); };
  let s = section(pg, '启动');
  settingRow(s, '恢复上次打开的账号', '打开锦囊妙计客户端时，自动恢复上次关闭前打开的账号。', toggle(settings.restore, bind('restore')));
  s = section(pg, '标签页');
  settingRow(s, '关闭窗口前确认', '同时开着多个标签页时，关闭窗口会先询问。', toggle(settings.confirmClose, bind('confirmClose')));
  settingRow(s, '新标签页默认静音', '新打开的标签页默认不播放声音，可随时点击标签上的声音图标恢复。', toggle(settings.muteNew, bind('muteNew')));
  s = section(pg, '账号');
  settingRow(s, '启用账号管理器', '登录后询问是否保存账号和密码，保存过的账号可在登录页一键选用。', toggle(settings.manager, bind('manager'))).dataset.key = 'manager';
  const out = button('退出所有账号'); out.onclick = confirmLogoutAll; settingRow(s, '退出登录', '将所有已登录的标签页退回到初始登录页。已保存的账号和密码不会删除。', out);
  s = section(pg, '问题反馈');
  settingRow(s, '发送匿名使用统计', '包含功能使用次数与崩溃信息，用于改进锦囊妙计，提升游戏稳定性。不包含游戏内敏感信息。', toggle(settings.stats, bind('stats')));
  // 反馈：直接上传最近日志并留言，拿到编号；日志不含账号密码（上传前本地脱敏）。文案草稿
  // 反馈行只在宿主接了上传能力时出现（没有端点就不摆一个必然失败的按钮）
  if (host.feedback) {
    const fb = button('上传日志并反馈'); fb.onclick = () => dialog({ title: '上传日志并反馈', body: '将上传最近的运行日志（不含账号和密码）。留言写清遇到的问题和大致时间。', note: '遇到了什么问题，大约什么时候', cancel: '取消', ok: '上传', onOk: (_c, n) => { host.feedback!.upload(n).then(r => toast(`已上传，反馈编号 ${r.id}`, { label: '复制编号', onClick: () => { navigator.clipboard?.writeText(r.id).catch(() => {}); } }, 8000), (e: any) => toast(`上传失败：${e?.message || e}`)); } });
    settingRow(s, '反馈问题', '上传最近的运行日志并留言，上传后会得到一个反馈编号，联系时报编号即可。', fb);
  }
}

// —— 更新：与账号、设置同为一页；按钮都能动 ——
// 更新页只有一个主状态（Chrome「关于」页的做法）：最新／有更新／下载中／待重启；组件清单只报数字
// 插件以 ==UserScript== 的 @name 为名；id 用文件名／链接末段做身份；有 @updateURL 的才给刷新
const plugins = host.data.plugins;
const KNOWN_NAMES: Record<string, string> = { 'ddz-assist': '斗地主助手', daxiaochao: '三国杀打小抄一将成名' }; // harness 里模拟读文件头 @name
function bump(v: string) { const a = v.split('.').map(Number); a[a.length - 1]++; return a.join('.'); }
// 更新页两行：客户端、锦囊妙计各自一行，各自检测、各自动作。客户端装完要重新启动，锦囊妙计下次进游戏生效
const upds = host.data.upds;
function renderUpdate(w: Win, pg: HTMLElement) {
  const rerender = () => renderPage(w, curTab(w));
  pageHead(pg, '更新', '有新版本时自动下载，下次进入游戏时生效');
  const list = document.createElement('div'); list.className = 'ulist'; pg.append(list);
  for (const u of upds) {
    const st = document.createElement('div'); st.className = 'ustat ' + u.state; st.innerHTML = '<span class="uicon"></span><div class="utext"><div class="t"></div><div class="d"></div></div><div class="uact"></div>'; list.append(st);
    const icon = q(st, '.uicon'), t = q(st, '.t'), d = q(st, '.d'), act = q(st, '.uact');
    const startDownload = () => { u.state = 'downloading'; u.progress = 0; rerender(); const tick = () => { u.progress = Math.min(100, u.progress + 9); if (u.progress < 100) { const row = [...document.querySelectorAll('.ustat')][upds.indexOf(u)]; const bar = row?.querySelector('.bar i') as HTMLElement | null, pct = row?.querySelector('.pct'); if (bar) bar.style.width = u.progress + '%'; if (pct) pct.textContent = u.progress + '%'; setTimeout(tick, 120); } else { u.current = u.latest; u.state = 'ready'; rerender(); } }; setTimeout(tick, 120); };
    if (u.state === 'latest') { icon.innerHTML = S.okCircle; t.textContent = `${u.name} 已是最新版本`; d.textContent = `${u.current} · 上次检查 ${u.checked}`; const b = button('检查更新'); b.onclick = () => { if (host.updates) { host.updates.check(u); return; } u.checked = '刚刚'; rerender(); }; act.append(b); }
    else if (u.state === 'available') { icon.innerHTML = S.upCircle; t.textContent = `${u.name} 有可用更新`; d.textContent = `${u.current} → ${u.latest}`; const b = button('下载并安装', true); b.classList.add('ok'); b.onclick = () => host.updates ? host.updates.download(u) : startDownload(); act.append(b); }
    else if (u.state === 'downloading') { icon.innerHTML = S.upCircle; t.textContent = `${u.name} 正在下载更新`; d.innerHTML = '<span class="bar"><i></i></span><span class="pct"></span>'; (q(d, '.bar i') as HTMLElement).style.width = u.progress + '%'; q(d, '.pct').textContent = u.progress + '%'; }
    else { icon.innerHTML = S.okCircle; t.textContent = `${u.name} 更新已完成`; if (u.restart) { d.textContent = `${u.current} · 重新启动后生效`; const b = button('重新启动', true); b.classList.add('ok'); b.onclick = () => { if (host.updates) { host.updates.restart(u); return; } u.state = 'latest'; u.checked = '刚刚'; rerender(); }; act.append(b); } else { d.textContent = `${u.current} · 下次进入游戏时生效`; } }
  }
  // 高级：装或更新 user.js。同名即覆盖更新；内置组件（锦囊袋／小抄／登录器）同名也走这里，等于手动更新
  // 插件：Claude 插件页的行：图标框、名字加标签、一行元信息；右侧开关，第三方多一个 ⋮ 菜单（检查更新／删除）。安装入口在分区标题右侧
  const sec = document.createElement('section'); sec.className = 'psec'; sec.innerHTML = '<div class="sh"><h2></h2><div class="sa"></div></div>'; pg.append(sec);
  q(sec, 'h2').innerHTML = '已安装的插件<span class="cnt"></span>'; q(sec, '.cnt').textContent = String(plugins.length);
  for (const p of plugins) {
    const row = document.createElement('div'); row.className = 'prow plug'; row.innerHTML = `<span class="ic">${S.script}</span><div class="l"><div class="t"></div><div class="d"></div></div><div class="r"></div>`;
    q(row, '.t').textContent = p.name; const ver = document.createElement('code'); ver.className = 'ver'; ver.textContent = p.version; q(row, '.t').append(ver);
    q(row, '.d').textContent = p.builtin ? (p.note || '') : (/^https?:/.test(p.source) ? `更新于 ${p.date}` : `来自文件 · ${p.date}`);
    q(row, '.r').append(toggle(p.enabled, on => { p.enabled = on; host.plugins?.setEnabled(p, on); toast(on ? `已启用 ${p.name}，下次进入游戏时生效` : `已停用 ${p.name}，下次进入游戏时生效`); }));
    const slot = document.createElement('span'); slot.className = 'slot'; q(row, '.r').append(slot);
    const more = iconButton(S.kebab, '更多'); more.classList.add('op'); more.onclick = e => { e.stopPropagation(); rowMenu(w, more, [
      [S.sync, '检查更新', () => { if (!host.plugins) { toast(`${p.name} 已是最新版本`); return; } host.plugins.check(p).then(r => toast(r.updated ? `已更新 ${p.name} ${r.from} → ${r.version}，下次进入游戏时生效` : `${p.name} 已是最新版本`), (e: any) => toast(`无法检查更新：${e?.message || e}`)); }, !p.updateUrl],
      [S.trash, '卸载', () => dialog({ title: `卸载 ${p.name}？`, body: '将从此电脑移除该插件，不会影响游戏数据和保存的账号。', cancel: '取消', ok: '卸载插件', danger: true, onOk: () => { plugins.splice(plugins.indexOf(p), 1); host.plugins?.remove(p); rerender(); } }), !!p.builtin]]); }; slot.append(more);
    sec.append(row); }
  // 高级：手动安装入口单独一栏
  const adv = section(pg, '高级'); const inst = button('安装插件…'); inst.onclick = () => installPluginDialog(rerender); settingRow(adv, '从 user.js 链接或本地文件手动安装', '', inst);
}
function rowMenu(w: Win, anchor: HTMLElement, items: Array<[string, string, () => void, boolean?]>) {
  const wasOpen = anchor.classList.contains('open'); closeAll(); if (wasOpen) return; /* 开着再点＝关，不是关了重开再放一遍入场 */ const el = winEl(w); let m = q(el, '.pmenu') as HTMLElement | null; if (!m) { m = document.createElement('div'); m.className = 'menu pmenu'; el.append(m); }
  m.textContent = '';
  for (const [icon, label, fn, disabled] of items) { const it = document.createElement('div'); it.className = 'item' + (disabled ? ' disabled' : ''); it.innerHTML = `<i>${icon}</i><span></span>`; q(it, 'span').textContent = label; if (!disabled) it.onclick = ev => { ev.stopPropagation(); closeAll(); fn(); }; m.append(it); }
  // 右缘对齐到 ⋮ 的字形而不是按钮盒：按钮 28 宽、字形约 14，向内收 7；下方留 6
  anchor.classList.add('open'); const r = anchor.getBoundingClientRect(), wr = el.getBoundingClientRect(); m.hidden = false; m.style.left = (r.right - 7 - wr.left - m.offsetWidth) + 'px'; m.style.top = (r.bottom - wr.top + 6) + 'px';
}
function installPluginDialog(rerender: () => void) {
  const box = document.createElement('div'); box.className = 'manual wide'; box.innerHTML = `<div class="pick"><button type="button" class="pk" data-tip="选择文件">${S.folder}</button><input type="text" placeholder="粘贴 user.js 链接，或从本机选择文件"></div>`;
  const input = q(box, 'input') as HTMLInputElement; q(box, '.pk').onclick = () => { if (host.plugins?.pickFile) { host.plugins.pickFile().then(f => { if (f) { input.value = f; input.focus(); } }); return; } input.value = 'C:\\Users\\kiwi\\Downloads\\ddz-assist.user.js'; input.focus(); };
  dialog({ title: '安装插件', body: '插件会在游戏页面中运行，随时可以在插件列表里停用或删除。', content: box, cancel: '取消', ok: '安装', onOk: () => { const v = input.value.trim(); if (!v) return;
    if (host.plugins) { host.plugins.install(v).then(r => toast(r.updated ? `已更新 ${r.name} ${r.from} → ${r.version}，下次进入游戏时生效` : `已安装 ${r.name}，下次进入游戏时生效`), (e: any) => toast(`安装失败：${e?.message || e}`)); return; }
    const id = v.replace(/^.*[\\/]/, '').replace(/\.user\.js$/i, '') || 'plugin'; const name = KNOWN_NAMES[id] || id; const fromUrl = /^https?:\/\//i.test(v); const existing = plugins.find(p => p.id === id);
    if (existing) { const old = existing.version; existing.version = bump(existing.version); existing.source = fromUrl ? v : '文件'; if (fromUrl) existing.updateUrl = v; existing.date = '刚刚'; toast(`已更新 ${name} ${old} → ${existing.version}，下次进入游戏时生效`); }
    else { plugins.push({ id, name, version: '1.0.0', source: fromUrl ? v : '文件', updateUrl: fromUrl ? v : undefined, date: '刚刚', enabled: true }); toast(`已安装 ${name}，下次进入游戏时生效`); }
    rerender(); } });
}

// —— 关于 ——
function renderAbout(pg: HTMLElement) {
  pageHead(pg, '关于', '锦囊妙计客户端');
  const list = document.createElement('div'); list.className = 'about';
  const items: Array<{ img?: string; icon?: string; title: string; desc: string; btn: string; url: string }> = [
    { icon: S.github, title: 'GitHub 开源仓库', desc: '客户端源码与版本记录', btn: '打开 GitHub', url: 'https://github.com/Clarrycy/jinnangmiaoji' },
    { icon: S.channel, title: 'QQ 频道', desc: '玩家交流、更新公告与使用帮助', btn: '加入 QQ 频道', url: 'https://pd.qq.com/s/476n0o4be' }];
  for (const it of items) { const r = document.createElement('div'); r.className = 'arow2'; r.innerHTML = `<span class="av">${it.img ? `<img src="${it.img}" alt="">` : it.icon}</span><div class="l"><div class="t"></div><div class="d"></div></div><div class="r"></div>`; q(r, '.t').textContent = it.title; q(r, '.d').textContent = it.desc; const b = button(it.btn); b.innerHTML = `<span></span>${S.arrowUpRight}`; q(b, 'span').textContent = it.btn; b.onclick = () => host.openExternal(it.url); q(r, '.r').append(b); list.append(r); }
  pg.append(list);
}


  // ===== 7 宿主回推：标签状态、数据、窗口状态、尺寸 =====
  const findTab = (id: number) => { for (const w of wins) { const t = w.tabs.find(x => x.id === id); if (t) return { w, t }; } return null; };
  function updateTab(id: number, patch: Partial<Tab>) { const f = findTab(id); if (!f) return; Object.assign(f.t, patch); render(f.w); }
  // 宿主推一份新数据：数组就地替换（页面里拿着的是同一个引用），正开着对应页就重画
  function setData<K extends keyof Host['data']>(kind: K, next: Host['data'][K]) {
    const cur = host.data[kind] as any;
    if (Array.isArray(cur)) cur.splice(0, cur.length, ...(next as any[])); else Object.assign(cur, next);
    for (const w of wins) { const t = curTab(w); if (t && t.kind !== 'game') renderPage(w, t); }
    if (kind === 'closed') for (const w of wins) render(w); /* 「最近关闭」有无决定标签列表按钮在不在，标签条要跟着重画 */
  }
  function setWindow(state: { maximized?: boolean; focused?: boolean }) {
    for (const w of wins) { const el = winEl(w); if (state.maximized !== undefined) { const mx = q(el, '.caption .mx'); mx.innerHTML = state.maximized ? S.restore : S.max; mx.dataset.tip = state.maximized ? '向下还原' : '最大化'; } }
    if (state.focused !== undefined) document.body.classList.toggle('inactive', !state.focused);
  }
  function setSize(width: number, height: number) { for (const w of wins) { const el = winEl(w); el.style.width = width + 'px'; el.style.height = height + 'px'; } renderAll(); }
  const requestClose = () => { const w = wins[0]; if (w) closeWindow(w, 'close-request'); };
  // 别的窗口把标签拖进来：按鼠标在本窗口里的 x 算落点（与条内排序同一公式），建标签并告诉宿主认领视图
  function adoptAt(info: { entry: string; slot?: number; nick?: string; muted?: boolean; provider?: string | null; kind?: string }, x: number) {
    const w = wins[0]; if (!w) return;
    const strip = q(winEl(w), '.tabs'); const sr = strip.getBoundingClientRect(); const L = layout(w, strip.clientWidth);
    const idx = Math.max(0, Math.min(w.tabs.length, Math.round((x - sr.left - L.leftGap - STRIP_PAD + w.scroll) / L.width)));
    if (info.kind && info.kind !== 'game') { openTab(w, makeTab({ kind: info.kind as PageKind, born: true }), idx); render(w); return; } // 内页标签并入：本窗口已有内页就只切过去
    openTab(w, makeTab({ entry: info.entry, provider: info.provider || null, nick: info.nick || '', muted: Boolean(info.muted), born: true }), idx, { slot: info.slot, adopt: true });
    render(w);
  }
  return { wins, makeWin, makeTab, insertTab, openTab, removeTab, curTab, render, renderAll, openPage, toast, dialog, confirmCloseWindow, confirmLogoutAll, openTabMenu, openEntryMenu, toggleTabList, installPluginDialog, closeAll, command, updateTab, setData, setWindow, setSize, requestClose, savePrompt, closeSave, qrPrompt, updateQr, closeQr, adoptAt };
}
export = mountChrome;
