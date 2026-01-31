---
name: qwhub-api
description: QWHub API for QuakeWorld match history, game stats, player stats, team comparisons, head-to-head, mapshots. Use when working with QWHubService, match data, ktxstats, or any feature displaying game results from hub.quakeworld.nu.
user-invocable: false
---

# QWHub API Integration

QuakeWorld Hub (hub.quakeworld.nu) is the central source for all QW match data. Three data sources, all public, no auth except the Supabase anon key.

**Hub source code:** https://github.com/quakeworldnu/hub.quakeworld.nu

## Data Sources

| Source | What | Base URL |
|--------|------|----------|
| Supabase | Match listings (teams, scores, players) | `ncsphkjfominimxztjip.supabase.co/rest/v1/v1_games` |
| S3 ktxstats | Detailed per-player stats per game | `d.quake.world/{sha[0:3]}/{sha}.mvd.ktxstats.json` |
| S3 mapshots | Map background images (webp) | `a.quake.world/mapshots/webp/{sm|lg}/{map}.webp` |

## 1. Supabase Match Listings

**Auth header required on every request:**
```javascript
headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jc3Boa2pmb21pbmlteHp0amlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTY5Mzg1NjMsImV4cCI6MjAxMjUxNDU2M30.NN6hjlEW-qB4Og9hWAVlgvUdwrbBO13s8OkAJuBGVbo' }
```

**Key query patterns (PostgREST syntax):**
```
# Recent 4on4 matches for a team
?select=id,timestamp,mode,map,teams,players,demo_sha256
&mode=eq.4on4&team_names=cs.{]sr[}&order=timestamp.desc&limit=10

# Head-to-head between two teams (ALWAYS set limit!)
&team_names=cs.{]sr[,pol}&limit=10

# Filter by map, date, matchtag
&map=eq.dm2
&timestamp=gte.2026-01-01
&matchtag=eq.prac

# Player full-text search
&players_fts=fts.paradok

# Result count: add header Prefer: count=exact, read Content-Range response header
```

**CRITICAL: Team names are stored LOWERCASE in the API.** Always `.toLowerCase()` the tag before querying.
Our `teamTag` field may have mixed case (e.g. `Book`, `tSQ`, `GoF!`) but the API expects `book`, `tsq`, `gof!`.

**CRITICAL: Always set `&limit=` on queries.** Without a limit, the API returns up to 1000 rows by default. Use `limit=5` for team recent matches, `limit=10` for H2H.

**Team name encoding:** `cs.{teamA,teamB}` URL-encoded = `cs.%7BteamA%2CteamB%7D`

**Response structure - each match:**
```json
{
  "id": 194345,
  "timestamp": "2026-01-29T22:51:34+00:00",
  "mode": "4on4",
  "map": "dm2",
  "matchtag": "prac",
  "server_hostname": "Berlin KTX Server antilag #2",
  "demo_sha256": "211b41fd...",
  "demo_source_url": "http://..../file.mvd",
  "teams": [
    { "name": "]sr[", "ping": 33, "color": [3,11], "frags": 270, "name_color": "bwwb" },
    { "name": "pol", "ping": 25, "color": [0,6], "frags": 161, "name_color": "www" }
  ],
  "players": [
    { "name": "ParadokS", "ping": 25, "team": "]sr[", "color": [3,11], "frags": 46, "is_bot": false, "name_color": "wwwwwwwwww", "team_color": "bwwb" }
  ]
}
```

## 2. ktxstats (Detailed Game Stats)

**URL:** `https://d.quake.world/{sha256.substring(0,3)}/{sha256}.mvd.ktxstats.json`

No auth. Returns JSON (despite `Content-Type: application/octet-stream`). Use `response.json()`.

**Per-player data includes:**
- `stats`: frags, deaths, tk, spawn-frags, kills, suicides
- `dmg`: taken, given, team, self, enemy-weapons, taken-to-die
- `spree`: max streak, quad kills
- `speed`: max, avg movement speed
- `weapons.{axe,sg,ssg,ng,sng,gl,rl,lg}`: each with acc (attacks/hits), kills, deaths, pickups, damage
- `xferRL`, `xferLG`: weapon transfers (teammate picked up a dropped RL/LG) - top-level on player, NOT inside weapons
- `items`: health_15/25/100, ga, ya, ra, q (quad), p (pent), r (ring) - with took count and time held
- `ctf`: caps, carrier-defends, carrier-frags, defends, pickups, points, returns, runes

