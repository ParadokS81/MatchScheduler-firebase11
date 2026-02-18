// RecordingDownloadService.js — Client-side zip downloads for voice recordings
// Uses JSZip (loaded via CDN) to create per-map and per-series zip archives

const RecordingDownloadService = {

    /**
     * Download a single map recording as a zip.
     * @param {Object} recording - voiceRecordings Firestore doc data (with .id)
     * @param {string} teamName - Our team display name
     */
    async downloadMap(recording, teamName) {
        const zip = new JSZip();

        const tracks = recording.tracks || [];
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            this._showProgress(`Downloading track ${i + 1}/${tracks.length}...`);

            const url = await this._getDownloadUrl(track.storagePath);
            const response = await fetch(url);
            const blob = await response.blob();

            zip.file(`${track.playerName}.ogg`, blob);
        }

        // Add manifest
        const manifest = this._buildManifest(recording, teamName);
        zip.file('manifest.json', JSON.stringify(manifest, null, 2));

        // Generate and download
        this._showProgress('Creating zip...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const fileName = this._mapZipName(recording);
        this._triggerDownload(zipBlob, fileName);
        this._showProgress(null);
    },

    /**
     * Download a full series as a zip of map zips.
     * @param {Array} recordings - Array of voiceRecordings docs for the series
     * @param {string} teamName - Our team display name
     */
    async downloadSeries(recordings, teamName) {
        const outerZip = new JSZip();

        for (let m = 0; m < recordings.length; m++) {
            const rec = recordings[m];
            this._showProgress(`Preparing map ${m + 1}/${recordings.length}: ${rec.mapName || 'unknown'}...`);

            const mapZip = new JSZip();
            const tracks = rec.tracks || [];

            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                this._showProgress(`Map ${m + 1}/${recordings.length}: track ${i + 1}/${tracks.length}...`);

                const url = await this._getDownloadUrl(track.storagePath);
                const response = await fetch(url);
                const blob = await response.blob();
                mapZip.file(`${track.playerName}.ogg`, blob);
            }

            const manifest = this._buildManifest(rec, teamName);
            mapZip.file('manifest.json', JSON.stringify(manifest, null, 2));

            const mapBlob = await mapZip.generateAsync({ type: 'blob' });
            const mapFileName = this._mapZipName(rec);
            outerZip.file(mapFileName, mapBlob);
        }

        this._showProgress('Creating series archive...');
        const seriesBlob = await outerZip.generateAsync({ type: 'blob' });
        const fileName = this._seriesZipName(recordings);
        this._triggerDownload(seriesBlob, fileName);
        this._showProgress(null);
    },

    // --- Helpers ---

    _buildManifest(recording, teamName) {
        return {
            version: 1,
            demoSha256: recording.id || recording.demoSha256,
            gameId: recording.gameId || null,
            map: recording.mapName,
            recordedAt: recording.recordedAt?.toDate?.()?.toISOString() || null,
            teams: {
                home: {
                    tag: recording.teamTag,
                    name: teamName,
                    frags: recording.teamFrags || 0,
                },
                away: {
                    tag: recording.opponentTag || 'unknown',
                    name: recording.opponentTag || 'unknown',
                    frags: recording.opponentFrags || 0,
                },
            },
            tracks: (recording.tracks || []).map(t => ({
                playerName: t.playerName,
                fileName: `${t.playerName}.ogg`,
                duration: t.duration || null,
            })),
            offset: 0,
        };
    },

    _mapZipName(recording) {
        const date = recording.recordedAt?.toDate?.();
        const dateStr = date ? date.toISOString().slice(0, 10) : 'unknown';
        const map = recording.mapName || 'unknown';
        const team = recording.teamTag || '';
        const opponent = recording.opponentTag || '';
        return opponent
            ? `${map}_${team}-vs-${opponent}_${dateStr}.zip`
            : `${map}_${team}_${dateStr}.zip`;
    },

    _seriesZipName(recordings) {
        const first = recordings[0];
        const date = first.recordedAt?.toDate?.();
        const dateStr = date ? date.toISOString().slice(0, 10) : 'unknown';
        const team = first.teamTag || '';
        const opponent = first.opponentTag || '';
        return opponent
            ? `${team}-vs-${opponent}_${dateStr}.zip`
            : `${team}_${dateStr}.zip`;
    },

    async _getDownloadUrl(storagePath) {
        const { ref, getDownloadURL } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js'
        );
        return getDownloadURL(ref(window.firebase.storage, storagePath));
    },

    _triggerDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    _showProgress(message) {
        window.dispatchEvent(new CustomEvent('download-progress', { detail: { message } }));
    },
};
