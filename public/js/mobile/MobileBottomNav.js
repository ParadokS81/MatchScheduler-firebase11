// MobileBottomNav.js - Fixed bottom navigation bar
// Slice M1.0: 4 tabs, active state indicator. Only Home is functional.

const MobileBottomNav = (function() {
    'use strict';

    const TABS = [
        { id: 'home', icon: '\uD83C\uDFE0', label: 'Home' },
        { id: 'compare', icon: '\u2694\uFE0F', label: 'Compare' },
        { id: 'team', icon: '\uD83D\uDC65', label: 'Team' },
        { id: 'profile', icon: '\uD83D\uDC64', label: 'Profile' },
    ];

    function init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let html = '';
        TABS.forEach(tab => {
            const active = tab.id === 'home' ? ' active' : '';
            html += `
                <button class="mobile-nav-tab${active}"
                        data-tab="${tab.id}">
                    <span class="mobile-nav-icon">${tab.icon}</span>
                    <span class="mobile-nav-label">${tab.label}</span>
                </button>
            `;
        });
        container.innerHTML = html;

        // Tab click handler
        container.addEventListener('click', (e) => {
            const tab = e.target.closest('.mobile-nav-tab');
            if (!tab || tab.disabled) return;

            container.querySelectorAll('.mobile-nav-tab').forEach(t =>
                t.classList.remove('active'));
            tab.classList.add('active');
            MobileApp.switchTab(tab.dataset.tab);
        });
    }

    return { init };
})();
