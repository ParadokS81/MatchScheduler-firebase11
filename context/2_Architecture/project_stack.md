# MatchScheduler Stack Overview & Technical Reference

**Last Updated:** July 2025  
**Purpose:** Complete technical reference for development, troubleshooting, and AI assistance

## 🎯 Project Overview

**Project Name:** MatchScheduler  
**Version:** 3.0 (Firebase v11 implementation)  
**Primary Goal:** Gaming team match scheduling without Discord chaos

## 🔧 Technology Stack

### Frontend
- **Framework:** Vanilla JavaScript (ES6+)
- **Styling:** Tailwind CSS
- **Build Tools:** None (development), Vite (production optimization)
- **Module Pattern:** Revealing Module Pattern
- **State Management:** Simple event bus
- **Real-time Updates:** Firestore listeners

### Backend
- **Platform:** Firebase Cloud Functions
- **Runtime:** Node.js 20
- **Language:** JavaScript
- **Database:** Cloud Firestore
- **Authentication:** Firebase Auth
- **Hosting:** Firebase Hosting

### Development Tools
- **IDE:** Cursor + Claude 3.5 Sonnet
- **Version Control:** Git
- **Package Manager:** npm
- **Local Development:** Firebase Emulator Suite
- **Browser Testing:** Vivaldi (primary), Chrome (secondary)
- **Development Setup:** Dual monitor Windows workspace
- **Browser Workspace:** Vivaldi workspace with pinned tabs:
  - Firebase Console
  - Google Cloud Console
  - Emulator Dashboard
  - Local development site

## 🏗️ Project Structure

```
matchscheduler-firebase/
├── functions/
│   ├── src/
│   │   ├── auth/         # Authentication functions
│   │   ├── teams/        # Team management
│   │   ├── availability/ # Availability updates
│   │   └── scheduled/    # Cron jobs
│   └── package.json
├── public/               # Frontend files
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
├── firebase.json         # Firebase configuration
├── firestore.rules      # Security rules
└── package.json         # Root package
```

## 🚀 Firebase v11 Architecture Benefits

**Modern Modular SDK:**
- Tree-shaking for optimal bundle sizes
- Enhanced TypeScript support
- Streamlined authentication flows
- Improved real-time listener management
- Better performance and caching

## 🔑 Firebase Configuration

### Project Settings
- **Project ID:** matchscheduler-dev
- **Project Number:** 340309534131
- **Default GCP Resource Location:** us-central1 (default)
- **Google Cloud Console:** https://console.cloud.google.com/home/dashboard?project=matchscheduler-dev

### Firebase Services Enabled
- [x] Authentication (Google provider)
- [x] Cloud Firestore
- [x] Cloud Functions
- [x] Hosting
- [ ] Cloud Storage (not yet needed)
- [ ] Cloud Messaging (future feature)

### API Keys & Config
```javascript
// Frontend Firebase Config (public/js/config/firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyAElazBT8eT13fT0wCO5K7z3-5D1z42ZBM",
  authDomain: "matchscheduler-dev.firebaseapp.com",
  projectId: "matchscheduler-dev",
  storageBucket: "matchscheduler-dev.firebasestorage.app",
  messagingSenderId: "340309534131",
  appId: "1:340309534131:web:77155fb67f95ec2816d7c6",
  measurementId: "G-H364SV1EFJ"
};
```

## 🖥️ Development Environment

### Local URLs
- **Frontend:** http://localhost:5000
- **Functions:** http://localhost:5001/matchscheduler-dev/us-central1/
- **Firestore Emulator:** http://localhost:8080
- **Auth Emulator:** http://localhost:9099
- **Emulator UI:** http://localhost:4000

### Production URLs
- **App:** https://matchscheduler-dev.web.app
- **Alt:** https://matchscheduler-dev.firebaseapp.com
- **Functions:** https://us-central1-matchscheduler-dev.cloudfunctions.net/

### Environment Variables
```bash
# .env.local (functions directory)
GOOGLE_APPLICATION_CREDENTIALS=../../matchscheduler-dev-502c71ae2a80.json
FIREBASE_PROJECT_ID=matchscheduler-dev
```

## 📦 Dependencies

### Frontend Dependencies
- Firebase JS SDK v11.0.2 (latest stable)
- Tailwind CSS v3.4.0
- No other external libraries (intentionally minimal)

### Backend Dependencies (functions/package.json)
```json
{
  "firebase-admin": "^13.0.0",
  "firebase-functions": "^6.1.0"
}
```

### Development Dependencies
- Firebase CLI (global): `npm install -g firebase-tools`
- Current version: [Check with `firebase --version`]

