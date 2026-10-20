'use strict';
// 标签栏尺寸规格（红线稿）。先定数，再让 harness 与代码照此生成。单位 px，图按 4 倍放大画。
const fs = require('fs');
const path = require('path');
const SPEC = {
  bar: 32,            // 标题栏总高（作者定：刻意比 Chrome 的 40 克制）
  tabTop: 4,          // 标签顶 = hover 块顶 = 栏内 4
  tab: 28,            // 标签高（活动标签贴底）；内容只占上 24，底 4 是活动标签的脚区
  radius: 8,          // 活动标签上圆角与脚
  pill: 24,           // hover 块高，栏内上 4 下 4 → 以栏中心线 16 对称；所有内容也以 16 为中心
  pillGap: 4,         // hover 块到栏顶／栏底的距离
  pillSide: 6,        // hover 块左右各缩 6 → 相邻块之间 12，活动标签 8 的脚不压到药丸圆角
  padL: 10, padR: 6,  // 内容左右内边距（相对 hover 块）
  icon: 14,           // 杀 图标（块内上下各 5）
  chip: 18,           // 服名 chip（块内上下各 3），字 12
  ctl: 18,            // ×、喇叭 点击框（块内上下各 3），线图标 12；× 悬停只变深不画底，标签里唯一的「盒子」是服名 chip
  gap: 6,             // 内容元素间距
  sep: { w: 1, h: 16 }, // 分隔线，在标签区垂直居中；用透明度渐显渐隐 150ms
  newTab: 24,         // +（栏内上下各 4）
  nav: 28,            // ← → ↻（栏内上下各 2）
  caption: { w: 46, h: 32, pillW: 40, pillH: 24 }, // 右上四键，hover 块四周留 3／4
};
const S = 4; // 放大倍数
const W = 700, H = 78;
const y0 = 24; // 画布内标题栏起点
const px = v => v * S;
const dim = (x1, y1, x2, y2, label, dx = 0, dy = -6) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d04a3a" stroke-width="1"/><text x="${(x1 + x2) / 2 + dx}" y="${(y1 + y2) / 2 + dy}" font-size="11" fill="#d04a3a" text-anchor="middle">${label}</text>`;
const vdim = (x, y1, y2, label) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#d04a3a" stroke-width="1"/><line x1="${x - 3}" y1="${y1}" x2="${x + 3}" y2="${y1}" stroke="#d04a3a"/><line x1="${x - 3}" y1="${y2}" x2="${x + 3}" y2="${y2}" stroke="#d04a3a"/><text x="${x + 5}" y="${(y1 + y2) / 2 + 4}" font-size="11" fill="#d04a3a">${label}</text>`;
const barY = y0, tabY = barY + px(SPEC.tabTop), pillY = barY + px(SPEC.pillGap);
const tabW = 200; // 示意宽
const tabs = [{ x: 60, kind: 'active' }, { x: 60 + tabW, kind: 'hover' }, { x: 60 + tabW * 2, kind: 'normal' }];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(W)}" height="${px(H)}" viewBox="0 0 ${px(W)} ${px(H)}" font-family="-apple-system,Segoe UI,sans-serif">
<rect x="0" y="${barY}" width="${px(W)}" height="${px(SPEC.bar)}" fill="#f3f3f3"/>
<rect x="0" y="${barY + px(SPEC.bar)}" width="${px(W)}" height="${px(12)}" fill="#2b2d3a"/>`;
for (const t of tabs) {
  const x = px(t.x), w = px(tabW);
  if (t.kind === 'active') {
    const r = px(SPEC.radius);
    svg += `<path d="M${x - r} ${tabY + px(SPEC.tab)} a${r} ${r} 0 0 0 ${r} -${r} V${tabY + r} a${r} ${r} 0 0 1 ${r} -${r} H${x + w - r} a${r} ${r} 0 0 1 ${r} ${r} V${tabY + px(SPEC.tab) - r} a${r} ${r} 0 0 0 ${r} ${r} Z" fill="#fff"/>`;
  }
  if (t.kind === 'hover') svg += `<rect x="${x + px(SPEC.pillSide)}" y="${pillY}" width="${w - px(SPEC.pillSide * 2)}" height="${px(SPEC.pill)}" rx="${px(SPEC.radius)}" fill="rgba(0,0,0,.05)"/>`;
  if (t.kind === 'normal') svg += `<rect x="${x}" y="${tabY + px((SPEC.tab - SPEC.sep.h) / 2)}" width="${px(SPEC.sep.w)}" height="${px(SPEC.sep.h)}" fill="#c4c4c7"/>`;
  // 内容：图标、chip、标题、×（全部以 hover 块中心线对齐）
  const cy = pillY + px(SPEC.pill) / 2;
  let cx = x + px(SPEC.pillSide + SPEC.padL);
  svg += `<rect x="${cx}" y="${cy - px(SPEC.icon) / 2}" width="${px(SPEC.icon)}" height="${px(SPEC.icon)}" rx="${px(3)}" fill="#8a2a1a"/>`; cx += px(SPEC.icon + SPEC.gap);
  svg += `<rect x="${cx}" y="${cy - px(SPEC.chip) / 2}" width="${px(44)}" height="${px(SPEC.chip)}" rx="${px(4)}" fill="rgba(0,0,0,.07)"/><text x="${cx + px(6)}" y="${cy + px(4)}" font-size="${px(12)}" fill="#5c5c63">官服 ⌄</text>`; cx += px(44 + SPEC.gap);
  svg += `<text x="${cx}" y="${cy + px(4)}" font-size="${px(12)}" fill="#1b1b1f">三国杀OL</text>`;
  const xx = x + w - px(SPEC.pillSide + SPEC.padR + SPEC.ctl);
  svg += `<rect x="${xx}" y="${cy - px(SPEC.ctl) / 2}" width="${px(SPEC.ctl)}" height="${px(SPEC.ctl)}" rx="${px(4)}" fill="none" stroke="#c4c4c7" stroke-dasharray="4 4"/><text x="${xx + px(SPEC.ctl) / 2}" y="${cy + px(4)}" font-size="${px(12)}" fill="#5c5c63" text-anchor="middle">×</text>`;
}
// 标注
const hx = px(tabs[1].x + tabW) - 10;
svg += vdim(px(14), barY, barY + px(SPEC.bar), `栏 ${SPEC.bar}`);
svg += vdim(px(34), tabY, tabY + px(SPEC.tab), `标签 ${SPEC.tab}`);
svg += vdim(px(34), barY, tabY, `${SPEC.tabTop}`);
svg += vdim(hx, barY, pillY, `${SPEC.pillGap}`);
svg += vdim(hx, pillY, pillY + px(SPEC.pill), `块 ${SPEC.pill}`);
svg += vdim(hx, pillY + px(SPEC.pill), barY + px(SPEC.bar), `${SPEC.pillGap}`);
const cy = pillY + px(SPEC.pill) / 2, ix = px(tabs[1].x + SPEC.pillSide + SPEC.padL);
svg += vdim(ix - 10, pillY, cy - px(SPEC.icon) / 2, `${(SPEC.pill - SPEC.icon) / 2}`);
svg += vdim(ix - 10, cy + px(SPEC.icon) / 2, pillY + px(SPEC.pill), `${(SPEC.pill - SPEC.icon) / 2}`);
const chx = ix + px(SPEC.icon + SPEC.gap);
svg += vdim(chx - 10, pillY, cy - px(SPEC.chip) / 2, `${(SPEC.pill - SPEC.chip) / 2}`);
svg += vdim(chx - 10, cy + px(SPEC.chip) / 2, pillY + px(SPEC.pill), `${(SPEC.pill - SPEC.chip) / 2}`);
svg += dim(px(tabs[1].x), barY + px(SPEC.bar) + px(12) + 16, px(tabs[1].x + SPEC.pillSide), barY + px(SPEC.bar) + px(12) + 16, `${SPEC.pillSide}`, 0, 16);
svg += dim(px(tabs[1].x + SPEC.pillSide), barY + px(SPEC.bar) + px(12) + 16, ix, barY + px(SPEC.bar) + px(12) + 16, `内边距 ${SPEC.padL}`, 0, 16);
svg += `<text x="${px(tabs[0].x) + 8}" y="${barY - 8}" font-size="12" fill="#5c5c63">活动标签：贴底，上圆角 ${SPEC.radius}，两侧 ${SPEC.radius} 的脚盖在邻居 hover 块上形成 S 线</text>`;
svg += `<text x="${px(tabs[2].x) + 8}" y="${barY + px(SPEC.bar) + px(12) + 40}" font-size="12" fill="#5c5c63">分隔线 ${SPEC.sep.w}×${SPEC.sep.h}，标签区垂直居中；邻近活动／悬停标签时 150ms 渐隐，离开渐显</text>`;
svg += `</svg>`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>标签栏规格</title>
<style>body{margin:0;padding:24px;background:#e4e4e7;font:13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei UI",sans-serif;color:#1b1b1f}h1{font-size:16px;margin:0 0 6px}p{color:#5c5c63;margin:0 0 14px;max-width:1000px}svg{display:block;background:#fff;border:1px solid #c9c9cc;border-radius:6px}table{border-collapse:collapse;margin-top:16px;font-size:13px}td,th{border:1px solid #d9d9dc;padding:4px 10px;text-align:left}th{background:#f3f3f3;font-weight:500}</style></head><body>
<h1>标签栏规格（4 倍放大）</h1>
<p>先定数再画。一条中心线：栏高 ${SPEC.bar} 的中线 ${SPEC.bar / 2}。hover 块 ${SPEC.pill} 在栏内上下各 ${SPEC.pillGap}；图标、chip、×、导航键、+ 全部以这条线为中心。活动标签贴底、比块多出底部 ${SPEC.tab - SPEC.pill} 的脚区，内容仍在中线上。× 在任何宽度都显示。改数改 build-tab-spec.js 的 SPEC，harness 与代码同源。</p>
${svg}
<table><tr><th>项</th><th>值</th><th>说明</th></tr>
${Object.entries(SPEC).map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === 'object' ? JSON.stringify(v) : v}</td><td></td></tr>`).join('')}
</table></body></html>`;
fs.writeFileSync(path.join(__dirname, 'tab-spec.html'), html);
fs.writeFileSync(path.join(__dirname, 'tab-spec.json'), JSON.stringify(SPEC, null, 2));
console.log('tab-spec.html written');
