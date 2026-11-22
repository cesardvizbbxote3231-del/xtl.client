const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  invoke: (ch, arg) => ipcRenderer.invoke(ch, arg),
  on: (ch, cb) => ipcRenderer.on(ch, (_, d) => cb(d))
});
