#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
// 壳源码是 TypeScript（src/**）；打包前先编译，保证 core/ 与 jinnangdai/ 下的 JS 是最新产物。
childProcess.execFileSync(process.execPath, [require('path').join(__dirname, 'build-ts.js')], { stdio: 'inherit' });
const crypto = require('crypto');

const requested = String(process.argv[2] || '').trim();
// 1.4.0 起对外只有统一微端 jinnangdai；guanfu／4399 独立包停用但保留可打。
const channels = requested === 'all' ? ['jinnangdai', 'wegame'] : [requested === 'steam' ? 'wegame' : requested];
if (channels.some(channel => !['jinnangdai', 'guanfu', '4399', 'wegame'].includes(channel))) {
  throw new Error('channel must be jinnangdai, guanfu, 4399, wegame, steam or all');
}
const weiduanRoot = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(process.env.JND_MICRO_OUTPUT_DIR || path.join(weiduanRoot, 'dist-series'));
const names = { jinnangdai: '锦囊妙计', guanfu: '锦囊妙计-官服', '4399': '锦囊妙计-4399', wegame: '锦囊妙计-WeGame-Steam' };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function copy(source, destination) {
  fs.cpSync(source, destination, { recursive: true });
}

function sourceManifest(directory, base = directory) {
  const result = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...sourceManifest(file, base));
    else if (item.isFile()) {
      const bytes = fs.readFileSync(file);
      result.push({ path: path.relative(base, file).split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

function archive(folderName, zipPath) {
  if (process.platform === 'darwin' && folderName.endsWith('-darwin-arm64')) {
    // mac .app 里 Electron Framework.framework 靠符号链接（Versions/Current、顶层 Electron Framework／Libraries）组织，
    // Python zipfile 只写普通文件会把链接丢掉或摊平成拷贝，装出来的 app 启动即 dyld 报找不到 libffmpeg。用 ditto 保留链接与扩展属性。
    run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path.join(outputDirectory, folderName), zipPath]);
    return;
  }
  if (process.platform === 'win32') {
    const quote = value => `'${value.replace(/'/g, "''")}'`;
    const command = `Compress-Archive -LiteralPath ${quote(path.join(outputDirectory, folderName))} -DestinationPath ${quote(zipPath)} -CompressionLevel Optimal`;
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]);
  } else {
    // macOS 自带 zip 未必标记 UTF-8 文件名；显式使用可被 Windows 正确识别的编码。
    const python = `from pathlib import Path
import sys, zipfile
folder = Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(folder.parent).as_posix())
`;
    run('python3', ['-c', python, path.join(outputDirectory, folderName), zipPath]);
  }
}

