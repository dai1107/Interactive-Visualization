import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { parsePenguins, filterPenguins, pearson, SPECIES, normalizeBrush, brushRows, summarize, massBins } from '../assets/data.js';
import { chartSpec, histogramSpec, writeBrush } from '../assets/chart.js';

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

test('rectangular selection includes its boundaries, supports empty results, and stays inside its filter baseline', () => {
  const range = { flipper_length_mm: [180, 200], body_mass_g: [3000, 4000] };
  const selected = brushRows(model.valid, range);
  assert.equal(selected.length, 144);
  close(summarize(selected).meanMass, 3553.9930555555557);
  close(pearson(selected), 0.21839439010005007);
  assert.ok(selected.some(row => row.flipper_length_mm === 180));
  assert.ok(selected.some(row => row.flipper_length_mm === 200));
  assert.ok(selected.some(row => row.body_mass_g === 3000));
  assert.ok(selected.some(row => row.body_mass_g === 4000));
  assert.equal(brushRows(model.valid, { flipper_length_mm: [170, 171], body_mass_g: [2500, 2600] }).length, 0);
  const baseline = filterPenguins(model.valid, ['Chinstrap'], 'female');
  assert.ok(brushRows(baseline, range).every(row => row.species === 'Chinstrap' && row.sex === 'female'));
  assert.equal(brushRows(model.valid, null).length, 342);
  assert.equal(normalizeBrush({}), null);
  assert.equal(normalizeBrush({ flipper_length_mm: [180, NaN], body_mass_g: [3000, 4000] }), null);
  assert.equal(summarize([]).meanMass, null);
});

test('linked distribution uses identical bins and conserves baseline and selected sample counts', () => {
  const subset = brushRows(model.valid, { flipper_length_mm: [180, 200], body_mass_g: [3000, 4000] });
  const bins = massBins(model.valid, subset);
  assert.equal(bins.length, 16);
  assert.equal(bins.reduce((sum, bin) => sum + bin.baseline_count, 0), 342);
  assert.equal(bins.reduce((sum, bin) => sum + bin.selected_count, 0), 144);
  assert.ok(bins.every(bin => bin.selected_count <= bin.baseline_count));
  const edges = massBins([{ body_mass_g: 2500 }, { body_mass_g: 2750 }, { body_mass_g: 6500 }], []);
  assert.equal(edges[0].baseline_count, 1);
  assert.equal(edges[1].baseline_count, 1);
  assert.equal(edges[15].baseline_count, 1);
});

test('native brush, point highlighting, linked histogram and resized range agree on the selected records', async () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone });
  for (const library of ['vega', 'vega-lite']) vm.runInContext(readFileSync(new URL(`../vendor/${library}.min.js`, import.meta.url), 'utf8'), context);
  const createView = spec => new context.vega.View(context.vega.parse(context.vegaLite.compile(spec).spec), { renderer: 'none' });
  const scatter = createView(chartSpec(700)), histogram = createView(histogramSpec(500));
  const range = { flipper_length_mm: [180, 200], body_mass_g: [3000, 4000] };
  scatter.change('points', context.vega.changeset().insert(model.valid));
  await scatter.runAsync();
  let signals = 0;
  scatter.addSignalListener('region', () => { signals++; });
  writeBrush(scatter, range); await scatter.runAsync();
  assert.ok(signals > 0, 'native selection signal must be emitted for linked views');
  const actualRange = normalizeBrush(scatter.signal('region'));
  const selected = brushRows(model.valid, actualRange);
  assert.equal(selected.length, 144);
  function visit(item) {
    if (item.mark?.name === 'observations_marks') return [{ id: item.datum.record_id, opacity: item.opacity }];
    return item.items?.flatMap(visit) || [];
  }
  const highlighted = visit(scatter.scenegraph().root).filter(point => point.opacity > .5).map(point => point.id).sort();
  assert.deepEqual(Array.from(highlighted), selected.map(row => row.record_id).sort());
  histogram.change('distribution', context.vega.changeset().insert(massBins(model.valid, selected)));
  await histogram.runAsync();
  const yBefore = Array.from(histogram.scale('y').domain());
  histogram.change('distribution', context.vega.changeset().remove(() => true).insert(massBins(model.valid, [])));
  await histogram.runAsync();
  assert.deepEqual(Array.from(histogram.scale('y').domain()), yBefore);
  assert.deepEqual(Array.from(histogram.scale('x').domain()), [2500, 6500]);
  scatter.width(300).height(290).resize(); await scatter.runAsync();
  writeBrush(scatter, range); await scatter.runAsync();
  assert.equal(brushRows(model.valid, normalizeBrush(scatter.signal('region'))).length, 144);
  writeBrush(scatter, null); await scatter.runAsync();
  assert.equal(normalizeBrush(scatter.signal('region')), null);
  assert.equal(visit(scatter.scenegraph().root).filter(point => point.opacity > .5).length, 342);
  assert.ok((await histogram.toSVG()).includes('体重 / g'));
  scatter.finalize(); histogram.finalize();
});
