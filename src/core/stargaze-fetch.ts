import https = require('https');

const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export type FetchResponse = {
  status: number;
  url?: string;
  text: string;
  etag?: string;
  lastModified?: string;
  bytes?: number;
};

export type ReportFetcher = (
  url: string,
  options?: { etag?: string; lastModified?: string; signal?: AbortSignal },
) => Promise<FetchResponse>;

type RawResponse = FetchResponse & { location: string };

function requestOnce(target: URL, headers: Record<string, string>, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const request = https.request(target, { method: 'GET', headers, signal }, response => {
      const status = Number(response.statusCode) || 0;
      const common = {
        status,
        url: target.toString(),
        text: '',
        etag: String(response.headers.etag || ''),
        lastModified: String(response.headers['last-modified'] || ''),
        bytes: 0,
        location: String(response.headers.location || ''),
      };
      if (REDIRECT_STATUS.has(status)) {
        response.resume();
        finish(resolve, common);
        return;
      }
      if (status !== 200) {
        response.resume();
        finish(resolve, common);
        return;
      }
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        response.resume();
        finish(reject, new Error('报告响应不是 HTML'));
        return;
      }
      const declaredLength = Number(response.headers['content-length'] || 0);
      if (declaredLength > MAX_REPORT_BYTES) {
        response.resume();
        finish(reject, new Error('报告超过 4 MB 大小限制'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_REPORT_BYTES) {
          response.destroy();
          request.destroy();
          finish(reject, new Error('报告超过 4 MB 大小限制'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish(resolve, { ...common, text: Buffer.concat(chunks).toString('utf8'), bytes: size }));
      response.on('error', error => finish(reject, error));
      response.on('aborted', () => finish(reject, new Error('连接中断')));
    });
    request.on('error', error => finish(reject, error));
    request.end();
  });
}

// 报告页部署在 Cloudflare 后，Electron 的 net.fetch 会被浏览器挑战拦成 403；Node HTTPS 仍能取得静态报告。
// 这里不执行页面脚本，只读取公开 HTML，因此不使用隐藏窗口，也不会把云端的挑战脚本带进微端。
export function createReportFetch(): ReportFetcher {
  return async function fetchReport(url: string, options: { etag?: string; lastModified?: string; signal?: AbortSignal } = {}) {
    let current: URL;
    try { current = new URL(String(url)); }
    catch (_) { throw new Error('报告地址无效'); }
    if (current.protocol !== 'https:') throw new Error('报告地址必须使用 HTTPS');

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const headers: Record<string, string> = {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Accept-Encoding': 'identity',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Jinnangdai-Stargaze/1.0',
    };
    if (options.etag) headers['If-None-Match'] = options.etag;
    if (options.lastModified) headers['If-Modified-Since'] = options.lastModified;

    try {
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        if (current.protocol !== 'https:') throw new Error('报告地址被重定向到非 HTTPS 地址');
        const response = await requestOnce(current, headers, controller.signal);
        if (REDIRECT_STATUS.has(response.status)) {
          if (!response.location) throw new Error(`HTTP ${response.status} 缺少重定向地址`);
          if (redirects === MAX_REDIRECTS) throw new Error('报告地址重定向次数过多');
          current = new URL(response.location, current);
          continue;
        }
        if (response.status === 304) {
          return {
            status: 304,
            url: current.toString(),
            text: '',
            etag: options.etag || '',
            lastModified: options.lastModified || '',
            bytes: 0,
          };
        }
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return response;
      }
      throw new Error('报告地址重定向次数过多');
    } catch (error: any) {
      if (timedOut) throw new Error('请求超时');
      if (options.signal?.aborted) throw new Error('检查已取消');
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    }
  };
}
