// MobileTeamTab.js - Team info view opened from bottom nav Team tab
// Two-column layout: roster left, color picker right (always reserves space).
// Tapping a name reveals the picker for that player — no layout shift.
// Gear icon opens team settings in Layer 2 bottom sheet.

const MobileTeamTab = (function() {
    'use strict';

    let _selectedUserId = null;
    let _settingsTeamData = null;
    let _settingsTagsLoading = false;

    // Tab state (leader-only tabbed settings)
    let _activeTab = 'settings';
    let _teamId = null;
    let _isLeader = false;
    let _botRegistration = undefined;   // undefined = not loaded, null = no doc
    let _botRegUnsubscribe = null;
    let _discordInitialized = false;
    let _recordingsInitialized = false;
    let _recordings = [];
    let _expandedSeries = new Set();
    let _opponentLogoCache = {};

    /** Escape HTML to prevent XSS */
    function _esc(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    async function open() {
        _selectedUserId = null;
        const team = MobileApp.getSelectedTeam();
        const user = AuthService.getCurrentUser();

        if (!user) {
            MobileBottomSheet.open(`
                <div style="padding: 2rem 0; text-align: center;">
                    <p style="color: var(--muted-foreground); margin-bottom: 1rem;">Sign in to view your team</p>
                </div>
            `, _onClose);
            return;
        }

        if (!team) {
            MobileBottomSheet.open(`
                <div style="padding: 2rem 0; text-align: center;">
                    <p style="color: var(--muted-foreground); margin-bottom: 1rem;">Join a team to get started</p>
                    <button id="mobile-join-create-btn" style="padding: 0.625rem 1.25rem; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 0.5rem; font-weight: 600; font-size: 0.9rem; cursor: pointer;">
                        Join or Create Team
                    </button>
                </div>
            `, _onClose);
            // Wire up the button
            const joinBtn = document.getElementById('mobile-join-create-btn');
            if (joinBtn) {
                joinBtn.addEventListener('click', () => {
                    MobileBottomSheet.close();
                    MobileApp.openJoinCreateModal(user);
                });
            }
            return;
        }

        // Check if user can join another team (max 2)
        let canJoinAnother = false;
        try {
            const userTeams = await TeamService.getUserTeams(user.uid);
            canJoinAnother = userTeams.length < 2;
        } catch (e) { /* ignore */ }

        MobileBottomSheet.open(_buildHtml(team, canJoinAnother), _onClose);
        _attachListeners(user, canJoinAnother);
    }

    function _buildHtml(team, canJoinAnother) {
        const logoHtml = team.activeLogo?.urls?.medium
            ? `<img src="${team.activeLogo.urls.medium}" alt="${team.teamName}" style="width: 3.5rem; height: 3.5rem; border-radius: 0.5rem; object-fit: cover;">`
            : `<div style="width: 3.5rem; height: 3.5rem; border-radius: 0.5rem; background: var(--muted); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--muted-foreground);">${team.teamTag || '?'}</div>`;

        const roster = (team.playerRoster || [])
            .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

        let rosterHtml = '';
        roster.forEach(p => {
            const color = typeof PlayerColorService !== 'undefined'
                ? PlayerColorService.getPlayerColorOrDefault(p.userId)
                : 'var(--muted-foreground)';
            const leader = p.role === 'leader' ? ' <span style="color: var(--primary);">&#9733;</span>' : '';
            rosterHtml += `
                <div class="mobile-roster-row" data-uid="${p.userId}"
                     style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; cursor: pointer;">
                    <span class="mobile-roster-initial" style="font-family: monospace; font-weight: 700; font-size: 0.8rem; width: 2rem; flex-shrink: 0; text-align: center; color: ${color};">${(p.initials || '?').charAt(0)}</span>
                    <span style="font-size: 0.85rem; color: var(--foreground);">${p.displayName || '?'}${leader}</span>
                </div>
            `;
        });

        const joinAnotherHtml = canJoinAnother ? `
                <div style="border-top: 1px solid var(--border); padding-top: 0.75rem;">
                    <button id="mobile-join-another-btn" style="width: 100%; padding: 0.5rem; font-size: 0.85rem; font-weight: 500; color: var(--primary); background: none; border: 1px solid var(--border); border-radius: 0.375rem; cursor: pointer;">
                        + Join Another Team
                    </button>
                </div>
        ` : '';

        return `
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);">
                    ${logoHtml}
                    <span style="font-size: 1.1rem; font-weight: 600; color: var(--primary); flex: 1; text-align: center;">${team.teamName}</span>
                    <span style="font-size: 0.85rem; color: var(--muted-foreground); font-family: monospace;">${team.teamTag || ''}</span>
                    <button id="mobile-team-settings-btn" style="padding: 0.25rem; color: var(--muted-foreground); background: none; border: none; cursor: pointer; flex-shrink: 0;" title="Team Settings">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <!-- Left: roster -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 0.25rem; padding-left: 0.75rem;">Roster (${roster.length})</div>
                        <div id="mobile-roster-list" style="padding: 0 0.75rem;">${rosterHtml}</div>
                    </div>
                    <!-- Right: picker (always reserves space, width matches 2-col swatch grid) -->
                    <div id="mobile-picker-column" style="width: 4.5rem; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; min-height: 8rem;">
                    </div>
                </div>
                ${joinAnotherHtml}
            </div>
        `;
    }

    function _attachListeners(user, canJoinAnother) {
        const list = document.getElementById('mobile-roster-list');
        if (!list) return;

        // "Join Another Team" button
        if (canJoinAnother) {
            const joinBtn = document.getElementById('mobile-join-another-btn');
            if (joinBtn) {
                joinBtn.addEventListener('click', () => {
                    MobileBottomSheet.close();
                    MobileApp.openJoinCreateModal(user);
                });
            }
        }

        list.addEventListener('click', (e) => {
            const row = e.target.closest('.mobile-roster-row');
            if (!row) return;

            const uid = row.dataset.uid;
            if (_selectedUserId === uid) {
                _selectedUserId = null;
                _clearRowHighlight(list);
                _hidePicker();
            } else {
                _selectedUserId = uid;
                _clearRowHighlight(list);
                row.style.background = 'var(--muted)';
                row.style.borderRadius = '0.25rem';
                _showPicker(uid);
            }
        });

        // Stop clicks inside picker from bubbling to roster
        const pickerCol = document.getElementById('mobile-picker-column');
        if (pickerCol) {
            pickerCol.addEventListener('click', (e) => e.stopPropagation());
        }

        // Gear icon → open settings in Layer 2
        const settingsBtn = document.getElementById('mobile-team-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                _openSettings();
            });
        }
    }

    function _clearRowHighlight(list) {
        list.querySelectorAll('.mobile-roster-row').forEach(r => {
            r.style.background = '';
            r.style.borderRadius = '';
        });
    }

    function _showPicker(userId) {
        const pickerCol = document.getElementById('mobile-picker-column');
        if (!pickerCol) return;

        const team = MobileApp.getSelectedTeam();
        const player = (team?.playerRoster || []).find(p => p.userId === userId);
        const currentColor = typeof PlayerColorService !== 'undefined'
            ? PlayerColorService.getPlayerColor(userId)
            : null;
        const currentInitials = player?.initials || player?.displayName?.substring(0, 3).toUpperCase() || '?';
        const presets = typeof PlayerColorService !== 'undefined'
            ? PlayerColorService.getPresetColors()
            : ['#E06666', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#C27BA0'];

        let swatchesHtml = '';
        presets.forEach(c => {
            const active = c === currentColor
                ? 'border-color: var(--primary); box-shadow: 0 0 0 2px rgba(99,102,241,0.3);'
                : 'border-color: transparent;';
            swatchesHtml += `<button class="mobile-color-swatch" data-color="${c}" style="width: 1.75rem; height: 1.75rem; border-radius: 50%; border: 2px solid; ${active} background: ${c}; cursor: pointer; padding: 0;"></button>`;
        });

        pickerCol.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.3rem; width: 100%;">
                <div style="display: grid; grid-template-columns: 1.75rem 1.75rem; gap: 0.3rem;">
                    ${swatchesHtml}
                </div>
                <div style="display: flex; align-items: center; gap: 0.2rem; margin-top: 0.1rem;">
                    <input type="text" class="mobile-hex-input" placeholder="#hex" value="${currentColor || ''}" maxlength="7"
                        style="width: 3rem; min-width: 0; padding: 0.15rem 0.2rem; font-size: 0.6rem; font-family: monospace; text-transform: uppercase; background: var(--input); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">
                    <button class="mobile-color-clear" style="font-size: 0.55rem; color: var(--muted-foreground); background: none; border: 1px solid var(--border); border-radius: 0.25rem; padding: 0.1rem 0.2rem; cursor: pointer;">Clr</button>
                </div>
                <div style="display: flex; align-items: center; gap: 0.2rem;">
                    <input type="text" class="mobile-initials-input" value="${currentInitials}" maxlength="3"
                        style="width: 2.5rem; padding: 0.15rem 0.2rem; font-size: 0.65rem; font-family: monospace; font-weight: 700; text-transform: uppercase; text-align: center; background: var(--input); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">
                    <button class="mobile-initials-save" style="display: none; font-size: 0.6rem; color: var(--primary); background: none; border: none; cursor: pointer; font-weight: 600;">Save</button>
                </div>
            </div>
        `;

        _attachPickerListeners(pickerCol, userId, currentInitials);
    }

    function _hidePicker() {
        const pickerCol = document.getElementById('mobile-picker-column');
        if (pickerCol) pickerCol.innerHTML = '';
    }

    function _attachPickerListeners(pickerCol, userId, currentInitials) {
        const hexInput = pickerCol.querySelector('.mobile-hex-input');

        // Swatch clicks
        pickerCol.querySelectorAll('.mobile-color-swatch').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                PlayerColorService.setPlayerColor(userId, color);
                _updateRosterInitialColor(userId);
                _updateSwatchActive(pickerCol, color);
                hexInput.value = color;
            });
        });

        // Hex input
        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = hexInput.value.trim();
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    PlayerColorService.setPlayerColor(userId, val);
                    _updateRosterInitialColor(userId);
                    _updateSwatchActive(pickerCol, val);
                } else {
                    hexInput.style.animation = 'shake 0.3s ease-in-out';
                    setTimeout(() => hexInput.style.animation = '', 300);
                }
            }
        });

        // Clear
        pickerCol.querySelector('.mobile-color-clear').addEventListener('click', () => {
            PlayerColorService.setPlayerColor(userId, null);
            _updateRosterInitialColor(userId);
            _updateSwatchActive(pickerCol, null);
            hexInput.value = '';
        });

        // Initials
        const initialsInput = pickerCol.querySelector('.mobile-initials-input');
        const saveBtn = pickerCol.querySelector('.mobile-initials-save');

        initialsInput.addEventListener('input', () => {
            initialsInput.value = initialsInput.value.toUpperCase().replace(/[^A-Z]/g, '');
            saveBtn.style.display = initialsInput.value !== currentInitials ? 'inline' : 'none';
        });

        const saveInitials = async () => {
            const val = initialsInput.value.trim();
            if (!val || !/^[A-Z]{1,3}$/.test(val) || val === currentInitials) return;

            saveBtn.textContent = '...';
            saveBtn.disabled = true;
            try {
                const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js');
                const updateFn = httpsCallable(window.firebase.functions, 'updateRosterInitials');
                await updateFn({
                    teamId: MobileApp.getSelectedTeamId(),
                    targetUserId: userId,
                    initials: val
                });
                // Update the initial in the roster list
                const row = document.querySelector(`.mobile-roster-row[data-uid="${userId}"] .mobile-roster-initial`);
                if (row) row.textContent = val.charAt(0);
                saveBtn.style.display = 'none';
            } catch (err) {
                console.error('Failed to update initials:', err);
                saveBtn.textContent = 'Error';
                setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 1500);
                return;
            }
            saveBtn.textContent = 'Save';
            saveBtn.disabled = false;
        };

        saveBtn.addEventListener('click', saveInitials);
        initialsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveInitials();
        });
    }

    function _updateRosterInitialColor(userId) {
        const color = PlayerColorService.getPlayerColorOrDefault(userId);
        const el = document.querySelector(`.mobile-roster-row[data-uid="${userId}"] .mobile-roster-initial`);
        if (el) el.style.color = color;
    }

    function _updateSwatchActive(container, activeColor) {
        container.querySelectorAll('.mobile-color-swatch').forEach(btn => {
            if (btn.dataset.color === activeColor) {
                btn.style.borderColor = 'var(--primary)';
                btn.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.3)';
            } else {
                btn.style.borderColor = 'transparent';
                btn.style.boxShadow = 'none';
            }
        });
    }

    // ─── Settings Layer 2 ────────────────────────────────────────────

    function _openSettings() {
        const team = MobileApp.getSelectedTeam();
        const user = AuthService.getCurrentUser();
        if (!team || !user) return;

        _settingsTeamData = Object.assign({}, team);
        // Deep copy arrays we mutate
        if (team.divisions) _settingsTeamData.divisions = team.divisions.slice();
        if (team.teamTags) _settingsTeamData.teamTags = team.teamTags.map(t => ({ ...t }));

        _teamId = MobileApp.getSelectedTeamId();
        _isLeader = team.playerRoster.some(
            p => p.userId === user.uid && p.role === 'leader'
        );

        // Reset tab state
        _activeTab = 'settings';
        _discordInitialized = false;
        _recordingsInitialized = false;
        _botRegistration = undefined;
        _recordings = [];
        _expandedSeries = new Set();
        _opponentLogoCache = {};

        const html = _isLeader
            ? _buildTabbedSettingsShell(_settingsTeamData, user.uid)
            : _buildSettingsHtml(_settingsTeamData, false, user.uid);

        MobileBottomSheet.push(html, () => {
            _cleanupSettings();
            MobileBottomSheet.close();
        });
        _attachSettingsListeners(_teamId, _settingsTeamData, _isLeader, user.uid);
    }

    // ─── Settings HTML Builders ──────────────────────────────────────

    function _buildSettingsHtml(team, isLeader, userId) {
        return `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; padding-bottom: 1rem;">
                <span style="font-size: 1rem; font-weight: 600; color: var(--foreground);">Team Settings</span>
                ${_buildSettingsTopSection(team, isLeader)}
                ${isLeader ? _buildSettingsSchedulerSection(team) : ''}
                ${isLeader ? _buildSettingsPrivacySection(team) : ''}
                <div style="border-top: 1px solid var(--border);"></div>
                ${isLeader ? _buildSettingsLeaderActions() : ''}
                ${_buildSettingsLeaveTeam(team, isLeader)}
            </div>
        `;
    }

    function _buildTabbedSettingsShell(team, userId) {
        const tabBar = `
            <div style="display: flex; border-bottom: 1px solid var(--border); margin: -1rem -1rem 0.75rem -1rem; padding: 0 1rem; flex-shrink: 0;">
                <button class="ms-tab-btn" data-tab="settings"
                    style="padding: 0.5rem 0.75rem; font-size: 0.75rem; font-weight: 500; background: none; border: none;
                           border-bottom: 2px solid var(--primary); color: var(--foreground); cursor: pointer;">
                    Settings
                </button>
                <button class="ms-tab-btn" data-tab="discord"
                    style="padding: 0.5rem 0.75rem; font-size: 0.75rem; font-weight: 500; background: none; border: none;
                           border-bottom: 2px solid transparent; color: var(--muted-foreground); cursor: pointer;">
                    Discord
                </button>
                <button class="ms-tab-btn" data-tab="recordings"
                    style="padding: 0.5rem 0.75rem; font-size: 0.75rem; font-weight: 500; background: none; border: none;
                           border-bottom: 2px solid transparent; color: var(--muted-foreground); cursor: pointer;">
                    Recordings
                </button>
            </div>
        `;

        return `
            <div style="display: flex; flex-direction: column;">
                ${tabBar}
                <div id="ms-tab-settings" style="display: flex; flex-direction: column; gap: 1.25rem; padding-bottom: 1rem;">
                    <span style="font-size: 1rem; font-weight: 600; color: var(--foreground);">Team Settings</span>
                    ${_buildSettingsTopSection(team, true)}
                    ${_buildSettingsSchedulerSection(team)}
                    ${_buildSettingsPrivacySection(team)}
                    <div style="border-top: 1px solid var(--border);"></div>
                    ${_buildSettingsLeaderActions()}
                    ${_buildSettingsLeaveTeam(team, true)}
                </div>
                <div id="ms-tab-discord" style="display: none; padding-bottom: 1rem;">
                    <p style="font-size: 0.8rem; color: var(--muted-foreground); padding: 1rem 0;">Loading...</p>
                </div>
                <div id="ms-tab-recordings" style="display: none; padding-bottom: 1rem;">
                    <p style="font-size: 0.8rem; color: var(--muted-foreground); padding: 1rem 0;">Loading recordings...</p>
                </div>
            </div>
        `;
    }

    function _handleMobileTabSwitch(tabName) {
        const content = MobileBottomSheet.getPushedContentElement();
        if (!content) return;

        _activeTab = tabName;

        // Toggle panel visibility
        ['settings', 'discord', 'recordings'].forEach(name => {
            const el = content.querySelector(`#ms-tab-${name}`);
            if (el) {
                el.style.display = name === tabName
                    ? (name === 'settings' ? 'flex' : 'block')
                    : 'none';
            }
        });

        // Update tab button styles
        content.querySelectorAll('.ms-tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.style.color = isActive ? 'var(--foreground)' : 'var(--muted-foreground)';
            btn.style.borderBottom = isActive ? '2px solid var(--primary)' : '2px solid transparent';
        });

        // Lazy init
        if (tabName === 'discord' && !_discordInitialized) {
            _discordInitialized = true;
            _initMobileDiscordTab();
        }
        if (tabName === 'recordings' && !_recordingsInitialized) {
            _recordingsInitialized = true;
            _initMobileRecordingsTab();
        }
    }

    function _buildSettingsTopSection(team, isLeader) {
        // Logo
        const logoUrl = team.activeLogo?.urls?.medium;
        const logoHtml = logoUrl
            ? `<img src="${logoUrl}" alt="${_esc(team.teamName)}" style="width: 3.5rem; height: 3.5rem; border-radius: 0.5rem; object-fit: cover; border: 1px solid var(--border);">`
            : `<div style="width: 3.5rem; height: 3.5rem; border-radius: 0.5rem; background: var(--muted); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; color: var(--muted-foreground);">${_esc(team.teamTag)}</div>`;
        const logoBtn = isLeader
            ? `<button id="ms-change-logo" style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: var(--secondary); color: var(--secondary-foreground); border: none; border-radius: 0.25rem; cursor: pointer;">${logoUrl ? 'Change' : 'Add Logo'}</button>`
            : '';

        // Tag
        const tagHtml = isLeader
            ? _buildSettingsTagChips(team)
            : `<span style="font-family: monospace; font-size: 0.85rem; padding: 0.15rem 0.4rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">${_esc(team.teamTag)}</span>`;

        // Max players
        const maxOptions = Array.from({ length: 17 }, (_, i) => i + 4)
            .map(n => `<option value="${n}" ${n === team.maxPlayers ? 'selected' : ''}>${n}</option>`).join('');
        const maxHtml = isLeader
            ? `<select id="ms-max-players" style="width: 3.5rem; padding: 0.2rem; font-size: 0.8rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">${maxOptions}</select>`
            : `<span style="font-size: 0.85rem; padding: 0.15rem 0.4rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">${team.maxPlayers}</span>`;

        // Divisions
        const divisions = team.divisions || [];
        const divPills = isLeader
            ? ['D1', 'D2', 'D3'].map(div => {
                const active = divisions.includes(div);
                return `<button class="ms-div-pill" data-division="${div}" data-active="${active}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; font-weight: 500; border-radius: 0.25rem; border: none; cursor: pointer; ${active ? 'background: var(--primary); color: var(--primary-foreground);' : 'background: var(--muted); color: var(--muted-foreground);'}">${div}</button>`;
            }).join('')
            : `<span style="font-size: 0.85rem; padding: 0.15rem 0.4rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">${divisions.join(', ') || 'None'}</span>`;

        // Join code
        const codeHtml = `
            <div style="display: flex; align-items: center; gap: 0.25rem;">
                <input type="text" value="${_esc(team.joinCode)}" readonly id="ms-join-code"
                    style="width: 4.5rem; padding: 0.2rem 0.3rem; font-size: 0.8rem; font-family: monospace; text-align: center; background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">
                <button id="ms-copy-code" style="padding: 0.3rem; background: var(--secondary); border: none; border-radius: 0.25rem; cursor: pointer; color: var(--secondary-foreground);" title="Copy join code">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
                ${isLeader ? `<button id="ms-regenerate-code" style="padding: 0.3rem; background: var(--secondary); border: none; border-radius: 0.25rem; cursor: pointer; color: var(--secondary-foreground);" title="Regenerate join code">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                </button>` : ''}
            </div>
        `;

        const labelStyle = 'font-size: 0.8rem; font-weight: 500; color: var(--foreground); width: 2.5rem; flex-shrink: 0;';
        const rowStyle = 'display: flex; align-items: center; gap: 0.4rem;';

        return `
            <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0.3rem; flex-shrink: 0;">
                    ${logoHtml}
                    ${logoBtn}
                </div>
                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="${rowStyle}">
                        <span style="${labelStyle}">Tag</span>
                        ${tagHtml}
                    </div>
                    <div style="${rowStyle}">
                        <span style="${labelStyle}">Max</span>
                        ${maxHtml}
                    </div>
                    <div style="${rowStyle}">
                        <span style="${labelStyle}">Div</span>
                        <div style="display: flex; gap: 0.25rem;">${divPills}</div>
                        <span id="ms-div-feedback" style="font-size: 0.7rem;"></span>
                    </div>
                    <div style="${rowStyle}">
                        <span style="${labelStyle}">Code</span>
                        ${codeHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function _buildSettingsTagChips(team) {
        const tags = (team.teamTags && Array.isArray(team.teamTags) && team.teamTags.length > 0)
            ? team.teamTags
            : [{ tag: team.teamTag, isPrimary: true }];

        const chips = tags.map((entry, i) => {
            const isPrimary = !!entry.isPrimary;
            const starColor = isPrimary ? 'color: #FBBF24;' : 'color: rgba(150,150,150,0.4); cursor: pointer;';
            const canRemove = tags.length > 1;
            return `<span style="display: inline-flex; align-items: center; gap: 0.15rem; padding: 0.1rem 0.3rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; font-family: monospace; font-size: 0.8rem; color: var(--foreground);">
                <button class="ms-tag-star" data-tag-index="${i}" style="background: none; border: none; padding: 0; ${starColor}" title="${isPrimary ? 'Primary tag' : 'Set as primary'}">
                    <svg width="10" height="10" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                </button>
                ${_esc(entry.tag)}
                ${canRemove ? `<button class="ms-tag-remove" data-tag-index="${i}" style="background: none; border: none; padding: 0; margin-left: 0.1rem; color: rgba(150,150,150,0.5); cursor: pointer;" title="Remove tag">
                    <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>` : ''}
            </span>`;
        }).join('');

        return `
            <div style="flex: 1; min-width: 0;">
                <div id="ms-tag-chips" style="display: flex; flex-wrap: wrap; gap: 0.2rem; align-items: center;">
                    ${chips}
                    <input type="text" id="ms-add-tag" maxlength="4" placeholder="+"
                        style="width: 2.2rem; padding: 0.1rem 0.15rem; font-size: 0.75rem; font-family: monospace; text-align: center; background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--foreground);">
                </div>
                <span id="ms-tag-feedback" style="font-size: 0.65rem; display: block; margin-top: 0.1rem;"></span>
            </div>
        `;
    }

    function _buildSettingsSchedulerSection(team) {
        const members = team.playerRoster.filter(p => p.userId !== team.leaderId);
        if (members.length === 0) return '';

        const schedulers = team.schedulers || [];
        const count = schedulers.length;
        const rows = members.map(p => {
            const isSch = schedulers.includes(p.userId);
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0;">
                    <span style="font-size: 0.85rem; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0.5rem;">${_esc(p.displayName)}</span>
                    <button class="ms-scheduler-toggle" data-user-id="${p.userId}" data-enabled="${isSch}"
                        style="position: relative; width: 2.25rem; height: 1.25rem; border-radius: 9999px; border: none; cursor: pointer; flex-shrink: 0; ${isSch ? 'background: var(--primary);' : 'background: rgba(150,150,150,0.3);'}">
                        <span style="position: absolute; top: 0.125rem; width: 1rem; height: 1rem; background: white; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: left 0.15s; left: ${isSch ? '1.125rem' : '0.125rem'};"></span>
                    </button>
                </div>
            `;
        }).join('');

        return `
            <div>
                <button id="ms-scheduler-expand" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.35rem 0; background: none; border: none; cursor: pointer; color: var(--foreground);">
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <svg id="ms-scheduler-chevron" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transition: transform 0.15s; color: var(--muted-foreground);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                        <span style="font-size: 0.85rem; font-weight: 500;">Scheduling Permissions</span>
                        ${count > 0 ? `<span style="font-size: 0.7rem; color: var(--primary);">${count} active</span>` : ''}
                    </div>
                    <span style="font-size: 0.7rem; color: var(--muted-foreground);">${members.length} members</span>
                </button>
                <div id="ms-scheduler-content" style="display: none; padding-left: 1.5rem;">
                    <p style="font-size: 0.7rem; color: var(--muted-foreground); margin-bottom: 0.25rem;">Allow members to propose/confirm matches</p>
                    <div id="ms-scheduler-toggles">${rows}</div>
                </div>
            </div>
        `;
    }

    function _buildSettingsPrivacySection(team) {
        const hideRoster = team.hideRosterNames || false;
        const hideCompare = team.hideFromComparison || false;

        function toggle(setting, enabled) {
            return `<button class="ms-privacy-toggle" data-setting="${setting}" data-enabled="${enabled}"
                style="position: relative; width: 2.25rem; height: 1.25rem; border-radius: 9999px; border: none; cursor: pointer; flex-shrink: 0; ${enabled ? 'background: var(--primary);' : 'background: rgba(150,150,150,0.3);'}">
                <span style="position: absolute; top: 0.125rem; width: 1rem; height: 1rem; background: white; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: left 0.15s; left: ${enabled ? '1.125rem' : '0.125rem'};"></span>
            </button>`;
        }

        return `
            <div>
                <span style="font-size: 0.85rem; font-weight: 500; color: var(--foreground);">Privacy</span>
                <p style="font-size: 0.7rem; color: var(--muted-foreground); margin-bottom: 0.4rem;">Control how your team appears to others</p>
                <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <div style="min-width: 0;">
                            <span style="font-size: 0.85rem; color: var(--foreground);">Hide roster names</span>
                            <p style="font-size: 0.7rem; color: var(--muted-foreground);">Others see player counts, not names</p>
                        </div>
                        ${toggle('hideRosterNames', hideRoster)}
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <div style="min-width: 0;">
                            <span style="font-size: 0.85rem; color: var(--foreground);">Hide from comparison</span>
                            <p style="font-size: 0.7rem; color: var(--muted-foreground);">Team invisible in comparison mode</p>
                        </div>
                        ${toggle('hideFromComparison', hideCompare)}
                    </div>
                </div>
            </div>
        `;
    }

    function _buildSettingsLeaderActions() {
        return `
            <div style="display: flex; gap: 0.5rem;">
                <button id="ms-remove-player" style="flex: 1; padding: 0.5rem; font-size: 0.8rem; font-weight: 500; background: var(--secondary); color: var(--secondary-foreground); border: none; border-radius: 0.375rem; cursor: pointer;">Remove Player</button>
                <button id="ms-transfer-leader" style="flex: 1; padding: 0.5rem; font-size: 0.8rem; font-weight: 500; background: var(--secondary); color: var(--secondary-foreground); border: none; border-radius: 0.375rem; cursor: pointer;">Transfer Leader</button>
            </div>
        `;
    }

    function _buildSettingsLeaveTeam(team, isLeader) {
        const isLastMember = team.playerRoster.length === 1;
        const canLeave = !isLeader || isLastMember;
        return `
            <button id="ms-leave-team" ${!canLeave ? 'disabled' : ''}
                style="width: 100%; padding: 0.5rem; font-size: 0.8rem; font-weight: 500; border: none; border-radius: 0.375rem; ${canLeave ? 'background: var(--destructive); color: var(--destructive-foreground); cursor: pointer;' : 'background: var(--muted); color: var(--muted-foreground); cursor: not-allowed;'}"
                ${!canLeave ? 'title="Transfer leadership first"' : ''}>Leave Team</button>
        `;
    }

    // ─── Settings Event Wiring ───────────────────────────────────────

    function _attachSettingsListeners(teamId, teamData, isLeader, userId) {
        const content = MobileBottomSheet.getPushedContentElement();
        if (!content) return;

        // Tab switching (leader only — tabbed shell)
        content.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => _handleMobileTabSwitch(btn.dataset.tab));
        });

        // Logo change
        const logoBtn = content.querySelector('#ms-change-logo');
        if (logoBtn) logoBtn.addEventListener('click', () => {
            MobileBottomSheet.pop();
            MobileBottomSheet.close();
            if (typeof LogoUploadModal !== 'undefined') LogoUploadModal.show(teamId, userId);
        });

        // Tag chips (star/remove)
        const tagContainer = content.querySelector('#ms-tag-chips');
        if (tagContainer) {
            tagContainer.addEventListener('click', (e) => {
                const starBtn = e.target.closest('.ms-tag-star');
                const removeBtn = e.target.closest('.ms-tag-remove');
                if (starBtn) _handleSettingsSetPrimary(teamId, parseInt(starBtn.dataset.tagIndex));
                else if (removeBtn) _handleSettingsRemoveTag(teamId, parseInt(removeBtn.dataset.tagIndex));
            });
        }
        // Tag add
        const addTagInput = content.querySelector('#ms-add-tag');
        if (addTagInput) addTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); _handleSettingsAddTag(teamId); }
        });

        // Max players
        const maxSelect = content.querySelector('#ms-max-players');
        if (maxSelect) maxSelect.addEventListener('change', (e) => _handleSettingsMaxPlayers(teamId, e));

        // Division pills
        content.querySelectorAll('.ms-div-pill').forEach(btn => {
            btn.addEventListener('click', () => _handleSettingsDivisionToggle(teamId, btn));
        });

        // Copy join code
        const copyBtn = content.querySelector('#ms-copy-code');
        if (copyBtn) copyBtn.addEventListener('click', () => _handleSettingsCopyCode(teamData));

        // Regenerate join code
        const regenBtn = content.querySelector('#ms-regenerate-code');
        if (regenBtn) regenBtn.addEventListener('click', () => _handleSettingsRegenerateCode(teamId, teamData));

        // Scheduler expand/collapse
        const schedulerExpand = content.querySelector('#ms-scheduler-expand');
        if (schedulerExpand) schedulerExpand.addEventListener('click', () => {
            const c = content.querySelector('#ms-scheduler-content');
            const chevron = content.querySelector('#ms-scheduler-chevron');
            if (!c) return;
            const hidden = c.style.display === 'none';
            c.style.display = hidden ? 'block' : 'none';
            if (chevron) chevron.style.transform = hidden ? 'rotate(90deg)' : '';
        });

        // Scheduler toggles
        const schedulerToggles = content.querySelector('#ms-scheduler-toggles');
        if (schedulerToggles) schedulerToggles.addEventListener('click', (e) => {
            const btn = e.target.closest('.ms-scheduler-toggle');
            if (btn) _handleSettingsSchedulerToggle(teamId, btn);
        });

        // Privacy toggles
        content.querySelectorAll('.ms-privacy-toggle').forEach(btn => {
            btn.addEventListener('click', () => _handleSettingsPrivacyToggle(teamId, btn));
        });

        // Remove player
        const removePlayerBtn = content.querySelector('#ms-remove-player');
        if (removePlayerBtn) removePlayerBtn.addEventListener('click', () => {
            MobileBottomSheet.pop();
            MobileBottomSheet.close();
            if (typeof KickPlayerModal !== 'undefined') KickPlayerModal.show(teamId);
        });

        // Transfer leadership
        const transferBtn = content.querySelector('#ms-transfer-leader');
        if (transferBtn) transferBtn.addEventListener('click', () => {
            MobileBottomSheet.pop();
            MobileBottomSheet.close();
            if (typeof TransferLeadershipModal !== 'undefined') TransferLeadershipModal.show(teamId);
        });

        // Leave team
        const leaveBtn = content.querySelector('#ms-leave-team');
        if (leaveBtn && !leaveBtn.disabled) {
            leaveBtn.addEventListener('click', () => _handleSettingsLeaveTeam(teamId, teamData));
        }
    }

    // ─── Settings Action Handlers ────────────────────────────────────

    function _getSettingsTeamTags() {
        const td = _settingsTeamData;
        if (!td) return [];
        if (td.teamTags && Array.isArray(td.teamTags) && td.teamTags.length > 0) return td.teamTags;
        return [{ tag: td.teamTag, isPrimary: true }];
    }

    function _showSettingsTagFeedback(msg, isError) {
        const fb = document.getElementById('ms-tag-feedback');
        if (!fb) return;
        fb.textContent = msg;
        fb.style.color = isError ? 'var(--destructive)' : '#22c55e';
        if (!isError) setTimeout(() => { fb.textContent = ''; }, 2000);
    }

    async function _saveSettingsTags(teamId, newTags) {
        if (_settingsTagsLoading) return;
        _settingsTagsLoading = true;
        try {
            const result = await TeamService.callFunction('updateTeamTags', { teamId, teamTags: newTags });
            if (result.success) {
                _settingsTeamData.teamTags = newTags;
                _settingsTeamData.teamTag = newTags.find(t => t.isPrimary).tag;
                _rerenderSettingsTagChips(teamId);
                _showSettingsTagFeedback('Saved!', false);
            } else {
                _showSettingsTagFeedback(result.error || 'Failed to save', true);
            }
        } catch (err) {
            console.error('Error saving team tags:', err);
            _showSettingsTagFeedback('Network error', true);
        } finally {
            _settingsTagsLoading = false;
        }
    }

    function _rerenderSettingsTagChips(teamId) {
        const container = document.getElementById('ms-tag-chips');
        if (!container || !_settingsTeamData) return;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = _buildSettingsTagChips(_settingsTeamData);
        const newChips = tempDiv.querySelector('#ms-tag-chips');
        if (newChips) {
            container.replaceWith(newChips);
            // Re-attach tag chip listeners
            const nc = document.getElementById('ms-tag-chips');
            if (nc) {
                nc.addEventListener('click', (e) => {
                    const starBtn = e.target.closest('.ms-tag-star');
                    const removeBtn = e.target.closest('.ms-tag-remove');
                    if (starBtn) _handleSettingsSetPrimary(teamId, parseInt(starBtn.dataset.tagIndex));
                    else if (removeBtn) _handleSettingsRemoveTag(teamId, parseInt(removeBtn.dataset.tagIndex));
                });
            }
            const addInput = document.getElementById('ms-add-tag');
            if (addInput) addInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); _handleSettingsAddTag(teamId); }
            });
        }
    }

    async function _handleSettingsAddTag(teamId) {
        const input = document.getElementById('ms-add-tag');
        if (!input) return;
        const newTag = input.value.trim();
        if (!newTag) return;

        if (typeof TeamService !== 'undefined' && TeamService.validateTeamTag) {
            const error = TeamService.validateTeamTag(newTag);
            if (error) { _showSettingsTagFeedback(error, true); return; }
        }

        const currentTags = _getSettingsTeamTags();
        if (currentTags.some(t => t.tag.toLowerCase() === newTag.toLowerCase())) {
            _showSettingsTagFeedback('Tag already exists', true); return;
        }
        if (currentTags.length >= 6) {
            _showSettingsTagFeedback('Maximum 6 tags', true); return;
        }

        // Cross-team uniqueness check
        const allTeams = TeamService.getAllTeams();
        for (const other of allTeams) {
            if (other.id === teamId) continue;
            const otherTags = (other.teamTags && Array.isArray(other.teamTags) && other.teamTags.length > 0)
                ? other.teamTags.map(t => t.tag.toLowerCase())
                : (other.teamTag ? [other.teamTag.toLowerCase()] : []);
            if (otherTags.includes(newTag.toLowerCase())) {
                _showSettingsTagFeedback(`"${newTag}" used by ${other.teamName}`, true); return;
            }
        }

        input.value = '';
        await _saveSettingsTags(teamId, [...currentTags, { tag: newTag, isPrimary: false }]);
    }

    async function _handleSettingsRemoveTag(teamId, index) {
        const tags = _getSettingsTeamTags();
        if (tags.length <= 1) return;
        if (tags[index].isPrimary) { _showSettingsTagFeedback('Change primary first', true); return; }
        await _saveSettingsTags(teamId, tags.filter((_, i) => i !== index));
    }

    async function _handleSettingsSetPrimary(teamId, index) {
        const tags = _getSettingsTeamTags();
        if (tags[index].isPrimary) return;
        await _saveSettingsTags(teamId, tags.map((t, i) => ({ tag: t.tag, isPrimary: i === index })));
    }

    async function _handleSettingsMaxPlayers(teamId, event) {
        const newValue = parseInt(event.target.value);
        const oldValue = _settingsTeamData?.maxPlayers;
        try {
            const result = await TeamService.callFunction('updateTeamSettings', { teamId, maxPlayers: newValue });
            if (!result.success) {
                event.target.value = oldValue;
            } else if (_settingsTeamData) {
                _settingsTeamData.maxPlayers = newValue;
            }
        } catch (err) {
            console.error('Error updating max players:', err);
            event.target.value = oldValue;
        }
    }

    async function _handleSettingsDivisionToggle(teamId, btn) {
        const division = btn.dataset.division;
        const wasActive = btn.dataset.active === 'true';
        const current = (_settingsTeamData?.divisions || []).slice();
        const newDivisions = wasActive ? current.filter(d => d !== division) : [...current, division];
        const feedback = document.getElementById('ms-div-feedback');

        if (newDivisions.length === 0) {
            if (feedback) { feedback.textContent = 'Need at least 1'; feedback.style.color = 'var(--destructive)'; }
            return;
        }
        if (feedback) feedback.textContent = '';

        // Optimistic update
        const newActive = !wasActive;
        btn.dataset.active = String(newActive);
        btn.style.background = newActive ? 'var(--primary)' : 'var(--muted)';
        btn.style.color = newActive ? 'var(--primary-foreground)' : 'var(--muted-foreground)';

        try {
            const result = await TeamService.callFunction('updateTeamSettings', { teamId, divisions: newDivisions });
            if (result.success) {
                if (_settingsTeamData) _settingsTeamData.divisions = newDivisions;
            } else {
                btn.dataset.active = String(wasActive);
                btn.style.background = wasActive ? 'var(--primary)' : 'var(--muted)';
                btn.style.color = wasActive ? 'var(--primary-foreground)' : 'var(--muted-foreground)';
            }
        } catch (err) {
            console.error('Error updating divisions:', err);
            btn.dataset.active = String(wasActive);
            btn.style.background = wasActive ? 'var(--primary)' : 'var(--muted)';
            btn.style.color = wasActive ? 'var(--primary-foreground)' : 'var(--muted-foreground)';
        }
    }

    async function _handleSettingsCopyCode(teamData) {
        const copyText = `Use code: ${teamData.joinCode} to join ${teamData.teamName} at https://scheduler.quake.world`;
        try {
            await navigator.clipboard.writeText(copyText);
            if (typeof ToastService !== 'undefined') ToastService.showSuccess('Join code copied!');
        } catch (err) {
            try {
                const ta = document.createElement('textarea');
                ta.value = copyText;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                if (typeof ToastService !== 'undefined') ToastService.showSuccess('Join code copied!');
            } catch (e) {
                if (typeof ToastService !== 'undefined') ToastService.showError('Failed to copy');
            }
        }
    }

    async function _handleSettingsRegenerateCode(teamId, teamData) {
        MobileBottomSheet.pop();
        MobileBottomSheet.close();

        const confirmed = await showConfirmModal({
            title: 'Regenerate Join Code?',
            message: 'Old codes will no longer work.',
            confirmText: 'Regenerate',
            cancelText: 'Cancel'
        });
        if (!confirmed) return;

        try {
            const result = await TeamService.callFunction('regenerateJoinCode', { teamId });
            if (result.success) {
                ToastService.showSuccess('New join code: ' + result.data.joinCode);
            } else {
                ToastService.showError(result.error || 'Failed to regenerate');
            }
        } catch (err) {
            console.error('Error regenerating code:', err);
            ToastService.showError('Network error');
        }
    }

    function _applySettingsToggleState(btn, enabled) {
        btn.dataset.enabled = String(enabled);
        btn.style.background = enabled ? 'var(--primary)' : 'rgba(150,150,150,0.3)';
        const knob = btn.querySelector('span');
        if (knob) knob.style.left = enabled ? '1.125rem' : '0.125rem';
    }

    async function _handleSettingsSchedulerToggle(teamId, btn) {
        const targetUserId = btn.dataset.userId;
        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        _applySettingsToggleState(btn, newEnabled);

        try {
            const result = await TeamService.callFunction('toggleScheduler', { teamId, targetUserId, enabled: newEnabled });
            if (result.success) {
                ToastService.showSuccess(`Scheduling ${newEnabled ? 'enabled' : 'disabled'}`);
            } else {
                _applySettingsToggleState(btn, currentlyEnabled);
                ToastService.showError(result.error || 'Failed');
            }
        } catch (err) {
            console.error('Error toggling scheduler:', err);
            _applySettingsToggleState(btn, currentlyEnabled);
            ToastService.showError('Network error');
        }
    }

    async function _handleSettingsPrivacyToggle(teamId, btn) {
        const setting = btn.dataset.setting;
        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        _applySettingsToggleState(btn, newEnabled);

        try {
            const result = await TeamService.callFunction('updateTeamSettings', { teamId, [setting]: newEnabled });
            if (result.success) {
                if (_settingsTeamData) _settingsTeamData[setting] = newEnabled;
                ToastService.showSuccess(
                    setting === 'hideRosterNames'
                        ? `Roster names ${newEnabled ? 'hidden' : 'visible'}`
                        : `Team ${newEnabled ? 'hidden from' : 'visible in'} comparison`
                );
            } else {
                _applySettingsToggleState(btn, currentlyEnabled);
                ToastService.showError(result.error || 'Failed');
            }
        } catch (err) {
            console.error('Error toggling privacy:', err);
            _applySettingsToggleState(btn, currentlyEnabled);
            ToastService.showError('Network error');
        }
    }

    async function _handleSettingsLeaveTeam(teamId, teamData) {
        const isLastMember = teamData.playerRoster.length === 1;
        const message = isLastMember
            ? 'You are the last member. Leaving will archive this team permanently.'
            : 'Are you sure you want to leave this team?';

        MobileBottomSheet.pop();
        MobileBottomSheet.close();

        const confirmed = await showConfirmModal({
            title: 'Leave Team?',
            message,
            confirmText: 'Leave Team',
            confirmClass: 'bg-destructive hover:bg-destructive/90',
            cancelText: 'Cancel'
        });
        if (!confirmed) return;

        ToastService.showInfo('Leaving team...');
        try {
            const result = await TeamService.callFunction('leaveTeam', { teamId });
            if (result.success) {
                ToastService.showSuccess('You have left the team');
                window.dispatchEvent(new CustomEvent('team-left', { detail: { teamId } }));
            } else {
                ToastService.showError(result.error || 'Failed to leave team');
            }
        } catch (err) {
            console.error('Error leaving team:', err);
            ToastService.showError('Network error');
        }
    }

    // ─── Discord Tab (Leader Only) ──────────────────────────────────

    async function _initMobileDiscordTab() {
        if (!_teamId || typeof BotRegistrationService === 'undefined') return;

        try {
            const reg = await BotRegistrationService.getRegistration(_teamId);
            _botRegistration = reg;
        } catch (err) {
            console.error('Failed to load bot registration:', err);
            _botRegistration = null;
        }

        _rerenderMobileDiscordSection();

        _botRegUnsubscribe = BotRegistrationService.onRegistrationChange(_teamId, (data) => {
            _botRegistration = data;
            if (_activeTab === 'discord') _rerenderMobileDiscordSection();
        });
    }

    function _rerenderMobileDiscordSection() {
        const content = MobileBottomSheet.getPushedContentElement();
        if (!content) return;
        const container = content.querySelector('#ms-tab-discord');
        if (!container) return;
        container.innerHTML = _buildMobileDiscordHtml();
        _attachMobileDiscordListeners(container);
    }

    function _buildMobileDiscordHtml() {
        // Loading
        if (_botRegistration === undefined) {
            return `<p style="font-size: 0.8rem; color: var(--muted-foreground); padding: 1rem 0;">Loading...</p>`;
        }

        // Not connected
        if (!_botRegistration) {
            return `
                <div>
                    <p style="font-size: 0.85rem; font-weight: 500; color: var(--foreground); margin-bottom: 0.25rem;">Quad Bot</p>
                    <p style="font-size: 0.75rem; color: var(--muted-foreground); margin-bottom: 0.75rem;">
                        Connect the Quad bot to your Discord server to enable notifications, voice recording and more.
                    </p>
                    <button id="ms-bot-connect"
                        style="padding: 0.5rem 1rem; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 0.375rem; font-size: 0.8rem; font-weight: 500; cursor: pointer;">
                        Connect Bot
                    </button>
                </div>
            `;
        }

        // Pending
        if (_botRegistration.status === 'pending') {
            const inviteUrl = typeof BotRegistrationService !== 'undefined'
                ? BotRegistrationService.getBotInviteUrl() : '#';

            const alreadyInGuilds = _botRegistration.botAlreadyInGuilds || [];

            let instructionsHtml;
            if (alreadyInGuilds.length > 0) {
                // Variant B: Bot already in server(s) the user is in
                const guildList = alreadyInGuilds
                    .map(g => `<li style="font-weight: 500; color: var(--foreground);">${_esc(g.guildName)}</li>`)
                    .join('');

                instructionsHtml = `
                    <p style="font-size: 0.75rem; color: var(--foreground); margin-bottom: 0.35rem;">The bot is already in:</p>
                    <ul style="font-size: 0.7rem; padding-left: 1rem; margin-bottom: 0.35rem;">${guildList}</ul>
                    <p style="font-size: 0.7rem; color: var(--muted-foreground); margin-bottom: 0.35rem;">
                        Run <code style="background: rgba(150,150,150,0.15); padding: 0 0.2rem; border-radius: 0.15rem;">/register</code>
                        in your team's channel to link this squad.
                    </p>
                    <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
                        <p style="font-size: 0.7rem; color: var(--muted-foreground);">
                            Or invite to a different server:
                            <a href="${inviteUrl}" target="_blank" rel="noopener" style="color: var(--primary); margin-left: 0.2rem;">Invite Bot &rarr;</a>
                        </p>
                    </div>
                `;
            } else {
                // Variant A: Bot not in any of user's servers
                instructionsHtml = `
                    <p style="font-size: 0.75rem; color: var(--foreground); margin-bottom: 0.35rem;">Complete setup in Discord:</p>
                    <ol style="font-size: 0.7rem; color: var(--muted-foreground); padding-left: 1rem; display: flex; flex-direction: column; gap: 0.25rem;">
                        <li>Add the bot: <a href="${inviteUrl}" target="_blank" rel="noopener" style="color: var(--primary);">Invite Bot</a></li>
                        <li>Run <code style="background: rgba(150,150,150,0.15); padding: 0 0.2rem; border-radius: 0.15rem;">/register</code> in your team's channel</li>
                    </ol>
                `;
            }

            return `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <p style="font-size: 0.85rem; font-weight: 500; color: var(--foreground);">Quad Bot</p>
                        <span style="font-size: 0.7rem; color: #F59E0B; font-weight: 500;">Pending</span>
                    </div>
                    <div style="padding: 0.75rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.375rem; margin-bottom: 0.5rem;">
                        ${instructionsHtml}
                    </div>
                    <button id="ms-bot-cancel"
                        style="padding: 0.4rem 0.75rem; background: var(--secondary); color: var(--secondary-foreground); border: none; border-radius: 0.375rem; font-size: 0.8rem; cursor: pointer;">
                        Cancel
                    </button>
                </div>
            `;
        }

        // Active
        const guildName = _botRegistration.guildName ? _esc(_botRegistration.guildName) : 'Discord server';
        return `
            <div style="display: flex; flex-direction: column; gap: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <p style="font-size: 0.85rem; font-weight: 500; color: var(--foreground);">Quad Bot</p>
                    <span style="font-size: 0.7rem; color: #4ADE80; font-weight: 500;">Connected ●</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.375rem; margin-bottom: 0.75rem;">
                    <div>
                        <p style="font-size: 0.85rem; color: var(--foreground);">${guildName}</p>
                        <p style="font-size: 0.7rem; color: var(--muted-foreground);">Discord server</p>
                    </div>
                    <button id="ms-bot-disconnect"
                        style="padding: 0.35rem 0.65rem; background: var(--secondary); color: var(--secondary-foreground); border: none; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer; flex-shrink: 0;">
                        Disconnect
                    </button>
                </div>
                ${_buildMobilePlayerMappingSection()}
                ${_buildMobileNotificationsSection()}
                ${_buildMobileScheduleChannelSection()}
            </div>
        `;
    }

    function _buildMobilePlayerMappingSection() {
        const knownPlayers = _botRegistration?.knownPlayers || {};
        const entries = Object.entries(knownPlayers);
        const count = entries.length;

        const listHtml = entries.length > 0
            ? entries.map(([discordId, qwName]) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid var(--border);">
                    <span style="font-size: 0.8rem; color: var(--foreground);">${_esc(qwName)}</span>
                    <button class="ms-mapping-copy" data-discord-id="${_esc(discordId)}"
                        style="font-size: 0.65rem; color: var(--muted-foreground); background: none; border: none; cursor: pointer; padding: 0.15rem 0.25rem;"
                        title="Copy Discord ID">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        ID
                    </button>
                </div>
            `).join('')
            : `<p style="font-size: 0.75rem; color: var(--muted-foreground); padding: 0.3rem 0;">No players registered yet. Run /register in Discord.</p>`;

        return `
            <div style="border-top: 1px solid var(--border); padding-top: 0.6rem; margin-bottom: 0.6rem;">
                <button id="ms-player-mapping-expand"
                    style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.25rem 0; background: none; border: none; cursor: pointer; color: var(--foreground);">
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <svg id="ms-player-mapping-chevron" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                             style="color: var(--muted-foreground); transition: transform 0.15s;">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                        <span style="font-size: 0.85rem; font-weight: 500;">Player Mapping</span>
                        ${count > 0 ? `<span style="font-size: 0.65rem; color: var(--muted-foreground);">${count} linked</span>` : ''}
                    </div>
                </button>
                <div id="ms-player-mapping-content" style="display: none; padding-left: 1.2rem; margin-top: 0.35rem;">
                    <div style="background: var(--muted); border: 1px solid var(--border); border-radius: 0.25rem; padding: 0.35rem 0.5rem;">
                        ${listHtml}
                    </div>
                    <button id="ms-manage-players-btn"
                        style="margin-top: 0.4rem; padding: 0.35rem 0.6rem; font-size: 0.75rem; color: var(--primary); background: none; border: 1px solid var(--primary); border-radius: 0.25rem; cursor: pointer;">
                        Manage Players
                    </button>
                </div>
            </div>
        `;
    }

    function _buildMobileNotificationsSection() {
        const notifications = _botRegistration?.notifications;
        const isEnabled = notifications?.enabled !== false;
        const selectedChannelId = notifications?.channelId || null;
        const availableChannels = _botRegistration?.availableChannels || [];

        const channelOptions = availableChannels.map(ch => {
            const canPost = ch.canPost !== false;
            return `<option value="${_esc(ch.id)}" ${ch.id === selectedChannelId ? 'selected' : ''}>
                ${!canPost ? '🔒 ' : '# '}${_esc(ch.name)}${!canPost ? ' (no permission)' : ''}
            </option>`;
        }).join('');

        const selectedChannel = availableChannels.find(ch => ch.id === selectedChannelId);
        const selectedCanPost = !selectedChannel || selectedChannel.canPost !== false;

        const channelDropdown = availableChannels.length > 0 ? `
            <div style="margin-top: 0.5rem;">
                <p style="font-size: 0.8rem; color: var(--foreground); margin-bottom: 0.25rem;">Post in channel:</p>
                <select id="ms-notif-channel-select"
                    style="width: 100%; padding: 0.4rem 0.5rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8rem; color: var(--foreground);"
                    ${!isEnabled ? 'disabled' : ''}>
                    <option value="">— DM team leader (fallback) —</option>
                    ${channelOptions}
                </select>
                <p id="ms-notif-channel-warning" style="font-size: 0.7rem; color: #F59E0B; margin-top: 0.25rem; ${selectedCanPost ? 'display: none;' : ''}">
                    Bot needs "Send Messages" permission in this channel
                </p>
            </div>
        ` : '';

        return `
            <div style="border-top: 1px solid var(--border); padding-top: 0.6rem; margin-bottom: 0.6rem;">
                <span style="font-size: 0.85rem; font-weight: 500; color: var(--foreground);">Notifications</span>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.4rem;">
                    <div style="min-width: 0;">
                        <p style="font-size: 0.8rem; color: var(--foreground);">Challenge notifications</p>
                        <p style="font-size: 0.7rem; color: var(--muted-foreground);">Get notified when opponents challenge you</p>
                    </div>
                    <button id="ms-notif-toggle" data-enabled="${isEnabled}"
                        style="position: relative; width: 2.25rem; height: 1.25rem; border-radius: 9999px; border: none; cursor: pointer; flex-shrink: 0; ${isEnabled ? 'background: var(--primary);' : 'background: rgba(150,150,150,0.3);'}">
                        <span style="position: absolute; top: 0.125rem; width: 1rem; height: 1rem; background: white; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: left 0.15s; left: ${isEnabled ? '1.125rem' : '0.125rem'};"></span>
                    </button>
                </div>
                ${channelDropdown}
                <p style="font-size: 0.65rem; color: var(--muted-foreground); margin-top: 0.35rem;">
                    Bot must have access to the selected channel
                </p>
            </div>
        `;
    }

    function _buildMobileScheduleChannelSection() {
        const selectedChannelId = _botRegistration?.scheduleChannelId
            || _botRegistration?.scheduleChannel?.channelId || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const pendingCreate = _botRegistration?.createChannelRequest?.status === 'pending';

        const channelOptions = availableChannels.map(ch => {
            const canPost = ch.canPost !== false;
            return `<option value="${_esc(ch.id)}" ${ch.id === selectedChannelId ? 'selected' : ''}>
                ${!canPost ? '🔒 ' : '# '}${_esc(ch.name)}${!canPost ? ' (no permission)' : ''}
            </option>`;
        }).join('');

        const selectedChannel = availableChannels.find(ch => ch.id === selectedChannelId);
        const selectedCanPost = !selectedChannel || selectedChannel.canPost !== false;

        const channelDropdown = availableChannels.length > 0 ? `
            <div style="margin-top: 0.4rem;">
                <select id="ms-schedule-channel-select"
                    style="width: 100%; padding: 0.4rem 0.5rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8rem; color: var(--foreground);">
                    <option value="">— No schedule channel —</option>
                    ${channelOptions}
                </select>
                <p id="ms-schedule-channel-warning" style="font-size: 0.7rem; color: #F59E0B; margin-top: 0.25rem; ${selectedCanPost ? 'display: none;' : ''}">
                    Bot needs "Send Messages" permission in this channel
                </p>
            </div>
        ` : '';

        const createBtnStyle = pendingCreate
            ? 'opacity: 0.5; cursor: wait;'
            : 'cursor: pointer;';

        return `
            <div style="border-top: 1px solid var(--border); padding-top: 0.6rem;">
                <span style="font-size: 0.85rem; font-weight: 500; color: var(--foreground);">Schedule Channel</span>
                <p style="font-size: 0.7rem; color: var(--muted-foreground); margin-top: 0.15rem;">Post availability grid in this channel</p>
                ${channelDropdown}
                <button id="ms-create-schedule-channel" ${pendingCreate ? 'disabled' : ''}
                    style="margin-top: 0.4rem; width: 100%; padding: 0.4rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8rem; color: var(--foreground); ${createBtnStyle}">
                    ${pendingCreate ? 'Creating channel...' : '+ Create Channel'}
                </button>
            </div>
        `;
    }

    function _attachMobileDiscordListeners(container) {
        // Connect / Cancel / Disconnect
        container.querySelector('#ms-bot-connect')?.addEventListener('click', _handleMobileBotConnect);
        container.querySelector('#ms-bot-cancel')?.addEventListener('click', _handleMobileBotDisconnect);
        container.querySelector('#ms-bot-disconnect')?.addEventListener('click', _handleMobileBotDisconnect);

        // Player mapping expand/collapse
        container.querySelector('#ms-player-mapping-expand')?.addEventListener('click', () => {
            const c = container.querySelector('#ms-player-mapping-content');
            const chevron = container.querySelector('#ms-player-mapping-chevron');
            if (!c) return;
            const isHidden = c.style.display === 'none';
            c.style.display = isHidden ? 'block' : 'none';
            if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : '';
        });

        // Copy Discord ID buttons
        container.querySelectorAll('.ms-mapping-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(btn.dataset.discordId).then(() => {
                    if (typeof ToastService !== 'undefined') ToastService.showSuccess('Discord ID copied');
                });
            });
        });

        // Manage Players
        container.querySelector('#ms-manage-players-btn')?.addEventListener('click', () => {
            MobileBottomSheet.pop();
            MobileBottomSheet.close();
            if (typeof ManagePlayersModal !== 'undefined') ManagePlayersModal.show(_teamId);
        });

        // Notifications toggle
        container.querySelector('#ms-notif-toggle')?.addEventListener('click', _handleMobileNotificationsToggle);
        container.querySelector('#ms-notif-channel-select')?.addEventListener('change', _handleMobileNotificationChannelChange);

        // Schedule channel
        container.querySelector('#ms-schedule-channel-select')?.addEventListener('change', _handleMobileScheduleChannelChange);
        container.querySelector('#ms-create-schedule-channel')?.addEventListener('click', _handleMobileCreateChannel);
    }

    // ─── Discord Action Handlers ─────────────────────────────────────

    async function _handleMobileBotConnect() {
        const content = MobileBottomSheet.getPushedContentElement();
        const btn = content?.querySelector('#ms-bot-connect');
        if (!btn) return;

        btn.disabled = true;
        btn.textContent = 'Connecting...';

        try {
            await BotRegistrationService.connectBot(_teamId);
            if (typeof ToastService !== 'undefined') ToastService.showSuccess('Voice bot registration started!');
        } catch (error) {
            console.error('Error connecting voice bot:', error);
            let message = 'Failed to connect voice bot';
            if (error.message?.includes('Discord not linked')) {
                message = 'Link your Discord in profile settings first';
            } else if (error.message?.includes('already registered')) {
                message = 'Bot is already registered for this team';
            } else if (error.code === 'functions/failed-precondition') {
                message = error.message || message;
            }
            if (typeof ToastService !== 'undefined') ToastService.showError(message);
            btn.disabled = false;
            btn.textContent = 'Connect Bot';
        }
    }

    async function _handleMobileBotDisconnect() {
        const content = MobileBottomSheet.getPushedContentElement();
        const btn = content?.querySelector('#ms-bot-cancel') || content?.querySelector('#ms-bot-disconnect');
        if (!btn) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Disconnecting...';

        try {
            await BotRegistrationService.disconnectBot(_teamId);
            if (typeof ToastService !== 'undefined') ToastService.showSuccess('Voice bot disconnected');
        } catch (error) {
            console.error('Error disconnecting voice bot:', error);
            if (typeof ToastService !== 'undefined') ToastService.showError('Failed to disconnect voice bot');
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    async function _handleMobileNotificationsToggle() {
        const content = MobileBottomSheet.getPushedContentElement();
        const btn = content?.querySelector('#ms-notif-toggle');
        if (!btn) return;

        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        const channelSelect = content.querySelector('#ms-notif-channel-select');
        const channelId = channelSelect?.value || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const channelEntry = availableChannels.find(ch => ch.id === channelId);

        const newNotifications = {
            enabled: newEnabled,
            channelId: channelId || null,
            channelName: channelEntry?.name || null,
        };

        // Optimistic update
        _applySettingsToggleState(btn, newEnabled);
        if (channelSelect) channelSelect.disabled = !newEnabled;

        const prevNotifications = _botRegistration?.notifications;
        if (_botRegistration) _botRegistration.notifications = newNotifications;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { notifications: newNotifications });
            if (result.success) {
                ToastService.showSuccess(newEnabled ? 'Notifications enabled' : 'Notifications disabled');
            } else {
                if (_botRegistration) _botRegistration.notifications = prevNotifications;
                _rerenderMobileDiscordSection();
                ToastService.showError(result.error || 'Failed to update notifications');
            }
        } catch (error) {
            console.error('Error updating notification settings:', error);
            if (_botRegistration) _botRegistration.notifications = prevNotifications;
            _rerenderMobileDiscordSection();
            ToastService.showError('Network error - please try again');
        }
    }

    async function _handleMobileNotificationChannelChange() {
        const content = MobileBottomSheet.getPushedContentElement();
        const channelSelect = content?.querySelector('#ms-notif-channel-select');
        if (!channelSelect) return;

        const channelId = channelSelect.value || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const channelEntry = availableChannels.find(ch => ch.id === channelId);

        // Toggle permission warning
        const warning = content.querySelector('#ms-notif-channel-warning');
        if (warning) {
            const canPost = !channelEntry || channelEntry.canPost !== false;
            warning.style.display = canPost ? 'none' : 'block';
        }

        const isEnabled = _botRegistration?.notifications?.enabled !== false;
        const newNotifications = {
            enabled: isEnabled,
            channelId: channelId,
            channelName: channelEntry?.name || null,
        };

        const prevNotifications = _botRegistration?.notifications;
        if (_botRegistration) _botRegistration.notifications = newNotifications;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { notifications: newNotifications });
            if (!result.success) {
                if (_botRegistration) _botRegistration.notifications = prevNotifications;
                _rerenderMobileDiscordSection();
                ToastService.showError(result.error || 'Failed to update channel');
            } else {
                ToastService.showSuccess('Notification channel updated');
            }
        } catch (error) {
            console.error('Error updating notification channel:', error);
            if (_botRegistration) _botRegistration.notifications = prevNotifications;
            _rerenderMobileDiscordSection();
            ToastService.showError('Network error - please try again');
        }
    }

    async function _handleMobileScheduleChannelChange() {
        const content = MobileBottomSheet.getPushedContentElement();
        const channelSelect = content?.querySelector('#ms-schedule-channel-select');
        if (!channelSelect) return;

        const channelId = channelSelect.value || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const channelEntry = availableChannels.find(ch => ch.id === channelId);

        // Toggle permission warning
        const warning = content.querySelector('#ms-schedule-channel-warning');
        if (warning) {
            const canPost = !channelEntry || channelEntry.canPost !== false;
            warning.style.display = canPost ? 'none' : 'block';
        }

        const newScheduleChannel = {
            channelId: channelId,
            channelName: channelEntry?.name || null,
        };

        const prevScheduleChannel = _botRegistration?.scheduleChannel;
        if (_botRegistration) _botRegistration.scheduleChannel = newScheduleChannel;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { scheduleChannel: newScheduleChannel });
            if (!result.success) {
                if (_botRegistration) _botRegistration.scheduleChannel = prevScheduleChannel;
                _rerenderMobileDiscordSection();
                ToastService.showError(result.error || 'Failed to update schedule channel');
            } else {
                ToastService.showSuccess('Schedule channel updated');
            }
        } catch (error) {
            console.error('Error updating schedule channel:', error);
            if (_botRegistration) _botRegistration.scheduleChannel = prevScheduleChannel;
            _rerenderMobileDiscordSection();
            ToastService.showError('Network error - please try again');
        }
    }

    async function _handleMobileCreateChannel() {
        if (!_teamId) return;

        try {
            const result = await BotRegistrationService.createChannel(_teamId, 'schedule');
            if (result.success) {
                ToastService.showSuccess('Creating schedule channel...');
                _rerenderMobileDiscordSection();
            } else {
                ToastService.showError(result.error || 'Failed to request channel creation');
            }
        } catch (error) {
            const msg = error?.message || 'Network error';
            if (msg.includes('already-exists') || msg.includes('already pending')) {
                ToastService.showWarning('Channel creation already in progress');
            } else {
                console.error('Error creating schedule channel:', error);
                ToastService.showError('Failed to create channel');
            }
        }
    }

    // ─── Recordings Tab (Leader Only) ────────────────────────────────

    async function _initMobileRecordingsTab() {
        const content = MobileBottomSheet.getPushedContentElement();
        if (!content) return;
        const container = content.querySelector('#ms-tab-recordings');
        if (!container) return;

        container.innerHTML = '<p style="font-size: 0.8rem; color: var(--muted-foreground); padding: 1rem 0;">Loading recordings...</p>';

        // Ensure bot registration is loaded (user may go to Recordings before Discord)
        if (_botRegistration === undefined && typeof BotRegistrationService !== 'undefined') {
            try {
                _botRegistration = await BotRegistrationService.getRegistration(_teamId);
            } catch (err) {
                _botRegistration = null;
            }
        }

        try {
            const { collection, query, where, orderBy, getDocs } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js'
            );
            const q = query(
                collection(window.firebase.db, 'voiceRecordings'),
                where('teamId', '==', _teamId),
                orderBy('recordedAt', 'desc')
            );
            const snapshot = await getDocs(q);
            _recordings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            _renderMobileRecordingsList(container);
        } catch (err) {
            console.error('Failed to load recordings:', err);
            container.innerHTML = '<p style="font-size: 0.8rem; color: var(--destructive); padding: 1rem 0;">Failed to load recordings.</p>';
        }
    }

    function _mobileGroupIntoSeries(recordings) {
        const groups = {};
        for (const rec of recordings) {
            const key = rec.sessionId
                ? `${rec.sessionId}_${rec.opponentTag || 'unknown'}`
                : `legacy_${rec.id}`;
            if (!groups[key]) groups[key] = { key, maps: [] };
            groups[key].maps.push(rec);
        }
        for (const series of Object.values(groups)) {
            series.maps.sort((a, b) => (a.mapOrder ?? 0) - (b.mapOrder ?? 0));
        }
        return Object.values(groups).sort((a, b) => {
            const aTime = a.maps[0].recordedAt?.toMillis?.() || 0;
            const bTime = b.maps[0].recordedAt?.toMillis?.() || 0;
            return bTime - aTime;
        });
    }

    function _mobileGetSeriesScore(maps) {
        let teamWins = 0, opponentWins = 0;
        for (const map of maps) {
            if ((map.teamFrags || 0) > (map.opponentFrags || 0)) teamWins++;
            else if ((map.opponentFrags || 0) > (map.teamFrags || 0)) opponentWins++;
        }
        return { teamWins, opponentWins };
    }

    function _renderMobileRecordingsList(container) {
        if (!container) return;

        const settingsHtml = _renderMobileRecordingSettings();

        if (_recordings.length === 0) {
            container.innerHTML = `
                ${settingsHtml}
                <p style="font-size: 0.8rem; color: var(--muted-foreground); padding: 1rem 0;">
                    No voice recordings yet. Connect the Quad Bot in the Discord tab to start recording.
                </p>`;
            _attachMobileRecordingSettingsListeners(container);
            return;
        }

        const series = _mobileGroupIntoSeries(_recordings);
        const teamTag = _settingsTeamData?.teamTag || '';

        const cardsHtml = series.map(s => _renderMobileSeriesCard(s, teamTag)).join('');

        container.innerHTML = `
            ${settingsHtml}
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground);">Recordings</span>
                <span style="font-size: 0.7rem; color: var(--muted-foreground);">${_recordings.length} recording${_recordings.length !== 1 ? 's' : ''}</span>
            </div>
            <div id="ms-recordings-list" style="display: flex; flex-direction: column; gap: 0.35rem; max-height: 25rem; overflow-y: auto;">
                ${cardsHtml}
            </div>
            <div id="ms-download-progress" style="display: none; font-size: 0.75rem; color: var(--primary); margin-top: 0.35rem;"></div>
        `;

        _attachMobileRecordingSettingsListeners(container);
        _attachMobileRecordingsListeners(container);
        _loadMobileOpponentLogos(series, container);
    }

    function _renderMobileRecordingSettings() {
        if (!_botRegistration || _botRegistration.status !== 'active') return '';

        const defaultVisibility = _settingsTeamData?.voiceSettings?.defaultVisibility || 'private';
        const isPublic = defaultVisibility === 'public';

        const autoRecord = _botRegistration?.autoRecord;
        const arEnabled = autoRecord?.enabled || false;
        const minPlayers = autoRecord?.minPlayers || 3;
        const mode = autoRecord?.mode || 'all';

        const modeOptions = [
            { value: 'all', label: 'All sessions' },
            { value: 'official', label: 'Officials only' },
            { value: 'practice', label: 'Practice only' },
        ].map(opt =>
            `<option value="${opt.value}" ${opt.value === mode ? 'selected' : ''}>${opt.label}</option>`
        ).join('');

        return `
            <div style="margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <div>
                        <p style="font-size: 0.8rem; color: var(--foreground);">Public recordings</p>
                        <p class="ms-voice-vis-sublabel" style="font-size: 0.7rem; color: var(--muted-foreground);">
                            ${isPublic ? 'Visible to everyone' : 'Visible to team members only'}
                        </p>
                    </div>
                    <button class="ms-voice-vis-toggle" data-enabled="${isPublic}"
                        style="position: relative; width: 2.25rem; height: 1.25rem; border-radius: 9999px; border: none; cursor: pointer; flex-shrink: 0; ${isPublic ? 'background: var(--primary);' : 'background: rgba(150,150,150,0.3);'}">
                        <span style="position: absolute; top: 0.125rem; width: 1rem; height: 1rem; background: white; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: left 0.15s; left: ${isPublic ? '1.125rem' : '0.125rem'};"></span>
                    </button>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <span style="font-size: 0.8rem; color: var(--foreground);">Auto-Recording</span>
                    <button class="ms-auto-record-toggle" data-enabled="${arEnabled}"
                        style="position: relative; width: 2.25rem; height: 1.25rem; border-radius: 9999px; border: none; cursor: pointer; flex-shrink: 0; ${arEnabled ? 'background: var(--primary);' : 'background: rgba(150,150,150,0.3);'}">
                        <span style="position: absolute; top: 0.125rem; width: 1rem; height: 1rem; background: white; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: left 0.15s; left: ${arEnabled ? '1.125rem' : '0.125rem'};"></span>
                    </button>
                </div>
                <div style="${!arEnabled ? 'opacity: 0.5; pointer-events: none;' : ''}">
                    <p style="font-size: 0.7rem; color: var(--muted-foreground); margin-bottom: 0.25rem;">Start when</p>
                    <div style="display: flex; gap: 0.75rem; margin-bottom: 0.35rem;">
                        <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                            <input type="radio" name="ms-auto-record-min" value="3" class="ms-auto-record-min-radio" ${minPlayers === 3 ? 'checked' : ''}>
                            <span style="font-size: 0.8rem; color: var(--foreground);">3+ members</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                            <input type="radio" name="ms-auto-record-min" value="4" class="ms-auto-record-min-radio" ${minPlayers === 4 ? 'checked' : ''}>
                            <span style="font-size: 0.8rem; color: var(--foreground);">4+ members</span>
                        </label>
                    </div>
                    <select class="ms-auto-record-mode"
                        style="width: 100%; padding: 0.35rem 0.5rem; background: var(--muted); border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8rem; color: var(--foreground);">
                        ${modeOptions}
                    </select>
                </div>
            </div>
        `;
    }

    function _renderMobileSeriesCard(series, teamTag) {
        const firstMap = series.maps[0];
        const isLegacy = !firstMap.sessionId;
        const isExpanded = _expandedSeries.has(series.key);
        const opponentTag = firstMap.opponentTag || '';
        const date = firstMap.recordedAt?.toDate ? firstMap.recordedAt.toDate() : new Date(firstMap.recordedAt || 0);
        const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });

        if (isLegacy) {
            return _renderMobileLegacyCard(firstMap, teamTag, dateStr);
        }

        const { teamWins, opponentWins } = _mobileGetSeriesScore(series.maps);
        const allPublic = series.maps.every(m => m.visibility === 'public');

        const controlsHtml = `
            <div style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0;">
                <button class="ms-series-vis-toggle" data-series-key="${_esc(series.key)}"
                    style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: ${allPublic ? '#4ADE80' : 'var(--muted-foreground)'};"
                    title="${allPublic ? 'Set all to private' : 'Set all to public'}">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${allPublic
                            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
                            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>'}
                    </svg>
                </button>
                <button class="ms-series-download" data-series-key="${_esc(series.key)}"
                    style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--muted-foreground);" title="Download series">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                </button>
                <button class="ms-series-delete" data-series-key="${_esc(series.key)}"
                    style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--muted-foreground);" title="Delete series">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
                <button class="ms-series-expand" data-series-key="${_esc(series.key)}"
                    style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--muted-foreground);">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transition: transform 0.15s; ${isExpanded ? 'transform: rotate(180deg);' : ''}">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
            </div>
        `;

        const mapRowsHtml = isExpanded ? `
            <div style="border-top: 1px solid var(--border);">
                ${series.maps.map(map => _renderMobileMapRow(map)).join('')}
            </div>
        ` : '';

        return `
            <div class="ms-recording-series" data-series-key="${_esc(series.key)}"
                style="background: var(--surface); border-radius: 0.375rem; border: 1px solid var(--border);">
                <div class="ms-series-header" data-series-key="${_esc(series.key)}"
                    style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.5rem; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 0.3rem; min-width: 0; overflow: hidden;">
                        <span style="font-size: 0.7rem; color: var(--muted-foreground); flex-shrink: 0;">${_esc(dateStr)}</span>
                        <span class="ms-opponent-logo" data-opponent="${_esc(opponentTag)}"></span>
                        <span style="font-size: 0.8rem; font-weight: 500; color: var(--foreground);">${_esc(teamTag)}</span>
                        <span style="font-size: 0.7rem; color: var(--muted-foreground);">vs</span>
                        <span style="font-size: 0.8rem; font-weight: 500; color: var(--foreground);">${_esc(opponentTag)}</span>
                        <span style="font-size: 0.7rem; color: var(--muted-foreground);">(${teamWins}-${opponentWins})</span>
                    </div>
                    ${controlsHtml}
                </div>
                ${mapRowsHtml}
            </div>
        `;
    }

    function _renderMobileLegacyCard(rec, teamTag, dateStr) {
        const trackCount = rec.trackCount || rec.tracks?.length || 0;
        const isPublic = rec.visibility === 'public';

        return `
            <div class="ms-recording-series" data-series-key="legacy_${_esc(rec.id)}"
                style="background: var(--surface); border-radius: 0.375rem; border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.3rem; min-width: 0;">
                        <span style="font-size: 0.7rem; color: var(--muted-foreground);">${_esc(dateStr)}</span>
                        <span style="font-size: 0.8rem; font-weight: 500; color: var(--foreground);">${_esc(teamTag)}</span>
                        <span style="font-size: 0.8rem; font-family: monospace; color: var(--foreground);">${_esc(rec.mapName || '—')}</span>
                        <span style="font-size: 0.7rem; color: var(--muted-foreground);">${trackCount} tracks</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0;">
                        <button class="ms-rec-vis-toggle" data-sha="${_esc(rec.id)}" data-visibility="${rec.visibility}"
                            style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: ${isPublic ? '#4ADE80' : 'var(--muted-foreground)'};"
                            title="${isPublic ? 'Set to private' : 'Set to public'}">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                ${isPublic
                                    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
                                    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>'}
                            </svg>
                        </button>
                        <button class="ms-map-download" data-sha="${_esc(rec.id)}"
                            style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--muted-foreground);" title="Download">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>
                        </button>
                        <button class="ms-map-delete" data-sha="${_esc(rec.id)}"
                            style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--muted-foreground);" title="Delete">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function _renderMobileMapRow(map) {
        const trackCount = map.trackCount || map.tracks?.length || 0;
        const isPublic = map.visibility === 'public';
        const teamFrags = map.teamFrags || 0;
        const opponentFrags = map.opponentFrags || 0;

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(var(--border-rgb, 255,255,255), 0.1);">
                <div style="display: flex; align-items: center; gap: 0.4rem; min-width: 0;">
                    <span style="font-size: 0.8rem; font-family: monospace; font-weight: 500; color: var(--foreground); width: 5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${_esc(map.mapName || '—')}</span>
                    <span style="font-size: 0.7rem; color: var(--muted-foreground);">${trackCount} tracks</span>
                    ${teamFrags || opponentFrags ? `<span style="font-size: 0.7rem; color: var(--muted-foreground);">${teamFrags}-${opponentFrags}</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0;">
                    <button class="ms-rec-vis-toggle" data-sha="${_esc(map.id)}" data-visibility="${map.visibility}"
                        style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: ${isPublic ? '#4ADE80' : 'var(--muted-foreground)'};"
                        title="${isPublic ? 'Set to private' : 'Set to public'}">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${isPublic
                                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
                                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>'}
                        </svg>
                    </button>
                    <button class="ms-map-download" data-sha="${_esc(map.id)}"
                        style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--muted-foreground);" title="Download">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                    </button>
                    <button class="ms-map-delete" data-sha="${_esc(map.id)}"
                        style="padding: 0.2rem; background: none; border: none; cursor: pointer; color: var(--muted-foreground);" title="Delete">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    function _attachMobileRecordingSettingsListeners(container) {
        // Voice visibility toggle
        const visToggle = container.querySelector('.ms-voice-vis-toggle');
        if (visToggle) visToggle.addEventListener('click', () => _handleMobileVoiceVisibilityToggle(container));

        // Auto-record toggle
        const arToggle = container.querySelector('.ms-auto-record-toggle');
        if (arToggle) arToggle.addEventListener('click', () => _handleMobileAutoRecordToggle(container));

        // Auto-record min players
        container.querySelectorAll('.ms-auto-record-min-radio').forEach(radio => {
            radio.addEventListener('change', () => _handleMobileAutoRecordSettingChange(container));
        });

        // Auto-record mode
        const modeSelect = container.querySelector('.ms-auto-record-mode');
        if (modeSelect) modeSelect.addEventListener('change', () => _handleMobileAutoRecordSettingChange(container));
    }

    function _attachMobileRecordingsListeners(container) {
        const list = container.querySelector('#ms-recordings-list');
        if (!list) return;

        list.addEventListener('click', (e) => {
            // Expand/collapse series
            const expandBtn = e.target.closest('.ms-series-expand');
            const headerClick = e.target.closest('.ms-series-header');

            if (expandBtn || (headerClick && !e.target.closest('button:not(.ms-series-expand)'))) {
                const key = (expandBtn || headerClick).dataset.seriesKey;
                if (_expandedSeries.has(key)) {
                    _expandedSeries.delete(key);
                } else {
                    _expandedSeries.add(key);
                }
                _renderMobileRecordingsList(container);
                return;
            }

            // Per-map visibility toggle
            const visToggle = e.target.closest('.ms-rec-vis-toggle');
            if (visToggle) {
                e.stopPropagation();
                _handleMobileRecordingVisibilityToggle(visToggle, container);
                return;
            }

            // Series visibility toggle
            const seriesVisToggle = e.target.closest('.ms-series-vis-toggle');
            if (seriesVisToggle) {
                e.stopPropagation();
                _handleMobileSeriesVisibilityToggle(seriesVisToggle.dataset.seriesKey, container);
                return;
            }

            // Per-map download
            const mapDlBtn = e.target.closest('.ms-map-download');
            if (mapDlBtn) {
                e.stopPropagation();
                _handleMobileMapDownload(mapDlBtn.dataset.sha);
                return;
            }

            // Series download
            const seriesDlBtn = e.target.closest('.ms-series-download');
            if (seriesDlBtn) {
                e.stopPropagation();
                _handleMobileSeriesDownload(seriesDlBtn.dataset.seriesKey);
                return;
            }

            // Per-map delete
            const mapDelBtn = e.target.closest('.ms-map-delete');
            if (mapDelBtn) {
                e.stopPropagation();
                _handleMobileMapDelete(mapDelBtn.dataset.sha, container);
                return;
            }

            // Series delete
            const seriesDelBtn = e.target.closest('.ms-series-delete');
            if (seriesDelBtn) {
                e.stopPropagation();
                _handleMobileSeriesDelete(seriesDelBtn.dataset.seriesKey, container);
                return;
            }
        });

        // Download progress events
        window.addEventListener('download-progress', _handleMobileDownloadProgress);
    }

    // ─── Recordings Action Handlers ──────────────────────────────────

    async function _handleMobileRecordingVisibilityToggle(btn, container) {
        const demoSha256 = btn.dataset.sha;
        const currentVisibility = btn.dataset.visibility;
        const newVisibility = currentVisibility === 'public' ? 'private' : 'public';

        const rec = _recordings.find(r => r.id === demoSha256);
        if (rec) rec.visibility = newVisibility;
        _renderMobileRecordingsList(container);

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const fn = httpsCallable(window.firebase.functions, 'updateRecordingVisibility');
            const result = await fn({ demoSha256, visibility: newVisibility });
            if (!result.data.success) throw new Error('Failed');
        } catch (err) {
            console.error('Visibility toggle failed:', err);
            if (rec) rec.visibility = currentVisibility;
            _renderMobileRecordingsList(container);
            ToastService.showError('Failed to update visibility');
        }
    }

    async function _handleMobileSeriesVisibilityToggle(seriesKey, container) {
        const series = _mobileGroupIntoSeries(_recordings).find(s => s.key === seriesKey);
        if (!series) return;

        const allPublic = series.maps.every(m => m.visibility === 'public');
        const newVisibility = allPublic ? 'private' : 'public';

        series.maps.forEach(m => {
            const rec = _recordings.find(r => r.id === m.id);
            if (rec) rec.visibility = newVisibility;
        });
        _renderMobileRecordingsList(container);

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const fn = httpsCallable(window.firebase.functions, 'updateRecordingVisibility');
            for (const map of series.maps) {
                const result = await fn({ demoSha256: map.id, visibility: newVisibility });
                if (!result.data.success) throw new Error('Failed for ' + map.id);
            }
            ToastService.showSuccess(`All maps set to ${newVisibility}`);
        } catch (err) {
            console.error('Series visibility toggle failed:', err);
            ToastService.showError('Some visibility updates failed');
            _recordingsInitialized = false;
            _initMobileRecordingsTab();
        }
    }

    async function _handleMobileMapDownload(demoSha256) {
        const rec = _recordings.find(r => r.id === demoSha256);
        if (!rec) return;

        try {
            await RecordingDownloadService.downloadMap(rec, _settingsTeamData?.teamName || '');
        } catch (err) {
            console.error('Download failed:', err);
            ToastService.showError('Download failed: ' + err.message);
        }
    }

    async function _handleMobileSeriesDownload(seriesKey) {
        const series = _mobileGroupIntoSeries(_recordings).find(s => s.key === seriesKey);
        if (!series) return;

        try {
            await RecordingDownloadService.downloadSeries(series.maps, _settingsTeamData?.teamName || '');
        } catch (err) {
            console.error('Series download failed:', err);
            ToastService.showError('Download failed: ' + err.message);
        }
    }

    async function _handleMobileMapDelete(demoSha256, container) {
        const rec = _recordings.find(r => r.id === demoSha256);
        if (!rec) return;

        const date = rec.recordedAt?.toDate ? rec.recordedAt.toDate() : new Date(rec.recordedAt || 0);
        const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
        const trackCount = rec.trackCount || rec.tracks?.length || 0;

        // Close the sheet before showing confirm modal
        MobileBottomSheet.pop();
        MobileBottomSheet.close();

        const confirmed = await showConfirmModal({
            title: 'Delete recording?',
            message: `<strong>${_esc(rec.mapName || 'Unknown map')}</strong> — ${dateStr}<br>${trackCount} audio track${trackCount !== 1 ? 's' : ''} will be permanently deleted.<br><br>This cannot be undone.`,
            confirmText: 'Delete',
            confirmClass: 'bg-destructive hover:bg-destructive/90',
            cancelText: 'Cancel'
        });

        if (!confirmed) return;

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const fn = httpsCallable(window.firebase.functions, 'deleteRecording');
            const result = await fn({ demoSha256 });
            if (result.data.success) {
                _recordings = _recordings.filter(r => r.id !== demoSha256);
                ToastService.showSuccess('Recording deleted');
            }
        } catch (err) {
            console.error('Delete failed:', err);
            ToastService.showError('Failed to delete recording');
        }
    }

    async function _handleMobileSeriesDelete(seriesKey, container) {
        const series = _mobileGroupIntoSeries(_recordings).find(s => s.key === seriesKey);
        if (!series) return;

        const firstMap = series.maps[0];
        const date = firstMap.recordedAt?.toDate ? firstMap.recordedAt.toDate() : new Date(firstMap.recordedAt || 0);
        const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
        const teamTag = _settingsTeamData?.teamTag || '';
        const opponentTag = firstMap.opponentTag || '';

        // Close the sheet before showing confirm modal
        MobileBottomSheet.pop();
        MobileBottomSheet.close();

        const confirmed = await showConfirmModal({
            title: 'Delete all recordings in this series?',
            message: `<strong>${_esc(teamTag)} vs ${_esc(opponentTag)}</strong> — ${dateStr}<br>${series.maps.length} map${series.maps.length !== 1 ? 's' : ''} will be permanently deleted.<br><br>This cannot be undone.`,
            confirmText: 'Delete All',
            confirmClass: 'bg-destructive hover:bg-destructive/90',
            cancelText: 'Cancel'
        });

        if (!confirmed) return;

        try {
            const { httpsCallable } = await import(
                'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js'
            );
            const fn = httpsCallable(window.firebase.functions, 'deleteRecording');
            const idsToDelete = series.maps.map(m => m.id);

            for (let i = 0; i < idsToDelete.length; i++) {
                const result = await fn({ demoSha256: idsToDelete[i] });
                if (!result.data.success) throw new Error('Failed for ' + idsToDelete[i]);
            }

            _recordings = _recordings.filter(r => !idsToDelete.includes(r.id));
            _expandedSeries.delete(seriesKey);
            ToastService.showSuccess('Series deleted');
        } catch (err) {
            console.error('Series delete failed:', err);
            ToastService.showError('Some deletions failed');
        }
    }

    function _handleMobileDownloadProgress(e) {
        const content = MobileBottomSheet.getPushedContentElement();
        if (!content) return;
        const el = content.querySelector('#ms-download-progress');
        if (!el) return;
        const msg = e.detail?.message;
        if (msg) {
            el.textContent = msg;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
            el.textContent = '';
        }
    }

    async function _handleMobileVoiceVisibilityToggle(container) {
        const btn = container.querySelector('.ms-voice-vis-toggle');
        if (!btn) return;

        const currentlyPublic = btn.dataset.enabled === 'true';
        const newVisibility = currentlyPublic ? 'private' : 'public';

        _applySettingsToggleState(btn, !currentlyPublic);
        const sublabel = container.querySelector('.ms-voice-vis-sublabel');
        if (sublabel) sublabel.textContent = !currentlyPublic ? 'Visible to everyone' : 'Visible to team members only';

        try {
            const result = await TeamService.callFunction('updateTeamSettings', {
                teamId: _teamId,
                voiceSettings: { defaultVisibility: newVisibility }
            });
            if (result.success) {
                if (_settingsTeamData) {
                    if (!_settingsTeamData.voiceSettings) _settingsTeamData.voiceSettings = {};
                    _settingsTeamData.voiceSettings.defaultVisibility = newVisibility;
                }
                ToastService.showSuccess(newVisibility === 'public' ? 'Recordings now public' : 'Recordings now private');
            } else {
                _applySettingsToggleState(btn, currentlyPublic);
                if (sublabel) sublabel.textContent = currentlyPublic ? 'Visible to everyone' : 'Visible to team members only';
                ToastService.showError(result.error || 'Failed');
            }
        } catch (err) {
            console.error('Error updating voice visibility:', err);
            _applySettingsToggleState(btn, currentlyPublic);
            if (sublabel) sublabel.textContent = currentlyPublic ? 'Visible to everyone' : 'Visible to team members only';
            ToastService.showError('Network error');
        }
    }

    async function _handleMobileAutoRecordToggle(container) {
        const btn = container.querySelector('.ms-auto-record-toggle');
        if (!btn) return;

        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        const minRadio = container.querySelector('.ms-auto-record-min-radio:checked');
        const modeSelect = container.querySelector('.ms-auto-record-mode');
        const minPlayers = minRadio ? parseInt(minRadio.value, 10) : (_botRegistration?.autoRecord?.minPlayers || 3);
        const mode = modeSelect?.value || _botRegistration?.autoRecord?.mode || 'all';

        const newAutoRecord = { enabled: newEnabled, minPlayers, mode };

        _applySettingsToggleState(btn, newEnabled);

        const prevAutoRecord = _botRegistration?.autoRecord;
        if (_botRegistration) _botRegistration.autoRecord = newAutoRecord;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { autoRecord: newAutoRecord });
            if (result.success) {
                // Re-render to update the disabled state of the settings
                const tabContainer = container.querySelector('#ms-tab-recordings') || container;
                _renderMobileRecordingsList(tabContainer);
                ToastService.showSuccess(newEnabled ? 'Auto-recording enabled' : 'Auto-recording disabled');
            } else {
                if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
                _applySettingsToggleState(btn, currentlyEnabled);
                ToastService.showError(result.error || 'Failed');
            }
        } catch (err) {
            console.error('Error toggling auto-record:', err);
            if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
            _applySettingsToggleState(btn, currentlyEnabled);
            ToastService.showError('Network error');
        }
    }

    async function _handleMobileAutoRecordSettingChange(container) {
        const arToggle = container.querySelector('.ms-auto-record-toggle');
        if (!arToggle || arToggle.dataset.enabled !== 'true') return;

        const minRadio = container.querySelector('.ms-auto-record-min-radio:checked');
        const modeSelect = container.querySelector('.ms-auto-record-mode');
        const minPlayers = minRadio ? parseInt(minRadio.value, 10) : 3;
        const mode = modeSelect?.value || 'all';
        const enabled = true;

        const newAutoRecord = { enabled, minPlayers, mode };
        const prevAutoRecord = _botRegistration?.autoRecord;
        if (_botRegistration) _botRegistration.autoRecord = newAutoRecord;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { autoRecord: newAutoRecord });
            if (!result.success) {
                if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
                ToastService.showError(result.error || 'Failed to update');
            }
        } catch (err) {
            console.error('Error updating auto-record settings:', err);
            if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
            ToastService.showError('Network error');
        }
    }

    async function _loadMobileOpponentLogos(seriesList, container) {
        const tags = new Set();
        for (const s of seriesList) {
            const tag = s.maps[0].opponentTag;
            if (tag && tag !== 'unknown') tags.add(tag);
        }

        for (const tag of tags) {
            const info = await _getMobileOpponentLogo(tag);
            if (info?.logoUrl) {
                container.querySelectorAll(`.ms-opponent-logo[data-opponent="${tag}"]`).forEach(el => {
                    el.innerHTML = `<img src="${info.logoUrl}" style="width: 1.1rem; height: 1.1rem; border-radius: 0.15rem; object-fit: cover; vertical-align: middle;" alt="">`;
                });
            }
        }
    }

    async function _getMobileOpponentLogo(opponentTag) {
        if (!opponentTag || opponentTag === 'unknown') return null;
        const key = opponentTag.toLowerCase();
        if (key in _opponentLogoCache) return _opponentLogoCache[key];

        const allTeams = typeof TeamService !== 'undefined' ? TeamService.getAllTeams() : [];
        for (const team of allTeams) {
            const tags = (team.teamTags && Array.isArray(team.teamTags) && team.teamTags.length > 0)
                ? team.teamTags.map(t => t.tag.toLowerCase())
                : (team.teamTag ? [team.teamTag.toLowerCase()] : []);
            if (tags.includes(key)) {
                _opponentLogoCache[key] = {
                    logoUrl: team.activeLogo?.urls?.small || null,
                    teamName: team.teamName
                };
                return _opponentLogoCache[key];
            }
        }
        _opponentLogoCache[key] = null;
        return null;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────

    function _cleanupSettings() {
        if (_botRegUnsubscribe) {
            _botRegUnsubscribe();
            _botRegUnsubscribe = null;
        }
        window.removeEventListener('download-progress', _handleMobileDownloadProgress);
        _settingsTeamData = null;
        _activeTab = 'settings';
        _botRegistration = undefined;
        _discordInitialized = false;
        _recordingsInitialized = false;
        _recordings = [];
        _expandedSeries = new Set();
        _opponentLogoCache = {};
        _teamId = null;
        _isLeader = false;
    }

    // ─── Close ───────────────────────────────────────────────────────

    function _onClose() {
        _selectedUserId = null;
        _settingsTeamData = null;
        const nav = document.getElementById('mobile-nav');
        if (nav) {
            nav.querySelectorAll('.mobile-nav-tab').forEach(t => t.classList.remove('active'));
            const homeTab = nav.querySelector('[data-tab="home"]');
            if (homeTab) homeTab.classList.add('active');
        }
        MobileApp.switchTab('home');
    }

    return { open };
})();
