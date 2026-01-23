// MatchScheduler Application Entry Point
// Following PRD v2 Architecture with Revealing Module Pattern

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
        // Initialize UserProfile component in top-left panel
        UserProfile.init('panel-top-left');

        // Initialize TeamInfo component in middle-left panel
        TeamInfo.init('panel-middle-left');

        // Initialize ToastService for notifications
        ToastService.init();

        // Initialize Availability Grid components
        _initializeAvailabilityGrid();

        console.log('🧩 Components initialized');
    }

    // Initialize availability grid components
    function _initializeAvailabilityGrid() {
        // Initialize week navigation in top-center panel
        WeekNavigation.init('panel-top-center');

        // Get current week number
        const currentWeek = WeekNavigation.getCurrentWeekNumber();

        // Initialize Week 1 display in middle-center panel
        _weekDisplay1 = WeekDisplay.create('panel-middle-center', currentWeek);
        _weekDisplay1.init();

        // Initialize Week 2 display in bottom-center panel
        _weekDisplay2 = WeekDisplay.create('panel-bottom-center', currentWeek + 1);
        _weekDisplay2.init();

        // Initialize GridActionButtons with callbacks
        GridActionButtons.init('grid-action-buttons-container', {
            getSelectedCells: _getAllSelectedCells,
            clearSelections: _clearAllSelections,
            onSyncStart: _handleSyncStart,
            onSyncEnd: _handleSyncEnd,
            selectAll: _handleSelectAll,
            clearAll: _handleClearAll,
            loadTemplate: _handleLoadTemplate
        });

        // Register selection change handlers
        _weekDisplay1.onSelectionChange(() => GridActionButtons.onSelectionChange());
        _weekDisplay2.onSelectionChange(() => GridActionButtons.onSelectionChange());

        console.log(`📅 Availability grids initialized for weeks ${currentWeek} and ${currentWeek + 1}`);
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
     * Handle Select All - select all cells in both visible weeks
     */
    function _handleSelectAll() {
        if (_weekDisplay1) _weekDisplay1.selectAll();
        if (_weekDisplay2) _weekDisplay2.selectAll();
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

        if (team) {
            // Set up new availability listeners
            _setupAvailabilityListeners(team.id);
        }
    }

    /**
     * Set up availability listeners for a team
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
                _weekDisplay1.getGrid()?.updateAvailabilityDisplay(data1, userId);
            }

            // Subscribe to real-time updates (get userId dynamically in callback)
            AvailabilityService.subscribe(teamId, week1Id, (data) => {
                const currentUserId = window.firebase?.auth?.currentUser?.uid;
                console.log('🔄 Week 1 listener fired:', data, 'user:', currentUserId);
                if (_weekDisplay1 && currentUserId) {
                    _weekDisplay1.getGrid()?.updateAvailabilityDisplay(data, currentUserId);
                }
            });
        }

        if (week2Id) {
            // Load initial data
            await AvailabilityService.loadWeekAvailability(teamId, week2Id);
            const data2 = AvailabilityService.getCachedData(teamId, week2Id);
            console.log('📊 Week 2 initial data:', data2);
            if (data2 && userId && _weekDisplay2) {
                _weekDisplay2.getGrid()?.updateAvailabilityDisplay(data2, userId);
            }

            // Subscribe to real-time updates (get userId dynamically in callback)
            AvailabilityService.subscribe(teamId, week2Id, (data) => {
                const currentUserId = window.firebase?.auth?.currentUser?.uid;
                console.log('🔄 Week 2 listener fired:', data, 'user:', currentUserId);
                if (_weekDisplay2 && currentUserId) {
                    _weekDisplay2.getGrid()?.updateAvailabilityDisplay(data, currentUserId);
                }
            });
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
        if (typeof AvailabilityService !== 'undefined') {
            AvailabilityService.cleanup();
        }
        if (typeof TemplateService !== 'undefined') {
            TemplateService.cleanup();
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