# QWHub API Reference

> Reference document for integrating with QuakeWorld Hub (hub.quakeworld.nu).
> Maintained by: vikpe (site owner), ParadokS (MatchScheduler)
> Last updated: 2026-01-30

## Overview

QWHub is the central hub for all QuakeWorld matches played online. It records every game with full scoreboard data and detailed per-player statistics. We use it to display match history, head-to-head comparisons, and player performance stats in MatchScheduler.

**Three data sources:**

| Source | What | URL Pattern |
|--------|------|-------------|
| Supabase API | Match listings, teams, players, scores | `ncsphkjfominimxztjip.supabase.co/rest/v1/v1_games` |
| S3 ktxstats | Detailed per-player stats per game | `d.quake.world/{sha[0:3]}/{sha}.mvd.ktxstats.json` |
| S3 mapshots | Map background images | `a.quake.world/mapshots/webp/{size}/{map}.webp` |

---

## 1. Supabase API (Match Listings)

### Authentication

All requests require the anon API key in headers:

```javascript
headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jc3Boa2pmb21pbmlteHp0amlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTY5Mzg1NjMsImV4cCI6MjAxMjUxNDU2M30.NN6hjlEW-qB4Og9hWAVlgvUdwrbBO13s8OkAJuBGVbo'
}
```

### Base URL

```
https://ncsphkjfominimxztjip.supabase.co/rest/v1/v1_games
```

### Available Tables

| Table | Fields | Description |
|-------|--------|-------------|
| `v1_games` | id, timestamp, mode, map, matchtag, server_hostname, teams (jsonb), team_names (text[]), players (jsonb), players_fts (tsvector), demo_sha256, demo_source_url | Match records |
| `players` | id, name, slug, qw_auth, user_id | Player identity |
| `profiles` | user_id, name, cc (country), city, hardware specs, socials | Player profiles |
| `maps` | name, message, author_names, modes, tags, revisions | Map metadata |
| `event_series` | id, name, abbreviation, slug | Tournament series |

### v1_games Schema

**Top-level fields:**
```
id              integer     Primary key
timestamp       timestamptz When the game was played
mode            text        "1on1", "2on2", "4on4", "ctf", "wipeout", "10on10"
map             text        Map name (e.g., "dm2", "e1m2", "schloss")
matchtag        text        Tournament/practice tag (e.g., "prac", null for pickups)
server_hostname text        Server name
demo_sha256     text        SHA256 hash of demo file (used for ktxstats lookup)
demo_source_url text        Direct download URL for the .mvd demo file
team_names      text[]      Array of team names (used for filtering)
teams           jsonb       Array of team objects
players         jsonb       Array of player objects
players_fts     tsvector    Full-text search index on player names
```

**teams JSONB structure:**
```json
{
    "name": "]sr[",
    "ping": 33,
    "color": [3, 11],       // top-color, bottom-color (QW palette)
    "frags": 270,
    "name_color": "bwwb"     // b=brown/special, w=white (QW char encoding)
}
```

**players JSONB structure:**
```json
{
    "name": "• ParadokS",
    "ping": 25,
    "team": "]sr[",
    "color": [3, 11],
    "frags": 46,
    "is_bot": false,
    "name_color": "wwwwwwwwww",
    "team_color": "bwwb"
}
```

### Game Counts (as of 2026-01-30)

| Mode | Count |
|------|-------|
| 1on1 | 76,471 |
| 2on2 | 44,249 |
| 4on4 | 18,581 |
| wipeout | 2,716 |
| ctf | 508 |

### Query Patterns

