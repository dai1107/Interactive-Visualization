import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname, sep } from 'node:path';
import { handleLlmRequest } from '../api/penguin-llm.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function createPenguinServer({env=process.env,fetchImpl=fetch}={}){
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.csv':'text/csv','.svg':'image/svg+xml','.png':'image/png'};
  return createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/api/penguin-llm'){
        const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
        const reply=await handleLlmRequest(request,env,fetchImpl);res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
      const path=decodeURIComponent(url.pathname),file=resolve(root,path==='/'?'index.html':'.'+path),rel=relative(root,file);
      const allowed=path==='/'||path==='/index.html'||['/assets/','/vendor/','/EDA_企鹅数据探索/'].some(prefix=>path.startsWith(prefix));
      if(!allowed||rel.startsWith('..'+sep)||rel==='..'||rel.split(sep).some(part=>part.startsWith('.'))||!types[extname(file)]){res.writeHead(404);res.end();return;}
      const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]+';charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404);res.end('Not found');}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8894);
  const env={...process.env,LLM_ALLOWED_ORIGINS:process.env.LLM_ALLOWED_ORIGINS||`http://127.0.0.1:${port},http://localhost:${port},https://dai1107.github.io`};
  createPenguinServer({env}).listen(port,'127.0.0.1',()=>console.log(`Penguin local preview: http://127.0.0.1:${port}`));
}
