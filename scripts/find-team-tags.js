#!/usr/bin/env node
/**
 * find-team-tags.js — One-off script to find likely team tags
 * for teams that don't have one set, by matching roster player names
 * against the QWStats PostgreSQL 4on4 match database.
 *
 * Usage: set -a && source qw-stats/.env && set +a && node scripts/find-team-tags.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD
});

// Teams with no teamTag and their known player names (lowercased)
const teams = {
    'Boomstickers': ['ake vader', 'kylarn', 'kreator', 'le1no', 'bill'],
    'Death Dealers Shadows': ['spokz', 'myca', 'pitbull', 'frame', 'flamer'],
    'One RetroRocket': ['ahemlockslie', 'evil_ua', 'gandi', 'grid', 'flash', 'ibsen', 'multibear', 'naleksi', 'sickness'],
    'oSaMs': ['apa', 'blaps', 'whyz', 'clox', 'marksuzu', 'steppa', 'gorbatjevtarzan', 'lakso', 'zne'],
    'Polonez': ['macler', 'thunder', 'tom', 'plate', 'er', 'iron', 'emaks'],
    'Retrorockets Green': ['paniagua', 'n3ophyt3', 'biggz', 'nexus', 'dobezz'],
    'Retrorockets Yellow': ['ocoini', 'gore', 'robin', 'vukmir', 'anni'],
    'Snowflakes': ['link', 'alice', 'zalon', 'dape', 'finalexit', 'duce'],
    'Warriors of Death': ['cao', 'canino', 'sinistro', 'coveiro', 'char', 'natan'],
    'Zero Day': ['bance', 'cronus', 'nico', 'ledge', 'ntr', 'goorol']
};

async function findTags() {
    for (const [teamName, players] of Object.entries(teams)) {
        const query = `
            SELECT gp.team,
                   COUNT(DISTINCT gp.player_name_normalized) as matching_players,
                   array_agg(DISTINCT gp.player_name_normalized) as found_players,
                   COUNT(DISTINCT gp.game_id) as games_played
            FROM game_players gp
            JOIN games g ON g.id = gp.game_id
            WHERE g.is_clan_game = true
              AND lower(gp.player_name_normalized) = ANY($1::text[])
            GROUP BY gp.team
            HAVING COUNT(DISTINCT gp.player_name_normalized) >= 3
            ORDER BY matching_players DESC, games_played DESC
            LIMIT 5
        `;

        const res = await pool.query(query, [players]);
        console.log(`\n=== ${teamName} (${players.length} players) ===`);
        if (res.rows.length === 0) {
            console.log('  No matches found with 3+ players');
        } else {
            res.rows.forEach(r => {
                console.log(`  TAG: ${r.team} | ${r.matching_players} players matched | ${r.games_played} games | Players: ${r.found_players.join(', ')}`);
            });
        }
    }
    await pool.end();
}

findTags().catch(e => {
    console.error(e);
    process.exit(1);
});
