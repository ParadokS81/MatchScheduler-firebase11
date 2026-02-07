// SelectionActionButton.js - Floating action button for grid cell selections
// Appears near selection with Add/Remove Me, Add/Remove Other, Template functionality
// Following CLAUDE.md architecture: Revealing Module Pattern

const SelectionActionButton = (function() {
    'use strict';

    let _container = null;
    let _addMeButton = null;
    let _addOtherButton = null;
    let _removeMeButton = null;
    let _removeOtherButton = null;
    let _templateButton = null;
    let _escapeButton = null;
    let _rosterFlyout = null;
    let _flyoutVisible = false;
    let _flyoutHideTimeout = null;
    let _flyoutMode = null; // 'add' or 'remove'
    let _currentSelection = [];
    let _currentBounds = null;

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Toggle button disabled state with solid color swap (no opacity).
     * Swaps between the active color classes and a solid muted style.
     */
    const _disabledClasses = 'bg-muted text-muted-foreground cursor-not-allowed';
    function _setButtonDisabled(btn, disabled, activeClasses) {
        btn.disabled = disabled;
        const toRemove = disabled ? activeClasses : _disabledClasses;
        const toAdd = disabled ? _disabledClasses : activeClasses;
        toRemove.split(' ').forEach(c => btn.classList.remove(c));
        toAdd.split(' ').forEach(c => btn.classList.add(c));
    }

    /**
     * Create the floating button container with stable grid layout
     * Layout (scheduler):
     *   [+ Me]      [+ Others →]
     *   [− Me]      [− Others →]
     *   [Escape]    [Template]
     *
     * Layout (non-scheduler):
     *   [+ Me]      [Template]
     *   [− Me]      [Escape]
     */
    function _createButton() {
        _container = document.createElement('div');
        _container.className = 'selection-action-container fixed z-50 hidden flex flex-col gap-1 bg-card border border-border rounded-lg p-1.5 shadow-xl';

        // -- + Me button --
        _addMeButton = document.createElement('button');
        _addMeButton.className = 'selection-action-btn flex items-center justify-center px-3 py-2 rounded font-medium text-sm transition-all bg-primary text-primary-foreground hover:bg-primary/90';
        _addMeButton.innerHTML = `<span class="action-text">+ Me</span>`;
        _addMeButton.addEventListener('click', () => _handleMeAction('add'));

        // -- + Others button (leaders/schedulers only) --
        _addOtherButton = document.createElement('button');
        _addOtherButton.className = 'selection-action-btn flex items-center justify-center gap-1 px-3 py-2 rounded font-medium text-sm transition-all bg-accent text-accent-foreground hover:bg-accent/80';
        _addOtherButton.innerHTML = `
            <span class="action-text">+ Others</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        `;
        _addOtherButton.addEventListener('mouseenter', () => _showRosterFlyout('add'));
        _addOtherButton.addEventListener('mouseleave', () => _scheduleFlyoutHide());
        _addOtherButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_flyoutVisible && _flyoutMode === 'add') {
                _hideRosterFlyout();
            } else {
                _showRosterFlyout('add');
            }
        });

        // -- − Me button --
        _removeMeButton = document.createElement('button');
        _removeMeButton.className = 'selection-action-btn flex items-center justify-center px-3 py-2 rounded font-medium text-sm transition-all bg-destructive text-destructive-foreground hover:bg-destructive/90';
        _removeMeButton.innerHTML = `<span class="action-text">− Me</span>`;
        _removeMeButton.addEventListener('click', () => _handleMeAction('remove'));

        // -- − Others button (leaders/schedulers only) --
        _removeOtherButton = document.createElement('button');
        _removeOtherButton.className = 'selection-action-btn flex items-center justify-center gap-1 px-3 py-2 rounded font-medium text-sm transition-all bg-destructive text-destructive-foreground hover:bg-destructive/90';
        _removeOtherButton.innerHTML = `
            <span class="action-text">− Others</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        `;
        _removeOtherButton.addEventListener('mouseenter', () => _showRosterFlyout('remove'));
        _removeOtherButton.addEventListener('mouseleave', () => _scheduleFlyoutHide());
        _removeOtherButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_flyoutVisible && _flyoutMode === 'remove') {
                _hideRosterFlyout();
            } else {
                _showRosterFlyout('remove');
            }
        });

        // -- Escape button --
        _escapeButton = document.createElement('button');
        const clearLabel = (typeof MobileLayout !== 'undefined' && MobileLayout.isMobile()) ? 'Clear' : 'Escape';
        _escapeButton.className = 'flex items-center justify-center gap-1 px-3 py-2 rounded text-sm font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-foreground';
        _escapeButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>${clearLabel}</span>
        `;
        _escapeButton.addEventListener('click', _handleClear);

        // -- Template button --
        _templateButton = document.createElement('button');
        _templateButton.className = 'flex items-center justify-center gap-1 px-3 py-2 rounded font-medium text-sm transition-all bg-muted text-muted-foreground hover:bg-accent hover:text-foreground';
        _templateButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            <span>Template</span>
        `;
        _templateButton.addEventListener('click', _handleSaveTemplate);

        // Layout is built dynamically in _buildLayout()
        document.body.appendChild(_container);

        // Create roster flyout (separate from container for positioning)
        _createRosterFlyout();
    }

    /**
     * Build the button grid layout based on scheduler status.
     * Called on each selection change so the layout matches the user's role.
     */
    function _buildLayout(isScheduler) {
        // Clear existing children
        _container.innerHTML = '';

        if (isScheduler) {
            // Row 1: [+ Me] [+ Others →]
            const row1 = document.createElement('div');
            row1.className = 'flex gap-1';
            row1.appendChild(_addMeButton);
            row1.appendChild(_addOtherButton);

            // Row 2: [− Me] [− Others →]
            const row2 = document.createElement('div');
            row2.className = 'flex gap-1';
            row2.appendChild(_removeMeButton);
            row2.appendChild(_removeOtherButton);

            // Row 3: [Escape] [Template]
            const row3 = document.createElement('div');
            row3.className = 'flex gap-1';
            row3.appendChild(_escapeButton);
            row3.appendChild(_templateButton);

            _container.appendChild(row1);
            _container.appendChild(row2);
            _container.appendChild(row3);
        } else {
            // Row 1: [+ Me] [Template]
            const row1 = document.createElement('div');
            row1.className = 'flex gap-1';
            row1.appendChild(_addMeButton);
            row1.appendChild(_templateButton);

            // Row 2: [− Me] [Escape]
            const row2 = document.createElement('div');
            row2.className = 'flex gap-1';
            row2.appendChild(_removeMeButton);
            row2.appendChild(_escapeButton);

            _container.appendChild(row1);
            _container.appendChild(row2);
        }
    }

    // ---------------------------------------------------------------
    // Roster flyout for "Add/Remove Others"
    // ---------------------------------------------------------------

    function _createRosterFlyout() {
        _rosterFlyout = document.createElement('div');
        _rosterFlyout.className = 'fixed z-50 hidden bg-card border border-border rounded-lg shadow-xl p-1.5';
        _rosterFlyout.style.maxHeight = '15rem';
        _rosterFlyout.style.overflowY = 'auto';
        _rosterFlyout.addEventListener('mouseenter', () => _cancelFlyoutHide());
        _rosterFlyout.addEventListener('mouseleave', () => _scheduleFlyoutHide());
        document.body.appendChild(_rosterFlyout);
    }

    function _populateRosterFlyout(mode) {
        if (!_rosterFlyout) return;

        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) return;

        const team = TeamService.getTeamFromCache(teamId);
        if (!team || !team.playerRoster) return;

        const currentUserId = window.firebase?.auth?.currentUser?.uid;
        const otherMembers = team.playerRoster.filter(p => p.userId !== currentUserId);

        if (otherMembers.length === 0) {
            _rosterFlyout.innerHTML = '<p class="text-xs text-muted-foreground px-2 py-1">No other members</p>';
            return;
        }

        _rosterFlyout.innerHTML = otherMembers.map(player => `
            <button class="roster-flyout-btn flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-accent transition-colors text-left"
                    data-user-id="${player.userId}">
                ${player.photoURL
                    ? `<img src="${player.photoURL}" alt="" class="w-6 h-6 rounded-full object-cover shrink-0">`
                    : `<div class="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">${_escapeHtml(player.initials || '??')}</div>`
                }
                <span class="text-sm text-foreground truncate">${_escapeHtml(player.displayName)}</span>
            </button>
        `).join('');

        _rosterFlyout.querySelectorAll('.roster-flyout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (mode === 'add') {
                    _handleOtherAction(btn.dataset.userId, btn, 'add');
                } else {
                    _handleOtherAction(btn.dataset.userId, btn, 'remove');
                }
            });
        });
    }

    function _showRosterFlyout(mode) {
        _cancelFlyoutHide();
        _flyoutMode = mode;
        _populateRosterFlyout(mode);
        _positionFlyout(mode);
        _rosterFlyout.classList.remove('hidden');
        _flyoutVisible = true;
    }

    function _hideRosterFlyout() {
        _rosterFlyout?.classList.add('hidden');
        _flyoutVisible = false;
        _flyoutMode = null;
    }

    function _scheduleFlyoutHide() {
        _cancelFlyoutHide();
        _flyoutHideTimeout = setTimeout(() => _hideRosterFlyout(), 200);
    }

    function _cancelFlyoutHide() {
        if (_flyoutHideTimeout) {
            clearTimeout(_flyoutHideTimeout);
            _flyoutHideTimeout = null;
        }
    }

    function _positionFlyout(mode) {
        const anchorBtn = mode === 'add' ? _addOtherButton : _removeOtherButton;
        if (!anchorBtn || !_rosterFlyout) return;

        const btnRect = anchorBtn.getBoundingClientRect();
        const gap = 4;

        _rosterFlyout.style.visibility = 'hidden';
        _rosterFlyout.classList.remove('hidden');
        const flyoutRect = _rosterFlyout.getBoundingClientRect();
        _rosterFlyout.classList.add('hidden');
        _rosterFlyout.style.visibility = '';

        let left = btnRect.right + gap;
        let top = btnRect.top;

        if (left + flyoutRect.width > window.innerWidth - gap) {
            left = btnRect.left - flyoutRect.width - gap;
        }
        if (top + flyoutRect.height > window.innerHeight - gap) {
            top = window.innerHeight - flyoutRect.height - gap;
        }

        _rosterFlyout.style.left = `${left}px`;
        _rosterFlyout.style.top = `${top}px`;
    }

    // ---------------------------------------------------------------
    // Action handlers
    // ---------------------------------------------------------------

    async function _handleMeAction(action) {
        const btn = action === 'add' ? _addMeButton : _removeMeButton;
        if (btn.disabled) return;

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

    async function _handleOtherAction(targetUserId, buttonEl, action) {
        const originalHtml = buttonEl.innerHTML;
        const loadingText = action === 'add' ? 'Adding...' : 'Removing...';
        buttonEl.innerHTML = `<span class="text-xs text-muted-foreground">${loadingText}</span>`;
        buttonEl.disabled = true;

        try {
            if (action === 'add') {
                await GridActionButtons.addOther(targetUserId);
            } else {
                await GridActionButtons.removeOther(targetUserId);
            }

            const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
            const team = TeamService.getTeamFromCache(teamId);
            const player = team?.playerRoster?.find(p => p.userId === targetUserId);
            const name = player?.displayName || 'Player';
            const verb = action === 'add' ? 'Added' : 'Removed';
            const prep = action === 'add' ? 'to' : 'from';

            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess(`${verb} ${name} ${prep} selected slots`);
            }
        } catch (error) {
            if (typeof ToastService !== 'undefined') {
                ToastService.showError(`Failed to ${action} availability`);
            }
        } finally {
            buttonEl.disabled = false;
            buttonEl.innerHTML = originalHtml;
            _hideRosterFlyout();
            _hide();
        }
    }

    async function _handleSaveTemplate() {
        if (typeof GridActionButtons !== 'undefined' && GridActionButtons.saveTemplate) {
            await GridActionButtons.saveTemplate();
            _hide();
        }
    }

    function _handleClear() {
        if (typeof GridActionButtons !== 'undefined' && GridActionButtons.clearAll) {
            GridActionButtons.clearAll();
        }
        document.dispatchEvent(new CustomEvent('clear-all-selections'));
        _hide();
    }

    // ---------------------------------------------------------------
    // Core popup logic
    // ---------------------------------------------------------------

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
     * Update button states — disable instead of hide for stable layout.
     * Also rebuilds layout based on scheduler role.
     */
    function _updateButtonState() {
        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId || _currentSelection.length === 0) return;

        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            _hide();
            return;
        }

        // Check scheduler status and build layout
        const isScheduler = typeof TeamService !== 'undefined' && TeamService.isScheduler(teamId, userId);
        _buildLayout(isScheduler);

        // Count how many selected cells have the current user
        let userInCount = 0;
        _currentSelection.forEach(({ weekId, slotId }) => {
            const players = AvailabilityService.getSlotPlayers(teamId, weekId, slotId);
            if (players?.includes(userId)) userInCount++;
        });

        const userInAll = userInCount === _currentSelection.length;
        const userInNone = userInCount === 0;

        // Disable with solid muted style (no opacity — grid content would bleed through)
        _setButtonDisabled(_addMeButton, userInAll, 'bg-primary text-primary-foreground hover:bg-primary/90');
        _setButtonDisabled(_removeMeButton, userInNone, 'bg-destructive text-destructive-foreground hover:bg-destructive/90');
    }

    function _positionButton() {
        if (!_currentBounds || !_container) return;

        const padding = 8;

        _container.style.visibility = 'hidden';
        _container.classList.remove('hidden');
        const containerRect = _container.getBoundingClientRect();
        const containerWidth = containerRect.width || 160;
        const containerHeight = containerRect.height || 40;
        _container.classList.add('hidden');
        _container.style.visibility = '';

        let left = _currentBounds.right + padding;
        let top = _currentBounds.bottom - containerHeight;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (left + containerWidth > viewportWidth - padding) {
            left = _currentBounds.left - containerWidth - padding;
        }
        if (left < padding) {
            left = viewportWidth - containerWidth - padding;
        }
        if (top + containerHeight > viewportHeight - padding) {
            top = viewportHeight - containerHeight - padding;
        }
        if (top < padding) {
            top = _currentBounds.bottom + padding;
        }

        _container.style.left = `${left}px`;
        _container.style.top = `${top}px`;
    }

    function _handleKeydown(e) {
        if (!_container || _container.classList.contains('hidden')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            if (!_addMeButton.disabled) {
                _handleMeAction('add');
            } else if (!_removeMeButton.disabled) {
                _handleMeAction('remove');
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            _handleClear();
        }
    }

    function _show() {
        _container?.classList.remove('hidden');
    }

    function _hide() {
        _container?.classList.add('hidden');
        _hideRosterFlyout();
    }

    function init() {
        _createButton();

        document.addEventListener('grid-selection-change', _handleSelectionChange);
        document.addEventListener('keydown', _handleKeydown);

        console.log('SelectionActionButton initialized');
    }

    function cleanup() {
        document.removeEventListener('grid-selection-change', _handleSelectionChange);
        document.removeEventListener('keydown', _handleKeydown);
        _cancelFlyoutHide();
        _container?.remove();
        _rosterFlyout?.remove();
        _container = null;
        _addMeButton = null;
        _addOtherButton = null;
        _removeMeButton = null;
        _removeOtherButton = null;
        _templateButton = null;
        _escapeButton = null;
        _rosterFlyout = null;
        _flyoutVisible = false;
        _flyoutMode = null;
        _currentSelection = [];
        _currentBounds = null;
    }

    return { init, cleanup };
})();
