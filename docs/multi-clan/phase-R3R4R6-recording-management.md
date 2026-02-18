# Phase R3+R4+R6: Recording Management — MatchScheduler Side

## Context

The voice pipeline uploads per-map audio to Firebase Storage with Firestore manifests. Phase 5 added a basic recordings list in the team management modal (flat list, date + map + track count + visibility toggle). Now we replace that with a full recording management experience: series-grouped cards, deletion, downloads.

This phase depends on quad writing additional fields (Phase R1), but can start with the UI structure and Cloud Function independently. The full recording management contract is at the orchestrator level in `RECORDING-MANAGEMENT-CONTRACT.md`.

---

## R3: Recording Cards UI with Series Grouping

### Current State

The Recordings tab in `TeamManagementModal.js` shows a flat list:
```
14 Feb  dm2       4 tracks  Private [toggle]
14 Feb  phantombase  4 tracks  Private [toggle]
13 Feb  e1m2      4 tracks  Private [toggle]
```

### Target State

Series-grouped expandable cards:
```
┌────────────────────────────────────────────────────────────┐
│ 14 Feb  [logo] sr  vs  pol [logo]  1-2   🔒  ⬇  🗑  ▼    │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ 13 Feb  [logo] sr  vs  oeks [logo]  2-1  🔒  ⬇  🗑  ▼    │
│                                                            │
│   dm2         4 tracks   12-8   Public  [toggle] ⬇  🗑    │
│   e1m2        4 tracks   8-12  Private [toggle] ⬇  🗑    │
│   schloss     4 tracks   14-6   Public  [toggle] ⬇  🗑    │
└────────────────────────────────────────────────────────────┘
```

### Files to Modify

#### 1. `public/js/components/TeamManagementModal.js`

Replace the Recordings tab content rendering (the `_initRecordingsTab()` method and related recording list rendering).

**Firestore Query** — unchanged:
```javascript
query(
  collection(db, 'voiceRecordings'),
  where('teamId', '==', teamId),
  orderBy('recordedAt', 'desc')
)
```

**Series Grouping Logic** — new client-side function:

```javascript
function groupIntoSeries(recordings) {
  const groups = {};

  for (const rec of recordings) {
    // Group by sessionId + opponentTag
    // Fall back to single-recording groups for legacy docs without sessionId
    const key = rec.sessionId
      ? `${rec.sessionId}_${rec.opponentTag || 'unknown'}`
      : `legacy_${rec.demoSha256}`;

    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  }

  // Sort maps within each series by mapOrder (or recordedAt fallback)
  for (const series of Object.values(groups)) {
    series.sort((a, b) => (a.mapOrder ?? 0) - (b.mapOrder ?? 0));
  }

  // Sort series by date (newest first)
  return Object.values(groups)
    .sort((a, b) => b[0].recordedAt?.toMillis() - a[0].recordedAt?.toMillis());
}
```

**Series Card HTML Structure:**

```html
<!-- Collapsed series card -->
<div class="recording-series bg-surface rounded-lg border border-border mb-3">
  <!-- Series header (always visible, clickable to expand) -->
  <div class="series-header flex items-center justify-between p-3 cursor-pointer hover:bg-surface-hover rounded-lg">
    <div class="flex items-center gap-3">
      <span class="text-text-secondary text-sm">14 Feb</span>
      <!-- Team logo (from existing team data) -->
      <img src="..." class="w-5 h-5 rounded" alt="">
      <span class="font-medium text-text-primary">sr</span>
      <span class="text-text-secondary">vs</span>
      <span class="font-medium text-text-primary">pol</span>
      <!-- Opponent logo (if registered team, else skip) -->
      <img src="..." class="w-5 h-5 rounded" alt="">
      <span class="text-text-secondary text-sm">(1-2)</span>
    </div>
    <div class="flex items-center gap-2">
      <!-- Privacy toggle (series-level: sets all maps) — leader only -->
      <!-- Download button — all users -->
      <!-- Delete button — leader only -->
      <!-- Expand/collapse arrow -->
      <svg class="expand-arrow w-4 h-4 transition-transform">...</svg>
    </div>
  </div>

  <!-- Expanded per-map rows (hidden by default) -->
  <div class="series-maps hidden border-t border-border">
    <div class="map-row flex items-center justify-between px-3 py-2 hover:bg-surface-hover">
      <div class="flex items-center gap-3">
        <span class="font-medium text-text-primary text-sm">dm2</span>
        <span class="text-text-secondary text-xs">4 tracks</span>
        <span class="text-text-secondary text-xs">12-8</span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Per-map visibility toggle — leader only -->
        <!-- Per-map download button — all users -->
        <!-- Per-map delete button — leader only -->
      </div>
    </div>
    <!-- More map rows... -->
  </div>
</div>
```

