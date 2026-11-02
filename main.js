const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const WebTorrent = require('webtorrent');

app.disableHardwareAcceleration();
let win, client, store, storeFile, tdir;
const defaults = () => ({ downloadPath: app.getPath('downloads'), maxDown: 0, maxUp: 0, list: [] });
const load = () => {
  storeFile = path.join(app.getPath('userData'), 'state.json');
  tdir = path.join(app.getPath('userData'), 'torrents');
  fs.mkdirSync(tdir, { recursive: true });
  try { store = { ...defaults(), ...JSON.parse(fs.readFileSync(storeFile, 'utf8')) }; } catch { store = defaults(); }
};
const save = () => fs.writeFileSync(storeFile, JSON.stringify(store));
const tfile = h => path.join(tdir, h + '.torrent');
const limits = () => {
  client.throttleDownload(store.maxDown > 0 ? store.maxDown * 1024 : -1);
  client.throttleUpload(store.maxUp > 0 ? store.maxUp * 1024 : -1);
};
const persist = () => {
  store.list = client.torrents.map(t => ({ hash: t.infoHash, uri: t.magnetURI, path: t.path, paused: !!t.paused }));
  save();
};
const err = m => dialog.showErrorBox('Red tracker', String(m));

function addTorrent(src, dir, paused) {
  try {
    const t = client.add(src, { path: dir || store.downloadPath });
    t.paused = !!paused;
    t.on('metadata', () => { try { fs.writeFileSync(tfile(t.infoHash), t.torrentFile); } catch {} persist(); if (t.paused) pause(t); });
    t.on('done', () => { new Notification({ title: 'Red tracker', body: 'Загрузка завершена: ' + t.name }).show(); persist(); });
    t.on('error', e => err(e.message || e));
    persist();
    return t;
  } catch (e) { err(e.message); }
}
function pause(t) { t.pause(); t.wires.slice().forEach(w => w.destroy()); t.paused = true; persist(); }
function resume(t) { t.resume(); t.paused = false; persist(); }
const find = h => client.torrents.find(t => t.infoHash === h);

function snapshot() {
  let free = 0;
  try { const s = fs.statfsSync(store.downloadPath); free = s.bsize * s.bavail; } catch {}
  return {
    free, down: client.downloadSpeed, up: client.uploadSpeed,
    torrents: client.torrents.map(t => ({
      hash: t.infoHash, name: t.name || 'Получение метаданных…', size: t.length || 0, progress: t.progress,
      down: t.paused ? 0 : t.downloadSpeed, up: t.paused ? 0 : t.uploadSpeed, eta: t.timeRemaining,
      done: t.done, paused: !!t.paused, peers: t.numPeers, ready: !!t.name && !!t.length
    }))
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 1000, minHeight: 600, frame: false, backgroundColor: '#050203',
    title: 'Red tracker', icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setMenuBarVisibility(false);
  const page = path.join(__dirname, 'index.html');
  if (!fs.existsSync(page)) { err('Файл интерфейса не найден:\n' + page + '\n\nПоложите index.html рядом с main.js (имя ровно index.html) и перезапустите.'); }
  win.loadFile(page);
  win.webContents.on('did-fail-load', (_e, code, desc) => err('Не удалось загрузить интерфейс: ' + desc + ' (' + code + ')\n' + path.join(__dirname, 'index.html')));
  win.webContents.on('render-process-gone', (_e, d) => err('Интерфейс завершился: ' + d.reason));
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i'))) win.webContents.toggleDevTools(); });
}

app.whenReady().then(() => {
  load();
  client = new WebTorrent();
  client.on('error', e => err(e.message || e));
  limits();
  for (const it of store.list) {
    const f = tfile(it.hash);
    addTorrent(fs.existsSync(f) ? fs.readFileSync(f) : it.uri, it.path, it.paused);
  }
  createWindow();
  setInterval(() => { if (win && !win.isDestroyed()) win.webContents.send('state', snapshot()); }, 1000);
  const arg = process.argv.find(a => a.endsWith('.torrent') && fs.existsSync(a));
  if (arg) addTorrent(fs.readFileSync(arg));
});
app.on('window-all-closed', () => { persist(); client.destroy(() => app.quit()); });

ipcMain.handle('add-file', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Добавить файл', filters: [{ name: 'Torrent', extensions: ['torrent'] }], properties: ['openFile', 'multiSelections'] });
  if (!r.canceled) r.filePaths.forEach(p => addTorrent(fs.readFileSync(p)));
});
ipcMain.handle('add-path', (_e, p) => { if (p && p.endsWith('.torrent')) addTorrent(fs.readFileSync(p)); });
ipcMain.handle('add-magnet', (_e, m) => {
  m = String(m || '').trim();
  if (!m.startsWith('magnet:')) return err('Это не магнет-ссылка. Она должна начинаться с magnet:');
  addTorrent(m);
});
ipcMain.handle('create', async () => {
  const c = dialog.showMessageBoxSync(win, { type: 'question', title: 'Создать торрент', message: 'Что раздавать?', buttons: ['Файл', 'Папка', 'Отмена'], cancelId: 2 });
  if (c === 2) return;
  const r = await dialog.showOpenDialog(win, { properties: [c === 0 ? 'openFile' : 'openDirectory'] });
  if (r.canceled) return;
  client.seed(r.filePaths[0], t => {
    persist();
    const s = dialog.showSaveDialogSync(win, { title: 'Сохранить .torrent', defaultPath: t.name + '.torrent' });
    if (s) fs.writeFileSync(s, t.torrentFile);
    try { fs.writeFileSync(tfile(t.infoHash), t.torrentFile); } catch {}
  });
});
ipcMain.handle('action', (_e, a, h) => {
  const t = find(h); if (!t) return;
  if (a === 'pause') pause(t);
  else if (a === 'resume') resume(t);
  else if (a === 'open') shell.showItemInFolder(path.join(t.path, t.name));
  else if (a === 'remove') {
    const r = dialog.showMessageBoxSync(win, { type: 'warning', title: 'Удалить', message: 'Удалить «' + t.name + '» из списка?', buttons: ['Удалить из списка', 'Удалить вместе с файлами', 'Отмена'], cancelId: 2 });
    if (r === 2) return;
    t.destroy({ destroyStore: false }, () => {
      if (r === 1) { try { fs.rmSync(path.join(t.path, t.name), { recursive: true, force: true }); } catch {} }
      try { fs.unlinkSync(tfile(h)); } catch {}
      persist();
    });
  }
});
ipcMain.handle('get-settings', () => ({ downloadPath: store.downloadPath, maxDown: store.maxDown, maxUp: store.maxUp }));
ipcMain.handle('set-settings', (_e, s) => {
  Object.assign(store, { downloadPath: s.downloadPath, maxDown: +s.maxDown || 0, maxUp: +s.maxUp || 0 });
  save(); limits();
});
ipcMain.handle('pick-dir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: store.downloadPath });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.on('win', (_e, c) => {
  if (c === 'min') win.minimize();
  else if (c === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (c === 'close') win.close();
});