### Performance Optimization (Post-MVP)
- **Vite**: Bundle optimization and tree-shaking
- **Purpose**: Reduce initial load time from ~3-5s to ~1-2s
- **Implementation**: Add after core features are complete
- **Benefits**: Smaller bundles, faster caching, hot reload development

### Error Monitoring (Production)
- **Sentry**: Real-time error tracking and performance monitoring
- **Free tier**: 5,000 errors/month (sufficient for 300-player community)
- **Purpose**: Know about bugs before users complain on Discord
- **Setup**: Single script tag in index.html
- **Benefits**: Email alerts for crashes, error context/stack traces

## 🗄️ Database Structure

### Collections
1. **users** - User profiles
2. **teams** - Team information
3. **availability** - Weekly availability data
4. **eventLog** - Comprehensive event tracking (team lifecycle + player movement)

### Key Patterns
- Document IDs: User (Firebase Auth UID), Team (auto-generated)
- Availability: `{teamId}_{year}-W{weekNumber}`
- Timestamps: Using `FieldValue.serverTimestamp()`

## 🔒 Security & Authentication

### Authentication Providers
- [x] Google OAuth
- [ ] Discord OAuth (future)
- [ ] Email/Password (not planned)

### Security Rules Status
- [x] Development rules (permissive - 30 day trial period)
- [ ] Production rules (restrictive)
- Current: Development mode (expires ~30 days from project creation)

### User Roles
1. **Guest** - Read-only access
2. **User** - Has profile, can join/create teams
3. **Team Leader** - Additional team management
4. **Admin** - System maintenance (not implemented)

## 🚀 Deployment

### Deployment Commands
```bash
# Deploy everything
firebase deploy

# Deploy specific services
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only firestore:rules

# Deploy specific function
firebase deploy --only functions:createTeam
```

### CI/CD
- Manual deployment via Firebase CLI
- No automated pipeline yet

## 🐛 Known Issues & Workarounds

### Current Issues
1. **Firestore Emulator Bug** - `FieldValue` undefined in emulator
   - Workaround: Using Timestamp.now() directly
   
2. **Security Rules Testing** - Emulator evaluation bugs
   - Workaround: Test in production with test project

3. **Emulator Port Conflicts** - Processes hang when restarting
   - Workaround: Kill hanging processes manually
   ```bash
   # Find hanging processes
   netstat -ano | findstr :5001
   netstat -ano | findstr :8080
   
   # Kill process (Windows)
   taskkill /PID [process_id] /F
   ```

4. **Console Overwhelm** - Too many Google/Firebase consoles to manage
   - Firebase Console
   - Google Cloud Console  
   - Firebase Emulator UI
   - Multiple browser tabs needed

5. **Project Switching Issue** - Emulator can get stuck on wrong project
   - Symptom: Emulator uses old project despite config changes
   - Fix: Run `firebase use matchscheduler-dev` in the terminal before starting emulator
   - This persists the project selection for that terminal session

6. **Region Defaults** - Functions always default to us-central1
   - Firestore is correctly in europe-west10 (Berlin region)
   - Functions ignore region selection and use us-central1
   - This is a known Firebase limitation
   - Minor latency impact but not breaking

### Common Errors
- "Permission denied" - Check auth state and security rules
- "Function not found" - Ensure function is exported in index.js
- "Network error" - Check if emulators are running

## 📊 Monitoring & Logs

