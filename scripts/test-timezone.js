/**
 * TimezoneService Test Script
 * Paste this into the browser console to validate timezone conversions.
 *
 * Tests: offset calculation, local→UTC conversion, UTC→local conversion,
 *        day wrapping, grid map consistency, and round-trip integrity.
 */
(function testTimezoneService() {
    const TS = TimezoneService;
    let passed = 0;
    let failed = 0;

    function assert(condition, label) {
        if (condition) {
            passed++;
            console.log(`  ✅ ${label}`);
        } else {
            failed++;
            console.error(`  ❌ ${label}`);
        }
    }

    function assertEq(actual, expected, label) {
        if (actual === expected) {
            passed++;
            console.log(`  ✅ ${label}: ${actual}`);
        } else {
            failed++;
            console.error(`  ❌ ${label}: expected "${expected}", got "${actual}"`);
        }
    }

    // Use a fixed winter date for predictable offsets (no DST ambiguity)
    const winterDate = new Date(Date.UTC(2026, 0, 15, 12, 0, 0)); // Jan 15 2026 12:00 UTC

    // ──────────────────────────────────────
    console.log('\n🔧 TEST 1: Offset Calculation');
    // ──────────────────────────────────────
    const originalTz = TS.getUserTimezone();

    TS.setUserTimezone('Europe/Stockholm');
    const cetOffset = TS.getOffsetMinutes(winterDate);
    assertEq(cetOffset, 60, 'CET winter offset = +60 min');

    TS.setUserTimezone('America/New_York');
    const estOffset = TS.getOffsetMinutes(winterDate);
    assertEq(estOffset, -300, 'EST winter offset = -300 min');

    TS.setUserTimezone('Europe/London');
    const gmtOffset = TS.getOffsetMinutes(winterDate);
    assertEq(gmtOffset, 0, 'GMT winter offset = 0 min');

    TS.setUserTimezone('Europe/Helsinki');
    const eetOffset = TS.getOffsetMinutes(winterDate);
    assertEq(eetOffset, 120, 'EET winter offset = +120 min');

    TS.setUserTimezone('Europe/Moscow');
    const mskOffset = TS.getOffsetMinutes(winterDate);
    assertEq(mskOffset, 180, 'MSK offset = +180 min');

    // Summer date for DST test
    const summerDate = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // Jul 15 2026 12:00 UTC

    TS.setUserTimezone('Europe/Stockholm');
    const cestOffset = TS.getOffsetMinutes(summerDate);
    assertEq(cestOffset, 120, 'CEST summer offset = +120 min');

    TS.setUserTimezone('America/New_York');
    const edtOffset = TS.getOffsetMinutes(summerDate);
    assertEq(edtOffset, -240, 'EDT summer offset = -240 min');

    // ──────────────────────────────────────
    console.log('\n🔧 TEST 2: CET Local→UTC Conversion (winter)');
    // ──────────────────────────────────────
    TS.setUserTimezone('Europe/Stockholm');

    let result = TS.localToUtcSlot('mon', '2100', winterDate);
    assertEq(result.slotId, 'mon_2000', 'CET Mon 21:00 → UTC mon_2000');

    result = TS.localToUtcSlot('mon', '1800', winterDate);
    assertEq(result.slotId, 'mon_1700', 'CET Mon 18:00 → UTC mon_1700');

    result = TS.localToUtcSlot('mon', '2300', winterDate);
    assertEq(result.slotId, 'mon_2200', 'CET Mon 23:00 → UTC mon_2200');

    // ──────────────────────────────────────
    console.log('\n🔧 TEST 3: EST Local→UTC Conversion (day wrap)');
    // ──────────────────────────────────────
    TS.setUserTimezone('America/New_York');

    result = TS.localToUtcSlot('mon', '1800', winterDate);
    assertEq(result.slotId, 'mon_2300', 'EST Mon 18:00 → UTC mon_2300');

    result = TS.localToUtcSlot('mon', '1900', winterDate);
    assertEq(result.slotId, 'tue_0000', 'EST Mon 19:00 → UTC tue_0000 (day wrap)');

    result = TS.localToUtcSlot('mon', '2100', winterDate);
    assertEq(result.slotId, 'tue_0200', 'EST Mon 21:00 → UTC tue_0200 (day wrap)');

    result = TS.localToUtcSlot('sun', '2100', winterDate);
    assertEq(result.slotId, 'mon_0200', 'EST Sun 21:00 → UTC mon_0200 (week wrap)');

    // ──────────────────────────────────────
    console.log('\n🔧 TEST 4: UTC→Local Conversion');
    // ──────────────────────────────────────
    TS.setUserTimezone('Europe/Stockholm');

    result = TS.utcToLocalSlot('mon', '2000', winterDate);
    assertEq(result.day, 'mon', 'UTC mon_2000 → CET day=mon');
    assertEq(result.time, '2100', 'UTC mon_2000 → CET time=2100');

    TS.setUserTimezone('America/New_York');

    result = TS.utcToLocalSlot('tue', '0200', winterDate);
    assertEq(result.day, 'mon', 'UTC tue_0200 → EST day=mon');
    assertEq(result.time, '2100', 'UTC tue_0200 → EST time=2100');

    // ──────────────────────────────────────
    console.log('\n🔧 TEST 5: Grid Map Round-trip Consistency');
    // ──────────────────────────────────────
    const testTimezones = ['Europe/Stockholm', 'America/New_York', 'Europe/London', 'Europe/Helsinki'];

    testTimezones.forEach(tz => {
        TS.setUserTimezone(tz);
        const gridToUtc = TS.buildGridToUtcMap(winterDate);
        const utcToGrid = TS.buildUtcToGridMap(winterDate);

        let roundTripOk = true;
        for (const [localId, utcId] of gridToUtc.entries()) {
            const backToLocal = utcToGrid.get(utcId);
            if (backToLocal !== localId) {
                console.error(`    Round-trip fail for ${tz}: ${localId} → ${utcId} → ${backToLocal}`);
                roundTripOk = false;
            }
        }
        assert(roundTripOk, `${tz}: all ${gridToUtc.size} slots round-trip correctly`);
        assertEq(gridToUtc.size, 77, `${tz}: grid has 77 slots (7 days × 11 times)`);
    });

    // ──────────────────────────────────────
    console.log('\n🔧 TEST 6: Month/Year Boundary Offset');
    // ──────────────────────────────────────
    TS.setUserTimezone('America/New_York');

    // New Year boundary: 2026-01-01 00:30 UTC = 2025-12-31 19:30 EST
    const newYearBoundary = new Date(Date.UTC(2026, 0, 1, 0, 30, 0));
    const nyOffset = TS.getOffsetMinutes(newYearBoundary);
    assertEq(nyOffset, -300, 'EST offset correct at year boundary (Jan 1 00:30 UTC)');

    // Month boundary: 2026-03-01 00:30 UTC = 2026-02-28 19:30 EST
    const monthBoundary = new Date(Date.UTC(2026, 2, 1, 0, 30, 0));
    const mbOffset = TS.getOffsetMinutes(monthBoundary);
    assertEq(mbOffset, -300, 'EST offset correct at month boundary (Mar 1 00:30 UTC)');

    // ──────────────────────────────────────
    console.log('\n🔧 TEST 7: formatSlotForDisplay');
    // ──────────────────────────────────────
    TS.setUserTimezone('Europe/Stockholm');
    const display = TS.formatSlotForDisplay('mon_2000', winterDate);
    assertEq(display.dayLabel, 'Monday', 'CET: mon_2000 dayLabel = Monday');
    assertEq(display.timeLabel, '21:00', 'CET: mon_2000 timeLabel = 21:00');

    TS.setUserTimezone('America/New_York');
    const estDisplay = TS.formatSlotForDisplay('tue_0200', winterDate);
    assertEq(estDisplay.dayLabel, 'Monday', 'EST: tue_0200 dayLabel = Monday');
    assertEq(estDisplay.timeLabel, '21:00', 'EST: tue_0200 timeLabel = 21:00');

    // ──────────────────────────────────────
    // Restore original timezone
    TS.setUserTimezone(originalTz);

    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
        console.log('🎉 All tests passed!');
    } else {
        console.warn(`⚠️ ${failed} test(s) failed - review output above`);
    }
    console.log(`${'='.repeat(40)}\n`);

    return { passed, failed };
})();
