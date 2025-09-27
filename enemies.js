// enemies.js — thin accessors around enemy collections
(function(){
  const H = (window.HXH ||= {});
  window.Enemies = {
    list: ()=>H.enemies,
    projectiles: ()=>H.projectiles
  };
})();