### Firebase Console Links
- [Functions Logs](https://console.firebase.google.com/project/matchscheduler-dev/functions/logs)
- [Firestore Usage](https://console.firebase.google.com/project/matchscheduler-dev/firestore/usage)
- [Authentication Users](https://console.firebase.google.com/project/matchscheduler-dev/authentication/users)

### Local Debugging
- Emulator logs: Check terminal where emulators are running
- Browser console: Frontend errors and Firebase SDK warnings
- Network tab: Monitor API calls to functions

## 🧪 Testing

### Test Accounts
- Primary Dev: david.larsen.1981@gmail.com
- Remote Test: matchscheduler81@gmail.com
- Test Team: Changes frequently (database cleared often)

### Testing Commands
```bash
# Run emulators
firebase emulators:start

# Run integration tests
npm test

# Run specific test suite
npm run test:teams
```

## 📝 Development Workflow

### Standard Process
1. Start emulators: `firebase emulators:start`
2. Make changes in Cursor
3. Test locally at http://localhost:5000
4. Run integration tests
5. Deploy to production

### Hybrid Development Mode
- Frontend: Points to live Firebase
- Functions: Can run locally or use deployed
- Best for avoiding emulator bugs

## 🔄 State Management

### Frontend State
- **AuthService** - User authentication state
- **StateService** - App-wide state (current team, week offset)
- **DatabaseService** - Firestore listeners and caching

### Real-time Updates
- Team changes: Firestore listener on team doc
- Availability: Listeners on current 4 weeks
- Roster: Updates via team document

## 📅 Scheduled Functions

### Active Cron Jobs
- `checkTeamActivity` - Daily at 2 AM UTC
  - Marks inactive teams (14 days)
  - Regenerates old join codes (30 days)

## 🎨 UI Framework

### Design System
- Dark theme with slate/sky/amber palette
- 3x3 grid layout (desktop)
- Responsive stack (mobile)
- Components use Tailwind utilities

### Key UI Libraries
- Icons: Inline SVG (Lucide icons)
- Animations: CSS transitions
- Modals: Custom implementation
- Date handling: Native JavaScript

## ☁️ Google Cloud Platform Configuration

### GCP Project Details
- **Project ID:** matchscheduler-dev
- **Project Number:** 340309534131
- **Region:** us-central1 (functions), europe-west10 (firestore)
- **Billing Account:** Blaze Plan (Pay as you go, generous free tier)

### APIs Enabled
- [x] Firebase Management API
- [x] Cloud Firestore API
- [x] Firebase Authentication API
- [x] Cloud Functions API
- [x] Firebase Hosting API
- [x] Identity Toolkit API (for Auth)
- [ ] Cloud Storage API (not yet needed)

### Service Accounts
*See `project_stack_credentials.md` for sensitive service account details.*

### OAuth Configuration
*See `project_stack_credentials.md` for sensitive OAuth configuration details.*

### Important GCP Console Links
- [APIs & Services](https://console.cloud.google.com/apis/dashboard?project=matchscheduler-dev)
- [IAM & Admin](https://console.cloud.google.com/iam-admin/iam?project=matchscheduler-dev)
- [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=matchscheduler-dev)
- [Billing](https://console.cloud.google.com/billing?project=matchscheduler-dev)

### Planned
- Discord OAuth
- Discord bot for notifications
- Calendar export (iCal)

## 📁 Key Configuration Files

### firebase.json
- **Firestore Location:** europe-west10
- **Functions Location:** us-central1 (default)
- **Emulator Ports:** Functions (5001), Hosting (5000), UI (4000)
- **Single Project Mode:** Enabled

### firestore.rules
- **Status:** Production-ready rules implemented ✅
- **Features:** 
  - User profile validation
  - Team leader permissions
  - Availability access control
  - Protection against unauthorized fields

## 🛡️ Data Protection Strategy (Production Setup)

### Automated Backup System
**Purpose:** Protect against data corruption from development mistakes (not Firebase failure)

**Implementation Steps:**
1. **Enable Cloud Scheduler** in Google Cloud Console
2. **Create daily backup job:**
   ```bash
   # Command to run daily at 2 AM UTC
   gcloud firestore export gs://matchscheduler-backups/$(date +%Y-%m-%d)
   ```
3. **Set up Cloud Storage bucket** for backups
4. **Configure retention policy** (keep 30 days, delete older)

**Cost:** ~$1-2/month for backup storage
**Recovery:** Simple import command if data corruption occurs
**Why important:** Protects against human error during development/updates

### Backup Schedule
- **Daily exports** at 2 AM UTC (low usage time)
- **30-day retention** (automatic cleanup)
- **Monthly full exports** to separate bucket (long-term archive)
- **Pre-deployment snapshots** before major updates

### Project Timeline
- **Version 1 (Scripts):** ~May 2025
- **Version 2 (Web API):** ~Early June 2025  
- **Version 3 (Firebase):** Started ~Mid June 2025
- **Total Firebase Development:** ~2 weeks

### Code Documentation
- Functions: JSDoc comments
- Components: Module pattern with clear APIs
- PRD sections referenced in code

## 🆘 Troubleshooting Checklist

When things go wrong, check:
1. [ ] Are emulators running?
2. [ ] Is user authenticated?
3. [ ] Check browser console for errors
4. [ ] Check function logs in terminal
5. [ ] Verify security rules allow operation
6. [ ] Check network tab for failed requests
7. [ ] Ensure data exists in Firestore
8. [ ] Verify correct project (dev vs prod)

## 🤝 Collaboration Notes

### Working with Cursor
- Keep prompts focused on single tasks
- Reference PRD sections explicitly
- Use "verify and improve" pattern
- Maximum 3 fix attempts before human help

### Working with Claude
- Provide this document for context
- Break down technical concepts
- Focus on "why" not just "how"
- Verify against PRD requirements

---

**Quick Commands Reference:**
```bash
# Start development
firebase emulators:start

# Deploy to production  
firebase deploy

# View logs
firebase functions:log

# Switch projects
firebase use matchscheduler-dev
```
