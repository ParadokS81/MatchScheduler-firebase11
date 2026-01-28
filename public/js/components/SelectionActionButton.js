// SelectionActionButton.js - Floating action button for grid cell selections
// Slice 5.0b: Appears near selection with Add Me / Remove Me functionality
// Following CLAUDE.md architecture: Revealing Module Pattern

const SelectionActionButton = (function() {
    'use strict';

    let _button = null;
    let _currentSelection = [];
    let _currentBounds = null;

    /**
     * Create the floating button element
     */
    function _createButton() {
        _button = document.createElement('button');
        _button.className = 'selection-action-btn fixed z-50 hidden';
        _button.innerHTML = `
            <span class="action-icon mr-1 text-base font-bold"></span>
            <span class="action-text"></span>
        `;
        document.body.appendChild(_button);

        _button.addEventListener('click', _handleAction);
    }

    /**
     * Handle 'grid-selection-change' events dispatched by AvailabilityGrid
     * @param {CustomEvent} e - Event with detail { gridId, selectedCells, bounds }
     */
    function _handleSelectionChange(e) {
        const { gridId, selectedCells, bounds } = e.detail;
        _currentSelection = selectedCells;
        _currentBounds = bounds;

        if (selectedCells.length === 0 || !bounds) {
            _hide();
            return;
        }

        _updateButtonState();
        _positionButton();
        _show();
    }

    /**
     * Update button appearance based on whether user is in all selected cells
     */
    function _updateButtonState() {
        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId || _currentSelection.length === 0) return;

        // Check if user is in ALL selected cells
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            _hide();
            return;
        }

        const userInAllCells = _currentSelection.every(({ weekId, slotId }) => {
            const players = AvailabilityService.getSlotPlayers(teamId, weekId, slotId);
            return players?.includes(userId);
        });

        const isRemove = userInAllCells;
        const icon = _button.querySelector('.action-icon');
        const text = _button.querySelector('.action-text');

        icon.textContent = isRemove ? '−' : '+';
        text.textContent = isRemove ? 'Remove Me' : 'Add Me';
        _button.dataset.action = isRemove ? 'remove' : 'add';

        // Style based on action
        _button.className = `selection-action-btn fixed z-50 flex items-center px-3 py-2 rounded-lg shadow-lg font-medium text-sm transition-all ${
            isRemove
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`;
    }

    /**
     * Position button near the selection bounds with smart repositioning
     */
    function _positionButton() {
        if (!_currentBounds || !_button) return;

        const padding = 8;

        // Make button visible briefly to measure its size
        _button.style.visibility = 'hidden';
        _button.classList.remove('hidden');
        const buttonRect = _button.getBoundingClientRect();
        const buttonWidth = buttonRect.width || 120;
        const buttonHeight = buttonRect.height || 40;
        _button.classList.add('hidden');
        _button.style.visibility = '';

        // Default: bottom-right of selection
        let left = _currentBounds.right + padding;
        let top = _currentBounds.bottom - buttonHeight;

        // Smart repositioning: keep button visible
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // If too far right, move to left of selection
        if (left + buttonWidth > viewportWidth - padding) {
            left = _currentBounds.left - buttonWidth - padding;
        }

        // If still off-screen (selection very wide), position at right edge
        if (left < padding) {
            left = viewportWidth - buttonWidth - padding;
        }

        // If too low, move up
        if (top + buttonHeight > viewportHeight - padding) {
            top = viewportHeight - buttonHeight - padding;
        }

        // If too high, position below selection
        if (top < padding) {
            top = _currentBounds.bottom + padding;
        }

        _button.style.left = `${left}px`;
        _button.style.top = `${top}px`;
    }

    /**
     * Execute Add Me or Remove Me action
     */
    async function _handleAction() {
        const action = _button.dataset.action;

        // Show loading state
        const originalText = _button.querySelector('.action-text').textContent;
        _button.querySelector('.action-text').textContent = action === 'add' ? 'Adding...' : 'Removing...';
        _button.disabled = true;

        try {
            if (action === 'add') {
                await GridActionButtons.addMe();
            } else {
                await GridActionButtons.removeMe();
            }
        } finally {
            _button.disabled = false;
            _button.querySelector('.action-text').textContent = originalText;
            _hide();
        }
    }

    /**
     * Handle keyboard shortcuts (Enter to confirm, Escape to cancel)
     * @param {KeyboardEvent} e
     */
    function _handleKeydown(e) {
        if (!_button || _button.classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            _handleAction();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            _hide();
            // Also clear grid selections
            GridActionButtons.clearAll?.();
        }
    }

    /**
     * Show the floating button
     */
    function _show() {
        _button?.classList.remove('hidden');
    }

    /**
     * Hide the floating button
     */
    function _hide() {
        _button?.classList.add('hidden');
    }

    /**
     * Initialize the component
     */
    function init() {
        _createButton();

        document.addEventListener('grid-selection-change', _handleSelectionChange);
        document.addEventListener('keydown', _handleKeydown);

        console.log('✨ SelectionActionButton initialized');
    }

    /**
     * Cleanup the component
     */
    function cleanup() {
        document.removeEventListener('grid-selection-change', _handleSelectionChange);
        document.removeEventListener('keydown', _handleKeydown);
        _button?.remove();
        _button = null;
        _currentSelection = [];
        _currentBounds = null;
    }

    return { init, cleanup };
})();
