const fs = require('fs'), path = require('path'), crypto = require('crypto');
const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
module.exports = function makeProfiles({ paths, settings, versions, java, log }) {
  const dir = id => paths.profileDir(id), mfile = id => path.join(dir(id), 'profile.json');
  const read = id => { const f = mfile(id); try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { throw new Error('Perfil no encontrado'); } };
  const write = p => fs.writeFileSync(mfile(p.id), JSON.stringify(p, null, 1));
  const mods = id => { try { return fs.readdirSync(path.join(dir(id), 'mods')).filter(f => f.endsWith('.jar')).length; } catch { return 0; } };
  const bad = m => { throw new Error(m); };
  function clean(o, base = {}) {
    const p = { ...base };
    if (o.name != null) { const n = String(o.name).trim().slice(0, 40); if (!n) bad('El perfil necesita un nombre'); p.name = n; }
    if (o.ram != null) { const v = Math.round(+o.ram); if (Number.isNaN(v) || (v !== 0 && (v < 512 || v > settings.get().maxRam))) bad('Memoria fuera de rango'); p.ram = v; }
    if (o.java != null) { const j = String(o.java); if (j.length > 500) bad('Java no válido'); p.java = j; }
    if (o.resW != null) p.resW = Math.max(0, Math.min(7680, Math.round(+o.resW) || 0));
    if (o.resH != null) p.resH = Math.max(0, Math.min(4320, Math.round(+o.resH) || 0));
    if (o.jvm != null) p.jvm = String(o.jvm).slice(0, 500);
    if (o.icon != null) { if (!['emoji', 'color', 'img'].includes(o.icon.type)) bad('Icono no válido'); p.icon = { type: o.icon.type, v: String(o.icon.v || '').slice(0, 16) }; }
    return p;
  }
  const pub = p => ({ ...p, mods: mods(p.id) });
  const get = id => read(id);
  const listAll = () => !fs.existsSync(paths.profiles) ? [] : fs.readdirSync(paths.profiles).filter(d => fs.existsSync(path.join(paths.profiles, d, 'profile.json'))).map(d => pub(read(d))).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name));
  async function create(o, emit) {
    const loader = o.loader || 'vanilla'; if (!LOADERS.includes(loader)) bad('Cargador no válido');
    if (!(await versions.has(o.mc))) bad('Versión de Minecraft no válida: ' + o.mc);
    const entry = await versions.entry(o.mc), id = 'p_' + crypto.randomBytes(4).toString('hex'), d = dir(id);
    const base = clean({ name: o.name || 'Mi perfil', ram: o.ram || 0, java: o.java || 'auto', resW: o.resW || 0, resH: o.resH || 0, jvm: o.jvm || '', icon: o.icon || { type: 'emoji', v: '⛏️' } },
      { id, mc: o.mc, vtype: entry.type, loader, loaderVersion: null, custom: null, created: Date.now(), lastPlayed: 0 });
    fs.mkdirSync(path.join(d, 'mods'), { recursive: true });
    try {
      const javaPath = await java.resolve(await versions.javaMajor(o.mc), 'auto', emit);
      const r = await versions.installLoader({ mc: o.mc, loader, loaderVersion: o.loaderVersion, javaPath, emit });
      Object.assign(base, { custom: r.custom, loaderVersion: r.loaderVersion }); write(base);
    } catch (e) { fs.rmSync(d, { recursive: true, force: true }); throw e; }
    if (!settings.get().activeProfile) settings.set({ activeProfile: id });
    log.info(`Perfil creado: ${base.name} (${o.mc} ${loader})`); return pub(base);
  }
  const update = (id, patch) => { const p = clean(patch, read(id)); write(p); return pub(p); };
  function duplicate(id) {
    const p = read(id), nid = 'p_' + crypto.randomBytes(4).toString('hex'); fs.cpSync(dir(id), dir(nid), { recursive: true });
    const n = { ...p, id: nid, name: (p.name + ' (copia)').slice(0, 40), created: Date.now(), lastPlayed: 0 }; write(n); return pub(n);
  }
  function remove(id) {
    fs.rmSync(dir(id), { recursive: true, force: true });
    if (settings.get().activeProfile === id) settings.set({ activeProfile: (listAll()[0] || {}).id || '' });
  }
  async function setLoader(id, loader, emit) {
    if (!LOADERS.includes(loader)) bad('Cargador no válido'); const p = read(id);
    const javaPath = await java.resolve(await versions.javaMajor(p.mc), 'auto', emit);
    const r = await versions.installLoader({ mc: p.mc, loader, javaPath, emit }); Object.assign(p, { loader, custom: r.custom, loaderVersion: r.loaderVersion }); write(p); return pub(p);
  }
  function setIconImage(id, file) {
    const st = fs.statSync(file); if (st.size > 300 * 1024) bad('La imagen debe pesar menos de 300 KB'); if (!/\.(png|jpe?g)$/i.test(file)) bad('Usa una imagen PNG o JPG');
    fs.copyFileSync(file, path.join(dir(id), 'icon' + path.extname(file).toLowerCase())); const p = read(id); p.icon = { type: 'img', v: path.extname(file).toLowerCase() }; write(p); return pub(p);
  }
  function iconData(id) {
    const p = read(id); if (p.icon.type !== 'img') return null; const f = path.join(dir(id), 'icon' + p.icon.v); if (!fs.existsSync(f)) return null;
    return `data:image/${p.icon.v === '.png' ? 'png' : 'jpeg'};base64,` + fs.readFileSync(f).toString('base64');
  }
  const touch = id => { const p = read(id); p.lastPlayed = Date.now(); write(p); };
  return { list: listAll, get, create, update, duplicate, remove, setLoader, setIconImage, iconData, touch, dir, LOADERS };
};
