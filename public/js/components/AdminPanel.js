// AdminPanel.js - Admin bottom panel with Discord bot overview
// Slice A3: Bot connections, live recording sessions, recording counts

const AdminPanel = (function() {
    'use strict';

    let _container = null;
    let _durationInterval = null;
    let _recordingCounts = {};
    let _botTableRendered = false;

    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        _container.innerHTML = _renderShell();
        _container.addEventListener('click', _handleClick);

        // Load data in parallel
        await Promise.all([
            _loadBotRegistrations(),
            _loadRecordingSessions(),
            _loadRecordingCounts()
        ]);

        // Update live durations every second
        _durationInterval = setInterval(_updateDurations, 1000);
    }

    function _renderShell() {
        return `
            <div class="h-full flex flex-col overflow-hidden">
                <div class="admin-panel-content flex-1 overflow-auto p-4">
                    <!-- Live Recording Sessions -->
                    <div class="mb-6">
                        <h3 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                            Live Recording Sessions
                        </h3>
                        <div id="admin-live-sessions" class="space-y-2">
                            <div class="text-sm text-muted-foreground">Loading...</div>
                        </div>
                    </div>

                    <!-- Bot Connections -->
                    <div class="mb-6">
                        <h3 class="text-sm font-semibold text-foreground mb-3">
                            Bot Connections
                        </h3>
                        <div id="admin-bot-table">
                            <div class="text-sm text-muted-foreground">Loading...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ── Data Loading ──

    async function _loadBotRegistrations() {
        try {
            const registrations = await BotRegistrationService.loadAllRegistrations();
            _renderBotTable(registrations, _recordingCounts);
            _botTableRendered = true;
        } catch (error) {
            console.error('AdminPanel: Failed to load bot registrations', error);
            const el = document.getElementById('admin-bot-table');
            if (el) el.innerHTML = '<div class="text-sm text-red-400">Failed to load bot connections</div>';
        }
    }

    async function _loadRecordingSessions() {
        try {
            await RecordingSessionService.subscribeToActiveSessions(_renderLiveSessions);
        } catch (error) {
            console.error('AdminPanel: Failed to subscribe to recording sessions', error);
            const el = document.getElementById('admin-live-sessions');
            if (el) el.innerHTML = '<div class="text-sm text-red-400">Failed to load live sessions</div>';
        }
    }

    async function _loadRecordingCounts() {
        try {
            _recordingCounts = await RecordingSessionService.getRecordingCountsByTeam();
            // Re-render bot table if it was already rendered (counts arrived after registrations)
            if (_botTableRendered) {
                _loadBotRegistrations();
            }
        } catch (error) {
            console.error('AdminPanel: Failed to load recording counts', error);
        }
    }

    // ── Rendering ──

    function _renderLiveSessions(sessions) {
        const el = document.getElementById('admin-live-sessions');
        if (!el) return;

        if (sessions.length === 0) {
            el.innerHTML = '<div class="text-sm text-muted-foreground">No active recordings</div>';
            return;
        }

        el.innerHTML = sessions.map(s => {
            const teamName = TeamService.getTeamFromCache(s.teamId)?.teamName || s.guildName || 'Unknown';
            const teamTag = TeamService.getTeamFromCache(s.teamId)?.teamTag || '';
            const startTime = s.startedAt?.toDate?.() || s.startedAt || new Date();
            const startMs = startTime instanceof Date ? startTime.getTime() : new Date(startTime).getTime();
            const staleClass = s.isStale ? 'admin-session-stale' : '';
            const participants = s.participants || [];

            return `
                <div class="admin-session-card ${staleClass}" data-session-id="${s.id}" data-start="${startMs}">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-foreground">${_escapeHtml(teamTag || teamName)}</span>
                            <span class="text-xs text-muted-foreground">#${_escapeHtml(s.channelName || '')}</span>
                        </div>
                        <span class="admin-session-duration text-xs font-mono text-muted-foreground"
                              data-start="${startMs}">
                            ${_formatDuration(Date.now() - startMs)}
                        </span>
                    </div>
                    <div class="flex items-center gap-1 flex-wrap">
                        ${participants.map(p => `
                            <span class="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">${_escapeHtml(p)}</span>
                        `).join('')}
                    </div>
                    ${s.isStale ? '<div class="text-xs text-amber-400 mt-1">Heartbeat stale — may be disconnected</div>' : ''}
                </div>
            `;
        }).join('');
    }

    function _renderBotTable(registrations, recordingCounts) {
        const el = document.getElementById('admin-bot-table');
        if (!el) return;

        if (registrations.length === 0) {
            el.innerHTML = '<div class="text-sm text-muted-foreground">No teams have connected the bot yet</div>';
            return;
        }

        // Sort: active first, then by team name
        registrations.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
            return (a.teamName || '').localeCompare(b.teamName || '');
        });

        el.innerHTML = `
            <div class="admin-bot-grid text-xs">
                <div class="admin-bot-header">Team</div>
                <div class="admin-bot-header">Discord Server</div>
                <div class="admin-bot-header">Status</div>
                <div class="admin-bot-header text-right">Recordings</div>
                ${registrations.map(r => {
                    const count = recordingCounts[r.id] || 0;
                    const statusClass = r.status === 'active' ? 'text-green-400' : 'text-amber-400';
                    const knownCount = Object.keys(r.knownPlayers || {}).length;
                    return `
                        <div class="py-1.5">${_escapeHtml(r.teamName || r.teamTag || r.id)}</div>
                        <div class="py-1.5 text-muted-foreground">${_escapeHtml(r.guildName || '—')}</div>
                        <div class="py-1.5 ${statusClass}">${_escapeHtml(r.status || 'unknown')}${knownCount ? ` (${knownCount} players)` : ''}</div>
                        <div class="py-1.5 text-right">${count}</div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // ── Duration Utilities ──

    function _formatDuration(ms) {
        const secs = Math.floor(ms / 1000);
        const mins = Math.floor(secs / 60);
        const hrs = Math.floor(mins / 60);
        if (hrs > 0) return `${hrs}h ${mins % 60}m`;
        if (mins > 0) return `${mins}m ${secs % 60}s`;
        return `${secs}s`;
    }

    function _updateDurations() {
        const now = Date.now();
        document.querySelectorAll('.admin-session-duration[data-start]').forEach(el => {
            const start = parseInt(el.dataset.start);
            if (start) el.textContent = _formatDuration(now - start);
        });
    }

    // ── Utilities ──

    function _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function _handleClick(e) {
        // Future: click handlers for session cards, team rows, etc.
    }

    // ── Cleanup ──

    function cleanup() {
        if (_durationInterval) { clearInterval(_durationInterval); _durationInterval = null; }
        RecordingSessionService.unsubscribe();
        if (_container) { _container.removeEventListener('click', _handleClick); }
        _container = null;
        _recordingCounts = {};
        _botTableRendered = false;
    }

    return {
        init,
        cleanup
    };
})();
