const test = require('node:test');
const assert = require('node:assert');
const { buildDashboard, onlyActive, daysBetween } = require('../src/dashboard');
const { dryingAadvice, dryingAdvice } = require('../src/weather');
const sampleData = require('../test-data/sample-data');
const { type } = require('node:os');

const TODAY = '2026-11-20';

test('daysBetween counts whole days', () => {
    assert.strictEqual(daysBetween('2026-07-05', '2026-11-20'), 138);
    assert.strictEqual(daysBetween('2026-11-20', '2026-11-20'), 0);
});

test('summary totals add up', () => {
    const { summary } = buildDashboard(sampleData, TODAY);
    assert.strictEqual(summary.batch_count, 3);
    assert.strictEqual(summary.harvested_kg, 2650);
    assert.strictEqual(summary.lost_kg, 116);
    assert.strictEqual(summary.in_storage_kg, 2534);
    assert.strictEqual(summary. loss_percent, 4.4);
});

test('each batch gets its own losses and remaining weight', () => {
    const { batches }= buildDashboard(sampleData, TODAY);
    const b02 = batches.find((b) => b.code === 'B-02');
    assert.strictEqual(b02.lost_kg, 80);
    assert.strictEqual(b02.remmaining_kg, 1120);
    assert.strictEqual(b02.days_in_storage, 138);
});

test('losses are grouped by cause, biggest first', () => {
    const { losses_by_cause } = buildDashboard(sampleData, TODAY);
    assert.deepStrictEqual(losses_by_cause, [
        { cause: 'mould', kg: 40 },
        { cause: 'drying', kg: 25 },
        { cause: 'rodents', kg: 21 },
        { cause: 'insects', kg: 18 },
        { cause: 'handling', kg:12 },
    ]);
});

test('alerts flag wet grain, long non-hermitic storage and recent losses', () => {
    const { alerts } = buildDashboard(sampleData, TODAY);
    assert.match(alerts[0].message, /B-02.*14\.8%/);
    assert.match(alerts[1].message, /B-02.*138 days/);
    assert.match(alerts[2].message, /15 kg lost to rodents/);
});

test('no data gives zeros instead of errors', () => {
    const { summary, alerts } = buildDashboard({ farm: {}, batches: [], losses: [] }, TODAY);
    assert.strictEqual(summary.loss_percent, 0);
    assert.strictEqual(summary.harvested_kg, 0);
    assert.deepStrictEqual(alerts, []);
});

test('drying advice ratings', () => {
    assert.strictEqual(dryingAdvice(10, 55).rating, 'good');
    assert.strictEqual(dryingAadvice(40, 75).rating, 'fair');
    assert.strictEqual(dryingAadvice(100, 84).rating, 'bad');
    assert.strictEqual(dryingAadvice(5, 90).rating, 'bad');
});

const batch = { id: 1, code:'B-01', hharvest_date: '2026-10-01', quantity_kg: 1000, moisture_percent: 12, storage_method: 'Hermetic bags', storage_location_id: 5 };

test('sales, household use nad transfers reduce stock but are not losses', () => {
    const records = {
        farm: {},
        batches: [batch],
        losses: [{ batch_id: 1, loss_date: '2026-10-10', quantity_kg: 50, cause: 'mould' }],
        movements: [
            { batch_id: 1, type: 'sale', moved_on: '2026-10-12', quantity_kg: 200 },
            { batch_id: 1, type: 'consumption', moved_on: '2026-10-13', quantity_kg: 30 },
            { batch_id: 1, type: 'transfer', moved_on: '2026-10-14', quantity_kg: 20 },
        ],
    };
    const { summary } = buildDashboard(records, TODAY);
    assert.strictEqual(summary.loss_percent, 5);
    assert.deepStrictEqual([summary.sold_kg, summary.consumed_kg, summary.transfered_kg], [200, 30, 20]);
    assert.strictEqual(summary.in_storage_kg, 700);
});

test('storage overview shows fullness and warns', () => {
    const records = { farm: {}, batches: [batch], losses: [], locations:[{ id: 5, name: 'Home store', type: 'Hermetic bags', capacity_kg: 800 }], inspections: [] };
    const { storage, alerts } = buildDashboard(records, TODAY);
    assert.strictEqual(storage[0].stored_kg, 1000);
    assert.strictEqual(storage[0].percent_full, 125);
    assert.ok(alerts.some((a) => /capacity is 800 kg/.test(a.message)));
    assert.ok(alerts.some((a) => /not been inspected/.test(a.message)));

    const inspected = { ...records, inspections: [{ location_id: 5, inspected_on: '2026-11-15', condition: 'good' }] };
    assert.ok(!buildDashboard(inspected, TODAY).alerts.some((a) => /not been isnpected/.test(a.message)));
});

test('drying progress uses the latest record, and a reading overrides the harvest moisture', () => {
    const wet = { ...batch, moisture_percent: 14.5 };
    const drying = [{ batch_id: 1, method: 'Sun', start_date: '2026-10-01', end_date: null }];
    const ongoing = buildDashboard({ farm: {}, batches: [wet], losses: [], drying }, TODAY).drying[0];
    assert.deepStrictEqual([ongoing.status, ongoing.days, ongoing.moisture_ok], ['drying', 50, false]);
    const done = buildDashboard({ farm: {}, batches: [{ ...wet, moisture_percent: 12.5 }], losses: [], drying: [{ ...drying[0], end_date: '2026-10-08' }] }, TODAY).drying[0];
    assert.deepStrictEqual([done.status, done.days, done.moisture_ok], ['finished', 7, true]);
});

test('archived batches are left out of teh dashboard but not  of reports', () => {
    const records = { farm: {}, batches: [batch, { ...batch, id: 2, code: 'B-02', archieved: true }], losses: [{ batch_id: 2, loss_date: '2026-10-10', quantity_kg: 10, cause: 'mould' }] };
    assert.strictEqual(buildDashboard(onlyActive(records), TODAY).summary.batch_count, 1);
    assert.strictEqual(buildDashboard(records, TODAY).summary.lost_kg, 10);
});