const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const H = require('./helpers'), { boot, PID, FakeClient, tmp, sha1 } = H;
const authed = async t => { const x = boot(); t.after(x.restore); await x.call('settings:set', { msClientId: '11111111-2222-3333-4444-555555555555' }); return x; };
const login = async x => x.call('acc:login');
const zipOf = (dir, entries) => { const f = path.join(dir, 'p.zip'); fs.writeFileSync(path.join(dir, 'e.json'), JSON.stringify(entries));
  execFileSync('python3', ['-c', `import zipfile,json,base64;e=json.load(open('${dir}/e.json'));z=zipfile.ZipFile('${f}','w',zipfile.ZIP_DEFLATED)\nfor k,v in e.items(): z.writestr(k,v)\nz.close()`]); return f; };

/* ---------- ajustes ---------- */
test('ajustes: valida y recomienda RAM', t => {
  const x = boot(); t.after(x.restore); const S = x.app.services.settings;
  assert.equal(S.get().ramMb, 6144);                        // 16 GB → 6 GB recomendados
  assert.throws(() => S.set({ ram: 100 }), /fuera de rango/); assert.throws(() => S.set({ accent: 'rojo' }), /Color/);
  assert.throws(() => S.set({ msClientId: 'abc' }), /UUID/);
  assert.equal(S.set({ ram: 4096, motion: false, bogus: 1 }).ramMb, 4096); assert.equal(S.get().bogus, undefined);
});
/* ---------- zip y descargas ---------- */
test('zip: lee, extrae y bloquea zip-slip', t => {
  const d = tmp(), { readZip, extractZip } = require('../src/main/zip');
  const ok = zipOf(d, { 'a/b.txt': 'hola', 'c.txt': 'x'.repeat(5000) });
  assert.deepEqual(readZip(fs.readFileSync(ok)).map(e => e.name).sort(), ['a/b.txt', 'c.txt']);
  const out = path.join(d, 'out'); extractZip(fs.readFileSync(ok), out); assert.equal(fs.readFileSync(path.join(out, 'a/b.txt'), 'utf8'), 'hola');
  const evil = zipOf(tmp(), { '../../evil.txt': 'x' }); assert.throws(() => extractZip(fs.readFileSync(evil), path.join(d, 'o2')), /Ruta no permitida/);
});
test('descargas: verifica SHA-1, reintenta en 5xx y no deja archivos corruptos', async t => {
  const x = boot(); t.after(x.restore); const { download } = require('../src/main/net'), d = tmp(), f = path.join(d, 'a.bin');
  x.w.files.set('https://cdn.test/a', Buffer.from('contenido'));
  await assert.rejects(download('https://cdn.test/a', f, { sha1: 'deadbeef' }), /Hash SHA-1/); assert.ok(!fs.existsSync(f) && !fs.existsSync(f + '.part'));
  assert.equal(await download('https://cdn.test/a', f, { sha1: sha1('contenido') }), true); assert.equal(await download('https://cdn.test/a', f, { sha1: sha1('contenido') }), false);   // caché
  let n = 0; const orig = global.fetch; global.fetch = async (u, i) => (++n < 3 ? new Response('x', { status: 503 }) : orig(u, i));
  x.w.files.set('https://cdn.test/b', Buffer.from('b')); await download('https://cdn.test/b', path.join(d, 'b.bin')); assert.equal(n, 3);
  await assert.rejects(download('https://cdn.test/zzz', path.join(d, 'z')), /404/);
});
/* ---------- Java ---------- */
test('java: detecta el del sistema, instala Temurin gestionado y valida rutas', async t => {
  const x = boot(); t.after(x.restore), J = x.app.services.java;
  assert.equal(J.parseMajor('openjdk version "1.8.0_392"'), 8); assert.equal(J.parseMajor('openjdk version "21.0.1" 2023'), 21);
  const sys = await J.detectSystem(); assert.ok(sys.length > 0, 'debe detectar al menos un Java instalado en esta máquina'); const real = sys[0];
  assert.equal(await J.resolve(real.major, 'auto'), real.path);                                          // auto: reutiliza el del sistema si coincide la versión
  const other = real.major === 17 ? 21 : 17, p = await J.resolve(other, 'auto'); assert.match(p, new RegExp('java/' + other + '/')); assert.ok(x.w.calls.some(c => c.url.includes('adoptium')));   // si no: instala Temurin gestionado
  assert.equal(await J.resolve(other, 'auto'), p);                                                         // ya instalado: sin nueva descarga
  await assert.rejects(J.resolve(17, '/no/existe/java'), /no es válido/);
  const l = await J.list(); assert.equal(l.managed.find(m => m.major === other).installed, true);
});
/* ---------- versiones ---------- */
test('versiones: lista todas, Java por versión y caché sin conexión', async t => {
  const x = boot(); t.after(x.restore), V = x.app.services.versions;
  const l = await V.list(); assert.deepEqual([...new Set(l.map(v => v.type))].sort(), ['old_beta', 'release', 'snapshot']);
  assert.equal(await V.javaMajor('1.21.1'), 21); assert.equal(await V.javaMajor('1.20.1'), 17); assert.equal(await V.javaMajor('1.16.5'), 8); assert.equal(await V.javaMajor('b1.7.3'), 8);
  const y = boot(); y.w.offline = false; await y.call('versions:list'); y.w.offline = true;
  const z = require('../src/main/versions')({ paths: y.app.services.paths, log: y.app.services.log }); assert.ok((await z.list()).length === 6);   // lee la caché
  y.restore();
});
/* ---------- cuentas Microsoft ---------- */
test('cuentas: sin Client ID explica cómo configurarlo', async t => {
  const x = boot(); t.after(x.restore); await assert.rejects(x.call('acc:login'), e => e.code === 'NO_CLIENT_ID' && /Azure/.test(e.message));
});
test('cuentas: flujo completo device-code → Xbox → XSTS → Minecraft, tokens cifrados', async t => {
  const x = await authed(t), codes = []; x.app.invoke; const orig = x.events.push.bind(x.events);
  const acc = await login(x);
  assert.equal(acc.name, 'Notch'); assert.equal(acc.variant, 'CLASSIC'); assert.ok(x.events.some(([c, d]) => c === 'auth:code' && d.user_code === 'ABCD1234'));
  assert.deepEqual(x.pf.opened, ['https://www.microsoft.com/link']);
  const raw = fs.readFileSync(x.app.services.paths.accounts, 'utf8'); assert.ok(!raw.includes('rt|'), 'el refresh token no debe estar en texto plano'); assert.ok(raw.includes('"refresh": "e:'));
  assert.equal(x.app.services.settings.get().activeAccount, PID.notch);
  const l = await x.call('acc:list'); assert.equal(l.accounts.length, 1); assert.equal(l.active, PID.notch);
});
test('cuentas: errores oficiales con mensajes claros', async t => {
  let x = await authed(t); x.w.owns = false; await assert.rejects(login(x), e => e.code === 'NO_LICENSE' && /no tiene Minecraft/.test(e.message));
  x = await authed(t); x.w.invalidApp = true; await assert.rejects(login(x), e => e.code === 'INVALID_APP' && /aka\.ms\/AppRegInfo/.test(e.message));
  for (const [code, name] of [[2148916233, 'NO_XBOX'], [2148916238, 'XBOX_CHILD'], [2148916235, 'XBOX_REGION']]) { x = await authed(t); x.w.xerr = code; await assert.rejects(login(x), e => e.code === name); }
  assert.equal((await x.call('acc:list')).accounts.length, 0, 'un inicio fallido no debe crear cuenta');
});
test('cuentas: varias cuentas, cambiar, renovar sesión, expiración y quitar', async t => {
  const x = await authed(t); await login(x); x.w.nextAcc = PID.alex; x.w.pending = 1; await login(x);
  let l = await x.call('acc:list'); assert.equal(l.accounts.length, 2); assert.equal(l.active, PID.alex);
  await x.call('acc:switch', { id: PID.notch }); assert.equal((await x.call('acc:list')).active, PID.notch);
  x.w.mcTtl = 60; x.w.nextAcc = PID.notch; x.w.pending = 1; await login(x);               // sesión de Notch que vence en 60 s → debe renovarse sola
  const au = x.app.services.auth, a1 = await au.authorization(PID.notch); assert.equal(a1.meta.type, 'msa'); assert.equal(a1.name, 'Notch'); assert.equal(a1.uuid, PID.notch);
  const before = x.w.refreshN; await au.authorization(PID.notch); assert.ok(x.w.refreshN > before, 'renovó con el refresh token');
  x.w.refreshBad = true; await au.authorization(PID.notch).then(() => assert.fail('debía expirar'), e => assert.equal(e.code, 'EXPIRED'));
  assert.equal((await x.call('acc:list')).accounts.find(a => a.id === PID.notch).status, 'expired');
  await x.call('acc:remove', { id: PID.notch }); l = await x.call('acc:list'); assert.equal(l.accounts.length, 1); assert.equal(l.active, PID.alex);
});
test('cuentas: actualiza el perfil (nombre/skin) y solo descarga skins del servidor oficial', async t => {
  const x = await authed(t); await login(x); x.w.profiles[PID.notch].name = 'NotchRenamed'; x.w.profiles[PID.notch].skins[0].variant = 'SLIM';
  await x.call('acc:refresh', { id: PID.notch }); const a = (await x.call('acc:list')).accounts[0]; assert.equal(a.name, 'NotchRenamed'); assert.equal(a.variant, 'SLIM');
  const png = await x.call('acc:skin', { id: PID.notch }); assert.match(png, /^data:image\/png;base64,/);
  const n = x.w.calls.filter(c => c.url.includes('textures')).length; await x.call('acc:skin', { id: PID.notch }); assert.equal(x.w.calls.filter(c => c.url.includes('textures')).length, n, 'segunda vez sale de la caché');
  const d = JSON.parse(fs.readFileSync(x.app.services.paths.accounts)); d.list[0].skinUrl = 'https://evil.example/skin.png'; fs.writeFileSync(x.app.services.paths.accounts, JSON.stringify(d));
  assert.equal(await x.call('acc:skin', { id: PID.notch }), null);
});
test('cuentas: cancelar el inicio de sesión', async t => {
  const x = await authed(t); x.w.pending = 9999; const p = login(x); await new Promise(r => setTimeout(r, 30)); await x.call('acc:cancel');
  await assert.rejects(p, e => e.code === 'CANCELLED');
});
/* ---------- perfiles y cargadores ---------- */
test('perfiles: crear con cada cargador, editar, duplicar, eliminar y aislarse', async t => {
  const x = boot(); t.after(x.restore);
  const van = await x.call('profile:create', { name: 'Vanilla', mc: '1.21.1', loader: 'vanilla', ram: 3072, resW: 1280, resH: 720, jvm: '-Dfoo=1' });
  assert.equal(van.vtype, 'release'); assert.equal(van.ram, 3072); assert.equal(x.app.services.settings.get().activeProfile, van.id);
  const fab = await x.call('profile:create', { name: 'Fabric', mc: '1.20.1', loader: 'fabric' }); assert.equal(fab.custom, 'fabric-loader-0.15.11-1.20.1');
  assert.ok(fs.existsSync(path.join(x.app.services.paths.root, 'versions', fab.custom, fab.custom + '.json')));
  const qui = await x.call('profile:create', { name: 'Quilt', mc: '1.20.1', loader: 'quilt' }); assert.equal(qui.custom, 'quilt-loader-0.26.0-1.20.1');
  await assert.rejects(x.call('profile:create', { name: 'x', mc: '9.9.9' }), /no válida/); await assert.rejects(x.call('profile:create', { name: 'x', mc: '1.20.1', loader: 'optifine' }), /Cargador/);
  assert.ok(!fs.readdirSync(x.app.services.paths.profiles).some(d => !fs.existsSync(path.join(x.app.services.paths.profiles, d, 'profile.json'))), 'un fallo no deja carpetas a medias');
  const up = await x.call('profile:update', { id: van.id, patch: { name: 'Renombrado', ram: 0, resW: 9999999 } }); assert.equal(up.name, 'Renombrado'); assert.equal(up.resW, 7680);
  await assert.rejects(x.call('profile:update', { id: van.id, patch: { ram: 50 } }), /fuera de rango/); await assert.rejects(x.call('profile:update', { id: van.id, patch: { name: '  ' } }), /nombre/);
  fs.writeFileSync(path.join(x.app.services.paths.profileDir(fab.id), 'mods', 'a.jar'), 'a');
  const dup = await x.call('profile:dup', { id: fab.id }); assert.notEqual(dup.id, fab.id); assert.equal(dup.mods, 1);
  fs.rmSync(path.join(x.app.services.paths.profileDir(dup.id), 'mods', 'a.jar')); assert.equal((await x.call('profile:list')).find(p => p.id === fab.id).mods, 1, 'borrar en la copia no toca el original');
  await x.call('profile:remove', { id: dup.id }); assert.ok(!fs.existsSync(x.app.services.paths.profileDir(dup.id)));
  await assert.rejects(x.call('profile:update', { id: '../../etc', patch: {} }), /no válido/);
});
test('perfiles: Forge y NeoForge usan el instalador oficial y detectan la versión creada', async t => {
  const x = boot(); t.after(x.restore);
  const root = x.app.services.paths.root; x.w.jre = H.makeJreTgz(tmp('jre-'), H.fakeJavaScript(`mkdir -p "$4/versions/1.20.1-forge-47.2.0" && echo '{}' > "$4/versions/1.20.1-forge-47.2.0/1.20.1-forge-47.2.0.json";`));
  const forge = await x.call('profile:create', { name: 'Forge', mc: '1.20.1', loader: 'forge' }); assert.equal(forge.custom, '1.20.1-forge-47.2.0'); assert.equal(forge.loaderVersion, '47.2.0');
  assert.ok(x.w.calls.some(c => c.url.includes('forge-1.20.1-47.2.0-installer.jar'))); assert.ok(fs.existsSync(path.join(root, 'launcher_profiles.json')));
  const y = boot(); t.after(y.restore); y.w.jre = H.makeJreTgz(tmp('jre-'), H.fakeJavaScript(`mkdir -p "$4/versions/neoforge-20.4.100" && echo '{}' > "$4/versions/neoforge-20.4.100/neoforge-20.4.100.json";`));
  const neo = await y.call('profile:create', { name: 'Neo', mc: '1.20.4', loader: 'neoforge' }); assert.equal(neo.custom, 'neoforge-20.4.100');   // elige la versión de NeoForge que corresponde a 1.20.4
  await assert.rejects(y.call('profile:create', { name: 'Neo', mc: '1.16.5', loader: 'neoforge' }), /No hay NeoForge/);
  const z = boot(); t.after(z.restore); await assert.rejects(z.call('profile:create', { name: 'F', mc: '1.20.1', loader: 'forge' }), /no se encontró la versión instalada/);
});
test('perfiles: cambiar de cargador e icono personalizado', async t => {
  const x = boot(); t.after(x.restore); const p = await x.call('profile:create', { name: 'P', mc: '1.20.1', loader: 'vanilla' });
  const q = await x.call('profile:loader', { id: p.id, loader: 'fabric' }); assert.equal(q.loader, 'fabric'); assert.ok(q.custom);
  const img = path.join(tmp(), 'i.png'); fs.writeFileSync(img, Buffer.alloc(100)); x.pf.dialogQueue.push(img);
  assert.equal((await x.call('profile:icon', { id: p.id })).icon.type, 'img'); assert.match(await x.call('profile:iconData', { id: p.id }), /^data:image\/png/);
  const big = path.join(tmp(), 'big.png'); fs.writeFileSync(big, Buffer.alloc(400 * 1024)); x.pf.dialogQueue.push(big); await assert.rejects(x.call('profile:icon', { id: p.id }), /300 KB/);
});
/* ---------- Modrinth ---------- */
const withProfile = async (t, loader = 'fabric') => { const x = boot(); t.after(x.restore); const p = await x.call('profile:create', { name: 'M', mc: '1.20.1', loader }); return { x, p, mods: () => fs.readdirSync(path.join(x.app.services.paths.profileDir(p.id), 'mods')).sort() }; };
test('modrinth: búsqueda con filtros de versión, cargador y categoría', async t => {
  const { x, p } = await withProfile(t, 'quilt');
  const r = await x.call('mr:search', { q: 'sod', type: 'mod', mc: p.mc, loader: p.loader, category: 'optimization', sort: 'downloads', offset: 24 });
  assert.equal(r.hits[0].title, 'Sodium'); const s = x.w.lastSearch; assert.match(s, /project_type:mod/); assert.match(s, /versions:1\.20\.1/); assert.match(s, /categories:quilt.*categories:fabric/); assert.match(s, /categories:optimization/); assert.match(s, /index=downloads/); assert.match(s, /offset=24/);
  assert.deepEqual(await x.call('mr:cats', { type: 'mod' }), ['optimization']);
});
test('modrinth: instala mods con dependencias, verifica hash y rechaza perfiles vanilla', async t => {
  const { x, p, mods } = await withProfile(t);
  assert.equal(await x.call('mr:install', { profile: p.id, id: 'gvQqBUqZ', type: 'mod' }), 2); assert.deepEqual(mods(), ['fabric-api-0.92.0.jar', 'lithium-0.12.0.jar']);
  x.w.mr.sodium.versions[0].files[0].hashes.sha1 = 'bad'; await assert.rejects(x.call('mr:install', { profile: p.id, id: 'AANobbMI' }), /Hash SHA-1/); assert.ok(!mods().includes('sodium-0.5.8.jar'));
  x.w.noCompat = ['modmenu']; await assert.rejects(x.call('mr:install', { profile: p.id, id: 'mOgUt4GM' }), /No hay versión compatible/);
  const v = await x.call('profile:create', { name: 'V', mc: '1.20.1', loader: 'vanilla' }); await assert.rejects(x.call('mr:install', { profile: v.id, id: 'AANobbMI' }), /Vanilla/);
});
test('modrinth: módulos rápidos comparten dependencias sin romperse al desactivar', async t => {
  const { x, p, mods } = await withProfile(t);
  await x.call('mod:set', { profile: p.id, id: 'fps', on: true }); assert.ok(mods().includes('sodium-0.5.8.jar') && mods().includes('lithium-0.12.0.jar') && mods().includes('fabric-api-0.92.0.jar'));   // ferrite etc. no existen: se omiten
  await x.call('mod:set', { profile: p.id, id: 'menu', on: true }); assert.ok(mods().includes('modmenu-7.2.2.jar'));
  await x.call('mod:set', { profile: p.id, id: 'fps', on: false });
  assert.ok(mods().includes('sodium-0.5.8.jar.disabled')); assert.ok(mods().includes('fabric-api-0.92.0.jar'), 'fabric-api sigue activo porque lo usa Mod Menu');
  const l = await x.call('mod:list', { id: p.id }); assert.equal(l.find(m => m.id === 'fps').on, false); assert.equal(l.find(m => m.id === 'menu').on, true);
  await x.call('mod:set', { profile: p.id, id: 'fps', on: true }); assert.ok(mods().includes('sodium-0.5.8.jar'));
  const v = await x.call('profile:create', { name: 'F', mc: '1.20.1', loader: 'forge' }).catch(() => null); // forge requiere instalador; se prueba el rechazo con vanilla:
  const van = await x.call('profile:create', { name: 'V', mc: '1.20.1', loader: 'vanilla' }); await assert.rejects(x.call('mod:set', { profile: van.id, id: 'fps', on: true }), /Fabric o Quilt/);
});
test('modrinth: preajustes crean el perfil con sus módulos', async t => {
  const x = boot(); t.after(x.restore); const p = await x.call('profile:create', { name: 'Perf', mc: '1.20.1', loader: 'fabric', preset: 'perf' });
  const names = fs.readdirSync(path.join(x.app.services.paths.profileDir(p.id), 'mods')); assert.ok(names.includes('sodium-0.5.8.jar') && names.includes('modmenu-7.2.2.jar'));
});
test('modrinth: gestión de archivos, importar .jar y actualizaciones por hash', async t => {
  const { x, p, mods } = await withProfile(t); const dir = path.join(x.app.services.paths.profileDir(p.id), 'mods');
  fs.writeFileSync(path.join(dir, 'sodium-0.5.3.jar'), 'sodium-0.5.3.jar@0.5.3');   // versión vieja (hash conocido por la API simulada)
  x.w.mr.old.files[0].hashes.sha1 = sha1('sodium-0.5.3.jar@0.5.3');
  const ups = await x.call('mods:check', { id: p.id }); assert.equal(ups.length, 1); assert.deepEqual([ups[0].title, ups[0].from, ups[0].to], ['Sodium', '0.5.3', '0.5.8']);
  assert.equal(await x.call('mods:update', { id: p.id }), 1); assert.deepEqual(mods(), ['sodium-0.5.8.jar']); assert.equal((await x.call('mods:check', { id: p.id })).length, 0);
  await x.call('mods:toggle', { id: p.id, file: 'sodium-0.5.8.jar' }); assert.deepEqual((await x.call('mods:list', { id: p.id }))[0], { file: 'sodium-0.5.8.jar.disabled', enabled: false });
  await x.call('mods:toggle', { id: p.id, file: 'sodium-0.5.8.jar.disabled' }); const jar = path.join(tmp(), 'mio.jar'); fs.writeFileSync(jar, 'x'); x.pf.dialogQueue.push(jar);
  assert.equal(await x.call('mods:add', { id: p.id }), true); assert.ok(mods().includes('mio.jar')); await x.call('mods:remove', { id: p.id, file: '../../mio.jar' }); assert.ok(!mods().includes('mio.jar'));
  fs.writeFileSync(jar.replace('.jar', '.txt'), 'x'); x.pf.dialogQueue.push(jar.replace('.jar', '.txt')); await assert.rejects(x.call('mods:add', { id: p.id }), /\.jar/);
});
test('modrinth: modpacks .mrpack (importar, overrides, filtros y zip-slip)', async t => {
  const x = boot(); t.after(x.restore); const f1 = x.w.file('pack-mod.jar', 'PACKMOD');
  const idx = { name: 'Mi Pack', dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.15.11' }, files: [{ path: 'mods/pack-mod.jar', downloads: [f1.url], hashes: { sha1: f1.hashes.sha1 } }, { path: 'mods/solo-servidor.jar', downloads: ['https://cdn.test/x'], hashes: {}, env: { client: 'unsupported' } }] };
  const pack = zipOf(tmp(), { 'modrinth.index.json': JSON.stringify(idx), 'overrides/config/a.toml': 'k=1', 'client-overrides/options.txt': 'fov:70' }); x.pf.dialogQueue.push(pack);
  const p = await x.call('pack:import'); assert.equal(p.name, 'Mi Pack'); assert.equal(p.loader, 'fabric'); const d = x.app.services.paths.profileDir(p.id);
  assert.equal(fs.readFileSync(path.join(d, 'mods/pack-mod.jar'), 'utf8'), 'PACKMOD'); assert.equal(fs.readFileSync(path.join(d, 'config/a.toml'), 'utf8'), 'k=1'); assert.ok(fs.existsSync(path.join(d, 'options.txt'))); assert.ok(!fs.existsSync(path.join(d, 'mods/solo-servidor.jar')));
  idx.files[0].path = '../../escape.jar'; x.pf.dialogQueue.push(zipOf(tmp(), { 'modrinth.index.json': JSON.stringify(idx) })); const before = (await x.call('profile:list')).length;
  await assert.rejects(x.call('pack:import'), /Ruta no permitida/); assert.equal((await x.call('profile:list')).length, before, 'un modpack fallido no deja perfil');
  x.pf.dialogQueue.push(zipOf(tmp(), { 'otra.txt': 'x' })); await assert.rejects(x.call('pack:import'), /no es un modpack/);
});
/* ---------- JUGAR ---------- */
const playable = async t => { const x = await authed(t); await login(x); const p = await x.call('profile:create', { name: 'Jugable', mc: '1.20.1', loader: 'fabric', ram: 2048, resW: 1280, resH: 720, jvm: '-Dmio=1' }); FakeClient.mode = 'ok'; return { x, p }; };
test('jugar: flujo completo de 7 pasos, argumentos reales y estado "en ejecución" verificado', async t => {
  const { x, p } = await playable(t); const r = await x.call('play', { id: p.id }); assert.equal(r.ok, true);
  const steps = x.events.filter(([c]) => c === 'play:step').map(([, d]) => d.step); assert.deepEqual([...new Set(steps)], ['account', 'license', 'profile', 'java', 'files', 'args', 'launch']);
  assert.ok(x.events.some(([c]) => c === 'play:running')); const o = FakeClient.last.opts;
  assert.equal(o.authorization.name, 'Notch'); assert.equal(o.authorization.meta.type, 'msa'); assert.equal(o.version.number, '1.20.1'); assert.equal(o.version.custom, 'fabric-loader-0.15.11-1.20.1');
  assert.equal(o.memory.max, '2048M'); assert.ok(o.customArgs.includes('-XX:+UseG1GC') && o.customArgs.includes('-Dmio=1')); assert.deepEqual(o.window, { width: 1280, height: 720 });
  assert.equal(o.overrides.gameDirectory, x.app.services.paths.profileDir(p.id)); assert.ok(fs.existsSync(o.javaPath));
  await assert.rejects(x.call('play', { id: p.id }), /Ya hay una instancia/);          // no permite doble inicio
  FakeClient.last.client.emit('close', 0); assert.ok(x.events.some(([c, d]) => c === 'play:closed' && d.code === 0 && !d.crashed));
  assert.equal(await x.call('play:state'), false); assert.ok((await x.call('profile:list'))[0].lastPlayed > 0);
});
test('jugar: no dice "iniciado" si Minecraft se cierra al arrancar (con log del error)', async t => {
  const { x, p } = await playable(t); FakeClient.mode = 'crash';
  await assert.rejects(x.call('play', { id: p.id }), /se cerró antes de iniciar \(código 1\)/); assert.ok(x.events.some(([c]) => c === 'play:error')); assert.ok(!x.events.some(([c]) => c === 'play:running'));
  FakeClient.mode = 'noproc'; await assert.rejects(x.call('play', { id: p.id }), /No se pudo crear el proceso/); assert.equal(await x.call('play:state'), false, 'tras fallar se puede reintentar');
});
test('jugar: exige cuenta, licencia válida y cargador instalado', async t => {
  const x = boot(); t.after(x.restore); const p = await x.call('profile:create', { name: 'P', mc: '1.20.1', loader: 'vanilla' });
  await assert.rejects(x.call('play', { id: p.id }), e => e.code === 'NO_ACCOUNT');
  const y = await authed(t); await login(y); const q = await y.call('profile:create', { name: 'Q', mc: '1.20.1', loader: 'fabric' }); y.w.owns = false; y.w.mcTtl = 1;
  y.app.services.auth.remove; const au = y.app.services.auth; await au.session(PID.notch).catch(() => {});
  await assert.rejects(y.call('play', { id: q.id }), e => ['NO_LICENSE', 'EXPIRED'].includes(e.code));
  const z = await authed(t); await login(z); const r = await z.call('profile:create', { name: 'R', mc: '1.20.1', loader: 'fabric' }); fs.rmSync(path.join(z.app.services.paths.root, 'versions'), { recursive: true });
  await assert.rejects(z.call('play', { id: r.id }), /Falta el cargador/);
});
/* ---------- IPC y utilidades ---------- */
test('ipc: errores estructurados, enlaces externos permitidos y registros', async t => {
  const x = boot(); t.after(x.restore); assert.deepEqual(await x.app.invoke('nada'), { ok: false, error: 'Acción desconocida: nada' });
  await x.call('app:external', { url: 'https://www.microsoft.com/link' }); await assert.rejects(x.call('app:external', { url: 'https://evil.example/' }), /no permitida/); await assert.rejects(x.call('app:external', { url: 'file:///etc/passwd' }), /no permitida/);
  await x.call('app:open', { what: 'logs' }); assert.ok(x.pf.paths.includes(x.app.services.paths.logs)); x.app.services.log.info('hola'); assert.ok((await x.call('log:tail')).some(l => l.includes('hola'))); await x.call('log:clear'); assert.equal((await x.call('log:tail')).length, 0);
  assert.equal((await x.call('app:info')).version, '1.0.0'); assert.equal((await x.call('app:update')).status, 'dev');
});
/* ---------- instalador ---------- */
test('instalador: configuración, iconos y documentos de firma presentes', () => {
  const root = path.join(__dirname, '..'), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))), b = pkg.build, n = b.nsis;
  assert.equal(b.productName, 'XTL Client'); assert.equal(n.oneClick, false); assert.equal(n.allowToChangeInstallationDirectory, true); assert.ok(n.createDesktopShortcut && n.createStartMenuShortcut); assert.equal(n.deleteAppDataOnUninstall, false);
  assert.ok(pkg.version && pkg.author && pkg.description && b.copyright, 'versión, editor, descripción y copyright');
  for (const f of [n.installerIcon, n.uninstallerIcon, n.license, n.installerSidebar, b.win.icon, 'docs/FIRMA-DIGITAL.md', 'docs/CONFIGURAR-MICROSOFT.md', '.github/workflows/build.yml', 'src/renderer/index.html', 'assets/modules.json']) assert.ok(fs.existsSync(path.join(root, f)), 'falta ' + f);
  const bmp = fs.readFileSync(path.join(root, n.installerSidebar)); assert.equal(bmp.readInt32LE(18), 164); assert.equal(bmp.readInt32LE(22), 314);
  const ico = fs.readFileSync(path.join(root, b.win.icon)); assert.equal(ico.readUInt16LE(2), 1); assert.ok(ico.readUInt16LE(4) >= 4);
  const wf = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8'); assert.match(wf, /CSC_LINK/); assert.match(wf, /SHA256/i);
  assert.ok(b.files.includes('src/**'));
});
