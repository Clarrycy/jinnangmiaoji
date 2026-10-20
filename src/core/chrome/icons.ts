'use strict';
// 壳 chrome 用的线图标（Chrome 2023 刷新版形制：1.5px 线、圆头）。harness 与壳共用。
const line = (d: string) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const bold = (d: string) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const SVG: Record<string, string> = {
  back: line('<path d="M13 8H3.5M7.5 4 3.5 8l4 4"/>'),
  fwd: line('<path d="M3 8h9.5M8.5 4l4 4-4 4"/>'),
  reload: line('<path d="M13.2 6.5A5.5 5.5 0 1 0 13.5 9"/><path d="M13.5 3.5v3h-3"/>'),
  stop: line('<path d="M4 4l8 8M12 4l-8 8"/>'),
  close: line('<path d="M5 5l6 6M11 5l-6 6"/>'),
  plus: line('<path d="M8 3.5v9M3.5 8h9"/>'),
  volUp: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 7v3M8 4.5v7M11 6v4"/></svg>',
  volOff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 7v3M8 4.5v7M11 6v4" opacity=".45"/><path d="M4 12l8-8"/></svg>', // 斜杠缩到柱子的范围内（原 3.5→12.5 比 × 的臂长 50%）
  key: line('<path d="M6.5 11.5a3.5 3.5 0 1 1 3.3-4.6H14l1 1-1.5 1.5-1.5-1.5-1.5 1.5-1-1.1"/><circle cx="5.5" cy="8" r=".7" fill="currentColor"/>'),
  eye: line('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2.2"/>'),
  eyeOff: line('<path d="M3 3l10 10"/><path d="M6.3 4.1A7 7 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-2.2 2.6M4.4 5.4A11 11 0 0 0 1.5 8S4 12.5 8 12.5a6.6 6.6 0 0 0 2.4-.5"/><path d="M6.4 6.4a2.2 2.2 0 0 0 3.1 3.1"/>'),
  copy: line('<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>'),
  chev: line('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  chevDown: line('<path d="M3.5 6 8 10.5 12.5 6"/>'),
  search: line('<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 14 14"/>'),
  caret: '<svg viewBox="0 0 10 10"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>',
  person: line('<circle cx="8" cy="5.5" r="2.6"/><path d="M3 13.5a5 5 0 0 1 10 0"/>'),
  gear: line('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>'),
  download: line('<path d="M8 2.5v8M4.8 7.3 8 10.5l3.2-3.2M3 13h10"/>'),
  info: line('<circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.2v.2"/>'),
  pen: line('<path d="M3 13h3l7-7-3-3-7 7z"/><path d="M9 4l3 3"/>'),
  menu: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>',
  sliders: line('<path d="M2.5 5h11M2.5 11h11"/><circle cx="6" cy="5" r="1.8" fill="#fff"/><circle cx="10.5" cy="11" r="1.8" fill="#fff"/>'),
  update: line('<circle cx="8" cy="8" r="6"/><path d="M8 11V5.5M5.5 8 8 5.5 10.5 8"/>'),
  ext: line('<path d="M6.5 3.5H4a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V9.5"/><path d="M9.5 3.5h3v3M12.5 3.5 7.5 8.5"/>'),
  check: line('<path d="M3.5 8.5 6.5 11.5 12.5 5"/>'),
  refresh: line('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5V6h-3.5"/>'),
  // 账号行两个操作用 20 格、1.8 线宽、少笔画：打开＝框＋出去的箭头，删除＝盖＋桶
  arrowUpRight: line('<path d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10"/>'),
  open: bold('<path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v8.5A1.5 1.5 0 0 0 5.5 16H14a1.5 1.5 0 0 0 1.5-1.5V11"/><path d="M12 4h4v4M16 4l-6.5 6.5"/>'),
  okCircle: bold('<circle cx="10" cy="10" r="8"/><path d="M6.5 10.5l2.3 2.3L13.5 8"/>'),
  upCircle: bold('<circle cx="10" cy="10" r="8"/><path d="M10 14V6.5M6.8 9.7 10 6.5l3.2 3.2"/>'),
  sync: line('<path d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9L13.5 5.7M13.5 2.5v3.2h-3.2M13.5 8a5.5 5.5 0 0 1-9.4 3.9L2.5 10.3M5.7 10.3H2.5v3.2"/>'),
  script: line('<path d="M5.5 6 3.5 8l2 2M10.5 6l2 2-2 2M9 4.5l-2 7"/>'),
  kebab: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3.5" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="12.5" r="1.3"/></svg>',
  github: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
  chat: line('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>'),
  doc: line('<path d="M4 2.5h5l3 3v8H4z M9 2.5v3h3M6 8.5h4M6 10.5h4"/>'),
  channel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5"></rect><path d="M10.4 7.8l-1 8.4"></path><path d="M14.6 7.8l-1 8.4"></path><path d="M8.2 10.3h8"></path><path d="M7.8 13.7h8"></path></svg>', // 锦囊袋面板里画的频道标志
  trash: line('<path d="M2.5 4.5h11M6 4.5V3.2h4v1.3M4 4.5l.6 8.3a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.3"/>'), // 14px 下去掉桶身两条内线，线密度才和 × 一致
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  min: '<svg viewBox="0 0 10 10"><path d="M0 5h10"/></svg>', max: '<svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9"/></svg>', restore: '<svg viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2"/><rect x=".5" y="2.5" width="7" height="7"/></svg>', x: '<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10"/></svg>',
};
export = { SVG };
