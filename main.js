const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), AdmZip = require('adm-zip');
const { execFile, spawn } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');

let win = null, auth = null, playing = false, MAN = null;
app.setAppUserModelId('com.xtl.client');
app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

const CAT = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'modules.json'), 'utf8'));
const UA = { 'User-Agent': 'xtl-client/1.0 (tu-correo@ejemplo.com)' };
const MR = 'https://api.modrinth.com/v2';
const JVM = ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+DisableExplicitGC'];
const U = () => app.getPath('userData');
const R = () => path.join(U(), 'minecraft'), INST = () => path.join(U(), 'instances'), JD = () => path.join(U(), 'java');
const safe = (b, rel) => { const t = path.resolve(b, rel); if (!t.startsWith(path.resolve(b) + path.sep)) throw new Error('Ruta no permitida: ' + rel); return t; };
const idir = n => safe(INST(), n);
const meta = n => JSON.parse(fs.readFileSync(path.join(idir(n), 'instance.json'), 'utf8'));
const MD = n => path.join(idir(n), 'mods');
const SF = () => path.join(U(), 'settings.json'), ACF = () => path.join(U(), 'accounts.json');
const TOTAL_GB = () => Math.round(os.totalmem() / 1073741824);
const MAXRAM = () => Math.max(2048, Math.floor(os.totalmem() / 1048576 * 0.75 / 512) * 512);
const recommended = () => { const t = os.totalmem() / 1073741824; return Math.min(MAXRAM(), (t <= 4 ? 2 : t <= 6 ? 3 : t <= 8 ? 4 : t <= 16 ? 6 : 8) * 1024); };
const getS = () => { let s = {}; try { s = JSON.parse(fs.readFileSync(SF(), 'utf8')); } catch {}
  return { ram: Math.min(s.ram || recommended(), MAXRAM()), java: s.java || 'auto', lite: s.lite === true, jvmOpt: s.jvmOpt !== false }; };
const setS = p => fs.writeFileSync(SF(), JSON.stringify({ ...getS(), ...p }));
const send = (c, d) => { if (win && !win.isDestroyed()) win.webContents.send(c, d); };

const j = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.json(); };
const dl = async (u, f) => { fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u} → ${r.status}`);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); };
const pool = async (items, fn, n = 6) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); };
const run = (cmd, args, opts) => new Promise((res, rej) => {
  const p = spawn(cmd, args, opts), log = d => { const l = String(d).trim().split('\n').pop(); if (l) send('log', l.slice(0, 160)); };
  p.stdout.on('data', log); p.stderr.on('data', log); p.on('error', rej);
  p.on('close', c => c === 0 ? res() : rej(new Error('El instalador terminó con código ' + c)));
});

/* ---------- Versiones de Mojang ---------- */
const manifest = async () => MAN || (MAN = await j('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'));
ipcMain.handle('mc:versions', async () => (await manifest()).versions.map(v => ({ id: v.id, type: v.type })));

/* ---------- Java integrado (Eclipse Temurin / Adoptium) ---------- */
async function javaFor(mcv) {
  try { const e = (await manifest()).versions.find(v => v.id === mcv), mv = (await j(e.url)).javaVersion?.majorVersion || 8; return mv === 16 ? 17 : mv; }
  catch { return 17; }
}
function findJava(v) {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const walk = (d, depth) => { if (depth > 6 || !fs.existsSync(d)) return null;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
      if (e.isFile() && e.name === exe && path.basename(d) === 'bin') return p;
      if (e.isDirectory()) { const r = walk(p, depth + 1); if (r) return r; } } return null; };
  return walk(path.join(JD(), String(v)), 0);
}
async function installJava(v) {
  if (findJava(v)) return;
  const dir = path.join(JD(), String(v)); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const o = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux', a = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const f = path.join(dir, o === 'windows' ? 'java.zip' : 'java.tgz');
  send('log', `Descargando Java ${v}…`);
  await dl(`https://api.adoptium.net/v3/binary/latest/${v}/ga/${o}/${a}/jre/hotspot/normal/eclipse`, f);
  send('log', `Instalando Java ${v}…`);
  await new Promise((res, rej) => execFile('tar', ['-xf', f, '-C', dir], e => e ? rej(e) : res()));
  fs.rmSync(f, { force: true });
  if (!findJava(v)) throw new Error('No se pudo instalar Java ' + v);
  send('log', `Java ${v} instalado ✓`);
}
const ensureJava = async mcv => { const v = await javaFor(mcv); await installJava(v); return findJava(v); };
ipcMain.handle('java:list', () => [8, 17, 21, 25].map(v => ({ v, installed: !!findJava(v) })));
ipcMain.handle('java:install', (_, v) => installJava(v));

