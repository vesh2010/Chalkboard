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
// Keep routing statistics only in memory; credentials never enter this map.
const routeHealth = new Map();
function orderedRoutes(routes) {
  const now = Date.now();
  return [...routes].sort((a,b) => {
    const aa = routeHealth.get(a.slot), bb = routeHealth.get(b.slot);
    const score = h => h ? (h.failUntil > now ? 1000000 : 0) + (h.latency || 0) : 0;
    return score(aa) - score(bb) || a.slot-b.slot;
  });
}

export async function tryRoutes(routes, messages, signal, request = fetch, budgetMs = routingBudgetMs, onAttempt = () => {}) {
  const deadline = Date.now() + budgetMs;
  let remainingRoutes = routes.filter(route => route.url).length;
  const attempts = [];
  for (const {slot,key,model,url} of orderedRoutes(routes)) {
    signal.throwIfAborted();
    if (!url) { attempts.push('API ' + slot + ' has invalid settings'); continue; }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) { attempts.push('Lesson request deadline reached'); break; }
    // A fast failure gives its unused time to subsequent providers. The last
    // provider gets the entire balance for generating the lesson and diagrams.
    const limit = AbortSignal.timeout(Math.max(1,Math.floor(remainingMs / remainingRoutes--)));
    onAttempt(slot);
    const started = Date.now();
    function failed() {
      const previous = routeHealth.get(slot);
      const failures = Math.min(5,(previous?.failures || 0)+1);
      routeHealth.set(slot,{failures,latency:previous?.latency || 0,failUntil:Date.now()+Math.min(30000,2000*2**failures)});
    }
    try {
      const response = await request(url,{
        method:'POST',redirect:'error',signal:AbortSignal.any([signal,limit]),
        headers:{Authorization:'Bearer ' + key,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages,stream:false})
      });
      if (!response.ok) {
        await response.body?.cancel();
        failed();
        attempts.push('API ' + slot + ' returned HTTP ' + response.status);
        continue;
      }
      const data = await response.json().catch(() => null);
      signal.throwIfAborted();
      if (hasLesson(data)) {
        const previous = routeHealth.get(slot);
        const duration = Date.now()-started;
        routeHealth.set(slot,{failures:0,failUntil:0,latency:previous?.latency ? Math.round(previous.latency*.7+duration*.3) : duration});
        return {choices:[{message:{content:data.choices[0].message.content}}],fallbackSlot:slot};
      }
      failed();
      attempts.push('API ' + slot + (limit.aborted ? ' timed out' : ' returned an unreadable lesson'));
    } catch {
      signal.throwIfAborted();
      failed();
      attempts.push('API ' + slot + (limit.aborted ? ' timed out' : ' could not connect'));
    }
  }
  return {error:{message:attempts.length ? attempts.join('. ') + '.' : 'Add at least one API key to Chalkroom/.env.'}};
}

export async function gatewayLesson(body, authorization, upstream, signal, getRoutes, request = fetch, onBackup = () => {}) {
  const deadline = Date.now() + routingBudgetMs;
  const messages = JSON.parse(body).messages;
  // Reserve time for failover when backup routes exist. Without a backup,
  // give the configured primary nearly the full server request budget.
  const routes = (await getRoutes()).filter(route => route.url && route.url.href !== upstream);
  const primaryBudgetMs = routes.length ? 55000 : Math.max(1000, deadline - Date.now() - 5000);
  const primaryLimit = AbortSignal.timeout(primaryBudgetMs);
  let status = 502;
  try {
    const response = await request(upstream,{method:'POST',redirect:'error',
      headers:{Authorization:authorization,'Content-Type':'application/json'},body,
      signal:AbortSignal.any([signal,primaryLimit])});
    // A gateway token can be revoked or rotated during a lesson. If local
    // backup providers are configured, let them handle authentication errors
    // instead of ending the learner's follow-up with an immediate 401.
    if (![401,403,408,429].includes(response.status) && response.status < 500) {
      return {status:response.status,body:await response.text()};
    }
    status = response.status;
    if ([401,403].includes(status)) {
      if (!routes.length) {
        return {status,body:JSON.stringify({error:{message:'FreeLLMAPI rejected the saved gateway key (HTTP ' + status + '). Open API settings, test the key, and paste a current unified key from the FreeLLMAPI desktop app.'}})};
      }
    }
    await response.body?.cancel();
  } catch { signal.throwIfAborted(); }
  const primaryTimedOut = primaryLimit.aborted;
  const result = routes.length
    ? await tryRoutes(routes,messages,signal,request,deadline-Date.now(),onBackup)
    : {error:{message:'No backup providers configured.'}};
  if (!result.error) return {status:200,body:JSON.stringify(result)};
  const reason = primaryTimedOut ? 'timed out' : [401,403].includes(status) ? 'rejected the saved key (HTTP ' + status + ')' : 'is unavailable (HTTP ' + status + ')';
  const detail = routes.length ? result.error.message
    : primaryTimedOut
      ? 'The gateway did not complete within ' + Math.round(primaryBudgetMs / 1000) + ' seconds. Check whether FreeLLMAPI has an active model, select Fast routing in API settings, or add a backup provider to Chalkroom/.env.'
      : 'Add another provider to Chalkroom/.env for automatic fallback.';
  return {status:502,body:JSON.stringify({error:{message:'The primary gateway ' + reason + '. ' + detail}})};
}
