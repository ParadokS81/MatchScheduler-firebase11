// CancelMatchModal.js - Themed confirmation modal for cancelling a scheduled match
// Replaces native confirm() dialog to match app styling
// Following KickPlayerModal pattern: Revealing Module, modal-container, ESC/backdrop close

const CancelMatchModal = (function() {
    'use strict';

    let _matchId = null;
    let _onConfirm = null;
    let _keydownHandler = null;

    /**
     * Show the cancel match confirmation modal.
     * @param {Object} match - The scheduled match data
     * @param {Function} onConfirm - Callback when user confirms cancellation
     */
    function show(match, onConfirm) {
        if (!match || !match.id) return;

        _matchId = match.id;
        _onConfirm = onConfirm;

        const isQuickAdd = match.origin === 'quick_add' || !match.proposalId;
        const description = isQuickAdd
            ? 'This will remove the match from both teams\u2019 schedules.'
            : 'The proposal will revert to active so you can pick a different slot.';

        const modalHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="cancel-match-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-sm font-semibold text-foreground">Cancel Match</h2>
                        <button id="cancel-match-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4">
                        <p class="text-sm text-foreground mb-1">
                            Cancel <strong>${_escapeHtml(match.teamAName)}</strong> vs <strong>${_escapeHtml(match.teamBName)}</strong>?
                        </p>
                        <p class="text-xs text-muted-foreground">${description}</p>
                    </div>

                    <!-- Footer -->
                    <div class="flex gap-3 justify-end p-4 border-t border-border">
                        <button id="cancel-match-dismiss"
                            class="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-foreground text-sm">
                            Keep Match
                        </button>
                        <button id="cancel-match-confirm"
                            class="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm">
                            Cancel Match
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
        const backdrop = document.getElementById('cancel-match-backdrop');
        const closeBtn = document.getElementById('cancel-match-close');
        const dismissBtn = document.getElementById('cancel-match-dismiss');
        const confirmBtn = document.getElementById('cancel-match-confirm');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);
        dismissBtn?.addEventListener('click', close);
        confirmBtn?.addEventListener('click', _handleConfirm);

        _keydownHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    async function _handleConfirm() {
        const confirmBtn = document.getElementById('cancel-match-confirm');
        if (!confirmBtn) return;

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="flex items-center gap-2"><span class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>Cancelling...</span>';

        if (_onConfirm) {
            await _onConfirm(_matchId);
        }
        close();
    }

    function _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function close() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = '';
        modalContainer.classList.add('hidden');
        _matchId = null;
        _onConfirm = null;

        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
    }

    return { show, close };
})();
