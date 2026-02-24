// TemplatesModal.js - Modal for managing availability templates
// Phase A2: Simplified single-template model (was multi-template with names)
const TemplatesModal = (function() {
    'use strict';

    let _modal = null;
    let _onLoadTemplate = null;
    let _onClearAll = null;
    let _getSelectedCells = null;
    let _escHandler = null;

    function init(options = {}) {
        _onLoadTemplate = options.onLoadTemplate;
        _onClearAll = options.onClearAll;
        _getSelectedCells = options.getSelectedCells;

        window.addEventListener('template-updated', _render);
    }

    function show() {
        _createModal();
        _render();

        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.classList.remove('hidden');
        }
        _modal.classList.remove('hidden');
        document.body.classList.add('modal-open');

        _escHandler = (e) => {
            if (e.key === 'Escape') hide();
        };
        document.addEventListener('keydown', _escHandler);
    }

    function hide() {
        if (_modal) {
            _modal.classList.add('hidden');
        }

        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.classList.add('hidden');
        }
        document.body.classList.remove('modal-open');

        if (_escHandler) {
            document.removeEventListener('keydown', _escHandler);
            _escHandler = null;
        }
    }

    function _createModal() {
        if (_modal) return;

        _modal = document.createElement('div');
        _modal.id = 'templates-modal';
        _modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm';
        _modal.innerHTML = `
            <div class="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
                <div class="p-4 border-b border-border flex items-center justify-between">
                    <h2 class="text-lg font-semibold">Template</h2>
                    <button class="modal-close text-muted-foreground hover:text-foreground text-xl leading-none" aria-label="Close">&times;</button>
                </div>
                <div class="templates-modal-body p-4">
                    <!-- Content rendered by _render() -->
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.appendChild(_modal);
        } else {
            document.body.appendChild(_modal);
        }

        _modal.querySelector('.modal-close')?.addEventListener('click', hide);
        _modal.addEventListener('click', (e) => {
            if (e.target === _modal) hide();
        });
    }

    function _render() {
        const body = _modal?.querySelector('.templates-modal-body');
        if (!body) return;

        const template = typeof TemplateService !== 'undefined'
            ? TemplateService.getTemplate()
            : null;
        const hasSelection = _getSelectedCells ? _getSelectedCells().length > 0 : false;
        const hasCurrentWeekAvailability = _hasCurrentWeekAvailability();

        if (template) {
            const slotCount = template.slots ? template.slots.length : 0;
            const recurring = template.recurring || false;

            body.innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-sm text-muted-foreground">${slotCount} slot${slotCount !== 1 ? 's' : ''} saved</span>
                        <button id="templates-update-btn"
                                class="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                ${!hasSelection ? 'disabled' : ''}>
                            Update
                        </button>
                    </div>

                    <div class="border-t border-border pt-3">
                        <p class="text-xs text-muted-foreground mb-2">Load to:</p>
                        <div class="flex gap-2">
                            <button id="templates-load-w1-btn"
                                    class="flex-1 px-3 py-1.5 text-sm rounded bg-secondary hover:bg-secondary/80">
                                Week 1
                            </button>
                            <button id="templates-load-w2-btn"
                                    class="flex-1 px-3 py-1.5 text-sm rounded bg-secondary hover:bg-secondary/80">
                                Week 2
                            </button>
                        </div>
                    </div>

                    <div class="border-t border-border pt-3 flex items-center justify-between">
                        <span class="text-sm">Auto-fill weekly</span>
                        <button id="templates-recurring-btn"
                                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${recurring ? 'bg-primary' : 'bg-muted'}"
                                role="switch"
                                aria-checked="${recurring}"
                                title="Toggle auto-fill weekly">
                            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${recurring ? 'translate-x-6' : 'translate-x-1'}"></span>
                        </button>
                    </div>

                    <div class="border-t border-border pt-3">
                        <button id="templates-repeat-btn"
                                class="w-full px-3 py-2 text-sm rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                                ${!hasCurrentWeekAvailability ? 'disabled title="No availability this week to copy"' : ''}>
                            Repeat Last Week → W2
                        </button>
                    </div>

                    <div class="border-t border-border pt-3 flex gap-2">
                        <button id="templates-clear-btn"
                                class="flex-1 px-3 py-2 text-sm rounded bg-destructive/10 text-destructive hover:bg-destructive/20">
                            Clear Template
                        </button>
                        <button id="templates-clear-all-btn"
                                class="flex-1 px-3 py-2 text-sm rounded bg-muted text-muted-foreground hover:bg-muted/80">
                            Clear Availability
                        </button>
                    </div>
                </div>
            `;
        } else {
            body.innerHTML = `
                <div class="space-y-3">
                    <p class="text-sm text-muted-foreground">No template saved</p>
                    <button id="templates-save-btn"
                            class="w-full px-3 py-2 text-sm rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                            ${!hasSelection ? 'disabled' : ''}>
                        Save Current Selection
                    </button>
                    <div class="border-t border-border pt-3">
                        <button id="templates-repeat-btn"
                                class="w-full px-3 py-2 text-sm rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                                ${!hasCurrentWeekAvailability ? 'disabled title="No availability this week to copy"' : ''}>
                            Repeat Last Week → W2
                        </button>
                    </div>
                    <div class="border-t border-border pt-3">
                        <button id="templates-clear-all-btn"
                                class="w-full px-3 py-2 text-sm rounded bg-muted text-muted-foreground hover:bg-muted/80">
                            Clear Availability
                        </button>
                    </div>
                </div>
            `;
        }

        _attachEventListeners();
    }

    function _attachEventListeners() {
        const body = _modal?.querySelector('.templates-modal-body');
        if (!body) return;

        body.querySelector('#templates-save-btn')?.addEventListener('click', _handleSaveTemplate);
        body.querySelector('#templates-update-btn')?.addEventListener('click', _handleSaveTemplate);
        body.querySelector('#templates-load-w1-btn')?.addEventListener('click', () => _handleLoadTemplate(0));
        body.querySelector('#templates-load-w2-btn')?.addEventListener('click', () => _handleLoadTemplate(1));
        body.querySelector('#templates-recurring-btn')?.addEventListener('click', _handleToggleRecurring);
        body.querySelector('#templates-clear-btn')?.addEventListener('click', _handleClearTemplate);
        body.querySelector('#templates-clear-all-btn')?.addEventListener('click', _handleClearAll);
        body.querySelector('#templates-repeat-btn')?.addEventListener('click', _handleRepeatLastWeek);
    }

    async function _handleSaveTemplate() {
        const selectedCells = _getSelectedCells ? _getSelectedCells() : [];
        if (selectedCells.length === 0) return;

        const slots = [...new Set(selectedCells.map(cell => cell.slotId || cell))];

        try {
            const result = await TemplateService.saveTemplate(slots);
            if (result.success) {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Template saved');
                }
            } else {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError(result.error || 'Failed to save template');
                }
            }
        } catch (error) {
            console.error('Failed to save template:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Failed to save template');
            }
        }
    }

    function _handleLoadTemplate(weekIndex) {
        const template = typeof TemplateService !== 'undefined'
            ? TemplateService.getTemplate()
            : null;

        if (template && _onLoadTemplate) {
            _onLoadTemplate(template.slots, weekIndex);
            hide();
        }
    }

    async function _handleToggleRecurring() {
        if (typeof TemplateService === 'undefined') return;

        const current = TemplateService.isRecurring();

        // Visually disable the toggle during the async call
        const btn = document.getElementById('templates-recurring-btn');
        if (btn) {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }

        const result = await TemplateService.setRecurring(!current);

        if (btn) {
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
        }

        if (result.success && !current) {
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Recurring ON — applied to current + next week');
            }
        } else if (result.success) {
            if (typeof ToastService !== 'undefined') {
                ToastService.showSuccess('Recurring OFF');
            }
        } else {
            if (typeof ToastService !== 'undefined') {
                ToastService.showError(result.error || 'Failed to update recurring');
            }
        }
        // On success, TemplateService listener fires template-updated → _render() re-renders toggle
    }

    async function _handleClearTemplate() {
        if (!confirm('Clear your saved template?')) return;

        try {
            const result = await TemplateService.clearTemplate();
            if (result.success) {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess('Template cleared');
                }
            } else {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError(result.error || 'Failed to clear template');
                }
            }
        } catch (error) {
            console.error('Failed to clear template:', error);
            if (typeof ToastService !== 'undefined') {
                ToastService.showError('Failed to clear template');
            }
        }
    }

    function _handleClearAll() {
        if (!confirm('Clear all your availability for both weeks?')) return;

        if (_onClearAll) {
            _onClearAll();
            hide();
        }
    }

    function _getWeekIds() {
        const weekNum = WeekNavigation.getCurrentWeekNumber();
        const nextWeekNum = WeekNavigation.getSecondWeekNumber();
        const year1 = DateUtils.getISOWeekYear(DateUtils.getMondayOfWeek(weekNum));
        const year2 = DateUtils.getISOWeekYear(DateUtils.getMondayOfWeek(nextWeekNum));
        return {
            sourceWeekId: `${year1}-${String(weekNum).padStart(2, '0')}`,
            targetWeekId: `${year2}-${String(nextWeekNum).padStart(2, '0')}`
        };
    }

    function _hasCurrentWeekAvailability() {
        const teamId = (typeof MatchSchedulerApp !== 'undefined')
            ? MatchSchedulerApp.getSelectedTeam()?.id
            : null;
        if (!teamId) return false;

        const userId = window.firebase?.auth?.currentUser?.uid;
        if (!userId) return false;

        const { sourceWeekId } = _getWeekIds();
        const data = (typeof AvailabilityService !== 'undefined')
            ? AvailabilityService.getCachedData(teamId, sourceWeekId)
            : null;
        if (!data?.slots) return false;

        return Object.values(data.slots).some(users =>
            Array.isArray(users) && users.includes(userId)
        );
    }

    async function _handleRepeatLastWeek() {
        const teamId = (typeof MatchSchedulerApp !== 'undefined')
            ? MatchSchedulerApp.getSelectedTeam()?.id
            : null;
        if (!teamId) {
            if (typeof ToastService !== 'undefined') ToastService.showError('No team selected');
            return;
        }

        const btn = document.getElementById('templates-repeat-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Copying...';
        }

        try {
            const { sourceWeekId, targetWeekId } = _getWeekIds();
            const result = await AvailabilityService.repeatLastWeek(teamId, sourceWeekId, targetWeekId);

            if (result.success) {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showSuccess(`Copied ${result.slotsCopied} slot${result.slotsCopied !== 1 ? 's' : ''} to Week 2`);
                }
                hide();
            } else {
                if (typeof ToastService !== 'undefined') {
                    ToastService.showError(result.error || 'Failed to copy');
                }
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Repeat Last Week → W2';
                }
            }
        } catch (error) {
            console.error('Failed to repeat last week:', error);
            if (typeof ToastService !== 'undefined') ToastService.showError('Failed to copy');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Repeat Last Week → W2';
            }
        }
    }

    function cleanup() {
        window.removeEventListener('template-updated', _render);
        if (_escHandler) {
            document.removeEventListener('keydown', _escHandler);
            _escHandler = null;
        }
        if (_modal) {
            _modal.remove();
            _modal = null;
        }
    }

    return { init, show, hide, cleanup };
})();
