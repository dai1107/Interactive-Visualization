import { setActivePage } from './layout.js?v=atelier-20261113c';
import { SPECIES } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, copyScope, DEFAULT_SCOPE, selectedRows } from './bubble-model.js?v=atelier-20261113c';
import { SELECTION_OPERATIONS, copySelection, validateSelection, compareSets, hasSelection } from './selection-model.js';
import { correlationLens } from './insight-model.js?v=atelier-20261113c';
import { drawCorrelationLens, drawMetricComparison } from './insight-charts.js?v=atelier-20261113c';

export function createEnhancements({ rows, getView, applyView, snapshots, filterGroup, onStory, announce }) {
  const byId = id => document.getElementById(id);
  let undo = [], redo = [], groupBy = 'species', operation = 'replace';
  const make = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  function commit(view) {
    undo.push(getView()); if (undo.length > 20) undo.shift(); redo = [];
    applyView(view); announce(`选择已更新：${selectedRows(rows(), view.scope).length} 条样本。`);
  }
  function select(rule) {
    try {
      const view = getView(), previous = copySelection(view.scope.selection || []);
      if (view.scope.range) previous.push({ kind: 'range', op: 'replace', label: '原框选', range: view.scope.range, exclusive: [] });
      const next = { ...rule, op: operation };
      view.scope.selection = validateSelection(operation === 'replace' ? [next] : [...previous, next]);
      view.scope.range = null; view.mode = 'individual'; commit(view);
      byId('selection-message').textContent = `${SELECTION_OPERATIONS[operation]}：${rule.label}。`;
    } catch (error) { byId('selection-message').textContent = error.message; }
  }
  function rangeSelect(range, exclusive = [], label) {
    if (!range || !Object.keys(range).length) return;
    select({ kind: 'range', range, exclusive, label: label || Object.entries(range).map(([field, extent]) => `${BUBBLE_FIELDS[field].label} ${extent.map(v => +v.toFixed(2)).join('—')} ${BUBBLE_FIELDS[field].unit}`).join('；') });
  }
  function clear() {
    const view = getView(); if (!hasSelection(view.scope)) return;
    view.scope.range = null; delete view.scope.selection; commit(view);
    byId('selection-message').textContent = '已清除局部选择，分类和年份筛选保持当前条件。';
  }
  function resetHistory() { undo = []; redo = []; }
  function render() {
    if (!rows().length) return;
    const view = getView(), chosen = selectedRows(rows(), view.scope), lens = correlationLens(chosen, view.plot, groupBy);
    byId('selection-undo').disabled = !undo.length; byId('selection-redo').disabled = !redo.length;
    byId('selection-clear').disabled = !hasSelection(view.scope);
    byId('selection-op').value = operation;
    byId('selection-rules').replaceChildren();
    const rules = [...(view.scope.selection || []), ...(view.scope.range ? [{ op: 'replace', label: '当前矩形范围' }] : [])];
    rules.forEach((rule, i) => { const chip = make('li', `${i + 1} ${SELECTION_OPERATIONS[rule.op]} · ${rule.label}`); chip.title = rule.label; byId('selection-rules').append(chip); });
    byId('selection-caption').textContent = rules.length ? `${rules.length} 步组合 · ${chosen.length} 条已选中。切换体型、喙部视角可继续跨指标选择。` : '可在主图框选，也可从分布反向选择。';
    byId('lens-scope').textContent = `与主图同一批 ${chosen.length} 条个体 · ${PLOT_VIEWS[view.plot].title} · 按${groupBy === 'species' ? '物种' : '性别'}拆分`;
    drawCorrelationLens(byId('correlation-lens'), lens, id => filterGroup(groupBy, id));
    byId('lens-finding').textContent = chosen.length < 3 ? '当前样本不足，扩大选择后再比较。' : lens.reversed ? `方向发生逆转：当前总体相关为${lens.total.r < 0 ? '负' : '正'}，各个可计算分组内均为${lens.total.r < 0 ? '正' : '负'}。分组混合改变了总体关系。` : `总体 r=${lens.total.r === null ? '不可计算' : lens.total.r.toFixed(3)}；减去各组均值后，组内合并 r=${lens.within.r === null ? '不可计算' : lens.within.r.toFixed(3)}。比较两者，辨别组间差异与组内关系。`;
    byId('lens-finding').dataset.reversed = String(lens.reversed);
    const saved = snapshots(), a = saved.a?.rows || [], b = saved.b?.rows || [];
    const sets = compareSets(a, b), ready = Boolean(saved.a && saved.b);
    byId('set-summary').textContent = ready ? `A 独有 ${sets.aOnly.length} · 重合 ${sets.intersection.length} · B 独有 ${sets.bOnly.length} · 并集 ${sets.union.length}` : '分别存入 A、B 后，可比较均值，也可把两组的交集、并集或差集送回主图。';
    for (const key of ['intersection', 'union', 'aOnly', 'bOnly']) byId('set-' + key).disabled = !ready || !sets[key].length;
    const strip = byId('set-overlap'); strip.replaceChildren();
    if (ready && sets.union.length) for (const [key, label, color] of [['aOnly', 'A独有', '#386a5c'], ['intersection', '重合', '#877b9b'], ['bOnly', 'B独有', '#b17c58']]) {
      if (!sets[key].length) continue;
      const span = make('span', `${label} ${sets[key].length}`); span.style.flexGrow = sets[key].length; span.style.background = color; span.title = `${label} ${sets[key].length} / 并集 ${sets.union.length} 条`; strip.append(span);
    }
    if (byId('comparison').open && !byId('page-compare').hidden) drawMetricComparison(byId('metric-comparison'), a, b);
  }
  function initialize() {
    byId('selection-op').addEventListener('change', event => { operation = event.target.value; byId('selection-message').textContent = `下一次选择将使用“${SELECTION_OPERATIONS[operation]}”。`; });
    byId('selection-undo').addEventListener('click', () => { if (!undo.length) return; redo.push(getView()); applyView(undo.pop()); byId('selection-message').textContent = '已撤销上一步选择。'; });
    byId('selection-redo').addEventListener('click', () => { if (!redo.length) return; undo.push(getView()); applyView(redo.pop()); byId('selection-message').textContent = '已重做选择。'; });
    byId('selection-clear').addEventListener('click', clear);
    byId('lens-group').addEventListener('change', event => { groupBy = event.target.value; render(); });
    byId('comparison').addEventListener('toggle', render);
    for (const [id, index] of [['story-reversal', 1], ['story-range', 3], ['story-sex', 4]]) byId(id).addEventListener('click', () => { groupBy = index === 4 ? 'sex' : 'species'; byId('lens-group').value = groupBy; onStory(index); byId('explorer').scrollIntoView({ block: 'start' }); });
    const labels = { intersection: 'A ∩ B 交集', union: 'A ∪ B 并集', aOnly: 'A − B 差集', bOnly: 'B − A 差集' };
    for (const key of Object.keys(labels)) byId('set-' + key).addEventListener('click', () => {
      const saved = snapshots(); if (!saved.a || !saved.b) return;
      const ids = compareSets(saved.a.rows, saved.b.rows)[key], view = getView();
      setActivePage('explore');
      view.scope = { ...copyScope(DEFAULT_SCOPE), allYears: true, selection: [{ kind: 'ids', op: 'replace', ids, label: labels[key] }] }; view.mode = 'individual'; commit(view);
      byId('selection-message').textContent = `已将 ${labels[key]} 的 ${ids.length} 条原始记录送回主图。`; byId('explorer').scrollIntoView({ block: 'start' });
    });
    render();
  }
  return { initialize, render, rangeSelect, resetHistory, clear };
}
