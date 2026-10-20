'use strict';
import fs = require('fs');
import path = require('path');
// 壳内所有弹层共用的设计令牌与基础样式：菜单、手动更新、保存密码、扫码、账号下拉。
// 改这里即全体生效；任何弹层不得再自带一套颜色／圆角／行高。
const TOKENS = Object.freeze({
  font: '12px "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif',
  ink: '#1b1b1f', ink2: '#5c5c63', ink3: '#8e8e95',
  line: '#e1e1e3', surface: '#ffffff', surface2: '#f3f3f3', surface3: '#e9e9ec', hover: 'rgba(0,0,0,.05)',
  accent: '#0067c0', accent2: '#1976d2', ok: '#1a7f37', danger: '#c42b1c',
  cardRadius: 8, controlRadius: 4, rowHeight: 26, pad: 12, gap: 8,
  shadow: '0 6px 18px rgba(0,0,0,.12)',
});

// 产品图标（保存密码卡标题前、账号下拉每行前，Chrome 的做法）。随 core 打包，不依赖工作区目录。
let ICON_DATA = '';
try { ICON_DATA = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'icon-256.png')).toString('base64')}`; } catch (_) {}

// 卡片族（手动更新／保存密码／账号下拉）共用的 CSS。宿主负责 .card 的定位。
const CARD_CSS = `
  html, body { margin: 0; background: transparent; overflow: hidden; }
  body { font: ${TOKENS.font}; color: ${TOKENS.ink}; user-select: none; }
  .card { box-sizing: border-box; background: ${TOKENS.surface}; border: 1px solid ${TOKENS.line}; border-radius: ${TOKENS.cardRadius}px; box-shadow: ${TOKENS.shadow}; padding: ${TOKENS.pad}px; display: flex; flex-direction: column; gap: ${TOKENS.gap}px; }
  .row { display: flex; align-items: center; gap: ${TOKENS.gap}px; height: ${TOKENS.rowHeight}px; }
  .row[hidden] { display: none; }
  .row.actions { justify-content: flex-end; }
  h1 { margin: 0; font-size: 12px; font-weight: 500; color: ${TOKENS.ink}; flex: 1; }
  h1 + span { color: ${TOKENS.ink3}; }
  label { width: 28px; flex: none; color: ${TOKENS.ink2}; }
  .v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${TOKENS.ink}; font-variant-numeric: tabular-nums; }
  input[type=text] { flex: 1; min-width: 0; height: 100%; font: inherit; padding: 0 9px; border: 1px solid ${TOKENS.line}; border-radius: ${TOKENS.controlRadius}px; outline: none; color: ${TOKENS.ink}; box-sizing: border-box; background: ${TOKENS.surface}; }
  input[type=text]::placeholder { color: ${TOKENS.ink3}; }
  input[type=text]:focus { border-color: ${TOKENS.accent}; }
  button, .btn { font: inherit; cursor: pointer; height: 100%; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; border-radius: ${TOKENS.controlRadius}px; padding: 0 12px; white-space: nowrap; border: 1px solid ${TOKENS.line}; background: ${TOKENS.surface2}; color: ${TOKENS.ink}; }
  button:hover, .btn:hover { background: ${TOKENS.surface3}; }
  button:disabled { opacity: .5; cursor: default; }
  button.primary { background: ${TOKENS.accent}; border-color: ${TOKENS.accent}; color: #fff; }
  button.primary:hover { background: ${TOKENS.accent2}; border-color: ${TOKENS.accent2}; }
  button svg, .icon-btn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
  .icon-btn { width: ${TOKENS.rowHeight}px; height: ${TOKENS.rowHeight}px; border-radius: ${TOKENS.controlRadius}px; display: grid; place-items: center; color: ${TOKENS.ink3}; cursor: pointer; flex: none; }
  .icon-btn:hover { background: ${TOKENS.hover}; color: ${TOKENS.ink}; }
  .seg { position: relative; display: grid; grid-template-columns: 1fr 1fr; height: ${TOKENS.rowHeight}px; padding: 2px; border-radius: 6px; background: #ececee; }
  .seg .thumb { position: absolute; top: 2px; left: 2px; width: calc(50% - 2px); height: calc(100% - 4px); border-radius: ${TOKENS.controlRadius}px; background: ${TOKENS.surface}; box-shadow: 0 1px 2px rgba(0,0,0,.08); transition: transform .26s cubic-bezier(.25,.1,.25,1); }
  .seg[data-on="file"] .thumb { transform: translateX(100%); }
  .seg button { position: relative; height: 100%; border: 0; border-radius: ${TOKENS.controlRadius}px; background: transparent; color: ${TOKENS.ink2}; padding: 0; justify-content: center; transition: color .26s; }
  .seg button:hover { background: transparent; }
  .seg button.on { color: ${TOKENS.ink}; }
  /* 密码框：眼睛放在输入框内右侧（Chrome 做法），两行输入框等宽 */
  .pw { position: relative; flex: 1; min-width: 0; height: 100%; display: flex; }
  .pw input { width: 100%; padding-right: 30px; }
  .pw .icon-btn { position: absolute; right: 2px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; }
  /* 标题行里的小分段控件：模式切换放右上角 */
  .seg.small { flex: none; width: 112px; height: 22px; }
  .status { color: ${TOKENS.ink2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status.ok { color: ${TOKENS.ok}; }
  .status.err { color: ${TOKENS.ink2}; } /* 失败也是陈述，不用红 */
  /* 列表（账号下拉／菜单项）：同一行高、同一悬停底色 */
  .item { display: flex; align-items: center; gap: 8px; height: ${TOKENS.rowHeight}px; padding: 0 10px; border-radius: ${TOKENS.controlRadius}px; white-space: nowrap; cursor: default; }
  .item:hover { background: ${TOKENS.hover}; }
  .fav { width: 16px; height: 16px; border-radius: 3px; flex: none; }
`;

export = { TOKENS, CARD_CSS, ICON_DATA };
