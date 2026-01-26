# Slice 4.1: Logo Upload

## 1. Slice Definition

- **Slice ID:** 4.1
- **Name:** Logo Upload
- **User Story:** As a team leader, I can upload a custom logo for my team so that our team has visual identity throughout the app
- **Success Criteria:** Leader clicks "Manage Logo" → selects image → crops to square → uploads → sees logo appear in drawer (replacing team tag placeholder)

---

## 2. PRD Mapping

```
PRIMARY SECTIONS:
- 4.3.2 (Logo Management): File selection, cropping UI, upload progress, dedicated modal

DEPENDENT SECTIONS:
- 1.4 (Team Leader): Only leaders can manage logos
- 6.6 (Preserved UI Components): Logo upload system architecture, Cropper.js integration
- 6.7 (Modal Systems): Modal structure pattern for LogoUploadModal

IGNORED SECTIONS (for this slice):
- 4.3.2 (Logo Display locations): Handled in Slice 4.2
- Comparison view logo display: Slice 4.2
- Team browser logo display: Slice 4.2
```

---

## 3. Full Stack Architecture

### FRONTEND COMPONENTS

**LogoUploadModal (NEW)**
- Firebase listeners: None (modal is transient)
- Cache interactions: None (backend handles via Cloud Function)
- UI responsibilities:
  - File picker (accept images only)
  - Cropper.js interface for square crop
  - Upload progress indicator
  - Success/error states
- User actions:
  - Select file → Preview with crop area
  - Adjust crop → Confirm crop
  - Upload button → Progress → Success/Close

**TeamManagementDrawer (MODIFY)**
- Firebase listeners: Already has team listener (will auto-update when logo changes)
- Cache interactions: Reads from TeamService cache
- UI responsibilities:
  - Show current logo OR team tag placeholder
  - "Manage Logo" button opens LogoUploadModal
- User actions:
  - Click "Manage Logo" → Opens LogoUploadModal

### FRONTEND SERVICES

**LogoUploadService (NEW)**
- Methods:
  - `uploadLogo(teamId, userId, croppedBlob)` → Firebase Storage upload
  - No Cloud Function call needed (backend triggers on storage upload)

### BACKEND REQUIREMENTS

⚠️ **BACKEND ALREADY EXISTS** - `/functions/logo-processing.js`

- Cloud Functions:
  - `processLogoUpload` (Storage trigger - ALREADY IMPLEMENTED):
    - File: `/functions/logo-processing.js`
    - Trigger: `onObjectFinalized` for `logo-uploads/*` path
    - Purpose: Process uploaded image into 3 sizes, update Firestore
    - Validation: Verifies uploader is team leader
    - Operations:
      - Download temp file
      - Resize to 400px, 150px, 48px (square, cover fit)
      - Upload to `team-logos/{teamId}/{logoId}/`
      - Update `/teams/{teamId}` with `activeLogo` field
      - Archive previous logo in subcollection
      - Clean up temp files
    - Returns: N/A (Storage trigger, not HTTP callable)

- Function Exports Required:
  ```javascript
  // Already in /functions/index.js:
  exports.processLogoUpload = processLogoUpload;
  ```

- Firestore Operations:
  - Update `/teams/{teamId}`:
    ```javascript
    {
      activeLogo: {
        logoId: string,
        urls: { large: string, medium: string, small: string }
      }
    }
    ```
  - Create `/teams/{teamId}/logos/{logoId}`:
    ```javascript
    {
      status: 'active',
      uploadedBy: string,
      uploadedAt: Timestamp,
      urls: { large: string, medium: string, small: string }
    }
    ```

