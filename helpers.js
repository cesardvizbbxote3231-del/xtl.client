// Mundo simulado: Mojang, Fabric/Quilt/Forge, Adoptium, Modrinth, Microsoft/Xbox/Minecraft. Sin red real.
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process'), { EventEmitter } = require('events');
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p || 'xtl-'));
const PID = { notch: '069a79f444e94726a5befca90e38aaf5', alex: '853c80ef3c3749fdaa49938b674adae6' };
const NAMES = { [PID.notch]: 'Notch', [PID.alex]: 'AlexPro' };

function fakeJavaScript(extra = '') {   // un "java" de mentira: responde a -version y simula instaladores de Forge/NeoForge
  return `#!/bin/sh
if [ "$1" = "-version" ]; then echo 'openjdk version "17.0.9" 2023-10-17' 1>&2; exit 0; fi
if [ "$1" = "-jar" ]; then ${extra} exit 0; fi
exit 0
`;
}
function makeJreTgz(dir, script) {   // paquete tar.gz estilo Adoptium: jdk-xx-jre/bin/java
  const root = path.join(dir, 'pkg', 'jdk-17.0.9+9-jre', 'bin'); fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'java'), script, { mode: 0o755 }); const out = path.join(dir, 'jre.tgz');
  execFileSync('tar', ['-czf', out, '-C', path.join(dir, 'pkg'), '.']); return fs.readFileSync(out);
}
function world() {
  const w = { calls: [], files: new Map(), owns: true, invalidApp: false, xerr: 0, pending: 1, refreshBad: false, nextAcc: PID.notch, refreshN: 0, offline: false, skinPng: Buffer.from('89504e470d0a1a0a', 'hex'), mrUpdates: {}, jre: null, forgeScript: null };
  const file = (name, content) => { const buf = Buffer.from(content); const url = `https://cdn.modrinth.com/data/${name}`; w.files.set(url, buf); return { url, filename: name, primary: true, hashes: { sha1: sha1(buf) }, size: buf.length }; };
  w.file = file;
  const ver = (id, project, num, name, deps = []) => ({ id, project_id: project, version_number: num, files: [file(name, name + '@' + num)], dependencies: deps });
  w.mr = {   // proyectos de Modrinth simulados
    sodium: { id: 'AANobbMI', slug: 'sodium', title: 'Sodium', versions: [ver('v-sodium-2', 'AANobbMI', '0.5.8', 'sodium-0.5.8.jar')] },
    lithium: { id: 'gvQqBUqZ', slug: 'lithium', title: 'Lithium', versions: [ver('v-lith-1', 'gvQqBUqZ', '0.12.0', 'lithium-0.12.0.jar', [{ dependency_type: 'required', project_id: 'P7dR8mSH' }])] },
    'fabric-api': { id: 'P7dR8mSH', slug: 'fabric-api', title: 'Fabric API', versions: [ver('v-fapi-1', 'P7dR8mSH', '0.92.0', 'fabric-api-0.92.0.jar')] },
    modmenu: { id: 'mOgUt4GM', slug: 'modmenu', title: 'Mod Menu', versions: [ver('v-mm-1', 'mOgUt4GM', '7.2.2', 'modmenu-7.2.2.jar', [{ dependency_type: 'required', project_id: 'P7dR8mSH' }])] }
  };
  w.mr.old = ver('v-sodium-1', 'AANobbMI', '0.5.3', 'sodium-0.5.3.jar');   // versión antigua para probar actualizaciones
  w.pack = null;
  w.profiles = { [PID.notch]: { id: PID.notch, name: 'Notch', skins: [{ id: 's1', state: 'ACTIVE', url: 'https://textures.minecraft.net/texture/abc123', variant: 'CLASSIC' }], capes: [] },
    [PID.alex]: { id: PID.alex, name: 'AlexPro', skins: [{ id: 's2', state: 'ACTIVE', url: 'https://textures.minecraft.net/texture/def456', variant: 'SLIM' }], capes: [] } };
  const body = init => { const b = init && init.body; if (!b) return {}; try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(String(b))); } };
  const manifest = { latest: { release: '1.21.1' }, versions: [
    { id: '1.21.1', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/a/1.21.1.json', releaseTime: '2024-08-08' },
    { id: '1.20.4', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/a/1.20.4.json', releaseTime: '2023-12-07' },
    { id: '1.20.1', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/a/1.20.1.json', releaseTime: '2023-06-12' },
    { id: '1.16.5', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/a/1.16.5.json', releaseTime: '2021-01-14' },
    { id: '24w14a', type: 'snapshot', url: 'https://piston-meta.mojang.com/v1/packages/a/24w14a.json', releaseTime: '2024-04-03' },
    { id: 'b1.7.3', type: 'old_beta', url: 'https://piston-meta.mojang.com/v1/packages/a/b1.7.3.json', releaseTime: '2011-07-07' }] };
  const javaOf = { '1.21.1': 21, '1.20.4': 17, '1.20.1': 17, '1.16.5': 8, '24w14a': 21 };
  w.fetch = async (url, init = {}) => {
    url = String(url); const u = new URL(url), m = (init.method || 'GET').toUpperCase(), b = body(init); w.calls.push({ url, m, b });
    if (w.offline) throw new TypeError('fetch failed (offline)');
    if (w.files.has(url)) return new Response(w.files.get(url));
    if (url.endsWith('version_manifest_v2.json')) return J(manifest);
    let g; if ((g = /packages\/a\/(.+)\.json$/.exec(url))) return J(javaOf[g[1]] ? { id: g[1], javaVersion: { majorVersion: javaOf[g[1]] } } : { id: g[1] });
    if (u.host === 'meta.fabricmc.net' || u.host === 'meta.quiltmc.org') {
      const kind = u.host.includes('fabric') ? 'fabric' : 'quilt', mc = u.pathname.split('/')[4];
      if (/\/profile\/json$/.test(u.pathname)) { const lv = u.pathname.split('/')[5]; return J({ id: `${kind}-loader-${lv}-${mc}`, inheritsFrom: mc, libraries: [] }); }
      return J([{ loader: { version: kind === 'fabric' ? '0.15.11' : '0.26.0', stable: true } }]);
    }
    if (u.host === 'api.adoptium.net') return new Response(w.jre);
    if (url.includes('promotions_slim.json')) return J({ promos: { '1.20.1-recommended': '47.2.0', '1.20.1-latest': '47.3.0' } });
    if (u.host === 'maven.neoforged.net' && u.pathname.includes('/api/maven/versions')) return J({ versions: ['21.1.0-beta', '21.1.50', '21.1.77', '20.4.100'] });
    if (u.host === 'maven.minecraftforge.net' || (u.host === 'maven.neoforged.net' && url.endsWith('.jar'))) return new Response('JAR');
    // ---- Modrinth ----
    if (u.host === 'api.modrinth.com') {
      const p = u.pathname.replace('/v2', '');
      if (p === '/search') { w.lastSearch = decodeURIComponent(u.search); const q = (u.searchParams.get('query') || '').toLowerCase(); const hits = Object.values(w.mr).filter(x => x.slug && (!q || x.title.toLowerCase().includes(q))).map(x => ({ project_id: x.id, slug: x.slug, title: x.title, description: 'Mod ' + x.title, downloads: 1234, author: 'tester', display_categories: ['optimization'], icon_url: null })); return J({ total_hits: hits.length, hits }); }
      if (p === '/tag/category') return J([{ name: 'optimization', project_type: 'mod', header: 'categories' }, { name: 'adventure', project_type: 'modpack', header: 'categories' }, { name: 'fabric', project_type: 'mod', header: 'loaders' }]);
      if ((g = /^\/project\/([^/]+)\/version$/.exec(p))) { const pr = w.mr[g[1]] || Object.values(w.mr).find(x => x.id === g[1]); if (!pr) return J({ error: 'not_found' }, 404);
        const want = u.searchParams.get('game_versions'); if (want && w.noCompat && w.noCompat.includes(pr.slug)) return J([]); return J(pr.versions); }
      if ((g = /^\/project\/([^/]+)$/.exec(p))) { const pr = w.mr[g[1]] || Object.values(w.mr).find(x => x.id === g[1]); return pr ? J({ id: pr.id, slug: pr.slug }) : J({ error: 'not_found' }, 404); }
      if (p === '/version_files') { const o = {}; for (const h of b.hashes) { const hit = Object.values(w.mr).flatMap(x => x.versions || []).concat([w.mr.old]).find(v => v.files[0].hashes.sha1 === h); if (hit) o[h] = hit; } return J(o); }
      if (p === '/version_files/update') { const o = {}; for (const h of b.hashes) { const hit = Object.values(w.mr).flatMap(x => x.versions || []).concat([w.mr.old]).find(v => v.files[0].hashes.sha1 === h); if (hit) o[h] = (w.mr[Object.values(w.mr).find(x => x.id === hit.project_id)?.slug] || { versions: [hit] }).versions[0]; } return J(o); }
      if (p === '/projects') return J(Object.values(w.mr).filter(x => x.slug).map(x => ({ id: x.id, title: x.title })));
      if ((g = /^\/version\/(.+)$/.exec(p))) { for (const x of Object.values(w.mr)) for (const v of x.versions || []) if (v.id === g[1]) return J(v); return J({}, 404); }
    }
    // ---- Microsoft / Xbox / Minecraft ----
    if (u.host === 'login.microsoftonline.com') {
      if (u.pathname.endsWith('/devicecode')) return J({ device_code: 'dc1', user_code: 'ABCD1234', verification_uri: 'https://www.microsoft.com/link', expires_in: 900, interval: 0 });
      if (b.grant_type === 'refresh_token') { if (w.refreshBad) return J({ error: 'invalid_grant', error_description: 'expired' }, 400); const id = b.refresh_token.split('|')[1]; return J({ access_token: 'ms|' + id, refresh_token: `rt|${id}|${++w.refreshN}`, expires_in: 3600 }); }
      if (w.pending > 0) { w.pending--; return J({ error: 'authorization_pending' }, 400); }
      return J({ access_token: 'ms|' + w.nextAcc, refresh_token: `rt|${w.nextAcc}|0`, expires_in: 3600 });
    }
    if (u.host === 'user.auth.xboxlive.com') return J({ Token: 'xbl|' + b.Properties.RpsTicket.slice(2), DisplayClaims: { xui: [{ uhs: 'uhs123' }] } });
    if (u.host === 'xsts.auth.xboxlive.com') return w.xerr ? J({ XErr: w.xerr }, 401) : J({ Token: 'xsts|' + b.Properties.UserTokens[0], DisplayClaims: { xui: [{ uhs: 'uhs123' }] } });
    if (url.endsWith('/login_with_xbox')) { if (w.invalidApp) return new Response('Invalid app registration', { status: 403 }); return J({ access_token: 'mc|' + b.identityToken.split('|').pop(), expires_in: w.mcTtl || 86400 }); }
    if (url.endsWith('/minecraft/profile')) { const id = (init.headers.Authorization || '').split('|')[1]; if (!w.owns) return J({ error: 'NOT_FOUND' }, 404); return J(w.profiles[id]); }
    if (u.host === 'textures.minecraft.net') return new Response(w.skinPng);
    return new Response('no mock: ' + url, { status: 404 });
  };
  return w;
}
function fakePlatform(dialogQueue = []) {
  const store = {}; return {
    opened: [], paths: [],
    safeStorage: { available: () => true, encrypt: s => Buffer.from('ENC:' + s).toString('base64'), decrypt: s => Buffer.from(s, 'base64').toString().replace(/^ENC:/, '') },
    openExternal(u) { this.opened.push(u); }, openPath(p) { this.paths.push(p); return ''; },
    dialog: { openFile: async () => dialogQueue.shift() || null },
    app: { version: '1.0.0', packaged: false, checkUpdate: async () => ({ status: 'dev', message: 'Estás en modo desarrollo: las actualizaciones solo funcionan en la versión instalada.' }) }, store, dialogQueue
  };
}
class FakeClient extends EventEmitter {   // sustituye a minecraft-launcher-core
  static mode = 'ok'; static last = null;
  launch(opts) {
    FakeClient.last = { client: this, opts }; const proc = new EventEmitter();
    setTimeout(() => { this.emit('progress', { type: 'assets', task: 5, total: 10 });
      if (FakeClient.mode === 'ok') { this.emit('data', '[Render thread/INFO]: Setting user: ' + opts.authorization.name); }
      else if (FakeClient.mode === 'crash') { this.emit('close', 1); }
      else if (FakeClient.mode === 'noproc') { } }, 5);
    return Promise.resolve(FakeClient.mode === 'noproc' ? null : proc);
  }
}
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'modules.json'), 'utf8'));
function boot({ client = FakeClient, onEvent } = {}) {
  const w = world(), dir = tmp(), pf = fakePlatform(), events = [], origFetch = global.fetch; global.fetch = w.fetch;
  w.jre = makeJreTgz(tmp('jre-'), fakeJavaScript(w.forgeScript || ''));
  const createApp = require('../src/main/app');
  const app = createApp({ baseDir: dir, platform: pf, emit: (c, d) => { events.push([c, d]); if (onEvent) onEvent(c, d); }, Client: client, catalog, totalMem: () => 16 * 1073741824 });
  const call = async (ch, arg) => { const r = await app.invoke(ch, arg); if (!r.ok) { const e = new Error(r.error); e.code = r.code; throw e; } return r.data; };
  return { w, dir, pf, events, app, call, restore() { global.fetch = origFetch; } };
}
module.exports = { sha1, J, tmp, PID, world, fakePlatform, FakeClient, boot, catalog, fakeJavaScript, makeJreTgz };
