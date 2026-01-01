"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fitApi", {
  compute: (payload) => ipcRenderer.invoke("fit:compute", payload),
  options: (payload) => ipcRenderer.invoke("fit:options", payload)
});
