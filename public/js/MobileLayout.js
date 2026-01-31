/**
 * MobileLayout.js — Drawer Management for Mobile Landscape
 * Slice 10.0b
 *
 * Detects mobile viewport (≤900px landscape), relocates DOM nodes
 * into left/right drawers, and manages drawer open/close state.
 *
 * Public API (consumed by 10.0c):
 *   MobileLayout.openLeftDrawer()
 *   MobileLayout.openRightDrawer()
 *   MobileLayout.closeDrawer()
 *   MobileLayout.isDrawerOpen() → boolean
 *   MobileLayout.isMobile() → boolean
 */
const MobileLayout = (function() {
    // Private state
    let _mobileQuery = null;
    let _isMobile = false;
    let _activeDrawer = null; // 'left' | 'right' | null

    // DOM references
    let _leftDrawer, _rightDrawer, _overlay;

    // Original parent references for DOM restoration
    let _originalParents = {};

    // Node relocation map
    const LEFT_DRAWER_NODES = ['panel-top-left'];
    const RIGHT_DRAWER_NODES = ['panel-top-right', 'panel-mid-right'];

    function init() {
        _leftDrawer = document.getElementById('mobile-drawer-left');
        _rightDrawer = document.getElementById('mobile-drawer-right');
        _overlay = document.getElementById('mobile-drawer-overlay');

        if (!_leftDrawer || !_rightDrawer || !_overlay) {
            console.warn('MobileLayout: drawer elements not found, skipping init');
            return;
        }

        // Store original parents before any moves
        _storeOriginalParents();

        // Set up media query listener
        _mobileQuery = window.matchMedia('(max-width: 900px) and (orientation: landscape)');
        _mobileQuery.addEventListener('change', _handleBreakpointChange);

        // Overlay click closes drawer
        _overlay.addEventListener('click', closeDrawer);

        // Apply initial state
        _handleBreakpointChange(_mobileQuery);

        console.log('📱 MobileLayout initialized');
    }

    function _storeOriginalParents() {
        [...LEFT_DRAWER_NODES, ...RIGHT_DRAWER_NODES].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.parentElement) {
                _originalParents[id] = {
                    parent: el.parentElement,
                    nextSibling: el.nextElementSibling
                };
            }
        });
    }

    function _handleBreakpointChange(e) {
        const matches = e.matches !== undefined ? e.matches : e;
        if (matches) {
            _enterMobile();
        } else {
            _exitMobile();
        }
    }

    function _enterMobile() {
        _isMobile = true;
        _moveNodesToDrawers();
    }

    function _exitMobile() {
        closeDrawer();
        _isMobile = false;
        _restoreNodesToOriginal();
    }

    function _moveNodesToDrawers() {
        const leftContent = _leftDrawer.querySelector('.mobile-drawer-content');
        const rightContent = _rightDrawer.querySelector('.mobile-drawer-content');

        LEFT_DRAWER_NODES.forEach(id => {
            const el = document.getElementById(id);
            if (el) leftContent.appendChild(el);
        });

        RIGHT_DRAWER_NODES.forEach(id => {
            const el = document.getElementById(id);
            if (el) rightContent.appendChild(el);
        });
    }

    function _restoreNodesToOriginal() {
        Object.entries(_originalParents).forEach(([id, info]) => {
            const el = document.getElementById(id);
            if (el && info.parent) {
                if (info.nextSibling) {
                    info.parent.insertBefore(el, info.nextSibling);
                } else {
                    info.parent.appendChild(el);
                }
            }
        });
    }

    function openLeftDrawer() {
        if (!_isMobile) return;
        if (_activeDrawer === 'left') return;
        if (_activeDrawer) closeDrawer();

        _leftDrawer.classList.remove('hidden');
        _overlay.classList.remove('hidden');
        // Force reflow before adding .open for transition
        _leftDrawer.offsetHeight;
        _leftDrawer.classList.add('open');
        _leftDrawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        _activeDrawer = 'left';
    }

    function openRightDrawer() {
        if (!_isMobile) return;
        if (_activeDrawer === 'right') return;
        if (_activeDrawer) closeDrawer();

        _rightDrawer.classList.remove('hidden');
        _overlay.classList.remove('hidden');
        _rightDrawer.offsetHeight;
        _rightDrawer.classList.add('open');
        _rightDrawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        _activeDrawer = 'right';
    }

    function closeDrawer() {
        if (!_activeDrawer) return;

        const drawer = _activeDrawer === 'left' ? _leftDrawer : _rightDrawer;
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
        _overlay.classList.add('hidden');
        document.body.style.overflow = '';

        // Hide drawer element after transition completes
        drawer.addEventListener('transitionend', function handler() {
            if (!drawer.classList.contains('open')) {
                drawer.classList.add('hidden');
            }
            drawer.removeEventListener('transitionend', handler);
        });

        _activeDrawer = null;
    }

    function isDrawerOpen() {
        return _activeDrawer !== null;
    }

    function isMobile() {
        return _isMobile;
    }

    function cleanup() {
        if (_mobileQuery) {
            _mobileQuery.removeEventListener('change', _handleBreakpointChange);
        }
        if (_overlay) {
            _overlay.removeEventListener('click', closeDrawer);
        }
        closeDrawer();
        _restoreNodesToOriginal();
    }

    return {
        init,
        cleanup,
        openLeftDrawer,
        openRightDrawer,
        closeDrawer,
        isDrawerOpen,
        isMobile
    };
})();
