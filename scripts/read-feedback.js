#!/usr/bin/env node
/**
 * read-feedback.js
 * Reads feedback from Firestore, downloads screenshots, and generates a report
 *
 * Usage:
 *   node scripts/read-feedback.js              # All feedback
 *   node scripts/read-feedback.js --new        # Only unreviewed (status: 'new')
 *   node scripts/read-feedback.js --bugs       # Only bug reports
 *   node scripts/read-feedback.js --features   # Only feature requests
 *   node scripts/read-feedback.js --mark-reviewed <feedbackId>   # Mark as reviewed
 *   node scripts/read-feedback.js --mark-resolved <feedbackId>   # Mark as resolved
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Initialize with service account
const serviceAccount = require('../service-account.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const REVIEWS_DIR = path.join(__dirname, '..', 'feedback-reviews');

const CATEGORY_LABELS = {
    bug: 'Bug Report',
    feature: 'Feature Request',
    other: 'Other'
};

const STATUS_ICONS = {
    new: '[NEW]',
    reviewed: '[REVIEWED]',
    resolved: '[RESOLVED]'
};

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) { resolve(dest); return; }
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                file.close();
                fs.unlinkSync(dest);
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(dest); });
        }).on('error', (err) => {
            fs.unlinkSync(dest);
            reject(err);
        });
    });
}

async function updateStatus(feedbackId, status) {
    try {
        await db.collection('feedback').doc(feedbackId).update({ status });
        console.log(`Marked ${feedbackId} as ${status}.`);
    } catch (err) {
        console.error(`Failed to update ${feedbackId}:`, err.message);
    }
}

async function readFeedback(filter) {
    let query = db.collection('feedback').orderBy('createdAt', 'desc');

    if (filter === 'new') {
        query = query.where('status', '==', 'new');
    } else if (filter === 'bugs') {
        query = query.where('category', '==', 'bug');
    } else if (filter === 'features') {
        query = query.where('category', '==', 'feature');
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
        console.log('\nNo feedback found.\n');
        return;
    }

    // Ensure reviews directory exists
    if (!fs.existsSync(REVIEWS_DIR)) {
        fs.mkdirSync(REVIEWS_DIR, { recursive: true });
    }

    // Gather stats and items
    const stats = { total: 0, new: 0, reviewed: 0, resolved: 0, bug: 0, feature: 0, other: 0 };
    const items = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        stats.total++;
        stats[data.status] = (stats[data.status] || 0) + 1;
        stats[data.category] = (stats[data.category] || 0) + 1;
        items.push({ id: doc.id, ...data });
    });

    // Download screenshots (supports both legacy single URL and new array)
    for (const item of items) {
        const urls = item.screenshotUrls && item.screenshotUrls.length > 0
            ? item.screenshotUrls
            : (item.screenshotUrl ? [item.screenshotUrl] : []);

        item.localScreenshots = [];
        for (let i = 0; i < urls.length; i++) {
            const suffix = urls.length > 1 ? `_${i + 1}` : '';
            const localName = `${item.id}${suffix}.jpg`;
            const localPath = path.join(REVIEWS_DIR, localName);
            try {
                await downloadFile(urls[i], localPath);
                item.localScreenshots.push(localPath);
            } catch (err) {
                console.warn(`  Failed to download screenshot for ${item.id}: ${err.message}`);
            }
        }
    }

    // Print report header
    console.log('\n' + '='.repeat(70));
    console.log('  FEEDBACK REPORT - MatchScheduler');
    console.log('='.repeat(70));
    console.log(`  Total: ${stats.total} | New: ${stats.new} | Reviewed: ${stats.reviewed} | Resolved: ${stats.resolved}`);
    console.log(`  Bugs: ${stats.bug} | Features: ${stats.feature} | Other: ${stats.other}`);
    console.log('='.repeat(70));

    // Print each feedback item
    items.forEach((item, i) => {
        const date = item.createdAt?.toDate?.()
            ? item.createdAt.toDate().toLocaleString()
            : 'Unknown date';
        const statusIcon = STATUS_ICONS[item.status] || `[${item.status}]`;
        const categoryLabel = CATEGORY_LABELS[item.category] || item.category;

        console.log(`\n${statusIcon} #${i + 1} - ${categoryLabel}`);
        console.log(`  From: ${item.displayName} (${item.userId})`);
        console.log(`  Date: ${date}`);
        console.log(`  ID:   ${item.id}`);
        console.log('-'.repeat(70));
        console.log(`  ${item.message}`);
        if (item.localScreenshots && item.localScreenshots.length > 0) {
            const urls = item.screenshotUrls && item.screenshotUrls.length > 0
                ? item.screenshotUrls
                : (item.screenshotUrl ? [item.screenshotUrl] : []);
            item.localScreenshots.forEach((lp, si) => {
                const label = item.localScreenshots.length > 1 ? ` ${si + 1}` : '';
                console.log(`\n  Screenshot${label} (local): ${lp}`);
                if (urls[si]) console.log(`  Screenshot${label} (url):   ${urls[si]}`);
            });
        }
        if (item.browserInfo) {
            const ua = item.browserInfo;
            let browser = 'Unknown';
            if (ua.includes('Firefox/')) browser = 'Firefox ' + ua.split('Firefox/')[1]?.split(' ')[0];
            else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome ' + ua.split('Chrome/')[1]?.split(' ')[0];
            else if (ua.includes('Edg/')) browser = 'Edge ' + ua.split('Edg/')[1]?.split(' ')[0];
            else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
            console.log(`  Browser: ${browser}`);
        }
        console.log('-'.repeat(70));
    });

    console.log('\nScreenshots saved to: feedback-reviews/');
    console.log('Commands: --mark-reviewed <ID> | --mark-resolved <ID>');
    console.log('');
}

// Parse args
const args = process.argv.slice(2);

if (args.includes('--mark-reviewed')) {
    const idx = args.indexOf('--mark-reviewed');
    const feedbackId = args[idx + 1];
    if (!feedbackId) { console.error('Provide a feedback ID'); process.exit(1); }
    updateStatus(feedbackId, 'reviewed').then(() => process.exit(0));
} else if (args.includes('--mark-resolved')) {
    const idx = args.indexOf('--mark-resolved');
    const feedbackId = args[idx + 1];
    if (!feedbackId) { console.error('Provide a feedback ID'); process.exit(1); }
    updateStatus(feedbackId, 'resolved').then(() => process.exit(0));
} else {
    let filter = null;
    if (args.includes('--new')) filter = 'new';
    else if (args.includes('--bugs')) filter = 'bugs';
    else if (args.includes('--features')) filter = 'features';

    readFeedback(filter).then(() => process.exit(0)).catch(err => {
        console.error('Error reading feedback:', err.message);
        process.exit(1);
    });
}
