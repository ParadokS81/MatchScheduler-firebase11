// DevToolbar - Dev-only user switcher for testing multi-user flows
// Only renders in dev mode (localhost/emulators)

const DevToolbar = (function() {
    'use strict';

    let _container = null;
    let _isExpanded = false;

    function init() {
        // Only initialize in dev mode
        if (!AuthService.isDevMode()) {
            return;
        }

        _createToolbar();
        _setupAuthListener();
        console.log('🔧 DevToolbar initialized');
    }

    function _createToolbar() {
        _container = document.createElement('div');
        _container.id = 'dev-toolbar';
        _container.innerHTML = `
            <div class="dev-toolbar-toggle" title="Dev User Switcher">
                <span class="dev-toolbar-icon">DEV</span>
            </div>
            <div class="dev-toolbar-panel">
                <div class="dev-toolbar-header">Switch User</div>
                <div class="dev-toolbar-users"></div>
                <div class="dev-toolbar-hint">Select user to test multi-user flows</div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #dev-toolbar {
                position: fixed;
                bottom: 1rem;
                left: 1rem;
                z-index: 9999;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 0.75rem;
            }

            .dev-toolbar-toggle {
                width: 2.5rem;
                height: 2.5rem;
                background: #ef4444;
                border-radius: 0.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transition: transform 0.15s, background 0.15s;
            }

            .dev-toolbar-toggle:hover {
                transform: scale(1.05);
                background: #dc2626;
            }

            .dev-toolbar-icon {
                color: white;
                font-weight: 700;
                font-size: 0.625rem;
            }

            .dev-toolbar-panel {
                display: none;
                position: absolute;
                bottom: 3rem;
                left: 0;
                background: #1f2937;
                border: 1px solid #374151;
                border-radius: 0.5rem;
                padding: 0.5rem;
                min-width: 10rem;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            }

            #dev-toolbar.expanded .dev-toolbar-panel {
                display: block;
            }

            .dev-toolbar-header {
                color: #9ca3af;
                font-size: 0.625rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 0.25rem 0.5rem;
                border-bottom: 1px solid #374151;
                margin-bottom: 0.25rem;
            }

            .dev-toolbar-users {
                display: flex;
                flex-direction: column;
                gap: 0.125rem;
            }

            .dev-user-btn {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.375rem 0.5rem;
                background: transparent;
                border: none;
                border-radius: 0.25rem;
                color: #e5e7eb;
                cursor: pointer;
                text-align: left;
                width: 100%;
                transition: background 0.1s;
            }

            .dev-user-btn:hover {
                background: #374151;
            }

            .dev-user-btn.active {
                background: #3b82f6;
            }

            .dev-user-avatar {
                width: 1.5rem;
                height: 1.5rem;
                background: #4b5563;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.5rem;
                font-weight: 600;
                color: white;
            }

            .dev-user-btn.active .dev-user-avatar {
                background: #1d4ed8;
            }

            .dev-user-name {
                flex: 1;
                white-space: nowrap;
            }

            .dev-toolbar-hint {
                color: #6b7280;
                font-size: 0.5625rem;
                padding: 0.375rem 0.5rem 0.25rem;
                border-top: 1px solid #374151;
                margin-top: 0.25rem;
            }

            .dev-user-loading {
                opacity: 0.5;
                pointer-events: none;
            }

            .dev-toolbar-team-label {
                color: #6b7280;
                font-size: 0.5625rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 0.375rem 0.5rem 0.125rem;
                margin-top: 0.25rem;
                border-top: 1px solid #374151;
            }

            .dev-toolbar-team-label:first-child {
                margin-top: 0;
                border-top: none;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(_container);

        // Toggle panel on click
        const toggle = _container.querySelector('.dev-toolbar-toggle');
        toggle.addEventListener('click', () => {
            _isExpanded = !_isExpanded;
            _container.classList.toggle('expanded', _isExpanded);
        });

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (_isExpanded && !_container.contains(e.target)) {
                _isExpanded = false;
                _container.classList.remove('expanded');
            }
        });

        _renderUsers();
    }

    function _renderUsers() {
        const usersContainer = _container.querySelector('.dev-toolbar-users');
        const devUsers = AuthService.getDevUsers();
        const currentUser = AuthService.getCurrentUser();

        // Group users by team for clearer display
        let lastTeam = '';
        const html = devUsers.map(user => {
            const teamLabel = user.team && user.team !== lastTeam
                ? `<div class="dev-toolbar-team-label">${user.team}</div>`
                : '';
            lastTeam = user.team || '';
            return `${teamLabel}<button class="dev-user-btn ${currentUser?.uid === user.uid ? 'active' : ''}"
                    data-uid="${user.uid}">
                <span class="dev-user-avatar">${user.initials}</span>
                <span class="dev-user-name">${user.displayName}</span>
            </button>`;
        }).join('');
        usersContainer.innerHTML = html;

        // Add click handlers
        usersContainer.querySelectorAll('.dev-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                if (currentUser?.uid === uid) return;

                // Show loading state
                btn.classList.add('dev-user-loading');
                btn.textContent = 'Switching...';

                try {
                    await AuthService.switchToDevUser(uid);
                    // Page will effectively reload context via auth listeners
                } catch (error) {
                    console.error('Failed to switch user:', error);
                    _renderUsers(); // Re-render on error
                }
            });
        });
    }

    function _setupAuthListener() {
        AuthService.onAuthStateChange((user) => {
            if (_container) {
                _renderUsers();
            }
        });
    }

    return { init };
})();

// Auto-initialize after AuthService
document.addEventListener('DOMContentLoaded', () => {
    // Wait for AuthService to be ready
    setTimeout(DevToolbar.init, 500);
});
