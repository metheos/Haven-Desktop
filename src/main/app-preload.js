// ═══════════════════════════════════════════════════════════
// Haven Desktop — App Window Preload
//
// Loaded when the Haven web app runs inside the desktop shell.
// Provides:
//  • Per-application audio capture during screen share
//  • Custom screen-share picker (windows + audio apps)
//  • Native desktop notifications
//  • Audio device enumeration & hot-switching
//  • Transparent getDisplayMedia() override (Haven's voice.js
//    calls the same API — our code intercepts and enhances it)
// ═══════════════════════════════════════════════════════════

const { ipcRenderer } = require('electron');

// Mark the document as running inside the Electron shell.
// This lets CSS override responsive breakpoints that would otherwise
// hide desktop UI elements (e.g. the status bar) on narrow windows.
// Try to set it immediately (document.documentElement exists in modern
// Electron even before parsing).  Fall back to DOMContentLoaded if not.
if (document.documentElement) {
  document.documentElement.setAttribute('data-desktop-app', '1');
} else {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.setAttribute('data-desktop-app', '1');
  }, { once: true });
}
// ═══════════════════════════════════════════════════════════
// JavaScript Dialog Overrides for BrowserView (issue #6)
//
// Electron's BrowserView doesn't natively support prompt(),
// confirm(), or alert(). Override them with IPC calls to the
// main process which shows OS-native dialogs.
// ═══════════════════════════════════════════════════════════

// ── Dialog overrides (confirm / alert / prompt) ───────────
// BrowserView doesn't support native browser dialogs.  We forward them
// to the main process via sendSync, which blocks the renderer while the
// OS dialog is visible.  This is intentionally synchronous — confirm()
// and prompt() are modal by spec and callers expect a return value.
//
// The main process focuses the app window before showing the dialog, so
// it can't appear behind the app on multi-monitor setups (which would
// make it impossible to dismiss and freeze the UI forever).

window.prompt = (message, defaultValue) => {
  return ipcRenderer.sendSync('dialog:prompt', {
    message: message || '',
    defaultValue: defaultValue || '',
  });
};

window.confirm = (message) => {
  return ipcRenderer.sendSync('dialog:confirm', { message: message || '' });
};

window.alert = (message) => {
  ipcRenderer.sendSync('dialog:alert', { message: message || '' });
};

// ─── Clear any stale voice-channel state on fresh page load ──────────────
// Without this, closing the app while in voice leaves haven_voice_channel in
// localStorage, causing the web app to think the user is already in voice on
// the next launch, which prevents rejoining until they manually "leave" first.
window.addEventListener('DOMContentLoaded', () => {
  try { localStorage.removeItem('haven_voice_channel'); } catch {}
});