/* ---------- Ajustes ---------- */
ipcMain.handle('set:get', () => ({ ...getS(), maxRam: MAXRAM(), recRam: recommended(), totalGB: TOTAL_GB() }));
ipcMain.handle('set:save', (_, p) => setS(p));
ipcMain.handle('game:state', () => playing);

/* ---------- Cuentas: varias cuentas y cambio con un clic ---------- */
const enc = s => safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(s).toString('base64') : 'p:' + s;
const dec = s => s.startsWith('e:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : s.slice(2);
const getA = () => { try { return JSON.parse(fs.readFileSync(ACF(), 'utf8')); } catch { return { list: [], active: null }; } };
const setA = a => fs.writeFileSync(ACF(), JSON.stringify(a));
const pub = a => ({ id: a.id, type: a.type, name: a.name, uuid: a.uuid });
async function activate(id) {
  const A = getA(), a = A.list.find(x => x.id === id); if (!a) return;
  if (a.type === 'offline') auth = await Authenticator.getAuth(a.name);
  else { try { const x = await new Auth('select_account').refresh(dec(a.token)), t = await x.getMinecraft(); auth = t.mclc(); a.token = enc(x.save()); }
    catch { throw new Error('La sesión de ' + a.name + ' expiró. Vuelve a iniciar sesión con Microsoft.'); } }
  A.active = id; setA(A);
}
ipcMain.handle('acc:list', () => { const A = getA(); return { list: A.list.map(pub), active: A.active }; });
ipcMain.handle('acc:premium', async () => {
  const x = await new Auth('select_account').launch('electron'), t = await x.getMinecraft();
  const A = getA(), id = t.profile.id, rec = { id, type: 'premium', name: t.profile.name, uuid: id, token: enc(x.save()) };
  const i = A.list.findIndex(a => a.id === id); if (i >= 0) A.list[i] = rec; else A.list.push(rec);
  A.active = id; setA(A); auth = t.mclc(); return pub(rec);
});
ipcMain.handle('acc:offline', async (_, name) => {
  name = (name || '').trim(); if (!/^\w{3,16}$/.test(name)) throw new Error('El nombre debe tener 3 a 16 letras, números o _');
  const A = getA(), id = 'off:' + name; if (!A.list.find(a => a.id === id)) A.list.push({ id, type: 'offline', name, uuid: null });
  A.active = id; setA(A); auth = await Authenticator.getAuth(name);
});
ipcMain.handle('acc:switch', (_, id) => activate(id));
ipcMain.handle('acc:remove', async (_, id) => {
  const A = getA(); A.list = A.list.filter(a => a.id !== id);
  if (A.active === id) { A.active = A.list[0] ? A.list[0].id : null; auth = null; } setA(A);
  if (A.active && !auth) await activate(A.active);
});

/* ---------- Loaders: Fabric, Forge, NeoForge ---------- */
async function installLoader(mcv, loader, lv) {
  if (loader === 'vanilla') return null;
  if (loader === 'fabric') {
    lv = lv || (await j(`https://meta.fabricmc.net/v2/versions/loader/${mcv}`))[0].loader.version;
    const prof = await j(`https://meta.fabricmc.net/v2/versions/loader/${mcv}/${lv}/profile/json`);
    const vd = path.join(R(), 'versions', prof.id); fs.mkdirSync(vd, { recursive: true });
    fs.writeFileSync(path.join(vd, prof.id + '.json'), JSON.stringify(prof)); return prof.id;
  }
  const jp = await ensureJava(mcv), root = R(); fs.mkdirSync(path.join(root, 'versions'), { recursive: true });
  const lp = path.join(root, 'launcher_profiles.json'); if (!fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ profiles: {} }));
  let url;
  if (loader === 'forge') {
    if (!lv) { const p = (await j('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos;
      lv = p[mcv + '-recommended'] || p[mcv + '-latest']; if (!lv) throw new Error('No hay Forge para Minecraft ' + mcv); }
    url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcv}-${lv}/forge-${mcv}-${lv}-installer.jar`;
  } else {
    if (!lv) { const [, mi, pa] = mcv.split('.'), pre = `${mi}.${pa || 0}.`;
      const vs = (await j('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')).versions.filter(x => x.startsWith(pre) && !/alpha|beta/.test(x));
      if (!vs.length) throw new Error('No hay NeoForge para Minecraft ' + mcv + ' (solo desde 1.20.2)'); lv = vs[vs.length - 1]; }
    url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${lv}/neoforge-${lv}-installer.jar`;
  }
  const jar = path.join(app.getPath('temp'), `${loader}-${lv}-installer.jar`);
  send('log', `Descargando instalador de ${loader} ${lv}…`); await dl(url, jar);
  send('log', `Instalando ${loader} ${lv} (puede tardar unos minutos)…`);
  await run(jp, ['-jar', jar, '--installClient', root], { cwd: root });
  const id = fs.readdirSync(path.join(root, 'versions')).find(d => d.includes(lv) && (loader === 'neoforge' ? d.includes('neoforge') : d.includes('forge') && !d.includes('neoforge')));
  if (!id) throw new Error('No se encontró la versión instalada de ' + loader); return id;
}

