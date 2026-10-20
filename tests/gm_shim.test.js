const assert = require('assert');
const vm = require('vm');
const { createGmShim, wrapWithGm } = require('../core/gm-shim');

(async () => {
  const sent = [];
  let pending = null;
  const ipcRenderer = {
    sendSync(name, id) { assert.equal(name, 'jnd-gm-store-load'); assert.equal(id, 'unified-login'); return { saved: { id: 'x' } }; },
    send(name, ...args) { sent.push([name, ...args]); },
    invoke(name, componentId, id, request) {
      assert.equal(name, 'jnd-gm-xhr');
      assert.equal(componentId, 'unified-login');
      return new Promise(resolve => { pending = { id, request, resolve }; });
    },
  };
  const shim = createGmShim(ipcRenderer, { id: 'unified-login', label: '统一登录器' }, { name: '统一登录器', version: '0.9.25', shellVersion: '1.4.0' });

  // 存储：启动整份取回；读返回副本；写删送主进程。
  const saved = shim.GM_getValue('saved', null);
  assert.deepEqual(saved, { id: 'x' });
  saved.id = 'mutated';
  assert.equal(shim.GM_getValue('saved').id, 'x');
  assert.equal(shim.GM_getValue('missing', 'fallback'), 'fallback');
  shim.GM_setValue('session', { id: 'y', expires: 1 });
  assert.deepEqual(sent.at(-1), ['jnd-gm-store-set', 'unified-login', 'session', { id: 'y', expires: 1 }]);
  shim.GM_deleteValue('session');
  assert.deepEqual(sent.at(-1), ['jnd-gm-store-delete', 'unified-login', 'session']);
  assert.deepEqual(shim.GM_listValues(), ['saved']);
  assert.equal(shim.GM_info.script.version, '0.9.25');

  // 请求：onload 得到 TM 形状的响应；二进制转 ArrayBuffer；abort 走 onabort 且只回调一次。
  const events = [];
  shim.GM_xmlhttpRequest({ method: 'POST', url: 'https://ssl.ptlogin2.qq.com/x', data: 'a=1', timeout: 5000, context: 'ctx',
    onload: r => events.push(['load', r]), onerror: r => events.push(['error', r]) });
  assert.equal(pending.request.method, 'POST');
  assert.equal(pending.request.data, 'a=1');
  pending.resolve({ kind: 'load', status: 200, statusText: 'OK', responseHeaders: 'set-cookie: a=1', finalUrl: 'https://ssl.ptlogin2.qq.com/y', responseText: 'body' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'load');
  assert.equal(events[0][1].status, 200);
  assert.equal(events[0][1].finalUrl, 'https://ssl.ptlogin2.qq.com/y');
  assert.equal(events[0][1].responseText, 'body');
  assert.equal(events[0][1].context, 'ctx');
  assert.equal(events[0][1].readyState, 4);

  shim.GM_xmlhttpRequest({ url: 'https://ssl.ptlogin2.qq.com/img', responseType: 'arraybuffer', onload: r => events.push(['bin', r]) });
  pending.resolve({ kind: 'load', status: 200, responseHeaders: '', finalUrl: 'https://ssl.ptlogin2.qq.com/img', response: new Uint8Array([137, 80, 78, 71]) });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(events[1][1].response instanceof ArrayBuffer);
  assert.equal(new Uint8Array(events[1][1].response)[0], 137);
  assert.equal(events[1][1].responseText, undefined);

  const handle = shim.GM_xmlhttpRequest({ url: 'https://ssl.ptlogin2.qq.com/slow', onload: r => events.push(['late', r]), onabort: r => events.push(['abort', r]) });
  handle.abort();
  assert.deepEqual(sent.at(-1).slice(0, 1), ['jnd-gm-xhr-abort']);
  pending.resolve({ kind: 'load', status: 200 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(events[2][0], 'abort');
  assert.equal(events.length, 3, 'a settled request never calls back twice');

  shim.GM_xmlhttpRequest({ url: 'https://ssl.ptlogin2.qq.com/t', ontimeout: r => events.push(['timeout', r]), onerror: r => events.push(['error', r]) });
  pending.resolve({ kind: 'timeout', status: 0 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(events[3][0], 'timeout');
  assert.throws(() => shim.GM_xmlhttpRequest({}), /url/);

  // 包装后的脚本在页面环境里能拿到形参，unsafeWindow 即 window。
  const context = { window: null, console };
  context.window = context;
  context.window.__JND_GM_test = shim;
  vm.runInNewContext(wrapWithGm('window.seen = [typeof GM_xmlhttpRequest, GM_getValue("saved").id, unsafeWindow === window, GM_info.script.name];', '__JND_GM_test', 'test.user.js'), context);
  assert.deepEqual(context.seen, ['function', 'x', true, '统一登录器']);
  console.log('gm shim tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
