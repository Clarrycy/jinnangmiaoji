#!/usr/bin/env node
'use strict';
// 把 build-portable.js 产出的便携目录做成 Windows 安装包（NSIS，macOS 上用 brew 的 makensis 编译）。
//   node scripts/build-setup.js <guanfu|4399> <便携输出目录>
// 按用户安装到 %LOCALAPPDATA%\Programs\<产品名>，不要求管理员；开始菜单＋桌面快捷方式、卸载器、
// 控制面板卸载项（HKCU）。安装目录可写，壳的 app.asar 自更新就落在这里。
// 产物：<目录>/<产品名>-Setup-<版本>.exe 与 .manifest.json。未签名：首次运行会有 SmartScreen 提示，签名证书到位后在此接签名步骤。
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const channel = String(process.argv[2] || '').trim();
const outputDirectory = path.resolve(String(process.argv[3] || '').trim() || '');
if (!['jinnangdai', 'guanfu', '4399'].includes(channel) || !process.argv[3]) {
  throw new Error('usage: build-setup.js <jinnangdai|guanfu|4399> <portable output directory>');
}
const weiduanRoot = path.resolve(__dirname, '..');
const names = { jinnangdai: '锦囊妙计', guanfu: '锦囊妙计-官服', '4399': '锦囊妙计-4399' };
const appName = names[channel];
const sourceDirectory = path.join(outputDirectory, `${appName}-win32-x64`);
if (!fs.existsSync(path.join(sourceDirectory, `${appName}.exe`))) throw new Error(`portable build not found: ${sourceDirectory}`);
const portableManifest = fs.readdirSync(outputDirectory).find(name => name.startsWith(`${appName}-`) && name.endsWith('.zip.manifest.json'));
if (!portableManifest) throw new Error('portable manifest not found; run build-portable.js first');
const built = JSON.parse(fs.readFileSync(path.join(outputDirectory, portableManifest), 'utf8'));
const version = String(built.shellVersion);
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`bad shell version: ${version}`);
const icon = path.join(weiduanRoot, channel, 'build', 'icon.ico');
const setupPath = path.join(outputDirectory, `${appName}-Setup-${version}.exe`);
if (fs.existsSync(setupPath)) throw new Error(`Output already exists: ${setupPath}`);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const q = value => `"${String(value).replace(/"/g, '$\\"')}"`;

// NSIS 3 Unicode：脚本以 UTF-8 BOM 保存，中文直接写。
const script = `Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

Name ${q(appName)}
OutFile ${q(setupPath)}
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\\Programs\\${appName}"
InstallDirRegKey HKCU "Software\\Jinnangdai\\${appName}" "InstallDir"
SetCompressor /SOLID lzma
BrandingText " "

VIProductVersion "${version}.0"
VIAddVersionKey /LANG=2052 "ProductName" ${q(appName)}
VIAddVersionKey /LANG=2052 "FileDescription" "${appName} 安装程序"
VIAddVersionKey /LANG=2052 "CompanyName" "锦囊袋"
VIAddVersionKey /LANG=2052 "FileVersion" "${version}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${version}"
VIAddVersionKey /LANG=2052 "LegalCopyright" ""

!define MUI_ICON ${q(icon)}
!define MUI_UNICON ${q(icon)}
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\\${appName}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "现在启动 ${appName}"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r ${q(`${sourceDirectory}${path.sep}*.*`)}
  WriteUninstaller "$INSTDIR\\卸载.exe"
  CreateDirectory "$SMPROGRAMS\\${appName}"
  CreateShortCut "$SMPROGRAMS\\${appName}\\${appName}.lnk" "$INSTDIR\\${appName}.exe" "" "$INSTDIR\\icon.ico"
  CreateShortCut "$SMPROGRAMS\\${appName}\\卸载 ${appName}.lnk" "$INSTDIR\\卸载.exe"
  CreateShortCut "$DESKTOP\\${appName}.lnk" "$INSTDIR\\${appName}.exe" "" "$INSTDIR\\icon.ico"
  WriteRegStr HKCU "Software\\Jinnangdai\\${appName}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "DisplayName" ${q(appName)}
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "DisplayVersion" "${version}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "Publisher" "锦囊袋"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "DisplayIcon" "$INSTDIR\\icon.ico"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "UninstallString" "$\\"$INSTDIR\\卸载.exe$\\""
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "NoModify" 1
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "NoRepair" 1
  \${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\\${appName}.lnk"
  RMDir /r "$SMPROGRAMS\\${appName}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}"
  DeleteRegKey HKCU "Software\\Jinnangdai\\${appName}"
SectionEnd
`;

const stage = fs.mkdtempSync(path.join(os.tmpdir(), `jnd-${channel}-setup-`));
try {
  const scriptPath = path.join(stage, 'setup.nsi');
  fs.writeFileSync(scriptPath, `﻿${script}`);
  // Homebrew 的 makensis 在 C locale 下把任何非 ASCII 判为 Bad text encoding；必须给 UTF-8 locale。
  const result = childProcess.spawnSync('makensis', ['-V2', scriptPath], {
    stdio: 'inherit', env: { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`makensis exited with ${result.status}`);
  const bytes = fs.readFileSync(setupPath);
  const manifest = {
    schema: 'jnd/micro-setup/v1', channel, shellVersion: version, seedVersion: built.seedVersion, companionVersion: built.companionVersion,
    components: built.components, sourceAsarSha256: built.asarSha256, builtAt: new Date().toISOString(),
    installer: 'nsis', perUser: true, installDir: `%LOCALAPPDATA%\\Programs\\${appName}`, signed: false,
    setup: path.basename(setupPath), setupBytes: bytes.length, setupSha256: sha256(bytes),
  };
  fs.writeFileSync(`${setupPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${setupPath}\n`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
