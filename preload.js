const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  async invoke(ch, arg) { const r = await ipcRenderer.invoke(ch, arg); if (!r || !r.ok) { const e = new Error((r && r.error) || 'Error desconocido'); e.code = r && r.code; throw e; } return r.data; },
  on(ch, cb) { const h = (_, d) => cb(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); }
});
