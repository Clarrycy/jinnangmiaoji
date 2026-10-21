import https = require('https');
import tls = require('tls');
import dns = require('dns');
import net = require('net');
import fs = require('fs');

// Adapted from the supplied 20261021 v4 package (app.asar SHA-256
// 3b2047ff55361883130472e6aa9a11fb8c5be09aaad0201d266eb4c7fea0820a).
// Public routing hints only; every connection still verifies Steam's certificate.
const COMMUNITY_BOOTSTRAP = ['23.202.152.218', '23.222.49.49', '23.62.176.223', '23.34.124.241', '23.197.161.19'];
const HOSTS = new Set(['api.steampowered.com', 'steamcommunity.com', 'login.steampowered.com']);
const MAX_AGE = 24 * 3600 * 1000;
type Address = { hostname: string; address: string; time: number; failedUntil: number };

function isSteamDirectUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  if (url.hostname === 'api.steampowered.com') return /^\/IAuthenticationService\/(?:BeginAuthSessionViaQR|PollAuthSessionStatus)\/v1\/$/.test(url.pathname);
  if (url.hostname === 'steamcommunity.com') return ['/oauth/login', '/oauth/loginform/', '/oauth/auth', '/oauth/auth_response', '/login/settoken'].includes(url.pathname);
  return url.hostname === 'login.steampowered.com' && url.pathname === '/jwt/finalizelogin';
}

