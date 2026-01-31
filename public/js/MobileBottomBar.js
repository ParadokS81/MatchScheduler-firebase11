const MobileBottomBar = (function() {
    'use strict';

    let _container = null;
    let _weekLabel = null;
    let _unsubWeekChange = null;
    let _initialized = false;

    // Tab definitions: id, icon, label (for aria)
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

        _initialized = true;
        console.log('📱 MobileBottomBar initialized');
    }

    function _render() {
        _container.innerHTML = '';

        // Left drawer toggle
        const leftBtn = _createButton('mobile-bb-left-drawer', '☰', 'Open team info', () => {
            MobileLayout.openLeftDrawer();
        });
        leftBtn.classList.add('mobile-bb-drawer-toggle');

        // Tab buttons
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

        // Week navigation group
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

        // Right drawer toggle
        const rightBtn = _createButton('mobile-bb-right-drawer', '☰', 'Open team browser', () => {
            MobileLayout.openRightDrawer();
        });
        rightBtn.classList.add('mobile-bb-drawer-toggle');

        // Assemble: [Left] [Tabs] [WeekNav] [Right]
        _container.appendChild(leftBtn);
        _container.appendChild(tabGroup);
        _container.appendChild(weekGroup);
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

    function _wireEvents() {
        // Sync active tab when BottomPanelController changes tab (e.g. from desktop)
        window.addEventListener('bottom-tab-changed', (e) => {
            _setActiveTab(e.detail.tab);
        });
    }

    function _setActiveTab(tabId) {
        if (!_container) return;
        _container.querySelectorAll('.mobile-bb-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
    }

    function _updateWeekLabel(anchorWeek) {
        if (!_weekLabel) return;
        _weekLabel.textContent = `W${anchorWeek}`;
    }

    function cleanup() {
        if (_unsubWeekChange) _unsubWeekChange();
        if (_container) _container.innerHTML = '';
        _weekLabel = null;
        _initialized = false;
    }

    return {
        init,
        cleanup
    };
})();
