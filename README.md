# 锦囊妙计客户端

《三国杀一将成名》网页版的桌面客户端（Electron 壳）。这里是壳本体的源码：标签栏、账号容器、登录桥、账号簿、更新、打包脚本和界面 harness。

本仓库**不含**随包的游戏辅助脚本（锦囊袋 runtime、小抄）。从源码构建的客户端在首次启动时会从更新清单下载它们，再进入登录页；没有网络时会明确报错，不会带着空 runtime 启动。随包的统一登录器种子在 `jinnangdai/payload/`。

## 目录

| 路径 | 内容 |
|---|---|
| `src/core/` | 主进程与 preload 的 TypeScript 源码（`main-app.ts` 主进程；`chrome/` 标签栏引擎；`injector-preload.ts` 游戏页注入；`gm-request-host.ts` 脚本跨域请求；`*-update-host.ts` 更新） |
| `src/jinnangdai/` | 渠道配置（`channel.ts`：版本号、入口、更新地址） |
| `core/`、`jinnangdai/*.js` | `scripts/build-ts.js` 用 esbuild 从 `src/` 转译出的产物，Electron 直接加载。改 `.ts`，不要改这些文件 |
| `design/` | 标签栏与浮层的 1:1 harness（`shell-harness.html`），设计先在这里定稿再落壳 |
| `scripts/` | `build-ts.js` 转译；`build-portable.js` 打便携包／mac DMG；`build-setup.js` 打 Windows 安装包 |
| `tests/` | 可独立运行的单元测试 |

## 开发

```bash
npm install
node scripts/build-ts.js
npx electron jinnangdai
```

- `JND_MICRO_PROFILE=<名字>`：用独立的用户数据目录运行，不碰正式账号簿和设置。
- `--remote-debugging-port=9333`：开 CDP，配合脚本驱动验证。
- `JND_MICRO_PAYLOAD_DIR=<目录>`：指定随包种子目录；指到空目录即模拟无种子的首次启动。

类型检查 `npm run typecheck`；测试逐个运行 `node tests/<name>.test.js`。

## 打包

```bash
JND_MICRO_SEEDLESS=1 node scripts/build-portable.js jinnangdai
```

macOS 上加 `JND_MICRO_MAC=1` 出 DMG；Windows 安装包用 `node scripts/build-setup.js jinnangdai <输出目录>`（需要 makensis）。`JND_MICRO_SEEDLESS=1` 表示允许没有随包种子。

## 许可证

Apache License 2.0，见 `LICENSE`。各平台图标（`src/core/chrome/brand-icons.ts`）取自各官方站点，仅用于「用该平台登录」的指示性展示。
