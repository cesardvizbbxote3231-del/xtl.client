// Punto de entrada de Electron: ventana, ciclo de vida y plataforma. La lógica vive en src/main/.
const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { Client } = require('minecraft-launcher-core');
const createApp = require('./src/main/app');

let win = null, xtl = null;
app.setAppUserModelId('com.xtl.client');
app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) { app.quit(); }
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

const emit = (ch, d) => {
  if (ch === 'play:closed' && !win && app.isReady()) { createWindow(); win.webContents.once('did-finish-load', () => win && win.webContents.send(ch, d)); return; }   // modo ligero: reabrir al cerrar el juego
  if (win && !win.isDestroyed()) win.webContents.send(ch, d);
};
const platform = {
  safeStorage: { available: () => safeStorage.isEncryptionAvailable(), encrypt: s => safeStorage.encryptString(s).toString('base64'), decrypt: s => safeStorage.decryptString(Buffer.from(s, 'base64')) },
  openExternal: url => shell.openExternal(url), openPath: p => { fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); },
  dialog: { openFile: async o => { const r = await dialog.showOpenDialog(win, { properties: ['openFile'], ...o }); return r.canceled ? null : r.filePaths[0]; } },
  app: { version: app.getVersion(), packaged: app.isPackaged, async checkUpdate() {
    if (!app.isPackaged) return { status: 'dev', message: 'Estás en modo desarrollo: las actualizaciones solo funcionan en la versión instalada.' };
    try { const { autoUpdater } = require('electron-updater'); const r = await autoUpdater.checkForUpdates(); const v = r && r.updateInfo && r.updateInfo.version;
      return v && v !== app.getVersion() ? { status: 'available', version: v, message: 'Hay una versión nueva (' + v + '). Se descarga en segundo plano.' } : { status: 'latest', message: 'Tienes la última versión (' + app.getVersion() + ').' };
    } catch (e) { return { status: 'error', message: 'No se pudo comprobar: ' + e.message }; } } }
};
function boot() {
  xtl = createApp({ baseDir: app.getPath('userData'), platform, emit, Client, totalMem: os.totalmem,
    config: JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'config.json'), 'utf8')), catalog: JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'modules.json'), 'utf8')) });
  for (const ch of xtl.channels) ipcMain.handle(ch, (_, arg) => xtl.invoke(ch, arg));
}
function createWindow() {
  win = new BrowserWindow({ width: 1240, height: 800, minWidth: 980, minHeight: 640, backgroundColor: '#0a0c11', autoHideMenuBar: true, title: 'XTL Client', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html')); win.on('closed', () => { win = null; });
}
// Modo ligero: al iniciar el juego la ventana se cierra para liberar RAM y se reabre al salir del juego.
app.whenReady().then(() => {
  boot(); createWindow();
  const g = xtl.services.game, s = xtl.services.settings;
  ipcMain.removeHandler('play');
  ipcMain.handle('play', async (_, arg) => {
    const r = await xtl.invoke('play', arg);
    if (r.ok && s.get().lite) setTimeout(() => { if (g.isPlaying() && win) win.close(); }, 2500);
    return r;
  });
  if (app.isPackaged) try { require('electron-updater').autoUpdater.checkForUpdatesAndNotify(); } catch {}
});
app.on('activate', () => { if (!win) createWindow(); });
app.on('window-all-closed', () => { if (!(xtl && xtl.services.game.isPlaying())) app.quit(); });
