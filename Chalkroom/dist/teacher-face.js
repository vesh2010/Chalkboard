// Measure ten-millisecond energy windows. Their playback timestamps follow the
// audio element even when playback slows down, stalls or changes rate.
window.teacherFace = (() => {
  const canvas = document.getElementById('teacher-lips');
  const photo = document.getElementById('teacher-photo');
  const ctx = canvas.getContext('2d');
  let frame, lastOpening = 0, wordAt = 0;
  function mouth(opening) {
    opening = Math.round(opening * 12);
    if (!ctx || opening === lastOpening) return;
    lastOpening = opening;
    ctx.clearRect(0,0,240,240);
    if (!opening || !photo.naturalWidth) return;
    // The smile slopes up toward the right. Keep both corners anchored and
    // displace the existing lower lip and chin texture under each column.
    for (let x=101; x<151; x++) {
      const t = (x-101)/50;
      const curve = Math.sin(Math.PI*t);
      const seam = Math.round(120-6*t+4*curve);
      const gap = opening*curve;
      ctx.fillStyle = '#513722';
      ctx.fillRect(x,seam,1,gap+1);
      ctx.drawImage(photo,x,seam,1,18,x,seam+gap,1,18-gap);
    }
  }
  function stop() {
    cancelAnimationFrame(frame);
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
      const smooth = levels.map((_,i) => levels.slice(Math.max(0,i-3),i+4).reduce((a,b)=>a+b,0)/7);
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
    function tick() { mouth(read()); frame=requestAnimationFrame(tick); }
    tick();
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
