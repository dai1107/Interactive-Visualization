import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePenguins, pearson } from '../assets/data.js';
import { DEFAULT_SCOPE, copyScope, summarizePlot, normalizePlotRange, selectedRows, describePlot, speciesBubbles, bubbleRadius } from '../assets/bubble-model.js';

const { valid } = parsePenguins(readFileSync(new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url), 'utf8'));

test('each exploration perspective computes correlation from its actual coordinates', () => {
  const rows = [1, 2, 3, 4].map(value => ({ bill_length_mm: value, bill_depth_mm: 10 - value }));
  const result = summarizePlot(rows, 'bill');
  assert.equal(result.r, -1);
  assert.equal(result.meanX, 2.5);
  assert.equal(result.meanY, 7.5);
  assert.equal(summarizePlot(rows, 'body').n, 0);
  assert.equal(summarizePlot(rows.slice(0, 2), 'bill').r, null);
  assert.equal(summarizePlot(rows.map(row => ({ ...row, bill_depth_mm: 5 })), 'bill').r, null);
  assert.equal(summarizePlot(valid, 'body').r, pearson(valid));
  assert.ok(summarizePlot(valid, 'bill').r < 0);
  assert.ok(speciesBubbles(valid, 'bill').every(group => group.r > 0));
});

test('bill brushing uses bill fields and preserves real records and area ratios', () => {
  const range = normalizePlotRange({ bill_length_mm: [48, 38], bill_depth_mm: [20, 16] }, 'bill');
  const scope = { ...copyScope(DEFAULT_SCOPE), allYears: true, range };
  assert.deepEqual(selectedRows(valid, scope), valid.filter(row => row.bill_length_mm >= 38 && row.bill_length_mm <= 48 && row.bill_depth_mm >= 16 && row.bill_depth_mm <= 20));
  assert.equal(normalizePlotRange(range, 'body'), null);
  assert.equal(normalizePlotRange({ bill_length_mm: [38, 38], bill_depth_mm: [16, 20] }, 'bill'), null);
  const radius = value => bubbleRadius({ body_mass_g: value }, { size: 'body_mass_g' });
  assert.ok(radius(6000) <= 14);
  assert.ok(Math.abs((radius(6000) / radius(3000)) ** 2 - 2) < 1e-12);
});

test('observation text and species cards follow the selected coordinates and records', () => {
  const bill = describePlot(valid, 'bill');
  assert.match(bill.title, /相反/);
  assert.match(bill.text, /喙长与喙深/);
  assert.equal(bill.groups.reduce((sum, group) => sum + group.n, 0), 342);
  const single = describePlot(valid.filter(row => row.species === 'Gentoo'), 'bill');
  assert.match(single.title, /巴布亚/);
  assert.equal(single.groups.length, 1);
  assert.match(describePlot([], 'bill').title, /换一组条件/);
  assert.match(describePlot(valid.slice(0, 2), 'bill').text, /不计算相关系数/);
});
