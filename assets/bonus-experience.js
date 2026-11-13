import { setActivePage, setActiveInspector } from './layout.js?v=editorial-20261113b';
import { SPECIES } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, selectedRows, summarizePlot } from './bubble-model.js?v=editorial-20261113b';
import { DISCOVERY_STEPS, discoveryView, cohortComparison, explorationRecord, validateNotebook, notebookPayload, recordMarkdown } from './bonus-model.js?v=editorial-20261113b';
import { drawCohortDistribution, drawCohortComposition } from './bonus-charts.js?v=editorial-20261113b';

export function createBonusExperience({ rows, fingerprint, getView, applyView, captureOrigin, restoreOrigin, sexComparison, announce, onSelectRange }) {
  const find = id => document.getElementById(id);
  const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const formatR = value => value === null ? '不可计算' : value.toFixed(3);
  let step = null, origin = null, records = [], deleted = null;
  const storageKey = 'penguin-exploration-notebook-v1';
  function exportFile(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), link = make('a');
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function leaveGuide() { if (step !== null) { step = null; renderGuide(); } }
  function renderGuide() {
    find('discovery').hidden = step === null;
    find('discovery-compare').hidden = step !== 4;
    find('discovery-title').textContent = step === null ? '从总体到局部，走一遍发现过程' : `${step + 1} / 5 · ${DISCOVERY_STEPS[step].title}`;
    find('discovery-question').textContent = step === null ? '点击开始，将依次比较总体、喙部、单一物种、局部范围和雌雄。手动调整即可转入自由探索；随时可恢复开始前的条件与 A/B 组。' : DISCOVERY_STEPS[step].question;
    find('discovery-prev').disabled = step === null || step === 0;
    find('discovery-next').disabled = step === null || step === 4;
    find('discovery-free').hidden = step === null;
    find('discovery-restore').hidden = !origin;
    find('discovery-start').textContent = origin ? '重新开始' : '开始发现之旅 →';
    find('discovery-steps').querySelectorAll('button').forEach((button, i) => { button.setAttribute('aria-current', i === step ? 'step' : 'false'); });
    if (rows().length) {
      const view = getView(), stats = summarizePlot(selectedRows(rows(), view.scope), view.plot);
      find('discovery-status').textContent = `${step === null ? '自由探索' : '当前步骤'} · ${PLOT_VIEWS[view.plot].title} · n=${stats.n} · r=${formatR(stats.r)}`;
    }
  }
  function go(index) {
    if (!origin) origin = captureOrigin();
    step = index;
    setActivePage('explore');
    setActiveInspector(index === 3 ? 'distribution' : 'relation');
    applyView(discoveryView(index));
    if (DISCOVERY_STEPS[index].compareSex) sexComparison(false);
    renderGuide(); announce(`已进入发现之旅第 ${index + 1} 步：${DISCOVERY_STEPS[index].title}`);
  }
  function render() {
    renderGuide();
    const view = getView(), comparison = cohortComparison(rows(), view.scope, view.plot, view.distributionMetric);
    find('distribution-metric').value = view.distributionMetric;
    find('cohort-caption').textContent = `${comparison.yearLabel} 的全部 ${comparison.referenceN} 条有效观测 = 选中 ${comparison.selected.n} 条 + 其余 ${comparison.rest.n} 条。参照范围不受物种、性别、岛屿筛选限制；两组没有重合。`;
    find('cohort-summary').textContent = `选中 r=${formatR(comparison.selected.r)}；其余 r=${formatR(comparison.rest.r)}（${PLOT_VIEWS[view.plot].title}）。${comparison.rest.n ? '' : '当前已选择全部参照样本，没有其余组可比较。'}`;
    drawCohortDistribution(find('cohort-distribution'), comparison, onSelectRange);
    drawCohortComposition(find('cohort-composition'), comparison);
    find('notebook-capture').disabled = !comparison.selected.n || records.length >= 20;
    find('discovery-record').disabled = !comparison.selected.n || records.length >= 20;
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(notebookPayload(records, fingerprint()))); find('notebook-storage').textContent = '记录已保存在本浏览器。可导出 JSON 备份，换设备后导入；不会上传到服务器。'; }
    catch { find('notebook-storage').textContent = '浏览器保存不可用，本次会话仍可使用。请导出 JSON 备份。'; }
  }
  function renderNotebook() {
    find('notebook-count').textContent = `${records.length} / 20 条`;
    find('notebook-list').replaceChildren();
    if (!records.length) find('notebook-list').append(make('p', '还没有记录。调整条件后，写下你的观察并保存。'));
    records.forEach(record => {
      const card = make('article'), heading = make('h3', record.title), stats = summarizePlot(selectedRows(rows(), record.view.scope), record.view.plot);
      card.className = 'notebook-card';
      card.append(heading, make('p', `${PLOT_VIEWS[record.view.plot].title} · n=${stats.n} · r=${formatR(stats.r)} · ${new Date(record.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）`), make('p', record.notes || '未填写观察'));
      const restore = make('button', '恢复这次探索'), remove = make('button', '删除记录');
      restore.className = 'outline-button'; remove.className = 'text-button';
      restore.addEventListener('click', () => { leaveGuide(); setActivePage('explore'); applyView(record.view); announce('已恢复探索条件，统计由原始数据重新计算。'); find('explorer').scrollIntoView({ block: 'start' }); });
      remove.addEventListener('click', () => { deleted = { record, index: records.indexOf(record) }; records = records.filter(r => r.id !== record.id); persist(); renderNotebook(); render(); });
      card.append(restore, remove); find('notebook-list').append(card);
    });
    find('notebook-undo').hidden = !deleted;
    for (const id of ['notebook-json', 'notebook-markdown']) find(id).disabled = !records.length;
  }
  function capture() {
    try {
      if (records.length >= 20) throw new Error('已达20条，请先导出备份或删除部分记录。');
      records.push(explorationRecord(rows(), getView(), fingerprint(), { title: find('notebook-title').value.trim() || (step === null ? PLOT_VIEWS[getView().plot].title : DISCOVERY_STEPS[step].title), notes: find('notebook-notes').value.trim() }));
      persist(); renderNotebook(); render(); find('notebook-title').value = ''; find('notebook-notes').value = ''; find('notebook').open = true; setActivePage('notebook');
      find('notebook-message').textContent = '已记录当前筛选、视角、编码和样本编号。'; announce('探索记录已保存。');
    } catch (error) { find('notebook-message').textContent = error.message; }
  }
  function initialize() {
    DISCOVERY_STEPS.forEach((item, i) => { const button = make('button', `${i + 1} ${item.title}`); button.addEventListener('click', () => go(i)); find('discovery-steps').append(button); });
    find('discovery-start').addEventListener('click', () => go(0));
    find('discovery-prev').addEventListener('click', () => { if (step > 0) go(step - 1); });
    find('discovery-next').addEventListener('click', () => { if (step !== null && step < 4) go(step + 1); });
    find('discovery-free').addEventListener('click', leaveGuide);
    find('discovery-restore').addEventListener('click', () => { if (!origin) return; const previous = origin; origin = null; step = null; setActivePage('explore'); restoreOrigin(previous); renderGuide(); announce('已恢复开始前的条件与 A/B 组。'); });
    find('discovery-record').addEventListener('click', capture);
    find('cohort-example').addEventListener('click', () => { leaveGuide(); const view = getView(), p = PLOT_VIEWS[view.plot]; view.mode = 'individual'; delete view.scope.selection; view.scope.range = { [p.x]: [...p.defaults[0]], [p.y]: [...p.defaults[1]] }; applyView(view); });
    find('distribution-metric').addEventListener('change', e => { const view = getView(); view.distributionMetric = e.target.value; applyView(view, true); });
    SPECIES.forEach(group => { const label = make('span'), swatch = make('i'); swatch.className = 'swatch'; swatch.style.background = group.color; label.append(swatch, document.createTextNode(group.name)); find('cohort-legend').append(label); });
    find('notebook-capture').addEventListener('click', capture);
    find('notebook-undo').addEventListener('click', () => { if (!deleted || records.length >= 20) return; records.splice(deleted.index, 0, deleted.record); deleted = null; persist(); renderNotebook(); render(); });
    find('notebook-json').addEventListener('click', () => exportFile(JSON.stringify(notebookPayload(records, fingerprint()), null, 2), 'penguins-exploration.json', 'application/json'));
    find('notebook-markdown').addEventListener('click', () => exportFile(records.map(r => recordMarkdown(r, rows())).join('\n\n---\n\n'), 'penguins-exploration.md', 'text/markdown;charset=utf-8'));
    find('notebook-import').addEventListener('change', async e => {
      try {
        const file = e.target.files[0]; if (!file) return;
        if (file.size > 2 * 1024 * 1024) throw new Error('文件不能超过2MB。');
        const imported = validateNotebook(JSON.parse(await file.text()), rows(), fingerprint());
        const existing = new Set(records.map(r => r.id)), additions = imported.filter(r => !existing.has(r.id));
        if (records.length + additions.length > 20) throw new Error('合并后超过20条，请先导出备份或删除部分记录。');
        records.push(...additions); persist(); renderNotebook(); render(); find('notebook-message').textContent = `已导入 ${additions.length} 条；同编号记录保留本地版本。统计已用当前原始数据复核。`;
      } catch (error) { find('notebook-message').textContent = '导入失败：' + error.message; }
      finally { e.target.value = ''; }
    });
    try { const stored = localStorage.getItem(storageKey); if (stored) records = validateNotebook(JSON.parse(stored), rows(), fingerprint()); find('notebook-storage').textContent = '记录保存在本浏览器，不会上传服务器；建议导出 JSON 备份。'; }
    catch { find('notebook-storage').textContent = '没有载入本地记录。可从匹配当前数据版本的 JSON 备份导入。'; }
    renderNotebook(); render();
  }
  return { initialize, render, leaveGuide, go };
}
