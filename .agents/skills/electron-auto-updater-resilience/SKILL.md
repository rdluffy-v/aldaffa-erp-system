---
name: electron-auto-updater-resilience
description: Robust Auto-Updater patterns for Electron desktop applications across Linux, Windows, and macOS. Resolves permission errors, missing feed URLs, SHA512 mismatches, and provides fallback direct package downloads.
---

# Electron Auto-Updater Resilience Skill

This skill provides operational patterns and architecture for managing auto-updates in Electron applications using `electron-updater`.

## Core Capabilities
1. **Multi-Platform Feed Configuration**: Configures GitHub Releases, S3, or generic HTTPS update providers with private/public access tokens.
2. **Permission Error Resilience**: Handles Linux `pkexec` / `dpkg` permission locks gracefully by providing direct `.deb` / `.AppImage` download fallbacks.
3. **Download Progress & Integrity Verification**: Tracks download progress and validates SHA-512 checksums before triggering `quitAndInstall()`.
4. **IPC Event Relay**: Relays updater events (`checking-for-update`, `update-available`, `update-downloaded`, `error`) to React frontend for real-time status reporting.

## Key Rules & Anti-Patterns
- **Never swallow updater errors**: Always forward error details and a direct download link to the user UI.
- **Never auto-download without user consent**: Set `autoUpdater.autoDownload = false` for POS/ERP systems to prevent unexpected restarts mid-transaction.
- **Always provide direct package download**: Provide a 1-click fallback button opening the direct `.deb` release file URL in the browser when native installation hits OS privilege locks.
