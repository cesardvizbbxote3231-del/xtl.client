// Módulos, Explorar (Modrinth), Ajustes, enlaces de eventos globales e inicio.
(() => {
  const { S, call, acts, chg, inp, views } = X, api = window.api;
  Object.assign(S, { modTab: 'quick', modProfile: '', exType: 'mod', exQ: '', exCat: '', exSort: 'relevance', exMc: '', exProfile: '', exLoader: 'all', exHits: [], exTotal: 0, cats: {}, logs: [] });
  const sel = () => S.profiles.find(p => p.id === S.modProfile) || X.curProfile();
  const LOADERS = { vanilla: 'Sin mods. El juego original de Mojang.', fabric: 'Ligero y rápido; el más usado para mods modernos y de rendimiento.', quilt: 'Basado en Fabric; también carga la mayoría de mods de Fabric.', forge: 'El clásico, con enorme catálogo de mods y modpacks.', neoforge: 'Sucesor moderno de Forge (Minecraft 1.20.2 en adelante).' };
  const empty = t => `<div class="card tag">${t}</div>`;

  /* ---------- MÓDULOS ---------- */
  views.modules = async () => {
    const el = $('#modules'); if (!S.profiles.length) { el.innerHTML = empty('Crea un perfil en la sección Perfiles para gestionar mods.'); return; }
    const p = sel(); S.modProfile = p.id; let body = '';
    if (S.modTab === 'quick') {
      if (!['fabric', 'quilt'].includes(p.loader)) body = empty('Los módulos rápidos necesitan un perfil Fabric o Quilt. Cambia el cargador en la pestaña «Cargadores».');
      else { const L = await call('mod:list', { id: p.id }); let cat = ''; body = L.map(m => (m.cat !== cat ? (cat = m.cat, `<h3>${esc(cat)}</h3>` ) : '') + `<div class="card" style="margin-bottom:8px"><div class="row" style="margin:0;flex-wrap:nowrap"><div class="col" style="flex:1;gap:0"><b>${esc(m.name)}</b><span class="tag">${esc(m.desc)}</span></div><label class="sw"><input type="checkbox" data-chg="module" data-id="${esc(m.id)}" ${m.on ? 'checked' : ''} aria-label="${esc(m.name)}"><i></i></label></div></div>`).join('') + '<p class="tag">Instalan mods de Modrinth en este perfil. Si un mod no existe para tu versión de Minecraft, se omite.</p>'; }
    } else if (S.modTab === 'mods') {
      const files = await call('mods:list', { id: p.id }), ups = S.modUpdates[p.id];
      body = `<div class="row"><button class="btn g s" data-act="checkUpdates">Buscar actualizaciones</button>${ups && ups.length ? '<button class="btn s" data-act="updateAll">Actualizar todo (' + ups.length + ')</button>' : ''}<button class="btn g s" data-act="addJar">Añadir .jar…</button><button class="btn g s" data-act="openModsDir">Abrir carpeta</button><button class="btn g s" data-act="openOptifine">OptiFine (sitio oficial)</button></div>
       ${ups ? `<div class="card" style="margin-bottom:14px"><b>${ups.length ? ups.length + ' actualización(es) disponible(s)' : 'Todos los mods están al día'}</b>${ups.map(u => `<div class="it"><div class="tx"><b>${esc(u.title)}</b><span class="tag">${esc(u.from)} → ${esc(u.to)}</span></div><button class="btn s" data-act="updateOne" data-file="${esc(u.file)}">Actualizar</button></div>`).join('')}</div>` : ''}
       <div class="card list">${files.map(f => `<div class="it"><div class="tx"><b class="${f.enabled ? '' : 'off'}">${esc(f.file.replace(/\.disabled$/, ''))}</b></div><button class="btn g s" data-act="toggleFile" data-file="${esc(f.file)}">${f.enabled ? 'Desactivar' : 'Activar'}</button><button class="btn r s" data-act="removeFile" data-file="${esc(f.file)}">Quitar</button></div>`).join('') || '<div class="tag" style="padding:12px">Este perfil no tiene mods. Instálalos desde Explorar o con los módulos rápidos.</div>'}</div>
       <p class="tag">OptiFine solo puede descargarse desde optifine.net. Descárgalo y añádelo con «Añadir .jar» en un perfil Forge compatible. En Fabric/Quilt usa Sodium + Iris (módulos «Impulso de FPS» y «Shaders»).</p>`;
    } else if (S.modTab === 'packs') {
      body = `<div class="card"><h4>Modpacks</h4><p class="tag">Un modpack se instala como un perfil nuevo, con su versión de Minecraft, su cargador y todos sus mods ya configurados.</p><div class="row" style="margin:0"><button class="btn" data-act="goExplorePacks">Buscar modpacks en Modrinth</button><button class="btn g" data-act="importPack">Importar archivo .mrpack</button></div></div>
       <h3>Perfiles instalados</h3><div class="card list">${S.profiles.map(x => `<div class="it">${X.picon(x)}<div class="tx"><b>${esc(x.name)}</b><span class="tag">${esc(x.mc)} · ${esc(x.loader)} · ${x.mods} mods</span></div></div>`).join('')}</div>`;
    } else {
      body = `<div class="grid">${Object.entries(LOADERS).map(([l, t]) => `<div class="card hov"><div class="row" style="margin:0 0 6px"><h4 style="text-transform:capitalize">${l}</h4>${p.loader === l ? '<span class="pill ok"><i class="dot"></i>En uso</span>' : ''}</div><p class="tag" style="min-height:44px">${t}</p>
        <button class="btn ${p.loader === l ? 'g' : ''} s" data-act="setLoader" data-l="${l}" ${p.loader === l ? 'disabled' : ''}>${p.loader === l ? 'Instalado' : 'Usar en este perfil'}</button></div>`).join('')}</div>
        <p class="tag">Cambiar de cargador deja los mods actuales en su sitio, pero pueden dejar de ser compatibles. Los demás perfiles no se modifican.</p>`;
    }
    el.innerHTML = `<div class="row"><select data-chg="modProfile" style="min-width:240px">${S.profiles.map(x => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.mc)} ${esc(x.loader)}</option>`).join('')}</select>
      <div class="seg">${[['quick', 'Rápidos'], ['mods', 'Mods'], ['packs', 'Modpacks'], ['loaders', 'Cargadores']].map(([k, t]) => `<button class="${S.modTab === k ? 'on' : ''}" data-act="modTab" data-t="${k}">${t}</button>`).join('')}</div></div>${body}`;
  };
  Object.assign(chg, {
    modProfile: el => { S.modProfile = el.value; views.modules(); },
    module: async el => { el.disabled = true; try { await call('mod:set', { profile: S.modProfile, id: el.dataset.id, on: el.checked }); toast(el.checked ? 'Módulo instalado' : 'Módulo desactivado'); await X.reloadProfiles(); } catch (e) { toast(msg(e), 'err', 9000); } views.modules(); }
  });
  Object.assign(acts, {
    modTab: b => { S.modTab = b.dataset.t; views.modules(); },
    goExplorePacks: () => { S.exType = 'modpack'; S.exHits = []; X.go('explore'); },
    toggleFile: async b => { await call('mods:toggle', { id: S.modProfile, file: b.dataset.file }); views.modules(); },
    removeFile: async b => { if (!confirm('¿Quitar ' + b.dataset.file + '?')) return; await call('mods:remove', { id: S.modProfile, file: b.dataset.file }); await X.reloadProfiles(); views.modules(); },
    addJar: async () => { if (await call('mods:add', { id: S.modProfile })) { toast('Mod añadido'); await X.reloadProfiles(); views.modules(); } },
    openModsDir: () => call('app:open', { what: 'profile', id: S.modProfile }),
    openOptifine: () => call('app:external', { url: 'https://optifine.net/downloads' }),
    checkUpdates: async b => { b.disabled = true; b.textContent = 'Comprobando…'; try { S.modUpdates[S.modProfile] = await call('mods:check', { id: S.modProfile }); } finally { views.modules(); } },
    updateAll: async b => { b.disabled = true; b.textContent = 'Actualizando…'; try { const n = await call('mods:update', { id: S.modProfile }); toast(n + ' mod(s) actualizado(s)'); S.modUpdates[S.modProfile] = await call('mods:check', { id: S.modProfile }); } finally { views.modules(); } },
    updateOne: async b => { b.disabled = true; try { await call('mods:update', { id: S.modProfile, files: [b.dataset.file] }); toast('Mod actualizado'); S.modUpdates[S.modProfile] = await call('mods:check', { id: S.modProfile }); } finally { views.modules(); } },
    setLoader: async b => { const p = sel(); if (!confirm(`¿Usar ${b.dataset.l} en «${p.name}»? Se instalará el cargador (puede tardar unos minutos).`)) return; toast('Instalando ' + b.dataset.l + '…', 'ok', 3000); b.disabled = true;
      try { await call('profile:loader', { id: p.id, loader: b.dataset.l }); toast('Cargador cambiado a ' + b.dataset.l); await X.reloadProfiles(); } catch (e) { toast(msg(e), 'err', 9000); } views.modules(); }
  });

  /* ---------- EXPLORAR (Modrinth) ---------- */
  const TYPES = [['mod', 'Mods'], ['modpack', 'Modpacks'], ['resourcepack', 'Recursos'], ['shader', 'Shaders']];
  views.explore = async () => {
    await X.ensureVersions(); const t = S.exType; if (!S.cats[t]) { try { S.cats[t] = await call('mr:cats', { type: t }); } catch { S.cats[t] = []; } }
    const p = S.profiles.find(x => x.id === S.exProfile) || X.curProfile(); if (p) S.exProfile = p.id; const rel = S.versions.filter(v => v.type === 'release');
    $('#explore').innerHTML = `<div class="row"><div class="seg">${TYPES.map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-act="exType" data-t="${k}">${n}</button>`).join('')}</div>
      <input type="search" id="exq" placeholder="Buscar en Modrinth…" data-inp="exQ" value="${esc(S.exQ)}"></div>
     <div class="row"><select data-chg="exCat"><option value="">Todas las categorías</option>${(S.cats[t] || []).map(c => `<option ${S.exCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select data-chg="exSort">${[['relevance', 'Relevancia'], ['downloads', 'Más descargados'], ['follows', 'Más seguidos'], ['newest', 'Más nuevos'], ['updated', 'Actualizados']].map(([k, n]) => `<option value="${k}" ${S.exSort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select data-chg="exMc"><option value="">${t === 'modpack' ? 'Cualquier versión' : p ? 'Versión del perfil (' + esc(p.mc) + ')' : 'Cualquier versión'}</option>${rel.slice(0, 60).map(v => `<option ${S.exMc === v.id ? 'selected' : ''}>${esc(v.id)}</option>`).join('')}</select>
      ${t === 'modpack' ? `<select data-chg="exLoader">${['all', 'fabric', 'quilt', 'forge', 'neoforge'].map(l => `<option value="${l}" ${S.exLoader === l ? 'selected' : ''}>${l === 'all' ? 'Todos los cargadores' : l}</option>`).join('')}</select>`
        : `<select data-chg="exProfile">${S.profiles.map(x => `<option value="${esc(x.id)}" ${p && x.id === p.id ? 'selected' : ''}>Instalar en: ${esc(x.name)}</option>`).join('') || '<option value="">Sin perfiles</option>'}</select>`}</div>
     <div id="exres"></div>`;
    exPaint(); if (!S.exHits.length) exSearch();
  };
  function exPaint() {
    const el = $('#exres'); if (!el) return;
    el.innerHTML = S.exLoading && !S.exHits.length ? '<div class="grid"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>' :
      (S.exHits.length ? `<div class="grid">${S.exHits.map((h, i) => `<div class="card hov" style="display:flex;flex-direction:column;gap:8px"><div class="row" style="margin:0;gap:12px;flex-wrap:nowrap">${h.icon ? `<img class="pi" alt="" src="${esc(h.icon)}">` : '<span class="pi">📦</span>'}<div class="col" style="gap:0;min-width:0"><h4 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.title)}</h4><span class="tag">${esc(h.author || '')} · ${h.dl.toLocaleString('es')} descargas</span></div></div>
        <p class="tag" style="margin:0;flex:1">${esc(h.desc)}</p><div class="row" style="margin:0;justify-content:space-between"><span>${(h.cats || []).map(c => `<span class="pill">${esc(c)}</span>`).join(' ')}</span><button class="btn s" data-act="exInstall" data-i="${i}">Instalar</button></div></div>`).join('')}</div>
        ${S.exHits.length < S.exTotal ? '<div class="row" style="justify-content:center;margin-top:16px"><button class="btn g" data-act="exMore">Cargar más</button></div>' : ''}` : '<div class="card tag">Sin resultados. Prueba otra búsqueda o cambia los filtros.</div>');
  }
  async function exSearch(more) {
    const p = S.profiles.find(x => x.id === S.exProfile), t = S.exType; S.exLoading = true; if (!more) { S.exHits = []; exPaint(); }
    try {
      const r = await call('mr:search', { q: S.exQ, type: t, mc: S.exMc || (t === 'modpack' || !p ? '' : p.mc), loader: t === 'mod' ? (p ? p.loader : undefined) : t === 'modpack' ? S.exLoader : undefined, category: S.exCat, sort: S.exSort, offset: more ? S.exHits.length : 0 });
      S.exHits = more ? S.exHits.concat(r.hits) : r.hits; S.exTotal = r.total;
    } catch (e) { S.exHits = []; toast('No se pudo buscar en Modrinth: ' + msg(e), 'err'); } finally { S.exLoading = false; exPaint(); }
  }
  Object.assign(inp, { exQ: debounce(el => { S.exQ = el.value; exSearch(); }) });
  Object.assign(chg, { exCat: el => { S.exCat = el.value; exSearch(); }, exSort: el => { S.exSort = el.value; exSearch(); }, exMc: el => { S.exMc = el.value; exSearch(); }, exLoader: el => { S.exLoader = el.value; exSearch(); }, exProfile: el => { S.exProfile = el.value; exSearch(); } });
  Object.assign(acts, {
    exType: b => { S.exType = b.dataset.t; S.exCat = ''; S.exHits = []; views.explore(); },
    exMore: () => exSearch(true),
    exInstall: async b => {
      const h = S.exHits[+b.dataset.i], t = S.exType; if (t !== 'modpack' && !S.exProfile) { toast('Crea un perfil para instalar contenido', 'warn'); return X.go('profiles'); }
      b.disabled = true; b.textContent = 'Instalando…';
      try {
        if (t === 'modpack') { const p = await call('mr:pack', { id: h.id, title: h.title }); toast('Modpack instalado como perfil «' + p.name + '»'); }
        else { const n = await call('mr:install', { profile: S.exProfile, id: h.id, type: t }); toast(`${h.title} instalado (${n} archivo${n > 1 ? 's' : ''})`); }
        b.textContent = 'Instalado ✓'; await X.reloadProfiles();
      } catch (e) { b.disabled = false; b.textContent = 'Instalar'; toast(msg(e), 'err', 9000); }
    }
  });

  /* ---------- AJUSTES ---------- */
  const sw = (k, v, label, d) => `<label class="row" style="gap:12px;cursor:pointer;margin:8px 0 0"><span class="sw"><input type="checkbox" data-chg="${k}" ${v ? 'checked' : ''}><i></i></span><span>${label}${d ? `<br><span class="tag">${d}</span>` : ''}</span></label>`;
  views.settings = async () => {
    const T = S.settings, I = S.info; await X.ensureJava().catch(() => {}); const J = S.java || { managed: [], system: [] };
    const javaOpts = ['auto', '8', '17', '21', '25'].map(v => `<option value="${v}" ${String(T.java) === v ? 'selected' : ''}>${v === 'auto' ? 'Automático (recomendado)' : 'Java ' + v + ' (Temurin)'}</option>`).join('') + J.system.map(j => `<option value="${esc(j.path)}" ${T.java === j.path ? 'selected' : ''}>Sistema: Java ${j.major}</option>`).join('');
    $('#settings').innerHTML = `<div class="g2"><div>
      <h3>Memoria RAM</h3><div class="card"><div class="row" style="margin:0"><input type="range" min="1024" max="${T.maxRam}" step="512" value="${T.ramMb}" data-chg="ram" data-inp="ramLbl"><b id="ramv" style="min-width:56px">${mb(T.ramMb)}</b><button class="btn g s" data-act="detectRam">Detectar recomendada</button></div><p class="tag" style="margin:8px 0 0">Tu PC tiene ${T.totalGB} GB. Recomendado: ${mb(T.recRam)}. Cada perfil puede usar su propia memoria.</p></div>
      <h3>Java</h3><div class="card"><div class="row"><span>Versión por defecto</span><select data-chg="javaDef" style="flex:1">${javaOpts}</select><button class="btn g s" data-act="pickJavaGlobal">Elegir archivo…</button></div>
       <div class="list">${J.managed.map(j => `<div class="it"><div class="tx"><b>Java ${j.major} · Eclipse Temurin</b><span class="tag">${j.installed ? esc(j.path) : 'No instalado'}</span></div>${j.installed ? '<span class="pill ok">Instalado</span>' : `<button class="btn g s" data-act="installJava" data-major="${j.major}">Instalar</button>`}</div>`).join('')}
       ${J.system.map(j => `<div class="it"><div class="tx"><b>Java ${j.major} · Sistema</b><span class="tag">${esc(j.path)}</span></div><span class="pill">Detectado</span></div>`).join('')}</div>
       <p class="tag" style="margin:8px 0 0">En «Automático», XTL Client elige la versión que pide cada Minecraft y la instala si falta.</p></div>
      <h3>Rendimiento y juego</h3><div class="card"><div class="f2"><div><label class="lbl" style="margin-top:0">Resolución por defecto (0 = ventana normal)</label><div class="row" style="margin:0"><input type="number" min="0" max="7680" value="${T.resW}" data-chg="resW"><span>×</span><input type="number" min="0" max="4320" value="${T.resH}" data-chg="resH"></div></div>
       <div><label class="lbl" style="margin-top:0">Argumentos JVM extra</label><input type="text" style="width:100%" value="${esc(T.jvmExtra)}" data-inp="jvmExtra" placeholder="-Dejemplo=1"></div></div>
       ${sw('jvmPreset', T.jvmPreset, 'Argumentos de Java optimizados (G1GC)')}${sw('lite', T.lite, 'Modo ligero', 'Cierra la ventana del launcher mientras juegas y la reabre al salir.')}</div>
      <h3>Apariencia</h3><div class="card"><div class="row" style="margin:0">${['#6ea8ff', '#7cf5c4', '#c084fc', '#f472b6', '#fbbf24', '#ff7a85'].map(c => `<span class="sw-c ${T.accent === c ? 'on' : ''}" style="background:${c}" data-act="setAccent" data-v="${c}" role="button" aria-label="Color ${c}"></span>`).join('')}</div>${sw('motion', T.motion, 'Animaciones', 'Desactívalas para ahorrar CPU/GPU.')}</div>
     </div><div>
      <h3>Directorios</h3><div class="card list">${[['data', 'Datos de XTL Client', I.dataDir], ['root', 'Juego compartido (versiones, librerías, assets)', I.rootDir], ['profiles', 'Perfiles', I.profilesDir], ['logs', 'Registros', I.logsDir]].map(([w, n, p]) => `<div class="it"><div class="tx"><b>${n}</b><span class="tag">${esc(p)}</span></div><button class="btn g s" data-act="openDir" data-what="${w}">Abrir</button></div>`).join('')}</div>
      <h3>Idioma y actualizaciones</h3><div class="card"><div class="row" style="margin:0"><span>Idioma de la interfaz: <b>Español</b></span></div><div class="row" style="margin:10px 0 0"><span>XTL Client <b>${esc(I.version || '')}</b></span><span class="tag">${esc(S.updateMsg)}</span><button class="btn g s" data-act="checkUpdate">Buscar actualizaciones</button></div></div>
      <h3>Registros</h3><div class="card"><div class="row"><button class="btn g s" data-act="loadLogs">Actualizar</button><button class="btn g s" data-act="copyLogs">Copiar</button><button class="btn g s" data-act="openLogs">Abrir carpeta</button><button class="btn r s" data-act="clearLogs">Borrar</button></div><pre class="log" id="logbox">Pulsa «Actualizar» para ver los registros.</pre></div>
      <h3>Acerca de</h3><div class="card tag">XTL Client no es un producto oficial de Minecraft ni está afiliado, aprobado ni respaldado por Mojang Studios o Microsoft. Minecraft es marca de sus propietarios. XTL Client descarga el juego únicamente desde los servidores oficiales y exige una cuenta con licencia.</div>
     </div></div>`;
  };
  const save = async p => { await call('settings:set', p); await X.reloadSettings(); };
  Object.assign(inp, { ramLbl: el => { $('#ramv').textContent = mb(+el.value); }, jvmExtra: debounce(async el => { await save({ jvmExtra: el.value }); toast('Guardado', 'ok', 1200); }, 600) });
  Object.assign(chg, {
    ram: async el => { await save({ ram: +el.value }); toast('Memoria: ' + mb(+el.value), 'ok', 1800); }, javaDef: async el => { await save({ java: el.value }); toast('Java guardado', 'ok', 1500); },
    resW: el => save({ resW: +el.value }), resH: el => save({ resH: +el.value }), jvmPreset: el => save({ jvmPreset: el.checked }), lite: el => save({ lite: el.checked }), motion: el => save({ motion: el.checked })
  });
  const logText = () => S.logs.join('\n');
  const paintLogs = () => { const b = $('#logbox'); if (b) { b.textContent = logText() || 'Sin registros todavía.'; b.scrollTop = b.scrollHeight; } };
  Object.assign(acts, {
    detectRam: async () => { await save({ ram: S.settings.recRam }); toast('Memoria ajustada a ' + mb(S.settings.ramMb)); views.settings(); },
    pickJavaGlobal: async () => { const f = await call('java:pick'); if (f) { await save({ java: f }); toast('Java seleccionado'); views.settings(); } },
    installJava: async b => { b.disabled = true; b.textContent = 'Instalando…'; try { S.java = await call('java:install', { major: +b.dataset.major }); toast('Java instalado'); } catch (e) { toast(msg(e), 'err', 9000); } views.settings(); },
    setAccent: async b => { await save({ accent: b.dataset.v }); views.settings(); },
    openDir: b => call('app:open', { what: b.dataset.what }), openLogs: () => call('app:open', { what: 'logs' }),
    loadLogs: async () => { S.logs = await call('log:tail'); paintLogs(); },
    copyLogs: async () => { await navigator.clipboard.writeText(logText()); toast('Registros copiados'); },
    clearLogs: async () => { if (confirm('¿Borrar todos los registros?')) { await call('log:clear'); S.logs = []; paintLogs(); toast('Registros borrados'); } }
  });
  api.on('log:line', l => { S.logs.push(l); if (S.logs.length > 500) S.logs.shift(); if (S.view === 'settings') paintLogs(); });
  const idleStatus = d => { if (S.play.phase !== 'idle') return; const s = $('#state'); s.className = 'pill acc'; s.innerHTML = '<i class="dot"></i>' + esc(String(d.label || '').slice(0, 56) + (d.total ? ` ${d.cur}/${d.total}` : '')); clearTimeout(X._tt); X._tt = setTimeout(X.paintPlay, 2500); };
  api.on('task', idleStatus); api.on('progress', idleStatus);

  /* ---------- eventos globales: todo botón y campo pasa por aquí ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; const f = acts[b.dataset.act];
    if (!f) { toast('Acción no implementada: ' + b.dataset.act, 'err'); return; }
    Promise.resolve().then(() => f(b, e)).catch(err => toast(msg(err), 'err', 8000));
  });
  const setPath = (o, p, v) => { const k = p.split('.'); let t = o; for (let i = 0; i < k.length - 1; i++) t = t[k[i]]; t[k[k.length - 1]] = v; };
  const val = t => t.type === 'checkbox' ? t.checked : (t.type === 'number' || t.type === 'range') ? +t.value : t.value;
  for (const ev of ['input', 'change']) document.addEventListener(ev, e => {
    const t = e.target; if (!t || !t.dataset) return; const run = (map, key) => { const f = map[key]; if (f) Promise.resolve().then(() => f(t)).catch(err => toast(msg(err), 'err', 8000)); else toast('Acción no implementada: ' + key, 'err'); };
    if (t.dataset.bind && S.editor) { setPath(S, t.dataset.bind, val(t)); if (t.dataset.after) run(chg, t.dataset.after); }
    if (ev === 'input' && t.dataset.inp) run(inp, t.dataset.inp);
    if (ev === 'change' && t.dataset.chg) run(chg, t.dataset.chg);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.editor) { S.editor = null; X.renderEditor(); } });

  /* ---------- inicio ---------- */
  (async () => {
    try {
      await Promise.all([X.reloadSettings(), X.reloadAccounts(), X.reloadProfiles(), call('app:info').then(i => { S.info = i; })]);
      $('#ver').textContent = 'v' + (S.info.version || ''); if (await call('play:state')) S.play.phase = 'running';
      X.go('home'); X.ensureVersions().catch(() => {});
    } catch (e) { $('#home').innerHTML = `<div class="banner err"><div><b>No se pudo iniciar la interfaz</b><pre>${esc(msg(e))}</pre></div></div>`; }
  })();
})();
