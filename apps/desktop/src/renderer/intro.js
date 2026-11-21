(() => {
  const screen=document.querySelector('#loading-screen'),start=performance.now();let finished=false;
  window.fonyxIntro={async finish({version='',reducedMotion=false}={}){
    if(finished)return;finished=true;
    document.querySelector('#startup-version').textContent=version?'Fonyx '+version:'';
    const still=reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(still){screen.hidden=true;document.body.classList.add('launcher-ready');return;}
    const remaining=Math.max(0,520-(performance.now()-start));
    if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
    screen.classList.add('startup-leaving');document.body.classList.add('launcher-ready');
    await new Promise(resolve=>setTimeout(resolve,180));screen.hidden=true;
  }};
})();
