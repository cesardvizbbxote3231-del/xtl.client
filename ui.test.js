// Prueba de interfaz en Chromium real: la UI se conecta a los MISMOS manejadores del backend (con red simulada).
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { boot, FakeClient, PID, tmp, sha1 } = require('./helpers');
const SHOTS = process.env.SHOTS || '/tmp/shots';
let page, x, passed = 0; const failed = [], errors = [];
async function step(name, fn) { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed.push(name); console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      ')); try { await page.screenshot({ path: `${SHOTS}/FAIL-${failed.length}.png` }); } catch {} } }
const vis = sel => page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 12000 });
const nav = v => page.click(`.nb[data-v="${v}"]`);
const shot = n => page.screenshot({ path: `${SHOTS}/${n}.png` });
async function noDeadButtons(label) {   // cada control interactivo debe tener una acción real conectada
  const r = await page.evaluate(() => { const miss = []; const grab = (attr, map) => document.querySelectorAll(`[${attr}]`).forEach(e => { const k = e.getAttribute(attr); if (typeof X[map][k] !== 'function') miss.push(`${attr}=${k}`); });
    grab('data-act', 'acts'); grab('data-chg', 'chg'); grab('data-inp', 'inp'); document.querySelectorAll('[data-after]').forEach(e => { const k = e.dataset.after; if (typeof X.chg[k] !== 'function') miss.push('after=' + k); }); return { miss, n: document.querySelectorAll('[data-act],[data-chg],[data-inp]').length }; });
  assert.deepEqual(r.miss, [], `${label}: controles sin acción`); return r.n;
}
(async () => {
  x = boot({ client: FakeClient, onEvent: (c, d) => { if (page) page.evaluate(([c, d]) => window.__emit && window.__emit(c, d), [c, d]).catch(() => {}); } });
  x.w.skinPng = fs.readFileSync('/tmp/skin.png'); x.w.mrUpdates = {};
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  page = await ctx.newPage(); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('dialog', d => d.accept());
  await page.exposeFunction('__invoke', async (ch, arg) => { const r = await x.app.invoke(ch, arg); return r.ok ? r : { ok: false, error: r.error, code: r.code }; });
  await page.addInitScript(() => { const L = {}; window.__emit = (c, d) => (L[c] || []).forEach(f => f(d));
    window.api = { async invoke(ch, a) { const r = await window.__invoke(ch, a); if (!r.ok) { const e = new Error(r.error); e.code = r.code; throw e; } return r.data; }, on(c, f) { (L[c] = L[c] || []).push(f); return () => {}; } }; });
  await page.goto('file://' + path.resolve(__dirname, '../src/renderer/index.html'));
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify({ ...X.S, skins: Object.keys(X.S.skins).length, versions: X.S.versions.length })));
  console.log('\nINTERFAZ');

  await step('arranca: 6 secciones, Inicio visible, sin sesión', async () => {
    await vis('#home .banner'); assert.equal(await page.locator('.nb').count(), 6); assert.equal(await page.textContent('#pt'), 'Inicio');
    assert.match(await page.textContent('#home'), /Inicia sesión con Microsoft/);
  });
  await step('navegación: cada sección se muestra y ningún botón queda sin acción', async () => {
    let total = 0;
    for (const [v, title] of [['accounts', 'Cuentas'], ['profiles', 'Perfiles'], ['modules', 'Módulos'], ['explore', 'Explorar'], ['settings', 'Ajustes'], ['home', 'Inicio']]) {
      await nav(v); await vis('#' + v); assert.equal(await page.textContent('#pt'), title); await page.waitForTimeout(250);
      for (const o of await page.$$eval('main>section', s => s.map(e => [e.id, !e.hidden]))) assert.equal(o[1], o[0] === v, `solo ${v} visible`); total += await noDeadButtons(v);
    }
    console.log('       controles revisados:', total);
  });
  await step('JUGAR sin cuenta lleva a Cuentas (no finge iniciar)', async () => { await nav('home'); await page.click('#playbtn'); await vis('#accounts'); assert.equal(await page.textContent('#pt'), 'Cuentas'); });
  await step('login sin Client ID: explica qué falta y abre la configuración', async () => {
    await page.click('[data-act="login"]'); await vis('.banner.err'); assert.match(await page.textContent('.banner.err'), /Client ID/); assert.ok(await page.$eval('details.card', d => d.open));
  });
  await step('guardar Client ID inválido muestra error; válido se guarda', async () => {
    await page.fill('#cid', 'no-es-uuid'); await page.click('[data-act="saveClientId"]'); await page.waitForSelector('.toast.err', { timeout: 5000 });
    await page.fill('#cid', '11111111-2222-3333-4444-555555555555'); await page.click('[data-act="saveClientId"]'); await until(() => X.S.settings.msClientId.startsWith('1111'));
  });
  await step('login Microsoft: muestra el código, abre Microsoft, crea la cuenta y la skin', async () => {
    x.w.pending = 100000; await page.click('[data-act="login"]'); await vis('#devcode'); assert.equal(await page.textContent('#devcode'), 'ABCD1234'); await vis('[data-act="cancelLogin"]'); await vis('[data-act="copyCode"]'); x.w.pending = 0;
    await until(() => X.S.accounts.length === 1 && X.S.skins[X.S.active] && X.S.skins[X.S.active].head); assert.deepEqual(x.pf.opened, ['https://www.microsoft.com/link']);
    assert.match(await page.textContent('.accbtn'), /Notch/); await page.waitForSelector('#skDetail .md', { state: 'attached' }); assert.equal(await page.locator('#skDetail .pt').count(), 12); assert.equal(await page.locator('#skDetail .f').count(), 72);
    assert.match(await page.textContent('#accounts'), /Verificada con Mojang/); assert.match(await page.textContent('#accounts'), /Steve/); await page.waitForTimeout(400); await shot('1-cuentas');
  });
  await step('menú de usuario: avatar, nombre, tipo y estado; agregar y cambiar de cuenta (Alex/SLIM)', async () => {
    x.w.nextAcc = PID.alex; x.w.pending = 1; await page.click('.accbtn'); await vis('.menu'); const m = await page.textContent('.menu'); assert.match(m, /Notch/); assert.match(m, /Cuenta Microsoft/); assert.match(m, /Sesión válida/); assert.ok(await page.$('.menu img.av'));
    await shot('2-menu'); await page.click('[data-act="addAccount"]'); await until(() => X.S.accounts.length === 2 && X.S.active === '853c80ef3c3749fdaa49938b674adae6');
    assert.match(await page.textContent('.accbtn'), /AlexPro/); await page.waitForSelector('#skDetail .md', { state: 'attached' }); await page.waitForTimeout(300);
    const w = await page.$$eval('#skDetail .pt', p => p.map(e => e.firstChild.style.width)); assert.ok(w.includes('18px'), 'brazos de 3 px (Alex) = 18px: ' + w);
    await page.click('.accbtn'); await page.click('[data-act="switchAcc"]'); await until(() => X.S.active === '069a79f444e94726a5befca90e38aaf5'); assert.match(await page.textContent('.accbtn'), /Notch/);
  });
  await step('actualizar perfil/skin desde Cuentas y gestionar cuentas guardadas', async () => {
    x.w.profiles[PID.notch].name = 'NotchNuevo'; await page.click('#accounts .it[data-id="069a79f444e94726a5befca90e38aaf5"]'); await page.click('[data-act="refreshAcc"]'); await until(() => X.S.accounts.find(a => a.id === '069a79f444e94726a5befca90e38aaf5').name === 'NotchNuevo');
    await page.click('#accounts .it[data-id="853c80ef3c3749fdaa49938b674adae6"]'); assert.match(await page.textContent('#accounts h1'), /AlexPro/); await page.click('[data-act="useAcc"]'); await until(() => X.S.active.startsWith('853c'));
    await page.click('[data-act="logoutAcc"]'); await until(() => X.S.accounts.length === 1); await page.click('[data-act="useAcc"]').catch(() => {}); await until(() => X.S.active.startsWith('069a'));
  });
  await step('perfiles: crear con preajuste, aparece en la lista y se instalan sus módulos', async () => {
    await nav('profiles'); await page.click('.row [data-act="newProfile"]'); await vis('.dlg'); await noDeadButtons('editor');
    await page.fill('[data-bind="editor.draft.name"]', 'PvP Fabric'); await page.selectOption('select[data-bind="editor.draft.mc"]', '1.20.1'); await page.selectOption('select[data-bind="editor.draft.loader"]', 'fabric'); await page.selectOption('select[data-bind="editor.draft.preset"]', 'perf');
    await page.click('[data-act="pickIcon"][data-v="⚔️"]'); assert.equal(await page.$eval('.dlg', d => d.classList.contains('enter')), false, 'el diálogo no se vuelve a animar al cambiar opciones'); await page.waitForTimeout(350); await shot('3-editor'); await page.click('[data-act="saveProfile"]'); await page.waitForSelector('.dlg', { state: 'detached', timeout: 20000 });
    await until(() => X.S.profiles.length === 1); const p = (await x.call('profile:list'))[0]; assert.equal(p.name, 'PvP Fabric'); assert.equal(p.icon.v, '⚔️'); assert.ok(p.mods >= 3);
    assert.match(await page.textContent('#profiles'), /PvP Fabric/); await shot('4-perfiles');
  });
  await step('perfiles: errores de validación visibles, editar RAM/Java/resolución/JVM, duplicar y eliminar', async () => {
    await page.click('#profiles [data-act="newProfile"]'); await vis('.dlg'); await page.fill('[data-bind="editor.draft.name"]', '  '); await page.click('[data-act="saveProfile"]'); await vis('.dlg .banner.err'); assert.match(await page.textContent('.dlg .banner.err'), /nombre/); await page.click('[data-act="closeEditor"]');
    await page.click('[data-act="editProfile"]'); await vis('.dlg'); await page.fill('[data-bind="editor.draft.name"]', 'PvP Pro'); await page.fill('[data-bind="editor.draft.resW"]', '1280'); await page.fill('[data-bind="editor.draft.resH"]', '720'); await page.fill('[data-bind="editor.draft.jvm"]', '-Dtest=1');
    await page.$eval('[data-bind="editor.draft.ram"]', el => { el.value = 3072; el.dispatchEvent(new Event('input', { bubbles: true })); }); assert.match(await page.textContent('#edram'), /3 GB/);
    await page.click('[data-act="saveProfile"]'); await page.waitForSelector('.dlg', { state: 'detached' }); await until(() => X.S.profiles[0].name === 'PvP Pro'); const p = (await x.call('profile:list'))[0]; assert.deepEqual([p.ram, p.resW, p.resH, p.jvm], [3072, 1280, 720, '-Dtest=1']);
    await page.click('[data-act="dupProfile"]'); await until(() => X.S.profiles.length === 2); await page.click('[data-act="delProfile"] >> nth=1'); await until(() => X.S.profiles.length === 1);
    const img = path.join(tmp(), 'i.png'); fs.writeFileSync(img, Buffer.alloc(80)); x.pf.dialogQueue.push(img); await page.click('[data-act="editProfile"]'); await page.click('[data-act="iconImage"]'); await until(() => X.S.profiles[0].icon.type === 'img'); await page.click('[data-act="closeEditor"]');
  });
  await step('JUGAR: 7 pasos con progreso, estado "en ejecución" real y cierre del juego', async () => {
    FakeClient.mode = 'ok'; await nav('home'); await vis('#playbtn'); await page.click('#playbtn'); await until(() => X.S.play.phase === 'running'); assert.match(await page.textContent('#state'), /en ejecución/); assert.match(await page.textContent('#playbtn'), /EN JUEGO/);
    assert.equal(await page.locator('#steps i.d').count(), 7); assert.equal(await page.$eval('#playbtn', b => b.disabled), true); assert.equal(FakeClient.last.opts.memory.max, '3072M'); assert.deepEqual(FakeClient.last.opts.window, { width: 1280, height: 720 });
    await shot('5-jugando'); FakeClient.last.client.emit('close', 0); await until(() => X.S.play.phase === 'idle'); assert.match(await page.textContent('#playbtn'), /JUGAR/);
  });
  await step('JUGAR: si Minecraft falla al arrancar muestra el error (no dice "iniciado")', async () => {
    FakeClient.mode = 'crash'; await page.click('#playbtn'); await vis('#home .banner.err'); assert.match(await page.textContent('#home .banner.err'), /se cerró antes de iniciar/); assert.match(await page.textContent('#state'), /Error/); await shot('6-error-juego'); FakeClient.mode = 'ok';
  });
  await step('módulos: rápidos (instalar/desactivar), archivos, actualizaciones y cargadores', async () => {
    await nav('modules'); await vis('#modules label.sw'); await noDeadButtons('módulos'); await page.click('label.sw:has(input[data-id="zoom"])'); await until(() => { return true; }); await page.waitForTimeout(600);
    const pdir = x.app.services.paths.profileDir((await x.call('profile:list'))[0].id), mods = () => fs.readdirSync(path.join(pdir, 'mods'));
    await page.click('label.sw:has(input[data-id="fps"])'); await page.waitForTimeout(700); assert.ok(mods().some(f => f.startsWith('sodium') && f.endsWith('.disabled')), 'desactivar módulo'); await page.click('label.sw:has(input[data-id="fps"])'); await page.waitForTimeout(700); assert.ok(mods().includes('sodium-0.5.8.jar'), 'reactivar módulo');
    await shot('7-modulos'); await page.click('[data-act="modTab"][data-t="mods"]'); await vis('[data-act="toggleFile"]'); await noDeadButtons('mods');
    fs.writeFileSync(path.join(pdir, 'mods', 'sodium-0.5.3.jar'), 'sodium-0.5.3.jar@0.5.3'); x.w.mr.old.files[0].hashes.sha1 = sha1('sodium-0.5.3.jar@0.5.3');
    await page.click('[data-act="checkUpdates"]'); await vis('[data-act="updateOne"]'); assert.match(await page.textContent('#modules'), /0\.5\.3 → 0\.5\.8/); await page.click('[data-act="updateAll"]'); await page.waitForSelector('[data-act="updateOne"]', { state: 'detached', timeout: 8000 }); assert.ok(!mods().includes('sodium-0.5.3.jar'));
    await page.click('[data-act="toggleFile"] >> nth=0'); await page.waitForTimeout(300); await page.click('[data-act="removeFile"] >> nth=0'); await page.waitForTimeout(400);
    const jar = path.join(tmp(), 'extra.jar'); fs.writeFileSync(jar, 'x'); x.pf.dialogQueue.push(jar); await page.click('[data-act="addJar"]'); await page.waitForTimeout(400); assert.ok(mods().includes('extra.jar'));
    await page.click('[data-act="openOptifine"]'); await page.click('[data-act="openModsDir"]'); assert.ok(x.pf.opened.includes('https://optifine.net/downloads'));
    await page.click('[data-act="modTab"][data-t="packs"]'); await vis('[data-act="goExplorePacks"]'); await page.click('[data-act="modTab"][data-t="loaders"]'); await vis('[data-act="setLoader"]'); await noDeadButtons('cargadores'); assert.equal(await page.locator('[data-act="setLoader"]').count(), 5);
    await page.click('[data-act="setLoader"][data-l="quilt"]'); await until(() => X.S.profiles[0].loader === 'quilt'); assert.equal((await x.call('profile:list'))[0].custom, 'quilt-loader-0.26.0-1.20.1');
  });
  await step('explorar: buscar, filtrar por categoría/versión, instalar mod, modpacks y recursos', async () => {
    await nav('explore'); await vis('#exq'); await vis('#exres .card'); await noDeadButtons('explorar'); await page.fill('#exq', 'lith'); await page.waitForTimeout(700); assert.match(await page.textContent('#exres'), /Lithium/); assert.doesNotMatch(await page.textContent('#exres'), /Sodium/);
    await page.selectOption('[data-chg="exCat"]', 'optimization'); await page.selectOption('[data-chg="exSort"]', 'downloads'); await page.selectOption('[data-chg="exMc"]', '1.20.1'); await page.waitForTimeout(500);
    assert.match(x.w.lastSearch, /categories:optimization/); assert.match(x.w.lastSearch, /index=downloads/); assert.match(x.w.lastSearch, /versions:1\.20\.1/);
    await page.click('[data-act="exInstall"]'); await page.waitForFunction(() => document.querySelector('[data-act="exInstall"]').textContent.includes('Instalado'), null, { timeout: 8000 });
    const pdir = x.app.services.paths.profileDir((await x.call('profile:list'))[0].id); assert.ok(fs.readdirSync(path.join(pdir, 'mods')).includes('lithium-0.12.0.jar')); await shot('8-explorar');
    await page.click('[data-act="exType"][data-t="modpack"]'); await vis('[data-chg="exLoader"]'); await page.click('[data-act="exType"][data-t="resourcepack"]'); await page.click('[data-act="exType"][data-t="shader"]'); await page.click('[data-act="exType"][data-t="mod"]'); await vis('[data-chg="exProfile"]');
  });
  await step('ajustes: RAM, detectar, Java (listar/instalar), JVM, resolución, apariencia, directorios, registros', async () => {
    await nav('settings'); await vis('#logbox'); await page.waitForTimeout(300); await noDeadButtons('ajustes');
    await page.$eval('[data-chg="ram"]', el => { el.value = 2048; el.dispatchEvent(new Event('change', { bubbles: true })); }); await until(() => X.S.settings.ram === 2048); await page.click('[data-act="detectRam"]'); await until(() => X.S.settings.ramMb === 6144);
    assert.match(await page.textContent('#settings'), /Java 21 · Sistema/); await page.click('[data-act="installJava"][data-major="8"]'); await until(() => X.S.java.managed.find(j => j.major === 8).installed); assert.match(await page.textContent('#settings'), /Java 8 · Eclipse Temurin/);
    await page.selectOption('[data-chg="javaDef"]', '17'); await until(() => X.S.settings.java === '17'); await page.fill('[data-inp="jvmExtra"]', '-Dx=1'); await until(() => X.S.settings.jvmExtra === '-Dx=1');
    await page.fill('[data-chg="resW"]', '1920'); await page.fill('[data-chg="resH"]', '1080'); await page.press('[data-chg="resH"]', 'Tab'); await until(() => X.S.settings.resW === 1920 && X.S.settings.resH === 1080);
    await page.click('span.sw:has([data-chg="jvmPreset"])'); await until(() => X.S.settings.jvmPreset === false); await page.click('span.sw:has([data-chg="lite"])'); await until(() => X.S.settings.lite === true);
    await page.click('[data-act="setAccent"][data-v="#c084fc"]'); await until(() => getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() === '#c084fc'); await page.click('span.sw:has([data-chg="motion"])'); await until(() => document.documentElement.dataset.motion === 'off');
    await page.click('span.sw:has([data-chg="motion"])'); await until(() => document.documentElement.dataset.motion === 'on');
    for (const w of ['data', 'root', 'profiles', 'logs']) await page.click(`[data-act="openDir"][data-what="${w}"]`); await page.waitForTimeout(200); assert.ok(x.pf.paths.length >= 4);
    await page.click('[data-act="loadLogs"]'); await page.waitForFunction(() => /Cuenta añadida/.test(document.querySelector('#logbox').textContent)); await page.click('[data-act="copyLogs"]'); assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Cuenta añadida/);
    await page.click('#settings [data-act="checkUpdate"]'); await page.waitForFunction(() => /desarrollo/.test(document.querySelector('#settings').textContent)); await shot('9-ajustes');
    await page.click('[data-act="clearLogs"]'); await page.waitForFunction(() => /Sin registros/.test(document.querySelector('#logbox').textContent));
  });
  await step('inicio: perfil activo, skin 3D, actualizaciones de mods y cambio de perfil', async () => {
    await nav('home'); await page.waitForSelector('#skHome .md', { state: 'attached' }); assert.equal(await page.locator('#skHome .pt').count(), 12); await page.click('[data-act="checkModsHome"]'); await page.waitForFunction(() => /al día|actualización/.test(document.querySelector('#home').textContent), null, { timeout: 8000 });
    await page.waitForTimeout(500); await shot('10-inicio'); await noDeadButtons('inicio');
  });
  await step('adaptable: resoluciones pequeñas no rompen el diseño', async () => {
    for (const [w, h] of [[900, 640], [1920, 1080]]) { await page.setViewportSize({ width: w, height: h }); await nav('home'); await page.waitForTimeout(300); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, `sin scroll horizontal a ${w}px`); await shot('res-' + w); }
    await page.setViewportSize({ width: 1280, height: 800 });
  });
  await step('cerrar sesión desde el menú superior', async () => { await page.click('.accbtn'); await page.click('[data-act="logoutActive"]'); await until(() => X.S.accounts.length === 0); assert.match(await page.textContent('.accwrap'), /Iniciar sesión/); });
  await step('cero errores de consola ni excepciones en toda la sesión', async () => { assert.deepEqual(errors, []); });

  await browser.close(); x.restore();
  console.log(`\n${passed} correctas, ${failed.length} fallidas${failed.length ? ': ' + failed.join(' | ') : ''}\n`); process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(2); });
