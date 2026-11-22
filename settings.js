const fs = require('fs');
const DEF = { ram: 0, java: 'auto', jvmPreset: true, jvmExtra: '', resW: 0, resH: 0, lite: false, accent: '#6ea8ff', motion: true, msClientId: '', activeProfile: '', activeAccount: '' };
module.exports = function makeSettings(paths, sys) {
  let cur = null;
  const load = () => { try { cur = { ...DEF, ...JSON.parse(fs.readFileSync(paths.settings, 'utf8')) }; } catch { cur = { ...DEF }; } return cur; };
  const maxRam = () => Math.max(2048, Math.floor(sys.totalMem() / 1048576 * 0.75 / 512) * 512);
  const recommended = () => { const t = sys.totalMem() / 1073741824; return Math.min(maxRam(), (t <= 4 ? 2 : t <= 6 ? 3 : t <= 8 ? 4 : t <= 16 ? 6 : 8) * 1024); };
  const bad = m => { throw new Error(m); };
  const VAL = {
    ram: v => { v = Math.round(+v); if (Number.isNaN(v) || (v !== 0 && (v < 512 || v > maxRam()))) bad('Memoria fuera de rango'); return v; },
    java: v => { v = String(v); if (v.length > 500) bad('Java no válido'); return v; },
    jvmPreset: v => !!v, lite: v => !!v, motion: v => !!v,
    jvmExtra: v => String(v).slice(0, 500),
    resW: v => Math.max(0, Math.min(7680, Math.round(+v) || 0)), resH: v => Math.max(0, Math.min(4320, Math.round(+v) || 0)),
    accent: v => /^#[0-9a-fA-F]{6}$/.test(v) ? v : bad('Color no válido'),
    msClientId: v => { v = String(v).trim(); if (v && !/^[0-9a-f-]{36}$/i.test(v)) bad('El Client ID debe tener formato UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)'); return v; },
    activeProfile: v => String(v).slice(0, 40), activeAccount: v => String(v).slice(0, 64)
  };
  const get = () => { if (!cur) load(); return { ...cur, ramMb: cur.ram || recommended(), maxRam: maxRam(), recRam: recommended(), totalGB: Math.round(sys.totalMem() / 1073741824) }; };
  const set = patch => {
    if (!cur) load();
    for (const [k, v] of Object.entries(patch || {})) if (k in VAL) cur[k] = VAL[k](v);
    fs.mkdirSync(require('path').dirname(paths.settings), { recursive: true }); fs.writeFileSync(paths.settings, JSON.stringify(cur, null, 1)); return get();
  };
  return { get, set };
};