**Complete ktxstats TypeScript types** (from hub source `KtxstatsV3.ts`):
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
  xferRL: number; xferLG: number;  // camelCase! Weapon transfers (teammate picked up dropped weapon)
  spree: { max: number; quad: number; };
  control: number;
  ctf: { caps: number; "carrier-defends": number; "carrier-frags": number; defends: number; pickups: number; points: number; returns: number; runes: { "0": number; "1": number; "2": number; "3": number; }; };
  speed: { avg: number; max: number; };
  weapons: { sg: Weapon; ng: Weapon; ssg: Weapon; sng: Weapon; gl: Weapon; rl: Weapon; lg: Weapon; };
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

**Team stats (enhanced):** The hub aggregates player stats into team-level stats by summing all numeric fields across players on the same team. `taken-to-die` is averaged instead of summed (divided by player count). Teams are sorted by total frags. Only calculated when `teams` array exists and >2 players.

**Derived stats (calculate yourself):**
```javascript
eff = kills / (kills + deaths) * 100
sgAcc = weapons.sg.acc.hits / weapons.sg.acc.attacks * 100
rlAcc = weapons.rl.acc.hits / weapons.rl.acc.attacks * 100
lgAcc = weapons.lg?.acc.hits / weapons.lg?.acc.attacks * 100  // lg may not exist
rlDirectHits = weapons.rl.acc.hits   // shown as "RL#" column
```

**Filtering bogus players:** Filter out players with `ping === 0` (disconnected/bogus entries). The hub does this: `filter(player => player.ping !== 0)`.

## 3. Mapshots

**URL:** `https://a.quake.world/mapshots/webp/{size}/{mapname}.webp`

Sizes: `sm` (~11-25KB thumbnails), `lg` (~40-100KB detail/backgrounds). No auth.

**Fallback:** `https://a.quake.world/mapshots/default.jpg` (used when map image not found).

## 4. Hub Website Links

