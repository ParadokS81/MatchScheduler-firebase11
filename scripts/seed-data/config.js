/**
 * Seed configuration for local and production environments.
 *
 * Local: Uses Auth emulator with fake dev users (email/password login)
 * Production: Real users authenticate via Discord OAuth (no Auth users created)
 */

module.exports = {
    // Dev user for local emulator - auto-signs in on localhost
    // Must match AuthService.js DEV_USERS[0]
    DEV_USER: {
        uid: 'dev-user-001',
        email: 'dev@matchscheduler.test',
        password: 'devmode123',
        displayName: 'ParadokS',
        initials: 'PDX',
    },

    // Emulator ports - must match firebase.json
    EMULATOR_PORTS: {
        firestore: 8080,
        auth: 9099,
        storage: 9199,
    },

    // Firebase project ID
    PROJECT_ID: 'matchscheduler-dev',
    STORAGE_BUCKET: 'matchscheduler-dev.firebasestorage.app',

    // All Firestore collections that seed data touches
    // Used for cleanup - nuke all of these before seeding
    COLLECTIONS: [
        'teams',
        'users',
        'availability',
        'matchProposals',
        'scheduledMatches',
        'eventLog',
    ],

    // Time slot / availability constants
    TIME_SLOTS: ['1800', '1830', '1900', '1930', '2000', '2030', '2100', '2130', '2200', '2230', '2300'],
    DAYS: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
};
