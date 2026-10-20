'use strict';
// 弹层统一设计 harness（可交互）：一个舞台，所有弹层都能真的点开、输入、切换、关闭；
// CSS 直接来自 core/overlay-style.js，右下角滑杆改令牌全体联动。
const fs = require('fs');
const path = require('path');
const { TOKENS, CARD_CSS } = require('../core/overlay-style');
const icon = fs.readFileSync(path.join(__dirname, '..', '_iconwork', 'preview_256.png')).toString('base64');
const FOLDER = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const CARET = '<svg viewBox="0 0 10 10" style="width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:1.4;opacity:.6"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>';
const ICON = `data:image/png;base64,${icon}`;

let css = CARD_CSS
  .replace(new RegExp(`${TOKENS.rowHeight}px`, 'g'), 'var(--row)')
  .replace(new RegExp(`padding: ${TOKENS.pad}px`, 'g'), 'padding: var(--pad)')
  .replace(new RegExp(`gap: ${TOKENS.gap}px`, 'g'), 'gap: var(--gap)')
  .replace(new RegExp(`border-radius: ${TOKENS.cardRadius}px`, 'g'), 'border-radius: var(--r-card)')
  .replace(new RegExp(`border-radius: ${TOKENS.controlRadius}px`, 'g'), 'border-radius: var(--r-ctl)')
  .replace(/font: 12px/g, 'font: var(--fs)')
  .replace(/font-size: 12px/g, 'font-size: var(--fs)');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>弹层统一设计 harness（可交互）</title>
