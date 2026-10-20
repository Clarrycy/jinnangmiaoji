# 壳 UI 参照（2026-10-17 从作者 Mac 上的 Chrome 截得，2x）

- chrome-tabstrip-2x.jpg：标签栏（活动标签白底 10px 圆角带脚、非活动标签间 1×20 竖线、favicon 16、关闭 × 16、喇叭 16、「+」28）。
- chrome-toolbar-2x.jpg：后退／前进／刷新按钮 28×28、间距 30，细线图标，禁用态淡灰。
- chrome-password-manager-2x.png：chrome://password-manager 列表页。
- Chromium layout_constants.cc（非触控）：TAB_HEIGHT 34(+1 重叠)、TAB_STRIP_PADDING 6、TAB_SEPARATOR_HEIGHT 20、TAB_CLOSE_BUTTON_SIZE 16、ALERT_INDICATOR 16、TAB_PRE_TITLE_PADDING 8、TAB_AFTER_TITLE_PADDING 4、TAB_HORIZONTAL_PADDING 8、TOOLBAR_BUTTON_HEIGHT 34、TOOLBAR_DIVIDER 2×16。
- 壳标题栏固定 32（Win11 原生高度），标签按 34→28 等比缩：圆角 8、分隔线 16。
