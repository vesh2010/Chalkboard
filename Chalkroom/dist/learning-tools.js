// Small pure helpers shared by lesson playback and practice.
window.chalkLearning = (() => {
  const levels = ['easy','medium','challenge'];
  const normalize = level => typeof level === 'string' && levels.includes(level.trim().toLowerCase()) ? level.trim().toLowerCase() : 'review';
  function questions(items) {
    return (Array.isArray(items) ? items : []).filter(q=>typeof q?.prompt==='string' && q.prompt.trim() && typeof q.answer==='string' && q.answer.trim()).map(q=>({
      prompt:q.prompt.trim(),answer:q.answer.trim(),difficulty:normalize(q.difficulty),
      hint:typeof q.hint==='string'?q.hint.trim():''
    }));
  }
  function mergeQuestions(existing, extra) {
    const result = new Map();
    for (const q of questions([...existing,...extra])) result.set(q.difficulty+'\0'+q.prompt.toLowerCase(),q);
    return [...result.values()];
  }
  function position(point, player) {
    if (!point) return null;
    const time = player && player === point.player && !point.seeking && Number.isFinite(player.currentTime) ? player.currentTime : point.time || 0;
    const {player:discard,seeking:pending,...saved}=point;
    return {...saved,time};
  }
  function compatible(point, step, cue, voice, style, provider) {
    return point && point.step===step && point.cue===cue && point.voice===voice && point.style===style && point.provider===provider ? point : null;
  }
  function offset(time,duration) {
    if (!Number.isFinite(time)||time<=0) return 0;
    return Number.isFinite(duration) ? Math.min(time,Math.max(0,duration-.15)) : time;
  }
  const modes = {
    beginner:{label:'Beginner',description:'Start with the intuition, define unfamiliar terms, avoid assumed knowledge, and use everyday examples. Build one idea at a time.',difficulty:'easy'},
    school:{label:'School',description:'Teach at school level with precise definitions, clear worked steps, and explain why each operation is valid. Adapt to the learner background.',difficulty:'medium'},
    exam:{label:'Competitive exam',description:'Prioritize exam-relevant methods, timed problem-solving strategies, common traps and worked examples. Never invent exam requirements.',difficulty:'challenge'},
    revision:{label:'Fast revision',description:'Prioritize concise recall, important formulas, connections, and common mistakes; assume prior exposure but explain essential gaps. Keep later teaching steps to the minimum allowed.',difficulty:'medium'}
  };
  const defaultPreferences={mode:'beginner',pace:'normal',difficulty:'auto',search:true};
  const paceRates={slow:.85,normal:1,fast:1.15};
  function preferences(value) {
    const p=value&&typeof value==='object'?value:{};
    return {mode:Object.hasOwn(modes,p.mode)?p.mode:'beginner',
      pace:Object.hasOwn(paceRates,p.pace)?p.pace:'normal',
      difficulty:['auto',...levels].includes(p.difficulty)?p.difficulty:'auto',
      search:typeof p.search==='boolean'?p.search:true};
  }
  function cards(step) {
    const types=['definition','formula','rule','example','mistake','takeaway'];
    const clean=(value,limit)=>typeof value==='string'?value.trim().slice(0,limit):'';
    const supplied=(Array.isArray(step?.conceptCards)?step.conceptCards:[]).filter(c=>c&&types.includes(c.type)&&clean(c.title,90)&&clean(c.content,450)).slice(0,4).map(c=>({type:c.type,title:clean(c.title,90),content:clean(c.content,450),note:clean(c.note,220),origin:'generated'}));
    if(supplied.length)return supplied;
    return (Array.isArray(step?.lines)?step.lines:[]).filter(v=>typeof v==='string'&&v.trim()).slice(0,3).map((line,i)=>({type:'takeaway',title:'Board point '+(i+1),content:clean(line,450),note:'',origin:'board'}));
  }
  function sources(items, defaultOrigin='unverified') {
    const found=new Map();
    for(const item of Array.isArray(items)?items:[]) {
      if(!item||typeof item.url!=='string'||item.url.length>2048)continue;
      let url;try{url=new URL(item.url);}catch{continue;}
      if(!['https:','http:'].includes(url.protocol)||url.username||url.password)continue;
      url.hash='';
      const origin=['provider','suggested','unverified'].includes(item.origin)?item.origin:defaultOrigin;
      const next={url:url.href,title:typeof item.title==='string'&&item.title.trim()?item.title.trim().slice(0,200):url.hostname,host:url.hostname,origin};
      const previous=found.get(url.href);
      if(!previous||origin==='provider'&&previous.origin!=='provider')found.set(url.href,next);
    }
    return [...found.values()].sort((a,b)=>Number(b.origin==='provider')-Number(a.origin==='provider')).slice(0,80);
  }
  function recovery(error) {
    const msg=String(error?.message||error||'').toLowerCase(), code=Number(error?.status||(/\bhttp\s+(\d{3})\b/.exec(msg)||[])[1]);
    if(error?.code==='cancelled'||/\b(cancelled|canceled|aborted)\b/.test(msg))return {kind:'cancelled',hint:'The request was cancelled. You can submit it again.',retry:false};
    if([401,403].includes(code)||/rejected.*key|unauthoriz|invalid.*api key|authentication|api.key.*invalid|api key is missing/.test(msg))return {kind:'auth',hint:'Open API settings and test or replace the key, then retry the same request.',retry:true,settings:true};
    if(code===402||/balance|insufficient.quota|credits/.test(msg))return {kind:'quota',hint:'Check provider credits or choose a configured alternative in API settings.',retry:true,settings:true};
    if(code===429||/rate.limit|too many requests/.test(msg))return {kind:'rate',hint:'Wait briefly for the provider limit to reset, then retry. You can also choose another configured provider.',retry:true,settings:true};
    if(error?.code==='timeout'||code===408||code===504||/timed? ?out|timeout|took more than|deadline/.test(msg))return {kind:'timeout',hint:'The model took too long. Check gateway status or select faster routing, then retry.',retry:true,settings:true,fast:true};
    if(code===404||/model.*not found|could not route/.test(msg))return {kind:'model',hint:'Check the configured model and gateway URL in API settings.',retry:true,settings:true};
    if(/no backup|add at least one api key|add another provider/.test(msg))return {kind:'gateway',hint:'Check the local .env provider configuration and restart the gateway if needed.',retry:true,settings:true};
    if(code>=500||/could not reach|could not connect|network|failed to fetch|gateway closed|unavailable/.test(msg))return {kind:'network',hint:'Check your connection and local gateway, or choose another provider before retrying.',retry:true,settings:true};
    if(/readable lesson|incomplete whiteboard|response field/.test(msg))return {kind:'response',hint:'The provider returned an incomplete or incompatible lesson. Retry or try another model.',retry:true,settings:true};
    return {kind:'other',hint:'Check the message above, then try again if appropriate.',retry:true};
  }
  return {levels,normalize,questions,mergeQuestions,position,compatible,offset,modes,defaultPreferences,paceRates,preferences,cards,sources,recovery};
})();
