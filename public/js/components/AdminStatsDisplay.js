// AdminStatsDisplay - Render 3 engagement metric cards in left sidebar
// Slice A2: Admin Sidebar Stats

const AdminStatsDisplay = (function() {
    'use strict';

    let _container = null;

    async function init(containerId) {
        _container = document.getElementById(containerId);
        if (!_container) return;

        _renderLoading();

        try {
            const currentWeekId = AdminStatsService._getCurrentWeekId();
            const prevWeekId = AdminStatsService._getPreviousWeekId();

            const [current, previous] = await Promise.all([
                AdminStatsService.getWeekStats(currentWeekId),
                AdminStatsService.getWeekStats(prevWeekId)
            ]);

            if (!_container) return; // Component cleaned up while loading
            _render(current, previous, currentWeekId);
        } catch (error) {
            console.error('AdminStatsDisplay: Failed to load stats', error);
            if (_container) {
                _container.innerHTML = `
                    <div class="admin-stats-display px-3 py-2">
                        <div class="text-xs text-muted-foreground">Failed to load stats</div>
                    </div>
                `;
            }
        }
    }

    function _renderLoading() {
        _container.innerHTML = `
            <div class="admin-stats-display px-3 py-2 space-y-3">
                <div class="text-xs text-muted-foreground uppercase tracking-wider mb-2">Loading stats...</div>
                <div class="admin-stat-card animate-pulse h-14"></div>
                <div class="admin-stat-card animate-pulse h-14"></div>
                <div class="admin-stat-card animate-pulse h-14"></div>
            </div>
        `;
    }

    function _render(current, previous, currentWeekId) {
        if (!_container) return;

        _container.innerHTML = `
            <div class="admin-stats-display px-3 py-2 space-y-3">
                <div class="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Week ${currentWeekId.split('-')[1]} Activity
                </div>
                ${_renderStatCard('Active Users', current.activeUsers, previous?.activeUsers, 'users who marked availability')}
                ${_renderStatCard('Proposals', current.proposalCount, previous?.proposalCount, 'match proposals sent')}
                ${_renderStatCard('Matches', current.scheduledCount, previous?.scheduledCount, 'matches scheduled')}
            </div>
        `;
    }

    function _renderStatCard(label, current, previous, description) {
        const delta = previous != null ? current - previous : null;
        const deltaClass = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-muted-foreground';
        const deltaIcon = delta > 0 ? '\u2191' : delta < 0 ? '\u2193' : '\u2013';
        const deltaText = delta != null ? `${deltaIcon} ${Math.abs(delta)} vs last week` : 'no previous data';

        return `
            <div class="admin-stat-card">
                <div class="flex items-baseline justify-between">
                    <span class="text-2xl font-bold text-foreground">${current}</span>
                    <span class="text-xs ${deltaClass}">${deltaText}</span>
                </div>
                <div class="text-xs text-muted-foreground mt-0.5">${label} \u2014 ${description}</div>
            </div>
        `;
    }

    function cleanup() {
        _container = null;
    }

    return { init, cleanup };
})();
