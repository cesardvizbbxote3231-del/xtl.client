const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { pipeline } = require('stream/promises'), { Readable } = require('stream');
const UA = { 'User-Agent': 'xtl-client/1.0 (+https://github.com/xtl/client)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(fn, n = 3, base = 400) {
  let err;
  for (let i = 0; i < n; i++) { try { return await fn(i); } catch (e) { err = e; if (e.noRetry) throw e; await sleep(base * (i + 1) ** 2); } }
  throw err;
}
async function json(url, opts = {}) {
  return retry(async () => {
    const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
    if (!r.ok) {
      const t = await r.text().catch(() => ''), e = new Error(`HTTP ${r.status} (${new URL(url).host})${t ? ': ' + t.slice(0, 160) : ''}`);
      e.status = r.status; if (r.status >= 400 && r.status < 500 && r.status !== 429) e.noRetry = true; throw e;
    }
    return r.json();
  });
}
const hashFile = (f, algo = 'sha1') => new Promise((res, rej) => {
  const h = crypto.createHash(algo); fs.createReadStream(f).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});
// Descarga a un .part, verifica el hash y renombra: una descarga interrumpida nunca deja un archivo corrupto.
async function download(url, dest, { sha1 } = {}) {
  if (sha1 && fs.existsSync(dest) && (await hashFile(dest)) === sha1) return false;
  return retry(async () => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part', r = await fetch(url, { headers: UA });
    if (!r.ok) { const e = new Error(`Descarga fallida (${r.status}): ${path.basename(dest)}`); if (r.status < 500 && r.status !== 429) e.noRetry = true; throw e; }
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
    if (sha1 && (await hashFile(tmp)) !== sha1) { fs.rmSync(tmp, { force: true }); throw new Error('Hash SHA-1 incorrecto: ' + path.basename(dest)); }
    fs.renameSync(tmp, dest); return true;
  });
}
async function pool(items, fn, n = 6) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); }
function safeJoin(base, rel) { const t = path.resolve(base, rel); if (t !== path.resolve(base) && !t.startsWith(path.resolve(base) + path.sep)) throw new Error('Ruta no permitida: ' + rel); return t; }
module.exports = { UA, sleep, retry, json, download, hashFile, pool, safeJoin };
