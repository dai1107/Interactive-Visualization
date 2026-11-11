import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePenguins } from '../assets/data.js';
import { discoveryView, csvFingerprint } from '../assets/bonus-model.js';
import { llmEvidence, validateLlmReply, llmConnectionURL } from '../assets/llm-model.js';
import { askLlm, llmSettings } from '../server/llm-core.js';
import { handleLlmRequest } from '../api/penguin-llm.mjs';

const csv=readFileSync(new URL('../EDA_企鹅数据探索/penguins.csv',import.meta.url),'utf8'),rows=parsePenguins(csv).valid;
const fingerprint=csvFingerprint(csv),view=discoveryView(3);
const env={DEEPSEEK_API_KEY:'unit-test-key-only',LLM_ACCESS_TOKEN:'unit-test-access-only',LLM_ALLOWED_ORIGINS:'https://dai1107.github.io'};
const payload={question:'只看帽带雌性企鹅',view,sourceFingerprint:fingerprint};
const reply={answer:'测试夹具：这里不是实际模型生成。',followUps:['继续比较什么？'],proposal:{label:'候选帽带雌性',view:discoveryView(4)}};
const responseFixture=()=>Response.json({model:'TEST_FIXTURE_NOT_A_LIVE_MODEL',choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}],usage:{prompt_tokens:10,completion_tokens:20}});
function request(body=payload,token=env.LLM_ACCESS_TOKEN,origin='https://dai1107.github.io'){
 return new Request('https://backend.example/api/penguin-llm',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,Origin:origin},body:JSON.stringify(body)});
}

test('LLM evidence is recomputed from the real selection and both coordinate perspectives',()=>{
 const evidence=llmEvidence(rows,view,fingerprint);
 assert.equal(evidence.selected.body.n,144);assert.equal(evidence.remainder.n,198);assert.equal(evidence.referenceN,342);
 assert.ok(Math.abs(evidence.selected.body.r-.218)<.001);
 assert.deepEqual(evidence.selected.species.map(s=>s.body.n),[100,44,0]);
 assert.equal(llmEvidence(rows,discoveryView(1),fingerprint).selected.bill.r<0,true);
 assert.equal(evidence.selected.measurements.find(m=>m.field==='body_mass_g').mean,3553.9930555555557);
 assert.ok(!Object.hasOwn(evidence,'records'));assert.ok(!Object.hasOwn(evidence,'notes'));
});

test('model output allows only valid chart fields and leaves executable content as inert text',()=>{
 assert.deepEqual(validateLlmReply(reply),reply);
 const invalid=structuredClone(reply);invalid.proposal.view.scope.range={code:'alert(1)'};
 assert.throws(()=>validateLlmReply(invalid));
 assert.throws(()=>validateLlmReply({...reply,answer:' '}));
 assert.throws(()=>validateLlmReply({...reply,followUps:Array(4).fill('x')}));
 const text=validateLlmReply({...reply,answer:'<script>alert(1)</script>',proposal:null});
 assert.equal(text.answer,'<script>alert(1)</script>');
});

test('connection addresses reject URL credentials, queries and insecure external endpoints',()=>{
 assert.equal(llmConnectionURL('https://backend.example/api/penguin-llm'),'https://backend.example/api/penguin-llm');
 assert.ok(llmConnectionURL('http://127.0.0.1:8894/api/penguin-llm'));
 for(const url of ['http://external.example/api','https://user:password@example.com/api','https://example.com/api?key=secret','https://api.deepseek.com/chat/completions'])assert.throws(()=>llmConnectionURL(url));
});

test('DeepSeek-compatible request uses server credentials, bounded JSON output and audited evidence',async()=>{
 let calls=0;
 const result=await askLlm({payload,rows,csv,settings:llmSettings(env),fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');
   assert.equal(options.headers.Authorization,'Bearer unit-test-key-only');
   const body=JSON.parse(options.body);assert.equal(body.model,'deepseek-flash');assert.equal(body.response_format.type,'json_object');assert.equal(body.thinking.type,'disabled');assert.equal(body.stream,false);
   assert.equal(JSON.parse(body.messages[1].content).evidence.selected.body.n,144);
   assert.equal(options.redirect,'error');return responseFixture();
 }});
 assert.equal(calls,1);assert.equal(result.model,'TEST_FIXTURE_NOT_A_LIVE_MODEL');assert.equal(result.reply.proposal.view.scope.sex,'female');
 assert.ok(!JSON.stringify(result).includes(env.DEEPSEEK_API_KEY));assert.ok(!JSON.stringify(result).includes(env.LLM_ACCESS_TOKEN));
});

test('missing credentials, access failures, origin failures and health checks never invoke a model',async()=>{
 let calls=0;const unusedFetch=async()=>{calls++;return responseFixture();};
 assert.equal((await handleLlmRequest(request(),{},unusedFetch)).status,503);
 assert.equal((await handleLlmRequest(request(payload,'wrong-token'),env,unusedFetch)).status,401);
 assert.equal((await handleLlmRequest(request(payload,env.LLM_ACCESS_TOKEN,'https://unrelated.example'),env,unusedFetch)).status,403);
 const health=await handleLlmRequest(new Request('https://backend.example/api/penguin-llm',{headers:{Authorization:'Bearer '+env.LLM_ACCESS_TOKEN}}),env,unusedFetch);
 assert.equal((await health.json()).authenticated,true);
 const publicHealth=await handleLlmRequest(new Request('https://backend.example/api/penguin-llm'),env,unusedFetch);
 assert.equal((await publicHealth.json()).authenticated,false);
 const preflight=await handleLlmRequest(new Request('https://backend.example/api/penguin-llm',{method:'OPTIONS',headers:{Origin:'https://dai1107.github.io'}}),env,unusedFetch);
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://dai1107.github.io');assert.equal(calls,0);
});

test('invalid data versions and oversized questions are rejected before provider invocation',async()=>{
 let calls=0;const unusedFetch=async()=>{calls++;return responseFixture();};
 assert.equal((await handleLlmRequest(request({...payload,sourceFingerprint:'changed'}),env,unusedFetch)).status,409);
 assert.equal((await handleLlmRequest(request({...payload,question:'x'.repeat(601)}),env,unusedFetch)).status,400);
 assert.equal(calls,0);
});

test('empty, truncated or invalid model suggestions never become successful generated answers',async()=>{
 for(const choice of [{finish_reason:'length',message:{content:'{}'}},{finish_reason:'stop',message:{content:' '}},{finish_reason:'stop',message:{content:JSON.stringify({...reply,proposal:{label:'invalid',view:{plot:'javascript'}}})}}]){
  const response=await handleLlmRequest(request(),env,async()=>Response.json({choices:[choice]}));
  assert.equal(response.status,502);assert.ok((await response.json()).error);assert.ok(!response.headers.has('Authorization'));
 }
});

test('provider failures are sanitized and never return provider secrets or raw error bodies',async()=>{
 const response=await handleLlmRequest(request(),env,async()=>new Response('error containing unit-test-key-only',{status:401}));
 assert.equal(response.status,502);const text=await response.text();assert.ok(!text.includes('unit-test-key-only'));assert.ok(text.includes('密钥无效'));
});
