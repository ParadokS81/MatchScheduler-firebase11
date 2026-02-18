// MobileProfileTab.js - Profile summary view opened from bottom nav Profile tab
// Opens in MobileBottomSheet layer 1. Edit profile uses the existing ProfileModal.

const MobileProfileTab = (function() {
    'use strict';

    async function open() {
        const user = AuthService.getCurrentUser();

        if (!user) {
            MobileBottomSheet.open(`
                <div style="padding: 2rem 0; text-align: center;">
                    <p style="color: var(--muted-foreground); margin-bottom: 1rem;">Sign in to view your profile</p>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 0 2rem;">
                        <button onclick="AuthService.signInWithDiscord()" style="padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 600; font-size: 0.85rem; background: #5865F2; color: white; border: none; cursor: pointer;">
                            Discord
                        </button>
                        <button onclick="AuthService.signInWithGoogle()" style="padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 600; font-size: 0.85rem; background: transparent; color: var(--foreground); border: 1px solid var(--border); cursor: pointer;">
                            Google
                        </button>
                    </div>
                </div>
            `, _onClose);
            return;
        }

        // Fetch profile from Firestore for full data (initials, discord, timezone)
        let profile = null;
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', user.uid));
            if (userDoc.exists()) profile = userDoc.data();
        } catch (e) {
            console.error('MobileProfileTab: Failed to load profile:', e);
        }

        const displayName = profile?.displayName || user.displayName || 'Unknown';
        const initials = profile?.initials || displayName.substring(0, 3).toUpperCase();
        const timezone = typeof TimezoneService !== 'undefined'
            ? TimezoneService.getUserTimezone() || 'Not set'
            : 'Not set';

        // Avatar
        const photoURL = profile?.photoURL || user.photoURL;
        const avatarHtml = photoURL
            ? `<img src="${photoURL}" alt="${displayName}" style="width: 3rem; height: 3rem; border-radius: 50%; object-fit: cover;">`
            : `<div style="width: 3rem; height: 3rem; border-radius: 50%; background: var(--muted); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; color: var(--muted-foreground);">${initials}</div>`;

        // Discord link status
        const discordUser = profile?.discordUsername;
        const discordHtml = discordUser
            ? `<span style="color: var(--muted-foreground); font-size: 0.8rem;">&#x1F3AE; ${discordUser} <span style="color: #4ade80;">&#10003;</span></span>`
            : `<span style="color: var(--muted-foreground); font-size: 0.8rem;">Discord not linked</span>`;

        const html = `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <!-- Identity -->
                <div style="display: flex; align-items: center; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);">
                    ${avatarHtml}
                    <div>
                        <div style="font-size: 1rem; font-weight: 600; color: var(--foreground);">${displayName}</div>
                        <div style="font-size: 0.75rem; font-family: monospace; color: var(--muted-foreground);">${initials}</div>
                    </div>
                </div>

                <!-- Info rows -->
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.8rem; color: var(--muted-foreground);">Timezone</span>
                        <span style="font-size: 0.8rem; color: var(--foreground);">${timezone}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.8rem; color: var(--muted-foreground);">Discord</span>
                        ${discordHtml}
                    </div>
                </div>

                <!-- Actions -->
                <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
                    <button onclick="MobileProfileTab.editProfile()" style="padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 600; font-size: 0.85rem; background: var(--primary); color: var(--primary-foreground); border: none; cursor: pointer;">
                        Edit Profile
                    </button>
                    <button onclick="MobileProfileTab.signOut()" style="padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 600; font-size: 0.85rem; background: transparent; color: var(--muted-foreground); border: 1px solid var(--border); cursor: pointer;">
                        Sign Out
                    </button>
                </div>
            </div>
        `;

        MobileBottomSheet.open(html, _onClose);
    }

    async function editProfile() {
        const user = AuthService.getCurrentUser();
        if (!user || typeof ProfileModal === 'undefined') return;

        // Fetch profile for the modal
        let profile = null;
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
            const userDoc = await getDoc(doc(window.firebase.db, 'users', user.uid));
            if (userDoc.exists()) profile = userDoc.data();
        } catch (e) { /* proceed with null profile */ }

        MobileBottomSheet.close();
        ProfileModal.show(user, profile);
    }

    async function signOut() {
        MobileBottomSheet.close();
        try {
            await AuthService.signOut();
        } catch (err) {
            console.error('Sign out failed:', err);
        }
    }

    function _onClose() {
        // Switch back to home tab when sheet is dismissed by user
        const nav = document.getElementById('mobile-nav');
        if (nav) {
            nav.querySelectorAll('.mobile-nav-tab').forEach(t => t.classList.remove('active'));
            const homeTab = nav.querySelector('[data-tab="home"]');
            if (homeTab) homeTab.classList.add('active');
        }
        MobileApp.switchTab('home');
    }

    return { open, editProfile, signOut };
})();
