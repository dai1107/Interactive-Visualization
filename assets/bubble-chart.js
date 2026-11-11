import { SPECIES } from './data.js';
import { areaRadius, speciesBubbles } from './bubble-model.js';
const d3 = window.d3;
export const COLOR = Object.fromEntries(SPECIES.map(s => [s.id,s.color]));

export function createBubbleChart(node, { onBrush = () => {}, onFocus = () => {}, tooltip = () => {}, hideTooltip = () => {} } = {}) {
  const svg=d3.select(node);
  let rows=[],options={},brush,brushLayer,sync=false,x,y,points,plot,m,width,height;
  function draw(nextRows,nextOptions={}) {
    const previous=new Map(points?points.selectAll('circle').nodes().map(n=>[n.__data__.id,{x:+n.getAttribute('cx'),y:+n.getAttribute('cy'),r:+n.getAttribute('r')}]):[]);
    rows=nextRows;options=nextOptions;
    const mini=Boolean(options.mini),outerWidth=Math.max(280,Math.floor(node.parentElement.clientWidth||500)),outerHeight=mini?250:outerWidth<550?350:430;
    m={left:mini?47:57,right:22,top:28,bottom:52};width=outerWidth-m.left-m.right;height=outerHeight-m.top-m.bottom;
    svg.attr('viewBox',`0 0 ${outerWidth} ${outerHeight}`);svg.selectAll('*').interrupt();svg.selectAll('g.frame').remove();
    plot=svg.append('g').attr('class','frame').attr('transform',`translate(${m.left},${m.top})`);
    x=d3.scaleLinear().domain([170,235]).range([0,width]);y=d3.scaleLinear().domain([2500,6500]).range([height,0]);
    plot.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(mini?4:5).tickSize(-width).tickFormat(''));
    plot.append('g').attr('class','axis').attr('transform',`translate(0,${height})`).call(d3.axisBottom(x).ticks(outerWidth<500?4:7).tickSizeOuter(0));
    plot.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(mini?4:5).tickFormat(d3.format('d')).tickSizeOuter(0));
    plot.append('text').attr('class','axis-label').attr('y',-13).text(options.mode==='species'?'平均体重 / g':'体重 / g');
    plot.append('text').attr('class','axis-label').attr('x',width/2).attr('y',height+40).attr('text-anchor','middle').text(options.mode==='species'?'平均鳍长 / mm':'鳍长 / mm');
    if(!mini)plot.append('text').attr('class','watermark').attr('x',width-6).attr('y',height-14).attr('text-anchor','end').text(options.yearLabel||'');
    points=plot.append('g').attr('class','points');
    const observations=options.mode==='species'?speciesBubbles(rows):rows.map(r=>({...r,id:r.record_id}));
    const radii=d=>options.mode==='species'?areaRadius(d.n,151,34):options.size==='equal'?(mini?3.2:4.5):areaRadius(d[options.size||'bill_length_mm'],options.size==='bill_depth_mm'?22:60,mini?4.5:8);
    points.selectAll('circle').data(observations,d=>d.id).join('circle').attr('class','bubble').attr('data-record',d=>d.id)
      .attr('cx',d=>x(d.flipper_length_mm)).attr('cy',d=>y(d.body_mass_g)).attr('r',radii).attr('fill',d=>COLOR[d.species])
      .attr('tabindex',mini?null:0).attr('role',mini?null:'button').attr('aria-label',d=>d.aggregate?`${d.name}，${d.n} 条样本，平均鳍长 ${d.flipper_length_mm.toFixed(1)} 毫米，平均体重 ${d.body_mass_g.toFixed(1)} 克`:`${d.record_id}，鳍长 ${d.flipper_length_mm} 毫米，体重 ${d.body_mass_g} 克`)
      .on('pointermove',mini?null:(e,d)=>tooltip(e,d)).on('pointerleave',hideTooltip).on('click',mini?null:(_,d)=>onFocus(d))
      .on('focus',mini?null:(e,d)=>{const b=e.target.getBoundingClientRect();tooltip({clientX:b.x,clientY:b.y},d);}).on('blur',hideTooltip)
      .on('keydown',mini?null:(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onFocus(d);}});
    if(options.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){points.selectAll('circle').attr('opacity',d=>previous.has(d.id)?1:0).attr('cx',d=>previous.get(d.id)?.x??x(d.flipper_length_mm)).attr('cy',d=>previous.get(d.id)?.y??y(d.body_mass_g)).attr('r',d=>previous.get(d.id)?.r??radii(d)).transition().duration(420).attr('cx',d=>x(d.flipper_length_mm)).attr('cy',d=>y(d.body_mass_g)).attr('r',radii).attr('opacity',1);}
    if(options.mode==='species')plot.append('g').selectAll('text').data(observations).join('text').attr('class','species-label').attr('x',d=>x(d.flipper_length_mm)).attr('y',d=>y(d.body_mass_g)-radii(d)-10).attr('text-anchor','middle').text(d=>d.name);
    brush=d3.brush().extent([[0,0],[width,height]]).on('brush end',e=>{if(sync)return;onBrush(e.selection?{flipper_length_mm:[x.invert(e.selection[0][0]),x.invert(e.selection[1][0])],body_mass_g:[y.invert(e.selection[1][1]),y.invert(e.selection[0][1])]}:null);});
    brushLayer=plot.append('g').attr('class','brush').call(brush).style('display',!mini&&options.brush&&options.mode!=='species'?null:'none');
    setRange(options.range||null);
    if(!rows.length)plot.append('text').attr('class','empty-chart').attr('x',width/2).attr('y',height/2).attr('text-anchor','middle').text('当前条件没有有效样本');
  }
  function highlight(ids) {
    if(!points)return;
    points.selectAll('circle').interrupt().attr('opacity',d=>!ids||ids.has(d.record_id)?1:.12);
  }
  function setRange(range) {
    if(!brushLayer)return;
    sync=true;brushLayer.call(brush.move,range?[[x(range.flipper_length_mm[0]),y(range.body_mass_g[1])],[x(range.flipper_length_mm[1]),y(range.body_mass_g[0])]]:null);sync=false;
  }
  function pin(id){if(points)points.selectAll('circle').attr('stroke',d=>d.id===id?'#203b37':'white').attr('stroke-width',d=>d.id===id?2.5:1);}
  return {draw,highlight,setRange,pin};
}

