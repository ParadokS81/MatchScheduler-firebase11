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
        
        const isLastMember = _teamData.playerRoster.length === 1;
        const leaveButtonClass = isLastMember 
            ? 'w-full px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-medium rounded-lg transition-colors'
            : 'w-full px-4 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-lg cursor-not-allowed';
        const leaveButtonDisabled = isLastMember ? '' : 'disabled';
        const leaveButtonTitle = isLastMember ? '' : 'title="Leaders cannot leave their team. Transfer leadership first or be the last member."';
        
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
            ${_renderLogoSection()}
            
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
                    class="${leaveButtonClass}"
                    ${leaveButtonDisabled}
                    ${leaveButtonTitle}
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
        const joinCode = _teamData.joinCode;
        const teamName = _teamData.teamName;
        
        if (!joinCode || !teamName) return;
        
        // Enhanced copy string per PRD
        const copyText = `Use code: ${joinCode} to join ${teamName} at https://scheduler.quake.world`;
        
        try {
            await navigator.clipboard.writeText(copyText);
            
            // Show success feedback
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Join code copied to clipboard!');
            }
            
        } catch (error) {
            console.error('❌ Error copying to clipboard:', error);
            
            // Fallback for older browsers
            try {
                const textArea = document.createElement("textarea");
                textArea.value = copyText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Join code copied to clipboard!');
                }
            } catch (fallbackError) {
                console.error('❌ Fallback copy also failed:', fallbackError);
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError('Failed to copy join code');
                }
            }
        }
    }
    
    // Handle regenerate join code
    async function _handleRegenerateJoinCode() {
        // Show confirmation modal first
        const modalResult = await showRegenerateModal();
        
        if (!modalResult.confirmed) return;
        
        // The modal handles the entire regenerate flow including copy
        // No additional logic needed here
    }
    
    // Custom regenerate modal with copy functionality
    async function showRegenerateModal() {
        return new Promise((resolve) => {
            // Create modal HTML
            const modalHTML = `
                <div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-md">
                        <!-- Header -->
                        <div class="flex items-center justify-between p-4 border-b border-slate-700">
                            <h2 class="text-xl font-bold text-sky-400">Regenerate Join Code?</h2>
                            <button id="regenerate-close-btn" class="text-slate-400 hover:text-white">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        
                        <!-- Body -->
                        <div class="p-6">
                            <div id="regenerate-modal-content">
                                <!-- Initial confirmation content -->
                                <div class="space-y-4">
                                    <div class="text-center">
                                        <div class="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                                            <svg class="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                                            </svg>
                                        </div>
                                        <p class="text-foreground text-sm leading-relaxed">Old codes will no longer work.</p>
                                    </div>
                                    
                                    <!-- Actions -->
                                    <div class="flex gap-3 pt-2">
                                        <button 
                                            id="regenerate-confirm-btn"
                                            class="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-md transition-colors"
                                        >
                                            Regenerate
                                        </button>
                                        <button 
                                            id="regenerate-cancel-btn"
                                            class="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium rounded-md transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Add modal to DOM
            const modalContainer = document.getElementById('modal-container');
            modalContainer.innerHTML = modalHTML;
            modalContainer.classList.remove('hidden');
            
            // Attach event listeners
            const confirmBtn = document.getElementById('regenerate-confirm-btn');
            const cancelBtn = document.getElementById('regenerate-cancel-btn');
            const closeBtn = document.getElementById('regenerate-close-btn');
            
            // Cancel/close handlers
            const handleClose = () => {
                modalContainer.classList.add('hidden');
                modalContainer.innerHTML = '';
                resolve({ confirmed: false });
            };
            
            cancelBtn.addEventListener('click', handleClose);
            closeBtn.addEventListener('click', handleClose);
            
            // Close on backdrop click
            modalContainer.addEventListener('click', (e) => {
                if (e.target === modalContainer) {
                    handleClose();
                }
            });
            
            // Close on escape key
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleKeyDown);
                    handleClose();
                }
            };
            document.addEventListener('keydown', handleKeyDown);
            
            // Confirm handler
            confirmBtn.addEventListener('click', async () => {
                // Show loading state
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<div class="flex items-center justify-center gap-2"><div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div><span>Regenerating...</span></div>';
                
                try {
                    const result = await TeamService.callFunction('regenerateJoinCode', {
                        teamId: _teamData.id
                    });
                    
                    if (result.success) {
                        // Update modal to show success with copy button
                        showSuccessContent(result.data.joinCode);
                    } else {
                        // Show error and revert button
                        if (typeof ToastService !== 'undefined') {
                            ToastService.showError(result.error || 'Failed to regenerate code');
                        }
                        confirmBtn.disabled = false;
                        confirmBtn.innerHTML = 'Regenerate';
                    }
                } catch (error) {
                    console.error('Error regenerating join code:', error);
                    if (typeof ToastService !== 'undefined') {
                        ToastService.showError('Network error - please try again');
                    }
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = 'Regenerate';
                }
            });
            
            // Success content with copy button
            function showSuccessContent(newJoinCode) {
                // Update header title
                const headerTitle = document.querySelector('#regenerate-close-btn').parentElement.querySelector('h2');
                headerTitle.textContent = 'New Join Code Generated!';
                
                const contentDiv = document.getElementById('regenerate-modal-content');
                contentDiv.innerHTML = `
                    <div class="space-y-4">
                        <div class="text-center">
                            <div class="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
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
                                class="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-md transition-colors"
                            >
                                Copy & Close
                            </button>
                            <button 
                                id="close-only-btn"
                                class="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium rounded-md transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                `;
                
                // Add copy button handler
                const copyBtn = document.getElementById('copy-new-code-btn');
                const closeOnlyBtn = document.getElementById('close-only-btn');
                
                copyBtn.addEventListener('click', async () => {
                    // Copy the enhanced format
                    const copyText = `Use code: ${newJoinCode} to join ${_teamData.teamName} at https://scheduler.quake.world`;
                    
                    try {
                        await navigator.clipboard.writeText(copyText);
                        if (typeof ToastService !== 'undefined') {
                            ToastService.showSuccess('Join code copied to clipboard!');
                        }
                    } catch (error) {
                        // Fallback for older browsers
                        try {
                            const textArea = document.createElement("textarea");
                            textArea.value = copyText;
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            if (typeof ToastService !== 'undefined') {
                                ToastService.showSuccess('Join code copied to clipboard!');
                            }
                        } catch (fallbackError) {
                            console.error('Copy failed:', fallbackError);
                            if (typeof ToastService !== 'undefined') {
                                ToastService.showError('Failed to copy join code');
                            }
                        }
                    }
                    
                    // Close modal after copy
                    document.removeEventListener('keydown', handleKeyDown);
                    modalContainer.classList.add('hidden');
                    modalContainer.innerHTML = '';
                    resolve({ confirmed: true, copied: true });
                });
                
                closeOnlyBtn.addEventListener('click', () => {
                    document.removeEventListener('keydown', handleKeyDown);
                    modalContainer.classList.add('hidden');
                    modalContainer.innerHTML = '';
                    resolve({ confirmed: true, copied: false });
                });
            }
        });
    }
    
    // Handle max players change
    async function _handleMaxPlayersChange(event) {
        const newValue = parseInt(event.target.value);
        const oldValue = _teamData.maxPlayers;
        const currentRosterSize = _teamData.playerRoster.length;
        
        // Optimistically update UI
        _teamData.maxPlayers = newValue;
        
        // Silently validate
        if (newValue < currentRosterSize) {
            // Revert without any error message
            event.target.value = oldValue;
            _teamData.maxPlayers = oldValue;
            return;
        }
        
        try {
            const result = await TeamService.callFunction('updateTeamSettings', {
                teamId: _teamData.id,
                maxPlayers: newValue
            });
            
            if (!result.success) {
                // Silently revert on error
                event.target.value = oldValue;
                _teamData.maxPlayers = oldValue;
            }
            // No success feedback - the change is visible
        } catch (error) {
            console.error('Error updating max players:', error);
            // Silently revert
            event.target.value = oldValue;
            _teamData.maxPlayers = oldValue;
        }
    }
    
    // Render logo section based on whether team has a logo
    function _renderLogoSection() {
        const logoUrl = _teamData.activeLogo?.urls?.medium;

        if (logoUrl) {
            return `
                <div class="drawer-row flex flex-col items-center gap-3">
                    <img src="${logoUrl}" alt="${_teamData.teamName} logo"
                         class="w-32 h-32 rounded-lg object-cover border border-border">
                    <button id="manage-logo-btn" class="px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors">
                        Change Logo
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="drawer-row flex flex-col items-center gap-3">
                    <div class="w-32 h-32 bg-muted border border-border rounded-lg flex items-center justify-center">
                        <span class="text-2xl font-bold text-muted-foreground">${_teamData.teamTag}</span>
                    </div>
                    <button id="manage-logo-btn" class="px-3 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors">
                        Manage Logo
                    </button>
                </div>
            `;
        }
    }

    // Handle manage logo - opens LogoUploadModal
    function _handleManageLogo() {
        if (typeof LogoUploadModal !== 'undefined') {
            // Get current user ID from AuthService
            const currentUser = AuthService.getCurrentUser();
            if (!currentUser) {
                ToastService.showError('Please log in to manage logo');
                return;
            }
            if (!_teamData?.id) {
                console.error('No team ID available for logo upload');
                ToastService.showError('Team data not loaded');
                return;
            }
            LogoUploadModal.show(_teamData.id, currentUser.uid);
        } else {
            console.error('LogoUploadModal not loaded');
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Logo upload not available');
            }
        }
    }
    
    // Handle remove player
    function _handleRemovePlayer() {
        if (!_teamData?.id) {
            console.error('No team data available');
            return;
        }
        KickPlayerModal.show(_teamData.id);
    }

    // Handle transfer leadership
    function _handleTransferLeadership() {
        if (!_teamData?.id) {
            console.error('No team data available');
            return;
        }
        TransferLeadershipModal.show(_teamData.id);
    }
    
    // Handle leave team
    async function _handleLeaveTeam() {
        const isLastMember = _teamData.playerRoster.length === 1;
        const message = isLastMember 
            ? 'You are the last member. Leaving will archive this team permanently.'
            : 'Are you sure you want to leave this team? You can rejoin later with a join code.';
        
        const confirmed = await showConfirmModal({
            title: 'Leave Team?',
            message: message,
            confirmText: 'Leave Team',
            confirmClass: 'bg-destructive hover:bg-destructive/90',
            cancelText: 'Cancel'
        });
        
        if (!confirmed) return;
        
        const button = document.getElementById('leave-team-btn');
        if (!button) return;
        
        const originalContent = button.innerHTML;
        
        // Show loading state
        button.disabled = true;
        button.innerHTML = '<div class="flex items-center justify-center gap-2"><div class="animate-spin rounded-full h-4 w-4 border-b-2 border-destructive-foreground"></div><span>Leaving...</span></div>';
        
        try {
            const result = await TeamService.callFunction('leaveTeam', {
                teamId: _teamData.id
            });
            
            if (result.success) {
                // Navigation/switching handled by parent components
                // No toast needed - the UI change is feedback enough
            } else {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError(result.error || 'Failed to leave team');
                }
                button.disabled = false;
                button.innerHTML = originalContent;
            }
        } catch (error) {
            console.error('Error leaving team:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Network error - please try again');
            }
            button.disabled = false;
            button.innerHTML = originalContent;
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