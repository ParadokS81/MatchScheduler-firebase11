// OverflowModal.js - Shows all players available for a slot (mobile fallback)
// Following CLAUDE.md architecture: Revealing Module Pattern

const OverflowModal = (function() {
    'use strict';

    let _container = null;
    let _isOpen = false;
    let _keydownHandler = null;

    /**
     * Escape HTML to prevent XSS
     */
    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function _getRefDate(weekId) {
        if (!weekId) return undefined;
        const weekNum = parseInt(weekId.split('-')[1], 10);
        if (isNaN(weekNum)) return undefined;

        const year = new Date().getUTCFullYear();
        const jan1 = new Date(Date.UTC(year, 0, 1));
        const dayOfWeek = jan1.getUTCDay();
        const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
        const firstMonday = new Date(Date.UTC(year, 0, 1 + daysToFirstMonday));
        const monday = new Date(firstMonday);
        monday.setUTCDate(firstMonday.getUTCDate() + (weekNum - 1) * 7);
        return monday;
    }

    function _render(utcSlotId, weekId, players, currentUserId) {
        // Format UTC slot ID for display in user's local timezone
        let formattedDay, formattedTime;
        if (typeof TimezoneService !== 'undefined') {
            const refDate = _getRefDate(weekId);
            const display = TimezoneService.formatSlotForDisplay(utcSlotId, refDate);
            formattedDay = display.dayLabel;
            formattedTime = display.timeLabel;
        } else {
            const [day, time] = utcSlotId.split('_');
            const dayNames = {
                mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
                thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
            };
            formattedDay = dayNames[day] || day;
            formattedTime = `${time.slice(0, 2)}:${time.slice(2)}`;
        }

        // Format week ID (e.g., "2026-05" → "Week 5")
        const weekNumber = weekId.split('-')[1]?.replace(/^0/, '') || weekId;

        const playersHtml = players.map(player => {
            const isCurrentUser = player.userId === currentUserId;
            const currentUserBadge = isCurrentUser ? '<span class="text-xs text-primary ml-2">(You)</span>' : '';

            return `
                <div class="flex items-center gap-3 p-2 rounded ${isCurrentUser ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'}">
                    <div class="player-badge initials ${isCurrentUser ? 'current-user' : ''}">
                        ${_escapeHtml(player.initials)}
                    </div>
                    <span class="text-sm text-foreground">${_escapeHtml(player.displayName)}${currentUserBadge}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="overflow-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <div>
                            <h2 class="text-lg font-semibold text-foreground">Available Players</h2>
                            <p class="text-sm text-muted-foreground">${formattedDay} ${formattedTime} - Week ${weekNumber}</p>
                        </div>
                        <button id="overflow-modal-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 max-h-80 overflow-y-auto">
                        <p class="text-sm text-muted-foreground mb-3">
                            ${players.length} player${players.length !== 1 ? 's' : ''} available
                        </p>
                        <div class="space-y-2">
                            ${playersHtml}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-4 border-t border-border">
                        <button id="overflow-modal-done"
                                class="btn btn-primary w-full">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function _attachListeners() {
        const backdrop = document.getElementById('overflow-modal-backdrop');
        const closeBtn = document.getElementById('overflow-modal-close');
        const doneBtn = document.getElementById('overflow-modal-done');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);
        doneBtn?.addEventListener('click', close);

        // ESC key to close
        _keydownHandler = (e) => {
            if (e.key === 'Escape' && _isOpen) {
                close();
            }
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    /**
     * Show the overflow modal with player list
     * @param {string} slotId - The slot ID (e.g., "mon_1900")
     * @param {string} weekId - The week ID (e.g., "2026-05")
     * @param {Array<string>} playerIds - Array of user IDs
     * @param {Array} playerRoster - Team's playerRoster array
     * @param {string} currentUserId - Current user's ID
     */
    function show(slotId, weekId, playerIds, playerRoster, currentUserId) {
        // Get player display info
        const players = PlayerDisplayService.getPlayersDisplay(playerIds, playerRoster, currentUserId);

        // Sort: current user first, then alphabetically
        players.sort((a, b) => {
            if (a.isCurrentUser) return -1;
            if (b.isCurrentUser) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        // Create modal container if needed
        if (!_container) {
            _container = document.createElement('div');
            _container.id = 'overflow-modal-container';
            document.body.appendChild(_container);
        }

        _container.innerHTML = _render(slotId, weekId, players, currentUserId);
        _attachListeners();
        _isOpen = true;
    }

    function close() {
        if (_container) {
            _container.innerHTML = '';
        }
        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
        _isOpen = false;
    }

    function isOpen() {
        return _isOpen;
    }

    function cleanup() {
        close();
        if (_container) {
            _container.remove();
            _container = null;
        }
    }

    return {
        show,
        close,
        isOpen,
        cleanup
    };
})();
