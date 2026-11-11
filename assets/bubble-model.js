import { SPECIES, filterPenguins, brushRows, summarize } from './data.js';

export const YEARS = [2007, 2008, 2009];
export const BUBBLE_FIELDS = {
  bill_length_mm: { label: '喙长', domain: [30, 60], maximum: 60, examples: [35, 45, 55] },
  bill_depth_mm: { label: '喙深', domain: [13, 22], maximum: 22, examples: [14, 18, 22] },
};
export const DEFAULT_SCOPE = { species: SPECIES.map(s => s.id), sex: 'all', island: 'all', year: 2007, allYears: false, range: null };
export function copyScope(scope) {
  return { ...scope, species: [...scope.species], range: scope.range ? Object.fromEntries(Object.entries(scope.range).map(([k,v]) => [k,[...v]])) : null };
}
export function filterScope(rows, scope, includeYear = true) {
  return filterPenguins(rows, scope.species, scope.sex).filter(r => (scope.island === 'all' || r.island === scope.island) && (!includeYear || scope.allYears || r.year === scope.year));
}
export function selectedRows(rows, scope) { return brushRows(filterScope(rows, scope), scope.range); }
export function speciesBubbles(rows) {
  return SPECIES.flatMap(s => {
    const group = rows.filter(r => r.species === s.id);
    if (!group.length) return [];
    return [{ id: `mean-${s.id}`, species: s.id, name: s.name, aggregate: true, n: group.length,
      flipper_length_mm: group.reduce((sum,r) => sum+r.flipper_length_mm,0)/group.length,
      ...Object.fromEntries(Object.keys(BUBBLE_FIELDS).map(field => {
        const values = group.map(row => row[field]).filter(Number.isFinite);
        return [field, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
      })),
      body_mass_g: summarize(group).meanMass, r: summarize(group).r, rows: group }];
  });
}
export function areaRadius(value, maximum, maxRadius) {
  return Number.isFinite(value) && value > 0 && maximum > 0 ? maxRadius*Math.sqrt(value/maximum) : 0;
}
export function bubbleRadius(row, { mode = 'individual', size = 'bill_length_mm', mini = false } = {}) {
  if (mode === 'species') return areaRadius(row.n, 151, 34);
  if (size === 'equal') return mini ? 3.8 : 5;
  return areaRadius(row[size], BUBBLE_FIELDS[size]?.maximum || 60, mini ? 6.5 : 14);
}
export function shadeFraction(value, field = 'bill_depth_mm') {
  const domain = BUBBLE_FIELDS[field]?.domain;
  if (!domain || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, (value - domain[0]) / (domain[1] - domain[0])));
}
export function annualSeries(rows, scope, metric = 'body_mass_g') {
  const eligible = filterScope(rows, scope, false);
  return SPECIES.map(s => ({ ...s, values: YEARS.map(year => {
    const group = eligible.filter(r => r.year === year && r.species === s.id);
    return { year, n: group.length, value: group.length ? group.reduce((sum,r) => sum+r[metric],0)/group.length : null };
  }) }));
}
export function snapshot(rows, scope) { return { rows: rows.map(r => ({...r})), scope: copyScope(scope) }; }
