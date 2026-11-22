const fs = require('fs'), path = require('path');
module.exports = function makeLog(dir, emit) {
  fs.mkdirSync(dir, { recursive: true });
  const file = () => path.join(dir, `xtl-${new Date().toISOString().slice(0, 10)}.log`);
  const w = (lvl, msg) => { const line = `${new Date().toISOString()} [${lvl}] ${msg}`; try { fs.appendFileSync(file(), line + '\n'); } catch {} if (emit) emit('log:line', line); return line; };
  return {
    dir, file, info: m => w('INFO', m), warn: m => w('WARN', m), error: m => w('ERROR', m),
    tail(n = 300) { try { return fs.readFileSync(file(), 'utf8').trimEnd().split('\n').slice(-n); } catch { return []; } },
    clear() { for (const f of fs.readdirSync(dir)) if (f.endsWith('.log')) fs.rmSync(path.join(dir, f)); }
  };
};
