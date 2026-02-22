// TeamManagementModal.js - Modal for team settings and management actions
// Following CLAUDE.md architecture: Revealing Module Pattern
// Slice 6.0a - Replaces TeamManagementDrawer with a cleaner modal UI

const TeamManagementModal = (function() {
    'use strict';

    // Private variables
    let _teamId = null;
    let _teamData = null;
    let _isLeader = false;
    let _isScheduler = false;
    let _currentUserId = null;
    let _keydownHandler = null;
    let _botRegUnsubscribe = null;
    let _botRegistration = undefined; // undefined = not loaded, null = no doc
    let _voiceBotInitialized = false;
    let _recordingsInitialized = false;
    let _recordings = [];

    /**
     * Escape HTML to prevent XSS
     */
    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show the team management modal
     * @param {string} teamId - The team ID
     */
    function show(teamId) {
        _teamId = teamId;
        _teamData = TeamService.getTeamFromCache(teamId);
        _currentUserId = window.firebase?.auth?.currentUser?.uid;

        if (!_teamData) {
            ToastService.showError('Team data not found');
            return;
        }

        if (!_currentUserId) {
            ToastService.showError('Not authenticated');
            return;
        }

        // Determine if current user is leader or scheduler
        _isLeader = _teamData.playerRoster.some(
            p => p.userId === _currentUserId && p.role === 'leader'
        );
        _isScheduler = (_teamData.schedulers || []).includes(_currentUserId);

        _botRegistration = undefined; // Reset for fresh load
        _voiceBotInitialized = false;
        _recordingsInitialized = false;
        _renderModal();
        _attachListeners();
    }

    /**
     * Render the modal HTML
     */
    function _renderModal() {
        const modalHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="team-management-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md overflow-hidden"
                     role="dialog" aria-modal="true" aria-labelledby="team-management-title">
                    <!-- Header: tab bar with close button -->
                    <div class="flex items-center border-b border-border">
                        <div class="flex flex-1">
                            <button class="tab-btn active" data-tab="settings">Settings</button>
                            ${(_isLeader || _isScheduler) ? `<button class="tab-btn" data-tab="discord">Discord</button>` : ''}
                            <button class="tab-btn" data-tab="recordings">Recordings</button>
                        </div>
                        <button id="team-management-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-3 ml-auto"
                                aria-label="Close">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">

                        <div id="tab-content-settings" class="space-y-5">
                            ${_renderLogoAndDetailsSection()}
                            ${_isLeader ? _renderSchedulerSection() : ''}
                            ${_isLeader ? _renderPrivacySection() : ''}
                            <hr class="border-border">
                            ${_isLeader ? _renderLeaderActions() : ''}
                            ${_renderLeaveTeamSection()}
                        </div>

                        ${(_isLeader || _isScheduler) ? `
                        <div id="tab-content-discord" class="hidden">
                            ${_renderVoiceBotSection()}
                        </div>
                        ` : ''}

                        <div id="tab-content-recordings" class="hidden">
                            <p class="text-sm text-muted-foreground">Loading recordings...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = modalHTML;
        modalContainer.classList.remove('hidden');
    }

    /**
     * Render logo (left) alongside team details (right): Tag, Max, Join Code
     * Works for both leader (editable) and member (readonly) views
     */
    function _renderLogoAndDetailsSection() {
        const logoUrl = _teamData.activeLogo?.urls?.medium;

        // Logo column
        const logoHtml = logoUrl
            ? `<img src="${logoUrl}" alt="${_escapeHtml(_teamData.teamName)} logo"
                    class="w-24 h-24 rounded-lg object-cover border border-border">`
            : `<div class="w-24 h-24 bg-muted border border-border rounded-lg flex items-center justify-center">
                    <span class="text-xl font-bold text-muted-foreground">${_escapeHtml(_teamData.teamTag)}</span>
               </div>`;

        const logoButtonText = logoUrl ? 'Change Logo' : 'Add Logo';
        const logoButton = _isLeader ? `
            <button id="manage-logo-btn"
                    class="px-2 py-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-lg transition-colors">
                ${logoButtonText}
            </button>
        ` : '';

        // Details column (right side) — Tag, Max, Join Code
        const maxPlayersOptions = Array.from({ length: 17 }, (_, i) => i + 4)
            .map(num => `<option value="${num}" ${num === _teamData.maxPlayers ? 'selected' : ''}>${num}</option>`)
            .join('');

        const tagRow = _isLeader ? _renderTagChips() : `
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12">Tag</label>
                <div class="px-2 py-1 bg-muted border border-border rounded-lg text-sm font-mono text-foreground">
                    ${_escapeHtml(_teamData.teamTag)}
                </div>
            </div>
        `;

        const maxRow = _isLeader ? `
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12">Max</label>
                <select id="max-players-select"
                        class="w-14 px-1 py-1 bg-muted border border-border rounded-lg text-sm text-foreground">
                    ${maxPlayersOptions}
                </select>
            </div>
        ` : `
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12">Max</label>
                <div class="px-2 py-1 bg-muted border border-border rounded-lg text-sm text-foreground">
                    ${_teamData.maxPlayers}
                </div>
            </div>
        `;

        const currentDivisions = _teamData.divisions || [];
        const divisionRow = _isLeader ? `
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12">Div</label>
                <div class="flex gap-1" id="division-pills">
                    ${['D1', 'D2', 'D3'].map(div => {
                        const isActive = currentDivisions.includes(div);
                        return `<button type="button"
                            class="division-pill-btn px-2 py-1 text-xs font-medium rounded-lg transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
                            data-division="${div}"
                            data-active="${isActive}"
                        >${div}</button>`;
                    }).join('')}
                </div>
                <span id="division-feedback" class="text-xs"></span>
            </div>
        ` : `
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12">Div</label>
                <div class="px-2 py-1 bg-muted border border-border rounded-lg text-sm text-foreground">
                    ${(currentDivisions).join(', ') || 'None'}
                </div>
            </div>
        `;

        const regenerateButton = _isLeader ? `
            <button id="regenerate-join-code-btn"
                    class="p-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
                    title="Regenerate join code">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
            </button>
        ` : '';

        const joinCodeRow = `
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12">Code</label>
                <input type="text" value="${_escapeHtml(_teamData.joinCode)}" readonly
                       class="w-20 px-2 py-1 bg-muted border border-border rounded-lg text-sm font-mono text-foreground text-center"
                       id="join-code-input"/>
                <button id="copy-join-code-btn"
                        class="p-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
                        title="Copy join code">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                </button>
                ${regenerateButton}
            </div>
        `;

        return `
            <div class="flex gap-4">
                <div class="flex flex-col items-center gap-1.5 shrink-0">
                    ${logoHtml}
                    ${logoButton}
                </div>
                <div class="flex-1 min-w-0 space-y-2">
                    ${tagRow}
                    ${maxRow}
                    ${divisionRow}
                    ${joinCodeRow}
                </div>
            </div>
        `;
    }

    /**
     * Render tag chips row with add/remove/primary for leaders (Slice 5.3)
     */
    function _renderTagChips() {
        const tags = _teamData.teamTags && Array.isArray(_teamData.teamTags) && _teamData.teamTags.length > 0
            ? _teamData.teamTags
            : [{ tag: _teamData.teamTag, isPrimary: true }];

        const chips = tags.map((entry, i) => {
            const isPrimary = !!entry.isPrimary;
            const starClass = isPrimary
                ? 'text-amber-400'
                : 'text-muted-foreground/40 hover:text-amber-400/70 cursor-pointer';
            const starTitle = isPrimary ? 'Primary tag' : 'Set as primary';
            const canRemove = tags.length > 1;

            return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-muted border border-border rounded text-sm font-mono text-foreground">
                <button type="button" class="tag-star-btn ${starClass}" data-tag-index="${i}" title="${starTitle}">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                </button>
                ${_escapeHtml(entry.tag)}
                ${canRemove ? `<button type="button" class="tag-remove-btn text-muted-foreground/50 hover:text-destructive ml-0.5" data-tag-index="${i}" title="Remove">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>` : ''}
            </span>`;
        }).join('');

        return `
            <div class="flex items-start gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12 mt-1">Tag</label>
                <div class="flex-1 min-w-0">
                    <div id="tag-chips-container" class="flex flex-wrap gap-1 items-center">
                        ${chips}
                        <span class="inline-flex items-center gap-0.5">
                            <input type="text" id="add-tag-input" maxlength="4" placeholder="+"
                                   class="w-10 px-1 py-0.5 bg-muted border border-border/50 rounded text-sm font-mono text-foreground text-center placeholder:text-muted-foreground/40 focus:border-primary focus:w-14 transition-all"/>
                        </span>
                    </div>
                    <span id="tag-chips-feedback" class="text-xs mt-0.5 block"></span>
                </div>
            </div>
        `;
    }

    /**
     * Render collapsible scheduling permissions section (leader only)
     */
    function _renderSchedulerSection() {
        const members = _teamData.playerRoster.filter(p => p.userId !== _teamData.leaderId);

        if (members.length === 0) {
            return '';
        }

        const schedulers = _teamData.schedulers || [];

        const memberRows = members.map(p => {
            const isScheduler = schedulers.includes(p.userId);
            return `
                <div class="flex items-center justify-between py-1">
                    <span class="text-sm text-foreground truncate mr-2">${_escapeHtml(p.displayName)}</span>
                    <button
                        class="scheduler-toggle relative w-9 h-5 rounded-full transition-colors shrink-0 ${isScheduler ? 'bg-primary' : 'bg-muted-foreground/30'}"
                        data-user-id="${p.userId}"
                        data-enabled="${isScheduler}"
                        title="${isScheduler ? 'Remove scheduling rights' : 'Grant scheduling rights'}"
                    >
                        <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all" style="left: ${isScheduler ? '1.125rem' : '0.125rem'}"></span>
                    </button>
                </div>
            `;
        }).join('');

        const schedulerCount = schedulers.length;
        const countBadge = schedulerCount > 0
            ? `<span class="text-xs text-primary">${schedulerCount} active</span>`
            : '';

        return `
            <div>
                <button id="scheduler-expand-btn"
                        class="flex items-center justify-between w-full py-1 group"
                        type="button">
                    <div class="flex items-center gap-2">
                        <svg id="scheduler-chevron" class="w-4 h-4 text-muted-foreground transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                        <label class="text-sm font-medium text-foreground cursor-pointer">Scheduling Permissions</label>
                        ${countBadge}
                    </div>
                    <span class="text-xs text-muted-foreground group-hover:text-foreground">${members.length} members</span>
                </button>
                <div id="scheduler-content" class="hidden mt-1">
                    <p class="text-xs text-muted-foreground mb-1 ml-6">Allow members to propose/confirm matches</p>
                    <div class="space-y-0.5 ml-6" id="scheduler-toggles">
                        ${memberRows}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Handle scheduler section expand/collapse
     */
    function _handleSchedulerExpand() {
        const content = document.getElementById('scheduler-content');
        const chevron = document.getElementById('scheduler-chevron');
        if (!content || !chevron) return;

        const isHidden = content.classList.contains('hidden');
        content.classList.toggle('hidden');
        chevron.style.transform = isHidden ? 'rotate(90deg)' : '';
    }

    /**
     * Handle scheduler toggle click
     */
    async function _handleSchedulerToggle(event) {
        const btn = event.target.closest('.scheduler-toggle');
        if (!btn) return;

        const targetUserId = btn.dataset.userId;
        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        // Optimistic update helper
        function _applyToggleState(button, enabled) {
            button.dataset.enabled = String(enabled);
            button.classList.toggle('bg-primary', enabled);
            button.classList.toggle('bg-muted-foreground/30', !enabled);
            const knob = button.querySelector('span');
            if (knob) {
                knob.style.left = enabled ? '1.125rem' : '0.125rem';
            }
        }

        _applyToggleState(btn, newEnabled);

        try {
            console.log('🔧 toggleScheduler calling:', { teamId: _teamId, targetUserId, enabled: newEnabled });
            const result = await TeamService.callFunction('toggleScheduler', {
                teamId: _teamId,
                targetUserId,
                enabled: newEnabled
            });
            console.log('🔧 toggleScheduler result:', result);

            if (result.success) {
                ToastService.showSuccess(`Scheduling ${newEnabled ? 'enabled' : 'disabled'}`);
            } else {
                _applyToggleState(btn, currentlyEnabled);
                ToastService.showError(result.error || 'Failed to update scheduler');
            }
        } catch (error) {
            console.error('❌ Error toggling scheduler:', error);
            _applyToggleState(btn, currentlyEnabled);
            ToastService.showError('Network error - please try again');
        }
    }

    /**
     * Render privacy settings section (leader only)
     * Two toggles: hide roster names, hide from comparison
     */
    function _renderPrivacySection() {
        const hideRosterNames = _teamData.hideRosterNames || false;
        const hideFromComparison = _teamData.hideFromComparison || false;

        return `
            <div>
                <label class="text-sm font-medium text-foreground">Privacy</label>
                <p class="text-xs text-muted-foreground mb-2">Control how your team appears to others</p>
                <div class="space-y-2" id="privacy-toggles">
                    <div class="flex items-center justify-between py-1">
                        <div class="min-w-0 mr-3">
                            <span class="text-sm text-foreground">Hide roster names</span>
                            <p class="text-xs text-muted-foreground">Others see player counts, not names</p>
                        </div>
                        <button
                            class="privacy-toggle relative w-9 h-5 rounded-full transition-colors shrink-0 ${hideRosterNames ? 'bg-primary' : 'bg-muted-foreground/30'}"
                            data-setting="hideRosterNames"
                            data-enabled="${hideRosterNames}"
                        >
                            <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all" style="left: ${hideRosterNames ? '1.125rem' : '0.125rem'}"></span>
                        </button>
                    </div>
                    <div class="flex items-center justify-between py-1">
                        <div class="min-w-0 mr-3">
                            <span class="text-sm text-foreground">Hide from comparison</span>
                            <p class="text-xs text-muted-foreground">Team invisible in comparison mode</p>
                        </div>
                        <button
                            class="privacy-toggle relative w-9 h-5 rounded-full transition-colors shrink-0 ${hideFromComparison ? 'bg-primary' : 'bg-muted-foreground/30'}"
                            data-setting="hideFromComparison"
                            data-enabled="${hideFromComparison}"
                        >
                            <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all" style="left: ${hideFromComparison ? '1.125rem' : '0.125rem'}"></span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Handle privacy toggle click
     */
    async function _handlePrivacyToggle(event) {
        const btn = event.target.closest('.privacy-toggle');
        if (!btn) return;

        const setting = btn.dataset.setting;
        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        // Optimistic update
        function _applyToggleState(button, enabled) {
            button.dataset.enabled = String(enabled);
            button.classList.toggle('bg-primary', enabled);
            button.classList.toggle('bg-muted-foreground/30', !enabled);
            const knob = button.querySelector('span');
            if (knob) {
                knob.style.left = enabled ? '1.125rem' : '0.125rem';
            }
        }

        _applyToggleState(btn, newEnabled);

        try {
            const result = await TeamService.callFunction('updateTeamSettings', {
                teamId: _teamId,
                [setting]: newEnabled
            });

            if (result.success) {
                _teamData[setting] = newEnabled;
                ToastService.showSuccess(
                    setting === 'hideRosterNames'
                        ? `Roster names ${newEnabled ? 'hidden' : 'visible'} to others`
                        : `Team ${newEnabled ? 'hidden from' : 'visible in'} comparison`
                );
            } else {
                _applyToggleState(btn, currentlyEnabled);
                ToastService.showError(result.error || 'Failed to update privacy setting');
            }
        } catch (error) {
            console.error('Error toggling privacy:', error);
            _applyToggleState(btn, currentlyEnabled);
            ToastService.showError('Network error - please try again');
        }
    }

    // ─── Voice Visibility Toggle (Slice P4) ──────────────────────────────

    async function _handleVisibilityToggle() {
        const btn = document.querySelector('.voice-visibility-toggle');
        if (!btn) return;

        const currentlyPublic = btn.dataset.enabled === 'true';
        const newIsPublic = !currentlyPublic;
        const newVisibility = newIsPublic ? 'public' : 'private';

        // Optimistic UI update
        _applyVisibilityToggleState(btn, newIsPublic);

        try {
            const result = await TeamService.callFunction('updateTeamSettings', {
                teamId: _teamId,
                voiceSettings: { defaultVisibility: newVisibility }
            });

            if (result.success) {
                // Update cached team data
                if (!_teamData.voiceSettings) _teamData.voiceSettings = {};
                _teamData.voiceSettings.defaultVisibility = newVisibility;
                ToastService.showSuccess(
                    newIsPublic
                        ? 'New recordings will be public'
                        : 'New recordings will be team-only'
                );
            } else {
                _applyVisibilityToggleState(btn, currentlyPublic);
                ToastService.showError(result.error || 'Failed to update visibility');
            }
        } catch (error) {
            console.error('Error toggling visibility:', error);
            _applyVisibilityToggleState(btn, currentlyPublic);
            ToastService.showError('Network error - please try again');
        }
    }

    function _applyVisibilityToggleState(button, isPublic) {
        button.dataset.enabled = String(isPublic);
        button.classList.toggle('bg-primary', isPublic);
        button.classList.toggle('bg-muted-foreground/30', !isPublic);
        const knob = button.querySelector('span');
        if (knob) {
            knob.style.left = isPublic ? '1.125rem' : '0.125rem';
        }
        const sublabel = document.querySelector('.voice-visibility-sublabel');
        if (sublabel) {
            sublabel.textContent = isPublic
                ? 'New recordings visible to everyone'
                : 'New recordings visible to team members only';
        }
    }

    // ─── Tag Chip Handlers (Slice 5.3) ───────────────────────────────────

    let _tagsLoading = false;

    function _getTeamTags() {
        if (_teamData.teamTags && Array.isArray(_teamData.teamTags) && _teamData.teamTags.length > 0) {
            return _teamData.teamTags;
        }
        return [{ tag: _teamData.teamTag, isPrimary: true }];
    }

    function _showTagFeedback(msg, isError) {
        const fb = document.getElementById('tag-chips-feedback');
        if (!fb) return;
        fb.textContent = msg;
        fb.className = `text-xs mt-0.5 block ${isError ? 'text-destructive' : 'text-green-500'}`;
        if (!isError) setTimeout(() => { fb.textContent = ''; }, 2000);
    }

    async function _saveTeamTags(newTags) {
        if (_tagsLoading) return;
        _tagsLoading = true;
        _setTagChipsDisabled(true);
        try {
            const result = await TeamService.callFunction('updateTeamTags', {
                teamId: _teamId,
                teamTags: newTags
            });
            if (result.success) {
                _teamData.teamTags = newTags;
                _teamData.teamTag = newTags.find(t => t.isPrimary).tag;
                _rerenderTagChips();
                _showTagFeedback('Saved!', false);
            } else {
                _showTagFeedback(result.error || 'Failed to save', true);
            }
        } catch (err) {
            console.error('Error saving team tags:', err);
            _showTagFeedback('Network error — try again', true);
        } finally {
            _tagsLoading = false;
            _setTagChipsDisabled(false);
        }
    }

    function _setTagChipsDisabled(disabled) {
        const container = document.getElementById('tag-chips-container');
        if (!container) return;
        container.querySelectorAll('button').forEach(btn => btn.disabled = disabled);
        const input = document.getElementById('add-tag-input');
        if (input) input.disabled = disabled;
        container.style.opacity = disabled ? '0.5' : '1';
    }

    function _rerenderTagChips() {
        const container = document.getElementById('tag-chips-container');
        if (!container) return;
        // Re-render just the tag chips section
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = _renderTagChips();
        const newContainer = tempDiv.querySelector('#tag-chips-container');
        const feedback = tempDiv.querySelector('#tag-chips-feedback');
        if (newContainer) container.replaceWith(newContainer);
        // Re-attach event listeners
        const nc = document.getElementById('tag-chips-container');
        nc?.addEventListener('click', _handleTagChipClick);
        const addInput = document.getElementById('add-tag-input');
        addInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); _handleAddTag(); }
        });
    }

    function _handleTagChipClick(e) {
        const starBtn = e.target.closest('.tag-star-btn');
        const removeBtn = e.target.closest('.tag-remove-btn');

        if (starBtn) {
            const index = parseInt(starBtn.dataset.tagIndex);
            _handleSetPrimary(index);
        } else if (removeBtn) {
            const index = parseInt(removeBtn.dataset.tagIndex);
            _handleRemoveTag(index);
        }
    }

    async function _handleAddTag() {
        const input = document.getElementById('add-tag-input');
        if (!input) return;
        const newTag = input.value.trim();
        if (!newTag) return;

        const error = TeamService.validateTeamTag(newTag);
        if (error) {
            _showTagFeedback(error, true);
            return;
        }

        const currentTags = _getTeamTags();
        if (currentTags.some(t => t.tag.toLowerCase() === newTag.toLowerCase())) {
            _showTagFeedback('Tag already exists on this team', true);
            return;
        }
        if (currentTags.length >= 6) {
            _showTagFeedback('Maximum 6 tags allowed', true);
            return;
        }

        // Cross-team uniqueness check (client-side, from cache)
        const allTeams = TeamService.getAllTeams();
        for (const other of allTeams) {
            if (other.id === _teamId) continue;
            const otherTags = (other.teamTags && Array.isArray(other.teamTags) && other.teamTags.length > 0)
                ? other.teamTags.map(t => t.tag.toLowerCase())
                : (other.teamTag ? [other.teamTag.toLowerCase()] : []);
            if (otherTags.includes(newTag.toLowerCase())) {
                _showTagFeedback(`Tag "${newTag}" is already used by ${other.teamName}`, true);
                return;
            }
        }

        input.value = '';
        const updatedTags = [...currentTags, { tag: newTag, isPrimary: false }];
        await _saveTeamTags(updatedTags);
    }

    async function _handleRemoveTag(index) {
        const currentTags = _getTeamTags();
        if (currentTags.length <= 1) return; // Can't remove last tag
        if (currentTags[index].isPrimary) {
            _showTagFeedback('Can\'t remove primary tag — change primary first', true);
            return;
        }
        const updatedTags = currentTags.filter((_, i) => i !== index);
        await _saveTeamTags(updatedTags);
    }

    async function _handleSetPrimary(index) {
        const currentTags = _getTeamTags();
        if (currentTags[index].isPrimary) return; // Already primary
        const updatedTags = currentTags.map((t, i) => ({
            tag: t.tag,
            isPrimary: i === index
        }));
        await _saveTeamTags(updatedTags);
    }

    // ─── Voice Bot Section (Phase 1a) ──────────────────────────────────────

    /**
     * Render the Voice Bot section (leader only).
     * Three states: not connected, pending, connected.
     */
    function _renderVoiceBotSection() {
        // Show loading state until we know the registration status
        if (_botRegistration === undefined) {
            return `
                <div id="voice-bot-section">
                    <label class="text-sm font-medium text-foreground">Quad Bot</label>
                    <p class="text-xs text-muted-foreground mt-1">Loading...</p>
                </div>
            `;
        }

        if (!_botRegistration) {
            // State: Not Connected
            return `
                <div id="voice-bot-section">
                    <label class="text-sm font-medium text-foreground">Quad Bot</label>
                    <p class="text-xs text-muted-foreground mt-1 mb-2">
                        Connect the Quad bot to your Discord server to enable notifications, voice recording and more.
                    </p>
                    <button id="voice-bot-connect-btn"
                            class="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors">
                        Connect Bot
                    </button>
                </div>
            `;
        }

        if (_botRegistration.status === 'pending') {
            // State: Pending
            const inviteUrl = typeof BotRegistrationService !== 'undefined'
                ? BotRegistrationService.getBotInviteUrl()
                : '#';

            return `
                <div id="voice-bot-section">
                    <div class="flex items-center justify-between">
                        <label class="text-sm font-medium text-foreground">Quad Bot</label>
                        <span class="text-xs text-amber-500 font-medium">Pending</span>
                    </div>
                    <div class="mt-1 p-3 bg-muted/50 border border-border rounded-lg space-y-2">
                        <p class="text-xs text-foreground">Complete setup in Discord:</p>
                        <ol class="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                            <li>
                                Add the bot to your server
                                <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer"
                                   class="text-primary hover:underline ml-1">Invite Bot &rarr;</a>
                            </li>
                            <li>Run <code class="bg-muted px-1 py-0.5 rounded text-foreground">/register</code> in any channel</li>
                        </ol>
                    </div>
                    <button id="voice-bot-cancel-btn"
                            class="mt-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors">
                        Cancel
                    </button>
                </div>
            `;
        }

        // State: Connected (status === 'active')
        const guildName = _botRegistration.guildName
            ? _escapeHtml(_botRegistration.guildName)
            : 'Discord server';

        return `
            <div id="voice-bot-section">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-foreground">Quad Bot</label>
                    <span class="text-xs text-green-500 font-medium">Connected ●</span>
                </div>
                <div class="mt-1 flex items-center justify-between gap-3 p-3 bg-muted/50 border border-border rounded-lg">
                    <div>
                        <p class="text-sm text-foreground">${guildName}</p>
                        <p class="text-xs text-muted-foreground">Discord server</p>
                    </div>
                    <button id="voice-bot-disconnect-btn"
                            class="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors shrink-0">
                        Disconnect
                    </button>
                </div>
                ${_renderPlayerMappingSection()}
                ${_renderNotificationSettingsSection()}
                ${_renderScheduleChannelSection()}
            </div>
        `;
    }

    /**
     * Render player mapping section — shows knownPlayers from botRegistration (read-only)
     */
    function _renderPlayerMappingSection() {
        const knownPlayers = _botRegistration?.knownPlayers || {};
        const entries = Object.entries(knownPlayers);

        const listHtml = entries.length > 0
            ? entries.map(([discordId, qwName]) => {
                const shortId = discordId.slice(0, 6) + '…';
                const escapedId = _escapeHtml(discordId);
                return `<div class="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                    <span class="text-sm text-foreground">${_escapeHtml(qwName)}</span>
                    <div class="relative group flex items-center gap-1 shrink-0">
                        <button class="player-mapping-copy text-muted-foreground hover:text-foreground transition-colors"
                                data-discord-id="${escapedId}"
                                title="Copy Discord ID">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                        </button>
                        <span class="text-xs text-muted-foreground cursor-default select-none" title="${escapedId}">ID</span>
                        <div class="absolute right-0 bottom-full mb-1.5 hidden group-hover:flex items-center gap-1.5
                                    bg-popover border border-border rounded px-2 py-1 shadow-lg z-10 whitespace-nowrap">
                            <span class="text-xs text-muted-foreground font-mono">${escapedId}</span>
                        </div>
                    </div>
                </div>`;
              }).join('')
            : `<p class="text-xs text-muted-foreground py-1">No players registered yet.</p>`;

        return `
            <div class="pt-3 border-t border-border">
                <div class="flex items-center justify-between gap-1.5 mb-2">
                    <div class="flex items-center gap-1.5">
                        <label class="text-sm font-medium text-foreground">Player Mapping</label>
                        <div class="relative group">
                            <span class="text-muted-foreground cursor-default text-xs">ⓘ</span>
                            <div class="absolute left-0 bottom-full mb-1.5 hidden group-hover:block
                                        bg-popover border border-border rounded px-2 py-1 shadow-lg z-10 whitespace-nowrap">
                                <p class="text-xs text-muted-foreground">Players the bot recognizes in voice.</p>
                                <p class="text-xs text-muted-foreground">Run <code class="bg-muted px-1 rounded">/register</code> in Discord to refresh.</p>
                            </div>
                        </div>
                    </div>
                    ${_isLeader ? `<button id="manage-players-btn"
                            class="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors">
                        Manage Players
                    </button>` : ''}
                </div>
                <div class="p-2 bg-muted/50 border border-border rounded-lg">
                    ${listHtml}
                </div>
            </div>
        `;
    }

    /**
     * Render notification settings section — toggle + channel dropdown
     */
    function _renderNotificationSettingsSection() {
        const notifications = _botRegistration?.notifications;
        const isEnabled = notifications?.enabled !== false; // default true
        const selectedChannelId = notifications?.channelId || null;
        const availableChannels = _botRegistration?.availableChannels || [];

        const channelOptions = availableChannels.map(ch => {
            const canPost = ch.canPost !== false; // treat missing as true (backward compat)
            return `<option value="${_escapeHtml(ch.id)}" ${ch.id === selectedChannelId ? 'selected' : ''}
                        ${!canPost ? 'class="text-muted-foreground"' : ''}>
                ${!canPost ? '🔒 ' : '# '}${_escapeHtml(ch.name)}${!canPost ? ' (no permission)' : ''}
            </option>`;
        }).join('');

        // Check if currently selected channel lacks post permission
        const selectedChannel = availableChannels.find(ch => ch.id === selectedChannelId);
        const selectedCanPost = !selectedChannel || selectedChannel.canPost !== false;

        const channelDropdown = availableChannels.length > 0 ? `
            <div class="mt-2">
                <p class="text-sm text-foreground mb-1">Post in channel:</p>
                <select id="notification-channel-select"
                        class="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground"
                        ${!isEnabled ? 'disabled' : ''}>
                    <option value="">— DM team leader (fallback) —</option>
                    ${channelOptions}
                </select>
                <p id="channel-permission-warning"
                   class="text-xs text-amber-400 mt-1 ${selectedCanPost ? 'hidden' : ''}">
                    ⚠ Bot needs "Send Messages" permission in this channel
                </p>
            </div>
        ` : '';

        return `
            <div class="pt-3 border-t border-border">
                <label class="text-sm font-medium text-foreground">Notifications</label>
                <div class="mt-2 flex items-center justify-between gap-3">
                    <div>
                        <p class="text-sm text-foreground">Challenge notifications</p>
                        <p class="text-xs text-muted-foreground">Get notified when opponents challenge you</p>
                    </div>
                    <button class="notifications-enabled-toggle relative w-9 h-5 rounded-full transition-colors shrink-0
                                ${isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}"
                            data-enabled="${isEnabled}">
                        <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                              style="left: ${isEnabled ? '1.125rem' : '0.125rem'}"></span>
                    </button>
                </div>
                ${channelDropdown}
                <p class="text-xs text-muted-foreground mt-1.5">
                    ⓘ Bot must have access to the selected channel
                </p>
            </div>
        `;
    }

    /**
     * Render schedule channel section — dropdown to select where bot posts availability grid
     */
    function _renderScheduleChannelSection() {
        const selectedChannelId = _botRegistration?.scheduleChannelId
            || _botRegistration?.scheduleChannel?.channelId || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const pendingCreate = _botRegistration?.createChannelRequest?.status === 'pending';

        const channelOptions = availableChannels.map(ch => {
            const canPost = ch.canPost !== false;
            return `<option value="${_escapeHtml(ch.id)}" ${ch.id === selectedChannelId ? 'selected' : ''}
                        ${!canPost ? 'class="text-muted-foreground"' : ''}>
                ${!canPost ? '🔒 ' : '# '}${_escapeHtml(ch.name)}${!canPost ? ' (no permission)' : ''}
            </option>`;
        }).join('');

        const selectedChannel = availableChannels.find(ch => ch.id === selectedChannelId);
        const selectedCanPost = !selectedChannel || selectedChannel.canPost !== false;

        const channelDropdown = availableChannels.length > 0 ? `
            <div class="mt-2">
                <select id="schedule-channel-select"
                        class="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground">
                    <option value="">— No schedule channel —</option>
                    ${channelOptions}
                </select>
                <p id="schedule-channel-permission-warning"
                   class="text-xs text-amber-400 mt-1 ${selectedCanPost ? 'hidden' : ''}">
                    ⚠ Bot needs "Send Messages" permission in this channel
                </p>
            </div>
        ` : '';

        const createBtn = pendingCreate ? `
            <button id="create-schedule-channel-btn" disabled
                    class="mt-2 w-full px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-muted-foreground cursor-wait flex items-center justify-center gap-2">
                <span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-muted-foreground border-t-transparent rounded-full"></span>
                Creating channel...
            </button>
        ` : `
            <button id="create-schedule-channel-btn"
                    class="mt-2 w-full px-3 py-1.5 bg-muted hover:bg-muted/80 border border-border rounded-lg text-sm text-foreground transition-colors">
                + Create Channel
            </button>
        `;

        return `
            <div class="pt-3 border-t border-border">
                <label class="text-sm font-medium text-foreground">Schedule Channel</label>
                <p class="text-xs text-muted-foreground mt-0.5">Post availability grid in this channel</p>
                ${channelDropdown}
                ${createBtn}
            </div>
        `;
    }

    /**
     * Render auto-recording settings section — toggle + min players + mode
     */
    function _renderAutoRecordSection() {
        const autoRecord = _botRegistration?.autoRecord;
        const isEnabled = autoRecord?.enabled || false;
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
            <div class="pt-3 border-t border-border">
                <div class="flex items-center justify-between gap-3">
                    <label class="text-sm font-medium text-foreground">Auto-Recording</label>
                    <button class="auto-record-enabled-toggle relative w-9 h-5 rounded-full transition-colors shrink-0
                                ${isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}"
                            data-enabled="${isEnabled}">
                        <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                              style="left: ${isEnabled ? '1.125rem' : '0.125rem'}"></span>
                    </button>
                </div>
                <div class="mt-2 ${!isEnabled ? 'opacity-50 pointer-events-none' : ''}">
                    <p class="text-xs text-muted-foreground mb-1.5">Start when</p>
                    <div class="flex gap-3">
                        <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="auto-record-min-players" value="3"
                                   class="auto-record-min-players-radio"
                                   ${minPlayers === 3 ? 'checked' : ''}>
                            <span class="text-sm text-foreground">3+ members</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="auto-record-min-players" value="4"
                                   class="auto-record-min-players-radio"
                                   ${minPlayers === 4 ? 'checked' : ''}>
                            <span class="text-sm text-foreground">4+ members</span>
                        </label>
                    </div>
                    <div class="mt-2">
                        <select id="auto-record-mode-select"
                                class="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground">
                            ${modeOptions}
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Load bot registration and set up real-time listener
     */
    async function _initVoiceBotSection() {
        if (!_teamId || typeof BotRegistrationService === 'undefined') return;

        // Load initial state
        const reg = await BotRegistrationService.getRegistration(_teamId);
        _botRegistration = reg; // null if no doc

        // Re-render just the voice bot section
        _rerenderVoiceBotSection();

        // Set up real-time listener for status changes (pending → active)
        _botRegUnsubscribe = BotRegistrationService.onRegistrationChange(_teamId, (data) => {
            _botRegistration = data;
            _rerenderVoiceBotSection();
        });
    }

    /**
     * Re-render only the voice bot section in place
     */
    function _rerenderVoiceBotSection() {
        const section = document.getElementById('voice-bot-section');
        if (!section) return;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = _renderVoiceBotSection();
        const newSection = tempDiv.querySelector('#voice-bot-section');
        if (newSection) {
            section.replaceWith(newSection);
            _attachVoiceBotListeners();
        }
    }

    /**
     * Attach event listeners for the voice bot section buttons
     */
    function _attachVoiceBotListeners() {
        const connectBtn = document.getElementById('voice-bot-connect-btn');
        connectBtn?.addEventListener('click', _handleVoiceBotConnect);

        const cancelBtn = document.getElementById('voice-bot-cancel-btn');
        cancelBtn?.addEventListener('click', _handleVoiceBotDisconnect);

        const disconnectBtn = document.getElementById('voice-bot-disconnect-btn');
        disconnectBtn?.addEventListener('click', _handleVoiceBotDisconnect);

        // New: notification settings
        const notificationsToggle = document.querySelector('.notifications-enabled-toggle');
        notificationsToggle?.addEventListener('click', _handleNotificationsToggle);

        const notificationChannelSelect = document.getElementById('notification-channel-select');
        notificationChannelSelect?.addEventListener('change', _handleNotificationChannelChange);

        const scheduleChannelSelect = document.getElementById('schedule-channel-select');
        scheduleChannelSelect?.addEventListener('change', _handleScheduleChannelChange);

        const createChannelBtn = document.getElementById('create-schedule-channel-btn');
        createChannelBtn?.addEventListener('click', _handleCreateChannel);

        // Player mapping copy buttons
        document.querySelectorAll('.player-mapping-copy').forEach(btn => {
            btn.addEventListener('click', () => {
                const discordId = btn.dataset.discordId;
                if (discordId) navigator.clipboard.writeText(discordId).catch(() => {});
            });
        });

        // Manage Players button (leader only)
        const managePlayersBtn = document.getElementById('manage-players-btn');
        managePlayersBtn?.addEventListener('click', () => {
            ManagePlayersModal.show(_teamId);
        });
    }

    /**
     * Attach event listeners for recording settings controls (visibility + auto-record)
     * Called when Recordings tab is rendered — these controls live there, not in Discord tab
     */
    function _attachRecordingSettingsListeners() {
        const visibilityToggle = document.querySelector('#tab-content-recordings .voice-visibility-toggle');
        visibilityToggle?.addEventListener('click', _handleVisibilityToggle);

        const autoRecordToggle = document.querySelector('#tab-content-recordings .auto-record-enabled-toggle');
        autoRecordToggle?.addEventListener('click', _handleAutoRecordToggle);

        document.querySelectorAll('#tab-content-recordings .auto-record-min-players-radio').forEach(radio => {
            radio.addEventListener('change', _handleAutoRecordMinPlayersChange);
        });

        const autoRecordModeSelect = document.querySelector('#tab-content-recordings #auto-record-mode-select');
        autoRecordModeSelect?.addEventListener('change', _handleAutoRecordModeChange);
    }

    /**
     * Handle Connect Voice Bot click
     */
    async function _handleVoiceBotConnect() {
        const btn = document.getElementById('voice-bot-connect-btn');
        if (!btn) return;

        btn.disabled = true;
        btn.textContent = 'Connecting...';

        try {
            await BotRegistrationService.connectBot(_teamId);
            // Listener will update the UI automatically
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Voice bot registration started!');
            }
        } catch (error) {
            console.error('❌ Error connecting voice bot:', error);

            // Extract user-friendly message
            let message = 'Failed to connect voice bot';
            if (error.message?.includes('Discord not linked')) {
                message = 'Link your Discord in profile settings first';
            } else if (error.message?.includes('already registered')) {
                message = 'Bot is already registered for this team';
            } else if (error.code === 'functions/failed-precondition') {
                message = error.message || message;
            }

            if (typeof ToastService !== 'undefined') {
                ToastService.showError(message);
            }

            btn.disabled = false;
            btn.textContent = 'Connect Voice Bot';
        }
    }

    /**
     * Handle Cancel / Disconnect click
     */
    async function _handleVoiceBotDisconnect() {
        const btn = document.getElementById('voice-bot-cancel-btn')
            || document.getElementById('voice-bot-disconnect-btn');
        if (!btn) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Disconnecting...';

        try {
            await BotRegistrationService.disconnectBot(_teamId);
            // Listener will update the UI automatically
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Voice bot disconnected');
            }
        } catch (error) {
            console.error('❌ Error disconnecting voice bot:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Failed to disconnect voice bot');
            }
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    /**
     * Handle notifications enabled toggle click
     */
    async function _handleNotificationsToggle() {
        const btn = document.querySelector('.notifications-enabled-toggle');
        if (!btn) return;

        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        // Read current channel selection before optimistic update
        const channelSelect = document.getElementById('notification-channel-select');
        const channelId = channelSelect?.value || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const channelEntry = availableChannels.find(ch => ch.id === channelId);

        const newNotifications = {
            enabled: newEnabled,
            channelId: channelId || null,
            channelName: channelEntry?.name || null,
        };

        // Optimistic update
        btn.dataset.enabled = String(newEnabled);
        btn.classList.toggle('bg-primary', newEnabled);
        btn.classList.toggle('bg-muted-foreground/30', !newEnabled);
        const knob = btn.querySelector('span');
        if (knob) knob.style.left = newEnabled ? '1.125rem' : '0.125rem';
        if (channelSelect) channelSelect.disabled = !newEnabled;

        // Persist saved state for rollback
        const prevNotifications = _botRegistration?.notifications;

        // Apply optimistically to local state
        if (_botRegistration) _botRegistration.notifications = newNotifications;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { notifications: newNotifications });
            if (result.success) {
                ToastService.showSuccess(newEnabled ? 'Notifications enabled' : 'Notifications disabled');
            } else {
                // Rollback
                if (_botRegistration) _botRegistration.notifications = prevNotifications;
                _rerenderVoiceBotSection();
                ToastService.showError(result.error || 'Failed to update notifications');
            }
        } catch (error) {
            console.error('❌ Error updating notification settings:', error);
            if (_botRegistration) _botRegistration.notifications = prevNotifications;
            _rerenderVoiceBotSection();
            ToastService.showError('Network error - please try again');
        }
    }

    /**
     * Handle notification channel selection change
     */
    async function _handleNotificationChannelChange() {
        const channelSelect = document.getElementById('notification-channel-select');
        if (!channelSelect) return;

        const channelId = channelSelect.value || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const channelEntry = availableChannels.find(ch => ch.id === channelId);

        // Toggle permission warning
        const warning = document.getElementById('channel-permission-warning');
        if (warning) {
            const canPost = !channelEntry || channelEntry.canPost !== false;
            warning.classList.toggle('hidden', canPost);
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
                _rerenderVoiceBotSection();
                ToastService.showError(result.error || 'Failed to update channel');
            } else {
                ToastService.showSuccess('Notification channel updated');
            }
        } catch (error) {
            console.error('❌ Error updating notification channel:', error);
            if (_botRegistration) _botRegistration.notifications = prevNotifications;
            _rerenderVoiceBotSection();
            ToastService.showError('Network error - please try again');
        }
    }

    /**
     * Handle schedule channel selection change
     */
    async function _handleScheduleChannelChange() {
        const channelSelect = document.getElementById('schedule-channel-select');
        if (!channelSelect) return;

        const channelId = channelSelect.value || null;
        const availableChannels = _botRegistration?.availableChannels || [];
        const channelEntry = availableChannels.find(ch => ch.id === channelId);

        // Toggle permission warning
        const warning = document.getElementById('schedule-channel-permission-warning');
        if (warning) {
            const canPost = !channelEntry || channelEntry.canPost !== false;
            warning.classList.toggle('hidden', canPost);
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
                _rerenderVoiceBotSection();
                ToastService.showError(result.error || 'Failed to update schedule channel');
            } else {
                ToastService.showSuccess('Schedule channel updated');
            }
        } catch (error) {
            console.error('❌ Error updating schedule channel:', error);
            if (_botRegistration) _botRegistration.scheduleChannel = prevScheduleChannel;
            _rerenderVoiceBotSection();
            ToastService.showError('Network error - please try again');
        }
    }

    /**
     * Handle "Create Channel" button click — request bot to create a schedule channel
     */
    async function _handleCreateChannel() {
        if (!_teamId) return;

        try {
            const result = await BotRegistrationService.createChannel(_teamId, 'schedule');
            if (result.success) {
                ToastService.showSuccess('Creating schedule channel...');
                _rerenderVoiceBotSection();
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

    /**
     * Handle auto-record enabled toggle click
     */
    async function _handleAutoRecordToggle() {
        const btn = document.querySelector('.auto-record-enabled-toggle');
        if (!btn) return;

        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newEnabled = !currentlyEnabled;

        const minPlayersRadio = document.querySelector('.auto-record-min-players-radio:checked');
        const modeSelect = document.getElementById('auto-record-mode-select');
        const minPlayers = minPlayersRadio ? parseInt(minPlayersRadio.value, 10) : (_botRegistration?.autoRecord?.minPlayers || 3);
        const mode = modeSelect?.value || _botRegistration?.autoRecord?.mode || 'all';

        const newAutoRecord = { enabled: newEnabled, minPlayers, mode };

        // Optimistic update
        btn.dataset.enabled = String(newEnabled);
        btn.classList.toggle('bg-primary', newEnabled);
        btn.classList.toggle('bg-muted-foreground/30', !newEnabled);
        const knob = btn.querySelector('span');
        if (knob) knob.style.left = newEnabled ? '1.125rem' : '0.125rem';
        // Re-render to reflect enable/disable state of sub-controls
        const prevAutoRecord = _botRegistration?.autoRecord;
        if (_botRegistration) _botRegistration.autoRecord = newAutoRecord;

        // Re-render just the auto-record section sub-controls opacity
        const autoRecordSection = document.querySelector('#voice-bot-section .pt-3.border-t:last-child');
        if (autoRecordSection) {
            const controlsDiv = autoRecordSection.querySelector('.mt-2');
            if (controlsDiv) {
                controlsDiv.classList.toggle('opacity-50', !newEnabled);
                controlsDiv.classList.toggle('pointer-events-none', !newEnabled);
            }
        }

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { autoRecord: newAutoRecord });
            if (result.success) {
                ToastService.showSuccess(newEnabled ? 'Auto-recording enabled' : 'Auto-recording disabled');
            } else {
                if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
                _rerenderVoiceBotSection();
                ToastService.showError(result.error || 'Failed to update auto-recording');
            }
        } catch (error) {
            console.error('❌ Error updating auto-record settings:', error);
            if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
            _rerenderVoiceBotSection();
            ToastService.showError('Network error - please try again');
        }
    }

    /**
     * Handle auto-record min-players radio change
     */
    async function _handleAutoRecordMinPlayersChange(e) {
        const minPlayers = parseInt(e.target.value, 10);
        if (![3, 4].includes(minPlayers)) return;

        const modeSelect = document.getElementById('auto-record-mode-select');
        const isEnabled = _botRegistration?.autoRecord?.enabled || false;
        const mode = modeSelect?.value || _botRegistration?.autoRecord?.mode || 'all';

        const newAutoRecord = { enabled: isEnabled, minPlayers, mode };
        const prevAutoRecord = _botRegistration?.autoRecord;
        if (_botRegistration) _botRegistration.autoRecord = newAutoRecord;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { autoRecord: newAutoRecord });
            if (!result.success) {
                if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
                _rerenderVoiceBotSection();
                ToastService.showError(result.error || 'Failed to update setting');
            } else {
                ToastService.showSuccess('Recording threshold updated');
            }
        } catch (error) {
            console.error('❌ Error updating min-players:', error);
            if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
            _rerenderVoiceBotSection();
            ToastService.showError('Network error - please try again');
        }
    }

    /**
     * Handle auto-record mode dropdown change
     */
    async function _handleAutoRecordModeChange() {
        const modeSelect = document.getElementById('auto-record-mode-select');
        if (!modeSelect) return;

        const mode = modeSelect.value;
        if (!['all', 'official', 'practice'].includes(mode)) return;

        const minPlayersRadio = document.querySelector('.auto-record-min-players-radio:checked');
        const isEnabled = _botRegistration?.autoRecord?.enabled || false;
        const minPlayers = minPlayersRadio ? parseInt(minPlayersRadio.value, 10) : (_botRegistration?.autoRecord?.minPlayers || 3);

        const newAutoRecord = { enabled: isEnabled, minPlayers, mode };
        const prevAutoRecord = _botRegistration?.autoRecord;
        if (_botRegistration) _botRegistration.autoRecord = newAutoRecord;

        try {
            const result = await BotRegistrationService.updateSettings(_teamId, { autoRecord: newAutoRecord });
            if (!result.success) {
                if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
                _rerenderVoiceBotSection();
                ToastService.showError(result.error || 'Failed to update setting');
            } else {
                ToastService.showSuccess('Recording mode updated');
            }
        } catch (error) {
            console.error('❌ Error updating auto-record mode:', error);
            if (_botRegistration) _botRegistration.autoRecord = prevAutoRecord;
            _rerenderVoiceBotSection();
            ToastService.showError('Network error - please try again');
        }
    }

    /**
     * Render leader action buttons
     */
    function _renderLeaderActions() {
        return `
            <div class="flex gap-2">
                <button
                    id="remove-player-btn"
                    class="flex-1 px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors"
                >
                    Remove Player
                </button>
                <button
                    id="transfer-leadership-btn"
                    class="flex-1 px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors"
                >
                    Transfer Leader
                </button>
            </div>
        `;
    }

    /**
     * Render leave team section
     */
    function _renderLeaveTeamSection() {
        const isLastMember = _teamData.playerRoster.length === 1;
        const canLeave = !_isLeader || isLastMember;

        const leaveButtonClass = canLeave
            ? 'w-full px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-medium rounded-lg transition-colors'
            : 'w-full px-4 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-lg cursor-not-allowed';

        const tooltip = !canLeave
            ? 'title="Leaders cannot leave. Transfer leadership first or be the last member."'
            : '';

        return `
            <div>
                <button
                    id="leave-team-btn"
                    class="${leaveButtonClass}"
                    ${!canLeave ? 'disabled' : ''}
                    ${tooltip}
                >
                    Leave Team
                </button>
            </div>
        `;
    }

    // ─── Tab Switching (Slice P5.1) ──────────────────────────────────────

    /**
     * Handle tab switching - show/hide tab content panels, lazy init on first switch
     */
    function _handleTabSwitch(tabName) {
        // Hide all tab contents
        document.querySelectorAll('[id^="tab-content-"]').forEach(el => el.classList.add('hidden'));
        // Show target
        const target = document.getElementById(`tab-content-${tabName}`);
        if (target) target.classList.remove('hidden');
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Lazy init: Voice Bot on first Discord tab switch
        if (tabName === 'discord' && !_voiceBotInitialized) {
            _voiceBotInitialized = true;
            _initVoiceBotSection();
        }
        // Lazy init: Recordings on first switch
        if (tabName === 'recordings' && !_recordingsInitialized) {
            _recordingsInitialized = true;
            _initRecordingsTab();
        }
    }

    /**
     * Attach event listeners
     */
    function _attachListeners() {
        const backdrop = document.getElementById('team-management-modal-backdrop');
        const closeBtn = document.getElementById('team-management-close');

        // Close handlers
        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);

        // ESC key to close
        _keydownHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', _keydownHandler);

        // Tab switching (leader only)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => _handleTabSwitch(btn.dataset.tab));
        });

        // Copy join code
        const copyBtn = document.getElementById('copy-join-code-btn');
        copyBtn?.addEventListener('click', _handleCopyJoinCode);

        // Regenerate join code (leader only)
        const regenerateBtn = document.getElementById('regenerate-join-code-btn');
        regenerateBtn?.addEventListener('click', _handleRegenerateJoinCode);

        // Tag chips (leader only) — Slice 5.3
        const tagChipsContainer = document.getElementById('tag-chips-container');
        tagChipsContainer?.addEventListener('click', _handleTagChipClick);
        const addTagInput = document.getElementById('add-tag-input');
        addTagInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                _handleAddTag();
            }
        });

        // Max players select (leader only)
        const maxPlayersSelect = document.getElementById('max-players-select');
        maxPlayersSelect?.addEventListener('change', _handleMaxPlayersChange);

        // Division pills (leader only) — delegate to container
        const divisionPills = document.getElementById('division-pills');
        divisionPills?.addEventListener('click', _handleDivisionToggle);

        // Scheduler expand/collapse (leader only)
        const schedulerExpandBtn = document.getElementById('scheduler-expand-btn');
        schedulerExpandBtn?.addEventListener('click', _handleSchedulerExpand);

        // Scheduler toggles (leader only) — delegate to container
        const schedulerToggles = document.getElementById('scheduler-toggles');
        schedulerToggles?.addEventListener('click', _handleSchedulerToggle);

        // Privacy toggles (leader only) — delegate to container
        const privacyToggles = document.getElementById('privacy-toggles');
        privacyToggles?.addEventListener('click', _handlePrivacyToggle);

        // Manage logo (leader only)
        const manageLogoBtn = document.getElementById('manage-logo-btn');
        manageLogoBtn?.addEventListener('click', _handleManageLogo);

        // Remove player (leader only)
        const removePlayerBtn = document.getElementById('remove-player-btn');
        removePlayerBtn?.addEventListener('click', _handleRemovePlayer);

        // Transfer leadership (leader only)
        const transferLeadershipBtn = document.getElementById('transfer-leadership-btn');
        transferLeadershipBtn?.addEventListener('click', _handleTransferLeadership);

        // Leave team
        const leaveTeamBtn = document.getElementById('leave-team-btn');
        if (leaveTeamBtn && !leaveTeamBtn.disabled) {
            leaveTeamBtn.addEventListener('click', _handleLeaveTeam);
        }

        // Voice bot buttons: attached lazily via _rerenderVoiceBotSection on Discord tab switch
    }

    /**
     * Handle copy join code
     */
    async function _handleCopyJoinCode() {
        const joinCode = _teamData.joinCode;
        const teamName = _teamData.teamName;

        if (!joinCode || !teamName) return;

        // Enhanced copy string per PRD
        const copyText = `Use code: ${joinCode} to join ${teamName} at https://scheduler.quake.world`;

        try {
            await navigator.clipboard.writeText(copyText);
            ToastService.showSuccess('Join code copied to clipboard!');
        } catch (error) {
            console.error('Copy failed:', error);
            // Fallback for older browsers
            try {
                const textArea = document.createElement('textarea');
                textArea.value = copyText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                ToastService.showSuccess('Join code copied to clipboard!');
            } catch (fallbackError) {
                console.error('Fallback copy also failed:', fallbackError);
                ToastService.showError('Failed to copy join code');
            }
        }
    }

    /**
     * Handle regenerate join code - shows confirmation, then regenerates
     */
    async function _handleRegenerateJoinCode() {
        // Capture state before close() clears it
        const teamId = _teamId;
        const teamName = _teamData?.teamName || '';

        // Close this modal first, then show regenerate modal
        close();

        // Use the same regenerate modal pattern from TeamManagementDrawer
        const result = await _showRegenerateModal(teamId, teamName);

        // If user wants to reopen team settings, they can click the gear again
    }

    /**
     * Show regenerate join code modal with confirmation and copy
     */
    async function _showRegenerateModal(teamId, teamName) {
        return new Promise((resolve) => {
            const modalHTML = `
                <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                     id="regenerate-modal-backdrop">
                    <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
                        <!-- Header -->
                        <div class="flex items-center justify-between p-4 border-b border-border">
                            <h2 id="regenerate-modal-title" class="text-lg font-semibold text-foreground">Regenerate Join Code?</h2>
                            <button id="regenerate-close-btn" class="text-muted-foreground hover:text-foreground transition-colors p-1">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>

                        <!-- Body -->
                        <div class="p-6" id="regenerate-modal-content">
                            <div class="space-y-4">
                                <div class="text-center">
                                    <div class="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                                        <svg class="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                                        </svg>
                                    </div>
                                    <p class="text-foreground text-sm leading-relaxed">Old codes will no longer work.</p>
                                </div>

                                <!-- Actions -->
                                <div class="flex gap-3 pt-2">
                                    <button
                                        id="regenerate-confirm-btn"
                                        class="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors"
                                    >
                                        Regenerate
                                    </button>
                                    <button
                                        id="regenerate-cancel-btn"
                                        class="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const modalContainer = document.getElementById('modal-container');
            modalContainer.innerHTML = modalHTML;
            modalContainer.classList.remove('hidden');

            const backdrop = document.getElementById('regenerate-modal-backdrop');
            const confirmBtn = document.getElementById('regenerate-confirm-btn');
            const cancelBtn = document.getElementById('regenerate-cancel-btn');
            const closeBtn = document.getElementById('regenerate-close-btn');

            let escHandler = null;

            const handleClose = () => {
                if (escHandler) {
                    document.removeEventListener('keydown', escHandler);
                }
                modalContainer.classList.add('hidden');
                modalContainer.innerHTML = '';
                resolve({ confirmed: false });
            };

            // Close handlers
            backdrop?.addEventListener('click', (e) => {
                if (e.target === backdrop) handleClose();
            });
            cancelBtn?.addEventListener('click', handleClose);
            closeBtn?.addEventListener('click', handleClose);

            escHandler = (e) => {
                if (e.key === 'Escape') handleClose();
            };
            document.addEventListener('keydown', escHandler);

            // Confirm handler
            confirmBtn?.addEventListener('click', async () => {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = `
                    <span class="flex items-center justify-center gap-2">
                        <span class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>
                        Regenerating...
                    </span>
                `;

                try {
                    const result = await TeamService.callFunction('regenerateJoinCode', {
                        teamId: teamId
                    });

                    if (result.success) {
                        _showRegenerateSuccess(result.data.joinCode, teamName, escHandler, resolve);
                    } else {
                        ToastService.showError(result.error || 'Failed to regenerate code');
                        confirmBtn.disabled = false;
                        confirmBtn.innerHTML = 'Regenerate';
                    }
                } catch (error) {
                    console.error('Error regenerating join code:', error);
                    ToastService.showError('Network error - please try again');
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = 'Regenerate';
                }
            });
        });
    }

    /**
     * Show success state after regenerating join code
     */
    function _showRegenerateSuccess(newJoinCode, teamName, escHandler, resolve) {
        // Update header
        const title = document.getElementById('regenerate-modal-title');
        if (title) title.textContent = 'New Join Code Generated!';

        const contentDiv = document.getElementById('regenerate-modal-content');
        contentDiv.innerHTML = `
            <div class="space-y-4">
                <div class="text-center">
                    <div class="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <div class="bg-muted rounded-lg p-4 mb-4">
                        <div class="text-2xl font-mono font-bold text-foreground">${newJoinCode}</div>
                    </div>
                </div>

                <!-- Copy Actions -->
                <div class="flex gap-3 pt-2">
                    <button
                        id="copy-new-code-btn"
                        class="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors"
                    >
                        Copy & Close
                    </button>
                    <button
                        id="close-only-btn"
                        class="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modal-container');
        const copyBtn = document.getElementById('copy-new-code-btn');
        const closeOnlyBtn = document.getElementById('close-only-btn');

        const closeModal = () => {
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
            }
            modalContainer.classList.add('hidden');
            modalContainer.innerHTML = '';
        };

        copyBtn?.addEventListener('click', async () => {
            const copyText = `Use code: ${newJoinCode} to join ${teamName} at https://scheduler.quake.world`;

            try {
                await navigator.clipboard.writeText(copyText);
                ToastService.showSuccess('Join code copied to clipboard!');
            } catch (error) {
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = copyText;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    ToastService.showSuccess('Join code copied to clipboard!');
                } catch (fallbackError) {
                    console.error('Copy failed:', fallbackError);
                    ToastService.showError('Failed to copy join code');
                }
            }

            closeModal();
            resolve({ confirmed: true, copied: true });
        });

        closeOnlyBtn?.addEventListener('click', () => {
            closeModal();
            resolve({ confirmed: true, copied: false });
        });
    }

    /**
     * Handle max players change
     */
    async function _handleMaxPlayersChange(event) {
        const newValue = parseInt(event.target.value);
        const oldValue = _teamData.maxPlayers;
        const currentRosterSize = _teamData.playerRoster.length;

        // Validate - can't go below roster size
        if (newValue < currentRosterSize) {
            event.target.value = oldValue;
            return;
        }

        // Optimistically update local data
        _teamData.maxPlayers = newValue;

        try {
            const result = await TeamService.callFunction('updateTeamSettings', {
                teamId: _teamId,
                maxPlayers: newValue
            });

            if (!result.success) {
                // Revert on error
                event.target.value = oldValue;
                _teamData.maxPlayers = oldValue;
            }
            // No success feedback - the change is visible
        } catch (error) {
            console.error('Error updating max players:', error);
            // Revert on error
            event.target.value = oldValue;
            _teamData.maxPlayers = oldValue;
        }
    }

    /**
     * Handle division pill toggle
     */
    async function _handleDivisionToggle(event) {
        const btn = event.target.closest('.division-pill-btn');
        if (!btn) return;

        const division = btn.dataset.division;
        const wasActive = btn.dataset.active === 'true';
        const feedback = document.getElementById('division-feedback');

        // Calculate new divisions
        const currentDivisions = (_teamData.divisions || []).slice();
        let newDivisions;
        if (wasActive) {
            newDivisions = currentDivisions.filter(d => d !== division);
        } else {
            newDivisions = [...currentDivisions, division];
        }

        // Must have at least one division
        if (newDivisions.length === 0) {
            feedback.textContent = 'Need at least 1';
            feedback.className = 'text-xs text-destructive';
            return;
        }

        // Clear feedback
        feedback.textContent = '';
        feedback.className = 'text-xs';

        // Optimistic UI update
        const newActive = !wasActive;
        btn.dataset.active = String(newActive);
        btn.classList.toggle('bg-primary', newActive);
        btn.classList.toggle('text-primary-foreground', newActive);
        btn.classList.toggle('bg-muted', !newActive);
        btn.classList.toggle('text-muted-foreground', !newActive);

        const oldDivisions = _teamData.divisions;
        _teamData.divisions = newDivisions;

        try {
            const result = await TeamService.callFunction('updateTeamSettings', {
                teamId: _teamId,
                divisions: newDivisions
            });

            if (result.success) {
                // No toast - the pill change is visible
            } else {
                // Revert
                _teamData.divisions = oldDivisions;
                btn.dataset.active = String(wasActive);
                btn.classList.toggle('bg-primary', wasActive);
                btn.classList.toggle('text-primary-foreground', wasActive);
                btn.classList.toggle('bg-muted', !wasActive);
                btn.classList.toggle('text-muted-foreground', !wasActive);
                feedback.textContent = result.error || 'Failed';
                feedback.className = 'text-xs text-destructive';
            }
        } catch (error) {
            console.error('Error updating divisions:', error);
            // Revert
            _teamData.divisions = oldDivisions;
            btn.dataset.active = String(wasActive);
            btn.classList.toggle('bg-primary', wasActive);
            btn.classList.toggle('text-primary-foreground', wasActive);
            btn.classList.toggle('bg-muted', !wasActive);
            btn.classList.toggle('text-muted-foreground', !wasActive);
            feedback.textContent = 'Network error';
            feedback.className = 'text-xs text-destructive';
        }
    }

    /**
     * Handle manage logo - opens LogoUploadModal
     */
    function _handleManageLogo() {
        // Capture values before close() clears them
        const teamId = _teamId;
        const userId = _currentUserId;
        close();

        if (!teamId || !userId) {
            console.error('Missing teamId or userId for logo upload');
            ToastService.showError('Team data not loaded');
            return;
        }

        if (typeof LogoUploadModal !== 'undefined') {
            LogoUploadModal.show(teamId, userId);
        } else {
            console.error('LogoUploadModal not loaded');
            ToastService.showError('Logo upload not available');
        }
    }

    /**
     * Handle remove player - opens KickPlayerModal
     */
    function _handleRemovePlayer() {
        const teamId = _teamId;
        close();

        if (typeof KickPlayerModal !== 'undefined') {
            KickPlayerModal.show(teamId);
        } else {
            console.error('KickPlayerModal not loaded');
            ToastService.showError('Remove player not available');
        }
    }

    /**
     * Handle transfer leadership - opens TransferLeadershipModal
     */
    function _handleTransferLeadership() {
        const teamId = _teamId;
        close();

        if (typeof TransferLeadershipModal !== 'undefined') {
            TransferLeadershipModal.show(teamId);
        } else {
            console.error('TransferLeadershipModal not loaded');
            ToastService.showError('Transfer leadership not available');
        }
    }

    /**
     * Handle leave team
     */
    async function _handleLeaveTeam() {
        const isLastMember = _teamData.playerRoster.length === 1;
        const message = isLastMember
            ? 'You are the last member. Leaving will archive this team permanently.'
            : 'Are you sure you want to leave this team? You can rejoin later with a join code.';

        // Capture before close() clears state
        const teamId = _teamId;

        close();

        const confirmed = await showConfirmModal({
            title: 'Leave Team?',
            message: message,
            confirmText: 'Leave Team',
            confirmClass: 'bg-destructive hover:bg-destructive/90',
            cancelText: 'Cancel'
        });

        if (!confirmed) return;

        // Show a loading toast since we don't have a button to update
        ToastService.showInfo('Leaving team...');

        try {
            const result = await TeamService.callFunction('leaveTeam', {
                teamId: teamId
            });

            if (result.success) {
                ToastService.showSuccess('You have left the team');
                window.dispatchEvent(new CustomEvent('team-left', {
                    detail: { teamId: teamId }
                }));
            } else {
                ToastService.showError(result.error || 'Failed to leave team');
            }
        } catch (error) {
            console.error('Error leaving team:', error);
            ToastService.showError('Network error - please try again');
        }
    }

    // ─── Recordings Tab (R3+R4+R6) ─────────────────────────────────────

    let _opponentLogoCache = {}; // tag -> { logoUrl, teamName } or null
    let _expandedSeries = new Set();

    /**
     * Group recordings into series by sessionId + opponentTag
     */
    function _groupIntoSeries(recordings) {
        const groups = {};

        for (const rec of recordings) {
            const key = rec.sessionId
                ? `${rec.sessionId}_${rec.opponentTag || 'unknown'}`
                : `legacy_${rec.id}`;

            if (!groups[key]) groups[key] = { key, maps: [] };
            groups[key].maps.push(rec);
        }

        // Sort maps within each series by mapOrder (or recordedAt fallback)
        for (const series of Object.values(groups)) {
            series.maps.sort((a, b) => (a.mapOrder ?? 0) - (b.mapOrder ?? 0));
        }

        // Sort series by date (newest first)
        return Object.values(groups)
            .sort((a, b) => {
                const aTime = a.maps[0].recordedAt?.toMillis?.() || 0;
                const bTime = b.maps[0].recordedAt?.toMillis?.() || 0;
                return bTime - aTime;
            });
    }

    /**
     * Calculate series score (map wins for each side)
     */
    function _getSeriesScore(maps) {
        let teamWins = 0, opponentWins = 0;
        for (const map of maps) {
            if ((map.teamFrags || 0) > (map.opponentFrags || 0)) teamWins++;
            else if ((map.opponentFrags || 0) > (map.teamFrags || 0)) opponentWins++;
        }
        return { teamWins, opponentWins };
    }

    /**
     * Try to look up opponent team logo from cache/Firestore
     */
    async function _getOpponentLogo(opponentTag) {
        if (!opponentTag || opponentTag === 'unknown') return null;
        const key = opponentTag.toLowerCase();
        if (key in _opponentLogoCache) return _opponentLogoCache[key];

        // Best-effort lookup from TeamService cache
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

    /**
     * Load recordings from Firestore on first Recordings tab switch
     */
    async function _initRecordingsTab() {
        const container = document.getElementById('tab-content-recordings');
        if (!container) return;

        container.innerHTML = '<p class="text-sm text-muted-foreground py-4">Loading recordings...</p>';

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
            _renderRecordingsList();
        } catch (err) {
            console.error('Failed to load recordings:', err);
            container.innerHTML = '<p class="text-sm text-red-400 py-4">Failed to load recordings.</p>';
        }
    }

    /**
     * Render recording settings (visibility + auto-record) — leader/scheduler only
     */
    function _renderRecordingSettings() {
        if (!(_isLeader || _isScheduler)) return '';
        if (!_botRegistration || _botRegistration.status !== 'active') return '';

        const defaultVisibility = _teamData?.voiceSettings?.defaultVisibility || 'private';
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
            <div class="mb-4 pb-4 border-b border-border space-y-3">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="text-sm text-foreground">Public recordings</p>
                        <p class="text-xs text-muted-foreground voice-visibility-sublabel">
                            ${isPublic ? 'Visible to everyone' : 'Visible to team members only'}
                        </p>
                    </div>
                    <button class="voice-visibility-toggle relative w-9 h-5 rounded-full transition-colors shrink-0
                                ${isPublic ? 'bg-primary' : 'bg-muted-foreground/30'}"
                            data-enabled="${isPublic}">
                        <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                              style="left: ${isPublic ? '1.125rem' : '0.125rem'}"></span>
                    </button>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <label class="text-sm text-foreground">Auto-Recording</label>
                    <button class="auto-record-enabled-toggle relative w-9 h-5 rounded-full transition-colors shrink-0
                                ${arEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}"
                            data-enabled="${arEnabled}">
                        <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                              style="left: ${arEnabled ? '1.125rem' : '0.125rem'}"></span>
                    </button>
                </div>
                <div class="${!arEnabled ? 'opacity-50 pointer-events-none' : ''}">
                    <p class="text-xs text-muted-foreground mb-1.5">Start when</p>
                    <div class="flex gap-3 mb-2">
                        <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="auto-record-min-players" value="3"
                                   class="auto-record-min-players-radio"
                                   ${minPlayers === 3 ? 'checked' : ''}>
                            <span class="text-sm text-foreground">3+ members</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="auto-record-min-players" value="4"
                                   class="auto-record-min-players-radio"
                                   ${minPlayers === 4 ? 'checked' : ''}>
                            <span class="text-sm text-foreground">4+ members</span>
                        </label>
                    </div>
                    <select id="auto-record-mode-select"
                            class="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground">
                        ${modeOptions}
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * Render series-grouped recording cards
     */
    function _renderRecordingsList() {
        const container = document.getElementById('tab-content-recordings');
        if (!container) return;

        const settingsHtml = _renderRecordingSettings();

        if (_recordings.length === 0) {
            container.innerHTML = `
                ${settingsHtml}
                <p class="text-sm text-muted-foreground py-4">
                    No voice recordings yet.${(_isLeader || _isScheduler) ? ' Connect the Quad Bot in the Discord tab to start recording.' : ''}
                </p>`;
            _attachRecordingSettingsListeners();
            return;
        }

        const series = _groupIntoSeries(_recordings);
        const teamLogoUrl = _teamData?.activeLogo?.urls?.small || null;
        const teamTag = _teamData?.teamTag || '';

        const cardsHtml = series.map(s => _renderSeriesCard(s, teamLogoUrl, teamTag)).join('');

        container.innerHTML = `
            <div>
                ${settingsHtml}
                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recordings</span>
                    <span class="text-xs text-muted-foreground">${_recordings.length} recording${_recordings.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="space-y-2 max-h-[28rem] overflow-y-auto scrollbar-thin" id="recordings-list">
                    ${cardsHtml}
                </div>
                <div id="download-progress" class="hidden text-xs text-primary mt-2"></div>
            </div>
        `;

        _attachRecordingSettingsListeners();
        _attachRecordingsListeners();
        _loadOpponentLogos(series);
    }

    /**
     * Render a single series card (collapsed or expanded)
     */
    function _renderSeriesCard(series, teamLogoUrl, teamTag) {
        const firstMap = series.maps[0];
        const isLegacy = !firstMap.sessionId;
        const isExpanded = _expandedSeries.has(series.key);
        const opponentTag = firstMap.opponentTag || '';
        const date = firstMap.recordedAt?.toDate ? firstMap.recordedAt.toDate() : new Date(firstMap.recordedAt || 0);
        const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });

        if (isLegacy) {
            return _renderLegacyCard(firstMap, teamLogoUrl, teamTag, dateStr);
        }

        const { teamWins, opponentWins } = _getSeriesScore(series.maps);
        const allPublic = series.maps.every(m => m.visibility === 'public');

        // Series header
        const teamLogoHtml = teamLogoUrl
            ? `<img src="${teamLogoUrl}" class="w-5 h-5 rounded object-cover" alt="">`
            : '';
        const opponentLogoHtml = `<span class="opponent-logo" data-opponent="${_escapeHtml(opponentTag)}"></span>`;

        const controlsHtml = `
            <div class="flex items-center gap-1.5">
                ${_isLeader ? `
                <button class="series-visibility-toggle p-1 rounded hover:bg-surface-hover transition-colors"
                        data-series-key="${_escapeHtml(series.key)}"
                        title="${allPublic ? 'Set all to private' : 'Set all to public'}">
                    <svg class="w-3.5 h-3.5 ${allPublic ? 'text-green-400' : 'text-muted-foreground'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${allPublic
                            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
                            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>'}
                    </svg>
                </button>
                ` : ''}
                <button class="series-download-btn p-1 rounded hover:bg-surface-hover transition-colors"
                        data-series-key="${_escapeHtml(series.key)}" title="Download series">
                    <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                </button>
                ${_isLeader ? `
                <button class="series-delete-btn p-1 rounded hover:bg-red-500/20 transition-colors"
                        data-series-key="${_escapeHtml(series.key)}" title="Delete series">
                    <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
                ` : ''}
                <button class="series-expand-btn p-1 rounded hover:bg-surface-hover transition-colors"
                        data-series-key="${_escapeHtml(series.key)}">
                    <svg class="w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
            </div>
        `;

        const mapRowsHtml = isExpanded ? `
            <div class="series-maps border-t border-border">
                ${series.maps.map(map => _renderMapRow(map)).join('')}
            </div>
        ` : '';

        return `
            <div class="recording-series bg-surface rounded-lg border border-border" data-series-key="${_escapeHtml(series.key)}">
                <div class="series-header flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-surface-hover rounded-t-lg"
                     data-series-key="${_escapeHtml(series.key)}">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-xs text-muted-foreground shrink-0">${_escapeHtml(dateStr)}</span>
                        ${teamLogoHtml}
                        <span class="text-sm font-medium text-foreground">${_escapeHtml(teamTag)}</span>
                        <span class="text-xs text-muted-foreground">vs</span>
                        <span class="text-sm font-medium text-foreground">${_escapeHtml(opponentTag)}</span>
                        ${opponentLogoHtml}
                        <span class="text-xs text-muted-foreground">(${teamWins}-${opponentWins})</span>
                    </div>
                    ${controlsHtml}
                </div>
                ${mapRowsHtml}
            </div>
        `;
    }

    /**
     * Render a legacy recording card (no sessionId — standalone single map)
     */
    function _renderLegacyCard(rec, teamLogoUrl, teamTag, dateStr) {
        const trackCount = rec.trackCount || rec.tracks?.length || 0;
        const isPublic = rec.visibility === 'public';

        return `
            <div class="recording-series bg-surface rounded-lg border border-border" data-series-key="legacy_${_escapeHtml(rec.id)}">
                <div class="flex items-center justify-between px-3 py-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-xs text-muted-foreground shrink-0">${_escapeHtml(dateStr)}</span>
                        <span class="text-sm font-medium text-foreground">${_escapeHtml(teamTag)}</span>
                        <span class="text-sm font-mono text-foreground">${_escapeHtml(rec.mapName || '—')}</span>
                        <span class="text-xs text-muted-foreground">${trackCount} tracks</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${_isLeader ? `
                        <button class="rec-visibility-toggle p-1 rounded hover:bg-surface-hover transition-colors"
                                data-sha="${_escapeHtml(rec.id)}" data-visibility="${rec.visibility}"
                                title="${isPublic ? 'Set to private' : 'Set to public'}">
                            <svg class="w-3.5 h-3.5 ${isPublic ? 'text-green-400' : 'text-muted-foreground'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                ${isPublic
                                    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
                                    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>'}
                            </svg>
                        </button>
                        ` : ''}
                        <button class="map-download-btn p-1 rounded hover:bg-surface-hover transition-colors"
                                data-sha="${_escapeHtml(rec.id)}" title="Download">
                            <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                            </svg>
                        </button>
                        ${_isLeader ? `
                        <button class="map-delete-btn p-1 rounded hover:bg-red-500/20 transition-colors"
                                data-sha="${_escapeHtml(rec.id)}" title="Delete">
                            <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render a per-map row inside an expanded series
     */
    function _renderMapRow(map) {
        const trackCount = map.trackCount || map.tracks?.length || 0;
        const isPublic = map.visibility === 'public';
        const teamFrags = map.teamFrags || 0;
        const opponentFrags = map.opponentFrags || 0;

        return `
            <div class="map-row flex items-center justify-between px-3 py-1.5 hover:bg-surface-hover border-b border-border/30 last:border-b-0">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="text-sm font-mono font-medium text-foreground w-24 truncate">${_escapeHtml(map.mapName || '—')}</span>
                    <span class="text-xs text-muted-foreground">${trackCount} tracks</span>
                    ${teamFrags || opponentFrags ? `<span class="text-xs text-muted-foreground">${teamFrags}-${opponentFrags}</span>` : ''}
                </div>
                <div class="flex items-center gap-1.5">
                    ${_isLeader ? `
                    <button class="rec-visibility-toggle p-1 rounded hover:bg-surface-hover transition-colors"
                            data-sha="${_escapeHtml(map.id)}" data-visibility="${map.visibility}"
                            title="${isPublic ? 'Set to private' : 'Set to public'}">
                        <svg class="w-3.5 h-3.5 ${isPublic ? 'text-green-400' : 'text-muted-foreground'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            ${isPublic
                                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
                                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>'}
                        </svg>
                    </button>
                    ` : ''}
                    <button class="map-download-btn p-1 rounded hover:bg-surface-hover transition-colors"
                            data-sha="${_escapeHtml(map.id)}" title="Download map">
                        <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                    </button>
                    ${_isLeader ? `
                    <button class="map-delete-btn p-1 rounded hover:bg-red-500/20 transition-colors"
                            data-sha="${_escapeHtml(map.id)}" title="Delete map">
                        <svg class="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners for the recordings list
     */
    function _attachRecordingsListeners() {
        const list = document.getElementById('recordings-list');
        if (!list) return;

        // Expand/collapse series
        list.addEventListener('click', (e) => {
            const expandBtn = e.target.closest('.series-expand-btn');
            const headerClick = e.target.closest('.series-header');

            if (expandBtn || (headerClick && !e.target.closest('button:not(.series-expand-btn)'))) {
                const key = (expandBtn || headerClick).dataset.seriesKey;
                if (_expandedSeries.has(key)) {
                    _expandedSeries.delete(key);
                } else {
                    _expandedSeries.add(key);
                }
                _renderRecordingsList();
                return;
            }

            // Per-map visibility toggle
            const visToggle = e.target.closest('.rec-visibility-toggle');
            if (visToggle) {
                e.stopPropagation();
                _handleRecordingVisibilityToggle(visToggle);
                return;
            }

            // Series visibility toggle
            const seriesVisToggle = e.target.closest('.series-visibility-toggle');
            if (seriesVisToggle) {
                e.stopPropagation();
                _handleSeriesVisibilityToggle(seriesVisToggle.dataset.seriesKey);
                return;
            }

            // Per-map download
            const mapDlBtn = e.target.closest('.map-download-btn');
            if (mapDlBtn) {
                e.stopPropagation();
                _handleMapDownload(mapDlBtn.dataset.sha);
                return;
            }

            // Series download
            const seriesDlBtn = e.target.closest('.series-download-btn');
            if (seriesDlBtn) {
                e.stopPropagation();
                _handleSeriesDownload(seriesDlBtn.dataset.seriesKey);
                return;
            }

            // Per-map delete
            const mapDelBtn = e.target.closest('.map-delete-btn');
            if (mapDelBtn) {
                e.stopPropagation();
                _handleMapDelete(mapDelBtn.dataset.sha);
                return;
            }

            // Series delete
            const seriesDelBtn = e.target.closest('.series-delete-btn');
            if (seriesDelBtn) {
                e.stopPropagation();
                _handleSeriesDelete(seriesDelBtn.dataset.seriesKey);
                return;
            }
        });

        // Listen for download progress events
        window.addEventListener('download-progress', _handleDownloadProgress);
    }

    /**
     * Load opponent logos asynchronously and update the DOM
     */
    async function _loadOpponentLogos(seriesList) {
        const tags = new Set();
        for (const s of seriesList) {
            const tag = s.maps[0].opponentTag;
            if (tag && tag !== 'unknown') tags.add(tag);
        }

        for (const tag of tags) {
            const info = await _getOpponentLogo(tag);
            if (info?.logoUrl) {
                document.querySelectorAll(`.opponent-logo[data-opponent="${tag}"]`).forEach(el => {
                    el.innerHTML = `<img src="${info.logoUrl}" class="w-5 h-5 rounded object-cover inline-block" alt="">`;
                });
            }
        }
    }

    /**
     * Handle per-map visibility toggle with optimistic UI
     */
    async function _handleRecordingVisibilityToggle(btn) {
        const demoSha256 = btn.dataset.sha;
        const currentVisibility = btn.dataset.visibility;
        const newVisibility = currentVisibility === 'public' ? 'private' : 'public';

        // Update local cache
        const rec = _recordings.find(r => r.id === demoSha256);
        if (rec) rec.visibility = newVisibility;
        _renderRecordingsList();

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
            _renderRecordingsList();
            ToastService.showError('Failed to update visibility');
        }
    }

    /**
     * Handle series-level visibility toggle (batch update all maps)
     */
    async function _handleSeriesVisibilityToggle(seriesKey) {
        const series = _groupIntoSeries(_recordings).find(s => s.key === seriesKey);
        if (!series) return;

        const allPublic = series.maps.every(m => m.visibility === 'public');
        const newVisibility = allPublic ? 'private' : 'public';

        // Optimistic update
        series.maps.forEach(m => {
            const rec = _recordings.find(r => r.id === m.id);
            if (rec) rec.visibility = newVisibility;
        });
        _renderRecordingsList();

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
            // Re-fetch to get accurate state
            _recordingsInitialized = false;
            _initRecordingsTab();
        }
    }

    /**
     * Handle per-map delete with confirmation
     */
    async function _handleMapDelete(demoSha256) {
        const rec = _recordings.find(r => r.id === demoSha256);
        if (!rec) return;

        const date = rec.recordedAt?.toDate ? rec.recordedAt.toDate() : new Date(rec.recordedAt || 0);
        const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
        const trackCount = rec.trackCount || rec.tracks?.length || 0;

        const confirmed = await showConfirmModal({
            title: 'Delete recording?',
            message: `<strong>${_escapeHtml(rec.mapName || 'Unknown map')}</strong> — ${dateStr}<br>${trackCount} audio track${trackCount !== 1 ? 's' : ''} will be permanently deleted.<br><br>This cannot be undone.`,
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
                _renderRecordingsList();
                ToastService.showSuccess('Recording deleted');
            }
        } catch (err) {
            console.error('Delete failed:', err);
            ToastService.showError('Failed to delete recording');
        }
    }

    /**
     * Handle series delete with confirmation (all maps)
     */
    async function _handleSeriesDelete(seriesKey) {
        const series = _groupIntoSeries(_recordings).find(s => s.key === seriesKey);
        if (!series) return;

        const firstMap = series.maps[0];
        const date = firstMap.recordedAt?.toDate ? firstMap.recordedAt.toDate() : new Date(firstMap.recordedAt || 0);
        const dateStr = date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
        const teamTag = _teamData?.teamTag || '';
        const opponentTag = firstMap.opponentTag || '';

        const mapList = series.maps.map(m => {
            const tc = m.trackCount || m.tracks?.length || 0;
            return `&bull; ${_escapeHtml(m.mapName || 'unknown')} (${tc} tracks)`;
        }).join('<br>');

        const confirmed = await showConfirmModal({
            title: 'Delete all recordings in this series?',
            message: `<strong>${_escapeHtml(teamTag)} vs ${_escapeHtml(opponentTag)}</strong> — ${dateStr}<br>${series.maps.length} map${series.maps.length !== 1 ? 's' : ''} will be permanently deleted:<br><br>${mapList}<br><br>This cannot be undone.`,
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
                _showDownloadProgress(`Deleting ${i + 1}/${idsToDelete.length}...`);
                const result = await fn({ demoSha256: idsToDelete[i] });
                if (!result.data.success) throw new Error('Failed for ' + idsToDelete[i]);
            }
            _showDownloadProgress(null);

            _recordings = _recordings.filter(r => !idsToDelete.includes(r.id));
            _expandedSeries.delete(seriesKey);
            _renderRecordingsList();
            ToastService.showSuccess('Series deleted');
        } catch (err) {
            console.error('Series delete failed:', err);
            _showDownloadProgress(null);
            ToastService.showError('Some deletions failed');
            _recordingsInitialized = false;
            _initRecordingsTab();
        }
    }

    /**
     * Handle per-map download
     */
    async function _handleMapDownload(demoSha256) {
        const rec = _recordings.find(r => r.id === demoSha256);
        if (!rec) return;

        try {
            await RecordingDownloadService.downloadMap(rec, _teamData?.teamName || '');
        } catch (err) {
            console.error('Download failed:', err);
            ToastService.showError('Download failed: ' + err.message);
        }
    }

    /**
     * Handle series download
     */
    async function _handleSeriesDownload(seriesKey) {
        const series = _groupIntoSeries(_recordings).find(s => s.key === seriesKey);
        if (!series) return;

        try {
            await RecordingDownloadService.downloadSeries(series.maps, _teamData?.teamName || '');
        } catch (err) {
            console.error('Series download failed:', err);
            ToastService.showError('Download failed: ' + err.message);
        }
    }

    /**
     * Show/hide download progress indicator
     */
    function _showDownloadProgress(message) {
        const el = document.getElementById('download-progress');
        if (!el) return;
        if (message) {
            el.textContent = message;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
            el.textContent = '';
        }
    }

    /**
     * Handle download-progress custom event from RecordingDownloadService
     */
    function _handleDownloadProgress(e) {
        _showDownloadProgress(e.detail?.message || null);
    }

    /**
     * Close the modal
     */
    function close() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = '';
        modalContainer.classList.add('hidden');

        // Clean up
        _teamId = null;
        _teamData = null;
        _isLeader = false;
        _isScheduler = false;
        _currentUserId = null;
        _botRegistration = undefined;
        _voiceBotInitialized = false;
        _recordingsInitialized = false;
        _recordings = [];
        _expandedSeries = new Set();
        _opponentLogoCache = {};

        // Remove download progress listener
        window.removeEventListener('download-progress', _handleDownloadProgress);

        if (_botRegUnsubscribe) {
            _botRegUnsubscribe();
            _botRegUnsubscribe = null;
        }

        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
    }

    // Public API
    return { show, close };
})();
