// Explicit opt-in live test. Run locally with the gateway already running.
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
const base='http://127.0.0.1:31416';
const useAuto=process.argv.includes('--auto');
let key=process.env.CHALKROOM_TEST_KEY;
if(!useAuto&&!key){console.error('Set CHALKROOM_TEST_KEY in your local terminal (do not commit or share it), or use --auto for configured .env providers.');process.exit(2);}
const rl=createInterface({input:stdin,output:stdout});
const confirm=await rl.question('This sends six real model requests and may use provider credits. Continue? [y/N] ');rl.close();
if(confirm.toLowerCase()!=='y')process.exit(0);
const endpoint=base+(useAuto?'/v1/auto/chat/completions':'/v1/chat/completions');
const headers={'Content-Type':'application/json',Origin:base,...(useAuto?{}:{Authorization:'Bearer '+key})};
const shape='Return JSON only: {"title":"...","steps":[{"title":"...","lines":["..."],"explanations":["..."],"narration":"..."}],"questions":[{"prompt":"...","answer":"...","difficulty":"easy|medium|challenge"}]}. Every step needs nonempty lines and narration.';
const cases=[
 ['Opening','Explain compound interest with one opening step.'],
 ['Continuation','Continue with a worked example of $100 at 10% for 2 years; return two steps.'],
 ['Follow-up 1','Why does compound interest differ from simple interest?'],
 ['Follow-up 2','What if the rate is 0%?'],
 ['Follow-up 3','How does compounding frequency affect the balance?'],
 ['Practice','Generate easy, medium and challenge practice questions with worked answers and one valid step.']
];
let failures=0;
for(const [label,prompt] of cases){
  const start=Date.now();
  try{
    const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({model:'auto:fast',messages:[{role:'system',content:shape},{role:'user',content:prompt}],stream:false}),signal:AbortSignal.timeout(180000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json(),raw=data.choices?.[0]?.message?.content;
    const lesson=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));
    if(!lesson.title?.trim()||!lesson.steps?.length||lesson.steps.some(s=>!s.title?.trim()||!s.narration?.trim()||!s.lines?.length||s.lines.some(l=>typeof l!=='string'||!l.trim())))throw Error('invalid lesson schema');
    if(label==='Practice'&&!['easy','medium','challenge'].every(d=>lesson.questions?.some(q=>q.difficulty===d&&q.prompt?.trim()&&q.answer?.trim())))throw Error('missing practice level');
    console.log('PASS '+label+' ('+Math.round((Date.now()-start)/1000)+'s)');
  }catch(e){failures++;console.log('FAIL '+label+': '+String(e.message).slice(0,120));}
}
console.log((cases.length-failures)+'/'+cases.length+' live requests passed. Check actual lesson accuracy and voice separately.');
process.exitCode=failures?1:0;