async function packageChannel(channel) {
  const channelRoot = path.join(weiduanRoot, channel);
  const packageInfo = JSON.parse(fs.readFileSync(path.join(channelRoot, 'package.json'), 'utf8'));
  // 仅测试用：JND_MICRO_SHELL_VERSION 覆盖壳版本（package.json 与 channel.js 的 shellVersion 同步改到暂存区），
  // 用来产出一份「更新的壳」验证自更新链路；正式版本号仍以源码为准。
  const shellVersionOverride = String(process.env.JND_MICRO_SHELL_VERSION || '').trim();
  if (shellVersionOverride) {
    if (!/^\d+\.\d+\.\d+$/.test(shellVersionOverride)) throw new Error('JND_MICRO_SHELL_VERSION must be x.y.z');
    packageInfo.version = shellVersionOverride;
  }
  const toolRoots = [channelRoot, path.join(weiduanRoot, 'wegame'), path.join(weiduanRoot, 'guanfu'), process.env.JND_MICRO_TOOL_ROOT].filter(Boolean);
  const resolveTool = name => require.resolve(name, { paths: toolRoots });
  const requireTool = name => require(resolveTool(name));
  const electronVersion = requireTool('electron/package.json').version;
  const appName = names[channel];
  const seedPath = path.join(channelRoot, 'payload', channel === 'wegame' ? 'jinnangdai.user.js' : 'jinnangdai.runtime.js');
  // JND_MICRO_SEEDLESS=1：公开源码构建，没有随包种子，首启从更新清单下载 runtime／组件
  const seedless = process.env.JND_MICRO_SEEDLESS === '1';
  const readSeed = file => { try { return fs.readFileSync(file); } catch (error) { if (seedless) return null; throw error; } };
  const seed = readSeed(seedPath);
  const companion = readSeed(path.join(channelRoot, 'payload', 'daxiaochao.user.js'));
  const userScriptVersion = bytes => bytes.toString('utf8').split('// ==/UserScript==', 1)[0].match(/^\/\/\s*@version\s+(\d+\.\d+\.\d+)\s*$/m)?.[1];
  const seedVersion = channel === 'wegame' ? (seed ? userScriptVersion(seed) : '0.0.0') : require(path.join(channelRoot, 'channel.js')).seedVersion;
  const companionVersion = companion ? userScriptVersion(companion) : '0.0.0';
  if (!seedless && (!seedVersion || !companionVersion)) throw new Error('Missing embedded seed version');
  // JND_MICRO_MAC=1：作者本机截图／演示用的 macOS 包（arm64），不是对外分发产物。
  const macBuild = process.platform === 'darwin' && process.env.JND_MICRO_MAC === '1';
  const folderName = macBuild ? `${appName}-darwin-arm64` : `${appName}-win32-x64`;
  const targetDirectory = path.join(outputDirectory, folderName);
  const zipPath = path.join(outputDirectory, `${appName}-${packageInfo.version}-${macBuild ? 'mac-arm64' : 'win-x64'}.zip`);
  const manifestPath = `${zipPath}.manifest.json`;
  for (const file of [targetDirectory, zipPath, manifestPath]) {
    if (fs.existsSync(file)) throw new Error(`Output already exists: ${file}; choose a new JND_MICRO_OUTPUT_DIR`);
  }
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), `jnd-${channel}-portable-`));
  try {
    let stagedPackage;
    let icon;
    if (channel === 'wegame') {
      for (const item of ['main.js', 'preload.js', 'ui.html', 'build', 'lib']) {
        copy(path.join(channelRoot, item), path.join(stage, item));
      }
      for (const name of ['chrome-remote-interface', 'commander', 'ws']) {
        copy(path.dirname(resolveTool(`${name}/package.json`)), path.join(stage, 'node_modules', name));
      }
      stagedPackage = { ...packageInfo };
      delete stagedPackage.scripts;
      icon = path.join(stage, 'build', 'icon.ico');
    } else {
      copy(path.join(weiduanRoot, 'core'), path.join(stage, 'core'));
      for (const item of ['main.js', 'preload.js', 'channel.js', 'build']) {
        copy(path.join(channelRoot, item), path.join(stage, channel, item));
      }
      if (shellVersionOverride) {
        const channelFile = path.join(stage, channel, 'channel.js');
        const source = fs.readFileSync(channelFile, 'utf8');
        if (!/shellVersion: '\d+\.\d+\.\d+'/.test(source)) throw new Error('channel.js has no shellVersion to override');
        fs.writeFileSync(channelFile, source.replace(/shellVersion: '\d+\.\d+\.\d+'/, `shellVersion: '${shellVersionOverride}'`));
      }
      stagedPackage = {
        name: `jinnangdai-${channel}-portable`, version: packageInfo.version,
        productName: packageInfo.productName, description: packageInfo.description,
        author: packageInfo.author || 'Jinnangdai', main: `${channel}/main.js`,
        devDependencies: { electron: packageInfo.devDependencies.electron },
      };
      icon = path.join(stage, channel, 'build', 'icon.ico');
    }
    const payloadDestination = path.join(stage, channel === 'wegame' ? '' : channel, 'payload');
    fs.mkdirSync(payloadDestination, { recursive: true });
    if (seed) copy(seedPath, path.join(payloadDestination, path.basename(seedPath)));
    if (companion) copy(path.join(channelRoot, 'payload', 'daxiaochao.user.js'), path.join(payloadDestination, 'daxiaochao.user.js'));
    // 网站宿主的随包组件（components.js）全部作为种子入包；缺一个即失败，不出半包。
    const components = {};
    if (channel !== 'wegame') {
      for (const component of require(path.join(weiduanRoot, 'core', 'components.js')).COMPONENTS) {
        const file = path.join(channelRoot, 'payload', component.file);
        const bytes = readSeed(file);
        if (!bytes) continue; /* 无种子模式：缺的组件首启下载 */
        const version = userScriptVersion(bytes);
        if (!version) throw new Error(`Missing embedded component version: ${component.id}`);
        copy(file, path.join(payloadDestination, component.file));
        components[component.id] = { version, bytes: bytes.length, sha256: sha256(bytes) };
      }
    }
    // 网站宿主的 userData 由 main-app 按渠道隔离；EXE 显示资源独立设置。
    fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`);
    const inputs = sourceManifest(stage);
    fs.mkdirSync(outputDirectory, { recursive: true });
    if (macBuild) {
      const icns = path.join(stage, 'build', 'icon.icns');
      const iconset = path.join(stage, 'build', 'icon.iconset');
      fs.mkdirSync(iconset, { recursive: true });
      const source = path.join(weiduanRoot, '_iconwork', 'preview_256.png');
      for (const [name, size] of [['icon_16x16', 16], ['icon_16x16@2x', 32], ['icon_32x32', 32], ['icon_32x32@2x', 64], ['icon_128x128', 128], ['icon_128x128@2x', 256], ['icon_256x256', 256], ['icon_256x256@2x', 512], ['icon_512x512', 512]]) {
        childProcess.execFileSync('sips', ['-z', String(size), String(size), source, '--out', path.join(iconset, `${name}.png`)], { stdio: 'ignore' });
      }
      childProcess.execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns]);
      await requireTool('electron-packager')({
        dir: stage, name: appName, platform: 'darwin', arch: 'arm64', electronVersion,
        out: outputDirectory, overwrite: false, asar: true, icon: icns,
        appVersion: packageInfo.version, buildVersion: packageInfo.version, appBundleId: 'net.sh-sgs.jinnangdai.micro',
      });
      // 改过 Resources 的 app 原签名已失效；没有 Developer ID 就做 ad-hoc 签名（arm64 必须有签名才能起），
      // Gatekeeper 仍会提示「无法验证开发者」，玩家需在「系统设置 → 隐私与安全性」点一次「仍要打开」。
      const appPath = path.join(targetDirectory, `${appName}.app`);
      run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath]);
      run('codesign', ['--verify', '--deep', '--strict', appPath]);
      archive(folderName, zipPath);
      // DMG：app ＋ Applications 快捷方式，拖进去即装。先建可写镜像，用 Finder 摆好图标位置、背景与窗口尺寸，再压成只读。
      const dmgPath = zipPath.replace(/\.zip$/, '.dmg');
      const dmgStage = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-dmg-'));
      run('ditto', [appPath, path.join(dmgStage, `${appName}.app`)]);
      fs.symlinkSync('/Applications', path.join(dmgStage, 'Applications'));
      fs.mkdirSync(path.join(dmgStage, '.background'));
      run('python3', [path.join(__dirname, 'dmg-background.py'), path.join(dmgStage, '.background', 'bg.png')]);
      // Finder 按卷名找盘：同名卷（之前打开过的本产品 DMG）先弹出，否则脚本会摆到别的盘上
      for (const name of fs.readdirSync('/Volumes')) if (name === appName || name.startsWith(`${appName} `)) { try { run('hdiutil', ['detach', path.join('/Volumes', name), '-quiet']); } catch (_) {} }
      const rwPath = `${dmgPath}.rw.dmg`;
      fs.rmSync(rwPath, { force: true });
      run('hdiutil', ['create', '-volname', appName, '-srcfolder', dmgStage, '-ov', '-format', 'UDRW', '-fs', 'HFS+', '-quiet', rwPath]);
      const attached = childProcess.execFileSync('hdiutil', ['attach', '-readwrite', '-noverify', '-noautoopen', rwPath], { encoding: 'utf8' });
      const mountPoint = (attached.match(/\/Volumes\/[^\n]+/g) || []).pop()?.trim();
      if (mountPoint !== path.join('/Volumes', appName)) throw new Error(`DMG mounted at ${mountPoint}, expected /Volumes/${appName}`);
      if (!mountPoint) throw new Error('DMG mount point not found');
      try {
        // 窗口 600×380（Finder 坐标含标题栏），图标 128，app 在左 (200,170)、Applications 在右 (400,170)，与背景箭头对齐
        const script = `tell application "Finder"
  tell disk "${appName}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {400, 200, 1000, 580}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 128
    set text size of theViewOptions to 13
    set background picture of theViewOptions to file ".background:bg.png"
    set position of item "${appName}.app" of container window to {200, 170}
    set position of item "Applications" of container window to {400, 170}
    close
    open
    update without registering applications
    delay 1
    close
  end tell
end tell`;
        run('osascript', ['-e', script]);
        run('sync', []);
      } finally {
        run('hdiutil', ['detach', mountPoint, '-quiet']);
      }
      fs.rmSync(dmgPath, { force: true });
      run('hdiutil', ['convert', rwPath, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-quiet', '-o', dmgPath]);
      fs.rmSync(rwPath, { force: true });
      fs.rmSync(dmgStage, { recursive: true, force: true });
      process.stdout.write(`${dmgPath}\n`);
      fs.writeFileSync(manifestPath, `${JSON.stringify({ schema: 'jnd/micro-local-package/v1', channel, platform: 'darwin-arm64', purpose: 'author-preview', codesign: 'ad-hoc', dmg: path.basename(dmgPath), dmgSha256: sha256(fs.readFileSync(dmgPath)),
        packagedAt: new Date().toISOString(), electronVersion, shellVersion: packageInfo.version, seedVersion, companionVersion,
        sourceFiles: inputs, archive: path.basename(zipPath), archiveBytes: fs.statSync(zipPath).size, archiveSha256: sha256(fs.readFileSync(zipPath)) }, null, 2)}\n`);
      process.stdout.write(`${zipPath}\n`);
      return;
    }
    if (process.platform === 'win32') {
      const packager = requireTool('electron-packager');
      await packager({
        dir: stage, name: appName, platform: 'win32', arch: 'x64', electronVersion,
        out: outputDirectory, overwrite: false, asar: true, icon,
        appVersion: packageInfo.version, buildVersion: packageInfo.version,
        win32metadata: { ProductName: appName, FileDescription: appName, InternalName: stagedPackage.name },
      });
    } else {
      // macOS 使用已下载的 Windows Electron；不要求 Wine，不伪称已写入 EXE 资源。
      const { downloadArtifact } = requireTool('@electron/get');
      const electronZip = await downloadArtifact({ version: electronVersion, artifactName: 'electron', platform: 'win32', arch: 'x64' });
      fs.mkdirSync(targetDirectory, { recursive: true });
      await requireTool('extract-zip')(electronZip, { dir: targetDirectory });
      fs.renameSync(path.join(targetDirectory, 'electron.exe'), path.join(targetDirectory, `${appName}.exe`));
      fs.rmSync(path.join(targetDirectory, 'resources', 'default_app.asar'), { force: true });
      await requireTool('@electron/asar').createPackage(stage, path.join(targetDirectory, 'resources', 'app.asar'));
    }
    const executablePath = path.join(targetDirectory, `${appName}.exe`);
    const product = {
      version: `${packageInfo.version}.0`,
      strings: {
        CompanyName: '锦囊袋', ProductName: appName, FileDescription: appName,
        InternalName: stagedPackage.name, OriginalFilename: `${appName}.exe`,
      },
    };
    const { stampWindowsMetadata } = require(path.join(weiduanRoot, 'wegame/build-tools/windows-metadata-contract.cjs'));
    const { verifyWindowsIcon } = require(path.join(weiduanRoot, 'wegame/lib/windows-icon-contract.js'));
    const branding = await stampWindowsMetadata(executablePath, product, icon);
    const icons = verifyWindowsIcon(executablePath, icon);
    if (!icons.exact) throw new Error(`Windows EXE icon mismatch: ${channel}`);
    // 随包保留 ICO，便于核验及 Windows 侧建立中文快捷方式。
    copy(icon, path.join(targetDirectory, 'icon.ico'));
    // 壳自更新的发布单元就是这份 app.asar：单独导出一份给 generate-micro-components.js。
    if (channel !== 'wegame') {
      copy(path.join(targetDirectory, 'resources', 'app.asar'), path.join(outputDirectory, `${appName}-${packageInfo.version}.app.asar`));
    }
    archive(folderName, zipPath);
    const manifest = {
      schema: 'jnd/micro-local-package/v1', channel, compatibleClients: channel === 'wegame' ? ['WeGame', 'Steam'] : [channel],
      packagedAt: new Date().toISOString(), buildHost: process.platform, electronVersion,
      shellVersion: packageInfo.version, seedVersion, companionVersion, components,
      seedless, seedSha256: seed ? sha256(seed) : null, companionSha256: companion ? sha256(companion) : null,
      windowsExecutableResourcesApplied: true,
      windowsProduct: branding.strings, windowsIconSizes: icons.embedded,
      sourceFiles: inputs, asarSha256: sha256(fs.readFileSync(path.join(targetDirectory, 'resources', 'app.asar'))),
      archive: path.basename(zipPath), archiveBytes: fs.statSync(zipPath).size, archiveSha256: sha256(fs.readFileSync(zipPath)),
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${zipPath}\n`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

(async () => {
  for (const channel of channels) await packageChannel(channel);
})().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
