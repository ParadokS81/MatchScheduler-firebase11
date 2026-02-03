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

    // Swipe detection constants (Slice 10.0d)
    const SWIPE_THRESHOLD = 50;        // Min horizontal distance to trigger (px)
    const EDGE_MARGIN = 30;            // Touch zone from screen edge (px)
    const VERTICAL_TOLERANCE = 20;     // Max vertical drift before cancel (px)

    // Swipe state
    let _swipeStartX = null;
    let _swipeStartY = null;
    let _swipeDistance = 0;
    let _swipeDirection = null;        // 'left' | 'right' | null

    // Original parent references for DOM restoration
    let _originalParents = {};

    // Node relocation map
    const LEFT_DRAWER_NODES = ['panel-top-left'];
    const RIGHT_DRAWER_NODES = ['panel-top-right', 'panel-mid-right', 'panel-bottom-right'];

    // ========================================
    // Slice 10.0d: Swipe Gesture Detection
    // ========================================

    function _setupSwipeDetection() {
        document.addEventListener('pointerdown', _handleSwipeStart, { passive: true });
        document.addEventListener('pointermove', _handleSwipeMove, { passive: true });
        document.addEventListener('pointerup', _handleSwipeEnd);
    }

    function _cleanupSwipeDetection() {
        document.removeEventListener('pointerdown', _handleSwipeStart);
        document.removeEventListener('pointermove', _handleSwipeMove);
        document.removeEventListener('pointerup', _handleSwipeEnd);
    }

    function _handleSwipeStart(e) {
        if (!_isMobile || !e.isPrimary) return;
        // Don't start swipe if drawer already open
        if (_activeDrawer) return;

        const isLeftEdge = e.clientX < EDGE_MARGIN;
        const isRightEdge = e.clientX > (window.innerWidth - EDGE_MARGIN);
        if (!isLeftEdge && !isRightEdge) return;

        _swipeStartX = e.clientX;
        _swipeStartY = e.clientY;
        _swipeDistance = 0;
        // Swipe direction is opposite of edge: left edge → swipe right → open left drawer
        _swipeDirection = isLeftEdge ? 'right' : 'left';
    }

    function _handleSwipeMove(e) {
        if (_swipeStartX === null || !_swipeDirection) return;

        const moveX = Math.abs(e.clientX - _swipeStartX);
        const moveY = Math.abs(e.clientY - _swipeStartY);

        // Cancel if moving too much vertically (user is scrolling)
        if (moveY > VERTICAL_TOLERANCE && moveY > moveX) {
            _resetSwipe();
            return;
        }

        _swipeDistance = moveX;
    }

    function _handleSwipeEnd(e) {
        if (_swipeStartX === null || !_swipeDirection) return;

        if (_swipeDistance >= SWIPE_THRESHOLD) {
            // Left edge → swipe right → open left drawer
            // Right edge → swipe left → open right drawer
            if (_swipeDirection === 'right') {
                openLeftDrawer();
            } else {
                openRightDrawer();
            }
        }

        _resetSwipe();
    }

    function _resetSwipe() {
        _swipeStartX = null;
        _swipeStartY = null;
        _swipeDistance = 0;
        _swipeDirection = null;
    }

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
        _mobileQuery = window.matchMedia('(max-width: 1024px) and (orientation: landscape)');
        _mobileQuery.addEventListener('change', _handleBreakpointChange);

        // Overlay click closes drawer
        _overlay.addEventListener('click', closeDrawer);

        // Set up swipe gesture detection (Slice 10.0d)
        _setupSwipeDetection();

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
        // Apply panel toggle for current tab
        _toggleCenterPanels(true);
    }

    function _exitMobile() {
        closeDrawer();
        _isMobile = false;
        _restoreNodesToOriginal();
        // Clear inline display styles so desktop grid is unaffected
        _toggleCenterPanels(false);
    }

    /**
     * Manage center panel visibility during mobile/desktop transitions.
     * @param {boolean} entering - true when entering mobile, false when exiting
     */
    function _toggleCenterPanels(entering) {
        const topCenter = document.getElementById('panel-top-center');
        const bottomCenter = document.getElementById('panel-bottom-center');
        if (!topCenter || !bottomCenter) return;

        if (entering) {
            // On mobile: show the active tab's panel, hide the other
            const activeTab = typeof BottomPanelController !== 'undefined'
                ? BottomPanelController.getActiveTab() : 'calendar';
            if (activeTab === 'calendar') {
                topCenter.style.display = '';
                bottomCenter.style.display = 'none';
            } else {
                topCenter.style.display = 'none';
                bottomCenter.style.display = '';
            }
        } else {
            // On desktop: clear all inline styles so CSS grid takes over
            topCenter.style.display = '';
            bottomCenter.style.display = '';
        }
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

        // Hide any lingering tooltips (they use mouseleave which doesn't fire on touch)
        document.querySelectorAll('.player-tooltip').forEach(el => {
            el.style.display = 'none';
        });

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
        // Clean up swipe detection (Slice 10.0d)
        _cleanupSwipeDetection();
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
