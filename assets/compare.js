import { SPECIES, SEX_LABELS, filterPenguins } from './data.js';
import { captureSelection, comparisonSummary, comparisonBins, overlapCount, trendSegments } from './analysis.js';
import { comparisonScatterSpec, comparisonHistogramSpec } from './chart.js?v=20261111-compare';

const $ = id => document.getElementById(id);
const name = id => SPECIES.find(species => species.id === id)?.name || id;
const number = (value, digits = 1) => value === null ? '不可计算' : value.toFixed(digits);

export function createComparison({ getRows, getScope, getAllRows, restoreScope, report }) {
  const saved = { a: null, b: null }, views = { a: null, b: null, histogram: null };
  let ready = false, queue = Promise.resolve(), resizeTimer;

  function scopeLabel(scope) {
    const species = scope.species.length === 3 ? '全部物种' : scope.species.map(name).join('、');
    const range = scope.range ? ` · 鳍长 ${scope.range.flipper_length_mm.map(x => +x.toFixed(1)).join('—')} mm / 体重 ${scope.range.body_mass_g.map(x => +x.toFixed(1)).join('—')} g` : '';
    return `${species} · ${SEX_LABELS[scope.sex]}${range}`;
  }

  function updateCurrent(enabled = ready) {
    ready = enabled;
    const available = ready && getRows().length > 0;
    for (const slot of ['a', 'b']) {
      $(`capture-${slot}`).disabled = !available;
      $(`replace-${slot}`).disabled = !available;
      $(`restore-${slot}`).disabled = !ready || !saved[slot];
      $(`clear-${slot}`).disabled = !saved[slot];
      $(`capture-${slot}`).textContent = saved[slot] ? `更新 ${slot.toUpperCase()}` : `存为 ${slot.toUpperCase()}`;
    }
    $('compare-preset').disabled = !ready;
    $('view-comparison').disabled = !saved.a && !saved.b;
    $('export-comparison').disabled = !saved.a || !saved.b;
    $('capture-count').textContent = available ? `当前 ${getRows().length} 条${getScope().range ? '框选记录' : '筛选记录'}` : ready ? '当前没有可保留的记录' : '等待数据加载';
  }

  function queueViews() {
    queue = queue.then(async () => {
      for (const slot of ['a', 'b']) {
        const snapshot = saved[slot], target = $(`compare-${slot}-chart`);
        if (!snapshot) {
          views[slot]?.finalize(); views[slot] = null; target.replaceChildren();
          continue;
        }
        const width = Math.max(230, Math.floor(target.getBoundingClientRect().width));
        if (!views[slot]) views[slot] = (await window.vegaEmbed(target, comparisonScatterSpec(width), { actions: false, renderer: 'svg', tooltip: false, defaultStyle: false })).view;
        views[slot].width(width).resize();
        views[slot].change('points', window.vega.changeset().remove(() => true).insert(snapshot.rows));
        views[slot].change('trends', window.vega.changeset().remove(() => true).insert(trendSegments(snapshot.rows, 'overall')));
        await views[slot].runAsync();
      }
      if (saved.a && saved.b) {
        const width = Math.max(230, Math.floor($('compare-distribution').getBoundingClientRect().width));
        if (!views.histogram) views.histogram = (await window.vegaEmbed('#compare-distribution', comparisonHistogramSpec(width), { actions: false, renderer: 'svg', tooltip: false, defaultStyle: false })).view;
        views.histogram.width(width).resize();
        views.histogram.change('distribution', window.vega.changeset().remove(() => true).insert(comparisonBins(saved.a.rows, saved.b.rows)));
        await views.histogram.runAsync();
      } else {
        views.histogram?.finalize(); views.histogram = null; $('compare-distribution').replaceChildren();
      }
    }).catch(error => {
      console.error('Comparison:', error);
      $('comparison-status').textContent = '对比图暂时未能绘制，请重新保留当前组后重试。';
    });
    return queue;
  }

  function render() {
    for (const slot of ['a', 'b']) {
      const snapshot = saved[slot];
      $(`compare-${slot}-empty`).hidden = Boolean(snapshot);
      $(`compare-${slot}-content`).hidden = !snapshot;
      if (!snapshot) continue;
      $(`compare-${slot}-scope`).textContent = scopeLabel(snapshot.scope);
      const stats = comparisonSummary(snapshot.rows);
      $(`compare-${slot}-n`).textContent = stats.n;
      $(`compare-${slot}-r`).textContent = number(stats.r, 3);
      $(`compare-${slot}-mass`).textContent = `${number(stats.meanMass)} g`;
      $(`compare-${slot}-flipper`).textContent = `${number(stats.meanFlipper)} mm`;
    }
    const complete = Boolean(saved.a && saved.b);
    $('comparison-results').hidden = !complete;
    if (complete) {
      const a = comparisonSummary(saved.a.rows), b = comparisonSummary(saved.b.rows);
      const mass = b.meanMass - a.meanMass, flipper = b.meanFlipper - a.meanFlipper;
      $('comparison-delta').textContent = `B 相比 A：平均体重 ${mass >= 0 ? '+' : ''}${mass.toFixed(1)} g，平均鳍长 ${flipper >= 0 ? '+' : ''}${flipper.toFixed(1)} mm。两组有 ${overlapCount(saved.a.rows, saved.b.rows)} 条重合记录。`;
      $('comparison-status').textContent = 'A、B 已同时保留。继续筛选或框选不会改变这两组；可返回任一组继续探索。';
    } else $('comparison-status').textContent = saved.a || saved.b ? `已保留 ${saved.a ? 'A' : 'B'}。调整上方筛选或框选，再保留另一组。` : '先筛选或框选，存为 A；再改变条件，存为 B。也可以从帽带企鹅的雌雄对比开始。';
    updateCurrent();
    queueViews();
  }

  function capture(slot) {
    if (!ready || !getRows().length) return;
    saved[slot] = captureSelection(getRows(), getScope());
    render();
    report(`已将当前 ${saved[slot].rows.length} 条记录保留为 ${slot.toUpperCase()}，可继续调整条件后保留另一组。`);
  }

  for (const slot of ['a', 'b']) {
    $(`capture-${slot}`).addEventListener('click', () => capture(slot));
    $(`replace-${slot}`).addEventListener('click', () => capture(slot));
    $(`clear-${slot}`).addEventListener('click', () => { saved[slot] = null; render(); });
    $(`restore-${slot}`).addEventListener('click', () => {
      if (!ready || !saved[slot]) return;
      restoreScope(saved[slot].scope);
      $('filters').scrollIntoView({ block: 'start' });
      report(`已返回 ${slot.toUpperCase()} 的筛选与框选条件，保留的两组仍可对比。`);
    });
  }
  $('view-comparison').addEventListener('click', () => $('compare-workspace').scrollIntoView({ block: 'start' }));
  $('compare-preset').addEventListener('click', () => {
    if (!ready) return;
    for (const [slot, sex] of [['a', 'female'], ['b', 'male']]) {
      saved[slot] = captureSelection(filterPenguins(getAllRows(), ['Chinstrap'], sex), { species: ['Chinstrap'], sex, range: null });
    }
    render();
    report('已保留帽带雌性为 A、雄性为 B；上方当前探索条件保持原样。');
  });
  $('export-comparison').addEventListener('click', () => {
    if (!saved.a || !saved.b) return;
    const columns = ['group', 'record_id', 'species', 'sex', 'flipper_length_mm', 'body_mass_g', 'island', 'year'];
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = [columns, ...['a', 'b'].flatMap(slot => saved[slot].rows.map(row => columns.map(key => key === 'group' ? slot.toUpperCase() : row[key])))];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'penguins-comparison.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (saved.a || saved.b) queueViews(); }, 120);
  });
  for (const id of ['compare-a-chart', 'compare-b-chart', 'compare-distribution']) observer.observe($(id));
  render();
  return {
    updateCurrent,
    reset() { saved.a = null; saved.b = null; render(); },
  };
}
