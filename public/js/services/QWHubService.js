// QWHubService.js - Fetch match history from QW Hub API
// Slice 5.1b: Team Match History
// Read-only external API service with in-memory caching

const QWHubService = (function() {
    'use strict';

    const API_BASE = 'https://ncsphkjfominimxztjip.supabase.co/rest/v1/v1_games';
    const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jc3Boa2pmb21pbmlteHp0amlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTY5Mzg1NjMsImV4cCI6MjAxMjUxNDU2M30.NN6hjlEW-qB4Og9hWAVlgvUdwrbBO13s8OkAJuBGVbo';

    const _matchCache = new Map(); // teamTag -> { data, fetchedAt }
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Fetch recent 4on4 matches for a team by tag.
     * Returns transformed match objects from cache or API.
     */
    async function getRecentMatches(teamTag, limit = 5) {
        if (!teamTag) return [];

        // QWHub stores team names in lowercase
        const apiTag = teamTag.toLowerCase();

        // Check cache (HOT PATH)
        const cached = _matchCache.get(apiTag);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
            return cached.data.slice(0, limit);
        }

        // Fetch from API (COLD PATH)
        const encodedTag = encodeURIComponent(`{${apiTag}}`);
        const url = `${API_BASE}` +
            `?select=id,timestamp,mode,map,teams,players,demo_sha256` +
            `&mode=eq.4on4` +
            `&team_names=cs.${encodedTag}` +
            `&order=timestamp.desc` +
            `&limit=${limit}`;

        const response = await fetch(url, {
            headers: { 'apikey': API_KEY }
        });

        if (!response.ok) {
            throw new Error(`QW Hub API error: ${response.status}`);
        }

        const rawData = await response.json();
        const matches = rawData.map(match => _transformMatch(match, apiTag));

        _matchCache.set(apiTag, {
            data: matches,
            fetchedAt: Date.now()
        });

        return matches;
    }

    /**
     * Transform raw API match into our internal format.
     */
    function _transformMatch(apiMatch, ourTeamTag) {
        const ourTeam = apiMatch.teams.find(t =>
            t.name.toLowerCase() === ourTeamTag.toLowerCase()
        );
        const opponent = apiMatch.teams.find(t =>
            t.name.toLowerCase() !== ourTeamTag.toLowerCase()
        );

        const won = ourTeam && opponent && ourTeam.frags > opponent.frags;
        const lost = ourTeam && opponent && ourTeam.frags < opponent.frags;

        return {
            id: apiMatch.id,
            date: new Date(apiMatch.timestamp),
            map: apiMatch.map,
            ourTag: ourTeam?.name || ourTeamTag,
            ourScore: ourTeam?.frags || 0,
            opponentTag: opponent?.name || '???',
            opponentScore: opponent?.frags || 0,
            result: won ? 'W' : lost ? 'L' : 'D',
            demoHash: apiMatch.demo_sha256,
            // Raw Supabase data for hub-style scoreboard rendering
            teams: apiMatch.teams || [],
            players: apiMatch.players || []
        };
    }

    /**
     * Generate QW Hub URL filtered to a team's 4on4 matches.
     */
    function getHubUrl(teamTag) {
        return `https://hub.quakeworld.nu/games/?mode=4on4&team=${encodeURIComponent(teamTag)}`;
    }

    /**
     * Generate QW Hub URL for a specific match.
     */
    function getMatchUrl(matchId) {
        return `https://hub.quakeworld.nu/games/${matchId}`;
    }

    // --- ktxstats (detailed per-player game stats) ---

    const _statsCache = new Map(); // demoSha256 -> stats object (never expires)

    /**
     * Fetch detailed game stats from ktxstats S3.
     * Stats are immutable so cache indefinitely.
     */
    async function getGameStats(demoSha256) {
        if (!demoSha256) return null;

        const cached = _statsCache.get(demoSha256);
        if (cached) return cached;

        const prefix = demoSha256.substring(0, 3);
        const url = `https://d.quake.world/${prefix}/${demoSha256}.mvd.ktxstats.json`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`ktxstats fetch error: ${response.status}`);
        }

        const stats = await response.json();
        _statsCache.set(demoSha256, stats);
        return stats;
    }

    // --- Mapshot URLs ---

    /**
     * Get map background image URL.
     * @param {string} mapName - e.g. "dm2", "e1m2"
     * @param {'sm'|'lg'} size - sm (~15KB thumbs) or lg (~60KB backgrounds)
     */
    function getMapshotUrl(mapName, size = 'lg') {
        return `https://a.quake.world/mapshots/webp/${size}/${mapName}.webp`;
    }

    // --- QW Color Palette & Rendering (from hub source) ---

    const QW_COLORS = [
        [140,140,140], // 0  gray
        [83,59,27],    // 1  dark brown
        [79,79,115],   // 2  slate blue
        [55,55,7],     // 3  dark olive
        [71,0,0],      // 4  dark red
        [95,71,7],     // 5  bronze
        [143,67,51],   // 6  rust/salmon
        [127,83,63],   // 7  tan
        [87,55,67],    // 8  mauve
        [95,51,63],    // 9  plum
        [107,87,71],   // 10 khaki
        [47,67,55],    // 11 forest green
        [123,99,7],    // 12 gold/olive
        [47,47,127],   // 13 royal blue
        [183,51,15],   // 14 bright orange-red
        [103,0,0],     // 15 crimson
        [0,0,0]        // 16 black
    ];

    /**
     * Lighten an RGB color by a percentage (hub uses 5%).
     */
    function _lighten([r, g, b], pct) {
        const f = pct / 100;
        return [
            Math.min(255, Math.round(r + (255 - r) * f)),
            Math.min(255, Math.round(g + (255 - g) * f)),
            Math.min(255, Math.round(b + (255 - b) * f))
        ];
    }

    /**
     * Get inline CSS for the two-tone frag color gradient.
     * Exact replica of hub's _quake_colors.scss gradient.
     * @param {number[]} colors - [topColorIdx, bottomColorIdx]
     */
    function getFragColorStyle(colors) {
        if (!colors || colors.length < 2) return '';
        const top = _lighten(QW_COLORS[colors[0]] || QW_COLORS[0], 5);
        const bot = _lighten(QW_COLORS[colors[1]] || QW_COLORS[0], 5);
        const t = `rgb(${top.join(',')})`;
        const b = `rgb(${bot.join(',')})`;
        return `background:linear-gradient(to bottom,transparent 0,${t} 0 50.5%,transparent 49.5% 100%),linear-gradient(to top,transparent 0,${b} 0 50.5%,transparent 49.5% 100%)`;
    }

    /**
     * Render a colored QW name from Supabase data (name + name_color).
     * Exact replica of hub's QuakeText.jsx quakeTextToHtml().
     * @param {string} name - Display name
     * @param {string} nameColor - Color string (e.g., "bwwb")
     */
    function coloredQuakeName(name, nameColor) {
        if (!nameColor) return _escapeHtml(name);
        let result = '';
        let lastColor = '';
        for (let i = 0; i < name.length; i++) {
            const charColor = nameColor[i] || 'w';
            if (charColor !== lastColor) {
                if (i > 0) result += '</span>';
                result += `<span class="qw-color-${charColor}">`;
            }
            const ch = name[i];
            if (ch === '<') result += '&lt;';
            else if (ch === '>') result += '&gt;';
            else if (ch === '"') result += '&quot;';
            else result += ch;
            lastColor = charColor;
        }
        result += '</span>';
        return result;
    }

    function _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --- QW Character Encoding ---

    const QW_CHAR_LOOKUP = {
        0:'=', 2:'=', 5:'\u2022', 10:' ', 14:'\u2022', 15:'\u2022',
        16:'[', 17:']', 18:'0', 19:'1', 20:'2', 21:'3', 22:'4',
        23:'5', 24:'6', 25:'7', 26:'8', 27:'9', 28:'\u2022',
        29:'=', 30:'=', 31:'='
    };

    /**
     * Convert QW-encoded unicode string to readable ASCII.
     * ktxstats names use chars >= 128 for "colored" text (subtract 128),
     * and chars 0-31 for special symbols like [], digits, bullets.
     */
    function qwToAscii(name) {
        return Array.from(name).map(ch => {
            let code = ch.charCodeAt(0);
            if (code >= 128) code -= 128;
            if (code >= 32) return String.fromCharCode(code);
            return QW_CHAR_LOOKUP[code] || '?';
        }).join('');
    }

    /**
     * Fetch match data for map activity summary.
     * Returns aggregated stats: { totalMatches, months, maps: [{ map, total, wins, losses, draws }] }
     * Fetches up to 50 4on4 matches within the date range.
     */
    async function getTeamMapStats(teamTag, months = 6) {
        if (!teamTag) return null;

        const apiTag = teamTag.toLowerCase();
        const cacheKey = `mapstats_${apiTag}_${months}`;

        // Check cache (HOT PATH)
        const cached = _matchCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
            return cached.data;
        }

        // Calculate date range
        const since = new Date();
        since.setMonth(since.getMonth() - months);
        const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

        const encodedTag = encodeURIComponent(`{${apiTag}}`);
        const url = `${API_BASE}` +
            `?select=id,timestamp,map,teams` +
            `&mode=eq.4on4` +
            `&team_names=cs.${encodedTag}` +
            `&timestamp=gte.${sinceStr}` +
            `&order=timestamp.desc` +
            `&limit=50`;

        const response = await fetch(url, {
            headers: { 'apikey': API_KEY }
        });

        if (!response.ok) {
            throw new Error(`QW Hub API error: ${response.status}`);
        }

        const rawData = await response.json();

        // Aggregate by map
        const mapAgg = {};
        rawData.forEach(match => {
            const map = match.map;
            if (!mapAgg[map]) {
                mapAgg[map] = { map, total: 0, wins: 0, losses: 0, draws: 0 };
            }
            mapAgg[map].total++;

            const ourTeam = match.teams.find(t => t.name.toLowerCase() === apiTag);
            const opponent = match.teams.find(t => t.name.toLowerCase() !== apiTag);
            if (ourTeam && opponent) {
                if (ourTeam.frags > opponent.frags) mapAgg[map].wins++;
                else if (ourTeam.frags < opponent.frags) mapAgg[map].losses++;
                else mapAgg[map].draws++;
            }
        });

        // Sort by total matches descending
        const maps = Object.values(mapAgg).sort((a, b) => b.total - a.total);

        const result = {
            totalMatches: rawData.length,
            months,
            maps
        };

        _matchCache.set(cacheKey, {
            data: result,
            fetchedAt: Date.now()
        });

        return result;
    }

    /**
     * Clear all cached match data.
     */
    function clearCache() {
        _matchCache.clear();
        _statsCache.clear();
    }

    return {
        getRecentMatches,
        getTeamMapStats,
        getGameStats,
        getHubUrl,
        getMatchUrl,
        getMapshotUrl,
        qwToAscii,
        getFragColorStyle,
        coloredQuakeName,
        clearCache
    };
})();
