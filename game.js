const fs = require('fs'), path = require('path');
const JVM_PRESET = ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+DisableExplicitGC'];
const STEPS = ['account', 'license', 'profile', 'java', 'files', 'args', 'launch'];
module.exports = function makeGame({ paths, settings, auth, profiles, versions, java, log, Client }) {
  let playing = false;
  async function play(profileId, emit) {
    if (playing) throw new Error('Ya hay una instancia de Minecraft abierta.');
    playing = true; const step = (s, label) => { emit('play:step', { step: s, label, index: STEPS.indexOf(s), total: STEPS.length }); log.info('JUGAR · ' + label); };
    try {
      const S = settings.get(), accId = S.activeAccount;
      if (!accId) { const e = new Error('Inicia sesión con Microsoft para jugar.'); e.code = 'NO_ACCOUNT'; throw e; }
      step('account', 'Verificando tu cuenta de Microsoft…');
      step('license', 'Comprobando que tienes Minecraft: Java Edition…');
      const authorization = await auth.authorization(accId);               // renueva la sesión y confirma la licencia con Mojang
      step('profile', 'Comprobando el perfil…');
      const p = profiles.get(profileId); if (!(await versions.has(p.mc))) throw new Error('La versión ' + p.mc + ' ya no existe en el catálogo de Mojang.');
      if (p.custom && !fs.existsSync(path.join(paths.root, 'versions', p.custom, p.custom + '.json'))) throw new Error('Falta el cargador instalado (' + p.loader + '). Reinstálalo en Módulos → Cargadores.');
      step('java', 'Preparando Java…');
      const javaPath = await java.resolve(await versions.javaMajor(p.mc), p.java !== 'auto' ? p.java : S.java, l => emit('play:step', { step: 'java', label: l.label, index: 3, total: STEPS.length }));
      step('files', 'Descargando archivos del juego…');
      const ram = p.ram || S.ramMb, resW = p.resW || S.resW, resH = p.resH || S.resH;
      const extra = [...(S.jvmPreset ? JVM_PRESET : []), ...String(S.jvmExtra || '').split(/\s+/).filter(Boolean), ...String(p.jvm || '').split(/\s+/).filter(Boolean)];
      step('args', 'Preparando argumentos de ejecución…');
      const opts = { authorization, root: paths.root, javaPath, version: { number: p.mc, type: p.vtype || 'release', custom: p.custom || undefined },
        memory: { max: ram + 'M', min: Math.min(ram, 2048) + 'M' }, customArgs: extra, overrides: { gameDirectory: profiles.dir(p.id) } };
      if (resW && resH) opts.window = { width: resW, height: resH };
      const client = new Client(), gameLog = path.join(paths.logs, `game-${p.id}.log`), tail = []; fs.mkdirSync(paths.logs, { recursive: true }); fs.writeFileSync(gameLog, '');
      client.on('progress', e => emit('progress', { label: e.type, cur: e.task, total: e.total }));
      client.on('debug', m => log.info('[MCLC] ' + m));
      step('launch', 'Iniciando Minecraft…');
      await new Promise((resolve, reject) => {
        let started = false; const timer = setTimeout(() => { if (!started) { started = true; resolve(); } }, 60000);
        client.on('data', line => { const l = String(line).trimEnd(); fs.appendFileSync(gameLog, l + '\n'); tail.push(l); if (tail.length > 25) tail.shift(); if (!started) { started = true; clearTimeout(timer); resolve(); } });
        client.on('close', code => {
          clearTimeout(timer); playing = false;
          if (!started) { started = true; reject(new Error(`Minecraft se cerró antes de iniciar (código ${code}).\n${tail.slice(-8).join('\n')}`)); }
          else { log.info('Minecraft cerrado con código ' + code); emit('play:closed', { code, crashed: code !== 0 && code !== null, log: gameLog }); }
        });
        Promise.resolve(client.launch(opts)).then(proc => {
          if (!proc) { clearTimeout(timer); if (!started) { started = true; reject(new Error('No se pudo crear el proceso de Java. Revisa Ajustes → Registros.')); } return; }
          proc.on && proc.on('error', e => { clearTimeout(timer); if (!started) { started = true; reject(new Error('No se pudo ejecutar Java: ' + e.message)); } });
        }).catch(e => { clearTimeout(timer); if (!started) { started = true; reject(e); } });
      });
      profiles.touch(p.id); emit('play:running', { profile: p.id }); log.info('Minecraft en ejecución'); return { ok: true, log: gameLog };
    } catch (e) { playing = false; log.error('JUGAR falló: ' + e.message); emit('play:error', { message: e.message, code: e.code }); throw e; }
  }
  return { play, isPlaying: () => playing, STEPS };
};
