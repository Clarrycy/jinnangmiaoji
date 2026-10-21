'use strict';
// 扫码卡的全部文案：引擎与测试共用这一份。
// 版式预算（作者 10-21：说明文字任何情况都不换行）：左栏宽 200px（卡 480 − 内边距 2×24 − 舞台 208 − 间距 24）。
// 底部状态行 12px 字，一行最多 16 个汉字宽；步骤行 13px 字、减去 18 的标记和 10 的间距剩 172px，最多 13 个汉字宽。
// 只写一行能放下的句子，不靠 \n、不靠省略号截断；tests/micro_components.test.js 逐条量宽度。
// 文案均为草稿，等作者审定；「正在风控校验中」是作者 10-20 原话。

type QrStage = 'loading' | 'retrying' | 'scan' | 'confirm' | 'verify' | 'exchanging' | 'entering' | 'error' | 'yield';
type QrCopyInput = { provider: string; stage: QrStage; code?: string; retry?: number };
type StepState = 'done' | 'cur' | 'wait' | 'busy';

const FOOT_EM = 16;
const STEP_EM = 13;

// 步骤里「用手机 X 扫码」的 X：扫码用的那个手机应用
const QR_APP: Record<string, string> = { 'WeGame - QQ': 'QQ', 'WeGame - 微信': '微信', 'bilibili 扫码登录': 'bilibili', 'Steam 扫码登录': 'Steam', 'OPPO 扫码登录': 'OPPO', '小米扫码登录': '小米', 'VIVO 扫码登录': 'VIVO', '华为扫码登录': '华为', '荣耀扫码登录': '荣耀' };

// 出错时：状态行只写短原因，重试是卡上一个真按钮（作者 10-21：原来底行提示点码＋码上光秃刷新标识，不优雅）。
// 原因按统一登录器的错误码给，归类规则与登录器 humanError 相同，只是更短。
const RETRY_ACTION = '重新获取二维码';
// 出错原因（作者 10-21 认可的整表；按「玩家该知道什么」归类，统一登录器约 190 个错误码先精确对照、再按码名归类）。
// 每句只给真正是这个意思的码：码名带 REJECTED 的多半是服务器拒绝，不能说成手机端取消。
const REASON: Record<string, string> = {
  QR_EXPIRED: '二维码已过期', ATTEMPT_EXPIRED: '二维码已过期', // 尝试期限用完：只由 expiryTimer 报，真机都发生在等扫码阶段
  OPPO_QR_CANCELED: '手机端已取消登录', LOGIN_CANCELLED: '手机端已取消登录', // OPPO CANCELED_LOGIN／CANCELED_AUTHORIZE；vivo 15022
  QQ_REJECTED_68: '手机端已取消登录', WX_REJECTED_403: '手机端已取消登录', // 按腾讯接口惯例，待一次真机验证
  REQUEST_TIMEOUT: '连接超时',
  NETWORK_ERROR: '网络连接失败',
  OPPO_TE_UNAVAILABLE: '登录环境校验失败',
  OPPO_IDENTIFY_TIMEOUT: '安全验证超时', OPPO_CAPTCHA_TIMEOUT: '安全验证超时',
  OPPO_IDENTIFY_CLOSED: '已关闭安全验证', OPPO_CAPTCHA_CANCELLED: '已关闭安全验证',
  OPPO_CAPTCHA_LOADFAIL: '安全验证加载失败', OPPO_CAPTCHA_SDK_UNAVAILABLE: '安全验证加载失败', OPPO_IDENTIFY_NO_TICKET: '安全验证加载失败',
  VIVO_REAL_NAME_REQUIRED: '账号未实名认证',
  // 未成年／强制原生、人脸核验与账号保护、补全资料、华为授权范围、Steam 协议、小米绑定：要在对方官方应用里处理，重扫无用
  VIVO_NATIVE_CONFIRMATION_REQUIRED: '需在官方应用中确认', NATIVE_CONFIRMATION_REQUIRED: '需在官方应用中确认',
  OPPO_GAME_ACCOUNT_CONFIRMATION_REQUIRED: '需在官方应用中确认', OPPO_COMPLETION_REQUIRED: '需在官方应用中确认',
  HUAWEI_SCOPE_CONFIRMATION_REQUIRED: '需在官方应用中确认', STEAM_AGREEMENT_REQUIRED: '需在官方应用中确认',
  XIAOMI_ACCOUNT_BINDING_REQUIRED: '需在官方应用中确认',
  VIVO_ACCOUNT_SELECTION_REQUIRED: '暂不支持多个游戏账号', OPPO_GAME_ACCOUNT_SELECTION_REQUIRED: '暂不支持多个游戏账号', // 见 ideas.md H08
  VIVO_ACCOUNT_UNAVAILABLE: '账号已冻结或受限', BILI_ACCOUNT_RESTRICTED: '账号已冻结或受限',
  ACCOUNT_MISMATCH: '扫码账号与原账号不同',
};
// 官方接口改版类：结构／页面变了、能力缺失、目标或状态对不上、地址被拦——重扫无用，要我们修
const BROKEN = /_CHANGED$|_UNAVAILABLE$|_INVALID$|_INVALID_JSON$|_MISMATCH$|_MISSING$|_DENIED$|_ENCODING_FAILED$|^INVALID_JSON$|^REDIRECT_|_TOO_LARGE$|^WEB_LOCK/;
function reason(code = ''): string {
  if (REASON[code]) return REASON[code];
  if (/_QR_EXPIRED$/.test(code)) return REASON.QR_EXPIRED; // QQ 65、微信 402、bilibili 122023
  if (/^ERR_|NETWORK/.test(code)) return REASON.NETWORK_ERROR;
  if (/^HTTP_5\d\d$/.test(code)) return '平台服务器繁忙';
  if (/^HTTP_4\d\d$|_REJECTED|^STEAM_RESULT_|^OPPO_QR_STATUS_/.test(code)) return '平台拒绝了本次登录';
  if (BROKEN.test(code)) return '该方式暂时不可用'; // 含壳自己的 LOGIN_BRIDGE_UNAVAILABLE（作者 10-21 改字）
  return '登录未完成';
}

