import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {loadRoutes,tryRoutes,gatewayLesson} from './fallback.mjs';
import {speak} from './voice.mjs';

const host = '127.0.0.1';
const port = 31416;
const origin = 'http://' + host + ':' + port;
const upstream = 'http://127.0.0.1:31415/v1/chat/completions';
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/pen-font.js', ['pen-font.js','text/javascript']],
  ['/live-board.js', ['live-board.js','text/javascript']],
  ['/teacher-face.js', ['teacher-face.js','text/javascript']],
  ['/tutor.jpg', ['tutor.jpg','image/jpeg']],
  ['/style.css', ['style.css', 'text/css']],
  ['/tiktok-bhp.mp3', ['tiktok-bhp.mp3', 'audio/mpeg']],
  ['/tiktok-bhp.wav', ['tiktok-bhp.wav', 'audio/wav']],
  ['/convert.html', ['convert.html', 'text/html']]
]);
const maxBytes = 1024 * 1024;

function send(res, status, content, type = 'application/json') {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(content);
}

const server = createServer(async (req, res) => {
  if (req.headers.host !== origin.slice('http://'.length)) return send(res, 403, '{}');
  if (req.method === 'GET' && files.has(req.url)) {
    const [file, type] = files.get(req.url);
    try {
      if (type.startsWith('image/') || type.startsWith('audio/')) return send(res,200,await readFile(new URL('./dist/' + file,import.meta.url)),type);
      let content = await readFile(new URL('./dist/' + file, import.meta.url), 'utf8');
      if (file === 'index.html') content = content.replace('<head>', '<head><meta name="chalkroom-local-gateway" content="enabled">');
      return send(res, 200, content, type + '; charset=utf-8');
    } catch {
      return send(res, 500, JSON.stringify({error:'Chalkroom could not read its application files.'}));
    }
  }
  const checkKey = req.url === '/v1/check-key';
  const auto = req.url === '/v1/auto/chat/completions';
  const speech = req.url === '/voice';
  if (req.method === 'POST' && req.url === '/save-wav') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    await writeFile(new URL('../TikTok Shop BHP sample.wav', import.meta.url), buf);
    await writeFile(new URL('./dist/tiktok-bhp.wav', import.meta.url), buf);
    return send(res, 200, JSON.stringify({ok: true, bytes: buf.length}));
  }
  if (req.method !== 'POST' || (!speech && !checkKey && !auto && req.url !== '/v1/chat/completions')) return send(res, 404, '{}');
  if (req.headers.origin !== origin || !/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 403, '{}');
  if (!speech && !auto && !/^Bearer \S+$/i.test(req.headers.authorization || '')) return send(res, 401, '{}');

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const timeout = setTimeout(() => controller.abort('timeout'), checkKey ? 8000 : 175000);
  const progress = !speech && !checkKey && req.headers.accept === 'application/x-ndjson';
  function event(data) {
    if (!res.headersSent) res.writeHead(200, {'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.write(JSON.stringify(data) + '\n');
  }
  function finish(status,body) {
    if (!progress) return send(res,status,body);
    event({type:'result',status,body});
    res.end();
  }
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > maxBytes) {
        send(res, 413, '{}');
        return;
      }
      chunks.push(chunk);
    }
    if (speech) {
      let text,voice;
      try { ({text,voice} = JSON.parse(Buffer.concat(chunks).toString())); } catch {}
      if (voice !== undefined && !['ryan','alan','cori','storyteller','elevenlabs'].includes(voice)) return send(res,400,'{}');
      if (typeof text !== 'string' || !text.trim() || text.length > 12000) return send(res,400,'{}');
      if (voice === 'elevenlabs') {
        const env = parseEnv(await readFile(new URL('./.env',import.meta.url),'utf8').catch(()=>''));
        const key = env.ELEVENLABS_API_KEY?.trim();
        const id = env.ELEVENLABS_VOICE_ID?.trim();
        if (!key || !id) return send(res,400,JSON.stringify({error:'Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in the Chalkroom .env file, then press Play voice.'}));
        const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(id),{
          method:'POST',signal:controller.signal,redirect:'error',
          headers:{'xi-api-key':key,'Content-Type':'application/json',Accept:'audio/mpeg'},
          body:JSON.stringify({text,model_id:'eleven_multilingual_v2',
            voice_settings:{stability:0.40,similarity_boost:0.50,style:0.20,use_speaker_boost:true,speed:0.97}})
        });
        if (!response.ok) return send(res,502,JSON.stringify({error:'ElevenLabs returned HTTP ' + response.status + '. Check your voice ID, key permissions and credits.'}));
        return send(res,200,Buffer.from(await response.arrayBuffer()),'audio/mpeg');
      }
      try { return send(res,200,await speak(text,controller.signal,voice),'audio/wav'); }
      catch { if (!res.destroyed) send(res,503,'{}'); return; }
    }
    if (auto) {
      let messages;
      try { ({messages} = JSON.parse(Buffer.concat(chunks).toString())); } catch {}
      if (!Array.isArray(messages)) return send(res,400,'{}');
      const routes = await loadRoutes(new URL('./.env',import.meta.url)).catch(() => []);
      let attempt = 0;
      const result = await tryRoutes(routes,messages,controller.signal,fetch,undefined,slot => {
        if (progress) event({type:'provider',backup:attempt++ > 0,slot});
      });
      return finish(result.error ? 502 : 200,JSON.stringify(result));
    }
    if (!checkKey) {
      const body = Buffer.concat(chunks).toString();
      let messages;
      try { messages = JSON.parse(body).messages; } catch {}
      if (!Array.isArray(messages)) return send(res,400,'{}');
      if (progress) event({type:'provider',backup:false});
      const result = await gatewayLesson(body,req.headers.authorization,upstream,controller.signal,
        () => loadRoutes(new URL('./.env',import.meta.url)).catch(()=>[]),fetch,
        slot => { if (progress) event({type:'provider',backup:true,slot}); });
      return finish(result.status,result.body);
    }
    const response = await fetch(new URL('/v1/models',upstream), {
      method:'GET',
      headers:{Authorization:req.headers.authorization, 'Content-Type':'application/json'},
      redirect:'error',
      signal:controller.signal
    });
    await response.body?.cancel();
    send(res,response.status,'{}');
  } catch {
    if (res.destroyed) return;
    const timedOut = controller.signal.reason === 'timeout';
    if (speech) return send(res,timedOut ? 504 : 502,JSON.stringify({error:timedOut ? 'Voice generation timed out. Press Play voice to retry.' : 'Could not reach the voice service. Press Play voice to retry.'}));
    const message = timedOut
      ? 'FreeLLMAPI did not finish within 175 seconds. Retry or choose a different routing mode.'
      : 'Could not connect to local FreeLLMAPI on port 31415. Keep the FreeLLMAPI desktop app open.';
    finish(timedOut ? 504 : 502, JSON.stringify({error:{message}}));
  } finally {
    clearTimeout(timeout);
  }
});
server.listen(port, host, () => process.stdout.write('Chalkroom is ready at ' + origin + '\n'));
