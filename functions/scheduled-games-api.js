// Public API for Scheduled Games
// Provides unauthenticated read-only access for QWHub integration

const functions = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

// CORS headers for cross-origin access
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60'  // 1-minute cache
};

/**
 * Public API endpoint to fetch scheduled games.
 *
 * Query Parameters:
 * - status: Filter by status ('upcoming', 'completed', 'cancelled', 'all'). Default: 'upcoming'
 * - teamTag: Filter by team tag (case-insensitive)
 * - weekId: Filter by week (format: YYYY-WW)
 * - limit: Max results (default: 50, max: 100)
 *
 * Response:
 * {
 *   success: true,
 *   count: number,
 *   matches: [...],
 *   fetchedAt: ISO timestamp
 * }
 */
exports.getScheduledGames = functions
    .region('europe-west3')
    .https.onRequest(async (req, res) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.set(corsHeaders);
            res.status(204).send('');
            return;
        }

        // Only allow GET requests
        if (req.method !== 'GET') {
            res.set(corsHeaders);
            res.status(405).json({ success: false, error: 'Method not allowed' });
            return;
        }

        try {
            res.set(corsHeaders);

            // Parse query parameters
            const status = req.query.status || 'upcoming';
            const teamTag = req.query.teamTag?.toLowerCase();
            const weekId = req.query.weekId;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);

            // Validate status parameter
            const validStatuses = ['upcoming', 'completed', 'cancelled', 'all'];
            if (!validStatuses.includes(status)) {
                res.status(400).json({
                    success: false,
                    error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
                });
                return;
            }

            // Build query
            let query = db.collection('scheduledMatches');

            // Status filter (skip for 'all')
            if (status !== 'all') {
                query = query.where('status', '==', status);
            }

            // Week filter
            if (weekId) {
                // Validate weekId format
                if (!/^\d{4}-\d{2}$/.test(weekId)) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid weekId format. Use YYYY-WW (e.g., 2026-06)'
                    });
                    return;
                }
                query = query.where('weekId', '==', weekId);
            }

            // Order by scheduled date and limit
            query = query.orderBy('scheduledDate', 'asc').limit(limit);

            const snapshot = await query.get();

            // Transform results to clean JSON
            let matches = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    teamA: {
                        id: data.teamAId,
                        name: data.teamAName,
                        tag: data.teamATag
                    },
                    teamB: {
                        id: data.teamBId,
                        name: data.teamBName,
                        tag: data.teamBTag
                    },
                    scheduledDate: data.scheduledDate,
                    slotId: data.slotId,
                    weekId: data.weekId,
                    gameType: data.gameType || 'official',
                    status: data.status,
                    confirmedAt: data.confirmedAt?.toDate?.()?.toISOString() || null
                };
            });

            // Team tag filter (client-side for case-insensitive matching)
            if (teamTag) {
                matches = matches.filter(m =>
                    m.teamA.tag.toLowerCase() === teamTag ||
                    m.teamB.tag.toLowerCase() === teamTag
                );
            }

            res.status(200).json({
                success: true,
                count: matches.length,
                matches,
                fetchedAt: new Date().toISOString()
            });

        } catch (error) {
            console.error('getScheduledGames error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });
