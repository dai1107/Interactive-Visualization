import { BUBBLE_FIELDS } from './bubble-model.js?v=bonus-20261113a';

const bonusD3 = window.d3;
export function drawCohortDistribution(svg, comparison, onSelectRange = () => {}) {
  const d = bonusD3, meta = BUBBLE_FIELDS[comparison.field];
  const width = Math.max(300, svg.parentElement.clientWidth), height = 265;
  const m = { top: 28, right: 14, bottom: 43, left: 45 };
  const root = d.select(svg).attr('viewBox', `0 0 ${width} ${height}`);
  root.selectAll('*').remove();
  root.append('title').text(`${meta.label}分布：选中样本与同年其余样本，纵轴为各组内占比`);
  const x = d.scaleLinear().domain(meta.domain).range([m.left, width - m.right]);
  const cohorts = [comparison.selected, comparison.rest], colors = ['#176f65', '#b16b3b'];
  const maximum = d.max(cohorts.flatMap(c => c.distribution.bins.map(b => b.share))) || .1;
  const y = d.scaleLinear().domain([0, maximum]).nice().range([height - m.bottom, m.top]);
  root.append('g').attr('transform', `translate(0,${height - m.bottom})`).call(d.axisBottom(x).ticks(width < 420 ? 4 : 6));
  root.append('g').attr('transform', `translate(${m.left},0)`).call(d.axisLeft(y).ticks(4).tickFormat(d.format('.0%')));
  root.append('text').attr('x', m.left).attr('y', 14).attr('class', 'axis-title').text('各组内占比');
  root.append('text').attr('x', (width + m.left) / 2).attr('y', height - 4).attr('text-anchor', 'middle').attr('class', 'axis-title').text(`${meta.label} / ${meta.unit}`);
  cohorts.forEach((cohort, group) => {
    root.append('g').attr('class', group ? 'rest-bars' : 'selected-bars').selectAll('rect').data(cohort.distribution.bins).join('rect')
      .attr('x', b => x(b.lo) + (x(b.hi) - x(b.lo)) * (group ? .51 : .06))
      .attr('width', b => Math.max(1, (x(b.hi) - x(b.lo)) * .43))
      .attr('y', b => y(b.share)).attr('height', b => y(0) - y(b.share)).attr('fill', colors[group])
      .attr('role', 'button').attr('tabindex', 0).attr('aria-label', b => `选择${meta.label}${b.lo.toFixed(1)}至${b.hi.toFixed(1)}${meta.unit}，当前${cohort.label}${b.count}条`).attr('class', 'interactive-bin')
      .on('click', (_, b) => onSelectRange({ [comparison.field]: [b.lo, b.hi] }, b.hi < meta.domain[1] ? [comparison.field] : [], `${meta.label}分箱 ${b.lo.toFixed(1)}—${b.hi.toFixed(1)} ${meta.unit}`))
      .on('keydown', (event, b) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectRange({ [comparison.field]: [b.lo, b.hi] }, b.hi < meta.domain[1] ? [comparison.field] : [], `${meta.label}分箱 ${b.lo.toFixed(1)}—${b.hi.toFixed(1)} ${meta.unit}`); } })
      .append('title').text(b => `${cohort.label} · ${b.lo.toFixed(1)}—${b.hi.toFixed(1)} ${meta.unit}：${b.count} 条，占组内 ${(100 * b.share).toFixed(1)}%`);
  });
}

export function drawCohortComposition(svg, comparison) {
  const d = bonusD3, width = Math.max(300, svg.parentElement.clientWidth), height = 210;
  const root = d.select(svg).attr('viewBox', `0 0 ${width} ${height}`);
  root.selectAll('*').remove();
  root.append('title').text('选中样本与同年其余样本的物种构成，各组分别归一化到百分之百');
  const x = d.scaleLinear().domain([0, 1]).range([12, width - 15]);
  [comparison.selected, comparison.rest].forEach((cohort, i) => {
    const y = 32 + i * 82;
    root.append('text').attr('x', 12).attr('y', y - 8).attr('class', 'axis-title').text(`${cohort.label} · n=${cohort.n}`);
    if (!cohort.n) { root.append('text').attr('x', 12).attr('y', y + 21).attr('class', 'axis-title').text('无样本，不绘制比例'); return; }
    let start = 0;
    cohort.composition.forEach(group => {
      root.append('rect').attr('x', x(start)).attr('y', y).attr('width', x(group.share) - x(0)).attr('height', 29).attr('fill', group.color)
        .append('title').text(`${group.name}：${group.n} 条，${(100 * group.share).toFixed(1)}%`);
      if (group.share >= .15) root.append('text').attr('x', x(start + group.share / 2)).attr('y', y + 20).attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', 11).text(`${(100 * group.share).toFixed(0)}%`);
      start += group.share;
    });
  });
  root.append('g').attr('transform', 'translate(0,178)').call(d.axisBottom(x).ticks(4).tickFormat(d.format('.0%')));
}
