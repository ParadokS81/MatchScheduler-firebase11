// OnboardingModal Component - Unified team creation/joining flow
// Following PRD v2 Architecture with Revealing Module Pattern

const OnboardingModal = (function() {
    'use strict';
    
    // Private variables
    let _isVisible = false;
    let _currentUser = null;
    let _userProfile = null;
    let _mode = 'select'; // 'select', 'create', 'join'
    let _keydownHandler = null;
    
    // Show onboarding modal
    function show(user, userProfile) {
        if (_isVisible) return;
        
        _currentUser = user;
        _userProfile = userProfile;
        _mode = 'select';
        _isVisible = true;
        
        _renderModal();
        _attachEventListeners();
        _focusFirstInput();
    }
    
    // Hide modal
    function hide() {
        if (!_isVisible) return;
        
        _isVisible = false;
        
        // Clean up event listeners
        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.classList.add('hidden');
        modalContainer.innerHTML = '';
    }
    
    // Render modal content based on mode
    function _renderModal() {
        const modalContainer = document.getElementById('modal-container');
        
        let content = '';
        let title = '';
        
        switch (_mode) {
            case 'select':
                title = 'Join or Create Team';
                content = _renderSelectModeContent();
                break;
            case 'create':
                title = 'Create New Team';
                content = _renderCreateModeContent();
                break;
            case 'join':
                title = 'Join Existing Team';
                content = _renderJoinModeContent();
                break;
        }
        
        const modalHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-lg">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-slate-700">
                        <h2 class="text-xl font-bold text-sky-400">${title}</h2>
                        <button id="onboarding-close-btn" class="text-slate-400 hover:text-white">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    
                    <!-- Body -->
                    <div class="p-6">
                        ${content}
                    </div>
                </div>
            </div>
        `;
        
        modalContainer.innerHTML = modalHTML;
        modalContainer.classList.remove('hidden');
    }
    
    // Render select mode content
    function _renderSelectModeContent() {
        return `
            <div class="space-y-6">
                <!-- Welcome Message -->
                <div class="text-center">
                    <div class="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-foreground mb-2">Welcome to MatchScheduler!</h3>
                    <p class="text-sm text-muted-foreground">
                        Choose how you'd like to get started with your gaming team.
                    </p>
                </div>
                
                <!-- Action Buttons -->
                <div class="space-y-3">
                    <button 
                        id="join-team-btn" 
                        class="w-full p-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors text-left"
                    >
                        <div class="flex items-center gap-3">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                            </svg>
                            <div>
                                <div class="font-semibold">Join Existing Team</div>
                                <div class="text-sm text-primary-foreground/80">Have a join code? Join your teammates!</div>
                            </div>
                        </div>
                    </button>
                    
                    <button 
                        id="create-team-btn" 
                        class="w-full p-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium rounded-lg transition-colors text-left"
                    >
                        <div class="flex items-center gap-3">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                            <div>
                                <div class="font-semibold">Create New Team</div>
                                <div class="text-sm text-secondary-foreground/80">Start a new team for tournaments or clan matches</div>
                            </div>
                        </div>
                    </button>
                </div>
                
                <!-- Gaming Context -->
                <div class="bg-muted rounded-lg p-4">
                    <h4 class="text-sm font-semibold text-foreground mb-2">What you can do:</h4>
                    <ul class="text-xs text-muted-foreground space-y-1">
                        <li>• Set your availability for matches</li>
                        <li>• Find overlapping time slots with opponents</li>
                        <li>• Schedule matches with other teams</li>
                        <li>• Join up to 2 teams (clan + tournament)</li>
                    </ul>
                </div>
            </div>
        `;
    }
    
    // Render create mode content
    function _renderCreateModeContent() {
        return `
            <div class="space-y-4">
                <!-- Back Button -->
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                    <button id="back-to-select-btn" class="flex items-center gap-1 hover:text-foreground transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        Back
                    </button>
                </div>
                
                <!-- Create Team Form -->
                <form id="create-team-form" class="space-y-4">
                    <!-- Team Name -->
                    <div>
                        <label for="team-name" class="block text-sm font-medium text-foreground mb-2">
                            Team Name
                        </label>
                        <input 
                            type="text" 
                            id="team-name" 
                            name="teamName"
                            placeholder="Enter team name"
                            class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            required
                            minlength="3"
                            maxlength="30"
                        >
                        <p class="text-xs text-muted-foreground mt-1">
                            3-30 characters, visible to other teams
                        </p>
                    </div>
                    
                    <!-- Team Tag -->
                    <div>
                        <label for="team-tag" class="block text-sm font-medium text-foreground mb-2">
                            Team Tag
                        </label>
                        <input 
                            type="text" 
                            id="team-tag" 
                            name="teamTag"
                            placeholder="EQL"
                            class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary uppercase"
                            required
                            minlength="2"
                            maxlength="4"
                            pattern="[A-Za-z0-9\[\]\(\)\{\}\-_.]+"
                            style="text-transform: uppercase;"
                        >
                        <p class="text-xs text-muted-foreground mt-1">
                            2-4 characters (letters, numbers, brackets, dashes)
                        </p>
                    </div>
                    
                    <!-- Divisions -->
                    <div>
                        <label class="block text-sm font-medium text-foreground mb-2">
                            Divisions
                        </label>
                        <div class="flex gap-4">
                            <label class="flex items-center gap-2">
                                <input type="checkbox" name="divisions" value="1" class="text-primary">
                                <span class="text-sm text-foreground">Division 1</span>
                            </label>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" name="divisions" value="2" class="text-primary">
                                <span class="text-sm text-foreground">Division 2</span>
                            </label>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" name="divisions" value="3" class="text-primary">
                                <span class="text-sm text-foreground">Division 3</span>
                            </label>
                        </div>
                        <p class="text-xs text-muted-foreground mt-1">
                            Select all divisions your team competes in
                        </p>
                    </div>
                    
                    <!-- Max Players -->
                    <div>
                        <label for="max-players" class="block text-sm font-medium text-foreground mb-2">
                            Max Players
                        </label>
                        <select 
                            id="max-players" 
                            name="maxPlayers"
                            class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            required
                        >
                            <option value="">Select max players</option>
                            <option value="4">4 players</option>
                            <option value="5">5 players</option>
                            <option value="6">6 players</option>
                            <option value="7">7 players</option>
                            <option value="8">8 players</option>
                            <option value="9">9 players</option>
                            <option value="10" selected>10 players</option>
                            <option value="11">11 players</option>
                            <option value="12">12 players</option>
                            <option value="13">13 players</option>
                            <option value="14">14 players</option>
                            <option value="15">15 players</option>
                            <option value="16">16 players</option>
                            <option value="17">17 players</option>
                            <option value="18">18 players</option>
                            <option value="19">19 players</option>
                            <option value="20">20 players</option>
                        </select>
                        <p class="text-xs text-muted-foreground mt-1">
                            Maximum number of players who can join
                        </p>
                    </div>
                    
                    <!-- Error Display -->
                    <div id="create-team-error" class="hidden bg-red-900/50 border border-red-600 rounded-md p-3">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <span class="text-red-400 text-sm" id="create-team-error-text"></span>
                        </div>
                    </div>
                    
                    <!-- Submit Button -->
                    <button 
                        type="submit" 
                        id="create-team-submit"
                        class="w-full px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors"
                    >
                        Create Team
                    </button>
                </form>
            </div>
        `;
    }
    
    // Render join mode content
    function _renderJoinModeContent() {
        return `
            <div class="space-y-4">
                <!-- Back Button -->
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                    <button id="back-to-select-btn" class="flex items-center gap-1 hover:text-foreground transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                        Back
                    </button>
                </div>
                
                <!-- Join Team Form -->
                <form id="join-team-form" class="space-y-4">
                    <!-- Join Code -->
                    <div>
                        <label for="join-code" class="block text-sm font-medium text-foreground mb-2">
                            Join Code
                        </label>
                        <input 
                            type="text" 
                            id="join-code" 
                            name="joinCode"
                            placeholder="ABC123"
                            class="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary uppercase text-center text-lg font-mono"
                            required
                            minlength="6"
                            maxlength="6"
                            pattern="[A-Z0-9]{6}"
                            style="text-transform: uppercase;"
                        >
                        <p class="text-xs text-muted-foreground mt-1">
                            6-character code from your team leader
                        </p>
                    </div>
                    
                    <!-- Helper Info -->
                    <div class="bg-muted rounded-md p-3">
                        <div class="flex items-center gap-2 mb-2">
                            <svg class="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <span class="text-sm font-medium text-foreground">How to get a join code:</span>
                        </div>
                        <ul class="text-xs text-muted-foreground space-y-1">
                            <li>• Ask your team leader for the 6-character code</li>
                            <li>• Check your Discord server or team chat</li>
                            <li>• The code contains only letters and numbers</li>
                        </ul>
                    </div>
                    
                    <!-- Error Display -->
                    <div id="join-team-error" class="hidden bg-red-900/50 border border-red-600 rounded-md p-3">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <span class="text-red-400 text-sm" id="join-team-error-text"></span>
                        </div>
                    </div>
                    
                    <!-- Submit Button -->
                    <button 
                        type="submit" 
                        id="join-team-submit"
                        class="w-full px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors"
                    >
                        Join Team
                    </button>
                </form>
            </div>
        `;
    }
    
    // Attach event listeners
    function _attachEventListeners() {
        // Mode switching buttons
        const joinTeamBtn = document.getElementById('join-team-btn');
        const createTeamBtn = document.getElementById('create-team-btn');
        const backToSelectBtn = document.getElementById('back-to-select-btn');
        const closeBtn = document.getElementById('onboarding-close-btn');
        
        // Forms
        const createTeamForm = document.getElementById('create-team-form');
        const joinTeamForm = document.getElementById('join-team-form');
        
        // Input formatters
        const teamTagInput = document.getElementById('team-tag');
        const joinCodeInput = document.getElementById('join-code');
        
        // Mode switching
        if (joinTeamBtn) {
            joinTeamBtn.addEventListener('click', () => {
                _mode = 'join';
                _renderModal();
                _attachEventListeners();
                _focusFirstInput();
            });
        }
        
        if (createTeamBtn) {
            createTeamBtn.addEventListener('click', () => {
                _mode = 'create';
                _renderModal();
                _attachEventListeners();
                _focusFirstInput();
            });
        }
        
        if (backToSelectBtn) {
            backToSelectBtn.addEventListener('click', () => {
                _mode = 'select';
                _renderModal();
                _attachEventListeners();
                _focusFirstInput();
            });
        }
        
        // Close button
        if (closeBtn) {
            closeBtn.addEventListener('click', hide);
        }
        
        // Form submissions
        if (createTeamForm) {
            createTeamForm.addEventListener('submit', _handleCreateTeamSubmit);
        }
        
        if (joinTeamForm) {
            joinTeamForm.addEventListener('submit', _handleJoinTeamSubmit);
        }
        
        // Input formatting
        if (teamTagInput) {
            teamTagInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
        }
        
        if (joinCodeInput) {
            joinCodeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
        }
        
        // Close on backdrop click
        const modalContainer = document.getElementById('modal-container');
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                hide();
            }
        });
        
        // Close on escape key
        _keydownHandler = _handleKeyDown;
        document.addEventListener('keydown', _keydownHandler);
    }
    
    // Handle create team form submission
    async function _handleCreateTeamSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const teamName = formData.get('teamName').trim();
        const teamTag = formData.get('teamTag').trim().toUpperCase();
        const divisions = formData.getAll('divisions');
        const maxPlayers = parseInt(formData.get('maxPlayers'));
        
        // Validate input
        if (!_validateCreateTeamInput(teamName, teamTag, divisions, maxPlayers)) {
            return;
        }
        
        const submitBtn = document.getElementById('create-team-submit');
        
        // Show loading state
        _setButtonLoading(submitBtn, true, 'Creating Team...');
        _hideError('create-team-error');
        
        try {
            // Check if TeamService is available
            if (typeof TeamService === 'undefined') {
                throw new Error('Team service not available');
            }
            
            const teamData = {
                teamName,
                teamTag,
                divisions,
                maxPlayers
            };
            
            const team = await TeamService.createTeam(teamData);
            
            console.log('✅ Team created successfully:', team);
            
            // Hide modal
            hide();
            
            // Emit team created event for UI coordination
            window.dispatchEvent(new CustomEvent('team-created', {
                detail: { team }
            }));
            
            // Real-time listener will automatically update TeamInfo
            
        } catch (error) {
            console.error('❌ Team creation failed:', error);
            _showError('create-team-error', error.message);
            _setButtonLoading(submitBtn, false, 'Create Team');
        }
    }
    
    // Handle join team form submission
    async function _handleJoinTeamSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const joinCode = formData.get('joinCode').trim().toUpperCase();
        
        // Validate input
        if (!_validateJoinTeamInput(joinCode)) {
            return;
        }
        
        const submitBtn = document.getElementById('join-team-submit');
        
        // Show loading state
        _setButtonLoading(submitBtn, true, 'Joining Team...');
        _hideError('join-team-error');
        
        try {
            // Check if TeamService is available
            if (typeof TeamService === 'undefined') {
                throw new Error('Team service not available');
            }
            
            const team = await TeamService.joinTeam(joinCode);
            
            console.log('✅ Team joined successfully:', team);
            
            // Hide modal
            hide();
            
            // Emit team joined event for UI coordination
            window.dispatchEvent(new CustomEvent('team-joined', {
                detail: { team }
            }));
            
            // Real-time listener will automatically update TeamInfo
            
        } catch (error) {
            console.error('❌ Team join failed:', error);
            _showError('join-team-error', error.message);
            _setButtonLoading(submitBtn, false, 'Join Team');
        }
    }
    
    // Validate create team input
    function _validateCreateTeamInput(teamName, teamTag, divisions, maxPlayers) {
        const teamNameError = TeamService.validateTeamName(teamName);
        if (teamNameError) {
            _showError('create-team-error', teamNameError);
            return false;
        }
        
        const teamTagError = TeamService.validateTeamTag(teamTag);
        if (teamTagError) {
            _showError('create-team-error', teamTagError);
            return false;
        }
        
        if (!divisions || divisions.length === 0) {
            _showError('create-team-error', 'Please select at least one division');
            return false;
        }
        
        if (!maxPlayers || maxPlayers < 4 || maxPlayers > 20) {
            _showError('create-team-error', 'Max players must be between 4 and 20');
            return false;
        }
        
        return true;
    }
    
    // Validate join team input
    function _validateJoinTeamInput(joinCode) {
        const joinCodeError = TeamService.validateJoinCode(joinCode);
        if (joinCodeError) {
            _showError('join-team-error', joinCodeError);
            return false;
        }
        
        return true;
    }
    
    // Show error message
    function _showError(errorId, message) {
        const errorDiv = document.getElementById(errorId);
        const errorText = document.getElementById(errorId + '-text');
        
        if (errorDiv && errorText) {
            errorText.textContent = message;
            errorDiv.classList.remove('hidden');
        }
    }
    
    // Hide error message
    function _hideError(errorId) {
        const errorDiv = document.getElementById(errorId);
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    }
    
    // Set button loading state
    function _setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;
        
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = `
                <div class="flex items-center justify-center gap-2">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                    <span>${loadingText}</span>
                </div>
            `;
        } else {
            button.disabled = false;
            button.innerHTML = loadingText;
        }
    }
    
    // Handle keyboard events
    function _handleKeyDown(e) {
        if (e.key === 'Escape') {
            hide();
        }
    }
    
    // Focus first input
    function _focusFirstInput() {
        setTimeout(() => {
            let firstInput = null;
            
            if (_mode === 'create') {
                firstInput = document.getElementById('team-name');
            } else if (_mode === 'join') {
                firstInput = document.getElementById('join-code');
            }
            
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
    }
    
    // Public API
    return {
        show,
        hide
    };
})();