// Measure ten-millisecond energy windows. Their playback timestamps follow the
// audio element even when playback slows down, stalls or changes rate.
window.dogTutor = (() => {
  const avatar = document.getElementById('dog-tutor');
  const jaw = document.getElementById('dog-mouth');
  const tongue = document.getElementById('dog-tongue');
  let frame, lastOpening = -1, wordAt = 0;
  function mouth(opening) {
    opening = Math.round(Math.max(0,Math.min(1,opening))*8);
    if (!jaw || opening === lastOpening) return;
    lastOpening = opening;
    jaw.setAttribute('ry',String(2.7+opening*.64));
    jaw.setAttribute('cy',String(82+opening*.30));
    tongue?.setAttribute('opacity',opening>2?'1':'0');
    tongue?.setAttribute('cy',String(84+opening*.45));
  }
  function stop() {
    cancelAnimationFrame(frame);
    avatar?.removeAttribute('data-speaking');
    mouth(0);
  }
  async function analyse(blob) {
    if (!window.OfflineAudioContext || !blob) return null;
    try {
      const decoder = new OfflineAudioContext(1,1,22050);
      const sound = await decoder.decodeAudioData(await blob.arrayBuffer());
      const data = sound.getChannelData(0);
      const hop = Math.round(sound.sampleRate*.01);
      const levels = new Float32Array(Math.ceil(data.length/hop));
      let peak = 0;
      for (let i=0; i<levels.length; i++) {
        const end=Math.min((i+1)*hop,data.length);
        let energy=0;
        for (let j=i*hop;j<end;j++) energy+=data[j]*data[j];
        levels[i]=Math.sqrt(energy/(end-i*hop));
        peak=Math.max(peak,levels[i]);
      }
      const smooth = new Float32Array(levels.length);
      let windowSum = 0;
      for (let i=0; i<Math.min(4,levels.length); i++) windowSum += levels[i];
      for (let i=0; i<levels.length; i++) {
        const start = Math.max(0,i-3), end = Math.min(levels.length,i+4);
        smooth[i] = windowSum / (end-start);
        if (i>=3) windowSum -= levels[i-3];
        if (i+4<levels.length) windowSum += levels[i+4];
      }
      let beats=0,last=-15;
      for(let i=1;i<smooth.length-1;i++) {
        if(i-last>=12 && smooth[i]>peak*.10 && smooth[i]>=smooth[i-1] && smooth[i]>smooth[i+1]) {
          beats++;last=i;
        }
      }
      // The reference has 3.73 prominent energy peaks per second.
      const rate = beats>=5 ? Math.max(.87,Math.min(1.13,3.73*sound.duration/beats)) : 1;
      return {levels,peak,rate,secondsPerBin:hop/sound.sampleRate};
    } catch { return null; }
  }
  function animate(read) {
    stop();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    avatar?.setAttribute('data-speaking','true');
    let lastFrame = -Infinity;
    function tick(now) {
      if (now-lastFrame>=32) { mouth(read()); lastFrame=now; }
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  }
  function media(player,profile) {
    animate(() => {
      if (player.paused || player.ended || player.readyState<3) return 0;
      if (!profile) return Math.abs(Math.sin(player.currentTime*11.72))*.72;
      const level=profile.levels[Math.floor(player.currentTime/profile.secondsPerBin)] || 0;
      return Math.min(1,Math.max(0,(level/(profile.peak || 1)-.035)*2.5));
    });
  }
  function boundary() { wordAt=performance.now(); }
  function speech() {
    boundary();
    animate(() => Math.abs(Math.sin((performance.now()-wordAt)*.01172))*.72);
  }
  return {analyse,media,speech,boundary,stop};
})();

// Keep compatibility with older lesson harnesses.
window.teacherFace = window.dogTutor;
