/**
 * VoiceReplayService.js
 *
 * Audio sync engine for voice replay. Manages postMessage communication with
 * Hub demo player iframe, audio file loading (individual OGGs and zips),
 * time alignment, drift correction, and per-track volume control.
 *
 * Pattern: Revealing Module (pure logic, no DOM manipulation)
 * Dependencies: JSZip (loaded from CDN, optional for zip support)
 */
const VoiceReplayService = (function () {

    // ── State ──────────────────────────────────────────────────────────────

    let _tracks = [];            // [{ name, audio, objectUrl, volume }]
    let _masterVolume = 0.8;
    let _manualOffset = 1.0;     // seconds — default +1s compensates for audio element decode latency behind demo
    let _countdownDuration = 10; // from DemoInfo, updated on init
    let _isPlaying = false;
    let _currentSpeed = 1.0;
    let _messageHandler = null;  // stored reference for cleanup
    let _demoInfo = null;        // cached DemoInfo JSON
    let _onStateChange = null;   // callback for UI updates
    let _lastDemoTime = 0;       // last known demo elapsed time (for syncing newly loaded tracks)

    // ── Constants ──────────────────────────────────────────────────────────

    const HUB_ORIGIN = 'https://hub.quakeworld.nu';
    const DRIFT_THRESHOLD_S = 0.3;       // 300ms — only re-seek if drift exceeds this
    const AUDIO_EXTENSIONS = ['.ogg', '.opus', '.webm'];
    const DEMO_INFO_BASE = 'https://d.quake.world';

    // ── DemoInfo ───────────────────────────────────────────────────────────

    /**
     * Fetch DemoInfo JSON from d.quake.world CDN.
     * Returns countdown_duration, demo_duration, match_duration, map, teams, players.
     * Immutable data — safe to cache indefinitely.
     */
    async function fetchDemoInfo(demoSha256) {
        if (_demoInfo) return _demoInfo;

        try {
            const prefix = demoSha256.substring(0, 3);
            const url = `${DEMO_INFO_BASE}/${prefix}/${demoSha256}.mvd.info.json`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`DemoInfo fetch failed: ${response.status}`);
            _demoInfo = await response.json();
            return _demoInfo;
        } catch (err) {
            console.warn('VoiceReplayService: Failed to fetch DemoInfo, using defaults', err);
            return null;
        }
    }

    // ── Init / Cleanup ─────────────────────────────────────────────────────

    /**
     * Initialize the service. Fetches DemoInfo and attaches postMessage listener.
     * @param {string} demoSha256 - Demo hash for DemoInfo lookup
     * @param {Function} [onStateChange] - Called when playback state changes (for UI updates)
     * @returns {object} { countdownDuration, demoInfo }
     */
    async function init(demoSha256, onStateChange) {
        _onStateChange = onStateChange || null;

        // Fetch DemoInfo for countdown_duration
        const info = await fetchDemoInfo(demoSha256);
        if (info && typeof info.countdown_duration === 'number') {
            _countdownDuration = info.countdown_duration;
        } else {
            _countdownDuration = 10; // safe fallback
        }

        // Attach postMessage listener
        _messageHandler = _handleMessage.bind(null);
        window.addEventListener('message', _messageHandler);

        console.log(`VoiceReplayService: init — countdown=${_countdownDuration}s`);
        return { countdownDuration: _countdownDuration, demoInfo: info };
    }

    /**
     * Cleanup: pause all audio, revoke object URLs, remove listener.
     */
    function cleanup() {
        if (_messageHandler) {
            window.removeEventListener('message', _messageHandler);
            _messageHandler = null;
        }

        _tracks.forEach(track => {
            try { track.audio.pause(); } catch (e) { /* ignore */ }
            if (track.objectUrl) URL.revokeObjectURL(track.objectUrl);
        });

        _tracks = [];
        _isPlaying = false;
        _currentSpeed = 1.0;
        _demoInfo = null;
        _onStateChange = null;
        console.log('VoiceReplayService: cleanup');
    }

    // ── postMessage Handler ────────────────────────────────────────────────

    function _handleMessage(event) {
        // Origin validation — Hub iframe sends from this origin
        if (event.origin !== HUB_ORIGIN) {
            return;
        }

        const { key, value } = event.data || {};
        if (!key) return;

        switch (key) {
            case 'current_time':
                _handleCurrentTime(value);
                break;
            case 'seek':
                _handleSeek(value);
                break;
            case 'set_speed':
                _handleSetSpeed(value);
                break;
            case 'track':
                // POV change — no audio action needed, but log for debugging
                break;
        }
    }

    /**
     * Heartbeat: every ~100ms from demo player.
     * Calculate expected audio time, correct drift if needed.
     */
    function _handleCurrentTime(demoElapsedTime) {
        // Track latest demo time even if no tracks loaded yet —
        // used to sync newly loaded tracks to the right position
        const wasAdvancing = demoElapsedTime > _lastDemoTime;
        _lastDemoTime = demoElapsedTime;

        // Detect if demo is actually advancing or just sending the same time (paused)
        if (wasAdvancing) {
            if (!_isPlaying) {
                _isPlaying = true;
                _currentSpeed = 1.0;
            }
        } else {
            // Time not advancing — demo is paused, ensure audio is paused too
            if (_isPlaying) {
                _isPlaying = false;
                _tracks.forEach(t => { if (!t.audio.paused) t.audio.pause(); });
            }
            return; // Don't process further when paused
        }

        if (_tracks.length === 0) return;

        const audioTime = _calcAudioTime(demoElapsedTime);

        // If audioTime is negative (manual offset pushed it back), clamp to 0
        if (audioTime < 0) return;

        _tracks.forEach(track => {
            const drift = Math.abs(track.audio.currentTime - audioTime);

            // Only re-seek if drift exceeds threshold (avoids micro-seek jitter)
            if (drift > DRIFT_THRESHOLD_S) {
                track.audio.currentTime = audioTime;
            }

            // Ensure play state matches
            if (track.audio.paused && audioTime < track.audio.duration) {
                track.audio.play().catch(() => { /* autoplay blocked */ });
            }
        });
    }

    /**
     * User explicitly dragged the timeline — hard seek immediately.
     */
    function _handleSeek(seekTime) {
        if (_tracks.length === 0) return;

        const audioTime = _calcAudioTime(seekTime);

        _tracks.forEach(track => {
            if (audioTime < 0) {
                track.audio.pause();
                track.audio.currentTime = 0;
            } else {
                track.audio.currentTime = Math.min(audioTime, track.audio.duration || Infinity);
                if (_isPlaying && _currentSpeed > 0) {
                    track.audio.play().catch(() => {});
                }
            }
        });
    }

    /**
     * Playback speed changed. 0 = paused, 100 = normal, 200 = 2x.
     * Note: audio.playbackRate = 0 is INVALID in HTML5 Audio — must use pause().
     */
    function _handleSetSpeed(percentSpeed) {
        const speed = parseInt(percentSpeed, 10);

        if (speed === 0) {
            // Paused
            _isPlaying = false;
            _currentSpeed = 0;
            _tracks.forEach(t => t.audio.pause());
        } else {
            // Playing at speed
            _isPlaying = true;
            _currentSpeed = speed / 100;
            _tracks.forEach(track => {
                track.audio.playbackRate = _currentSpeed;
                if (track.audio.paused && track.audio.currentTime < (track.audio.duration || Infinity)) {
                    track.audio.play().catch(() => {});
                }
            });
        }

        if (_onStateChange) _onStateChange({ isPlaying: _isPlaying, speed: _currentSpeed });
    }

    // ── Time Alignment ─────────────────────────────────────────────────────

    /**
     * Core formula: convert demo elapsed time to audio time.
     *
     * Quad's pipeline slices audio from Hub timestamp (= demo start, countdown
     * included), so audio second 0 = demo second 0. No countdown subtraction.
     * The manualOffset lets users fine-tune if needed.
     */
    function _calcAudioTime(demoElapsedTime) {
        return demoElapsedTime + _manualOffset;
    }

    /**
     * Sync all tracks to the current demo position immediately.
     * Called after loading new tracks so they start at the right time.
     */
    function _syncTracksToDemo() {
        if (_tracks.length === 0 || _lastDemoTime === 0) return;

        const audioTime = _calcAudioTime(_lastDemoTime);
        if (audioTime < 0) return;

        console.log(`VoiceReplayService: syncing ${_tracks.length} tracks to demo time ${_lastDemoTime.toFixed(1)}s → audio ${audioTime.toFixed(1)}s`);

        _tracks.forEach(track => {
            track.audio.currentTime = Math.min(audioTime, track.audio.duration || Infinity);
            if (_isPlaying && _currentSpeed > 0) {
                track.audio.playbackRate = _currentSpeed;
                track.audio.play().catch(() => {});
            }
        });
    }

    // ── File Loading ───────────────────────────────────────────────────────

    /**
     * Load individual audio files (dropped or selected).
     * Filters to known audio extensions, creates <audio> elements.
     * @param {FileList|File[]} fileList
     * @returns {Promise<Array<{ name, index, duration }>>}
     */
    async function loadFiles(fileList) {
        const files = Array.from(fileList).filter(f =>
            AUDIO_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))
        );

        if (files.length === 0) {
            console.warn('VoiceReplayService: No audio files found in selection');
            return [];
        }

        const results = [];
        const errors = [];

        for (const file of files) {
            try {
                const track = await _createTrack(file.name, file);
                results.push({ name: track.name, index: _tracks.length - 1, duration: track.audio.duration });
            } catch (err) {
                errors.push({ name: file.name, error: err.message });
            }
        }

        if (errors.length > 0) {
            console.warn('VoiceReplayService: Failed to load some files:', errors);
        }

        // Immediately sync new tracks to current demo position
        _syncTracksToDemo();

        return { tracks: results, errors };
    }

    /**
     * Load a zip archive. Extracts OGGs, optionally reads metadata.json.
     * @param {File} zipFile
     * @returns {Promise<{ tracks, errors, metadata }>}
     */
    async function loadZip(zipFile) {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip not loaded — zip support unavailable');
        }

        const zip = await JSZip.loadAsync(zipFile);
        let metadata = null;

        // Try to read metadata.json (Quad pipeline format)
        const metadataEntry = zip.file(/metadata\.json$/i)[0];
        if (metadataEntry) {
            try {
                const metaText = await metadataEntry.async('string');
                metadata = JSON.parse(metaText);
            } catch (err) {
                console.warn('VoiceReplayService: Failed to parse metadata.json from zip', err);
            }
        }

        // Find all audio files (may be in root or audio/ subdirectory)
        const audioFiles = [];
        zip.forEach((relativePath, entry) => {
            if (entry.dir) return;
            if (AUDIO_EXTENSIONS.some(ext => relativePath.toLowerCase().endsWith(ext))) {
                audioFiles.push({ path: relativePath, entry });
            }
        });

        if (audioFiles.length === 0) {
            console.warn('VoiceReplayService: No audio files found in zip');
            return { tracks: [], errors: [], metadata };
        }

        const results = [];
        const errors = [];

        // Build name lookup from metadata if available
        const nameMap = _buildNameMap(metadata);

        for (const { path, entry } of audioFiles) {
            try {
                const blob = await entry.async('blob');
                // Use filename from path (last segment)
                const fileName = path.split('/').pop();
                const track = await _createTrack(fileName, blob, nameMap);
                results.push({ name: track.name, index: _tracks.length - 1, duration: track.audio.duration });
            } catch (err) {
                errors.push({ name: path, error: err.message });
            }
        }

        if (errors.length > 0) {
            console.warn('VoiceReplayService: Failed to load some files from zip:', errors);
        }

        // Immediately sync new tracks to current demo position
        _syncTracksToDemo();

        return { tracks: results, errors, metadata };
    }

    /**
     * Create a track from a file or blob.
     * @param {string} fileName - Original filename for name extraction
     * @param {File|Blob} source - Audio data
     * @param {Object} [nameMap] - Optional filename→displayName map from metadata
     * @returns {Promise<object>} Track object
     */
    function _createTrack(fileName, source, nameMap) {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(source);
            const audio = new Audio();
            audio.preload = 'auto';

            const name = _extractPlayerName(fileName, nameMap);

            const onReady = () => {
                audio.removeEventListener('canplay', onReady);
                audio.removeEventListener('error', onError);

                // Set initial volume
                audio.volume = 1.0 * _masterVolume;

                const track = { name, audio, objectUrl, volume: 1.0 };
                _tracks.push(track);
                resolve(track);
            };

            const onError = () => {
                audio.removeEventListener('canplay', onReady);
                audio.removeEventListener('error', onError);
                URL.revokeObjectURL(objectUrl);
                reject(new Error(`Browser cannot play ${fileName}`));
            };

            audio.addEventListener('canplay', onReady);
            audio.addEventListener('error', onError);
            audio.src = objectUrl;
        });
    }

    /**
     * Create a track from a direct URL (Firebase Storage download URL).
     * Unlike _createTrack which needs a Blob, this loads audio directly from URL,
     * bypassing CORS restrictions that affect fetch().
     */
    function _createTrackFromUrl(url, fileName, playerName) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.preload = 'auto';

            const name = playerName || _extractPlayerName(fileName);

            const onReady = () => {
                audio.removeEventListener('canplay', onReady);
                audio.removeEventListener('error', onError);
                audio.volume = 1.0 * _masterVolume;
                const track = { name, audio, objectUrl: null, volume: 1.0 };
                _tracks.push(track);
                resolve(track);
            };

            const onError = () => {
                audio.removeEventListener('canplay', onReady);
                audio.removeEventListener('error', onError);
                reject(new Error(`Failed to load audio: ${fileName}`));
            };

            audio.addEventListener('canplay', onReady);
            audio.addEventListener('error', onError);
            audio.src = url;
        });
    }

    /**
     * Extract player display name from filename.
     * Patterns:
     *   "paradoks.ogg" → "paradoks"
     *   "1-paradoks.ogg" → "paradoks" (strip track number prefix)
     *   "ParadokS.ogg" → "ParadokS" (preserve case)
     *
     * If nameMap is provided, look up the filename to get a richer display name.
     */
    function _extractPlayerName(fileName, nameMap) {
        // Strip extension
        const baseName = fileName.replace(/\.[^.]+$/, '');

        // Check nameMap first (from metadata.json)
        if (nameMap && nameMap[baseName]) {
            return nameMap[baseName];
        }
        if (nameMap && nameMap[fileName]) {
            return nameMap[fileName];
        }

        // Strip leading track number: "1-paradoks" → "paradoks"
        const stripped = baseName.replace(/^\d+-/, '');
        return stripped || baseName;
    }

    /**
     * Build a filename→displayName map from Quad's metadata.json.
     * metadata.players[].audioFile contains the full path;
     * we extract the filename portion and map to .name
     */
    function _buildNameMap(metadata) {
        if (!metadata || !Array.isArray(metadata.players)) return null;

        const map = {};
        metadata.players.forEach(p => {
            if (p.audioFile && p.name) {
                // audioFile might be a full path — extract filename
                const fileName = p.audioFile.split('/').pop();
                const baseName = fileName.replace(/\.[^.]+$/, '');
                map[baseName] = p.name;
                map[fileName] = p.name;
            }
        });
        return Object.keys(map).length > 0 ? map : null;
    }

    // ── Firebase Auto-Loading (Tier 3) ────────────────────────────────────

    /**
     * Auto-load voice recordings from Firebase Storage via Firestore manifest.
     * Returns structured result with status field for auth-aware error handling.
     * @param {string} demoSha256 - Demo hash (document ID in voiceRecordings collection)
     * @returns {Promise<{ status: 'loaded'|'not_found'|'auth_required'|'access_denied', ... }>}
     */
    async function loadFromFirestore(demoSha256) {
        if (!window.firebase || !window.firebase.db) {
            console.warn('VoiceReplayService: Firebase not initialized, skipping auto-load');
            return { status: 'not_found' };
        }

        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
        const docRef = doc(window.firebase.db, 'voiceRecordings', demoSha256);

        let snap;
        try {
            snap = await getDoc(docRef);
        } catch (err) {
            if (err.code === 'permission-denied') {
                const currentUser = window.firebase.auth?.currentUser;
                if (!currentUser) {
                    console.log('VoiceReplayService: Private recording, auth required');
                    return { status: 'auth_required' };
                } else {
                    console.log('VoiceReplayService: Private recording, access denied for', currentUser.uid);
                    return { status: 'access_denied' };
                }
            }
            throw err;
        }

        if (!snap.exists()) {
            console.log('VoiceReplayService: No voice recording found for', demoSha256);
            return { status: 'not_found' };
        }

        const recording = snap.data();
        console.log(`VoiceReplayService: Found ${recording.trackCount} tracks (source: ${recording.source})`);

        if (recording.source !== 'firebase_storage') {
            console.log('VoiceReplayService: Source is', recording.source, '— not handled yet');
            return { status: 'not_found' };
        }

        const { ref, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js');

        const results = [];
        const errors = [];

        for (const trackInfo of recording.tracks) {
            try {
                const storageRef = ref(window.firebase.storage, trackInfo.storagePath);
                const url = await getDownloadURL(storageRef);
                // Load audio directly from URL (avoids CORS issues with fetch)
                const track = await _createTrackFromUrl(url, trackInfo.fileName, trackInfo.playerName);
                results.push({ name: track.name, index: _tracks.length - 1, duration: track.audio.duration });
            } catch (err) {
                console.warn(`VoiceReplayService: Failed to load track ${trackInfo.playerName}:`, err);
                errors.push({ name: trackInfo.playerName, error: err.message });
            }
        }

        _syncTracksToDemo();

        return {
            status: 'loaded',
            tracks: results,
            errors,
            source: recording.source,
            trackCount: recording.trackCount,
            teamTag: recording.teamTag
        };
    }

    // ── Volume Control ─────────────────────────────────────────────────────

    /**
     * Set volume for a specific track. Effective volume = trackVol * masterVol.
     */
    function setTrackVolume(index, vol) {
        if (index < 0 || index >= _tracks.length) return;
        _tracks[index].volume = Math.max(0, Math.min(1, vol));
        _tracks[index].audio.volume = _tracks[index].volume * _masterVolume;
    }

    /**
     * Set master volume. Reapplies to all tracks.
     */
    function setMasterVolume(vol) {
        _masterVolume = Math.max(0, Math.min(1, vol));
        _tracks.forEach(track => {
            track.audio.volume = track.volume * _masterVolume;
        });
    }

    // ── Offset ─────────────────────────────────────────────────────────────

    /**
     * Set manual time offset (fine-tune slider). Range: -10 to +10 seconds.
     */
    function setManualOffset(seconds) {
        _manualOffset = Math.max(-10, Math.min(10, parseFloat(seconds) || 0));
    }

    // ── Getters ────────────────────────────────────────────────────────────

    function getTracks() {
        return _tracks.map((t, i) => ({
            name: t.name,
            index: i,
            duration: t.audio.duration || 0,
            volume: t.volume
        }));
    }

    function getState() {
        return {
            isPlaying: _isPlaying,
            currentSpeed: _currentSpeed,
            trackCount: _tracks.length,
            masterVolume: _masterVolume,
            manualOffset: _manualOffset,
            countdownDuration: _countdownDuration
        };
    }

    function getDemoInfo() {
        return _demoInfo;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    return {
        init,
        cleanup,
        fetchDemoInfo,
        loadFiles,
        loadZip,
        loadFromFirestore,
        setTrackVolume,
        setMasterVolume,
        setManualOffset,
        getTracks,
        getState,
        getDemoInfo
    };

})();