// ─── Desktop Status Bar — guaranteed visible ─────────────────────────────
// The server's responsive CSS hides #status-bar at narrow viewport widths
// (for mobile).  Windows DPI scaling can shrink the BrowserView's CSS
// viewport below that threshold.  We solve this by injecting a fixed-position
// bar at the bottom of the page from the preload — entirely independent of
// the server's CSS layout.  We clone the server bar's live text nodes so
// the data (ping, version, channel, online count) stays in sync.
window.addEventListener('DOMContentLoaded', () => {
  // Inject the CSS once
  const css = document.createElement('style');
  css.textContent = `
    /* Hide the original status bar — we replace it with a fixed clone */
    .status-bar#status-bar { display: none !important; }

    #haven-desktop-footer {
      position: fixed !important;
      bottom: 0; left: 0; right: 0;
      z-index: 9999;
      display: flex !important;
      align-items: center;
      gap: 16px;
      padding: 4px 16px;
      background: var(--bg-secondary, #1e2035);
      border-top: 1px solid var(--border, #333);
      font-size: 11px;
      color: var(--text-muted, #888);
      font-family: var(--font-main, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      user-select: none;
      min-height: 26px;
    }
    #haven-desktop-footer .hdf-item {
      display: flex; align-items: center; gap: 5px; white-space: nowrap;
    }
    #haven-desktop-footer .hdf-label {
      text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; font-size: 10px;
    }
    #haven-desktop-footer .hdf-value {
      color: var(--text-secondary, #bbb); font-family: var(--font-mono, monospace); font-size: 11px;
    }
    #haven-desktop-footer .hdf-divider {
      width: 1px; height: 14px; background: var(--border, #333);
    }
    #haven-desktop-footer .hdf-spacer { flex: 1; }
    #haven-desktop-footer .hdf-version { opacity: 0.5; font-size: 10px; }
    #haven-desktop-footer .hdf-led {
      width: 8px; height: 8px; border-radius: 50%; background: #4ade80; flex-shrink: 0;
    }

    /* Push the rest of the page up so it's not hidden behind the fixed footer */
    #app { padding-bottom: 26px !important; }
  `;
  document.head.appendChild(css);

  // Build the footer bar
  const bar = document.createElement('div');
  bar.id = 'haven-desktop-footer';
  bar.innerHTML = `
    <div class="hdf-item"><span class="hdf-led" id="hdf-led"></span><span class="hdf-label">Server</span><span class="hdf-value" id="hdf-server">Connected</span></div>
    <div class="hdf-divider"></div>
    <div class="hdf-item"><span class="hdf-label">Ping</span><span class="hdf-value" id="hdf-ping">--</span><span class="hdf-label">ms</span></div>
    <div class="hdf-divider"></div>
    <div class="hdf-item"><span class="hdf-label">Channel</span><span class="hdf-value" id="hdf-channel">None</span></div>
    <div class="hdf-divider"></div>
    <div class="hdf-item"><span class="hdf-label">Online</span><span class="hdf-value" id="hdf-online">0</span></div>
    <span class="hdf-spacer"></span>
    <div class="hdf-item"><span class="hdf-value" id="hdf-clock"></span></div>
    <div class="hdf-divider"></div>
    <div class="hdf-item"><span class="hdf-value hdf-version" id="hdf-version"></span></div>
  `;
  document.body.appendChild(bar);

  // Sync data from the original (hidden) status bar elements every 500ms
  setInterval(() => {
    const sync = (src, dst) => {
      const s = document.getElementById(src);
      const d = document.getElementById(dst);
      if (s && d && d.textContent !== s.textContent) d.textContent = s.textContent;
    };
    sync('status-server-text', 'hdf-server');
    sync('status-ping',        'hdf-ping');
    sync('status-channel',     'hdf-channel');
    sync('status-online-count','hdf-online');
    sync('status-clock',       'hdf-clock');
    sync('status-version',     'hdf-version');

    // Sync the LED color
    const srcLed = document.getElementById('status-server-led');
    const dstLed = document.getElementById('hdf-led');
    if (srcLed && dstLed) {
      const cls = srcLed.className;
      dstLed.style.background = cls.includes('danger') ? '#ef4444' : cls.includes('warn') ? '#f59e0b' : '#4ade80';
      dstLed.style.animation = cls.includes('pulse') ? 'pulse 1.5s infinite' : 'none';
    }
  }, 500);
});

// ═══════════════════════════════════════════════════════════
// HTML5 Fullscreen API Override
//
// BrowserView does not support the HTML5 Fullscreen API.
// requestFullscreen() silently resolves but the element never
// actually enters DOM fullscreen state — :fullscreen CSS never
// applies and the visual doesn't change.  We implement fullscreen
// entirely manually: a CSS class for visual fullscreen + IPC to
// toggle the Electron window's native fullscreen.
// ═══════════════════════════════════════════════════════════

(function patchFullscreen() {
  let _fullscreenEl = null;

  // Inject the CSS that makes our manual fullscreen work.
  // Deferred to DOMContentLoaded because the preload runs before <head> exists.
  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .haven-manual-fullscreen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: unset !important;
        max-height: unset !important;
        z-index: 2147483647 !important;
        background: #000 !important;
        object-fit: contain !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }
  if (document.head) injectStyle();
  else window.addEventListener('DOMContentLoaded', injectStyle, { once: true });

  function enterFullscreen(el) {
    if (_fullscreenEl) exitFullscreen();
    _fullscreenEl = el;
    el.classList.add('haven-manual-fullscreen');
    ipcRenderer.send('window:enter-fullscreen');
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  function exitFullscreen() {
    if (_fullscreenEl) {
      _fullscreenEl.classList.remove('haven-manual-fullscreen');
      _fullscreenEl = null;
    }
    ipcRenderer.send('window:leave-fullscreen');
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  // Override requestFullscreen
  Element.prototype.requestFullscreen = function () {
    enterFullscreen(this);
    return Promise.resolve();
  };
  if (Element.prototype.webkitRequestFullscreen) {
    Element.prototype.webkitRequestFullscreen = function () {
      enterFullscreen(this);
    };
  }

  // Override exitFullscreen
  Document.prototype.exitFullscreen = function () {
    exitFullscreen();
    return Promise.resolve();
  };

  // Override document.fullscreenElement getter
  Object.defineProperty(Document.prototype, 'fullscreenElement', {
    get() { return _fullscreenEl; },
    configurable: true,
  });
  Object.defineProperty(Document.prototype, 'webkitFullscreenElement', {
    get() { return _fullscreenEl; },
    configurable: true,
  });
  Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
    get() { return true; },
    configurable: true,
  });

  // Escape key exits fullscreen
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _fullscreenEl) {
      e.preventDefault();
      exitFullscreen();
    }
  }, true);
})();

