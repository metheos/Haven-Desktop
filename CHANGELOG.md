# Haven Desktop Changelog

## v1.0.5

### Bug Fixes
- **Windows volume ducking** — The desktop app no longer causes Windows to lower its own volume (or other apps') in the volume mixer when voice activity is detected. The audio capture stream is now categorized as `AudioCategory_Other`, opting out of Windows' automatic communications ducking behavior.

---

## v1.0.4

### New Features
- **Auto-update system** — When a new version is available, a banner appears at the bottom of the screen. Click "Download" to fetch the update, then "Restart & Install" to apply it. No manual downloads needed.

### Bug Fixes
- **Tray icon now shows correctly** in packaged builds (assets were not being bundled).
- **Soft-lock recovery** — If the app gets stuck on a blank screen (e.g. saved server became unreachable), press **Ctrl+Shift+Home** to reset back to the welcome screen. A 15-second page-load timeout also offers to take you back automatically.
- **Wayland screen-share picker** — Improved dismiss behavior: background overlay click, better ESC handling, and focus restoration after closing the picker.

---

## v1.0.3

- Initial public release.
