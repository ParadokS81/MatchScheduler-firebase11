// ComparisonModal.js - Shows detailed roster comparison for a matched time slot
// Slice 4.2: Enhanced Comparison Modal with VS Layout and Logos
// Following CLAUDE.md architecture: Revealing Module Pattern

const ComparisonModal = (function() {
    'use strict';

    let _container = null;
    let _isOpen = false;
    let _keydownHandler = null;
    let _selectedOpponentIndex = 0;
    let _currentData = null; // Store current modal data for re-rendering

    /**
     * Escape HTML to prevent XSS
     */
    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format slot ID for display (e.g., "mon_1900" → "Monday at 19:00")
     */
    function _formatSlot(slotId) {
        const [day, time] = slotId.split('_');
        const dayNames = {
            mon: 'Monday',
            tue: 'Tuesday',
            wed: 'Wednesday',
            thu: 'Thursday',
            fri: 'Friday',
            sat: 'Saturday',
            sun: 'Sunday'
        };
        const formattedDay = dayNames[day] || day;
        const formattedTime = `${time.slice(0, 2)}:${time.slice(2)}`;
        return `${formattedDay} at ${formattedTime}`;
    }

    /**
     * Fetch Discord info for multiple leaders
     */
    async function _fetchLeaderDiscordInfo(leaderIds) {
        const info = {};
        for (const leaderId of leaderIds) {
            const discordInfo = await _getUserDiscordInfo(leaderId);
            if (discordInfo) {
                info[leaderId] = discordInfo;
            }
        }
        return info;
    }

    /**
     * Get Discord info for a user
     */
    async function _getUserDiscordInfo(userId) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', userId));

            if (!userDoc.exists()) return null;

            const data = userDoc.data();

            if (data.discordUsername) {
                return {
                    discordUsername: data.discordUsername,
                    discordUserId: data.discordUserId || null
                };
            }

            if (data.discordTag) {
                return {
                    discordUsername: data.discordTag,
                    discordUserId: null
                };
            }

            return null;
        } catch (error) {
            console.error('Error fetching user Discord info:', error);
            return null;
        }
    }

    /**
     * Get team logo URL or null
     */
    function _getTeamLogo(teamId, size = 'medium') {
        const team = TeamService.getTeamFromCache(teamId);
        return team?.activeLogo?.urls?.[size] || null;
    }

    /**
     * Render the logo or fallback to team tag
     * Sizes: 'small' (tabs), 'medium' (cards - same as TeamInfo panel)
     */
    function _renderLogo(teamId, teamTag, size = 'medium') {
        // Use 'large' logos for medium display, 'small' for tabs
        const logoSize = size === 'small' ? 'small' : 'large';
        const logoUrl = _getTeamLogo(teamId, logoSize);

        // Match TeamInfo panel: w-32 h-32 (8rem) for cards, w-8 h-8 for tabs
        const sizeClasses = size === 'small' ? 'w-8 h-8' : 'w-32 h-32';

        if (logoUrl) {
            return `<img src="${logoUrl}" alt="${_escapeHtml(teamTag)}" class="${sizeClasses} rounded-lg object-cover">`;
        }

        // Fallback to team tag
        const tagSizeClass = size === 'small' ? 'text-xs' : 'text-2xl';
        return `
            <div class="${sizeClasses} rounded-lg bg-muted flex items-center justify-center border border-border">
                <span class="${tagSizeClass} font-bold text-muted-foreground">${_escapeHtml(teamTag)}</span>
            </div>
        `;
    }

    /**
     * Render player roster with dot indicators
     */
    function _renderRoster(availablePlayers, unavailablePlayers) {
        const availableHtml = availablePlayers.map(p => {
            const name = p.displayName || p.initials || '?';
            return `
                <div class="flex items-center gap-2 py-0.5">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: oklch(0.60 0.18 145);"></span>
                    <span class="text-sm text-foreground">${_escapeHtml(name)}</span>
                </div>
            `;
        }).join('');

        const unavailableHtml = unavailablePlayers.map(p => {
            const name = p.displayName || p.initials || '?';
            return `
                <div class="flex items-center gap-2 py-0.5">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: oklch(0.5 0.02 260); opacity: 0.5;"></span>
                    <span class="text-sm text-muted-foreground">${_escapeHtml(name)}</span>
                </div>
            `;
        }).join('');

        return availableHtml + unavailableHtml;
    }

    /**
     * Render contact section for opponent
     */
    function _renderContactSection(discordInfo) {
        if (!discordInfo || !discordInfo.discordUsername) {
            return `
                <div class="mt-3 pt-3 border-t border-border">
                    <p class="text-xs text-muted-foreground">Leader hasn't linked Discord</p>
                </div>
            `;
        }

        const discordIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>`;

        let buttonsHtml = '';

        if (discordInfo.discordUserId) {
            buttonsHtml += `
                <a href="discord://users/${discordInfo.discordUserId}"
                   class="btn btn-sm bg-[#5865F2] hover:bg-[#4752C4] text-white">
                    ${discordIcon}
                    <span class="ml-1">Open DM</span>
                </a>
            `;
        }

        buttonsHtml += `
            <button class="btn btn-sm ${discordInfo.discordUserId ? 'btn-secondary' : 'bg-[#5865F2] hover:bg-[#4752C4] text-white'} copy-discord-btn"
                    data-username="${_escapeHtml(discordInfo.discordUsername)}">
                ${discordInfo.discordUserId ? '' : discordIcon}
                <span class="${discordInfo.discordUserId ? '' : 'ml-1'}">@${_escapeHtml(discordInfo.discordUsername)}</span>
            </button>
        `;

        return `
            <div class="mt-3 pt-3 border-t border-border">
                <p class="text-xs text-muted-foreground mb-2">Contact Leader</p>
                <div class="flex items-center gap-2 flex-wrap">
                    ${buttonsHtml}
                </div>
            </div>
        `;
    }

    /**
     * Render a team card (used for both user team and opponent)
     */
    function _renderTeamCard(teamId, teamTag, teamName, availablePlayers, unavailablePlayers, isUserTeam, discordInfo, showContact) {
        const contactSection = (!isUserTeam && showContact) ? _renderContactSection(discordInfo) : '';

        return `
            <div class="vs-team-card">
                <!-- Logo -->
                <div class="flex justify-center mb-3">
                    ${_renderLogo(teamId, teamTag, 'medium')}
                </div>

                <!-- Team Name - single line: [TAG] Team Name -->
                <div class="text-center mb-3">
                    <div class="flex items-center justify-center">
                        <span class="text-sm font-mono text-primary font-bold">[${_escapeHtml(teamTag)}]</span>
                        <span class="font-semibold text-foreground ml-2">${_escapeHtml(teamName)}</span>
                    </div>
                </div>

                <!-- Roster -->
                <div class="vs-roster">
                    ${_renderRoster(availablePlayers, unavailablePlayers)}
                </div>

                ${contactSection}
            </div>
        `;
    }

    /**
     * Render opponent selector tabs for header (right side)
     */
    function _renderOpponentSelectorForHeader(matches) {
        if (matches.length <= 1) return '';

        const tabs = matches.map((match, index) => {
            const isActive = index === _selectedOpponentIndex;
            const activeClass = isActive ? 'opponent-tab-active' : '';
            const logoHtml = _renderLogo(match.teamId, match.teamTag, 'small');

            return `
                <button class="opponent-tab ${activeClass}" data-opponent-index="${index}" title="${_escapeHtml(match.teamName)}">
                    ${logoHtml}
                </button>
            `;
        }).join('');

        return `
            <div class="opponent-tabs">
                ${tabs}
            </div>
        `;
    }

    /**
     * Render the full modal with VS layout
     */
    function _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo) {
        const formattedSlot = _formatSlot(slotId);
        const selectedMatch = matches[_selectedOpponentIndex] || matches[0];

        // Get user's team ID from TeamService or userTeamInfo
        const userTeamId = userTeamInfo.teamId;

        const html = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="comparison-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                    <!-- Header: match info left, opponent selector right -->
                    <div class="flex items-center justify-between p-4 border-b border-border shrink-0">
                        <!-- Left: Match Details - single line -->
                        <h2 class="text-lg font-semibold text-foreground">
                            Match Details <span class="text-muted-foreground font-normal">— ${formattedSlot}</span>
                        </h2>
                        <!-- Right: Opponent selector + close button -->
                        <div class="flex items-center gap-4">
                            ${_renderOpponentSelectorForHeader(matches)}
                            <button id="comparison-modal-close"
                                    class="text-muted-foreground hover:text-foreground transition-colors p-1">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Body - VS Layout -->
                    <div class="p-4 overflow-y-auto flex-1">
                        <!-- VS Container -->
                        <div class="vs-container">
                            <!-- User Team (Left) -->
                            ${_renderTeamCard(
                                userTeamId,
                                userTeamInfo.teamTag,
                                userTeamInfo.teamName,
                                userTeamInfo.availablePlayers,
                                userTeamInfo.unavailablePlayers,
                                true,
                                null,
                                false
                            )}

                            <!-- VS Divider -->
                            <div class="vs-divider">
                                <span class="vs-text">VS</span>
                            </div>

                            <!-- Opponent Team Card -->
                            ${_renderTeamCard(
                                selectedMatch.teamId,
                                selectedMatch.teamTag,
                                selectedMatch.teamName,
                                selectedMatch.availablePlayers,
                                selectedMatch.unavailablePlayers,
                                false,
                                isLeader ? leaderDiscordInfo[selectedMatch.leaderId] : null,
                                isLeader
                            )}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-4 border-t border-border shrink-0">
                        <button id="comparison-modal-done" class="btn btn-primary w-full">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (!_container) {
            _container = document.createElement('div');
            _container.id = 'comparison-modal-container';
            document.body.appendChild(_container);
        }

        _container.innerHTML = html;
        _attachListeners();
        _isOpen = true;
    }

    /**
     * Attach event listeners to modal elements
     */
    function _attachListeners() {
        const backdrop = document.getElementById('comparison-modal-backdrop');
        const closeBtn = document.getElementById('comparison-modal-close');
        const doneBtn = document.getElementById('comparison-modal-done');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);
        doneBtn?.addEventListener('click', close);

        // Opponent tab clicks
        document.querySelectorAll('.opponent-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const index = parseInt(tab.dataset.opponentIndex, 10);
                if (index !== _selectedOpponentIndex && _currentData) {
                    _selectedOpponentIndex = index;
                    // Re-render with new selection
                    _renderModal(
                        _currentData.weekId,
                        _currentData.slotId,
                        _currentData.userTeamInfo,
                        _currentData.matches,
                        _currentData.isLeader,
                        _currentData.leaderDiscordInfo
                    );
                }
            });
        });

        // Copy buttons
        document.querySelectorAll('.copy-discord-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const username = btn.dataset.username;
                try {
                    await navigator.clipboard.writeText(username);
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg><span class="ml-1">Copied!</span>`;
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        });

        // ESC key to close
        _keydownHandler = (e) => {
            if (e.key === 'Escape' && _isOpen) close();
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    /**
     * Show the comparison modal for a specific slot
     */
    async function show(weekId, slotId) {
        if (typeof ComparisonEngine === 'undefined') {
            console.error('ComparisonModal: ComparisonEngine not available');
            return;
        }

        // Reset selection
        _selectedOpponentIndex = 0;

        // Get data from ComparisonEngine cache (instant)
        const userTeamInfo = ComparisonEngine.getUserTeamInfo(weekId, slotId);
        const matches = ComparisonEngine.getSlotMatches(weekId, slotId);

        if (!userTeamInfo || matches.length === 0) {
            console.warn('No match data available for slot');
            return;
        }

        // Check if current user is a leader
        const currentUser = AuthService.getCurrentUser();
        const currentUserId = currentUser?.uid;
        const isLeader = userTeamInfo.leaderId === currentUserId;

        // Store data for re-renders (tab switching)
        _currentData = {
            weekId,
            slotId,
            userTeamInfo,
            matches,
            isLeader,
            leaderDiscordInfo: {}
        };

        // Render modal immediately
        _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, {});

        // If user is a leader, fetch leader Discord info async
        if (isLeader) {
            const leaderIds = matches.map(m => m.leaderId).filter(Boolean);
            const leaderDiscordInfo = await _fetchLeaderDiscordInfo(leaderIds);

            _currentData.leaderDiscordInfo = leaderDiscordInfo;

            // Re-render with Discord info if modal still open
            if (_isOpen) {
                _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo);
            }
        }
    }

    /**
     * Close the modal
     */
    function close() {
        if (_container) _container.innerHTML = '';
        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
        _isOpen = false;
        _currentData = null;
        _selectedOpponentIndex = 0;
    }

    /**
     * Check if modal is currently open
     */
    function isOpen() {
        return _isOpen;
    }

    /**
     * Cleanup modal resources
     */
    function cleanup() {
        close();
        if (_container) {
            _container.remove();
            _container = null;
        }
    }

    return {
        show,
        close,
        isOpen,
        cleanup
    };
})();

// Make globally accessible
window.ComparisonModal = ComparisonModal;
