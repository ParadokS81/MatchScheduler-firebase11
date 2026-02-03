// MatchScheduler Application Entry Point
// Following PRD v2 Architecture with Revealing Module Pattern
// Enhanced for Slice 2.5: Team view display with player badges
// Enhanced for Slice 3.3: Comparison filter controls

const MatchSchedulerApp = (function() {
    'use strict';

    // Private variables
    let _initialized = false;
    let _currentUser = null;
    let _selectedTeam = null;
    let _weekDisplay1 = null;
    let _weekDisplay2 = null;

    // Initialize application
    function init() {
        if (_initialized) return;

        console.log('🚀 MatchScheduler v3.0 - Initializing...');

        // Wait for Firebase to be ready
        if (typeof window.firebase === 'undefined') {
            setTimeout(init, 100);
            return;
        }

        _initializeComponents();
        _setupEventListeners();
        _initialized = true;

        console.log('✅ MatchScheduler initialized successfully');
    }

    // Initialize components
    function _initializeComponents() {
        // Initialize TeamInfo component in top-left panel
        TeamInfo.init('panel-top-left');

        // Initialize ToastService for notifications
        ToastService.init();

        // Initialize compact profile in divider (Slice 5.0a)
        // Note: renderCompact updates automatically when auth state changes
        if (typeof UserProfile !== 'undefined') {
            UserProfile.renderCompact('profile-compact-container');
        }

        // Initialize compact filter in divider (Slice 5.0a)
        if (typeof FilterPanel !== 'undefined') {
            FilterPanel.init('filter-compact-container');
        }

        // Initialize Availability Grid components
        _initializeAvailabilityGrid();

        // Initialize TeamBrowser in bottom-right panel (Slice 3.1)
        _initializeTeamBrowser();

        // Set up comparison event listeners (Slice 3.4)
        _setupComparisonListeners();

        // Set up scheduled match highlights on grid
        _setupScheduledMatchListener();

        // Initialize MobileLayout for drawer management (Slice 10.0b)
        if (typeof MobileLayout !== 'undefined') {
            MobileLayout.init();
        }
        if (typeof MobileBottomBar !== 'undefined') {
            MobileBottomBar.init();
        }

        // Initialize hash-based router for back/forward navigation
        if (typeof Router !== 'undefined') {
            Router.init();
        }

        console.log('🧩 Components initialized');
    }

    // Initialize TeamBrowser component (Slice 3.1)
    function _initializeTeamBrowser() {
        if (typeof TeamBrowser !== 'undefined' && TeamService.isCacheReady()) {
            TeamBrowser.init('team-browser-container');
            console.log('🔍 TeamBrowser initialized');
        } else {
            // Retry after cache is ready
            const checkCache = setInterval(() => {
                if (TeamService.isCacheReady()) {
                    clearInterval(checkCache);
                    if (typeof TeamBrowser !== 'undefined') {
                        TeamBrowser.init('team-browser-container');
                        console.log('🔍 TeamBrowser initialized (after cache ready)');
                    }
                }
            }, 200);
            // Give up after 10 seconds
            setTimeout(() => clearInterval(checkCache), 10000);
        }
    }

    // Initialize availability grid components
    function _initializeAvailabilityGrid() {
        // Initialize TimezoneService before grid (Slice 7.0b)
        // Auto-detects from browser; user preference loaded later from Firestore
        if (typeof TimezoneService !== 'undefined') {
            TimezoneService.init();
        }

        // Initialize WeekNavigation state manager
        WeekNavigation.init();

        // Get current week number
        const currentWeek = WeekNavigation.getCurrentWeekNumber();

        // Initialize Week 1 display in top-center panel (navigation arrows visible)
        _weekDisplay1 = WeekDisplay.create('panel-top-center', currentWeek, { showNavigation: true, showTimezoneSelector: true });
        _weekDisplay1.init();

        // Initialize Week 2 display in bottom-center panel (navigation arrows visible)
        _weekDisplay2 = WeekDisplay.create('panel-bottom-center', currentWeek + 1, { showNavigation: true });
        _weekDisplay2.init();

        // Listen for week navigation changes and update both grids
        WeekNavigation.onWeekChange((anchorWeek, secondWeek) => {
            console.log('📅 Week navigation changed:', anchorWeek, secondWeek);

            // Update week displays
            _weekDisplay1.setWeekNumber(anchorWeek);
            _weekDisplay2.setWeekNumber(secondWeek);

            // Re-setup availability listeners for the new weeks if a team is selected
            if (_selectedTeam) {
                _setupAvailabilityListeners(_selectedTeam.id);
            }

            // Refresh scheduled match highlights for new weeks
            _updateScheduledMatchHighlights();
        });

        // Listen for timezone changes (Slice 7.0c) - rebuild grids with new UTC mappings
        window.addEventListener('timezone-changed', () => {
            _weekDisplay1.rebuildGrid();
            _weekDisplay2.rebuildGrid();

            // Re-setup availability listeners so grid re-renders with team data
            if (_selectedTeam) {
                _setupAvailabilityListeners(_selectedTeam.id);
            }

            // Refresh scheduled match highlights after grid rebuild
            _updateScheduledMatchHighlights();
        });

        // Set up overflow click handlers for both grids (Slice 2.5)
        _setupOverflowHandlers();

        // Slice 6.0b: GridActionButtons now initializes into drawer container in TeamInfo
        // Listen for drawer-ready event from TeamInfo (dispatched when drawer HTML is rendered)
        const initGridActionButtons = () => {
            const container = document.getElementById('grid-tools-drawer-content');
            if (!container) return; // Container not ready yet

            GridActionButtons.init('grid-tools-drawer-content', {
                getSelectedCells: _getAllSelectedCells,
                clearSelections: _clearAllSelections,
                onSyncStart: _handleSyncStart,
                onSyncEnd: _handleSyncEnd,
                clearAll: _handleClearAll,
                loadTemplate: _handleLoadTemplate,
                onDisplayModeChange: _handleDisplayModeChange
            });
        };

        // Listen for drawer-ready event (fires each time TeamInfo re-renders the drawer)
        window.addEventListener('grid-tools-drawer-ready', initGridActionButtons);

        // Try immediately in case drawer already exists
        initGridActionButtons();

        // Initialize SelectionActionButton (Slice 5.0b: floating action button)
        if (typeof SelectionActionButton !== 'undefined') {
            SelectionActionButton.init();
        }

        // Fallback clear-all listener (mobile: GridActionButtons may not be initialized yet)
        document.addEventListener('clear-all-selections', _handleClearAll);

        // Mobile bottom bar: load-template event (templates popup)
        window.addEventListener('load-template', (e) => {
            const { slots, weekIndex } = e.detail;
            if (slots && weekIndex !== undefined) {
                _handleLoadTemplate(slots, weekIndex);
            }
        });

        // Slice 5.0.1: Refresh grids when player colors change
        window.addEventListener('player-colors-changed', () => {
            if (_weekDisplay1) _weekDisplay1.refreshDisplay();
            if (_weekDisplay2) _weekDisplay2.refreshDisplay();
        });

        // Register selection change handlers
        _weekDisplay1.onSelectionChange(() => GridActionButtons.onSelectionChange());
        _weekDisplay2.onSelectionChange(() => GridActionButtons.onSelectionChange());

        // Initialize BottomPanelController for tab switching (Slice 5.0a)
        if (typeof BottomPanelController !== 'undefined') {
            BottomPanelController.init(_weekDisplay2);
        }

        // Initialize UpcomingMatchesPanel in bottom-left panel
        if (typeof UpcomingMatchesPanel !== 'undefined') {
            UpcomingMatchesPanel.init('upcoming-matches-container');
        }

        console.log(`📅 Availability grids initialized for weeks ${currentWeek} and ${currentWeek + 1}`);
    }

    /**
     * Set up overflow click handlers for both week grids (Slice 2.5)
     */
    function _setupOverflowHandlers() {
        const handleOverflowClick = (cellId, weekNumber) => {
            const team = _selectedTeam;
            if (!team) return;

            const currentUserId = window.firebase?.auth?.currentUser?.uid;

            // Determine which week display this is from (weekNumber is the grid's week number)
            const weekDisplay = weekNumber === _weekDisplay1?.getWeekNumber()
                ? _weekDisplay1
                : _weekDisplay2;

            const weekId = weekDisplay?.getWeekId();
            const availabilityData = AvailabilityService.getCachedData(team.id, weekId);

            // Extract slots from availability data
            let slots = {};
            if (availabilityData?.slots && typeof availabilityData.slots === 'object') {
                slots = availabilityData.slots;
            } else if (availabilityData) {
                Object.entries(availabilityData).forEach(([key, value]) => {
                    if (key.startsWith('slots.')) {
                        const slotId = key.replace('slots.', '');
                        slots[slotId] = value;
                    }
                });
            }

            const playerIds = slots[cellId] || [];

            if (playerIds.length > 0 && typeof OverflowModal !== 'undefined') {
                OverflowModal.show(
                    cellId,
                    weekId,
                    playerIds,
                    team.playerRoster || [],
                    currentUserId
                );
            }
        };

        if (_weekDisplay1) {
            _weekDisplay1.onOverflowClick(handleOverflowClick);
        }
        if (_weekDisplay2) {
            _weekDisplay2.onOverflowClick(handleOverflowClick);
        }
    }

    /**
     * Handle display mode change (Slice 2.5)
     * Refresh all grids when switching between initials/avatars
     */
    function _handleDisplayModeChange(mode) {
        console.log('🎨 Display mode changed to:', mode);
        if (_weekDisplay1) _weekDisplay1.refreshDisplay();
        if (_weekDisplay2) _weekDisplay2.refreshDisplay();
    }

    // ========================================
    // Slice 3.4: Comparison Event Listeners
    // ========================================

    /**
     * Set up event listeners for comparison mode
     */
    function _setupComparisonListeners() {
        // When comparison starts, enter comparison mode on both grids
        window.addEventListener('comparison-started', () => {
            console.log('📊 Comparison started - entering comparison mode');
            if (_weekDisplay1) _weekDisplay1.enterComparisonMode();
            if (_weekDisplay2) _weekDisplay2.enterComparisonMode();
            // Initial highlight update
            _updateComparisonHighlights();
        });

        // When comparison results update, refresh highlights
        window.addEventListener('comparison-updated', () => {
            console.log('📊 Comparison updated - refreshing highlights');
            _updateComparisonHighlights();
        });

        // When comparison ends, exit comparison mode
        window.addEventListener('comparison-ended', () => {
            console.log('📊 Comparison ended - exiting comparison mode');
            if (_weekDisplay1) _weekDisplay1.exitComparisonMode();
            if (_weekDisplay2) _weekDisplay2.exitComparisonMode();
        });
    }

    /**
     * Update comparison highlights on both week grids
     */
    function _updateComparisonHighlights() {
        if (_weekDisplay1) _weekDisplay1.updateComparisonHighlights();
        if (_weekDisplay2) _weekDisplay2.updateComparisonHighlights();
    }

    /**
     * Get all selected cells from both week grids
     * @returns {Array<{weekId: string, slotId: string}>}
     */
    function _getAllSelectedCells() {
        const cells = [];

        if (_weekDisplay1) {
            cells.push(..._weekDisplay1.getSelectedCellsWithWeekId());
        }
        if (_weekDisplay2) {
            cells.push(..._weekDisplay2.getSelectedCellsWithWeekId());
        }

        return cells;
    }

    /**
     * Clear selections from all grids
     */
    function _clearAllSelections() {
        if (_weekDisplay1) _weekDisplay1.clearSelection();
        if (_weekDisplay2) _weekDisplay2.clearSelection();
    }

    /**
     * Handle sync start - add shimmer to syncing cells
     * @param {Array<{weekId: string, slotId: string}>} cells
     */
    function _handleSyncStart(cells) {
        // Group by week and apply shimmer
        const week1Id = _weekDisplay1?.getWeekId();
        const week2Id = _weekDisplay2?.getWeekId();

        const week1Slots = cells.filter(c => c.weekId === week1Id).map(c => c.slotId);
        const week2Slots = cells.filter(c => c.weekId === week2Id).map(c => c.slotId);

        if (week1Slots.length > 0 && _weekDisplay1) {
            _weekDisplay1.setSyncingCells(week1Slots);
        }
        if (week2Slots.length > 0 && _weekDisplay2) {
            _weekDisplay2.setSyncingCells(week2Slots);
        }
    }

    /**
     * Handle sync end - clear shimmer from all cells
     */
    function _handleSyncEnd() {
        if (_weekDisplay1) _weekDisplay1.clearSyncingCells();
        if (_weekDisplay2) _weekDisplay2.clearSyncingCells();
    }

    /**
     * Handle Clear All - clear all selections in both visible weeks
     */
    function _handleClearAll() {
        if (_weekDisplay1) _weekDisplay1.clearAll();
        if (_weekDisplay2) _weekDisplay2.clearAll();
    }

    /**
     * Handle Load Template - apply template slots to a specific week grid
     * @param {string[]} slots - Array of slot IDs from template
     * @param {number} weekIndex - 0 for first week, 1 for second week
     */
    function _handleLoadTemplate(slots, weekIndex) {
        const targetWeek = weekIndex === 0 ? _weekDisplay1 : _weekDisplay2;
        if (!targetWeek) {
            console.error('Grid not found for week index:', weekIndex);
            return;
        }

        // Clear current selection in that grid
        targetWeek.clearSelection();

        // Select the template slots
        slots.forEach(slotId => {
            targetWeek.selectCell(slotId);
        });

        // Notify selection change so buttons update
        GridActionButtons.onSelectionChange();
    }

    /**
     * Set the selected team and set up availability listeners
     * @param {Object} team - Team object with id property
     */
    function setSelectedTeam(team) {
        // Clean up previous listeners
        if (_selectedTeam) {
            const week1Id = _weekDisplay1?.getWeekId();
            const week2Id = _weekDisplay2?.getWeekId();

            if (week1Id) AvailabilityService.unsubscribe(_selectedTeam.id, week1Id);
            if (week2Id) AvailabilityService.unsubscribe(_selectedTeam.id, week2Id);
        }

        _selectedTeam = team;

        // Notify components that the user's own team changed
        window.dispatchEvent(new CustomEvent('user-team-changed', {
            detail: { teamId: team?.id || null }
        }));

        if (team) {
            // Set up new availability listeners
            _setupAvailabilityListeners(team.id);

            // Update TeamBrowser to exclude new current team (Slice 3.1)
            if (typeof TeamBrowser !== 'undefined') {
                TeamBrowser.setCurrentTeam(team.id);
            }
        }
    }

    /**
     * Set up availability listeners for a team
     * Enhanced for Slice 2.5: Now updates team display with player badges
     * @param {string} teamId
     */
    async function _setupAvailabilityListeners(teamId) {
        const week1Id = _weekDisplay1?.getWeekId();
        const week2Id = _weekDisplay2?.getWeekId();
        const userId = window.firebase?.auth?.currentUser?.uid;

        console.log('📡 Setting up availability listeners for team:', teamId, 'weeks:', week1Id, week2Id, 'user:', userId);

        if (week1Id) {
            // Load initial data
            await AvailabilityService.loadWeekAvailability(teamId, week1Id);
            const data1 = AvailabilityService.getCachedData(teamId, week1Id);
            console.log('📊 Week 1 initial data:', data1);
            if (data1 && userId && _weekDisplay1) {
                // Update both personal availability indicator and team display
                _weekDisplay1.getGrid()?.updateAvailabilityDisplay(data1, userId);
                _updateTeamDisplay(_weekDisplay1, data1, userId);
            }

            // Subscribe to real-time updates (get userId dynamically in callback)
            AvailabilityService.subscribe(teamId, week1Id, (data) => {
                const currentUserId = window.firebase?.auth?.currentUser?.uid;
                console.log('🔄 Week 1 listener fired:', data, 'user:', currentUserId);
                if (_weekDisplay1 && currentUserId) {
                    _weekDisplay1.getGrid()?.updateAvailabilityDisplay(data, currentUserId);
                    _updateTeamDisplay(_weekDisplay1, data, currentUserId);
                }
            });
        }

        if (week2Id) {
            // Load initial data
            await AvailabilityService.loadWeekAvailability(teamId, week2Id);
            const data2 = AvailabilityService.getCachedData(teamId, week2Id);
            console.log('📊 Week 2 initial data:', data2);
            if (data2 && userId && _weekDisplay2) {
                // Update both personal availability indicator and team display
                _weekDisplay2.getGrid()?.updateAvailabilityDisplay(data2, userId);
                _updateTeamDisplay(_weekDisplay2, data2, userId);
            }

            // Subscribe to real-time updates (get userId dynamically in callback)
            AvailabilityService.subscribe(teamId, week2Id, (data) => {
                const currentUserId = window.firebase?.auth?.currentUser?.uid;
                console.log('🔄 Week 2 listener fired:', data, 'user:', currentUserId);
                if (_weekDisplay2 && currentUserId) {
                    _weekDisplay2.getGrid()?.updateAvailabilityDisplay(data, currentUserId);
                    _updateTeamDisplay(_weekDisplay2, data, currentUserId);
                }
            });
        }
    }

    /**
     * Update team display with player badges (Slice 2.5)
     * @param {Object} weekDisplay - WeekDisplay instance
     * @param {Object} availabilityData - Availability data from Firebase
     * @param {string} currentUserId - Current user's ID
     */
    function _updateTeamDisplay(weekDisplay, availabilityData, currentUserId) {
        if (!weekDisplay || !_selectedTeam) return;

        const playerRoster = _selectedTeam.playerRoster || [];
        weekDisplay.updateTeamDisplay(availabilityData, playerRoster, currentUserId);
    }

    // ========================================
    // Scheduled Match Grid Highlights
    // ========================================

    let _scheduledMatchUnsub = null;

    /**
     * Set up Firestore listener for scheduled matches to highlight on the grid.
     * Called once during init — updates grid highlights when matches change.
     */
    async function _setupScheduledMatchListener() {
        if (_scheduledMatchUnsub) return; // Already set up

        const { collection, query, where, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        const matchesQuery = query(
            collection(window.firebase.db, 'scheduledMatches'),
            where('status', '==', 'upcoming')
        );

        _scheduledMatchUnsub = onSnapshot(matchesQuery, (snapshot) => {
            // Update ScheduledMatchService cache
            snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') {
                    ScheduledMatchService.removeFromCache(change.doc.id);
                } else {
                    ScheduledMatchService.updateCache(change.doc.id, change.doc.data());
                }
            });
            // Refresh grid highlights
            _updateScheduledMatchHighlights();
        });
    }

    /**
     * Update scheduled match highlights on both week grids
     */
    function _updateScheduledMatchHighlights() {
        if (typeof ScheduledMatchService === 'undefined') return;

        const allMatches = ScheduledMatchService.getMatchesFromCache()
            .filter(m => m.status === 'upcoming');

        if (_weekDisplay1) {
            const week1Id = _weekDisplay1.getWeekId();
            const week1Matches = allMatches.filter(m => m.weekId === week1Id);
            _weekDisplay1.updateScheduledMatchHighlights(week1Matches);
        }

        if (_weekDisplay2) {
            const week2Id = _weekDisplay2.getWeekId();
            const week2Matches = allMatches.filter(m => m.weekId === week2Id);
            _weekDisplay2.updateScheduledMatchHighlights(week2Matches);
        }
    }

    // Setup event listeners
    function _setupEventListeners() {
        // Settings button
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', _handleSettingsClick);
        }

        // Save button
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', _handleSaveClick);
        }

        // Listen for profile updates (avatar changes, etc.) to refresh grid display
        window.addEventListener('profile-updated', _handleProfileUpdated);
    }

    /**
     * Handle profile-updated event - refresh team data to get updated roster
     * This ensures avatar changes propagate to the grid display
     */
    async function _handleProfileUpdated(event) {
        if (!_selectedTeam) return;

        console.log('👤 Profile updated, refreshing team roster...');

        try {
            // Re-fetch team to get updated playerRoster (with new photoURL)
            // Force refresh to bypass cache and get fresh data from Firestore
            const updatedTeam = await TeamService.getTeam(_selectedTeam.id, true);
            if (updatedTeam) {
                _selectedTeam = updatedTeam;

                // Refresh both week displays with updated roster
                const currentUserId = window.firebase?.auth?.currentUser?.uid;
                if (currentUserId) {
                    const week1Id = _weekDisplay1?.getWeekId();
                    const week2Id = _weekDisplay2?.getWeekId();

                    if (week1Id) {
                        const data1 = AvailabilityService.getCachedData(_selectedTeam.id, week1Id);
                        if (data1) _updateTeamDisplay(_weekDisplay1, data1, currentUserId);
                    }
                    if (week2Id) {
                        const data2 = AvailabilityService.getCachedData(_selectedTeam.id, week2Id);
                        if (data2) _updateTeamDisplay(_weekDisplay2, data2, currentUserId);
                    }
                }
                console.log('✅ Grid refreshed with updated roster');
            }
        } catch (error) {
            console.error('Failed to refresh team after profile update:', error);
        }
    }


    // Event handlers
    function _handleSettingsClick() {
        console.log('⚙️ Settings clicked');
        // TODO: Implement settings modal
    }

    function _handleSaveClick() {
        console.log('💾 Save clicked');
        // TODO: Implement save functionality
    }

    // Cleanup function
    function cleanup() {
        // Remove profile-updated listener
        window.removeEventListener('profile-updated', _handleProfileUpdated);

        if (typeof UserProfile !== 'undefined') {
            UserProfile.cleanup();
        }
        if (typeof TeamInfo !== 'undefined') {
            TeamInfo.cleanup();
        }
        if (typeof TeamService !== 'undefined') {
            TeamService.cleanup();
        }
        if (typeof WeekNavigation !== 'undefined') {
            WeekNavigation.cleanup();
        }
        if (_weekDisplay1) {
            _weekDisplay1.cleanup();
            _weekDisplay1 = null;
        }
        if (_weekDisplay2) {
            _weekDisplay2.cleanup();
            _weekDisplay2 = null;
        }
        if (typeof GridActionButtons !== 'undefined') {
            GridActionButtons.cleanup();
        }
        // Slice 5.0b: Clean up SelectionActionButton
        if (typeof SelectionActionButton !== 'undefined') {
            SelectionActionButton.cleanup();
        }
        if (typeof AvailabilityService !== 'undefined') {
            AvailabilityService.cleanup();
        }
        if (typeof TemplateService !== 'undefined') {
            TemplateService.cleanup();
        }
        // Slice 2.5: Clean up tooltip and modal
        if (typeof PlayerTooltip !== 'undefined') {
            PlayerTooltip.cleanup();
        }
        if (typeof OverflowModal !== 'undefined') {
            OverflowModal.cleanup();
        }
        // Slice 3.1: Clean up TeamBrowser
        if (typeof TeamBrowser !== 'undefined') {
            TeamBrowser.cleanup();
        }
        // Slice 3.2: Clean up Favorites
        if (typeof FavoritesPanel !== 'undefined') {
            FavoritesPanel.cleanup();
        }
        if (typeof FavoritesService !== 'undefined') {
            FavoritesService.clear();
        }
        // Slice 3.3: Clean up FilterPanel
        if (typeof FilterPanel !== 'undefined') {
            FilterPanel.cleanup();
        }
        // Slice 3.4: End any active comparison
        if (typeof ComparisonEngine !== 'undefined' && ComparisonEngine.isActive()) {
            ComparisonEngine.endComparison();
        }
        // Slice 5.0a: Clean up BottomPanelController
        if (typeof BottomPanelController !== 'undefined') {
            BottomPanelController.cleanup();
        }
        // Clean up Router
        if (typeof Router !== 'undefined') {
            Router.cleanup();
        }
        // Clean up UpcomingMatchesPanel
        if (typeof UpcomingMatchesPanel !== 'undefined') {
            UpcomingMatchesPanel.cleanup();
        }
    }

    // Public API
    return {
        init: init,
        cleanup: cleanup,
        getCurrentUser: () => _currentUser,
        getSelectedTeam: () => _selectedTeam,
        setSelectedTeam: setSelectedTeam
    };
})();

// Make globally accessible (needed because this is a module)
window.MatchSchedulerApp = MatchSchedulerApp;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', MatchSchedulerApp.init);

// Initialize when Firebase is ready (fallback)
window.addEventListener('load', MatchSchedulerApp.init);

// Cleanup when page unloads
window.addEventListener('beforeunload', MatchSchedulerApp.cleanup);
