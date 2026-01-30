// ColorPickerPopover.js - Color selection popover for player color assignment
// Following CLAUDE.md architecture: Revealing Module Pattern
// Slice 5.0.1: Color picker UI for assigning colors to roster members

const ColorPickerPopover = (function() {
    'use strict';

    let _popover = null;
    let _targetUserId = null;
    let _onSelectCallback = null;

    /**
     * Show the color picker popover
     * @param {HTMLElement} anchorEl - Element to position popover near
     * @param {string} userId - The player's userId to assign color to
     * @param {Function} onSelect - Optional callback when color is selected
     */
    function show(anchorEl, userId, onSelect = null) {
        _targetUserId = userId;
        _onSelectCallback = onSelect;

        const currentColor = typeof PlayerColorService !== 'undefined'
            ? PlayerColorService.getPlayerColor(userId)
            : null;

        const presetColors = typeof PlayerColorService !== 'undefined'
            ? PlayerColorService.getPresetColors()
            : ['#FF6B6B', '#FFD93D', '#6BCB77', '#45B7D1', '#A78BFA', '#F472B6'];

        // Remove existing popover if any
        if (_popover) {
            _popover.remove();
        }

        _popover = document.createElement('div');
        _popover.className = 'color-picker-popover fixed z-50 bg-card border border-border rounded-lg shadow-xl p-3';
        _popover.innerHTML = `
            <div class="grid grid-cols-6 gap-2 mb-3">
                ${presetColors.map(color => `
                    <button class="color-swatch w-6 h-6 rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/50
                                   ${color === currentColor ? 'border-primary ring-2 ring-primary/50' : 'border-transparent hover:border-border'}"
                            style="background-color: ${color}"
                            data-color="${color}"
                            title="${color}">
                    </button>
                `).join('')}
            </div>
            <div class="flex items-center gap-2 pt-2 border-t border-border">
                <input type="text"
                       class="color-hex-input flex-1 px-2 py-1 text-xs bg-input border border-border rounded font-mono uppercase"
                       placeholder="#RRGGBB"
                       value="${currentColor || ''}"
                       maxlength="7">
                <button class="clear-color-btn text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">
                    Clear
                </button>
            </div>
        `;

        // Position near anchor element
        const rect = anchorEl.getBoundingClientRect();
        const popoverWidth = 200; // Approximate width
        const popoverHeight = 140; // Approximate height
        const padding = 8;

        // Default: below and aligned to left of anchor
        let top = rect.bottom + padding;
        let left = rect.left;

        // Adjust if would go off right edge
        if (left + popoverWidth > window.innerWidth - padding) {
            left = window.innerWidth - popoverWidth - padding;
        }

        // Adjust if would go off left edge
        if (left < padding) {
            left = padding;
        }

        // Adjust if would go off bottom - show above instead
        if (top + popoverHeight > window.innerHeight - padding) {
            top = rect.top - popoverHeight - padding;
        }

        _popover.style.top = `${top}px`;
        _popover.style.left = `${left}px`;

        document.body.appendChild(_popover);

        // Attach event listeners
        _attachListeners();

        // Focus the hex input
        const hexInput = _popover.querySelector('.color-hex-input');
        hexInput?.focus();
        hexInput?.select();
    }

    /**
     * Attach event listeners to popover elements
     */
    function _attachListeners() {
        if (!_popover) return;

        // Color swatch clicks
        _popover.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                _selectColor(swatch.dataset.color);
            });
        });

        // Clear button
        const clearBtn = _popover.querySelector('.clear-color-btn');
        clearBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            _selectColor(null);
        });

        // Hex input
        const hexInput = _popover.querySelector('.color-hex-input');
        hexInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = hexInput.value.trim();
                if (_isValidHex(value)) {
                    _selectColor(value);
                } else if (value === '') {
                    _selectColor(null);
                } else {
                    // Invalid - shake the input
                    hexInput.classList.add('animate-shake');
                    setTimeout(() => hexInput.classList.remove('animate-shake'), 300);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hide();
            }
        });

        // Auto-format hex input
        hexInput?.addEventListener('input', (e) => {
            let value = e.target.value.toUpperCase();
            // Add # if missing
            if (value && !value.startsWith('#')) {
                value = '#' + value;
            }
            // Remove non-hex characters (except #)
            value = value.replace(/[^#0-9A-F]/g, '');
            // Limit to 7 characters (#RRGGBB)
            value = value.slice(0, 7);
            e.target.value = value;
        });

        // Click outside to close (with delay to avoid immediate close)
        setTimeout(() => {
            document.addEventListener('click', _handleOutsideClick);
            document.addEventListener('keydown', _handleEscape);
        }, 0);
    }

    /**
     * Handle click outside popover
     */
    function _handleOutsideClick(e) {
        if (_popover && !_popover.contains(e.target)) {
            hide();
        }
    }

    /**
     * Handle escape key
     */
    function _handleEscape(e) {
        if (e.key === 'Escape') {
            hide();
        }
    }

    /**
     * Select a color and save it
     */
    async function _selectColor(color) {
        if (!_targetUserId) {
            hide();
            return;
        }

        // Save via PlayerColorService
        if (typeof PlayerColorService !== 'undefined') {
            const result = await PlayerColorService.setPlayerColor(_targetUserId, color);
            if (!result.success) {
                console.error('Failed to save color:', result.error);
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError('Failed to save color');
                }
            }
        }

        // Call optional callback
        if (_onSelectCallback) {
            _onSelectCallback(color);
        }

        hide();
    }

    /**
     * Validate hex color format
     */
    function _isValidHex(str) {
        return /^#[0-9A-Fa-f]{6}$/.test(str);
    }

    /**
     * Hide and cleanup the popover
     */
    function hide() {
        document.removeEventListener('click', _handleOutsideClick);
        document.removeEventListener('keydown', _handleEscape);

        if (_popover) {
            _popover.remove();
            _popover = null;
        }

        _targetUserId = null;
        _onSelectCallback = null;
    }

    /**
     * Check if popover is currently visible
     */
    function isVisible() {
        return _popover !== null;
    }

    return {
        show,
        hide,
        isVisible
    };
})();