All queries use PostgREST syntax (Supabase's REST layer).

**Recent matches for a team:**
```
?select=id,timestamp,mode,map,teams,players,demo_sha256
&mode=eq.4on4
&team_names=cs.{]sr[}          # URL encode: cs.%7B%5Dsr%5B%7D
&order=timestamp.desc
&limit=10
```

**Head-to-head (two specific teams):**
```
?select=id,timestamp,map,teams,players,demo_sha256
&mode=eq.4on4
&team_names=cs.{]sr[,pol}      # URL encode: cs.%7B%5Dsr%5B%2Cpol%7D
&order=timestamp.desc
&limit=20
```

**Filter by map:**
```
&map=eq.dm2
```

**Filter by date range:**
```
&timestamp=gte.2026-01-01
&timestamp=lte.2026-01-31
```

**Filter by matchtag (tournament/practice):**
```
&matchtag=not.is.null           # All tagged games
&matchtag=eq.prac               # Specific tag
```

**Player search (full-text):**
```
&players_fts=fts.paradok        # Searches player names
```

**Get result count:**
```
Header: Prefer: count=exact
Response header: Content-Range: 0-9/18581  (total after /)
```

**Pagination:**
```
&limit=10&offset=20&order=timestamp.desc
```

### CRITICAL: Lowercase Team Names

**The QWHub API stores all team names in lowercase.** Our `teamTag` field may use display casing (e.g. `Book`, `tSQ`, `GoF!`), but queries must use lowercase (`book`, `tsq`, `gof!`). Always call `.toLowerCase()` on the tag before building the query URL.

Verified examples: `]sr[` (already lower), `pol` (already lower), `book` (not `Book`), `tsq` (not `tSQ`), `gof!` (not `GoF!`), `nw` (not `nW`), `oeks`, `-fu-`, `[hx]`, `ving`, `boom`.

### Team Name Encoding

Team names with special characters must be URL-encoded inside the `cs.{}` PostgREST array filter:

```javascript
// cs.{teamA,teamB} = "contains all of these"
// URL encode the curly braces and team names

function encodeTeamFilter(teamTags) {
    // teamTags: array of strings like ["]sr[", "pol"]
    const joined = teamTags.join(',');
    return 'cs.' + encodeURIComponent('{' + joined + '}');
}

// Single team:  encodeTeamFilter([']sr['])  → cs.%7B%5Dsr%5B%7D
// Two teams:    encodeTeamFilter([']sr[', 'pol']) → cs.%7B%5Dsr%5B%2Cpol%7D
```

---

## 2. ktxstats (Detailed Game Statistics)

### URL Pattern

```
https://d.quake.world/{sha256[0:3]}/{sha256}.mvd.ktxstats.json
```

**Example:**
```
SHA256: 211b41fd367e4eea7ee43fe32816c19806e5bbf3702afc4ed8d0905c50121737
URL:    https://d.quake.world/211/211b41fd367e4eea7ee43fe32816c19806e5bbf3702afc4ed8d0905c50121737.mvd.ktxstats.json
```

**JavaScript helper:**
```javascript
function getKtxstatsUrl(demoSha256) {
    if (!demoSha256) return null;
    const prefix = demoSha256.substring(0, 3);
    return `https://d.quake.world/${prefix}/${demoSha256}.mvd.ktxstats.json`;
}
```

### No auth required. Direct GET request, returns JSON.

Note: The server responds with `Content-Type: application/octet-stream` and `Content-Disposition: attachment`, but the body is valid JSON. Fetch with standard `response.json()`.

### ktxstats JSON Schema

**Top-level:**
```json
{
    "version": 3,
    "date": "2026-01-29 23:11:44 +0000",
    "map": "dm2",
    "hostname": "Berlin KTX Server antilag #2",
    "ip": "10.214.0.2",
    "port": 27511,
    "mode": "team",
    "tl": 20,                    // timelimit in minutes
    "dm": 1,                     // deathmatch mode
    "tp": 2,                     // teamplay mode
    "duration": 1200,            // duration in seconds
    "demo": "4on4_]sr[_vs_pol[dm2]20260129-2251.mvd",
    "teams": ["]sr[", "pol"],    // NOTE: uses QW char encoding (special chars)
    "players": [...]             // Array of player stat objects
}
```

**Per-player object:**
```json
{
    "top-color": 3,
    "bottom-color": 11,
    "ping": 25,
    "login": "",
    "name": "• ParadokS",        // QW encoded name
    "team": "]sr[",               // QW encoded team name

    "stats": {
        "frags": 46,
        "deaths": 52,
        "tk": 1,                  // team kills
        "spawn-frags": 6,        // kills on spawning players
        "kills": 49,             // actual kills (frags - suicides - tk)
        "suicides": 0
    },

    "dmg": {
        "taken": 9707,
        "given": 10412,
        "team": 238,              // damage to teammates
        "self": 460,              // self damage
        "team-weapons": 28,
        "enemy-weapons": 2732,
        "taken-to-die": 186       // avg damage taken per death
    },

    "xferRL": 1,                  // RL transfers (picked up from kills)
    "xferLG": 0,

    "spree": {
        "max": 13,                // longest kill streak
        "quad": 7                 // kills during quad damage
    },

    "control": 0.0,              // map control percentage

    "speed": {
        "max": 1198.28,          // max movement speed
        "avg": 275.94            // average movement speed
    },

    "weapons": {
        "axe": { ... },
        "sg": { ... },           // shotgun
        "ssg": { ... },          // super shotgun
        "ng": { ... },           // nailgun
        "gl": { ... },           // grenade launcher
        "rl": { ... },           // rocket launcher
        "lg": { ... }            // lightning gun (not present if not used)
    },

    "items": {
        "health_15": { "took": 8 },
        "health_25": { "took": 51 },
        "health_100": { "took": 3 },     // megahealth
        "ya": { "took": 12, "time": 153 }, // yellow armor + seconds held
        "ra": { "took": 16, "time": 474 }, // red armor
        "q": { "took": 1, "time": 30 }    // quad damage
    }
}
```

**Per-weapon object (e.g., "rl"):**
```json
{
    "acc": {
        "attacks": 123,           // shots fired
        "hits": 16,               // direct hits
        "real": 82,               // real attacks (minus spam)
        "virtual": 82
    },
    "kills": {
        "total": 29,              // kills with this weapon
        "team": 1,                // team kills
        "enemy": 4,               // enemy kills (direct)
        "self": 0                 // suicide with this weapon
    },
    "deaths": 28,                 // deaths while holding this weapon
    "pickups": {
        "dropped": 5,             // picked up from killed players
        "taken": 11,              // picked up from map
        "total-taken": 16,
        "spawn-taken": 10,
        "spawn-total-taken": 13
    },
    "damage": {
        "enemy": 5485,
        "team": 162
    }
}
```

### Derived Stats (calculated, not in raw data)

These are the stats shown on the hub's Stats table - calculated from the raw ktxstats:

```javascript
// Efficiency: kills / (kills + deaths) * 100
const eff = Math.round(player.stats.kills / (player.stats.kills + player.stats.deaths) * 100);

