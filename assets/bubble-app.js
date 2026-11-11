import { SPECIES, SEX_LABELS, parsePenguins, brushRows, summarize } from './data.js';
import { BUBBLE_FIELDS, PLOT_VIEWS, summarizePlot, normalizePlotRange, describePlot, DEFAULT_SCOPE, copyScope, filterScope, selectedRows, annualSeries, snapshot } from './bubble-model.js?v=bonus-20261112d';
import { createBubbleChart, drawSizeLegend, drawShadeLegend, drawAnnual, COLOR } from './bubble-chart.js?v=bonus-20261112d';

import { csvFingerprint, validateView } from './bonus-model.js?v=bonus-20261112d';
import { createBonusExperience } from './bonus-experience.js?v=bonus-20261112d';

const $=id=>document.getElementById(id),name=id=>SPECIES.find(s=>s.id===id)?.name||id;
const number=(v,digits=1)=>v===null||!Number.isFinite(v)?'—':v.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const state={model:null,scope:copyScope(DEFAULT_SCOPE),mode:'individual',plot:'body',focusSpecies:true,numericPlot:null,size:'bill_length_mm',shade:'bill_depth_mm',brush:false,pinned:null,timer:null,annualMetric:'body_mass_g',distributionMetric:'body_mass_g',sourceHash:null,saved:{a:null,b:null}};
const tip=$('tooltip');
const currentRows=()=>selectedRows(state.model.valid,state.scope);
function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function announce(message){$('notice').textContent=message;}
function stop(){if(state.timer)clearInterval(state.timer);state.timer=null;$('play').textContent='▶ 播放年份变化';$('play').setAttribute('aria-pressed','false');}
function clearPinned(){state.pinned=null;tip.hidden=true;renderDetails();}
function tooltip(e,d){
  tip.replaceChildren();tip.append(element('strong',d.aggregate?`${d.name} · 物种均值`:`${name(d.species)} · ${d.record_id}`));
  const lines=d.aggregate?[`样本数　${d.n} 条`,`平均鳍长　${number(d.flipper_length_mm)} mm`,`平均体重　${number(d.body_mass_g)} g`,`平均喙长　${number(d.bill_length_mm)} mm`,`平均喙深　${number(d.bill_depth_mm)} mm`,`个体相关 r　${number(d.r,3)}`]:[`${d.year} 年 · ${d.island} · ${SEX_LABELS[d.sex??'unknown']}`,`鳍长　${d.flipper_length_mm} mm`,`体重　${d.body_mass_g} g`,`喙长　${d.bill_length_mm??'未记录'} mm`,`喙深　${d.bill_depth_mm??'未记录'} mm`];
  lines.push(`${d.aggregate?'面积：样本数':state.size==='equal'?'大小：等大点':`面积：${BUBBLE_FIELDS[state.size].label}`} · ${state.shade==='none'?'颜色仅区分物种':`深浅：${d.aggregate?'平均':''}${BUBBLE_FIELDS[state.shade].label}`}`);
  lines.forEach(text=>tip.append(element('div',text)));tip.hidden=false;tip.style.left=Math.max(8,Math.min((e.clientX??20)+15,innerWidth-tip.offsetWidth-12))+'px';tip.style.top=Math.max(8,Math.min((e.clientY??20)+15,innerHeight-tip.offsetHeight-12))+'px';
}
const chart=createBubbleChart($('scatter'),{tooltip,hideTooltip:()=>tip.hidden=true,onFocus:d=>{state.pinned=d;renderDetails();chart.pin(d.id||d.record_id);},onBrush:range=>{experience.leaveGuide();state.scope.range=normalizePlotRange(range,state.plot);updateSummary(true);}});
const comparisons={a:createBubbleChart($('chart-a')),b:createBubbleChart($('chart-b'))};
function captureView(){return validateView({scope:state.scope,plot:state.plot,mode:state.mode,size:state.size,shade:state.shade,annualMetric:state.annualMetric,distributionMetric:state.distributionMetric,focusSpecies:state.focusSpecies});}
function applyView(view){stop();const checked=validateView(view);Object.assign(state,checked);state.scope=copyScope(checked.scope);state.numericPlot=null;state.brush=Boolean(state.scope.range);clearPinned();refresh(true);}
function sexComparison(scroll=true){
  for(const [slot,sex] of [['a','female'],['b','male']]){const view={...captureView(),scope:{...copyScope(DEFAULT_SCOPE),species:['Chinstrap'],sex,allYears:true},mode:'individual'};state.saved[slot]=snapshot(selectedRows(state.model.valid,view.scope),{...view.scope,view:view.mode,plot:view.plot,size:view.size,shade:view.shade});state.saved[slot].viewState=view;}
  $('comparison').open=true;$('comparison-status').textContent='A：全部年份的帽带雌性；B：全部年份的帽带雄性。各 34 条观测。';renderComparisons();if(scroll)$('comparison').scrollIntoView({block:'start'});
}
const experience=createBonusExperience({rows:()=>state.model?.valid||[],fingerprint:()=>state.sourceHash,getView:captureView,applyView,captureOrigin:()=>({view:captureView(),saved:{...state.saved}}),restoreOrigin:origin=>{state.saved=origin.saved;applyView(origin.view);},sexComparison,announce});


