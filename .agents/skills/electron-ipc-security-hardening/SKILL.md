---
name: electron-ipc-security-hardening
description: IPC security hardening standards for Electron apps. Enforces contextIsolation, preload API sanitization, IPC input validation, and preventing arbitrary command execution.
---

# Electron IPC Security Hardening Skill

This skill provides security guidelines for IPC communication between renderer processes and Node.js main process.

## Security Practices
1. **Context Isolation**: Always enable `contextIsolation: true` and `nodeIntegration: false` in BrowserWindow webPreferences.
2. **Expose Specific Channels Only**: Expose explicit, type-safe API methods via `contextBridge.exposeInMainWorld('electron', { ... })` instead of raw `ipcRenderer`.
3. **IPC Parameter Sanitization**: Validate all arguments passed via `ipcMain.handle` before running shell commands, SQL queries, or file system operations.
4. **Shell Execution Safety**: Never concatenate unsanitized user inputs into `exec()` shell calls; use `execFile()` or parameter arrays.
