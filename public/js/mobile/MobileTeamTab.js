// MobileTeamTab.js - Team info view opened from bottom nav Team tab
// Two-column layout: roster left, color picker right (always reserves space).
// Tapping a name reveals the picker for that player — no layout shift.
// Gear icon opens team settings in Layer 2 bottom sheet.

const MobileTeamTab = (function() {
    'use strict';

    let _selectedUserId = null;
    let _settingsTeamData = null;
    let _settingsTagsLoading = false;

    /** Escape HTML to prevent XSS */
    function _esc(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function open() {
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
                </div>
            `, _onClose);
            return;
        }

        MobileBottomSheet.open(_buildHtml(team), _onClose);
        _attachListeners();
    }

    function _buildHtml(team) {
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
            </div>
        `;
    }

    function _attachListeners() {
        const list = document.getElementById('mobile-roster-list');
        if (!list) return;

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

        const teamId = MobileApp.getSelectedTeamId();
        const isLeader = team.playerRoster.some(
            p => p.userId === user.uid && p.role === 'leader'
        );

        const html = _buildSettingsHtml(_settingsTeamData, isLeader, user.uid);
        MobileBottomSheet.push(html, () => {
            _settingsTeamData = null;
            // Close the whole team sheet when settings is dismissed
            MobileBottomSheet.close();
        });
        _attachSettingsListeners(teamId, _settingsTeamData, isLeader, user.uid);
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
