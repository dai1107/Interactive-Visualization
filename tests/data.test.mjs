import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parsePenguins, filterPenguins, pearson, SPECIES, normalizeBrush, brushRows, summarize, massBins, GUIDE_STEPS, describeExploration } from '../assets/data.js';

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

test('the five story presets reproduce independently audited groups and the verified brush example', () => {
  const expected = [audit.overall, audit.by_species.Chinstrap, audit.by_species_and_sex.Chinstrap.female, audit.by_species_and_sex.Chinstrap.male, { n: 144, pearson_r: 0.21839439010005007 }];
  assert.equal(GUIDE_STEPS.length, expected.length);
  assert.equal(new Set(GUIDE_STEPS.map(step => step.id)).size, 5);
  for (const [index, step] of GUIDE_STEPS.entries()) {
    const baseline = filterPenguins(model.valid, step.species, step.sex);
    const rows = brushRows(baseline, step.range ?? null);
    assert.equal(rows.length, expected[index].n);
    close(pearson(rows), expected[index].pearson_r);
  }
});

test('observation text follows the actual scope and handles missing groups and empty or small selections', () => {
  assert.ok(describeExploration(model.valid).text.includes('0.871'));
  assert.ok(describeExploration(model.valid).text.includes('0.468'));
  const female = filterPenguins(model.valid, ['Chinstrap'], 'female');
  const text = describeExploration(female).text;
  assert.ok(text.includes('n=34') && text.includes('0.242'));
  assert.ok(!text.includes('0.871'));
  const range = GUIDE_STEPS.at(-1).range;
  assert.ok(describeExploration(model.valid, range).text.includes('144 / 342'));
  assert.ok(describeExploration(model.valid, range).text.includes('3554.0'));
  assert.ok(describeExploration([], null).title.includes('选择'));
  assert.ok(describeExploration(model.valid.slice(0, 2)).text.includes('不可计算'));
  const empty = describeExploration(model.valid, { flipper_length_mm: [170, 171], body_mass_g: [2500, 2600] });
  assert.ok(empty.title.includes('没有选中'));
  assert.ok(!empty.text.includes('NaN'));
});
