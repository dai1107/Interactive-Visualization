import { motionAllowed } from './motion.js?v=atelier-20261113c';
import { SPECIES } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, bubbleRadius, shadeFraction, speciesBubbles } from './bubble-model.js?v=atelier-20261113c';
const d3 = window.d3;
export const COLOR = Object.fromEntries(SPECIES.map(s => [s.id,s.color]));

export function bubbleFill(row, shade = 'bill_depth_mm') {
  if (shade === 'none') return COLOR[row.species];
  const fraction = shadeFraction(row[shade], shade);
  if (fraction === null) return '#aeb9b3';
  const color = d3.hcl(COLOR[row.species]);
  color.l = 74 - 31 * fraction;
  color.c *= .65 + .35 * fraction;
  return color.formatHex();
}

export function createBubbleChart(node, { onBrush = () => {}, onFocus = () => {}, tooltip = () => {}, hideTooltip = () => {} } = {}) {
  const svg = d3.select(node);
  const plot = svg.append('g').attr('class', 'frame');
  const grid = plot.append('g').attr('class', 'grid');
  const horizontal = plot.append('g').attr('class', 'axis axis-x');
  const vertical = plot.append('g').attr('class', 'axis axis-y');
  const xLabel = plot.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle');
  const yLabel = plot.append('text').attr('class', 'axis-label');
  const regions = plot.append('g').attr('class', 'selection-regions').attr('pointer-events', 'none');
  const points = plot.append('g').attr('class', 'points');
  const labels = plot.append('g').attr('class', 'mean-labels').attr('pointer-events', 'none');
  const halo = plot.append('circle').attr('class', 'focus-halo').attr('fill', 'none').attr('pointer-events', 'none').attr('opacity', 0);
  const brushLayer = plot.append('g').attr('class', 'brush');
  const empty = plot.append('text').attr('class', 'empty-chart').attr('text-anchor', 'middle');
  let rows = [], options = {}, brush, sync = false, x, y, width, height, selectedIds = null, hoveredSpecies = null, pinnedId = null, view = PLOT_VIEWS.body;

  function showHalo(record, instant = false) {
    if (!record || !x || !y) { halo.interrupt('halo').attr('opacity', 0); return; }
    halo.interrupt('halo').attr('cx', x(record[view.x])).attr('cy', y(record[view.y])).attr('stroke', COLOR[record.species]).attr('stroke-width', 1);
    const radius = bubbleRadius(record, options) + 4;
    if (!instant && motionAllowed()) halo.attr('r', radius + 3).attr('opacity', 0).transition('halo').duration(190).ease(d3.easeCubicOut).attr('r', radius).attr('opacity', .5);
    else halo.attr('r', radius).attr('opacity', .5);
  }
  function restoreHalo() {
    const pinned = points.selectAll('circle.bubble').data().find(record => record.id === pinnedId);
    showHalo(pinned, true);
  }
  function draw(nextRows, nextOptions = {}) {
    rows = nextRows; options = nextOptions; view = PLOT_VIEWS[options.plot || 'body']; selectedIds = null; hoveredSpecies = null;
    const mini = Boolean(options.mini), outerWidth = Math.max(280, Math.floor(node.getBoundingClientRect().width || node.parentElement.clientWidth || 500));
    const outerHeight = mini ? 270 : outerWidth < 550 ? 345 : (globalThis.innerHeight || 900) < 800 ? 330 : 400;
    const m = { left: mini ? 47 : 57, right: 22, top: 28, bottom: 52 };
    width = outerWidth - m.left - m.right; height = outerHeight - m.top - m.bottom;
    const animated = Boolean(options.animate && motionAllowed() && !node.closest('[hidden]'));
    svg.attr('viewBox', `0 0 ${outerWidth} ${outerHeight}`).attr('aria-label', `企鹅${view.title}气泡图`);
    plot.attr('transform', `translate(${m.left},${m.top})`);
    x = d3.scaleLinear().domain(BUBBLE_FIELDS[view.x].domain).range([0, width]);
    y = d3.scaleLinear().domain(BUBBLE_FIELDS[view.y].domain).range([height, 0]);
    const xAxis = d3.axisBottom(x).ticks(outerWidth < 500 ? 4 : 7).tickSizeOuter(0);
    const yAxis = d3.axisLeft(y).ticks(mini ? 4 : 5).tickFormat(d3.format('~f')).tickSizeOuter(0);
    const gridAxis = d3.axisLeft(y).ticks(mini ? 4 : 5).tickSize(-width).tickFormat('');
    [horizontal, vertical, grid].forEach(axis => { axis.interrupt('axes'); axis.selectAll('*').interrupt('axes'); });
    horizontal.attr('transform', `translate(0,${height})`);
    if (animated) {
      horizontal.transition('axes').duration(460).ease(d3.easeCubicInOut).call(xAxis);
      vertical.transition('axes').duration(460).ease(d3.easeCubicInOut).call(yAxis);
      grid.transition('axes').duration(460).ease(d3.easeCubicInOut).call(gridAxis);
    } else { horizontal.call(xAxis); vertical.call(yAxis); grid.call(gridAxis); }
    yLabel.attr('y', -13).text(`${options.mode === 'species' ? '平均' : ''}${BUBBLE_FIELDS[view.y].label} / ${BUBBLE_FIELDS[view.y].unit}`);
    xLabel.attr('x', width / 2).attr('y', height + 40).text(`${options.mode === 'species' ? '平均' : ''}${BUBBLE_FIELDS[view.x].label} / ${BUBBLE_FIELDS[view.x].unit}`);
    const visibleRules = (options.selection || []).filter(rule => rule.kind === 'range' && (rule.range[view.x] || rule.range[view.y])).slice(-4);
    regions.selectAll('rect').data(visibleRules).join('rect').each(function(rule) {
      const rx = rule.range[view.x] || BUBBLE_FIELDS[view.x].domain, ry = rule.range[view.y] || BUBBLE_FIELDS[view.y].domain;
      d3.select(this).attr('x', x(rx[0])).attr('y', y(ry[1])).attr('width', x(rx[1]) - x(rx[0])).attr('height', y(ry[0]) - y(ry[1])).attr('fill', 'none').attr('stroke', rule.op === 'subtract' ? '#b17c58' : '#386a5c').attr('stroke-dasharray', rule.op === 'subtract' ? '3 3' : '7 4').attr('stroke-width', 1.2);
    });
    const observations = options.mode === 'species' ? speciesBubbles(rows, options.plot) : rows.map(row => ({ ...row, id: row.record_id }));
    const radius = record => bubbleRadius(record, options), shade = options.shade || 'bill_depth_mm';
    const joined = points.selectAll('circle.record-point').data(observations, record => record.id);
    const exiting = joined.exit().interrupt('geometry').interrupt('reveal').interrupt('exit').attr('class', 'record-point bubble-exit').attr('aria-hidden', 'true').attr('role', null).attr('tabindex', null).attr('data-record', null).style('pointer-events', 'none');
    if (animated) exiting.transition('exit').duration(180).ease(d3.easeCubicIn).attr('r', 0).style('fill-opacity', 0).remove();
    else exiting.remove();
    const entering = joined.enter().append('circle').attr('cx', record => x(record[view.x])).attr('cy', record => y(record[view.y])).attr('fill', record => bubbleFill(record, shade)).attr('r', animated ? 0 : radius).style('fill-opacity', animated ? 0 : 1);
    const current = entering.merge(joined).interrupt('geometry').interrupt('reveal').interrupt('exit').attr('class', 'record-point bubble').attr('aria-hidden', null).style('pointer-events', null)
      .attr('data-record', record => record.id).attr('data-size-value', record => options.mode === 'species' ? record.n : options.size === 'equal' ? null : record[options.size || 'bill_length_mm'])
      .attr('data-shade-value', record => shade === 'none' ? null : record[shade]).attr('tabindex', mini ? null : 0).attr('role', mini ? null : 'button')
      .attr('aria-label', record => `${record.aggregate ? `${record.name}，${record.n} 条样本，均值` : `${record.record_id}，个体`}，鳍长 ${record.flipper_length_mm.toFixed(1)} 毫米，体重 ${record.body_mass_g.toFixed(1)} 克，喙长 ${record.bill_length_mm?.toFixed(1) ?? '未记录'} 毫米，喙深 ${record.bill_depth_mm?.toFixed(1) ?? '未记录'} 毫米`)
      .on('pointerenter', mini ? null : function(event, record) { d3.select(this).raise(); focusSpecies(record.species); showHalo(record); })
      .on('pointermove', mini ? null : (event, record) => tooltip(event, record))
      .on('pointerleave', () => { focusSpecies(null); hideTooltip(); restoreHalo(); })
      .on('click', mini ? null : (_, record) => onFocus(record))
      .on('focus', mini ? null : (event, record) => { d3.select(event.target).raise(); focusSpecies(record.species); showHalo(record); const box = event.target.getBoundingClientRect(); tooltip({ clientX: box.x, clientY: box.y }, record); })
      .on('blur', () => { focusSpecies(null); hideTooltip(); restoreHalo(); })
      .on('keydown', mini ? null : (event, record) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFocus(record); } });
    if (animated) {
      current.transition('geometry').duration(480).ease(d3.easeCubicInOut).attr('cx', record => x(record[view.x])).attr('cy', record => y(record[view.y])).attr('r', radius).attr('fill', record => bubbleFill(record, shade));
      current.transition('reveal').duration(300).ease(d3.easeCubicOut).style('fill-opacity', 1);
    } else current.attr('cx', record => x(record[view.x])).attr('cy', record => y(record[view.y])).attr('r', radius).attr('fill', record => bubbleFill(record, shade)).style('fill-opacity', 1);
    labels.selectAll('text').data(options.mode === 'species' ? observations : [], record => record.id).join('text').attr('class', 'species-label').attr('x', record => x(record[view.x])).attr('y', record => y(record[view.y]) - radius(record) - 10).attr('text-anchor', 'middle').text(record => record.name);
    brush = d3.brush().extent([[0, 0], [width, height]]).on('end', event => { if (!sync) onBrush(event.selection ? { [view.x]: [x.invert(event.selection[0][0]), x.invert(event.selection[1][0])], [view.y]: [y.invert(event.selection[1][1]), y.invert(event.selection[0][1])] } : null); });
    brushLayer.call(brush).style('display', !mini && options.brush && options.mode === 'individual' ? null : 'none');
    setRange(options.range || null);
    empty.attr('x', width / 2).attr('y', height / 2).text(rows.length ? '' : mini ? '在探索页保留一组样本' : '当前条件没有有效样本');
    paintEmphasis(); restoreHalo();
  }
  function paintEmphasis() {
    points.selectAll('circle.bubble').attr('opacity', record => (!selectedIds || selectedIds.has(record.record_id) ? 1 : .12) * (hoveredSpecies && record.species !== hoveredSpecies ? .2 : 1));
  }
  function highlight(ids) { selectedIds = ids; paintEmphasis(); }
  function focusSpecies(species) { hoveredSpecies = options.focusSpecies === false ? null : species; paintEmphasis(); }
  function setRange(range) {
    if (!brush || !x || !y) return;
    sync = true; brushLayer.call(brush.move, range ? [[x(range[view.x][0]), y(range[view.y][1])], [x(range[view.x][1]), y(range[view.y][0])]] : null); sync = false;
  }
  function pin(id) { pinnedId = id; points.selectAll('circle.bubble').classed('is-pinned', record => record.id === id).attr('stroke', record => record.id === id ? '#244c3e' : '#faf9f4').attr('stroke-width', record => record.id === id ? 2 : .85); restoreHalo(); }
  return { draw, highlight, setRange, pin, focusSpecies };
}

