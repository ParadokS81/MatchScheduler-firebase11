// SelectionActionButton.js - Floating action button for grid cell selections
// Slice 5.0b: Appears near selection with Add Me / Remove Me functionality
// Following CLAUDE.md architecture: Revealing Module Pattern

const SelectionActionButton = (function() {
    'use strict';

    let _container = null;
    let _addButton = null;
    let _removeButton = null;
    let _saveTemplateButton = null;
    let _clearButton = null;
    let _currentSelection = [];
    let _currentBounds = null;

    /**
     * Create the floating button container with action and clear buttons
     */
    function _createButton() {
        // Container: 2x2 grid layout
        _container = document.createElement('div');
        _container.className = 'selection-action-container fixed z-50 hidden grid grid-cols-2 gap-1';

        // Add Me button (top-left)
        _addButton = document.createElement('button');
        _addButton.className = 'selection-action-btn flex items-center justify-center px-3 py-2 rounded-lg shadow-lg font-medium text-sm transition-all bg-primary text-primary-foreground hover:bg-primary/90';
        _addButton.innerHTML = `<span class="action-text">+ Add Me</span>`;
        _addButton.dataset.action = 'add';
        _addButton.addEventListener('click', _handleAction);

        // Save as Template button (top-right, next to Add Me)
        _saveTemplateButton = document.createElement('button');
        _saveTemplateButton.className = 'flex items-center justify-center gap-1 px-2 py-2 rounded-lg shadow-lg font-medium text-xs transition-all bg-muted text-muted-foreground hover:bg-accent hover:text-foreground';
        _saveTemplateButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            <span>Template</span>
        `;
        _saveTemplateButton.title = 'Save as template';
        _saveTemplateButton.addEventListener('click', _handleSaveTemplate);

        // Remove Me button (bottom-left)
        _removeButton = document.createElement('button');
        _removeButton.className = 'selection-action-btn flex items-center justify-center px-3 py-2 rounded-lg shadow-lg font-medium text-sm transition-all bg-destructive text-destructive-foreground hover:bg-destructive/90';
        _removeButton.innerHTML = `<span class="action-text">− Remove Me</span>`;
        _removeButton.dataset.action = 'remove';
        _removeButton.addEventListener('click', _handleAction);

        // Clear button (bottom-right)
        _clearButton = document.createElement('button');
        _clearButton.className = 'flex items-center justify-center gap-1 px-2 py-2 rounded-lg shadow-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/80';
        _clearButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>Esc</span>
        `;
        _clearButton.title = 'Clear selection';
        _clearButton.addEventListener('click', _handleClear);

        // Row 1: Add Me | Template
        // Row 2: Remove Me | Esc
        _container.appendChild(_addButton);
        _container.appendChild(_saveTemplateButton);
        _container.appendChild(_removeButton);
        _container.appendChild(_clearButton);
        document.body.appendChild(_container);
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
     * Update button visibility based on whether user is in selected cells.
     * Mixed selections (user in some cells, not others) show both Add and Remove.
     */
    function _updateButtonState() {
        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId || _currentSelection.length === 0) return;

        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            _hide();
            return;
        }

        let userInCount = 0;
        _currentSelection.forEach(({ weekId, slotId }) => {
            const players = AvailabilityService.getSlotPlayers(teamId, weekId, slotId);
            if (players?.includes(userId)) userInCount++;
        });

        const userInAll = userInCount === _currentSelection.length;
        const userInNone = userInCount === 0;

        // Show Add if user is NOT in all cells
        _addButton.classList.toggle('hidden', userInAll);
        // Show Remove if user IS in at least some cells
        _removeButton.classList.toggle('hidden', userInNone);
    }

    /**
     * Position button container near the selection bounds with smart repositioning
     */
    function _positionButton() {
        if (!_currentBounds || !_container) return;

        const padding = 8;

        // Make container visible briefly to measure its size
        _container.style.visibility = 'hidden';
        _container.classList.remove('hidden');
        const containerRect = _container.getBoundingClientRect();
        const containerWidth = containerRect.width || 160;
        const containerHeight = containerRect.height || 40;
        _container.classList.add('hidden');
        _container.style.visibility = '';

        // Default: bottom-right of selection
        let left = _currentBounds.right + padding;
        let top = _currentBounds.bottom - containerHeight;

        // Smart repositioning: keep container visible
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // If too far right, move to left of selection
        if (left + containerWidth > viewportWidth - padding) {
            left = _currentBounds.left - containerWidth - padding;
        }

        // If still off-screen (selection very wide), position at right edge
        if (left < padding) {
            left = viewportWidth - containerWidth - padding;
        }

        // If too low, move up
        if (top + containerHeight > viewportHeight - padding) {
            top = viewportHeight - containerHeight - padding;
        }

        // If too high, position below selection
        if (top < padding) {
            top = _currentBounds.bottom + padding;
        }

        _container.style.left = `${left}px`;
        _container.style.top = `${top}px`;
    }

    /**
     * Execute Add Me or Remove Me action based on clicked button
     */
    async function _handleAction(e) {
        const btn = e.currentTarget;
        const action = btn.dataset.action;

        // Show loading state
        const textEl = btn.querySelector('.action-text');
        const originalText = textEl.textContent;
        textEl.textContent = action === 'add' ? 'Adding...' : 'Removing...';
        btn.disabled = true;

        try {
            if (action === 'add') {
                await GridActionButtons.addMe();
            } else {
                await GridActionButtons.removeMe();
            }
        } finally {
            btn.disabled = false;
            textEl.textContent = originalText;
            _hide();
        }
    }

    /**
     * Save current selection as template
     */
    async function _handleSaveTemplate() {
        if (typeof GridActionButtons !== 'undefined' && GridActionButtons.saveTemplate) {
            await GridActionButtons.saveTemplate();
            _hide();
        }
    }

    /**
     * Handle Clear button click - clear selection
     */
    function _handleClear() {
        GridActionButtons.clearAll?.();
        _hide();
    }

    /**
     * Handle keyboard shortcuts (Enter to confirm, Escape to cancel)
     * @param {KeyboardEvent} e
     */
    function _handleKeydown(e) {
        if (!_container || _container.classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            // Trigger the first visible action button
            const visibleBtn = !_addButton.classList.contains('hidden') ? _addButton : _removeButton;
            visibleBtn.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            _handleClear();
        }
    }

    /**
     * Show the floating button container
     */
    function _show() {
        _container?.classList.remove('hidden');
    }

    /**
     * Hide the floating button container
     */
    function _hide() {
        _container?.classList.add('hidden');
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
        _container?.remove();
        _container = null;
        _actionButton = null;
        _clearButton = null;
        _currentSelection = [];
        _currentBounds = null;
    }

    return { init, cleanup };
})();
