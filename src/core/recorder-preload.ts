'use strict';
// 登录录制器窗口的预加载：只开放按钮命令与状态推送两条通道
import electron_ = require('electron');
const { contextBridge, ipcRenderer } = electron_;
contextBridge.exposeInMainWorld('jndRecorder', {
  cmd: (name: string) => ipcRenderer.send('jnd-recorder-cmd', String(name)),
  onState: (fn: (state: any) => void) => { ipcRenderer.on('jnd-recorder-state', (_e, state) => fn(state)); ipcRenderer.send('jnd-recorder-cmd', 'state'); },
});
