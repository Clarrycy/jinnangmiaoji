'use strict';
// 官服登录页私有化（作者 10-21：新标签全部加载完不许慢于 Chrome 打开 GitHub，实测 864ms）。
// 本地存一份官服登录页：文档、它引用的样式脚本图片、官方选中的背景视频与底图。新标签的文档与这些资源全部从本地磁盘出，
// 后台再去官方取新的，内容变了下次才用（stale-while-revalidate）。登录接口、风控、统计照常走官方网络，这里一概不碰。
// 种子随包（core/landing-seed），运行时的新版本写在 userData/landing-pack；两处同一格式：manifest.json＋files/。
import fs = require('fs');
import path = require('path');
import crypto = require('crypto');

const DOC_URL = 'https://web.sanguosha.com/login/x/index';
const STATIC_HOSTS = /^https:\/\/(web|wwwoss)\.sanguosha\.com\//i;
const REFRESH_EVERY = 6 * 3600 * 1000;

type FileEntry = { name: string; type: string; size: number };
type Manifest = { version: 1; docUrl: string; etag: string; html: string; fetchedAt: number; bg: { mp4: string; img: string } | null; files: Record<string, FileEntry> };
type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;

const bytes = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.length) as unknown as BodyInit; /* 零拷贝 */
const fileName = (url: string) => crypto.createHash('sha1').update(url).digest('hex') + (path.extname(new URL(url).pathname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '');

function readManifest(dir: string): Manifest | null {
  try { const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); return m && m.version === 1 && m.html ? m : null; } catch (_) { return null; }
}

// 文档里引用的同站静态资源：<link href>、<script src>，以及这些样式表里 url(...) 引的图
function docAssets(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="(https:\/\/web\.sanguosha\.com\/[^"#?]+\.(?:css|js|png|jpe?g|ico))"/gi)) out.add(m[1]);
  return [...out];
}
function cssAssets(css: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) {
    if (/^data:/i.test(m[1])) continue;
    try { const u = new URL(m[1], base); if (STATIC_HOSTS.test(u.href)) out.add(u.origin + u.pathname); } catch (_) {}
  }
  return [...out];
}

