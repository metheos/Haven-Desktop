// ═══════════════════════════════════════════════════════════
// Haven Desktop — Welcome Window Preload
// Exposes IPC bridges for the welcome / setup screen.
// ═══════════════════════════════════════════════════════════

const { ipcRenderer } = require('electron');

window.haven = {
  platform: process.platform,

  // ── Server Management ──────────────────────────────────
  server: {
    detect:     ()          => ipcRenderer.invoke('server:detect'),
    start:      (dir)       => ipcRenderer.invoke('server:start', dir),
    stop:       ()          => ipcRenderer.invoke('server:stop'),
    browse:     ()          => ipcRenderer.invoke('server:browse'),
    browseFile: ()          => ipcRenderer.invoke('server:browse-file'),
    getStatus:  ()          => ipcRenderer.invoke('server:status'),
    onLog:      (cb)        => ipcRenderer.on('server:log', (_e, m) => cb(m)),
  },

  // ── Settings ───────────────────────────────────────────
  settings: {
    get: (key)       => ipcRenderer.invoke('settings:get', key),
    set: (key, val)  => ipcRenderer.invoke('settings:set', key, val),
  },

  // ── Window Controls (frameless title-bar buttons) ──────
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  // ── Navigation ─────────────────────────────────────────
  nav: {
    openApp: (serverUrl) => ipcRenderer.send('nav:open-app', serverUrl),
  },

  // ── Auto-Update ────────────────────────────────────────
  update: {
    download: () => ipcRenderer.invoke('update:download'),
    install:  () => ipcRenderer.send('update:install'),
  },

  // ── Misc ───────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getVersion:   ()    => ipcRenderer.invoke('app:version'),
};

// ── Auto-Update Banner for Welcome Screen ────────────────
(function () {
  let bannerEl = null;
  function createBanner(text, buttonLabel, buttonAction) {
    removeBanner();
    bannerEl = document.createElement('div');
    bannerEl.id = 'haven-update-banner';
    bannerEl.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:999998;background:linear-gradient(135deg,#6b4fdb,#8b6ce7);color:#fff;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;box-shadow:0 -2px 8px rgba(0,0,0,.3);';
    const msg = document.createElement('span');
    msg.textContent = text;
    msg.id = 'haven-update-msg';
    bannerEl.appendChild(msg);
    if (buttonLabel) {
      const btn = document.createElement('button');
      btn.textContent = buttonLabel;
      btn.id = 'haven-update-btn';
      btn.style.cssText = 'background:#fff;color:#6b4fdb;border:none;border-radius:4px;padding:4px 14px;font-weight:600;cursor:pointer;font-size:12px;';
      btn.onclick = buttonAction;
      bannerEl.appendChild(btn);
    }
    document.body?.appendChild(bannerEl) || document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bannerEl));
  }
  function removeBanner() { if (bannerEl) { bannerEl.remove(); bannerEl = null; } }

  ipcRenderer.on('update:available', (_e, { version }) => {
    createBanner(`Haven Desktop v${version} is available!`, 'Update Now', async () => {
      const btn = document.getElementById('haven-update-btn');
      const msg = document.getElementById('haven-update-msg');
      if (btn) btn.disabled = true;
      if (msg) msg.textContent = 'Downloading update...';
      const res = await ipcRenderer.invoke('update:download');
      if (res?.error && msg) msg.textContent = `Update failed: ${res.error}`;
    });
  });
  ipcRenderer.on('update:download-progress', (_e, { percent }) => {
    const msg = document.getElementById('haven-update-msg');
    if (msg) msg.textContent = `Downloading update... ${percent}%`;
  });
  ipcRenderer.on('update:downloaded', () => {
    createBanner('Update downloaded! Restart to apply.', 'Restart Now', () => ipcRenderer.send('update:install'));
  });
})();
