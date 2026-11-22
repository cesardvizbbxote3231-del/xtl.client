const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { UA } = require('./net');
const MS = 'https://login.microsoftonline.com/consumers/oauth2/v2.0', SCOPE = 'XboxLive.signin offline_access';
const XERR = {
  2148916233: ['NO_XBOX', 'Esta cuenta de Microsoft no tiene perfil de Xbox. Crea uno en xbox.com y vuelve a intentarlo.'],
  2148916235: ['XBOX_REGION', 'Xbox Live no está disponible en tu país o región.'],
  2148916236: ['XBOX_ADULT', 'La cuenta necesita verificación de adulto en Xbox.'], 2148916237: ['XBOX_ADULT', 'La cuenta necesita verificación de adulto en Xbox.'],
  2148916238: ['XBOX_CHILD', 'Es una cuenta de menor: debe añadirse a un grupo familiar de Microsoft para poder jugar.']
};
class AuthError extends Error { constructor(code, message) { super(message); this.code = code; } }
const sleep = (ms, sig) => new Promise((res, rej) => {
  if (sig && sig.aborted) return rej(new AuthError('CANCELLED', 'Inicio de sesión cancelado.'));
  const t = setTimeout(res, ms); if (sig) sig.addEventListener('abort', () => { clearTimeout(t); rej(new AuthError('CANCELLED', 'Inicio de sesión cancelado.')); }, { once: true });
});
async function req(url, { method = 'GET', headers = {}, body, form } = {}) {
  const h = { ...UA, ...headers }; let b;
  if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(form).toString(); }
  else if (body) { h['Content-Type'] = 'application/json'; h.Accept = 'application/json'; b = JSON.stringify(body); }
  let r; try { r = await fetch(url, { method, headers: h, body: b }); } catch (e) { throw new AuthError('NETWORK', 'Sin conexión con los servicios de Microsoft: ' + e.message); }
  const text = await r.text(); let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  return { status: r.status, ok: r.ok, data, text };
}

