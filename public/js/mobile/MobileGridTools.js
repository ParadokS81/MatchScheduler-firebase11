// MobileGridTools.js - Grid tools sheet opened from header cogwheel
// Display mode, templates, timeslots (layer 2), timezone (layer 2)

const MobileGridTools = (function() {
    'use strict';

    function open() {
        const html = _render();
        MobileBottomSheet.open(html);
        _attachEvents();
    }

    function _render() {
        const currentMode = typeof PlayerDisplayService !== 'undefined'
            ? PlayerDisplayService.getDisplayMode()
            : 'initials';

        const timezone = typeof TimezoneService !== 'undefined'
            ? TimezoneService.getUserTimezone() || 'Not set'
            : 'Not set';

        const tzAbbr = typeof TimezoneService !== 'undefined'
            ? TimezoneService.getTimezoneAbbreviation()
            : '';

        // Display mode buttons
        const modes = [
            { id: 'initials', label: 'ABC' },
            { id: 'coloredInitials', label: 'ABC', colored: true },
            { id: 'coloredDots', label: '\u25CF\u25CF\u25CF', colored: true },
            { id: 'avatars', label: '\uD83D\uDC64' }
        ];

        let modeHtml = '';
        modes.forEach(m => {
            const active = m.id === currentMode;
            const bg = active ? 'background: var(--primary); color: var(--primary-foreground);' : 'background: var(--muted); color: var(--foreground);';
            const colorStyle = m.colored && !active ? 'background: linear-gradient(135deg, #E06666, #FFD966, #93C47D, #6D9EEB); -webkit-background-clip: text; -webkit-text-fill-color: transparent;' : '';
            modeHtml += `<button class="mgt-mode-btn" data-mode="${m.id}" style="padding: 0.4rem 0.75rem; border-radius: 0.375rem; border: none; cursor: pointer; font-size: 0.75rem; font-weight: 600; ${bg}"><span ${colorStyle ? `style="${colorStyle}"` : ''}>${m.label}</span></button>`;
        });

        // Template (single)
        let templatesHtml = '';
        if (typeof TemplateService !== 'undefined') {
            const tpl = TemplateService.getTemplate();
            if (tpl) {
                const slotCount = tpl.slots ? tpl.slots.length : 0;
                templatesHtml = `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0;">
                        <span style="font-size: 0.8rem; color: var(--foreground);">${slotCount} slot${slotCount !== 1 ? 's' : ''} saved</span>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="mgt-load-tpl" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 0.25rem; background: var(--primary); color: var(--primary-foreground); border: none; cursor: pointer;">Load</button>
                            <button class="mgt-del-tpl" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 0.25rem; background: var(--muted); color: var(--destructive); border: none; cursor: pointer;">Del</button>
                        </div>
                    </div>
                `;
            } else {
                templatesHtml = '<div style="font-size: 0.75rem; color: var(--muted-foreground); padding: 0.25rem 0;">No saved template</div>';
            }
        }

        // Visible timeslot count
        let slotCount = '';
        if (typeof TimezoneService !== 'undefined') {
            const visible = TimezoneService.getVisibleTimeSlots();
            slotCount = `${visible.length} visible`;
        }

        return `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <!-- Display Mode -->
                <div>
                    <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 0.4rem;">Display Mode</div>
                    <div style="display: flex; gap: 0.375rem;">
                        ${modeHtml}
                    </div>
                </div>

                <!-- Templates -->
                <div>
                    <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 0.25rem;">Templates</div>
                    ${templatesHtml}
                </div>

                <!-- Timeslots -->
                <div>
                    <button class="mgt-action-row" id="mgt-timeslots-btn" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.5rem 0; background: none; border: none; border-top: 1px solid var(--border); cursor: pointer; color: var(--foreground);">
                        <span style="font-size: 0.85rem;">Edit Timeslots</span>
                        <span style="font-size: 0.75rem; color: var(--muted-foreground);">${slotCount} &#9654;</span>
                    </button>
                </div>

                <!-- Timezone -->
                <div>
                    <button class="mgt-action-row" id="mgt-timezone-btn" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.5rem 0; background: none; border: none; border-top: 1px solid var(--border); cursor: pointer; color: var(--foreground);">
                        <span style="font-size: 0.85rem;">Timezone</span>
                        <span style="font-size: 0.75rem; color: var(--muted-foreground);">${tzAbbr} &#9654;</span>
                    </button>
                </div>
            </div>
        `;
    }

    function _attachEvents() {
        const content = MobileBottomSheet.getContentElement();
        if (!content) return;

        // Display mode buttons
        content.querySelectorAll('.mgt-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (typeof PlayerDisplayService !== 'undefined') {
                    PlayerDisplayService.setDisplayMode(mode);
                }
                // Re-render to update active state
                MobileBottomSheet.updateContent(_render());
                _attachEvents();
            });
        });

        // Load template
        content.querySelectorAll('.mgt-load-tpl').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tpl = typeof TemplateService !== 'undefined' ? TemplateService.getTemplate() : null;
                if (!tpl) return;

                const teamId = MobileApp.getSelectedTeamId();
                if (!teamId) return;

                const weekNum = WeekNavigation.getCurrentWeekNumber();
                const year = DateUtils.getISOWeekYear(DateUtils.getMondayOfWeek(weekNum));
                const weekId = `${year}-${String(weekNum).padStart(2, '0')}`;

                btn.textContent = '...';
                btn.disabled = true;

                try {
                    const result = await AvailabilityService.addMeToSlots(teamId, weekId, tpl.slots);
                    if (result.success) {
                        ToastService.showSuccess('Template loaded');
                        MobileBottomSheet.close();
                    } else {
                        ToastService.showError(result.error || 'Failed to load template');
                    }
                } catch (e) {
                    ToastService.showError('Failed to load template');
                } finally {
                    btn.textContent = 'Load';
                    btn.disabled = false;
                }
            });
        });

        // Clear template
        content.querySelectorAll('.mgt-del-tpl').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.textContent = '...';
                try {
                    const result = await TemplateService.clearTemplate();
                    if (result.success) {
                        ToastService.showSuccess('Template cleared');
                        MobileBottomSheet.updateContent(_render());
                        _attachEvents();
                    } else {
                        ToastService.showError(result.error || 'Failed to clear');
                        btn.textContent = 'Del';
                    }
                } catch (e) {
                    ToastService.showError('Failed to clear');
                    btn.textContent = 'Del';
                }
            });
        });

        // Timeslots → push layer 2
        const tsBtn = content.querySelector('#mgt-timeslots-btn');
        if (tsBtn) {
            tsBtn.addEventListener('click', _openTimeslotEditor);
        }

        // Timezone → push layer 2
        const tzBtn = content.querySelector('#mgt-timezone-btn');
        if (tzBtn) {
            tzBtn.addEventListener('click', _openTimezonePicker);
        }
    }

    // ─── Layer 2: Timeslot Editor ───────────────────────────────────

    function _openTimeslotEditor() {
        if (typeof TimezoneService === 'undefined') return;

        const baseSlots = TimezoneService.getDisplayTimeSlots();
        const hiddenSlots = TimezoneService.getHiddenTimeSlots();
        const extraSlots = TimezoneService.getExtraTimeSlots();
        const visible = TimezoneService.getVisibleTimeSlots();

        // EU 4on4 game frequency data (approximate from 15k games)
        const gameFreq = {
            '1800': 0.1, '1830': 0.2, '1900': 0.6, '1930': 2.1,
            '2000': 5.5, '2030': 12.1, '2100': 16.7, '2130': 20.1,
            '2200': 17.7, '2230': 14.2, '2300': 10.6
        };

        let slotsHtml = '';
        baseSlots.forEach(slot => {
            const isHidden = hiddenSlots.includes(slot);
            const checked = !isHidden ? 'checked' : '';
            const localTime = TimezoneService.baseToLocalDisplay(slot);
            const freq = gameFreq[slot] || 0;
            const barWidth = Math.max(2, (freq / 20.1) * 100);

            slotsHtml += `
                <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; cursor: pointer;">
                    <input type="checkbox" class="mgt-ts-check" data-slot="${slot}" ${checked}
                           style="accent-color: var(--primary); width: 1rem; height: 1rem;">
                    <span style="font-size: 0.85rem; font-weight: 500; min-width: 3rem;">${localTime}</span>
                    <div style="flex: 1; height: 0.35rem; background: var(--muted); border-radius: 2px; overflow: hidden;">
                        <div style="width: ${barWidth}%; height: 100%; background: var(--primary); opacity: 0.5; border-radius: 2px;"></div>
                    </div>
                    <span style="font-size: 0.7rem; color: var(--muted-foreground); min-width: 2.5rem; text-align: right;">${freq}%</span>
                </label>
            `;
        });

        // Extra timeslots display
        let extrasHtml = '';
        if (extraSlots.length > 0) {
            const ranges = _groupSlotsIntoRanges(extraSlots);
            ranges.forEach((r, i) => {
                const fromLocal = TimezoneService.baseToLocalDisplay(r.from);
                const toLocal = TimezoneService.baseToLocalDisplay(r.to);
                extrasHtml += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.25rem 0;">
                        <span style="font-size: 0.8rem; color: var(--foreground);">${fromLocal} \u2013 ${toLocal}</span>
                        <button class="mgt-extra-remove" data-index="${i}" style="font-size: 0.7rem; color: var(--destructive); background: none; border: none; cursor: pointer;">Remove</button>
                    </div>
                `;
            });
        }

        const html = `
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 1rem; font-weight: 600;">Edit Timeslots</span>
                    <span id="mgt-ts-count" style="font-size: 0.8rem; color: var(--muted-foreground);">${visible.length} visible</span>
                </div>
                <div style="font-size: 0.7rem; color: var(--muted-foreground);">Toggle timeslots to free up space. Minimum 4 must remain visible.</div>

                ${slotsHtml}

                <div style="font-size: 0.65rem; color: var(--muted-foreground); padding-top: 0.25rem;">
                    EU 4on4 game frequency (15k games). Peak hours: 21:00\u201322:30
                </div>

                ${extraSlots.length > 0 ? `
                    <div style="border-top: 1px solid var(--border); padding-top: 0.5rem;">
                        <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 0.25rem;">Extra Timeslots</div>
                        ${extrasHtml}
                    </div>
                ` : ''}

                <div style="display: flex; gap: 0.5rem; padding-top: 0.5rem;">
                    <button id="mgt-ts-cancel" style="flex: 1; padding: 0.5rem; border-radius: 0.375rem; font-weight: 600; font-size: 0.85rem; background: transparent; color: var(--muted-foreground); border: 1px solid var(--border); cursor: pointer;">Cancel</button>
                    <button id="mgt-ts-save" style="flex: 1; padding: 0.5rem; border-radius: 0.375rem; font-weight: 600; font-size: 0.85rem; background: var(--primary); color: var(--primary-foreground); border: none; cursor: pointer;">Save</button>
                </div>
            </div>
        `;

        MobileBottomSheet.push(html);
        _attachTimeslotEvents();
    }

    function _attachTimeslotEvents() {
        const content = MobileBottomSheet.getPushedContentElement();
        if (!content) return;

        // Update count on checkbox change
        content.querySelectorAll('.mgt-ts-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = content.querySelectorAll('.mgt-ts-check:checked');
                const countEl = content.querySelector('#mgt-ts-count');
                if (countEl) countEl.textContent = `${checked.length} visible`;

                // Disable unchecking if at minimum
                if (checked.length <= 4) {
                    checked.forEach(c => c.style.pointerEvents = 'none');
                } else {
                    content.querySelectorAll('.mgt-ts-check').forEach(c => c.style.pointerEvents = '');
                }
            });
        });

        // Remove extra range
        content.querySelectorAll('.mgt-extra-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const extraSlots = TimezoneService.getExtraTimeSlots();
                const ranges = _groupSlotsIntoRanges(extraSlots);
                const idx = parseInt(btn.dataset.index, 10);
                if (idx >= 0 && idx < ranges.length) {
                    // Remove slots in this range
                    const range = ranges[idx];
                    const rangeSlots = _expandRange(range.from, range.to);
                    const remaining = extraSlots.filter(s => !rangeSlots.includes(s));
                    TimezoneService.setExtraTimeSlots(remaining);
                    // Re-open to reflect changes
                    MobileBottomSheet.pop();
                    _openTimeslotEditor();
                }
            });
        });

        // Cancel
        content.querySelector('#mgt-ts-cancel')?.addEventListener('click', () => {
            MobileBottomSheet.pop();
        });

        // Save
        content.querySelector('#mgt-ts-save')?.addEventListener('click', async () => {
            const unchecked = [];
            content.querySelectorAll('.mgt-ts-check').forEach(cb => {
                if (!cb.checked) unchecked.push(cb.dataset.slot);
            });

            const success = TimezoneService.setHiddenTimeSlots(unchecked);
            if (!success) {
                ToastService.showError('Minimum 4 timeslots must remain visible');
                return;
            }

            // Persist to Firestore
            try {
                await AuthService.updateProfile({
                    hiddenTimeSlots: unchecked,
                    extraTimeSlots: TimezoneService.getExtraTimeSlots()
                });
            } catch (e) {
                console.error('Failed to persist timeslot preferences:', e);
            }

            window.dispatchEvent(new Event('timeslots-changed'));
            MobileBottomSheet.pop();
            // Refresh layer 1 to update slot count
            MobileBottomSheet.updateContent(_render());
            _attachEvents();
            ToastService.showSuccess('Timeslots updated');
        });
    }

    // ─── Layer 2: Timezone Picker ───────────────────────────────────

    function _openTimezonePicker() {
        if (typeof TimezoneService === 'undefined') return;

        const options = TimezoneService.getTimezoneOptions();
        const current = TimezoneService.getUserTimezone();

        let optionsHtml = '';
        options.forEach(group => {
            optionsHtml += `<div style="font-size: 0.65rem; font-weight: 600; text-transform: uppercase; color: var(--muted-foreground); padding: 0.5rem 0 0.25rem;">${group.region}</div>`;
            group.timezones.forEach(tz => {
                const active = tz.id === current;
                const bg = active ? 'background: var(--primary); color: var(--primary-foreground);' : '';
                optionsHtml += `
                    <button class="mgt-tz-option" data-tz="${tz.id}" style="display: block; width: 100%; text-align: left; padding: 0.4rem 0.5rem; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.85rem; ${bg} background-color: ${active ? '' : 'transparent'}; color: ${active ? '' : 'var(--foreground)'};">
                        ${tz.label}
                    </button>
                `;
            });
        });

        const html = `
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="font-size: 1rem; font-weight: 600; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">Timezone</div>
                ${optionsHtml}
            </div>
        `;

        MobileBottomSheet.push(html);

        const content = MobileBottomSheet.getPushedContentElement();
        if (!content) return;

        content.querySelectorAll('.mgt-tz-option').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tz = btn.dataset.tz;
                TimezoneService.setUserTimezone(tz);

                // Persist
                try {
                    await AuthService.updateProfile({ timezone: tz });
                } catch (e) {
                    console.error('Failed to persist timezone:', e);
                }

                window.dispatchEvent(new CustomEvent('timezone-changed', { detail: { timezone: tz } }));
                MobileBottomSheet.pop();
                // Refresh layer 1
                MobileBottomSheet.updateContent(_render());
                _attachEvents();
                ToastService.showSuccess('Timezone updated');
            });
        });
    }

    // ─── Helpers ────────────────────────────────────────────────────

    function _groupSlotsIntoRanges(slots) {
        if (!slots.length) return [];
        const sorted = [...slots].sort();
        const ranges = [];
        let from = sorted[0];
        let prev = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const expected = _nextHalfHour(prev);
            if (sorted[i] === expected) {
                prev = sorted[i];
            } else {
                ranges.push({ from, to: prev });
                from = sorted[i];
                prev = sorted[i];
            }
        }
        ranges.push({ from, to: prev });
        return ranges;
    }

    function _expandRange(from, to) {
        const slots = [from];
        let current = from;
        while (current !== to) {
            current = _nextHalfHour(current);
            slots.push(current);
            if (slots.length > 48) break; // safety
        }
        return slots;
    }

    function _nextHalfHour(slot) {
        let h = parseInt(slot.substring(0, 2), 10);
        let m = parseInt(slot.substring(2), 10);
        m += 30;
        if (m >= 60) { m = 0; h = (h + 1) % 24; }
        return String(h).padStart(2, '0') + String(m).padStart(2, '0');
    }

    return { open };
})();
