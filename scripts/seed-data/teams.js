/**
 * Single source of truth for all Big4 Season 2 team data.
 *
 * Data source: https://www.thebig4.se/api/teams (scraped 2026-02-02)
 * Logos: https://www.thebig4.se/teams/{name}.png
 * 30 teams, ~170 players
 *
 * Edit THIS file when:
 * - Rosters change
 * - New teams are added
 * - Team tags are discovered
 * - Discord IDs are collected
 *
 * Used by: scripts/seed.js (both local and production)
 */

// ============================================
// Captain Discord IDs - collected from the community
// Maps player name → { username, discordId }
// ============================================
const CAPTAIN_DISCORD = {
    // ── Existing (verified) ──
    "Macler": { username: "macler", discordId: "323570475647238144" },
    "TheChosenOne": { username: "thechosenone", discordId: "106846389354438656" },
    "Ake Vader": { username: "ake vader", discordId: "166872187788066816" },
    "conan": { username: "conan", discordId: "536953724665462795" },
    "Hooraytio": { username: "hooraytio", discordId: "255234034609815554" },
    "sae": { username: "sae", discordId: "508739823557804052" },
    "Mille": { username: "mille", discordId: "801726266431635466" },
    "Splash": { username: "splash", discordId: "196229216373571593" },
    "ParadokS": { username: "paradoks", discordId: "140268554816716800" },
    "Oddjob": { username: "oddjob", discordId: "835415147040079913" },
    "jOn": { username: "jon", discordId: "808346233256017973" },
    "gLAd": { username: "glad", discordId: "311446450871599104" },
    "fluartity": { username: "fluarity", discordId: "239390377583312898" },
    "Gamer": { username: "gamer", discordId: "211433738846863360" },
    "mazer": { username: "mazer", discordId: "131498556870754304" },
    "Link": { username: "link", discordId: "522396945612931106" },
    "Plast": { username: "plast", discordId: "404952198934560769" },
    "tiba": { username: "tiba", discordId: "149722360688279554" },
    "Mushi": { username: "mushi", discordId: "86086427581878272" },
    "spokz": { username: "spokz", discordId: "622520960930807878" },
    "bps": { username: "bps", discordId: "146027619576578058" },
    // ── New (collected 2026-02-02) ──
    "sCorp": { username: "scorp", discordId: "736993153214709770" },
    "Cao": { username: "cao", discordId: "527997866849861672" },
    "Bance": { username: "bance", discordId: "509441496055808013" },
    "blaze": { username: "blaze", discordId: "795823974742622218" },
    "ocoini": { username: "ocoini", discordId: "201766333023518720" },
    "paniagua": { username: "paniagua", discordId: "158215016091222016" },
    "Szturm": { username: "szturm", discordId: "356065650940182530" },
    "apa": { username: "apa", discordId: "374236269133299742" },
    "AHemlocksLie": { username: "ahemlockslie", discordId: "148234663561920513" },
};