// ─── Internal state ──────────────────────────────────────
let _audioWorkletNode    = null;
let _audioCtx            = null;
let _audioDestination    = null;
let _capturedAudioPid    = null;
let _audioBufferQueue    = [];
// ─── Global voice shortcut triggers ──────────────────────
ipcRenderer.on('voice:mute-toggle',   () => document.getElementById('voice-mute-btn')?.click());
ipcRenderer.on('voice:deafen-toggle', () => document.getElementById('voice-deafen-btn')?.click());
ipcRenderer.on('voice:ptt-toggle',    () => document.getElementById('voice-mute-btn')?.click());

// ─── Server badge state updates from main process ────────
ipcRenderer.on('server-badge-update', (_event, badgeMap) => {
  window.dispatchEvent(new CustomEvent('haven-server-badges', { detail: badgeMap }));
});

// ─── Forward server log messages to the browser console ──
ipcRenderer.on('server:log', (_event, msg) => {
  console.log('[Haven Server]', msg.trimEnd());
});

// ─── Receive PCM chunks from native addon (main process) ─
let _ipcDataCount = 0;
ipcRenderer.on('audio:capture-data', (_event, pcmData) => {
  // Build a Float32Array from whatever Electron's IPC delivers.
  // The main process now sends a plain ArrayBuffer (guaranteed offset-0),
  // but we still handle typed-array arrivals defensively.
  let samples;
  try {
    if (pcmData instanceof Float32Array) {
      samples = pcmData;
    } else if (pcmData instanceof ArrayBuffer) {
      samples = new Float32Array(pcmData);
    } else if (ArrayBuffer.isView(pcmData)) {
      // Buffer/Uint8Array — copy to a fresh aligned ArrayBuffer to avoid
      // RangeError when byteOffset is not 4-byte-aligned.
      const bytes = new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
      const aligned = new ArrayBuffer(bytes.length);
      new Uint8Array(aligned).set(bytes);
      samples = new Float32Array(aligned);
    } else {
      console.warn('[Haven Desktop] audio:capture-data unknown format:', typeof pcmData);
      return;
    }
  } catch (e) {
    console.warn('[Haven Desktop] audio:capture-data conversion failed:', e.message);
    return;
  }

  // Periodic diagnostic: confirm data is arriving
  _ipcDataCount++;
  if (_ipcDataCount === 1 || _ipcDataCount % 500 === 0) {
    console.log(`[Haven Desktop] audio:capture-data chunk #${_ipcDataCount}, ${samples.length} samples, peak=${Math.max(...Array.from(samples.slice(0, 128)).map(Math.abs)).toFixed(4)}`);
  }

  if (_audioWorkletNode) {
    _audioWorkletNode.port.postMessage({ type: 'audio-data', samples });
  } else if (window._havenAppAudioPush) {
    window._havenAppAudioPush(samples);
  } else {
    _audioBufferQueue.push(samples);
  }
});

// ─── Listen for screen-picker request from main process ──
ipcRenderer.on('screen:show-picker', (_event, data) => {
  showScreenPicker(data.sources, data.audioApps);
});

// ═══════════════════════════════════════════════════════════
// Screen-Share Picker  (injected as a full-screen overlay)
// ═══════════════════════════════════════════════════════════

