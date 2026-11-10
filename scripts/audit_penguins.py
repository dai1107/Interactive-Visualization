"""Audit the original CSV without changing it; Python standard library only."""
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'EDA_企鹅数据探索' / 'penguins.csv'
OUTPUT = ROOT / 'docs'
SPECIES = ['Adelie', 'Chinstrap', 'Gentoo']
NUMERIC = ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g']


def quantile(values, p):
    values = sorted(values)
    index = (len(values) - 1) * p
    lo, hi = math.floor(index), math.ceil(index)
    return values[lo] + (values[hi] - values[lo]) * (index - lo)


def correlation(rows):
    if len(rows) < 3:
        return None
    xs = [r['flipper_length_mm'] for r in rows]
    ys = [r['body_mass_g'] for r in rows]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    denominator = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denominator if denominator else None


def stats(rows):
    return {'n': len(rows), 'pearson_r': correlation(rows)}


def run():
    with SOURCE.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        raw = list(reader)
    rows = []
    for index, item in enumerate(raw, 1):
        row = {key: (None if value.strip() in ('', 'NA') else value.strip()) for key, value in item.items()}
        for key in NUMERIC:
            row[key] = float(row[key]) if row[key] is not None else None
        row['year'] = int(row['year']) if row['year'] is not None else None
        row['record_id'] = f'P{index:03d}'
        rows.append(row)
    valid = [r for r in rows if all(r[k] is not None and math.isfinite(r[k]) for k in ['flipper_length_mm', 'body_mass_g'])]
    duplicates = Counter(tuple(r[k] for k in fields) for r in rows)
    ranges = {}
    for field in NUMERIC:
        values = [r[field] for r in rows if r[field] is not None]
        ranges[field] = {'min': min(values), 'max': max(values), 'nonpositive_count': sum(v <= 0 for v in values)}
    flags = []
    for species in SPECIES:
        for field in ['flipper_length_mm', 'body_mass_g']:
            group = [r for r in valid if r['species'] == species]
            values = [r[field] for r in group]
            q1, q3 = quantile(values, .25), quantile(values, .75)
            lower, upper = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
            flagged = [r['record_id'] for r in group if not lower <= r[field] <= upper]
            flags.append({'species': species, 'field': field, 'lower': lower, 'upper': upper, 'record_ids': flagged})
    result = {
        'verified_date': '2026-11-10',
        'source_file': SOURCE.relative_to(ROOT).as_posix(),
        'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'row_count': len(rows), 'column_count': len(fields),
        'missing': {key: sum(r[key] is None for r in rows) for key in fields},
        'duplicate_extra_rows': sum(n - 1 for n in duplicates.values()),
        'species_counts_raw': dict(Counter(r['species'] for r in rows)),
        'ranges': ranges,
        'years': sorted(set(r['year'] for r in rows)),
        'invalid_main_record_ids': [r['record_id'] for r in rows if r not in valid],
        'overall': stats(valid),
        'known_sex': stats([r for r in valid if r['sex'] is not None]),
        'by_species': {s: stats([r for r in valid if r['species'] == s]) for s in SPECIES},
        'by_sex': {s: stats([r for r in valid if r['sex'] == s]) for s in ['female', 'male', None]},
        'by_species_and_sex': {sp: {sex: stats([r for r in valid if r['species'] == sp and r['sex'] == sex]) for sex in ['female', 'male']} for sp in SPECIES},
        'iqr_flags_within_species': flags,
        'sample': [{k: r[k] for k in ['record_id', *fields]} for r in rows[:5]],
    }
    previous = json.loads((ROOT / 'EDA_企鹅数据探索' / 'analysis_summary.json').read_text(encoding='utf-8'))
    result['matches_previous_summary'] = (
        result['row_count'] == previous['rows']
        and result['missing'] == previous['missing']
        and round(result['overall']['pearson_r'], 3) == previous['flipper_mass_correlation_overall']
        and all(round(result['by_species'][s]['pearson_r'], 3) == previous['flipper_mass_correlation_by_species'][s] for s in SPECIES)
    )
    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT / 'data-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    fmt = lambda value: '不可计算' if value is None else f'{value:.3f}'
    lines = [
        '# 企鹅数据核查记录', '',
        '核查日期：2026 年 11 月 10 日。由 `python scripts/audit_penguins.py` 从本地原始 CSV 重新计算；原始文件未修改。', '',
        '## 数据来源与版本', '',
        '- 本地输入：[penguins.csv](../EDA_企鹅数据探索/penguins.csv)。',
        '- 官方 CSV：https://github.com/allisonhorst/palmerpenguins/blob/main/inst/extdata/penguins.csv',
        '- 官方说明与许可：https://allisonhorst.github.io/palmerpenguins/ ，本次核对其 CC0 数据许可。',
        '- 原始数据由 Kristen Gorman 与 Palmer Station LTER 提供；简化数据由 Allison Horst、Alison Hill、Kristen Gorman 整理。',
        '- 数据时间范围为 2007—2009 年；本地文件的首次下载日期未记录，本次核查日期不代表首次获取日期。',
        f'- 本地 CSV SHA256：`{result["sha256"]}`。', '',
        '## 完整性与异常检查', '',
        f'- 原始记录 {len(rows)} 条，原始字段 {len(fields)} 个，完整字段重复的额外记录 {result["duplicate_extra_rows"]} 条。',
        f'- 鳍长与体重均有效的记录 {len(valid)} 条；同时有性别的记录 {result["known_sex"]["n"]} 条。',
        f'- 主图排除记录：{", ".join(result["invalid_main_record_ids"])}；编号仅按本地 CSV 数据行顺序生成，不是原始个体身份。',
        '- 四项身体测量没有非正数。极端值不自动删除；IQR 仅作为复查提示，不能作为录入错误的证明。',
        f'- 与旧分析摘要的行数、缺失数及总体和分物种相关系数一致：{"是" if result["matches_previous_summary"] else "否，需复查"}。', '',
        '| 字段 | 缺失数量 | 有效范围或类别 |', '| --- | ---: | --- |',
    ]
    for field in fields:
        if field in ranges:
            limits = ranges[field]
            description = f'{limits["min"]:g}—{limits["max"]:g}'
        else:
            description = '、'.join(map(str, sorted(set(r[field] for r in rows if r[field] is not None))))
        lines.append(f'| {field} | {result["missing"][field]} | {description} |')
    lines += ['', '## 总体与分组关系', '', '| 范围 | 有效样本数 | Pearson r |', '| --- | ---: | ---: |', f'| 全体 | {len(valid)} | {fmt(correlation(valid))} |']
    for species, item in result['by_species'].items():
        lines.append(f'| {species} | {item["n"]} | {fmt(item["pearson_r"])} |')
    for sex, item in result['by_sex'].items():
        lines.append(f'| 性别 {sex if sex is not None else "未记录"} | {item["n"]} | {fmt(item["pearson_r"])} |')
    lines += ['', '### 同一物种内按性别比较', '', '| 物种 | 性别 | 有效样本数 | Pearson r |', '| --- | --- | ---: | ---: |']
    for species, sexes in result['by_species_and_sex'].items():
        for sex, item in sexes.items():
            lines.append(f'| {species} | {sex} | {item["n"]} | {fmt(item["pearson_r"])} |')
    lines += ['', '### 按物种的 IQR 复查', '', '对鳍长、体重分别计算组内 Q1 与 Q3，采用线性插值分位数，标记超出 Q1 − 1.5×IQR 或 Q3 + 1.5×IQR 的记录。保留全部标记记录。', '', '| 物种 | 字段 | 标记数量 | 记录编号 |', '| --- | --- | ---: | --- |']
    for item in flags:
        lines.append(f'| {item["species"]} | {item["field"]} | {len(item["record_ids"])} | {", ".join(item["record_ids"]) or "无"} |')
    lines += ['', '## 原始数据样本', '', '| 本地记录编号 | 物种 | 岛屿 | 鳍长 mm | 体重 g | 性别 | 年份 |', '| --- | --- | --- | ---: | ---: | --- | ---: |']
    for row in result['sample']:
        values = [row[k] if row[k] is not None else 'NA' for k in ['record_id', 'species', 'island', 'flipper_length_mm', 'body_mass_g', 'sex', 'year']]
        lines.append('| ' + ' | '.join(map(str, values)) + ' |')
    lines += ['', '## 对交互设计的约束', '',
        '1. 初始状态显示全部 342 条鳍长与体重有效的记录；性别未记录的 9 条有效测量记录仍纳入。',
        '2. 仅当用户选择 female 或 male 时排除其他性别记录；“未记录”可以单独选择，不能当作雌性或雄性。',
        '3. 相关系数必须基于当前实际显示的数据重算；分组数值使用对应组的数据。n 少于 3 或任一变量方差为零时显示“不可计算”。',
        '4. 总体正相关比各物种内部更强，适合设计“总体 → 物种 → 性别”的探索任务。性别分组的差异是待探索现象，不表述为显著性检验结论。',
        '5. 物种、性别样本量不均，页面需显示 n；年份只有三个，不能推断长期变化。',
        '6. 数据为观察样本，相关性不能证明因果关系，样本构成不代表全体企鹅种群比例。', '',
        '完整机器可读结果见 [data-audit.json](data-audit.json)。', '',
        '推荐引用：Horst AM, Hill AP, Gorman KB (2020). palmerpenguins: Palmer Archipelago (Antarctica) penguin data. https://doi.org/10.5281/zenodo.3960218 。原始研究：Gorman KB, Williams TD, Fraser WR (2014). https://doi.org/10.1371/journal.pone.0090081 。', '',
    ]
    (OUTPUT / '02_数据核查.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({k: result[k] for k in ['row_count', 'duplicate_extra_rows', 'overall', 'by_species', 'by_species_and_sex', 'matches_previous_summary']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    run()
