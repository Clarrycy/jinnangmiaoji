'use strict';
// 官服登录页私有化（作者 10-21：新标签全部加载完不许慢于 Chrome 打开 GitHub）：改写、分段读取、文档识别、种子随包
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const root = path.join(__dirname, '..');
const { createLandingPack, rewrite, docAssets, cssAssets } = require('../core/landing-pack.js');

const html = '<link href="https://web.sanguosha.com/static/css/a.css" rel="stylesheet"/><div class="video-bg" id="sgsVideoImg"></div><video class="bg-ani" id="sgsBgVideo" width="1600" height="900" autoplay loop muted src="###"><div class="disable-video"></div></video><script id="sgsCensus" src="https://web.sanguosha.com/sgsCensus/startup.php"></script><script src="https://web.sanguosha.com/static/js/sgslogin-sdk-1.js"></script>';
const bg = { mp4: 'https://wwwoss.sanguosha.com/uploads/v.mp4', img: 'https://wwwoss.sanguosha.com/uploads/i.png' };
const out = rewrite(html, bg);
assert(out.includes('<script id="sgsCensus" async src='), 'the census script no longer blocks the page');
assert(out.includes(`id="sgsBgVideo" width="1600" height="900" autoplay loop muted src="${bg.mp4}"`) && out.includes(`id="sgsVideoImg" style="background-image:url(${bg.img})"`), 'background starts from the local copy while parsing');
assert(out.includes('if(n==="src"&&this.getAttribute("src")===x)return;'), 'setting the same video src again does not restart the video');
assert.equal(rewrite(html, null), html.replace('<script id="sgsCensus" src=', '<script id="sgsCensus" async src='), 'without a known background only the census script changes');
assert.deepEqual(docAssets(html), ['https://web.sanguosha.com/static/css/a.css', 'https://web.sanguosha.com/static/js/sgslogin-sdk-1.js'], 'php and other hosts are not packed');
assert.deepEqual(cssAssets('a{background:url(../img/x.png)}b{background:url(data:image/png;base64,AA)}', 'https://web.sanguosha.com/css/c/a.css'), ['https://web.sanguosha.com/css/img/x.png']);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jnd-landing-'));
  const files = { 'https://web.sanguosha.com/static/css/a.css': 'a{}', 'https://web.sanguosha.com/static/js/sgslogin-sdk-1.js': 'x', [bg.mp4]: '0123456789', [bg.img]: 'png' };
  const fetcher = async url => {
    const body = url === 'https://web.sanguosha.com/login/x/index' ? html : files[url];
    if (body === undefined) return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, headers: { get: k => k === 'content-type' ? (/mp4$/.test(url) ? 'video/mp4' : 'text/plain') : null }, arrayBuffer: async () => Uint8Array.from(Buffer.from(body)).buffer };
  };
  const pack = createLandingPack({ dir: path.join(dir, 'own'), seedDir: path.join(dir, 'seed'), log() {}, fetch: fetcher });
  assert.equal(pack.has(), false);
  await pack.refresh(true, bg);
  assert(pack.has() && pack.isDoc('https://web.sanguosha.com/login/x/index?x=1') && !pack.isDoc('https://web.sanguosha.com/login/x/other'));
  assert((await pack.serveDoc().text()).includes(bg.mp4));
  const part = pack.serveAsset(bg.mp4, 'bytes=2-5');
  assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await part.text(), '2345');
  assert.equal((await pack.serveAsset(bg.mp4, null).text()), '0123456789');
  assert.equal(pack.serveAsset('https://web.sanguosha.com/other.js', null), null, 'unknown files go to the network');
  assert(pack.isDocumentScript('https://web.sanguosha.com/static/js/sgslogin-sdk-1.js', 'https://web.sanguosha.com/login/x/index'));
  assert(!pack.isDocumentScript('https://web.sanguosha.com/static/js/worker.js', 'https://web.sanguosha.com/login/x/index'));
  assert(!pack.isDocumentScript('https://web.sanguosha.com/static/js/sgslogin-sdk-1.js', 'https://web.sanguosha.com/10/pc/index.php'));
  fs.rmSync(dir, { recursive: true, force: true });
  const build = fs.readFileSync(path.join(root, 'scripts/build-portable.js'), 'utf8');
  assert(build.includes("copy(path.join(weiduanRoot, 'core'), path.join(stage, 'core'));"), 'core/ (with the seed) is packaged');
  const main = fs.readFileSync(path.join(root, 'src/core/main-app.ts'), 'utf8');
  assert(main.includes('removeSessionHooks(ses);') && main.includes("app.userAgentFallback = cleanUserAgent(app.userAgentFallback)"), 'https takeover needs no webRequest listeners and an ASCII user agent');
  console.log('micro landing pack tests passed');
})().catch(e => { console.error(e); process.exit(1); });
