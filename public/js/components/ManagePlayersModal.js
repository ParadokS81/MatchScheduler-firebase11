// ManagePlayersModal.js - Manage team roster and Discord phantom members
// Following CLAUDE.md architecture: Revealing Module Pattern
// Phase D5: Discord Roster Management UI

const ManagePlayersModal = (function() {
    'use strict';

    let _teamId = null;
    let _teamData = null;
    let _botRegistration = null;
    let _keydownHandler = null;

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    /**
     * Show the modal for a given team.
     * @param {string} teamId
     */
    function show(teamId) {
        _teamId = teamId;
        _teamData = TeamService.getTeamFromCache(teamId);
        _botRegistration = BotRegistrationService.getCachedRegistration(teamId);

        if (!_teamData) {
            ToastService.showError('Team data not available');
            return;
        }

        _render();
        _attachListeners();
    }

    // ---------------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------------

    function _render() {
        const roster = _teamData?.playerRoster || [];
        const guildMembers = _botRegistration?.guildMembers || {};
        const knownPlayers = _botRegistration?.knownPlayers || {};
        const rosterDiscordIds = new Set(
            roster.map(p => p.discordUserId).filter(Boolean)
        );
        // knownPlayers maps Discord IDs → QW names for members who ran /register
        const knownDiscordIds = new Set(Object.keys(knownPlayers));

        // Available = guild members not on roster, not already known, not bots
        const available = Object.entries(guildMembers)
            .filter(([id, m]) => !m.isBot && !rosterDiscordIds.has(id) && !knownDiscordIds.has(id))
            .map(([id, m]) => ({ discordUserId: id, ...m }));

        const maxPlayers = _teamData?.maxPlayers || 8;
        const guildName = _botRegistration?.guildName || 'Discord server';

        const availableHtml = available.length > 0
            ? `<div>
                <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Add from Discord
                </h4>
                <p class="text-xs text-muted-foreground mb-2">
                    Members of &ldquo;${_escapeHtml(guildName)}&rdquo; not yet on roster:
                </p>
                <div class="space-y-1">
                    ${available.map(m => _renderAvailableMember(m)).join('')}
                </div>
            </div>`
            : `<p class="text-sm text-muted-foreground">All Discord server members are already on the roster.</p>`;

        const modalHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="manage-players-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md flex flex-col"
                     style="max-height: 80vh;">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border shrink-0">
                        <h2 class="text-lg font-semibold text-foreground">Manage Players</h2>
                        <button id="manage-players-close"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 overflow-y-auto space-y-5">
                        <!-- Current Roster -->
                        <div>
                            <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                Roster (${roster.length}/${maxPlayers})
                            </h4>
                            <div class="space-y-1">
                                ${roster.map(p => _renderRosterEntry(p)).join('')}
                            </div>
                        </div>

                        <!-- Available Discord members -->
                        ${availableHtml}
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('modal-container');
        container.innerHTML = modalHTML;
        container.classList.remove('hidden');
    }

    function _renderRosterEntry(player) {
        const avatar = player.photoURL
            ? `<img src="${_escapeHtml(player.photoURL)}" class="w-8 h-8 rounded-full object-cover shrink-0" alt="">`
            : `<div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">${_escapeHtml(player.initials || '?')}</div>`;

        const phantomBadge = player.isPhantom
            ? `<span class="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-medium">Invited</span>`
            : '';

        const roleLabel = player.role === 'leader'
            ? `<span class="text-xs text-muted-foreground">Leader</span>`
            : '';

        const removeBtn = player.isPhantom
            ? `<button class="remove-phantom-btn text-xs text-destructive hover:text-destructive/80 transition-colors"
                   data-user-id="${_escapeHtml(player.userId)}">Remove</button>`
            : '';

        return `
            <div class="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                <div class="flex items-center gap-2 min-w-0">
                    ${avatar}
                    <span class="text-sm text-foreground truncate">${_escapeHtml(player.displayName)}</span>
                    ${phantomBadge}
                </div>
                <div class="flex items-center gap-2 shrink-0 ml-2">
                    ${roleLabel}
                    ${removeBtn}
                </div>
            </div>
        `;
    }

    function _renderAvailableMember(member) {
        const avatar = member.avatarUrl
            ? `<img src="${_escapeHtml(member.avatarUrl)}" class="w-8 h-8 rounded-full object-cover shrink-0" alt="">`
            : `<div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">?</div>`;

        return `
            <div class="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                <div class="flex items-center gap-2 min-w-0">
                    ${avatar}
                    <span class="text-sm text-foreground truncate">${_escapeHtml(member.displayName || member.username || 'Unknown')}</span>
                </div>
                <button class="add-phantom-btn text-xs px-2.5 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors shrink-0 ml-2"
                        data-discord-id="${_escapeHtml(member.discordUserId)}"
                        data-display-name="${_escapeHtml(member.displayName || member.username || '')}">
                    + Add
                </button>
            </div>
        `;
    }

    // ---------------------------------------------------------------------------
    // Listeners
    // ---------------------------------------------------------------------------

    function _attachListeners() {
        const backdrop = document.getElementById('manage-players-backdrop');
        const closeBtn = document.getElementById('manage-players-close');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);

        _keydownHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', _keydownHandler);

        // Add phantom — delegate from body
        const container = document.getElementById('modal-container');

        container.querySelectorAll('.add-phantom-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const discordId = e.currentTarget.dataset.discordId;
                const discordName = e.currentTarget.dataset.displayName;
                await _handleAddPhantom(discordId, discordName);
            });
        });

        container.querySelectorAll('.remove-phantom-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.currentTarget.dataset.userId;
                await _handleRemovePhantom(userId);
            });
        });
    }

    // ---------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------

    async function _handleAddPhantom(discordUserId, discordDisplayName) {
        const qwNick = prompt(`QW nick for ${discordDisplayName}:`, discordDisplayName);
        if (!qwNick || qwNick.trim().length < 2) return;

        const btn = document.querySelector(`.add-phantom-btn[data-discord-id="${CSS.escape(discordUserId)}"]`);
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Adding…';
        }

        try {
            const result = await TeamService.callFunction('addPhantomMember', {
                teamId: _teamId,
                discordUserId: discordUserId,
                displayName: qwNick.trim(),
            });

            if (result.success) {
                ToastService.showSuccess(`Added ${_escapeHtml(qwNick.trim())} to roster`);
                // Optimistic local update — cache hasn't been refreshed by listener yet
                const guildMember = (_botRegistration?.guildMembers || {})[discordUserId] || {};
                const trimmedNick = qwNick.trim();
                const initials = trimmedNick.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 3) || 'USR';
                _teamData = {
                    ..._teamData,
                    playerRoster: [...(_teamData?.playerRoster || []), {
                        userId: result.userId,
                        displayName: trimmedNick,
                        initials: initials,
                        photoURL: guildMember.avatarUrl || null,
                        joinedAt: new Date(),
                        role: 'member',
                        isPhantom: true,
                        discordUserId: discordUserId,
                    }],
                };
                _render();
                _attachListeners();
            } else {
                ToastService.showError(result.error || 'Failed to add member');
                if (btn) { btn.disabled = false; btn.textContent = '+ Add'; }
            }
        } catch (err) {
            ToastService.showError(err.message || 'Failed to add member');
            if (btn) { btn.disabled = false; btn.textContent = '+ Add'; }
        }
    }

    async function _handleRemovePhantom(userId) {
        const player = (_teamData?.playerRoster || []).find(p => p.userId === userId);
        if (!player) return;

        const confirmed = confirm(`Remove ${player.displayName} from the roster? This will delete their pending account.`);
        if (!confirmed) return;

        const btn = document.querySelector(`.remove-phantom-btn[data-user-id="${CSS.escape(userId)}"]`);
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Removing…';
        }

        try {
            const result = await TeamService.callFunction('removePhantomMember', {
                teamId: _teamId,
                userId: userId,
            });

            if (result.success) {
                ToastService.showSuccess(`Removed ${player.displayName}`);
                // Optimistic local update — cache hasn't been refreshed by listener yet
                _teamData = {
                    ..._teamData,
                    playerRoster: (_teamData?.playerRoster || []).filter(p => p.userId !== userId),
                };
                _render();
                _attachListeners();
            } else {
                ToastService.showError(result.error || 'Failed to remove member');
                if (btn) { btn.disabled = false; btn.textContent = 'Remove'; }
            }
        } catch (err) {
            ToastService.showError(err.message || 'Failed to remove member');
            if (btn) { btn.disabled = false; btn.textContent = 'Remove'; }
        }
    }

    // ---------------------------------------------------------------------------
    // Close
    // ---------------------------------------------------------------------------

    function close() {
        const container = document.getElementById('modal-container');
        container.innerHTML = '';
        container.classList.add('hidden');

        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }

        _teamId = null;
        _teamData = null;
        _botRegistration = null;
    }

    return { show, close };
})();
