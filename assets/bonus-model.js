import { validateSelection, SELECTION_OPERATIONS } from './selection-model.js';
import { SPECIES, SEX_LABELS } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, YEARS, DEFAULT_SCOPE, copyScope, filterScope, selectedRows, summarizePlot } from './bubble-model.js?v=editorial-20261113b';

export const DISCOVERY_STEPS = [
  { title: '看总体', question: '鳍长与体重看起来一起增加吗？先比较总体 r 和三个物种卡片。', plot: 'body' },
  { title: '换个视角', question: '切到喙部形态后，总体与物种内部的相关方向一致吗？留意它们的差别。', plot: 'bill' },
  { title: '拆开物种', question: '只保留帽带企鹅，比较现在的 r 与上一组混合样本。其他分类条件保持一致。', plot: 'bill', species: ['Chinstrap'] },
  { title: '框选局部', question: '范围缩小后，r、分布和物种构成怎样变化？看下方选中与其余样本的对照；不要据此认定因果或显著性。', plot: 'body', range: true },
  { title: '雌雄对照', question: 'A/B 已分别保留帽带雌性和雄性。比较两组的样本数、分布和 r，再把你的发现记下来。', plot: 'body', species: ['Chinstrap'], sex: 'female', compareSex: true },
];

export function discoveryView(index) {
  const step = DISCOVERY_STEPS[index];
  if (!step) throw new Error('无效的引导步骤。');
  const plot = PLOT_VIEWS[step.plot];
  const scope = { ...copyScope(DEFAULT_SCOPE), allYears: true, species: [...(step.species || SPECIES.map(s => s.id))], sex: step.sex || 'all' };
  if (step.range) scope.range = { [plot.x]: [...plot.defaults[0]], [plot.y]: [...plot.defaults[1]] };
  return { scope, plot: step.plot, mode: 'individual', size: plot.size, shade: plot.shade, annualMetric: plot.y, distributionMetric: plot.y, focusSpecies: true };
}

export function distributionBins(rows, field) {
  const [lo, hi] = BUBBLE_FIELDS[field].domain;
  const count = field === 'body_mass_g' ? 8 : field === 'flipper_length_mm' ? 13 : field === 'bill_depth_mm' ? 9 : 10;
  const width = (hi - lo) / count;
  const bins = Array.from({ length: count }, (_, i) => ({ lo: lo + i * width, hi: lo + (i + 1) * width, count: 0, share: 0 }));
  let missingN = 0, outsideN = 0, measuredN = 0;
  for (const row of rows) {
    const value = row[field];
    if (!Number.isFinite(value)) { missingN++; continue; }
    if (value < lo || value > hi) { outsideN++; continue; }
    bins[Math.min(count - 1, Math.floor((value - lo) / width))].count++;
    measuredN++;
  }
  for (const bin of bins) bin.share = measuredN ? bin.count / measuredN : 0;
  return { bins, measuredN, missingN, outsideN };
}

export function cohortComparison(rows, scope, plot = 'body', field = 'body_mass_g') {
  const reference = filterScope(rows, { ...scope, species: SPECIES.map(s => s.id), sex: 'all', island: 'all' });
  const chosen = selectedRows(rows, scope), ids = new Set(chosen.map(row => row.record_id));
  const rest = reference.filter(row => !ids.has(row.record_id));
  const cohort = (records, label) => ({ label, rows: records, ...summarizePlot(records, plot), distribution: distributionBins(records, field), composition: SPECIES.map(s => ({ ...s, n: records.filter(row => row.species === s.id).length, share: records.length ? records.filter(row => row.species === s.id).length / records.length : 0 })) });
  return { referenceN: reference.length, yearLabel: scope.allYears ? '2007—2009 全部年份' : String(scope.year), field, selected: cohort(chosen, '选中样本'), rest: cohort(rest, '同年其余样本') };
}

// A deterministic data-version identifier, not a security signature.
export function csvFingerprint(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(normalized)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  return 'fnv1a64:' + hash.toString(16).padStart(16, '0');
}