- Storage Rules (NEW - needs `storage.rules` file):
  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      // Temp uploads - authenticated users can write to their path
      match /logo-uploads/{teamId}/{userId}/{fileName} {
        allow write: if request.auth != null && request.auth.uid == userId;
        allow read: if false; // Only Cloud Function reads
      }

      // Processed logos - public read
      match /team-logos/{teamId}/{logoId}/{fileName} {
        allow read: if true;
        allow write: if false; // Only Cloud Function writes
      }
    }
  }
  ```

- Authentication/Authorization:
  - Frontend: Any authenticated user can attempt upload
  - Backend: Cloud Function verifies `userId === team.leaderId`
  - Unauthorized uploads are deleted by Cloud Function

- Event Logging:
  - Not required for logo uploads (per PRD 5.6 - not significant audit event)

- External Services:
  - Firebase Storage (already configured in index.html)
  - Cropper.js library (CDN - needs to be added)

### INTEGRATION POINTS

- Frontend → Backend: Storage upload to `logo-uploads/{teamId}/{userId}/{filename}`
  - NOT a Cloud Function call - direct Storage SDK upload
  - Cloud Function triggers automatically on file creation

- Real-time listeners:
  - TeamManagementDrawer already listens to `/teams/{teamId}`
  - When `activeLogo` field updates, drawer re-renders with logo

- Data flow:
  ```
  User selects file → Cropper.js crops → LogoUploadService.uploadLogo()
  → Firebase Storage (logo-uploads/) → Cloud Function triggers
  → Process & store → Update Firestore → TeamManagementDrawer listener fires
  → Logo displayed in drawer
  ```

---

## 4. Integration Code Examples

### Opening Modal from Drawer

```javascript
// In TeamManagementDrawer.js - Replace placeholder handler
function _handleManageLogo() {
    if (typeof LogoUploadModal !== 'undefined') {
        LogoUploadModal.show(_teamId, _userId);
    }
}
```

### LogoUploadModal Structure

```javascript
// public/js/components/LogoUploadModal.js
const LogoUploadModal = (function() {
    let _modalElement = null;
    let _cropper = null;
    let _teamId = null;
    let _userId = null;

    function show(teamId, userId) {
        _teamId = teamId;
        _userId = userId;
        _renderModal();
        _attachListeners();
    }

    function _renderModal() {
        const container = document.getElementById('modal-container');
        container.innerHTML = `
            <div class="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg">
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-xl font-bold text-primary">Upload Team Logo</h2>
                        <button id="logo-modal-close" class="text-muted-foreground hover:text-foreground text-2xl">&times;</button>
                    </div>
                    <div class="p-4">
                        <!-- File Selection State -->
                        <div id="logo-select-state">
                            <input type="file" id="logo-file-input" accept="image/*" class="hidden">
                            <button id="logo-select-btn" class="w-full py-8 border-2 border-dashed border-border rounded-lg hover:border-primary transition-colors">
                                <span class="text-muted-foreground">Click to select image</span>
                                <span class="block text-sm text-muted-foreground mt-1">Max 5MB, JPG/PNG/WebP</span>
                            </button>
                        </div>

                        <!-- Crop State -->
                        <div id="logo-crop-state" class="hidden">
                            <div class="w-full aspect-square bg-muted rounded-lg overflow-hidden">
                                <img id="logo-crop-image" class="max-w-full">
                            </div>
                            <p class="text-sm text-muted-foreground mt-2 text-center">Drag to adjust crop area</p>
                        </div>

                        <!-- Upload Progress State -->
                        <div id="logo-progress-state" class="hidden">
                            <div class="flex flex-col items-center py-8">
                                <div class="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p class="mt-4 text-muted-foreground">Uploading...</p>
                                <div class="w-full bg-muted rounded-full h-2 mt-4">
                                    <div id="logo-progress-bar" class="bg-primary h-2 rounded-full transition-all" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Success State -->
                        <div id="logo-success-state" class="hidden">
                            <div class="flex flex-col items-center py-8">
                                <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>
                                <p class="mt-4 text-foreground font-medium">Logo uploaded successfully!</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center justify-end p-4 border-t border-border gap-3">
                        <button id="logo-cancel-btn" class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button id="logo-upload-btn" class="px-4 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg transition-colors hidden">
                            Upload Logo
                        </button>
                    </div>
                </div>
            </div>
        `;
        _modalElement = container.firstElementChild;
    }

    // ... rest of implementation

    return { show, close, cleanup };
})();
```

### Upload to Firebase Storage

```javascript
// public/js/services/LogoUploadService.js
const LogoUploadService = (function() {

    async function uploadLogo(teamId, userId, croppedBlob, onProgress) {
        const { ref, uploadBytesResumable, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js');

        const storage = window.firebase.storage;
        const timestamp = Date.now();
        const fileName = `logo_${timestamp}.png`;
        const storagePath = `logo-uploads/${teamId}/${userId}/${fileName}`;

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
                    console.error('Upload failed:', error);
                    reject(error);
                },
                () => {
                    // Upload complete - Cloud Function will process
                    resolve({ success: true });
                }
            );
        });
    }

    return { uploadLogo };
})();
```

### Cropper.js Integration

```javascript
// Inside LogoUploadModal - when file is selected
function _handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        ToastService.showError('Image must be under 5MB');
        return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
        ToastService.showError('Please select an image file');
        return;
    }

    // Show crop state
    document.getElementById('logo-select-state').classList.add('hidden');
    document.getElementById('logo-crop-state').classList.remove('hidden');
    document.getElementById('logo-upload-btn').classList.remove('hidden');

    // Initialize Cropper.js
    const image = document.getElementById('logo-crop-image');
    image.src = URL.createObjectURL(file);

    image.onload = () => {
        if (_cropper) _cropper.destroy();
        _cropper = new Cropper(image, {
            aspectRatio: 1, // Square only
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.9,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false
        });
    };
}
```

### Getting Cropped Image as Blob

```javascript
// Inside LogoUploadModal - when upload button clicked
async function _handleUpload() {
    if (!_cropper) return;

    // Show progress state
    document.getElementById('logo-crop-state').classList.add('hidden');
    document.getElementById('logo-progress-state').classList.remove('hidden');
    document.getElementById('logo-upload-btn').classList.add('hidden');
    document.getElementById('logo-cancel-btn').classList.add('hidden');

    try {
        // Get cropped canvas and convert to blob
        const canvas = _cropper.getCroppedCanvas({
            width: 400,  // Output size
            height: 400,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });

        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png', 0.9);
        });

        // Upload
        await LogoUploadService.uploadLogo(_teamId, _userId, blob, (progress) => {
            document.getElementById('logo-progress-bar').style.width = `${progress}%`;
        });

        // Show success
        document.getElementById('logo-progress-state').classList.add('hidden');
        document.getElementById('logo-success-state').classList.remove('hidden');

        ToastService.showSuccess('Logo uploaded! Processing...');

        // Auto-close after delay
        setTimeout(() => close(), 2000);

    } catch (error) {
        console.error('Logo upload failed:', error);
        ToastService.showError('Upload failed - please try again');

        // Reset to crop state
        document.getElementById('logo-progress-state').classList.add('hidden');
        document.getElementById('logo-crop-state').classList.remove('hidden');
        document.getElementById('logo-upload-btn').classList.remove('hidden');
        document.getElementById('logo-cancel-btn').classList.remove('hidden');
    }
}
```

### Displaying Logo in Drawer

```javascript
// In TeamManagementDrawer.js - Update logo section rendering
function _renderLogoSection() {
    const logoUrl = _teamData.activeLogo?.urls?.medium;

    if (logoUrl) {
        return `
            <div class="drawer-row flex flex-col items-center gap-3">
                <img src="${logoUrl}" alt="${_teamData.teamName} logo"
                     class="w-32 h-32 rounded-lg object-cover border border-border">
                <button id="manage-logo-btn" class="px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors">
                    Change Logo
                </button>
            </div>
        `;
    } else {
        return `
            <div class="drawer-row flex flex-col items-center gap-3">
                <div class="w-32 h-32 bg-muted border border-border rounded-lg flex items-center justify-center">
                    <span class="text-2xl font-bold text-muted-foreground">${_teamData.teamTag}</span>
                </div>
                <button id="manage-logo-btn" class="px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors">
                    Manage Logo
                </button>
            </div>
        `;
    }
}
```

---

## 5. Performance Classification

```
HOT PATHS (<50ms):
- None for this slice (logo upload is inherently a cold operation)

