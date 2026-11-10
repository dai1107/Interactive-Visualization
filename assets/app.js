import { SPECIES, SEX_LABELS, parsePenguins, filterPenguins, pearson, correlationReason, normalizeBrush, brushRows, summarize, massBins } from './data.js';
import { chartSpec, histogramSpec, writeBrush } from './chart.js';

const $ = id => document.getElementById(id);
const checks = [...document.querySelectorAll('input[name="species"]')];
const state = { model: null, filtered: [], view: null, histogram: null, range: null, syncBrush: false, revision: 0, pinned: null, hover: null, loading: false, pointer: null, dragged: false };
let renderQueue = Promise.resolve();
let resizeTimer;
const dataURL = new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url);
const formatR = r => r === null ? '不可计算' : r.toFixed(3);
const speciesName = id => SPECIES.find(s => s.id === id)?.name || id;
const sexName = sex => SEX_LABELS[sex ?? 'unknown'];
const selection = () => checks.filter(input => input.checked).map(input => input.value);
const currentRows = () => brushRows(state.filtered, state.range);
const formatMean = value => value === null ? '不可计算' : value.toFixed(1);

function textCell(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

function queueChart(rows = state.filtered) {
  const snapshot = [...rows];
  const revision = state.revision;
  renderQueue = renderQueue.then(async () => {
    if (!state.view || revision !== state.revision) return;
    const current = state.hover || state.pinned;
    const highlight = current ? snapshot.filter(row => row.record_id === current) : [];
    state.syncBrush = true;
    try {
      writeBrush(state.view, null);
      state.view.change('points', window.vega.changeset().remove(() => true).insert(snapshot));
      state.view.change('focus', window.vega.changeset().remove(() => true).insert(highlight));
      await state.view.runAsync();
    } finally { state.syncBrush = false; }
  }).catch(error => showFailure(error));
  return renderQueue;
}

function updateHighlight() {
  renderQueue = renderQueue.then(async () => {
    if (!state.view) return;
    const id = state.hover || state.pinned;
    state.view.change('focus', window.vega.changeset().remove(() => true).insert(currentRows().filter(row => row.record_id === id)));
    await state.view.runAsync();
  }).catch(error => showFailure(error));
}

function renderDetails() {
  const id = state.hover || state.pinned;
  const record = currentRows().find(row => row.record_id === id);
  $('detail-placeholder').hidden = Boolean(record);
  $('detail-values').hidden = !record;
  $('clear-detail').hidden = !state.pinned;
  $('detail-heading').textContent = record ? `${speciesName(record.species)} · ${record.record_id}` : '靠近一个点';
  $('detail-badge').textContent = record && id === state.pinned ? '已固定' : record ? '正在查看' : '个体详情';
  $('detail-values').replaceChildren();
  if (record) {
    const fields = [['编号', record.record_id], ['物种', `${speciesName(record.species)} ${record.species}`], ['性别', sexName(record.sex)], ['鳍长', `${record.flipper_length_mm} mm`], ['体重', `${record.body_mass_g.toLocaleString('zh-CN')} g`], ['岛屿', record.island], ['年份', record.year]];
    for (const [label, value] of fields) $('detail-values').append(textCell('dt', label), textCell('dd', value));
  }
}

function renderRecords() {
  const rows = currentRows();
  $('table-count').textContent = `（${state.range ? '框选 ' : ''}${rows.length} 条）`;
  if (!$('data-disclosure').open) return;
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');
    [row.record_id, `${speciesName(row.species)} ${row.species}`, sexName(row.sex), row.flipper_length_mm, row.body_mass_g, row.island, row.year].forEach(value => tr.append(textCell('td', value)));
    fragment.append(tr);
  }
  if (!rows.length) {
    const tr = document.createElement('tr'), td = textCell('td', '当前条件没有有效记录。');
    td.colSpan = 7; tr.append(td); fragment.append(tr);
  }
  $('record-rows').replaceChildren(fragment);
}

function renderGroups() {
  const species = selection(), scope = currentRows();
  $('group-scope').textContent = state.range ? `当前统计框选的 ${scope.length} 条记录；未框选的点保留为背景。` : '当前统计筛选基准；框选后这里将同步更新为选中子集。';
  const fragment = document.createDocumentFragment();
  for (const item of SPECIES) {
    const included = species.includes(item.id), rows = scope.filter(row => row.species === item.id);
    const tr = document.createElement('tr');
    if (!included) tr.className = 'inactive';
    const label = document.createElement('th'); label.scope = 'row';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.backgroundColor = item.color; dot.setAttribute('aria-hidden', 'true');
    label.append(dot, document.createTextNode(item.name), textCell('small', item.id));
    tr.append(label, textCell('td', included ? rows.length : '未选择'), textCell('td', included ? formatR(pearson(rows)) : '—'));
    fragment.append(tr);
  }
  $('group-stats').replaceChildren(fragment);
}