export function drawSizeLegend(node,mode,size) {
  const svg=d3.select(node);svg.selectAll('*').remove();svg.attr('viewBox','0 0 240 86');
  if(size==='equal'&&mode!=='species'){svg.append('text').attr('class','axis-label').attr('x',10).attr('y',28).text('所有个体使用相同大小');return;}
  const values=mode==='species'?[10,30,60]:BUBBLE_FIELDS[size].examples;
  values.forEach((v,i)=>{const r=bubbleRadius({n:v,[size]:v},{mode,size});const cx=36+i*78;svg.append('circle').attr('cx',cx).attr('cy',53-r).attr('r',r).attr('fill','#dcece5').attr('stroke','#718e84');svg.append('text').attr('class','axis-label').attr('x',cx).attr('y',75).attr('text-anchor','middle').text(`${v.toLocaleString('zh-CN')}${mode==='species'?' 条':' '+BUBBLE_FIELDS[size].unit}`);});
}

export function drawShadeLegend(node,mode,shade) {
  const svg=d3.select(node);svg.selectAll('*').remove();svg.attr('viewBox','0 0 320 86').attr('aria-label',shade==='none'?'三个物种的颜色图例':`三个物种的${mode==='species'?'平均':''}${BUBBLE_FIELDS[shade].label}深浅图例`);
  if(shade==='none'){
    SPECIES.forEach((species,i)=>{svg.append('circle').attr('cx',10+i*108).attr('cy',28).attr('r',5).attr('fill',species.color);svg.append('text').attr('class','axis-label').attr('x',22+i*108).attr('y',32).text(species.name);});
    return;
  }
  const field=BUBBLE_FIELDS[shade],defs=svg.append('defs'),labelX=0,start=62,span=208;
  SPECIES.forEach((species,i)=>{
    const id=`${node.id}-${species.id}`,gradient=defs.append('linearGradient').attr('id',id);
    [0,.25,.5,.75,1].forEach(t=>gradient.append('stop').attr('offset',`${t*100}%`).attr('stop-color',bubbleFill({species:species.id,[shade]:field.domain[0]+t*(field.domain[1]-field.domain[0])},shade)));
    svg.append('text').attr('class','axis-label').attr('x',labelX).attr('y',14+i*22).text(species.name);
    svg.append('rect').attr('x',start).attr('y',4+i*22).attr('width',span).attr('height',12).attr('rx',3).attr('fill',`url(#${id})`);
  });
  [0,.5,1].forEach(t=>svg.append('text').attr('class','axis-label').attr('x',start+t*span).attr('y',81).attr('text-anchor','middle').text(`${(field.domain[0]+t*(field.domain[1]-field.domain[0])).toLocaleString('zh-CN')} ${field.unit}`));
}

