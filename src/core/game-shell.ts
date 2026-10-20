import fs = require('fs');
import overlay_style_ = require('./overlay-style');
const { TOKENS } = overlay_style_;
import chrome_css_ = require('./chrome/css');
const { chromeCss } = chrome_css_;
import SPEC = require('./chrome/tab-spec');

// 浅色外框（design/shell-ui-mockup.html v10，度量由作者调定）：
// 顶栏 32px；游戏视域四周 3px 浅色边 ＋ 1px 线 ＋ 6px 圆角；无底栏。
const TITLE_HEIGHT = SPEC.bar;
const FRAME = Object.freeze({ side: 3, bottom: 3, top: 0, radius: 6 });
const BAR_COLOR = '#f3f3f3';
const BAR_SYMBOL = '#1b1b1f';
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

// 基底样式：标题栏、视域框。chrome 视图与 design/shell-harness 共用这一份（harness 再把 html/body 改成页面流式布局）。
function baseCss() {
  return `
    :root { --frame:${BAR_COLOR}; --line:#e1e1e3; --ink:#1b1b1f; --ink-2:#5c5c63; --ink-3:#8e8e95; --ink-dim:#9a9aa0; --hover:rgba(0,0,0,.05); --accent:#0067c0; --accent-2:#1976d2; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: var(--frame); }
    body { font: 12px "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif; color: var(--ink); user-select: none; }
    body.inactive { color: var(--ink-dim); }
    header { height: ${TITLE_HEIGHT}px; display: flex; align-items: center; padding: 0; -webkit-app-region: drag; }
    /* 视域边框：游戏视图落在这个框内 1px 处 */
    #viewport { position: absolute; left: ${FRAME.side}px; right: ${FRAME.side}px; top: ${TITLE_HEIGHT + FRAME.top}px; bottom: ${FRAME.bottom}px;
      border: 1px solid #e3e3e5; border-radius: ${FRAME.radius}px; background: #1a1a1a; }`;
}

// 窗口本体页：只画外框与视域边线（游戏视图之下）。无脚本，CSP 不放开。
function frameDocument(title: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${escapeHtml(title)}</title><style>${baseCss()}
    #viewport { background: transparent; }</style></head><body><div id="viewport"></div></body></html>`;
}

// chrome 视图页：透明底，标签栏、弹层、内页都由 shell-preload 里的引擎画。平时只露出标题栏那一条，弹层／内页打开时盖满整窗。
function chromeDocument(title: string, iconPath: string) {
  const icon = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${escapeHtml(title)}</title><style>${baseCss()}
    ${chromeCss(TOKENS, SPEC)}
    /* 壳：窗口 DOM 撑满（尺寸由主进程推），视域透明让游戏视图透出来；弹层与内页都要可点 */
    html, body { background: transparent; }
    /* .win 不能有底色：盖满时它会把游戏区整块涂成浅灰（弹层一开游戏就「消失」就是它）；浅灰只画标题条，外框由窗口本体画 */
    .win { position: relative; width: 100%; height: 100%; background: transparent; }
    .win > header { background: var(--frame); -webkit-app-region: no-drag; } /* 拖窗由主进程跟鼠标做，不用 app-region（叠放视图里不可靠） */
    #viewport { background: transparent; }
    #viewport.page { background: #fff; }
    .game { position: absolute; inset: 0; background: transparent; } .game[hidden] { display: none; } .game .ph { display: none; }
    .ib, .tab, .caption span, .menu, .amenu, .tlmenu, .pg, .scrim, .toasts, .tip { -webkit-app-region: no-drag; }
    </style></head><body data-icon="${icon}"></body></html>`;
}

function escapeHtml(value: string) {
  return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

// 游戏视图在窗口内容区中的位置：视域框内缩 1px（让边线露出来）。
function viewportBounds(contentWidth: number, contentHeight: number) {
  const x = FRAME.side + 1;
  const y = TITLE_HEIGHT + FRAME.top + 1;
  return { x, y, width: Math.max(0, contentWidth - x - FRAME.side - 1), height: Math.max(0, contentHeight - y - FRAME.bottom - 1) };
}

export = { TITLE_HEIGHT, FRAME, BAR_COLOR, BAR_SYMBOL, CSP, baseCss, frameDocument, chromeDocument, viewportBounds };
