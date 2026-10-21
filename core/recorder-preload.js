// 由 src/core/recorder-preload.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
"use strict";
const electron_ = require("electron");
const { contextBridge, ipcRenderer } = electron_;
contextBridge.exposeInMainWorld("jndRecorder", {
  cmd: (name) => ipcRenderer.send("jnd-recorder-cmd", String(name)),
  onState: (fn) => {
    ipcRenderer.on("jnd-recorder-state", (_e, state) => fn(state));
    ipcRenderer.send("jnd-recorder-cmd", "state");
  }
});