export function drawSizeLegend(node,mode,size) {
  const svg=d3.select(node);svg.selectAll('*').remove();svg.attr('viewBox','0 0 210 70');
  if(size==='equal'&&mode!=='species'){svg.append('text').attr('class','axis-label').attr('x',10).attr('y',28).text('所有个体使用相同大小');return;}
  const values=mode==='species'?[10,30,60]:size==='bill_depth_mm'?[14,18,22]:[35,45,55];
  values.forEach((v,i)=>{const r=mode==='species'?areaRadius(v,151,34):areaRadius(v,size==='bill_depth_mm'?22:60,8);const cx=30+i*70;svg.append('circle').attr('cx',cx).attr('cy',46-r).attr('r',r).attr('fill','none').attr('stroke','#718e84');svg.append('text').attr('class','axis-label').attr('x',cx).attr('y',65).attr('text-anchor','middle').text(`${v}${mode==='species'?' 条':' mm'}`);});
}

export function drawAnnual(node,series,metric,year,allYears) {
  const svg=d3.select(node),w=Math.max(280,Math.floor(node.parentElement.clientWidth||500)),h=280,m={left:55,right:20,top:25,bottom:38},iw=w-m.left-m.right,ih=h-m.top-m.bottom;
  svg.attr('viewBox',`0 0 ${w} ${h}`).selectAll('*').remove();const g=svg.append('g').attr('transform',`translate(${m.left},${m.top})`);
  const valid=series.flatMap(s=>s.values).filter(d=>d.value!==null),extent=d3.extent(valid,d=>d.value),pad=valid.length?Math.max((extent[1]-extent[0])*.15,metric==='body_mass_g'?50:1):1;
  const x=d3.scaleLinear().domain([2007,2009]).range([0,iw]),y=d3.scaleLinear().domain(valid.length?[extent[0]-pad,extent[1]+pad]:[0,1]).nice(5).range([ih,0]);
  g.append('g').attr('class','grid').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''));g.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(4));g.append('g').attr('class','axis').attr('transform',`translate(0,${ih})`).call(d3.axisBottom(x).tickValues([2007,2008,2009]).tickFormat(d3.format('d')).tickSizeOuter(0));g.append('text').attr('class','axis-label').attr('y',-10).text(metric==='body_mass_g'?'平均体重 / g':'平均鳍长 / mm');
  if(!allYears)g.append('line').attr('x1',x(year)).attr('x2',x(year)).attr('y1',0).attr('y2',ih).attr('stroke','#81968d').attr('stroke-dasharray','4 4');
  const line=d3.line().defined(d=>d.value!==null).x(d=>x(d.year)).y(d=>y(d.value));
  series.forEach(s=>{g.append('path').datum(s.values).attr('class','annual-line').attr('fill','none').attr('stroke',s.color).attr('stroke-width',2.3).attr('d',line);g.append('g').selectAll('circle').data(s.values.filter(d=>d.value!==null)).join('circle').attr('cx',d=>x(d.year)).attr('cy',d=>y(d.value)).attr('r',d=>!allYears&&d.year===year?5:3).attr('fill',s.color).append('title').text(d=>`${s.name} ${d.year}: ${d.value.toFixed(1)}，n=${d.n}`);});
  if(!valid.length)g.append('text').attr('class','empty-chart').attr('x',iw/2).attr('y',ih/2).attr('text-anchor','middle').text('该筛选条件下没有年度数据');
}
