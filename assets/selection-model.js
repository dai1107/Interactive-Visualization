// Ordered set operations over original record IDs. Filters always define the universe.
export const SELECTION_OPERATIONS = { replace: '替换', union: '加选', intersect: '交集', subtract: '减选' };
const selectionDomains = { flipper_length_mm: [170, 235], body_mass_g: [2500, 6500], bill_length_mm: [30, 60], bill_depth_mm: [13, 22] };

export function copySelection(rules = []) {
  return rules.map(rule => ({ ...rule, ...(rule.ids ? { ids: [...rule.ids] } : { range: Object.fromEntries(Object.entries(rule.range).map(([field, extent]) => [field, [...extent]])), exclusive: [...(rule.exclusive || [])] }) }));
}

export function validateSelection(rules) {
  if (!Array.isArray(rules) || rules.length > 12) throw new Error('最多保留12步选择，请先清除或保存当前探索。');
  return rules.map(rule => {
    if (!rule || !Object.hasOwn(SELECTION_OPERATIONS, rule.op) || typeof rule.label !== 'string' || rule.label.length > 120) throw new Error('选择操作或说明无效。');
    if (rule.kind === 'ids') {
      if (!Array.isArray(rule.ids) || rule.ids.length > 344 || new Set(rule.ids).size !== rule.ids.length || rule.ids.some(id => !/^P\d{3}$/.test(id) || +id.slice(1) < 1 || +id.slice(1) > 344)) throw new Error('选择中的样本编号无效。');
      return { kind: 'ids', op: rule.op, label: rule.label, ids: [...rule.ids] };
    }
    if (rule.kind !== 'range' || !rule.range || !Object.keys(rule.range).length || Object.keys(rule.range).length > 4) throw new Error('选择范围无效。');
    for (const [field, extent] of Object.entries(rule.range)) {
      const domain = selectionDomains[field];
      if (!domain || !Array.isArray(extent) || extent.length !== 2 || !extent.every(Number.isFinite) || extent[0] >= extent[1] || extent[0] < domain[0] || extent[1] > domain[1]) throw new Error('选择范围超出数据坐标。');
    }
    if (rule.exclusive !== undefined && (!Array.isArray(rule.exclusive) || rule.exclusive.some(field => !Object.hasOwn(rule.range, field)))) throw new Error('选择边界无效。');
    return copySelection([{ ...rule, exclusive: rule.exclusive || [] }])[0];
  });
}

export function selectByRules(rows, rules = []) {
  if (!rules.length) return rows;
  let chosen = new Set(['subtract', 'intersect'].includes(rules[0].op) ? rows.map(row => row.record_id) : []);
  for (const rule of rules) {
    const hits = new Set(rule.kind === 'ids' ? rule.ids : rows.filter(row => Object.entries(rule.range).every(([field, [lo, hi]]) => Number.isFinite(row[field]) && row[field] >= lo && ((rule.exclusive || []).includes(field) ? row[field] < hi : row[field] <= hi))).map(row => row.record_id));
    if (rule.op === 'replace') chosen = hits;
    if (rule.op === 'union') chosen = new Set([...chosen, ...hits]);
    if (rule.op === 'subtract') chosen = new Set([...chosen].filter(id => !hits.has(id)));
    if (rule.op === 'intersect') chosen = new Set([...chosen].filter(id => hits.has(id)));
  }
  return rows.filter(row => chosen.has(row.record_id));
}

export function hasSelection(scope) { return Boolean(scope.range || scope.selection?.length); }

export function compareSets(a, b) {
  const left = new Set(a.map(row => row.record_id)), right = new Set(b.map(row => row.record_id));
  const both = [...left].filter(id => right.has(id));
  return { intersection: both, union: [...new Set([...left, ...right])], aOnly: [...left].filter(id => !right.has(id)), bOnly: [...right].filter(id => !left.has(id)) };
}