```javascript
// Team match history page
`https://hub.quakeworld.nu/games/?mode=4on4&team=${encodeURIComponent(teamTag)}`
// Specific game
`https://hub.quakeworld.nu/games/?gameId=${gameId}`
// Embeddable game scoreboard (iframe)
`https://hub.quakeworld.nu/game_scoreboard/${gameId}`
```

**Note:** The iframe scoreboard endpoint exists but makes extra requests per embed. For MatchScheduler, render scoreboards locally using the data + CSS approach described in section 9.

## 5. Existing Implementation

- **Service:** `public/js/services/QWHubService.js` - match listings with 5-min cache
- **Reference:** `context/QWHUB-API-REFERENCE.md` - full schema details, all fields documented
- **Slices:** 5.1b (match history), 5.1c (H2H compare) use this API

## 6. Caching Rules

- Match listings: 5-min TTL per team tag (in-memory Map)
- ktxstats: Cache indefinitely (game stats never change)
- H2H: 5-min TTL keyed by sorted team pair
- Mapshots: Browser/CDN cache

## 7. Other Available Tables

| Table | Key Fields |
|-------|-----------|
| `players` | id, name, slug, qw_auth, user_id |
| `profiles` | user_id, name, cc (country), city, hardware, socials |
| `maps` | name, message, author_names, modes |
| `event_series` | id, name, abbreviation, slug |

## 8. QW Character Encoding

Two encoding systems exist depending on data source:

### 8a. Supabase data: `name_color` string encoding
Used in `teams[].name_color`, `players[].name_color`, `players[].team_color`. Each character maps to a color class:
- `w` = white/normal text (CSS class `qw-color-w` or no class)
- `b` = brown/gold text (CSS class `qw-color-b`)
- `g` = green/gold text (CSS class `qw-color-g`)

**Rendering colored names from Supabase data** (how the hub does it):
```javascript
// From hub src/QuakeText.jsx
function quakeTextToHtml(text, color) {
    let result = '';
    let lastColor = '';
    for (let i = 0; i < text.length; ++i) {
        const charColor = color[i];
        if (charColor !== lastColor) {
            if (i > 0) result += '</span>';
            result += `<span class="qw-color-${charColor}">`;
        }
        // HTML-escape <, >, " chars
        result += htmlEscape(text[i]);
        lastColor = charColor;
    }
    result += '</span>';
    return result;
}
```

### 8b. ktxstats data: byte-level QW encoding
Used in raw ktxstats JSON `player.name` and `player.team` fields. Characters are byte values:
- Chars >= 128: "brown/colored" variants - subtract 128 for base char, render with `qw-color-b` class
- Chars 0-15 (and 29-31): special symbols (see lookup below)
- Chars 16-17: `[` and `]` (rendered with `qw-color-g` class)
- Chars 18-27: digits 0-9 (rendered with `qw-color-g` class)
- Chars 28: bullet (`qw-color-normal`)
- Chars 32+: standard ASCII

**Rendering colored names from ktxstats** (how the hub does it - `QuakeText.tsx`):
```javascript
function quakeNameToColoredHtml(bytes) {
    let str = '';
    let type = 'normal';
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
        if (ch < 16 || (ch >= 29 && ch <= 31)) {
            changeType('normal'); str += '_';
        } else if (ch === 16) {
            changeType('g'); str += '[';
        } else if (ch === 17) {
            changeType('g'); str += ']';
        } else if (ch >= 18 && ch <= 27) {
            changeType('g'); str += String.fromCharCode(ch - 18 + 48);
        } else if (ch === 28) {
            changeType('normal'); str += '&#8226;';
        } else {
            changeType(bytes[i] >= 160 ? 'b' : 'normal'); // 128+32=160
            str += htmlEscape(String.fromCharCode(ch));
        }
    }
    changeType('normal');
    return str;
}
```

### 8c. ASCII conversion (for matching/comparing, not display)
```javascript
const QW_CHAR_LOOKUP = {
    0:'=', 2:'=', 5:'\u2022', 10:' ', 14:'\u2022', 15:'\u2022',
    16:'[', 17:']', 18:'0', 19:'1', 20:'2', 21:'3', 22:'4',
    23:'5', 24:'6', 25:'7', 26:'8', 27:'9', 28:'\u2022',
    29:'=', 30:'=', 31:'='
};
function qwToAscii(name) {
    return Array.from(name).map(ch => {
        let code = ch.charCodeAt(0);
        if (code >= 128) code -= 128;
        if (code >= 32) return String.fromCharCode(code);
        return QW_CHAR_LOOKUP[code] || '?';
    }).join('');
}
```

## 9. Scoreboard Rendering

The hub renders scoreboards as pure HTML/CSS, not screenshots. We replicate this approach locally for full control and no extra network requests.

**Source reference:** `hub.quakeworld.nu/src/servers/Scoreboard.jsx`, `_scoreboard.scss`, `_quake_colors.scss`

### 9a. QW Color Palette (17 colors, indices 0-16)

These are the Quake player/team jersey colors. Used in `teams[].color` and `players[].color` arrays as `[top-color, bottom-color]`.

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
    16: 'rgb(0,0,0)'       // black (used for 2-tone gradient)
};
```

### 9b. Player Frag Colors (two-tone gradient)

Each player/team has `color: [topColor, bottomColor]`. The hub renders frags with a vertical split gradient: top half in top-color, bottom half in bottom-color, each lightened by 5%.

```css
/* Hub generates 17x17 = 289 classes like: */
.qw-bgcolor-3-11 {
    background: linear-gradient(
        to bottom,
        transparent 0 0, #3f3b0c 0 50.5%, transparent 49.5% 100%
    ),
    linear-gradient(
        to top,
        transparent 0 0, #37493d 0 50.5%, transparent 49.5% 100%
    );
}
```

**For MatchScheduler** - use inline styles instead of 289 classes:
```javascript
function getFragColorStyle(topIdx, bottomIdx) {
    const top = lighten(QW_COLORS[topIdx], 5);
    const bot = lighten(QW_COLORS[bottomIdx], 5);
    return `background: linear-gradient(to bottom, transparent 0, ${top} 0 50.5%, transparent 49.5% 100%), linear-gradient(to top, transparent 0, ${bot} 0 50.5%, transparent 49.5% 100%);`;
}
```

### 9c. QW Text Color Classes (for name rendering)

```css
/* Gold/green text (for brackets [], digits in team names) */
.qw-color-g { color: #c89b29; }  /* gold - palette[12] lightened 25% */

/* Brown text (for "colored" chars >= 128) */
.qw-color-b { color: #7a5b33; }  /* brown - palette[1] lightened 25% */
```

### 9d. Scoreboard Layout (CSS Grid)

The hub scoreboard uses a CSS grid with 4 columns:
```scss
// Column widths
$ping-width: 42px;   // e.g. "25 ms"
$frags-width: 36px;  // e.g. "88"
$team-width: 40px;   // e.g. "Book" (max 4 chars)

.scoreboard {
    display: grid;
    font-size: 0.875rem; // text-sm

    .sc-row {
        display: grid;
        align-items: center;
        gap: 0 0.5rem;
        grid-template-columns: 42px 36px 40px auto;
        // columns: [ping] [frags] [team] [name]
    }
}
```

