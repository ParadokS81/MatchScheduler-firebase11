const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin SDK
initializeApp();

// Import Cloud Functions
const { processLogoUpload } = require('./logo-processing');
const { processAvatarUpload } = require('./avatar-processing');
const { googleSignIn, createProfile, updateProfile, getProfile, deleteAccount } = require('./user-profile');
const { discordOAuthExchange } = require('./discord-auth');
const { createTeam, joinTeam, regenerateJoinCode, leaveTeam, updateTeamSettings, kickPlayer, transferLeadership } = require('./team-operations');
const { updateAvailability } = require('./availability');
const { saveTemplate, deleteTemplate, renameTemplate } = require('./templates');
const { updateFavorites } = require('./favorites');

// Export Cloud Functions
exports.processLogoUpload = processLogoUpload;
exports.processAvatarUpload = processAvatarUpload;
exports.googleSignIn = googleSignIn;
exports.createProfile = createProfile;
exports.updateProfile = updateProfile;
exports.getProfile = getProfile;
exports.deleteAccount = deleteAccount;
exports.discordOAuthExchange = discordOAuthExchange;

// Team operations functions
exports.createTeam = createTeam;
exports.joinTeam = joinTeam;
exports.regenerateJoinCode = regenerateJoinCode;
exports.leaveTeam = leaveTeam;
exports.updateTeamSettings = updateTeamSettings;
exports.kickPlayer = kickPlayer;
exports.transferLeadership = transferLeadership;

// Availability functions
exports.updateAvailability = updateAvailability;

// Template functions
exports.saveTemplate = saveTemplate;
exports.deleteTemplate = deleteTemplate;
exports.renameTemplate = renameTemplate;

// Favorites functions
exports.updateFavorites = updateFavorites;

// Simple test function
exports.helloWorld = onRequest((request, response) => {
    response.json({ message: 'MatchScheduler Functions are working!' });
});