function renderLinked() {
  const active = Boolean(state.range), rows = currentRows();
  const baseline = summarize(state.filtered), subset = active ? summarize(rows) : null;
  const bins = massBins(state.filtered, active ? rows : []);
  const extents = state.range || { flipper_length_mm: [170, 235], body_mass_g: [2500, 6500] };
  for (const [field, prefix] of [['flipper_length_mm', 'flipper'], ['body_mass_g', 'mass']]) {
    $(prefix + '-min').value = Number(extents[field][0].toFixed(6));
    $(prefix + '-max').value = Number(extents[field][1].toFixed(6));
  }
  $('clear-brush').disabled = !active || state.loading;
  $('range-controls').disabled = !state.model || !state.filtered.length || state.loading;
  $('brush-summary').textContent = active
    ? `框选 ${subset.n} / ${baseline.n} 条 · 鳍长 ${extents.flipper_length_mm.map(v => +v.toFixed(1)).join('—')} mm · 体重 ${extents.body_mass_g.map(v => +v.toFixed(1)).join('—')} g`
    : '尚未框选；下图显示当前筛选的体重分布。';
  const fragment = document.createDocumentFragment();
  for (const [label, stats] of [['筛选基准', baseline], ['框选子集', subset]]) {
    const tr = document.createElement('tr');
    if (label === '框选子集') tr.className = 'subset-row';
    const th = textCell('th', label); th.scope = 'row';
    tr.append(th, textCell('td', stats ? stats.n : '未框选'), textCell('td', stats ? formatMean(stats.meanMass) : '—'), textCell('td', stats ? formatR(stats.r) : '—'));
    fragment.append(tr);
  }
  $('benchmark-stats').replaceChildren(fragment);
  if (!active) $('benchmark-difference').textContent = '拖动框选或输入数值范围，查看子集的统计与占比。';
  else if (!subset.n) $('benchmark-difference').textContent = '此范围未选中记录，请扩大范围或清除框选。';
  else {
    const delta = subset.meanMass - baseline.meanMass;
    $('benchmark-difference').textContent = `选中基准的 ${(subset.n / baseline.n * 100).toFixed(1)}%；平均体重较基准 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} g。${correlationReason(rows)}`;
  }
  const binRows = document.createDocumentFragment();
  bins.forEach((bin, index) => {
    const tr = document.createElement('tr');
    tr.append(textCell('td', `${bin.start}—${bin.end}${index === 15 ? '（含上限）' : '（不含上限）'}`), textCell('td', bin.baseline_count), textCell('td', active ? bin.selected_count : '—'));
    binRows.append(tr);
  });
  $('bin-rows').replaceChildren(binRows);
  const revision = state.revision;
  renderQueue = renderQueue.then(async () => {
    if (!state.histogram || revision !== state.revision) return;
    state.histogram.change('distribution', window.vega.changeset().remove(() => true).insert(bins));
    await state.histogram.runAsync();
  }).catch(error => showFailure(error));
}

function commitBrush(value) {
  const range = normalizeBrush(value);
  if (JSON.stringify(range) === JSON.stringify(state.range)) return;
  state.range = range; state.hover = null; $('range-error').textContent = '';
  if (state.pinned && !currentRows().some(row => row.record_id === state.pinned)) {
    state.pinned = null;
    $('notice').textContent = '原记录不在当前框选范围，已清除固定详情。';
  }
  renderLinked(); renderGroups(); renderRecords(); renderDetails(); updateHighlight();
}

function setBrush(range) {
  const revision = state.revision;
  renderQueue = renderQueue.then(async () => {
    if (!state.view || revision !== state.revision) return;
    state.syncBrush = true;
    try { writeBrush(state.view, range); await state.view.runAsync(); }
    finally { state.syncBrush = false; }
    commitBrush(state.view.signal('region'));
  }).catch(error => showFailure(error));
}

