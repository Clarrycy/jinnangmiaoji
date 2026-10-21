// 由 src/core/steam-direct-agent.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const https = require("https");
const tls = require("tls");
const dns = require("dns");
const net = require("net");
const fs = require("fs");
const COMMUNITY_BOOTSTRAP = ["23.202.152.218", "23.222.49.49", "23.62.176.223", "23.34.124.241", "23.197.161.19"];
const HOSTS = /* @__PURE__ */ new Set(["api.steampowered.com", "steamcommunity.com", "login.steampowered.com"]);
const MAX_AGE = 24 * 3600 * 1e3;
function isSteamDirectUrl(url) {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (url.hostname === "api.steampowered.com") return /^\/IAuthenticationService\/(?:BeginAuthSessionViaQR|PollAuthSessionStatus)\/v1\/$/.test(url.pathname);
  if (url.hostname === "steamcommunity.com") return ["/oauth/login", "/oauth/loginform/", "/oauth/auth", "/oauth/auth_response", "/login/settoken"].includes(url.pathname);
  return url.hostname === "login.steampowered.com" && url.pathname === "/jwt/finalizelogin";
}
function createSteamDirectConnector(options) {
  const cache = /* @__PURE__ */ new Map();
  try {
    if (fs.statSync(options.cacheFile).size <= 32768) {
      const entries = JSON.parse(fs.readFileSync(options.cacheFile, "utf8"));
      if (Array.isArray(entries)) for (const item of entries.slice(0, 24)) {
        if (HOSTS.has(item?.hostname) && net.isIP(item.address) && Number.isFinite(item.time) && item.time <= Date.now() && Date.now() - item.time < MAX_AGE)
          cache.set(`${item.hostname}|${item.address}`, { hostname: item.hostname, address: item.address, time: item.time, failedUntil: 0 });
      }
    }
  } catch (_) {
  }
  function failure(hostname, address) {
    const entry = cache.get(`${hostname}|${address}`);
    if (entry) entry.failedUntil = Date.now() + 6e4;
  }
  function success(hostname, address) {
    const now = Date.now();
    for (const [key, item] of cache) if (now - item.time >= MAX_AGE) cache.delete(key);
    cache.delete(`${hostname}|${address}`);
    cache.set(`${hostname}|${address}`, { hostname, address, time: now, failedUntil: 0 });
    const sameHost = [...cache].filter(([, item]) => item.hostname === hostname);
    while (sameHost.length > 8) cache.delete(sameHost.shift()[0]);
    try {
      fs.writeFileSync(options.cacheFile, JSON.stringify([...cache.values()].map(({ hostname: hostname2, address: address2, time }) => ({ hostname: hostname2, address: address2, time }))), { mode: 384 });
    } catch (_) {
    }
  }
  function connect(hostname, signal) {
    return new Promise((resolve, reject) => {
      if (!HOSTS.has(hostname)) {
        reject(new Error("STEAM_DIRECT_HOST_INVALID"));
        return;
      }
      const sockets = /* @__PURE__ */ new Set(), timers = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set();
      let done = false, pending = 0, lookupDone = false;
      let lastError = Object.assign(new Error("Steam direct TLS unavailable"), { code: "ENOTFOUND" });
      const later = (fn, ms) => {
        const t = setTimeout(() => {
          timers.delete(t);
          fn();
        }, ms);
        timers.add(t);
        return t;
      };
      const finish = (error, winner) => {
        if (done) return;
        done = true;
        signal.removeEventListener("abort", abort);
        for (const timer of timers) clearTimeout(timer);
        for (const socket of sockets) if (socket !== winner) socket.destroy();
        if (error) reject(error);
        else resolve(winner);
      };
      const abort = () => finish(signal.reason || Object.assign(new Error("abort"), { kind: "abort" }));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      const check = () => {
        if (!done && lookupDone && pending === 0) finish(lastError);
      };
      later(() => finish(Object.assign(new Error("Steam direct TLS deadline"), { code: "ETIMEDOUT" })), 9e3);
      const enqueue = (addresses) => {
        for (const address of addresses) {
          if (done || seen.size >= 8 || !net.isIP(address) || seen.has(address)) continue;
          const delay = seen.size * 150;
          seen.add(address);
          pending++;
          later(() => {
            if (done) return;
            let socket, failed = false, timer;
            const fail = (error) => {
              if (done || failed) return;
              failed = true;
              clearTimeout(timer);
              timers.delete(timer);
              socket?.destroy();
              if (socket) sockets.delete(socket);
              failure(hostname, address);
              lastError = error;
              pending--;
              check();
            };
            try {
              socket = tls.connect({
                host: address,
                port: 443,
                servername: hostname === "steamcommunity.com" ? `${hostname}.` : hostname,
                rejectUnauthorized: true,
                checkServerIdentity: (_servername, certificate) => tls.checkServerIdentity(hostname, certificate)
              });
              sockets.add(socket);
              timer = later(() => fail(Object.assign(new Error("Steam TLS candidate timeout"), { code: "ETIMEDOUT" })), 5500);
              socket.once("error", fail);
              socket.once("secureConnect", () => {
                if (done || failed) {
                  socket.destroy();
                  return;
                }
                if (!socket.authorized) {
                  fail(Object.assign(new Error("Steam TLS certificate invalid"), { code: "CERT_INVALID" }));
                  return;
                }
                options.log("steam-direct connected", hostname, "address=", address);
                finish(void 0, socket);
              });
            } catch (error) {
              fail(error);
            }
          }, delay);
        }
      };
      const cached = [...cache.values()].filter((v) => v.hostname === hostname && Date.now() - v.time < MAX_AGE && v.failedUntil <= Date.now()).sort((a, b) => b.time - a.time).map((v) => v.address);
      enqueue(hostname === "steamcommunity.com" ? [...cached.slice(0, 2), ...COMMUNITY_BOOTSTRAP] : cached.slice(0, 4));
      dns.lookup(hostname, { all: true, verbatim: true }, (error, records) => {
        if (done) return;
        lookupDone = true;
        if (error) lastError = error;
        enqueue((records || []).map((record) => record.address));
        check();
      });
    });
  }
  return { async prepare(url, signal) {
    if (!isSteamDirectUrl(url)) return null;
    const route = await new Promise((resolve, reject) => {
      let done = false;
      const finish = (value, error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve(value || "UNKNOWN");
      };
      const abort = () => finish(void 0, signal.reason || Object.assign(new Error("abort"), { kind: "abort" }));
      const timer = setTimeout(() => finish("UNKNOWN"), 1500);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      Promise.resolve().then(() => options.resolveProxy(url.href)).then((value) => finish(value), () => finish("UNKNOWN"));
    });
    if (route.trim().toUpperCase() !== "DIRECT") return null;
    const hostname = url.hostname;
    const socket = await connect(hostname, signal);
    if (signal.aborted) {
      socket.destroy();
      throw signal.reason;
    }
    const address = socket.remoteAddress || "";
    const agent = new https.Agent({ keepAlive: false });
    agent.createConnection = () => socket;
    return {
      agent,
      success: () => success(hostname, address),
      failure: () => failure(hostname, address),
      cancel: () => {
        socket.destroy();
        agent.destroy();
      }
    };
  } };
}
module.exports = { createSteamDirectConnector, isSteamDirectUrl };