function showScreenPicker(sources, audioApps) {
  // Remove stale picker
  document.getElementById('haven-screen-picker')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'haven-screen-picker';
  overlay.innerHTML = `
    <style>
      #haven-screen-picker {
        position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:999999;
        display:flex;align-items:center;justify-content:center;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      }
      .hsp-box{background:#1a1a2e;border-radius:14px;padding:28px;max-width:820px;width:92%;
        max-height:82vh;display:flex;flex-direction:column;border:1px solid rgba(107,79,219,.3);
        box-shadow:0 20px 60px rgba(0,0,0,.5);}
      .hsp-title{color:#e0e0e0;font-size:20px;font-weight:700;margin-bottom:2px;flex-shrink:0}
      .hsp-sub{color:#888;font-size:13px;margin-bottom:14px;flex-shrink:0}
      .hsp-scroll{flex:1;overflow-y:auto;padding-right:4px;margin-right:-4px;min-height:0}
      .hsp-sec{margin-bottom:14px}
      .hsp-sec-title{color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;
        margin-bottom:8px;font-weight:700}
      .hsp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:10px}
      .hsp-src{background:#16213e;border-radius:8px;padding:8px;cursor:pointer;
        border:2px solid transparent;transition:border-color .2s,transform .15s}
      .hsp-src:hover{border-color:rgba(107,79,219,.5);transform:translateY(-1px)}
      .hsp-src.sel{border-color:#6b4fdb}
      .hsp-src img{width:100%;border-radius:4px;margin-bottom:6px;aspect-ratio:16/9;
        object-fit:cover;background:#0d0d1a}
      .hsp-src-name{color:#ccc;font-size:12px;text-align:center;white-space:nowrap;
        overflow:hidden;text-overflow:ellipsis}
      .hsp-audio{padding-top:14px;border-top:1px solid #2a2a4a;flex-shrink:0;margin-top:10px}
      .hsp-apps{display:flex;flex-wrap:wrap;gap:8px}
      .hsp-app{background:#16213e;border-radius:6px;padding:8px 14px;cursor:pointer;
        border:2px solid transparent;transition:border-color .2s;display:flex;
        align-items:center;gap:8px;color:#ccc;font-size:13px}
      .hsp-app:hover{border-color:rgba(107,79,219,.5)}
      .hsp-app.sel{border-color:#6b4fdb}
      .hsp-app .ico{width:20px;height:20px}
      .hsp-btns{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-shrink:0}
      .hsp-btn{padding:8px 22px;border-radius:6px;border:none;font-size:14px;cursor:pointer;font-weight:600}
      .hsp-cancel{background:#333;color:#ccc}.hsp-cancel:hover{background:#444}
      .hsp-share{background:#6b4fdb;color:#fff}.hsp-share:hover{background:#7b5fe9}
      .hsp-share:disabled{opacity:.45;cursor:not-allowed}
      .hsp-none{color:#666;font-size:12px;font-style:italic;padding:8px}
    </style>

    <div class="hsp-box">
      <div class="hsp-title">Share Your Screen</div>
      <div class="hsp-sub">Choose a window or screen — then optionally pick an application whose audio to share.</div>

      <div class="hsp-scroll">
        <div class="hsp-sec">
          <div class="hsp-sec-title">Screens</div>
          <div class="hsp-grid" id="hsp-screens"></div>
        </div>

        <div class="hsp-sec">
          <div class="hsp-sec-title">Application Windows</div>
          <div class="hsp-grid" id="hsp-windows"></div>
        </div>
      </div>

      <div class="hsp-audio">
        <div class="hsp-sec-title">🔊 Application Audio — isolate audio from a specific app</div>
        <div class="hsp-apps" id="hsp-audio-apps"></div>
      </div>

      <div class="hsp-btns">
        <button class="hsp-btn hsp-cancel" id="hsp-cancel">Cancel</button>
        <button class="hsp-btn hsp-share"  id="hsp-go" disabled>Share</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  let selSource = null;
  let selAudioPid = null;

  const screensEl  = document.getElementById('hsp-screens');
  const windowsEl  = document.getElementById('hsp-windows');
  const appsEl     = document.getElementById('hsp-audio-apps');
  const goBtn      = document.getElementById('hsp-go');

  // ── Populate video sources ─────────────────────────────
  sources.forEach(src => {
    const el = document.createElement('div');
    el.className = 'hsp-src';
    el.innerHTML = `<img src="${src.thumbnail}" alt=""><div class="hsp-src-name" title="${src.name}">${src.name}</div>`;
    el.onclick = () => {
      overlay.querySelectorAll('.hsp-src.sel').forEach(s => s.classList.remove('sel'));
      el.classList.add('sel');
      selSource = src.id;
      goBtn.disabled = false;
    };
    (src.id.startsWith('screen:') ? screensEl : windowsEl).appendChild(el);
  });

  // ── Populate audio applications ────────────────────────
  // "No Audio" option — always shown first
  const muteEl = document.createElement('div');
  muteEl.className = 'hsp-app';
  muteEl.innerHTML = '🔇&nbsp; No Audio';
  muteEl.onclick = () => {
    appsEl.querySelectorAll('.sel').forEach(a => a.classList.remove('sel'));
    muteEl.classList.add('sel');
    selAudioPid = 'none';
  };
  appsEl.appendChild(muteEl);

  // "System Audio" option — always shown, selected by default
  const sysEl = document.createElement('div');
  sysEl.className = 'hsp-app sel';
  sysEl.innerHTML = '🔊&nbsp; System Audio';
  sysEl.onclick = () => {
    appsEl.querySelectorAll('.sel').forEach(a => a.classList.remove('sel'));
    sysEl.classList.add('sel');
    selAudioPid = null;
  };
  appsEl.appendChild(sysEl);

  // Per-app entries when native module is available
  if (audioApps && audioApps.length) {
    audioApps.forEach(a => {
      const el = document.createElement('div');
      el.className = 'hsp-app';
      const icon = a.icon ? `<img class="ico" src="${a.icon}" alt="">` : '🔊';
      el.innerHTML = `${icon}<span>${a.name}</span>`;
      el.onclick = () => {
        appsEl.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
        selAudioPid = a.pid;
      };
      appsEl.appendChild(el);
    });
  }

  // ── Cancel ─────────────────────────────────────────────
  let dismissed = false;
  const dismiss = async (cancelled) => {
    if (dismissed) return; // prevent double-dismiss
    dismissed = true;
    overlay.remove();
    document.removeEventListener('keydown', escHandler);

    // Restore focus to the main window content (prevents Wayland focus loss)
    try { document.body?.focus(); window.focus(); } catch {}

    let effectiveAudioPid = selAudioPid;
    if (!cancelled && selAudioPid && selAudioPid !== 'none') {
      _capturedAudioPid = selAudioPid;
      // Build the audio pipeline BEFORE sending the picker result,
      // so the per-app track is ready when getDisplayMedia resolves.
      const pipelineOk = await buildAudioPipeline();
      if (!pipelineOk) {
        // Pipeline failed — fall back to system loopback so the user
        // at least gets some audio rather than complete silence.
        console.warn('[Haven Desktop] Per-app audio unavailable, falling back to system audio');
        _capturedAudioPid = null;
        effectiveAudioPid = null;
      }
    }

    ipcRenderer.send('screen:picker-result', cancelled ? { cancelled: true } : { sourceId: selSource, audioAppPid: effectiveAudioPid });
  };

  document.getElementById('hsp-cancel').onclick = () => dismiss(true);
  goBtn.onclick = () => dismiss(false);

  // Also dismiss on overlay background click (outside the box)
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) dismiss(true); });

  const escHandler = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(true); } };
  document.addEventListener('keydown', escHandler, true);
}

// ═══════════════════════════════════════════════════════════
// Audio-Capture Pipeline
//
// Receives PCM from the native addon via IPC, pipes it through
// an AudioWorklet, and exposes a MediaStreamTrack that replaces
// the system-loopback track on the screen-share MediaStream.
// ═══════════════════════════════════════════════════════════

async function buildAudioPipeline() {
  // Try AudioWorklet first, fall back to ScriptProcessorNode if it fails
  // (AudioWorklet blob URLs can fail in some Electron/BrowserView contexts)
  try {
    _audioCtx = new AudioContext({ sampleRate: 48000 });
    // Explicitly resume — BrowserView contexts may start suspended
    if (_audioCtx.state === 'suspended') await _audioCtx.resume();

    // Inline AudioWorklet processor (blob URL avoids CSP / file issues)
    const workletSrc = `
      class AppAudioProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this._ring   = new Float32Array(96000);   // 2 s ring buffer
          this._wPos   = 0;
          this._rPos   = 0;
          this._avail  = 0;

          this.port.onmessage = (e) => {
            if (e.data.type !== 'audio-data') return;
            const s = e.data.samples;
            for (let i = 0; i < s.length; i++) {
              this._ring[this._wPos] = s[i];
              this._wPos = (this._wPos + 1) % this._ring.length;
            }
            this._avail = Math.min(this._avail + s.length, this._ring.length);
          };
        }

        process(_inputs, outputs) {
          const out = outputs[0];
          if (!out || !out.length) return true;
          const buf = out[0];
          const len = buf.length;

          if (this._avail < len) { buf.fill(0); return true; }

          for (let i = 0; i < len; i++) {
            buf[i] = this._ring[this._rPos];
            this._rPos = (this._rPos + 1) % this._ring.length;
          }
          this._avail -= len;

          for (let ch = 1; ch < out.length; ch++) out[ch].set(buf);
          return true;
        }
      }
      registerProcessor('app-audio-processor', AppAudioProcessor);
    `;

    const blob = new Blob([workletSrc], { type: 'application/javascript' });
    const url  = URL.createObjectURL(blob);
    await _audioCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    _audioWorkletNode = new AudioWorkletNode(_audioCtx, 'app-audio-processor', {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });

    _audioDestination = _audioCtx.createMediaStreamDestination();
    _audioWorkletNode.connect(_audioDestination);
    // Also connect to AudioContext.destination (silenced) so Chromium's
    // audio thread actually drives the AudioWorklet process() callback.
    // Without this, MediaStreamDestination alone may not pump the graph.
    const silencer = _audioCtx.createGain();
    silencer.gain.value = 0;
    _audioWorkletNode.connect(silencer);
    silencer.connect(_audioCtx.destination);

    // Flush any PCM that arrived before the pipeline was ready
    _audioBufferQueue.forEach(buf =>
      _audioWorkletNode.port.postMessage({ type: 'audio-data', samples: buf })
    );
    _audioBufferQueue = [];

    // Expose track globally so our getDisplayMedia override can grab it
    window._havenAppAudioTrack  = _audioDestination.stream.getAudioTracks()[0];
    window._havenAppAudioStream = _audioDestination.stream;

    // Monitor AudioContext — BrowserView can re-suspend unexpectedly
    window._havenAudioCtxMonitor = setInterval(() => {
      if (_audioCtx && _audioCtx.state === 'suspended') {
        console.warn('[Haven Desktop] AudioContext suspended — resuming');
        _audioCtx.resume().catch(() => {});
      }
    }, 2000);

    console.log('[Haven Desktop] Per-app audio pipeline active (AudioWorklet), ctx state:', _audioCtx.state);
    return true;
  } catch (err) {
    console.warn('[Haven Desktop] AudioWorklet pipeline failed, trying ScriptProcessor fallback:', err.message);
    // Clean up partial AudioWorklet state before fallback
    _audioWorkletNode = null;
    if (_audioCtx) { _audioCtx.close().catch(() => {}); _audioCtx = null; }
    _audioDestination = null;
  }

  // ── Fallback: ScriptProcessorNode (works in all Electron versions) ──
  try {
    _audioCtx = new AudioContext({ sampleRate: 48000 });
    if (_audioCtx.state === 'suspended') await _audioCtx.resume();

    const bufSize = 4096;
    // Use 1 input channel (not 0).  A "generator" ScriptProcessor with
    // 0 inputs may not have its onaudioprocess callback pumped reliably
    // in Electron / BrowserView environments.  Connecting a live source
    // to the input guarantees Chromium's audio thread drives the node.
    const scriptNode = _audioCtx.createScriptProcessor(bufSize, 1, 2);
    const ring   = new Float32Array(96000);
    let   wPos   = 0;
    let   rPos   = 0;
    let   avail  = 0;
    let   _spProcessCount = 0;

    // Store a push function that the IPC handler can call
    window._havenAppAudioPush = (samples) => {
      for (let i = 0; i < samples.length; i++) {
        ring[wPos] = samples[i];
        wPos = (wPos + 1) % ring.length;
      }
      avail = Math.min(avail + samples.length, ring.length);
    };

    scriptNode.onaudioprocess = (e) => {
      _spProcessCount++;
      const out = e.outputBuffer.getChannelData(0);
      if (avail < out.length) { out.fill(0); } else {
        for (let i = 0; i < out.length; i++) {
          out[i] = ring[rPos];
          rPos = (rPos + 1) % ring.length;
        }
        avail -= out.length;
      }
      // Copy mono to stereo
      const out1 = e.outputBuffer.getChannelData(1);
      out1.set(out);
      // Periodic diagnostic
      if (_spProcessCount === 1 || _spProcessCount % 200 === 0) {
        const peak = Math.max(...Array.from(out.slice(0, 128)).map(Math.abs));
        console.log(`[Haven Desktop] ScriptProcessor process #${_spProcessCount}, avail=${avail}, peak=${peak.toFixed(4)}`);
      }
    };

    _audioDestination = _audioCtx.createMediaStreamDestination();
    scriptNode.connect(_audioDestination);

    // Drive the ScriptProcessor with a silent ConstantSourceNode so
    // Chromium's audio thread always pulls from it.
    const driver = _audioCtx.createConstantSource();
    driver.offset.value = 0;
    driver.connect(scriptNode);
    driver.start();
    // Also connect to context destination (silenced) as a second sink
    // to ensure the graph stays active.
    const silencer = _audioCtx.createGain();
    silencer.gain.value = 0;
    scriptNode.connect(silencer);
    silencer.connect(_audioCtx.destination);

    // Flush buffered PCM
    _audioBufferQueue.forEach(buf => window._havenAppAudioPush(buf));
    _audioBufferQueue = [];

    window._havenAppAudioTrack  = _audioDestination.stream.getAudioTracks()[0];
    window._havenAppAudioStream = _audioDestination.stream;

    // Monitor AudioContext — BrowserView can re-suspend unexpectedly
    window._havenAudioCtxMonitor = setInterval(() => {
      if (_audioCtx && _audioCtx.state === 'suspended') {
        console.warn('[Haven Desktop] AudioContext suspended — resuming');
        _audioCtx.resume().catch(() => {});
      }
    }, 2000);

    console.log('[Haven Desktop] Per-app audio pipeline active (ScriptProcessor fallback), ctx state:', _audioCtx.state);
    return true;
  } catch (err) {
    console.error('[Haven Desktop] Audio pipeline setup failed completely:', err);
    // Clean up on total failure
    if (_audioCtx) { _audioCtx.close().catch(() => {}); _audioCtx = null; }
    _audioDestination = null;
    window._havenAppAudioPush = null;
    return false;
  }
}

