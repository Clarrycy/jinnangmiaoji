'use strict';
// 壳的 TypeScript 源在 src/**；编译成同路径的 JS（core/、jinnangdai/），供 Electron、测试、打包、边界检查直接使用。
// 用 esbuild 逐文件转译（CommonJS，不打包）；类型检查由 `npm run typecheck`（tsc --noEmit）负责。
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..');
const srcRoot = path.join(root, 'src');
const watch = process.argv.includes('--watch');
function listTs(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? listTs(path.join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [path.join(dir, e.name)] : []); }
// 沙箱 preload 不能 require 其他文件：这些入口连同依赖打成单文件（electron 保持外部引用）。
const BUNDLED = new Set(['core/shell-preload.ts']);
function buildOne(file) {
  const rel = path.relative(srcRoot, file);
  const out = path.join(root, rel.replace(/\.ts$/, '.js'));
  const code = fs.readFileSync(file, 'utf8');
  const result = BUNDLED.has(rel.split(path.sep).join('/'))
    ? { code: esbuild.buildSync({ entryPoints: [file], bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20', charset: 'utf8', external: ['electron'], logLevel: 'silent' }).outputFiles[0].text }
    : esbuild.transformSync(code, { loader: 'ts', format: 'cjs', platform: 'node', target: 'node20', sourcefile: rel, charset: 'utf8' });
  const header = `// 由 src/${rel.split(path.sep).join('/')} 生成（node scripts/build-ts.js${BUNDLED.has(rel.split(path.sep).join('/')) ? '，已打包依赖' : ''}）；改源文件，不要改这里。\n`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, header + result.code);
  return rel;
}
function buildAll() { const files = listTs(srcRoot); for (const f of files) buildOne(f); console.log(`built ${files.length} files`); }
buildAll();
if (watch) fs.watch(srcRoot, { recursive: true }, (_e, name) => { if (name && name.endsWith('.ts')) { try { console.log('rebuilt', buildOne(path.join(srcRoot, name))); for (const b of BUNDLED) if (!name.endsWith(b)) buildOne(path.join(srcRoot, b)); } catch (e) { console.error(e.message); } } });
