// region-manager.js — screens/navigation glue
(function(){
  window.RegionManager = window.RegionManager || {
    showMenu: (...a)=>window.MenuScreen?.showMenu?.(...a)
  };
})();
