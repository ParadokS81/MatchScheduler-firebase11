// SelectionActionButton.js - Floating action button for grid cell selections
// Tiered layout: [+ Me] [- Me] [⋯ More] with dropdown menu and inline roster
// Following CLAUDE.md architecture: Revealing Module Pattern

const SelectionActionButton = (function() {
    'use strict';

    // Primary buttons
    let _container = null;
    let _addMeButton = null;
    let _removeMeButton = null;
    let _moreButton = null;

    // Dropdown elements
    let _moreDropdown = null;
    let _moreMenuItems = null;
    let _unavailMeButton = null;
    let _templateButton = null;
    let _findStandinButton = null;
    let _othersButton = null;

    // Roster panel
    let _rosterPanel = null;

    // State
    let _dropdownOpen = false;
    let _rosterOpen = false;
    let _clickOutsideHandler = null;
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

    // ---------------------------------------------------------------
    // DOM creation
    // ---------------------------------------------------------------

    function _createButton() {
        _container = document.createElement('div');
        _container.className = 'selection-action-container fixed z-50 hidden flex flex-col bg-card border border-border rounded-lg p-1.5 shadow-xl';

        // -- + Me button --
        _addMeButton = document.createElement('button');
        _addMeButton.className = 'selection-action-btn flex items-center justify-center px-3 py-2 rounded font-medium text-sm transition-all bg-primary text-primary-foreground hover:bg-primary/90';
        _addMeButton.innerHTML = '<span class="action-text">+ Me</span>';
        _addMeButton.addEventListener('click', () => _handleMeAction('add'));

        // -- − Me button --
        _removeMeButton = document.createElement('button');
        _removeMeButton.className = 'selection-action-btn flex items-center justify-center px-3 py-2 rounded font-medium text-sm transition-all bg-destructive text-destructive-foreground hover:bg-destructive/90';
        _removeMeButton.innerHTML = '<span class="action-text">− Me</span>';
        _removeMeButton.addEventListener('click', () => _handleMeAction('remove'));

        // -- ⋯ More button --
        _moreButton = document.createElement('button');
        _moreButton.className = 'selection-action-btn flex items-center justify-center px-2 py-2 rounded font-medium text-sm transition-all bg-muted text-muted-foreground hover:bg-accent hover:text-foreground';
        _moreButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
        `;
        _moreButton.title = 'More actions';
        _moreButton.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleMoreDropdown();
        });

        // -- Dropdown menu items --
        _unavailMeButton = document.createElement('button');
        _unavailMeButton.className = 'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left transition-colors hover:bg-accent';
        _unavailMeButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            <span>Mark me away</span>
        `;
        _unavailMeButton.addEventListener('click', () => _handleMeAction('unavailable'));

        _templateButton = document.createElement('button');
        _templateButton.className = 'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left transition-colors hover:bg-accent';
        _templateButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            <span>Save template</span>
        `;
        _templateButton.addEventListener('click', _handleSaveTemplate);

        _findStandinButton = document.createElement('button');
        _findStandinButton.className = 'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left transition-colors hover:bg-accent';
        _findStandinButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>Find standin</span>
        `;
        _findStandinButton.addEventListener('click', _handleFindStandin);

        _othersButton = document.createElement('button');
        _othersButton.className = 'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left transition-colors hover:bg-accent';
        _othersButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span class="flex-1">Others</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"/>
            </svg>
        `;
        _othersButton.addEventListener('click', (e) => {
            e.stopPropagation();
            _showRosterPanel();
        });

        document.body.appendChild(_container);
    }

    /**
     * Build the layout based on scheduler status.
     * Called on each selection change so the layout matches the user's role.
     */
    function _buildLayout(isScheduler) {
        _container.innerHTML = '';
        _dropdownOpen = false;
        _rosterOpen = false;

        // Primary row: [+ Me] [- Me] [⋯]
        const primaryRow = document.createElement('div');
        primaryRow.className = 'flex gap-1';
        primaryRow.appendChild(_addMeButton);
        primaryRow.appendChild(_removeMeButton);
        primaryRow.appendChild(_moreButton);
        _container.appendChild(primaryRow);

        // More dropdown (hidden by default)
        _moreDropdown = document.createElement('div');
        _moreDropdown.className = 'hidden mt-1 border-t border-border pt-1';

        // Menu items
        _moreMenuItems = document.createElement('div');
        _moreMenuItems.className = 'flex flex-col gap-0.5';
        _moreMenuItems.appendChild(_unavailMeButton);
        _moreMenuItems.appendChild(_templateButton);
        _moreMenuItems.appendChild(_findStandinButton);

        if (isScheduler) {
            const sep = document.createElement('hr');
            sep.className = 'my-1 border-border';
            _moreMenuItems.appendChild(sep);
            _moreMenuItems.appendChild(_othersButton);
        }

        _moreDropdown.appendChild(_moreMenuItems);

        // Roster panel (always created, hidden by default)
        _rosterPanel = document.createElement('div');
        _rosterPanel.className = 'hidden';
        _moreDropdown.appendChild(_rosterPanel);

        _container.appendChild(_moreDropdown);
    }

    // ---------------------------------------------------------------
    // Dropdown + roster panel transitions
    // ---------------------------------------------------------------

    function _toggleMoreDropdown() {
        if (_dropdownOpen) {
            _closeMoreDropdown();
        } else {
            _openMoreDropdown();
        }
    }

    function _openMoreDropdown() {
        _moreDropdown.classList.remove('hidden');
        _moreMenuItems.classList.remove('hidden');
        _rosterPanel.classList.add('hidden');
        _rosterOpen = false;
        _dropdownOpen = true;
        _positionButton();
    }

    function _closeMoreDropdown() {
        _moreDropdown.classList.add('hidden');
        _rosterOpen = false;
        _dropdownOpen = false;
        _positionButton();
    }

    function _showRosterPanel() {
        _moreMenuItems.classList.add('hidden');
        _populateRosterPanel();
        _rosterPanel.classList.remove('hidden');
        _rosterOpen = true;
        _positionButton();
    }

    function _hideRosterPanel() {
        _rosterPanel.classList.add('hidden');
        _moreMenuItems.classList.remove('hidden');
        _rosterOpen = false;
        _positionButton();
    }

    // ---------------------------------------------------------------
    // Roster panel with inline action icons
    // ---------------------------------------------------------------

    function _populateRosterPanel() {
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) return;

        const team = TeamService.getTeamFromCache(teamId);
        if (!team || !team.playerRoster) return;

        const currentUserId = window.firebase?.auth?.currentUser?.uid;
        const otherMembers = team.playerRoster.filter(p => p.userId !== currentUserId);

        _rosterPanel.innerHTML = '';

        // Back button
        const backBtn = document.createElement('button');
        backBtn.className = 'flex items-center gap-1 w-full px-2 py-1.5 rounded text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';
        backBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span>Back</span>
        `;
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _hideRosterPanel();
        });
        _rosterPanel.appendChild(backBtn);

        // Separator
        const sep = document.createElement('hr');
        sep.className = 'my-1 border-border';
        _rosterPanel.appendChild(sep);

        // Player list
        const list = document.createElement('div');
        list.className = 'flex flex-col gap-0.5 overflow-y-auto';
        list.style.maxHeight = '12rem';

        if (otherMembers.length === 0) {
            list.innerHTML = '<p class="text-xs text-muted-foreground px-2 py-1">No other members</p>';
        } else {
            otherMembers.forEach(player => {
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2 px-1 py-1 rounded';

                // Avatar
                const avatar = document.createElement('span');
                avatar.className = 'shrink-0';
                if (player.photoURL) {
                    avatar.innerHTML = `<img src="${player.photoURL}" alt="" class="w-5 h-5 rounded-full object-cover">`;
                } else {
                    avatar.innerHTML = `<div class="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[0.625rem] font-bold">${_escapeHtml(player.initials || '??')}</div>`;
                }

                // Name
                const name = document.createElement('span');
                name.className = 'text-sm text-foreground truncate flex-1 min-w-0';
                name.textContent = player.displayName;

                // Action icons: [+] [-] [⊘]
                const actions = document.createElement('div');
                actions.className = 'flex items-center gap-0.5 shrink-0';
                actions.innerHTML = `
                    <button class="roster-action-btn w-7 h-7 flex items-center justify-center rounded hover:bg-primary/20 text-primary transition-colors"
                            data-user-id="${player.userId}" data-action="add" title="Add to slots">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </button>
                    <button class="roster-action-btn w-7 h-7 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive transition-colors"
                            data-user-id="${player.userId}" data-action="remove" title="Remove from slots">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </button>
                    <button class="roster-action-btn w-7 h-7 flex items-center justify-center rounded hover:bg-secondary/80 text-secondary-foreground transition-colors"
                            data-user-id="${player.userId}" data-action="unavailable" title="Mark away">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                        </svg>
                    </button>
                `;

                row.appendChild(avatar);
                row.appendChild(name);
                row.appendChild(actions);
                list.appendChild(row);
            });
        }

        _rosterPanel.appendChild(list);

        // Event delegation for action buttons
        list.addEventListener('click', (e) => {
            const btn = e.target.closest('.roster-action-btn');
            if (!btn) return;
            e.stopPropagation();
            _handleOtherAction(btn.dataset.userId, btn, btn.dataset.action);
        });
    }

    // ---------------------------------------------------------------
    // Action handlers
    // ---------------------------------------------------------------

    async function _handleMeAction(action) {
        const btnMap = { add: _addMeButton, remove: _removeMeButton };
        const btn = btnMap[action];

        // For unavailable action from dropdown, just proceed directly
        if (action === 'unavailable') {
            _closeMoreDropdown();
            try {
                await GridActionButtons.markMeUnavailable();
            } finally {
                _hide();
            }
            return;
        }

        if (!btn || btn.disabled) return;

        const textEl = btn.querySelector('.action-text');
        const originalText = textEl.textContent;
        const loadingMap = { add: 'Adding...', remove: 'Removing...' };
        textEl.textContent = loadingMap[action];
        btn.disabled = true;

        try {
            if (action === 'add') {
                await GridActionButtons.addMe();
            } else if (action === 'remove') {
                await GridActionButtons.removeMe();
            }
        } finally {
            btn.disabled = false;
            textEl.textContent = originalText;
            _hide();
        }
    }

    async function _handleOtherAction(targetUserId, iconBtn, action) {
        iconBtn.disabled = true;
        iconBtn.classList.add('opacity-50');

        try {
            if (action === 'add') {
                await GridActionButtons.addOther(targetUserId);
            } else if (action === 'remove') {
                await GridActionButtons.removeOther(targetUserId);
            } else if (action === 'unavailable') {
                await GridActionButtons.markOtherUnavailable(targetUserId);
            }

            const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
            const team = TeamService.getTeamFromCache(teamId);
            const player = team?.playerRoster?.find(p => p.userId === targetUserId);
            const name = player?.displayName || 'Player';

            const toastMessages = {
                add: `Added ${name} to selected slots`,
                remove: `Removed ${name} from selected slots`,
                unavailable: `Marked ${name} as away`
            };

            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess(toastMessages[action]);
            }
        } catch (error) {
            const errorMessages = {
                add: 'Failed to add availability',
                remove: 'Failed to remove availability',
                unavailable: 'Failed to mark as away'
            };
            if (typeof ToastService !== 'undefined') {
                ToastService.showError(errorMessages[action] || 'Operation failed');
            }
        } finally {
            iconBtn.disabled = false;
            iconBtn.classList.remove('opacity-50');
            // Keep roster open for multiple player actions
        }
    }

    function _handleFindStandin() {
        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) return;

        const team = TeamService.getTeamFromCache(teamId);
        const divisions = team?.divisions || [];
        const defaultDiv = divisions[0] || 'D1';

        const validCells = _currentSelection.filter(cell => cell.slotId != null);
        if (validCells.length === 0) return;

        const cellsByWeek = {};
        validCells.forEach(cell => {
            if (!cellsByWeek[cell.weekId]) cellsByWeek[cell.weekId] = [];
            cellsByWeek[cell.weekId].push(cell.slotId);
        });

        const weekEntries = Object.entries(cellsByWeek);
        const [weekId, slotIds] = weekEntries[0];

        if (weekEntries.length > 1) {
            console.warn('Find Standin: selection spans multiple weeks, using first week only');
        }

        StandinFinderService.activate(weekId, slotIds, defaultDiv);
        BottomPanelController.switchTab('players', { force: true });

        document.dispatchEvent(new CustomEvent('clear-all-selections'));
        _hide();
    }

    async function _handleSaveTemplate() {
        if (typeof GridActionButtons !== 'undefined' && GridActionButtons.saveTemplate) {
            _closeMoreDropdown();
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
    // Click-outside dismissal
    // ---------------------------------------------------------------

    function _addClickOutsideListener() {
        _removeClickOutsideListener();
        setTimeout(() => {
            _clickOutsideHandler = (e) => {
                if (!_container || _container.classList.contains('hidden')) return;
                if (_container.contains(e.target)) return;
                // Let grid cell clicks flow through to grid-selection-change handler
                if (e.target.closest('.grid-cell, .grid-header-cell')) return;
                _handleClear();
            };
            document.addEventListener('click', _clickOutsideHandler, true);
        }, 0);
    }

    function _removeClickOutsideListener() {
        if (_clickOutsideHandler) {
            document.removeEventListener('click', _clickOutsideHandler, true);
            _clickOutsideHandler = null;
        }
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
     * Update button states and rebuild layout based on scheduler role.
     */
    function _updateButtonState() {
        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId || _currentSelection.length === 0) return;

        const teamId = MatchSchedulerApp.getSelectedTeam()?.id;
        if (!teamId) {
            _hide();
            return;
        }

        const isScheduler = typeof TeamService !== 'undefined' && TeamService.isScheduler(teamId, userId);
        _buildLayout(isScheduler);

        // Count how many selected cells have the current user
        let userInCount = 0;
        let userUnavailCount = 0;
        _currentSelection.forEach(({ weekId, slotId }) => {
            const players = AvailabilityService.getSlotPlayers(teamId, weekId, slotId);
            if (players?.includes(userId)) userInCount++;
            const unavailPlayers = AvailabilityService.getSlotUnavailablePlayers(teamId, weekId, slotId);
            if (unavailPlayers?.includes(userId)) userUnavailCount++;
        });

        const userInAll = userInCount === _currentSelection.length;
        const userInNone = userInCount === 0;

        _setButtonDisabled(_addMeButton, userInAll, 'bg-primary text-primary-foreground hover:bg-primary/90');
        _setButtonDisabled(_removeMeButton, userInNone, 'bg-destructive text-destructive-foreground hover:bg-destructive/90');
    }

    function _positionButton() {
        if (!_currentBounds || !_container) return;

        const padding = 8;
        const bottomPadding = (typeof MobileLayout !== 'undefined' && MobileLayout.isMobile()) ? 56 : padding;

        const wasHidden = _container.classList.contains('hidden');
        _container.style.visibility = 'hidden';
        _container.classList.remove('hidden');
        const containerRect = _container.getBoundingClientRect();
        const containerWidth = containerRect.width || 160;
        const containerHeight = containerRect.height || 40;
        if (wasHidden) _container.classList.add('hidden');
        _container.style.visibility = '';

        let left = _currentBounds.right + padding;
        // Anchor to selection top, not bottom-minus-height (prevents jump when content changes)
        let top = _currentBounds.top;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (left + containerWidth > viewportWidth - padding) {
            left = _currentBounds.left - containerWidth - padding;
        }
        if (left < padding) {
            left = viewportWidth - containerWidth - padding;
        }
        if (top + containerHeight > viewportHeight - bottomPadding) {
            top = viewportHeight - containerHeight - bottomPadding;
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
            if (_rosterOpen) {
                _hideRosterPanel();
            } else if (_dropdownOpen) {
                _closeMoreDropdown();
            } else {
                _handleClear();
            }
        }
    }

    function _show() {
        _container?.classList.remove('hidden');
        _addClickOutsideListener();
    }

    function _hide() {
        _container?.classList.add('hidden');
        _dropdownOpen = false;
        _rosterOpen = false;
        _removeClickOutsideListener();
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
        _removeClickOutsideListener();
        _container?.remove();
        _container = null;
        _addMeButton = null;
        _removeMeButton = null;
        _moreButton = null;
        _moreDropdown = null;
        _moreMenuItems = null;
        _unavailMeButton = null;
        _templateButton = null;
        _findStandinButton = null;
        _othersButton = null;
        _rosterPanel = null;
        _dropdownOpen = false;
        _rosterOpen = false;
        _currentSelection = [];
        _currentBounds = null;
    }

    return { init, cleanup };
})();
