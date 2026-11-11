import { SPECIES, SEX_LABELS } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, selectedRows, summarizePlot } from './bubble-model.js?v=bonus-20261112d';
import { validateView, cohortComparison } from './bonus-model.js?v=bonus-20261112d';

export function llmViewKey(view) { return JSON.stringify(validateView(view)); }
export function llmEvidence(rows, input, fingerprint) {
  const view = validateView(input), chosen = selectedRows(rows, view.scope);
  const measurement = field => {
    const values = chosen.map(row => row[field]).filter(Number.isFinite);
    return { field, label: BUBBLE_FIELDS[field].label, unit: BUBBLE_FIELDS[field].unit, n: values.length, mean: values.length ? values.reduce((a,b) => a+b,0)/values.length : null };
  };
  const summary = records => ({ body: summarizePlot(records, 'body'), bill: summarizePlot(records, 'bill') });
  const cohorts = cohortComparison(rows, view.scope, view.plot, view.distributionMetric);
  return {
    dataset: 'Palmer penguins', sourceFingerprint: fingerprint, rawN: 344, validN: rows.length,
    view, selected: { ...summary(chosen), measurements: Object.keys(BUBBLE_FIELDS).map(measurement), species: SPECIES.map(s => ({ id:s.id, name:s.name, ...summary(chosen.filter(row => row.species === s.id)) })) },
    referenceN: cohorts.referenceN, remainder: { n:cohorts.rest.n, ...summary(cohorts.rest.rows) },
    limitations: ['仅描述性相关，不推断因果或统计显著性。','总体相关包含物种构成差异，不能代替组内关系。','年份间是不同样本，不是同一个体的成长轨迹。','框选和范围限制本身会影响相关系数。'],
  };
}

export function validateLlmReply(input) {
  if (!input || typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 4000 || !Array.isArray(input.followUps) || input.followUps.length > 3 || input.followUps.some(q => typeof q !== 'string' || !q.trim() || q.length > 180)) throw new Error('模型返回的回答格式不完整，请重新提问。');
  let proposal = null;
  if (input.proposal !== null) {
    if (!input.proposal || typeof input.proposal.label !== 'string' || !input.proposal.label.trim() || input.proposal.label.length > 160) throw new Error('模型建议缺少有效说明。');
    proposal = { label:input.proposal.label, view:validateView(input.proposal.view) };
  }
  return { answer:input.answer, followUps:[...input.followUps], proposal };
}

export function llmConnectionURL(value) {
  const url = new URL(value);
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname.endsWith('/chat/completions')) throw new Error('请填写自己的 HTTPS 助手后端地址，不是 DeepSeek 官方 API 地址；密钥只配置在服务端。');
  return url.href;
}

export function describeLlmView(view) {
  const scope = view.scope, p = PLOT_VIEWS[view.plot];
  return `${p.title} · ${scope.allYears?'2007—2009':scope.year} · ${scope.species.map(id => SPECIES.find(s=>s.id===id).name).join('、')||'无物种'} · ${SEX_LABELS[scope.sex]} · ${scope.island==='all'?'全部岛屿':scope.island}${scope.range?' · 含范围框选':''}`;
}
