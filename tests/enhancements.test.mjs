import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePenguins } from '../assets/data.js';
import { DEFAULT_SCOPE, copyScope, selectedRows, snapshot } from '../assets/bubble-model.js';
import { validateSelection, selectByRules, compareSets } from '../assets/selection-model.js';
import { correlationLens, metricComparison } from '../assets/insight-model.js';
import { discoveryView, explorationRecord, notebookPayload, validateNotebook, validateView, csvFingerprint, recordMarkdown } from '../assets/bonus-model.js';

const csv = await readFile(new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url), 'utf8');
const rows = parsePenguins(csv).valid;
const range = (op, field, lo, hi) => ({kind:'range', op, label:field, range:{[field]:[lo, hi]}});
const all = {...copyScope(DEFAULT_SCOPE), allYears:true};

test('ordered selection algebra matches independent ID sets without escaping the filter universe', () => {
  const a=range('replace','body_mass_g',3000,4000), b=range('union','flipper_length_mm',200,210);
  const ids=new Set(rows.filter(r=>(r.body_mass_g>=3000&&r.body_mass_g<=4000)||(r.flipper_length_mm>=200&&r.flipper_length_mm<=210)).map(r=>r.record_id));
  const actual=selectedRows(rows,{...all,selection:[a,b]});
  assert.deepEqual(actual.map(r=>r.record_id),rows.filter(r=>ids.has(r.record_id)).map(r=>r.record_id));
  assert.ok(selectByRules(rows,[range('subtract','body_mass_g',3000,4000)]).every(r=>r.body_mass_g<3000||r.body_mass_g>4000));
  const female=selectedRows(rows,{...all,sex:'female',selection:[a,b]});
  assert.ok(female.every(r=>r.sex==='female'&&ids.has(r.record_id)));
  assert.deepEqual(selectByRules(rows.slice(0,2),[{kind:'ids',op:'replace',label:'saved',ids:rows.slice(0,8).map(r=>r.record_id)}]),rows.slice(0,2));
});

test('cross-perspective intersections and subtractions select exact original observations', () => {
  const rules=[range('replace','flipper_length_mm',180,200),range('intersect','body_mass_g',3000,4000),range('subtract','bill_depth_mm',17,18)];
  const result=selectedRows(rows,{...all,selection:rules});
  assert.deepEqual(result,rows.filter(r=>r.flipper_length_mm>=180&&r.flipper_length_mm<=200&&r.body_mass_g>=3000&&r.body_mass_g<=4000&&!(r.bill_depth_mm>=17&&r.bill_depth_mm<=18)));
  assert.equal(selectedRows(rows,{...all,selection:rules.slice(0,2)}).length,144);
});

test('clickable histogram rules use half-open bins except the final endpoint', () => {
  const bucket={...range('replace','body_mass_g',3500,4000),exclusive:['body_mass_g']};
  const actual=selectByRules(rows,[bucket]);
  assert.deepEqual(actual,rows.filter(r=>r.body_mass_g>=3500&&r.body_mass_g<4000));
  assert.ok(rows.some(r=>r.body_mass_g===4000));
  assert.ok(!actual.some(r=>r.body_mass_g===4000));
});

test('composite selection survives independent snapshot and notebook restore, and rejects forged IDs', () => {
  const view=discoveryView(0);view.scope.selection=[range('replace','body_mass_g',3000,4000),range('intersect','bill_length_mm',40,50)];
  const original=selectedRows(rows,view.scope), saved=snapshot(original,view.scope);
  const fingerprint=csvFingerprint(csv),record=explorationRecord(rows,view,fingerprint,{id:'composite'});
  const payload=JSON.parse(JSON.stringify(notebookPayload([record],fingerprint)));
  assert.deepEqual(validateNotebook(payload,rows,fingerprint)[0].ids,original.map(r=>r.record_id));
  assert.match(recordMarkdown(record,rows),/组合选择：1\. 替换/);
  view.scope.selection[0].range.body_mass_g[0]=3900;
  assert.equal(saved.scope.selection[0].range.body_mass_g[0],3000);
  assert.equal(record.view.scope.selection[0].range.body_mass_g[0],3000);
  payload.records[0].ids.pop();assert.throws(()=>validateNotebook(payload,rows,fingerprint),/编号/);
  assert.throws(()=>validateSelection([range('replace','body_mass_g',-1,4000)]));
  assert.throws(()=>validateSelection([{kind:'ids',op:'union',label:'bad',ids:['P999']}]));
  assert.throws(()=>validateSelection(Array(13).fill(range('union','body_mass_g',3000,4000))));
  assert.throws(()=>validateView({...record.view,mode:'species'}),/均值视图/);
});

test('correlation lens reveals actual pooled reversal and handles empty and constant samples', () => {
  const lens=correlationLens(rows,'bill');
  assert.equal(lens.reversed,true);assert.ok(Math.abs(lens.total.r-(-.2350529))<.00001);
  assert.ok(lens.groups.every(g=>g.r>0));assert.ok(lens.within.r>0);
  assert.equal(lens.groups.reduce((n,g)=>n+g.n,0),342);
  assert.equal(correlationLens([]).within.r,null);
  assert.equal(correlationLens(Array.from({length:3},()=>rows[0])).total.r,null);
  assert.equal(correlationLens(rows,'body','sex').groups.reduce((n,g)=>n+g.n,0),342);
});

test('within-group centering is invariant to adding separate group offsets', () => {
  const synthetic=[0,1,2].flatMap(i=>[{species:'Adelie',flipper_length_mm:i,body_mass_g:i},{species:'Gentoo',flipper_length_mm:100+i,body_mass_g:-100+i}]);
  const lens=correlationLens(synthetic);
  assert.equal(lens.within.r,1);assert.ok(lens.total.r<0);assert.equal(lens.reversed,true);
  const shifted=synthetic.map(r=>({...r,flipper_length_mm:r.flipper_length_mm+(r.species==='Adelie'?300:-700),body_mass_g:r.body_mass_g+(r.species==='Adelie'?200:300)}));
  assert.equal(correlationLens(shifted).within.r,1);
});

test('comparison set operations partition overlap and preserve a fixed A/B snapshot', () => {
  const a=rows.slice(0,100),b=rows.slice(50,150),result=compareSets(a,b);
  assert.equal(result.intersection.length,50);assert.equal(result.union.length,150);
  assert.equal(result.aOnly.length,50);assert.equal(result.bOnly.length,50);
  assert.equal(result.aOnly.length+result.intersection.length+result.bOnly.length,result.union.length);
  assert.deepEqual(compareSets(a,b),result);assert.equal(a.length,100);
});

test('four-metric differences use raw means and return no fabricated values for empty cohorts', () => {
  const a=rows.slice(0,10),b=rows.slice(20,40);
  for(const metric of metricComparison(a,b)) {
    const expected=b.reduce((sum,r)=>sum+r[metric.field],0)/b.length-a.reduce((sum,r)=>sum+r[metric.field],0)/a.length;
    assert.ok(Math.abs(metric.delta-expected)<1e-9);
  }
  assert.ok(metricComparison([],b).every(metric=>metric.delta===null&&metric.a===null));
});
