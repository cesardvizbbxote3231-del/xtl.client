const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const { download } = require('./net'), { extractZip } = require('./zip');
const WIN = process.platform === 'win32', EXE = WIN ? 'java.exe' : 'java';
const parseMajor = t => { const m = /version "(\d+)(?:\.(\d+))?/.exec(t || ''); return m ? (+m[1] === 1 ? +m[2] : +m[1]) : 0; };
const probe = bin => new Promise(res => execFile(bin, ['-version'], { timeout: 8000 }, (e, so, se) => { const major = parseMajor(String(se || '') + String(so || '')); res(major ? { path: bin, major } : null); }));
function walkBin(dir, depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === EXE && path.basename(dir) === 'bin') return p;
    if (e.isDirectory()) { const r = walkBin(p, depth + 1); if (r) return r; }
  }
  return null;
}
module.exports = function makeJava({ paths, log }) {
  const findManaged = v => walkBin(path.join(paths.java, String(v)));
  async function installManaged(v, emit) {
    const have = findManaged(v); if (have) return have;
    const dir = path.join(paths.java, String(v)); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const o = WIN ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux', a = process.arch === 'arm64' ? 'aarch64' : 'x64', f = path.join(dir, WIN ? 'java.zip' : 'java.tgz');
    emit && emit('task', { label: `Descargando Java ${v} (Eclipse Temurin)…` }); log.info(`Descargando Temurin ${v} (${o}/${a})`);
    await download(`https://api.adoptium.net/v3/binary/latest/${v}/ga/${o}/${a}/jre/hotspot/normal/eclipse`, f);
    emit && emit('task', { label: `Instalando Java ${v}…` });
    if (WIN) extractZip(fs.readFileSync(f), dir); else await new Promise((res, rej) => execFile('tar', ['-xzf', f, '-C', dir], e => e ? rej(e) : res()));
    fs.rmSync(f, { force: true });
    const bin = findManaged(v); if (!bin) throw new Error('No se pudo instalar Java ' + v); log.info('Java instalado: ' + bin); return bin;
  }
  async function detectSystem() {
    const c = [], add = p => { if (p && !c.includes(p)) c.push(p); }, H = process.env;
    if (H.JAVA_HOME) add(path.join(H.JAVA_HOME, 'bin', EXE));
    const roots = WIN ? ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto', 'Semeru'].flatMap(n => [H.ProgramFiles, H['ProgramFiles(x86)']].filter(Boolean).map(b => path.join(b, n)))
      : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', path.join(H.HOME || '', '.sdkman/candidates/java')];
    for (const r of roots) { try { for (const d of fs.readdirSync(r)) { add(path.join(r, d, 'bin', EXE)); add(path.join(r, d, 'Contents', 'Home', 'bin', EXE)); } } catch {} }
    const out = [];
    for (const p of c) if (fs.existsSync(p)) { const r = await probe(p); if (r && !out.find(x => x.major === r.major && fs.realpathSync(x.path) === fs.realpathSync(p))) out.push(r); }
    if (!out.length) { const r = await probe('java'); if (r) out.push(r); }
    return out;
  }
  async function list() {
    const managed = [8, 17, 21, 25].map(v => ({ major: v, path: findManaged(v), managed: true, installed: !!findManaged(v) }));
    return { managed, system: (await detectSystem()).map(j => ({ ...j, managed: false, installed: true })) };
  }
  // 'auto' = Java gestionado (o uno del sistema con la misma versión); número = versión gestionada; ruta = Java del usuario
  async function resolve(required, pref, emit) {
    pref = pref == null ? 'auto' : String(pref);
    if (pref !== 'auto' && !/^\d+$/.test(pref)) {
      if (!fs.existsSync(pref) || !(await probe(pref))) throw new Error('El Java elegido no es válido: ' + pref);
      return pref;
    }
    const want = pref === 'auto' ? required : +pref;
    if (want !== required) log.warn(`El perfil usa Java ${want} pero la versión pide Java ${required}`);
    const m = findManaged(want); if (m) return m;
    if (pref === 'auto') { const s = (await detectSystem()).find(j => j.major === want); if (s) { log.info('Usando Java del sistema: ' + s.path); return s.path; } }
    return installManaged(want, emit);
  }
  return { findManaged, installManaged, detectSystem, list, resolve, probe, parseMajor };
};
