const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin SDK
initializeApp();

// Import Cloud Functions
const { processLogoUpload } = require('./logo-processing');
const { createProfile, updateProfile, getProfile } = require('./user-profile');
const { createTeam, joinTeam, regenerateJoinCode, leaveTeam, updateTeamSettings } = require('./team-operations');
const { updateAvailability } = require('./availability');

// Export Cloud Functions
exports.processLogoUpload = processLogoUpload;
exports.createProfile = createProfile;
exports.updateProfile = updateProfile;
exports.getProfile = getProfile;

// Team operations functions
exports.createTeam = createTeam;
exports.joinTeam = joinTeam;
exports.regenerateJoinCode = regenerateJoinCode;
exports.leaveTeam = leaveTeam;
exports.updateTeamSettings = updateTeamSettings;

// Availability functions
exports.updateAvailability = updateAvailability;

// Simple test function
exports.helloWorld = onRequest((request, response) => {
    response.json({ message: 'MatchScheduler Functions are working!' });
});