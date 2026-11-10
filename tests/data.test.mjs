import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { parsePenguins, filterPenguins, pearson, SPECIES } from '../assets/data.js';
import { chartSpec } from '../assets/chart.js';

const csv = readFileSync(new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url), 'utf8');
const audit = JSON.parse(readFileSync(new URL('../docs/data-audit.json', import.meta.url), 'utf8'));
const model = parsePenguins(csv);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('original CSV, missing-value handling and stable record identities match independent Python audit', () => {
  assert.equal(createHash('sha256').update(csv).digest('hex'), audit.sha256);
  assert.equal(model.rows.length, audit.row_count);
  assert.equal(model.valid.length, audit.overall.n);
  assert.equal(model.excluded, 2);
  assert.equal(model.valid.filter(row => row.sex === null).length, 9);
  assert.equal(model.rows[3].record_id, 'P004');
  assert.equal(model.valid[0].record_id, 'P001');
  assert.equal(model.valid.some(row => row.record_id === 'P004'), false);
});

test('overall and all species/sex correlations match independently calculated values', () => {
  close(pearson(model.valid), audit.overall.pearson_r);
  for (const species of SPECIES) {
    const selected = filterPenguins(model.valid, [species.id]);
    assert.equal(selected.length, audit.by_species[species.id].n);
    close(pearson(selected), audit.by_species[species.id].pearson_r);
    for (const sex of ['female', 'male']) {
      const rows = filterPenguins(model.valid, [species.id], sex);
      const expected = audit.by_species_and_sex[species.id][sex];
      assert.equal(rows.length, expected.n);
      close(pearson(rows), expected.pearson_r);
    }
  }
});

test('all 32 filter combinations partition the valid records without losing unknown sex', () => {
  for (let mask = 0; mask < 8; mask++) {
    const species = SPECIES.filter((_, i) => mask & (1 << i)).map(s => s.id);
    const all = filterPenguins(model.valid, species);
    const parts = ['female', 'male', 'unknown'].map(sex => filterPenguins(model.valid, species, sex));
    assert.equal(parts.flat().length, all.length);
    assert.equal(new Set(parts.flat().map(row => row.record_id)).size, all.length);
    assert.ok(all.every(row => species.includes(row.species)));
  }
  assert.equal(filterPenguins(model.valid, ['Chinstrap'], 'unknown').length, 0);
  assert.equal(filterPenguins(model.valid, ['Gentoo'], 'unknown').length, 4);
});

test('insufficient and constant measurements do not masquerade as zero correlation', () => {
  assert.equal(pearson([]), null);
  assert.equal(pearson(model.valid.slice(0, 2)), null);
  assert.equal(pearson(Array.from({ length: 5 }, () => ({ flipper_length_mm: 180, body_mass_g: 3500 }))), null);
});

test('malformed input is rejected, and quoted/BOM/CRLF input remains readable', () => {
  assert.throws(() => parsePenguins('species,sex\nAdelie,male'), /必需列/);
  assert.throws(() => parsePenguins(csv.replace('181,3750', 'invalid,3750')), /有效正数/);
  assert.throws(() => parsePenguins(csv.replace('Adelie,Torgersen', 'Unknown,Torgersen')), /物种/);
  assert.throws(() => parsePenguins(csv.split(/\r?\n/)[0]), /没有观测/);
  const encoded = '\uFEFF' + csv.trim().split(/\r?\n/).map(line => line.split(',').map(value => `"${value}"`).join(',')).join('\r\n');
  const quoted = parsePenguins(encoded);
  assert.equal(quoted.valid.length, 342);
  close(pearson(quoted.valid), audit.overall.pearson_r);
});

test('vendored Vega compiles and renders the real data and empty state with fixed coordinate domains', async () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone });
  for (const library of ['vega', 'vega-lite', 'vega-embed']) vm.runInContext(readFileSync(new URL(`../vendor/${library}.min.js`, import.meta.url), 'utf8'), context);
  assert.equal(typeof context.vegaEmbed, 'function');
  const compiled = context.vegaLite.compile(chartSpec(700)).spec;
  const view = new context.vega.View(context.vega.parse(compiled), { renderer: 'none' });
  view.change('points', context.vega.changeset().insert(model.valid));
  await view.runAsync();
  assert.equal(view.data('points').length, 342);
  assert.deepEqual(Array.from(view.scale('x').domain()), [170, 235]);
  assert.deepEqual(Array.from(view.scale('y').domain()), [2500, 6500]);
  const male = filterPenguins(model.valid, ['Chinstrap'], 'male');
  view.change('points', context.vega.changeset().remove(() => true).insert(male));
  view.change('focus', context.vega.changeset().insert(male[0]));
  await view.runAsync();
  assert.equal(view.data('points').length, 34);
  assert.equal(view.data('focus').length, 1);
  view.change('points', context.vega.changeset().remove(() => true));
  view.change('focus', context.vega.changeset().remove(() => true));
  await view.runAsync();
  assert.equal(view.data('points').length, 0);
  assert.deepEqual(Array.from(view.scale('x').domain()), [170, 235]);
  const svg = await view.toSVG();
  assert.ok(svg.includes('体重 / g'));
  view.finalize();
});
