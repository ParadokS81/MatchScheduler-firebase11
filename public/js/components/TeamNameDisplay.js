// TeamNameDisplay.js - Shows team name in mid-left divider panel
// Slice 13.0a: Relocated from TeamInfo top-left panel

const TeamNameDisplay = (function() {
    'use strict';

    let _panel = null;
    let _selectedTeam = null;

    function init(panelId) {
        _panel = document.getElementById(panelId);
        if (!_panel) {
            console.error('TeamNameDisplay: Panel not found:', panelId);
            return;
        }

        // Listen for team selection changes
        window.addEventListener('team-selected', _handleTeamSelected);

        _render();
        console.log('TeamNameDisplay initialized');
    }

    function _handleTeamSelected(event) {
        _selectedTeam = event.detail?.team || null;
        _render();
    }

    function setTeam(team) {
        _selectedTeam = team;
        _render();
    }

    function _render() {
        if (!_panel) return;

        if (!_selectedTeam) {
            _panel.innerHTML = '';
            return;
        }

        // Team name display for 3rem height divider - maximize font size
        // Show: "TeamName   ]TAG[" with tag in muted color (tag already includes brackets)
        const teamTag = _selectedTeam.teamTag ? `<span class="text-muted-foreground font-normal ml-3">${_selectedTeam.teamTag}</span>` : '';

        _panel.innerHTML = `
            <div class="flex items-center justify-center gap-2 h-full px-2">
                <span class="text-lg font-semibold text-foreground truncate">${_selectedTeam.teamName}${teamTag}</span>
                <span class="team-settings-icon opacity-60 hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
                      data-action="open-settings" title="Team Settings">
                    <svg class="w-4 h-4 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </span>
            </div>
        `;

        _attachEventListeners();
    }

    function _attachEventListeners() {
        const settingsIcon = _panel?.querySelector('[data-action="open-settings"]');
        if (settingsIcon) {
            settingsIcon.addEventListener('click', () => {
                if (_selectedTeam && typeof TeamManagementModal !== 'undefined') {
                    TeamManagementModal.show(_selectedTeam.id);
                }
            });
        }
    }

    function cleanup() {
        window.removeEventListener('team-selected', _handleTeamSelected);
        _panel = null;
        _selectedTeam = null;
    }

    return { init, setTeam, cleanup };
})();