/* ---------- Perfiles aislados ---------- */
async function createInst(name, mcv, loader, lv, vtype) {
  const base = (name || '').replace(/[^\w .-]/g, '').trim() || 'Perfil'; name = base; let i = 2;
  while (fs.existsSync(idir(name))) name = `${base} ${i++}`;
  fs.mkdirSync(path.join(idir(name), 'mods'), { recursive: true });
  try { const custom = await installLoader(mcv, loader, lv);
    fs.writeFileSync(path.join(idir(name), 'instance.json'), JSON.stringify({ mc: mcv, loader, custom, vtype: vtype || 'release' })); return name;
  } catch (e) { fs.rmSync(idir(name), { recursive: true, force: true }); throw e; }
}
const modFiles = n => fs.existsSync(MD(n)) ? fs.readdirSync(MD(n)).filter(f => /\.jar(\.disabled)?$/.test(f)) : [];
ipcMain.handle('inst:list', () => fs.existsSync(INST()) ? fs.readdirSync(INST()).filter(n => fs.existsSync(path.join(idir(n), 'instance.json'))).map(n => ({ name: n, ...meta(n), mods: modFiles(n).filter(f => !f.endsWith('.disabled')).length })) : []);
ipcMain.handle('inst:delete', (_, n) => fs.rmSync(idir(n), { recursive: true, force: true }));
ipcMain.handle('inst:open', (_, n) => shell.openPath(idir(n)));
ipcMain.handle('inst:dup', (_, n) => { let c = `${n} copia`, i = 2; while (fs.existsSync(idir(c))) c = `${n} copia ${i++}`; fs.cpSync(idir(n), idir(c), { recursive: true }); return c; });

