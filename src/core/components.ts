'use strict';
// 微端随包组件表：主进程用它建立更新宿主，preload 用它决定在哪些页面注入。
// 锦囊袋 runtime 不在这里，它走 node-update-host 与 panel_update.js 的既有合同。
// 组件代码本身来自种子或已校验缓存，这里只描述身份、注入位置与 GM 需求。

const OFFICIAL_ORIGIN = 'https://web.sanguosha.com';

function isOfficialGamePath(url) {
  return /(^|\.)sanguosha\.com$/i.test(url.hostname) && /\/(?:x|10|10th)\/pc(?:\/|$)/i.test(url.pathname);
}

// 统一登录器需要同时跟随官方登录页、渠道回调页和游戏页；这里与载荷头部 @match 保持一致。
function isUnifiedLoginPage(url) {
  if (url.origin === OFFICIAL_ORIGIN) {
    const p = url.pathname;
    return p === '/login/index.html' || p === '/login/x/index'
      || p === '/x/pc/index.php' || p === '/10/pc/index.php' || p === '/10/pc/bilibiliWD_index.php';
  }
  if (url.protocol === 'https:' && url.hostname === 'passport.vivo.com.cn') return true;
  if (url.protocol === 'https:' && url.hostname === 'joint.vivo.com.cn') {
    return url.pathname.startsWith('/game-subaccount-login/');
  }
  if (url.protocol === 'https:' && url.hostname === 'game-login.heytap.com') {
    return url.pathname.startsWith('/game-union-h5/h5/client-login/');
  }
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === 'game.xiaomi.com') {
    return url.pathname.startsWith('/oauthcallback/mioauth');
  }
  return url.protocol === 'https:' && url.hostname === '10th-ly-login.sanguosha.com'
    && url.pathname === '/steam/oauth/callback.html';
}

const COMPONENTS = Object.freeze([
  Object.freeze({
    id: 'daxiaochao',
    label: '小抄',
    file: 'daxiaochao.user.js',
    // 小抄只跟随游戏主 frame；@grant none，不需要 GM 桥。
    frame: 'game',
    gm: false,
    matches(url, channelMatches) {
      return typeof channelMatches === 'function' ? channelMatches(url) : isOfficialGamePath(url);
    },
  }),
  Object.freeze({
    id: 'unified-login',
    label: '统一登录器',
    file: 'unified-login.user.js',
    // 脚本自带 @noframes，并在非官方源或子 frame 时自行退出；这里按其 @match 收口。
    frame: 'main',
    gm: true,
    matches: isUnifiedLoginPage,
  }),
]);

function componentById(id) {
  return COMPONENTS.find(component => component.id === id) || null;
}

// 解析 userscript 头部：@version 与 @connect 列表（GM 请求域名白名单来源）。
function parseUserScriptHeader(code) {
  const header = String(code || '').split('// ==/UserScript==', 1)[0];
  const version = header.match(/^\/\/\s*@version\s+(\S+)\s*$/m)?.[1] || '';
  const connect = [];
  for (const match of header.matchAll(/^\/\/\s*@connect\s+(\S+)\s*$/gm)) connect.push(match[1].toLowerCase());
  const name = header.match(/^\/\/\s*@name\s+(.+?)\s*$/m)?.[1] || '';
  return { name, version, connect };
}

export = { COMPONENTS, OFFICIAL_ORIGIN, componentById, isOfficialGamePath, isUnifiedLoginPage, parseUserScriptHeader };
