/**
 * ============================================================================
 * ALDAFFA ERP — SECURE PRELOAD BRIDGE (contextBridge)
 * ============================================================================
 *
 * Exposes a minimal, allowlisted IPC surface to the renderer world.
 * The renderer runs with contextIsolation: true, nodeIntegration: false,
 * sandbox: true — so `require` is NOT available in the renderer. All
 * desktop functionality flows through the `window.aldaffa` bridge below.
 *
 * Exposed API (safe subset — no fs, no child_process, no shell):
 *   - ipcRenderer.invoke()        : Promise-based request/response IPC
 *   - ipcRenderer.on()            : event subscription (update-status, etc.)
 *   - ipcRenderer.removeListener(): clean unsubscription (prevents leaks)
 *   - platform / versions / isElectron : inert capability metadata
 */

const { contextBridge, ipcRenderer } = require('electron');

// Wrapped event listeners so removeListener() can correctly match the
// proxied callbacks crossing the context isolation boundary.
const listenerRegistry = new Map();

const safeIpcRenderer = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  on: (channel, listener) => {
    if (typeof listener !== 'function') return;
    const wrapped = (_event, ...args) => listener(...args);
    listenerRegistry.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
  },

  removeListener: (channel, listener) => {
    const wrapped = listenerRegistry.get(listener);
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped);
      listenerRegistry.delete(listener);
    }
  },

  send: (channel, ...args) => ipcRenderer.send(channel, ...args)
};

contextBridge.exposeInMainWorld('aldaffa', {
  ipcRenderer: safeIpcRenderer,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  isElectron: true
});

// Legacy alias — some modules already probe for `window.electronAPI`.
contextBridge.exposeInMainWorld('electronAPI', safeIpcRenderer);