// 量宽度用的近似：汉字与全角标点按 1 个字宽，ASCII 按 0.6
function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[⺀-鿿　-〿＀-￯‘’“”]/.test(ch) ? 1 : 0.6;
  return w;
}

// 三步固定，阶段只换标记；底部一行说眼下的状态，扫码阶段留空
function qrSteps(m: QrCopyInput): { steps: [string, string, string]; state: StepState[]; foot: string } {
  const app = QR_APP[m.provider] || m.provider.replace(/ ?扫码登录$/, '');
  const sp = /^[A-Za-z]/.test(app) ? ` ${app} ` : app;
  const oppo = m.provider === 'OPPO 扫码登录';
  const steps: [string, string, string] = oppo
    ? ['打开 OPPO 应用商城', '“我的账号” - 扫一扫', '进入游戏']
    : [`用手机${sp}扫码`, '在手机上确认登录', '进入游戏'];
  if (m.stage === 'loading') return { steps, state: ['wait', 'wait', 'wait'], foot: '正在获取二维码' };
  if (m.stage === 'retrying') return { steps, state: ['wait', 'wait', 'wait'], foot: m.retry ? `网络连接失败，正在重试（${m.retry}/3）` : '网络连接失败，正在重试' };
  if (m.stage === 'scan') return { steps, state: ['cur', 'wait', 'wait'], foot: '' };
  if (m.stage === 'confirm') return { steps, state: ['done', 'cur', 'wait'], foot: oppo ? '请在手机上确认登录' : '' };
  if (m.stage === 'verify') return { steps, state: ['done', 'done', 'busy'], foot: '正在风控校验中' };
  if (m.stage === 'exchanging') return { steps, state: ['done', 'done', 'busy'], foot: '已收到授权结果，账号校验中' };
  if (m.stage === 'entering') return { steps, state: ['done', 'done', 'busy'], foot: '正在登录游戏' };
  // Steam 的网络类失败几乎都是连不上 steamcommunity.com（大陆普遍不通，加速器没覆盖本程序时也一样）：说准是 Steam（作者 10-21 认可）
  if (m.stage === 'error') return { steps, state: ['cur', 'wait', 'wait'], foot: m.provider === 'Steam 扫码登录' && /^(?:NETWORK_ERROR|REQUEST_TIMEOUT)$|^ERR_|NETWORK/.test(m.code || '') ? '无法连接 Steam' : reason(m.code) };
  return { steps, state: ['wait', 'wait', 'wait'], foot: '' };
}

export = { qrSteps, reason, textWidth, QR_APP, REASON, FOOT_EM, STEP_EM, RETRY_ACTION };
