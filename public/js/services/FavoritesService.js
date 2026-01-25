// FavoritesService - Manages starred teams for quick comparison
// Following PRD v2 Architecture with Revealing Module Pattern

const FavoritesService = (function() {
    'use strict';

    // Private variables
    let _favorites = new Set();  // Local cache for instant access
    let _userId = null;
    let _initialized = false;
    let _initRetryCount = 0;

    // Initialize FavoritesService
    function init(userId, initialFavorites = []) {
        if (_initialized && _userId === userId) return;

        _userId = userId;
        _favorites = new Set(initialFavorites);
        _initialized = true;

        console.log(`⭐ FavoritesService initialized with ${_favorites.size} favorites`);
    }

    // Called when user document updates (from Firestore listener)
    function updateFromFirestore(favoriteTeams) {
        const newFavorites = new Set(favoriteTeams || []);

        // Only dispatch if there's an actual change
        if (!_setsEqual(_favorites, newFavorites)) {
            _favorites = newFavorites;
            _dispatchChange();
        }
    }

    // Check if two Sets are equal
    function _setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const item of a) {
            if (!b.has(item)) return false;
        }
        return true;
    }

    // Dispatch favorites-updated event
    function _dispatchChange() {
        window.dispatchEvent(new CustomEvent('favorites-updated', {
            detail: { favorites: Array.from(_favorites) }
        }));
    }

    // Add a team to favorites
    async function addFavorite(teamId) {
        if (_favorites.has(teamId)) return { success: true };

        // Optimistic update
        _favorites.add(teamId);
        _dispatchChange();

        try {
            const result = await TeamService.callFunction('updateFavorites', {
                teamId,
                action: 'add'
            });

            if (!result.success) {
                // Rollback on failure
                _favorites.delete(teamId);
                _dispatchChange();

                if (typeof ToastService !== 'undefined') {
                    ToastService.showError(result.error || 'Failed to add favorite');
                }
            }
            return result;
        } catch (error) {
            // Rollback on error
            _favorites.delete(teamId);
            _dispatchChange();
            console.error('Failed to add favorite:', error);

            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Network error - please try again');
            }
            return { success: false, error: error.message };
        }
    }

    // Remove a team from favorites
    async function removeFavorite(teamId) {
        if (!_favorites.has(teamId)) return { success: true };

        // Also deselect the team when removing from favorites
        if (typeof TeamBrowserState !== 'undefined') {
            TeamBrowserState.deselectTeam(teamId);
        }

        // Optimistic update
        _favorites.delete(teamId);
        _dispatchChange();

        try {
            const result = await TeamService.callFunction('updateFavorites', {
                teamId,
                action: 'remove'
            });

            if (!result.success) {
                // Rollback on failure
                _favorites.add(teamId);
                _dispatchChange();

                if (typeof ToastService !== 'undefined') {
                    ToastService.showError(result.error || 'Failed to remove favorite');
                }
            }
            return result;
        } catch (error) {
            // Rollback on error
            _favorites.add(teamId);
            _dispatchChange();
            console.error('Failed to remove favorite:', error);

            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Network error - please try again');
            }
            return { success: false, error: error.message };
        }
    }

    // Toggle favorite status
    async function toggleFavorite(teamId) {
        if (_favorites.has(teamId)) {
            return removeFavorite(teamId);
        } else {
            return addFavorite(teamId);
        }
    }

    // Check if team is favorited
    function isFavorite(teamId) {
        return _favorites.has(teamId);
    }

    // Get all favorites as array
    function getFavorites() {
        return Array.from(_favorites);
    }

    // Get count of favorites
    function getFavoriteCount() {
        return _favorites.size;
    }

    // Clear all favorites (local only - for logout)
    function clear() {
        _favorites.clear();
        _userId = null;
        _initialized = false;
    }

    // Public API
    return {
        init,
        updateFromFirestore,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        isFavorite,
        getFavorites,
        getFavoriteCount,
        clear
    };
})();