export function drawAnnual(node,series,metric,year,allYears) {
  const svg=d3.select(node),w=Math.max(280,Math.floor(node.parentElement.clientWidth||500)),h=280,m={left:55,right:20,top:25,bottom:38},iw=w-m.left-m.right,ih=h-m.top-m.bottom;
  svg.attr('viewBox',`0 0 ${w} ${h}`).selectAll('*').remove();const g=svg.append('g').attr('transform',`translate(${m.left},${m.top})`);
  const valid=series.flatMap(s=>s.values).filter(d=>d.value!==null),extent=d3.extent(valid,d=>d.value),pad=valid.length?Math.max((extent[1]-extent[0])*.15,metric==='body_mass_g'?50:metric==='bill_depth_mm'?.25:1):1;
  const x=d3.scaleLinear().domain([2007,2009]).range([0,iw]),y=d3.scaleLinear().domain(valid.length?[extent[0]-pad,extent[1]+pad]:[0,1]).nice(5).range([ih,0]);
  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''));g.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(4));g.append('g').attr('class','axis').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x).tickValues([2007,2008,2009]).tickFormat(d3.format('~f')).tickSizeOuter(0));g.append('text').attr('class','axis-label').attr('y',-10).text(`平均${BUBBLE_FIELDS[metric].label} / ${BUBBLE_FIELDS[metric].unit}`);
  if(!allYears)g.append('line').attr('x1',x(year)).attr('x2',x(year)).attr('y1',0).attr('y2',ih).attr('stroke','#81968d').attr('stroke-dasharray','4 4');
  const line=d3.line().defined(d=>d.value!==null).x(d=>x(d.year)).y(d=>y(d.value));
  series.forEach(s=>{g.append('path').datum(s.values).attr('class','annual-line').attr('fill','none').attr('stroke',s.color).attr('stroke-width',2.3).attr('d',line);g.append('g').selectAll('circle').data(s.values.filter(d=>d.value!==null)).join('circle').attr('cx',d=>x(d.year)).attr('cy',d=>y(d.value)).attr('r',d=>!allYears&&d.year===year?5:3).attr('fill',s.color).append('title').text(d=>`${s.name} ${d.year}: ${d.value.toFixed(1)}，n=${d.n}`);});
  if(!valid.length)g.append('text').attr('class','empty-chart').attr('x',iw/2).attr('y',ih/2).attr('text-anchor','middle').text('该筛选条件下没有年度数据');
}
