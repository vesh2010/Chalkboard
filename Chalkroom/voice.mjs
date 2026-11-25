import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const binary = fileURLToPath(new URL('./.voice/piper/piper.exe',import.meta.url));
const models = {
  ryan:fileURLToPath(new URL('./.voice/en_US-ryan-high.onnx',import.meta.url)),
  cori:fileURLToPath(new URL('./.voice/en_GB-cori-high.onnx',import.meta.url)),
  alan:fileURLToPath(new URL('./.voice/en_GB-alan-medium.onnx',import.meta.url))
};
const sentences = new Intl.Segmenter('en-GB',{granularity:'sentence'});
const operators = {'×':'times','÷':'divided by','=':'equals','≈':'is approximately equal to','≤':'is less than or equal to','≥':'is greater than or equal to','π':'pi','+':'plus','−':'minus'};

export function speechPlan(text) {
  const spoken = text.replace(/\be\.g\.(?=\s|$)/gi,'for example').replace(/\bi\.e\.(?=\s|$)/gi,'that is')
    .replace(/\bGHz\b/g,'gigahertz').replace(/\bMHz\b/g,'megahertz').replace(/\bkHz\b/g,'kilohertz')
    .replace(/(\d)\s*°\s*C\b/g,'$1 degrees Celsius').replace(/(\d)\s*°\s*F\b/g,'$1 degrees Fahrenheit')
    .replace(/\bHTTPS\b/g,'H T T P S').replace(/\bJSON\b/g,'jay son')
    .replace(/\bSQL\b/g,'S Q L').replace(/\bGUI\b/g,'gooey')
    .replace(/\bTCP\/IP\b/g,'T C P over I P').replace(/\bWi-Fi\b/gi,'why fie')
    .replace(/\b(\d+(?:\.\d+)?)\s*(kg|km|ms)\b/g,(_,n,u) =>
      n+' '+({kg:'kilogram',km:'kilometer',ms:'millisecond'}[u])+(Number(n)===1?'':'s'))
    .replace(/\b(API|CPU|GPU|HTML|HTTP|URL|AI|DNA|RNA)(s?)\b/g,(_,word,plural)=>word.split('').join(' ') + (plural ? 's' : ''))
    .replace(/(?<=[\p{L}\d)])(?:²|\^2(?!\d))/gu,' squared')
    .replace(/(?<=[\p{L}\d)])(?:³|\^3(?!\d))/gu,' cubed')
    .replace(/(\d+)\.(\d+)/g,(_,whole,fraction)=>whole+' point '+fraction.split('').join(' '))
    .replace(/(\d)\s*%/g,'$1 percent')
    .replace(/[×÷=≈≤≥π+−]/g,char=>' '+operators[char]+' ');
  const plan = [];
  for (const paragraph of spoken.trim().split(/\n\s*\n/)) {
    const lines = [...sentences.segment(paragraph.replace(/\s+/g,' ').trim())];
    for (const {segment} of lines) {
      const phrase = segment.trim();
      if (phrase) plan.push({text:phrase,pause:/\?[”"’']?$/.test(phrase) ? 650 : 280});
    }
    if (plan.length) plan.at(-1).pause = Math.max(plan.at(-1).pause,600);
  }
  if (plan.length) plan.at(-1).pause = 0;
  return plan;
}

export async function speak(text,signal,voice = 'cori') {
  const model = models[voice === 'storyteller' ? 'ryan' : voice];
  const delivery = {
    ryan:{lengthScale:'1.00',pause:250},
    storyteller:{lengthScale:'1.055',pause:340},
    cori:{lengthScale:'1.03',pause:285},
    alan:{lengthScale:'1.01',pause:265}
  }[voice];
  const dir = await mkdtemp(join(tmpdir(),'chalkroom-voice-'));
  try {
    const phrases = speechPlan(text).map((phrase,i)=>({...phrase,file:join(dir,i+'.wav')}));
    await new Promise((resolve,reject)=>{
      const child = spawn(binary,['--model',model,'--json-input','--output_dir',dir,'--length_scale',delivery.lengthScale,'--sentence_silence','0.05'],
        {windowsHide:true,signal,stdio:['pipe','ignore','ignore']});
      let failure;
      child.on('error',error=>{failure=error;});
      child.stdin.on('error',error=>{failure=error;});
      child.on('close',code=>code===0 && !failure ? resolve() : reject(failure || Error('Local voice unavailable')));
      child.stdin.end(phrases.map(phrase=>JSON.stringify({text:phrase.text,output_file:phrase.file})).join('\n')+'\n');
    });
    const parts = [];
    let header;
    for (const phrase of phrases) {
      signal.throwIfAborted();
      const wav = await readFile(phrase.file);
      if (wav.toString('ascii',36,40)!=='data' || wav.readUInt32LE(24)!==22050) throw Error('Unexpected voice audio format');
      header ||= Buffer.from(wav.subarray(0,44));
      // Match the reference's shorter statement breaks and longer question rests.
      const pause = phrase.pause === 280 ? Math.max(260,delivery.pause) : Math.min(510,phrase.pause);
      parts.push(wav.subarray(44),Buffer.alloc(2*Math.round(22050*pause/1000)));
    }
    const pcm = Buffer.concat(parts);
    if (voice === 'storyteller') {
      // Gentle bass emphasis and treble roll-off keep consonants audible.
      const bassMix = 1-Math.exp(-2*Math.PI*220/22050);
      const presenceMix = 1-Math.exp(-2*Math.PI*4200/22050);
      let bass = 0, presence = 0;
      for (let offset=0;offset<pcm.length;offset+=2) {
        const input = pcm.readInt16LE(offset);
        bass += bassMix*(input-bass);
        presence += presenceMix*(input-presence);
        const output = Math.round(.75*input + .18*presence + .14*bass);
        pcm.writeInt16LE(Math.max(-32768,Math.min(32767,output)),offset);
      }
    }
    header.writeUInt32LE(pcm.length+36,4);
    header.writeUInt32LE(pcm.length,40);
    return Buffer.concat([header,pcm]);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
}
