import { readFileSync } from 'node:fs';
import { parsePenguins } from '../assets/data.js';
import { askLlm, authorizeLlm, llmSettings, LlmServiceError } from '../server/llm-core.js';

const serverCsv=readFileSync(new URL('../EDA_企鹅数据探索/penguins.csv',import.meta.url),'utf8');
const serverRows=parsePenguins(serverCsv).valid;
let inflight=0;
export async function handleLlmRequest(request, env=process.env, fetchImpl=fetch) {
  const headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  const send=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  try{
    const settings=llmSettings(env),origin=request.headers.get('Origin');
    if(origin&&!settings.origins.includes(origin))return send({error:'此页面来源未被助手后端允许。'},403);
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Methods']='GET,POST,OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type,Authorization';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method==='GET'){
      let authenticated=false;
      if(settings.ready){try{authorizeLlm(settings,request.headers.get('Authorization'));authenticated=true;}catch{}}
      return send({ready:settings.ready,authenticated,model:settings.model,protocol:'penguin-llm-v1'});
    }
    if(request.method!=='POST')return send({error:'仅支持GET、POST和OPTIONS。'},405);
    authorizeLlm(settings,request.headers.get('Authorization'));
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return send({error:'请求必须使用JSON。'},415);
    if(Number(request.headers.get('Content-Length'))>16384)return send({error:'请求过大。'},413);
    const reader=request.body?.getReader();if(!reader)return send({error:'缺少请求内容。'},400);
    const chunks=[];let total=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>16384)throw new LlmServiceError(413,'请求过大。');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new LlmServiceError(400,'请求JSON格式无效。');}
    if(inflight>=2)return send({error:'助手正在处理其他问题，请稍后重试。'},429);
    inflight++;try{return send(await askLlm({payload,rows:serverRows,csv:serverCsv,settings,fetchImpl}));}finally{inflight--;}
  }catch(error){return send({error:error instanceof LlmServiceError?error.message:'助手请求失败，未执行任何图表操作。'},error instanceof LlmServiceError?error.status:500);}
}
export default { fetch:request=>handleLlmRequest(request) };