COLD PATHS (<2s for upload, processing may take longer):
- File selection: Instant (browser native)
- Cropper initialization: <500ms (library load + render)
- Image upload: Depends on file size and network (show progress)
- Cloud Function processing: 2-5s (resize, upload 3 sizes, update Firestore)
- UI update via listener: <500ms after Firestore update

BACKEND PERFORMANCE:
- Cloud Function cold start: First logo upload may be slower (~3s)
- Sharp image processing: Efficient, handles 400px output quickly
- Storage operations: Parallel upload of 3 sizes
```

---

## 6. Data Flow Diagram

```
USER ACTION FLOW:
═══════════════════════════════════════════════════════════════════════════

1. OPEN MODAL
   Click "Manage Logo" → TeamManagementDrawer._handleManageLogo()
   → LogoUploadModal.show(teamId, userId)

2. SELECT & CROP
   Click file picker → Browser file dialog → File selected
   → _handleFileSelect() → Cropper.js initialized → User adjusts crop

3. UPLOAD
   Click "Upload Logo" → _handleUpload() → cropper.getCroppedCanvas()
   → canvas.toBlob() → LogoUploadService.uploadLogo()
   → Firebase Storage SDK (uploadBytesResumable)
   → File lands in: gs://bucket/logo-uploads/{teamId}/{userId}/logo_{ts}.png