function refresh() {
  if (!state.model || state.loading) return;
  const species = selection(), sex = $('sex').value;
  const hadRange = Boolean(state.range);
  state.revision++; state.range = null;
  state.filtered = filterPenguins(state.model.valid, species, sex);
  state.hover = null;
  $('notice').textContent = hadRange ? '筛选条件已更新，框选已清除；比较基准随之更新。' : '';
  $('range-error').textContent = '';
  if (state.pinned && !state.filtered.some(row => row.record_id === state.pinned)) {
    state.pinned = null;
    $('notice').textContent = '原记录不在当前筛选范围，已清除固定详情。';
  }
  const n = state.filtered.length, base = state.model.valid.length;
  const r = pearson(state.filtered);
  $('sample-count').textContent = n;
  $('sample-base').textContent = `/ ${base} 条有效记录`;
  $('correlation').textContent = formatR(r);
  $('correlation').classList.toggle('unavailable', r === null);
  $('correlation-note').textContent = correlationReason(state.filtered);
  $('count-caption').textContent = `${n} 条有效记录`;
  const names = species.length === 3 ? '全部物种' : species.length ? species.map(speciesName).join('、') : '未选择物种';
  $('condition-summary').textContent = `${names} / ${SEX_LABELS[sex]} · 显示 ${n} / ${base} 条有效记录`;
  $('empty-state').hidden = n > 0;
  $('empty-title').textContent = species.length ? '当前条件没有有效记录' : '请选择至少一种企鹅';
  $('empty-message').textContent = species.length ? '试试其他性别，或重置全部条件。' : '勾选上方的物种，或点击下方按钮恢复全选。';
  $('empty-all').textContent = species.length ? '重置全部条件' : '全选物种';

  renderLinked(); renderGroups(); renderRecords(); renderDetails();
  queueChart();
}

function reset() {
  checks.forEach(input => { input.checked = true; });
  $('sex').value = 'all'; state.pinned = null; state.hover = null; state.pointer = null; state.dragged = false;
  refresh();
}

function setControls(enabled) {
  $('species-controls').disabled = !enabled;
  $('sex-controls').disabled = !enabled;
  $('reset').disabled = !enabled;
  $('range-controls').disabled = !enabled || !state.filtered.length;
  $('clear-brush').disabled = !enabled || !state.range;
}

function showFailure(error) {
  console.error('Penguin explorer:', error);
  state.loading = false;
  setControls(false);
  $('load-state').hidden = false;
  $('load-state').classList.add('error');
  $('load-message').textContent = `加载失败。请检查网络后重试。${error.message.includes('数据') || error.message.includes('格式') ? ` ${error.message}` : ''}`;
  $('retry').hidden = false;
  $('chart').replaceChildren();
  state.view?.finalize(); state.view = null;
  state.histogram?.finalize(); state.histogram = null;
  $('mass-chart').replaceChildren();
  state.range = null; state.revision++;
  state.model = null; state.filtered = []; state.pinned = null; state.hover = null;
  $('sample-count').textContent = '—'; $('correlation').textContent = '—';
  $('sample-base').textContent = '等待数据重新加载';
  $('correlation-note').textContent = ''; $('notice').textContent = '';
  $('condition-summary').textContent = '数据尚未加载成功'; $('empty-state').hidden = true;
  $('group-stats').replaceChildren(); $('record-rows').replaceChildren();
  $('benchmark-stats').replaceChildren(); $('bin-rows').replaceChildren();
  $('brush-summary').textContent = '等待数据重新加载';
  $('benchmark-difference').textContent = '数据加载成功后可进行框选比较。';
  $('count-caption').textContent = '— 条有效记录'; $('table-count').textContent = '';
  renderDetails();
}

