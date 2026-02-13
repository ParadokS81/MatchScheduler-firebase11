// MatchSealedModal.js - Notification modal shown when a match is sealed (second confirmation)
// Provides a Discord message template for the confirming party to notify the opponent

const MatchSealedModal = (function() {
    'use strict';

    let _container = null;
    let _isOpen = false;
    let _keydownHandler = null;

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format a scheduled date + slot into a human-readable string
     * e.g. "2026-02-12" + "thu_2200" → "Feb 12 Thu 22:00"
     */
    function _formatMatchDateTime(scheduledDate, slotId) {
        const [, time] = slotId.split('_');
        const timeFormatted = `${time.slice(0, 2)}:${time.slice(2)}`;

        // Parse date
        const [year, month, day] = scheduledDate.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        return `${monthNames[date.getMonth()]} ${day} ${dayNames[date.getDay()]} ${timeFormatted}`;
    }

    /**
     * Generate the "match sealed" notification message
     */
    function _generateSealedMessage(matchDetails) {
        const { proposerTeamTag, opponentTeamTag, scheduledDate, slotId } = matchDetails;
        const dateTime = _formatMatchDateTime(scheduledDate, slotId);

        const lines = [
            'We have accepted the challenge!',
            '',
            `${proposerTeamTag} vs ${opponentTeamTag}`,
            `Game on @ ${dateTime}`,
            '',
            'https://scheduler.quake.world',
        ];

        return lines.join('\n');
    }

    /**
     * Show the modal after a match is sealed
     * @param {Object} matchDetails - from confirmSlot response
     * @param {string|null} opponentDiscordId - Discord user ID for DM link
     */
    function show(matchDetails, opponentDiscordId) {
        const message = _generateSealedMessage(matchDetails);
        const escapedMessage = _escapeHtml(message).replace(/\n/g, '&#10;');
        const dateTime = _formatMatchDateTime(matchDetails.scheduledDate, matchDetails.slotId);

        const discordIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>`;

        const html = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="match-sealed-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                    <!-- Header -->
                    <div class="p-4 border-b border-border text-center">
                        <h2 class="text-lg font-semibold text-foreground">Match Scheduled!</h2>
                        <p class="text-sm text-muted-foreground mt-1">
                            ${_escapeHtml(matchDetails.proposerTeamTag)} vs ${_escapeHtml(matchDetails.opponentTeamTag)} — ${dateTime}
                        </p>
                    </div>

                    <!-- Message Preview -->
                    <div class="p-4">
                        <p class="text-xs text-muted-foreground mb-2">Notify your opponent:</p>
                        <div class="bg-muted/30 rounded p-3 text-sm font-mono text-muted-foreground whitespace-pre-wrap">${_escapeHtml(message)}</div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="p-4 pt-0 flex items-center gap-2 flex-wrap">
                        ${opponentDiscordId ? `
                            <button class="btn btn-sm bg-[#5865F2] hover:bg-[#4752C4] text-white flex-1 sealed-discord-btn"
                                    data-discord-id="${opponentDiscordId}"
                                    data-message="${escapedMessage}">
                                ${discordIcon}
                                <span class="ml-1">Contact on Discord</span>
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-secondary flex-1 sealed-copy-btn"
                                data-message="${escapedMessage}">
                            Copy Message
                        </button>
                    </div>

                    <!-- Close -->
                    <div class="p-4 pt-0">
                        <button id="match-sealed-close" class="btn btn-primary w-full">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (!_container) {
            _container = document.createElement('div');
            _container.id = 'match-sealed-modal-container';
            document.body.appendChild(_container);
        }

        _container.innerHTML = html;
        _attachListeners();
        _isOpen = true;
    }

    function _attachListeners() {
        const backdrop = document.getElementById('match-sealed-backdrop');
        const closeBtn = document.getElementById('match-sealed-close');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);

        // Discord button
        _container.querySelectorAll('.sealed-discord-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const discordId = btn.dataset.discordId;
                const message = btn.dataset.message.replace(/&#10;/g, '\n');

                try {
                    await navigator.clipboard.writeText(message);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showSuccess('Message copied! Paste in Discord');
                    }
                    setTimeout(() => {
                        window.location.href = `discord://discord.com/users/${discordId}`;
                    }, 100);
                } catch (err) {
                    window.location.href = `discord://discord.com/users/${discordId}`;
                }
            });
        });

        // Copy button
        _container.querySelectorAll('.sealed-copy-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const message = btn.dataset.message.replace(/&#10;/g, '\n');
                try {
                    await navigator.clipboard.writeText(message);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showSuccess('Message copied to clipboard!');
                    }
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `<svg class="w-4 h-4 inline" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg> Copied!`;
                    setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        });

        // ESC to close
        _keydownHandler = (e) => {
            if (e.key === 'Escape' && _isOpen) close();
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    function close() {
        if (_container) _container.innerHTML = '';
        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
        _isOpen = false;
    }

    function cleanup() {
        close();
        if (_container) {
            _container.remove();
            _container = null;
        }
    }

    return { show, close, cleanup };
})();

window.MatchSealedModal = MatchSealedModal;
