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
        params: [{ name: 'region', select: { type: 'interval', encodings: ['x', 'y'], on: "[pointerdown[!event.item || event.item.mark.marktype !== 'symbol'], window:pointerup] > window:pointermove!", translate: false, zoom: false, clear: 'dblclick', mark: { fill: '#386c5f', fillOpacity: .08, stroke: '#386c5f', strokeWidth: 1.5 } } }],
        mark: { type: 'circle', size: 65, cursor: 'pointer', aria: false },
        encoding: {
          color: { field: 'species', type: 'nominal', scale: { domain: SPECIES.map(s => s.id), range: SPECIES.map(s => s.color) }, legend: null },
          opacity: { condition: { param: 'region', value: .75 }, value: .12 },
        },
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
