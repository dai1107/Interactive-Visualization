import { SPECIES, SEX_LABELS, parsePenguins, filterPenguins, pearson, correlationReason } from './data.js';
import { chartSpec } from './chart.js';

const $ = id => document.getElementById(id);
const checks = [...document.querySelectorAll('input[name="species"]')];
const state = { model: null, filtered: [], view: null, pinned: null, hover: null, loading: false };
let renderQueue = Promise.resolve();
let resizeTimer;
const dataURL = new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url);
const formatR = r => r === null ? '不可计算' : r.toFixed(3);
const speciesName = id => SPECIES.find(s => s.id === id)?.name || id;
const sexName = sex => SEX_LABELS[sex ?? 'unknown'];
const selection = () => checks.filter(input => input.checked).map(input => input.value);

function textCell(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

function queueChart(rows = state.filtered) {
  const snapshot = [...rows];
  renderQueue = renderQueue.then(async () => {
    if (!state.view) return;
    const current = state.hover || state.pinned;
    const highlight = current ? snapshot.filter(row => row.record_id === current) : [];
    state.view.change('points', window.vega.changeset().remove(() => true).insert(snapshot));
    state.view.change('focus', window.vega.changeset().remove(() => true).insert(highlight));
    await state.view.runAsync();
  }).catch(error => showFailure(error));
  return renderQueue;
}

function updateHighlight() {
  renderQueue = renderQueue.then(async () => {
    if (!state.view) return;
    const id = state.hover || state.pinned;
    state.view.change('focus', window.vega.changeset().remove(() => true).insert(state.filtered.filter(row => row.record_id === id)));
    await state.view.runAsync();
  }).catch(error => showFailure(error));
}

function renderDetails() {
  const id = state.hover || state.pinned;
  const record = state.filtered.find(row => row.record_id === id);
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
  $('table-count').textContent = `（${state.filtered.length} 条）`;
  if (!$('data-disclosure').open) return;
  const fragment = document.createDocumentFragment();
  for (const row of state.filtered) {
    const tr = document.createElement('tr');
    [row.record_id, `${speciesName(row.species)} ${row.species}`, sexName(row.sex), row.flipper_length_mm, row.body_mass_g, row.island, row.year].forEach(value => tr.append(textCell('td', value)));
    fragment.append(tr);
  }
  if (!state.filtered.length) {
    const tr = document.createElement('tr'), td = textCell('td', '当前条件没有有效记录。');
    td.colSpan = 7; tr.append(td); fragment.append(tr);
  }
  $('record-rows').replaceChildren(fragment);
}

function refresh() {
  if (!state.model || state.loading) return;
  const species = selection(), sex = $('sex').value;
  state.filtered = filterPenguins(state.model.valid, species, sex);
  state.hover = null;
  $('notice').textContent = '';
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

  const fragment = document.createDocumentFragment();
  for (const item of SPECIES) {
    const included = species.includes(item.id), rows = state.filtered.filter(row => row.species === item.id);
    const tr = document.createElement('tr');
    if (!included) tr.className = 'inactive';
    const label = document.createElement('th'); label.scope = 'row';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.backgroundColor = item.color; dot.setAttribute('aria-hidden', 'true');
    const english = textCell('small', item.id);
    label.append(dot, document.createTextNode(item.name), english);
    tr.append(label, textCell('td', included ? rows.length : '未选择'), textCell('td', included ? formatR(pearson(rows)) : '—'));
    fragment.append(tr);
  }
  $('group-stats').replaceChildren(fragment);
  renderRecords(); renderDetails();
  queueChart();
}

function reset() {
  checks.forEach(input => { input.checked = true; });
  $('sex').value = 'all'; state.pinned = null; state.hover = null;
  refresh();
}

function setControls(enabled) {
  $('species-controls').disabled = !enabled;
  $('sex-controls').disabled = !enabled;
  $('reset').disabled = !enabled;
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
  state.model = null; state.filtered = []; state.pinned = null; state.hover = null;
  $('sample-count').textContent = '—'; $('correlation').textContent = '—';
  $('sample-base').textContent = '等待数据重新加载';
  $('correlation-note').textContent = ''; $('notice').textContent = '';
  $('condition-summary').textContent = '数据尚未加载成功'; $('empty-state').hidden = true;
  $('group-stats').replaceChildren(); $('record-rows').replaceChildren();
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
    state.view.addEventListener('mouseover', (_event, item) => {
      const id = item?.datum?.record_id;
      if (!id || !state.filtered.some(row => row.record_id === id) || state.hover === id) return;
      state.hover = id; renderDetails(); updateHighlight();
    });
    state.view.addEventListener('mouseout', (_event, item) => {
      if (!item?.datum?.record_id) return;
      state.hover = null; renderDetails(); updateHighlight();
    });
    state.view.addEventListener('click', (_event, item) => {
      const id = item?.datum?.record_id;
      if (!id || !state.filtered.some(row => row.record_id === id)) return;
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

new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderQueue = renderQueue.then(async () => {
      if (!state.view) return;
      const width = Math.max(230, Math.floor($('chart').getBoundingClientRect().width));
      const { height } = chartSpec(width);
      state.view.width(width).height(height).resize();
      await state.view.runAsync();
    }).catch(error => showFailure(error));
  }, 100);
}).observe($('chart'));

load();
