// 由 src/core/chrome/css.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
function chromeCss(TOKENS, SPEC) {
  const BAR = SPEC.bar;
  return `
    /* ===== 追加：导航 ＋ 标签栏（Chrome 几何，等比装进 32px） ===== */
    header { padding-left: 0; gap: 0; }
    .nav { display: flex; align-items: center; height: ${BAR}px; padding: 0 0 0 6px; gap: 2px; flex: none; -webkit-app-region: no-drag; }
    .ib { width: ${SPEC.nav}px; height: ${SPEC.nav}px; border: 0; padding: 0; background: transparent; border-radius: 4px; color: var(--ink-2); display: grid; place-items: center; cursor: pointer; flex: none; }
    .ib svg { width: 16px; height: 16px; stroke-width: 1.4; }
    .ib:hover { background: rgba(0,0,0,.06); }
    .ib:active { background: rgba(0,0,0,.12); }
    .ib:disabled { color: var(--ink-3); opacity: .45; cursor: default; background: transparent; }
    .tabs { position: relative; height: ${BAR}px; flex: 1; min-width: 0; -webkit-app-region: drag; }
    /* 标签绝对定位：排序／关闭／拖出时其余标签按 Chrome 的曲线滑到新位置 */
    .tab { position: absolute; top: ${SPEC.tabTop}px; display: flex; align-items: center; height: ${SPEC.tab}px; box-sizing: border-box; min-width: 0; padding: 0 ${SPEC.pillSide + SPEC.padR}px ${SPEC.tab - SPEC.pill}px ${SPEC.pillSide + SPEC.padL}px; gap: ${SPEC.gap}px;
      border-radius: ${SPEC.radius}px ${SPEC.radius}px 0 0; color: var(--ink-2); cursor: default; -webkit-app-region: no-drag; user-select: none; z-index: 0;
      transition: left .2s cubic-bezier(.2,0,0,1), width .2s cubic-bezier(.2,0,0,1); }
    .newtab { position: absolute; top: ${(SPEC.bar - SPEC.newTab) / 2}px; /* 中心线 */ width: ${SPEC.newTab}px; height: ${SPEC.newTab}px; transition: left .2s cubic-bezier(.2,0,0,1); } .newtab svg { width: 14px; height: 14px; }
    /* 激活：白底和两只脚 120ms 淡入（先是 hover 的软药丸，再实成白标签）；失活同样淡出 */
    .tab { transition: left .2s cubic-bezier(.2,0,0,1), width .2s cubic-bezier(.2,0,0,1), background-color var(--t-tabms, 120ms) ease, color var(--t-tabms, 120ms) ease; }
    .tab.on { background: #fff; color: var(--ink); z-index: 1; }
    /* 活动标签两侧的脚：与上圆角同半径，接到基线成 S 形；常驻、靠透明度开合 */
    .tab::before, .tab::after { content: ""; position: absolute; bottom: 0; width: ${SPEC.radius}px; height: ${SPEC.radius}px; background: #fff; opacity: 0; transition: opacity var(--t-tabms, 120ms) ease; pointer-events: none; }
    .tab.on::before, .tab.on::after { opacity: 1; }
    .tab::before { left: -${SPEC.radius}px; -webkit-mask: radial-gradient(circle at 0 0, transparent ${SPEC.radius}px, #000 ${SPEC.radius + 0.5}px); }
    .tab::after { right: -${SPEC.radius}px; -webkit-mask: radial-gradient(circle at 100% 0, transparent ${SPEC.radius}px, #000 ${SPEC.radius + 0.5}px); }
    /* 非活动标签 hover／右键选中：内缩药丸（Chrome），栏内上下各 ${SPEC.pillGap}，左右各缩 ${SPEC.pillSide} */
    /* 非活动标签的 hover 药丸：进入即亮，离开 180ms 淡出（敏捷进、缓慢退） */
    .tab .pill { position: absolute; left: ${SPEC.pillSide}px; right: ${SPEC.pillSide}px; top: 0; bottom: ${SPEC.tab - SPEC.pill}px; border-radius: ${SPEC.radius}px; background: rgba(0,0,0,0); z-index: -1; transition: background-color var(--t-hovms, 120ms) ease, opacity var(--t-tabms, 120ms) ease; pointer-events: none; }
    .tab.on .pill { opacity: 0; }
    .tab:not(.on):hover, .tab:not(.on).ctx { color: var(--ink); transition-duration: 0s; }
    .tab:not(.on):hover .pill, .tab:not(.on).ctx .pill { background: rgba(0,0,0,.05); transition-duration: 0s; }
    .tab.drag { z-index: 3; transition: none; }
    .tab.drag.on { box-shadow: 0 2px 10px rgba(0,0,0,.18); }
    /* 分隔：非活动、非悬停的相邻标签之间 1×16 竖线 */
    .tab .sep { position: absolute; left: -1px; top: ${(SPEC.pill - SPEC.sep.h) / 2}px; width: ${SPEC.sep.w}px; height: ${SPEC.sep.h}px; background: #c4c4c7; opacity: 1; transition: opacity .15s ease; }
    .tab:first-child .sep, .tab.on .sep, .tab.on + .tab .sep, .tab:hover .sep, .tab:hover + .tab .sep, .tab.ctx .sep, .tab.ctx + .tab .sep { opacity: 0; }
    .tab .fav { width: ${SPEC.icon}px; height: ${SPEC.icon}px; border-radius: 3px; flex: none; }
    .tab .fav.page { color: var(--ink-2); display: grid; place-items: center; } .tab .fav.page svg { width: ${SPEC.icon}px; height: ${SPEC.icon}px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
    .tab .entry { display: inline-flex; align-items: center; gap: 3px; height: ${SPEC.chip}px; padding: 0 6px 0 5px; border-radius: 4px; white-space: nowrap; flex: none; line-height: 1; }
    .tab .entry { background: rgba(0,0,0,.06); color: var(--ink-2); }
    .tab.on .entry { background: #ededef; }
    .tab:not(.on):hover .entry { background: rgba(0,0,0,.09); } /* hover 底上 chip 仍要分得出来 */
    .tab .entry:hover, .tab .entry.open { background: rgba(0,0,0,.1); color: var(--ink); }
    .tab .entry svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: .6; }
    .tab .t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent); }
    .tab .t.dim { color: var(--ink-3); }
    .ib:focus:not(:focus-visible), .ib:focus { outline: none; }
    .tab .snd { width: ${SPEC.ctl}px; height: ${SPEC.ctl}px; margin: 0; color: var(--ink-2); flex: none; display: grid; place-items: center; border-radius: 4px; }
    .tab .snd svg { width: 16px; height: 16px; stroke-width: 1.3; } /* 与 × 同线宽：原 1.5 比 × 粗 15%，再加斜杠横跨三根柱子，看着就重 */ .tab .snd:hover { color: var(--ink); background: rgba(0,0,0,.08); }
    .tab .snd[hidden] { display: none; }
    .tab .x { width: ${SPEC.ctl}px; height: ${SPEC.ctl}px; margin-left: auto; border-radius: 4px; display: grid; place-items: center; color: var(--ink-2); flex: none; }
    .tab .x svg { width: 16px; height: 16px; stroke-width: 1.3; }
    .tab .x:hover, .newtab:hover { background: rgba(0,0,0,.08); color: var(--ink); }
    /* 窄标签（Chrome 规则的本地化：活动标签保留 ×，非活动标签窄时藏 ×；再窄藏标题；再窄藏 chip） */
    .tab.w-narrow .t { display: none; }
    .tab.w-narrow { padding-left: ${SPEC.pillSide + 8}px; padding-right: ${SPEC.pillSide + 6}px; }
    .tab.w-narrow .entry { margin-right: 8px; }
    .tab .entry .el { display: inline-block; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tabs .clip { position: absolute; left: 0; right: 0; top: 0; bottom: 0; overflow: hidden; }
    .tabs.overflow .clip { right: 44px; }
    .tabs .rail { position: absolute; left: 0; top: 0; height: 100%; transition: transform .2s cubic-bezier(.2,0,0,1); }
    .newtab.pin { position: absolute; right: 8px; left: auto !important; }
    .tablist { position: absolute; left: 4px; top: ${(SPEC.bar - SPEC.newTab) / 2}px; width: ${SPEC.newTab}px; height: ${SPEC.newTab}px; display: none; }
    .tabs.multi .tablist { display: grid; }
    .tabs.multi .clip { left: 32px; }
    .tabs.overflow .clip { right: 40px; }
    .tabs.overflow .clip.scrolled { -webkit-mask-image: linear-gradient(90deg, transparent 4px, #000 44px); }
    .tlmenu { position: absolute; top: ${BAR + 2}px; width: 280px; max-height: 420px; overflow: auto; background: #fff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06); padding: 6px; font-size: 13px; z-index: 6; }
    .tlmenu[hidden] { display: none; }
    .tlmenu::-webkit-scrollbar { width: 6px; } .tlmenu::-webkit-scrollbar-thumb { background: #c4c4c7; border-radius: 3px; } .tlmenu::-webkit-scrollbar-track { background: transparent; }
    .tlmenu .item { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border-radius: 6px; }
    .tlmenu .item:hover { background: ${TOKENS.hover}; } .tlmenu .item.on { background: rgba(0,103,192,.08); }
    .tlmenu .item img { width: 16px; height: 16px; border-radius: 3px; } .tlmenu .item .pi { width: 16px; height: 16px; display: grid; place-items: center; color: ${TOKENS.ink2}; flex: none; } .tlmenu .item .pi svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
    .tlmenu .item .e { color: ${TOKENS.ink2}; flex: none; white-space: nowrap; } .tlmenu .item .n { flex: 1; min-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tlmenu .item .st { color: ${TOKENS.ink3}; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 6px; } .tlmenu .item .st svg { width: 14px; height: 14px; } .tlmenu .item .st .mem { min-width: 64px; text-align: right; white-space: nowrap; } .tlmenu .item .st .mute { width: 14px; height: 14px; display: grid; place-items: center; flex: none; }
    .tlmenu .item .cx { width: 20px; height: 20px; border-radius: 4px; display: grid; place-items: center; color: ${TOKENS.ink2}; visibility: hidden; margin-left: 2px; } .tlmenu .item:hover .cx { visibility: visible; } .tlmenu .item .cx:hover { background: rgba(0,0,0,.08); color: ${TOKENS.ink}; } .tlmenu .item .cx svg { width: 14px; height: 14px; }
    .tlmenu .sh { color: ${TOKENS.ink3}; font-size: 12px; padding: 10px 10px 4px; margin-top: 6px; border-top: 1px solid ${TOKENS.line}; } .tlmenu .item.closed .n { color: ${TOKENS.ink2}; } .tlmenu .item.closed .mem { color: ${TOKENS.ink3}; font-variant-numeric: tabular-nums; }
    .tlmenu .item .cur { width: 20px; display: grid; place-items: center; } .tlmenu .item .cur .chk { transform: rotate(-45deg) translateY(-2px); }
    .tab .x:active, .newtab:active, .ib:active { background: rgba(0,0,0,.12); }
    .caption { display: flex; height: ${BAR}px; flex: none; margin-left: auto; -webkit-app-region: no-drag; }
    .caption span { width: ${SPEC.caption.w}px; height: ${BAR}px; display: grid; place-items: center; color: var(--ink-2); position: relative; }
    .caption span::before { content: ""; position: absolute; left: ${(SPEC.caption.w - SPEC.caption.pillW) / 2}px; right: ${(SPEC.caption.w - SPEC.caption.pillW) / 2}px; top: ${(SPEC.caption.h - SPEC.caption.pillH) / 2}px; bottom: ${(SPEC.caption.h - SPEC.caption.pillH) / 2}px; border-radius: 4px; background: transparent; z-index: -1; }
    .caption span { z-index: 0; }
    .caption span:hover::before { background: rgba(0,0,0,.06); }
    .caption span:active::before { background: rgba(0,0,0,.12); }
    .caption span.more svg { width: 13px; height: 13px; stroke-width: 1.1; }
    .caption span.mn svg, .caption span.mx svg, .caption span.cx svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1; } .caption span.more .dot { position: absolute; top: 6px; right: 7px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px var(--frame); }
    .caption span svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1; position: relative; }
    .caption span.cx:hover { color: #fff; } .caption span.cx:hover::before { background: #c42b1c; } .caption span.cx:active::before { background: #a52318; }
    .amenu { position: absolute; right: ${SPEC.caption.w * 3 + 2}px; top: ${BAR + 2}px; width: 216px; background: #fff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06); padding: 4px; font-size: 13px; z-index: 6; }
    .amenu[hidden] { display: none; }
    .tip { position: fixed; z-index: 99; background: #1b1b1f; color: #fff; font-size: 12px; line-height: 1; padding: 7px 9px; border-radius: 6px; display: flex; align-items: center; gap: 8px; pointer-events: none; opacity: 0; transition: opacity .12s; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
    .tip.in { opacity: 1; } .tip kbd { color: rgba(255,255,255,.6); font: inherit; letter-spacing: .3px; }
    .amenu .item { display: flex; align-items: center; gap: 10px; height: 28px; padding: 0 10px; border-radius: 4px; }
    .amenu .item i { width: 16px; height: 16px; display: grid; place-items: center; color: ${TOKENS.ink2}; flex: none; } .amenu .item i svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
    .amenu .item > span:first-of-type { flex: 1; }
    .amenu .item:hover { background: ${TOKENS.hover}; }
    .amenu .item .hint { color: ${TOKENS.ink3}; font-size: 12px; letter-spacing: .2px; }
    .caption span.more .dot[hidden], .amenu .item .dot2[hidden] { display: none; }
    .amenu .item .dot2 { width: 6px; height: 6px; flex: none; border-radius: 50%; background: ${TOKENS.accent}; margin-right: 2px; }
    .amenu .sep { border-top: 1px solid ${TOKENS.line}; margin: 4px 8px; }
    /* 状态栏观星：勾选框是标题栏的常驻控制，状态点与面板按钮都可直接点开 */
    .caption .sgbar { display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 6px; margin: 4px 1px 4px 4px; border-radius: 4px; color: ${TOKENS.ink2}; cursor: pointer; user-select: none; -webkit-app-region: no-drag; }
    .caption .sgbar:hover { background: rgba(0,0,0,.06); }
    .caption .sgbar:active { background: rgba(0,0,0,.1); }
    .sgin { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .sgbox { position: relative; flex: none; width: 13px; height: 13px; border: 1px solid #b6b6bc; border-radius: 3px; background: #fff; display: grid; place-items: center; transition: background-color .12s ease, border-color .12s ease; }
    .sgin:checked + .sgbox { background: ${TOKENS.ink}; border-color: ${TOKENS.ink}; }
    .sgin:checked + .sgbox::after { content: ""; width: 4px; height: 7px; margin-top: -1px; border-right: 1.5px solid #fff; border-bottom: 1.5px solid #fff; transform: rotate(45deg); }
    .sgin:focus-visible + .sgbox { outline: 2px solid ${TOKENS.ink}; outline-offset: 2px; }
    .sgtext { font: 500 11.5px/1 "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif; }
    .sgbar.on .sgtext { color: ${TOKENS.ink}; }
    .sgdot { flex: none; width: 6px; height: 6px; margin-left: 1px; border-radius: 50%; background: #b6b6bc; transition: background-color .15s ease; }
    .sgbar.on .sgdot { background: ${TOKENS.ok}; }
    .sgbar.error .sgdot { background: ${TOKENS.danger}; }
    .sgbar.checking .sgdot { animation: sgpulse 1s ease-in-out infinite; }
    @keyframes sgpulse { 50% { opacity: .3; transform: scale(.75); } }
    .sgopen { position: relative; width: 24px; height: 24px; margin: 4px 1px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: ${TOKENS.ink2}; display: grid; place-items: center; cursor: pointer; -webkit-app-region: no-drag; }
    .sgopen:hover { background: rgba(0,0,0,.06); color: ${TOKENS.ink}; } .sgopen:active { background: rgba(0,0,0,.1); }
    .sgopen svg { width: 14px; height: 14px; stroke-width: 1.4; }
    .sgopen.new::after { content: ""; position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: ${TOKENS.accent}; box-shadow: 0 0 0 2px var(--frame); }
    .sgpanel { position: absolute; top: ${BAR + 4}px; right: 8px; z-index: 7; width: 448px; max-width: calc(100% - 16px); max-height: calc(100% - ${BAR + 12}px); overflow: auto; box-sizing: border-box; padding: 14px 14px 12px; border-radius: 12px; background: #fff; color: ${TOKENS.ink}; box-shadow: 0 18px 48px rgba(0,0,0,.2), 0 0 0 1px rgba(0,0,0,.07); font: 13px/1.5 "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif; user-select: none; scrollbar-gutter: stable; }
    .sgpanel[hidden] { display: none; }
    .sgpanel::-webkit-scrollbar { width: 8px; } .sgpanel::-webkit-scrollbar-thumb { background: #d1d1d5; border: 2px solid #fff; border-radius: 4px; }
    .sghd { display: flex; align-items: flex-start; gap: 12px; }
    .sghdt { flex: 1; min-width: 0; } .sgh1line { display: flex; align-items: center; gap: 8px; } .sgh1 { margin: 0; font-size: 17px; line-height: 22px; font-weight: 650; }
    .sgsub { margin-top: 3px; color: ${TOKENS.ink2}; font-size: 12px; }
    .sgbadge { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 10px; background: ${TOKENS.surface3}; color: ${TOKENS.ink2}; font-size: 10.5px; font-weight: 600; line-height: 1; }
    .sgbadgedot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: #b6b6bc; }
    .sgbadge.on { background: rgba(48,168,84,.12); color: ${TOKENS.ok}; } .sgbadge.on .sgbadgedot { background: ${TOKENS.ok}; }
    .sgbadge.busy { background: rgba(214,164,44,.14); color: #8a6410; } .sgbadge.busy .sgbadgedot { background: #b78218; animation: sgpulse 1s ease-in-out infinite; }
    .sgbadge.error { background: rgba(196,43,28,.1); color: ${TOKENS.danger}; } .sgbadge.error .sgbadgedot { background: ${TOKENS.danger}; }
    .sgbadge.off { background: ${TOKENS.surface3}; color: ${TOKENS.ink3}; }
    .sgx { flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: ${TOKENS.ink2}; display: grid; place-items: center; cursor: pointer; } .sgx:hover { background: rgba(0,0,0,.06); color: ${TOKENS.ink}; } .sgx svg { width: 13px; height: 13px; }
    .sgmodes { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 7px 9px; border-radius: 8px; background: ${TOKENS.surface2}; }
    .sgmlabel { flex: none; color: ${TOKENS.ink2}; font-size: 12px; } .sgtabs { display: flex; flex: 1; padding: 2px; border-radius: 6px; background: #ececee; }
    .sgtab { flex: 1; height: 24px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: ${TOKENS.ink2}; font: inherit; font-size: 12px; cursor: pointer; } .sgtab.on { background: #fff; color: ${TOKENS.ink}; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
    .sgreports { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; }
    .sgrep { padding: 9px 11px 8px; border: 1px solid ${TOKENS.line}; border-radius: 8px; background: #fbfbfc; transition: background-color .12s ease, border-color .12s ease, box-shadow .12s ease; }
    .sgrep.interactive { cursor: pointer; } .sgrep.interactive:hover { background: #fff; border-color: rgba(60,60,67,.24); box-shadow: 0 1px 3px rgba(0,0,0,.05); } .sgrep.interactive:focus-visible { outline: 2px solid ${TOKENS.ink}; outline-offset: 1px; } .sgrep.disabled { background: ${TOKENS.surface2}; }
    .sgreptop { display: flex; align-items: center; gap: 6px; } .sgstate { width: 7px; height: 7px; flex: none; border-radius: 50%; background: ${TOKENS.ok}; } .sgstate.empty { background: #b6b6bc; } .sgstate.error { background: ${TOKENS.danger}; }
    .sgreplabel { font-weight: 600; } .sgrepwhen { margin-left: auto; color: ${TOKENS.ink3}; font-size: 11.5px; }
    .sgrepopen { display: inline-flex; align-items: center; gap: 2px; margin-left: 2px; color: ${TOKENS.ink2}; font-size: 11.5px; font-weight: 500; white-space: nowrap; } .sgrepopen svg { width: 11px; height: 11px; stroke-width: 1.3; } .sgrep.interactive:hover .sgrepopen { color: ${TOKENS.ink}; } .sgrepopen.off { color: ${TOKENS.ink3}; opacity: .55; }
    .sgtitle { margin-top: 5px; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sgsummary { margin-top: 2px; color: ${TOKENS.ink2}; font-size: 12px; line-height: 1.45; }
    .sgmetarow { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
    .sgmetaitem { padding: 1px 6px; border-radius: 4px; background: ${TOKENS.surface2}; color: ${TOKENS.ink3}; font: 10.5px/1.55 ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,monospace; }
    .sgerror { margin-top: 6px; color: ${TOKENS.danger}; font-size: 11.5px; line-height: 1.45; overflow-wrap: anywhere; }
    .sgb { height: 28px; padding: 0 12px; border: 1px solid ${TOKENS.line}; border-radius: 6px; background: #fff; color: ${TOKENS.ink}; font: inherit; font-size: 12px; cursor: pointer; } .sgb:hover { background: ${TOKENS.surface2}; } .sgb:disabled { opacity: .45; cursor: default; }
    .sgb.primary { background: ${TOKENS.ink}; border-color: ${TOKENS.ink}; color: #fff; } .sgb.primary:hover { background: #3a3a40; } .sgb.primary:disabled { background: ${TOKENS.ink3}; border-color: ${TOKENS.ink3}; }
    .sghealth { margin-top: 9px; padding: 8px 10px 7px; border-radius: 9px; background: ${TOKENS.surface2}; }
    .sghealthhead { display: flex; align-items: baseline; gap: 10px; } .sghealthtitle { margin: 0; font-size: 12px; font-weight: 600; } .sghealthhint { margin-left: auto; color: ${TOKENS.ink3}; font-size: 10.5px; }
    .sggrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px 10px; margin-top: 7px; }
    .sgmetric { min-width: 0; } .sgmv { color: ${TOKENS.ink}; font-size: 13px; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .sgmk { margin-top: 1px; color: ${TOKENS.ink3}; font-size: 10.5px; line-height: 1.3; }
    .sghealthfoot { display: flex; gap: 12px; margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(60,60,67,.09); } .sgpip { color: ${TOKENS.ink3}; font-size: 10.5px; }
    .sgdirbox { display: flex; align-items: center; gap: 8px; margin-top: 9px; padding: 7px 9px; border: 1px solid ${TOKENS.line}; border-radius: 8px; }
    .sgdirinfo { flex: 1; min-width: 0; } .sgdirlabel { color: ${TOKENS.ink3}; font-size: 10.5px; } .sgdirpath { margin-top: 1px; color: ${TOKENS.ink2}; font: 10.5px/1.4 ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sgfoot { display: flex; gap: 8px; margin-top: 8px; } .sgfoot .sgb { flex: 1; }
    .sgfootnote { margin-top: 7px; color: ${TOKENS.ink3}; font-size: 10.5px; line-height: 1.4; }
    @media (max-height: 690px) { .sgpanel { padding: 12px 12px 10px; } .sgmodes { margin-top: 8px; } .sgreports { gap: 6px; } .sghealth { margin-top: 8px; } .sgfootnote { display: none; } }
    .pg .dircontrol { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .pg .dircontrol .path { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${TOKENS.ink2}; font: 11px/1.4 ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,monospace; }
    .ver { -webkit-app-region: no-drag; height: 20px; padding: 0 9px; border-radius: 4px; border: 1px solid var(--line); background: #fff; color: var(--ink-2); display: inline-flex; align-items: center; font: inherit; font-size: 12px; line-height: 1; cursor: pointer; }
    .ver:hover { background: #e9e9ec; color: var(--ink); }
    #desk { position: relative; width: 1280px; height: 720px; }
    .win { width: 1280px; height: 720px; }
    /* 拖出成新窗口的演示 */
    .win.float { position: absolute; z-index: 20; box-shadow: 0 16px 48px rgba(0,0,0,.32); }
    .win.float.carry { pointer-events: none; }
    /* ===== 声音弹层／服名菜单：overlay-style 令牌 ===== */
    .pop { position: absolute; width: 232px; background: ${TOKENS.surface}; border: 1px solid ${TOKENS.line}; border-radius: ${TOKENS.cardRadius}px; box-shadow: ${TOKENS.shadow}; padding: ${TOKENS.pad}px; display: flex; flex-direction: column; gap: ${TOKENS.gap}px; font-size: 12px; z-index: 5; }
    .pop[hidden] { display: none; }
    .pop .row { display: flex; align-items: center; height: ${TOKENS.rowHeight}px; gap: 8px; } .pop .row span { flex: 1; }
    .pop h1 { margin: 0; font-size: 12px; font-weight: 500; }
    .sw { position: relative; width: 34px; height: 18px; border-radius: 9px; background: #c8c8cc; cursor: pointer; flex: none; transition: background .15s; }
    .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .sw.on { background: ${TOKENS.accent}; } .sw.on::after { transform: translateX(16px); }
    /* ===== 浮层统一尺度（菜单家族：服名菜单／右键菜单／≡／⋮／标签列表）=====
       同一张皮：白面、1px 环＋投影立起来、圆角 8；同一个节奏：内边距 6、行高 32、字 13、图标 16、行圆角 6、分隔线留 6/8；
       宽度只有三档：窄 176（服名）、中 208（右键／⋮）、宽 216（≡）；标签列表按列实算 */
    /* 菜单家族（≡／入口／右键／子菜单／插件 ⋮）行高取外框单位 28（标签 28、导航键 28），内边距 4、行圆角 4；标签列表是列表不是菜单，仍用 32／6 */
    .menu { position: absolute; width: 176px; background: #fff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06); padding: 4px; font-size: 13px; z-index: 5; }
    .menu[hidden] { display: none; }
    /* 菜单家族入场：从锚点下方 4px 淡入（100ms 透明度、140ms 位移，先快后慢），关闭即刻消失（Chrome／macOS 同款）。对话框和保存卡已有入场，菜单没有就显得「弹」出来 */
    .menu:not([hidden]), .amenu:not([hidden]), .tlmenu:not([hidden]) { animation: menuFade .1s ease-out, menuSlide .14s cubic-bezier(0,0,.2,1); } /* 用 animation 不用 transition：transition 让元素常驻合成层，定稿态文字抗锯齿会变 */
    @keyframes menuFade { from { opacity: 0; } to { opacity: 1; } } @keyframes menuSlide { from { transform: translateY(-4px); } to { transform: none; } }
    .menu .item { display: flex; align-items: center; justify-content: space-between; height: 28px; padding: 0 10px; border-radius: 4px; }
    .menu .item:hover { background: ${TOKENS.hover}; }
    /* 宽度是档位不是量体裁衣：图标＋动宾短语、右侧无内容的菜单取 160——文字列（40 起、4 字到 92）之后留一个与左列等宽的呼吸列；208 是右键菜单档（长短语），112 则让 hover 药丸贴着字 */
    .pmenu { width: 160px; } .cmenu { width: 208px; } .submenu { width: 184px; } .pmenu .item { justify-content: flex-start; gap: 10px; } .pmenu .item i { width: 16px; height: 16px; display: grid; place-items: center; color: ${TOKENS.ink2}; } .pmenu .item i svg { width: 16px; height: 16px; } .pmenu .item.disabled i { color: ${TOKENS.ink3}; }
    .menu .item.disabled { color: ${TOKENS.ink3}; } .menu .item.disabled:hover { background: transparent; }
    .menu .item.sub.open { background: ${TOKENS.hover}; }
    .menu .item.sub::after { content: ""; width: 6px; height: 6px; border-right: 1.4px solid ${TOKENS.ink3}; border-top: 1.4px solid ${TOKENS.ink3}; transform: rotate(45deg); }
    .menu .sep { border-top: 1px solid ${TOKENS.line}; margin: 4px 8px; }
    .chk { width: 10px; height: 6px; border-left: 1.6px solid ${TOKENS.ink2}; border-bottom: 1.6px solid ${TOKENS.ink2}; transform: rotate(-45deg) translateY(-1px); }
    /* ===== 壳内页面（账号／设置／更新／关于）：同一套列表语法；内容居中 760 ===== */
    #viewport.page { background: #fff; }
    .pg { position: absolute; inset: 0; background: #fff; color: ${TOKENS.ink}; font: 13px/1.5 "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif; overflow: auto; user-select: text; scrollbar-gutter: stable; }
    /* 自绘滚动条：6px、透明轨道、悬停才显 */
    .pg::-webkit-scrollbar { width: 10px; } .pg::-webkit-scrollbar-track { background: transparent; } .pg::-webkit-scrollbar-thumb { background: transparent; border: 3px solid transparent; border-radius: 6px; background-clip: padding-box; } .pg:hover::-webkit-scrollbar-thumb { background-color: #c4c4c7; }
    .pg { display: flex; align-items: stretch; } .pg[hidden] { display: none; } /* 游戏标签时内页层必须真的不画，否则弹层盖满时上一页会压在游戏上 */
    .pg .pcol { flex: 1 1 0; } .pg .pcol.l { min-width: 224px; } .pg .pcol.r { min-width: 24px; }
    .pg .pnav { position: sticky; top: 0; width: 200px; padding: 28px 12px; display: flex; flex-direction: column; gap: 2px; user-select: none; }
    .pg .nitem { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 12px; border-radius: 6px; color: ${TOKENS.ink}; cursor: pointer; transition: background-color .15s ease; }
    .pg .nitem:hover { background: rgba(0,0,0,.04); } .pg .nitem.on { background: #e8f0fb; color: ${TOKENS.accent}; font-weight: 600; }
    .pg .nitem i { width: 16px; height: 16px; display: grid; place-items: center; color: ${TOKENS.ink2}; } .pg .nitem.on i { color: ${TOKENS.accent}; } .pg .nitem i svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
    .pg .pbody { align-self: flex-start; flex: 25 25 0; max-width: var(--t-bodyw, 800px); min-width: 0; padding: 32px 24px 56px; }
    .pg .phead h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; } .pg .phead p { margin: 0 0 8px; color: ${TOKENS.ink2}; }
    .pg .psec h2 { margin: 28px 0 2px; font-size: 13px; font-weight: 600; }
    .pg .prow.hl { animation: rowhl 2.4s ease-out; } @keyframes rowhl { 0%, 60% { background: #e8f0fb; box-shadow: 0 0 0 8px #e8f0fb; } 100% { background: transparent; box-shadow: none; } }
    .pg .prow { display: flex; align-items: center; gap: 24px; padding: 12px 0; border-bottom: 1px solid ${TOKENS.line}; }
    .pg .prow .l { flex: 1; min-width: 0; } .pg .prow .t { font-size: 13px; } .pg .prow .d { color: ${TOKENS.ink2}; font-size: 12px; margin-top: 2px; }
    .pg .prow .r { flex: none; display: flex; align-items: center; gap: 8px; }
    .pg .vhint { display: inline-flex; align-items: center; gap: 12px; } .pg .vhint b { font-weight: 400; font-variant-numeric: tabular-nums; } .pg .vhint i { font-style: normal; color: ${TOKENS.ink3}; font-size: 12px; }
    .pg .pempty { margin: 28px 0 0; } .pg .pempty p { margin: 0 0 12px; color: ${TOKENS.ink3}; font-size: 13px; }
    .pg .psec.lone { margin-top: 28px; }
    .pg .sh { display: flex; align-items: center; justify-content: space-between; margin: 28px 0 2px; } .pg .sh h2 { margin: 0; } .pg .cnt { display: inline-block; min-width: 18px; padding: 0 5px; margin-left: 6px; font-size: 11px; line-height: 18px; font-weight: 500; text-align: center; border-radius: 9px; background: ${TOKENS.surface3}; color: ${TOKENS.ink2}; }
    .pg .prow.plug { gap: 0; padding: 16px 0; } .pg .prow.plug .ic { width: 40px; height: 40px; flex: none; margin-right: 14px; border: 1px solid ${TOKENS.line}; border-radius: 8px; display: grid; place-items: center; color: ${TOKENS.ink3}; } .pg .prow.plug .ic svg { width: 18px; height: 18px; } .pg .prow.plug .t { font-size: 14px; line-height: 20px; } .pg .prow.plug .d { margin-top: 4px; } .pg .prow.plug .r { margin-left: 24px; gap: 10px; } .pg .prow.plug .r .slot { width: 28px; height: 28px; flex: none; display: grid; place-items: center; } .pg .prow.plug .t code.ver { margin-left: 10px; vertical-align: 1px; }
    .pg .tag { display: inline-block; margin-left: 6px; padding: 0 6px; font-size: 11px; line-height: 16px; border-radius: 8px; background: ${TOKENS.surface3}; color: ${TOKENS.ink2}; vertical-align: 1px; }
    .pg .about { margin-top: 20px; } .pg .arow2 { display: flex; align-items: center; gap: 14px; padding: 16px 0; border-bottom: 1px solid ${TOKENS.line}; } .pg .arow2 .av { width: 40px; height: 40px; flex: none; border-radius: 8px; overflow: hidden; border: 1px solid ${TOKENS.line}; display: grid; place-items: center; color: ${TOKENS.ink}; background: #fff; } .pg .arow2 .av img { width: 100%; height: 100%; object-fit: cover; display: block; } .pg .arow2 .av svg { width: 28px; height: 28px; } .pg .arow2 .l { flex: 1; min-width: 0; } .pg .arow2 .t { font-size: 14px; font-weight: 600; } .pg .arow2 .d { color: ${TOKENS.ink2}; font-size: 12px; margin-top: 2px; } .pg .arow2 .r .tb { display: inline-flex; align-items: center; gap: 8px; padding-right: 10px; } .pg .arow2 .r .tb svg { width: 12px; height: 12px; color: ${TOKENS.ink3}; }
    .pg .linkstack { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 20px; } .pg .linkstack .tb { display: inline-flex; align-items: center; gap: 8px; padding-right: 10px; } .pg .linkstack .tb svg { width: 12px; height: 12px; color: ${TOKENS.ink3}; }
    #viewport .dlg:has(.manual.wide) { width: 460px; padding: 24px 24px 20px; } #viewport .dlg .manual.wide { width: auto; margin-top: 18px; } #viewport .dlg .manual.wide .pick .pk { width: 38px; height: 32px; } #viewport .dlg .manual.wide .pick .pk svg { width: 16px; height: 16px; } #viewport .dlg .manual.wide .pick input { height: 32px; padding: 0 12px; font-size: 13px; } #viewport .dlg:has(.manual.wide) .acts { margin-top: 24px; } .pg .pempty i { width: 32px; height: 32px; color: ${TOKENS.ink3}; margin-bottom: 8px; } .pg .pempty i svg { width: 32px; height: 32px; fill: none; stroke: currentColor; stroke-width: 1.1; stroke-linecap: round; stroke-linejoin: round; } .pg .pempty .t { color: ${TOKENS.ink2}; font-size: 13px; } .pg .pempty .d { color: ${TOKENS.ink3}; font-size: 12px; }
    .pg .tb { height: ${TOKENS.rowHeight}px; padding: 0 14px; border-radius: ${TOKENS.controlRadius}px; border: 1px solid ${TOKENS.line}; background: ${TOKENS.surface2}; color: ${TOKENS.ink}; font: inherit; font-size: 12px; cursor: pointer; transition: background-color .12s ease; }
    .pg .tb:hover { background: ${TOKENS.surface3}; } .pg .tb:disabled { opacity: .5; cursor: default; } .pg .tb.primary { background: ${TOKENS.accent}; border-color: ${TOKENS.accent}; color: #fff; } .pg .tb.primary:hover { background: ${TOKENS.accent2}; border-color: ${TOKENS.accent2}; }
    .pg .ib.s { width: 24px; height: 24px; border-radius: 4px; color: ${TOKENS.ink2}; flex: none; user-select: none; } .pg .ib.s:hover { color: ${TOKENS.ink}; background: rgba(0,0,0,.06); } .pg .ib.s svg { width: 14px; height: 14px; }
    .pg .ib.s.op { width: 28px; height: 28px; border-radius: 6px; } .pg .ib.s.op.open { color: ${TOKENS.ink}; background: rgba(0,0,0,.08); } /* 菜单开着时按钮保持按住态，和入口小片的 .open 同一规则 */
    .pg .ib.s.spin svg { animation: spin .7s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
    .pg .ib.s.op svg { width: 14px; height: 14px; } /* 与标签栏的 × 和 + 同尺寸同线宽（14px 画 1.5 线） */
    .pg .ib.s.cp { position: relative; transition: background-color var(--t-cpms, 160ms) ease, color var(--t-cpms, 160ms) ease; } .pg .ib.s.cp .ic { position: absolute; inset: 0; display: grid; place-items: center; transition: opacity var(--t-cpms, 160ms) ease; } .pg .ib.s.cp .ic svg { width: 14px; height: 14px; }
    .pg .ib.s.cp .ic-check { opacity: 0; } .pg .ib.s.cp.done .ic-copy { opacity: 0; } .pg .ib.s.cp.done .ic-check { opacity: 1; } .pg .ib.s.cp.done { color: ${TOKENS.ink}; background: rgba(0,0,0,.08); }
    .pg .sw { position: relative; width: 34px; height: 18px; border-radius: 9px; background: #c8c8cc; cursor: pointer; transition: background .15s; }
    .pg .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .pg .sw.on { background: ${TOKENS.accent}; } .pg .sw.on::after { transform: translateX(16px); }
    /* 滑块式分段：等宽格，白色滑块按 --i 滑到位 */
    .pg .seg2 { position: relative; display: inline-flex; padding: 2px; border-radius: 6px; background: #ececee; user-select: none; }
    .pg .seg2 .thumb { position: absolute; top: 2px; bottom: 2px; left: 2px; width: 0; border-radius: 4px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.08); transition: transform .22s cubic-bezier(.25,.1,.25,1), width .22s cubic-bezier(.25,.1,.25,1); }
    .pg .seg2 button { position: relative; height: 24px; padding: 0 12px; border: 0; outline: none; background: transparent; color: ${TOKENS.ink2}; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; transition: color .22s; }
    .pg .seg2 button.on { color: ${TOKENS.ink}; }
    /* 账号行：昵称 ｜ UID ｜ 账号 ｜ 密码 ｜ 上次登录 ｜ 操作。每格悬停出复制，按钮固定在格子右侧 */
    .pg .arow { display: grid; grid-template-columns: var(--t-nick, 100px) var(--t-g1, 30px) var(--t-acc, 220px) var(--t-g2, 10px) var(--t-pw, 220px) var(--t-g3, 30px) minmax(var(--t-last, 60px), 1fr) var(--t-g4, 10px) var(--t-ops, 60px); align-items: center; height: var(--t-rowh, 48px); border-bottom: 1px solid ${TOKENS.line}; }
    .pg .arow .c-nick { grid-column: 1; } .pg .arow .c-acc { grid-column: 3; } .pg .arow .c-pw { grid-column: 5; } .pg .arow .c-last { grid-column: 7; } .pg .arow .c-ops { grid-column: 9; }
    /* 删除／撤销：行或整组按高度折叠展开 */
    .pg .arow, .pg .psec { transition: height .2s cubic-bezier(.2,0,0,1), opacity .12s ease; } .pg .faded { opacity: 0; } .pg .gone { height: 0 !important; overflow: hidden; border-bottom-width: 0; } .pg .psec.gone h2 { margin: 0; }
    .pg .cell { position: relative; display: flex; align-items: center; min-width: 0; height: var(--t-rowh, 48px); padding-right: 2px; gap: 2px; }
    .pg .cell.field { height: var(--t-fieldh, 30px); padding: 0 3px 0 10px; border-radius: 6px; background: #f1f1f3; cursor: text; } .pg .cell.field:hover { background: #ebebee; }
    .pg .cell.field.edit { background: #fff; box-shadow: inset 0 0 0 1px ${TOKENS.accent}; cursor: auto; } .pg .cell.field .v { flex: 1; }
    .pg .cell .v { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 12px; }
    .pg .cell.field .v { color: ${TOKENS.ink2}; transition: color .12s ease; } .pg .cell.field:hover .v, .pg .cell.field.edit .v { color: ${TOKENS.ink}; } .pg .cell.field input.inline { color: ${TOKENS.ink}; }
    .pg .cell.c-nick .v { font-size: 13px; } .pg .cell.c-uid .v, .pg .cell.c-last { color: ${TOKENS.ink2}; font-size: 12px; } .pg .cell.dim .v { color: ${TOKENS.ink3}; } .pg .cell .v.dots { letter-spacing: 1px; color: ${TOKENS.ink2}; }
    .pg .cell.field input.inline { flex: 1; min-width: 0; height: 28px; border: 0; padding: 0; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; outline: none; background: transparent; }
    .pg .cell.c-ops { justify-content: flex-end; gap: 4px; user-select: none; }
    /* 手动更新 */
    .manual { display: flex; align-items: center; gap: 8px; width: 400px; } .pg .prow .d a.act { color: ${TOKENS.accent}; cursor: pointer; }
    .pg code.ver { font: 12px/18px ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace; color: ${TOKENS.ink}; background: ${TOKENS.surface2}; border: 1px solid ${TOKENS.line}; border-radius: ${TOKENS.controlRadius}px; padding: 0 6px; } .pg .prow .d code.ver { font-size: 11px; line-height: 16px; }
    .manual .pw { position: relative; flex: 1; display: flex; } .manual .pw input { width: 100%; height: ${TOKENS.rowHeight}px; padding: 0 30px 0 9px; border: 1px solid ${TOKENS.line}; border-radius: ${TOKENS.controlRadius}px; font: inherit; font-size: 12px; } .manual .pw input:focus { outline: none; border-color: ${TOKENS.accent}; }
    /* 选文件按钮＋输入框拼成一组：按钮灰底在左、圆角只留左边，输入框圆角只留右边，共用一条边线 */
    .manual .pick { flex: 1; display: flex; } .manual .pick .pk { flex: none; width: 32px; height: ${TOKENS.rowHeight}px; display: grid; place-items: center; border: 1px solid ${TOKENS.line}; border-right: 0; border-radius: ${TOKENS.controlRadius}px 0 0 ${TOKENS.controlRadius}px; background: ${TOKENS.surface2}; color: ${TOKENS.ink2}; cursor: pointer; padding: 0; } .manual .pick .pk:hover { background: ${TOKENS.surface3}; color: ${TOKENS.ink}; } .manual .pick .pk svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; }
    .manual .pick input { flex: 1; min-width: 0; height: ${TOKENS.rowHeight}px; padding: 0 9px; border: 1px solid ${TOKENS.line}; border-radius: 0 ${TOKENS.controlRadius}px ${TOKENS.controlRadius}px 0; font: inherit; font-size: 12px; outline: none; } .manual .pick input:focus { border-color: ${TOKENS.accent}; }
    .manual .pw .icon-btn { position: absolute; right: 2px; top: 2px; width: 22px; height: 22px; display: grid; place-items: center; color: ${TOKENS.ink3}; border-radius: 4px; cursor: pointer; } .manual .pw .icon-btn:hover { color: ${TOKENS.ink}; background: rgba(0,0,0,.06); } .manual .pw .icon-btn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; }
    .pg .status { color: ${TOKENS.ink2}; font-size: 12px; padding-bottom: 12px; border-bottom: 1px solid ${TOKENS.line}; }
    /* 浮层控件一族（对话框／保存卡共用）：形状靠填色不靠描边，与标题栏入口小片同一规则；按钮矮长条 28 高、字 13、圆角 4；
       主按钮墨色底白字——整个壳的蓝只留 ≡ 上那一个点；删除类确认例外用红 */
    #viewport .dlg .tb, #viewport .save .tb { height: 28px; padding: 0 14px; border: 0; border-radius: 4px; background: rgba(0,0,0,.06); color: ${TOKENS.ink}; font: inherit; font-size: 13px; line-height: 28px; cursor: pointer; transition: background-color .12s ease; }
    #viewport .dlg .tb:hover, #viewport .save .tb:hover { background: rgba(0,0,0,.1); } #viewport .dlg .tb:active, #viewport .save .tb:active { background: rgba(0,0,0,.14); }
    #viewport .dlg .tb.primary, #viewport .save .tb.primary { background: ${TOKENS.ink}; color: #fff; } #viewport .dlg .tb.primary:hover, #viewport .save .tb.primary:hover { background: #3a3a40; } #viewport .dlg .tb.primary:active, #viewport .save .tb.primary:active { background: #2a2a2f; }
    #viewport .dlg .tb.primary.danger { background: ${TOKENS.danger}; } #viewport .dlg .tb.primary.danger:hover { background: #a8220f; }
    #viewport .dlg .tb:focus-visible, #viewport .save .tb:focus-visible { outline: 2px solid ${TOKENS.ink}; outline-offset: 2px; }
    /* 输入框同样是填色盒：底 f3 无边框，聚焦只加 1px 墨色环 */
    #viewport .save .row input, #viewport .dlg .dnote { border: 0; border-radius: 4px; background: ${TOKENS.surface2}; color: ${TOKENS.ink}; font: inherit; font-size: 13px; outline: none; box-sizing: border-box; transition: box-shadow .12s ease, background-color .12s ease; }
    #viewport .save .row input:focus, #viewport .dlg .dnote:focus { background: #fff; box-shadow: inset 0 0 0 1px ${TOKENS.ink}; }
    /* 保存密码卡：右上角，与提示条同一落点；一张皮与对话框相同（圆角 8、菜单同款环＋投影、内边距 16）；标题不带图标——标签上的图标说的是入口，标题上的什么都不说 */
    #viewport .save { position: absolute; top: 8px; right: 8px; width: 300px; z-index: 7; box-sizing: border-box; background: #fff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06); padding: 16px; display: flex; flex-direction: column; gap: 8px; opacity: 0; transform: translateY(-4px); transition: opacity .16s ease, transform .16s ease; color: ${TOKENS.ink}; }
    #viewport .save.in { opacity: 1; transform: none; }
    #viewport .save .hd { display: flex; align-items: center; height: 20px; margin-bottom: 4px; } #viewport .save .hd h3 { margin: 0; font-size: 13px; line-height: 20px; font-weight: 600; color: ${TOKENS.ink}; }
    #viewport .save .row { display: flex; align-items: center; gap: 10px; height: 28px; } #viewport .save .row label { width: 26px; flex: none; color: ${TOKENS.ink2}; font-size: 12px; }
    #viewport .save .row .fld { position: relative; flex: 1; min-width: 0; display: flex; }
    #viewport .save .row input { flex: 1; min-width: 0; height: 28px; padding: 0 10px; font-variant-numeric: tabular-nums; } #viewport .save .row .fld.pw input { padding-right: 32px; }
    #viewport .save .row .fld .ib.s { position: absolute; right: 2px; top: 2px; width: 24px; height: 24px; border-radius: 4px; color: ${TOKENS.ink2}; } #viewport .save .row .fld .ib.s:hover { color: ${TOKENS.ink}; background: rgba(0,0,0,.06); } #viewport .save .row .fld .ib.s svg { width: 14px; height: 14px; }
    #viewport .save .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    #viewport .toasts { position: absolute; top: 16px; right: 16px; z-index: 5; display: flex; flex-direction: column; align-items: flex-end; pointer-events: none; }
    /* 外层只管占位：新条高度从 0 长到 36，旧条被平滑推下去；收起时高度缩回 0，下面的条滑上来。内层管进出场 */
    #viewport .toasts .toast { pointer-events: auto; height: 36px; margin-bottom: 8px; transition: height .24s cubic-bezier(.2,0,0,1), margin-bottom .24s cubic-bezier(.2,0,0,1); } #viewport .toasts .toast.grow { height: 0; margin-bottom: 0; }
    /* 从右缘进场：起点在窗口外（自身宽度＋16），整条滑入，不淡入；先快后慢 240ms。离场反向：先慢后快 200ms 滑出窗口。原来 16px 位移＋淡入是在原地抖一下，既不像进场也不像显现 */
    #viewport .toast .tc { position: relative; box-sizing: border-box; background: #fff; color: ${TOKENS.ink}; padding: 0 14px; height: 36px; border-radius: 8px; display: flex; gap: 14px; align-items: center; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06); user-select: none; white-space: nowrap; } #viewport .toast a { color: ${TOKENS.ink}; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    /* 入场（定稿 B）：右移 24px 起步，透明度 120ms 先到位、位移 200ms 跟上，都先快后慢；离场右移 12px 淡出 */
    #viewport .toast .tc { opacity: 0; transform: translateX(24px); transition: transform .2s cubic-bezier(0,0,.2,1), opacity .12s ease-out; } #viewport .toast.in .tc { opacity: 1; transform: none; } #viewport .toast.out .tc { opacity: 0; transform: translateX(12px); transition: transform .16s cubic-bezier(.4,0,1,1), opacity .12s ease-in; }
    /* 对话框 */
    /* 对话框属于窗口层，不属于内容：贴在标题栏下方居中（Chrome 页内对话框的落点），不落在游戏自己的居中框上；
       内容压暗三成让画面退后；白框用菜单同款环＋投影立起来（黑底上 48px／32% 的投影根本看不见，只剩一张白贴纸），圆角 8 与卡片一致 */
    #viewport .scrim { position: absolute; inset: 0; z-index: 6; background: rgba(0,0,0,.3); display: flex; align-items: flex-start; justify-content: center; padding-top: 48px; opacity: 0; transition: opacity .15s ease; }
    #viewport .scrim.in { opacity: 1; } #viewport .scrim.in .dlg { transform: none; opacity: 1; }
    #viewport .dlg:focus { outline: none; }
    #viewport .dlg { width: 360px; box-sizing: border-box; background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06); transform: translateY(-8px); opacity: 0; transition: transform .16s cubic-bezier(0,0,.2,1), opacity .12s ease-out; color: ${TOKENS.ink}; user-select: none; }
    /* 字只有两档：13 正文与标题（标题只靠 600 加重，不加大），12 辅助 */
    #viewport .dlg h3 { margin: 0 0 4px; font-size: 13px; line-height: 20px; font-weight: 600; } #viewport .dlg p { margin: 0; color: ${TOKENS.ink2}; font-size: 13px; line-height: 20px; }
    #viewport .dlg .dchk[hidden] { display: none; } #viewport .dlg .dchk { display: flex; align-items: center; gap: 8px; margin-top: 12px; height: 20px; color: ${TOKENS.ink2}; font-size: 13px; cursor: pointer; user-select: none; } #viewport .dlg .dchk input { appearance: none; -webkit-appearance: none; margin: 0; width: 16px; height: 16px; border: 1px solid #c8c8cc; border-radius: 4px; background: #fff; position: relative; cursor: pointer; outline: none; transition: background-color .12s ease, border-color .12s ease; } #viewport .dlg .dchk input:hover { border-color: ${TOKENS.ink3}; } #viewport .dlg .dchk input:checked { background: ${TOKENS.ink}; border-color: ${TOKENS.ink}; } #viewport .dlg .dchk input:checked::after { content: ""; position: absolute; left: 4px; top: 1px; width: 5px; height: 9px; border-right: 1.8px solid #fff; border-bottom: 1.8px solid #fff; transform: rotate(45deg); } #viewport .dlg .dchk input:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 0 4px ${TOKENS.ink}; } /* 系统复选框的橙色焦点环与尺寸都不属于这套皮，自绘；勾中用墨色，不开第二处彩色 */
    #viewport .dlg .dnote[hidden] { display: none; } #viewport .dlg .dnote { display: block; width: 100%; margin-top: 12px; padding: 7px 10px; line-height: 1.5; resize: none; }
    #viewport .dlg .acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    /* 扫码卡：码是一个有边界的物件（发丝环把留白圈进码里），卡只给它一圈 20 的边：顶部是标题行（稍窄），左右下都是 20；
       码 248 几乎填满 288 的卡，状态画在码里；两行说明永远占位，卡高不随文字行数变 */
    #viewport .scrim.center { align-items: center; padding-top: 0; }
    #viewport .dlg.qr { width: 288px; padding: 20px; text-align: center; }
    #viewport .dlg.qr .hd { display: flex; align-items: center; gap: 8px; height: 20px; text-align: left; } #viewport .dlg.qr .hd .bi { width: 16px; height: 16px; border-radius: 3px; flex: none; } #viewport .dlg.qr .hd .bi[hidden] { display: none; } #viewport .dlg.qr .hd h3 { margin: 0; font-size: 13px; line-height: 20px; font-weight: 600; }
    #viewport .dlg.qr .qrbox { position: relative; width: 248px; height: 248px; margin: 16px auto 0; border-radius: 8px; background: #fff; box-shadow: 0 0 0 1px ${TOKENS.line}; overflow: hidden; }
    #viewport .dlg.qr[data-stage="loading"] .qrbox { background: ${TOKENS.surface2}; box-shadow: none; }
    #viewport .dlg.qr .qrbox.act { cursor: pointer; }
    #viewport .dlg.qr .qrbox img { width: 248px; height: 248px; display: block; image-rendering: pixelated; transition: opacity .16s ease; } #viewport .dlg.qr .qrbox img[hidden] { display: none; }
    #viewport .dlg.qr[data-stage="confirm"] .qrbox img, #viewport .dlg.qr[data-stage="exchanging"] .qrbox img, #viewport .dlg.qr[data-stage="error"] .qrbox img { opacity: .12; }
    #viewport .dlg.qr .ov { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; } #viewport .dlg.qr .ov i { display: none; }
    #viewport .dlg.qr .ov .spin { width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(0,0,0,.1); border-top-color: ${TOKENS.ink}; animation: qrspin .9s linear infinite; } @keyframes qrspin { to { transform: rotate(360deg); } }
    #viewport .dlg.qr .ov .ok, #viewport .dlg.qr .ov .again { width: 56px; height: 56px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06); display: none; place-items: center; color: ${TOKENS.ink}; } #viewport .dlg.qr .ov svg { width: 26px; height: 26px; stroke-width: 1.6; }
    #viewport .dlg.qr[data-stage="loading"] .ov .spin, #viewport .dlg.qr[data-stage="exchanging"] .ov .spin { display: block; }
    #viewport .dlg.qr[data-stage="confirm"] .ov .ok { display: grid; } #viewport .dlg.qr[data-stage="error"] .ov .again { display: grid; }
    #viewport .dlg.qr .qst { margin-top: 16px; font-size: 13px; line-height: 20px; color: ${TOKENS.ink}; }
    #viewport .dlg.qr .qsub { margin-top: 0; min-height: 18px; font-size: 12px; line-height: 18px; color: ${TOKENS.ink2}; }
    /* 更新页状态块 */
    .pg .ulist { margin-top: 8px; } .pg .ustat.ready .uicon, .pg .ustat.available .uicon, .pg .ustat.downloading .uicon { color: ${TOKENS.ok}; } .pg .ustat.downloading .bar i { background: ${TOKENS.ok}; } .pg .tb.primary.ok { background: ${TOKENS.ok}; border-color: ${TOKENS.ok}; } .pg .tb.primary.ok:hover { background: #156a2e; border-color: #156a2e; } .pg .ustat { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid ${TOKENS.line}; } .pg .ustat:last-child { border-bottom: 0; } .pg .ustat .uicon { width: 36px; height: 36px; color: ${TOKENS.accent}; } .pg .ustat .uicon svg { width: 36px; height: 36px; stroke-width: 1.4; }
    .pg .ustat .utext { flex: 1; min-width: 0; } .pg .ustat .t { font-size: 15px; font-weight: 600; } .pg .ustat .d { color: ${TOKENS.ink2}; font-size: 12px; margin-top: 3px; display: flex; align-items: center; gap: 10px; } .pg .ustat .d a { color: ${TOKENS.accent}; cursor: pointer; }
    .pg .ustat .bar { width: 240px; height: 4px; border-radius: 2px; background: ${TOKENS.surface3}; overflow: hidden; } .pg .ustat .bar i { display: block; height: 100%; width: 0; background: ${TOKENS.accent}; transition: width .12s linear; } .pg .ustat .pct { font-variant-numeric: tabular-nums; }

    .pm .toast a { color: #8ab4f8; cursor: pointer; padding: 0 12px; height: 36px; display: inline-flex; align-items: center; border-radius: 18px; } .pm .toast a:hover { background: rgba(255,255,255,.08); }
    .pm .toast[hidden] { display: none; }
`;
}
module.exports = { chromeCss };
