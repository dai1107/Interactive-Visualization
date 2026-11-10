export const SPECIES = [
  { id: 'Adelie', name: '阿德利', color: '#0072B2' },
  { id: 'Chinstrap', name: '帽带', color: '#D55E00' },
  { id: 'Gentoo', name: '巴布亚', color: '#009E73' },
];
export const SEX_LABELS = { all: '全部（含未记录）', female: '雌性', male: '雄性', unknown: '未记录' };
const COLUMNS = ['species', 'island', 'bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'sex', 'year'];
const NUMERIC = ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g'];

// CSV state machine also handles quoted fields, escaped quotes, BOM and CRLF.
export function parseCSV(text) {
  const table = [];
  let row = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = !quoted; }
    } else if (ch === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(value => value !== '')) table.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV 中存在未闭合的引号。');
  row.push(cell.trim());
  if (row.some(value => value !== '')) table.push(row);
  return table;
}

export function parsePenguins(text) {
  const [columns, ...table] = parseCSV(text);
  if (!columns || COLUMNS.some(key => !columns.includes(key)) || new Set(columns).size !== columns.length) {
    throw new Error('数据格式不正确：缺少必需列或存在重复列。');
  }
  if (!table.length) throw new Error('数据文件没有观测记录。');
  const rows = table.map((values, index) => {
    if (values.length !== columns.length) throw new Error(`第 ${index + 2} 行的列数不正确。`);
    const row = Object.fromEntries(columns.map((key, i) => [key, ['', 'NA'].includes(values[i]) ? null : values[i]]));
    row.record_id = `P${String(index + 1).padStart(3, '0')}`;
    for (const key of [...NUMERIC, 'year']) {
      if (row[key] === null) continue;
      const value = Number(row[key]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${row.record_id} 的 ${key} 不是有效正数。`);
      row[key] = value;
    }
    if (!SPECIES.some(s => s.id === row.species)
      || !['Biscoe', 'Dream', 'Torgersen'].includes(row.island)
      || !['female', 'male', null].includes(row.sex)
      || !Number.isInteger(row.year)) throw new Error(`${row.record_id} 的物种、岛屿、性别或年份格式不正确。`);
    return row;
  });
  const valid = rows.filter(row => Number.isFinite(row.flipper_length_mm) && Number.isFinite(row.body_mass_g));
  return { rows, valid, excluded: rows.length - valid.length };
}

export function filterPenguins(rows, species, sex = 'all') {
  const selected = new Set(species);
  return rows.filter(row => selected.has(row.species)
    && (sex === 'all' || (sex === 'unknown' ? row.sex === null : row.sex === sex)));
}

export function pearson(rows) {
  if (rows.length < 3) return null;
  const n = rows.length;
  const mx = rows.reduce((sum, row) => sum + row.flipper_length_mm, 0) / n;
  const my = rows.reduce((sum, row) => sum + row.body_mass_g, 0) / n;
  let xy = 0, xx = 0, yy = 0;
  for (const row of rows) {
    const dx = row.flipper_length_mm - mx, dy = row.body_mass_g - my;
    xy += dx * dy; xx += dx * dx; yy += dy * dy;
  }
  const denominator = Math.sqrt(xx * yy);
  return denominator ? Math.max(-1, Math.min(1, xy / denominator)) : null;
}

export function correlationReason(rows) {
  if (rows.length < 3) return '至少需要 3 条有效记录才能显示相关系数。';
  if (pearson(rows) === null) return '当前鳍长或体重没有变化，相关系数不可计算。';
  return rows.length < 10 ? '样本较少，谨慎解释；此提示不代表显著性检验。' : '';
}

export function normalizeBrush(value) {
  const result = {};
  for (const field of ['flipper_length_mm', 'body_mass_g']) {
    const extent = value?.[field];
    if (!Array.isArray(extent) || extent.length !== 2 || !extent.every(Number.isFinite)) return null;
    const [lo, hi] = [...extent].sort((a, b) => a - b);
    if (lo === hi) return null;
    result[field] = [lo, hi];
  }
  return result;
}

export function brushRows(rows, range) {
  if (!range) return rows;
  return rows.filter(row => Object.entries(range).every(([field, [lo, hi]]) => row[field] >= lo && row[field] <= hi));
}

export function summarize(rows) {
  return { n: rows.length, r: pearson(rows), meanMass: rows.length ? rows.reduce((sum, row) => sum + row.body_mass_g, 0) / rows.length : null };
}

// Equal-width bins, [start,end) except the inclusive right edge of the last bin.
export function massBins(baseline, subset) {
  const bins = Array.from({ length: 16 }, (_, index) => ({ start: 2500 + index * 250, end: 2750 + index * 250, baseline_count: 0, selected_count: 0 }));
  for (const [rows, key] of [[baseline, 'baseline_count'], [subset, 'selected_count']]) {
    for (const row of rows) {
      if (row.body_mass_g < 2500 || row.body_mass_g > 6500) continue;
      bins[Math.min(15, Math.floor((row.body_mass_g - 2500) / 250))][key]++;
    }
  }
  return bins;
}
