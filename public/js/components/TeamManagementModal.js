// TeamManagementModal.js - Modal for team settings and management actions
// Following CLAUDE.md architecture: Revealing Module Pattern
// Slice 6.0a - Replaces TeamManagementDrawer with a cleaner modal UI

const TeamManagementModal = (function() {
    'use strict';

    // Private variables
    let _teamId = null;
    let _teamData = null;
    let _isLeader = false;
    let _currentUserId = null;
    let _keydownHandler = null;

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

        // Determine if current user is leader
        _isLeader = _teamData.playerRoster.some(
            p => p.userId === _currentUserId && p.role === 'leader'
        );

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
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 id="team-management-title" class="text-lg font-semibold text-foreground">
                            Team Settings
                        </h2>
                        <button id="team-management-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1"
                                aria-label="Close">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
                        ${_renderLogoAndDetailsSection()}

                        ${_isLeader ? _renderSchedulerSection() : ''}

                        ${_isLeader ? _renderPrivacySection() : ''}

                        <hr class="border-border">

                        ${_isLeader ? _renderLeaderActions() : ''}
                        ${_renderLeaveTeamSection()}
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

        const tagRow = _isLeader ? `
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-foreground whitespace-nowrap w-12">Tag</label>
                <input type="text" id="team-tag-input" value="${_escapeHtml(_teamData.teamTag)}"
                       maxlength="4" class="w-16 px-2 py-1 bg-muted border border-border rounded-lg text-sm font-mono text-foreground text-center"/>
                <button id="save-team-tag-btn"
                        class="px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-colors hidden">
                    Save
                </button>
                <span id="team-tag-feedback" class="text-xs"></span>
            </div>
        ` : `
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
                    ${joinCodeRow}
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

    /**
     * Handle team tag input changes — show/hide Save button
     */
    function _handleTeamTagInput() {
        const input = document.getElementById('team-tag-input');
        const saveBtn = document.getElementById('save-team-tag-btn');
        const feedback = document.getElementById('team-tag-feedback');
        const newTag = input.value.trim();

        // Show Save button only when value differs from current
        if (newTag !== _teamData.teamTag) {
            saveBtn.classList.remove('hidden');
        } else {
            saveBtn.classList.add('hidden');
        }
        // Clear any previous feedback
        feedback.textContent = '';
        feedback.className = 'text-xs';
    }

    /**
     * Handle saving team tag
     */
    async function _handleSaveTeamTag() {
        const input = document.getElementById('team-tag-input');
        const saveBtn = document.getElementById('save-team-tag-btn');
        const feedback = document.getElementById('team-tag-feedback');
        const newTag = input.value.trim();

        // Client-side validation
        const error = TeamService.validateTeamTag(newTag);
        if (error) {
            feedback.textContent = error;
            feedback.className = 'text-xs text-destructive';
            return;
        }

        // Loading state
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const result = await TeamService.callFunction('updateTeamSettings', {
                teamId: _teamId,
                teamTag: newTag
            });

            if (result.success) {
                _teamData.teamTag = newTag;
                saveBtn.classList.add('hidden');
                feedback.textContent = 'Saved!';
                feedback.className = 'text-xs text-green-500';
            } else {
                feedback.textContent = result.error || 'Failed to save. Please try again.';
                feedback.className = 'text-xs text-destructive';
            }
        } catch (error) {
            console.error('Error saving team tag:', error);
            feedback.textContent = 'Failed to save. Please try again.';
            feedback.className = 'text-xs text-destructive';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
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
            <div class="pt-2">
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

        // Copy join code
        const copyBtn = document.getElementById('copy-join-code-btn');
        copyBtn?.addEventListener('click', _handleCopyJoinCode);

        // Regenerate join code (leader only)
        const regenerateBtn = document.getElementById('regenerate-join-code-btn');
        regenerateBtn?.addEventListener('click', _handleRegenerateJoinCode);

        // Team tag edit (leader only)
        const teamTagInput = document.getElementById('team-tag-input');
        teamTagInput?.addEventListener('input', _handleTeamTagInput);
        const saveTeamTagBtn = document.getElementById('save-team-tag-btn');
        saveTeamTagBtn?.addEventListener('click', _handleSaveTeamTag);

        // Max players select (leader only)
        const maxPlayersSelect = document.getElementById('max-players-select');
        maxPlayersSelect?.addEventListener('change', _handleMaxPlayersChange);

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
     * Handle manage logo - opens LogoUploadModal
     */
    function _handleManageLogo() {
        close();

        if (typeof LogoUploadModal !== 'undefined') {
            LogoUploadModal.show(_teamId, _currentUserId);
        } else {
            console.error('LogoUploadModal not loaded');
            ToastService.showError('Logo upload not available');
        }
    }

    /**
     * Handle remove player - opens KickPlayerModal
     */
    function _handleRemovePlayer() {
        close();

        if (typeof KickPlayerModal !== 'undefined') {
            KickPlayerModal.show(_teamId);
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
        _currentUserId = null;

        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
    }

    // Public API
    return { show, close };
})();
