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
    id: "feihuo",
    label: "飞火",
    entry: "https://www.feihuo.com/game/index/slug/xsgs",
    verified: false,
    matches: (url) => /(^|\.)feihuo\.com$/i.test(url.hostname) || isOfficial(url)
  }),
  Object.freeze({
    id: "shunwang",
    label: "顺网",
    entry: "https://sgs.swjoy.com/",
    verified: false,
    matches: (url) => /(^|\.)swjoy\.com$/i.test(url.hostname) || isOfficial(url)
  }),
  Object.freeze({
    id: "2144",
    label: "2144",
    entry: "https://web.2144.cn/hlsgs",
    verified: false,
    matches: (url) => /(^|\.)2144\.cn$/i.test(url.hostname) || isOfficial(url)
  }),
  Object.freeze({
    id: "zixia",
    label: "紫霞",
    entry: "https://game.zixia.com/game-xsgs",
    verified: false,
    matches: (url) => /(^|\.)zixia\.com$/i.test(url.hostname) || isOfficial(url)
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
  Object.freeze({ id: "qq", provider: "qq", label: "WeGame - QQ", mode: "qr", brand: "WeGame" }),
  Object.freeze({ id: "wx", provider: "wx", label: "WeGame - 微信", mode: "qr", brand: "WeGame" }),
  Object.freeze({ id: "bilibili", provider: "bilibili", label: "bilibili 扫码登录", mode: "qr", brand: "哔哩哔哩" }),
  Object.freeze({ id: "steam", provider: "steam", label: "Steam 扫码登录", mode: "qr", brand: "Steam" }),
  Object.freeze({ id: "oppo", provider: "oppo", label: "OPPO 扫码登录", mode: "qr", brand: "OPPO" }),
  Object.freeze({ id: "xiaomi", provider: "xiaomi", label: "小米扫码登录", mode: "qr", brand: "小米" }),
  Object.freeze({ id: "vivo", provider: "vivo", label: "VIVO 扫码登录", mode: "qr", brand: "VIVO" }),
  Object.freeze({ id: "huawei", provider: "huawei", label: "华为扫码登录", mode: "qr", brand: "华为" }),
  Object.freeze({ id: "honor", provider: "honor", label: "荣耀扫码登录", mode: "qr", brand: "荣耀" }),
  Object.freeze({
    id: "steam-web",
    provider: "steam",
    label: "Steam 官方登录（账号密码 / Steam Guard）",
    mode: "browser",
    brand: "Steam",
    page: "https://store.steampowered.com/oauth/login?mobileminimal=1&response_type=token&client_id=6730F3F4&state={state}"
  }),
  Object.freeze({
    id: "oppo-web",
    provider: "oppo",
    label: "OPPO 官方登录（账号密码 / 短信 / 扫码）",
    mode: "browser",
    brand: "OPPO",
    page: "https://id.heytap.com/identity/web/v1/authn/auth-and-callback?bizAppKey=2CcnddQwhZJV3qjNMCzL4S&callback=https%3A%2F%2Fgame-login.heytap.com%2Fgame-union-h5%2Fh5%2Fclient-login%2Findex.html%3Fh5-next%3D1%26actId%3D90000016%26bizType%3Die&language=zh-CN&toRegisterPage=false"
  }),
  Object.freeze({
    id: "xiaomi-web",
    provider: "xiaomi",
    label: "小米官方登录（账号密码 / 短信）",
    mode: "browser",
    brand: "小米",
    page: "https://account.xiaomi.com/oauth2/authorize?client_id=2882303761517516898&response_type=code&scope=1%203&redirect_uri=http%3A%2F%2Fgame.xiaomi.com%2Foauthcallback%2Fmioauth&state={state}&_locale=zh_CN&skip_confirm=false"
  }),
  Object.freeze({
    id: "vivo-web",
    provider: "vivo",
    label: "VIVO 官方登录（账号密码 / 短信 / 扫码）",
    mode: "browser",
    brand: "VIVO",
    page: "https://joint.vivo.com.cn/game-subaccount-login/?from=login"
  })
]);
function entryById(id) {
  return ENTRIES.find((entry) => entry.id === id) || null;
}
function providerById(id) {
  return PROVIDERS.find((provider) => provider.id === id) || null;
}
function providerByLabel(label) {
  return PROVIDERS.find((provider) => provider.label === label) || null;
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
module.exports = { TEST_ORIGIN, ENTRIES, PROVIDERS, entryById, providerById, providerByLabel, matchesAnyEntry, entriesForRenderer, isOfficial };