**Expand/Collapse Behavior:**
- Click series header → toggle `.series-maps` visibility
- Rotate expand arrow (0deg collapsed, 180deg expanded)
- Remember expanded state in the component (no persistence needed)

**Series Score Calculation:**
```javascript
function getSeriesScore(maps) {
  let teamWins = 0, opponentWins = 0;
  for (const map of maps) {
    if ((map.teamFrags || 0) > (map.opponentFrags || 0)) teamWins++;
    else if ((map.opponentFrags || 0) > (map.teamFrags || 0)) opponentWins++;
    // Draws don't count
  }
  return { teamWins, opponentWins };
}
```

**Opponent Logo Lookup:**
To show the opponent's team logo, look up teams in Firestore by tag. This is a best-effort display enhancement — if the opponent isn't a registered team, show text only.

```javascript
// Query teams collection for opponent tag (case-insensitive match on teamTag)
// Cache the result to avoid repeated queries
// If found: show team logo from Firebase Storage (team-logos/{opponentTeamId}/)
// If not found: show text only (no logo placeholder)
```

**Visibility Controls — Access Check:**
- Leader: sees privacy toggles + delete buttons on both series and per-map level
- Roster member: sees download buttons only. No toggles, no delete.
- Check via existing `isLeader` flag already available in the modal context

**Series-Level Privacy Toggle:**
When toggled, calls `updateRecordingVisibility` for each map in the series. Show a loading state during the batch update. If any fail, show an error toast but don't revert the ones that succeeded.

**Legacy Recordings (no sessionId):**
Each appears as a standalone single-map "series" without opponent info:
```
14 Feb  sr  dm2  4 tracks  [toggle] [download] [delete]
```
No expand arrow needed (only one map).

### Styling Notes

- Use existing dark theme colors: `bg-surface`, `border-border`, `text-text-primary`, `text-text-secondary`
- Match the existing recording list's toggle switch style (already has smooth animation)
- Cards should feel similar to the match history rows elsewhere in the app
- Keep it compact — the modal has limited height

---

## R4: Delete Recording — Cloud Function + UI

### New Cloud Function: `deleteRecording`

#### `functions/team-operations.js`

Add a new callable Cloud Function following the exact same pattern as `updateRecordingVisibility` (same file, same auth/leader verification pattern):

```javascript
/**
 * Delete a voice recording:
 * 1. Delete all audio files from Firebase Storage
 * 2. Delete the Firestore voiceRecordings document
 * 3. Create a deletionRequest for quad to clean up local files
 */
exports.deleteRecording = functions
  .region('europe-west3')
  .https.onCall(async (data, context) => {
    // 1. Auth check (same as updateRecordingVisibility)
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { demoSha256 } = data;
    const userId = context.auth.uid;

    // 2. Validate input
    if (!demoSha256 || typeof demoSha256 !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'demoSha256 required');
    }

    // 3. Read the recording doc
    const recDoc = await db.collection('voiceRecordings').doc(demoSha256).get();
    if (!recDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Recording not found');
    }
    const recording = recDoc.data();

    // 4. Verify caller is team leader (same as updateRecordingVisibility)
    const teamId = recording.teamId;
    if (!teamId) {
      throw new functions.https.HttpsError('failed-precondition', 'Recording has no team association');
    }
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team not found');
    }
    if (teamDoc.data().leaderId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only team leaders can delete recordings');
    }

    // 5. Delete Storage files
    const bucket = admin.storage().bucket();
    const deletePromises = recording.tracks.map(track => {
      return bucket.file(track.storagePath).delete().catch(err => {
        // File may already be gone — log but don't fail
        console.warn(`Storage file not found (may already be deleted): ${track.storagePath}`);
      });
    });
    await Promise.all(deletePromises);

    // 6. Delete Firestore doc
    await db.collection('voiceRecordings').doc(demoSha256).delete();

    // 7. Create deletion request for quad
    await db.collection('deletionRequests').add({
      demoSha256,
      teamId,
      sessionId: recording.sessionId || '',
      mapName: recording.mapName || '',
      requestedBy: userId,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      completedAt: null,
      error: null,
    });

    console.log('Recording deleted:', { demoSha256, teamId, userId });
    return { success: true };
  });
```

