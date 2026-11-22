const fs = require('fs'), path = require('path');
const { json, download, hashFile, pool, safeJoin, UA } = require('./net'), { readZip } = require('./zip');
const MR = 'https://api.modrinth.com/v2', Q = a => encodeURIComponent(JSON.stringify(a));
const DIRS = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
const PACK_LOADERS = [['fabric-loader', 'fabric'], ['quilt-loader', 'quilt'], ['neoforge', 'neoforge'], ['forge', 'forge']];
module.exports = function makeModrinth({ paths, profiles, versions, java, log, catalog }) {
  const loadersFor = l => l === 'quilt' ? ['quilt', 'fabric'] : [l];
  const catCache = {};

  async function search({ q, type = 'mod', mc, loader, category, sort = 'relevance', offset = 0 }) {
    const f = [[`project_type:${type}`]];
    if (mc) f.push([`versions:${mc}`]);
    if (type === 'mod' && loader && loader !== 'vanilla') f.push(loadersFor(loader).map(l => `categories:${l}`));
    if (type === 'modpack' && loader && loader !== 'all') f.push([`categories:${loader}`]);
    if (category) f.push([`categories:${category}`]);
    const r = await json(`${MR}/search?limit=24&offset=${offset | 0}&index=${encodeURIComponent(sort)}&query=${encodeURIComponent(q || '')}&facets=${encodeURIComponent(JSON.stringify(f))}`);
    return { total: r.total_hits, hits: r.hits.map(h => ({ id: h.project_id, slug: h.slug, title: h.title, desc: h.description, icon: h.icon_url, dl: h.downloads, author: h.author, cats: (h.display_categories || h.categories || []).slice(0, 3) })) };
  }
  async function categories(type) {
    if (!catCache.all) catCache.all = await json(`${MR}/tag/category`);
    return catCache.all.filter(c => c.project_type === type && ['categories', 'features'].includes(c.header)).map(c => c.name);
  }
  async function pickVersion(id, { mc, loaders }) {
    const qs = []; if (loaders) qs.push('loaders=' + Q(loaders)); if (mc) qs.push('game_versions=' + Q([mc]));
    return (await json(`${MR}/project/${encodeURIComponent(id)}/version${qs.length ? '?' + qs.join('&') : ''}`))[0] || null;
  }
  const primary = v => v.files.find(f => f.primary) || v.files[0];
  async function installFile(v, dest) { const f = primary(v), fn = path.basename(f.filename); if (fs.existsSync(dest + '.disabled')) fs.renameSync(dest + '.disabled', dest); else await download(f.url, dest, { sha1: f.hashes && f.hashes.sha1 }); return fn; }

  // Instala un proyecto en un perfil (con sus dependencias obligatorias). Devuelve los archivos instalados.
  async function installProject({ profile, id, type = 'mod' }, emit, seen = new Set(), out = []) {
    if (seen.has(id)) return out; seen.add(id);
    const p = profiles.get(profile);
    if (type === 'mod' && p.loader === 'vanilla') throw new Error('Este perfil es Vanilla. Cambia el cargador a Fabric, Quilt, Forge o NeoForge para usar mods.');
    const v = await pickVersion(id, { mc: p.mc, loaders: type === 'mod' ? loadersFor(p.loader) : null });
    if (!v) throw new Error(`No hay versión compatible con Minecraft ${p.mc}${type === 'mod' ? ' + ' + p.loader : ''}`);
    const d = path.join(profiles.dir(profile), DIRS[type]), fn = path.basename(primary(v).filename);
    await installFile(v, path.join(d, fn)); out.push(fn); log.info(`Instalado ${fn} en ${p.name}`); emit && emit('task', { label: 'Instalado: ' + fn });
    if (type === 'mod') for (const dep of v.dependencies || []) if (dep.dependency_type === 'required') {
      const pid = dep.project_id || (dep.version_id && (await json(`${MR}/version/${dep.version_id}`)).project_id);
      if (pid) await installProject({ profile, id: pid, type }, emit, seen, out);
    }
    return out;
  }

  /* ---------- Gestión de mods instalados y actualizaciones (API de hashes de Modrinth) ---------- */
  const modsDir = id => path.join(profiles.dir(id), 'mods');
  const listFiles = id => { try { return fs.readdirSync(modsDir(id)).filter(f => /\.jar(\.disabled)?$/.test(f)).map(f => ({ file: f, enabled: !f.endsWith('.disabled') })); } catch { return []; } };
  const toggle = (id, file) => { const f = path.basename(file), a = path.join(modsDir(id), f); fs.renameSync(a, f.endsWith('.disabled') ? a.slice(0, -9) : a + '.disabled'); };
  const removeFile = (id, file) => fs.rmSync(path.join(modsDir(id), path.basename(file)), { force: true });
  function addLocal(id, src) { if (!/\.jar$/i.test(src)) throw new Error('Solo se pueden añadir archivos .jar'); fs.mkdirSync(modsDir(id), { recursive: true }); fs.copyFileSync(src, path.join(modsDir(id), path.basename(src))); }
  async function checkUpdates(id) {
    const p = profiles.get(id), files = listFiles(id).filter(f => f.enabled), byHash = {};
    for (const f of files) byHash[await hashFile(path.join(modsDir(id), f.file))] = f.file;
    const hashes = Object.keys(byHash); if (!hashes.length) return [];
    const opts = b => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const cur = await json(`${MR}/version_files`, opts({ hashes, algorithm: 'sha1' }));
    const latest = await json(`${MR}/version_files/update`, opts({ hashes, algorithm: 'sha1', loaders: loadersFor(p.loader), game_versions: [p.mc] }));
    const ups = hashes.filter(h => cur[h] && latest[h] && latest[h].id !== cur[h].id);
    let titles = {}; if (ups.length) for (const pr of await json(`${MR}/projects?ids=${Q([...new Set(ups.map(h => cur[h].project_id))])}`)) titles[pr.id] = pr.title;
    return ups.map(h => ({ file: byHash[h], project: cur[h].project_id, title: titles[cur[h].project_id] || byHash[h], from: cur[h].version_number, to: latest[h].version_number, version: latest[h] }));
  }
  async function applyUpdates(id, only) {
    const ups = (await checkUpdates(id)).filter(u => !only || only.includes(u.file)); let n = 0;
    for (const u of ups) { const f = primary(u.version); await download(f.url, path.join(modsDir(id), path.basename(f.filename)), { sha1: f.hashes && f.hashes.sha1 }); if (path.basename(f.filename) !== u.file) removeFile(id, u.file); n++; log.info(`Actualizado ${u.title}: ${u.from} → ${u.to}`); }
    return n;
  }

  /* ---------- Módulos rápidos (catálogo curado de mods de Modrinth) ---------- */
  const MF = id => path.join(profiles.dir(id), 'modules.json');
  const getMF = id => { try { return JSON.parse(fs.readFileSync(MF(id), 'utf8')); } catch { return {}; } };
  async function resolveItem(it, p) {
    if (it.s) { try { return (await json(`${MR}/project/${it.s}`)).id; } catch {} }
    if (it.q) { const r = await search({ q: it.q, type: 'mod', mc: p.mc, loader: p.loader }); return r.hits[0] && r.hits[0].id; }
    return null;
  }
  const moduleList = id => { const mf = getMF(id); return catalog.modules.map(m => ({ id: m.id, cat: m.cat, name: m.name, desc: m.desc, on: !!(mf[m.id] && mf[m.id].on) })); };
  async function setModule({ profile, id, on }, emit) {
    const mod = catalog.modules.find(x => x.id === id), p = profiles.get(profile), mf = getMF(profile);
    if (!mod) throw new Error('Módulo desconocido');
    if (!['fabric', 'quilt'].includes(p.loader)) throw new Error('Los módulos rápidos requieren un perfil Fabric o Quilt.');
    if (on) {
      const files = new Set(), seen = new Set(); let ok = 0;
      for (const it of mod.mods) { try { const pid = await resolveItem(it, p); if (!pid) throw 0; (await installProject({ profile, id: pid }, emit, seen)).forEach(f => files.add(f)); ok++; } catch { log.warn(`Módulo ${id}: no disponible ${it.s || it.q} para ${p.mc}`); } }
      if (!ok) throw new Error(`Ningún mod de «${mod.name}» existe para Minecraft ${p.mc}.`);
      mf[id] = { on: true, files: [...files] };
    } else {
      const used = new Set(); for (const [k, v] of Object.entries(mf)) if (k !== id && v.on) v.files.forEach(f => used.add(f));
      for (const f of (mf[id] ? mf[id].files : [])) if (!used.has(f)) { const a = path.join(modsDir(profile), f); if (fs.existsSync(a)) fs.renameSync(a, a + '.disabled'); }
      if (mf[id]) mf[id].on = false;
    }
    fs.writeFileSync(MF(profile), JSON.stringify(mf)); return moduleList(profile);
  }
  async function applyPreset({ profile, preset }, emit) {
    let ok = 0; const ids = catalog.presets[preset] || [];
    for (const id of ids) { try { emit && emit('task', { label: 'Módulo: ' + catalog.modules.find(x => x.id === id).name }); await setModule({ profile, id, on: true }, emit); ok++; } catch (e) { log.warn('Preset omitido: ' + id + ' — ' + e.message); } }
    return { ok, total: ids.length };
  }

  /* ---------- Modpacks (.mrpack) ---------- */
  async function importPack(file, fallbackName, emit) {
    const z = readZip(fs.readFileSync(file)), ie = z.find(e => e.name === 'modrinth.index.json'); if (!ie) throw new Error('El archivo no es un modpack de Modrinth (.mrpack)');
    const idx = JSON.parse(ie.data().toString('utf8')), dep = idx.dependencies || {}, hit = PACK_LOADERS.find(([k]) => dep[k]);
    const loader = hit ? hit[1] : 'vanilla', lv = hit ? dep[hit[0]] : null;
    const p = await profiles.create({ name: (idx.name || fallbackName || 'Modpack').slice(0, 40), mc: dep.minecraft, loader, loaderVersion: lv, icon: { type: 'emoji', v: '📦' } }, emit);
    const d = profiles.dir(p.id), files = (idx.files || []).filter(x => !(x.env && x.env.client === 'unsupported')); let n = 0;
    try {
      await pool(files, async x => {
        const dest = safeJoin(d, x.path); let err;
        for (const u of x.downloads) { try { await download(u, dest, { sha1: x.hashes && x.hashes.sha1 }); err = null; break; } catch (e) { err = e; } }
        if (err) throw err; emit && emit('progress', { label: 'Modpack', cur: ++n, total: files.length });
      });
      for (const e of z) for (const pre of ['overrides/', 'client-overrides/'])
        if (e.name.startsWith(pre) && !e.isDirectory) { const t = safeJoin(d, e.name.slice(pre.length)); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.data()); }
    } catch (e) { profiles.remove(p.id); throw e; }
    return profiles.get(p.id);
  }
  async function installPackProject(id, title, emit) {
    const v = await pickVersion(id, {}); if (!v) throw new Error('Este modpack no tiene versiones disponibles');
    const f = primary(v), tmp = path.join(paths.cache, 'packs', path.basename(f.filename));
    emit && emit('task', { label: 'Descargando modpack…' }); await download(f.url, tmp, { sha1: f.hashes && f.hashes.sha1 }); return importPack(tmp, title, emit);
  }
  return { search, categories, installProject, listFiles, toggle, removeFile, addLocal, checkUpdates, applyUpdates, moduleList, setModule, applyPreset, importPack, installPackProject };
};
