// 由 src/core/chrome/qr-copy.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const FOOT_EM = 16;
const STEP_EM = 13;
const QR_APP = { "WeGame - QQ": "QQ", "WeGame - 微信": "微信", "bilibili 扫码登录": "bilibili", "Steam 扫码登录": "Steam", "OPPO 扫码登录": "OPPO", "小米扫码登录": "小米", "VIVO 扫码登录": "VIVO", "华为扫码登录": "华为", "荣耀扫码登录": "荣耀" };
const RETRY_ACTION = "重新获取二维码";
const REASON = {
  QR_EXPIRED: "二维码已过期",
  ATTEMPT_EXPIRED: "二维码已过期",
  // 尝试期限用完：只由 expiryTimer 报，真机都发生在等扫码阶段
  OPPO_QR_CANCELED: "手机端已取消登录",
  LOGIN_CANCELLED: "手机端已取消登录",
  // OPPO CANCELED_LOGIN／CANCELED_AUTHORIZE；vivo 15022
  QQ_REJECTED_68: "手机端已取消登录",
  WX_REJECTED_403: "手机端已取消登录",
  // 按腾讯接口惯例，待一次真机验证
  REQUEST_TIMEOUT: "连接超时",
  NETWORK_ERROR: "网络连接失败",
  OPPO_TE_UNAVAILABLE: "登录环境校验失败",
  OPPO_IDENTIFY_TIMEOUT: "安全验证超时",
  OPPO_CAPTCHA_TIMEOUT: "安全验证超时",
  OPPO_IDENTIFY_CLOSED: "已关闭安全验证",
  OPPO_CAPTCHA_CANCELLED: "已关闭安全验证",
  OPPO_CAPTCHA_LOADFAIL: "安全验证加载失败",
  OPPO_CAPTCHA_SDK_UNAVAILABLE: "安全验证加载失败",
  OPPO_IDENTIFY_NO_TICKET: "安全验证加载失败",
  VIVO_REAL_NAME_REQUIRED: "账号未实名认证",
  // 未成年／强制原生、人脸核验与账号保护、补全资料、华为授权范围、Steam 协议、小米绑定：要在对方官方应用里处理，重扫无用
  VIVO_NATIVE_CONFIRMATION_REQUIRED: "需在官方应用中确认",
  NATIVE_CONFIRMATION_REQUIRED: "需在官方应用中确认",
  OPPO_GAME_ACCOUNT_CONFIRMATION_REQUIRED: "需在官方应用中确认",
  OPPO_COMPLETION_REQUIRED: "需在官方应用中确认",
  HUAWEI_SCOPE_CONFIRMATION_REQUIRED: "需在官方应用中确认",
  STEAM_AGREEMENT_REQUIRED: "需在官方应用中确认",
  XIAOMI_ACCOUNT_BINDING_REQUIRED: "需在官方应用中确认",
  VIVO_ACCOUNT_SELECTION_REQUIRED: "暂不支持多个游戏账号",
  OPPO_GAME_ACCOUNT_SELECTION_REQUIRED: "暂不支持多个游戏账号",
  // 见 ideas.md H08
  VIVO_ACCOUNT_UNAVAILABLE: "账号已冻结或受限",
  BILI_ACCOUNT_RESTRICTED: "账号已冻结或受限",
  ACCOUNT_MISMATCH: "扫码账号与原账号不同"
};
const BROKEN = /_CHANGED$|_UNAVAILABLE$|_INVALID$|_INVALID_JSON$|_MISMATCH$|_MISSING$|_DENIED$|_ENCODING_FAILED$|^INVALID_JSON$|^REDIRECT_|_TOO_LARGE$|^WEB_LOCK/;
function reason(code = "") {
  if (REASON[code]) return REASON[code];
  if (/_QR_EXPIRED$/.test(code)) return REASON.QR_EXPIRED;
  if (/^ERR_|NETWORK/.test(code)) return REASON.NETWORK_ERROR;
  if (/^HTTP_5\d\d$/.test(code)) return "平台服务器繁忙";
  if (/^HTTP_4\d\d$|_REJECTED|^STEAM_RESULT_|^OPPO_QR_STATUS_/.test(code)) return "平台拒绝了本次登录";
  if (BROKEN.test(code)) return "该方式暂时不可用";
  return "登录未完成";
}
function textWidth(text) {
  let w = 0;
  for (const ch of text) w += /[⺀-鿿　-〿＀-￯‘’“”]/.test(ch) ? 1 : 0.6;
  return w;
}
function qrSteps(m) {
  const app = QR_APP[m.provider] || m.provider.replace(/ ?扫码登录$/, "");
  const sp = /^[A-Za-z]/.test(app) ? ` ${app} ` : app;
  const oppo = m.provider === "OPPO 扫码登录";
  const steps = oppo ? ["打开 OPPO 应用商城", "“我的账号” - 扫一扫", "进入游戏"] : [`用手机${sp}扫码`, "在手机上确认登录", "进入游戏"];
  if (m.stage === "loading") return { steps, state: ["wait", "wait", "wait"], foot: "正在获取二维码" };
  if (m.stage === "retrying") return { steps, state: ["wait", "wait", "wait"], foot: m.retry ? `网络连接失败，正在重试（${m.retry}/3）` : "网络连接失败，正在重试" };
  if (m.stage === "scan") return { steps, state: ["cur", "wait", "wait"], foot: "" };
  if (m.stage === "confirm") return { steps, state: ["done", "cur", "wait"], foot: oppo ? "请在手机上确认登录" : "" };
  if (m.stage === "verify") return { steps, state: ["done", "done", "busy"], foot: "正在风控校验中" };
  if (m.stage === "exchanging") return { steps, state: ["done", "done", "busy"], foot: "已收到授权结果，账号校验中" };
  if (m.stage === "entering") return { steps, state: ["done", "done", "busy"], foot: "正在登录游戏" };
  if (m.stage === "error") return { steps, state: ["cur", "wait", "wait"], foot: m.provider === "Steam 扫码登录" && /^(?:NETWORK_ERROR|REQUEST_TIMEOUT)$|^ERR_|NETWORK/.test(m.code || "") ? "无法连接 Steam" : reason(m.code) };
  return { steps, state: ["wait", "wait", "wait"], foot: "" };
}
module.exports = { qrSteps, reason, textWidth, QR_APP, REASON, FOOT_EM, STEP_EM, RETRY_ACTION };
