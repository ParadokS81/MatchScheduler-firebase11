/**
 * VoiceReplayPlayer.js
 *
 * UI component for the voice replay page. Renders the Hub demo player iframe,
 * file drop zone, and audio controls (master volume, offset, per-track volume).
 *
 * Pattern: Revealing Module
 * Dependencies: VoiceReplayService.js
 */
const VoiceReplayPlayer = (function () {

    // ── State ──────────────────────────────────────────────────────────────

    let _container = null;
    let _demoSha256 = '';
    let _matchTitle = '';
    let _tracksLoaded = false;
    let _preMuteVolumes = {};     // trackIndex → volume before mute
    let _preMuteMasterVol = 0.8;  // master volume before mute
    let _showTimer = null;        // auto-hide timer for controls

    // ── Hub iframe URL ─────────────────────────────────────────────────────

    const HUB_PLAYER_BASE = 'https://hub.quakeworld.nu/demo-player/';

    function _buildIframeUrl(demoSha256) {
        return `${HUB_PLAYER_BASE}?demo_sha256=${demoSha256}`;
    }

    // ── Init ───────────────────────────────────────────────────────────────

    /**
     * Initialize the replay player.
     * @param {HTMLElement} container - Root element to render into
     * @param {string} demoSha256 - Demo hash
     * @param {string} [matchTitle] - Display title for the header
     * @param {boolean} [autoVoice=true] - Whether to auto-check Firestore for voice recordings
     */
    async function init(container, demoSha256, matchTitle, autoVoice = true) {
        _container = container;
        _demoSha256 = demoSha256;
        _matchTitle = matchTitle || '';
        _tracksLoaded = false;

        // Show loading state
        _container.innerHTML = `
            <div class="vr-loading">
                <p class="text-muted-foreground">Loading demo info\u2026</p>
            </div>
        `;

        // Init service (fetches DemoInfo, sets up postMessage listener)
        const { countdownDuration, demoInfo } = await VoiceReplayService.init(demoSha256, _onStateChange);

        // Build title from DemoInfo if not provided via URL
        if (!_matchTitle && demoInfo) {
            _matchTitle = _buildTitleFromDemoInfo(demoInfo);
        }

        // Skip voice check when just playing demo (▶ button)
        if (!autoVoice) {
            _render(); // Demo player with drop zone
            return;
        }

        // Wait for auth to be ready before trying Firestore
        if (typeof AuthService !== 'undefined') {
            await AuthService.waitForAuthReady();
        }

        // Try auto-loading voice recordings from Firebase Storage
        _container.innerHTML = `
            <div class="vr-loading">
                <p class="text-muted-foreground">Checking for voice recordings\u2026</p>
            </div>
        `;

        const result = await VoiceReplayService.loadFromFirestore(demoSha256);

        switch (result.status) {
            case 'loaded':
                _tracksLoaded = true;
                _render();
                break;

            case 'not_found':
                _render(); // Shows drop zone
                break;

            case 'auth_required':
                _renderAuthRequired();
                break;

            case 'access_denied':
                _render(); // Show demo player with drop zone, no error message
                break;
        }
    }

    /**
     * Build a match title from DemoInfo data.
     */
    function _buildTitleFromDemoInfo(info) {
        if (!info) return '';
        const teams = info.teams || [];
        const map = info.map || '';
        if (teams.length === 2) {
            return `${teams[0].name || '?'} vs ${teams[1].name || '?'} on ${map}`;
        }
        return map ? `Match on ${map}` : 'Demo Replay';
    }

    // ── Render ─────────────────────────────────────────────────────────────

    function _render() {
        const iframeUrl = _buildIframeUrl(_demoSha256);

        _container.innerHTML = `
            <div class="vr-player">
                ${_renderHeader()}
                <div class="vr-iframe-wrap">
                    <iframe
                        class="vr-iframe"
                        src="${iframeUrl}"
                        allow="autoplay"
                    ></iframe>
                    ${_tracksLoaded ? `<div class="vr-overlay" id="vr-overlay">${_renderOverlayControls()}</div>` : ''}
                    <button class="vr-fs-btn" onclick="VoiceReplayPlayer.toggleFullscreen()" title="Fullscreen">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                        </svg>
                    </button>
                </div>
                ${_tracksLoaded ? '' : `<div class="vr-controls" id="vr-controls">${_renderDropZone()}</div>`}
            </div>
        `;

        // Attach drop zone events after render
        if (!_tracksLoaded) {
            _attachDropEvents();
        }

        // Auto-hide controls after 3s of no mouse activity
        _initAutoHide();
    }

    function _initAutoHide() {
        const wrap = _container?.querySelector('.vr-iframe-wrap');
        if (!wrap || wrap._autoHideAttached) return;
        wrap._autoHideAttached = true;

        function showControls() {
            wrap.classList.add('vr-show');
            clearTimeout(_showTimer);
            _showTimer = setTimeout(() => wrap.classList.remove('vr-show'), 3000);
        }

        // Mouse moving over non-iframe parts of wrapper
        wrap.addEventListener('mousemove', showControls);
        // Mouse entering wrapper from outside
        wrap.addEventListener('mouseenter', showControls);
        // Mouse leaving wrapper entirely
        wrap.addEventListener('mouseleave', () => {
            clearTimeout(_showTimer);
            wrap.classList.remove('vr-show');
        });
        // Mouse entering iframe steals focus from parent window —
        // detect this to show controls when mouse moves into iframe area
        window.addEventListener('blur', () => {
            if (wrap.matches(':hover')) showControls();
        });
    }

    /**
     * Toggle fullscreen on the wrapper (includes iframe + voice overlay).
     */
    function toggleFullscreen() {
        const wrap = _container?.querySelector('.vr-iframe-wrap');
        if (!wrap) return;

        if (document.fullscreenElement === wrap) {
            document.exitFullscreen();
        } else {
            wrap.requestFullscreen().catch(() => {});
        }
    }

    function _renderHeader() {
        const title = _matchTitle
            ? `<span class="vr-header-title">${_escapeHtml(_matchTitle)}</span>`
            : `<span class="vr-header-title text-muted-foreground">Voice Replay</span>`;

        return `
            <div class="vr-header">
                <span class="vr-header-label">Voice Replay</span>
                ${_matchTitle ? `<span class="vr-header-sep">\u2014</span>${title}` : ''}
            </div>
        `;
    }

    function _renderDropZone() {
        return `
            <div class="vr-dropzone" id="vr-dropzone">
                <div class="vr-dropzone-content">
                    <div class="vr-dropzone-icon">\uD83C\uDFA7</div>
                    <p class="vr-dropzone-text">Drop OGG files or zip here</p>
                    <p class="vr-dropzone-subtext">or</p>
                    <label class="vr-browse-btn">
                        Browse files
                        <input
                            type="file"
                            id="vr-file-input"
                            multiple
                            accept=".ogg,.opus,.webm,.zip"
                            style="display: none;"
                        >
                    </label>
                </div>
                <div class="vr-drop-status" id="vr-drop-status"></div>
            </div>
        `;
    }

    function _renderOverlayControls() {
        const tracks = VoiceReplayService.getTracks();
        const state = VoiceReplayService.getState();

        const playerTracks = tracks.filter((t, i) => !_isBot(t.name));

        const masterMuted = state.masterVolume === 0;
        const trackRows = playerTracks.map((t, i) => {
            const idx = tracks.indexOf(t);
            const muted = t.volume === 0;
            return `
                <div class="vr-ov-track">
                    <button class="vr-ov-mute ${muted ? 'vr-ov-muted' : ''}" onclick="VoiceReplayPlayer.toggleTrackMute(${idx})"
                        title="${muted ? 'Unmute' : 'Mute'}">${muted ? '\u{1F507}' : '\u{1F50A}'}</button>
                    <span class="vr-ov-name">${_escapeHtml(t.name)}</span>
                    <input type="range" class="vr-ov-slider" min="0" max="100" value="${Math.round(t.volume * 100)}"
                        oninput="VoiceReplayPlayer.setTrackVolume(${idx}, this.value)">
                </div>`;
        }).join('');

        return `
            <div class="vr-ov-row">
                <button class="vr-ov-mute ${masterMuted ? 'vr-ov-muted' : ''}" onclick="VoiceReplayPlayer.toggleMasterMute()"
                    title="${masterMuted ? 'Unmute all' : 'Mute all'}">${masterMuted ? '\u{1F507}' : '\u{1F50A}'}</button>
                <span class="vr-ov-label">Vol</span>
                <input type="range" class="vr-ov-slider" id="vr-ov-master-slider" min="0" max="100" value="${Math.round(state.masterVolume * 100)}"
                    oninput="VoiceReplayPlayer.setMasterVolume(this.value)">
            </div>
            ${trackRows}
            <div class="vr-ov-row vr-ov-sync-row">
                <span class="vr-ov-label vr-ov-label-sync">Sync</span>
                <input type="range" class="vr-ov-slider" min="-100" max="100" value="${Math.round(state.manualOffset * 10)}"
                    oninput="VoiceReplayPlayer.setOffset(this.value)">
                <span class="vr-ov-val" id="vr-ov-offset">${state.manualOffset >= 0 ? '+' : ''}${state.manualOffset.toFixed(1)}s</span>
            </div>
            <label class="vr-ov-add-more">
                + Add files
                <input type="file" id="vr-file-input-more" multiple accept=".ogg,.opus,.webm,.zip" style="display: none;">
            </label>
        `;
    }

    // ── Auth States ───────────────────────────────────────────────────

    function _renderAuthRequired() {
        const iframeUrl = _buildIframeUrl(_demoSha256);

        _container.innerHTML = `
            <div class="vr-player">
                ${_renderHeader()}
                <div class="vr-iframe-wrap">
                    <iframe class="vr-iframe" src="${iframeUrl}"
                        allow="autoplay; fullscreen" allowfullscreen></iframe>
                </div>
                <div class="vr-controls" id="vr-controls">
                    <div class="vr-auth-prompt">
                        <p class="vr-auth-message">This recording is private. Sign in to access your team's recordings.</p>
                        <div class="vr-auth-buttons">
                            <button class="vr-auth-btn vr-auth-discord" onclick="VoiceReplayPlayer.signInDiscord()">
                                Sign in with Discord
                            </button>
                            <button class="vr-auth-btn vr-auth-google" onclick="VoiceReplayPlayer.signInGoogle()">
                                Sign in with Google
                            </button>
                        </div>
                    </div>
                    ${_renderDropZone()}
                </div>
            </div>
        `;

        _attachDropEvents();
    }

    function _renderAccessDenied() {
        const iframeUrl = _buildIframeUrl(_demoSha256);

        _container.innerHTML = `
            <div class="vr-player">
                ${_renderHeader()}
                <div class="vr-iframe-wrap">
                    <iframe class="vr-iframe" src="${iframeUrl}"
                        allow="autoplay; fullscreen" allowfullscreen></iframe>
                </div>
                <div class="vr-controls" id="vr-controls">
                    <div class="vr-auth-prompt">
                        <p class="vr-auth-message vr-auth-denied">You don't have access to this recording. It belongs to a different team.</p>
                    </div>
                    ${_renderDropZone()}
                </div>
            </div>
        `;

        _attachDropEvents();
    }

    async function signInDiscord() {
        try {
            await AuthService.signInWithDiscord();
            await _retryLoad();
        } catch (err) {
            console.error('VoiceReplayPlayer: Discord sign-in failed', err);
        }
    }

    async function signInGoogle() {
        try {
            await AuthService.signInWithGoogle();
            await _retryLoad();
        } catch (err) {
            console.error('VoiceReplayPlayer: Google sign-in failed', err);
        }
    }

    async function _retryLoad() {
        const result = await VoiceReplayService.loadFromFirestore(_demoSha256);

        if (result.status === 'loaded') {
            _tracksLoaded = true;
            _render();
        } else if (result.status === 'access_denied') {
            _renderAccessDenied();
        }
    }

    // Bot/irrelevant track names to auto-mute and collapse
    const BOT_PATTERNS = [
        /recording/i,
        /craig/i,
        /quake\.world/i,
        /\bbot\b/i,
        /^\[.*\]$/,       // names like [BOT] etc.
    ];

    function _isBot(name) {
        return BOT_PATTERNS.some(p => p.test(name));
    }

    function _renderTrackControls() {
        const tracks = VoiceReplayService.getTracks();
        const state = VoiceReplayService.getState();

        // Split into player tracks and bot tracks
        const playerTracks = [];
        const botTracks = [];
        tracks.forEach((t, i) => {
            const entry = { ...t, originalIndex: i };
            if (_isBot(t.name)) {
                // Auto-mute bots on first render
                VoiceReplayService.setTrackVolume(i, 0);
                botTracks.push(entry);
            } else {
                playerTracks.push(entry);
            }
        });

        const playerRows = playerTracks.map(t => `
            <div class="vr-track-row">
                <span class="vr-track-name">${_escapeHtml(t.name)}</span>
                <input
                    type="range"
                    class="vr-slider"
                    min="0" max="100" value="${Math.round(t.volume * 100)}"
                    oninput="VoiceReplayPlayer.setTrackVolume(${t.originalIndex}, this.value)"
                >
                <span class="vr-track-value" id="vr-track-val-${t.originalIndex}">${Math.round(t.volume * 100)}%</span>
            </div>
        `).join('');

        const botSection = botTracks.length > 0 ? `
            <details class="vr-bot-tracks">
                <summary class="vr-bot-summary">${botTracks.length} bot track${botTracks.length > 1 ? 's' : ''} (muted)</summary>
                ${botTracks.map(t => `
                    <div class="vr-track-row vr-track-bot">
                        <span class="vr-track-name">${_escapeHtml(t.name)}</span>
                        <input
                            type="range"
                            class="vr-slider"
                            min="0" max="100" value="0"
                            oninput="VoiceReplayPlayer.setTrackVolume(${t.originalIndex}, this.value)"
                        >
                        <span class="vr-track-value" id="vr-track-val-${t.originalIndex}">0%</span>
                    </div>
                `).join('')}
            </details>
        ` : '';

        return `
            <div class="vr-controls-loaded">
                <div class="vr-controls-grid">
                    <div class="vr-control-row">
                        <span class="vr-control-label">Volume</span>
                        <input
                            type="range"
                            class="vr-slider"
                            min="0" max="100" value="${Math.round(state.masterVolume * 100)}"
                            oninput="VoiceReplayPlayer.setMasterVolume(this.value)"
                        >
                        <span class="vr-control-value" id="vr-master-val">${Math.round(state.masterVolume * 100)}%</span>
                    </div>
                    <div class="vr-control-row">
                        <span class="vr-control-label">Offset</span>
                        <input
                            type="range"
                            class="vr-slider vr-slider-offset"
                            min="-100" max="100" value="${Math.round(state.manualOffset * 10)}"
                            oninput="VoiceReplayPlayer.setOffset(this.value)"
                        >
                        <span class="vr-control-value" id="vr-offset-val">${state.manualOffset >= 0 ? '+' : ''}${state.manualOffset.toFixed(1)}s</span>
                    </div>
                </div>
                <div class="vr-tracks-section">
                    ${playerRows}
                    ${botSection}
                </div>
                <div class="vr-add-more">
                    <label class="vr-add-more-btn">
                        + Add more files
                        <input
                            type="file"
                            id="vr-file-input-more"
                            multiple
                            accept=".ogg,.opus,.webm,.zip"
                            style="display: none;"
                        >
                    </label>
                </div>
            </div>
        `;
    }

    // ── Drop Zone Events ───────────────────────────────────────────────────

    function _attachDropEvents() {
        const dropzone = document.getElementById('vr-dropzone');
        const fileInput = document.getElementById('vr-file-input');
        if (!dropzone || !fileInput) return;

        // Prevent default drag behavior on the whole document
        // so dropping outside the zone doesn't navigate away
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('vr-dropzone-active');
        });

        dropzone.addEventListener('dragleave', (e) => {
            // Only deactivate if leaving the dropzone itself (not a child)
            if (!dropzone.contains(e.relatedTarget)) {
                dropzone.classList.remove('vr-dropzone-active');
            }
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('vr-dropzone-active');
            _handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                _handleFiles(fileInput.files);
            }
        });
    }

    /**
     * Route dropped/selected files to the appropriate loader.
     */
    async function _handleFiles(fileList) {
        const statusEl = document.getElementById('vr-drop-status');
        if (statusEl) statusEl.textContent = 'Loading\u2026';

        try {
            const files = Array.from(fileList);
            const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip'));

            let result;
            if (zipFile) {
                result = await VoiceReplayService.loadZip(zipFile);
            } else {
                result = await VoiceReplayService.loadFiles(files);
            }

            // Show errors for any failed files
            if (result.errors && result.errors.length > 0) {
                const names = result.errors.map(e => e.name).join(', ');
                console.warn(`Failed to load: ${names}`);
            }

            if (result.tracks && result.tracks.length > 0) {
                _tracksLoaded = true;
                _renderControls();
            } else if (statusEl) {
                statusEl.textContent = 'No playable audio files found';
            }
        } catch (err) {
            console.error('VoiceReplayPlayer: File loading error', err);
            if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        }
    }

    /**
     * Re-render the overlay controls (and remove bottom panel if present).
     */
    function _renderControls() {
        // Remove the bottom controls panel (drop zone) once tracks are loaded
        const controlsEl = document.getElementById('vr-controls');
        if (controlsEl) controlsEl.remove();

        // Add/update the overlay inside iframe-wrap
        const iframeWrap = document.querySelector('.vr-iframe-wrap');
        if (iframeWrap) {
            let overlay = document.getElementById('vr-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'vr-overlay';
                overlay.className = 'vr-overlay';
                iframeWrap.appendChild(overlay);
            }
            overlay.innerHTML = _renderOverlayControls();

            // Attach the "add more" file input event
            const moreInput = document.getElementById('vr-file-input-more');
            if (moreInput) {
                moreInput.addEventListener('change', () => {
                    if (moreInput.files.length > 0) {
                        _handleMoreFiles(moreInput.files);
                    }
                });
            }
        }
    }

    /**
     * Handle additional files added after initial load.
     */
    async function _handleMoreFiles(fileList) {
        try {
            const files = Array.from(fileList);
            const zipFile = files.find(f => f.name.toLowerCase().endsWith('.zip'));

            if (zipFile) {
                await VoiceReplayService.loadZip(zipFile);
            } else {
                await VoiceReplayService.loadFiles(files);
            }

            _renderControls();
        } catch (err) {
            console.error('VoiceReplayPlayer: Error adding more files', err);
        }
    }

    // ── Public Control Methods (called from inline handlers) ───────────────

    function setMasterVolume(val) {
        const vol = parseInt(val, 10) / 100;
        VoiceReplayService.setMasterVolume(vol);
    }

    function setTrackVolume(index, val) {
        const vol = parseInt(val, 10) / 100;
        VoiceReplayService.setTrackVolume(index, vol);
    }

    /**
     * Offset slider: range -100 to 100 maps to -10.0s to +10.0s (step 0.1).
     */
    function setOffset(val) {
        const seconds = parseInt(val, 10) / 10;
        VoiceReplayService.setManualOffset(seconds);
        const text = `${seconds >= 0 ? '+' : ''}${seconds.toFixed(1)}s`;
        const ovEl = document.getElementById('vr-ov-offset');
        if (ovEl) ovEl.textContent = text;
    }

    /**
     * Toggle mute on a single track.
     */
    function toggleTrackMute(index) {
        const tracks = VoiceReplayService.getTracks();
        if (index < 0 || index >= tracks.length) return;
        const t = tracks[index];

        if (t.volume > 0) {
            // Mute: store current volume, set to 0
            _preMuteVolumes[index] = t.volume;
            VoiceReplayService.setTrackVolume(index, 0);
        } else {
            // Unmute: restore previous volume (default 1.0)
            const restoreVol = _preMuteVolumes[index] || 1.0;
            delete _preMuteVolumes[index];
            VoiceReplayService.setTrackVolume(index, restoreVol);
        }

        // Re-render overlay to update icon + slider
        _renderControls();
    }

    /**
     * Toggle master mute.
     */
    function toggleMasterMute() {
        const state = VoiceReplayService.getState();

        if (state.masterVolume > 0) {
            _preMuteMasterVol = state.masterVolume;
            VoiceReplayService.setMasterVolume(0);
        } else {
            VoiceReplayService.setMasterVolume(_preMuteMasterVol || 0.8);
        }

        _renderControls();
    }

    // ── State Change Callback ──────────────────────────────────────────────

    function _onStateChange(state) {
        // Could update a play/pause indicator, speed display, etc.
        // For PoC, just log
    }

    // ── Cleanup ────────────────────────────────────────────────────────────

    function destroy() {
        VoiceReplayService.cleanup();
        if (_container) _container.innerHTML = '';
        _container = null;
        _tracksLoaded = false;
    }

    // ── Util ───────────────────────────────────────────────────────────────

    function _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    return {
        init,
        destroy,
        toggleFullscreen,
        setMasterVolume,
        setTrackVolume,
        setOffset,
        toggleTrackMute,
        toggleMasterMute,
        signInDiscord,
        signInGoogle
    };

})();
