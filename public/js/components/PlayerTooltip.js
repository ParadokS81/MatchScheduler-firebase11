// PlayerTooltip.js - Lightweight hover tooltip for player lists
// Following CLAUDE.md architecture: Revealing Module Pattern

const PlayerTooltip = (function() {
    'use strict';

    let _tooltip = null;
    let _hideTimeout = null;
    let _currentCellId = null;

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function _createTooltip() {
        if (_tooltip) return;

        _tooltip = document.createElement('div');
        _tooltip.id = 'player-tooltip';
        _tooltip.className = 'player-tooltip';
        _tooltip.style.display = 'none';
        document.body.appendChild(_tooltip);

        // Keep tooltip visible when hovering over it
        _tooltip.addEventListener('mouseenter', () => {
            if (_hideTimeout) {
                clearTimeout(_hideTimeout);
                _hideTimeout = null;
            }
        });

        _tooltip.addEventListener('mouseleave', () => {
            hide();
        });
    }

    /**
     * Show tooltip near the hovered cell
     * @param {HTMLElement} cell - The grid cell being hovered
     * @param {Array} players - Array of player display objects
     * @param {string} currentUserId - Current user's ID
     */
    function show(cell, players, currentUserId) {
        _createTooltip();

        if (_hideTimeout) {
            clearTimeout(_hideTimeout);
            _hideTimeout = null;
        }

        _currentCellId = cell.dataset.cellId;

        // Sort: current user first, then alphabetically
        const sortedPlayers = [...players].sort((a, b) => {
            if (a.isCurrentUser) return -1;
            if (b.isCurrentUser) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        // Build tooltip content
        const playersHtml = sortedPlayers.map(player => {
            const youBadge = player.isCurrentUser ? ' <span class="tooltip-you">(You)</span>' : '';
            const currentClass = player.isCurrentUser ? 'tooltip-current' : '';
            return `
                <div class="tooltip-player ${currentClass}">
                    <span class="tooltip-initials">${_escapeHtml(player.initials)}</span>
                    <span class="tooltip-name">${_escapeHtml(player.displayName)}${youBadge}</span>
                </div>
            `;
        }).join('');

        _tooltip.innerHTML = `
            <div class="tooltip-header">${players.length} players available</div>
            <div class="tooltip-list">
                ${playersHtml}
            </div>
        `;

        // Position tooltip near cell
        const cellRect = cell.getBoundingClientRect();

        // Default: show to the right of the cell
        let left = cellRect.right + 8;
        let top = cellRect.top;

        // Make tooltip visible (but off-screen) to measure it
        _tooltip.style.visibility = 'hidden';
        _tooltip.style.display = 'block';
        const tooltipRect = _tooltip.getBoundingClientRect();

        // If tooltip would go off right edge, show on left
        if (left + tooltipRect.width > window.innerWidth) {
            left = cellRect.left - tooltipRect.width - 8;
        }

        // If tooltip would go off bottom, adjust up
        if (top + tooltipRect.height > window.innerHeight) {
            top = window.innerHeight - tooltipRect.height - 8;
        }

        // Ensure tooltip doesn't go off top
        if (top < 8) {
            top = 8;
        }

        _tooltip.style.left = `${left}px`;
        _tooltip.style.top = `${top}px`;
        _tooltip.style.visibility = 'visible';
    }

    function hide() {
        _hideTimeout = setTimeout(() => {
            if (_tooltip) {
                _tooltip.style.display = 'none';
            }
            _currentCellId = null;
        }, 150); // Small delay to allow moving to tooltip
    }

    function hideImmediate() {
        if (_hideTimeout) {
            clearTimeout(_hideTimeout);
            _hideTimeout = null;
        }
        if (_tooltip) {
            _tooltip.style.display = 'none';
        }
        _currentCellId = null;
    }

    function isVisible() {
        return _tooltip && _tooltip.style.display !== 'none';
    }

    function getCurrentCellId() {
        return _currentCellId;
    }

    function cleanup() {
        hideImmediate();
        if (_tooltip) {
            _tooltip.remove();
            _tooltip = null;
        }
    }

    return {
        show,
        hide,
        hideImmediate,
        isVisible,
        getCurrentCellId,
        cleanup
    };
})();
