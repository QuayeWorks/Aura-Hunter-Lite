// vows-and-specializations.js
(function(){
  const Vows = {
    active: [], // {id, mult, lethal}
    applyDamageMods(dmg){
      let out = dmg;
      for (const v of Vows.active){
        if (v.id==="only-ko") out *= 1.35; // “Only Ko strikes”
        if (v.id==="no-dash") out *= 1.20; // “No dash”
      }
      return out;
    }
  };

  const Specialization = {
    type: "Enhancer", // or Transmuter, Emitter, Conjurer, Manipulator, Specialist
    applyDamageMods(dmg){
      let out = dmg;
      if (Specialization.type==="Enhancer" && window.Nen?.state?.aura?.ren) out *= 1.08;
      return out;
    }
  };

  window.Vows = Vows;
  window.Specialization = Specialization;
})();
