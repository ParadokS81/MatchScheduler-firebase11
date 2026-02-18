// QuickAddMatchModal.js - Quick-add a pre-arranged match (bypasses proposal workflow)
// Slice 18.0: Trust-based match entry for externally-scheduled games
// Following KickPlayerModal pattern: Revealing Module, modal-container, ESC/backdrop close

const QuickAddMatchModal = (function() {
    'use strict';

    let _schedulerTeamIds = [];
    let _selectedGameType = 'official';
    let _selectedOpponentId = '';
    let _keydownHandler = null;
    let _dropdownOpen = false;

    /**
     * Show the quick-add match modal.
     * @param {string[]} schedulerTeamIds - Team IDs where user is leader/scheduler
     */
    function show(schedulerTeamIds) {
        if (!schedulerTeamIds || schedulerTeamIds.length === 0) {
            ToastService.showError('No teams with scheduler permissions');
            return;
        }

        _schedulerTeamIds = schedulerTeamIds;
        _selectedGameType = 'official';
        _renderModal();
    }

    function _renderModal() {
        const autoTeamId = _schedulerTeamIds.length === 1 ? _schedulerTeamIds[0] : null;
        const tzLabel = TimezoneService.getTimezoneAbbreviation();

        // Build time options (30-min intervals, 12:00–23:30 in user's local time)
        const timeOptions = [];
        for (let h = 12; h < 24; h++) {
            timeOptions.push(`${String(h).padStart(2, '0')}:00`);
            timeOptions.push(`${String(h).padStart(2, '0')}:30`);
        }
        const timeOptionsHtml = timeOptions.map(t =>
            `<option value="${t}"${t === '21:00' ? ' selected' : ''}>${t}</option>`
        ).join('');

        // Build team selector (only if user is scheduler on 2 teams)
        let teamSelectorHtml;
        if (_schedulerTeamIds.length > 1) {
            const opts = _schedulerTeamIds.map(tid => {
                const t = TeamService.getTeamFromCache(tid);
                return `<option value="${tid}">${_escapeHtml(t?.teamName || tid)}</option>`;
            }).join('');
            teamSelectorHtml = `
                <div>
                    <label class="block text-xs text-muted-foreground mb-1">Your team</label>
                    <select id="qa-team" class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground">
                        ${opts}
                    </select>
                </div>
            `;
        } else {
            teamSelectorHtml = `<input type="hidden" id="qa-team" value="${autoTeamId}">`;
        }

        // Build opponent dropdown (populated via _populateOpponents)
        const modalHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="qa-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-sm font-semibold text-foreground">Quick Add Match</h2>
                        <button id="qa-close-btn"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 space-y-3">
                        ${teamSelectorHtml}

                        <div class="relative">
                            <label class="block text-xs text-muted-foreground mb-1">Opponent</label>
                            <input type="hidden" id="qa-opponent" value="">
                            <button type="button" id="qa-opponent-trigger"
                                class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-left flex items-center justify-between text-muted-foreground">
                                <span id="qa-opponent-label">Select opponent...</span>
                                <svg class="w-4 h-4 shrink-0 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </button>
                            <div id="qa-opponent-dropdown"
                                 class="hidden absolute z-10 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto scrollbar-thin">
                                <!-- Populated by _populateOpponents -->
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs text-muted-foreground mb-1">Date</label>
                            <input type="date" id="qa-date"
                                   class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground"
                                   min="${_todayISO()}">
                        </div>

                        <div>
                            <label class="block text-xs text-muted-foreground mb-1">Time (${_escapeHtml(tzLabel)})</label>
                            <select id="qa-time" class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground">
                                ${timeOptionsHtml}
                            </select>
                        </div>

                        <div>
                            <label class="block text-xs text-muted-foreground mb-1">Type</label>
                            <div class="flex gap-2">
                                <button id="qa-type-official"
                                    class="flex-1 px-3 py-1.5 rounded text-xs font-medium border border-green-500/50 bg-green-500/20 text-green-400 transition-colors">
                                    Official
                                </button>
                                <button id="qa-type-practice"
                                    class="flex-1 px-3 py-1.5 rounded text-xs font-medium border border-border text-muted-foreground transition-colors">
                                    Practice
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-4 border-t border-border">
                        <button id="qa-submit-btn"
                            class="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            disabled>
                            Add Match
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = modalHTML;
        modalContainer.classList.remove('hidden');

        _populateOpponents();
        _attachListeners();
    }

    function _attachListeners() {
        const backdrop = document.getElementById('qa-modal-backdrop');
        const closeBtn = document.getElementById('qa-close-btn');
        const teamSelect = document.getElementById('qa-team');
        const opponentTrigger = document.getElementById('qa-opponent-trigger');
        const opponentDropdown = document.getElementById('qa-opponent-dropdown');
        const dateInput = document.getElementById('qa-date');
        const officialBtn = document.getElementById('qa-type-official');
        const practiceBtn = document.getElementById('qa-type-practice');
        const submitBtn = document.getElementById('qa-submit-btn');

        // Close handlers
        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);

        // ESC to close (dropdown first, then modal)
        _keydownHandler = (e) => {
            if (e.key === 'Escape') {
                if (_dropdownOpen) {
                    _closeOpponentDropdown();
                } else {
                    close();
                }
            }
        };
        document.addEventListener('keydown', _keydownHandler);

        // Team change → refresh opponent list
        if (teamSelect && teamSelect.type !== 'hidden') {
            teamSelect.addEventListener('change', () => {
                _populateOpponents();
                _validateForm();
            });
        }

        // Custom opponent dropdown
        opponentTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleOpponentDropdown();
        });

        opponentDropdown?.addEventListener('click', (e) => {
            const row = e.target.closest('.qa-opponent-row');
            if (row) {
                _selectOpponent(row.dataset.teamId, row.dataset.teamName);
            }
        });

        // Close dropdown when clicking elsewhere in modal body
        document.getElementById('qa-modal-backdrop')?.addEventListener('click', (e) => {
            if (_dropdownOpen && !e.target.closest('#qa-opponent-trigger') && !e.target.closest('#qa-opponent-dropdown')) {
                _closeOpponentDropdown();
            }
        }, true);

        // Form validation on change
        dateInput?.addEventListener('change', _validateForm);

        // Game type toggle
        officialBtn?.addEventListener('click', () => {
            _selectedGameType = 'official';
            officialBtn.className = 'flex-1 px-3 py-1.5 rounded text-xs font-medium border border-green-500/50 bg-green-500/20 text-green-400 transition-colors';
            practiceBtn.className = 'flex-1 px-3 py-1.5 rounded text-xs font-medium border border-border text-muted-foreground transition-colors';
        });
        practiceBtn?.addEventListener('click', () => {
            _selectedGameType = 'practice';
            practiceBtn.className = 'flex-1 px-3 py-1.5 rounded text-xs font-medium border border-amber-500/50 bg-amber-500/20 text-amber-400 transition-colors';
            officialBtn.className = 'flex-1 px-3 py-1.5 rounded text-xs font-medium border border-border text-muted-foreground transition-colors';
        });

        // Submit
        submitBtn?.addEventListener('click', _handleSubmit);
    }

    /**
     * Populate custom opponent dropdown with table-aligned rows.
     */
    function _populateOpponents() {
        const dropdown = document.getElementById('qa-opponent-dropdown');
        if (!dropdown) return;

        const allTeams = TeamService.getAllTeams();
        const opponents = allTeams
            .filter(t => !_schedulerTeamIds.includes(t.id) && t.status === 'active')
            .sort((a, b) => a.teamName.localeCompare(b.teamName));

        dropdown.innerHTML = opponents.map(t => {
            const logo = t.activeLogo?.urls?.small;
            return `
                <div class="qa-opponent-row flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                     data-team-id="${t.id}" data-team-name="${_escapeHtml(t.teamName)}">
                    ${logo
                        ? `<img src="${logo}" class="w-5 h-5 rounded-sm object-cover shrink-0" alt="">`
                        : `<span class="w-5 h-5 shrink-0"></span>`}
                    <span class="text-sm text-foreground truncate flex-1">${_escapeHtml(t.teamName)}</span>
                    <span class="text-xs text-muted-foreground font-mono shrink-0 min-w-[3rem] text-right">${_escapeHtml(t.teamTag || '')}</span>
                </div>
            `;
        }).join('');

        // Reset selection when opponents change
        _selectedOpponentId = '';
        document.getElementById('qa-opponent').value = '';
        const label = document.getElementById('qa-opponent-label');
        if (label) {
            label.textContent = 'Select opponent...';
            label.classList.add('text-muted-foreground');
            label.classList.remove('text-foreground');
        }
    }

    /**
     * Toggle custom opponent dropdown open/closed.
     */
    function _toggleOpponentDropdown() {
        const dropdown = document.getElementById('qa-opponent-dropdown');
        if (!dropdown) return;
        _dropdownOpen = !_dropdownOpen;
        dropdown.classList.toggle('hidden', !_dropdownOpen);
    }

    /**
     * Close custom opponent dropdown.
     */
    function _closeOpponentDropdown() {
        const dropdown = document.getElementById('qa-opponent-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        _dropdownOpen = false;
    }

    /**
     * Select an opponent from the custom dropdown.
     */
    function _selectOpponent(teamId, teamName) {
        _selectedOpponentId = teamId;
        document.getElementById('qa-opponent').value = teamId;
        const label = document.getElementById('qa-opponent-label');
        if (label) {
            label.textContent = teamName;
            label.classList.remove('text-muted-foreground');
            label.classList.add('text-foreground');
        }
        _closeOpponentDropdown();
        _validateForm();
    }

    /**
     * Enable submit button only when all required fields are filled.
     */
    function _validateForm() {
        const teamId = document.getElementById('qa-team')?.value;
        const opponentId = document.getElementById('qa-opponent')?.value;
        const date = document.getElementById('qa-date')?.value;
        const submitBtn = document.getElementById('qa-submit-btn');

        if (submitBtn) {
            submitBtn.disabled = !(teamId && opponentId && date);
        }
    }

    /**
     * Handle form submission — call Cloud Function.
     */
    async function _handleSubmit() {
        const submitBtn = document.getElementById('qa-submit-btn');
        if (!submitBtn) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="flex items-center justify-center gap-2"><span class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>Adding...</span>';

        try {
            const teamId = document.getElementById('qa-team').value;
            const opponentTeamId = document.getElementById('qa-opponent').value;
            const date = document.getElementById('qa-date').value;
            const time = document.getElementById('qa-time').value;

            // Build a Date in the user's local timezone, then convert to ISO 8601 UTC
            const dateTime = _localToUTC(date, time);

            const result = await ScheduledMatchService.quickAddMatch({
                teamId,
                opponentTeamId,
                dateTime,
                gameType: _selectedGameType
            });

            if (result.success) {
                ToastService.showSuccess('Match added!');
                close();
            } else {
                ToastService.showError(result.error || 'Failed to add match');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Add Match';
            }
        } catch (error) {
            console.error('Quick add match failed:', error);
            ToastService.showError('Network error — please try again');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Match';
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    /**
     * Convert local date + time string to UTC ISO 8601.
     * Uses the user's timezone from TimezoneService.
     * @param {string} dateStr - "2026-02-22"
     * @param {string} timeStr - "21:00"
     * @returns {string} ISO 8601 UTC string, e.g., "2026-02-22T20:00:00.000Z"
     */
    function _localToUTC(dateStr, timeStr) {
        // Treat local datetime as UTC, then shift by the user's timezone offset.
        // E.g., "21:00 CET (UTC+1)" → parse as "21:00 UTC" → subtract +60min → "20:00 UTC"
        const localStr = `${dateStr}T${timeStr}:00`;
        const offsetMinutes = TimezoneService.getOffsetMinutes(new Date(localStr));
        const asUtc = new Date(localStr + 'Z');
        asUtc.setUTCMinutes(asUtc.getUTCMinutes() - offsetMinutes);
        return asUtc.toISOString();
    }

    /**
     * Get today's date as ISO string (YYYY-MM-DD) in user's local timezone.
     */
    function _todayISO() {
        const tz = TimezoneService.getUserTimezone();
        const now = new Date();
        // Format today in user's timezone
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
        return parts; // en-CA uses YYYY-MM-DD format
    }

    function _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function close() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = '';
        modalContainer.classList.add('hidden');
        _schedulerTeamIds = [];
        _selectedGameType = 'official';
        _selectedOpponentId = '';
        _dropdownOpen = false;

        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
    }

    return { show, close };
})();
