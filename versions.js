const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { json, download } = require('./net');
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const META = { fabric: 'https://meta.fabricmc.net/v2', quilt: 'https://meta.quiltmc.org/v3' };
module.exports = function makeVersions({ paths, log }) {
  let man = null;
  const cacheJson = async (file, url) => {
    const f = path.join(paths.cache, file);
    try { const d = await json(url); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d)); return d; }
    catch (e) { if (fs.existsSync(f)) { log.warn('Sin conexión: usando caché de ' + file); return JSON.parse(fs.readFileSync(f, 'utf8')); } throw e; }
  };
  async function manifest() { if (!man) { try { man = await cacheJson('version_manifest_v2.json', MANIFEST); } catch (e) { throw new Error('No se pudo obtener la lista de versiones de Minecraft: ' + e.message); } } return man; }
  const list = async () => (await manifest()).versions.map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
  const entry = async id => (await manifest()).versions.find(v => v.id === id);
  const has = async id => !!(await entry(id));
  async function javaMajor(id) {   // se lee del propio JSON oficial de la versión
    const e = await entry(id); if (!e) throw new Error('Versión de Minecraft desconocida: ' + id);
    const v = await cacheJson(path.join('versions', id + '.json'), e.url), mv = (v.javaVersion && v.javaVersion.majorVersion) || 8; return mv === 16 ? 17 : mv;
  }
  const runJar = (java, args, cwd, emit) => new Promise((res, rej) => {
    const p = spawn(java, args, { cwd }), tail = [], on = d => { for (const l of String(d).split('\n')) if (l.trim()) { tail.push(l.trim()); if (tail.length > 20) tail.shift(); } if (emit && tail.length) emit('task', { label: tail[tail.length - 1].slice(0, 110) }); };
    p.stdout.on('data', on); p.stderr.on('data', on); p.on('error', rej);
    p.on('close', c => c === 0 ? res() : rej(new Error(`El instalador terminó con código ${c}: ${tail.slice(-3).join(' | ')}`)));
  });
  async function writeProfileJson(kind, mc, lv) {
    const prof = await json(`${META[kind]}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(lv)}/profile/json`);
    const d = path.join(paths.root, 'versions', prof.id); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, prof.id + '.json'), JSON.stringify(prof)); return prof.id;
  }
  async function installLoader({ mc, loader, loaderVersion, javaPath, emit }) {
    if (loader === 'vanilla') return { custom: null, loaderVersion: null };
    if (loader === 'fabric' || loader === 'quilt') {
      let lv = loaderVersion;
      if (!lv) {
        const l = await json(`${META[loader]}/versions/loader/${encodeURIComponent(mc)}`);
        if (!l.length) throw new Error(`${loader} no está disponible para Minecraft ${mc}`);
        lv = (l.find(e => loader === 'fabric' ? e.loader.stable : !/alpha|beta|rc|pre/i.test(e.loader.version)) || l[0]).loader.version;
      }
      emit && emit('task', { label: `Instalando ${loader} ${lv}…` }); return { custom: await writeProfileJson(loader, mc, lv), loaderVersion: lv };
    }
    if (!['forge', 'neoforge'].includes(loader)) throw new Error('Cargador desconocido: ' + loader);
    let lv = loaderVersion, url;
    if (loader === 'forge') {
      if (!lv) { const p = (await json('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos; lv = p[mc + '-recommended'] || p[mc + '-latest']; if (!lv) throw new Error('No hay Forge para Minecraft ' + mc); }
      url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${lv}/forge-${mc}-${lv}-installer.jar`;
    } else {
      if (!lv) {
        const [, mi, pa] = mc.split('.'), pre = `${mi}.${pa || 0}.`;
        const vs = (await json('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')).versions.filter(x => x.startsWith(pre) && !/alpha|beta/.test(x));
        if (!vs.length) throw new Error(`No hay NeoForge para Minecraft ${mc} (existe desde la 1.20.2)`); lv = vs[vs.length - 1];
      }
      url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${lv}/neoforge-${lv}-installer.jar`;
    }
    const root = paths.root, vdir = path.join(root, 'versions'); fs.mkdirSync(vdir, { recursive: true });
    const lp = path.join(root, 'launcher_profiles.json'); if (!fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ profiles: {} }));
    const jar = path.join(paths.cache, 'installers', `${loader}-${lv}-installer.jar`); emit && emit('task', { label: `Descargando instalador de ${loader} ${lv}…` });
    await download(url, jar);
    const before = new Set(fs.readdirSync(vdir)); emit && emit('task', { label: `Instalando ${loader} ${lv} (puede tardar unos minutos)…` });
    await runJar(javaPath, ['-jar', jar, '--installClient', root], root, emit);
    const isMine = d => d.includes(lv) && (loader === 'neoforge' ? d.includes('neoforge') : d.includes('forge') && !d.includes('neoforge'));
    const id = fs.readdirSync(vdir).find(d => !before.has(d) && isMine(d)) || fs.readdirSync(vdir).find(isMine);
    if (!id) throw new Error('El instalador de ' + loader + ' terminó pero no se encontró la versión instalada'); return { custom: id, loaderVersion: lv };
  }
  return { list, has, entry, javaMajor, installLoader, manifest };
};
