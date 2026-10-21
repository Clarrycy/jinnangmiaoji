// 由 src/core/landing-pack.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DOC_URL = "https://web.sanguosha.com/login/x/index";
const STATIC_HOSTS = /^https:\/\/(web|wwwoss)\.sanguosha\.com\//i;
const REFRESH_EVERY = 6 * 3600 * 1e3;
const bytes = (b) => new Uint8Array(b.buffer, b.byteOffset, b.length);
const fileName = (url) => crypto.createHash("sha1").update(url).digest("hex") + (path.extname(new URL(url).pathname).toLowerCase().replace(/[^.a-z0-9]/g, "") || "");
function readManifest(dir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    return m && m.version === 1 && m.html ? m : null;
  } catch (_) {
    return null;
  }
}
function docAssets(html) {
  const out = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="(https:\/\/web\.sanguosha\.com\/[^"#?]+\.(?:css|js|png|jpe?g|ico))"/gi)) out.add(m[1]);
  return [...out];
}
function cssAssets(css, base) {
  const out = /* @__PURE__ */ new Set();
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) {
    if (/^data:/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], base);
      if (STATIC_HOSTS.test(u.href)) out.add(u.origin + u.pathname);
    } catch (_) {
    }
  }
  return [...out];
}
function rewrite(html, bg) {
  let out = html.replace(/<script id="sgsCensus" src=/, '<script id="sgsCensus" async src=');
  if (bg && /^https:\/\//.test(bg.mp4) && /^https:\/\//.test(bg.img)) {
    const attr = (s) => s.replace(/["<>&]/g, "");
    out = out.replace('<div class="video-bg" id="sgsVideoImg">', `<div class="video-bg" id="sgsVideoImg" style="background-image:url(${attr(bg.img)})">`).replace(/(<video class="bg-ani" id="sgsBgVideo"[^>]*?) src="###"/, `$1 src="${attr(bg.mp4)}"`).replace("</video>", '</video><script>(function(){var v=document.getElementById("sgsBgVideo");if(!v)return;var s=v.setAttribute;v.setAttribute=function(n,x){if(n==="src"&&this.getAttribute("src")===x)return;return s.apply(this,arguments)};})();</script>');
  }
  return out;
}
function createLandingPack(opts) {
  const { dir, seedDir, log } = opts;
  let pack = null;
  function load() {
    const own = readManifest(dir), seed = readManifest(seedDir);
    pack = own && (!seed || own.fetchedAt >= seed.fetchedAt) ? { dir, m: own } : seed ? { dir: seedDir, m: seed } : null;
    log("landing pack", pack ? `from=${pack.dir === dir ? "userData" : "seed"} files=${Object.keys(pack.m.files).length} fetched=${new Date(pack.m.fetchedAt).toISOString()} bg=${pack.m.bg ? "yes" : "no"}` : "none");
  }
  load();
  function isDoc(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname === DOC_URL;
    } catch (_) {
      return false;
    }
  }
  function serveDoc() {
    if (!pack) return null;
    return new Response(rewrite(pack.m.html, pack.m.bg), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  function serveAsset(url, range) {
    if (!pack) return null;
    const entry = pack.m.files[url.split(/[?#]/)[0]];
    if (!entry) return null;
    let data;
    try {
      data = fs.readFileSync(path.join(pack.dir, "files", entry.name));
    } catch (_) {
      return null;
    }
    const headers = { "content-type": entry.type, "accept-ranges": "bytes", "access-control-allow-origin": "*", "cache-control": "max-age=31536000" };
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : data.length - Number(m[2]);
      let end = m[1] && m[2] ? Number(m[2]) : data.length - 1;
      start = Math.max(0, start);
      end = Math.min(end, data.length - 1);
      if (start > end) return new Response("", { status: 416, headers: { "content-range": `bytes */${data.length}` } });
      return new Response(bytes(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${data.length}`, "content-length": String(end - start + 1) } });
    }
    return new Response(bytes(data), { status: 200, headers: { ...headers, "content-length": String(data.length) } });
  }
  function noteBackground(bg) {
    if (!pack || !bg || !STATIC_HOSTS.test(String(bg.mp4)) || !STATIC_HOSTS.test(String(bg.img))) return;
    const cur = pack.m.bg;
    if (cur && cur.mp4 === bg.mp4 && cur.img === bg.img) return;
    log("landing pack background changed", String(bg.mp4).slice(-40), String(bg.img).slice(-40));
    pendingBg = { mp4: String(bg.mp4), img: String(bg.img) };
    refresh(true);
  }
  let pendingBg = null, refreshing = null, lastTry = 0;
  async function download(url, into, files, reuse) {
    const old = reuse?.files[url];
    if (old) {
      try {
        const src = path.join(pack.dir, "files", old.name);
        fs.copyFileSync(src, path.join(into, old.name));
        files[url] = old;
        return;
      } catch (_) {
      }
    }
    const r = await opts.fetch(url);
    if (!r.ok) throw new Error(`HTTP_${r.status} ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const name = fileName(url);
    fs.writeFileSync(path.join(into, name), buf);
    files[url] = { name, type: (r.headers.get("content-type") || "application/octet-stream").split(";")[0], size: buf.length };
  }
  function refresh(force = false, seedBg = null) {
    if (refreshing) return refreshing;
    if (!force && Date.now() - lastTry < REFRESH_EVERY) return Promise.resolve();
    lastTry = Date.now();
    refreshing = (async () => {
      const tmp = `${dir}.tmp-${process.pid}`;
      try {
        const r = await opts.fetch(DOC_URL);
        if (!r.ok) throw new Error(`doc HTTP_${r.status}`);
        const html = Buffer.from(await r.arrayBuffer()).toString("utf8");
        const etag = r.headers.get("etag") || "";
        if (!/id="sgsBgVideo"/.test(html) || !/sgslogin-sdk/.test(html)) throw new Error("doc shape changed");
        const bg = pendingBg || pack?.m.bg || seedBg || null;
        pendingBg = null;
        if (pack && pack.m.html === html && JSON.stringify(pack.m.bg) === JSON.stringify(bg)) {
          log("landing pack up to date");
          return;
        }
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(path.join(tmp, "files"), { recursive: true });
        const files = {};
        const queue = docAssets(html);
        if (bg) queue.push(bg.mp4, bg.img);
        for (let i = 0; i < queue.length; i++) {
          const url = queue[i];
          if (files[url]) continue;
          await download(url, path.join(tmp, "files"), files, pack?.m || null);
          if (/\.css$/i.test(url)) {
            for (const extra of cssAssets(fs.readFileSync(path.join(tmp, "files", files[url].name), "utf8"), url)) if (!queue.includes(extra)) queue.push(extra);
          }
        }
        const m = { version: 1, docUrl: DOC_URL, etag, html, fetchedAt: Date.now(), bg, files };
        fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify(m));
        fs.rmSync(dir, { recursive: true, force: true });
        fs.renameSync(tmp, dir);
        log("landing pack refreshed files=", Object.keys(files).length, "bytes=", Object.values(files).reduce((a, f) => a + f.size, 0));
        load();
      } catch (error) {
        fs.rmSync(tmp, { recursive: true, force: true });
        log("landing pack refresh failed", error?.message || error);
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }
  return { isDoc, serveDoc, serveAsset, noteBackground, refresh, has: () => Boolean(pack) };
}
module.exports = { createLandingPack, DOC_URL, rewrite, docAssets, cssAssets };
