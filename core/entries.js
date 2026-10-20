// 由 src/core/entries.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const isOfficial = (url) => /(^|\.)sanguosha\.com$/i.test(url.hostname) && /\/(?:x|10|10th)\/pc(?:\/|$)/i.test(url.pathname);
const ENTRIES = Object.freeze([
  Object.freeze({
    id: "guanfu",
    label: "官服",
    hostChannel: "official-new",
    entry: "https://web.sanguosha.com/login/x/index",
    verified: true,
    matches: isOfficial
  }),
  Object.freeze({
    id: "4399",
    label: "4399",
    hostChannel: "4399-new",
    appNavigation: true,
    entry: "https://my.4399.com/yxxsgs/wd-home",
    verified: true,
    matches: (url) => /(^|\.)(?:4399iw\d*|iwan4399)\.com$/i.test(url.hostname) && /\/yxxsgs(?:\/|$)/i.test(url.pathname) || isOfficial(url)
  }),
  Object.freeze({
    id: "qqgame",
    label: "QQ 大厅",
    entry: "https://qqgame.qq.com/webappframe/?appid=10951",
    verified: false,
    matches: (url) => /(^|\.)qqopenapp\.com$/i.test(url.hostname) && /\/pc\/qqLobby_index\.php/i.test(url.pathname)
  }),
  Object.freeze({
    id: "7k7k",
    label: "7K7K",
    entry: "https://h5.7k7k.com/game/960982bec2f555de44ea43ca8a7ef418",
    verified: false,
    // 原 web/H5GAMES.html 包装页在没有 7K7K 登录 cookie 时跳 /mb/.html 必 404；游戏页本身自带登录
    matches: (url) => /(^|\.)7k7k\.com$/i.test(url.hostname) || isOfficial(url)
  }),
  Object.freeze({
    id: "baidu",
    label: "百度",
    entry: "https://wan.baidu.com/game?gameId=19793616",
    verified: false,
    matches: (url) => /(^|\.)wan\.baidu\.com$/i.test(url.hostname) && /gameId=19793616/.test(url.search) || isOfficial(url)
  }),
  Object.freeze({
    id: "360",
    label: "360",
    entry: "https://sgsszn.wan.360.cn/game_login.php",
    verified: false,
    matches: (url) => /(^|\.)sgsszn\.wan\.360\.cn$/i.test(url.hostname) || isOfficial(url)
  })
]);
const PROVIDERS = Object.freeze([
  Object.freeze({ id: "qq", label: "WeGame - QQ" }),
  Object.freeze({ id: "wx", label: "WeGame - 微信" }),
  Object.freeze({ id: "bilibili", label: "bilibili 扫码登录" }),
  Object.freeze({ id: "steam", label: "Steam 扫码登录" }),
  Object.freeze({ id: "oppo", label: "OPPO 扫码登录" }),
  Object.freeze({ id: "xiaomi", label: "小米扫码登录" }),
  Object.freeze({ id: "vivo", label: "VIVO 扫码登录" }),
  Object.freeze({ id: "huawei", label: "华为扫码登录" }),
  Object.freeze({ id: "honor", label: "荣耀扫码登录" })
]);
function entryById(id) {
  return ENTRIES.find((entry) => entry.id === id) || null;
}
function providerById(id) {
  return PROVIDERS.find((provider) => provider.id === id) || null;
}
const TEST_ORIGIN = String(process.env.JND_MICRO_TEST_ORIGIN || "");
function matchesAnyEntry(url) {
  if (TEST_ORIGIN && url.origin === TEST_ORIGIN) return /\/x\/pc(?:\/|$)/.test(url.pathname);
  return ENTRIES.some((entry) => {
    try {
      return entry.matches(url);
    } catch (_) {
      return false;
    }
  });
}
function entriesForRenderer() {
  return ENTRIES.map(({ id, label, verified, hostChannel }) => ({ id, label, verified, hostChannel: hostChannel || id }));
}
module.exports = { TEST_ORIGIN, ENTRIES, PROVIDERS, entryById, providerById, matchesAnyEntry, entriesForRenderer, isOfficial };
