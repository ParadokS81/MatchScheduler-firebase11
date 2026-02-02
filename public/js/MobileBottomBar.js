const MobileBottomBar = (function() {
    'use strict';

    let _container = null;
    let _weekLabel = null;
    let _compareBtn = null;
    let _yourNumBtn = null;
    let _oppNumBtn = null;
    let _unsubWeekChange = null;
    let _initialized = false;

    // All content tabs (calendar stays with the group)
    const TABS = [
        { id: 'calendar',   icon: '📅', label: 'Calendar' },
        { id: 'teams',      icon: '👥', label: 'Teams' },
        { id: 'players',    icon: '🎮', label: 'Players' },
        { id: 'tournament', icon: '🏆', label: 'Tournament' },
        { id: 'matches',    icon: '⚔',  label: 'Matches' }
    ];

    function init() {
        if (_initialized) return;

        _container = document.querySelector('.mobile-bottom-bar-content');
        if (!_container) {
            console.warn('MobileBottomBar: container not found');
            return;
        }

        _render();
        _wireEvents();

        // Subscribe to week changes for label updates
        _unsubWeekChange = WeekNavigation.onWeekChange(_updateWeekLabel);

        // Set initial panel visibility (calendar is default) — mobile only
        if (MobileLayout.isMobile()) {
            _togglePanels(BottomPanelController.getActiveTab());
        }

        _initialized = true;
        console.log('📱 MobileBottomBar initialized');
    }

    function _render() {
        _container.innerHTML = '';

        // Left drawer toggle
        const leftBtn = _createButton('mobile-bb-left-drawer', '☰', 'Toggle team info', () => {
            if (MobileLayout.isDrawerOpen()) {
                MobileLayout.closeDrawer();
            } else {
                MobileLayout.openLeftDrawer();
            }
        });
        leftBtn.classList.add('mobile-bb-drawer-toggle');

        // Week navigation group (left side, near left drawer)
        const weekGroup = document.createElement('div');
        weekGroup.className = 'mobile-bb-week-nav';

        const prevBtn = _createButton('mobile-bb-week-prev', '◀', 'Previous week', () => {
            WeekNavigation.navigatePrev();
        });
        prevBtn.classList.add('mobile-bb-week-btn');

        _weekLabel = document.createElement('span');
        _weekLabel.className = 'mobile-bb-week-label';
        _updateWeekLabel(WeekNavigation.getCurrentWeekNumber());

        const nextBtn = _createButton('mobile-bb-week-next', '▶', 'Next week', () => {
            WeekNavigation.navigateNext();
        });
        nextBtn.classList.add('mobile-bb-week-btn');

        weekGroup.appendChild(prevBtn);
        weekGroup.appendChild(_weekLabel);
        weekGroup.appendChild(nextBtn);

        // Content tabs (center — all 5 tabs together)
        const tabGroup = document.createElement('div');
        tabGroup.className = 'mobile-bb-tabs';

        const activeTab = BottomPanelController.getActiveTab();
        TABS.forEach(tab => {
            const btn = _createButton(
                `mobile-bb-tab-${tab.id}`,
                tab.icon,
                tab.label,
                () => BottomPanelController.switchTab(tab.id)
            );
            btn.classList.add('mobile-bb-tab');
            btn.dataset.tab = tab.id;
            if (tab.id === activeTab) btn.classList.add('active');
            tabGroup.appendChild(btn);
        });

        // Compare + Filter group (right side)
        const compareGroup = document.createElement('div');
        compareGroup.className = 'mobile-bb-compare-group';

        const hasTeam = _getUserTeamId() !== null;
        const isComparing = typeof ComparisonEngine !== 'undefined' && ComparisonEngine.isAutoMode();

        // Compare toggle button — more descriptive label
        const compareLabel = isComparing ? 'Compare ON' : 'Compare';
        _compareBtn = _createButton('mobile-bb-compare', compareLabel, 'Toggle comparison mode', _handleCompareToggle);
        _compareBtn.classList.add('mobile-bb-compare-btn');
        if (isComparing) _compareBtn.classList.add('active');
        if (!hasTeam) _compareBtn.disabled = true;

        // Your team min number
        const yourMin = typeof FilterService !== 'undefined' ? FilterService.getYourTeamMinimum() : 1;
        _yourNumBtn = _createButton('mobile-bb-your-min', String(yourMin), 'Your team minimum', () => {
            _cycleFilter('yourTeam');
        });
        _yourNumBtn.classList.add('mobile-bb-filter-num');
        if (!hasTeam) _yourNumBtn.disabled = true;
        if (!isComparing) _yourNumBtn.classList.add('dimmed');

        const vsLabel = document.createElement('span');
        vsLabel.className = 'mobile-bb-vs-label';
        vsLabel.textContent = 'v';

        // Opponent min number
        const oppMin = typeof FilterService !== 'undefined' ? FilterService.getOpponentMinimum() : 1;
        _oppNumBtn = _createButton('mobile-bb-opp-min', String(oppMin), 'Opponent minimum', () => {
            _cycleFilter('opponent');
        });
        _oppNumBtn.classList.add('mobile-bb-filter-num');
        if (!hasTeam) _oppNumBtn.disabled = true;
        if (!isComparing) _oppNumBtn.classList.add('dimmed');

        compareGroup.appendChild(_compareBtn);
        compareGroup.appendChild(_yourNumBtn);
        compareGroup.appendChild(vsLabel);
        compareGroup.appendChild(_oppNumBtn);

        // Right drawer toggle
        const rightBtn = _createButton('mobile-bb-right-drawer', '☰', 'Toggle team browser', () => {
            if (MobileLayout.isDrawerOpen()) {
                MobileLayout.closeDrawer();
            } else {
                MobileLayout.openRightDrawer();
            }
        });
        rightBtn.classList.add('mobile-bb-drawer-toggle');

        // Assemble: [☰] [◀W6▶] [📅 👥 🎮 🏆 ⚔] [Compare 1v1] [☰]
        _container.appendChild(leftBtn);
        _container.appendChild(weekGroup);
        _container.appendChild(tabGroup);
        _container.appendChild(compareGroup);
        _container.appendChild(rightBtn);
    }

    function _createButton(id, text, ariaLabel, onClick) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'mobile-bb-btn';
        btn.textContent = text;
        btn.setAttribute('aria-label', ariaLabel);
        btn.addEventListener('click', onClick);
        return btn;
    }

    // ========================================
    // Compare + Filter Handlers
    // ========================================

    function _getUserTeamId() {
        const selectedTeam = typeof MatchSchedulerApp !== 'undefined'
            ? MatchSchedulerApp.getSelectedTeam()
            : null;
        return selectedTeam?.id || null;
    }

    function _handleCompareToggle() {
        const userTeamId = _getUserTeamId();
        if (!userTeamId || typeof ComparisonEngine === 'undefined') return;

        if (ComparisonEngine.isAutoMode()) {
            ComparisonEngine.endComparison();
        } else {
            ComparisonEngine.enableAutoMode(userTeamId);
        }
    }

    function _cycleFilter(which) {
        if (typeof FilterService === 'undefined') return;

        if (which === 'yourTeam') {
            const current = FilterService.getYourTeamMinimum();
            const next = current >= 4 ? 1 : current + 1;
            FilterService.setYourTeamMinimum(next);
        } else {
            const current = FilterService.getOpponentMinimum();
            const next = current >= 4 ? 1 : current + 1;
            FilterService.setOpponentMinimum(next);
        }
    }

    function _syncCompareState() {
        if (!_compareBtn) return;
        const isAuto = typeof ComparisonEngine !== 'undefined' && ComparisonEngine.isAutoMode();
        _compareBtn.classList.toggle('active', isAuto);
        _compareBtn.textContent = isAuto ? 'Compare ON' : 'Compare';
        // Dim/undim filter numbers based on compare state
        if (_yourNumBtn) _yourNumBtn.classList.toggle('dimmed', !isAuto);
        if (_oppNumBtn) _oppNumBtn.classList.toggle('dimmed', !isAuto);
    }

    function _syncFilterState() {
        if (typeof FilterService === 'undefined') return;
        if (_yourNumBtn) _yourNumBtn.textContent = String(FilterService.getYourTeamMinimum());
        if (_oppNumBtn) _oppNumBtn.textContent = String(FilterService.getOpponentMinimum());
    }

    // ========================================
    // Events
    // ========================================

    function _wireEvents() {
        // Sync active tab when BottomPanelController changes tab (e.g. from desktop)
        window.addEventListener('bottom-tab-changed', (e) => {
            _setActiveTab(e.detail.tab);
            if (MobileLayout.isMobile()) {
                _togglePanels(e.detail.tab);
            }
        });

        // Sync compare button state
        window.addEventListener('comparison-mode-changed', _syncCompareState);
        window.addEventListener('comparison-started', _syncCompareState);
        window.addEventListener('comparison-ended', _syncCompareState);

        // Sync filter number display
        window.addEventListener('filter-changed', _syncFilterState);
    }

    function _setActiveTab(tabId) {
        if (!_container) return;
        _container.querySelectorAll('.mobile-bb-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
    }

    /**
     * On mobile: Calendar tab shows panel-top-center, other tabs show panel-bottom-center
     */
    function _togglePanels(tabId) {
        const topCenter = document.getElementById('panel-top-center');
        const bottomCenter = document.getElementById('panel-bottom-center');
        if (!topCenter || !bottomCenter) return;

        if (tabId === 'calendar') {
            topCenter.style.display = '';
            bottomCenter.style.display = 'none';
        } else {
            topCenter.style.display = 'none';
            bottomCenter.style.display = '';
            // Hide floating action buttons when leaving calendar tab
            document.dispatchEvent(new CustomEvent('grid-selection-change', {
                detail: { gridId: null, selectedCells: [], bounds: null }
            }));
        }
    }

    function _updateWeekLabel(anchorWeek) {
        if (!_weekLabel) return;
        _weekLabel.textContent = `W${anchorWeek}`;
    }

    function cleanup() {
        if (_unsubWeekChange) _unsubWeekChange();
        window.removeEventListener('comparison-mode-changed', _syncCompareState);
        window.removeEventListener('comparison-started', _syncCompareState);
        window.removeEventListener('comparison-ended', _syncCompareState);
        window.removeEventListener('filter-changed', _syncFilterState);
        if (_container) _container.innerHTML = '';
        _weekLabel = null;
        _compareBtn = null;
        _yourNumBtn = null;
        _oppNumBtn = null;
        _initialized = false;
    }

    return {
        init,
        cleanup
    };
})();