async function load() {
  if (state.loading) return;
  state.loading = true; setControls(false);
  $('load-state').hidden = false; $('load-state').classList.remove('error');
  $('load-message').textContent = '正在加载企鹅数据…'; $('retry').hidden = true;
  try {
    if (!window.vegaEmbed || !window.vega) throw new Error('图表脚本未加载，请刷新页面后重试。');
    const response = await fetch(dataURL);
    if (!response.ok) throw new Error(`数据请求失败（HTTP ${response.status}）。`);
    const model = parsePenguins(await response.text());
    const width = Math.floor($('chart').getBoundingClientRect().width);
    const result = await window.vegaEmbed('#chart', chartSpec(Math.max(230, width)), { actions: false, renderer: 'svg', tooltip: false, defaultStyle: false });
    state.model = model; state.view = result.view;
    const distribution = await window.vegaEmbed('#mass-chart', histogramSpec(Math.max(230, Math.floor($('mass-chart').getBoundingClientRect().width))), { actions: false, renderer: 'svg', tooltip: false, defaultStyle: false });
    state.histogram = distribution.view;
    state.view.addSignalListener('region', (_name, value) => {
      if (!state.syncBrush && !state.loading) commitBrush(value);
    });
    state.view.addEventListener('mouseover', (_event, item) => {
      const id = item?.datum?.record_id;
      if (state.pointer || !id || !currentRows().some(row => row.record_id === id) || state.hover === id) return;
      state.hover = id; renderDetails(); updateHighlight();
    });
    state.view.addEventListener('mouseout', (_event, item) => {
      if (!item?.datum?.record_id) return;
      state.hover = null; renderDetails(); updateHighlight();
    });
    state.view.addEventListener('click', (_event, item) => {
      const id = item?.datum?.record_id;
      if (state.dragged || !id || !currentRows().some(row => row.record_id === id)) return;
      state.pinned = id; state.hover = null; renderDetails(); updateHighlight();
    });
    const unknown = model.valid.filter(row => row.sex === null).length;
    $('missing-note').textContent = `原始 ${model.rows.length} 条记录，${model.excluded} 条缺少鳍长或体重。默认保留性别未记录但测量有效的 ${unknown} 条记录；不填补缺失，不自动删除极端值。`;
    state.loading = false; setControls(true); $('load-state').hidden = true;
    refresh();
  } catch (error) { showFailure(error); }
}

$('filters').addEventListener('submit', event => event.preventDefault());
checks.forEach(input => input.addEventListener('change', refresh));
$('sex').addEventListener('change', refresh);
$('select-all').addEventListener('click', () => { checks.forEach(input => { input.checked = true; }); refresh(); });
$('reset').addEventListener('click', reset);
$('empty-all').addEventListener('click', () => {
  if (selection().length) reset();
  else { checks.forEach(input => { input.checked = true; }); refresh(); }
});
$('clear-detail').addEventListener('click', () => { state.pinned = null; state.hover = null; renderDetails(); updateHighlight(); });
$('data-disclosure').addEventListener('toggle', renderRecords);
$('retry').addEventListener('click', () => { if (!window.vegaEmbed) window.location.reload(); else load(); });
$('clear-brush').addEventListener('click', () => setBrush(null));
$('range-form').addEventListener('submit', event => {
  event.preventDefault();
  const x = [$('flipper-min').valueAsNumber, $('flipper-max').valueAsNumber];
  const y = [$('mass-min').valueAsNumber, $('mass-max').valueAsNumber];
  if (![...x, ...y].every(Number.isFinite) || x[0] >= x[1] || y[0] >= y[1] || x[0] < 170 || x[1] > 235 || y[0] < 2500 || y[1] > 6500) {
    $('range-error').textContent = '下限须小于上限；鳍长范围为 170—235 mm，体重范围为 2500—6500 g。';
    return;
  }
  $('range-error').textContent = '';
  setBrush({ flipper_length_mm: x, body_mass_g: y });
});
$('chart').addEventListener('pointerdown', event => {
  state.pointer = { x: event.clientX, y: event.clientY }; state.dragged = false;
  state.hover = null; renderDetails();
});
window.addEventListener('pointerup', event => {
  if (state.pointer) state.dragged = Math.hypot(event.clientX - state.pointer.x, event.clientY - state.pointer.y) > 4;
  state.pointer = null;
}, true);
window.addEventListener('pointercancel', () => { state.pointer = null; state.dragged = false; });

const chartObserver = new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderQueue = renderQueue.then(async () => {
      if (!state.view) return;
      const range = state.range;
      const width = Math.max(230, Math.floor($('chart').getBoundingClientRect().width));
      const { height } = chartSpec(width);
      state.syncBrush = true;
      try {
        state.view.width(width).height(height).resize();
        await state.view.runAsync();
        writeBrush(state.view, range); await state.view.runAsync();
      } finally { state.syncBrush = false; }
      commitBrush(state.view.signal('region'));
      if (state.histogram) {
        state.histogram.width(Math.max(230, Math.floor($('mass-chart').getBoundingClientRect().width))).resize();
        await state.histogram.runAsync();
      }
    }).catch(error => showFailure(error));
  }, 100);
});
// Both chart containers can change width independently at the responsive breakpoint.
chartObserver.observe($('chart'));
chartObserver.observe($('mass-chart'));

load();