// 本地文档的改写：统计脚本 startup.php 改异步（原来同步、挡住整页初始化 0.6–0.8 秒；官方调它之前都先判断在不在）；
// 背景视频与底图直接写进标签，解析到就从本地开始放；官方脚本随后用同一地址再设一次 src 时不重载（否则视频重头解码、黑一下）
function rewrite(html: string, bg: Manifest['bg']): string {
  let out = html.replace(/<script id="sgsCensus" src=/, '<script id="sgsCensus" async src=');
  if (bg && /^https:\/\//.test(bg.mp4) && /^https:\/\//.test(bg.img)) {
    const attr = (s: string) => s.replace(/["<>&]/g, '');
    out = out.replace('<div class="video-bg" id="sgsVideoImg">', `<div class="video-bg" id="sgsVideoImg" style="background-image:url(${attr(bg.img)})">`)
      .replace(/(<video class="bg-ani" id="sgsBgVideo"[^>]*?) src="###"/, `$1 src="${attr(bg.mp4)}"`)
      .replace('</video>', '</video><script>(function(){var v=document.getElementById("sgsBgVideo");if(!v)return;var s=v.setAttribute;v.setAttribute=function(n,x){if(n==="src"&&this.getAttribute("src")===x)return;return s.apply(this,arguments)};})();</script>');
  }
  return out;
}

function createLandingPack(opts: { dir: string; seedDir: string; log: (...args: any[]) => void; fetch: Fetcher }) {
  const { dir, seedDir, log } = opts;
  let pack: { dir: string; m: Manifest } | null = null;
  let documentScripts = new Set<string>();
  function load() {
    const own = readManifest(dir), seed = readManifest(seedDir);
    pack = own && (!seed || own.fetchedAt >= seed.fetchedAt) ? { dir, m: own } : seed ? { dir: seedDir, m: seed } : null;
    documentScripts = new Set(pack ? docAssets(pack.m.html).filter(url => /\.js$/i.test(url) && Boolean(pack!.m.files[url])) : []);
    log('landing pack', pack ? `from=${pack.dir === dir ? 'userData' : 'seed'} files=${Object.keys(pack.m.files).length} fetched=${new Date(pack.m.fetchedAt).toISOString()} bg=${pack.m.bg ? 'yes' : 'no'}` : 'none');
  }
  load();

  function isDoc(url: string) { try { const u = new URL(url); return u.origin + u.pathname === DOC_URL; } catch (_) { return false; } }
  // Only scripts referenced by the local landing document may use its local route.
  // Do not extend this exception to game scripts or Worker entry points.
  function isDocumentScript(url: string, documentUrl: string) {
    if (!pack || !isDoc(documentUrl)) return false;
    return documentScripts.has(url.split(/[?#]/)[0]);
  }
  function serveDoc(): Response | null {
    if (!pack) return null;
    return new Response(rewrite(pack.m.html, pack.m.bg), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  // 视频要支持 Range：媒体管线按段取
  function serveAsset(url: string, range: string | null): Response | null {
    if (!pack) return null;
    const entry = pack.m.files[url.split(/[?#]/)[0]]; if (!entry) return null;
    let data: Buffer; try { data = fs.readFileSync(path.join(pack.dir, 'files', entry.name)); } catch (_) { return null; }
    const headers: Record<string, string> = { 'content-type': entry.type, 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'cache-control': 'max-age=31536000' };
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : data.length - Number(m[2]); let end = m[1] && m[2] ? Number(m[2]) : data.length - 1;
      start = Math.max(0, start); end = Math.min(end, data.length - 1);
      if (start > end) return new Response('', { status: 416, headers: { 'content-range': `bytes */${data.length}` } });
      return new Response(bytes(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': String(end - start + 1) } });
    }
    return new Response(bytes(data), { status: 200, headers: { ...headers, 'content-length': String(data.length) } });
  }
  // 官方页实际选中的背景（官方按服务器和标志位挑 web／client，不照抄这段逻辑）：页面放起来后由壳读回来记下
  function noteBackground(bg: { mp4?: string; img?: string }) {
    if (!pack || !bg || !STATIC_HOSTS.test(String(bg.mp4)) || !STATIC_HOSTS.test(String(bg.img))) return;
    const cur = pack.m.bg; if (cur && cur.mp4 === bg.mp4 && cur.img === bg.img) return;
    log('landing pack background changed', String(bg.mp4).slice(-40), String(bg.img).slice(-40));
    pendingBg = { mp4: String(bg.mp4), img: String(bg.img) }; refresh(true);
  }
  let pendingBg: Manifest['bg'] = null, refreshing: Promise<void> | null = null, lastTry = 0;
  async function download(url: string, into: string, files: Record<string, FileEntry>, reuse: Manifest | null) {
    const old = reuse?.files[url];
    if (old) { try { const src = path.join(pack!.dir, 'files', old.name); fs.copyFileSync(src, path.join(into, old.name)); files[url] = old; return; } catch (_) {} }
    const r = await opts.fetch(url); if (!r.ok) throw new Error(`HTTP_${r.status} ${url}`);
    const buf = Buffer.from(await r.arrayBuffer()); const name = fileName(url);
    fs.writeFileSync(path.join(into, name), buf);
    files[url] = { name, type: (r.headers.get('content-type') || 'application/octet-stream').split(';')[0], size: buf.length };
  }
  // 重新取一遍：文档没变、背景没变就什么都不写；变了就在临时目录里攒齐再整体换上，攒不齐不换
  function refresh(force = false, seedBg: Manifest['bg'] = null): Promise<void> {
    if (refreshing) return refreshing;
    if (!force && Date.now() - lastTry < REFRESH_EVERY) return Promise.resolve();
    lastTry = Date.now();
    refreshing = (async () => {
      const tmp = `${dir}.tmp-${process.pid}`;
      try {
        const r = await opts.fetch(DOC_URL); if (!r.ok) throw new Error(`doc HTTP_${r.status}`);
        const html = Buffer.from(await r.arrayBuffer()).toString('utf8'); const etag = r.headers.get('etag') || '';
        if (!/id="sgsBgVideo"/.test(html) || !/sgslogin-sdk/.test(html)) throw new Error('doc shape changed');
        const bg = pendingBg || pack?.m.bg || seedBg || null; pendingBg = null;
        if (pack && pack.m.html === html && JSON.stringify(pack.m.bg) === JSON.stringify(bg)) { log('landing pack up to date'); return; }
        fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(path.join(tmp, 'files'), { recursive: true });
        const files: Record<string, FileEntry> = {};
        const queue = docAssets(html); if (bg) queue.push(bg.mp4, bg.img);
        for (let i = 0; i < queue.length; i++) {
          const url = queue[i]; if (files[url]) continue;
          await download(url, path.join(tmp, 'files'), files, pack?.m || null);
          if (/\.css$/i.test(url)) for (const extra of cssAssets(fs.readFileSync(path.join(tmp, 'files', files[url].name), 'utf8'), url)) if (!queue.includes(extra)) queue.push(extra);
        }
        const m: Manifest = { version: 1, docUrl: DOC_URL, etag, html, fetchedAt: Date.now(), bg, files };
        fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m));
        fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
        log('landing pack refreshed files=', Object.keys(files).length, 'bytes=', Object.values(files).reduce((a, f) => a + f.size, 0));
        load();
      } catch (error) {
        fs.rmSync(tmp, { recursive: true, force: true });
        log('landing pack refresh failed', error?.message || error);
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  return { isDoc, isDocumentScript, serveDoc, serveAsset, noteBackground, refresh, has: () => Boolean(pack) };
}

export = { createLandingPack, DOC_URL, rewrite, docAssets, cssAssets };