#### `functions/index.js`

Export the new function:
```javascript
exports.deleteRecording = teamOperations.deleteRecording;
```

### Firestore Rules Update

#### `firestore.rules`

Add rules for the new `deletionRequests` collection:

```
match /deletionRequests/{requestId} {
  // Team leaders can read their own team's deletion requests
  allow read: if request.auth != null
    && resource.data.teamId in
       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teams;

  // All writes via Cloud Function or Admin SDK
  allow write: if false;
}
```

### UI Delete Flow

In `TeamManagementModal.js`, add delete handlers:

**Per-Map Delete:**
1. User clicks delete icon on a map row
2. Show confirmation modal:
   ```
   Delete recording?

   dm2 — 14 Feb 2026
   4 audio tracks will be permanently deleted.

   This cannot be undone.

   [Cancel]  [Delete]
   ```
3. On confirm: call `deleteRecording({ demoSha256 })`
4. On success: remove the map row from UI (or re-fetch if using a listener)
5. On error: show error toast

**Per-Series Delete:**
1. User clicks delete icon on a series header
2. Show confirmation modal:
   ```
   Delete all recordings in this series?

   sr vs pol — 14 Feb 2026
   3 maps will be permanently deleted:
     - dm2 (4 tracks)
     - e1m2 (4 tracks)
     - schloss (4 tracks)

   This cannot be undone.

   [Cancel]  [Delete All]
   ```
3. On confirm: call `deleteRecording` for each map in the series (sequentially or parallel)
4. Show progress: "Deleting 1/3..." → "Deleting 2/3..." → "Done"
5. On success: remove the entire series card from UI
6. On error: show error toast, re-fetch list to reflect partial state

**Confirmation Modal:**
Use the existing modal pattern in the codebase (if one exists for other destructive actions). If not, create a simple overlay modal with the same styling as TeamManagementModal. Dark background overlay + centered card.

---

## R6: Download Flow — JSZip

### Dependencies

Add JSZip to the project. Check if it's already available or add it:
- Option A: CDN script tag in `index.html` (simplest for vanilla JS project)
- Option B: npm install + bundle (if the project has a build step that supports it)

The project uses vanilla JS with no bundler — CDN is the right approach:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

Or use the ESM version if preferred:
```javascript
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
```

### manifest.json Schema

Included in each per-map zip for offline replay compatibility:

```json
{
  "version": 1,
  "demoSha256": "a1b2c3d4...",
  "gameId": 847291,
  "map": "dm2",
  "recordedAt": "2026-02-14T20:15:00.000Z",
  "teams": {
    "home": { "tag": "sr", "name": "Slackers", "frags": 312 },
    "away": { "tag": "pol", "name": "pol", "frags": 287 }
  },
  "tracks": [
    { "playerName": "ParadokS", "fileName": "ParadokS.ogg", "duration": 1205.3 },
    { "playerName": "razor", "fileName": "razor.ogg", "duration": 1205.3 }
  ],
  "offset": 0
}
```

Note: files in the zip use `playerName` (human-readable), not `discordUserId` (internal). The manifest maps names to filenames.

### Download Service

Create a new service or add to an existing utility file. Suggested: `public/js/services/RecordingDownloadService.js`

