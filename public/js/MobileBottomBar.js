const MobileBottomBar = (function() {
    'use strict';

    let _container = null;
    let _weekLabel = null;
    let _yourNumBtn = null;
    let _oppNumBtn = null;
    let _templateBtn = null;
    let _authBtn = null;
    let _authUnsubscribe = null;
    let _unsubWeekChange = null;
    let _initialized = false;

    // SVG icon templates (lucide-style, 24x24 viewBox)
    const TAB_ICONS = {
        teams:      '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        players:    '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        tournament: '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
        matches:    '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 2.5 21 6l-3 3"/><path d="M21 6H3"/><path d="M6.5 21.5 3 18l3-3"/><path d="M3 18h18"/></svg>'
    };

    // Content tabs
    const TABS = [
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

        // Set initial panel visibility — mobile only
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

        // Auth button (login / avatar) — between left drawer and template
        _authBtn = document.createElement('button');
        _authBtn.id = 'mobile-bb-auth';
        _authBtn.className = 'mobile-bb-btn mobile-bb-auth-btn';
        _authBtn.setAttribute('aria-label', 'Login');
        _authBtn.addEventListener('click', _handleAuthBtnClick);
        _updateAuthButton(AuthService.getCurrentUser());

        // Template button (between auth button and week nav)
        _templateBtn = _createButton('mobile-bb-template', '📋', 'Templates', (e) => {
            _showTemplatePopup(_templateBtn, e);
        });
        _templateBtn.classList.add('mobile-bb-template-btn');

        // Assemble: [☰] [👤/LOGIN] [📋] [◀W6▶] [tab icons] [Compare 1v1] [☰]
        _container.appendChild(leftBtn);
        _container.appendChild(_authBtn);
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

        // Track auth state for login/avatar button
        if (typeof AuthService !== 'undefined') {
            _authUnsubscribe = AuthService.onAuthStateChange(_updateAuthButton);
        }

        // Update avatar after profile setup completes (user may now have photo)
        window.addEventListener('profile-setup-complete', () => {
            _updateAuthButton(AuthService.getCurrentUser());
        });
        window.addEventListener('profile-updated', () => {
            _updateAuthButton(AuthService.getCurrentUser());
        });
    }

    function _setActiveTab(tabId) {
        if (!_container) return;
        _container.querySelectorAll('.mobile-bb-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
    }

    /**
     * On mobile: show panel-bottom-center for all tabs
     */
    function _togglePanels(tabId) {
        const topCenter = document.getElementById('panel-top-center');
        const bottomCenter = document.getElementById('panel-bottom-center');
        if (!topCenter || !bottomCenter) return;

        topCenter.style.display = 'none';
        bottomCenter.style.display = '';
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

        const template = typeof TemplateService !== 'undefined' ? TemplateService.getTemplate() : null;

        const popup = document.createElement('div');
        popup.className = 'mobile-template-popup';
        popup.id = 'mobile-template-popup';

        if (template) {
            const slotCount = template.slots ? template.slots.length : 0;

            // Status row
            const statusRow = document.createElement('div');
            statusRow.className = 'mobile-template-row';
            const statusText = document.createElement('span');
            statusText.className = 'mobile-template-name';
            statusText.textContent = `${slotCount} slot${slotCount !== 1 ? 's' : ''} saved`;
            statusRow.appendChild(statusText);
            popup.appendChild(statusRow);

            // Load buttons row
            const loadRow = document.createElement('div');
            loadRow.className = 'mobile-template-row';

            const w1Btn = document.createElement('button');
            w1Btn.className = 'mobile-template-week-btn';
            w1Btn.textContent = 'W1';
            w1Btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                _loadTemplate(0);
                _dismissTemplatePopup();
            });

            const w2Btn = document.createElement('button');
            w2Btn.className = 'mobile-template-week-btn';
            w2Btn.textContent = 'W2';
            w2Btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                _loadTemplate(1);
                _dismissTemplatePopup();
            });

            const clearBtn = document.createElement('button');
            clearBtn.className = 'mobile-template-del-btn';
            clearBtn.textContent = '✕';
            clearBtn.title = 'Clear template';
            clearBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                _clearTemplate();
            });

            loadRow.appendChild(w1Btn);
            loadRow.appendChild(w2Btn);
            loadRow.appendChild(clearBtn);
            popup.appendChild(loadRow);

            // Update (save) button
            const updateBtn = document.createElement('button');
            updateBtn.className = 'mobile-template-save-btn';
            updateBtn.textContent = '↑ Update Template';
            updateBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                _dismissTemplatePopup();
                if (typeof GridActionButtons !== 'undefined') {
                    GridActionButtons.saveTemplate();
                }
            });
            popup.appendChild(updateBtn);

            // Repeat Last Week button
            popup.appendChild(_createRepeatBtn());
        } else {
            const empty = document.createElement('div');
            empty.className = 'mobile-template-empty';
            empty.textContent = 'No template saved';
            popup.appendChild(empty);

            const saveBtn = document.createElement('button');
            saveBtn.className = 'mobile-template-save-btn';
            saveBtn.textContent = '+ Save Template';
            saveBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                _dismissTemplatePopup();
                if (typeof GridActionButtons !== 'undefined') {
                    GridActionButtons.saveTemplate();
                }
            });
            popup.appendChild(saveBtn);

            // Repeat Last Week button
            popup.appendChild(_createRepeatBtn());
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

    function _getRepeatWeekIds() {
        const weekNum = WeekNavigation.getCurrentWeekNumber();
        const nextWeekNum = WeekNavigation.getSecondWeekNumber();
        const year1 = DateUtils.getISOWeekYear(DateUtils.getMondayOfWeek(weekNum));
        const year2 = DateUtils.getISOWeekYear(DateUtils.getMondayOfWeek(nextWeekNum));
        return {
            sourceWeekId: `${year1}-${String(weekNum).padStart(2, '0')}`,
            targetWeekId: `${year2}-${String(nextWeekNum).padStart(2, '0')}`
        };
    }

    function _hasCurrentWeekAvailability() {
        const teamId = _getUserTeamId();
        if (!teamId) return false;

        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId) return false;

        const { sourceWeekId } = _getRepeatWeekIds();
        const data = (typeof AvailabilityService !== 'undefined')
            ? AvailabilityService.getCachedData(teamId, sourceWeekId)
            : null;
        if (!data?.slots) return false;

        return Object.values(data.slots).some(users =>
            Array.isArray(users) && users.includes(userId)
        );
    }

    function _createRepeatBtn() {
        const hasAvailability = _hasCurrentWeekAvailability();
        const btn = document.createElement('button');
        btn.className = 'mobile-template-save-btn';
        btn.textContent = '↻ Repeat W1 → W2';
        btn.disabled = !hasAvailability;
        if (!hasAvailability) {
            btn.title = 'No availability this week to copy';
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
        btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (btn.disabled) return;

            btn.disabled = true;
            btn.textContent = 'Copying...';

            const teamId = _getUserTeamId();
            if (!teamId) {
                if (typeof ToastService !== 'undefined') ToastService.showError('No team selected');
                return;
            }

            try {
                const { sourceWeekId, targetWeekId } = _getRepeatWeekIds();
                const result = await AvailabilityService.repeatLastWeek(teamId, sourceWeekId, targetWeekId);

                if (result.success) {
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showSuccess(`Copied ${result.slotsCopied} slot${result.slotsCopied !== 1 ? 's' : ''} to Week 2`);
                    }
                    _dismissTemplatePopup();
                } else {
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showError(result.error || 'Failed to copy');
                    }
                    btn.disabled = false;
                    btn.textContent = '↻ Repeat W1 → W2';
                }
            } catch (error) {
                console.error('Failed to repeat last week:', error);
                if (typeof ToastService !== 'undefined') ToastService.showError('Failed to copy');
                btn.disabled = false;
                btn.textContent = '↻ Repeat W1 → W2';
            }
        });
        return btn;
    }

    function _loadTemplate(weekIndex) {
        if (typeof TemplateService === 'undefined') return;
        const template = TemplateService.getTemplate();
        if (!template) {
            if (typeof ToastService !== 'undefined') ToastService.showError('Template not found');
            return;
        }
        window.dispatchEvent(new CustomEvent('load-template', {
            detail: { slots: template.slots, weekIndex }
        }));
        if (typeof ToastService !== 'undefined') {
            ToastService.showSuccess(`Template loaded to Week ${weekIndex + 1}`);
        }
    }

    async function _clearTemplate() {
        if (typeof TemplateService === 'undefined') return;
        if (confirm('Clear your saved template?')) {
            const result = await TemplateService.clearTemplate();
            if (result.success) {
                if (typeof ToastService !== 'undefined') ToastService.showSuccess('Template cleared');
                _dismissTemplatePopup();
            } else {
                if (typeof ToastService !== 'undefined') ToastService.showError(result.error || 'Failed to clear');
            }
        }
    }

    // ========================================
    // Auth Button (Login / Avatar)
    // ========================================

    function _updateAuthButton(user) {
        if (!_authBtn) return;

        if (user) {
            // Logged in — show avatar
            const avatarUrl = (typeof UserProfile !== 'undefined' && UserProfile.getAvatarUrl())
                || user.photoURL
                || null;

            if (avatarUrl) {
                _authBtn.innerHTML = `<img src="${avatarUrl}" alt="Profile" class="mobile-bb-avatar">`;
            } else {
                // Fallback: generic user icon
                _authBtn.innerHTML = '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
            }
            _authBtn.setAttribute('aria-label', 'Profile');
        } else {
            // Guest — show LOGIN text
            _authBtn.innerHTML = '<span class="mobile-bb-login-label">LOGIN</span>';
            _authBtn.setAttribute('aria-label', 'Sign in');
        }
    }

    function _handleAuthBtnClick(e) {
        e.stopPropagation();
        _dismissLoginPopup();

        const user = typeof AuthService !== 'undefined' ? AuthService.getCurrentUser() : null;

        if (user) {
            // Logged in — open profile modal
            if (typeof UserProfile !== 'undefined') {
                UserProfile.openProfileModal();
            }
        } else {
            // Guest — show login popup
            _showLoginPopup(e);
        }
    }

    function _showLoginPopup(e) {
        const existing = document.getElementById('mobile-login-popup');
        if (existing) {
            _dismissLoginPopup();
            return;
        }

        const popup = document.createElement('div');
        popup.className = 'mobile-login-popup';
        popup.id = 'mobile-login-popup';

        // Discord button (primary)
        const discordBtn = document.createElement('button');
        discordBtn.className = 'mobile-login-popup-btn mobile-login-discord';
        discordBtn.innerHTML = `
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Discord
        `;
        discordBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            discordBtn.disabled = true;
            discordBtn.textContent = 'Signing in...';
            try {
                await AuthService.signInWithDiscord();
                _dismissLoginPopup();
            } catch (err) {
                console.error('Discord sign-in failed:', err);
                discordBtn.disabled = false;
                discordBtn.innerHTML = 'Retry Discord';
            }
        });

        // Google button (secondary)
        const googleBtn = document.createElement('button');
        googleBtn.className = 'mobile-login-popup-btn mobile-login-google';
        googleBtn.innerHTML = `
            <svg class="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
        `;
        googleBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            googleBtn.disabled = true;
            googleBtn.textContent = 'Signing in...';
            try {
                await AuthService.signInWithGoogle();
                _dismissLoginPopup();
            } catch (err) {
                console.error('Google sign-in failed:', err);
                googleBtn.disabled = false;
                googleBtn.innerHTML = 'Retry Google';
            }
        });

        popup.appendChild(discordBtn);
        popup.appendChild(googleBtn);

        // Position above the auth button
        const rect = _authBtn.getBoundingClientRect();
        popup.style.left = `${rect.left + rect.width / 2}px`;
        popup.style.top = `${rect.top}px`;

        document.body.appendChild(popup);

        requestAnimationFrame(() => {
            document.addEventListener('click', _dismissLoginPopup, { once: true });
        });
    }

    function _dismissLoginPopup() {
        const existing = document.getElementById('mobile-login-popup');
        if (existing) existing.remove();
    }

    function cleanup() {
        _dismissFilterPicker();
        _dismissTemplatePopup();
        _dismissLoginPopup();
        if (_unsubWeekChange) _unsubWeekChange();
        if (_authUnsubscribe) _authUnsubscribe();
        window.removeEventListener('filter-changed', _syncFilterState);
        window.removeEventListener('user-team-changed', _syncDisabledState);
        if (_container) _container.innerHTML = '';
        _weekLabel = null;
        _yourNumBtn = null;
        _oppNumBtn = null;
        _templateBtn = null;
        _authBtn = null;
        _authUnsubscribe = null;
        _initialized = false;
    }

    return {
        init,
        cleanup
    };
})();
