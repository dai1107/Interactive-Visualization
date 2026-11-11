import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePenguins, summarize } from '../assets/data.js';
import { YEARS, DEFAULT_SCOPE, copyScope, filterScope, selectedRows, speciesBubbles, areaRadius, annualSeries, snapshot } from '../assets/bubble-model.js';

const model = parsePenguins(readFileSync(new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url), 'utf8'));
const all = { ...copyScope(DEFAULT_SCOPE), allYears: true };

test('actual years partition the observations without longitudinal identity', () => {
  assert.deepEqual(YEARS, [2007, 2008, 2009]);
  const years = YEARS.map(year => filterScope(model.valid, { ...all, allYears: false, year }));
  assert.deepEqual(years.map(rows => rows.length), [109, 114, 119]);
  assert.equal(new Set(years.flat().map(r => r.record_id)).size, 342);
  assert.equal(filterScope(model.valid, DEFAULT_SCOPE).length, 109);
  assert.equal(filterScope(model.valid, all).length, 342);
});

test('island and missing-sex filters respect original records', () => {
  for (const year of YEARS) for (const island of ['Biscoe', 'Dream', 'Torgersen']) {
    const scope = { ...all, year, island, allYears: false };
    assert.deepEqual(filterScope(model.valid, scope), model.valid.filter(r => r.year === year && r.island === island));
  }
  assert.equal(filterScope(model.valid, { ...all, sex: 'unknown' }).length, 9);
  for (const sex of ['female', 'male']) assert.equal(filterScope(model.valid, { ...all, species: ['Chinstrap'], sex }).length, 34);
  assert.equal(filterScope(model.valid, { ...all, species: [] }).length, 0);
});

test('species bubbles use actual means and encode sample count in area', () => {
  const bubbles = speciesBubbles(model.valid);
  assert.deepEqual(bubbles.map(b => b.n), [151, 68, 123]);
  assert.equal(bubbles.reduce((sum, b) => sum + b.n, 0), 342);
  for (const b of bubbles) {
    assert.equal(b.body_mass_g, summarize(model.valid.filter(r => r.species === b.species)).meanMass);
    assert.equal(b.flipper_length_mm, b.rows.reduce((s, r) => s + r.flipper_length_mm, 0) / b.n);
    assert.ok(Number.isFinite(b.flipper_length_mm));
  }
  const radiusRatio = areaRadius(40, 60, 8) / areaRadius(20, 60, 8);
  assert.ok(Math.abs(radiusRatio ** 2 - 2) < 1e-12);
  assert.equal(areaRadius(null, 60, 8), 0);
  assert.equal(areaRadius(-1, 60, 8), 0);
  assert.equal(areaRadius(20, 0, 8), 0);
});

test('annual means obey category filters but ignore current year and brush', () => {
  const scope = { ...all, allYears: false, year: 2009, species: ['Chinstrap'], sex: 'female', range: { flipper_length_mm: [180, 181], body_mass_g: [3000, 3100] } };
  const series = annualSeries(model.valid, scope);
  const values = series.find(s => s.id === 'Chinstrap').values;
  assert.equal(values.reduce((n, v) => n + v.n, 0), 34);
  for (const v of values) {
    const rows = model.valid.filter(r => r.species === 'Chinstrap' && r.sex === 'female' && r.year === v.year);
    assert.equal(v.value, summarize(rows).meanMass);
  }
  assert.ok(series.filter(s => s.id !== 'Chinstrap').every(s => s.values.every(v => v.n === 0 && v.value === null)));
  assert.equal(selectedRows(model.valid, scope).length, 0);
});

test('numeric brushing and snapshots preserve exact scope independently', () => {
  const scope = { ...copyScope(all), year: 2008, island: 'all', range: { flipper_length_mm: [180, 200], body_mass_g: [3000, 4000] } };
  const rows = selectedRows(model.valid, scope);
  assert.equal(rows.length, 144);
  const saved = snapshot(rows, scope);
  scope.species.pop(); scope.range.body_mass_g[0] = 3900; scope.year = 2009;
  rows[0] = { ...rows[0], body_mass_g: 0 };
  assert.equal(saved.scope.year, 2008);
  assert.equal(saved.scope.species.length, 3);
  assert.equal(saved.scope.range.body_mass_g[0], 3000);
  assert.ok(saved.rows[0].body_mass_g > 0);
});
