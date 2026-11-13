import { SPECIES } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, bubbleRadius, shadeFraction, speciesBubbles } from './bubble-model.js?v=editorial-20261113b';
const d3 = window.d3;
export const COLOR = Object.fromEntries(SPECIES.map(s => [s.id,s.color]));

export function bubbleFill(row, shade = 'bill_depth_mm') {
  if (shade === 'none') return COLOR[row.species];
  const fraction = shadeFraction(row[shade], shade);
  if (fraction === null) return '#aeb9b3';
  const color = d3.hcl(COLOR[row.species]);
  color.l = 78 - 35 * fraction;
  color.c *= .45 + .4 * fraction;
  return color.formatHex();
}

export function createBubbleChart(node, { onBrush = () => {}, onFocus = () => {}, tooltip = () => {}, hideTooltip = () => {} } = {}) {
  const svg=d3.select(node);
  let rows=[],options={},brush,brushLayer,sync=false,x,y,points,plot,m,width,height,selectedIds=null,hoveredSpecies=null,view=PLOT_VIEWS.body;
  function draw(nextRows,nextOptions={}) {
    const previous=new Map(points?points.selectAll('circle').nodes().map(n=>[n.__data__.id,{x:+n.getAttribute('cx'),y:+n.getAttribute('cy'),r:+n.getAttribute('r'),fill:n.getAttribute('fill')}]):[]);
    rows=nextRows;options=nextOptions;view=PLOT_VIEWS[options.plot||'body'];selectedIds=null;hoveredSpecies=null;
    const mini=Boolean(options.mini),outerWidth=Math.max(280,Math.floor(node.parentElement.clientWidth||500)),outerHeight=mini?270:outerWidth<550?345:(globalThis.innerHeight||900)<800?330:400;
    m={left:mini?47:57,right:22,top:28,bottom:52};width=outerWidth-m.left-m.right;height=outerHeight-m.top-m.bottom;
    svg.attr('viewBox',`0 0 ${outerWidth} ${outerHeight}`).attr('aria-label',`企鹅${view.title}气泡图`);svg.selectAll('*').interrupt().interrupt('appearance').interrupt('fade');svg.selectAll('g.frame').remove();
    plot=svg.append('g').attr('class','frame').attr('transform',`translate(${m.left},${m.top})`);
    x=d3.scaleLinear().domain(BUBBLE_FIELDS[view.x].domain).range([0,width]);y=d3.scaleLinear().domain(BUBBLE_FIELDS[view.y].domain).range([height,0]);
    plot.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(mini?4:5).tickSize(-width).tickFormat(''));
    plot.append('g').attr('class','axis').attr('transform',`translate(0,${height})`).call(d3.axisBottom(x).ticks(outerWidth<500?4:7).tickSizeOuter(0));
    plot.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(mini?4:5).tickFormat(d3.format('~f')).tickSizeOuter(0));
    plot.append('text').attr('class','axis-label').attr('y',-13).text(`${options.mode==='species'?'平均':''}${BUBBLE_FIELDS[view.y].label} / ${BUBBLE_FIELDS[view.y].unit}`);
    plot.append('text').attr('class','axis-label').attr('x',width/2).attr('y',height+40).attr('text-anchor','middle').text(`${options.mode==='species'?'平均':''}${BUBBLE_FIELDS[view.x].label} / ${BUBBLE_FIELDS[view.x].unit}`);
    const visibleRules=(options.selection||[]).filter(rule=>rule.kind==='range'&&(rule.range[view.x]||rule.range[view.y])).slice(-4);
    const regionLayer=plot.append('g').attr('class','selection-regions').attr('pointer-events','none');
    visibleRules.forEach(rule=>{const rx=rule.range[view.x]||BUBBLE_FIELDS[view.x].domain,ry=rule.range[view.y]||BUBBLE_FIELDS[view.y].domain;regionLayer.append('rect').attr('x',x(rx[0])).attr('y',y(ry[1])).attr('width',x(rx[1])-x(rx[0])).attr('height',y(ry[0])-y(ry[1])).attr('fill','none').attr('stroke',rule.op==='subtract'?'#b16b3b':'#176f65').attr('stroke-dasharray',rule.op==='subtract'?'3 3':'7 4').attr('stroke-width',1.4);});
    points=plot.append('g').attr('class','points');
    const observations=options.mode==='species'?speciesBubbles(rows,options.plot):rows.map(r=>({...r,id:r.record_id}));
    const radii=d=>bubbleRadius(d,options),shade=options.shade||'bill_depth_mm';
    points.selectAll('circle').data(observations,d=>d.id).join('circle').attr('class','bubble').attr('data-record',d=>d.id)
      .attr('cx',d=>x(d[view.x])).attr('cy',d=>y(d[view.y])).attr('r',radii).attr('fill',d=>bubbleFill(d,shade))
      .attr('data-size-value',d=>options.mode==='species'?d.n:options.size==='equal'?null:d[options.size||'bill_length_mm'])
      .attr('data-shade-value',d=>shade==='none'?null:d[shade])
      .attr('tabindex',mini?null:0).attr('role',mini?null:'button').attr('aria-label',d=>`${d.aggregate?`${d.name}，${d.n} 条样本，均值`:`${d.record_id}，个体`}，鳍长 ${d.flipper_length_mm.toFixed(1)} 毫米，体重 ${d.body_mass_g.toFixed(1)} 克，喙长 ${d.bill_length_mm?.toFixed(1)??'未记录'} 毫米，喙深 ${d.bill_depth_mm?.toFixed(1)??'未记录'} 毫米`)
      .on('pointerenter',mini?null:function(e,d){d3.select(this).raise();focusSpecies(d.species);})
      .on('pointermove',mini?null:(e,d)=>tooltip(e,d)).on('pointerleave',()=>{focusSpecies(null);hideTooltip();}).on('click',mini?null:(_,d)=>onFocus(d))
      .on('focus',mini?null:(e,d)=>{d3.select(e.target).raise();focusSpecies(d.species);const b=e.target.getBoundingClientRect();tooltip({clientX:b.x,clientY:b.y},d);}).on('blur',()=>{focusSpecies(null);hideTooltip();})
      .on('keydown',mini?null:(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onFocus(d);}});
    if(options.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      points.selectAll('circle').attr('cx',d=>previous.get(d.id)?.x??x(d[view.x])).attr('cy',d=>previous.get(d.id)?.y??y(d[view.y])).attr('r',d=>previous.get(d.id)?.r??radii(d)).attr('fill',d=>previous.get(d.id)?.fill??bubbleFill(d,shade)).transition('appearance').duration(420).attr('cx',d=>x(d[view.x])).attr('cy',d=>y(d[view.y])).attr('r',radii).attr('fill',d=>bubbleFill(d,shade));
      points.selectAll('circle').attr('opacity',d=>previous.has(d.id)?1:0).transition('fade').duration(420).attr('opacity',1);
    }
    if(options.mode==='species')plot.append('g').selectAll('text').data(observations).join('text').attr('class','species-label').attr('x',d=>x(d[view.x])).attr('y',d=>y(d[view.y])-radii(d)-10).attr('text-anchor','middle').text(d=>d.name);
    brush=d3.brush().extent([[0,0],[width,height]]).on('end',e=>{if(sync)return;onBrush(e.selection?{[view.x]:[x.invert(e.selection[0][0]),x.invert(e.selection[1][0])],[view.y]:[y.invert(e.selection[1][1]),y.invert(e.selection[0][1])]}:null);});
    brushLayer=plot.append('g').attr('class','brush').call(brush).style('display',!mini&&options.brush&&options.mode!=='species'?null:'none');
    setRange(options.range||null);
    if(!rows.length)plot.append('text').attr('class','empty-chart').attr('x',width/2).attr('y',height/2).attr('text-anchor','middle').text(mini?'在探索页保留一组样本':'当前条件没有有效样本');
  }
  function paintEmphasis() {
    if(!points)return;
    points.selectAll('circle').interrupt('fade').attr('opacity',d=>(!selectedIds||selectedIds.has(d.record_id)?1:.12)*(hoveredSpecies&&d.species!==hoveredSpecies?.2:1));
  }
  function highlight(ids) { selectedIds=ids;paintEmphasis(); }
  function focusSpecies(species) { hoveredSpecies=options.focusSpecies===false?null:species;paintEmphasis(); }
  function setRange(range) {
    if(!brushLayer)return;
    sync=true;brushLayer.call(brush.move,range?[[x(range[view.x][0]),y(range[view.y][1])],[x(range[view.x][1]),y(range[view.y][0])]]:null);sync=false;
  }
  function pin(id){if(points)points.selectAll('circle').attr('stroke',d=>d.id===id?'#203b37':'white').attr('stroke-width',d=>d.id===id?2.5:1);}
  return {draw,highlight,setRange,pin,focusSpecies};
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
