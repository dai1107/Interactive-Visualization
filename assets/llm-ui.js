import { LLM_ENDPOINT } from './llm-config.js?v=atelier-20261113c';
import { llmViewKey, llmEvidence, validateLlmReply, llmConnectionURL, describeLlmView } from './llm-model.js?v=atelier-20261113c';
import { selectedRows, summarizePlot } from './bubble-model.js?v=atelier-20261113c';

export function createLlmAssistant({rows,fingerprint,getView,applyView,draft,announce}) {
  const find=id=>document.getElementById(id);
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  let connected=false,endpoint='',access='',controller=null,sequence=0,reply=null,sourceView=null,previousView=null,applied=false;
  const rText=r=>r===null?'不可计算':r.toFixed(3);
  function status(message){find('llm-status').textContent=message;}
  function controls(){find('llm-submit').disabled=!connected||Boolean(controller);find('llm-cancel').hidden=!controller;find('llm-disconnect').hidden=!connected;}
  function render(){
    if(!rows().length)return;
    const view=getView(),stats=summarizePlot(selectedRows(rows(),view.scope),view.plot);
    find('llm-current').textContent=`当前图表：${describeLlmView(view)} · n=${stats.n} · r=${rText(stats.r)}`;
    const stale=Boolean(reply&&sourceView&&llmViewKey(view)!==llmViewKey(sourceView));
    find('llm-stale').hidden=!stale;find('llm-stale').textContent=applied?'已应用模型建议；下方解读仍对应提问时的数据快照。':'图表条件已改变。下方回答对应提问时快照；请重新提问后再应用建议。';
    find('llm-apply').disabled=!reply?.proposal||stale||applied;
    find('llm-draft').disabled=!reply||stale;
    find('llm-undo').hidden=!previousView;
  }
  function cancel(){sequence++;controller?.abort();controller=null;controls();}
  function disconnect(){cancel();connected=false;access='';find('llm-access').value='';status('未连接模型服务，当前没有调用 LLM。');controls();}
  async function connect(){
    cancel();const currentSequence=sequence;connected=false;access='';controls();
    try{
      endpoint=llmConnectionURL(find('llm-endpoint').value.trim());
      const token=find('llm-access').value;
      if(token.length<16)throw new Error('请输入后端配置的访问口令（至少16位），这里不填写 DeepSeek API Key。');
      status('正在检查助手后端…');
      const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const health=await response.json();
      if(currentSequence!==sequence)return;
      if(!response.ok||health.protocol!=='penguin-llm-v1')throw new Error('地址不是可用的企鹅助手后端，请检查部署地址与跨域配置。');
      if(!health.ready)throw new Error('后端尚未配置模型密钥与访问口令，未调用 LLM。');
      // A health check does not generate billable model text; authenticate separately.
      if(!health.authenticated)throw new Error('访问口令不正确，未调用 LLM。');
      connected=true;access=token;find('llm-access').value='';
      try{localStorage.setItem('penguin-llm-endpoint',endpoint);}catch{}
      status(`已连接 ${health.model}。点击提问后才会发送问题与当前筛选条件，可能产生 API 费用。`);announce('模型服务已连接。');
    }catch(error){if(currentSequence===sequence)status(error.name==='AbortError'?'连接已取消。':error.message||'连接失败，请检查服务地址。');}
    controls();
  }
  async function submit(){
    const question=find('llm-question').value.trim();
    if(!connected){status('请先连接自己的模型服务。');return;}
    if(!question||question.length>600){status('请输入问题，最多600字。');return;}
    cancel();const currentSequence=sequence;controller=new AbortController();const requestController=controller;
    const timeout=setTimeout(()=>requestController.abort(),55000);
    sourceView=getView();reply=null;applied=false;previousView=null;find('llm-result').hidden=true;controls();render();status('正在请求模型，统计依据来自当前样本快照…');
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},credentials:'omit',body:JSON.stringify({question,view:sourceView,sourceFingerprint:fingerprint()}),signal:requestController.signal});
      const data=await response.json();
      if(currentSequence!==sequence)return;
      if(!response.ok)throw new Error(data.error||'模型请求失败。');
      const checked=validateLlmReply(data.reply),expected=llmEvidence(rows(),sourceView,fingerprint());
      if(data.evidence?.sourceFingerprint!==fingerprint()||JSON.stringify(data.evidence)!==JSON.stringify(expected))throw new Error('后端统计与当前原始数据不一致，未使用这份回答。');
      reply=checked;find('llm-result').hidden=false;find('llm-answer').textContent=reply.answer;
      const evidenceStats=expected.selected[sourceView.plot];
      find('llm-evidence').textContent=`提问快照：${describeLlmView(sourceView)} · n=${evidenceStats.n} · r=${rText(evidenceStats.r)}。数据卡由原始 CSV 计算；下方文字为模型解读，请核对。`;
      find('llm-meta').textContent=`模型：${String(data.model).slice(0,100)} · ${new Date(data.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）`;
      find('llm-followups').replaceChildren();reply.followUps.forEach(question=>{const button=make('button',question);button.className='text-button';button.addEventListener('click',()=>{find('llm-question').value=question;find('llm-question').focus();});find('llm-followups').append(button);});
      find('llm-proposal').hidden=!reply.proposal;
      if(reply.proposal){const view=reply.proposal.view,stats=summarizePlot(selectedRows(rows(),view.scope),view.plot);find('llm-proposal-copy').textContent=`${reply.proposal.label}。${describeLlmView(view)} · 预计 n=${stats.n} · r=${rText(stats.r)}。应用后统计由原始数据重新计算。`;}
      status('模型回答已返回，尚未应用任何候选操作。');announce('模型回答已生成。');
    }catch(error){if(currentSequence===sequence)status(error.name==='AbortError'?'请求已取消或超时，没有生成可用回答。':error.message||'模型请求失败，请重试。');}
    finally{clearTimeout(timeout);if(currentSequence===sequence){controller=null;controls();render();}}
  }
  function initialize(){
    let saved='';try{saved=localStorage.getItem('penguin-llm-endpoint')||'';}catch{}
    find('llm-endpoint').value=LLM_ENDPOINT||saved;
    find('llm-connect').addEventListener('click',connect);find('llm-disconnect').addEventListener('click',disconnect);
    find('llm-submit').addEventListener('click',submit);find('llm-cancel').addEventListener('click',()=>{cancel();status('已取消等待；已经发出的 API 请求可能仍产生用量。');});
    for(const button of find('llm-examples').querySelectorAll('button'))button.addEventListener('click',()=>{find('llm-question').value=button.textContent;find('llm-question').focus();});
    find('llm-apply').addEventListener('click',()=>{if(!reply?.proposal||llmViewKey(getView())!==llmViewKey(sourceView)||applied)return;previousView=getView();applied=true;applyView(reply.proposal.view);render();status('已应用模型建议，图表统计已由原始 CSV 重新计算。');});
    find('llm-undo').addEventListener('click',()=>{if(!previousView)return;const view=previousView;previousView=null;applied=false;applyView(view);render();status('已恢复应用建议前的条件。');});
    find('llm-draft').addEventListener('click',()=>{if(!reply)return;draft(`LLM探索：${find('llm-question').value.slice(0,60)}`,`【模型解读，需核对】\n${reply.answer}\n${find('llm-evidence').textContent}`);});
    status('未连接模型服务，当前没有调用 LLM。');controls();render();
  }
  return {initialize,render};
}
