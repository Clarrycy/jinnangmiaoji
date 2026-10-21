'use strict';
// 生成随包的官服登录页种子（core/landing-seed）：文档＋引用的样式脚本图片＋官服网页版背景视频与底图。
// 用法：node scripts/fetch-landing-seed.js。种子只在首次启动、userData 里还没有自己的副本时用；之后由壳在后台刷新。
const path = require('path');
const { createLandingPack } = require('../core/landing-pack.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const get = url => fetch(url, { headers: { 'user-agent': UA, referer: 'https://web.sanguosha.com/', origin: 'https://web.sanguosha.com' } });
(async () => {
  const info = await (await get('https://web-login-api.sanguosha.com/v1_1/background/info')).json();
  const web = info && info.data && info.data['100'] && info.data['100'].web;
  if (!web || !web.mp4 || !web.img) throw new Error('background/info shape changed');
  const dir = path.join(__dirname, '..', 'core', 'landing-seed');
  const pack = createLandingPack({ dir, seedDir: path.join(dir, '.none'), log: (...a) => console.log(...a), fetch: get });
  await pack.refresh(true, { mp4: web.mp4, img: web.img });
  if (!pack.has()) throw new Error('seed not written');
})().catch(e => { console.error(e.message || e); process.exit(1); });
