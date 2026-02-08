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
    let _selectedGameType = null; // 'official' | 'practice' | null
    let _withStandin = false; // Standin toggle (practice only)
    let _proposalStep = 1; // 1=match type, 2=propose, 3=contact
    let _createdProposalId = null;
    let _discordMessage = null; // Pre-built message for step 3
    let _opponentDiscordUserId = null; // Resolved in background

    /**
     * Escape HTML to prevent XSS
     */
    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get the Monday of a given week (UTC) for DST-correct formatting.
     * @param {string} weekId - e.g., "2026-05"
     * @returns {Date|undefined}
     */
    function _getRefDate(weekId) {
        if (!weekId) return undefined;
        const weekNum = parseInt(weekId.split('-')[1], 10);
        if (isNaN(weekNum)) return undefined;
        return DateUtils.getMondayOfWeek(weekId);
    }

    /**
     * Format UTC slot ID for display in user's local timezone.
     * e.g., "mon_2000" → "Monday at 21:00" for CET user
     */
    function _formatSlot(utcSlotId, refDate) {
        if (typeof TimezoneService !== 'undefined') {
            const display = TimezoneService.formatSlotForDisplay(utcSlotId, refDate);
            return display.fullLabel;
        }
        // Fallback: raw display
        const [day, time] = utcSlotId.split('_');
        const dayNames = {
            mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
            thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
        };
        return `${dayNames[day] || day} at ${time.slice(0, 2)}:${time.slice(2)}`;
    }

    /**
     * Format UTC slot ID for message in user's local timezone.
     * e.g., "mon_2000" → "Mon 21:00" for CET user
     */
    function _formatSlotForMessage(utcSlotId, refDate) {
        if (typeof TimezoneService !== 'undefined') {
            const display = TimezoneService.formatSlotForDisplay(utcSlotId, refDate);
            const shortDayNames = {
                Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
                Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun'
            };
            return `${shortDayNames[display.dayLabel] || display.dayLabel} ${display.timeLabel}`;
        }
        // Fallback: raw display
        const [day, time] = utcSlotId.split('_');
        const dayNames = {
            mon: 'Mon', tue: 'Tue', wed: 'Wed',
            thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
        };
        return `${dayNames[day] || day} ${time.slice(0, 2)}:${time.slice(2)}`;
    }

    /**
     * Generate a formatted match request message for Discord
     * @param {string} selectedSlotId - The slot user clicked (e.g., 'mon_1900')
     * @param {string} selectedWeekId - The week of the clicked slot
     * @param {Object} userTeamInfo - User's team info from ComparisonEngine
     * @param {Object} selectedMatch - The opponent team being contacted
     * @returns {string} Formatted message ready to paste
     */
    function _generateContactMessage(selectedSlotId, selectedWeekId, userTeamInfo, selectedMatch) {
        const comparisonState = ComparisonEngine.getComparisonState();
        const allMatches = comparisonState.matches;

        // Find all slots where this specific opponent matches
        const opponentSlots = [];
        for (const [fullSlotId, matches] of Object.entries(allMatches)) {
            const opponentMatch = matches.find(m => m.teamId === selectedMatch.teamId);
            if (opponentMatch) {
                // fullSlotId format: "2024-W01_mon_1900"
                const parts = fullSlotId.split('_');
                const weekId = parts[0];
                const slotId = parts.slice(1).join('_'); // Handle 'mon_1900' format

                // Get user team count for this slot
                const userInfo = ComparisonEngine.getUserTeamInfo(weekId, slotId);
                const userCount = userInfo?.availablePlayers?.length || 0;
                const opponentCount = opponentMatch.availablePlayers.length;

                opponentSlots.push({
                    weekId,
                    slotId,
                    fullSlotId,
                    userCount,
                    opponentCount,
                    isPriority: slotId === selectedSlotId && weekId === selectedWeekId
                });
            }
        }

        // Sort: priority first, then by total player count (highest first)
        opponentSlots.sort((a, b) => {
            if (a.isPriority && !b.isPriority) return -1;
            if (!a.isPriority && b.isPriority) return 1;
            const aTotal = a.userCount + a.opponentCount;
            const bTotal = b.userCount + b.opponentCount;
            return bTotal - aTotal;
        });

        // Format the message
        const lines = [
            `Match request: ${userTeamInfo.teamTag} vs ${selectedMatch.teamTag}`,
            ''
        ];

        opponentSlots.forEach((slot) => {
            const formatted = _formatSlotForMessage(slot.slotId, _getRefDate(slot.weekId));
            const marker = slot.isPriority ? '> ' : '  ';
            const counts = `${slot.userCount}v${slot.opponentCount}`;
            lines.push(`${marker}${formatted} (${counts})`);
        });

        lines.push('');
        lines.push('https://scheduler.quake.world');
        lines.push('Let me know what works!');

        return lines.join('\n');
    }

    /**
     * Generate a Discord template message for a match proposal.
     * Includes team tags, all viable slot times with roster counts, and a link.
     * @param {string} weekId - e.g., "2026-05"
     * @param {Object} userTeamInfo - User's team info
     * @param {Object} selectedMatch - Opponent team info
     * @returns {string} Formatted Discord message
     */
    function _generateProposalDiscordTemplate(weekId, userTeamInfo, selectedMatch) {
        const comparisonState = ComparisonEngine.getComparisonState();
        const minFilter = comparisonState.filters || { yourTeam: 1, opponent: 1 };

        // Compute viable slots from cached availability
        const viableSlots = ProposalService.computeViableSlots(
            userTeamInfo.teamId,
            selectedMatch.teamId,
            weekId,
            minFilter
        );

        const refDate = _getRefDate(weekId);
        const weekNum = weekId.split('-')[1];

        const lines = [
            `Match proposal: ${userTeamInfo.teamTag} vs ${selectedMatch.teamTag} — Week ${weekNum}`,
            `Filter: ${minFilter.yourTeam}v${minFilter.opponent} minimum`,
            ''
        ];

        if (viableSlots.length > 0) {
            lines.push('Viable slots:');
            viableSlots.forEach(slot => {
                const formatted = _formatSlotForMessage(slot.slotId, refDate);
                lines.push(`  ${formatted} (${slot.proposerCount}v${slot.opponentCount})`);
            });
        } else {
            lines.push('No viable slots yet — check back as players fill in availability.');
        }

        lines.push('');
        lines.push('https://scheduler.quake.world');
        lines.push('');
        lines.push('Confirm slots in the Matches tab. Let me know!');

        return lines.join('\n');
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
     * Render anonymous roster summary (when team has hideRosterNames enabled)
     */
    function _renderAnonymousRoster(availablePlayers, unavailablePlayers) {
        const availCount = availablePlayers.length;
        const unavailCount = unavailablePlayers.length;

        return `
            <div class="py-2">
                <div class="flex items-center gap-2 py-0.5">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: oklch(0.60 0.18 145);"></span>
                    <span class="text-sm text-foreground">${availCount} player${availCount !== 1 ? 's' : ''} available</span>
                </div>
                ${unavailCount > 0 ? `
                    <div class="flex items-center gap-2 py-0.5">
                        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: oklch(0.5 0.02 260); opacity: 0.5;"></span>
                        <span class="text-sm text-muted-foreground">${unavailCount} unavailable</span>
                    </div>
                ` : ''}
                <p class="text-xs text-muted-foreground mt-1 italic">Roster hidden by team</p>
            </div>
        `;
    }

    /**
     * Render contact section for opponent with message preview and action buttons
     * @param {Object} discordInfo - Leader's Discord info
     * @param {string} selectedSlotId - The slot user clicked
     * @param {string} selectedWeekId - The week of the clicked slot
     * @param {Object} userTeamInfo - User's team info
     * @param {Object} selectedMatch - The opponent team being contacted
     */
    function _renderContactSection(discordInfo, selectedSlotId, selectedWeekId, userTeamInfo, selectedMatch) {
        if (!discordInfo || !discordInfo.discordUsername) {
            return `
                <div class="mt-3 pt-3 border-t border-border">
                    <p class="text-xs text-muted-foreground">Leader hasn't linked Discord</p>
                </div>
            `;
        }

        // Generate message for preview
        const message = _generateContactMessage(selectedSlotId, selectedWeekId, userTeamInfo, selectedMatch);

        // Store message in data attribute for click handler (escape newlines for HTML attribute)
        const escapedMessage = _escapeHtml(message).replace(/\n/g, '&#10;');

        const discordIcon = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>`;

        return `
            <div class="mt-3 pt-3 border-t border-border">
                <p class="text-xs text-muted-foreground mb-2">Contact Leader</p>

                <!-- Message Preview -->
                <div class="bg-muted/30 rounded p-2 mb-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto">${_escapeHtml(message)}</div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2 flex-wrap">
                    ${discordInfo.discordUserId ? `
                        <button class="btn btn-sm bg-[#5865F2] hover:bg-[#4752C4] text-white contact-discord-btn"
                                data-discord-id="${discordInfo.discordUserId}"
                                data-message="${escapedMessage}">
                            ${discordIcon}
                            <span class="ml-1">Contact on Discord</span>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-secondary copy-message-btn"
                            data-message="${escapedMessage}">
                        Copy Message Only
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render a team card (used for both user team and opponent)
     * @param {string} teamId - Team ID
     * @param {string} teamTag - Team tag
     * @param {string} teamName - Team name
     * @param {Array} availablePlayers - Players available for this slot
     * @param {Array} unavailablePlayers - Players not available
     * @param {boolean} isUserTeam - Is this the user's team?
     * @param {Object} discordInfo - Leader's Discord info (for opponent)
     * @param {boolean} showContact - Should show contact section?
     * @param {string} selectedSlotId - The slot user clicked (for contact message)
     * @param {string} selectedWeekId - The week of the clicked slot
     * @param {Object} userTeamInfo - User's team info (for contact message)
     * @param {Object} matchData - The opponent match data (for contact message)
     */
    function _renderTeamCard(teamId, teamTag, teamName, availablePlayers, unavailablePlayers, isUserTeam, discordInfo, showContact, selectedSlotId, selectedWeekId, userTeamInfo, matchData) {
        const contactSection = (!isUserTeam && showContact)
            ? _renderContactSection(discordInfo, selectedSlotId, selectedWeekId, userTeamInfo, matchData)
            : '';

        return `
            <div class="vs-team-card">
                <!-- Logo -->
                <div class="flex justify-center mb-3">
                    ${_renderLogo(teamId, teamTag, 'medium')}
                </div>

                <!-- Team Name - single line: [TAG] Team Name -->
                <div class="text-center mb-3">
                    <div class="flex items-center justify-center">
                        <span class="text-sm font-mono text-primary font-bold">${_escapeHtml(teamTag)}</span>
                        <span class="font-semibold text-foreground ml-2">${_escapeHtml(teamName)}</span>
                    </div>
                </div>

                <!-- Roster -->
                <div class="vs-roster">
                    ${(!isUserTeam && matchData?.hideRosterNames)
                        ? _renderAnonymousRoster(availablePlayers, unavailablePlayers)
                        : _renderRoster(availablePlayers, unavailablePlayers)}
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
     * Render the 3-step horizontal stepper for the proposal flow.
     * Step 1: Match Type (OFF/PRAC + standin)
     * Step 2: Propose Match
     * Step 3: Contact Opponent (Discord)
     */
    function _renderStepper() {
        const step1Done = !!_selectedGameType;
        const step2Done = _proposalStep >= 3;
        const step1Active = _proposalStep === 1 || (!step1Done && _proposalStep < 2);
        const step2Active = _proposalStep === 2 || (step1Done && !step2Done);
        const step3Active = _proposalStep === 3;

        const checkSvg = `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
        const discordIcon = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.04.001-.088-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`;

        // Step circle helper
        const circle = (num, done, active) => {
            if (done) return `<div class="w-5 h-5 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center text-green-400">${checkSvg}</div>`;
            if (active) return `<div class="w-5 h-5 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary text-xs font-bold">${num}</div>`;
            return `<div class="w-5 h-5 rounded-full bg-muted/30 border border-border flex items-center justify-center text-muted-foreground/40 text-xs">${num}</div>`;
        };

        // Connector line
        const line = (done) => `<div class="flex-1 h-px ${done ? 'bg-green-500/50' : 'bg-border'} mx-1"></div>`;

        // Step 1 content: Official/Practice + standin
        const step1Content = `
            <div class="flex items-center gap-1.5 mt-1.5">
                <button id="game-type-off" class="px-2.5 py-0.5 rounded border text-xs font-medium transition-colors
                        ${_selectedGameType === 'official' ? 'border-green-500 text-green-400 bg-green-500/10' : 'border-border text-muted-foreground hover:text-green-400 hover:border-green-500/50'}">
                    Official
                </button>
                <button id="game-type-prac" class="px-2.5 py-0.5 rounded border text-xs font-medium transition-colors
                        ${_selectedGameType === 'practice' ? 'border-amber-500 text-amber-400 bg-amber-500/10' : 'border-border text-muted-foreground hover:text-amber-400 hover:border-amber-500/50'}">
                    Practice
                </button>
                ${_selectedGameType === 'practice' ? `
                    <button id="standin-toggle" class="px-2 py-0.5 rounded border text-xs transition-colors
                            ${_withStandin ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-border text-muted-foreground hover:text-cyan-400 hover:border-cyan-500/50'}"
                            title="+1 standin for your team">
                        ${_withStandin ? 'Standin ✓' : 'Add Standin'}
                    </button>
                ` : ''}
            </div>
        `;

        // Step 2 content: Propose button
        const step2Content = step2Done
            ? `<div class="mt-1.5 text-xs text-green-400">Created!</div>`
            : `<button id="propose-match-btn" class="mt-1.5 px-3 py-1 rounded text-xs font-medium transition-colors
                    ${step1Done
                        ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                        : 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed'}"
                    ${step1Done ? '' : 'disabled'}>
                Propose
            </button>`;

        // Step 3 content: Discord + Copy (full buttons)
        const escapedMsg = _discordMessage ? _escapeHtml(_discordMessage).replace(/\n/g, '&#10;') : '';
        const step3Content = step3Active
            ? `<div class="flex items-center gap-1.5 mt-1.5">
                <button id="post-proposal-discord" class="px-2.5 py-1 rounded text-xs font-medium bg-[#5865F2] hover:bg-[#4752C4] text-white flex items-center gap-1"
                        data-message="${escapedMsg}">
                    Contact Leader ${discordIcon}
                </button>
                <button id="post-proposal-copy" class="px-2.5 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground"
                        data-message="${escapedMsg}">
                    Copy Message
                </button>
            </div>`
            : `<div class="mt-1.5 text-xs text-muted-foreground/30">${discordIcon}</div>`;

        return `
            <div class="flex items-start mb-2">
                <!-- Step 1 -->
                <div class="flex flex-col items-center flex-1 min-w-0">
                    <div class="flex items-center w-full">
                        <div class="flex-1"></div>
                        ${circle(1, step1Done, step1Active)}
                        ${line(step1Done)}
                    </div>
                    <div class="text-xs mt-1 ${step1Active ? 'text-foreground' : 'text-muted-foreground'} font-medium">Match Type</div>
                    ${step1Content}
                </div>
                <!-- Step 2 -->
                <div class="flex flex-col items-center flex-1 min-w-0">
                    <div class="flex items-center w-full">
                        ${line(step1Done)}
                        ${circle(2, step2Done, step2Active && step1Done)}
                        ${line(step2Done)}
                    </div>
                    <div class="text-xs mt-1 ${step2Active && step1Done ? 'text-foreground' : 'text-muted-foreground'} font-medium">Propose</div>
                    ${step2Content}
                </div>
                <!-- Step 3 -->
                <div class="flex flex-col items-center flex-1 min-w-0">
                    <div class="flex items-center w-full">
                        ${line(step2Done)}
                        ${circle(3, false, step3Active)}
                        <div class="flex-1"></div>
                    </div>
                    <div class="text-xs mt-1 ${step3Active ? 'text-foreground' : 'text-muted-foreground'} font-medium">Contact</div>
                    ${step3Content}
                </div>
            </div>
            <button id="comparison-modal-done" class="btn btn-secondary w-full text-sm">${step3Active ? 'Done' : 'Close'}</button>
        `;
    }

    /**
     * Render the full modal with VS layout
     */
    function _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo, canSchedule) {
        const formattedSlot = _formatSlot(slotId, _getRefDate(weekId));
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
                                false,
                                null, null, null, null
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
                                isLeader && !canSchedule,
                                slotId,
                                weekId,
                                userTeamInfo,
                                selectedMatch
                            )}
                        </div>
                    </div>

                    <!-- Footer: Stepper or Close -->
                    <div class="p-4 border-t border-border shrink-0">
                        ${canSchedule ? _renderStepper() : `
                            <button id="comparison-modal-done" class="btn btn-primary w-full">Close</button>
                        `}
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
                        _currentData.leaderDiscordInfo,
                        _currentData.canSchedule
                    );
                }
            });
        });

        // Game type toggle buttons
        const _reRenderModal = () => {
            _renderModal(
                _currentData.weekId, _currentData.slotId,
                _currentData.userTeamInfo, _currentData.matches,
                _currentData.isLeader, _currentData.leaderDiscordInfo,
                _currentData.canSchedule
            );
        };
        document.getElementById('game-type-off')?.addEventListener('click', () => {
            _selectedGameType = 'official';
            _withStandin = false; // No standin for officials
            _reRenderModal();
        });
        document.getElementById('game-type-prac')?.addEventListener('click', () => {
            _selectedGameType = 'practice';
            _reRenderModal();
        });
        document.getElementById('standin-toggle')?.addEventListener('click', () => {
            _withStandin = !_withStandin;
            _reRenderModal();
        });

        // Propose Match button
        const proposeBtn = document.getElementById('propose-match-btn');
        if (proposeBtn) {
            proposeBtn.addEventListener('click', async () => {
                if (!_selectedGameType) return;
                proposeBtn.disabled = true;
                proposeBtn.textContent = 'Creating...';

                try {
                    const selectedMatch = _currentData.matches[_selectedOpponentIndex] || _currentData.matches[0];
                    // Proposals always use 4v4 — standin covers the 3+1 case
                    const minFilter = { yourTeam: 4, opponent: 4 };

                    const result = await ProposalService.createProposal({
                        proposerTeamId: _currentData.userTeamInfo.teamId,
                        opponentTeamId: selectedMatch.teamId,
                        weekId: _currentData.weekId,
                        minFilter,
                        gameType: _selectedGameType,
                        proposerStandin: _selectedGameType === 'practice' && _withStandin
                    });

                    if (result.success) {
                        // Show post-creation step with Discord contact prompt
                        _showPostProposalStep(selectedMatch, result.proposalId);
                    } else {
                        ToastService.showError(result.error || 'Failed to create proposal');
                        proposeBtn.disabled = false;
                        proposeBtn.textContent = 'Propose Match';
                    }
                } catch (error) {
                    console.error('Propose match failed:', error);
                    ToastService.showError('Network error — please try again');
                    proposeBtn.disabled = false;
                    proposeBtn.textContent = 'Propose Match';
                }
            });
        }

        // Contact on Discord button (copy + open DM)
        document.querySelectorAll('.contact-discord-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const discordId = btn.dataset.discordId;
                const message = btn.dataset.message.replace(/&#10;/g, '\n');

                try {
                    // 1. Copy message to clipboard
                    await navigator.clipboard.writeText(message);

                    // 2. Show success toast
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showSuccess('Message copied! Paste in Discord');
                    }

                    // 3. Open Discord DM (slight delay to ensure toast shows)
                    setTimeout(() => {
                        window.open(`discord://-/users/${discordId}`, '_blank');
                    }, 100);

                } catch (err) {
                    console.error('Failed to copy message:', err);
                    // Fallback: just open Discord
                    window.open(`discord://-/users/${discordId}`, '_blank');
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showInfo('Opening Discord... (copy failed)');
                    }
                }
            });
        });

        // Copy message only button
        document.querySelectorAll('.copy-message-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const message = btn.dataset.message.replace(/&#10;/g, '\n');
                try {
                    await navigator.clipboard.writeText(message);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showSuccess('Message copied to clipboard!');
                    }
                    // Visual feedback on button
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg><span class="ml-1">Copied!</span>`;
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showError('Failed to copy message');
                    }
                }
            });
        });

        // Step 3: Discord DM button (in stepper)
        const discordBtn = document.getElementById('post-proposal-discord');
        if (discordBtn) {
            discordBtn.addEventListener('click', async () => {
                const msg = discordBtn.dataset.message.replace(/&#10;/g, '\n');
                try {
                    await navigator.clipboard.writeText(msg);
                    ToastService.showSuccess('Message copied! Paste in Discord');
                } catch (err) { /* silent */ }
                if (_opponentDiscordUserId) {
                    setTimeout(() => {
                        window.open(`discord://-/users/${_opponentDiscordUserId}`, '_blank');
                    }, 100);
                }
            });
        }

        // Step 3: Copy button (in stepper)
        const copyBtn = document.getElementById('post-proposal-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const msg = copyBtn.dataset.message.replace(/&#10;/g, '\n');
                try {
                    await navigator.clipboard.writeText(msg);
                    ToastService.showSuccess('Message copied!');
                    copyBtn.textContent = '✓';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                } catch (err) {
                    ToastService.showError('Failed to copy');
                }
            });
        }

        // ESC key to close
        _keydownHandler = (e) => {
            if (e.key === 'Escape' && _isOpen) close();
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    /**
     * Advance to step 3 after proposal creation — builds Discord message and re-renders stepper
     */
    function _showPostProposalStep(selectedMatch, proposalId) {
        const weekId = _currentData.weekId;
        const userTeamInfo = _currentData.userTeamInfo;
        const weekNum = weekId.split('-')[1];
        const minFilter = { yourTeam: 4, opponent: 4 };

        // Compute viable slots for message (with standin if applicable)
        const standinSettings = _selectedGameType === 'practice' && _withStandin
            ? { proposerStandin: true, opponentStandin: false }
            : undefined;
        const viableSlots = ProposalService.computeViableSlots(
            userTeamInfo.teamId, selectedMatch.teamId, weekId, minFilter, standinSettings
        );

        // Build Discord message
        const sorted = [...viableSlots].sort((a, b) =>
            (b.proposerCount + b.opponentCount) - (a.proposerCount + a.opponentCount)
        );
        const top3 = sorted.slice(0, 3);
        const remaining = sorted.length - 3;

        const lines = [
            `Hey! We proposed a match: ${userTeamInfo.teamTag} vs ${selectedMatch.teamTag} (W${weekNum})`,
            '',
            'Best times for both teams:'
        ];
        for (const slot of top3) {
            const display = TimezoneService.formatSlotForDisplay(slot.slotId, _getRefDate(weekId));
            const shortDay = (display.dayLabel || '').slice(0, 3);
            lines.push(`\u25B8 ${shortDay} ${display.timeLabel} (${slot.proposerCount}v${slot.opponentCount})`);
        }
        if (top3.length === 0) {
            lines.length = 2;
            lines.push('No viable slots yet \u2014 check availability!');
        }
        if (remaining > 0) {
            lines.push('');
            lines.push(`+${remaining} more time${remaining !== 1 ? 's' : ''} available`);
        }
        lines.push('');
        const deepLink = proposalId
            ? `https://scheduler.quake.world/#/matches/${proposalId}`
            : 'https://scheduler.quake.world';
        lines.push(`Check proposal: ${deepLink}`);

        _discordMessage = lines.join('\n');
        _createdProposalId = proposalId;
        _proposalStep = 3;

        // Resolve opponent leader Discord ID in background
        const opponentTeam = TeamService.getTeamFromCache(selectedMatch.teamId);
        const leaderId = opponentTeam?.leaderId;
        if (leaderId) {
            _getUserDiscordInfo(leaderId).then(info => {
                if (info?.discordUserId) {
                    _opponentDiscordUserId = info.discordUserId;
                }
            }).catch(() => {});
        }

        // Re-render to update stepper to step 3
        _renderModal(
            _currentData.weekId, _currentData.slotId,
            _currentData.userTeamInfo, _currentData.matches,
            _currentData.isLeader, _currentData.leaderDiscordInfo,
            _currentData.canSchedule
        );

        ToastService.showSuccess('Proposal created!');
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

        // Check if current user is a leader or scheduler
        const currentUser = AuthService.getCurrentUser();
        const currentUserId = currentUser?.uid;
        const isLeader = userTeamInfo.leaderId === currentUserId;
        const canSchedule = TeamService.isScheduler(userTeamInfo.teamId, currentUserId);

        // Store data for re-renders (tab switching)
        _currentData = {
            weekId,
            slotId,
            userTeamInfo,
            matches,
            isLeader,
            canSchedule,
            leaderDiscordInfo: {}
        };

        // Render modal immediately
        _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, {}, canSchedule);

        // If user is a leader, fetch leader Discord info async
        if (isLeader) {
            const leaderIds = matches.map(m => m.leaderId).filter(Boolean);
            const leaderDiscordInfo = await _fetchLeaderDiscordInfo(leaderIds);

            _currentData.leaderDiscordInfo = leaderDiscordInfo;

            // Re-render with Discord info if modal still open
            if (_isOpen) {
                _renderModal(weekId, slotId, userTeamInfo, matches, isLeader, leaderDiscordInfo, canSchedule);
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
        _selectedGameType = null;
        _withStandin = false;
        _proposalStep = 1;
        _createdProposalId = null;
        _discordMessage = null;
        _opponentDiscordUserId = null;
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
