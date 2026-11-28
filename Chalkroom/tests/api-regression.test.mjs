
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
async function runRegression({app,helper,fallback,URL,Headers,Response,AbortController,AbortSignal,setTimeout,clearTimeout}){
  const results=[];
  async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message});}}
  const assert=(condition,message='assertion failed')=>{if(!condition)throw Error(message);};
  const rejects=async(fn,pattern)=>{try{await fn();}catch(e){assert(pattern.test(e.message),e.message);return e;}throw Error('expected rejection');};
  const window={location:{origin:'http://127.0.0.1:31416'}};
  new Function('window','URL',helper)(window,URL);
  const learning=window.chalkLearning;
  const cut=(start,end)=>{const i=app.indexOf(start),j=app.indexOf(end,i+1);assert(i>=0&&j>i,'source extraction '+start);return app.slice(i,j);};
  // Exercise the original app functions rather than reimplementing the adapters.
  const adapterSource=cut('async function api(','async function playVoice')+
    cut('const jsonPrompt =','async function geminiVoice')+
    cut('function boardCues(','async function refreshWorkExample');
  const adapter=new Function('window','learning','fetch','Headers','Response','URL','AbortController','AbortSignal','setTimeout','clearTimeout', 
    "let provider='FreeLLMAPI',key='test-key',current,studyPreferences={mode:'beginner'},geminiModel='gemini-3.6-flash',geminiSearch=false;const localGateway=true,alibaba='Alibaba Cloud',custom='Custom web API',freeLLM='FreeLLMAPI',tokenHarbor='Token Harbor',localAuto='Local API fallback',harborApi='https://tokenharbor.ai/v1',harborModel='mock-model',freeEndpoint=window.location.origin+'/v1',freeModel='auto:fast',profile={},dashHosts={Singapore:'mock.alibaba.test'},dashRegion='Singapore',customApi={endpoint:'https://mock.custom.test/v1/chat/completions',model:'mock-model',header:'Authorization',prefix:'Bearer',path:'choices.0.message.content'},lessonRequests=new Set();const updateRequests=()=>{};const tutor=()=>({name:'Professor Paws',personality:'patient'}),delivery=()=>({description:'gentle'});"+adapterSource+
    "\nreturn {teach,parseLesson,boardCues,gatewayProgress,setProvider:p=>provider=p,setGeminiSearch:v=>geminiSearch=v,requests:lessonRequests};"
  );
  let fetchImpl=()=>{throw Error('unexpected network')};
  const api=adapter(window,learning,(...args)=>fetchImpl(...args),Headers,Response,URL,AbortController,AbortSignal,setTimeout,clearTimeout);
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  const fixture=(title,phase='first')=>({title,relevance:'Apply this concept to a worked example.',steps:Array.from({length:phase==='rest'?2:1},(_,i)=>({title:'Step '+(i+1),lines:['Define the concept','Work an example'],explanations:['Start with the meaning.','Apply it carefully.'],narration:'Here is the idea.',conceptCards:[{type:'definition',title:'Idea',content:'A concise definition'}]})),questions:(phase==='first'||phase==='question')?[]:['easy','medium','challenge'].map(difficulty=>({difficulty,prompt:'Practice '+difficulty,answer:'Worked answer',hint:'Start with the definition'}))});
  const chat=lesson=>({choices:[{message:{content:JSON.stringify(lesson)}}]});
  const output=lesson=>({output:[{content:[{type:'output_text',text:JSON.stringify(lesson)}]}]});
  const providers=['FreeLLMAPI','Local API fallback','Custom web API','Token Harbor','OpenAI','Gemini','Alibaba Cloud'];
  const phases=['first','rest','question','practice_easy','practice_medium','practice_challenge'];
  const topics=['Compound interest','Newton’s laws','Photosynthesis','SQL joins','English grammar'];
  for(const provider of providers)for(const [i,phase] of phases.entries())await test(provider+' / '+phase,async()=>{
    api.setProvider(provider);
    const title=topics[i%topics.length], lesson=fixture(title,phase);
    fetchImpl=async(url,opts)=>{
      const body=JSON.parse(opts.body);
      assert(opts.signal,'missing signal');
      assert(JSON.stringify(body).includes('Learning mode:'),'missing learning mode');
      assert(JSON.stringify(body).includes('Tutor character:'),'missing tutor');
      assert(JSON.stringify(body).includes(title),'missing topic');
      if(provider==='OpenAI')return json(output(lesson));
      if(provider==='Gemini'){assert(url.includes('/gemini-3.6-flash:generateContent'),'wrong Gemini model');assert(!body.tools,'unexpected grounding');return json({candidates:[{content:{parts:[{text:JSON.stringify(lesson)}]}}]});}
      if(provider==='Alibaba Cloud')return json({output:{choices:[{message:{content:[{text:JSON.stringify(lesson)}]}}]}});
      if(provider!=='Local API fallback')assert(opts.headers.get('Authorization')==='Bearer test-key','wrong authorization');
      assert(body.stream===false,'unexpected streaming request');
      return json(chat(lesson));
    };
    const parsed=await api.teach(title,[],false,phase,'exam');
    assert(parsed.title===title&&parsed.learningMode==='exam','lesson metadata');
    assert(parsed.steps.length===(phase==='rest'?2:1),'step count');
    assert(api.boardCues(parsed.steps[0]).length===2,'cue alignment');
    if(phase.startsWith('practice_'))assert(parsed.questions.some(q=>q.difficulty===phase.slice(9)),'practice difficulty');
    assert(api.requests.size===0,'request leak');
  });
  for(const [name,bad] of [['invalid JSON',null],['blank title',{...fixture('X'),title:' '}],['empty lines',{...fixture('X'),steps:[{title:'A',narration:'N',lines:[]}]}],['blank narration',{...fixture('X'),steps:[{title:'A',narration:' ',lines:['x']}]}],['blank line',{...fixture('X'),steps:[{title:'A',narration:'N',lines:[' ']}]}]])await test('Parser rejects '+name,async()=>{await rejects(()=>api.parseLesson(bad?output(bad):{output:[{content:[{type:'output_text',text:'not json'}]}]}),/readable lesson|incomplete whiteboard/);});
  await test('Practice rejects wrong difficulty',async()=>{api.setProvider('OpenAI');fetchImpl=async()=>json(output(fixture('X')));await rejects(()=>api.teach('X',[],false,'practice_easy'),/no practice questions/);});
  await test('FreeLLMAPI first + three follow-ups use same key',async()=>{api.setProvider('FreeLLMAPI');let count=0;fetchImpl=async(u,o)=>{assert(o.headers.get('Authorization')==='Bearer test-key','key changed');count++;return json(chat(fixture('Math','question')));};for(const phase of ['first','question','question','question'])await api.teach('Math',[],false,phase);assert(count===4);});
  for(const code of [401,429,504])await test('FreeLLMAPI HTTP '+code+' recovery',async()=>{api.setProvider('FreeLLMAPI');fetchImpl=async()=>json({error:{message:'HTTP '+code}},code);const e=await rejects(()=>api.teach('X',[],false,'question'),new RegExp('HTTP '+code));assert(learning.recovery(e).kind===({401:'auth',429:'rate',504:'timeout'})[code]);assert(api.requests.size===0);});
  const routeSource=fallback.replace(/^import .*?;\s*$/gm,'').replace(/\bexport\s+/g,'');
  const router=new Function('AbortSignal',routeSource+'\nreturn {gatewayLesson,tryRoutes};')(AbortSignal);
  const upstream='http://127.0.0.1:31415/v1/chat/completions', backup={slot:2,key:'backup-test',model:'mock',url:{href:'https://backup.test'}};
  const body=JSON.stringify({model:'auto:fast',messages:[{role:'user',content:'Teach algebra'}],stream:false});
  const good=()=>json(chat(fixture('Algebra')));
  for(const status of [401,403,408,429,500,502,503,504])await test('Gateway '+status+' -> backup',async()=>{const signal=new AbortController().signal;const r=await router.gatewayLesson(body,'Bearer test-key',upstream,signal,async()=>[backup],async(url,opts)=>{if(url===upstream)return json({},status);assert(opts.headers.Authorization==='Bearer backup-test');return good();});assert(r.status===200&&JSON.parse(r.body).fallbackSlot===2);});
  await test('Malformed 200 -> backup',async()=>{const r=await router.gatewayLesson(body,'Bearer test-key',upstream,new AbortController().signal,async()=>[backup],async u=>u===upstream?json({choices:[{message:{content:'bad JSON'}}]}):good());assert(r.status===200&&JSON.parse(r.body).fallbackSlot===2);});
  await test('Malformed 200 without backup -> 502',async()=>{const r=await router.gatewayLesson(body,'Bearer test-key',upstream,new AbortController().signal,async()=>[],async()=>json({choices:[]}));assert(r.status===502&&/unreadable/.test(r.body));});
  await test('Valid 200 stays on primary',async()=>{let calls=0;const r=await router.gatewayLesson(body,'Bearer test-key',upstream,new AbortController().signal,async()=>[backup],async()=>{calls++;return good();});assert(r.status===200&&calls===1);});
  await test('No backup preserves 401',async()=>{const r=await router.gatewayLesson(body,'Bearer test-key',upstream,new AbortController().signal,async()=>[],async()=>json({},401));assert(r.status===401);});
  await test('No backup preserves timeout',async()=>{const r=await router.gatewayLesson(body,'Bearer test-key',upstream,new AbortController().signal,async()=>[],async()=>json({},504));assert(r.status===504);});
  await test('Invalid first backup falls through to next',async()=>{const second={...backup,slot:3,url:{href:'https://backup2.test'}};const r=await router.tryRoutes([backup,second],[],new AbortController().signal,async u=>u===backup.url?json({choices:[]}):good());assert(r.fallbackSlot===3);});
  await test('Cancelled gateway does not call backup',async()=>{const c=new AbortController();c.abort('cancelled');let calls=0;let failed=false;try{await router.gatewayLesson(body,'Bearer test-key',upstream,c.signal,async()=>[backup],async()=>{calls++;throw Error('cancelled');});}catch{failed=true;}assert(failed&&calls<=1);});
  await test('Provider annotations normalize source links',async()=>{const data=output(fixture('X'));data.output[0].content[0].annotations=[{type:'url_citation',url:'https://example.org/ref#one',title:'Reference'},{type:'url_citation',url:'https://example.org/ref#two',title:'Reference'},{type:'url_citation',url:'javascript:alert(1)'},null];const r=api.parseLesson(data);assert(r.sources.length===1&&r.sources[0].origin==='provider'&&r.searched);});
  await test('Gemini free mode skips search even when an earlier retry requested it',async()=>{
    api.setProvider('Gemini');api.setGeminiSearch(false);let calls=0;
    fetchImpl=async(u,o)=>{calls++;assert(!JSON.parse(o.body).tools);return json({candidates:[{content:{parts:[{text:JSON.stringify(fixture('X'))}]}}]});};
    const lesson=await api.teach('X',[],true,'first');assert(calls===1&&lesson.searchNotice&&!lesson.searched);
  });
  await test('Gemini grounding-specific quota retries once without search',async()=>{
    api.setProvider('Gemini');api.setGeminiSearch(true);let calls=0;
    fetchImpl=async(u,o)=>{calls++;const body=JSON.parse(o.body);if(calls===1){assert(body.tools);return json({error:{message:'Google Search grounding quota exceeded',details:[{violations:[{quotaId:'GroundingRequestsPerDay'}]}]}},429);}assert(!body.tools);return json({candidates:[{content:{parts:[{text:JSON.stringify(fixture('X'))}]}}]});};
    const lesson=await api.teach('X',[],true,'first');assert(calls===2&&lesson.searchNotice&&!lesson.searched);
  });
  await test('Gemini model daily quota is not retried',async()=>{
    api.setProvider('Gemini');api.setGeminiSearch(true);let calls=0;
    fetchImpl=async()=>{calls++;return json({error:{message:'Quota exceeded',details:[{violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier',quotaDimensions:{model:'gemini-3.6-flash'}}]}]}},429);};
    const error=await rejects(()=>api.teach('X',[],true,'first'),/daily quota/);assert(calls===1&&error.dailyQuota&&error.model==='gemini-3.6-flash');
  });
  await test('Gemini zero quota and retry delay have actionable diagnostics',async()=>{
    const zero=learning.geminiFailure('gemini-3.6-flash',429,{error:{details:[{violations:[{quotaId:'GenerateRequestsPerMinute',quotaValue:'0'}]}]}});
    assert(zero.zeroQuota&&/zero quota/.test(learning.recovery(zero).hint));
    const delay=learning.geminiFailure('gemini-3.6-flash',429,{error:{details:[{retryDelay:'11.3s'}]}});
    assert(delay.retrySeconds===12&&/12 seconds/.test(learning.recovery(delay).hint));
  });
  return results;
}
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const results=await runRegression({app:await read('dist/app.js'),helper:await read('dist/learning-tools.js'),fallback:await read('fallback.mjs'),URL,Headers,Response,AbortController,AbortSignal,setTimeout,clearTimeout});
for(const result of results)test(result.name,()=>assert.ok(result.ok,result.error));
