const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin SDK
initializeApp();

// Import Cloud Functions
const { processLogoUpload } = require('./logo-processing');
const { createProfile, updateProfile, getProfile } = require('./user-profile');

// Export Cloud Functions
exports.processLogoUpload = processLogoUpload;
exports.createProfile = createProfile;
exports.updateProfile = updateProfile;
exports.getProfile = getProfile;

// Simple test function
exports.helloWorld = onRequest((request, response) => {
    response.json({ message: 'MatchScheduler Functions are working!' });
});