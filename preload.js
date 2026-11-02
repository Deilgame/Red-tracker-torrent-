const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('api', {
  addFile: () => inv('add-file'), addPath: p => inv('add-path', p), addMagnet: m => inv('add-magnet', m),
  create: () => inv('create'), action: (a, h) => inv('action', a, h),
  getSettings: () => inv('get-settings'), setSettings: s => inv('set-settings', s), pickDir: () => inv('pick-dir'),
  win: c => ipcRenderer.send('win', c), pathFor: f => webUtils.getPathForFile(f),
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s))
});
