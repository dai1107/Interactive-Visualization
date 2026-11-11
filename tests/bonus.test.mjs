import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePenguins } from '../assets/data.js';
import { selectedRows, summarizePlot } from '../assets/bubble-model.js';
import { discoveryView, cohortComparison, distributionBins, csvFingerprint, explorationRecord, validateNotebook, notebookPayload, recordMarkdown } from '../assets/bonus-model.js';

const csv = readFileSync(new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url), 'utf8');
const { valid } = parsePenguins(csv), fingerprint = csvFingerprint(csv);
const near = (value, expected) => assert.ok(Math.abs(value - expected) < .001, `${value} differs from ${expected}`);

test('five discovery states select real cohorts and expose the change between pooled and within-species relationships', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(i => selectedRows(valid, discoveryView(i).scope).length), [342, 342, 68, 144, 34]);
  near(summarizePlot(selectedRows(valid, discoveryView(0).scope), 'body').r, .871);
  assert.ok(summarizePlot(valid, 'bill').r < 0);
  assert.ok(summarizePlot(selectedRows(valid, discoveryView(2).scope), 'bill').r > 0);
  const changed = discoveryView(3); changed.scope.range.body_mass_g[0] = 3500;
  assert.equal(discoveryView(3).scope.range.body_mass_g[0], 3000);
});

test('selected and remainder are disjoint and conserve the same-year reference even with category and range filters', () => {
  for (const scope of [discoveryView(3).scope, { ...discoveryView(4).scope, allYears: false, year: 2008 }]) {
    const comparison = cohortComparison(valid, scope), chosen = new Set(comparison.selected.rows.map(r => r.record_id));
    assert.ok(comparison.rest.rows.every(r => !chosen.has(r.record_id)));
    assert.equal(comparison.selected.n + comparison.rest.n, comparison.referenceN);
    assert.equal(comparison.referenceN, scope.allYears ? 342 : 114);
    if (!scope.allYears) assert.ok([...comparison.selected.rows, ...comparison.rest.rows].every(r => r.year === 2008));
    for (const group of [comparison.selected, comparison.rest]) {
      assert.equal(group.composition.reduce((sum, s) => sum + s.n, 0), group.n);
      near(group.composition.reduce((sum, s) => sum + s.share, 0), group.n ? 1 : 0);
    }
  }
  const full = cohortComparison(valid, discoveryView(0).scope);
  assert.equal(full.rest.n, 0); assert.equal(full.rest.r, null);
});

test('fixed histogram bins include both domain endpoints and report missing/out-of-range measurements separately', () => {
  const result = distributionBins([2500, 3000, 6500, null, 7000].map(body_mass_g => ({ body_mass_g })), 'body_mass_g');
  assert.equal(result.bins[0].count, 1); assert.equal(result.bins[1].count, 1); assert.equal(result.bins.at(-1).count, 1);
  assert.equal(result.measuredN, 3); assert.equal(result.missingN, 1); assert.equal(result.outsideN, 1);
  near(result.bins.reduce((sum, bin) => sum + bin.share, 0), 1);
  const empty = distributionBins([], 'bill_depth_mm');
  assert.ok(empty.bins.every(bin => bin.share === 0));
});

test('data version identifiers tolerate text line endings while detecting altered source values', () => {
  assert.equal(csvFingerprint('\uFEFF' + csv.replace(/\r?\n/g, '\r\n') + '\r\n'), fingerprint);
  assert.notEqual(csvFingerprint(csv.replace('3750', '3751')), fingerprint);
});

test('notebook round trips preserve view state and independently verify every original record identity', () => {
  const record = explorationRecord(valid, discoveryView(3), fingerprint, { id: 'audit-1', createdAt: '2026-11-12T00:00:00.000Z', title: '局部范围', notes: '比较选中与其余' });
  const payload = notebookPayload([record], fingerprint);
  const restored = validateNotebook(JSON.parse(JSON.stringify(payload)), valid, fingerprint);
  assert.deepEqual(restored, [record]);
  const forged = structuredClone(payload); forged.records[0].ids[0] = 'P999';
  assert.throws(() => validateNotebook(forged, valid, fingerprint), /编号/);
  const duplicated = structuredClone(payload); duplicated.records.push(duplicated.records[0]);
  assert.throws(() => validateNotebook(duplicated, valid, fingerprint), /重复/);
  const invalidRange = structuredClone(payload); invalidRange.records[0].view.scope.range.body_mass_g = [3000, 99999];
  assert.throws(() => validateNotebook(invalidRange, valid, fingerprint), /范围/);
  assert.throws(() => validateNotebook(payload, valid, 'another-version'), /版本/);
  const fakeStatistics = structuredClone(payload); fakeStatistics.records[0].r = 1;
  assert.equal(validateNotebook(fakeStatistics, valid, fingerprint)[0].r, undefined);
});

test('report material recomputes actual statistics and escapes user-authored markup', () => {
  const record = explorationRecord(valid, discoveryView(3), fingerprint, { title: '<img>', notes: '[click](https://example.com) <script> ![image](url)' });
  const markdown = recordMarkdown(record, valid);
  assert.match(markdown, /n=144，Pearson r=0\.218/);
  assert.match(markdown, /鳍长 180—200 mm/);
  assert.match(markdown, /描述性相关/);
  assert.ok(!markdown.includes('<script>')); assert.ok(!markdown.includes('![image]'));
  assert.ok(markdown.includes(fingerprint));
});
