import { SPECIES } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, summarizePlot } from './bubble-model.js?v=assistant-20261113d';

export function correlationLens(rows, plot = 'body', groupBy = 'species') {
  const p = PLOT_VIEWS[plot];
  const definitions = groupBy === 'sex' ? [{ id: 'female', name: '雌性', color: '#8b5d98' }, { id: 'male', name: '雄性', color: '#347693' }, { id: 'unknown', name: '未记录', color: '#7b827b' }] : SPECIES;
  const groups = definitions.map(group => {
    const records = rows.filter(row => (row[groupBy] ?? 'unknown') === group.id);
    return { ...group, ...summarizePlot(records, plot), rows: records };
  }).filter(group => group.n);
  const residuals = groups.flatMap(group => group.rows.map(row => ({ ...row, [p.x]: row[p.x] - group.meanX, [p.y]: row[p.y] - group.meanY })));
  const total = summarizePlot(rows, plot), within = summarizePlot(residuals, plot);
  const measurable = groups.filter(group => group.r !== null);
  const reversed = total.r !== null && measurable.length > 1 && measurable.every(group => group.r * total.r < 0);
  return { total, within, groups, groupBy, reversed, plot };
}

export function metricComparison(a, b) {
  const mean = (rows, field) => { const values = rows.map(row => row[field]).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };
  return Object.entries(BUBBLE_FIELDS).map(([field, meta]) => {
    const left = mean(a, field), right = mean(b, field);
    return { field, ...meta, a: left, b: right, delta: left === null || right === null ? null : right - left };
  });
}
