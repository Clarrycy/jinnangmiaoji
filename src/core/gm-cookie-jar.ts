// Isolated Chromium cookie sessions: bounded, in memory, cleared before reuse.
function cookieKey(c) { return [String(c.domain || '').replace(/^\./, ''), c.path || '/', c.name].join('\n'); }
function cookieDetails(c) {
  const host = String(c.domain || '').replace(/^\./, '');
  const path = c.path || '/';
  const value: Record<string, any> = { url: `${c.secure ? 'https' : 'http'}://${host}${path}`, name: c.name, value: c.value,
    path, secure: Boolean(c.secure), httpOnly: Boolean(c.httpOnly) };
  if (!c.hostOnly && c.domain) value.domain = c.domain;
  if (Number.isFinite(c.expirationDate)) value.expirationDate = c.expirationDate;
  if (c.sameSite) value.sameSite = c.sameSite;
  return value;
}
async function snapshot(session) {
  return new Map<string, any>((await session.cookies.get({})).map(c => [cookieKey(c), c]));
}
function line(c, removed = false) {
  let s = `${c.name}=${removed ? '' : c.value}; Path=${c.path || '/'}`;
  if (!c.hostOnly && c.domain) s += `; Domain=${c.domain}`;
  if (removed) return s + '; Max-Age=0';
  if (c.secure) s += '; Secure';
  if (c.httpOnly) s += '; HttpOnly';
  if (Number.isFinite(c.expirationDate)) s += `; Expires=${new Date(c.expirationDate * 1000).toUTCString()}`;
  const sameSite = { strict: 'Strict', lax: 'Lax', no_restriction: 'None' }[c.sameSite];
  if (sameSite) s += `; SameSite=${sameSite}`;
  return s;
}
async function changed(before, session, source, response) {
  const after = await snapshot(session), lines = [];
  for (const [key, c] of after) {
    const old = before.get(key);
    if (old && JSON.stringify(cookieDetails(old)) === JSON.stringify(cookieDetails(c))) continue;
    lines.push(line(c));
    if (source?.cookies) await source.cookies.set(cookieDetails(c));
  }
  for (const [key, c] of before) if (!after.has(key)) {
    lines.push(line(c, true));
    if (source?.cookies) await source.cookies.remove(cookieDetails(c).url, c.name);
  }
  // Chromium may hide Set-Cookie on redirects. Add only cookies absent in the raw headers.
  const raw = response.rawHeaders || (response.rawHeaders = []), existing = new Set();
  for (let i = 0; i + 1 < raw.length; i += 2) if (String(raw[i]).toLowerCase() === 'set-cookie') existing.add(String(raw[i + 1]).split('=')[0].trim());
  for (const s of lines) if (!existing.has(s.split('=')[0])) raw.push('Set-Cookie', s);
}
async function seed(source, target, url, explicit, allowed) {
  if (explicit != null) {
    for (const pair of explicit.split(';')) {
      const i = pair.indexOf('='); if (i < 1) continue;
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
      if (!/^[\w!#$%&'*+.^`|~-]+$/.test(name) || /[\r\n\0]/.test(value)) throw new Error('COOKIE_HEADER_INVALID');
      await target.cookies.set({ url: url.origin + '/', path: '/', name, value, secure: url.protocol === 'https:' });
    }
  } else if (source?.cookies) {
    for (const c of await source.cookies.get({})) if (allowed(String(c.domain || '').replace(/^\./, '')))
      await target.cookies.set(cookieDetails(c));
  }
}
function createPool(factory, limit = 8) {
  const slots: any[] = [], waiters = new Set<() => void>();
  async function acquire(signal) {
    for (;;) {
      if (signal.aborted) throw signal.reason;
      let slot = slots.find(s => !s.busy && !s.failed);
      if (!slot && slots.length < limit) { slot = { busy: false, session: factory(slots.length) }; slots.push(slot); }
      if (slot) {
        slot.busy = true;
        return { session: slot.session, async release() {
          try { await slot.session.clearStorageData({ storages: ['cookies'] }); }
          catch (e) { slot.failed = true; throw e; }
          finally { slot.busy = false; for (const wake of [...waiters]) wake(); }
        } };
      }
      if (slots.every(s => s.failed)) throw new Error('COOKIE_SESSION_UNAVAILABLE');
      if (waiters.size >= 64) throw new Error('COOKIE_SESSION_BUSY');
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { waiters.delete(wake); signal.removeEventListener('abort', abort); };
        const wake = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(signal.reason); };
        waiters.add(wake); signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
  return { acquire };
}
export = { cookieDetails, snapshot, changed, seed, createPool };
