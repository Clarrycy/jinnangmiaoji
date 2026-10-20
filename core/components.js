// 由 src/core/components.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const OFFICIAL_ORIGIN = "https://web.sanguosha.com";
function isOfficialGamePath(url) {
  return /(^|\.)sanguosha\.com$/i.test(url.hostname) && /\/(?:x|10|10th)\/pc(?:\/|$)/i.test(url.pathname);
}
const COMPONENTS = Object.freeze([
  Object.freeze({
    id: "daxiaochao",
    label: "小抄",
    file: "daxiaochao.user.js",
    // 小抄只跟随游戏主 frame；@grant none，不需要 GM 桥。
    frame: "game",
    gm: false,
    matches(url, channelMatches) {
      return typeof channelMatches === "function" ? channelMatches(url) : isOfficialGamePath(url);
    }
  }),
  Object.freeze({
    id: "unified-login",
    label: "统一登录器",
    file: "unified-login.user.js",
    // 脚本自带 @noframes，并在非官方源或子 frame 时自行退出；这里按其 @match 收口。
    frame: "main",
    gm: true,
    matches(url) {
      if (url.origin !== OFFICIAL_ORIGIN) return false;
      const p = url.pathname;
      return p === "/login/index.html" || p === "/login/x/index" || p === "/10/pc/index.php" || p === "/10/pc/bilibiliWD_index.php";
    }
  })
]);
function componentById(id) {
  return COMPONENTS.find((component) => component.id === id) || null;
}
function parseUserScriptHeader(code) {
  const header = String(code || "").split("// ==/UserScript==", 1)[0];
  const version = header.match(/^\/\/\s*@version\s+(\S+)\s*$/m)?.[1] || "";
  const connect = [];
  for (const match of header.matchAll(/^\/\/\s*@connect\s+(\S+)\s*$/gm)) connect.push(match[1].toLowerCase());
  const name = header.match(/^\/\/\s*@name\s+(.+?)\s*$/m)?.[1] || "";
  return { name, version, connect };
}
module.exports = { COMPONENTS, OFFICIAL_ORIGIN, componentById, isOfficialGamePath, parseUserScriptHeader };