// ============================================
// BIG4 SEASON 2 TEAMS
// Data source: https://www.thebig4.se/api/teams
// Logos: https://www.thebig4.se/teams/{name}.png
// Divisions: official Big4 Season 2 divisions
// ============================================
const QW_TEAMS = [
    // ═══════════════════════════════════════════
    //  DIVISION 1 (11 teams)
    // ═══════════════════════════════════════════
    {
        id: 'team-pol-001',
        teamName: 'Polonez',
        teamTag: null,
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/polonez.png',
        players: [
            { name: 'Macler', role: 'leader' },
            { name: 'Thunder', role: 'member' },
            { name: 'Tom', role: 'member' },
            { name: 'Plate', role: 'member' },
            { name: 'Er', role: 'member' },
            { name: 'Iron', role: 'member' },
            { name: 'Emaks', role: 'member' },
        ]
    },
    {
        id: 'team-axe-001',
        teamName: 'The Axemen',
        teamTag: 'oeks',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/theaxemen.png',
        players: [
            { name: 'TheChosenOne', role: 'leader' },
            { name: 'TiMMi', role: 'member' },
            { name: 'Baresi', role: 'member' },
            { name: 'PreMorteM', role: 'member' },
            { name: 'Macisum', role: 'member' },
            { name: 'tr0ll', role: 'member' },
        ]
    },
    {
        id: 'team-bb-001',
        teamName: 'Black book',
        teamTag: 'Book',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/blackbook.png',
        players: [
            { name: 'sae', role: 'leader' },
            { name: 'Milton', role: 'member' },
            { name: 'Wimpeeh', role: 'member' },
            { name: 'Javve', role: 'member' },
            { name: 'Nigve', role: 'member' },
            { name: 'Creature', role: 'member' },
            { name: 'Diki', role: 'member' },
        ]
    },
    {
        id: 'team-hx-001',
        teamName: 'Hell Xpress',
        teamTag: '[hx]',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/hellxpress.png',
        players: [
            { name: 'Splash', role: 'leader' },
            { name: 'Shaka', role: 'member' },
            { name: 'Ok98', role: 'member' },
            { name: 'Realpit', role: 'member' },
            { name: 'Xerial', role: 'member' },
        ]
    },
    {
        id: 'team-gg-001',
        teamName: 'Gubbgrottan',
        teamTag: 'gg',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/gubbgrottan.png',
        players: [
            { name: 'mazer', role: 'leader' },
            { name: 'niw', role: 'member' },
            { name: 'xero', role: 'member' },
            { name: 'himmu', role: 'member' },
            { name: 'gnoffa', role: 'member' },
            { name: 'locktar', role: 'member' },
        ]
    },
    {
        id: 'team-sd-001',
        teamName: 'Suddendeath',
        teamTag: '-s-',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/suddendeath.png',
        players: [
            { name: 'bps', role: 'leader' },
            { name: 'carapace', role: 'member' },
            { name: 'reppie', role: 'member' },
            { name: 'andeh', role: 'member' },
            { name: 'goblin', role: 'member' },
        ]
    },
    {
        id: 'team-sr-001',
        teamName: 'Slackers',
        teamTag: ']SR[',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/slackers.png',
        players: [
            { name: 'ParadokS', role: 'leader', isDevUser: true },
            { name: 'Zero', role: 'member' },
            { name: 'Grisling', role: 'member' },
            { name: 'Razor', role: 'member' },
        ]
    },
    {
        id: 'team-ving-001',
        teamName: 'Ving',
        teamTag: 'ving',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/ving.png',
        players: [
            { name: 'Mille', role: 'leader' },
            { name: 'Sailorman', role: 'member' },
            { name: 'Edvin', role: 'member' },
            { name: 'Mythic', role: 'member' },
        ]
    },
    {
        id: 'team-3b-001',
        teamName: 'Bear Beer Balalaika',
        teamTag: '3b',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/bearbeerbalalaika.png',
        players: [
            { name: 'gLAd', role: 'leader' },
            { name: 'gor', role: 'member' },
            { name: 'Zepp', role: 'member' },
            { name: 'max_power', role: 'member' },
            { name: 'SS', role: 'member' },
            { name: 'Ass', role: 'member' },
            { name: 'rusty-q', role: 'member' },
        ]
    },
    {
        id: 'team-koff-001',
        teamName: 'Koff',
        teamTag: 'koff',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/koff.png',
        players: [
            { name: 'Gamer', role: 'leader' },
            { name: 'Eh', role: 'member' },
            { name: 'Nasander', role: 'member' },
            { name: 'Pkk', role: 'member' },
            { name: 'Scenic', role: 'member' },
            { name: 'Wallu', role: 'member' },
        ]
    },
    {
        id: 'team-tsq-001',
        teamName: 'the Suicide Quad',
        teamTag: 'tSQ',
        divisions: ['D1'],
        logoUrl: 'https://www.thebig4.se/teams/thesuicidequad.png',
        players: [
            { name: 'conan', role: 'leader' },
            { name: 'djevulsk', role: 'member' },
            { name: 'elguapo', role: 'member' },
            { name: 'nas', role: 'member' },
            { name: 'peppe', role: 'member' },
            { name: 'phrenic', role: 'member' },
            { name: 'mutilator', role: 'member' },
        ]
    },

    // ═══════════════════════════════════════════
    //  DIVISION 2 (10 teams)
    // ═══════════════════════════════════════════
    {
        id: 'team-afk-001',
        teamName: 'Aim For Kill',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/aimforkill.png',
        players: [
            { name: 'Mushi', role: 'leader' },
            { name: 'Rotker', role: 'member' },
            { name: 'Gawlo', role: 'member' },
            { name: 'Darff', role: 'member' },
            { name: 'Aki', role: 'member' },
            { name: 'eQu', role: 'member' },
        ]
    },
    {
        id: 'team-d2-001',
        teamName: 'Death Dealers',
        teamTag: 'd2',
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/deathdealers.png',
        players: [
            { name: 'Plast', role: 'leader' },
            { name: 'Hammer', role: 'member' },
            { name: 'Raket', role: 'member' },
            { name: 'Coj', role: 'member' },
        ]
    },
    {
        id: 'team-dds-001',
        teamName: 'Death Dealers Shadows',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/deathdealers.png',
        players: [
            { name: 'spokz', role: 'leader' },
            { name: 'myca', role: 'member' },
            { name: 'pitbull', role: 'member' },
            { name: 'frame', role: 'member' },
            { name: 'flamer', role: 'member' },
        ]
    },
    {
        id: 'team-fu-001',
        teamName: 'Fraggers United',
        teamTag: '-fu-',
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/fraggersunited.png',
        players: [
            { name: 'Hooraytio', role: 'leader' },
            { name: 'Anza', role: 'member' },
            { name: 'Kippo', role: 'member' },
            { name: 'Rusti', role: 'member' },
            { name: 'Rghst', role: 'member' },
            { name: 'Slaughter', role: 'member' },
        ]
    },
    {
        id: 'team-gof-001',
        teamName: 'Good Old Friends',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/goodoldfriends.png',
        players: [
            { name: 'jOn', role: 'leader' },
            { name: 'Ekz', role: 'member' },
            { name: 'Tumult', role: 'member' },
            { name: 'Bass', role: 'member' },
        ]
    },
    {
        id: 'team-pe-001',
        teamName: 'Pineapple Express',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/pineappleexpress.png',
        players: [
            { name: 'blaze', role: 'leader' },
            { name: 'Namtsui', role: 'member' },
            { name: 'Dusty', role: 'member' },
            { name: 'GND', role: 'member' },
            { name: 'Viag', role: 'member' },
        ]
    },
    {
        id: 'team-rs-001',
        teamName: 'Rebel Souls',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/rebelsouls.png',
        players: [
            { name: 'Szturm', role: 'leader' },
            { name: 'hangtime', role: 'member' },
            { name: 'riki', role: 'member' },
            { name: 'rokky', role: 'member' },
            { name: 'splif', role: 'member' },
        ]
    },
    {
        id: 'team-rrg-001',
        teamName: 'Retrorockets Green',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/oneretrorocket.png',
        players: [
            { name: 'paniagua', role: 'leader' },
            { name: 'N3ophyt3', role: 'member' },
            { name: 'biggz', role: 'member' },
            { name: 'nexus', role: 'member' },
            { name: 'DobeZz', role: 'member' },
        ]
    },
    {
        id: 'team-rry-001',
        teamName: 'Retrorockets Yellow',
        teamTag: null,
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/oneretrorocket.png',
        players: [
            { name: 'ocoini', role: 'leader' },
            { name: 'gore', role: 'member' },
            { name: 'robin', role: 'member' },
            { name: 'Vukmir', role: 'member' },
            { name: 'anni', role: 'member' },
        ]
    },
    {
        id: 'team-tot-001',
        teamName: 'Tribe of Tjernobyl',
        teamTag: 'tot',
        divisions: ['D2'],
        logoUrl: 'https://www.thebig4.se/teams/tribeoftjernobyl.png',
        players: [
            { name: 'Oddjob', role: 'leader' },
            { name: 'Slime', role: 'member' },
            { name: 'LethalWiz', role: 'member' },
            { name: 'Fix', role: 'member' },
            { name: 'Sassa', role: 'member' },
        ]
    },

    // ═══════════════════════════════════════════
    //  DIVISION 3 (9 teams)
    // ═══════════════════════════════════════════
    {
        id: 'team-boom-001',
        teamName: 'Boomstickers',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/boomstickers.png',
        players: [
            { name: 'Ake Vader', role: 'leader' },
            { name: 'Kylarn', role: 'member' },
            { name: 'Kreator', role: 'member' },
            { name: 'Le1no', role: 'member' },
            { name: 'Bill', role: 'member' },
        ]
    },
    {
        id: 'team-db-001',
        teamName: 'Deathbound',
        teamTag: 'db',
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/deathbound.png',
        players: [
            { name: 'fluartity', role: 'leader' },
            { name: 'Pamppu', role: 'member' },
            { name: 'mj23', role: 'member' },
            { name: 'Doomie', role: 'member' },
            { name: 'kwon', role: 'member' },
            { name: 'Arnelius', role: 'member' },
        ]
    },
    {
        id: 'team-fir-001',
        teamName: 'Falling in Reverse',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/fallinginreverse.png',
        players: [
            { name: 'tiba', role: 'leader' },
            { name: 'mihawk', role: 'member' },
            { name: 'matuzah', role: 'member' },
            { name: 'hemp', role: 'member' },
            { name: 'gflip', role: 'member' },
            { name: 'guns', role: 'member' },
        ]
    },
    {
        id: 'team-orr-001',
        teamName: 'One RetroRocket',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/oneretrorocket.png',
        players: [
            { name: 'AHemlocksLie', role: 'leader' },
            { name: 'Evil_ua', role: 'member' },
            { name: 'Gandi', role: 'member' },
            { name: 'GRID', role: 'member' },
            { name: 'Flash', role: 'member' },
            { name: 'ibsen', role: 'member' },
            { name: 'multibear', role: 'member' },
            { name: 'naleksi', role: 'member' },
            { name: 'sickness', role: 'member' },
        ]
    },
    {
        id: 'team-osams-001',
        teamName: 'oSaMs sm/osams',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/osams.png',
        players: [
            { name: 'apa', role: 'leader' },
            { name: 'blaps', role: 'member' },
            { name: 'whyz', role: 'member' },
            { name: 'clox', role: 'member' },
            { name: 'marksuzu', role: 'member' },
            { name: 'steppa', role: 'member' },
            { name: 'gorbatjevtarzan', role: 'member' },
            { name: 'lakso', role: 'member' },
            { name: 'zne', role: 'member' },
        ]
    },
    {
        id: 'team-ra-001',
        teamName: 'Red Alert',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/redalert.png',
        players: [
            { name: 'sCorp', role: 'leader' },
            { name: 'Doberman', role: 'member' },
            { name: 'Dzha', role: 'member' },
            { name: 'devil', role: 'member' },
            { name: 'witka', role: 'member' },
            { name: 'nlk', role: 'member' },
            { name: 'Nekoranger', role: 'member' },
        ]
    },
    {
        id: 'team-snow-001',
        teamName: 'Snowflakes',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/snowflakes.png',
        players: [
            { name: 'Link', role: 'leader' },
            { name: 'Alice', role: 'member' },
            { name: 'Zalon', role: 'member' },
            { name: 'Dape', role: 'member' },
            { name: 'FinalExit', role: 'member' },
            { name: 'Duce', role: 'member' },
        ]
    },
    {
        id: 'team-wod-001',
        teamName: 'Warriors of Death',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/warriorsofdeath.png',
        players: [
            { name: 'Cao', role: 'leader' },
            { name: 'Canino', role: 'member' },
            { name: 'Sinistro', role: 'member' },
            { name: 'Coveiro', role: 'member' },
            { name: 'Char', role: 'member' },
            { name: 'Natan', role: 'member' },
        ]
    },
    {
        id: 'team-zd-001',
        teamName: 'Zero Day',
        teamTag: null,
        divisions: ['D3'],
        logoUrl: 'https://www.thebig4.se/teams/zeroday.png',
        players: [
            { name: 'Bance', role: 'leader' },
            { name: 'Cronus', role: 'member' },
            { name: 'Nico', role: 'member' },
            { name: 'Ledge', role: 'member' },
            { name: 'nTr', role: 'member' },
            { name: 'GooroL', role: 'member' },
        ]
    },
];

module.exports = { QW_TEAMS, CAPTAIN_DISCORD };
