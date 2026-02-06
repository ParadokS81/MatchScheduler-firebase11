const functions = require('firebase-functions');
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
const { createProposal, confirmSlot, withdrawConfirmation, cancelProposal, cancelScheduledMatch, toggleScheduler } = require('./match-proposals');
const { getScheduledGames } = require('./scheduled-games-api');

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

// Match proposal functions
exports.createProposal = createProposal;
exports.confirmSlot = confirmSlot;
exports.withdrawConfirmation = withdrawConfirmation;
exports.cancelProposal = cancelProposal;
exports.cancelScheduledMatch = cancelScheduledMatch;
exports.toggleScheduler = toggleScheduler;

// Public API (unauthenticated)
exports.getScheduledGames = getScheduledGames;

// Simple test function
exports.helloWorld = functions.region('europe-west3').https.onRequest((request, response) => {
    response.json({ message: 'MatchScheduler Functions are working!' });
});