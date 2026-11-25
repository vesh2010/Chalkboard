import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';

export async function loadRoutes(file) {
  const env = parseEnv(await readFile(file,'utf8'));
  const routes = [];
  for (let slot = 1; slot <= 4; slot++) {
    const prefix = 'API_' + slot + '_';
    const key = env[prefix + 'KEY']?.trim().replace(/^Bearer\s+/i,'');
    if (!key) continue;
    const model = env[prefix + 'MODEL']?.trim();
    let url;
    try { url = new URL(env[prefix + 'URL']); } catch {}
    const local = url?.hostname === '127.0.0.1' && url.port === '31415' && url.protocol === 'http:';
    if (!url || (!local && url.protocol !== 'https:') || url.username || url.password || url.hash || !model || /\s/.test(key)) {
      routes.push({slot});
      continue;
    }
    routes.push({slot,key,model,url});
  }
  return routes;
}

function hasLesson(data) {
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.includes('{')) return false;
  try {
    const lesson = JSON.parse(answer.slice(answer.indexOf('{'),answer.lastIndexOf('}')+1));
    return typeof lesson?.title === 'string' && Array.isArray(lesson.steps) && lesson.steps.length > 0 &&
      lesson.steps.every(step => typeof step?.title === 'string' && typeof step.narration === 'string' &&
        Array.isArray(step.lines) && step.lines.every(line => typeof line === 'string'));
  } catch { return false; }
}

// Leave time for the local HTTP server (175 s) to send its final response.
const routingBudgetMs = 170000;

export async function tryRoutes(routes, messages, signal, request = fetch, budgetMs = routingBudgetMs, onAttempt = () => {}) {
  const deadline = Date.now() + budgetMs;
  let remainingRoutes = routes.filter(route => route.url).length;
  const attempts = [];
  for (const {slot,key,model,url} of routes) {
    signal.throwIfAborted();
    if (!url) { attempts.push('API ' + slot + ' has invalid settings'); continue; }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) { attempts.push('Lesson request deadline reached'); break; }
    // A fast failure gives its unused time to subsequent providers. The last
    // provider gets the entire balance for generating the lesson and diagrams.
    const limit = AbortSignal.timeout(Math.max(1,Math.floor(remainingMs / remainingRoutes--)));
    onAttempt(slot);
    try {
      const response = await request(url,{
        method:'POST',redirect:'error',signal:AbortSignal.any([signal,limit]),
        headers:{Authorization:'Bearer ' + key,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages,stream:false})
      });
      if (!response.ok) {
        await response.body?.cancel();
        attempts.push('API ' + slot + ' returned HTTP ' + response.status);
        continue;
      }
      const data = await response.json().catch(() => null);
      signal.throwIfAborted();
      if (hasLesson(data)) return {choices:[{message:{content:data.choices[0].message.content}}],fallbackSlot:slot};
      attempts.push('API ' + slot + (limit.aborted ? ' timed out' : ' returned an unreadable lesson'));
    } catch {
      signal.throwIfAborted();
      attempts.push('API ' + slot + (limit.aborted ? ' timed out' : ' could not connect'));
    }
  }
  return {error:{message:attempts.length ? attempts.join('. ') + '.' : 'Add at least one API key to Chalkroom/.env.'}};
}

export async function gatewayLesson(body, authorization, upstream, signal, getRoutes, request = fetch, onBackup = () => {}) {
  const deadline = Date.now() + routingBudgetMs;
  const messages = JSON.parse(body).messages;
  const primaryLimit = AbortSignal.timeout(55000);
  let status = 502;
  try {
    const response = await request(upstream,{method:'POST',redirect:'error',
      headers:{Authorization:authorization,'Content-Type':'application/json'},body,
      signal:AbortSignal.any([signal,primaryLimit])});
    if (![408,429].includes(response.status) && response.status < 500) {
      return {status:response.status,body:await response.text()};
    }
    status = response.status;
    await response.body?.cancel();
  } catch { signal.throwIfAborted(); }
  const primaryTimedOut = primaryLimit.aborted;
  const routes = (await getRoutes()).filter(route => route.url?.href !== upstream);
  const result = await tryRoutes(routes,messages,signal,request,deadline-Date.now(),onBackup);
  if (!result.error) return {status:200,body:JSON.stringify(result)};
  const reason = primaryTimedOut ? 'timed out' : 'is unavailable (HTTP ' + status + ')';
  const detail = routes.length ? result.error.message : 'Add another provider to Chalkroom/.env for automatic fallback.';
  return {status:502,body:JSON.stringify({error:{message:'The primary gateway ' + reason + '. ' + detail}})};
}
