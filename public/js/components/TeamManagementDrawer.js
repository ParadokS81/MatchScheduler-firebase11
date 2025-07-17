// TeamManagementDrawer Component - Team management drawer for team actions and settings
// Following PRD v2 Architecture with Revealing Module Pattern

const TeamManagementDrawer = (function() {
    'use strict';
    
    // Private variables
    let _containerElement = null;
    let _drawerElement = null;
    let _isOpen = false;
    let _teamData = null;
    let _isLeader = false;
    let _initialized = false;
    
    // Initialize component
    function init(containerElement) {
        if (_initialized) return;
        
        _containerElement = containerElement;
        if (!_containerElement) {
            console.error('❌ TeamManagementDrawer: Container element not found');
            return;
        }
        
        _initialized = true;
        _createDrawer();
        _attachEventListeners();
        
        console.log('🔧 TeamManagementDrawer component initialized');
    }
    
    // Create drawer HTML structure
    function _createDrawer() {
        const drawerHTML = `
            <div id="team-management-drawer" class="team-management-drawer drawer-closed">
                <div class="drawer-header bg-card border-b border-border p-3 cursor-pointer flex items-center justify-between">
                    <span class="text-sm font-medium text-foreground">Team Management</span>
                    <button id="drawer-toggle" class="drawer-arrow transition-transform duration-300 text-muted-foreground hover:text-foreground">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
                        </svg>
                    </button>
                </div>
                <div class="drawer-content bg-card p-4 space-y-4 overflow-y-auto">
                    <!-- Content will be dynamically inserted here -->
                </div>
            </div>
        `;
        
        // Ensure container has relative positioning for absolute drawer
        _containerElement.style.position = 'relative';
        _containerElement.style.overflow = 'hidden'; // Prevent drawer from escaping panel
        
        _containerElement.insertAdjacentHTML('beforeend', drawerHTML);
        _drawerElement = _containerElement.querySelector('#team-management-drawer');
    }
    
    // Update drawer with team data
    function updateTeamData(teamData, isLeader) {
        _teamData = teamData;
        _isLeader = isLeader;
        _renderContent();
        
        // Ensure drawer starts closed
        if (_drawerElement) {
            _isOpen = false;
            _drawerElement.classList.remove('drawer-open');
            _drawerElement.classList.add('drawer-closed');
            const arrow = _drawerElement.querySelector('.drawer-arrow');
            if (arrow) {
                arrow.style.transform = 'rotate(0deg)';
            }
        }
    }
    
    // Render drawer content based on role
    function _renderContent() {
        if (!_drawerElement || !_teamData) return;
        
        const content = _containerElement.querySelector('.drawer-content');
        if (!content) return;
        
        content.innerHTML = _isLeader ? _renderLeaderView() : _renderMemberView();
        _attachContentEventListeners();
    }
    
    // Render member view
    function _renderMemberView() {
        return `
            <!-- Join Code Row -->
            <div class="drawer-row">
                <div class="flex items-center gap-3">
                    <label class="text-sm font-medium text-foreground">Join Code</label>
                    <input 
                        type="text" 
                        value="${_teamData.joinCode}" 
                        readonly 
                        class="w-20 px-2 py-1 bg-muted border border-border rounded-lg text-sm font-mono text-foreground text-center"
                    />
                    <button 
                        id="copy-join-code-btn"
                        class="p-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
                        data-join-code="${_teamData.joinCode}"
                        title="Copy join code"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Max Players Row -->
            <div class="drawer-row">
                <div class="flex items-center gap-3">
                    <label class="text-sm font-medium text-foreground">Max Players</label>
                    <div class="px-3 py-1 bg-muted border border-border rounded-lg text-sm text-foreground">
                        ${_teamData.maxPlayers}
                    </div>
                </div>
            </div>
            
            <!-- Spacer to push action buttons to bottom -->
            <div class="flex-1"></div>
            
            <!-- Action Button -->
            <div class="mt-auto">
                <button 
                    id="leave-team-btn"
                    class="w-full px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-medium rounded-lg transition-colors"
                >
                    Leave Team
                </button>
            </div>
        `;
    }
    
    // Render leader view
    function _renderLeaderView() {
        const maxPlayersOptions = Array.from({ length: 17 }, (_, i) => i + 4)
            .map(num => `<option value="${num}" ${num === _teamData.maxPlayers ? 'selected' : ''}>${num}</option>`)
            .join('');
        
        return `
            <!-- Join Code Row -->
            <div class="drawer-row">
                <div class="flex items-center gap-3">
                    <label class="text-sm font-medium text-foreground">Join Code</label>
                    <input 
                        type="text" 
                        value="${_teamData.joinCode}" 
                        readonly 
                        class="w-20 px-2 py-1 bg-muted border border-border rounded-lg text-sm font-mono text-foreground text-center"
                    />
                    <button 
                        id="copy-join-code-btn"
                        class="p-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
                        data-join-code="${_teamData.joinCode}"
                        title="Copy join code"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                    </button>
                    <button 
                        id="regenerate-join-code-btn"
                        class="p-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
                        title="Regenerate join code"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Max Players Row -->
            <div class="drawer-row">
                <div class="flex items-center gap-3">
                    <label class="text-sm font-medium text-foreground">Max Players</label>
                    <select 
                        id="max-players-select"
                        class="w-16 px-2 py-1 bg-muted border border-border rounded-lg text-sm text-foreground"
                    >
                        ${maxPlayersOptions}
                    </select>
                </div>
            </div>
            
            <!-- Logo Section -->
            <div class="drawer-row flex flex-col items-center gap-3">
                <div class="w-32 h-32 bg-muted border border-border rounded-lg flex items-center justify-center">
                    <span class="text-2xl font-bold text-muted-foreground">${_teamData.teamTag}</span>
                </div>
                <button 
                    id="manage-logo-btn"
                    class="px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors"
                >
                    Manage Logo
                </button>
            </div>
            
            <!-- Spacer to push action buttons to bottom -->
            <div class="flex-1"></div>
            
            <!-- Action Buttons -->
            <div class="space-y-2 mt-auto">
                <button 
                    id="remove-player-btn"
                    class="w-full px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors"
                >
                    Remove Player
                </button>
                <button 
                    id="transfer-leadership-btn"
                    class="w-full px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors"
                >
                    Transfer Leadership
                </button>
                <button 
                    id="leave-team-btn"
                    class="w-full px-4 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-lg cursor-not-allowed"
                    disabled
                    title="Leaders cannot leave their team"
                >
                    Leave Team
                </button>
            </div>
        `;
    }
    
    // Toggle drawer open/closed
    function toggleDrawer() {
        if (!_drawerElement) return;
        
        _isOpen = !_isOpen;
        
        if (_isOpen) {
            _drawerElement.classList.remove('drawer-closed');
            _drawerElement.classList.add('drawer-open');
            const arrow = _drawerElement.querySelector('.drawer-arrow');
            if (arrow) {
                arrow.style.transform = 'rotate(180deg)';
            }
        } else {
            _drawerElement.classList.remove('drawer-open');
            _drawerElement.classList.add('drawer-closed');
            const arrow = _drawerElement.querySelector('.drawer-arrow');
            if (arrow) {
                arrow.style.transform = 'rotate(0deg)';
            }
        }
    }
    
    // Attach main event listeners
    function _attachEventListeners() {
        if (!_drawerElement) return;
        
        // Toggle drawer on header click
        const header = _drawerElement.querySelector('.drawer-header');
        if (header) {
            header.addEventListener('click', toggleDrawer);
        }
        
        // Close drawer when clicking outside
        document.addEventListener('click', (e) => {
            if (_isOpen && !_drawerElement.contains(e.target)) {
                toggleDrawer();
            }
        });
    }
    
    // Attach content-specific event listeners
    function _attachContentEventListeners() {
        if (!_drawerElement) return;
        
        // Copy join code button
        const copyBtn = _drawerElement.querySelector('#copy-join-code-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', _handleCopyJoinCode);
        }
        
        // Regenerate join code button (leader only)
        const regenerateBtn = _drawerElement.querySelector('#regenerate-join-code-btn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', _handleRegenerateJoinCode);
        }
        
        // Max players select (leader only)
        const maxPlayersSelect = _drawerElement.querySelector('#max-players-select');
        if (maxPlayersSelect) {
            maxPlayersSelect.addEventListener('change', _handleMaxPlayersChange);
        }
        
        // Manage logo button (leader only)
        const manageLogoBtn = _drawerElement.querySelector('#manage-logo-btn');
        if (manageLogoBtn) {
            manageLogoBtn.addEventListener('click', _handleManageLogo);
        }
        
        // Remove player button (leader only)
        const removePlayerBtn = _drawerElement.querySelector('#remove-player-btn');
        if (removePlayerBtn) {
            removePlayerBtn.addEventListener('click', _handleRemovePlayer);
        }
        
        // Transfer leadership button (leader only)
        const transferLeadershipBtn = _drawerElement.querySelector('#transfer-leadership-btn');
        if (transferLeadershipBtn) {
            transferLeadershipBtn.addEventListener('click', _handleTransferLeadership);
        }
        
        // Leave team button
        const leaveTeamBtn = _drawerElement.querySelector('#leave-team-btn');
        if (leaveTeamBtn && !leaveTeamBtn.disabled) {
            leaveTeamBtn.addEventListener('click', _handleLeaveTeam);
        }
    }
    
    // Handle copy join code
    async function _handleCopyJoinCode(e) {
        const joinCode = e.target.dataset.joinCode;
        if (!joinCode) return;
        
        try {
            await navigator.clipboard.writeText(joinCode);
            
            // Show success feedback
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Join code copied to clipboard!');
            }
            
            // Temporary button feedback
            const originalText = e.target.textContent;
            e.target.textContent = 'Copied!';
            e.target.classList.add('text-primary');
            
            setTimeout(() => {
                e.target.textContent = originalText;
                e.target.classList.remove('text-primary');
            }, 1000);
            
        } catch (error) {
            console.error('❌ Error copying to clipboard:', error);
            
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Failed to copy join code');
            }
        }
    }
    
    // Handle regenerate join code (placeholder)
    function _handleRegenerateJoinCode() {
        if (typeof ToastService !== 'undefined') {
            ToastService.showInfo('Regenerate join code - Not implemented yet');
        }
    }
    
    // Handle max players change (placeholder)
    function _handleMaxPlayersChange() {
        if (typeof ToastService !== 'undefined') {
            ToastService.showInfo('Max players update - Not implemented yet');
        }
    }
    
    // Handle manage logo (placeholder)
    function _handleManageLogo() {
        if (typeof ToastService !== 'undefined') {
            ToastService.showInfo('Manage logo - Not implemented yet');
        }
    }
    
    // Handle remove player (placeholder)
    function _handleRemovePlayer() {
        if (typeof ToastService !== 'undefined') {
            ToastService.showInfo('Remove player - Not implemented yet');
        }
    }
    
    // Handle transfer leadership (placeholder)
    function _handleTransferLeadership() {
        if (typeof ToastService !== 'undefined') {
            ToastService.showInfo('Transfer leadership - Not implemented yet');
        }
    }
    
    // Handle leave team (placeholder)
    function _handleLeaveTeam() {
        if (typeof ToastService !== 'undefined') {
            ToastService.showInfo('Leave team - Not implemented yet');
        }
    }
    
    // Cleanup function
    function cleanup() {
        if (_drawerElement) {
            _drawerElement.remove();
            _drawerElement = null;
        }
        _initialized = false;
        _isOpen = false;
    }
    
    // Public API
    return {
        init,
        updateTeamData,
        toggleDrawer,
        cleanup
    };
})();