/* ---------- Mods (Modrinth) y módulos estilo Lunar ---------- */
async function installMod(id, inst, seen = new Set(), out = []) {
  if (seen.has(id)) return out; seen.add(id); const m = meta(inst);
  if (m.loader === 'vanilla') throw new Error('Este perfil es Vanilla. Crea uno con Fabric, Forge o NeoForge para usar mods.');
  const q = k => encodeURIComponent(JSON.stringify(k));
  const vs = await j(`${MR}/project/${id}/version?loaders=${q([m.loader])}&game_versions=${q([m.mc])}`);
  if (!vs.length) throw new Error(`No hay versión compatible con ${m.mc} + ${m.loader}`);
  const v = vs[0], f = v.files.find(x => x.primary) || v.files[0], fn = path.basename(f.filename), dest = path.join(MD(inst), fn);
  if (fs.existsSync(dest + '.disabled')) fs.renameSync(dest + '.disabled', dest);
  else if (!fs.existsSync(dest)) { await dl(f.url, dest); send('log', 'Instalado: ' + fn); }
  out.push(fn);
  for (const d of v.dependencies) if (d.dependency_type === 'required' && d.project_id) await installMod(d.project_id, inst, seen, out);
  return out;
}
async function resolve(it, m) {
  if (it.s) { try { return (await j(`${MR}/project/${it.s}`)).id; } catch {} }
  if (it.q) { const f = [['project_type:mod'], [`versions:${m.mc}`], [`categories:${m.loader}`]];
    const r = await j(`${MR}/search?limit=1&query=${encodeURIComponent(it.q)}&facets=${encodeURIComponent(JSON.stringify(f))}`); return r.hits[0] && r.hits[0].project_id; }
  return null;
}
const MF = n => path.join(idir(n), 'modules.json');
const getMF = n => { try { return JSON.parse(fs.readFileSync(MF(n), 'utf8')); } catch { return {}; } };
async function setModule(inst, id, on) {
  const mod = CAT.modules.find(x => x.id === id), mf = getMF(inst), m = meta(inst);
  if (!mod) throw new Error('Módulo desconocido');
  if (m.loader !== 'fabric') throw new Error('Los módulos requieren un perfil Fabric.');
  if (on) {
    const files = new Set(), seen = new Set(); let ok = 0;
    for (const it of mod.mods) { try { const pid = await resolve(it, m); if (!pid) throw 0; (await installMod(pid, inst, seen)).forEach(f => files.add(f)); ok++; }
      catch { send('log', `No disponible para ${m.mc}: ${it.s || it.q}`); } }
    if (!ok) throw new Error(`Ningún mod de «${mod.name}» existe para Minecraft ${m.mc}.`);
    mf[id] = { on: true, files: [...files] };
  } else {
    const used = new Set(); Object.entries(mf).forEach(([k, v]) => { if (k !== id && v.on) v.files.forEach(f => used.add(f)); });
    for (const f of (mf[id] ? mf[id].files : [])) if (!used.has(f)) { const a = path.join(MD(inst), f); if (fs.existsSync(a)) fs.renameSync(a, a + '.disabled'); }
    if (mf[id]) mf[id].on = false;
  }
  fs.writeFileSync(MF(inst), JSON.stringify(mf));
}
ipcMain.handle('mod:list', (_, n) => { const mf = getMF(n); return CAT.modules.map(x => ({ id: x.id, cat: x.cat, name: x.name, desc: x.desc, on: !!(mf[x.id] && mf[x.id].on) })); });
ipcMain.handle('mod:set', (_, { inst, id, on }) => setModule(inst, id, on));
ipcMain.handle('mods:list', (_, n) => modFiles(n).map(f => ({ file: f, on: !f.endsWith('.disabled') })));
ipcMain.handle('mods:toggle', (_, { inst, file }) => { const f = path.basename(file), a = path.join(MD(inst), f); fs.renameSync(a, f.endsWith('.disabled') ? a.slice(0, -9) : a + '.disabled'); });
ipcMain.handle('mods:remove', (_, { inst, file }) => fs.rmSync(path.join(MD(inst), path.basename(file)), { force: true }));
ipcMain.handle('mr:search', async (_, { q, type, mc: mcv, loader }) => {
  const f = [[`project_type:${type}`]]; if (mcv) f.push([`versions:${mcv}`]); if (loader && loader !== 'all' && loader !== 'vanilla') f.push([`categories:${loader}`]);
  const r = await j(`${MR}/search?limit=24&query=${encodeURIComponent(q || '')}&facets=${encodeURIComponent(JSON.stringify(f))}`);
  return r.hits.map(h => ({ id: h.project_id, title: h.title, desc: h.description, icon: h.icon_url, dl: h.downloads }));
});
ipcMain.handle('mr:mod', async (_, { id, inst }) => { await installMod(id, inst); });

