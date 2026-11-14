import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const modules = ['assets/data.js', 'assets/selection-model.js', 'assets/bubble-model.js', 'assets/bonus-model.js', 'assets/llm-model.js', 'server/llm-core.js'];
const flatten = source => source.replace(/^import .+?;\s*$/gm, '').replace(/^export /gm, '');

// Bundle the audited CSV and existing handler. Never read .env or process.env.
export async function buildWorker(destination = fileURLToPath(new URL('dist-worker/penguin-llm.mjs', root))) {
  const csvBytes = await readFile(new URL('EDA_企鹅数据探索/penguins.csv', root));
  const csv = csvBytes.toString('utf8');
  const parts = await Promise.all(modules.map(async path => flatten(await readFile(new URL(path, root), 'utf8'))));
  let handler = await readFile(new URL('api/penguin-llm.mjs', root), 'utf8');
  const csvLoader = "const serverCsv=readFileSync(new URL('../EDA_企鹅数据探索/penguins.csv',import.meta.url),'utf8');";
  const defaultHandler = 'export default { fetch:request=>handleLlmRequest(request) };';
  if (!handler.includes(csvLoader) || !handler.includes(defaultHandler)) throw new Error('API entry changed; update the Worker bundler before deploying.');
  handler = handler.replace(csvLoader, 'const serverCsv=' + JSON.stringify(csv) + ';').replace(defaultHandler, '');
  const source = [
    '// Generated with node scripts/build_worker.mjs. No API key or access token is embedded.',
    '// Cloudflare compatibility flag required: nodejs_compat.',
    "import { timingSafeEqual } from 'node:crypto';",
    "import { Buffer } from 'node:buffer';",
    ...parts,
    flatten(handler),
    `export default {
  fetch(request, env = {}) {
    const path = new URL(request.url).pathname;
    if (path !== '/' && path !== '/api/penguin-llm') return Response.json({error:'Not found'}, {status:404});
    return handleLlmRequest(request, env);
  }
};`,
  ].join('\n');
  if (/readFileSync|from ['"]\.\.?\//.test(source)) throw new Error('Worker must not depend on runtime files or relative imports.');
  const output = resolve(destination);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, source, 'utf8');
  return { output, bytes: Buffer.byteLength(source), csvSha256: createHash('sha256').update(csvBytes).digest('hex'), compatibilityFlag: 'nodejs_compat' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildWorker(process.argv[2]), null, 2));
}
