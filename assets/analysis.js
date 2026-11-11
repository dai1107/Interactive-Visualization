import { SPECIES, normalizeBrush, summarize, massBins } from './data.js';

// Least-squares lines stop at the observed x extent; no extrapolated endpoints.
export function linearFit(rows) {
  if (rows.length < 3) return null;
  const meanX = rows.reduce((sum, row) => sum + row.flipper_length_mm, 0) / rows.length;
  const meanY = rows.reduce((sum, row) => sum + row.body_mass_g, 0) / rows.length;
  let xx = 0, xy = 0;
  for (const row of rows) {
    const dx = row.flipper_length_mm - meanX;
    xx += dx * dx;
    xy += dx * (row.body_mass_g - meanY);
  }
  if (!xx) return null;
  const slope = xy / xx, intercept = meanY - slope * meanX;
  const extent = [Math.min(...rows.map(row => row.flipper_length_mm)), Math.max(...rows.map(row => row.flipper_length_mm))];
  return { n: rows.length, slope, intercept, extent };
}

export function trendSegments(rows, mode = 'both') {
  const groups = [];
  if (['overall', 'both'].includes(mode)) groups.push({ id: 'overall', rows });
  if (['species', 'both'].includes(mode)) {
    for (const species of SPECIES) groups.push({ id: species.id, rows: rows.filter(row => row.species === species.id) });
  }
  return groups.flatMap(group => {
    const fit = linearFit(group.rows);
    return fit ? fit.extent.map(x => ({ series: group.id, kind: group.id === 'overall' ? 'overall' : 'species', flipper_length_mm: x, body_mass_g: fit.intercept + fit.slope * x })) : [];
  });
}

export function captureSelection(rows, scope) {
  return {
    rows: rows.map(row => ({ ...row })),
    scope: { species: [...scope.species], sex: scope.sex, range: normalizeBrush(scope.range) },
  };
}

export function comparisonSummary(rows) {
  return { ...summarize(rows), meanFlipper: rows.length ? rows.reduce((sum, row) => sum + row.flipper_length_mm, 0) / rows.length : null };
}

export function comparisonBins(a, b) {
  return massBins(a, b).map(bin => ({ ...bin, a_share: a.length ? bin.baseline_count / a.length : 0, b_share: b.length ? bin.selected_count / b.length : 0 }));
}

export function overlapCount(a, b) {
  const ids = new Set(a.map(row => row.record_id));
  return new Set(b.filter(row => ids.has(row.record_id)).map(row => row.record_id)).size;
}
