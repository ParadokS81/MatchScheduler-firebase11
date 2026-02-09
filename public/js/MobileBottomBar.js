const MobileBottomBar = (function() {
    'use strict';

    let _container = null;
    let _weekLabel = null;
    let _yourNumBtn = null;
    let _oppNumBtn = null;
    let _templateBtn = null;
    let _unsubWeekChange = null;
    let _initialized = false;

    // SVG icon templates (lucide-style, 24x24 viewBox)
    const TAB_ICONS = {
        calendar:   '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        teams:      '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        players:    '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        tournament: '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
        matches:    '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 2.5 21 6l-3 3"/><path d="M21 6H3"/><path d="M6.5 21.5 3 18l3-3"/><path d="M3 18h18"/></svg>'
    };

    // All content tabs (calendar stays with the group)
    const TABS = [
        { id: 'calendar',   label: 'Calendar' },
        { id: 'teams',      label: 'Teams' },
        { id: 'players',    label: 'Players' },
        { id: 'tournament', label: 'Tournament' },
        { id: 'matches',    label: 'Matches' }
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
            const btn = document.createElement('button');
            btn.id = `mobile-bb-tab-${tab.id}`;
            btn.className = 'mobile-bb-btn mobile-bb-tab';
            btn.setAttribute('aria-label', tab.label);
            btn.innerHTML = TAB_ICONS[tab.id] || '';
            btn.addEventListener('click', () => BottomPanelController.switchTab(tab.id));
            btn.dataset.tab = tab.id;
            if (tab.id === activeTab) btn.classList.add('active');
            tabGroup.appendChild(btn);
        });

        // Filter group (right side): [X] v [X]
        const compareGroup = document.createElement('div');
        compareGroup.className = 'mobile-bb-compare-group';

        const hasTeam = _getUserTeamId() !== null;

        // Your team min number
        const yourMin = typeof FilterService !== 'undefined' ? FilterService.getYourTeamMinimum() : 1;
        _yourNumBtn = _createButton('mobile-bb-your-min', String(yourMin), 'Your team minimum', (e) => {
            _showFilterPicker('yourTeam', _yourNumBtn, e);
        });
        _yourNumBtn.classList.add('mobile-bb-filter-num');
        if (!hasTeam) _yourNumBtn.disabled = true;

        const vsLabel = document.createElement('span');
        vsLabel.className = 'mobile-bb-vs-label';
        vsLabel.textContent = 'v';

        // Opponent min number
        const oppMin = typeof FilterService !== 'undefined' ? FilterService.getOpponentMinimum() : 1;
        _oppNumBtn = _createButton('mobile-bb-opp-min', String(oppMin), 'Opponent minimum', (e) => {
            _showFilterPicker('opponent', _oppNumBtn, e);
        });
        _oppNumBtn.classList.add('mobile-bb-filter-num');
        if (!hasTeam) _oppNumBtn.disabled = true;

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

        // Template button (between left drawer and week nav)
        _templateBtn = _createButton('mobile-bb-template', '📋', 'Templates', (e) => {
            _showTemplatePopup(_templateBtn, e);
        });
        _templateBtn.classList.add('mobile-bb-template-btn');

        // Assemble: [☰] [📋] [◀W6▶] [tab icons] [Compare 1v1] [☰]
        _container.appendChild(leftBtn);
        _container.appendChild(_templateBtn);
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

    /**
     * Show a small popup with options 1-4 above the clicked filter button.
     */
    function _showFilterPicker(which, anchorBtn, e) {
        e.stopPropagation();
        // Dismiss any existing picker first
        _dismissFilterPicker();

        if (typeof FilterService === 'undefined') return;

        const current = which === 'yourTeam'
            ? FilterService.getYourTeamMinimum()
            : FilterService.getOpponentMinimum();

        const picker = document.createElement('div');
        picker.className = 'mobile-filter-picker';
        picker.id = 'mobile-filter-picker';

        for (let i = 1; i <= 4; i++) {
            const opt = document.createElement('button');
            opt.className = 'mobile-filter-picker-opt';
            if (i === current) opt.classList.add('active');
            opt.textContent = String(i);
            opt.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (which === 'yourTeam') {
                    FilterService.setYourTeamMinimum(i);
                } else {
                    FilterService.setOpponentMinimum(i);
                }
                _dismissFilterPicker();
            });
            picker.appendChild(opt);
        }

        // Position above the anchor button
        const rect = anchorBtn.getBoundingClientRect();
        picker.style.left = `${rect.left + rect.width / 2}px`;
        picker.style.top = `${rect.top}px`;

        document.body.appendChild(picker);

        // Dismiss on next click anywhere
        requestAnimationFrame(() => {
            document.addEventListener('click', _dismissFilterPicker, { once: true });
        });
    }

    function _dismissFilterPicker() {
        const existing = document.getElementById('mobile-filter-picker');
        if (existing) existing.remove();
    }

    function _syncFilterState() {
        if (typeof FilterService === 'undefined') return;
        if (_yourNumBtn) _yourNumBtn.textContent = String(FilterService.getYourTeamMinimum());
        if (_oppNumBtn) _oppNumBtn.textContent = String(FilterService.getOpponentMinimum());
    }

    /**
     * Re-evaluate disabled state of compare/filter buttons when user team changes.
     * At initial render, these are disabled because no team is selected yet.
     */
    function _syncDisabledState() {
        const hasTeam = _getUserTeamId() !== null;
        if (_yourNumBtn) _yourNumBtn.disabled = !hasTeam;
        if (_oppNumBtn) _oppNumBtn.disabled = !hasTeam;
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

        // Sync filter number display
        window.addEventListener('filter-changed', _syncFilterState);

        // Re-enable buttons when user's team becomes available
        window.addEventListener('user-team-changed', _syncDisabledState);
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

    // ========================================
    // Template Popup
    // ========================================

    function _showTemplatePopup(anchorBtn, e) {
        e.stopPropagation();

        // Toggle: if already open, just close it
        const existing = document.getElementById('mobile-template-popup');
        if (existing) {
            _dismissTemplatePopup();
            return;
        }

        const templates = typeof TemplateService !== 'undefined' ? TemplateService.getTemplates() : [];
        const canSaveMore = typeof TemplateService !== 'undefined' ? TemplateService.canSaveMore() : false;

        const popup = document.createElement('div');
        popup.className = 'mobile-template-popup';
        popup.id = 'mobile-template-popup';

        // Template list
        if (templates.length > 0) {
            templates.forEach(t => {
                const row = document.createElement('div');
                row.className = 'mobile-template-row';

                const name = document.createElement('span');
                name.className = 'mobile-template-name';
                name.textContent = t.name;

                const w1Btn = document.createElement('button');
                w1Btn.className = 'mobile-template-week-btn';
                w1Btn.textContent = 'W1';
                w1Btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    _loadTemplate(t.id, 0);
                    _dismissTemplatePopup();
                });

                const w2Btn = document.createElement('button');
                w2Btn.className = 'mobile-template-week-btn';
                w2Btn.textContent = 'W2';
                w2Btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    _loadTemplate(t.id, 1);
                    _dismissTemplatePopup();
                });

                const delBtn = document.createElement('button');
                delBtn.className = 'mobile-template-del-btn';
                delBtn.textContent = '✕';
                delBtn.title = 'Delete';
                delBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    _deleteTemplate(t.id, t.name);
                });

                row.appendChild(name);
                row.appendChild(w1Btn);
                row.appendChild(w2Btn);
                row.appendChild(delBtn);
                popup.appendChild(row);
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'mobile-template-empty';
            empty.textContent = 'No templates saved';
            popup.appendChild(empty);
        }

        // Save button
        if (canSaveMore) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'mobile-template-save-btn';
            saveBtn.textContent = '+ Save Template';
            saveBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                _dismissTemplatePopup();
                // Delegate to GridActionButtons save
                if (typeof GridActionButtons !== 'undefined') {
                    GridActionButtons.saveTemplate();
                }
            });
            popup.appendChild(saveBtn);
        }

        // Position above the anchor button
        const rect = anchorBtn.getBoundingClientRect();
        popup.style.left = `${rect.left + rect.width / 2}px`;
        popup.style.top = `${rect.top}px`;

        document.body.appendChild(popup);

        requestAnimationFrame(() => {
            document.addEventListener('click', _dismissTemplatePopup, { once: true });
        });
    }

    function _dismissTemplatePopup() {
        const existing = document.getElementById('mobile-template-popup');
        if (existing) existing.remove();
    }

    function _loadTemplate(templateId, weekIndex) {
        if (typeof TemplateService === 'undefined') return;
        const template = TemplateService.getTemplate(templateId);
        if (!template) {
            if (typeof ToastService !== 'undefined') ToastService.showError('Template not found');
            return;
        }
        window.dispatchEvent(new CustomEvent('load-template', {
            detail: { slots: template.slots, weekIndex }
        }));
        if (typeof ToastService !== 'undefined') {
            ToastService.showSuccess(`Loaded "${template.name}" to Week ${weekIndex + 1}`);
        }
    }

    async function _deleteTemplate(templateId, name) {
        if (typeof TemplateService === 'undefined') return;
        if (confirm(`Delete template "${name}"?`)) {
            const result = await TemplateService.deleteTemplate(templateId);
            if (result.success) {
                if (typeof ToastService !== 'undefined') ToastService.showSuccess('Template deleted');
                // Popup will be rebuilt next time it opens
            } else {
                if (typeof ToastService !== 'undefined') ToastService.showError(result.error || 'Failed to delete');
            }
        }
    }

    function cleanup() {
        _dismissFilterPicker();
        _dismissTemplatePopup();
        if (_unsubWeekChange) _unsubWeekChange();
        window.removeEventListener('filter-changed', _syncFilterState);
        window.removeEventListener('user-team-changed', _syncDisabledState);
        if (_container) _container.innerHTML = '';
        _weekLabel = null;
        _yourNumBtn = null;
        _oppNumBtn = null;
        _templateBtn = null;
        _initialized = false;
    }

    return {
        init,
        cleanup
    };
})();