function teardownAudioPipeline() {
  // Stop native capture first so IPC messages stop arriving
  ipcRenderer.invoke('audio:stop-capture').catch(() => {});
  if (window._havenAudioCtxMonitor) {
    clearInterval(window._havenAudioCtxMonitor);
    window._havenAudioCtxMonitor = null;
  }
  _audioWorkletNode?.disconnect();
  _audioWorkletNode = null;
  _audioCtx?.close().catch(() => {});
  _audioCtx         = null;
  _audioDestination = null;
  _capturedAudioPid = null;
  _audioBufferQueue = [];
  _ipcDataCount     = 0;
  window._havenAppAudioTrack  = null;
  window._havenAppAudioStream = null;
  window._havenAppAudioPush   = null;
  console.log('[Haven Desktop] Audio pipeline torn down');
}

// ═══════════════════════════════════════════════════════════
// Override getDisplayMedia()
//
// After Electron's handler resolves with a video stream, we
// swap the system-loopback audio track for our per-app track.
// Haven's voice.js calls the same standard API — zero changes
// needed on the server/browser code.
//
// NOTE: navigator.mediaDevices is not available at preload
// time — it only exists once the renderer page has loaded.
// We defer the override until DOMContentLoaded.
// ═══════════════════════════════════════════════════════════

