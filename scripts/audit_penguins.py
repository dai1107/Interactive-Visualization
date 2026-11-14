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
    print(json.dumps({k: result[k] for k in ['row_count', 'duplicate_extra_rows', 'overall', 'by_species', 'by_species_and_sex', 'matches_previous_summary']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    run()