<style>
:root { --row:${TOKENS.rowHeight}px; --pad:${TOKENS.pad}px; --gap:${TOKENS.gap}px; --r-card:${TOKENS.cardRadius}px; --r-ctl:${TOKENS.controlRadius}px; --fs:12px; }
body { margin:0; padding:28px; background:#e4e4e7; font: 13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei UI",sans-serif; color:#1b1b1f; }
h1.page { font-size:16px; margin:0 0 4px; } p.lead { color:#5c5c63; margin:0 0 16px; max-width:900px; }
.stage { position:relative; width:1000px; height:640px; background:#1a1a1a; border:1px solid #c9c9cc; border-radius:6px; overflow:hidden; }
.bar { position:absolute; left:0; right:0; top:0; height:32px; display:flex; align-items:center; gap:10px; padding:0 12px 0 14px; background:#f3f3f3; font:12px "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif; color:#1b1b1f; user-select:none; }
.bar img { width:16px; height:16px; border-radius:3px; }
.bar .chip { display:inline-flex; align-items:center; gap:3px; height:22px; padding:0 6px 0 4px; border-radius:4px; cursor:default; }
.bar .chip:hover, .bar .chip.open { background:rgba(0,0,0,.05); }
.bar .chip.ghost { height:20px; padding:0 9px; border:1px solid #e1e1e3; background:#fff; color:#5c5c63; cursor:pointer; }
.bar .spacer { flex:1; }
/* ===== 共享：core/overlay-style.js ===== */
${css}
/* 菜单：同一令牌，150／26／3／6·3（作者定） */
.menu { position:absolute; width:150px; background:#fff; border:1px solid #e1e1e3; border-radius:6px; box-shadow:${TOKENS.shadow}; padding:3px; box-sizing:border-box; font-size:var(--fs); z-index:5; }
.menu[hidden] { display:none; }
.menu .item { justify-content:space-between; }
.menu .chk { width:9px; height:5px; border-left:1.5px solid #5c5c63; border-bottom:1.5px solid #5c5c63; transform:rotate(-45deg) translateY(-1px); }
.menu .item.sub::after { content:""; width:5px; height:5px; border-right:1.3px solid #8e8e95; border-top:1.3px solid #8e8e95; transform:rotate(45deg); }
.menu .item.sub.open { background:rgba(0,0,0,.05); }
.menu .sep { border-top:1px solid #e1e1e3; margin:3px 6px; }
.card { position:absolute; z-index:6; }
.card[hidden] { display:none; }
/* 版本信息 ／ 手动更新：两块同一语法——标题行、主体行（右端一个 26px 按钮）、灰字行；三行高度、字号、颜色完全一致 */
.vn { flex:1; color:#1b1b1f; }
.vd { color:#0067c0; font-variant-numeric:tabular-nums; white-space:nowrap; }
.vd.ok { color:#1a7f37; }
.row.note { color:#5c5c63; }
.row.more { cursor:pointer; }
.row.more:hover { color:#1b1b1f; }
/* 灰垫块：与输入框同尺寸（高 26、圆角 4、内边距 9），只是底色灰、无边线 */
.pad { flex:1; min-width:0; height:100%; box-sizing:border-box; display:flex; align-items:center; gap:8px; padding:0 9px; border:1px solid transparent; border-radius:var(--r-ctl); background:#f3f3f3; }
.padlist { background:#f3f3f3; border-radius:var(--r-ctl); padding:4px 9px; }
/* 展开用加号；展开后转 45° 成叉 */
.plus { position:relative; width:14px; height:14px; margin-left:auto; flex:none; transition:transform .2s; }
.plus::before, .plus::after { content:""; position:absolute; left:50%; top:50%; background:currentColor; transform:translate(-50%,-50%); }
.plus::before { width:10px; height:1.4px; } .plus::after { width:1.4px; height:10px; }
.plus.open { transform:rotate(45deg); }
.row.quiet .vn, .row.quiet .vd { color:#8e8e95; }
/* 上下两个板块：各自内边距，板块之间一条线 */
.card .block { padding:var(--pad); display:flex; flex-direction:column; gap:var(--gap); }
.card .block + .block { border-top:1px solid #e1e1e3; }
#status { color:inherit; } #status.busy { color:#0067c0; } #status.ok { color:#1a7f37; }
/* 账号下拉 */
.list { padding:4px; width:260px; }
.list .item { height: calc(var(--row) + 4px); }
.fav { width:16px; height:16px; border-radius:3px; flex:none; }
.list .dots { color:#8e8e95; letter-spacing:1px; }
/* 假官方表单（只为触发账号下拉与保存卡） */
.form { position:absolute; left:300px; top:200px; width:400px; color:#d7b46a; font:16px serif; display:grid; grid-template-columns:100px 1fr; gap:14px 10px; align-items:center; }
.form input { height:40px; border:1px solid #8a6a2e; border-radius:3px; background:rgba(0,0,0,.35); color:#eee; font:14px sans-serif; padding:0 10px; outline:none; }
.form input:focus { border-color:#d7b46a; }
.form .login { grid-column:1/3; height:40px; background:#d7b46a; color:#3a2a10; border:0; border-radius:3px; font:16px serif; cursor:pointer; }
.dim { position:absolute; inset:32px 0 0 0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:7; opacity:0; transition:opacity .16s; pointer-events:none; }
.dim.in { opacity:1; pointer-events:auto; }
.dim .card { position:static; transform:scale(.96); transition:transform .16s; }
.dim.in .card { transform:scale(1); }
.qrframe { width:216px; height:216px; border:1px solid #e1e1e3; border-radius:6px; display:grid; place-items:center; color:#8e8e95; }
.hint { position:absolute; left:14px; bottom:12px; color:#8e8e95; font-size:12px; }
.tune { position:fixed; right:16px; bottom:16px; width:230px; background:#fff; border:1px solid #e1e1e3; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.12); padding:10px 12px; font-size:12px; }
.tune label { display:grid; grid-template-columns:56px 1fr 30px; align-items:center; gap:8px; margin:3px 0; color:#5c5c63; }
.tune output { text-align:right; }
.card input[type=password] { flex:1; min-width:0; height:100%; width:100%; font:inherit; padding:0 9px; border:1px solid #e1e1e3; border-radius:var(--r-ctl); outline:none; color:#1b1b1f; box-sizing:border-box; letter-spacing:1px; }
.card input[type=password]:focus { border-color:#0067c0; }
</style></head><body>
<h1 class="page">弹层统一设计 harness（可交互）</h1>
<p class="lead">全部能点：点「官服」开菜单、悬停「其他渠道服」出子菜单、选一项即切换；点「版本」开「版本信息」：打开即自动检查；上下两块同一语法（标题／一行主体＋一个按钮／一行灰字）；手动更新一个输入框，框内文件夹图标选文件、滑块切换、导入看状态；点账号框出下拉、选一行同时填账号密码；点「登录游戏」弹保存卡，账号密码在卡里可编辑、眼睛切换明文；子菜单里选扫码项弹扫码卡，点外面关。CSS 就是 <code>core/overlay-style.js</code> 那一份。</p>
<div class="stage" id="stage">
  <div class="bar"><img src="${ICON}"><span>锦囊妙计 · 一将成名</span><span class="chip" id="entry"><span id="entry-label">官服</span> ${CARET}</span><span class="spacer"></span><span class="chip ghost" id="ver-btn">版本</span></div>
  <div class="menu" id="menu" hidden></div>
  <div class="menu" id="submenu" hidden style="width:160px"></div>
  <div class="form">
    <div>游卡通行证</div><input id="acct" placeholder="手机号/邮箱/账号" autocomplete="off">
    <div>密 码</div><input id="pwd" type="password" placeholder="请填写密码" autocomplete="off">
    <button class="login" id="login">登录游戏</button>
  </div>
  <div class="card list" id="list" hidden></div>
  <div class="card" id="ver" hidden style="right:8px;top:36px;width:340px;padding:0;gap:0">
    <div class="block">
      <div class="row"><h1>版本信息</h1></div>
      <div class="row" id="ver-focus"><div class="pad"><span class="vn">小抄</span><span class="vd" id="ver-focus-d">1.18.0 → 1.19.5</span></div><button id="xc-upd">更新</button></div>
      <div class="row note more" id="ver-more"><span id="ver-more-text">其余 6 项均为最新 · 刚刚检查</span><span class="plus" id="ver-chev"></span></div>
      <div id="ver-list" class="padlist" hidden>
        <div class="row quiet"><span class="vn">锦囊袋</span><span class="vd">1.7.1</span></div>
        <div class="row quiet"><span class="vn">统一登录器</span><span class="vd">0.9.26</span></div>
        <div class="row quiet"><span class="vn">微端</span><span class="vd">1.4.0</span></div>
        <div class="row quiet"><span class="vn">牌局背景</span><span class="vd">2.3.0</span></div>
        <div class="row quiet"><span class="vn">自助观星</span><span class="vd">1.1.0</span></div>
        <div class="row quiet"><span class="vn">烽火工具箱</span><span class="vd">无法检查</span></div>
      </div>
    </div>
    <div class="block">
      <div class="row"><h1>手动更新</h1></div>
      <div class="row"><div class="pw"><input type="text" id="url" placeholder="粘贴更新链接，或选择文件"><span class="icon-btn" id="file" title="选择文件">${FOLDER}</span></div><button id="go">导入</button></div>
      <div class="row note"><span class="status" id="status">等待输入链接…</span></div>
    </div>
  </div>
  <div class="card" id="save" hidden style="right:8px;top:36px;width:300px">
    <div class="row"><img class="fav" src="${ICON}"><h1 id="save-title">保存密码？</h1></div>
    <div class="row"><label>账号</label><input type="text" id="save-acct"></div>
    <div class="row"><label>密码</label><div class="pw"><input type="password" id="save-pwd"><span class="icon-btn" id="eye">${EYE}</span></div></div>
    <div class="row actions"><button id="no">不保存</button><button class="primary" id="yes">保存</button></div>
  </div>
  <div class="dim" id="qr"><div class="card" style="width:320px;height:320px;align-items:center;gap:10px;padding:14px 20px"><h1 id="qr-title" style="flex:none;font-weight:400;color:#5c5c63"></h1><div class="qrframe">二维码</div><div class="status">请用手机扫码</div></div></div>
  <div class="hint" id="hint">已存账号：0</div>
</div>
<div class="tune">
  <label>字号<input type="range" min="11" max="14" value="12" data-var="--fs" data-unit="px"><output>12</output></label>
  <label>行高<input type="range" min="22" max="34" value="${TOKENS.rowHeight}" data-var="--row" data-unit="px"><output>${TOKENS.rowHeight}</output></label>
  <label>内边距<input type="range" min="8" max="20" value="${TOKENS.pad}" data-var="--pad" data-unit="px"><output>${TOKENS.pad}</output></label>
  <label>行距<input type="range" min="4" max="16" value="${TOKENS.gap}" data-var="--gap" data-unit="px"><output>${TOKENS.gap}</output></label>
  <label>卡圆角<input type="range" min="4" max="14" value="${TOKENS.cardRadius}" data-var="--r-card" data-unit="px"><output>${TOKENS.cardRadius}</output></label>
  <label>控件圆角<input type="range" min="2" max="8" value="${TOKENS.controlRadius}" data-var="--r-ctl" data-unit="px"><output>${TOKENS.controlRadius}</output></label>
</div>
<script>
const $ = id => document.getElementById(id);
const ENTRIES = ['官服','4399','QQ 大厅','7K7K','百度','360','哔哩哔哩'];
const PROVIDERS = ['WeGame - QQ','WeGame - 微信','Steam 扫码登录','OPPO 扫码登录','VIVO 扫码登录','华为扫码登录','荣耀扫码登录'];
let current = '官服', subOpen = false;
const saved = []; // {account,password}
const hideAll = () => { $('menu').hidden = true; $('submenu').hidden = true; subOpen = false; $('entry').classList.remove('open'); $('ver').hidden = true; $('list').hidden = true; };
function renderMenu() {
  const m = $('menu'); m.textContent = '';
  for (const e of ENTRIES) { const d = document.createElement('div'); d.className = 'item'; d.textContent = e; if (e === current) { const c = document.createElement('i'); c.className = 'chk'; d.append(c); } d.onclick = ev => { ev.stopPropagation(); current = e; $('entry-label').textContent = e; hideAll(); }; m.append(d); }
  const sep = document.createElement('div'); sep.className = 'sep'; m.append(sep);
  const other = document.createElement('div'); other.className = 'item sub' + (subOpen ? ' open' : ''); other.textContent = '其他渠道服';
  other.onmouseenter = () => { if (!subOpen) { subOpen = true; renderMenu(); } };
  other.onclick = ev => { ev.stopPropagation(); subOpen = !subOpen; renderMenu(); };
  m.append(other);
  const r = $('entry').getBoundingClientRect(), s = $('stage').getBoundingClientRect();
  m.style.left = (r.left - s.left - 8) + 'px'; m.style.top = (r.bottom - s.top + 2) + 'px'; m.hidden = false;
  const sm = $('submenu'); sm.hidden = !subOpen;
  if (subOpen) { sm.textContent = ''; for (const p of PROVIDERS) { const d = document.createElement('div'); d.className = 'item'; d.textContent = p; d.onclick = ev => { ev.stopPropagation(); hideAll(); $('qr-title').textContent = '使用 ' + p.replace(/ ?扫码登录$/, '') + ' 扫码登录游戏'; $('qr').classList.add('in'); }; sm.append(d); }
    sm.style.left = (parseFloat(m.style.left) + m.offsetWidth + 2) + 'px'; sm.style.top = (parseFloat(m.style.top) + other.offsetTop) + 'px'; }
}
$('entry').onclick = ev => { ev.stopPropagation(); const open = $('menu').hidden; hideAll(); if (open) { $('entry').classList.add('open'); renderMenu(); } };
$('ver-btn').onclick = ev => { ev.stopPropagation(); const open = $('ver').hidden; hideAll(); $('ver').hidden = !open; if (open) { $('ver-more-text').textContent = '其余 6 项均为最新 · 正在检查…'; setTimeout(() => { $('ver-more-text').textContent = '其余 6 项均为最新 · 刚刚检查'; }, 600); } };
$('xc-upd').onclick = () => { const d = $('ver-focus-d'); $('xc-upd').disabled = true; d.className = 'vd'; d.textContent = '正在下载…'; setTimeout(() => { d.className = 'vd ok'; d.textContent = '已更新，下次进入游戏生效'; $('xc-upd').remove(); }, 900); };
$('ver-more').onclick = ev => { ev.stopPropagation(); const l = $('ver-list'); l.hidden = !l.hidden; $('ver-chev').classList.toggle('open', !l.hidden); };
const status = (t, cls) => { $('status').textContent = t; $('status').className = 'status ' + (cls || ''); };
$('go').onclick = () => { const v = $('url').value.trim(); if (!v) { status('等待输入链接…'); return; } status(v.startsWith('file:') ? '正在读取文件…' : '正在下载更新…', 'busy'); setTimeout(() => (v.startsWith('file:') || /^https:/.test(v)) ? status('更新成功，正在重新进入游戏', 'ok') : status('更新失败：链接需要以 https:// 开头'), 700); };
$('url').addEventListener('keydown', ev => { if (ev.key === 'Enter') $('go').click(); });
$('file').onclick = () => { $('url').value = 'file:///C:/Users/you/Downloads/jinnangdai.runtime.js'; status('已选择文件，点「导入」'); };
// 账号下拉
function showList() { if (saved.length === 0) return; const l = $('list'); l.textContent = ''; for (const s of saved) { const d = document.createElement('div'); d.className = 'item'; d.innerHTML = '<img class="fav" src="${ICON}"><span class="v"></span><span class="dots"></span>'; d.querySelector('.v').textContent = s.account; d.querySelector('.dots').textContent = '•'.repeat(Math.min(12, s.password.length)); d.onmousedown = ev => { ev.preventDefault(); $('acct').value = s.account; $('pwd').value = s.password; l.hidden = true; }; l.append(d); }
  const r = $('acct').getBoundingClientRect(), st = $('stage').getBoundingClientRect(); l.style.left = (r.left - st.left) + 'px'; l.style.top = (r.bottom - st.top + 4) + 'px'; l.style.width = r.width + 'px'; l.hidden = false; }
$('acct').onfocus = showList; $('acct').onclick = showList; $('acct').onblur = () => setTimeout(() => { $('list').hidden = true; }, 120);
// 登录 → 保存卡（账号密码可编辑）
$('login').onclick = () => { const a = $('acct').value.trim(), p = $('pwd').value; if (!a) return; hideAll(); const exist = saved.find(s => s.account === a); if (exist && exist.password === p) return; $('save-title').textContent = exist ? '更新密码？' : '保存密码？'; $('yes').textContent = exist ? '更新' : '保存'; $('save-acct').value = a; $('save-pwd').value = p; $('save-pwd').type = 'password'; $('save').hidden = false; };
$('eye').onclick = () => { $('save-pwd').type = $('save-pwd').type === 'password' ? 'text' : 'password'; };
$('no').onclick = () => { $('save').hidden = true; };
$('yes').onclick = () => { const a = $('save-acct').value.trim(), p = $('save-pwd').value; const i = saved.findIndex(s => s.account === a); if (i >= 0) saved[i].password = p; else saved.push({ account: a, password: p }); $('save').hidden = true; $('hint').textContent = '已存账号：' + saved.length + '（再点账号框看下拉）'; };
$('qr').onclick = ev => { if (!ev.target.closest('.card')) $('qr').classList.remove('in'); };
document.addEventListener('click', ev => { if (!ev.target.closest('#menu,#submenu,#ver,#save,#entry,#ver-btn')) { $('menu').hidden = true; $('submenu').hidden = true; subOpen = false; $('entry').classList.remove('open'); $('ver').hidden = true; } });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { hideAll(); $('save').hidden = true; $('qr').classList.remove('in'); } });
for (const i of document.querySelectorAll('.tune input')) i.addEventListener('input', () => { document.documentElement.style.setProperty(i.dataset.var, i.value + i.dataset.unit); i.nextElementSibling.textContent = i.value; });
</script>
</body></html>`;
fs.writeFileSync(path.join(__dirname, 'overlay-harness.html'), html);
console.log('overlay-harness.html written');
