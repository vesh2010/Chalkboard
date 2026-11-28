// Local study activity and tutor definitions. No tracking service or network calls.
window.chalkPawgress=(()=>{
  const tutors={
    paws:{name:'Professor Paws',breed:'Golden retriever',style:'gentle',description:'Patient, warm and encouraging.',personality:'Patient and warm; break ideas into small steps and use reassuring explanations.',fur:'#f7d99c',shade:'#d99b53',ear:'#a85f30',earLight:'#df9b50',background:'#4c8871',dark:'#163d34'},
    captain:{name:'Captain Canine',breed:'Labrador',style:'exam',description:'A steady coach for challenges.',personality:'Confident, supportive coach; give a clear route through a problem, never shout or rush the learner.',fur:'#c49a72',shade:'#8d6244',ear:'#67452f',earLight:'#a67a52',background:'#476b9b',dark:'#213b63'},
    astro:{name:'Astro Pup',breed:'Husky',style:'story',description:'Curious explorer of big ideas.',personality:'Curious explorer; use concrete analogies and discoveries, without distracting space jargon.',fur:'#e6edf2',shade:'#a1b7c9',ear:'#516978',earLight:'#91a8b6',background:'#68649c',dark:'#29264d'},
    detective:{name:'Detective Doggo',breed:'Beagle',style:'clear',description:'A thoughtful problem-solving partner.',personality:'Careful investigator; reason from evidence, explain each clue and check assumptions.',fur:'#e9c9a0',shade:'#c58b58',ear:'#70452d',earLight:'#a46b3d',background:'#89774e',dark:'#463b28'}
  };
  function tutor(id){return Object.hasOwn(tutors,id)?tutors[id]:tutors.paws;}
  function tutorId(id){return Object.hasOwn(tutors,id)?id:'paws';}
  function day(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
  function previousDay(value){const [y,m,d]=value.split('-').map(Number);const date=new Date(y,m-1,d,12);date.setDate(date.getDate()-1);return day(date);}
  function clean(value){
    const raw=value&&typeof value==='object'?value:{};
    const days=[...new Set((Array.isArray(raw.days)?raw.days:[]).filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-730);
    const lessons=Object.create(null);
    for(const [id,v] of Object.entries(raw.lessons||{}).slice(-500)){
      if(!v||typeof v!=='object'||!id||id.length>160)continue;
      lessons[id]={title:String(v.title||'Untitled lesson').slice(0,180),steps:[...new Set((Array.isArray(v.steps)?v.steps:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<500))],complete:v.complete===true};
    }
    const reviewed=[...new Set((Array.isArray(raw.reviewed)?raw.reviewed:[]).filter(v=>typeof v==='string'&&v.length<=600))].slice(-2000);
    const correct=[...new Set((Array.isArray(raw.correct)?raw.correct:[]).filter(v=>reviewed.includes(v)))];
    return {days,lessons,reviewed,correct};
  }
  function record(value,event,date=new Date()){
    const p=clean(value), id=event?.id;
    if(typeof id!=='string'||!id||id.length>160||!['step','complete','review'].includes(event.kind))return p;
    if(event.kind==='step'&&(!Number.isInteger(event.step)||event.step<0||event.step>=500))return p;
    if(event.kind==='review'&&(typeof event.question!=='string'||!event.question))return p;
    if(!p.lessons[id])p.lessons[id]={title:String(event.title||'Untitled lesson').slice(0,180),steps:[],complete:false};
    const lesson=p.lessons[id];
    if(event.kind==='step'&&!lesson.steps.includes(event.step))lesson.steps.push(event.step);
    if(event.kind==='complete')lesson.complete=true;
    if(event.kind==='review'){
      const q=(id+'\0'+event.question).slice(0,600);
      if(!p.reviewed.includes(q))p.reviewed.push(q);
      p.correct=p.correct.filter(key=>key!==q);
      if(event.correct)p.correct.push(q);
    }
    p.days.push(day(date));
    return clean(p);
  }
  function stats(value,date=new Date()){
    const p=clean(value), today=day(date), set=new Set(p.days.filter(d=>d<=today));
    let cursor=set.has(today)?today:previousDay(today),streak=0;
    while(set.has(cursor)){streak++;cursor=previousDay(cursor);}
    const completed=Object.values(p.lessons).filter(l=>l.complete).length;
    const steps=Object.values(p.lessons).reduce((n,l)=>n+l.steps.length,0);
    return {streak,days:set.size,completed,steps,reviewed:p.reviewed.length,correct:p.correct.length,
      badges:[{name:'First pawprint',earned:steps>0||p.reviewed.length>0},{name:'Lesson explorer',earned:completed>=1},{name:'Three-day trail',earned:streak>=3},{name:'Practice pal',earned:p.reviewed.length>=5},{name:'Curious companion',earned:completed>=5}]};
  }
  function recap(lesson,progress,sessionSteps,attempts,learning){
    const steps=(lesson?.steps||[]).slice(0,lesson?.mainStepCount??lesson?.steps?.length??0);
    const covered=steps.map((s,i)=>({step:s,index:i})).filter(v=>sessionSteps.has(v.index));
    const selected=covered.length?covered:steps.map((step,index)=>({step,index}));
    const points=[],mistakes=[],seen=new Set();
    for(const {step} of selected){
      for(const card of learning.cards(step)){
        const text=card.content+(card.note?' — '+card.note:'');
        if(seen.has(text))continue;seen.add(text);
        if(card.type==='mistake')mistakes.push(text);else points.push(text);
      }
    }
    const questions=learning.questions(lesson?.questions).slice(0,9);
    return {title:lesson?.title||'Lesson',covered:covered.length,total:steps.length,points:points.slice(0,8),mistakes:mistakes.slice(0,4),questions,reviewed:attempts.size,correct:[...attempts.values()].filter(x=>x==='got').length,complete:progress?.complete===true};
  }
  return {tutors,tutor,tutorId,day,previousDay,clean,record,stats,recap};
})();