export function validateView(input) {
  if (!input || !Object.hasOwn(PLOT_VIEWS, input.plot)) throw new Error('记录中的视角无效。');
  const scope = input.scope, p = PLOT_VIEWS[input.plot];
  if (!scope || !Array.isArray(scope.species) || scope.species.length > 3 || new Set(scope.species).size !== scope.species.length || scope.species.some(id => !SPECIES.some(s => s.id === id))) throw new Error('记录中的物种条件无效。');
  if (!Object.hasOwn(SEX_LABELS, scope.sex) || !['all', 'Biscoe', 'Dream', 'Torgersen'].includes(scope.island) || !YEARS.includes(scope.year) || typeof scope.allYears !== 'boolean') throw new Error('记录中的分类或年份条件无效。');
  if (!['individual', 'species'].includes(input.mode) || !(input.size === 'equal' || Object.hasOwn(BUBBLE_FIELDS, input.size)) || !(input.shade === 'none' || Object.hasOwn(BUBBLE_FIELDS, input.shade)) || !Object.hasOwn(BUBBLE_FIELDS, input.annualMetric) || !Object.hasOwn(BUBBLE_FIELDS, input.distributionMetric)) throw new Error('记录中的视觉编码无效。');
  let range = null;
  if (scope.range !== null && scope.range !== undefined) {
    if (input.mode === 'species' || Object.keys(scope.range).length !== 2) throw new Error('记录中的框选条件无效。');
    range = {};
    for (const field of [p.x, p.y]) {
      const extent = scope.range[field], domain = BUBBLE_FIELDS[field].domain;
      if (!Array.isArray(extent) || extent.length !== 2 || !extent.every(Number.isFinite) || extent[0] >= extent[1] || extent[0] < domain[0] || extent[1] > domain[1]) throw new Error('记录中的框选范围超出坐标或不完整。');
      range[field] = [...extent];
    }
  }
  const selection = scope.selection === undefined ? undefined : validateSelection(scope.selection);
  if (range && selection?.length) throw new Error('请使用单一的选择表达式。');
  if (input.mode === 'species' && selection?.length) throw new Error('物种均值视图不接受个体选择表达式。');
  return { scope: { ...(selection ? { selection } : {}), species: [...scope.species], sex: scope.sex, island: scope.island, year: scope.year, allYears: scope.allYears, range }, plot: input.plot, mode: input.mode, size: input.size, shade: input.shade, annualMetric: input.annualMetric, distributionMetric: input.distributionMetric, focusSpecies: input.focusSpecies !== false };
}

export function explorationRecord(rows, view, fingerprint, options = {}) {
  const checked = validateView(view), chosen = selectedRows(rows, checked.scope);
  if (!chosen.length) throw new Error('当前没有有效样本，暂不能记录发现。');
  const id = options.id || 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  return { id, createdAt: options.createdAt || new Date().toISOString(), title: String(options.title || PLOT_VIEWS[checked.plot].title).slice(0, 100), notes: String(options.notes || '').slice(0, 1000), sourceFingerprint: fingerprint, view: checked, ids: chosen.map(row => row.record_id) };
}

export function validateNotebook(payload, rows, fingerprint) {
  if (!payload || payload.schema !== 'penguin-exploration-notebook' || payload.version !== 1 || payload.sourceFingerprint !== fingerprint || !Array.isArray(payload.records) || payload.records.length > 20) throw new Error('记录文件格式或数据版本不匹配（最多20条记录）。');
  const recordIds = new Set();
  return payload.records.map(record => {
    if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id) || recordIds.has(record.id) || !Number.isFinite(Date.parse(record.createdAt)) || record.sourceFingerprint !== fingerprint || typeof record.title !== 'string' || record.title.length > 100 || typeof record.notes !== 'string' || record.notes.length > 1000 || !Array.isArray(record.ids) || record.ids.length > rows.length) throw new Error('文件含无效或重复记录。');
    recordIds.add(record.id);
    const validated = explorationRecord(rows, record.view, fingerprint, record);
    const expected = [...validated.ids].sort(), supplied = [...record.ids].sort();
    if (expected.length !== supplied.length || expected.some((id, i) => id !== supplied[i])) throw new Error('记录中的样本编号与筛选条件不一致。');
    return validated;
  });
}

export function notebookPayload(records, fingerprint) {
  return { schema: 'penguin-exploration-notebook', version: 1, sourceFingerprint: fingerprint, records };
}

export function recordMarkdown(record, rows) {
  const safe = value => String(value).replace(/[\\`*_{}\[\]<>!]/g, '\\$&');
  const view = record.view, p = PLOT_VIEWS[view.plot], chosen = selectedRows(rows, view.scope), stats = summarizePlot(chosen, view.plot);
  const r = stats.r === null ? '不可计算' : stats.r.toFixed(3);
  const groups = SPECIES.map(s => ({ ...s, ...summarizePlot(chosen.filter(row => row.species === s.id), view.plot) })).filter(s => s.n);
  return [
    '# ' + safe(record.title), '',
    '记录时间：' + record.createdAt, '',
    '视角：' + p.title + '。年份：' + (view.scope.allYears ? '2007—2009' : view.scope.year) + '。物种：' + view.scope.species.join('、') + '。性别：' + SEX_LABELS[view.scope.sex] + '。岛屿：' + view.scope.island + '。', '',
    '有效个体 n=' + stats.n + '，Pearson r=' + r + '。', '',
    '物种内：' + groups.map(g => g.name + ' n=' + g.n + '，r=' + (g.r === null ? '不可计算' : g.r.toFixed(3))).join('；') + '。', '',
    '框选：' + (view.scope.range ? Object.entries(view.scope.range).map(([field, extent]) => BUBBLE_FIELDS[field].label + ' ' + extent.join('—') + ' ' + BUBBLE_FIELDS[field].unit).join('；') : '无'), '',
    '组合选择：' + (view.scope.selection?.length ? view.scope.selection.map((rule, i) => `${i + 1}. ${SELECTION_OPERATIONS[rule.op]} ${safe(rule.label)}`).join('；') : '无') + '。', '',
    '我的观察：' + safe(record.notes || '未填写'), '',
    '数据版本：' + record.sourceFingerprint + '。样本编号：' + record.ids.join(', ') + '。', '',
    '数据来源：[palmerpenguins](https://allisonhorst.github.io/palmerpenguins/)。仅作描述性相关；不同年份是不同观测样本，不表示个体成长。',
  ].join('\n');
}
