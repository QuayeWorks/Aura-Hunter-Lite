// items-and-crafting.js
(function(){
  const ItemDefs = {
    "club":       { slot:"weapon", baseDMG:12, dura:60, mats:{ "wood":3 } },
    "shortsword": { slot:"weapon", baseDMG:18, dura:80, mats:{ "iron-ingot":2, "wood":1 } },
    "light-armor":{ slot:"body", dr:0.08, mats:{ "leather":4 } },
    "ration":     { slot:"consumable", heal:8 },
    "small-heal": { slot:"consumable", heal:18 },
  };
  const Recipes = {
    "iron-ingot": { from:{ "iron-ore":2 }, station:"smelter" },
    "leather":    { from:{ "hide":2 }, station:"tanning" },
    "shortsword": { from: ItemDefs.shortsword.mats, station:"forge" },
    "club":       { from: ItemDefs.club.mats },
    "light-armor":{ from: ItemDefs["light-armor"].mats }
  };

  function rollLoot(rng){
    const out=[];
    if (rng()<0.65) out.push({type:"mat", key:"iron-ore", qty:1+(rng()*3|0)});
    if (rng()<0.35) out.push({type:"food", key:"ration", qty:1+(rng()*2|0)});
    if (rng()<0.20) out.push({type:"potion", key:"small-heal", qty:1});
    if (rng()<0.15) out.push({type:"weapon", key: rng()<0.5?"club":"shortsword", roll: Math.round(5+rng()*10) });
    if (rng()<0.12) out.push({type:"clothing", key:"light-armor", roll: Math.round(4+rng()*8) });
    return out;
  }

  const inv = (window.inventory = window.inventory || {});
  function addItem(key, qty=1){ inv[key]=(inv[key]||0)+qty; save(); }
  function canCraft(key){ const r=Recipes[key]; if(!r)return false; return Object.entries(r.from).every(([k,q])=>(inv[k]||0)>=q); }
  function craft(key){
    const r=Recipes[key]; if(!r || !canCraft(key)) return false;
    for (const [k,q] of Object.entries(r.from)) inv[k]-=q;
    addItem(key,1); save(); return true;
  }
  function save(){ try{ localStorage.setItem("hxh.inv",JSON.stringify(inv)); }catch{} }
  function load(){ try{ Object.assign(inv, JSON.parse(localStorage.getItem("hxh.inv")||"{}")); }catch{} }
  load();

  // Chest overlay
  const overlay = document.createElement('div');
  overlay.id='chest-ui';
  Object.assign(overlay.style,{
    position:'fixed', left:0, top:0, right:0, bottom:0,
    background:'rgba(0,0,0,0.55)', display:'none', alignItems:'center', justifyContent:'center', zIndex:1002
  });
  const panel = document.createElement('div');
  Object.assign(panel.style,{ background:'#0f1a30', border:'1px solid #27355e', color:'#cfe2ff', padding:'12px 14px', borderRadius:'10px', minWidth:'280px' });
  panel.innerHTML = `<h3 style="margin:0 0 8px 0">Chest</h3><div id="chest-contents"></div><div style="margin-top:10px; display:flex; gap:8px; justify-content:flex-end"><button id="btn-loot-all">Loot All</button><button id="btn-close-chest">Close</button></div>`;
  overlay.appendChild(panel);
  document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(overlay));

  let currentLoot = null;
  function openChest(lootArr){
    currentLoot = lootArr||[];
    const box = overlay.querySelector('#chest-contents');
    box.innerHTML = currentLoot.map(e=>`<div>${e.type}: <b>${e.key}</b> ${e.qty?('×'+e.qty):''} ${e.roll?('(+'+e.roll+')'):''}</div>`).join('') || '<i>Empty</i>';
    overlay.style.display='flex';
  }
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.style.display='none'; });
  overlay.querySelector('#btn-close-chest')?.addEventListener('click', ()=> overlay.style.display='none');
  overlay.querySelector('#btn-loot-all')?.addEventListener('click', ()=>{
    (currentLoot||[]).forEach(e=> addItem(e.key, e.qty||1));
    currentLoot = [];
    overlay.style.display='none';
  });

  function attachChestInteraction(scene){
    scene.onPointerObservable.add((evt)=>{
      if (evt.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
      const pick = evt.pickInfo;
      if (!pick?.hit || !pick.pickedMesh) return;
      const m = pick.pickedMesh;
      if (m.name.startsWith("chest") || m.metadata?.loot){
        openChest(m.metadata?.loot||[]);
      }
    });
  }

  window.Items = { ItemDefs, Recipes, rollLoot, addItem, craft, canCraft, attachChestInteraction };
})();
