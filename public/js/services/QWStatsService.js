// QWStatsService.js - QW Stats API wrapper with caching
// Slice 11.0a: H2H Foundation
// Slice 5.3: Multi-tag support — accepts string or string[] for team params
// Wraps qw-api.poker-affiliate.org (PostgreSQL-backed, separate from QWHub Supabase API)

const QWStatsService = (function() {
    'use strict';

    const API_BASE = 'https://qw-api.poker-affiliate.org';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const _cache = new Map();

    // Normalize tag input: string or string[] → comma-separated lowercase string
    function _normalizeTags(input) {
        if (!input) return '';
        const arr = Array.isArray(input) ? input : [input];
        return arr.map(t => t.toLowerCase()).join(',');
    }

    function _cacheKey(...parts) {
        return parts.filter(Boolean).join('_');
    }

    function _getCached(key) {
        const entry = _cache.get(key);
        if (entry && Date.now() - entry.time < CACHE_TTL) {
            return entry.data;
        }
        return null;
    }

    function _setCache(key, data) {
        _cache.set(key, { data, time: Date.now() });
    }

    /**
     * Direct matchup results between two teams.
     * @param {string|string[]} teamA - Team tag(s) (will be lowercased)
     * @param {string|string[]} teamB - Team tag(s) (will be lowercased)
     * @param {object} opts - { map, months, limit }
     * @returns {Promise<{ teamA, teamB, games: Array, total: number }>}
     */
    async function getH2H(teamA, teamB, opts = {}) {
        const a = _normalizeTags(teamA);
        const b = _normalizeTags(teamB);
        const months = opts.months || 3;
        const limit = opts.limit || 10;
        const map = opts.map || '';

        const key = _cacheKey('h2h', ...[a, b].sort(), map, months, limit);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ teamA: a, teamB: b, months, limit });
        if (map) params.set('map', map);

        const res = await fetch(`${API_BASE}/api/h2h?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /**
     * Recent results for one team against everyone.
     * @param {string|string[]} team - Team tag(s) (will be lowercased)
     * @param {object} opts - { map, months, limit }
     * @returns {Promise<{ team, games: Array, total: number }>}
     */
    async function getForm(team, opts = {}) {
        const t = _normalizeTags(team);
        const months = opts.months || 3;
        const limit = opts.limit || 10;
        const map = opts.map || '';

        const key = _cacheKey('form', t, map, months, limit);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ team: t, months, limit });
        if (map) params.set('map', map);

        const res = await fetch(`${API_BASE}/api/form?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /**
     * Map strength analysis for one or two teams.
     * @param {string|string[]} team - Team tag(s) (will be lowercased)
     * @param {object} opts - { vsTeam (string|string[]), months }
     * @returns {Promise<{ team, maps: Array, totalGames: number }>}
     */
    async function getMaps(team, opts = {}) {
        const t = _normalizeTags(team);
        const months = opts.months || 6;
        const vsTeam = opts.vsTeam ? _normalizeTags(opts.vsTeam) : '';

        const key = _cacheKey('maps', t, vsTeam, months);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ team: t, months });
        if (vsTeam) params.set('vsTeam', vsTeam);

        const res = await fetch(`${API_BASE}/api/maps?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /**
     * Roster activity and participation for a team.
     * @param {string|string[]} team - Team tag(s) (will be lowercased)
     * @param {object} opts - { months }
     * @returns {Promise<{ team, players: Array, totalPlayers: number }>}
     */
    async function getRoster(team, opts = {}) {
        const t = _normalizeTags(team);
        const months = opts.months || 3;

        const key = _cacheKey('roster', t, months);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ team: t, months });

        const res = await fetch(`${API_BASE}/api/roster?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /**
     * Unique opponents with match counts for a team.
     * @param {string|string[]} team - Team tag(s) (will be lowercased)
     * @param {object} opts - { months }
     * @returns {Promise<{ team, opponents: Array<{ tag, total, wins, losses }> }>}
     */
    async function getOpponents(team, opts = {}) {
        const t = _normalizeTags(team);
        const months = opts.months || 3;

        const key = _cacheKey('opponents', t, months);
        const cached = _getCached(key);
        if (cached) return cached;

        const params = new URLSearchParams({ team: t, months });

        const res = await fetch(`${API_BASE}/api/opponents?${params}`);
        if (!res.ok) throw new Error(`QW Stats API error: ${res.status}`);
        const data = await res.json();

        _setCache(key, data);
        return data;
    }

    /** Clear all cached data */
    function clearCache() {
        _cache.clear();
    }

    return {
        getH2H,
        getForm,
        getMaps,
        getRoster,
        getOpponents,
        clearCache
    };
})();
