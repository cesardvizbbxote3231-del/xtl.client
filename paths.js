const path = require('path');
module.exports = function makePaths(base) {
  const p = (...a) => path.join(base, ...a);
  return {
    base, root: p('minecraft'), profiles: p('profiles'), java: p('java'), cache: p('cache'), logs: p('logs'), skins: p('cache', 'skins'),
    settings: p('settings.json'), accounts: p('accounts.json'),
    profileDir(id) { if (!/^[a-z0-9_-]{3,40}$/.test(String(id))) throw new Error('Perfil no válido'); return p('profiles', id); }
  };
};