module.exports = function makeAuth({ paths, settings, log, platform, config = {} }) {
  const sessions = new Map(); let abort = null;
  const read = () => { try { return JSON.parse(fs.readFileSync(paths.accounts, 'utf8')); } catch { return { list: [] }; } };
  const write = d => { fs.mkdirSync(path.dirname(paths.accounts), { recursive: true }); fs.writeFileSync(paths.accounts, JSON.stringify(d, null, 1)); };
  const enc = s => platform.safeStorage.available() ? 'e:' + platform.safeStorage.encrypt(s) : null;   // nunca en texto plano
  const dec = s => { try { return s && s.startsWith('e:') ? platform.safeStorage.decrypt(s.slice(2)) : null; } catch { return null; } };
  const clientId = () => {
    const id = (settings.get().msClientId || process.env.XTL_CLIENT_ID || config.msClientId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AuthError('NO_CLIENT_ID', 'Falta el Client ID de tu aplicación de Azure. Configúralo en Cuentas (ver docs/CONFIGURAR-MICROSOFT.md).');
    return id;
  };
  const pub = a => ({ id: a.id, name: a.name, skinUrl: a.skinUrl, variant: a.variant, capeUrl: a.capeUrl, status: a.status, addedAt: a.addedAt, lastLogin: a.lastLogin,
    persisted: !!a.refresh, sessionUntil: sessions.get(a.id) ? sessions.get(a.id).mcExpires : null, active: settings.get().activeAccount === a.id });

  async function xboxChain(msToken) {
    let r = await req('https://user.auth.xboxlive.com/user/authenticate', { method: 'POST', body: { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + msToken }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' } });
    if (!r.ok) throw new AuthError('XBOX', `Error de Xbox Live (${r.status}).`);
    const xbl = r.data.Token, uhs = r.data.DisplayClaims.xui[0].uhs;
    r = await req('https://xsts.auth.xboxlive.com/xsts/authorize', { method: 'POST', body: { Properties: { SandboxId: 'RETAIL', UserTokens: [xbl] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' } });
    if (!r.ok) { const x = XERR[r.data.XErr]; if (x) throw new AuthError(x[0], x[1]); throw new AuthError('XSTS', `Error de autorización de Xbox (${r.status}).`); }
    r = await req('https://api.minecraftservices.com/authentication/login_with_xbox', { method: 'POST', body: { identityToken: `XBL3.0 x=${uhs};${r.data.Token}` } });
    if (!r.ok) {
      if (r.status === 403 && /Invalid app registration/i.test(r.text)) throw new AuthError('INVALID_APP', 'Mojang todavía no ha aprobado tu aplicación de Azure para los servicios de Minecraft. Solicítalo en https://aka.ms/AppRegInfo (ver docs/CONFIGURAR-MICROSOFT.md).');
      throw new AuthError('MC_LOGIN', `No se pudo iniciar sesión en los servicios de Minecraft (${r.status}).`);
    }
    return { mcToken: r.data.access_token, mcExpires: Date.now() + (r.data.expires_in || 86400) * 1000 };
  }
  async function fetchProfile(mcToken) {
    const r = await req('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: 'Bearer ' + mcToken } });
    if (r.status === 404) throw new AuthError('NO_LICENSE', 'Esta cuenta de Microsoft no tiene Minecraft: Java Edition (ni Game Pass activo). Cómpralo en minecraft.net.');
    if (!r.ok) throw new AuthError('PROFILE', `No se pudo leer el perfil de Minecraft (${r.status}).`);
    const p = r.data, sk = (p.skins || []).find(s => s.state === 'ACTIVE') || (p.skins || [])[0] || {}, cape = (p.capes || []).find(c => c.state === 'ACTIVE');
    return { id: p.id, name: p.name, skinUrl: sk.url || null, variant: sk.variant || 'CLASSIC', capeUrl: cape ? cape.url : null };
  }
  async function finish(t) {
    const x = await xboxChain(t.access_token), p = await fetchProfile(x.mcToken), data = read();
    const rec = { ...p, addedAt: Date.now(), lastLogin: Date.now(), status: 'ok', refresh: enc(t.refresh_token) };
    const i = data.list.findIndex(a => a.id === p.id); if (i >= 0) { rec.addedAt = data.list[i].addedAt; data.list[i] = rec; } else data.list.push(rec);
    write(data); sessions.set(p.id, { ...x, rt: t.refresh_token }); settings.set({ activeAccount: p.id });
    log.info(`Cuenta añadida: ${p.name}${rec.refresh ? '' : ' (sesión solo en memoria: no hay almacenamiento seguro)'}`); return pub(rec);
  }
  async function login(emit) {
    const cid = clientId(); abort = new AbortController(); const sig = abort.signal;
    try {
      let r = await req(MS + '/devicecode', { method: 'POST', form: { client_id: cid, scope: SCOPE } });
      if (!r.ok) throw new AuthError('DEVICE', String(r.data.error_description || 'No se pudo iniciar el inicio de sesión (' + r.status + ')').split('\r')[0]);
      const d = r.data; if (emit) emit('auth:code', { user_code: d.user_code, verification_uri: d.verification_uri, expires_in: d.expires_in });
      try { platform.openExternal(d.verification_uri); } catch {}
      let wait = (d.interval ?? 5) * 1000; const end = Date.now() + (d.expires_in || 900) * 1000; let tokens;
      for (;;) {
        await sleep(wait, sig); if (Date.now() > end) throw new AuthError('CODE_EXPIRED', 'El código expiró. Inténtalo de nuevo.');
        r = await req(MS + '/token', { method: 'POST', form: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: cid, device_code: d.device_code } });
        if (r.ok) { tokens = r.data; break; }
        const er = r.data.error;
        if (er === 'authorization_pending') continue; if (er === 'slow_down') { wait += 5000; continue; }
        if (er === 'authorization_declined') throw new AuthError('DECLINED', 'Cancelaste el inicio de sesión en Microsoft.');
        if (er === 'expired_token') throw new AuthError('CODE_EXPIRED', 'El código expiró. Inténtalo de nuevo.');
        throw new AuthError('TOKEN', String(r.data.error_description || er || 'Error de autenticación').split('\r')[0]);
      }
      return await finish(tokens);
    } finally { abort = null; }
  }
  const cancel = () => { if (abort) abort.abort(); };
  const mark = (id, status) => { const d = read(), a = d.list.find(x => x.id === id); if (a) { a.status = status; write(d); } };

  async function session(id) {
    const s = sessions.get(id); if (s && s.mcExpires - Date.now() > 300000) return s;
    const data = read(), a = data.list.find(x => x.id === id); if (!a) throw new AuthError('NO_ACCOUNT', 'La cuenta no existe.');
    const rt = (s && s.rt) || dec(a.refresh);
    if (!rt) { mark(id, 'expired'); throw new AuthError('EXPIRED', `La sesión de ${a.name} expiró. Inicia sesión de nuevo con Microsoft.`); }
    const r = await req(MS + '/token', { method: 'POST', form: { grant_type: 'refresh_token', client_id: clientId(), refresh_token: rt, scope: SCOPE } });
    if (!r.ok) {
      if (['invalid_grant', 'interaction_required'].includes(r.data.error)) { mark(id, 'expired'); throw new AuthError('EXPIRED', `La sesión de ${a.name} expiró. Inicia sesión de nuevo con Microsoft.`); }
      throw new AuthError('REFRESH', 'No se pudo renovar la sesión: ' + String(r.data.error_description || r.status).split('\r')[0]);
    }
    const x = await xboxChain(r.data.access_token), ns = { ...x, rt: r.data.refresh_token || rt }; sessions.set(id, ns);
    a.refresh = enc(ns.rt); a.status = 'ok'; a.lastLogin = Date.now(); write(data); return ns;
  }
  // Comprueba sesión + propiedad del juego y sincroniza nombre/skin con el perfil oficial.
  async function verify(id) {
    const s = await session(id), p = await fetchProfile(s.mcToken), data = read(), a = data.list.find(x => x.id === id);
    if (a) { Object.assign(a, { name: p.name, skinUrl: p.skinUrl, variant: p.variant, capeUrl: p.capeUrl, status: 'ok' }); write(data); }
    return { session: s, profile: p, account: a ? pub(a) : null };
  }
  async function authorization(id) {
    const { session: s, profile: p } = await verify(id);
    return { access_token: s.mcToken, client_token: crypto.randomUUID(), uuid: p.id, name: p.name, user_properties: '{}', meta: { type: 'msa', demo: false } };
  }
  const list = () => ({ accounts: read().list.map(pub), active: settings.get().activeAccount });
  const setActive = id => { if (!read().list.find(a => a.id === id)) throw new AuthError('NO_ACCOUNT', 'La cuenta no existe.'); settings.set({ activeAccount: id }); return list(); };
  function remove(id) {
    const d = read(); d.list = d.list.filter(a => a.id !== id); write(d); sessions.delete(id);
    if (settings.get().activeAccount === id) settings.set({ activeAccount: d.list[0] ? d.list[0].id : '' }); return list();
  }
  async function skinData(id) {
    const a = read().list.find(x => x.id === id); if (!a || !a.skinUrl) return null;
    const u = new URL(a.skinUrl); if (u.protocol !== 'https:' || u.hostname !== 'textures.minecraft.net') return null;   // solo el servidor oficial de texturas
    const f = path.join(paths.skins, crypto.createHash('sha1').update(a.skinUrl).digest('hex') + '.png');
    if (!fs.existsSync(f)) {
      const r = await fetch(a.skinUrl, { headers: UA }); if (!r.ok) throw new AuthError('SKIN', 'No se pudo descargar la skin (' + r.status + ').');
      fs.mkdirSync(paths.skins, { recursive: true }); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  }
  return { login, cancel, list, setActive, remove, verify, session, authorization, skinData, refreshProfile: async id => (await verify(id)).account, AuthError };
};
module.exports.AuthError = AuthError;
