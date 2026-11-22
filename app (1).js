// Núcleo del renderer: estado, navegación, menú de cuenta, Inicio, Cuentas y Perfiles.
(() => {
  const api = window.api, call = (ch, a) => api.invoke(ch, a);
  const S = { settings: {}, accounts: [], active: '', profiles: [], versions: [], skins: {}, icons: {}, view: 'home', menu: false, selAcc: '', login: null, loginErr: null,
    play: { phase: 'idle', step: -1, label: '', pct: 0, error: null }, editor: null, info: {}, java: null, updateMsg: '', modUpdates: {} };
  const X = window.X = { S, call, acts: {}, chg: {}, inp: {}, views: {} };
  const NAV = [['home', 'Inicio', 'home'], ['accounts', 'Cuentas', 'user'], ['profiles', 'Perfiles', 'layers'], ['modules', 'Módulos', 'box'], ['explore', 'Explorar', 'compass'], ['settings', 'Ajustes', 'sliders']];
  const TITLES = Object.fromEntries(NAV.map(n => [n[0], n[1]]));
  const STEPS = ['Cuenta', 'Licencia', 'Perfil', 'Java', 'Archivos', 'Argumentos', 'Inicio'];
  const activeAcc = () => S.accounts.find(a => a.id === S.active) || null;
  const curProfile = () => S.profiles.find(p => p.id === S.settings.activeProfile) || S.profiles[0] || null;
  const status = a => a.status === 'expired' ? ['err', 'Sesión expirada'] : !a.persisted ? ['warn', 'Solo en esta sesión'] : ['ok', 'Sesión válida'];
  const dashed = id => String(id).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  Object.assign(X, { activeAcc, curProfile, status });
  const avatar = (a, cls = '') => { const k = a && S.skins[a.id]; return k && k.head ? `<img class="av ${cls}" alt="" src="${k.head}">` : `<span class="av ${cls}">${esc(((a && a.name) || '?')[0].toUpperCase())}</span>`; };
  const picon = p => { const i = p.icon || { type: 'emoji', v: '⛏️' };
    if (i.type === 'img' && S.icons[p.id]) return `<img class="pi" alt="" src="${S.icons[p.id]}">`;
    if (i.type === 'color') return `<span class="pi" style="background:${esc(i.v)};color:#06101e;font-weight:800">${esc(p.name[0] || '?').toUpperCase()}</span>`;
    return `<span class="pi">${esc(i.type === 'emoji' ? i.v : '⛏️')}</span>`; };
  Object.assign(X, { avatar, picon, dashed });

  // Una imagen de icono dañada no debe verse rota: vuelve al emoji por defecto (los atributos onerror los bloquea la CSP).
  document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.classList.contains('pi')) { const s = document.createElement('span'); s.className = 'pi'; s.textContent = '⛏️'; t.replaceWith(s); } }, true);

  /* ---------- carga de datos ---------- */
  async function skinFor(a) {
    const c = S.skins[a.id]; if (c && c.url === a.skinUrl) return;
    try { const png = await call('acc:skin', { id: a.id }); if (!png) { S.skins[a.id] = { url: a.skinUrl, png: null, head: null }; return; }
      S.skins[a.id] = { url: a.skinUrl, png, head: await Skin.head(png, 64) }; X.render(); } catch { /* sin skin: se muestra la inicial */ }
  }
  async function iconFor(p) { if (p.icon && p.icon.type === 'img' && !S.icons[p.id]) { try { S.icons[p.id] = await call('profile:iconData', { id: p.id }); X.render(); } catch {} } }
  X.reloadAccounts = async () => { const ac = await call('acc:list'); S.accounts = ac.accounts; S.active = ac.active; ac.accounts.forEach(skinFor); };
  X.reloadProfiles = async () => { S.profiles = await call('profile:list'); S.profiles.forEach(iconFor); };
  X.reloadSettings = async () => { S.settings = await call('settings:get'); applySettings(); };
  X.ensureVersions = async () => { if (!S.versions.length) S.versions = await call('versions:list'); return S.versions; };
  X.ensureJava = async (force) => { if (!S.java || force) S.java = await call('java:list'); return S.java; };
  function applySettings() { document.documentElement.style.setProperty('--acc', S.settings.accent || '#6ea8ff'); document.documentElement.dataset.motion = S.settings.motion === false ? 'off' : 'on'; }

  /* ---------- navegación y barra superior ---------- */
  function paintNav() { $('#nav').innerHTML = NAV.map(([v, t, i]) => `<button class="nb ${S.view === v ? 'on' : ''}" data-act="nav" data-v="${v}">${ic(i, 19)}<span>${t}</span></button>`).join(''); }
  function paintTop() {
    $('#pt').textContent = TITLES[S.view]; const a = activeAcc(), w = $('#accwrap');
    if (!a) { w.innerHTML = `<button class="btn s" data-act="goAccounts">${ic('user', 16)} Iniciar sesión</button>`; return; }
    const [cls, txt] = status(a);
    w.innerHTML = `<div class="accbtn" data-act="toggleMenu">${avatar(a)}<span>${esc(a.name)}</span><span class="pill ${cls}" style="padding:1px 8px"><i class="dot"></i></span></div>` + (S.menu ? `
     <div class="menu"><div class="me">${avatar(a, 'l')}<div class="col" style="gap:2px"><b>${esc(a.name)}</b><span class="tag">Cuenta Microsoft · Java Edition</span><span class="pill ${cls}"><i class="dot"></i>${txt}</span></div></div>
      ${S.accounts.filter(x => x.id !== a.id).map(x => `<button class="mi" data-act="switchAcc" data-id="${esc(x.id)}">${avatar(x)}<span>${esc(x.name)}</span><span class="tag" style="margin-left:auto">Cambiar</span></button>`).join('')}
      <button class="mi" data-act="addAccount">${ic('plus')}<span>Agregar cuenta</span></button><button class="mi" data-act="goAccounts">${ic('user')}<span>Administrar cuentas</span></button>
      <button class="mi" data-act="logoutActive" style="color:var(--red)"><span>Cerrar sesión</span></button></div>` : '');
  }
  X.go = v => { S.view = v; S.menu = false; $$('main>section').forEach(s => { const on = s.id === v; s.hidden = !on; if (on) { s.classList.remove('in'); void s.offsetWidth; s.classList.add('in'); } }); X.render(); };
  X.render = () => { paintNav(); paintTop(); const f = X.views[S.view]; if (f) Promise.resolve().then(f).catch(e => toast(msg(e), 'err')); X.paintPlay(); };
  Object.assign(X.acts, {
    nav: b => X.go(b.dataset.v), goAccounts: () => X.go('accounts'), goProfiles: () => X.go('profiles'), goLogs: () => { X.go('settings'); setTimeout(() => X.acts.loadLogs && X.acts.loadLogs(), 50); },
    toggleMenu: () => { S.menu = !S.menu; paintTop(); },
    switchAcc: async b => { await call('acc:switch', { id: b.dataset.id }); S.menu = false; await X.reloadAccounts(); toast('Cuenta cambiada'); X.render(); },
    addAccount: () => { S.menu = false; X.go('accounts'); X.acts.login(); },
    logoutActive: async () => { const a = activeAcc(); if (a && confirm('¿Cerrar la sesión de ' + a.name + '?')) { await call('acc:remove', { id: a.id }); S.menu = false; await X.reloadAccounts(); X.render(); toast('Sesión cerrada'); } }
  });
  document.addEventListener('click', e => { if (S.menu && !e.target.closest('#accwrap')) { S.menu = false; paintTop(); } });

  /* ---------- JUGAR: estado y progreso ---------- */
  X.paintPlay = () => {
    const P = S.play, b = $('#playbtn');
    if (b) { b.disabled = P.phase === 'starting' || P.phase === 'running'; b.innerHTML = P.phase === 'running' ? 'EN JUEGO' : P.phase === 'starting' ? 'INICIANDO…' : ic('play', 20) + ' JUGAR'; }
    const st = $('#steps'); if (st) st.innerHTML = STEPS.map((n, i) => `<i title="${n}" class="${P.phase === 'running' || P.step > i ? 'd' : P.step === i ? 'c' : ''}"></i>`).join('');
    const l = $('#playlabel'); if (l) l.textContent = P.phase === 'running' ? 'Minecraft se está ejecutando.' : P.label || 'Listo para jugar.';
    const bar = $('#bar'); if (bar) bar.style.width = (P.phase === 'running' ? 100 : P.pct || 0) + '%';
    const s = $('#state'); s.className = 'pill ' + ({ running: 'ok', error: 'err', starting: 'acc' }[P.phase] || ''); s.innerHTML = '<i class="dot"></i>' + ({ running: 'Minecraft en ejecución', starting: 'Iniciando…', error: 'Error al iniciar' }[P.phase] || 'Listo');
  };
  X.acts.play = async () => {
    if (S.play.phase === 'running' || S.play.phase === 'starting') return toast('Minecraft ya está iniciándose o abierto', 'warn');
    if (!S.active) { toast('Inicia sesión con Microsoft para jugar', 'warn'); return X.go('accounts'); }
    const p = curProfile(); if (!p) { toast('Crea un perfil primero', 'warn'); return X.go('profiles'); }
    S.play = { phase: 'starting', step: -1, label: 'Preparando…', pct: 0, error: null }; X.render();
    try { await call('play', { id: p.id }); }
    catch (e) { if (S.play.phase !== 'error') S.play = { ...S.play, phase: 'error', error: msg(e) }; X.render(); if (['NO_ACCOUNT', 'EXPIRED', 'NO_LICENSE', 'INVALID_APP', 'NO_CLIENT_ID'].includes(e.code)) { await X.reloadAccounts(); X.go('accounts'); } }
  };
  api.on('play:step', d => { S.play = { ...S.play, phase: 'starting', step: d.index, label: d.label }; X.paintPlay(); });
  api.on('progress', d => { if (S.play.phase !== 'starting') return; S.play.pct = d.total ? Math.round(d.cur / d.total * 100) : 0; S.play.label = `${d.label || ''} ${d.cur}/${d.total}`; X.paintPlay(); });
  api.on('task', d => { if (S.play.phase === 'starting') { S.play.label = d.label; X.paintPlay(); } if (S.editor && S.editor.busy) { S.editor.msg = d.label; const m = $('#edmsg'); if (m) m.textContent = d.label; } });
  api.on('play:running', () => { S.play = { ...S.play, phase: 'running', pct: 100 }; X.paintPlay(); toast('Minecraft se ha iniciado', 'ok'); X.reloadProfiles(); });
  api.on('play:error', d => { S.play = { ...S.play, phase: 'error', error: d.message, pct: 0, label: '', step: -1 }; X.render(); toast(d.message.split('\n')[0], 'err', 8000); });
  api.on('play:closed', d => { S.play = { phase: 'idle', step: -1, label: '', pct: 0, error: null }; X.render(); X.reloadProfiles(); if (d.crashed) toast(`Minecraft se cerró con error (código ${d.code}). Revisa Ajustes → Registros.`, 'warn', 9000); else toast('Minecraft se cerró'); });

  /* ---------- INICIO ---------- */
  const profCard = p => `<div class="row" style="gap:12px;margin:0">${picon(p)}<div class="col" style="gap:0;flex:1"><h4>${esc(p.name)}</h4><span class="tag">Minecraft ${esc(p.mc)} · ${esc(p.loader)}${p.loaderVersion ? ' ' + esc(p.loaderVersion) : ''}</span></div>
    ${S.profiles.length > 1 ? `<select data-chg="homeProfile">${S.profiles.map(x => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}</div>
    <div class="tag" style="margin-top:10px">${p.mods} mods · RAM ${mb(p.ram || S.settings.ramMb || 4096)} · Último inicio: ${p.lastPlayed ? when(p.lastPlayed) : 'nunca'}</div>`;
  X.views.home = () => {
    const a = activeAcc(), p = curProfile(), k = a && S.skins[a.id], el = $('#home'), up = p && S.modUpdates[p.id];
    el.innerHTML = `${!a ? `<div class="banner"><div style="flex:1"><b>Inicia sesión con Microsoft</b><div class="tag">Necesitas una cuenta con Minecraft: Java Edition para jugar.</div></div><button class="btn" data-act="goAccounts">Iniciar sesión</button></div>` : ''}
     ${S.play.phase === 'error' ? `<div class="banner err"><div style="flex:1"><b>No se pudo iniciar Minecraft</b><pre>${esc(S.play.error)}</pre></div><button class="btn g s" data-act="goLogs">Ver registros</button></div>` : ''}
     <div class="hero"><div class="stage" id="skHome"></div><div class="col" style="gap:14px;min-width:0">
      <div><div class="tag">${a ? 'Jugador' : 'Sin sesión'}</div><h1>${a ? esc(a.name) : 'Bienvenido'}</h1>
       ${a ? `<span class="pill ${status(a)[0]}"><i class="dot"></i>${status(a)[1]}</span> <span class="pill">${a.variant === 'SLIM' ? 'Alex (brazos finos)' : 'Steve'}</span>` : ''}</div>
      <div class="card">${p ? profCard(p) : '<div class="tag">Todavía no tienes perfiles.</div><button class="btn" data-act="newProfile" style="margin-top:10px">Crear perfil</button>'}</div>
      <div><button class="btn xl" id="playbtn" data-act="play"></button><div class="steps" id="steps"></div><div class="bar"><div id="bar"></div></div><div class="tag" id="playlabel" style="margin-top:6px"></div></div>
      <div class="card"><h3 style="margin-top:0">Actualizaciones</h3><div class="row" style="margin:0"><span>XTL Client <b>${esc(S.info.version || '')}</b></span><span class="tag">${esc(S.updateMsg)}</span><button class="btn g s" data-act="checkUpdate">Buscar actualizaciones</button></div>
       ${p && p.loader !== 'vanilla' ? `<div class="row" style="margin:10px 0 0"><span>Mods del perfil: <b>${up ? (up.length ? up.length + ' actualización(es) disponible(s)' : 'todo al día') : 'sin comprobar'}</b></span><button class="btn g s" data-act="checkModsHome">Comprobar</button>${up && up.length ? '<button class="btn s" data-act="goModUpdates">Ver</button>' : ''}</div>` : ''}</div>
     </div></div>`;
    const st = $('#skHome'); if (k && k.png) Skin.mount(st, k.png, a.variant).catch(() => { st.innerHTML = '<div class="tag">Skin no disponible</div>'; });
    else st.innerHTML = `<div class="tag" style="text-align:center;padding:20px">${a ? 'Cargando skin…' : 'Inicia sesión para ver tu skin en 3D'}</div>`;
    X.paintPlay();
  };
  Object.assign(X.chg, { homeProfile: async el => { await call('settings:set', { activeProfile: el.value }); await X.reloadSettings(); X.render(); } });
  Object.assign(X.acts, {
    checkUpdate: async () => { S.updateMsg = 'Comprobando…'; X.render(); const r = await call('app:update'); S.updateMsg = r.message; X.render(); },
    checkModsHome: async () => { const p = curProfile(); S.modUpdates[p.id] = await call('mods:check', { id: p.id }); X.render(); },
    goModUpdates: () => { S.modTab = 'mods'; S.modProfile = curProfile().id; X.go('modules'); }
  });

  /* ---------- CUENTAS ---------- */
  const loginPanel = L => `<div class="card" style="margin-bottom:16px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">${L.code ? `<div><div class="tag" style="margin-bottom:6px">1. Abre la página de Microsoft  2. Escribe este código</div><div class="code" id="devcode">${esc(L.code)}</div></div>
    <div class="col"><button class="btn" data-act="openMs">Abrir página de Microsoft</button><button class="btn g s" data-act="copyCode">Copiar código</button></div>` : '<div class="tag">Conectando con Microsoft…</div>'}
    <div class="col" style="margin-left:auto"><span class="tag">Esperando a que termines en el navegador…</span><button class="btn r s" data-act="cancelLogin">Cancelar</button></div></div>`;
  X.views.accounts = () => {
    const el = $('#accounts'), sel = S.accounts.find(a => a.id === S.selAcc) || activeAcc() || S.accounts[0], L = S.login, E = S.loginErr; if (sel) S.selAcc = sel.id;
    const list = S.accounts.map(a => { const [cls, txt] = status(a); return `<div class="it" style="cursor:pointer;${sel && a.id === sel.id ? 'background:rgba(255,255,255,.04);border-radius:10px;' : ''}" data-act="selectAcc" data-id="${esc(a.id)}">${avatar(a)}<div class="tx"><b>${esc(a.name)}</b><span class="tag">${txt}</span></div>${a.active ? '<span class="pill acc">Activa</span>' : ''}</div>`; }).join('') || '<div class="tag" style="padding:14px">No hay cuentas conectadas.</div>';
    const row = (k, v) => `<div class="it"><span class="tag" style="width:150px">${k}</span><div class="tx"><span style="white-space:normal">${v}</span></div></div>`;
    const detail = sel ? `<div class="card"><div class="row" style="gap:16px;align-items:flex-start"><div class="stage" id="skDetail" style="width:230px;min-height:290px;flex:none"></div><div class="col" style="flex:1;min-width:200px"><h1 style="font-size:1.8rem">${esc(sel.name)}</h1>
        <span class="pill ${status(sel)[0]}"><i class="dot"></i>${status(sel)[1]}</span><div class="col" style="margin-top:12px"><button class="btn" data-act="useAcc" data-id="${esc(sel.id)}" ${sel.active ? 'disabled' : ''}>${sel.active ? 'Cuenta en uso' : 'Usar esta cuenta'}</button>
        <button class="btn g" data-act="refreshAcc" data-id="${esc(sel.id)}">Actualizar perfil y skin</button><button class="btn r" data-act="logoutAcc" data-id="${esc(sel.id)}">Cerrar sesión</button></div></div></div>
        <div class="list" style="margin-top:12px">${row('Tipo de cuenta', 'Microsoft · Minecraft: Java Edition')}${row('UUID', esc(dashed(sel.id)))}${row('Modelo de skin', sel.variant === 'SLIM' ? 'Alex (SLIM)' : 'Steve (CLASSIC)')}
        ${row('Licencia del juego', sel.status === 'ok' ? '✓ Verificada con Mojang' : 'Sin verificar')}${row('Almacenamiento', sel.persisted ? 'Token cifrado en el sistema' : 'Solo en memoria (sin almacén seguro)')}
        ${row('Sesión válida hasta', sel.sessionUntil ? when(sel.sessionUntil) : 'Se renueva al jugar')}${row('Añadida', when(sel.addedAt))}${row('Último inicio', when(sel.lastLogin))}</div></div>` : '<div class="card tag">Inicia sesión para ver los datos de tu cuenta, tu skin y gestionar varias cuentas.</div>';
    el.innerHTML = `<div class="row"><button class="btn" data-act="login" ${L ? 'disabled' : ''}>${ic('user')} Iniciar sesión con Microsoft</button><span class="tag">Se abre la página oficial de Microsoft. XTL Client nunca ve tu contraseña.</span></div>
     ${L ? loginPanel(L) : ''}${E ? `<div class="banner err"><div style="flex:1"><b>No se pudo iniciar sesión</b><div>${esc(E.message)}</div></div></div>` : ''}
     <details class="card" style="margin-bottom:18px" ${(E && E.code === 'NO_CLIENT_ID') || !S.settings.msClientId ? 'open' : ''}><summary>Configuración de Microsoft (Client ID de Azure)</summary>
      <p class="tag">Necesitas tu propia aplicación de Azure, aprobada por Mojang para los servicios de Minecraft. Pasos en <b>docs/CONFIGURAR-MICROSOFT.md</b>.</p>
      <div class="row"><input type="text" id="cid" style="flex:1;min-width:260px" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${esc(S.settings.msClientId)}"><button class="btn" data-act="saveClientId">Guardar</button></div>
      <div class="row" style="margin:0"><button class="btn g s" data-act="openEntra">Abrir portal de Azure</button><button class="btn g s" data-act="openAppReg">Solicitar aprobación a Mojang</button></div></details>
     <div class="g2"><div class="card list">${list}</div><div>${detail}</div></div>`;
    const st = $('#skDetail'), k = sel && S.skins[sel.id]; if (st) { if (k && k.png) Skin.mount(st, k.png, sel.variant).catch(() => { st.innerHTML = '<div class="tag">Skin no disponible</div>'; }); else st.innerHTML = '<div class="tag">Cargando skin…</div>'; }
  };
  api.on('auth:code', d => { S.login = { code: d.user_code, uri: d.verification_uri }; if (S.view === 'accounts') X.views.accounts(); });
  Object.assign(X.acts, {
    login: async () => {
      if (S.login) return; S.login = { code: null }; S.loginErr = null; X.render();
      try { const a = await call('acc:login'); S.login = null; toast('Sesión iniciada: ' + a.name); await X.reloadAccounts(); S.selAcc = a.id; await X.reloadSettings(); X.render(); }
      catch (e) { S.login = null; if (e.code !== 'CANCELLED') { S.loginErr = { code: e.code, message: msg(e) }; toast(msg(e), 'err', 9000); } X.render(); }
    },
    cancelLogin: () => call('acc:cancel'), openMs: () => call('app:external', { url: S.login.uri }),
    copyCode: async () => { await navigator.clipboard.writeText(S.login.code); toast('Código copiado'); },
    selectAcc: b => { S.selAcc = b.dataset.id; X.views.accounts(); },
    useAcc: async b => { await call('acc:switch', { id: b.dataset.id }); await X.reloadAccounts(); await X.reloadSettings(); toast('Cuenta activa cambiada'); X.render(); },
    refreshAcc: async b => { try { await call('acc:refresh', { id: b.dataset.id }); toast('Perfil y skin actualizados'); } catch (e) { toast(msg(e), 'err', 8000); } await X.reloadAccounts(); X.render(); },
    logoutAcc: async b => { if (!confirm('¿Cerrar la sesión de esta cuenta?')) return; await call('acc:remove', { id: b.dataset.id }); S.selAcc = ''; await X.reloadAccounts(); await X.reloadSettings(); toast('Sesión cerrada'); X.render(); },
    saveClientId: async () => { await call('settings:set', { msClientId: $('#cid').value }); await X.reloadSettings(); S.loginErr = null; toast('Client ID guardado'); X.render(); },
    openEntra: () => call('app:external', { url: 'https://entra.microsoft.com' }), openAppReg: () => call('app:external', { url: 'https://aka.ms/AppRegInfo' })
  });

  /* ---------- PERFILES ---------- */
  const EMOJI = ['⛏️', '⚔️', '🏹', '🧱', '🌲', '🚀', '🔥', '❄️', '💎', '🐉', '🧪', '🎮', '🏰', '🌙', '⚡', '📦'], COLORS = ['#6ea8ff', '#7cf5c4', '#ff7a85', '#fbbf24', '#c084fc', '#f472b6', '#38bdf8', '#a3e635'];
  X.views.profiles = () => {
    const sel = curProfile(), el = $('#profiles');
    el.innerHTML = `<div class="row"><button class="btn" data-act="newProfile">${ic('plus')} Nuevo perfil</button><button class="btn g" data-act="importPack">Importar modpack (.mrpack)</button><span class="tag">Cada perfil tiene su propia carpeta: mundos, mods y ajustes independientes.</span></div>
     <div class="grid">${S.profiles.map(p => `<div class="card hov"><div class="row" style="gap:12px;margin-bottom:8px">${picon(p)}<div class="col" style="gap:0;min-width:0"><h4>${esc(p.name)}</h4><span class="tag">${esc(p.mc)} · ${esc(p.loader)}</span></div>${sel && sel.id === p.id ? '<span class="pill acc" style="margin-left:auto">En uso</span>' : ''}</div>
      <div class="tag">${p.mods} mods · RAM ${p.ram ? mb(p.ram) : 'global'} · Java ${p.java === 'auto' ? 'auto' : esc(p.java).slice(-20)}${p.resW ? ` · ${p.resW}×${p.resH}` : ''}</div>
      <div class="row" style="margin:12px 0 0;gap:6px"><button class="btn s" data-act="useProfile" data-id="${p.id}" ${sel && sel.id === p.id ? 'disabled' : ''}>Usar</button><button class="btn g s" data-act="editProfile" data-id="${p.id}">Editar</button><button class="btn g s" data-act="dupProfile" data-id="${p.id}">Duplicar</button><button class="btn g s" data-act="openProfile" data-id="${p.id}">Carpeta</button><button class="btn r s" data-act="delProfile" data-id="${p.id}">Eliminar</button></div></div>`).join('') || '<div class="card tag">Aún no tienes perfiles. Crea uno para empezar.</div>'}</div>`;
  };
  async function openEditor(mode, p) {
    await X.ensureVersions(); X.ensureJava().catch(() => {});
    const rel = S.versions.find(v => v.type === 'release');
    S.editor = { mode, id: p && p.id, filter: 'release', busy: false, err: '', msg: '', draft: p ? { name: p.name, icon: p.icon, mc: p.mc, loader: p.loader, ram: p.ram, java: p.java, resW: p.resW, resH: p.resH, jvm: p.jvm || '' }
      : { name: 'Mi perfil', icon: { type: 'emoji', v: '⛏️' }, mc: rel ? rel.id : '', loader: 'fabric', preset: 'perf', ram: 0, java: 'auto', resW: 0, resH: 0, jvm: '' } };
    renderEditor();
  }
  function renderEditor() {
    const E = S.editor, m = $('#modal'); if (!E) { m.hidden = true; m.innerHTML = ''; return; } const d = E.draft, create = E.mode === 'create'; m.hidden = false;
    const vers = S.versions.filter(v => E.filter === 'old' ? v.type.startsWith('old') : v.type === E.filter), sys = (S.java && S.java.system) || [];
    const javaOpts = ['auto', '8', '17', '21', '25'].map(v => `<option value="${v}" ${String(d.java) === v ? 'selected' : ''}>${v === 'auto' ? 'Automático (recomendado)' : 'Java ' + v + ' (Temurin)'}</option>`).join('') + sys.map(j => `<option value="${esc(j.path)}" ${d.java === j.path ? 'selected' : ''}>Sistema: Java ${j.major} — ${esc(j.path)}</option>`).join('') + (d.java && !['auto', '8', '17', '21', '25'].includes(String(d.java)) && !sys.find(j => j.path === d.java) ? `<option value="${esc(d.java)}" selected>${esc(d.java)}</option>` : '');
    const enter = E.shown ? '' : ' enter'; E.shown = true;
    m.innerHTML = `<div class="dlg${enter}" role="dialog" aria-label="Perfil"><h1 style="font-size:1.5rem">${create ? 'Nuevo perfil' : 'Editar perfil'}</h1>
     <label class="lbl">Nombre</label><input type="text" style="width:100%" maxlength="40" data-bind="editor.draft.name" value="${esc(d.name)}">
     <label class="lbl">Icono</label><div class="emo">${EMOJI.map(e => `<button class="${d.icon.type === 'emoji' && d.icon.v === e ? 'on' : ''}" data-act="pickIcon" data-t="emoji" data-v="${e}">${e}</button>`).join('')}</div>
     <div class="row" style="margin-top:8px">${COLORS.map(c => `<span class="sw-c ${d.icon.type === 'color' && d.icon.v === c ? 'on' : ''}" style="background:${c}" data-act="pickIcon" data-t="color" data-v="${c}"></span>`).join('')}<button class="btn g s" data-act="iconImage" ${create ? 'disabled title="Disponible después de crear el perfil"' : ''}>Imagen…</button></div>
     ${create ? `<label class="lbl">Versión de Minecraft</label><div class="row"><div class="seg">${[['release', 'Versiones'], ['snapshot', 'Snapshots'], ['old', 'Antiguas']].map(([k, t]) => `<button class="${E.filter === k ? 'on' : ''}" data-act="verFilter" data-v="${k}">${t}</button>`).join('')}</div>
       <select data-bind="editor.draft.mc">${vers.map(v => `<option ${v.id === d.mc ? 'selected' : ''}>${esc(v.id)}</option>`).join('')}</select>
       <select data-bind="editor.draft.loader" data-after="edRender">${['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].map(l => `<option ${l === d.loader ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
       <label class="lbl">Preajuste de módulos (solo Fabric/Quilt)</label><select data-bind="editor.draft.preset">${[['none', 'Vacío'], ['perf', 'Rendimiento (FPS)'], ['pvp', 'PvP'], ['survival', 'Survival+']].map(([k, t]) => `<option value="${k}" ${d.preset === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`
       : `<div class="tag" style="margin-top:12px">Minecraft ${esc(d.mc)} · ${esc(d.loader)} (el cargador se cambia en Módulos → Cargadores)</div>`}
     <label class="lbl">Memoria RAM: <b id="edram">${d.ram ? mb(d.ram) : 'global (' + mb(S.settings.ramMb) + ')'}</b></label><input type="range" style="width:100%" min="0" max="${S.settings.maxRam}" step="512" value="${d.ram}" data-bind="editor.draft.ram" data-after="edRam">
     <label class="lbl">Java</label><div class="row" style="margin:0"><select style="flex:1" data-bind="editor.draft.java">${javaOpts}</select><button class="btn g s" data-act="pickJavaProfile">Elegir archivo…</button></div>
     <div class="f2"><div><label class="lbl">Resolución al iniciar (ancho × alto; 0 = por defecto)</label><div class="row" style="margin:0"><input type="number" min="0" max="7680" data-bind="editor.draft.resW" value="${d.resW}"><span>×</span><input type="number" min="0" max="4320" data-bind="editor.draft.resH" value="${d.resH}"></div></div>
      <div><label class="lbl">Argumentos JVM extra</label><input type="text" style="width:100%" placeholder="-Dejemplo=1" data-bind="editor.draft.jvm" value="${esc(d.jvm)}"></div></div>
     ${E.err ? `<div class="banner err" style="margin:14px 0 0"><div>${esc(E.err)}</div></div>` : ''}<div class="tag" id="edmsg" style="margin-top:10px;min-height:20px">${esc(E.msg)}</div>
     <div class="row" style="justify-content:flex-end;margin:14px 0 0"><button class="btn g" data-act="closeEditor" ${E.busy ? 'disabled' : ''}>Cancelar</button><button class="btn" data-act="saveProfile" ${E.busy ? 'disabled' : ''}>${E.busy ? 'Trabajando…' : create ? 'Crear perfil' : 'Guardar'}</button></div></div>`;
  }
  X.renderEditor = renderEditor;
  Object.assign(X.chg, { edRender: () => renderEditor(), edRam: el => { $('#edram').textContent = +el.value ? mb(+el.value) : 'global (' + mb(S.settings.ramMb) + ')'; } });
  Object.assign(X.acts, {
    newProfile: () => { X.go('profiles'); return openEditor('create'); },
    editProfile: b => openEditor('edit', S.profiles.find(p => p.id === b.dataset.id)),
    closeEditor: () => { S.editor = null; renderEditor(); },
    verFilter: b => { S.editor.filter = b.dataset.v; const v = S.versions.find(x => b.dataset.v === 'old' ? x.type.startsWith('old') : x.type === b.dataset.v); if (v) S.editor.draft.mc = v.id; renderEditor(); },
    pickIcon: b => { S.editor.draft.icon = { type: b.dataset.t, v: b.dataset.v }; renderEditor(); },
    iconImage: async () => { const p = await call('profile:icon', { id: S.editor.id }); if (p) { S.editor.draft.icon = p.icon; delete S.icons[p.id]; await X.reloadProfiles(); renderEditor(); toast('Icono actualizado'); } },
    pickJavaProfile: async () => { const f = await call('java:pick'); if (f) { S.editor.draft.java = f; renderEditor(); } },
    saveProfile: async () => {
      const E = S.editor, d = E.draft; E.busy = true; E.err = ''; renderEditor();
      try {
        if (E.mode === 'create') { const p = await call('profile:create', { ...d }); await call('settings:set', { activeProfile: p.id }); toast('Perfil creado: ' + p.name); }
        else { await call('profile:update', { id: E.id, patch: { name: d.name, icon: d.icon, ram: d.ram, java: d.java, resW: d.resW, resH: d.resH, jvm: d.jvm } }); toast('Perfil guardado'); }
        S.editor = null; renderEditor(); await X.reloadProfiles(); await X.reloadSettings(); X.render();
      } catch (e) { E.busy = false; E.err = msg(e); renderEditor(); }
    },
    useProfile: async b => { await call('settings:set', { activeProfile: b.dataset.id }); await X.reloadSettings(); X.render(); toast('Perfil seleccionado'); },
    dupProfile: async b => { await call('profile:dup', { id: b.dataset.id }); await X.reloadProfiles(); toast('Perfil duplicado'); X.render(); },
    openProfile: b => call('app:open', { what: 'profile', id: b.dataset.id }),
    delProfile: async b => { const p = S.profiles.find(x => x.id === b.dataset.id); if (!confirm(`¿Eliminar «${p.name}» y todos sus mundos y mods? No se puede deshacer.`)) return; await call('profile:remove', { id: p.id }); await X.reloadProfiles(); await X.reloadSettings(); toast('Perfil eliminado'); X.render(); },
    importPack: async () => { toast('Elige un archivo .mrpack…', 'ok', 2500); try { const p = await call('pack:import'); if (p) { await X.reloadProfiles(); await call('settings:set', { activeProfile: p.id }); await X.reloadSettings(); toast('Modpack importado: ' + p.name); X.render(); } } catch (e) { toast(msg(e), 'err', 9000); } }
  });
})();
