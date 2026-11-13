import { metricComparison } from './insight-model.js?v=editorial-20261113b';
const insightD3 = window.d3;

export function drawCorrelationLens(node, lens, onGroup = () => {}) {
  const d = insightD3, width = Math.max(300, node.parentElement.clientWidth), mobile = width < 500;
  const left = mobile ? 79 : 120, right = mobile ? 60 : 120;
  const rows = [{ name: '总体', ...lens.total, color: '#203b37', total: true }, ...lens.groups, { name: '组内合并', ...lens.within, color: '#8e6b45', within: true }];
  const height = rows.length * 49 + 56, x = d.scaleLinear().domain([-1, 1]).range([left, width - right]);
  const root = d.select(node).attr('viewBox', `0 0 ${width} ${height}`); root.selectAll('*').remove();
  root.append('title').text('相关性透镜：总体、各分组与减去组均值后的合并相关，统一使用负一到正一的刻度');
  root.append('rect').attr('x', x(-1)).attr('y', 12).attr('width', x(0) - x(-1)).attr('height', height - 49).attr('fill', '#f2ece3');
  root.append('rect').attr('x', x(0)).attr('y', 12).attr('width', x(1) - x(0)).attr('height', height - 49).attr('fill', '#edf0e7');
  root.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 12).attr('y2', height - 37).attr('stroke', '#b4c6bc').attr('stroke-dasharray', '3 4');
  rows.forEach((row, i) => {
    const y = 34 + i * 49, group = root.append('g');
    group.append('text').attr('x', 0).attr('y', y + 4).attr('class', 'lens-name').text(row.name);
    group.append('line').attr('x1', x(-1)).attr('x2', x(1)).attr('y1', y).attr('y2', y).attr('stroke', '#dce4db');
    if (row.r !== null) {
      if (!row.total && !row.within && lens.total.r !== null) group.append('line').attr('x1', x(lens.total.r)).attr('x2', x(row.r)).attr('y1', y).attr('y2', y).attr('stroke', row.color).attr('stroke-width', 3).attr('opacity', .38);
      group.append('circle').attr('cx', x(row.r)).attr('cy', y).attr('r', row.total || row.within ? 6 : 5).attr('fill', row.color).attr('stroke', '#fff').attr('stroke-width', 2);
    }
    group.append('text').attr('x', width - right + 10).attr('y', y + 4).attr('class', 'lens-value').text(row.r === null ? '不可计算' : row.r.toFixed(3));
    if (!mobile) group.append('text').attr('x', width - 2).attr('y', y + 4).attr('text-anchor', 'end').attr('class', 'lens-n').text(`n=${row.n}`);
    group.append('title').text(`${row.name}：n=${row.n}，r=${row.r === null ? '不可计算' : row.r.toFixed(3)}${row.within ? '；先分别减去各组均值，再合并计算' : ''}`);
    if (!row.total && !row.within) {
      group.attr('role', 'button').attr('tabindex', 0).attr('aria-label', `仅看${row.name}，${row.n}条，相关${row.r === null ? '不可计算' : row.r.toFixed(3)}`).attr('class', 'lens-group')
        .on('click', () => onGroup(row.id)).on('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGroup(row.id); } });
    }
  });
  root.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - 32})`).call(d.axisBottom(x).tickValues([-1, -.5, 0, .5, 1]).tickFormat(d.format('.1f')));
}

export function drawMetricComparison(node, a, b) {
  const d = insightD3, width = Math.max(300, node.parentElement.clientWidth), mobile = width < 580;
  const left = mobile ? 66 : 100, right = mobile ? 95 : 185, height = 4 * 77 + 20;
  const root = d.select(node).attr('viewBox', `0 0 ${width} ${height}`); root.selectAll('*').remove();
  root.append('title').text('A与B的四指标均值差异。每行使用本指标的独立固定刻度，圆点为A，菱形为B。');
  metricComparison(a, b).forEach((row, i) => {
    const y = 30 + i * 77, x = d.scaleLinear().domain(row.domain).range([left, width - right]);
    root.append('text').attr('x', 0).attr('y', y + 4).attr('class', 'lens-name').text(row.label);
    root.append('line').attr('x1', x(row.domain[0])).attr('x2', x(row.domain[1])).attr('y1', y).attr('y2', y).attr('stroke', '#dce4db').attr('stroke-width', 3);
    if (row.a !== null && row.b !== null) {
      root.append('line').attr('x1', x(row.a)).attr('x2', x(row.b)).attr('y1', y).attr('y2', y).attr('stroke', '#728c83').attr('stroke-width', 4);
      root.append('circle').attr('cx', x(row.a)).attr('cy', y).attr('r', 5).attr('fill', '#176f65');
      root.append('path').attr('d', d.symbol().type(d.symbolDiamond).size(65)()).attr('transform', `translate(${x(row.b)},${y})`).attr('fill', '#b16b3b');
      root.append('text').attr('x', width - right + 12).attr('y', y + 4).attr('class', 'lens-value').text(`${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)} ${row.unit}`);
      root.append('text').attr('x', left).attr('y', y + 44).attr('class', 'axis-title').text(`A ${row.a.toFixed(1)} · B ${row.b.toFixed(1)} ${row.unit}`);
    } else root.append('text').attr('x', left).attr('y', y + 4).attr('class', 'axis-title').text('先保留 A、B 两组有效样本');
    root.append('g').attr('class', 'axis').attr('transform', `translate(0,${y + 11})`).call(d.axisBottom(x).ticks(3).tickSize(3));
  });
}