function installGetDisplayMediaOverride() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    // Not ready yet (rare, but possible) — retry briefly
    setTimeout(installGetDisplayMediaOverride, 100);
    return;
  }

  const _origGDM = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getDisplayMedia = async function (constraints) {
    const stream = await _origGDM(constraints);

    // If per-app audio capture is active, add our native capture track
    // (system loopback is already excluded by the main process handler)
    if (window._havenAppAudioTrack) {
      // Remove any existing audio tracks (shouldn't be any, but just in case)
      stream.getAudioTracks().forEach(t => { stream.removeTrack(t); t.stop(); });
      stream.addTrack(window._havenAppAudioTrack);
      console.log('[Haven Desktop] Added per-app audio track to screen share');
    }

    // Auto-teardown when the video track ends (user stops sharing)
    stream.getVideoTracks().forEach(t => t.addEventListener('ended', () => teardownAudioPipeline()));

    return stream;
  };

  console.log('[Haven Desktop] getDisplayMedia override installed');
}

document.addEventListener('DOMContentLoaded', installGetDisplayMediaOverride);

// ═══════════════════════════════════════════════════════════
//  Desktop Notifications  (override browser Notification API)
// ═══════════════════════════════════════════════════════════

class HavenNotification {
  constructor(title, opts = {}) {
    ipcRenderer.invoke('notify', { title, body: opts.body || '', silent: opts.silent || false, channelCode: opts.channelCode });
    this._onclick = null;
  }
  set onclick(fn) { this._onclick = fn; }
  get onclick()   { return this._onclick; }
  close() {}
  static get permission() { return 'granted'; }
  static requestPermission() { return Promise.resolve('granted'); }
}
window.Notification = HavenNotification;

