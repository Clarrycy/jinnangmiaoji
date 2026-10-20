'use strict';
// 标签栏尺寸单源，由 design/build-tab-spec.js 生成（改那里，不要改这里）。caption 为右上四键规格。
const SPEC = {
  "bar": 32,
  "tabTop": 4,
  "tab": 28,
  "radius": 8,
  "pill": 24,
  "pillGap": 4,
  "pillSide": 6,
  "padL": 10,
  "padR": 6,
  "icon": 14,
  "chip": 18,
  "ctl": 18,
  "gap": 6,
  "sep": {
    "w": 1,
    "h": 16
  },
  "newTab": 24,
  "nav": 28,
  "caption": {
    "w": 36,
    "h": 32,
    "pillW": 30,
    "pillH": 24
  }
} as const;
export = SPEC;
