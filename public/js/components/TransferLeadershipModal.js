// TransferLeadershipModal.js - Modal for team leader to transfer leadership
// Following CLAUDE.md architecture: Revealing Module Pattern

const TransferLeadershipModal = (function() {
    'use strict';

    let _selectedPlayerId = null;
    let _currentTeamId = null;
    let _keydownHandler = null;

    /**
     * Escape HTML to prevent XSS
     */
    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show the transfer leadership modal
     * @param {string} teamId - The team ID
     */
    function show(teamId) {
        const team = TeamService.getTeamFromCache(teamId);
        if (!team) {
            ToastService.showError('Team data not available');
            return;
        }

        const currentUserId = window.firebase?.auth?.currentUser?.uid;
        if (!currentUserId) {
            ToastService.showError('Not authenticated');
            return;
        }

        // Filter out self - only show eligible members
        const eligibleMembers = team.playerRoster.filter(p => p.userId !== currentUserId);

        if (eligibleMembers.length === 0) {
            ToastService.showWarning('No other team members to transfer leadership to');
            return;
        }

        _selectedPlayerId = null;
        _currentTeamId = teamId;
        _renderModal(eligibleMembers, team);
    }

    function _renderModal(players, team) {
        const playersHtml = players.map(p => `
            <label class="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                <input type="radio" name="transfer-leader" value="${p.userId}"
                    class="w-4 h-4 text-primary accent-primary">
                <div class="flex-1">
                    <span class="text-foreground">${_escapeHtml(p.displayName)}</span>
                </div>
                <span class="text-xs text-muted-foreground">${_escapeHtml(p.role)}</span>
            </label>
        `).join('');

        const modalHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="transfer-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-lg font-semibold text-foreground">Transfer Leadership</h2>
                        <button id="transfer-modal-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4">
                        <p class="text-muted-foreground text-sm mb-4">
                            Select a team member to become the new leader of <strong class="text-foreground">${_escapeHtml(team.teamName)}</strong>. You will become a regular member.
                        </p>
                        <div class="space-y-2 max-h-96 overflow-y-auto scrollbar-thin" id="transfer-player-list">
                            ${playersHtml}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="flex gap-3 justify-end p-4 border-t border-border">
                        <button id="transfer-cancel-btn"
                            class="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-foreground">
                            Cancel
                        </button>
                        <button id="transfer-confirm-btn"
                            class="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled>
                            Transfer Leadership
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = modalHTML;
        modalContainer.classList.remove('hidden');

        _attachListeners();
    }

    function _attachListeners() {
        const backdrop = document.getElementById('transfer-modal-backdrop');
        const closeBtn = document.getElementById('transfer-modal-close');
        const cancelBtn = document.getElementById('transfer-cancel-btn');
        const confirmBtn = document.getElementById('transfer-confirm-btn');
        const playerList = document.getElementById('transfer-player-list');

        // Backdrop click to close
        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });

        closeBtn?.addEventListener('click', close);
        cancelBtn?.addEventListener('click', close);

        // Radio button selection
        playerList?.addEventListener('change', (e) => {
            if (e.target.type === 'radio' && e.target.name === 'transfer-leader') {
                _selectedPlayerId = e.target.value;
                confirmBtn.disabled = false;
            }
        });

        // Confirm button
        confirmBtn?.addEventListener('click', _handleConfirm);

        // ESC key to close
        _keydownHandler = (e) => {
            if (e.key === 'Escape') {
                close();
            }
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    async function _handleConfirm() {
        if (!_selectedPlayerId || !_currentTeamId) return;

        const btn = document.getElementById('transfer-confirm-btn');
        if (!btn) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="flex items-center gap-2"><span class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>Transferring...</span>';

        try {
            const result = await TeamService.callFunction('transferLeadership', {
                teamId: _currentTeamId,
                newLeaderId: _selectedPlayerId
            });

            if (result.success) {
                ToastService.showSuccess('Leadership transferred successfully');
                close();
            } else {
                ToastService.showError(result.error || 'Failed to transfer leadership');
                btn.disabled = false;
                btn.textContent = 'Transfer Leadership';
            }
        } catch (error) {
            console.error('Transfer leadership failed:', error);
            ToastService.showError('Network error - please try again');
            btn.disabled = false;
            btn.textContent = 'Transfer Leadership';
        }
    }

    function close() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = '';
        modalContainer.classList.add('hidden');
        _selectedPlayerId = null;
        _currentTeamId = null;

        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
    }

    return { show, close };
})();
