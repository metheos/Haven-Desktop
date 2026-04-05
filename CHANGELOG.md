# Haven Desktop Changelog

## v1.2.0

### Fixed
- **Per-app audio pipeline overhaul** (#165) — several bugs in the per-app audio path that together caused silence for viewers:
  - ScriptProcessor fallback now uses 0 input channels (was 1 with nothing connected), which is more reliable in Chromium.
  - IPC PCM data handler now correctly handles typed arrays with non-zero byte offsets and unknown buffer types instead of potentially misreading data.
  - WASAPI capture loop now adapts to the device's actual mix format (channel count and sample type) when the preferred 48kHz stereo float32 initialization fails. Previously it hardcoded stereo float32 interleaving regardless of what the OS reported, which could produce garbled audio on systems with surround-sound or 16-bit mix formats. (#209)

---

## v1.1.9

### Fixed
- **Fullscreen reverted to v1.1.6 approach** — the overlay-based fullscreen rewrite from v1.1.7 broke MP4 embed fullscreen. Reverted to the original CSS class toggle (`haven-manual-fullscreen`) that was working in v1.1.6. Removed all the extra BrowserView resync handlers, `enter-html-full-screen` interceptors, custom fullscreen button injection, and DOM-manipulation overlay code that was causing the regression.

---

## v1.1.8

### Fixed
- **MP4 fullscreen regression** — v1.1.7's deferred BrowserView resync on un-maximize fired during fullscreen transitions (Windows fires `unmaximize` when leaving fullscreen), stomping the overlay with stale dimensions. Added a fullscreen transition guard so the deferred calls are skipped during/after fullscreen exit.
- **Gray/purple box after un-maximize** — the deferred resync now also sends a renderer-side `resize` event to force CSS viewport recalculation, eliminating the gray strip left by stale `100vh` values.
- **"Haven Not Found" false positive on login pages** — the isHaven check only looked for `#app-body` which doesn't exist on the Haven login page. Now also recognizes `.auth-page` and Haven page titles, so connecting to a friend's server no longer falsely triggers the "not a Haven server" dialog.
- **Server switching destroys session** — clicking a friend's server icon and encountering any issue (load timeout, non-Haven page) offered "Change Server" which wiped all preferences and returned to the Welcome screen. Secondary server failures now offer "Go Back to My Server" and cleanly return to the primary server without resetting anything.
- **Tray menu "Change Server" while on secondary** — the tray menu now shows "Back to My Server" when viewing a secondary server, switching back without resetting.

---

## v1.1.7

### Fixed
- **Game pop-out blocked in desktop** — the "Pop Out" button on games (e.g. Shippy Container) was blocked because Electron denied all `window.open` calls. Same-origin popups now open in a real child window.
- **Gray box after un-maximizing** — double-clicking the title bar to restore from maximized could leave a gray/purple box covering part of the app because `getContentSize()` returned stale values during the OS animation. The BrowserView now re-syncs after a delay, matching the existing fullscreen exit behavior.

---

## v1.1.6

### Fixed
- **Per-application audio pipeline fallback** (#165) — per-app audio capture failed silently in some Electron BrowserView environments where AudioWorklet blob URLs were blocked. Added a ScriptProcessorNode fallback when AudioWorklet fails, explicit AudioContext.resume() for suspended contexts, and a final fallback to system loopback audio if the entire pipeline fails.
- **Reduced memory trend log spam** — memory usage delta logs now only print when the change exceeds 10 MB, cutting down unnecessary console output.

---

## v1.1.5

### Fixed
- **Notification click now navigates to the right channel** — clicking a native OS notification now opens the app and switches to the channel or DM where the message was sent, instead of just bringing the window to focus.

---

## v1.1.4

### New Features
- **Start Hidden to Tray** — when "Start on Login" is enabled, a new "Start Hidden to Tray" option lets the app launch minimized to the system tray instead of opening a window. Both options are in Settings → Desktop App.
- **Voice join/leave OS notifications** — the desktop app now shows native OS notifications when someone joins or leaves a voice channel you're in.

### Fixed
- **Settings sections not visible** — the Shortcuts and Desktop App sections in Settings were showing in the navigation but the actual content panels stayed hidden. Both now display correctly when running in the desktop app.

---

## v1.1.3

### Fixed
- **Fullscreen now actually works** — video fullscreen (from the native controls' button or the `...` menu), stream tile fullscreen buttons, and stream/webcam PiP overlay fullscreen buttons all failed silently inside Electron's BrowserView layer. Implemented a complete manual fullscreen override in the preload that intercepts `requestFullscreen()` calls and handles them via CSS + IPC, making fullscreen work everywhere in the app.
- **WGC ProcessFrame log spam eliminated** — the terminal was flooded with `wgc_capture_session.cc ProcessFrame failed` errors during any voice/screen-share session. Switched from `--log-level=3` (browser process only) to `--disable-logging`, which suppresses Chromium C++ logging across all subprocesses including the GPU process where the spam originates.
- **Screen sharing broken by preload crash** — a DOM injection in the fullscreen patch ran before the HTML document existed, throwing an error that silently killed the rest of the preload script. Screen sharing, notifications, and other Desktop features stopped working. Fixed by deferring the CSS injection to `DOMContentLoaded`.
- **PiP permissions** — added `picture-in-picture` and `fullscreen` to Electron's session permission grants so native PiP controls display correctly.

---

## v1.1.2

### Updated
- Bundled Haven server updated to v2.7.2, which fixes two scroll-position bugs: new root messages no longer leave the feed scrolled slightly short of the bottom, and switching channels / DMs now reliably lands at the latest message instead of a random earlier position.

---

## v1.1.1

### Bug Fixes
- **Renderer freeze from sync dialog deadlocks** — `window.prompt()` was implemented via a VBScript `InputBox` spawned by `cscript.exe` with a 5-minute `execSync` timeout. If the dialog spawned behind the app window, the main process blocked for up to 5 minutes with no way to dismiss it. Replaced with a native Electron dialog that returns instantly. Also removed the `disable-renderer-backgrounding` Chromium flag, which was preventing timer throttling and starving the renderer event loop.
- **Renderer freeze from reflow storm** — the memory-check soft GC was calling `getBoundingClientRect()` on every image via `executeJavaScript` every 10 seconds, forcing 50+ synchronous layout recalculations per cycle. Removed layout-triggering calls entirely; the soft GC now only trims DOM node count (O(1)). Health checks replaced `executeJavaScript` with `webContents.isCrashed()` to avoid blocking the main process.
- **Progressive slowdown from memory pressure** — default V8 heap (384 MB) and GPU memory budget (128 MB) were too tight for Haven’s DOM-heavy UI with RGB theme cycling and embedded media, causing frequent GC pauses. V8 heap raised to 512 MB, GPU budget to 256 MB, and tray menu rebuild interval reduced from 10s to 60s.
- **Soft-GC message trim cap misaligned** — the Electron soft GC trimmed messages to 200, but the client already caps at 100, leaving up to 100 stale messages (~1200 DOM nodes) that were never cleaned up. Aligned the cap to 100.

### Added
- **Memory trend tracking** — a rolling-window telemetry system samples renderer memory every 30 seconds and logs a trend summary every ~2.5 minutes (e.g. `Memory trend: 85→142 MB (+57) ↑ over 10 min`). Renderer-side `[Haven Perf]` console messages are forwarded to the main process for server-log visibility without needing DevTools.

### Improved
- **Zombie process cleanup** — the server manager now kills any leftover process holding the configured port before starting, preventing "port in use" failures after crashes.
- **Server auto-restart** — if the server process exits unexpectedly, it restarts after 2 seconds with a cooldown to prevent loops.
- **Crash recovery** — after exhausting retry attempts, the app now performs a full BrowserView tear-down and rebuild instead of giving up permanently.

---

## v1.1.0

### Bug Fixes
- **SSL error flood causing blank screen + OOM crash** — when connecting to a Haven server over HTTPS with a self-signed certificate, the existing `certificate-error` handler only covered page navigation. WebSocket reconnection attempts (Socket.IO) and fetch/XHR requests still hit Chromium's native `ssl_client_socket_impl` layer, which rejected the cert and logged an error object for every single failed handshake. During reconnection storms, thousands of these errors accumulated in the renderer's heap until Oilpan's garbage collector couldn't allocate, causing a fatal OOM crash and a blank screen. Fix: `setCertificateVerifyProc` on the default session now accepts all certificates at the session level, which covers *all* connection types (navigation, WebSocket, fetch, XHR) before the C++ TLS code ever sees a failure. The SSL error flood no longer occurs, so the renderer never OOMs.
- **Infinite crash-reload loop** — the v1.0.9 `render-process-gone` handler would reload the page unconditionally on every crash, creating an infinite crash → reload → crash cycle if the underlying cause persisted. Crash recovery now has a retry limit of 3 with exponential back-off (1.5 s → 3 s → 6 s), and resets the counter after 60 seconds of stability.

---

## v1.0.9

### Added
- **Global voice keyboard shortcuts** — mute, deafen, and push-to-talk can now be assigned to system-wide hotkeys in Settings → Keyboard Shortcuts. Shortcuts work even when Haven Desktop isn't the focused window.

### Bug Fixes
- **Blank app window** — the renderer window could go completely blank during server restarts, reconnects, or rapid view transitions. Root cause: `webContents.send()` fires through Electron's native C++ IPC layer *before* throwing a catchable JS exception, so a simple `try/catch` isn't enough — the native send to a disposed render frame still corrupts the renderer's IPC channel. Fix:
  1. A new `safeSend()` helper checks `wc.mainFrame` (which returns `undefined` when the frame is disposed) *before* calling `send()`, preventing the native code from ever attempting the IPC send.
  2. Server log forwarding is now batched to 50 ms intervals instead of firing synchronously for every line of stdout — this eliminates the rapid-fire IPC bursts during startup/reconnect.
  3. A `render-process-gone` crash-recovery handler on each BrowserView automatically reloads the page if the renderer dies for any reason, so the screen can never stay permanently blank.

---

## v1.0.8

### Bug Fixes
- **Auto-launch no longer broken after server load failure** — a bug introduced in v1.0.7 (alongside the FCM/installer update) caused the app to forget your saved server on any load failure or startup hiccup, permanently dropping you back to the welcome screen on every subsequent launch. The fix: your server preferences (path, URL, mode) are now preserved across failures so the next launch retries automatically. Use Ctrl+Shift+Home to intentionally reset and return to the welcome screen.

---

## v1.0.7

### Bug Fixes
- **Taskbar badge now reliably appears for unread messages** — three bugs were causing the overlay badge to fail or behave erratically: (1) a `focus` event cleared the badge immediately whenever the window was focused, even with unreads remaining; (2) an `isFocused()` guard on the IPC handler blocked the badge from being set while the app was open but you were in a different channel; (3) `flashFrame` was firing unconditionally, causing taskbar flicker even when the window was already in focus. All three are fixed.

### Improvements
- **Haven-branded notification badge** — the overlay icon is now a Haven hexagon with the app's signature purple gradient and a "!" mark, instead of a plain fuchsia circle.

---

## v1.0.6

### Improvements
- **Screen share picker — audio/cancel/share always visible** — the Application Audio selection and Cancel/Share buttons are now pinned outside the scrollable area. Only the screen and window list scrolls, so you never need to scroll down to find the buttons.
- **"No Audio" option added to screen share picker** — a new 🔇 No Audio button lets you share your screen with no audio at all. The existing System Audio option now correctly shows a 🔊 speaker icon instead of the muted speaker.

### Bug Fixes
- **Ghost voice-chat state on app restart** — closing the app while in a voice channel no longer causes the app to "think" you’re still in voice on the next launch (blocking you from joining again). The saved voice channel is now cleared on each fresh page load; auto-rejoin on network blips within the same session is unaffected.

---

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
