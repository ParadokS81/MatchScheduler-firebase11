const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin SDK
initializeApp();

// Import Cloud Functions
const { processLogoUpload } = require('./logo-processing');
const { processAvatarUpload } = require('./avatar-processing');
const { googleSignIn, createProfile, updateProfile, getProfile, deleteAccount } = require('./user-profile');
const { discordOAuthExchange } = require('./discord-auth');
const { createTeam, joinTeam, regenerateJoinCode, leaveTeam, updateTeamSettings, kickPlayer, transferLeadership, updateRosterInitials, updateTeamTags, updateRecordingVisibility, deleteRecording, addPhantomMember, removePhantomMember } = require('./team-operations');
const { updateAvailability } = require('./availability');
const { saveTemplate, clearTemplate } = require('./templates');
const { setRecurring, applyRecurringTemplates } = require('./recurring');
const { updateFavorites } = require('./favorites');
const { createProposal, confirmSlot, withdrawConfirmation, cancelProposal, cancelScheduledMatch, toggleScheduler, updateProposalSettings, quickAddMatch } = require('./match-proposals');
const { getScheduledGames } = require('./scheduled-games-api');
const { syncBig4Matches, scheduledBig4Sync } = require('./big4-sync');
const { submitFeedback, getFeedbackCount } = require('./feedback');
const { manageBotRegistration } = require('./bot-registration');
const { expireProposals } = require('./expire-proposals');
const { expireScheduledMatches } = require('./expire-scheduled-matches');

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
exports.updateRosterInitials = updateRosterInitials;
exports.updateTeamTags = updateTeamTags;
exports.updateRecordingVisibility = updateRecordingVisibility;
exports.deleteRecording = deleteRecording;
exports.addPhantomMember = addPhantomMember;
exports.removePhantomMember = removePhantomMember;

// Availability functions
exports.updateAvailability = updateAvailability;

// Template functions
exports.saveTemplate = saveTemplate;
exports.clearTemplate = clearTemplate;
exports.setRecurring = setRecurring;
exports.applyRecurringTemplates = applyRecurringTemplates;

// Favorites functions
exports.updateFavorites = updateFavorites;

// Match proposal functions
exports.createProposal = createProposal;
exports.confirmSlot = confirmSlot;
exports.withdrawConfirmation = withdrawConfirmation;
exports.cancelProposal = cancelProposal;
exports.cancelScheduledMatch = cancelScheduledMatch;
exports.toggleScheduler = toggleScheduler;
exports.updateProposalSettings = updateProposalSettings;
exports.quickAddMatch = quickAddMatch;

// Public API (unauthenticated)
exports.getScheduledGames = getScheduledGames;

// Feedback functions
exports.submitFeedback = submitFeedback;
exports.getFeedbackCount = getFeedbackCount;

// Bot registration functions (Phase 1a)
exports.manageBotRegistration = manageBotRegistration;

// Big4 integration
exports.syncBig4Matches = syncBig4Matches;
exports.scheduledBig4Sync = scheduledBig4Sync;

// Scheduled cleanup
exports.expireProposals = expireProposals;
exports.expireScheduledMatches = expireScheduledMatches;

// Admin functions
const { computeWeeklyStats } = require('./compute-weekly-stats');
exports.computeWeeklyStats = computeWeeklyStats;

// Simple test function
exports.helloWorld = functions.region('europe-west3').https.onRequest((request, response) => {
    response.json({ message: 'MatchScheduler Functions are working!' });
});