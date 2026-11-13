import { copySelection, selectByRules } from './selection-model.js';
import { SPECIES, filterPenguins, brushRows, summarize } from './data.js';

export const YEARS = [2007, 2008, 2009];
export const BUBBLE_FIELDS = {
  bill_length_mm: { label: '喙长', unit: 'mm', domain: [30, 60], maximum: 60, examples: [35, 45, 55] },
  bill_depth_mm: { label: '喙深', unit: 'mm', domain: [13, 22], maximum: 22, examples: [14, 18, 22] },
  body_mass_g: { label: '体重', unit: 'g', domain: [2500, 6500], maximum: 6500, examples: [3000, 4500, 6000] },
  flipper_length_mm: { label: '鳍长', unit: 'mm', domain: [170, 235], maximum: 235, examples: [180, 200, 220] },
};
export const PLOT_VIEWS = {
  body: { name: '体型关系', title: '鳍长与体重', x: 'flipper_length_mm', y: 'body_mass_g', defaults: [[180, 200], [3000, 4000]], size: 'bill_length_mm', shade: 'bill_depth_mm' },
  bill: { name: '喙部形态', title: '喙长与喙深', x: 'bill_length_mm', y: 'bill_depth_mm', defaults: [[38, 48], [16, 20]], size: 'body_mass_g', shade: 'flipper_length_mm' },
};

export function summarizePlot(rows, plot = 'body') {
  const view = PLOT_VIEWS[plot];
  const valid = rows.filter(row => Number.isFinite(row[view.x]) && Number.isFinite(row[view.y]));
  const n = valid.length;
  if (!n) return { n: 0, r: null, meanX: null, meanY: null };
  const meanX = valid.reduce((sum, row) => sum + row[view.x], 0) / n;
  const meanY = valid.reduce((sum, row) => sum + row[view.y], 0) / n;
  let xy = 0, xx = 0, yy = 0;
  for (const row of valid) {
    const dx = row[view.x] - meanX, dy = row[view.y] - meanY;
    xy += dx * dy; xx += dx * dx; yy += dy * dy;
  }
  return { n, meanX, meanY, r: n < 3 || !xx || !yy ? null : Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) };
}
export function normalizePlotRange(value, plot = 'body') {
  const view = PLOT_VIEWS[plot], range = {};
  for (const field of [view.x, view.y]) {
    if (!Array.isArray(value?.[field]) || value[field].length !== 2 || !value[field].every(Number.isFinite)) return null;
    const extent = [...value[field]].sort((a, b) => a - b);
    if (extent[0] === extent[1]) return null;
    range[field] = extent;
  }
  return range;
}
export function describePlot(rows, plot = 'body') {
  const view = PLOT_VIEWS[plot], stats = summarizePlot(rows, plot);
  const groups = SPECIES.map(species => ({ ...species, ...summarizePlot(rows.filter(row => row.species === species.id), plot) })).filter(group => group.n);
  if (!stats.n) return { title: '换一组条件，继续观察', text: '当前条件没有有效样本。可扩大年份、物种、性别、岛屿或框选范围。', groups };
  if (stats.r === null) return { title: '先看样本数，再解释关系', text: `当前 ${stats.n} 条记录。样本少于3条或坐标没有变化时，不计算相关系数。`, groups };
  const values = groups.map(group => `${group.name} ${group.r === null ? '不可计算' : group.r.toFixed(3)}`).join('、');
  if (groups.length > 1) {
    const opposite = groups.some(group => group.r !== null && group.r * stats.r < 0);
    return { title: opposite ? '总体与物种内部，可能呈现相反方向' : '把总体关系，拆成物种再看', text: `当前 ${stats.n} 条个体的${view.title} r=${stats.r.toFixed(3)}；物种内 r：${values}。总体相关同时包含物种间差异，不能替代组内关系。`, groups };
  }
  return { title: `${groups[0].name}企鹅，在当前条件下`, text: `${stats.n} 条个体的${view.title} r=${stats.r.toFixed(3)}。继续切换性别或年份，比较点群和样本数；这里只描述相关，不判断因果或显著性。`, groups };
}
export const DEFAULT_SCOPE = { species: SPECIES.map(s => s.id), sex: 'all', island: 'all', year: 2007, allYears: false, range: null };
export function copyScope(scope) {
  return { ...scope, ...(scope.selection ? { selection: copySelection(scope.selection) } : {}), species: [...scope.species], range: scope.range ? Object.fromEntries(Object.entries(scope.range).map(([k,v]) => [k,[...v]])) : null };
}
export function filterScope(rows, scope, includeYear = true) {
  return filterPenguins(rows, scope.species, scope.sex).filter(r => (scope.island === 'all' || r.island === scope.island) && (!includeYear || scope.allYears || r.year === scope.year));
}
export function selectedRows(rows, scope) { return selectByRules(brushRows(filterScope(rows, scope), scope.range), scope.selection || []); }
export function speciesBubbles(rows, plot = 'body') {
  return SPECIES.flatMap(s => {
    const group = rows.filter(r => r.species === s.id);
    if (!group.length) return [];
    return [{ id: `mean-${s.id}`, species: s.id, name: s.name, aggregate: true, n: group.length,
      flipper_length_mm: group.reduce((sum,r) => sum+r.flipper_length_mm,0)/group.length,
      ...Object.fromEntries(Object.keys(BUBBLE_FIELDS).map(field => {
        const values = group.map(row => row[field]).filter(Number.isFinite);
        return [field, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
      })),
      body_mass_g: summarize(group).meanMass, r: summarizePlot(group, plot).r, rows: group }];
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