ipcMain.handle('inst:create', async (_, a) => {
  await ensureJava(a.mc);
  const name = await createInst(a.name, a.mc, a.loader, null, a.vtype);
  const ids = CAT.presets[a.preset] || [];
  if (ids.length && a.loader === 'fabric') { let ok = 0;
    for (const id of ids) { try { send('log', 'Instalando módulo: ' + CAT.modules.find(x => x.id === id).name + '…'); await setModule(name, id, true); ok++; } catch (e) { send('log', 'Omitido: ' + id); } }
    send('log', `Perfil listo (${ok}/${ids.length} módulos) ✓`); }
  return name;
});

/* ---------- Modpacks (.mrpack de Modrinth) ---------- */
async function importPack(file, title) {
  const z = new AdmZip(file), idx = JSON.parse(z.readAsText('modrinth.index.json')), dep = idx.dependencies;
  const loader = dep['fabric-loader'] ? 'fabric' : dep.neoforge ? 'neoforge' : dep.forge ? 'forge' : null;
  if (!loader) throw new Error('Este modpack usa Quilt (aún no soportado). Prueba con uno de Fabric, Forge o NeoForge.');
  await ensureJava(dep.minecraft);
  const name = await createInst(title, dep.minecraft, loader, dep['fabric-loader'] || dep.neoforge || dep.forge, 'release'), d = idir(name);
  const files = idx.files.filter(x => !(x.env && x.env.client === 'unsupported')); let n = 0;
  await pool(files, async x => { await dl(x.downloads[0], safe(d, x.path)); send('prog', { label: 'Modpack', cur: ++n, total: files.length }); });
  for (const e of z.getEntries()) for (const pre of ['overrides/', 'client-overrides/'])
    if (e.entryName.startsWith(pre) && !e.isDirectory) { const t = safe(d, e.entryName.slice(pre.length)); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.getData()); }
  return name;
}
ipcMain.handle('mr:pack', async (_, { id, title }) => {
  const v = (await j(`${MR}/project/${id}/version`))[0], f = v.files.find(x => x.primary) || v.files[0];
  const tmp = path.join(app.getPath('temp'), 'xtl-pack.mrpack'); await dl(f.url, tmp); return importPack(tmp, title);
});
ipcMain.handle('pack:import', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Modpack de Modrinth', extensions: ['mrpack'] }], properties: ['openFile'] });
  return r.canceled ? null : importPack(r.filePaths[0], path.basename(r.filePaths[0], '.mrpack'));
});

/* ---------- Jugar ---------- */
ipcMain.handle('play', async (_, name) => {
  if (playing) throw new Error('Ya hay una instancia del juego abierta.');
  if (!auth) throw new Error('Inicia sesión primero (arriba a la derecha o en Ajustes → Cuentas).');
  const m = meta(name), S = getS(), jv = S.java === 'auto' ? await javaFor(m.mc) : +S.java;
  if (!findJava(jv)) await installJava(jv);
  const l = new Client();
  l.on('progress', e => send('prog', { label: e.type, cur: e.task, total: e.total }));
  l.on('debug', e => send('log', e));
  l.on('close', c => { playing = false; if (!win) createWindow(); setTimeout(() => { send('game', 'closed'); send('log', 'Juego cerrado (' + c + ')'); }, 800); });
  await l.launch({ authorization: auth, root: R(), javaPath: findJava(jv),
    version: { number: m.mc, type: m.vtype || 'release', custom: m.custom || undefined },
    memory: { max: S.ram + 'M', min: Math.min(2048, S.ram) + 'M' }, customArgs: S.jvmOpt ? JVM : [], overrides: { gameDirectory: idir(name) } });
  playing = true; send('game', 'running');
  if (S.lite) setTimeout(() => { if (playing && win) win.close(); }, 2500);
});

function createWindow() {
  win = new BrowserWindow({ width: 1180, height: 760, minWidth: 960, minHeight: 620, backgroundColor: '#0a0c11', autoHideMenuBar: true, title: 'XTL Client',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), spellcheck: false } });
  win.loadFile('index.html'); win.on('closed', () => { win = null; });
}
app.whenReady().then(async () => {
  const A = getA(); if (A.active) try { await activate(A.active); } catch {}
  createWindow();
  if (app.isPackaged) try { require('electron-updater').autoUpdater.checkForUpdatesAndNotify(); } catch {}   // actualizaciones automáticas
});
app.on('window-all-closed', () => { if (!playing) app.quit(); });
