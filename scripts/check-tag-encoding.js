#!/usr/bin/env node
/**
 * check-tag-encoding.js — Audit team tags for non-ASCII / Quake encoding issues.
 * Compares what's in QWStats PostgreSQL (team + team_ascii columns) and
 * checks against current Firestore teamTag values.
 *
 * Usage: set -a && source qw-stats/.env && set +a && node scripts/check-tag-encoding.js
 */

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD
});

async function run() {
    // 1. Find all team tags where team != team_ascii (meaning Quake encoding differs)
    console.log('\n=== Team tags where raw != ascii (Quake encoding issues) ===\n');
    const res = await pool.query(`
        SELECT team, team_ascii,
               encode(team::bytea, 'hex') as hex,
               COUNT(DISTINCT game_id) as games
        FROM game_players
        WHERE team != team_ascii
          AND team_ascii != ''
        GROUP BY team, team_ascii
        HAVING COUNT(DISTINCT game_id) >= 3
        ORDER BY games DESC
        LIMIT 40
    `);

    res.rows.forEach(r => {
        console.log(`  raw: "${r.team}" | ascii: "${r.team_ascii}" | hex: ${r.hex} | ${r.games} games`);
    });

    // 2. Now get ALL teams currently in our MatchScheduler Firestore (via the tags we just set)
    // We'll check the known tags from the migration against what QWHub uses
    console.log('\n=== Checking known MatchScheduler tags against QWHub/QWStats ===\n');

    const knownTags = [
        'F0M', 'QAA', '3b', 'AFK', 'oeks', 'Book', 'd2', 'db', 'FIR', '-fu-',
        'gg', 'gof', '[hx]', 'koff', 'PEX', 'RA', 'rs', '-s-', ']SR[', 'ToT',
        'tSQ', 'ving', 'CLAN',
        // newly set:
        'boom', 'd2s', "'tro", 'sm', 'pol', 'snow', 'ZÄ'
    ];

    for (const tag of knownTags) {
        const r = await pool.query(`
            SELECT team, team_ascii, COUNT(DISTINCT game_id) as games
            FROM game_players
            WHERE lower(team) = lower($1)
            GROUP BY team, team_ascii
            ORDER BY games DESC
            LIMIT 3
        `, [tag]);

        if (r.rows.length === 0) {
            // Try ascii column
            const r2 = await pool.query(`
                SELECT team, team_ascii, COUNT(DISTINCT game_id) as games
                FROM game_players
                WHERE lower(team_ascii) = lower($1)
                GROUP BY team, team_ascii
                ORDER BY games DESC
                LIMIT 3
            `, [tag]);

            if (r2.rows.length === 0) {
                console.log(`  "${tag}" — NOT FOUND in either column`);
            } else {
                r2.rows.forEach(row => {
                    console.log(`  "${tag}" — found via ascii: raw="${row.team}" ascii="${row.team_ascii}" (${row.games} games) ⚠️ MISMATCH`);
                });
            }
        } else {
            r.rows.forEach(row => {
                const match = row.team === tag ? '✓' : `⚠️ case: "${row.team}"`;
                const encoding = row.team !== row.team_ascii ? ` (ascii: "${row.team_ascii}")` : '';
                console.log(`  "${tag}" — ${row.games} games ${match}${encoding}`);
            });
        }
    }

    // 3. Also check what QWHub Supabase would match — it uses the team_names array which stores ASCII
    console.log('\n=== Tags with encoding that differs from ASCII form ===');
    console.log('(These need the ASCII form for QWHub Supabase queries)\n');

    const encodingIssues = await pool.query(`
        SELECT DISTINCT team, team_ascii
        FROM game_players
        WHERE team != team_ascii
          AND lower(team) IN (${knownTags.map((_, i) => `lower($${i + 1})`).join(',')})
    `, knownTags);

    if (encodingIssues.rows.length === 0) {
        console.log('  None found — all tags match their ASCII form');
    } else {
        encodingIssues.rows.forEach(r => {
            console.log(`  "${r.team}" → ASCII: "${r.team_ascii}"`);
        });
    }

    await pool.end();
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
