'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 渲染进程唯一可用的 API 桥（contextIsolation 开启，nodeIntegration 关闭）
 */
contextBridge.exposeInMainWorld('api', {
  // 计划 CRUD
  listPlans: () => ipcRenderer.invoke('plans:list'),
  createPlan: (plan) => ipcRenderer.invoke('plans:create', plan),
  updatePlan: (id, patch) => ipcRenderer.invoke('plans:update', { id, patch }),
  removePlan: (id) => ipcRenderer.invoke('plans:remove', id),

  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  // 元信息（如每日汇总是否已弹过）
  getMeta: () => ipcRenderer.invoke('meta:get'),
  updateMeta: (patch) => ipcRenderer.invoke('meta:update', patch),

  // 系统能力
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  refreshTray: () => ipcRenderer.invoke('tray:refresh'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  hideWindow: () => ipcRenderer.send('app:hide'),
  quitApp: () => ipcRenderer.send('app:quit'),

  // 主进程事件
  onShowToday: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:show-today', handler);
    return () => ipcRenderer.removeListener('app:show-today', handler);
  }
});