4. BACKEND PROCESSING (Automatic)
   Storage trigger fires → processLogoUpload Cloud Function
   → Validate leader permission → Download to /tmp
   → Sharp resize (400px, 150px, 48px) → Upload to team-logos/
   → Get signed URLs → Update Firestore /teams/{teamId}/activeLogo
   → Archive old logo → Cleanup temp files

5. UI UPDATE (Automatic)
   Firestore update → onSnapshot in TeamManagementDrawer fires
   → _teamData.activeLogo now has URLs → _renderLogoSection()
   → Logo image displayed instead of team tag placeholder

═══════════════════════════════════════════════════════════════════════════

VISUAL FLOW:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ TeamManagement  │────▶│  LogoUpload     │────▶│  LogoUpload     │
│    Drawer       │     │     Modal       │     │    Service      │
│ (Manage Logo)   │     │ (File + Crop)   │     │ (Storage SDK)   │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │ Firebase Storage│
                                               │ logo-uploads/   │
                                               └────────┬────────┘
                                                        │
                                                        ▼ (trigger)
                                               ┌─────────────────┐
                                               │ processLogo     │
                                               │ Upload (CF)     │
                                               └────────┬────────┘
                                                        │
                           ┌────────────────────────────┴────────────────────────────┐
                           ▼                                                          ▼
                  ┌─────────────────┐                                       ┌─────────────────┐
                  │ Firebase Storage│                                       │    Firestore    │
                  │ team-logos/     │                                       │ /teams/{teamId} │
                  │ (processed)     │                                       │ .activeLogo     │
                  └─────────────────┘                                       └────────┬────────┘
                                                                                     │
                                                                                     ▼ (listener)
                                                                           ┌─────────────────┐
                                                                           │ TeamManagement  │
                                                                           │    Drawer       │
                                                                           │ (Logo displays) │
                                                                           └─────────────────┘
```

---

## 7. Test Scenarios

```
FRONTEND TESTS:
- [ ] "Manage Logo" button opens LogoUploadModal
- [ ] File picker accepts only image files
- [ ] Files over 5MB show error toast
- [ ] Cropper.js initializes with 1:1 aspect ratio
- [ ] Upload button appears after file selection
- [ ] Progress bar updates during upload
- [ ] Success state shows after upload completes
- [ ] Modal closes automatically after success
- [ ] Cancel button closes modal and cleans up cropper

BACKEND TESTS:
- [ ] Cloud Function triggers on logo-uploads/ path
- [ ] Non-image files are ignored
- [ ] Non-leader uploads are deleted
- [ ] Three sizes (400, 150, 48) are created
- [ ] Processed files land in team-logos/ path
- [ ] Firestore activeLogo field is updated
- [ ] Previous logo status changes to 'archived'
- [ ] Temporary files are cleaned up