function syncControls(){
  syncRanges();for(const id of ['body','bill'])$('plot-'+id).setAttribute('aria-pressed',String(state.plot===id));$('focus-species').checked=state.focusSpecies;
  $('year').value=state.scope.year;$('year').disabled=state.scope.allYears;$('year-value').value=state.scope.allYears?'全部':state.scope.year;$('all-years').checked=state.scope.allYears;
  $('sex').value=state.scope.sex;$('island').value=state.scope.island;
  document.querySelectorAll('input[name="species"]').forEach(el=>el.checked=state.scope.species.includes(el.value));
  $('view-individual').setAttribute('aria-pressed',String(state.mode==='individual'));$('view-species').setAttribute('aria-pressed',String(state.mode==='species'));
  $('size-field').value=state.size;$('size-field').hidden=state.mode==='species';$('group-size-label').hidden=state.mode!=='species';$('shade-field').value=state.shade;$('annual-metric').value=state.annualMetric;
  $('brush-toggle').disabled=state.mode==='species';$('brush-toggle').setAttribute('aria-pressed',String(state.brush));$('brush-toggle').textContent=state.mode==='species'?'框选仅用于个体视图':'框选个体';$('numeric-selection').hidden=state.mode==='species';
}
function refresh(animate=false){
  syncControls();const rows=filterScope(state.model.valid,state.scope),label=state.scope.allYears?'2007—2009':String(state.scope.year);
  $('chart-title').textContent=(state.mode==='species'?'物种均值 · ':'')+PLOT_VIEWS[state.plot].title;
  const sizeText=state.mode==='species'?'样本数':state.size==='equal'?'相同大小':BUBBLE_FIELDS[state.size].label;
  const shadeText=state.shade==='none'?'仅区分物种':`${state.mode==='species'?'平均':''}${BUBBLE_FIELDS[state.shade].label}`;
  $('size-legend-label').textContent=state.mode==='species'?'气泡面积：样本数':state.size==='equal'?'大小：等大个体点':`气泡面积：${sizeText}`;
  $('size-legend-note').textContent=state.size==='equal'&&state.mode!=='species'?'所有个体使用相同大小':'面积与数值成正比，跨年份尺度一致';
  $('shade-legend-label').textContent=state.shade==='none'?'颜色：物种':`颜色深浅：${shadeText}`;
  $('shade-legend-note').textContent=state.shade==='none'?'蓝色阿德利 · 橙色帽带 · 绿色巴布亚':`同一色系中，越深表示${shadeText}越大`;
  $('view-explanation').textContent=(state.mode==='species'?'一颗气泡代表一个物种的均值；面积表示样本数。统计仍按个体计算。':`一颗气泡代表一条个体观测；${state.size==='equal'?'所有个体点等大。':`面积表示${sizeText}。`}`)+(state.shade==='none'?'颜色区分物种。':`色系区分物种，颜色越深表示${shadeText}越大。`);
  $('encoding-note').textContent=`色系：物种 · ${state.mode==='species'?'面积：样本数':state.size==='equal'?'大小：等大点':`面积：${sizeText}`} · ${state.shade==='none'?'深浅：关闭':`深浅：${shadeText}`}`;$('year-note').textContent=state.scope.allYears?'合并年份：2007—2009':`${state.scope.year} 年`;
  const raw=state.model.rows.filter(r=>state.scope.species.includes(r.species)&&(state.scope.sex==='all'||(state.scope.sex==='unknown'?r.sex===null:r.sex===state.scope.sex))&&(state.scope.island==='all'||r.island===state.scope.island)&&(state.scope.allYears||r.year===state.scope.year));
  $('coverage-note').textContent=`${label} · 当前条件 ${raw.length} 条原始观测，${rows.length} 条鳍长与体重有效，${raw.length-rows.length} 条缺失不绘制。`;
  chart.draw(rows,{mode:state.mode,plot:state.plot,focusSpecies:state.focusSpecies,size:state.size,shade:state.shade,brush:state.brush,range:state.scope.range,yearLabel:label,animate});
  if(state.pinned)chart.pin(state.pinned.id||state.pinned.record_id);
  drawSizeLegend($('size-legend'),state.mode,state.size);drawShadeLegend($('shade-legend'),state.mode,state.shade);updateSummary(Boolean(state.scope.range));drawAnnual($('annual-chart'),annualSeries(state.model.valid,state.scope,state.annualMetric),state.annualMetric,state.scope.year,state.scope.allYears);renderComparisons();
}
function updateSummary(highlight=false){
  const baseline=filterScope(state.model.valid,state.scope),rows=brushRows(baseline,state.scope.range),stats={...summarize(rows),r:summarizePlot(rows,state.plot).r};
  if(highlight)chart.highlight(state.scope.range?new Set(rows.map(r=>r.record_id)):null);
  $('stat-count').textContent=stats.n;$('stat-mass').textContent=stats.meanMass===null?'—':`${number(stats.meanMass,0)} g`;$('stat-r').textContent=number(stats.r,3);$('count-context').textContent=state.scope.range?`框选 ${rows.length} / ${baseline.length} 条`:`当前筛选 ${baseline.length} 条`;
  $('correlation-note').textContent=rows.length<3?'至少需要3条有效记录':stats.r===null?'当前坐标没有变化，r不可计算':PLOT_VIEWS[state.plot].title+' · 描述性统计';renderObservation(rows);$('clear-brush').hidden=!state.scope.range;
  $('selection-status').textContent=state.scope.range?`已框选 ${rows.length} 条个体，统计与明细已联动。`:state.brush?'在主图中拖动矩形；关闭框选后可点击气泡。':state.mode==='species'?'点击气泡查看该物种的均值、样本数和个体相关性。':'悬停查看详情，点击保留个体信息。';
  $('table-note').textContent=`${state.scope.allYears?'2007—2009':state.scope.year} · ${rows.length} 条有效个体 · 保留原始行序`;
  const body=$('table-body');body.replaceChildren();rows.forEach(r=>{const tr=element('tr'),first=element('td'),button=element('button',`${r.record_id} · ${name(r.species)}`);button.addEventListener('click',()=>{state.pinned=r;renderDetails();chart.pin(r.record_id);});first.append(button);tr.append(first);[r.flipper_length_mm,r.body_mass_g,r.bill_length_mm??'未记录',r.bill_depth_mm??'未记录'].forEach(v=>tr.append(element('td',v)));body.append(tr);});
  if(!rows.length){const tr=element('tr'),td=element('td','当前条件没有有效样本');td.colSpan=5;tr.append(td);body.append(tr);}
  if(state.pinned&&!state.pinned.aggregate&&!rows.some(r=>r.record_id===state.pinned.record_id))clearPinned();
  for(const slot of ['a','b'])$(`capture-${slot}`).disabled=!rows.length;$('export-current').disabled=!rows.length;experience.render();
}
function renderDetails(){
  const d=state.pinned;$('detail-heading').textContent=d?d.aggregate?`${d.name} · 物种均值`:`${name(d.species)} · ${d.record_id}`:'点击气泡固定详情';$('detail-placeholder').hidden=Boolean(d);$('clear-detail').hidden=!d;$('detail-values').replaceChildren();
  if(!d)return;const fields=d.aggregate?[['样本数',`${d.n} 条`],['平均鳍长',`${number(d.flipper_length_mm)} mm`],['平均体重',`${number(d.body_mass_g)} g`],['平均喙长',`${number(d.bill_length_mm)} mm`],['平均喙深',`${number(d.bill_depth_mm)} mm`],['个体相关 r',number(d.r,3)]]:[['年份',d.year],['物种',name(d.species)],['性别',SEX_LABELS[d.sex??'unknown']],['岛屿',d.island],['鳍长',`${d.flipper_length_mm} mm`],['体重',`${d.body_mass_g} g`],['喙长',`${d.bill_length_mm??'未记录'} mm`],['喙深',`${d.bill_depth_mm??'未记录'} mm`]];
  fields.forEach(([key,value])=>$('detail-values').append(element('dt',key),element('dd',value)));
}
function change(action,animate=false){experience.leaveGuide();stop();action();state.scope.range=null;state.brush=false;clearPinned();refresh(animate);}
function scopeText(scope){return `${PLOT_VIEWS[scope.plot||'body'].name} · ${scope.allYears?'2007—2009 全部年份':scope.year+' 年'} · ${scope.species.map(name).join('、')||'无物种'} · ${SEX_LABELS[scope.sex]} · ${scope.island==='all'?'全部岛屿':scope.island}${scope.range?' · 含矩形框选':''}`;}
function renderComparisons(){
  $('comparison-axis-note').textContent='两组均按当前‘'+PLOT_VIEWS[state.plot].name+'’视角绘图；恢复条件会还原保存时的视角。';
  for(const slot of ['a','b']){
    const saved=state.saved[slot];$(`restore-${slot}`).disabled=!saved;$(`scope-${slot}`).textContent=saved?scopeText(saved.scope):'尚未保存';
    const stats=saved?{...summarize(saved.rows),r:summarizePlot(saved.rows,state.plot).r}:null;$(`stats-${slot}`).textContent=stats?`n=${stats.n} · 个体 r=${number(stats.r,3)} · 均重 ${number(stats.meanMass)} g`:'';
    if($('comparison').open)comparisons[slot].draw(saved?.rows||[],{mini:true,mode:'individual',plot:state.plot,focusSpecies:false,size:PLOT_VIEWS[state.plot].size,shade:PLOT_VIEWS[state.plot].shade});
  }
  $('export-comparison').disabled=!state.saved.a||!state.saved.b;
  if(state.saved.a&&state.saved.b){const a=summarize(state.saved.a.rows),b=summarize(state.saved.b.rows),ids=new Set(state.saved.a.rows.map(r=>r.record_id)),overlap=state.saved.b.rows.filter(r=>ids.has(r.record_id)).length;const delta=b.meanMass-a.meanMass;$('comparison-delta').textContent=`B 相比 A：平均体重 ${delta>=0?'+':''}${number(delta)} g；两组重合 ${overlap} 条记录。两幅图使用相同坐标；面积均表示${BUBBLE_FIELDS[PLOT_VIEWS[state.plot].size].label}，深浅均表示${BUBBLE_FIELDS[PLOT_VIEWS[state.plot].shade].label}。`;}else $('comparison-delta').textContent='A/B 保留的是当时的记录与筛选条件，之后的操作不会改变已保存组。';
}
function save(slot){state.saved[slot]=snapshot(currentRows(),{...state.scope,view:state.mode,plot:state.plot,size:state.size,shade:state.shade});state.saved[slot].viewState=captureView();$('comparison-status').textContent=`已保留 ${slot.toUpperCase()} 组 ${state.saved[slot].rows.length} 条样本。`;renderComparisons();announce($('comparison-status').textContent);}
function download(rows,filename,grouped=false){
  const fields=[...(grouped?['group']:[]),'record_id','species','island','year','sex','flipper_length_mm','body_mass_g','bill_length_mm','bill_depth_mm'];
  const csv='\uFEFF'+window.d3.csvFormat(rows,fields),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=element('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}


function syncRanges(){
  if(state.numericPlot===state.plot)return;
  state.numericPlot=state.plot;
  const p=PLOT_VIEWS[state.plot];
  for(const [axis,field,ids,defaults] of [['x',p.x,['flipper-min','flipper-max'],p.defaults[0]],['y',p.y,['mass-min','mass-max'],p.defaults[1]]]){
    const meta=BUBBLE_FIELDS[field],values=state.scope.range?.[field]||defaults;
    ids.forEach((id,index)=>{const input=$(id);input.value=values[index];input.min=meta.domain[0];input.max=meta.domain[1];input.step=field==='body_mass_g'?50:field==='flipper_length_mm'?1:.1;$(id+'-label').textContent=meta.label+(index?'上限':'下限')+' / '+meta.unit;});
  }
  $('range-error').textContent='';
}
function renderObservation(rows){
  const observation=describePlot(rows,state.plot),p=PLOT_VIEWS[state.plot],field=BUBBLE_FIELDS[p.y];
  $('observation-title').textContent=observation.title;$('observation-copy').textContent=observation.text;
  $('show-all-species').hidden=state.scope.species.length===SPECIES.length;
  $('species-summary').replaceChildren();
  observation.groups.forEach(group=>{
    const card=element('button');card.type='button';card.className='species-card';card.style.setProperty('--species-color',group.color);card.setAttribute('aria-label','只看'+group.name+'企鹅');
    card.append(element('strong',group.name),element('span',`n=${group.n} · r=${number(group.r,3)}`),element('small',`平均${field.label} ${number(group.meanY,field.unit==='g'?0:1)} ${field.unit}　仅看此物种 →`));
    card.addEventListener('pointerenter',()=>chart.focusSpecies(group.id));card.addEventListener('pointerleave',()=>chart.focusSpecies(null));card.addEventListener('focus',()=>chart.focusSpecies(group.id));card.addEventListener('blur',()=>chart.focusSpecies(null));
    card.addEventListener('click',()=>change(()=>state.scope.species=[group.id]));$('species-summary').append(card);
  });
}
function tickPlayback(){
  if(state.scope.year===2009){if($('loop-play').checked)state.scope.year=2007;else{stop();return;}}else state.scope.year++;
  clearPinned();refresh(true);if(state.scope.year===2009&&!$('loop-play').checked)stop();
}
function startPlayback(){
  experience.leaveGuide();
  state.scope.allYears=false;state.scope.range=null;state.brush=false;clearPinned();if(state.scope.year===2009)state.scope.year=2007;
  refresh(true);$('play').textContent='Ⅱ 暂停播放';$('play').setAttribute('aria-pressed','true');state.timer=setInterval(tickPlayback,+$('play-speed').value);
}

try{
  const response=await fetch(new URL('../EDA_企鹅数据探索/penguins.csv',import.meta.url));if(!response.ok)throw new Error(`CSV HTTP ${response.status}`);const csvText=await response.text();state.model=parsePenguins(csvText);state.sourceHash=csvFingerprint(csvText);experience.initialize();
  SPECIES.forEach(s=>{const label=element('label');label.className='continent-option';const input=element('input');input.type='checkbox';input.name='species';input.value=s.id;input.checked=true;input.setAttribute('aria-label',s.name);input.addEventListener('change',()=>change(()=>state.scope.species=[...document.querySelectorAll('input[name="species"]:checked')].map(el=>el.value)));const dot=element('i');dot.className='swatch';dot.style.background=s.color;label.append(input,dot,document.createTextNode(s.name),element('small',s.id));$('species-options').append(label);const legend=element('span');const marker=element('i');marker.className='swatch';marker.style.background=s.color;legend.append(marker,document.createTextNode(s.name));$('annual-legend').append(legend);});
  $('year').addEventListener('input',e=>change(()=>{state.scope.year=+e.target.value;state.scope.allYears=false;},true));$('all-years').addEventListener('change',e=>change(()=>state.scope.allYears=e.target.checked,true));
  $('sex').addEventListener('change',e=>change(()=>state.scope.sex=e.target.value));$('island').addEventListener('change',e=>change(()=>state.scope.island=e.target.value));$('size-field').addEventListener('change',e=>change(()=>state.size=e.target.value,true));
  $('shade-field').addEventListener('change',e=>{state.shade=e.target.value;tip.hidden=true;refresh(true);});
  for(const view of ['individual','species'])$(`view-${view}`).addEventListener('click',()=>change(()=>state.mode=view,true));
  $('reset').addEventListener('click',()=>change(()=>{state.scope=copyScope(DEFAULT_SCOPE);state.mode='individual';state.plot='body';state.annualMetric='body_mass_g';state.focusSpecies=true;state.numericPlot=null;state.size='bill_length_mm';state.shade='bill_depth_mm';}));
  $('play').addEventListener('click',()=>{if(state.timer)stop();else startPlayback();});
  $('play-speed').addEventListener('change',()=>{if(state.timer){clearInterval(state.timer);state.timer=setInterval(tickPlayback,+$('play-speed').value);}});
  $('focus-species').addEventListener('change',e=>{state.focusSpecies=e.target.checked;tip.hidden=true;refresh();});
  for(const plot of ['body','bill'])$('plot-'+plot).addEventListener('click',()=>change(()=>{state.plot=plot;state.numericPlot=null;state.annualMetric=PLOT_VIEWS[plot].y;state.size=PLOT_VIEWS[plot].size;state.shade=PLOT_VIEWS[plot].shade;},true));
  $('show-all-species').addEventListener('click',()=>change(()=>state.scope.species=SPECIES.map(species=>species.id)));
  $('brush-toggle').addEventListener('click',()=>{experience.leaveGuide();stop();state.brush=!state.brush;refresh();});$('clear-brush').addEventListener('click',()=>{experience.leaveGuide();state.scope.range=null;chart.setRange(null);updateSummary(true);});
  $('apply-range').addEventListener('click',()=>{
    const p=PLOT_VIEWS[state.plot],xf=BUBBLE_FIELDS[p.x],yf=BUBBLE_FIELDS[p.y];
    const x0=+$('flipper-min').value,x1=+$('flipper-max').value,y0=+$('mass-min').value,y1=+$('mass-max').value;
    if(![x0,x1,y0,y1].every(Number.isFinite)||x0<xf.domain[0]||x1>xf.domain[1]||y0<yf.domain[0]||y1>yf.domain[1]||x0>=x1||y0>=y1){$('range-error').textContent=`请在${xf.label}${xf.domain.join('—')}${xf.unit}、${yf.label}${yf.domain.join('—')}${yf.unit}内设置递增范围。`;return;}
    experience.leaveGuide();stop();$('range-error').textContent='';state.scope.range={[p.x]:[x0,x1],[p.y]:[y0,y1]};state.brush=true;refresh();
  });
  $('clear-detail').addEventListener('click',()=>{clearPinned();chart.pin(null);});$('annual-metric').addEventListener('change',e=>{state.annualMetric=e.target.value;drawAnnual($('annual-chart'),annualSeries(state.model.valid,state.scope,state.annualMetric),state.annualMetric,state.scope.year,state.scope.allYears);});
  $('comparison').addEventListener('toggle',()=>{if($('comparison').open)renderComparisons();});
  for(const slot of ['a','b']){$(`capture-${slot}`).addEventListener('click',()=>save(slot));$(`restore-${slot}`).addEventListener('click',()=>{const saved=state.saved[slot];if(!saved)return;experience.leaveGuide();applyView(saved.viewState||{...captureView(),scope:saved.scope,mode:saved.scope.view||'individual',plot:saved.scope.plot||'body',size:saved.scope.size||'bill_length_mm',shade:saved.scope.shade||'bill_depth_mm'});$('explorer').scrollIntoView({block:'start'});});}
  $('sex-example').addEventListener('click',()=>{experience.leaveGuide();stop();sexComparison();});
  $('export-current').addEventListener('click',()=>download(currentRows(),`penguins-${state.scope.allYears?'all-years':state.scope.year}-filtered.csv`));$('export-comparison').addEventListener('click',()=>download(['a','b'].flatMap(slot=>state.saved[slot].rows.map(r=>({...r,group:slot.toUpperCase()}))),'penguins-comparison.csv',true));
  let lastWidth=0,resizeFrame;new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(Math.abs(width-lastWidth)<1)return;lastWidth=width;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>refresh());}).observe($('scatter').parentElement);
  refresh();
}catch(error){console.error(error);$('coverage-note').textContent='数据未能加载，请刷新重试或下载原始 CSV。';$('selection-status').textContent='若本地查看，请通过静态服务器打开网页，或使用提供的单文件离线版。';}