function createSteamDirectConnector(options: { cacheFile: string; log: (...args: any[]) => void; resolveProxy: (url: string) => Promise<string> }) {
  const cache = new Map<string, Address>();
  try {
    if (fs.statSync(options.cacheFile).size <= 32768) {
      const entries = JSON.parse(fs.readFileSync(options.cacheFile, 'utf8'));
      if (Array.isArray(entries)) for (const item of entries.slice(0, 24)) {
        if (HOSTS.has(item?.hostname) && net.isIP(item.address) && Number.isFinite(item.time) && item.time <= Date.now() && Date.now() - item.time < MAX_AGE)
          cache.set(`${item.hostname}|${item.address}`, { hostname: item.hostname, address: item.address, time: item.time, failedUntil: 0 });
      }
    }
  } catch (_) {}
  function failure(hostname: string, address: string) {
    const entry = cache.get(`${hostname}|${address}`); if (entry) entry.failedUntil = Date.now() + 60000;
  }
  function success(hostname: string, address: string) {
    const now = Date.now();
    for (const [key, item] of cache) if (now - item.time >= MAX_AGE) cache.delete(key);
    cache.delete(`${hostname}|${address}`);
    cache.set(`${hostname}|${address}`, { hostname, address, time: now, failedUntil: 0 });
    const sameHost = [...cache].filter(([, item]) => item.hostname === hostname);
    while (sameHost.length > 8) cache.delete(sameHost.shift()![0]);
    try {
      fs.writeFileSync(options.cacheFile, JSON.stringify([...cache.values()].map(({ hostname, address, time }) => ({ hostname, address, time }))), { mode: 0o600 });
    } catch (_) {}
  }
  function connect(hostname: string, signal: AbortSignal): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      if (!HOSTS.has(hostname)) { reject(new Error('STEAM_DIRECT_HOST_INVALID')); return; }
      const sockets = new Set<tls.TLSSocket>(), timers = new Set<ReturnType<typeof setTimeout>>(), seen = new Set<string>();
      let done = false, pending = 0, lookupDone = false;
      let lastError: any = Object.assign(new Error('Steam direct TLS unavailable'), { code: 'ENOTFOUND' });
      const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
      const finish = (error?: any, winner?: tls.TLSSocket) => {
        if (done) return;
        done = true; signal.removeEventListener('abort', abort);
        for (const timer of timers) clearTimeout(timer);
        for (const socket of sockets) if (socket !== winner) socket.destroy();
        if (error) reject(error); else resolve(winner!);
      };
      const abort = () => finish(signal.reason || Object.assign(new Error('abort'), { kind: 'abort' }));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      const check = () => { if (!done && lookupDone && pending === 0) finish(lastError); };
      later(() => finish(Object.assign(new Error('Steam direct TLS deadline'), { code: 'ETIMEDOUT' })), 9000);
      const enqueue = (addresses: string[]) => {
        for (const address of addresses) {
          if (done || seen.size >= 8 || !net.isIP(address) || seen.has(address)) continue;
          const delay = seen.size * 150; seen.add(address); pending++;
          later(() => {
            if (done) return;
            let socket: tls.TLSSocket, failed = false, timer: ReturnType<typeof setTimeout>;
            const fail = (error: any) => {
              if (done || failed) return;
              failed = true; clearTimeout(timer); timers.delete(timer); socket?.destroy();
              if (socket) sockets.delete(socket);
              failure(hostname, address); lastError = error; pending--; check();
            };
            try {
              socket = tls.connect({ host: address, port: 443,
                servername: hostname === 'steamcommunity.com' ? `${hostname}.` : hostname,
                rejectUnauthorized: true,
                checkServerIdentity: (_servername, certificate) => tls.checkServerIdentity(hostname, certificate) });
              sockets.add(socket);
              timer = later(() => fail(Object.assign(new Error('Steam TLS candidate timeout'), { code: 'ETIMEDOUT' })), 5500);
              socket.once('error', fail);
              socket.once('secureConnect', () => {
                if (done || failed) { socket.destroy(); return; }
                if (!socket.authorized) { fail(Object.assign(new Error('Steam TLS certificate invalid'), { code: 'CERT_INVALID' })); return; }
                options.log('steam-direct connected', hostname, 'address=', address);
                finish(undefined, socket);
              });
            } catch (error) { fail(error); }
          }, delay);
        }
      };
      const cached = [...cache.values()].filter(v => v.hostname === hostname && Date.now() - v.time < MAX_AGE && v.failedUntil <= Date.now())
        .sort((a, b) => b.time - a.time).map(v => v.address);
      // Start known candidates immediately: a stalled DNS resolver must not block them.
      enqueue(hostname === 'steamcommunity.com' ? [...cached.slice(0, 2), ...COMMUNITY_BOOTSTRAP] : cached.slice(0, 4));
      dns.lookup(hostname, { all: true, verbatim: true }, (error, records) => {
        if (done) return;
        lookupDone = true; if (error) lastError = error;
        enqueue((records || []).map(record => record.address)); check();
      });
    });
  }
  return { async prepare(url: URL, signal: AbortSignal) {
    if (!isSteamDirectUrl(url)) return null;
    // PAC / system proxy remains authoritative. Unknown policy stays on Chromium.
    const route = await new Promise<string>((resolve, reject) => {
      let done = false;
      const finish = (value?: string, error?: any) => {
        if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value || 'UNKNOWN');
      };
      const abort = () => finish(undefined, signal.reason || Object.assign(new Error('abort'), { kind: 'abort' }));
      const timer = setTimeout(() => finish('UNKNOWN'), 1500);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      Promise.resolve().then(() => options.resolveProxy(url.href)).then(value => finish(value), () => finish('UNKNOWN'));
    });
    if (route.trim().toUpperCase() !== 'DIRECT') return null;
    const hostname = url.hostname;
    const socket = await connect(hostname, signal);
    if (signal.aborted) { socket.destroy(); throw signal.reason; }
    const address = socket.remoteAddress || '';
    const agent = new https.Agent({ keepAlive: false });
    // Only after selecting a verified socket does the caller create ONE HTTP request.
    agent.createConnection = () => socket;
    return { agent, success: () => success(hostname, address), failure: () => failure(hostname, address),
      cancel: () => { socket.destroy(); agent.destroy(); } };
  } };
}

export = { createSteamDirectConnector, isSteamDirectUrl };
