# Local Development Setup

## Quick Start

```bash
# Terminal 1: Start Firebase emulators + web server
npm run dev

# Terminal 2: Seed test data (run once, or after clearing emulator data)
npm run seed:emulator
```

Then open http://localhost:5000 (or your WSL IP like http://172.x.x.x:5000)

## How It Works

### Firebase Emulators
The app runs against local Firebase emulators instead of production:
- **Firestore**: http://localhost:8080 (UI at http://localhost:4000/firestore)
- **Auth**: http://localhost:9099
- **Functions**: http://localhost:5001
- **Hosting**: http://localhost:5000

### Dev Mode Detection
The app detects dev mode via `window.firebase.isLocalDev` (set in index.html when connecting to emulators).

In dev mode:
- **AvailabilityService** writes directly to Firestore (bypasses Cloud Functions)
- **AuthService** auto-signs in to a pre-seeded dev user
- **DevToolbar** appears in bottom-left corner for user switching

### Fixed UIDs
**Critical**: The seed script and AuthService use matching fixed UIDs so the browser's authenticated user matches the seeded Firestore data.

| User | UID | Email | Password |
|------|-----|-------|----------|
| ParadokS (you) | `dev-user-001` | dev@matchscheduler.test | devmode123 |
| Alex Storm | `fake-user-001` | alex@fake.test | devmode123 |
| Bella Knight | `fake-user-002` | bella@fake.test | devmode123 |
| Carlos Vega | `fake-user-003` | carlos@fake.test | devmode123 |
| Diana Cross | `fake-user-004` | diana@fake.test | devmode123 |
| Erik Blade | `fake-user-005` | erik@fake.test | devmode123 |

All users share the same password for easy switching.

### Seeded Data
The seed script creates:
- 1 team ("Dev Squad") with you as leader
- 5 fake teammates with randomized availability patterns
- 2 weeks of availability data (current + next week)
- Auth emulator accounts for all users (for user switching)

### Dev User Switcher
A red "DEV" button appears in the bottom-left corner in dev mode. Click it to switch between seeded users without refreshing the page.

**Use cases:**
- Test team joining flow (switch to Alex, join a team, see roster update)
- Test multi-user real-time updates (open two browser tabs as different users)
- Test role-based UI (leader vs member views)

**How it works:**
1. Click the red "DEV" button
2. Select a different user from the dropdown
3. App re-authenticates and refreshes data for the new user
4. Your selection persists across page refreshes (stored in localStorage)

## Common Issues

### "Must be signed in" error
The Auth emulator user doesn't match the seeded data. Fix:
```bash
npm run seed:emulator
```
Then refresh the browser.

### UID mismatch warning in console
```
⚠️ DEV MODE: UID mismatch! Expected: dev-user-001 Got: xxx
```
The Auth emulator has a stale user. The seed script will fix this automatically - just run it again.

### Changes not showing in UI
1. Check browser console for errors
2. Verify you're connected to emulators (look for "Connected to Firestore emulator" in console)
3. Hard refresh (Ctrl+Shift+R)

### WSL networking
If using WSL, access via your WSL IP instead of localhost:
```bash
# Find your WSL IP
hostname -I
# Use: http://172.x.x.x:5000
```

The seed script accepts a host parameter:
```bash
npm run seed:emulator -- 172.20.95.150
```

## File Locations

| Purpose | File |
|---------|------|
| Emulator config | `firebase.json` |
| Seed script | `scripts/seed-emulator.js` |
| Dev mode auth | `public/js/services/AuthService.js` (DEV_USERS array) |
| User switcher UI | `public/js/components/DevToolbar.js` |
| Direct Firestore writes | `public/js/services/AvailabilityService.js` (_isDevMode check) |
| Emulator connections | `public/index.html` (bottom of file) |

## Production vs Dev Mode

| Feature | Production | Dev Mode |
|---------|------------|----------|
| Auth | Google Sign-In | Auto sign-in to seeded user |
| User switching | N/A | DevToolbar in bottom-left |
| Availability writes | Cloud Functions | Direct Firestore writes |
| Data | Real Firestore | Local emulator |
| Validation | Cloud Functions enforce rules | Relaxed for rapid iteration |

## Resetting Data

To start fresh:
1. Stop emulators (Ctrl+C)
2. Run `npm run dev` again (emulator data is ephemeral)
3. Run `npm run seed:emulator`
