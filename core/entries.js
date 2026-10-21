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
  // 4399（作者 10-21）：原入口 wd-home 是 4399 自家微端用的页面，整页写死 1024×753，在壳里只占一小块；改用 4399 三国杀官网（1200 宽、首屏铺满、一将成名与 OL 两个开始游戏）。
  // 官网的开始游戏走普通跳转（新窗口请求由壳载入当前标签）；wd-home 的 app:// 协议照旧保留处理。
  Object.freeze({
    id: "4399",
    label: "4399",
    hostChannel: "4399-new",
    appNavigation: true,
    entry: "https://my.4399.com/yxsgs/",
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
    // 收窄（作者 10-21）：/game/<gid> 是 7K7K 自家门户/详情页（移动 H5，带广告与适龄角标），不是游戏画布。
    // 把它排除出游戏匹配，归为落地页走缩放/滚动/减法管线；真正的游戏画布（7K7K 其余路径或官方 /x|10|10th/pc）仍算游戏页。游戏画布路径未实机核实，待运行时验收。
    matches: (url) => /(^|\.)7k7k\.com$/i.test(url.hostname) && !/^\/game(?:\/|$)/i.test(url.pathname) || isOfficial(url)
  }),
  // 百度（作者 10-21）：原入口 /game?gameId= 就是游戏页本身（空页＋游戏 iframe，要登录才填），关掉登录框就一直空着；
  // 改用详情落地页 /gamedetail（「三国杀：一将成名-百度页游中心」：登录、选区进入游戏、公告）。游戏页只认 /game 这一个路径，落地页不注入。
  Object.freeze({
    id: "baidu",
    label: "百度",
    entry: "https://wan.baidu.com/gamedetail?gameId=19793616",
    verified: false,
    matches: (url) => /(^|\.)wan\.baidu\.com$/i.test(url.hostname) && url.pathname === "/game" && /gameId=19793616/.test(url.search) || isOfficial(url)
  }),
  // 360（作者 10-21）：game_login.php 未登录时跳回门户首页 index.html；原来整个域名都算游戏页，锦囊袋被注进了门户首页。
  // 入口不变（已登录直接进游戏、未登录落到门户），游戏页只认 /game_login.php。
  Object.freeze({
    id: "360",
    label: "360",
    entry: "https://sgsszn.wan.360.cn/game_login.php",
    verified: false,
    matches: (url) => /(^|\.)sgsszn\.wan\.360\.cn$/i.test(url.hostname) && url.pathname === "/game_login.php" || isOfficial(url)
  })
]);
const PROVIDERS = Object.freeze([
  Object.freeze({ id: "qq", label: "WeGame - QQ" }),
  Object.freeze({ id: "wx", label: "WeGame - 微信" }),
  Object.freeze({ id: "bilibili", label: "bilibili 扫码登录" }),
  // 标题处一律写小写「bilibili」（作者 10-21 定）
  Object.freeze({ id: "steam", label: "Steam 扫码登录" }),
  Object.freeze({ id: "oppo", label: "OPPO 扫码登录" }),
  Object.freeze({ id: "xiaomi", label: "小米扫码登录" }),
  Object.freeze({ id: "vivo", label: "VIVO 扫码登录" }),
  Object.freeze({ id: "huawei", label: "华为扫码登录" }),
  Object.freeze({ id: "honor", label: "荣耀扫码登录" })
]);
const LANDING_TRIM = {
  "web.sanguosha.com": ".down-banner,.game12-tips{display:none!important}",
  "my.4399.com": ".wg-ad{display:none!important}"
};
function landingTrimCss(hostname) {
  return LANDING_TRIM[String(hostname || "").toLowerCase()] || "";
}
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
module.exports = { TEST_ORIGIN, ENTRIES, PROVIDERS, entryById, providerById, matchesAnyEntry, entriesForRenderer, isOfficial, landingTrimCss };
