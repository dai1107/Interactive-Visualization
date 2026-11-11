import { SPECIES } from './data.js';

export function chartSpec(width) {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width, height: width < 480 ? 290 : Math.min(420, Math.max(340, width * .53)),
    autosize: { type: 'fit', contains: 'padding', resize: true },
    background: 'transparent', padding: { left: 4, right: 12, top: 8, bottom: 5 },
    datasets: { points: [], focus: [], annotations: [], trends: [] },
    encoding: {
      x: { field: 'flipper_length_mm', type: 'quantitative', title: '鳍长 / mm', scale: { domain: [170, 235], nice: false, zero: false }, axis: { values: width < 480 ? [170, 190, 210, 235] : [170, 180, 190, 200, 210, 220, 235], labelOverlap: 'greedy', labelFlush: false } },
      y: { field: 'body_mass_g', type: 'quantitative', title: '体重 / g', scale: { domain: [2500, 6500], nice: false, zero: false }, axis: { values: [2500, 3500, 4500, 5500, 6500], format: 'd' } },
    },
    layer: [
      {
        name: 'observations', data: { name: 'points' },
        params: [{ name: 'region', select: { type: 'interval', encodings: ['x', 'y'], on: "[pointerdown[!event.item || event.item.mark.marktype !== 'symbol'], window:pointerup] > window:pointermove!", translate: false, zoom: false, clear: 'dblclick', mark: { fill: '#386c5f', fillOpacity: .08, stroke: '#386c5f', strokeWidth: 1.5 } } }],
        mark: { type: 'circle', size: 65, cursor: 'pointer', aria: false },
        encoding: {
          color: { field: 'species', type: 'nominal', scale: { domain: [...SPECIES.map(s => s.id), 'overall'], range: [...SPECIES.map(s => s.color), '#243c38'] }, legend: null },
          opacity: { condition: { param: 'region', value: .75 }, value: .12 },
        },
      },
      {
        name: 'trendLines', data: { name: 'trends' },
        mark: { type: 'line', strokeWidth: 2.3, clip: true, aria: false },
        encoding: {
          color: { field: 'series', type: 'nominal', scale: { domain: [...SPECIES.map(s => s.id), 'overall'], range: [...SPECIES.map(s => s.color), '#243c38'] }, legend: null },
          detail: { field: 'series' },
          strokeDash: { field: 'kind', type: 'nominal', scale: { domain: ['overall', 'species'], range: [[7, 5], [1, 0]] }, legend: null },
        },
      },
      {
        name: 'activePoint', data: { name: 'focus' },
        mark: { type: 'circle', size: 150, fillOpacity: 0, stroke: '#243c38', strokeWidth: 2, aria: false },
      },
      {
        name: 'groupMeans', data: { name: 'annotations' },
        mark: { type: 'point', shape: 'diamond', filled: true, size: 110, color: '#243c38', stroke: '#fffefa', strokeWidth: 1.5, aria: false },
      },
      {
        name: 'meanLabels', data: { name: 'annotations' },
        mark: { type: 'text', align: { expr: "datum.flipper_length_mm < 195 ? 'left' : 'right'" }, dx: { expr: 'datum.flipper_length_mm < 195 ? 10 : -10' }, dy: { expr: "datum.species === 'Adelie' ? 18 : -14" }, font: 'Segoe UI, Microsoft YaHei, sans-serif', fontSize: 11, fontWeight: 600, color: '#243c38', aria: false },
        encoding: { text: { field: 'label' } },
      },
    ],
    config: {
      view: { stroke: null },
      axis: { labelFont: 'Segoe UI, Microsoft YaHei, sans-serif', titleFont: 'Segoe UI, Microsoft YaHei, sans-serif', labelFontSize: 11, titleFontSize: 12, titleFontWeight: 'normal', labelColor: '#586961', titleColor: '#586961', domainColor: '#c7cfc5', tickColor: '#c7cfc5', gridColor: '#e8ebe3', gridOpacity: 1, titlePadding: 15, labelPadding: 7, tickSize: 3 },
    },
  };
}

export function comparisonScatterSpec(width) {
  const spec = chartSpec(width);
  spec.height = 250;
  spec.layer = spec.layer.filter(layer => ['observations', 'trendLines'].includes(layer.name));
  // Saved groups are snapshots. Brushing remains in the main exploration chart.
  delete spec.layer[0].params;
  spec.layer[0].mark.cursor = 'default';
  spec.layer[0].encoding.opacity = { value: .65 };
  return spec;
}

export function comparisonHistogramSpec(width) {
  const spec = histogramSpec(width);
  spec.encoding.x.title = '体重 / g（每格 250 g）';
  spec.layer = [
    { mark: { type: 'bar', color: '#3562a6', opacity: .42, binSpacing: 3, aria: false }, encoding: { y: { field: 'a_share', type: 'quantitative', title: '组内占比', scale: { zero: true }, axis: { format: '.0%' } } } },
    { mark: { type: 'bar', color: '#b24b2f', opacity: .52, binSpacing: 3, aria: false }, encoding: { y: { field: 'b_share', type: 'quantitative', title: '组内占比' } } },
  ];
  return spec;
}

// Set the same native Vega-Lite interval used by pointer brushing.
// Use pixel signals so the visual rectangle, selection store and dimming agree.
export function writeBrush(view, range) {
  view.signal('region_x', range ? range.flipper_length_mm.map(view.scale('x')).sort((a, b) => a - b) : []);
  view.signal('region_y', range ? range.body_mass_g.map(view.scale('y')).sort((a, b) => a - b) : []);
}

export function histogramSpec(width) {
  const spec = chartSpec(width);
  return {
    $schema: spec.$schema, width, height: 220,
    autosize: spec.autosize, background: 'transparent', padding: spec.padding,
    datasets: { distribution: [] }, data: { name: 'distribution' },
    encoding: {
      x: { field: 'start', bin: 'binned', type: 'quantitative', title: '体重 / g', scale: { domain: [2500, 6500], nice: false }, axis: { values: [2500, 3500, 4500, 5500, 6500], format: 'd', labelOverlap: 'greedy' } },
      x2: { field: 'end' },
    },
    layer: [
      { mark: { type: 'bar', color: '#cbd3c9', binSpacing: 3, aria: false }, encoding: { y: { field: 'baseline_count', type: 'quantitative', title: '记录数', scale: { zero: true, domainMin: 0 }, axis: { tickMinStep: 1, format: 'd' } } } },
      { mark: { type: 'bar', color: '#386c5f', opacity: .9, binSpacing: 3, aria: false }, encoding: { y: { field: 'selected_count', type: 'quantitative', title: '记录数' } } },
    ],
    config: spec.config,
  };
}
