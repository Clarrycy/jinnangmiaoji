'use strict';
// 壳 1:1 harness。基底样式直接取自 core/game-shell.js；标签栏／导航按 design/reference 里从 Chrome 量到的常量
// （TAB 34→28 等比：圆角 10→8、分隔线 20→16；按钮 28×28、间距 30；favicon 16、× 16、喇叭 16、+ 28）。
const fs = require('fs');
const path = require('path');
const { TOKENS } = require('../core/overlay-style');
// 共用的 chrome 模块直接从 src/ 的 TS 取：esbuild 打成 CJS 后在本进程求值，不依赖 core/ 的编译产物是否最新
const esbuild = require('esbuild');
function loadTs(file) {
  const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', 'src', 'core', file)], bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20', charset: 'utf8', logLevel: 'silent', external: ['electron'] }).outputFiles[0].text;
  const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports;
}
const SPEC = loadTs('chrome/tab-spec.ts'); // 尺寸单源：design/build-tab-spec.js 生成
const BAR = SPEC.bar;
// 基底样式与壳同源（game-shell.ts）；harness 页面本身是流式的，html/body 不撑满
const baseCss = loadTs('game-shell.ts').baseCss().replace(/html, body \{[^}]*\}/, 'html, body { margin: 0; }');
const ICON = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', 'core', 'icon-256.png')).toString('base64')}`;
// 细线图标（Chrome 2023 刷新版形制：1.5px 线、圆头）
const { SVG } = loadTs('chrome/icons.ts');
const { chromeCss } = loadTs('chrome/css.ts');
const CSS = chromeCss(TOKENS, SPEC);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>壳 1:1 harness</title>
<style>
    body.page { margin: 0; padding: 24px; background: #e4e4e7; font: 13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei UI",sans-serif; color: #1b1b1f; overflow: auto; height: auto; }
    .lead { color: #5c5c63; margin: 0 0 14px; max-width: 1100px; } .lead a.on { font-weight: 600; }
    /* harness 自己的切换条：实际操作面板（活的窗口）／demo 面板预览（三张并列的静态快照） */
    .hbar { display: flex; gap: 2px; margin: 0 0 14px; padding: 2px; width: max-content; background: #d8d8dc; border-radius: 6px; }
    .hbar button { font: inherit; font-size: 12px; height: 24px; padding: 0 12px; border: 0; border-radius: 4px; background: transparent; color: #5c5c63; cursor: pointer; }
    .hbar button.on { background: #fff; color: #1b1b1f; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
    #desk[hidden], #demo[hidden] { display: none; }
    #demo { display: flex; gap: 24px; align-items: flex-start; }
    #demo .col { flex: none; } #demo .col h4 { margin: 0 0 8px; font-size: 12px; font-weight: 500; color: #5c5c63; }
    #demo .frame { width: 1280px; height: 720px; transform-origin: 0 0; position: relative; } #demo .frame .win { pointer-events: none; }
    #demo .frame .win .tip { display: none; }
    .win { position: relative; width: 1280px; height: 720px; border-radius: 8px; overflow: visible; box-shadow: 0 10px 40px rgba(0,0,0,.25); background: #f3f3f3; }
    .win > header { position: relative; }
    .win #viewport { overflow: hidden; }
    .game { position: absolute; inset: 0; display: grid; place-items: center; color: #9a9cab; font-size: 14px; background: #2b2d3a; } .game iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; } .game iframe[hidden] { display: none; } .game[hidden] { display: none; }
${baseCss}
${CSS}
</style></head><body class="page">
<div class="hbar"><button data-mode="live" class="on">实际操作面板</button><button data-mode="demo">demo 面板预览</button></div>
<div id="desk"></div>
<div id="demo" hidden></div>
<script>
const ICON='${ICON}';
${esbuild.buildSync({ entryPoints: [path.join(__dirname, 'shell-harness.entry.ts')], bundle: true, write: false, format: 'iife', target: 'es2022', charset: 'utf8', logLevel: 'silent' }).outputFiles[0].text}
// ===== harness 切换：demo 预览＝把活窗口摆到三个状态，各克隆一份静态快照并排放，再把活窗口恢复 =====
(() => {
  const demo = document.getElementById('demo'), desk = document.getElementById('desk');
  const states = [
    ['菜单', () => { openPage(wins[0], 'settings'); wins[0].cur = wins[0].tabs[0].id; renderAll(); openEntryMenu(wins[0], curTab(wins[0])); const sub = document.querySelector('.entrymenu .item.sub'); if (sub) sub.dispatchEvent(new MouseEvent('mouseenter')); }],
    ['标签列表', () => { toggleTabList(wins[0]); }],
    ['对话框与气泡', () => { savePrompt({ account: 'demo_user_01', password: 'demo-password-01', mode: 'new' }); document.querySelector('.caption .cx').click(); const c = document.querySelector('.dlg .dchk input'); if (c) c.checked = true; toast('已保存设置'); }],
    ['扫码', () => { qrPrompt({ provider: 'WeGame - QQ', stage: 'scan', qr: fakeQr(), text: '' }); }],
    ['扫码出错', () => { qrPrompt({ provider: 'OPPO 扫码登录', stage: 'error', qr: '', text: '', code: 'OPPO_TE_UNAVAILABLE' }); }],
  ];
  /* demo 用的假二维码：定位图案＋伪随机矩阵，只为看版式 */
  const fakeQr = () => { const n = 33, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, n, n); g.fillStyle = '#000'; let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() < .45) g.fillRect(x, y, 1, 1); const finder = (x, y) => { g.fillStyle = '#fff'; g.fillRect(x - 1, y - 1, 9, 9); g.fillStyle = '#000'; g.fillRect(x, y, 7, 7); g.fillStyle = '#fff'; g.fillRect(x + 1, y + 1, 5, 5); g.fillStyle = '#000'; g.fillRect(x + 2, y + 2, 3, 3); }; finder(1, 1); finder(n - 8, 1); finder(1, n - 8); return c.toDataURL('image/png'); };
  window.fakeQr = fakeQr;
  const snapshot = () => {
    demo.textContent = '';
    const zoom = Math.min(0.5, (document.documentElement.clientWidth - 48 - 48) / 3 / 1280);
    const reopen = []; // 后面每个状态的 setup 都会 closeAll（全局），把前面克隆里开着的菜单藏掉；全部克隆完再一次性放回
    for (const [title, setup] of states) {
      try { setup(); } catch (e) { console.warn('demo setup failed', title, e); }
      const col = document.createElement('div'); col.className = 'col'; col.innerHTML = '<h4></h4><div class="frame"></div>'; col.querySelector('h4').textContent = title;
      const frame = col.querySelector('.frame'); frame.style.transform = 'scale(' + zoom + ')'; frame.style.width = '1280px'; frame.style.height = '720px'; col.style.width = Math.round(1280 * zoom) + 'px'; col.style.height = Math.round(720 * zoom) + 28 + 'px';
      const clone = document.querySelector('#desk .win').cloneNode(true); for (const f of clone.querySelectorAll('iframe')) f.remove(); frame.append(clone); demo.append(col);
      // 恢复活窗口：关菜单、收卡、撤对话框、清提示条。closeAll 是全局的，会把克隆里开着的菜单一并藏掉，所以记下来再放回
      reopen.push(...[...clone.querySelectorAll('.menu,.amenu,.tlmenu')].filter(m => !m.hidden));
      closeAll(); closeSave(null); for (const x of document.querySelectorAll('#desk .scrim,#desk .toast,#desk .save')) x.remove();
      // 对话框／保存卡／提示条的进场 class 是下一帧才加的，克隆拿到的是进场前的状态，这里直接补上
      for (const x of clone.querySelectorAll('.scrim,.save,.toast')) x.classList.add('in');
    }
    for (const m of reopen) m.hidden = false;
    renderAll();
  };
  for (const b of document.querySelectorAll('.hbar button')) b.onclick = e => {
    e.stopPropagation(); // 引擎在 document 上监听 click 关掉所有菜单，这个点击不能传到它那里，否则克隆里开着的菜单又被藏掉
    for (const x of document.querySelectorAll('.hbar button')) x.classList.toggle('on', x === b);
    if (b.dataset.mode === 'demo') { snapshot(); desk.hidden = true; demo.hidden = false; } else { demo.hidden = true; desk.hidden = false; renderAll(); }
  };
})();
</script></body></html>`;
const withHv = html.replace(/<style>([\s\S]*?)<\/style>/, (m, css) => `<style>${css}\n/* 离屏核对用：.hv = :hover */\n${css.split('\n').filter(l => l.includes(':hover')).map(l => l.replace(/:hover/g, '.hv')).join('\n')}</style>`);
fs.writeFileSync(path.join(__dirname, 'shell-harness.html'), withHv);
console.log('shell-harness.html written');