// When user clicks a native notification, navigate to the channel
ipcRenderer.on('notification-clicked', (_e, channelCode) => {
  if (channelCode && window.app?.switchChannel) {
    window.app.switchChannel(channelCode);
  }
});

// ═══════════════════════════════════════════════════════════
//  Exposed API  (window.havenDesktop)
// ═══════════════════════════════════════════════════════════

window.havenDesktop = {
  platform:     process.platform,
  isDesktopApp: true,

  /** Switch to another Haven server inside the app window (hot-swap) */
  switchServer: (url) => ipcRenderer.send('nav:switch-server', url),

  /** Go back to the welcome / setup screen */
  backToWelcome: () => ipcRenderer.send('nav:back-to-welcome'),

  /** Auto-update controls */
  update: {
    download: () => ipcRenderer.invoke('update:download'),
    install:  () => ipcRenderer.send('update:install'),
  },

  audio: {
    getApplications: () => ipcRenderer.invoke('audio:get-apps'),
    startCapture:    (pid) => ipcRenderer.invoke('audio:start-capture', pid),
    stopCapture:     ()    => { teardownAudioPipeline(); return ipcRenderer.invoke('audio:stop-capture'); },
    isSupported:     ()    => ipcRenderer.invoke('audio:is-supported'),
    optOutOfDucking: ()    => ipcRenderer.invoke('audio:opt-out-ducking'),
  },

  devices: {
    getInputs:  () => ipcRenderer.invoke('devices:get-inputs'),
    getOutputs: () => ipcRenderer.invoke('devices:get-outputs'),
    setOutput:  async (deviceId) => {
      for (const el of document.querySelectorAll('audio, video')) {
        if (el.setSinkId) await el.setSinkId(deviceId);
      }
      return true;
    },
  },

  notify: (title, body, opts = {}) => ipcRenderer.invoke('notify', { title, body, ...opts }),

  /** Desktop shortcut configuration */
  shortcuts: {
    getConfig: ()         => ipcRenderer.invoke('shortcuts:get'),
    setConfig: (updates)  => ipcRenderer.invoke('shortcuts:register', updates),
  },

  /** Signal the taskbar/dock badge (no native notification needed) */
  setUnreadBadge: (hasUnread) => ipcRenderer.send('notification-badge', hasUnread),

  settings: {
    get: (key)       => ipcRenderer.invoke('settings:get', key),
    set: (key, val)  => ipcRenderer.invoke('settings:set', key, val),
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  getVersion: () => ipcRenderer.invoke('app:version'),

  /** Desktop app preferences (start on login, minimize to tray, HDR/SDR) */
  prefs: {
    get:              ()      => ipcRenderer.invoke('desktop:get-prefs'),
    setStartOnLogin:  (v)     => ipcRenderer.invoke('desktop:set-start-on-login', v),
    setStartHidden:   (v)     => ipcRenderer.invoke('desktop:set-start-hidden', v),
    setMinimizeToTray:(v)     => ipcRenderer.invoke('desktop:set-minimize-to-tray', v),
    setForceSDR:      (v)     => ipcRenderer.invoke('desktop:set-force-sdr', v),
  },

  /** Query per-server unread badge state for notification dots */
  getServerBadges: () => ipcRenderer.invoke('get-server-badges'),
};

console.log('[Haven Desktop] App preload ready — per-app audio & enhanced features active');

// ═══════════════════════════════════════════════════════════
// Auto-Update Banner
//
// When electron-updater detects a new version, we inject a slim
// banner at the top of the page so the user can download and
// install with one click.
// ═══════════════════════════════════════════════════════════

(function setupAutoUpdateBanner() {
  let bannerEl = null;

  function createBanner(text, buttonLabel, buttonAction) {
    removeBanner();
    bannerEl = document.createElement('div');
    bannerEl.id = 'haven-update-banner';
    bannerEl.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999998;background:linear-gradient(135deg,#6b4fdb,#8b6ce7);color:#fff;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3);';
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
    const close = document.createElement('button');
    close.textContent = '✕';
    close.style.cssText = 'background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:16px;padding:0 4px;margin-left:4px;';
    close.onclick = removeBanner;
    bannerEl.appendChild(close);
    document.body.prepend(bannerEl);
  }

  function removeBanner() {
    if (bannerEl) { bannerEl.remove(); bannerEl = null; }
  }

  ipcRenderer.on('update:available', (_e, { version }) => {
    createBanner(
      `Haven Desktop v${version} is available!`,
      'Update Now',
      async () => {
        const btn = document.getElementById('haven-update-btn');
        const msg = document.getElementById('haven-update-msg');
        if (btn) btn.disabled = true;
        if (msg) msg.textContent = 'Downloading update...';
        const res = await ipcRenderer.invoke('update:download');
        if (res?.error) {
          if (msg) msg.textContent = `Update failed: ${res.error}`;
        }
      }
    );
  });

  ipcRenderer.on('update:download-progress', (_e, { percent }) => {
    const msg = document.getElementById('haven-update-msg');
    if (msg) msg.textContent = `Downloading update... ${percent}%`;
  });

  ipcRenderer.on('update:downloaded', () => {
    createBanner(
      'Update downloaded! Restart to apply.',
      'Restart Now',
      () => ipcRenderer.send('update:install')
    );
  });

  ipcRenderer.on('update:error', (_e, { message }) => {
    const msg = document.getElementById('haven-update-msg');
    if (msg) msg.textContent = `Update error: ${message}`;
  });
})();
