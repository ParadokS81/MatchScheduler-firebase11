// RescheduleMatchModal.js - Reschedule a scheduled match to a new time
// Slice 20.0: Good-faith time change — no opponent confirmation needed
// Following CancelMatchModal pattern: Revealing Module, modal-container, ESC/backdrop close
// Date+time picker reused from QuickAddMatchModal

const RescheduleMatchModal = (function() {
    'use strict';

    let _matchId = null;
    let _onConfirm = null;
    let _keydownHandler = null;

    /**
     * Show the reschedule modal.
     * @param {Object} match - The scheduled match data
     * @param {Function} onConfirm - Callback(matchId, dateTimeISO) when user confirms
     */
    function show(match, onConfirm) {
        if (!match || !match.id) return;

        _matchId = match.id;
        _onConfirm = onConfirm;

        // Current time display (user's timezone)
        let currentTimeLabel = '';
        if (typeof TimezoneService !== 'undefined' && TimezoneService.formatSlotForDisplay) {
            const display = TimezoneService.formatSlotForDisplay(match.slotId);
            currentTimeLabel = `${display.dayLabel} ${display.timeLabel}`;
        }

        // Pre-fill date from match.scheduledDate
        const prefillDate = match.scheduledDate || '';

        // Pre-fill time: convert UTC slotId to user's local time
        const prefillTime = _slotIdToLocalTime(match.slotId, match.scheduledDate);

        const tzLabel = TimezoneService.getTimezoneAbbreviation();

        // Build time options (30-min intervals, 12:00–23:30)
        const timeOptions = [];
        for (let h = 12; h < 24; h++) {
            timeOptions.push(`${String(h).padStart(2, '0')}:00`);
            timeOptions.push(`${String(h).padStart(2, '0')}:30`);
        }
        const timeOptionsHtml = timeOptions.map(t =>
            `<option value="${t}"${t === prefillTime ? ' selected' : ''}>${t}</option>`
        ).join('');

        const modalHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                 id="reschedule-modal-backdrop">
                <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-4 border-b border-border">
                        <h2 class="text-sm font-semibold text-foreground">Reschedule Match</h2>
                        <button id="reschedule-close-btn"
                                class="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="p-4 space-y-3">
                        <p class="text-sm text-foreground">
                            <strong>${_escapeHtml(match.teamAName)}</strong>
                            <span class="text-muted-foreground">vs</span>
                            <strong>${_escapeHtml(match.teamBName)}</strong>
                        </p>
                        <p class="text-xs text-muted-foreground">
                            Currently: <span class="text-foreground">${_escapeHtml(currentTimeLabel)}</span>
                        </p>

                        <div>
                            <label class="block text-xs text-muted-foreground mb-1">New date</label>
                            <input type="date" id="reschedule-date"
                                   class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground"
                                   min="${_todayISO()}"
                                   value="${prefillDate}">
                        </div>

                        <div>
                            <label class="block text-xs text-muted-foreground mb-1">New time (${_escapeHtml(tzLabel)})</label>
                            <select id="reschedule-time" class="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground">
                                ${timeOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="flex gap-3 justify-end p-4 border-t border-border">
                        <button id="reschedule-dismiss-btn"
                            class="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-foreground text-sm">
                            Cancel
                        </button>
                        <button id="reschedule-confirm-btn"
                            class="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm">
                            Reschedule
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = modalHTML;
        modalContainer.classList.remove('hidden');

        _attachListeners();
    }

    function _attachListeners() {
        const backdrop = document.getElementById('reschedule-modal-backdrop');
        const closeBtn = document.getElementById('reschedule-close-btn');
        const dismissBtn = document.getElementById('reschedule-dismiss-btn');
        const confirmBtn = document.getElementById('reschedule-confirm-btn');

        backdrop?.addEventListener('click', (e) => {
            if (e.target === backdrop) close();
        });
        closeBtn?.addEventListener('click', close);
        dismissBtn?.addEventListener('click', close);
        confirmBtn?.addEventListener('click', _handleConfirm);

        _keydownHandler = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', _keydownHandler);
    }

    async function _handleConfirm() {
        const confirmBtn = document.getElementById('reschedule-confirm-btn');
        if (!confirmBtn) return;

        const date = document.getElementById('reschedule-date')?.value;
        const time = document.getElementById('reschedule-time')?.value;

        if (!date) {
            ToastService.showError('Please select a date');
            return;
        }

        // Convert local date+time to UTC ISO string
        const dateTimeISO = _localToUTC(date, time);

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="flex items-center gap-2"><span class="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>Rescheduling...</span>';

        if (_onConfirm) {
            await _onConfirm(_matchId, dateTimeISO);
        }
        close();
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    /**
     * Convert UTC slotId + scheduledDate to local time string "HH:MM".
     * E.g., slotId "wed_1900" + scheduledDate "2026-02-25" → "20:00" in CET.
     */
    function _slotIdToLocalTime(slotId, scheduledDate) {
        if (!slotId || !scheduledDate) return '21:00';

        const timePart = slotId.split('_')[1];
        if (!timePart || timePart.length < 4) return '21:00';

        const utcHours = parseInt(timePart.slice(0, 2));
        const utcMinutes = parseInt(timePart.slice(2));

        // Build a UTC Date, then format in user's timezone
        const utcDate = new Date(`${scheduledDate}T${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}:00Z`);
        const tz = TimezoneService.getUserTimezone();
        const localTime = utcDate.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

        // Round to nearest 30-min slot
        const [h, m] = localTime.split(':').map(Number);
        const roundedMin = m < 15 ? '00' : m < 45 ? '30' : '00';
        let roundedHour = m >= 45 ? h + 1 : h;
        if (roundedHour >= 24) roundedHour = 0;
        return `${String(roundedHour).padStart(2, '0')}:${roundedMin}`;
    }

    /**
     * Convert local date + time string to UTC ISO 8601.
     * Same logic as QuickAddMatchModal._localToUTC.
     */
    function _localToUTC(dateStr, timeStr) {
        const localStr = `${dateStr}T${timeStr}:00`;
        const offsetMinutes = TimezoneService.getOffsetMinutes(new Date(localStr));
        const asUtc = new Date(localStr + 'Z');
        asUtc.setUTCMinutes(asUtc.getUTCMinutes() - offsetMinutes);
        return asUtc.toISOString();
    }

    /**
     * Get today's date as ISO string (YYYY-MM-DD) in user's local timezone.
     */
    function _todayISO() {
        const tz = TimezoneService.getUserTimezone();
        const now = new Date();
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    }

    function _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function close() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = '';
        modalContainer.classList.add('hidden');
        _matchId = null;
        _onConfirm = null;

        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }
    }

    return { show, close };
})();
