#!/usr/bin/env node
/**
 * check-tag-cases.js — Quick check: what exact form do our team tags appear
 * in the QWStats database (ascii columns)?
 */
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.PG_HOST, port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE, user: process.env.PG_USER,
    password: process.env.PG_PASSWORD
});

const checks = [
    { firestore: ']SR[', team: 'Slackers' },
    { firestore: '[hx]', team: 'Hell Xpress' },
    { firestore: 'tSQ', team: 'the Suicide Quad' },
    { firestore: 'PEX', team: 'Pineapple Express' },
    { firestore: 'rs', team: 'Rebel Souls' },
    { firestore: 'AFK', team: 'Aim For Kill' },
    { firestore: 'ZÄ', team: 'Zero Day' },
    { firestore: "'tro", team: 'RetroRockets' },
    { firestore: 'F0M', team: 'Fragomatic' },
    { firestore: 'QAA', team: 'Quality Assure Ants' },
    { firestore: 'gof', team: 'Good Old Friends' },
    { firestore: 'CLAN', team: 'RetroRockets main' },
];

(async () => {
    console.log('\nChecking Firestore tags against QWStats ascii columns:\n');

    for (const c of checks) {
        // game_players.team_ascii
        const r1 = await pool.query(
            `SELECT DISTINCT team_ascii, COUNT(*) as cnt FROM game_players
             WHERE lower(team_ascii) = lower($1) GROUP BY team_ascii`,
            [c.firestore]
        );

        // games.team_a_ascii / team_b_ascii
        const r2 = await pool.query(
            `SELECT team_a_ascii as tag, COUNT(*) as cnt FROM games
             WHERE lower(team_a_ascii) = lower($1) GROUP BY team_a_ascii
             UNION ALL
             SELECT team_b_ascii, COUNT(*) FROM games
             WHERE lower(team_b_ascii) = lower($1) GROUP BY team_b_ascii`,
            [c.firestore]
        );

        const playerForms = r1.rows.map(r => `"${r.team_ascii}" (${r.cnt})`).join(', ') || 'NOT FOUND';
        const gameForms = r2.rows.map(r => `"${r.tag}" (${r.cnt})`).join(', ') || 'NOT FOUND';

        const ok = r1.rows.length > 0 || r2.rows.length > 0 ? '' : ' ⚠️';
        console.log(`  ${c.team.padEnd(22)} Firestore: "${c.firestore}" | players: ${playerForms} | games: ${gameForms}${ok}`);
    }

    console.log('\n--- Our QWStats API uses team_a_ascii/team_b_ascii (games) and team_ascii (game_players)');
    console.log('--- Both APIs compare case-insensitively via parseTags() which lowercases\n');

    await pool.end();
})();
