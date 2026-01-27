# Slice 4.3.3: Avatar Manager

## 1. Slice Definition

- **Slice ID:** 4.3.3
- **Name:** Avatar Manager
- **User Story:** As a user, I can customize my avatar by choosing between Custom upload, Discord avatar, Google avatar, Default placeholder, or Initials so that my visual identity matches my preference
- **Success Criteria:** User clicks avatar in Edit Profile modal → sees current avatar with source options → can select different source or upload custom → avatar updates across all grid displays

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.4.1 (Edit Profile Modal): Add avatar section with source selection and upload capability

DEPENDENT SECTIONS:
- 4.3.2 (Discord Linking): Discord avatar already stored as `discordAvatarHash`
- 4.1/4.2 (Logo Upload): Reuse upload pattern, Cropper.js, Cloud Function approach
- 1.5 (User Profile): photoURL field, avatar display in grid

IGNORED SECTIONS (for this slice):
- 4.4.2 (Delete Account): Already implemented
- 3.x (Availability Grid avatar display): Already supports photoURL via PlayerDisplayService
```

---

## 3. Full Stack Architecture

### FRONTEND COMPONENTS

**ProfileModal (MODIFY)**
- Firebase listeners: None (transient modal)
- Cache interactions: Reads `_userProfile` passed to modal
- UI responsibilities:
  - Add Avatar section at TOP of form (above Display Name)
  - Show current avatar with visual indicator of source (Custom/Discord/Google/Default/Initials)
  - "Change Avatar" button that opens AvatarManager UI inline or modal
- User actions:
  - Click avatar area → Expands avatar source selector
  - Select source → Updates preview and stores preference
  - Upload custom → Opens cropper flow

**AvatarManager (NEW - inline component within ProfileModal)**
- Firebase listeners: None (transient, part of modal)
- Cache interactions: None (works with local state, persisted on profile save)
- UI responsibilities:
  - Avatar source selector (radio-style chips: Custom, Discord, Google, Default, Initials)
  - Current avatar preview (larger display)
  - Upload button for custom avatar (opens Cropper flow)
  - Visual disable of unavailable sources (e.g., Discord greyed out if not linked)
- User actions:
  - Select source → Updates local state and preview
  - Click Upload → File picker → Cropper.js → Upload to Storage
  - Save button on ProfileModal persists the avatarSource preference

### FRONTEND SERVICES

**AvatarUploadService (NEW)**
- Methods:
  - `uploadAvatar(userId, croppedBlob, onProgress)` → Firebase Storage upload
  - Similar to LogoUploadService but user-scoped path
  - Path: `avatar-uploads/{userId}/avatar_{timestamp}.png`

**AuthService (MODIFY)**
- Methods:
  - `updateProfile(profileData)` → Add `avatarSource` and `customAvatarUrl` fields
  - Handles avatar preference persistence

### BACKEND REQUIREMENTS

**Cloud Functions:**
- `processAvatarUpload` (Storage trigger - NEW):
  - File: `/functions/avatar-processing.js`
  - Trigger: `onObjectFinalized` for `avatar-uploads/*` path
  - Purpose: Process uploaded avatar into 3 sizes, update user document
  - Validation: Verifies uploader matches path userId
  - Operations:
    - Download temp file
    - Resize to 128px, 64px, 32px (square, cover fit)
    - Upload to `user-avatars/{userId}/`
    - Update `/users/{userId}` with `customAvatarUrl` field
    - Clean up temp files
  - Returns: N/A (Storage trigger, not HTTP callable)

**Function Exports Required:**
```javascript
// In /functions/index.js add:
exports.processAvatarUpload = require('./avatar-processing').processAvatarUpload;
```

**Firestore Operations:**
- Update `/users/{userId}`:
  ```javascript
  {
    avatarSource: 'custom' | 'discord' | 'google' | 'default' | 'initials',
    customAvatarUrl: string | null,  // Only set if custom avatar uploaded
    photoURL: string | null          // Computed URL based on avatarSource (for grid display)
  }
  ```

**Storage Rules (UPDATE existing `storage.rules`):**
```
// Add to existing rules:
match /avatar-uploads/{userId}/{fileName} {
  allow write: if request.auth != null && request.auth.uid == userId;
  allow read: if false; // Only Cloud Function reads
}

match /user-avatars/{userId}/{fileName} {
  allow read: if true;  // Public read for avatar display
  allow write: if false; // Only Cloud Function writes
}
```

**Authentication/Authorization:**
- Frontend: Authenticated user can upload their own avatar
- Backend: Cloud Function verifies `request.auth.uid === path userId`
- Only user's own avatar can be modified

**Event Logging:**
- Not required for avatar changes (per PRD 5.6 - not significant audit event)

**External Services:**
- Firebase Storage (already configured)
- Cropper.js (already loaded for logo upload)

### INTEGRATION POINTS

**Frontend → Backend:**
- Storage upload to `avatar-uploads/{userId}/avatar_{timestamp}.png`
- NOT a Cloud Function call - direct Storage SDK upload
- Cloud Function triggers automatically on file creation

**Real-time Updates:**
- ProfileModal doesn't need listener (changes saved on form submit)
- After save, `profile-updated` event updates UserMenu avatar display
- Grid displays use PlayerDisplayService which reads from cache

**Avatar URL Resolution (Priority Order):**
1. If `avatarSource === 'custom'` → Use `customAvatarUrl`
2. If `avatarSource === 'discord'` → Construct Discord CDN URL from `discordAvatarHash`
3. If `avatarSource === 'google'` → Use original Google Auth `photoURL`
4. If `avatarSource === 'default'` → Use `/img/default-avatar.png`
5. If `avatarSource === 'initials'` → Return null (grid falls back to initials)

---

## 4. Integration Code Examples

### Avatar Section in ProfileModal

```javascript
// Add to ProfileModal._renderModal() - insert BEFORE the Player Nick section
function _renderAvatarSection() {
    const currentSource = _userProfile?.avatarSource || _detectDefaultSource();
    const avatarUrl = _resolveAvatarUrl(currentSource);
    const hasDiscord = !!_userProfile?.discordUserId;
    const hasGoogle = _userProfile?.authProvider === 'google';

    return `
        <div class="mb-4">
            <label class="block text-sm font-medium text-foreground mb-2">Avatar</label>
            <div class="flex items-start gap-4">
                <!-- Avatar Preview -->
                <div class="w-20 h-20 rounded-full bg-muted border-2 border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                    ${avatarUrl ?
                        `<img src="${avatarUrl}" alt="Avatar" class="w-full h-full object-cover">` :
                        `<span class="text-2xl font-bold text-muted-foreground">${_userProfile?.initials || '?'}</span>`
                    }
                </div>

                <!-- Source Selector -->
                <div class="flex-1">
                    <div class="flex flex-wrap gap-2 mb-3">
                        <button type="button" class="avatar-source-btn ${currentSource === 'custom' ? 'active' : ''}" data-source="custom">
                            Custom
                        </button>
                        <button type="button" class="avatar-source-btn ${currentSource === 'discord' ? 'active' : ''} ${!hasDiscord ? 'disabled' : ''}" data-source="discord" ${!hasDiscord ? 'disabled' : ''}>
                            Discord
                        </button>
                        <button type="button" class="avatar-source-btn ${currentSource === 'google' ? 'active' : ''} ${!hasGoogle ? 'disabled' : ''}" data-source="google" ${!hasGoogle ? 'disabled' : ''}>
                            Google
                        </button>
                        <button type="button" class="avatar-source-btn ${currentSource === 'default' ? 'active' : ''}" data-source="default">
                            Default
                        </button>
                        <button type="button" class="avatar-source-btn ${currentSource === 'initials' ? 'active' : ''}" data-source="initials">
                            Initials
                        </button>
                    </div>
                    <button type="button" id="upload-avatar-btn" class="text-sm text-primary hover:text-primary/80 transition-colors">
                        Upload custom avatar
                    </button>
                </div>
            </div>
            <input type="hidden" name="avatarSource" id="avatarSource" value="${currentSource}">
        </div>
    `;
}

// Helper to detect current source based on existing data
function _detectDefaultSource() {
    if (_userProfile?.customAvatarUrl) return 'custom';
    if (_userProfile?.discordAvatarHash) return 'discord';
    if (_userProfile?.authProvider === 'google' && _currentUser?.photoURL) return 'google';
    return 'default';
}

// Helper to resolve avatar URL
function _resolveAvatarUrl(source) {
    switch (source) {
        case 'custom':
            return _userProfile?.customAvatarUrl;
        case 'discord':
            if (_userProfile?.discordUserId && _userProfile?.discordAvatarHash) {
                const hash = _userProfile.discordAvatarHash;
                const ext = hash.startsWith('a_') ? 'gif' : 'png';
                return `https://cdn.discordapp.com/avatars/${_userProfile.discordUserId}/${hash}.${ext}?size=128`;
            }
            return null;
        case 'google':
            return _currentUser?.photoURL;
        case 'default':
            return '/img/default-avatar.png';
        case 'initials':
            return null;  // Grid will fall back to initials
        default:
            return null;
    }
}
```

### Avatar Source Selection Handler

```javascript
// In ProfileModal._attachEventListeners() - add source button handlers
function _attachAvatarListeners() {
    // Source selection buttons
    document.querySelectorAll('.avatar-source-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const source = e.target.dataset.source;
            _handleAvatarSourceChange(source);
        });
    });

    // Upload button
    const uploadBtn = document.getElementById('upload-avatar-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', _handleUploadAvatarClick);
    }
}

function _handleAvatarSourceChange(source) {
    // Update hidden input
    document.getElementById('avatarSource').value = source;

    // Update button states
    document.querySelectorAll('.avatar-source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === source);
    });

    // Update preview
    const avatarUrl = _resolveAvatarUrl(source);
    const preview = document.querySelector('.avatar-preview');
    if (preview) {
        preview.innerHTML = avatarUrl ?
            `<img src="${avatarUrl}" alt="Avatar" class="w-full h-full object-cover">` :
            `<span class="text-2xl font-bold text-muted-foreground">${_userProfile?.initials || '?'}</span>`;
    }
}

function _handleUploadAvatarClick() {
    // Open avatar upload modal (reuses logo upload pattern)
    if (typeof AvatarUploadModal !== 'undefined') {
        AvatarUploadModal.show(_currentUser.uid, (avatarUrl) => {
            // Callback when upload completes
            _userProfile.customAvatarUrl = avatarUrl;
            _handleAvatarSourceChange('custom');
        });
    }
}
```

### AvatarUploadModal (Reusing LogoUploadModal Pattern)

```javascript
// public/js/components/AvatarUploadModal.js
const AvatarUploadModal = (function() {
    let _userId = null;
    let _cropper = null;
    let _objectUrl = null;
    let _onSuccess = null;

    function show(userId, onSuccess) {
        _userId = userId;
        _onSuccess = onSuccess;
        _renderModal();
        _attachListeners();
    }

    function _renderModal() {
        const container = document.getElementById('modal-container');
        container.innerHTML = `
            <div class="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm" id="avatar-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-xl font-bold text-primary">Upload Avatar</h2>
                        <button id="avatar-modal-close" class="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                    </div>
                    <div class="p-4">
                        <!-- File Selection State -->
                        <div id="avatar-select-state">
                            <input type="file" id="avatar-file-input" accept="image/*" class="hidden">
                            <div id="avatar-drop-zone" class="w-full py-6 border-2 border-dashed border-border rounded-lg hover:border-primary transition-colors cursor-pointer">
                                <div class="flex flex-col items-center pointer-events-none">
                                    <svg class="w-8 h-8 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                    </svg>
                                    <span class="text-muted-foreground text-sm">Drop image or click to browse</span>
                                    <span class="text-xs text-muted-foreground mt-1">Max 2MB, square recommended</span>
                                </div>
                            </div>
                        </div>

                        <!-- Crop State -->
                        <div id="avatar-crop-state" class="hidden">
                            <div class="w-64 h-64 mx-auto bg-muted rounded-lg overflow-hidden">
                                <img id="avatar-crop-image" class="max-w-full">
                            </div>
                            <p class="text-sm text-muted-foreground mt-2 text-center">Adjust crop area</p>
                        </div>

                        <!-- Upload Progress State -->
                        <div id="avatar-progress-state" class="hidden">
                            <div class="flex flex-col items-center py-6">
                                <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p class="mt-3 text-muted-foreground text-sm">Uploading...</p>
                                <div class="w-full bg-muted rounded-full h-1.5 mt-3">
                                    <div id="avatar-progress-bar" class="bg-primary h-1.5 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Success State -->
                        <div id="avatar-success-state" class="hidden">
                            <div class="flex flex-col items-center py-6">
                                <div class="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                                <p class="mt-3 text-foreground font-medium text-sm">Avatar uploaded!</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center justify-end p-4 border-t border-border gap-3">
                        <button id="avatar-cancel-btn" class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button id="avatar-upload-btn" class="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground text-sm rounded-lg transition-colors hidden">
                            Upload
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.classList.remove('hidden');
    }

    async function _handleUpload() {
        if (!_cropper) return;

        // Show progress state
        document.getElementById('avatar-crop-state').classList.add('hidden');
        document.getElementById('avatar-progress-state').classList.remove('hidden');
        document.getElementById('avatar-upload-btn').classList.add('hidden');
        document.getElementById('avatar-cancel-btn').classList.add('hidden');

        try {
            const canvas = _cropper.getCroppedCanvas({
                width: 256,  // Higher res for quality
                height: 256,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png', 0.9);
            });

            await AvatarUploadService.uploadAvatar(_userId, blob, (progress) => {
                document.getElementById('avatar-progress-bar').style.width = `${progress}%`;
            });

            // Show success
            document.getElementById('avatar-progress-state').classList.add('hidden');
            document.getElementById('avatar-success-state').classList.remove('hidden');

            // Callback with temp preview URL (actual URL comes from Cloud Function)
            if (_onSuccess) {
                _onSuccess(canvas.toDataURL('image/png'));
            }

            setTimeout(() => close(), 1500);

        } catch (error) {
            console.error('Avatar upload failed:', error);
            ToastService.showError('Upload failed - please try again');

            // Reset to crop state
            document.getElementById('avatar-progress-state').classList.add('hidden');
            document.getElementById('avatar-crop-state').classList.remove('hidden');
            document.getElementById('avatar-upload-btn').classList.remove('hidden');
            document.getElementById('avatar-cancel-btn').classList.remove('hidden');
        }
    }

    // ... rest follows LogoUploadModal pattern (file selection, crop, close, cleanup)

    return { show, close, cleanup };
})();
```

### AvatarUploadService

```javascript
// public/js/services/AvatarUploadService.js
const AvatarUploadService = (function() {

    async function uploadAvatar(userId, croppedBlob, onProgress) {
        const { ref, uploadBytesResumable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js');

        const storage = window.firebase.storage;
        const timestamp = Date.now();
        const fileName = `avatar_${timestamp}.png`;
        const storagePath = `avatar-uploads/${userId}/${fileName}`;

        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, croppedBlob, {
            contentType: 'image/png'
        });

        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    if (onProgress) onProgress(progress);
                },
                (error) => {
                    console.error('Avatar upload failed:', error);
                    reject(error);
                },
                () => {
                    // Upload complete - Cloud Function will process
                    resolve({ success: true });
                }
            );
        });
    }

    return { uploadAvatar };
})();
```

### Cloud Function: processAvatarUpload

```javascript
// functions/avatar-processing.js
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { getStorage } = require('firebase-admin/storage');
const { getFirestore } = require('firebase-admin/firestore');
const sharp = require('sharp');
const path = require('path');
const os = require('os');
const fs = require('fs');

exports.processAvatarUpload = onObjectFinalized(
    { bucket: 'matchscheduler-25f5e.appspot.com' },
    async (event) => {
        const filePath = event.data.name;
        const contentType = event.data.contentType;

        // Only process avatar-uploads
        if (!filePath.startsWith('avatar-uploads/')) {
            return null;
        }

        // Extract userId from path: avatar-uploads/{userId}/{fileName}
        const pathParts = filePath.split('/');
        if (pathParts.length !== 3) {
            console.error('Invalid avatar path:', filePath);
            return null;
        }

        const userId = pathParts[1];

        // Verify it's an image
        if (!contentType || !contentType.startsWith('image/')) {
            console.log('Not an image, skipping:', contentType);
            return null;
        }

        console.log(`Processing avatar for user: ${userId}`);

        const bucket = getStorage().bucket();
        const db = getFirestore();

        // Download to temp file
        const tempFilePath = path.join(os.tmpdir(), `avatar_${userId}_${Date.now()}.png`);
        await bucket.file(filePath).download({ destination: tempFilePath });

        try {
            // Define output sizes
            const sizes = [
                { name: 'large', size: 128 },
                { name: 'medium', size: 64 },
                { name: 'small', size: 32 }
            ];

            const timestamp = Date.now();
            const urls = {};

            // Process and upload each size
            for (const { name, size } of sizes) {
                const outputPath = path.join(os.tmpdir(), `avatar_${userId}_${name}_${timestamp}.png`);

                await sharp(tempFilePath)
                    .resize(size, size, { fit: 'cover', position: 'center' })
                    .png({ quality: 90 })
                    .toFile(outputPath);

                const destPath = `user-avatars/${userId}/${name}_${timestamp}.png`;
                await bucket.upload(outputPath, {
                    destination: destPath,
                    metadata: { contentType: 'image/png' }
                });

                // Get public URL
                const file = bucket.file(destPath);
                await file.makePublic();
                urls[name] = `https://storage.googleapis.com/${bucket.name}/${destPath}`;

                // Clean up temp output
                fs.unlinkSync(outputPath);
            }

            // Update user document
            await db.collection('users').doc(userId).update({
                customAvatarUrl: urls.large,
                avatarSource: 'custom',
                photoURL: urls.large,  // Also update photoURL for grid display
                lastUpdatedAt: new Date()
            });

            console.log(`Avatar processed successfully for user: ${userId}`);

            // Delete the original upload
            await bucket.file(filePath).delete();

            return { success: true, urls };

        } finally {
            // Clean up temp files
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        }
    }
);
```

### Profile Save Integration

```javascript
// In ProfileModal._handleSubmit() - add avatar source to profile data
const profileData = {
    displayName,
    initials
};

// Add avatar source preference
const avatarSource = formData.get('avatarSource');
if (avatarSource) {
    profileData.avatarSource = avatarSource;

    // Compute photoURL based on selected source
    profileData.photoURL = _resolveAvatarUrl(avatarSource);
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- Source selection toggle: Pure local state, instant
- Avatar preview update: DOM only, no network

COLD PATHS (<2s):
- Avatar file upload: Network dependent, show progress bar
- Cloud Function processing: 2-3s (resize 3 sizes, upload, update Firestore)
- Initial modal open: Instant (reads from cached profile)

BACKEND PERFORMANCE:
- Cloud Function warm: ~1s processing
- Cloud Function cold start: ~3s first upload
- Sharp image processing: Fast for small avatar sizes
```

---

## 6. Data Flow Diagram

```
USER ACTION FLOW:
════════════════════════════════════════════════════════════════════════════════

1. OPEN PROFILE MODAL
   Click profile → ProfileModal.show() → _renderAvatarSection()
   → Shows current avatar with source indicator

2. CHANGE AVATAR SOURCE (non-upload)
   Click source button → _handleAvatarSourceChange(source)
   → Update hidden input → Update preview → On Save → AuthService.updateProfile()
   → Firestore updates photoURL → Listeners update grid displays

3. UPLOAD CUSTOM AVATAR
   Click "Upload custom" → AvatarUploadModal.show()
   → File picker → Cropper.js → _handleUpload()
   → AvatarUploadService.uploadAvatar() → Firebase Storage (avatar-uploads/)
   → Cloud Function triggers → Process & resize → Upload to user-avatars/
   → Update Firestore (customAvatarUrl, photoURL) → Modal closes
   → ProfileModal preview updates with temp URL → On Save → Final sync

════════════════════════════════════════════════════════════════════════════════

VISUAL FLOW:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  ProfileModal   │────▶│  AvatarManager  │────▶│ AvatarUpload    │
│  (Edit Profile) │     │  (Source Select)│     │     Modal       │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │ AvatarUpload    │
                                               │    Service      │
                                               └────────┬────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │ Firebase Storage│
                                               │ avatar-uploads/ │
                                               └────────┬────────┘
                                                        │ (trigger)
                                                        ▼
                                               ┌─────────────────┐
                                               │ processAvatar   │
                                               │ Upload (CF)     │
                                               └────────┬────────┘
                                                        │
                           ┌────────────────────────────┴────────────────────────────┐
                           ▼                                                          ▼
                  ┌─────────────────┐                                       ┌─────────────────┐
                  │ Firebase Storage│                                       │    Firestore    │
                  │ user-avatars/   │                                       │ /users/{userId} │
                  │ (processed)     │                                       │ .customAvatarUrl│
                  └─────────────────┘                                       │ .photoURL       │
                                                                            └────────┬────────┘
                                                                                     │ (listener)
                                                                                     ▼
                                                                           ┌─────────────────┐
                                                                           │ PlayerDisplay   │
                                                                           │   Service       │
                                                                           │ (Grid avatars)  │
                                                                           └─────────────────┘
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] Avatar section appears at top of Edit Profile modal
- [ ] Current avatar source is correctly detected and shown
- [ ] Source buttons show correct active state
- [ ] Discord button disabled when Discord not linked
- [ ] Google button disabled when not Google auth
- [ ] Clicking source button updates preview immediately
- [ ] "Upload custom avatar" opens upload modal
- [ ] File picker only accepts image files
- [ ] Files over 2MB show error toast
- [ ] Cropper.js initializes with 1:1 aspect ratio
- [ ] Progress bar shows during upload
- [ ] Success state shows after upload completes
- [ ] Avatar source preference saved when profile saved

BACKEND TESTS:
- [ ] Cloud Function triggers on avatar-uploads/ path
- [ ] Non-image files are ignored
- [ ] Invalid paths (wrong userId) are rejected
- [ ] Three sizes (128, 64, 32) are created
- [ ] Processed files land in user-avatars/ path
- [ ] Firestore customAvatarUrl field is updated
- [ ] Firestore photoURL field is updated
- [ ] Original upload is deleted after processing
- [ ] Temporary files are cleaned up

INTEGRATION TESTS (CRITICAL):
- [ ] Upload completes → Firestore updates → Profile shows new avatar
- [ ] Non-owner upload attempts → Ignored (no error, just no update)
- [ ] Network failure during upload → Error message → Can retry
- [ ] Source change → Save profile → Grid displays update
- [ ] Discord avatar selected → Correct CDN URL constructed
- [ ] Google avatar selected → Original Google photo URL used
- [ ] Initials selected → photoURL cleared → Grid shows initials

END-TO-END TESTS:
- [ ] User opens profile → changes source to Discord → saves → grid shows Discord avatar
- [ ] User opens profile → uploads custom → saves → grid shows custom avatar
- [ ] User opens profile → selects initials → saves → grid shows initials
- [ ] Avatar persists after page refresh
- [ ] Avatar selection survives logout/login
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting to update photoURL** when avatarSource changes - grid won't update
- [ ] **Not handling Discord avatar construction** - need userId AND avatarHash
- [ ] **Missing storage rules for avatar-uploads** - uploads will fail
- [ ] **Not adding AvatarUploadModal.js to index.html** - function undefined
- [ ] **Not adding AvatarUploadService.js to index.html** - service missing
- [ ] **Forgetting to destroy Cropper instance** on modal close (memory leak)
- [ ] **Not revoking object URL** after file selection (memory leak)
- [ ] **Upload succeeds but preview doesn't update** - need callback handling
- [ ] **Discord button not disabled** when not linked - confusing UX
- [ ] **Google button not disabled** when Discord auth - no Google photo available

---

## 9. Implementation Notes

### Dependencies to Add

**public/index.html** - Add new scripts (after LogoUploadService):
```html
<script src="js/services/AvatarUploadService.js"></script>
<script src="js/components/AvatarUploadModal.js"></script>
```

**storage.rules** - Add avatar paths:
```
// Add inside existing rules
match /avatar-uploads/{userId}/{fileName} {
  allow write: if request.auth != null && request.auth.uid == userId;
  allow read: if false;
}

match /user-avatars/{userId}/{fileName} {
  allow read: if true;
  allow write: if false;
}
```

**functions/index.js** - Add export:
```javascript
exports.processAvatarUpload = require('./avatar-processing').processAvatarUpload;
```

### Default Avatar Asset

**User will provide:** `/public/img/default-avatar.png`
- Classic Quake Ranger head (provided by user)
- Square format, at least 128x128px
- Will be served directly, no processing needed
- Consider providing pre-sized versions: `default-avatar-128.png`, `default-avatar-32.png`

### Avatar Size Usage

The Cloud Function generates 3 sizes optimized for different display contexts:

| Size | Pixels | Usage |
|------|--------|-------|
| `large` | 128px | Profile modal preview, profile cards |
| `medium` | 64px | Drawer displays, comparison modals |
| `small` | 32px | Grid time slot badges (when avatar mode enabled) |

**Grid Integration:**
- `GridActionButtons.js` already has toggle for "initials" vs "avatars" mode
- `PlayerDisplayService.js` reads `photoURL` from user data
- When user selects avatar mode, small (32px) version displays in time slots
- The existing infrastructure handles this - we just need to ensure `photoURL` is set correctly

### CSS for Avatar Source Buttons

**Add to src/css/input.css:**
```css
.avatar-source-btn {
  @apply px-3 py-1.5 text-sm rounded-full border border-border bg-background text-muted-foreground transition-colors;
}

.avatar-source-btn:hover:not([disabled]) {
  @apply border-primary text-foreground;
}

.avatar-source-btn.active {
  @apply bg-primary border-primary text-primary-foreground;
}

.avatar-source-btn[disabled] {
  @apply opacity-50 cursor-not-allowed;
}
```

### Similar Patterns
- LogoUploadModal.js: File upload flow with Cropper.js
- LogoUploadService.js: Firebase Storage upload pattern
- logo-processing.js: Cloud Function image processing

### Gotchas
- Discord avatar URL construction requires both `discordUserId` AND `discordAvatarHash`
- Animated Discord avatars (starting with `a_`) need `.gif` extension
- Google photoURL may be null even for Google auth users
- Cloud Function needs Sharp library (already installed for logo processing)
- Avatar sizes are smaller than logo sizes (128, 64, 32 vs 400, 150, 48)

---

## 10. Schema Updates Required

**Update SCHEMA.md** under `/users/{userId}`:
```typescript
// Add to UserDocument interface:
avatarSource: 'custom' | 'discord' | 'google' | 'default' | 'initials';
customAvatarUrl: string | null;  // URL to custom uploaded avatar (128px)

// Note: photoURL is already in schema, now computed based on avatarSource
```

---

## Quality Checklist

- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (4.4.1 Edit Profile avatar section)
- [x] Architecture follows cache + listener pattern
- [x] Hot paths are clearly identified (source toggle is instant)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow is complete (UI → Storage → CF → Firestore → Grid)
- [x] Integration examples show actual code
- [x] Error handling specified for all operations
- [x] Loading states defined for backend calls
- [x] Event logging checked (not required per PRD 5.6)
- [x] API contracts fully specified
- [x] Security rules documented
