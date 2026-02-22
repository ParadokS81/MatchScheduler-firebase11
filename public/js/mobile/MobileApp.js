// MobileApp.js - Top-level mobile orchestrator
// Slice M1.0: Detects mobile, renders layout, manages tab state

const MobileApp = (function() {
    'use strict';

    let _currentTab = 'home';
    let _selectedTeam = null;
    let _weekUnsubscribe = null;
    let _dataUnsubscribers = [];
    let _headerListenersAttached = false;
    let _eventCleanups = [];

    async function init() {
        // Verify mobile container exists (CSS handles show/hide via media query)
        const mobileRoot = document.getElementById('mobile-app');
        if (!mobileRoot) return;

        // Init services (same as desktop — they're shared)
        if (typeof TimezoneService !== 'undefined') {
            TimezoneService.init();
        }
        WeekNavigation.init();

        // Wait for auth to be ready
        const user = await AuthService.waitForAuthReady();

        // Load user's team
        if (user) {
            await _loadUserTeam(user.uid);
        }

        // Init mobile components
        _initHeader();
        await MobileCalendarGrid.init('mobile-calendar');
        MobileHomeContent.init('mobile-context');
        MobileBottomNav.init('mobile-nav');

        // Set up data listeners (proposals + matches)
        if (user) {
            await _setupDataListeners(user.uid);
        }

        // Set up UI listeners
        _setupListeners();

        console.log('📱 MobileApp initialized');
    }

    async function _loadUserTeam(userId) {
        try {
            const userTeams = await TeamService.getUserTeams(userId);
            if (userTeams.length > 0) {
                _selectedTeam = userTeams[0];
            }
        } catch (error) {
            console.error('Failed to load user teams:', error);
        }
    }

    function _initHeader() {
        const teamNameEl = document.getElementById('mobile-team-name');

        // Show team name
        if (_selectedTeam) {
            teamNameEl.textContent = (_selectedTeam.teamName || _selectedTeam.name || 'Select team') + ' \u25BE';
        } else {
            teamNameEl.textContent = 'Join a team';
        }

        // Show week label
        _updateWeekLabel();

        // Attach click handlers only once
        if (!_headerListenersAttached) {
            _headerListenersAttached = true;
            teamNameEl.addEventListener('click', _showTeamSwitcher);
            document.getElementById('mobile-week-prev').addEventListener('click', () => {
                WeekNavigation.navigatePrev();
            });
            document.getElementById('mobile-week-next').addEventListener('click', () => {
                WeekNavigation.navigateNext();
            });
            document.getElementById('mobile-grid-tools-btn')?.addEventListener('click', () => {
                if (typeof MobileGridTools !== 'undefined') {
                    MobileGridTools.open();
                }
            });
        }
    }

    function _updateWeekLabel() {
        const weekLabel = document.getElementById('mobile-week-label');
        const weekNum = WeekNavigation.getCurrentWeekNumber();
        const monday = DateUtils.getMondayOfWeek(weekNum);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const startDay = monday.getUTCDate();
        const endDay = sunday.getUTCDate();
        const month = monthNames[monday.getUTCMonth()];

        weekLabel.textContent = `W${weekNum} \u00B7 ${month} ${startDay}-${endDay}`;
    }

    async function _showTeamSwitcher() {
        const user = AuthService.getCurrentUser();
        if (!user) {
            // Not logged in — open sign-in via OnboardingModal path
            // (OnboardingModal requires auth, so let AuthService handle it)
            return;
        }

        const dropdown = document.getElementById('mobile-team-dropdown');

        // Toggle visibility
        if (!dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
            return;
        }

        // Load user teams
        let userTeams;
        try {
            userTeams = await TeamService.getUserTeams(user.uid);
        } catch (e) {
            return;
        }

        // 0 teams: open OnboardingModal directly (no dropdown needed)
        if (userTeams.length === 0) {
            _openJoinCreateModal(user);
            return;
        }

        dropdown.innerHTML = '';

        // Show existing teams
        userTeams.forEach(team => {
            const option = document.createElement('button');
            option.textContent = team.teamName || team.name;
            option.className = 'mobile-team-option';
            if (_selectedTeam && team.id === _selectedTeam.id) {
                option.classList.add('active');
            }
            option.addEventListener('click', () => {
                _selectedTeam = team;
                dropdown.classList.add('hidden');
                _initHeader();
                MobileCalendarGrid.reload();
                MobileHomeContent.refresh();
            });
            dropdown.appendChild(option);
        });

        // "Join Another Team" option (only if under 2-team limit)
        if (userTeams.length < 2) {
            const joinOption = document.createElement('button');
            joinOption.textContent = '+ Join Another Team';
            joinOption.className = 'mobile-team-option';
            joinOption.style.cssText = 'color: var(--primary); font-weight: 500; border-top: 1px solid var(--border);';
            joinOption.addEventListener('click', () => {
                dropdown.classList.add('hidden');
                _openJoinCreateModal(user);
            });
            dropdown.appendChild(joinOption);
        }

        dropdown.classList.remove('hidden');
    }

    /** Open the join/create team modal, with profile setup if needed */
    async function _openJoinCreateModal(user) {
        if (typeof OnboardingModal === 'undefined') return;

        // Fetch user profile from Firestore
        let profile = null;
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', user.uid));
            if (userDoc.exists()) profile = userDoc.data();
        } catch (e) {
            console.error('MobileApp: Failed to fetch user profile:', e);
        }

        // Check if user has a display name (profile setup required first)
        if (!profile?.displayName && typeof ProfileModal !== 'undefined') {
            ProfileModal.show(user, profile);
            // OnboardingModal will open after profile-setup-complete event (handled by TeamInfo)
            return;
        }

        OnboardingModal.show(user, profile);
    }

    /**
     * Set up Firestore listeners for proposals and scheduled matches.
     * On desktop, MatchesPanel handles this. On mobile, we do it here.
     */
    async function _setupDataListeners(userId) {
        _cleanupDataListeners();

        const { collection, query, where, onSnapshot } = await import(
            'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
        );

        // Get all team IDs for the user
        let teamIds = [];
        try {
            const userTeams = await TeamService.getUserTeams(userId);
            teamIds = userTeams.map(t => t.id);
        } catch (e) {
            console.error('MobileApp: Failed to get user teams for listeners:', e);
            return;
        }

        if (teamIds.length === 0) return;

        // Proposal listeners — one per team, two queries each (proposer + opponent)
        for (const teamId of teamIds) {
            const proposerQuery = query(
                collection(window.firebase.db, 'matchProposals'),
                where('proposerTeamId', '==', teamId)
            );
            _dataUnsubscribers.push(onSnapshot(proposerQuery, (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'removed') {
                        ProposalService.removeFromCache(change.doc.id);
                    } else {
                        ProposalService.updateCache(change.doc.id, change.doc.data());
                    }
                });
                MobileHomeContent.refresh();
            }));

            const opponentQuery = query(
                collection(window.firebase.db, 'matchProposals'),
                where('opponentTeamId', '==', teamId)
            );
            _dataUnsubscribers.push(onSnapshot(opponentQuery, (snapshot) => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'removed') {
                        ProposalService.removeFromCache(change.doc.id);
                    } else {
                        ProposalService.updateCache(change.doc.id, change.doc.data());
                    }
                });
                MobileHomeContent.refresh();
            }));
        }

        // Scheduled matches listener — all upcoming
        const matchesQuery = query(
            collection(window.firebase.db, 'scheduledMatches'),
            where('status', '==', 'upcoming')
        );
        _dataUnsubscribers.push(onSnapshot(matchesQuery, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') {
                    ScheduledMatchService.removeFromCache(change.doc.id);
                } else {
                    ScheduledMatchService.updateCache(change.doc.id, change.doc.data());
                }
            });
            MobileHomeContent.refresh();
            // Refresh grid cells in case match indicators changed
            MobileCalendarGrid.refreshCells();
        }));
    }

    function _cleanupDataListeners() {
        _dataUnsubscribers.forEach(unsub => unsub());
        _dataUnsubscribers = [];
    }

    function _setupListeners() {
        // Week change → refresh grid + content
        _weekUnsubscribe = WeekNavigation.onWeekChange((anchorWeek, secondWeek) => {
            _updateWeekLabel();
            MobileCalendarGrid.loadWeek(anchorWeek);
            if (_currentTab === 'home') {
                MobileHomeContent.refresh();
            }
            // In compare mode, highlights re-apply via _updateGrid → updateComparisonHighlights
        });

        // Grid selection → switch context panel state (Home tab only)
        const onSelection = (e) => {
            if (_currentTab !== 'home') return;
            const { selectedCells } = e.detail;
            if (selectedCells.length > 0) {
                MobileHomeContent.showSelectionActions(selectedCells, e.detail.weekId);
            } else {
                MobileHomeContent.showDefault();
            }
        };
        document.addEventListener('mobile-selection-changed', onSelection);
        _eventCleanups.push(() => document.removeEventListener('mobile-selection-changed', onSelection));

        // Match cell tapped → show match detail
        const onMatchTap = (e) => {
            MobileHomeContent.showMatchDetail(e.detail.match);
        };
        document.addEventListener('mobile-match-tapped', onMatchTap);
        _eventCleanups.push(() => document.removeEventListener('mobile-match-tapped', onMatchTap));

        // Comparison: highlighted cell tapped → open detail drawer
        const onCompareTap = (e) => {
            if (typeof MobileCompareDetail !== 'undefined') {
                MobileCompareDetail.open(e.detail.weekId, e.detail.slotId);
            }
        };
        document.addEventListener('mobile-compare-slot-tapped', onCompareTap);
        _eventCleanups.push(() => document.removeEventListener('mobile-compare-slot-tapped', onCompareTap));

        // Comparison: engine recalculated → update grid highlights
        const onComparisonUpdated = () => {
            if (_currentTab === 'compare') {
                MobileCalendarGrid.updateComparisonHighlights();
            }
        };
        window.addEventListener('comparison-updated', onComparisonUpdated);
        _eventCleanups.push(() => window.removeEventListener('comparison-updated', onComparisonUpdated));

        const onComparisonStarted = () => {
            if (_currentTab === 'compare') {
                MobileCalendarGrid.updateComparisonHighlights();
            }
        };
        window.addEventListener('comparison-started', onComparisonStarted);
        _eventCleanups.push(() => window.removeEventListener('comparison-started', onComparisonStarted));

        const onComparisonEnded = () => {
            MobileCalendarGrid.clearComparisonHighlights();
        };
        window.addEventListener('comparison-ended', onComparisonEnded);
        _eventCleanups.push(() => window.removeEventListener('comparison-ended', onComparisonEnded));

        // Auth state changes
        const onAuthChange = async (e) => {
            const user = e.detail?.user;
            if (user) {
                await _loadUserTeam(user.uid);
                _initHeader();
                await _setupDataListeners(user.uid);
                MobileCalendarGrid.reload();
                MobileHomeContent.refresh();
            } else {
                _cleanupDataListeners();
                _selectedTeam = null;
                _initHeader();
                MobileCalendarGrid.reload();
                MobileHomeContent.refresh();
            }
        };
        window.addEventListener('auth-state-changed', onAuthChange);
        _eventCleanups.push(() => window.removeEventListener('auth-state-changed', onAuthChange));

        // Profile setup complete → open OnboardingModal (2-step flow: ProfileModal first, then join/create)
        const onProfileSetup = async (e) => {
            const user = e.detail?.user || AuthService.getCurrentUser();
            if (!user) return;
            _openJoinCreateModal(user);
        };
        window.addEventListener('profile-setup-complete', onProfileSetup);
        _eventCleanups.push(() => window.removeEventListener('profile-setup-complete', onProfileSetup));

        // Team joined/created/left → reload team + refresh everything
        const onTeamChange = async () => {
            const user = AuthService.getCurrentUser();
            if (!user) return;
            await _loadUserTeam(user.uid);
            _initHeader();
            await _setupDataListeners(user.uid);
            MobileCalendarGrid.reload();
            MobileHomeContent.refresh();
        };
        window.addEventListener('team-joined', onTeamChange);
        window.addEventListener('team-created', onTeamChange);
        window.addEventListener('team-left', onTeamChange);
        _eventCleanups.push(() => {
            window.removeEventListener('team-joined', onTeamChange);
            window.removeEventListener('team-created', onTeamChange);
            window.removeEventListener('team-left', onTeamChange);
        });

        // Close dropdown when tapping outside
        const onDocClick = (e) => {
            const dropdown = document.getElementById('mobile-team-dropdown');
            const teamName = document.getElementById('mobile-team-name');
            if (dropdown && !dropdown.contains(e.target) && e.target !== teamName) {
                dropdown.classList.add('hidden');
            }
        };
        document.addEventListener('click', onDocClick);
        _eventCleanups.push(() => document.removeEventListener('click', onDocClick));
    }

    function getSelectedTeam() {
        return _selectedTeam;
    }

    function getSelectedTeamId() {
        return _selectedTeam?.id || null;
    }

    let _switchingTab = false; // prevent re-entrant switching from sheet onClose callbacks

    function switchTab(tabId) {
        if (tabId === _currentTab || _switchingTab) return;

        _switchingTab = true;
        const prevTab = _currentTab;
        _currentTab = tabId;

        const contextEl = document.getElementById('mobile-context');
        if (!contextEl) { _switchingTab = false; return; }

        // Clean up previous tab state
        if (prevTab === 'compare') {
            MobileCalendarGrid.exitComparisonMode();
            if (typeof ComparisonEngine !== 'undefined') ComparisonEngine.endComparison();
            TeamBrowserState.clearSelection();
            if (typeof MobileCompareContent !== 'undefined') MobileCompareContent.cleanup();
        }

        // Close any open bottom sheets when switching tabs
        // (this may fire onClose callbacks that try to switchTab — blocked by _switchingTab flag)
        MobileBottomSheet.close();

        if (tabId === 'home') {
            contextEl.innerHTML = '';
            MobileHomeContent.init('mobile-context');
        } else if (tabId === 'compare') {
            MobileCalendarGrid.clearSelection();
            MobileCalendarGrid.enterComparisonMode();
            contextEl.innerHTML = '';
            MobileCompareContent.init('mobile-context');
        } else if (tabId === 'team') {
            if (typeof MobileTeamTab !== 'undefined') {
                MobileTeamTab.open();
            }
        } else if (tabId === 'profile') {
            if (typeof MobileProfileTab !== 'undefined') {
                MobileProfileTab.open();
            }
        }

        _switchingTab = false;
    }

    function cleanup() {
        if (_weekUnsubscribe) _weekUnsubscribe();
        _cleanupDataListeners();
        _eventCleanups.forEach(fn => fn());
        _eventCleanups = [];
        MobileCalendarGrid.cleanup();
        if (typeof MobileCompareContent !== 'undefined') MobileCompareContent.cleanup();
    }

    return { init, getSelectedTeam, getSelectedTeamId, switchTab, cleanup, openJoinCreateModal: _openJoinCreateModal };
})();
