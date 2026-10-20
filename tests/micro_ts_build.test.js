'use strict';
// 壳的源码是 TypeScript：core/ 与 jinnangdai/ 下的 JS 必须是 build-ts 的产物（带生成头），且与 src/ 一一对应、不落后于源文件。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const list = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const sources = list(path.join(root, 'src')).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
assert(sources.length >= 20, 'shell sources live under src');
for (const ts of sources) {
  const js = path.join(root, path.relative(path.join(root, 'src'), ts).replace(/\.ts$/, '.js'));
  assert(fs.existsSync(js), `missing build output for ${path.relative(root, ts)}`);
  const head = fs.readFileSync(js, 'utf8').split('\n', 1)[0];
  assert(head.includes('由 src/') && head.includes('build-ts.js'), `${path.relative(root, js)} is not a build-ts product; edit the .ts and rebuild`);
  assert(fs.statSync(js).mtimeMs >= fs.statSync(ts).mtimeMs - 1000, `${path.relative(root, js)} is older than its source; run node scripts/build-ts.js`);
}
assert(fs.existsSync(path.join(root, 'tsconfig.json')));
assert(/"typecheck": "tsc --noEmit/.test(fs.readFileSync(path.join(root, 'package.json'), 'utf8')));
console.log('micro ts build tests passed');
