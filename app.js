// Ensambla todos los servicios y expone los manejadores IPC. No depende de Electron (la plataforma se inyecta), por eso es probable.
const fs = require('fs'), path = require('path');
const makePaths = require('./paths'), makeLog = require('./log'), makeSettings = require('./settings'), makeJava = require('./java'), makeAuth = require('./auth');
const makeVersions = require('./versions'), makeProfiles = require('./profiles'), makeModrinth = require('./modrinth'), makeGame = require('./game');
const OK_HOSTS = ['microsoft.com', 'www.microsoft.com', 'login.microsoftonline.com', 'aka.ms', 'portal.azure.com', 'entra.microsoft.com', 'optifine.net', 'modrinth.com', 'minecraft.net', 'www.minecraft.net', 'xbox.com', 'www.xbox.com'];

module.exports = function createApp({ baseDir, platform, emit = () => {}, Client, config = {}, catalog, totalMem }) {
  const paths = makePaths(baseDir), log = makeLog(paths.logs, emit);
  const settings = makeSettings(paths, { totalMem }), java = makeJava({ paths, log }), auth = makeAuth({ paths, settings, log, platform, config });
  const versions = makeVersions({ paths, log }), profiles = makeProfiles({ paths, settings, versions, java, log });
  const mr = makeModrinth({ paths, profiles, versions, java, log, catalog }), game = makeGame({ paths, settings, auth, profiles, versions, java, log, Client });
  const task = d => emit('task', d), prog = (c, d) => emit(c, d);
  const dec = (c, d) => c === 'task' ? task(d) : emit(c, d);
  const H = {};
  const on = (ch, fn) => { H[ch] = fn; };

  on('app:info', () => ({ version: platform.app.version, packaged: platform.app.packaged, platform: process.platform, dataDir: paths.base, logsDir: paths.logs, rootDir: paths.root, profilesDir: paths.profiles }));
  on('app:update', () => platform.app.checkUpdate());
  on('app:open', ({ what, id }) => platform.openPath(what === 'logs' ? paths.logs : what === 'profile' ? paths.profileDir(id) : what === 'profiles' ? paths.profiles : what === 'root' ? paths.root : paths.base));
  on('app:external', ({ url }) => { const u = new URL(url); if (u.protocol !== 'https:' || !OK_HOSTS.includes(u.hostname)) throw new Error('Dirección no permitida'); return platform.openExternal(url); });
  on('settings:get', () => settings.get());
  on('settings:set', p => settings.set(p));
  on('java:list', () => java.list());
  on('java:install', ({ major }) => java.installManaged(+major, dec).then(() => java.list()));
  on('java:pick', async () => { const f = await platform.dialog.openFile({ title: 'Elige java / javaw', filters: [] }); if (!f) return null; if (!(await java.probe(f))) throw new Error('Ese archivo no es un Java válido'); return f; });
  on('versions:list', () => versions.list());
  on('acc:list', () => auth.list());
  on('acc:login', () => auth.login(emit));
  on('acc:cancel', () => auth.cancel());
  on('acc:switch', ({ id }) => auth.setActive(id));
  on('acc:remove', ({ id }) => auth.remove(id));
  on('acc:refresh', async ({ id }) => { await auth.refreshProfile(id); return auth.list(); });
  on('acc:skin', ({ id }) => auth.skinData(id));
  on('profile:list', () => profiles.list());
  on('profile:create', async o => { const p = await profiles.create(o, dec); if (o.preset && o.preset !== 'none') { const r = await mr.applyPreset({ profile: p.id, preset: o.preset }, dec); log.info(`Preajuste ${o.preset}: ${r.ok}/${r.total}`); } return profiles.get(p.id); });
  on('profile:update', ({ id, patch }) => profiles.update(id, patch));
  on('profile:dup', ({ id }) => profiles.duplicate(id));
  on('profile:remove', ({ id }) => profiles.remove(id));
  on('profile:loader', ({ id, loader }) => profiles.setLoader(id, loader, dec));
  on('profile:icon', async ({ id }) => { const f = await platform.dialog.openFile({ title: 'Icono del perfil', filters: [{ name: 'Imagen', extensions: ['png', 'jpg', 'jpeg'] }] }); return f ? profiles.setIconImage(id, f) : null; });
  on('profile:iconData', ({ id }) => profiles.iconData(id));
  on('mods:list', ({ id }) => mr.listFiles(id));
  on('mods:toggle', ({ id, file }) => mr.toggle(id, file));
  on('mods:remove', ({ id, file }) => mr.removeFile(id, file));
  on('mods:add', async ({ id }) => { const f = await platform.dialog.openFile({ title: 'Añadir mod (.jar)', filters: [{ name: 'Mod', extensions: ['jar'] }] }); if (f) mr.addLocal(id, f); return !!f; });
  on('mods:check', ({ id }) => mr.checkUpdates(id).then(l => l.map(({ version, ...r }) => r)));
  on('mods:update', ({ id, files }) => mr.applyUpdates(id, files));
  on('mod:list', ({ id }) => mr.moduleList(id));
  on('mod:set', args => mr.setModule(args, dec));
  on('mr:search', a => mr.search(a));
  on('mr:cats', ({ type }) => mr.categories(type));
  on('mr:install', a => mr.installProject(a, dec).then(f => f.length));
  on('mr:pack', ({ id, title }) => mr.installPackProject(id, title, emit));
  on('pack:import', async () => { const f = await platform.dialog.openFile({ title: 'Importar modpack', filters: [{ name: 'Modpack de Modrinth', extensions: ['mrpack'] }] }); return f ? mr.importPack(f, path.basename(f, '.mrpack'), emit) : null; });
  on('play', ({ id }) => game.play(id, emit));
  on('play:state', () => game.isPlaying());
  on('log:tail', () => log.tail(400));
  on('log:clear', () => { log.clear(); return true; });

  async function invoke(ch, arg) {
    if (!H[ch]) return { ok: false, error: 'Acción desconocida: ' + ch };
    try { return { ok: true, data: await H[ch](arg || {}) }; }
    catch (e) { log.error(`${ch}: ${e.message}`); return { ok: false, error: e.message, code: e.code }; }
  }
  return { invoke, channels: Object.keys(H), services: { paths, log, settings, java, auth, versions, profiles, mr, game } };
};
