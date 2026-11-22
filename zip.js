const zlib = require('zlib'), fs = require('fs'), path = require('path');
const { safeJoin } = require('./net');
function readZip(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Archivo ZIP no válido');
  const count = buf.readUInt16LE(e + 10); let off = buf.readUInt32LE(e + 16); const out = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP dañado');
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), n = buf.readUInt16LE(off + 28), m = buf.readUInt16LE(off + 30), c = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + n); off += 46 + n + m + c;
    out.push({ name, isDir: name.endsWith('/'), data() {
      const s = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), raw = buf.subarray(s, s + csize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    } });
  }
  return out;
}
function extractZip(buf, dest, { prefix = '', strip = '' } = {}) {
  for (const e of readZip(buf)) {
    if (!e.name.startsWith(prefix)) continue;
    const rel = e.name.slice(prefix.length); if (!rel) continue;
    const t = safeJoin(dest, rel);
    if (e.isDir) fs.mkdirSync(t, { recursive: true }); else { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.data()); }
  }
}
module.exports = { readZip, extractZip };
