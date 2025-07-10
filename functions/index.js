const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin SDK
initializeApp();

// Import Cloud Functions
const { processLogoUpload } = require('./logo-processing');

// Export Cloud Functions
exports.processLogoUpload = processLogoUpload;

// Simple test function
exports.helloWorld = onRequest((request, response) => {
    response.json({ message: 'MatchScheduler Functions are working!' });
});