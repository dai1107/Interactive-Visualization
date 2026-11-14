import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildWorker } from '../scripts/build_worker.mjs';
import { csvFingerprint, discoveryView } from '../assets/bonus-model.js';

const destination = fileURLToPath(new URL('../.tmp/worker-test/penguin-llm.mjs', import.meta.url));
await buildWorker(destination);
const { default: worker } = await import(pathToFileURL(destination));
const csv = await readFile(new URL('../EDA_企鹅数据探索/penguins.csv', import.meta.url), 'utf8');
const env = { DEEPSEEK_API_KEY: 'WORKER_TEST_FIXTURE_ONLY', LLM_ACCESS_TOKEN: 'worker-unit-test-access-only', LLM_ALLOWED_ORIGINS: 'https://dai1107.github.io' };
const post = (overrides = {}, token = env.LLM_ACCESS_TOKEN, origin = 'https://dai1107.github.io') => new Request('https://worker.example/api/penguin-llm', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, Origin: origin },
  body: JSON.stringify({ question: '只看帽带雌性企鹅', view: discoveryView(3), sourceFingerprint: csvFingerprint(csv), ...overrides }),
});

test('standalone Worker health reads runtime bindings without exposing credentials', async () => {
  const empty = await worker.fetch(new Request('https://worker.example/'), {});
  assert.equal((await empty.json()).ready, false);
  const connected = await worker.fetch(new Request('https://worker.example/api/penguin-llm', { headers: { Authorization: 'Bearer ' + env.LLM_ACCESS_TOKEN } }), env);
  const health = await connected.json();
  assert.equal(health.ready, true); assert.equal(health.authenticated, true); assert.equal(health.protocol, 'penguin-llm-v1');
  assert.ok(!JSON.stringify(health).includes(env.DEEPSEEK_API_KEY));
  assert.equal((await worker.fetch(new Request('https://worker.example/.env'), env)).status, 404);
});

test('standalone Worker enforces browser origin, access token and original data version', async () => {
  assert.equal((await worker.fetch(post({}, 'wrong'), env)).status, 401);
  assert.equal((await worker.fetch(post({}, env.LLM_ACCESS_TOKEN, 'https://other.example'), env)).status, 403);
  assert.equal((await worker.fetch(post({ sourceFingerprint: 'outdated' }), env)).status, 409);
  const response = await worker.fetch(new Request('https://worker.example/api/penguin-llm', { method: 'OPTIONS', headers: { Origin: 'https://dai1107.github.io' } }), env);
  assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://dai1107.github.io');
});

test('standalone Worker recomputes real CSV evidence before a clearly marked mock provider call', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer ' + env.DEEPSEEK_API_KEY);
    const evidence = JSON.parse(JSON.parse(options.body).messages[1].content).evidence;
    assert.equal(evidence.selected.body.n, 144); assert.equal(evidence.referenceN, 342);
    return Response.json({ model: 'WORKER_TEST_FIXTURE_NOT_LIVE', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: '这是自动测试夹具。', followUps: [], proposal: null }) } }] });
  });
  const response = await worker.fetch(post(), env);
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(calls, 1); assert.equal(result.evidence.selected.body.n, 144); assert.equal(result.model, 'WORKER_TEST_FIXTURE_NOT_LIVE');
  assert.ok(!JSON.stringify(result).includes(env.DEEPSEEK_API_KEY)); assert.ok(!JSON.stringify(result).includes(env.LLM_ACCESS_TOKEN));
});