// SG% (shotgun accuracy)
const sgAcc = Math.round(player.weapons.sg.acc.hits / player.weapons.sg.acc.attacks * 100);

// LG% (lightning gun accuracy) - only if lg exists
const lgAcc = player.weapons.lg
    ? Math.round(player.weapons.lg.acc.hits / player.weapons.lg.acc.attacks * 100)
    : null;

// RL accuracy
const rlAcc = Math.round(player.weapons.rl.acc.hits / player.weapons.rl.acc.attacks * 100);

// EWEP (enemy weapon damage)
const ewep = player.dmg["enemy-weapons"];

// To Die (average damage taken per death)
const toDie = player.dmg["taken-to-die"];
```

---

## 3. Map Images (Mapshots)

### URL Pattern

```
https://a.quake.world/mapshots/webp/{size}/{mapname}.webp
```

**Sizes:**
- `sm` - Small (~11-25 KB, good for thumbnails/lists)
- `lg` - Large (~40-100 KB, good for backgrounds/detail views)

**Examples:**
```
https://a.quake.world/mapshots/webp/sm/dm2.webp     (11 KB)
https://a.quake.world/mapshots/webp/sm/dm3.webp     (16 KB)
https://a.quake.world/mapshots/webp/lg/e1m2.webp    (98 KB)
https://a.quake.world/mapshots/webp/lg/schloss.webp  (65 KB)
```

**Also available as JPG (older pattern):**
```
https://a.quake.world/mapshots/{mapname}.jpg
```

**JavaScript helper:**
```javascript
function getMapshotUrl(mapName, size = 'sm') {
    return `https://a.quake.world/mapshots/webp/${size}/${mapName}.webp`;
}
```

No authentication required.

---

## 4. Hub Website URLs

For linking to the hub frontend (opens in browser):

```javascript
// Team's match history page
function getHubTeamUrl(teamTag) {
    return `https://hub.quakeworld.nu/games/?mode=4on4&team=${encodeURIComponent(teamTag)}`;
}