```javascript
/**
 * Handles downloading voice recordings as zip files.
 * Per-map: zip with audio tracks + manifest.json
 * Per-series: zip of map zips
 */

const RecordingDownloadService = {

  /**
   * Download a single map recording as a zip.
   * @param {Object} recording - voiceRecordings Firestore doc data
   * @param {string} teamName - Our team display name
   */
  async downloadMap(recording, teamName) {
    const zip = new JSZip();
    const statusCallback = this._showProgress;

    // Fetch all audio tracks
    for (let i = 0; i < recording.tracks.length; i++) {
      const track = recording.tracks[i];
      statusCallback(`Downloading track ${i + 1}/${recording.tracks.length}...`);

      const url = await this._getDownloadUrl(track.storagePath);
      const response = await fetch(url);
      const blob = await response.blob();

      // Use playerName for human-readable filenames in zip
      zip.file(`${track.playerName}.ogg`, blob);
    }

    // Add manifest
    const manifest = this._buildManifest(recording, teamName);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Generate and download
    statusCallback('Creating zip...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const fileName = this._mapZipName(recording);
    this._triggerDownload(zipBlob, fileName);
    statusCallback(null); // clear progress
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
      this._showProgress(`Preparing map ${m + 1}/${recordings.length}: ${rec.mapName}...`);

      const mapZip = new JSZip();

      // Fetch tracks
      for (let i = 0; i < rec.tracks.length; i++) {
        const track = rec.tracks[i];
        const url = await this._getDownloadUrl(track.storagePath);
        const response = await fetch(url);
        const blob = await response.blob();
        mapZip.file(`${track.playerName}.ogg`, blob);
      }

      // Add manifest
      const manifest = this._buildManifest(rec, teamName);
      mapZip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Add map zip to outer zip
      const mapBlob = await mapZip.generateAsync({ type: 'blob' });
      const mapFileName = this._mapZipName(rec);
      outerZip.file(mapFileName, mapBlob);
    }

    // Generate outer zip
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
      demoSha256: recording.demoSha256,
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
      tracks: recording.tracks.map(t => ({
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
    // Use Firebase Storage getDownloadURL
    const { getStorage, ref, getDownloadURL } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'
    );
    const storage = getStorage();
    return getDownloadURL(ref(storage, storagePath));
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
    // Show/hide a progress indicator in the UI
    // Implementation depends on where download buttons live
    // Simple approach: dispatch a custom event that the modal listens to
    window.dispatchEvent(new CustomEvent('download-progress', { detail: { message } }));
  },
};
```

### UI Integration

Add download buttons to the series cards and map rows (R3 UI). Wire them to `RecordingDownloadService`:

```javascript
// Per-map download button click
downloadMapBtn.addEventListener('click', async (e) => {
  e.stopPropagation(); // Don't toggle expand
  try {
    await RecordingDownloadService.downloadMap(recording, teamName);
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
});

// Per-series download button click
downloadSeriesBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    await RecordingDownloadService.downloadSeries(seriesMaps, teamName);
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
});
```

### Progress Indicator

Show a lightweight progress message near the download button or at the bottom of the recordings tab:
- "Downloading track 2/4..."
- "Creating zip..."
- "Preparing map 2/3: e1m2..."

Can be a simple text span that shows/hides. No need for a progress bar — the download is fast for 3-5 maps.

---

## Implementation Order

1. **R4 first** — Cloud Function is independent, no UI dependency. Deploy early so it's available.
2. **R3 second** — Main UI work. Can start before quad deploys R1 by using mock data or existing recordings.
3. **R6 last** — Downloads plug into the R3 UI.

Within R3, the suggested order:
1. Series grouping logic (pure function, easy to test)
2. Card HTML structure + expand/collapse
3. Wire up Firestore query + grouping
4. Privacy toggle integration (reuse existing `updateRecordingVisibility`)
5. Delete button + confirmation modal (uses R4 Cloud Function)
6. Download buttons (uses R6 service)

## Deployment

```bash
# After Cloud Function changes:
npm run deploy:functions

# After Firestore rules changes:
npm run deploy:rules

# After frontend changes:
npm run deploy:hosting

# Or all at once:
npm run deploy
```