INTEGRATION TESTS (CRITICAL):
- [ ] Upload completes → Firestore updates → Drawer shows logo
- [ ] Leader uploads → Success | Non-leader uploads → Deleted (no error shown)
- [ ] Network failure during upload → Error message → Can retry
- [ ] Large file (5MB) uploads successfully with progress
- [ ] Second upload replaces first → Old logo archived

END-TO-END TESTS:
- [ ] Leader opens drawer → Clicks Manage Logo → Selects file → Crops → Uploads → Logo appears in drawer
- [ ] Same flow with different image formats (JPG, PNG, WebP)
- [ ] Logo persists after page refresh
- [ ] Logo updates in real-time for other team members viewing drawer
```

---

## 8. Common Integration Pitfalls

- [ ] **Forgetting to add Storage emulator** to firebase.json
- [ ] **Missing storage.rules file** - uploads will fail without rules
- [ ] **Not adding Cropper.js CDN** to index.html
- [ ] **Not adding LogoUploadModal.js** to index.html script imports
- [ ] **Forgetting to destroy Cropper instance** on modal close (memory leak)
- [ ] **Not revoking object URL** after file selection (memory leak)
- [ ] **Upload succeeds but UI doesn't update** - Drawer must listen to team doc
- [ ] **Progress bar doesn't update** - must wire onProgress callback
- [ ] **Cancel during upload** - need to cancel uploadTask properly

---

## 9. Implementation Notes

### Dependencies to Add

**firebase.json** - Add storage emulator:
```json
{
  "emulators": {
    "storage": {
      "port": 9199,
      "host": "0.0.0.0"
    }
  }
}
```

**storage.rules** - Create new file in project root:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /logo-uploads/{teamId}/{userId}/{fileName} {
      allow write: if request.auth != null && request.auth.uid == userId;
      allow read: if false;
    }
    match /team-logos/{teamId}/{logoId}/{fileName} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

**public/index.html** - Add Cropper.js and new scripts:
```html
<!-- In <head> -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css">

<!-- Before </body> -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js"></script>
<script src="js/services/LogoUploadService.js"></script>
<script src="js/components/LogoUploadModal.js"></script>
```

**Connect Storage to Emulator** - In index.html Firebase init:
```javascript
if (isLocalDev) {
    const { connectStorageEmulator } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js');
    connectStorageEmulator(storage, 'localhost', 9199);
}
```

### Similar Patterns
- Modal structure: See ComparisonModal.js for reveal pattern
- Multi-state modal: See TransferLeadershipModal.js for state transitions
- File handling: Browser native APIs (FileReader, canvas, Blob)

### Gotchas
- Cropper.js must be initialized AFTER image loads (`image.onload`)
- Canvas `toBlob` is async - use Promise wrapper
- Storage emulator uses different port (9199) than other emulators
- Signed URLs from Cloud Function work in production but emulator may differ

---

## 10. Schema Updates Required

**Add to SCHEMA.md** under `/teams/{teamId}`:
```typescript
// Add to TeamDocument interface:
activeLogo?: {
  logoId: string;
  urls: {
    large: string;   // 400px - for large displays
    medium: string;  // 150px - for drawer, cards
    small: string;   // 48px - for badges, comparison view
  }
}
```

**Add new subcollection documentation**:
```typescript
// /teams/{teamId}/logos/{logoId}
interface LogoDocument {
  status: 'active' | 'archived';
  uploadedBy: string;     // userId who uploaded
  uploadedAt: Timestamp;
  urls: {
    large: string;
    medium: string;
    small: string;
  }
}
```

---

## Quality Checklist

- [x] Frontend AND backend requirements specified
- [x] All PRD requirements mapped (4.3.2 Logo Management)
- [x] Architecture follows cache + listener pattern
- [x] Hot/cold paths identified (all cold for this slice)
- [x] Test scenarios cover full stack
- [x] No anti-patterns present
- [x] Data flow complete (UI → Storage → CF → Firestore → Listener → UI)
- [x] Integration examples show actual code
- [x] Error handling specified (file validation, upload failure, retry)
- [x] Loading states defined (progress bar, success state)
- [x] Event logging checked (not required per PRD 5.6)
- [x] API contracts specified (Storage path structure)
- [x] Security rules documented (storage.rules)
