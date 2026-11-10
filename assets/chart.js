import { SPECIES } from './data.js';

export function chartSpec(width) {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width, height: width < 480 ? 290 : Math.min(420, Math.max(340, width * .53)),
    autosize: { type: 'fit', contains: 'padding', resize: true },
    background: 'transparent', padding: { left: 4, right: 12, top: 8, bottom: 5 },
    datasets: { points: [], focus: [] },
    encoding: {
      x: { field: 'flipper_length_mm', type: 'quantitative', title: '鳍长 / mm', scale: { domain: [170, 235], nice: false, zero: false }, axis: { values: [170, 180, 190, 200, 210, 220, 230, 235], labelOverlap: 'greedy', labelFlush: false } },
      y: { field: 'body_mass_g', type: 'quantitative', title: '体重 / g', scale: { domain: [2500, 6500], nice: false, zero: false }, axis: { values: [2500, 3500, 4500, 5500, 6500], format: 'd' } },
    },
    layer: [
      {
        name: 'observations', data: { name: 'points' },
        mark: { type: 'circle', size: 65, opacity: .65, cursor: 'pointer', aria: false },
        encoding: { color: { field: 'species', type: 'nominal', scale: { domain: SPECIES.map(s => s.id), range: SPECIES.map(s => s.color) }, legend: null } },
      },
      {
        name: 'activePoint', data: { name: 'focus' },
        mark: { type: 'circle', size: 150, fillOpacity: 0, stroke: '#243c38', strokeWidth: 2, aria: false },
      },
    ],
    config: {
      view: { stroke: null },
      axis: { labelFont: 'Segoe UI, Microsoft YaHei, sans-serif', titleFont: 'Segoe UI, Microsoft YaHei, sans-serif', labelFontSize: 10, titleFontSize: 11, titleFontWeight: 'normal', labelColor: '#687671', titleColor: '#687671', domainColor: '#c7cfc5', tickColor: '#c7cfc5', gridColor: '#e8ebe3', gridOpacity: 1, titlePadding: 15, labelPadding: 7, tickSize: 3 },
    },
  };
}