// Specific game detail page
function getHubGameUrl(gameId) {
    return `https://hub.quakeworld.nu/games/?gameId=${gameId}`;
}
```

---

## 5. Scoreboard Rendering (HTML/CSS)

The hub renders scoreboards as pure HTML/CSS, not screenshots. All data needed is in the Supabase `teams` and `players` JSONB fields. We replicate this approach locally for full control and zero extra network requests.

**Hub source code:** https://github.com/quakeworldnu/hub.quakeworld.nu
**Key source files:** `src/servers/Scoreboard.jsx`, `src/styles/_scoreboard.scss`, `src/styles/_quake_colors.scss`, `src/QuakeText.jsx`

### QW Color Palette (17 colors, indices 0-16)

Used in `teams[].color` and `players[].color` arrays as `[top-color, bottom-color]`:

```javascript
const QW_COLORS = {
    0:  'rgb(140,140,140)', // gray
    1:  'rgb(83,59,27)',    // dark brown
    2:  'rgb(79,79,115)',   // slate blue
    3:  'rgb(55,55,7)',     // dark olive
    4:  'rgb(71,0,0)',      // dark red
    5:  'rgb(95,71,7)',     // bronze
    6:  'rgb(143,67,51)',   // rust/salmon
    7:  'rgb(127,83,63)',   // tan
    8:  'rgb(87,55,67)',    // mauve
    9:  'rgb(95,51,63)',    // plum
    10: 'rgb(107,87,71)',   // khaki
    11: 'rgb(47,67,55)',    // forest green
    12: 'rgb(123,99,7)',    // gold/olive
    13: 'rgb(47,47,127)',   // royal blue
    14: 'rgb(183,51,15)',   // bright orange-red
    15: 'rgb(103,0,0)',     // crimson
    16: 'rgb(0,0,0)'       // black
};
```

### Frag Number Rendering (Two-Tone Gradient)

Each player/team frag count is displayed with a vertical split gradient using their `color` array. Top half uses `top-color`, bottom half uses `bottom-color`, each lightened by 5%.

```css
/* Hub generates 289 classes (17x17), e.g.: */
.qw-bgcolor-3-11 {
    background: linear-gradient(to bottom, transparent 0 0, #3f3b0c 0 50.5%, transparent 49.5% 100%),
                linear-gradient(to top, transparent 0 0, #37493d 0 50.5%, transparent 49.5% 100%);
}
```

For MatchScheduler, use inline styles instead:
```javascript
function getFragColorStyle(topIdx, bottomIdx) {
    const top = lighten(QW_COLORS[topIdx], 5);
    const bot = lighten(QW_COLORS[bottomIdx], 5);
    return `background: linear-gradient(to bottom, transparent 0, ${top} 0 50.5%, transparent 49.5% 100%),
            linear-gradient(to top, transparent 0, ${bot} 0 50.5%, transparent 49.5% 100%);`;
}
```

### QW Text Color Classes

```css
.qw-color-g { color: #c89b29; }  /* gold - palette[12] lightened 25% - for [] digits */
.qw-color-b { color: #7a5b33; }  /* brown - palette[1] lightened 25% - for colored chars */
```

### Colored Name Rendering (Two Systems)

**From Supabase data** (has `name` + `name_color` string):
```javascript
// name_color chars: 'w' = white, 'b' = brown, 'g' = gold
function quakeTextToHtml(text, color) {
    let result = '', lastColor = '';
    for (let i = 0; i < text.length; ++i) {
        const charColor = color[i];
        if (charColor !== lastColor) {
            if (i > 0) result += '</span>';
            result += `<span class="qw-color-${charColor}">`;
        }
        result += htmlEscape(text[i]);
        lastColor = charColor;
    }
    return result + '</span>';
}
```

**From ktxstats data** (byte-encoded QW names):
```javascript
function quakeNameToColoredHtml(bytes) {
    let str = '', type = 'normal';
    const changeType = (newType) => {
        if (type !== newType) {
            if (type !== 'normal') str += '</span>';
            if (newType !== 'normal') str += `<span class="qw-color-${newType}">`;
            type = newType;
        }
    };
    for (let i = 0; i < bytes.length; i++) {
        let ch = bytes[i];
        if (ch >= 128) ch -= 128;
        if (ch < 16 || (ch >= 29 && ch <= 31)) { changeType('normal'); str += '_'; }
        else if (ch === 16) { changeType('g'); str += '['; }
        else if (ch === 17) { changeType('g'); str += ']'; }
        else if (ch >= 18 && ch <= 27) { changeType('g'); str += String.fromCharCode(ch - 18 + 48); }
        else if (ch === 28) { changeType('normal'); str += '&#8226;'; }
        else { changeType(bytes[i] >= 160 ? 'b' : 'normal'); str += htmlEscape(String.fromCharCode(ch)); }
    }
    changeType('normal');
    return str;
}
```

### Scoreboard Layout (CSS Grid)

```scss
// Column widths
$ping-width: 42px;   // "25 ms"
$frags-width: 36px;  // "88"
$team-width: 40px;   // "Book" (max 4 chars)

.scoreboard .sc-row {
    display: grid;
    align-items: center;
    gap: 0 0.5rem;
    grid-template-columns: 42px 36px 40px auto;
    // columns: [ping] [frags] [team] [name]
}
```

**Rendering order:**
1. Team summary rows (sorted by frags desc): `[ping] [colored frags] [team name] [empty]`
2. Gradient divider: `bg-gradient-to-r from-red-400/20 via-orange-400 to-orange-400/20`
3. Player rows (sorted by frags desc): `[ping] [colored frags] [team tag] [flag + name]`

**Details:**
- No teams (1on1/FFA): hide team column → `42px 36px auto`
- Team names truncated to 4 chars (QW scoreboard limit)
- Player names: `truncate max-w-[160px]`
- Bot players: amber text (`text-amber-300/80`), ping shows "(bot)"
- Country flags: `https://www.quakeworld.nu/images/flags/{cc}.gif` (16x11px)
- Text outline for map bg readability: `text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;`

### Mapshot Background

```html
<div style="background: url(https://a.quake.world/mapshots/default.jpg) center/cover no-repeat">
  <div style="background: url(https://a.quake.world/mapshots/webp/lg/{map}.webp) center/cover no-repeat">
    <div style="background: rgb(55 65 81 / 0.2); padding: 1rem;">
      <!-- scoreboard -->
    </div>
  </div>
</div>
```

---

## 6. Stats Table Rendering (ktxstats)

The hub's detailed stats table (`DemoKtxStats.tsx`) renders per-player match statistics with columns conditional on game mode.

### Complete ktxstats TypeScript Types

From hub source `KtxstatsV3.ts`:

```typescript
type KtxstatsV3 = {
    date: string; demo: string; dm: number; duration: number;
    hostname: string; ip: string; map: string; mode: string;
    players: Player[]; port: number; teams?: string[];
    tl: number; tp: number; version: number;
};

type Player = {
    "top-color": number; "bottom-color": number; ping: number;
    login: string; name: string; team: string;
    stats: { frags: number; deaths: number; tk: number; "spawn-frags": number; kills: number; suicides: number; };
    dmg: { taken: number; given: number; team: number; self: number; "team-weapons": number; "enemy-weapons": number; "taken-to-die": number; };
    xferRL: number; xferLG: number;  // camelCase in actual JSON (not snake_case)
    spree: { max: number; quad: number; };
    control: number;
    ctf: { caps: number; "carrier-defends": number; "carrier-frags": number; defends: number; pickups: number; points: number; returns: number; runes: Record<string, number>; };
    speed: { avg: number; max: number; };
    weapons: Record<string, Weapon>; // sg, ng, ssg, sng, gl, rl, lg
    items: { health_15: { took: number }; health_25: { took: number }; health_100: { took: number }; ya: Armor; ra: Armor; ga: Armor; q: Powerup; p: Powerup; r: Powerup; };
};

type Weapon = {
    acc: { attacks: number; hits: number; };
    kills: { total: number; team: number; enemy: number; self: number; };
    deaths: number;
    pickups: { dropped: number; taken: number; "total-taken": number; "spawn-taken": number; "spawn-total-taken": number; };
    damage: { enemy: number; team: number; };
};
type Armor = { took: number; time: number; };
type Powerup = { took: number; time: number; };
```

### Team Stats Aggregation

The hub (`KtxstatsV3Enhanced.ts`) computes team-level stats by:
1. Filtering out bogus players (`ping === 0`)
2. Grouping players by `team` field
3. Deep-summing all numeric fields across players
4. Exception: `taken-to-die` is **averaged** (divided by player count)
5. Sorting teams by total frags descending

### Column Layout by Game Mode

**Always shown:** Frags, Name, Eff%, Kills, Deaths, Given(dmg), Taken(dmg), GA, YA, RA, MH

**4on4 team deathmatch adds:** Team, Bores(suicides), TKs, EWEP, To Die, SG%, LG%, RL#, LG(t/k/d), RL(t/k/d), Q, P, R

**1on1/FFA adds:** S.Frags(spawn-frags), Bores(suicides), SG%, LG%, RL#

**CTF adds:** Team, Picks, Caps, Defends, Returns, Q, P, Rune% icons (Resistance/Strength/Haste/Regen)

### Stat Calculations

```javascript
// Efficiency
eff = Math.round(100 * (kills / (kills + deaths)))

// Weapon accuracy (only show if attacks > 0)
sgPct = Math.round(100 * (weapons.sg.acc.hits / weapons.sg.acc.attacks))
lgPct = Math.round(100 * (weapons.lg.acc.hits / weapons.lg.acc.attacks))

// RL direct hits (shown as count, not %)
rlDirectHits = weapons.rl.acc.hits

// Weapon control: took / killed / dropped
lgControl = [weapons.lg.pickups.taken, weapons.lg.kills.enemy, weapons.lg.pickups.dropped]
rlControl = [weapons.rl.pickups.taken, weapons.rl.kills.enemy, weapons.rl.pickups.dropped]

// CTF rune time percentage
runeTimePct = Math.round(100 * (rune_value / stats.duration))
```

### Styling

- Zero values dimmed: `text-slate-500`
- Armor cell colors: GA = `text-green-200`, YA = `text-yellow-200`, RA = `text-red-200`, MH = `text-sky-200`
- Armor header colors: GA = `#0f0`, YA = `#ff0`, RA = `#f00`, MH = `sky-300`
- Powerup headers: Q = `#39f`, P = `#f00`, R = `#ff0`
- Weapon control: took = default, killed = `text-green-200`, dropped = `text-red-200`
- Rows: `odd:bg-slate-800`, `hover:bg-sky-900`

---

## 7. Embeddable Scoreboard (iframe)

vikpe built an embeddable URL for game scoreboards:
```html
<iframe src="https://hub.quakeworld.nu/game_scoreboard/{gameId}" />
```
This works but makes extra requests per embed. For MatchScheduler, prefer the local HTML/CSS rendering approach from section 5.

---

## 8. Hub API v2 (Live Server Data)

A separate Go-based API at `hubapi.quakeworld.nu` provides live server info. No authentication required.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `/v2/servers` | All servers |
| `/v2/servers/mvdsv` | MVDSV game servers (use this for active player detection) |
| `/v2/servers/qtv` | QTV relay servers |
| `/v2/servers/<address>` | Server details |
| `/v2/servers/<address>/lastscores` | Recent scores on server |
| `/v2/servers/<address>/laststats` | Recent stats on server |
| `/v2/demos` | Recent demos from popular servers |
| `/v2/streams` | Twitch streams casting QW |
| `/v2/events` | Upcoming events |

### `/v2/servers/mvdsv` Response Structure

Returns a JSON array of active MVDSV server objects:

```json
{
    "address": "dm6.uk:28501",
    "mode": "4on4",
    "submode": "",
    "title": "4on4 [dm6.uk]",
    "status": { "name": "Started", "description": "4on4: [12:34]" },
    "time": { "elapsed": 754, "total": 1200, "remaining": 446 },
    "player_slots": { "used": 8, "total": 16, "free": 8 },
    "players": [
        {
            "id": 36,
            "name": "ParadokS",
            "name_color": "wwwwwwwwww",
            "team": "]sr[",
            "team_color": "bwwb",
            "skin": "base",
            "colors": [3, 11],
            "frags": 46,
            "ping": 25,
            "time": 12,
            "cc": "se",
            "is_bot": false
        }
    ],
    "teams": [
        {
            "name": "]sr[",
            "name_color": "bwwb",
            "frags": 270,
            "ping": 31,
            "colors": [3, 11],
            "players": [ /* same structure as players array above */ ]
        }
    ],
    "spectator_slots": { "used": 2, "total": 8, "free": 6 },
    "spectator_names": ["razor", "unnamed"],
    "settings": { /* server cvars */ },
    "qtv_stream": {
        "title": "dm6.uk Qtv (7)",
        "url": "7@dm6.uk:28000",
        "id": 7,
        "address": "dm6.uk:28000",
        "spectator_names": ["coolguy", "unnamed"],
        "spectator_count": 2
    },
    "geo": { "cc": "DE", "country": "Germany", "region": "Europe", "city": "Frankfurt", "coordinates": [50.1, 8.7] },
    "score": 0
}
```

### Finding Players on Active Servers

A player can be in one of three places on a server. Check all three:

1. **Playing:** `server.players[]` - active players in the game
2. **Spectating:** `server.spectator_names[]` - spectators on the server
3. **Watching QTV:** `server.qtv_stream.spectator_names[]` - viewers via QTV relay

**Name matching:** Server names use QW character encoding. Use `qwToAscii()` to normalize before matching against MatchScheduler player names. Recommended: [fuse.js](https://www.fusejs.io/) for lightweight fuzzy matching (zero dependencies).

```javascript
// Collect all names from all active servers
function getActivePlayerNames(servers) {
    const names = [];
    for (const server of servers) {
        // Players (have full objects with name, team, etc.)
        for (const player of server.players) {
            if (!player.is_bot) {
                names.push({
                    name: qwToAscii(player.name).trim(),
                    status: 'playing',
                    server: server.title,
                    mode: server.mode,
                    team: player.team ? qwToAscii(player.team).trim() : null
                });
            }
        }
        // Spectators (just name strings)
        for (const specName of (server.spectator_names || [])) {
            if (specName !== 'unnamed') {
                names.push({ name: qwToAscii(specName).trim(), status: 'spectating', server: server.title });
            }
        }
        // QTV viewers (just name strings)
        for (const qtvName of (server.qtv_stream?.spectator_names || [])) {
            if (qtvName !== 'unnamed') {
                names.push({ name: qwToAscii(qtvName).trim(), status: 'watching_qtv', server: server.title });
            }
        }
    }
    return names;
}
```

---

## 9. Usage in MatchScheduler

### Current Implementation

- [QWHubService.js](../public/js/services/QWHubService.js) - Supabase match listing queries with 5-min cache

### Planned Features

| Feature | Slice | Data Sources |
|---------|-------|-------------|
| Team match history | 5.1b | Supabase (match list) + mapshots |
| Head-to-head compare | 5.1c | Supabase (H2H query) + ktxstats |
| Player performance | Future | Supabase (player FTS) + ktxstats |
| Scoreboard rendering | Future | Supabase (teams/players) + mapshots + CSS (see section 5) |

---

## 10. Rate Limits & Caching

- **Supabase API**: No documented rate limits for anon key, but use caching (5-min TTL)
- **S3 assets (d.quake.world, a.quake.world)**: Standard CloudFront CDN, no rate limits
- **Hub API v2**: No documented rate limits

**CRITICAL: Always set `&limit=` on Supabase queries.** Without a limit, the API returns up to 1000 rows by default. This wastes bandwidth and overburdens the database. Recommended limits:
- Team recent matches: `limit=5` or `limit=10`
- H2H between two teams: `limit=10`
- Never omit the limit parameter

### Caching Strategy in MatchScheduler

- Match listings: 5-minute in-memory cache per team tag
- ktxstats: Cache indefinitely (game stats never change)
- Mapshots: Browser cache (CDN handles cache headers)
- H2H data: 5-minute cache keyed by sorted team pair
