// MobileBottomSheet.js - Generic slide-up sheet for mobile detail views
// Supports two stacked layers: open() for layer 1, push()/pop() for layer 2
// Layer 2 slides on top of layer 1 for sub-views (e.g. Grid Tools → Edit Timeslots)

const MobileBottomSheet = (function() {
    'use strict';

    // Layer 1
    let _sheet = null;
    let _backdrop = null;
    let _content = null;
    let _isOpen = false;
    let _onCloseCallback = null;

    // Layer 2
    let _sheet2 = null;
    let _backdrop2 = null;
    let _content2 = null;
    let _isPushed = false;
    let _onPopCallback = null;

    // Drag-to-dismiss state (shared — only one layer draggable at a time)
    let _dragTarget = null; // which sheet is being dragged
    let _dragStartY = null;
    let _dragOffset = 0;
    const DISMISS_THRESHOLD = 80;

    function init() {
        if (document.getElementById('mobile-bottom-sheet')) return;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div id="mobile-sheet-backdrop" class="mobile-sheet-backdrop hidden"></div>
            <div id="mobile-bottom-sheet" class="mobile-bottom-sheet hidden" aria-hidden="true">
                <div class="mobile-sheet-handle-area">
                    <div class="mobile-sheet-handle"></div>
                </div>
                <div id="mobile-sheet-content" class="mobile-sheet-content"></div>
            </div>

            <div id="mobile-sheet-backdrop-l2" class="mobile-sheet-backdrop-l2 hidden"></div>
            <div id="mobile-bottom-sheet-l2" class="mobile-bottom-sheet-l2 hidden" aria-hidden="true">
                <div class="mobile-sheet-handle-area">
                    <div class="mobile-sheet-handle"></div>
                </div>
                <div id="mobile-sheet-content-l2" class="mobile-sheet-content"></div>
            </div>
        `;

        document.body.appendChild(wrapper);

        // Layer 1 refs
        _sheet = document.getElementById('mobile-bottom-sheet');
        _backdrop = document.getElementById('mobile-sheet-backdrop');
        _content = document.getElementById('mobile-sheet-content');

        // Layer 2 refs
        _sheet2 = document.getElementById('mobile-bottom-sheet-l2');
        _backdrop2 = document.getElementById('mobile-sheet-backdrop-l2');
        _content2 = document.getElementById('mobile-sheet-content-l2');

        // Backdrop clicks
        _backdrop.addEventListener('click', () => {
            if (!_isPushed) close();
        });
        _backdrop2.addEventListener('click', pop);

        // Drag-to-dismiss — layer 1
        _attachDrag(_sheet, 'l1');
        // Drag-to-dismiss — layer 2
        _attachDrag(_sheet2, 'l2');
    }

    // ─── Layer 1: open / close ──────────────────────────────────────

    /**
     * Open the bottom sheet with HTML content (layer 1).
     * @param {string} html - HTML to render inside the sheet
     * @param {Function} [onClose] - Optional callback when sheet closes
     */
    function open(html, onClose) {
        if (!_sheet) init();

        _content.innerHTML = html;
        _onCloseCallback = onClose || null;

        _backdrop.classList.remove('hidden');
        _sheet.classList.remove('hidden');
        _sheet.offsetHeight; // force reflow
        _sheet.classList.add('open');
        _sheet.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        _isOpen = true;
    }

    /**
     * Update layer 1 content without closing/reopening.
     */
    function updateContent(html) {
        if (_content) _content.innerHTML = html;
    }

    /**
     * Get layer 1 content container for direct DOM manipulation.
     */
    function getContentElement() {
        return _content;
    }

    /**
     * Close everything — pops layer 2 first if open, then closes layer 1.
     */
    function close() {
        if (_isPushed) _popInternal();
        if (!_isOpen) return;

        _sheet.classList.remove('open');
        _sheet.style.transform = '';
        _sheet.setAttribute('aria-hidden', 'true');
        _backdrop.classList.add('hidden');
        document.body.style.overflow = '';
        _isOpen = false;

        _sheet.addEventListener('transitionend', function handler() {
            if (!_sheet.classList.contains('open')) {
                _sheet.classList.add('hidden');
                _content.innerHTML = '';
            }
            _sheet.removeEventListener('transitionend', handler);
        });

        if (_onCloseCallback) {
            const cb = _onCloseCallback;
            _onCloseCallback = null;
            cb();
        }
    }

    function isOpen() {
        return _isOpen;
    }

    // ─── Layer 2: push / pop ────────────────────────────────────────

    /**
     * Push a second sheet on top of layer 1.
     * @param {string} html - HTML to render in layer 2
     * @param {Function} [onPop] - Optional callback when layer 2 closes
     */
    function push(html, onPop) {
        if (!_sheet2) init();
        if (!_isOpen) return; // layer 1 must be open first

        _content2.innerHTML = html;
        _onPopCallback = onPop || null;

        _backdrop2.classList.remove('hidden');
        _sheet2.classList.remove('hidden');
        _sheet2.offsetHeight; // force reflow
        _sheet2.classList.add('open');
        _sheet2.setAttribute('aria-hidden', 'false');
        _isPushed = true;
    }

    /**
     * Close layer 2, returning to layer 1.
     */
    function pop() {
        _popInternal();
    }

    function _popInternal() {
        if (!_isPushed) return;

        _sheet2.classList.remove('open');
        _sheet2.style.transform = '';
        _sheet2.setAttribute('aria-hidden', 'true');
        _backdrop2.classList.add('hidden');
        _isPushed = false;

        _sheet2.addEventListener('transitionend', function handler() {
            if (!_sheet2.classList.contains('open')) {
                _sheet2.classList.add('hidden');
                _content2.innerHTML = '';
            }
            _sheet2.removeEventListener('transitionend', handler);
        });

        if (_onPopCallback) {
            const cb = _onPopCallback;
            _onPopCallback = null;
            cb();
        }
    }

    /**
     * Update layer 2 content without closing.
     */
    function updatePushedContent(html) {
        if (_content2) _content2.innerHTML = html;
    }

    /**
     * Get layer 2 content container for direct DOM manipulation.
     */
    function getPushedContentElement() {
        return _content2;
    }

    function isPushed() {
        return _isPushed;
    }

    // ─── Drag to Dismiss (shared logic, parameterized by target) ────

    function _attachDrag(sheetEl, layerId) {
        const handleArea = sheetEl.querySelector('.mobile-sheet-handle-area');

        function onStart(e) {
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            _dragTarget = sheetEl;
            _dragStartY = y;
            _dragOffset = 0;
            sheetEl.style.transition = 'none';
        }

        function onMove(e) {
            if (_dragTarget !== sheetEl || _dragStartY === null) return;
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            _dragOffset = Math.max(0, y - _dragStartY);

            if (_dragOffset > 0) {
                sheetEl.style.transform = `translateY(${_dragOffset}px)`;
                if (e.cancelable) e.preventDefault();
            }
        }

        function onEnd() {
            if (_dragTarget !== sheetEl || _dragStartY === null) return;

            sheetEl.style.transition = '';

            if (_dragOffset >= DISMISS_THRESHOLD) {
                if (layerId === 'l2') {
                    pop();
                } else {
                    close();
                }
            } else {
                sheetEl.style.transform = '';
            }

            _dragTarget = null;
            _dragStartY = null;
            _dragOffset = 0;
        }

        handleArea.addEventListener('touchstart', onStart, { passive: true });
        handleArea.addEventListener('touchmove', onMove, { passive: false });
        handleArea.addEventListener('touchend', onEnd);
        handleArea.addEventListener('pointerdown', onStart, { passive: true });
        handleArea.addEventListener('pointermove', onMove, { passive: false });
        handleArea.addEventListener('pointerup', onEnd);
    }

    return {
        init,
        // Layer 1
        open, updateContent, getContentElement, close, isOpen,
        // Layer 2
        push, pop, updatePushedContent, getPushedContentElement, isPushed
    };
})();
