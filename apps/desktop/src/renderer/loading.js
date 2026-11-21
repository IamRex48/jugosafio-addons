// The atlas starts with an empty frame; use its first visible wheel, keeping the rim fixed.
(() => {
  const canvas=document.querySelector('#loading-roulette'),art=document.querySelector('.loading-art');
  const ctx=canvas.getContext('2d'),image=new Image();image.src='../../assets/loading-roulette.png';
  let active=false,frame=0,started=0,still=false;
  function draw(time) {
    if(!active)return;
    ctx.clearRect(0,0,432,424);
    if(image.complete&&image.naturalWidth){
      ctx.drawImage(image,432,0,432,424,0,0,432,424);
      ctx.save();ctx.translate(216,212);ctx.beginPath();ctx.arc(0,0,151,0,Math.PI*2);ctx.clip();
      ctx.rotate(still?0:(time-started)/2200*Math.PI*2);
      ctx.drawImage(image,432,0,432,424,-216,-212,432,424);ctx.restore();
      // The pointer overlaps the spinning disc: restore its fixed silhouette last.
      ctx.save();ctx.beginPath();ctx.moveTo(185,0);ctx.lineTo(247,0);ctx.lineTo(247,48);ctx.lineTo(216,88);ctx.lineTo(185,48);ctx.closePath();ctx.clip();
      ctx.drawImage(image,432,0,432,424,0,0,432,424);ctx.restore();
    }
    if(!still)frame=requestAnimationFrame(draw);
  }
  image.onload=()=>{if(active&&still)draw(performance.now());};
  image.onerror=()=>{art.dataset.style='diamond';canvas.hidden=true;};
  window.fonyxLoading={
    start(style,reduced=false){this.stop();art.dataset.style=style;canvas.hidden=style!=='roulette';still=reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;art.classList.toggle('loading-still',still);art.classList.add('is-loading');active=style==='roulette';started=performance.now();if(active)draw(started);},
    stop(){active=false;cancelAnimationFrame(frame);art.classList.remove('is-loading');}
  };
})();
