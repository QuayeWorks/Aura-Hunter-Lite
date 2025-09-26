// rig-editor.js — full editor with import/export/save + anim pane fixes
(() => {
  // ===== Parts & animation data =====
  const PART_KEYS = [
    "pelvis","torsoLower","torsoUpper","neck","head",
    "shoulderL","armL_upper","armL_fore","armL_hand",
    "shoulderR","armR_upper","armR_fore","armR_hand",
    "hipL","legL_thigh","legL_shin","legL_foot",
    "hipR","legR_thigh","legR_shin","legR_foot",
  ];

  // Keyframe store: tracks[part][channel] = [{t, v:{x,y,z}, ease}]
  const K = { length: 2.0, fps: 30, tracks: {} };

  // Maps for selection & lookups
  const pivotOf = new Map();          // key -> pivot TN (Map so we can .clear())
  const keyOfPivot = new WeakMap();   // pivot TN -> key (WeakMap = auto-GC, no .clear())
  const meshOfPivot = new WeakMap();  // pivot TN -> main visual mesh (WeakMap)

  let engine, scene, camera, gizmoMgr;
  let rigRoot = null;           // collider/root
  let booted = false;
  let selectedPivot = null;

  // ===== Utilities =====
  const $ = (q, r=document)=> r.querySelector(q);
  const $$ = (q, r=document)=> Array.from(r.querySelectorAll(q));
  function v3(x=0,y=0,z=0){ return new BABYLON.Vector3(x,y,z); }

  function trackOf(part,ch){
    const P = K.tracks;
    if (!P[part]) P[part]={};
    if (!P[part][ch]) P[part][ch]=[];
    return P[part][ch];
  }

  function trsOf(pivot){
    if (!pivot) return { pos:v3(), rot:v3(), scl:v3(1,1,1) };
    const m = pivot.getChildMeshes(false)[0];
    const s = m?.scaling || pivot.scaling || v3(1,1,1);
    return {
      pos: pivot.position.clone(),
      rot: pivot.rotation?.clone?.() || v3(),
      scl: s.clone ? s.clone() : v3(1,1,1),
    };
  }

  function setTRS(pivot, pos, rot, scl){
    if (!pivot) return;
    if (pos) pivot.position.copyFrom(pos);
    if (rot) pivot.rotation.copyFrom(rot);
    if (scl) {
      const child = meshOfPivot.get(pivot);
      if (child?.scaling) child.scaling.copyFrom(scl);
    }
  }

  function selectPivot(pivot){
    // clear previous
    if (selectedPivot){
      const prevMesh = meshOfPivot.get(selectedPivot);
      if (prevMesh) prevMesh.outlineWidth = 0;
    }
    selectedPivot = pivot;
    if (!pivot) { gizmoMgr.attachToMesh(null); updateReadout(null); return; }

    const mesh = meshOfPivot.get(pivot);
    if (mesh){
      mesh.outlineColor = new BABYLON.Color3(0,1,0.8);
      mesh.outlineWidth = 0.035;
    }
    gizmoMgr.attachToMesh(pivot);
    updateReadout(pivot);
  }

  // ===== UI bindings =====
  function updateReadout(pivot){
    const nameEl = $("#sel-part");
    const posEl  = $("#sel-pos");
    const rotEl  = $("#sel-rot");
    const sclEl  = $("#sel-scl");
    if (!pivot) {
      if (nameEl) nameEl.textContent = "—";
      if (posEl)  posEl.textContent  = "X 0.00 | Y 0.00 | Z 0.00 mm";
      if (rotEl)  rotEl.textContent  = "RX 0.0° | RY 0.0° | RZ 0.0°";
      if (sclEl)  sclEl.textContent  = "SX 1.00 | SY 1.00 | SZ 1.00";
      return;
    }
    const key = keyOfPivot.get(pivot) || "(?)";
    const {pos,rot,scl} = trsOf(pivot);
    if (nameEl) nameEl.textContent = key;
    if (posEl)  posEl.textContent  = `X ${pos.x.toFixed(2)} | Y ${pos.y.toFixed(2)} | Z ${pos.z.toFixed(2)} m`;
    if (rotEl)  rotEl.textContent  = `RX ${(BABYLON.Angle.FromRadians(rot.x).degrees()).toFixed(1)}° | RY ${(BABYLON.Angle.FromRadians(rot.y).degrees()).toFixed(1)}° | RZ ${(BABYLON.Angle.FromRadians(rot.z).degrees()).toFixed(1)}°`;
    if (sclEl)  sclEl.textContent  = `SX ${scl.x.toFixed(2)} | SY ${scl.y.toFixed(2)} | SZ ${scl.z.toFixed(2)}`;
  }

  function bindToolbar(){
    const modes = [
      ["tb-select","select"],
      ["tb-move","move"],
      ["tb-rotate","rotate"],
      ["tb-scale","scale"],
    ];
    modes.forEach(([id,mode])=>{
      const el = document.getElementById(id);
      if (!el) return;
      el.onclick = ()=>{
        if (mode==="select"){
          gizmoMgr.clearGizmos?.();
          gizmoMgr.attachToMesh(null);
        } else if (mode==="move"){
          gizmoMgr.positionGizmoEnabled = true;
          gizmoMgr.rotationGizmoEnabled = false;
          gizmoMgr.scaleGizmoEnabled    = false;
          gizmoMgr.gizmos?.positionGizmo?.updateGizmoPositionToMatchAttachedMesh?.();
        } else if (mode==="rotate"){
          gizmoMgr.positionGizmoEnabled = false;
          gizmoMgr.rotationGizmoEnabled = true;
          gizmoMgr.scaleGizmoEnabled    = false;
        } else if (mode==="scale"){
          gizmoMgr.positionGizmoEnabled = false;
          gizmoMgr.rotationGizmoEnabled = false;
          gizmoMgr.scaleGizmoEnabled    = true;
        }
      };
    });

    // Single toggle for the animation panel via class on #screen--rig
    const togg = document.getElementById("tb-anim");
    const rigScreen = document.getElementById("screen--rig");
    togg?.addEventListener("click", ()=> rigScreen?.classList.toggle("anim-open"));
  }

  function bindActions(){
    $("#rig-reset")?.addEventListener("click", resetRig);
    $("#rig-zero")?.addEventListener("click", zeroPose);
    $("#rig-save-local")?.addEventListener("click", saveLocal);
    $("#rig-export")?.addEventListener("click", exportXML);
    $("#rig-import")?.addEventListener("click", ()=> $("#rig-file")?.click());
    $("#rig-file")?.addEventListener("change", onImportFile);
    $("#rig-exit")?.addEventListener("click", ()=> {
      // leave editor -> back to menu
      document.querySelectorAll(".screen").forEach(s=>s.classList.remove("visible"));
      document.getElementById("screen--menu")?.classList.add("visible");
      window.MenuBG?.start?.();
    });
  }

  // ===== Rig construction (simple segmented boxes, each under a pivot) =====
  function mat(hex){
    const m = new BABYLON.StandardMaterial("m"+Math.random(), scene);
    const c = BABYLON.Color3.FromHexString(hex||"#88ccff");
    m.diffuseColor=c; m.emissiveColor=c.scale(0.16);
    return m;
  }
  function segY(parent, key, w, h, d, hex, pivotOffsetY=0){
    const pivot = new BABYLON.TransformNode(key+"_pivot", scene);
    pivot.parent = parent;
    pivot.position.y = pivotOffsetY;

    const mesh = BABYLON.MeshBuilder.CreateBox(key,{width:w,height:h,depth:d},scene);
    mesh.material = mat(hex);
    mesh.parent = pivot;
    mesh.position.y = -h*0.5;

    pivotOf.set(key, pivot);
    keyOfPivot.set(pivot, key);
    meshOfPivot.set(pivot, mesh);
    return { pivot, mesh };
  }

  function rebuildRig(){
    // dispose previous geometry (keep grid)
    scene.meshes.slice().forEach(m=>{ if(!m.name.startsWith("grid")) m.dispose(); });
    scene.transformNodes.slice().forEach(tn=>{
      if (!tn.name.startsWith("Axes") && !tn.name.startsWith("grid")) tn.dispose();
    });

    // clear strong refs; WeakMaps will GC by themselves
    pivotOf.clear();
    // (no keyOfPivot.clear() / meshOfPivot.clear() — WeakMap has no clear and doesn’t need it)

    // collider/root
    rigRoot = BABYLON.MeshBuilder.CreateBox("collider",{width:0.85,height:2.4,depth:0.7},scene);
    rigRoot.position.y = 1.3;
    const cm = new BABYLON.StandardMaterial("cm",scene); cm.diffuseColor = new BABYLON.Color3(0.1,0.2,0.25); cm.alpha = 0.25;
    rigRoot.material = cm; rigRoot.isPickable=false;

    const hex = "#00ffcc";
    const pelvis = segY(rigRoot,"pelvis",.9,.28,.6,hex,0);
    const tl = segY(pelvis.pivot,"torsoLower",.9,.45,.55,hex,.30);
    const tu = segY(tl.pivot,"torsoUpper",.95,.45,.55,hex,.55);
    const neck = segY(tu.pivot,"neck",.25,.22,.25,hex,.55);
    const head = BABYLON.MeshBuilder.CreateBox("head",{width:.45,height:.6,depth:.45},scene);
    head.material = mat(hex); head.parent = neck.pivot; head.position.y = .30;

    // Shoulders as bare pivots, arms as segments
    const shL = new BABYLON.TransformNode("shoulderL_pivot", scene); shL.parent = tu.pivot; shL.position.set(-.62,.5,0);
    const shR = new BABYLON.TransformNode("shoulderR_pivot", scene); shR.parent = tu.pivot; shR.position.set(.62,.5,0);
    keyOfPivot.set(shL,"shoulderL"); keyOfPivot.set(shR,"shoulderR");
    pivotOf.set("shoulderL", shL); pivotOf.set("shoulderR", shR);

    const aLu = segY(shL,"armL_upper", .25,.55,.25,hex,0);
    const aLf = segY(aLu.pivot,"armL_fore", .22,.55,.22,hex,0);
    segY(aLf.pivot,"armL_hand", .22,.22,.22,hex,0);

    const aRu = segY(shR,"armR_upper", .25,.55,.25,hex,0);
    const aRf = segY(aRu.pivot,"armR_fore", .22,.55,.22,hex,0);
    segY(aRf.pivot,"armR_hand", .22,.22,.22,hex,0);

    const hipL = new BABYLON.TransformNode("hipL_pivot", scene); hipL.parent = pelvis.pivot; hipL.position.set(-.33,-.12,0);
    const hipR = new BABYLON.TransformNode("hipR_pivot", scene); hipR.parent = pelvis.pivot; hipR.position.set(.33,-.12,0);
    keyOfPivot.set(hipL,"hipL"); keyOfPivot.set(hipR,"hipR");
    pivotOf.set("hipL", hipL); pivotOf.set("hipR", hipR);

    const lLt = segY(hipL,"legL_thigh", .30,.65,.30,hex,0);
    const lLs = segY(lLt.pivot,"legL_shin", .27,.65,.27,hex,0);
    segY(lLs.pivot,"legL_foot", .32,.18,.38,hex,0);

    const rLt = segY(hipR,"legR_thigh", .30,.65,.30,hex,0);
    const rLs = segY(rLt.pivot,"legR_shin", .27,.65,.27,hex,0);
    segY(rLs.pivot,"legR_foot", .32,.18,.38,hex,0);
  }

  // ===== Animation Editor =====
  function buildAnimEditor(){
    const tl = $("#an-timeline");
    const tSlider = $("#an-time");
    const tOut = $("#an-time-readout");
    const btnPlay = $("#an-play");
    const btnStop = $("#an-stop");
    const lenEl = $("#an-length");
    const fpsEl = $("#an-fps");
    const partSel = $("#an-track");
    const chSel = $("#an-channel");
    const easeSel = $("#an-ease");
    const addBtn = $("#an-add");
    const delBtn = $("#an-del");

    // populate parts
    partSel.innerHTML = "";
    PART_KEYS.forEach(p=>{
      const opt=document.createElement("option");
      opt.value=p; opt.textContent=p;
      partSel.appendChild(opt);
    });

    function syncLen(){ tSlider.max=String(K.length); lenEl.value=String(K.length); }
    lenEl.oninput = ()=>{ K.length = Math.max(0.25, Math.min(20, Number(lenEl.value)||2)); syncLen(); drawTimeline(); };
    fpsEl.oninput = ()=>{ K.fps = Math.max(6, Math.min(120, Number(fpsEl.value)||30)); };

    function setTime(t){
      t = Math.max(0, Math.min(K.length, t));
      tSlider.value = String(t);
      tOut.textContent = `${Number(t).toFixed(3)}s`;
      applyAtTime(t);
    }
    tSlider.oninput = ()=> setTime(Number(tSlider.value)||0);

    const anim = { playing:false };
    btnPlay.onclick = ()=>{ anim.playing=!anim.playing; btnPlay.textContent= anim.playing?"⏸":"▶"; };
    btnStop.onclick = ()=>{ anim.playing=false; btnPlay.textContent="▶"; };

    addBtn.onclick = ()=>{
      const part = partSel.value, ch = chSel.value;
      const t = Number(tSlider.value)||0;
      const pv = pivotOf.get(part);
      const {pos,rot,scl} = trsOf(pv);
      const cur = ch==="pos"?pos : ch==="rot"?rot : scl;
      const keys = trackOf(part,ch);
      const i = keys.findIndex(k=> Math.abs(k.t - t) < (1/Math.max(24,K.fps)));
      if (i>=0) keys.splice(i,1);
      keys.push({ t, v:{x:cur.x,y:cur.y,z:cur.z}, ease: easeSel.value||"linear" });
      keys.sort((a,b)=>a.t-b.t);
      drawTimeline();
    };

    delBtn.onclick = ()=>{
      const part = partSel.value, ch = chSel.value;
      const t = Number(tSlider.value)||0;
      const keys = trackOf(part,ch);
      const i = keys.findIndex(k=> Math.abs(k.t - t) < (1/Math.max(24,K.fps)));
      if (i>=0){ keys.splice(i,1); drawTimeline(); }
    };

    function drawTimeline(){
      tl.innerHTML=""; const row=document.createElement("div"); row.className="row"; tl.appendChild(row);
      const keys = trackOf(partSel.value, chSel.value);
      keys.forEach((k, idx)=>{
        const el=document.createElement("div");
        el.className="kf"; el.style.left = `${(k.t/K.length)*100}%`;
        el.title=`${k.t.toFixed(3)}s`; el.dataset.idx=String(idx);
        let dragging=false;
        el.onpointerdown=(e)=>{ dragging=true; el.setPointerCapture(e.pointerId); el.classList.add("active"); };
        el.onpointermove=(e)=>{
          if (!dragging) return;
          const rect=tl.getBoundingClientRect();
          const t = Math.max(0, Math.min(K.length, ((e.clientX-rect.left)/rect.width)*K.length));
          k.t = t; setTime(t); el.style.left = `${(k.t/K.length)*100}%`;
        };
        el.onpointerup=(e)=>{ dragging=false; el.releasePointerCapture(e.pointerId); el.classList.remove("active"); keys.sort((a,b)=>a.t-b.t); };
        el.onclick=()=> setTime(k.t);
        row.appendChild(el);
      });
    }

    function lerp(a,b,t){ return a + (b-a)*t; }
    function ease01(t,e){ if(e==="easeIn")return t*t; if(e==="easeOut")return 1-(1-t)*(1-t); if(e==="easeInOut")return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2; return t; }

    function sampleChannel(part,ch,t){
      const keys=trackOf(part,ch);
      if(!keys.length) return null;
      if(t<=keys[0].t) return keys[0].v;
      if(t>=keys[keys.length-1].t) return keys[keys.length-1].v;
      let a=0,b=1;
      for(let i=1;i<keys.length;i++){ if(t<=keys[i].t){ b=i; a=i-1; break; } }
      const ka=keys[a], kb=keys[b]; const u=(t-ka.t)/Math.max(1e-6,(kb.t-ka.t)); const w=ease01(u,kb.ease||"linear");
      return { x:lerp(ka.v.x,kb.v.x,w), y:lerp(ka.v.y,kb.v.y,w), z:lerp(ka.v.z,kb.v.z,w) };
    }

    function applyAtTime(t){
      PART_KEYS.forEach(part=>{
        const pv=pivotOf.get(part); if(!pv) return;
        const P=sampleChannel(part,"pos",t); if(P) pv.position.set(P.x,P.y,P.z);
        const R=sampleChannel(part,"rot",t); if(R) pv.rotation.set(R.x,R.y,R.z);
        const S=sampleChannel(part,"scl",t);
        if (S) {
          const child = meshOfPivot.get(pv);
          child?.scaling?.set?.(S.x,S.y,S.z);
        }
      });
      if (selectedPivot) updateReadout(selectedPivot);
    }

    scene.onBeforeRenderObservable.add(()=>{
      // simple animation tick
      if (anim.playing){
        const dt = engine.getDeltaTime()/1000;
        let t = Number(tSlider.value)||0; t += dt; if(t>K.length) t=0; setTime(t);
      }
    });

    syncLen(); setTime(0); drawTimeline();
  }

  // ===== Import / Export / Save =====
  function exportXML(){
    const doc = document.implementation.createDocument("", "", null);
    const root = doc.createElement("rig");
    root.setAttribute("version","1");
    for (const key of PART_KEYS){
      const pv = pivotOf.get(key); if (!pv) continue;
      const trs = trsOf(pv);
      const part = doc.createElement("part");
      part.setAttribute("name", key);
      part.setAttribute("pos", `${trs.pos.x.toFixed(6)},${trs.pos.y.toFixed(6)},${trs.pos.z.toFixed(6)}`);
      part.setAttribute("rot", `${trs.rot.x.toFixed(6)},${trs.rot.y.toFixed(6)},${trs.rot.z.toFixed(6)}`);
      part.setAttribute("scl", `${trs.scl.x.toFixed(6)},${trs.scl.y.toFixed(6)},${trs.scl.z.toFixed(6)}`);
      root.appendChild(part);
    }
    doc.appendChild(root);
    const xmlStr = new XMLSerializer().serializeToString(doc);
    const blob = new Blob([xmlStr], {type:"application/xml"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="hxh_rig.xml";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  function parseVec3(str, fallback){
    if (!str || typeof str!=="string") return fallback;
    const m = str.split(",").map(Number);
    if (m.length!==3 || m.some(v=>!Number.isFinite(v))) return fallback;
    return v3(m[0],m[1],m[2]);
  }

  function importXMLString(xmlStr){
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    const parts = Array.from(doc.getElementsByTagName("part"));
    if (!parts.length) throw new Error("No <part> elements found.");
    parts.forEach(el=>{
      const name = el.getAttribute("name");
      if (!name || !pivotOf.has(name)) return;
      const pv = pivotOf.get(name);
      const pos = parseVec3(el.getAttribute("pos"), pv.position);
      const rot = parseVec3(el.getAttribute("rot"), pv.rotation||v3());
      const scl = parseVec3(el.getAttribute("scl"), v3(1,1,1));
      setTRS(pv, pos, rot, scl);
    });
    // refresh readout if something selected
    if (selectedPivot) updateReadout(selectedPivot);
  }

  async function onImportFile(e){
    const file = e?.target?.files?.[0];
    if (!file) return;
    const text = await file.text();
    try{
      importXMLString(text);
      alert("Rig imported.");
    }catch(err){
      console.error(err);
      alert("Import failed. Check console for details.");
    }finally{
      e.target.value="";
    }
  }

  function saveLocal(){
    try{
      const snap = {};
      PART_KEYS.forEach(k=>{
        const pv = pivotOf.get(k);
        if (!pv) return;
        const {pos,rot,scl} = trsOf(pv);
        snap[k] = { pos, rot, scl };
      });
      localStorage.setItem("hxh.rig.snapshot", JSON.stringify(snap));
      alert("Saved to browser.");
    }catch(err){
      console.error(err);
      alert("Save failed.");
    }
  }

  function loadLocalIfAny(){
    try{
      const str = localStorage.getItem("hxh.rig.snapshot");
      if (!str) return;
      const snap = JSON.parse(str);
      Object.entries(snap).forEach(([k,val])=>{
        const pv = pivotOf.get(k); if (!pv) return;
        setTRS(pv, v3(val.pos.x,val.pos.y,val.pos.z), v3(val.rot.x,val.rot.y,val.rot.z), v3(val.scl.x,val.scl.y,val.scl.z));
      });
    }catch{}
  }

  // ===== Reset & Zero pose =====
  function zeroPose(){
    PART_KEYS.forEach(k=>{
      const pv = pivotOf.get(k); if(!pv) return;
      const {pos,scl} = trsOf(pv);
      setTRS(pv, pos, v3(0,0,0), scl);
    });
    if (selectedPivot) updateReadout(selectedPivot);
  }
  function resetRig(){
    rebuildRig();
    if (selectedPivot) selectPivot(null);
  }

  // ===== Picking & gizmos =====
  function bindPicking(){
    scene.onPointerObservable.add((evt)=>{
      if (evt.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
      const pick = evt.pickInfo;
      if (!pick?.hit) return;

      // Prefer a pivot mapping
      const mesh = pick.pickedMesh;
      let pivot = mesh.parent;
      while (pivot && !keyOfPivot.has(pivot)) pivot = pivot.parent;
      if (!pivot) return;

      selectPivot(pivot);
    });
  }

  // ===== Boot editor =====
  function boot(){
    if (booted) return; booted = true;

    const canvas = document.getElementById("rig-canvas");
    engine = new BABYLON.Engine(canvas, true, { stencil:true });
    scene  = new BABYLON.Scene(engine);
    scene.clearColor   = new BABYLON.Color4(0.06,0.08,0.12,1);
    scene.ambientColor = new BABYLON.Color3(0.35,0.35,0.42);

    camera = new BABYLON.ArcRotateCamera("cam", Math.PI/2, 1.1, 8, new BABYLON.Vector3(0,1.1,0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 3; camera.upperRadiusLimit = 30;
    camera.wheelDeltaPercentage = 0.015; camera.pinchDeltaPercentage = 0.015;
    camera.panningSensibility = 1000;

    new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene).intensity=1.0;
    const sun  = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5,-1,-0.3), scene);
    sun.position = new BABYLON.Vector3(30,60,30); sun.intensity=1.05;

    // grid
    try{
      const ground = BABYLON.MeshBuilder.CreateGround("grid",{width:30,height:30},scene);
      const grid = new BABYLON.GridMaterial("gridMat",scene);
      grid.gridRatio=1.5; grid.majorUnitFrequency=5; grid.minorUnitVisibility=0.6;
      grid.color1=new BABYLON.Color3(0.35,0.8,1); grid.color2=new BABYLON.Color3(0.05,0.07,0.1);
      ground.material = grid; ground.isPickable=false;
    }catch{}

    gizmoMgr = new BABYLON.GizmoManager(scene);
    gizmoMgr.usePointerToAttachGizmos = false;
    gizmoMgr.clearGizmos?.();
    gizmoMgr.positionGizmoEnabled = false;
    gizmoMgr.rotationGizmoEnabled = false;
    gizmoMgr.scaleGizmoEnabled    = false;

    rebuildRig();
    bindToolbar();
    bindActions();
    bindPicking();
    buildAnimEditor();
    loadLocalIfAny();

    engine.runRenderLoop(()=>{ scene.render(); });
    window.addEventListener("resize", ()=> engine.resize());
  }

  document.addEventListener("DOMContentLoaded", boot);
  window.RigEditor = { exportXML, importXMLString, saveLocal, resetRig, zeroPose };
})();
