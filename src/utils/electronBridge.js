/**
 * ============================================================================
 * ELECTRON BRIDGE ACCESSOR (Renderer)
 * ============================================================================
 *
 * The main window runs with contextIsolation: true and nodeIntegration: false,
 * so `window.require('electron')` is NOT available in production. All renderer↔
 * main IPC is exposed through the secure `window.aldaffa.ipcRenderer` bridge
 * (see preload.cjs).
 *
 * This helper is the single, canonical way to reach the IPCRenderer across
 * every module. Never call `window.require` directly in components.
 */

/**
 * Resolve the safe IPC renderer surface in priority order:
 *   1. window.aldaffa.ipcRenderer   (preload contextBridge — production & dev)
 *   2. window.electronAPI           (legacy alias, same bridge)
 *   3. window.require fallback      (only in unrestricted dev tooling)
 * @returns {Object|null} An ipcRenderer-compatible object, or null outside Electron.
 */
export const getIpcRenderer = () => {
  if (typeof window === 'undefined') return null;

  if (window.aldaffa && window.aldaffa.ipcRenderer) {
    return window.aldaffa.ipcRenderer;
  }
  if (window.electronAPI && window.electronAPI.invoke) {
    return window.electronAPI;
  }
  if (window.require) {
    try {
      return window.require('electron').ipcRenderer;
    } catch (e) {
      return null;
    }
  }
  return null;
};

/**
 * True when the app is running inside the Electron desktop shell.
 * Used to gate Electron-only features (printing, hardware scan, updater).
 */
export const isElectronRuntime = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window.aldaffa && window.aldaffa.isElectron) ||
    (window.electronAPI && window.electronAPI.invoke) ||
    (typeof window.require === 'function')
  );
};

export default getIpcRenderer;