**Row structure:** `[ping] [colored frags] [team tag] [player name with flag]`

When no teams (1on1/FFA): hide team column, grid becomes `42px 36px auto`.
When hiding frags (live scoreboard): text made transparent.

### 9e. Scoreboard Component Structure

From hub `Scoreboard.jsx` - the rendering order:
1. **Team summary rows** (sorted by frags desc): `[ping] [colored frags] [team name] [empty]`
2. **Gradient divider**: red-to-orange horizontal line between teams and players
3. **Player rows** (sorted by frags desc): `[ping] [colored frags] [team tag] [flag + name]`

Team names truncated to 4 chars (QW scoreboard limit).
Player names truncated to 160px with CSS `truncate`.
Bot players shown in amber text (`text-amber-300/80`), ping shows "(bot)".
Country flags: `https://www.quakeworld.nu/images/flags/{cc}.gif` (16x11px).

### 9f. Mapshot Background

Scoreboards are overlaid on map background images:
```html
<!-- Outer: default fallback -->
<div style="background-image: url(https://a.quake.world/mapshots/default.jpg)">
  <!-- Inner: actual map image -->
  <div style="background-image: url(https://a.quake.world/mapshots/webp/lg/{map}.webp);
              background-size: cover; background-position: center;">
    <!-- Semi-transparent overlay for readability -->
    <div style="background: rgb(55 65 81 / 0.2); padding: 1rem;">
      <!-- scoreboard content here -->
    </div>
  </div>
</div>
```

### 9g. Text Outline (readability on map backgrounds)

The hub uses `app-text-outline` class for text-shadow to ensure readability over map images. Implement as:
```css
.app-text-outline {
    text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
}
```

## 10. Stats Table Rendering (ktxstats)

The hub's detailed stats table (`DemoKtxStats.tsx`) shows per-player match statistics with conditional columns based on game mode.

### 10a. Column Layout by Mode

**Always shown:** Frags, Name, Eff%, Kills, Deaths, Given, Taken, GA, YA, RA, MH

**4on4 team deathmatch adds:** Team, Bores(suicides), TKs, EWEP, To Die, SG%, LG%, RL#, LG(t/k/d), RL(t/k/d), Q, P, R

**1on1/FFA adds:** S.Frags(spawn-frags), Bores, SG%, LG%, RL#

**CTF adds:** Team, Picks, Caps, Defends, Returns, Q, P, Rune icons (Resistance/Strength/Haste/Regen as %)

### 10b. Stat Calculations

```javascript
// Efficiency
eff = Math.round(100 * (kills / (kills + deaths)))

// Weapon accuracy (only show if attacks > 0)
sgPct = Math.round(100 * (weapons.sg.acc.hits / weapons.sg.acc.attacks))
lgPct = Math.round(100 * (weapons.lg.acc.hits / weapons.lg.acc.attacks))

// RL direct hits = weapons.rl.acc.hits (shown as count, not percentage)

// LG/RL weapon control columns: (took / killed / dropped)
lgControl = [weapons.lg.pickups.taken, weapons.lg.kills.enemy, weapons.lg.pickups.dropped]
rlControl = [weapons.rl.pickups.taken, weapons.rl.kills.enemy, weapons.rl.pickups.dropped]

// CTF rune time as percentage of game duration
runeTimePct = Math.round(100 * (rune_value / stats.duration))
```

### 10c. Styling Details

- Zero values shown dimmed: `<span class="text-slate-500">0</span>`
- Armor colors: GA = `text-green-200`, YA = `text-yellow-200`, RA = `text-red-200`, MH = `text-sky-200`
- Header colors: GA = `text-[#0f0]`, YA = `text-[#ff0]`, RA = `text-[#f00]`, MH = `text-sky-300`
- Powerup header colors: Q = `text-[#39f]`, P = `text-[#f00]`, R = `text-[#ff0]`
- LG/RL weapon control: took = default, killed = `text-green-200`, dropped = `text-red-200`
- Alternating row bg: `odd:bg-slate-800`, hover: `hover:bg-sky-900`
- Team summary rows appear first, separated from player rows by empty spacer rows
- Player names rendered using `QuakeTextFromByteString` (byte-level QW encoding)
