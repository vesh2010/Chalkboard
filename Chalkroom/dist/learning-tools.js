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
  return {levels,normalize,questions,mergeQuestions,position,compatible,offset};
})();
