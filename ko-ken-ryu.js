// ko-ken-ryu.js — Ko strike + Ken/Ryu HUD pie
(function(){
  const hud = document.createElement('div');
  hud.id = 'ryu-pie';
  Object.assign(hud.style,{
    position:'fixed', right:'12px', bottom:'84px', width:'64px', height:'64px',
    borderRadius:'50%',
    background:'conic-gradient(#7af 0 120deg, #fa7 0 240deg, #7fa 0 360deg)',
    opacity:'0', transition:'opacity .15s ease', pointerEvents:'none', zIndex:999
  });
  document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(hud));

  let koVulnerableT = 0;
  function isVulnerable(){ return koVulnerableT > 0; }

  // One big strike that drops your guard for 0.8s
  function koStrike(doAttackFn){
    if (koVulnerableT>0) return;                 // don’t stack KO
    const cost = 10; if (Nen.state.nen<cost) return;
    Nen.state.nen -= cost;
    try{ doAttackFn?.(); }catch{}
    koVulnerableT = 0.8;
  }

  function update(dt){
    // show pie while Ken is active
    hud.style.opacity = Nen.state.aura.ken ? '0.9' : '0';

    // vulnerability countdown + subtle flash
    if (koVulnerableT>0) {
      koVulnerableT -= dt;
      const p = Math.max(0, Math.min(1, koVulnerableT/0.8));
      // short red glow while exposed
      hud.style.boxShadow = `0 0 ${8 + 12*(1-p)}px rgba(255,60,60,0.85)`;
    } else {
      hud.style.boxShadow = 'none';
    }
  }

  window.KoKenRyu = { koStrike, update, isVulnerable };
})();
