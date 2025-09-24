// rig-editor.js — smooth zoom, per-part size/offset/rotation, XML import/export,
// animation preview (walk/idle/jump/punch), and resizable panel support.
(() => {
  // ---------- Defaults ----------
  const DEF = {
    color: "#00ffcc",
    // Sizes
    pelvis:     { w:0.9,  h:0.28, d:0.60 },
    torsoLower: { w:0.9,  h:0.45, d:0.55 },
    torsoUpper: { w:0.95, h:0.45, d:0.55 },
    neck:       { w:0.25, h:0.22, d:0.25 },
    head:       { w:0.45, h:0.60, d:0.45 },
    arm: { upperW:0.25, upperD:0.25, upperLen:0.55, foreW:0.22, foreD:0.22, foreLen:0.55, handLen:0.22 },
    leg: { thighW:0.30, thighD:0.30, thighLen:0.65, shinW:0.27, shinD:0.27, shinLen:0.65, footW:0.32, footH:0.18, footLen:0.38 },
    // Offsets/rotations (degrees)
    transforms: {
      pelvis: t0(), torsoLower: t0(), torsoUpper: t0(), neck: t0(), head: t0(),
      shoulderL: t0(), armL_upper: t0(), armL_fore: t0(), armL_hand: t0(),
      shoulderR: t0(), armR_upper: t0(), armR_fore: t0(), armR_hand: t0(),
      hipL: t0(), legL_thigh: t0(), legL_shin: t0(), legL_foot: t0(),
      hipR: t0(), legR_thigh: t0(), legR_shin: t0(), legR_foot: t0(),
    }
  };
  function t0(){ return { pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} }; }
  const d2r = d => d*Math.PI/180;

  // Deep clone helper
  const deepClone = o => JSON.parse(JSON.stringify(o));

  // Parts we expose to transforms/anim
  const PART_KEYS = [
    "pelvis","torsoLower","torsoUpper","neck","head",
    "shoulderL","armL_upper","armL_fore","armL_hand",
    "shoulderR","armR_upper","armR_fore","armR_hand",
    "hipL","legL_thigh","legL_shin","legL_foot",
    "hipR","legR_thigh","legR_shin","legR_foot",
  ];

  function ensureTransformMap(p){
    if (!p.transforms || typeof p.transforms !== "object") p.transforms = {};
    for (const k of PART_KEYS){
      const base = p.transforms[k] || {};
      const pos = base.pos || {};
      const rot = base.rot || {};
      p.transforms[k] = {
        pos: { x: Number(pos.x)||0, y: Number(pos.y)||0, z: Number(pos.z)||0 },
        rot: { x: Number(rot.x)||0, y: Number(rot.y)||0, z: Number(rot.z)||0 },
      };
    }
    return p.transforms;
  }

  // ---------- Babylon setup ----------
  let engine, scene, camera;
  let rigRoot = null;      // visible collider (helps reading scale)
  let nodes = {};          // map of TransformNodes keyed by part name
  let params = null;       // working params
  let booted = false;

  // Animation-preview state
  const anim = { playing:false, mode:"walk", speed:1.0, grounded:true, phase:0, attackT:0 };

  function boot(){
    if(booted){ refresh(); return; }
    booted = true;

    // load params (browser) or defaults, then normalize
    try { params = JSON.parse(localStorage.getItem("hxh.rig.params")||"null"); } catch(e){ params=null; }
    if(!params) params = deepClone(DEF);
    ensureTransformMap(params);

    const canvas = document.getElementById("rig-canvas");
    engine = new BABYLON.Engine(canvas, true, { stencil: true });
    scene  = new BABYLON.Scene(engine);
    scene.clearColor   = new BABYLON.Color4(0.06, 0.08, 0.12, 1);
    scene.ambientColor = new BABYLON.Color3(0.35,0.35,0.42);

    camera = new BABYLON.ArcRotateCamera("cam", Math.PI/2, 1.1, 8, new BABYLON.Vector3(0,1.1,0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 3;                         // allow closer
    camera.upperRadiusLimit = 30;                        // and farther
    camera.wheelDeltaPercentage = 0.015;                 // smoother wheel zoom
    camera.pinchDeltaPercentage = 0.015;                 // smoother pinch
    camera.useNaturalPinchZoom = true;
    const pInput = camera.inputs.attached.pointers; if(pInput && pInput.buttons) pInput.buttons = [2]; // right-drag orbit
    camera.panningSensibility = 0; window.addEventListener("contextmenu", e=> e.preventDefault());

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene); hemi.intensity = 1.0;
    const sun  = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5,-1,-0.3), scene);
    sun.position = new BABYLON.Vector3(30,60,30); sun.intensity = 1.05;

    // grid ground
    try {
      const ground = BABYLON.MeshBuilder.CreateGround("g",{width:30,height:30},scene);
      const grid = new BABYLON.GridMaterial("grid", scene);
      grid.gridRatio = 1.5; grid.majorUnitFrequency = 5; grid.minorUnitVisibility = 0.6;
      grid.color1 = new BABYLON.Color3(0.35,0.8,1); grid.color2 = new BABYLON.Color3(0.05,0.07,0.1);
      ground.material = grid;
    } catch {}

    // orientation helpers
    const beacon = BABYLON.MeshBuilder.CreateBox("beacon",{size:0.6},scene);
    const bm = new BABYLON.StandardMaterial("bm", scene); bm.emissiveColor = new BABYLON.Color3(1,0.5,0.2);
    beacon.material = bm; beacon.position = new BABYLON.Vector3(0,1.1,2);
    new BABYLON.AxesViewer(scene, 1.5);

    rebuildRig();
    buildForm();
    buildAnimBar();   // <— new: animation controls overlay
	buildResizablePanel();
    // simple smoothing of abrupt wheel jumps (lerp to a target)
    let targetRadius = camera.radius;
    scene.onBeforeRenderObservable.add(()=>{
      targetRadius = BABYLON.Scalar.Clamp(targetRadius, camera.lowerRadiusLimit||1, camera.upperRadiusLimit||100);
      camera.radius = BABYLON.Scalar.Lerp(camera.radius, targetRadius, 0.18);
    });
    canvas.addEventListener("wheel", () => { targetRadius = camera.radius; }, { passive:true });

    engine.runRenderLoop(()=>{
      const dt = engine.getDeltaTime() / 1000;
      if (anim.playing) animateTick(dt);
      scene.render();
    });
    window.addEventListener("resize", ()=>engine.resize());
  }

  // ---------- Build rig (same topology as the game) ----------
  function mat(hex){
    const m = new BABYLON.StandardMaterial("m"+Math.random(), scene);
    const c = BABYLON.Color3.FromHexString(hex);
    m.diffuseColor=c; m.emissiveColor=c.scale(0.16);
    return m;
  }
  function segY(parent, key, w,h,d, hex){
    const pivot = new BABYLON.TransformNode(key+"_pivot", scene);
    pivot.parent = parent;
    const mesh = BABYLON.MeshBuilder.CreateBox(key,{width:w,height:h,depth:d},scene);
    mesh.material = mat(hex); mesh.parent = pivot;
    mesh.position.y = -h*0.5;
    nodes[key] = pivot;
    return {pivot, mesh};
  }
  function footSeg(parent, key, w,h,len, hex){
    const pivot = new BABYLON.TransformNode(key+"_pivot", scene);
    pivot.parent = parent;
    const mesh = BABYLON.MeshBuilder.CreateBox(key,{width:w,height:h,depth:len},scene);
    mesh.material = mat(hex); mesh.parent = pivot;
    mesh.position.y = -h*0.5; mesh.position.z = len*0.5;
    nodes[key] = pivot;
    return {pivot, mesh};
  }

  function rebuildRig(){
    // purge previous (keep ground/axes/beacon)
    scene.meshes.slice().forEach(m=>{ if(!["g","beacon"].includes(m.name)) m.dispose(); });
    scene.transformNodes.slice().forEach(t=>{ if(!t.name.startsWith("Axes")) t.dispose(); });
    nodes = {};

    const hex = params.color;

    // visible collider in editor (to read scale/height)
    rigRoot = BABYLON.MeshBuilder.CreateBox("collider",{width:0.85,height:2.4,depth:0.7}, scene);
    rigRoot.position.y = 1.3;
    const cm = new BABYLON.StandardMaterial("cm", scene);
    cm.diffuseColor = new BABYLON.Color3(0.1,0.2,0.25); cm.alpha = 0.25; rigRoot.material = cm;

    // torso chain
    const pelvis     = segY(rigRoot, "pelvis",     params.pelvis.w,     params.pelvis.h,     params.pelvis.d,     hex);
    const torsoLower = segY(pelvis.pivot, "torsoLower", params.torsoLower.w, params.torsoLower.h, params.torsoLower.d, hex);
    torsoLower.pivot.position.y = 0.30;
    const torsoUpper = segY(torsoLower.pivot, "torsoUpper", params.torsoUpper.w, params.torsoUpper.h, params.torsoUpper.d, hex);
    torsoUpper.pivot.position.y = 0.55;
    const neck       = segY(torsoUpper.pivot, "neck", params.neck.w, params.neck.h, params.neck.d, hex);
    neck.pivot.position.y = 0.55;

    // head pivot (so head has its own transform)
    const headPivot = new BABYLON.TransformNode("head_pivot", scene);
    headPivot.parent = neck.pivot; nodes["head"] = headPivot;
    const head = BABYLON.MeshBuilder.CreateBox("head",{width:params.head.w,height:params.head.h,depth:params.head.d}, scene);
    head.material = mat(hex); head.parent = headPivot; head.position.y = params.head.h*0.5;

    // shoulders anchors
    const shoulderL = new BABYLON.TransformNode("shoulderL", scene); shoulderL.parent = torsoUpper.pivot; nodes["shoulderL"] = shoulderL;
    const shoulderR = new BABYLON.TransformNode("shoulderR", scene); shoulderR.parent = torsoUpper.pivot; nodes["shoulderR"] = shoulderR;

    // arms
    const a = params.arm;
    const armL = {};
    armL.upper = segY(shoulderL, "armL_upper", a.upperW, a.upperLen, a.upperD, hex);
    armL.fore  = segY(armL.upper.pivot, "armL_fore",  a.foreW,  a.foreLen,  a.foreD,  hex);
    armL.hand  = segY(armL.fore.pivot,  "armL_hand",  a.foreW,  a.handLen,  a.foreD,  hex);

    const armR = {};
    armR.upper = segY(shoulderR, "armR_upper", a.upperW, a.upperLen, a.upperD, hex);
    armR.fore  = segY(armR.upper.pivot, "armR_fore",  a.foreW,  a.foreLen,  a.foreD,  hex);
    armR.hand  = segY(armR.fore.pivot,  "armR_hand",  a.foreW,  a.handLen,  a.foreD,  hex);

    // hips anchors
    const hipL = new BABYLON.TransformNode("hipL", scene); hipL.parent = pelvis.pivot; nodes["hipL"] = hipL;
    const hipR = new BABYLON.TransformNode("hipR", scene); hipR.parent = pelvis.pivot; nodes["hipR"] = hipR;

    // legs
    const l = params.leg;
    const legL = {};
    legL.thigh = segY(hipL, "legL_thigh", l.thighW, l.thighLen, l.thighD, hex);
    legL.shin  = segY(legL.thigh.pivot, "legL_shin",  l.shinW,  l.shinLen,  l.shinD,  hex);
    legL.foot  = footSeg(legL.shin.pivot, "legL_foot", l.footW, l.footH, l.footLen, hex);

    const legR = {};
    legR.thigh = segY(hipR, "legR_thigh", l.thighW, l.thighLen, l.thighD, hex);
    legR.shin  = segY(legR.thigh.pivot, "legR_shin",  l.shinW,  l.shinLen,  l.shinD,  hex);
    legR.foot  = footSeg(legR.shin.pivot, "legR_foot", l.footW, l.footH, l.footLen, hex);

    applyTransforms(); // pose from params
  }

  function applyTransforms(){
    const T = ensureTransformMap(params);
    for (const key of PART_KEYS){
      const node = nodes[key];
      if(!node) continue;
      const tr = T[key];
      node.position.set(tr.pos.x, tr.pos.y, tr.pos.z);
      node.rotation.set(d2r(tr.rot.x), d2r(tr.rot.y), d2r(tr.rot.z));
    }
  }

  function refresh(){ rebuildRig(); }

  // ---------- Animation Preview ----------
  function partsForAnim(){
    return {
      lowerTorso: nodes.torsoLower, upperTorso: nodes.torsoUpper, neck: nodes.neck,
      armL: { shoulder: nodes.armL_upper, elbow: nodes.armL_fore, wrist: nodes.armL_hand },
      armR: { shoulder: nodes.armR_upper, elbow: nodes.armR_fore, wrist: nodes.armR_hand },
      legL: { hip: nodes.legL_thigh, knee: nodes.legL_shin, ankle: nodes.legL_foot },
      legR: { hip: nodes.legR_thigh, knee: nodes.legR_shin, ankle: nodes.legR_foot },
    };
  }
  function addRot(n, rx=0,ry=0,rz=0){ if(!n) return; n.rotation.x += rx; n.rotation.y += ry; n.rotation.z += rz; }

  // same motion profile as the game, but additive (on top of current pose)
  function updateWalkAnimEditor(P, speed, grounded, dt, attackT=0){
    const phInc = (grounded ? speed*4.8 : speed*2.4) * dt * 1.5;
    anim.phase += phInc;
    const ph = anim.phase;

    const swing = grounded ? Math.sin(ph)*0.7 : 0.3*Math.sin(ph*0.6);
    const armSwing = swing*0.8;

    // legs
    addRot(P.legL.hip,  swing,0,0);
    addRot(P.legR.hip, -swing,0,0);
    const kneeL = Math.max(0, -Math.sin(ph))*1.1;
    const kneeR = Math.max(0,  Math.sin(ph))*1.1;
    addRot(P.legL.knee, kneeL,0,0);
    addRot(P.legR.knee, kneeR,0,0);
    addRot(P.legL.ankle, -kneeL*0.35 + 0.1*Math.sin(ph*2),0,0);
    addRot(P.legR.ankle, -kneeR*0.35 - 0.1*Math.sin(ph*2),0,0);

    // arms
    addRot(P.armL.shoulder, -armSwing,0,0);
    addRot(P.armR.shoulder,  armSwing,0,0);
    const elbowL = Math.max(0,  Math.sin(ph))*0.6;
    const elbowR = Math.max(0, -Math.sin(ph))*0.6;
    addRot(P.armL.elbow, elbowL,0,0); addRot(P.armR.elbow, elbowR,0,0);
    addRot(P.armL.wrist, -elbowL*0.4,0,0); addRot(P.armR.wrist, -elbowR*0.4,0,0);

    if(!grounded){
      addRot(P.armL.shoulder, 0.5,0,0);
      addRot(P.armR.shoulder, 0.5,0,0);
      addRot(P.legL.knee, 0.4,0,0);
      addRot(P.legR.knee, 0.4,0,0);
      addRot(P.legL.ankle, 0.15,0,0);
      addRot(P.legR.ankle, 0.15,0,0);
    }

    if(attackT>0){
      const t = Math.min(1, attackT/0.22);
      const k = Math.sin(t*Math.PI);
      // punch (R)
      addRot(P.armR.shoulder, -1.6*k,0,0);
      addRot(P.armR.elbow,     0.2*(1-k),0,0);
      addRot(P.armR.wrist,     0.12,0,0);
    }

    // subtle torso/head
    addRot(P.lowerTorso, 0.05*Math.sin(ph*2)*(grounded?1:0.3),0,0);
    addRot(P.upperTorso, 0.03*Math.sin(ph*2+0.4)*(grounded?1:0.3),0,0);
    addRot(P.neck,      -0.03*Math.sin(ph*2+0.2),0,0);
  }

  function animateTick(dt){
    // reset to your configured pose, then add animation deltas
    applyTransforms();
    const P = partsForAnim();

    // idle walk speed trick
    let spd = anim.speed;
    if (anim.mode === "idle") spd = 0.15*anim.speed;
    if (anim.mode === "walk") anim.grounded = true;
    if (anim.mode === "jump") anim.grounded = false;

    // auto punch every ~0.8s when "punch" mode
    if (anim.mode === "punch"){
      anim.grounded = true;
      if (anim.attackT<=0) anim.attackT = 0.22;
      else anim.attackT = Math.max(0, anim.attackT - dt);
    } else {
      anim.attackT = 0;
    }

    updateWalkAnimEditor(P, spd, anim.grounded, dt, anim.attackT);
  }

	function buildResizablePanel(){
	  const layout = document.querySelector('#screen--rig .rig-layout');
	  const panel  = document.querySelector('#screen--rig .rig-panel');
	  if (!layout || !panel) return;

	  // Insert splitter between canvas and panel if missing
	  let res = layout.querySelector('.rig-resizer');
	  if (!res){
		res = document.createElement('div');
		res.className = 'rig-resizer';
		// insert before the panel so DOM order = [canvas, resizer, panel]
		layout.insertBefore(res, panel);
	  }

	  // Restore saved width
	  const saved = parseInt(localStorage.getItem('hxh.rig.panelWidth') || '', 10);
	  if (Number.isFinite(saved)) {
		layout.style.setProperty('--panel-w', `${saved}px`);
	  }

	  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

	  let dragging = false;
	  const onMove = (e) => {
		if (!dragging) return;
		const rect = layout.getBoundingClientRect();
		// distance from mouse to right edge = desired panel width
		const vwMax = Math.max(320, window.innerWidth || rect.width);
		const minW = 260;
		const maxW = Math.floor(vwMax * 0.60); // 60vw cap
		const newW = clamp(rect.right - e.clientX, minW, maxW);
		layout.style.setProperty('--panel-w', `${newW}px`);
		localStorage.setItem('hxh.rig.panelWidth', String(newW));
		e.preventDefault();
	  };
	  const onUp = () => { dragging = false; document.body.style.userSelect = ''; };

	  res.addEventListener('mousedown', (e)=>{
		dragging = true; document.body.style.userSelect = 'none';
		e.preventDefault();
	  });
	  window.addEventListener('mousemove', onMove);
	  window.addEventListener('mouseup', onUp);
	}

  // ---------- UI ----------
  function buildForm(){
    const form = document.getElementById("rig-form");
    form.innerHTML = "";

    function group(title, id){
      const g = document.createElement("div"); g.className="group"; if(id) g.id=id;
      const h = document.createElement("h3"); h.textContent = title; h.style.marginTop = "0"; g.appendChild(h);
      form.appendChild(g);
      return g;
    }
    function numberRow(groupEl, label, getter, setter, step=0.01, min=-999, max=999){
      const row = document.createElement("div"); row.className="row";
      const lab = document.createElement("label"); lab.textContent = label;
      const input = document.createElement("input"); input.type="number"; input.step=String(step); input.min=min; input.max=max;
      input.value = getter();
      input.addEventListener("input", ()=>{
        const v = Number(input.value);
        setter(isFinite(v)?v:0);
        refresh();
        saveLocalSilently();
      });
      row.appendChild(lab);
      row.appendChild(input);
      groupEl.appendChild(row);
    }
    function xyzRows(title, key, kind){
      const g = group(title);
      ["x","y","z"].forEach(axis=>{
        numberRow(g, `${kind.toUpperCase()} ${axis.toUpperCase()}`,
          ()=> params.transforms[key][kind][axis],
          (v)=> { params.transforms[key][kind][axis] = v; },
          kind==="rot"? 1 : 0.01,
          kind==="rot"? -180 : -3,
          kind==="rot"?  180 :  3
        );
      });
    }
    function sizeRows(title, spec, keys){
      const g = group(title);
      keys.forEach(k=>{
        numberRow(g, k.toUpperCase(), ()=>spec[k], (v)=>{ spec[k]=v; }, 0.01, 0.01, 5);
      });
    }

    // Color
    const gCol = group("Theme / Color");
    const colorRow = document.createElement("div"); colorRow.className="row";
    colorRow.innerHTML = `<label>Color</label><input id="rig-color" type="color" value="${params.color}">`;
    gCol.appendChild(colorRow);
    gCol.querySelector("#rig-color").addEventListener("input",(e)=>{ params.color = e.target.value; refresh(); saveLocalSilently(); });

    // Sizes
    sizeRows("Pelvis Size", params.pelvis, ["w","h","d"]);
    sizeRows("Lower Torso Size", params.torsoLower, ["w","h","d"]);
    sizeRows("Upper Torso Size", params.torsoUpper, ["w","h","d"]);
    sizeRows("Neck Size", params.neck, ["w","h","d"]);
    sizeRows("Head Size", params.head, ["w","h","d"]);

    const gAr = group("Arms Size");
    [["upperW","Upper Width"],["upperD","Upper Depth"],["upperLen","Upper Length"],
     ["foreW","Fore Width"],["foreD","Fore Depth"],["foreLen","Fore Length"],["handLen","Hand Length"]]
     .forEach(([key,label])=>{
       numberRow(gAr, label, ()=>params.arm[key], (v)=>{ params.arm[key]=v; });
     });

    const gLeg = group("Legs Size");
    [["thighW","Thigh Width"],["thighD","Thigh Depth"],["thighLen","Thigh Length"],
     ["shinW","Shin Width"],["shinD","Shin Depth"],["shinLen","Shin Length"],
     ["footW","Foot Width"],["footH","Foot Height"],["footLen","Foot Length"]]
     .forEach(([key,label])=>{
       numberRow(gLeg, label, ()=>params.leg[key], (v)=>{ params.leg[key]=v; });
     });

    // Transforms (Offsets & Rotations)
    const order = [
      ["pelvis","Pelvis"],
      ["torsoLower","Lower Torso"],
      ["torsoUpper","Upper Torso"],
      ["neck","Neck"],
      ["head","Head"],
      ["shoulderL","Shoulder L"], ["armL_upper","Upper Arm L"], ["armL_fore","Forearm L"], ["armL_hand","Hand L"],
      ["shoulderR","Shoulder R"], ["armR_upper","Upper Arm R"], ["armR_fore","Forearm R"], ["armR_hand","Hand R"],
      ["hipL","Hip L"], ["legL_thigh","Thigh L"], ["legL_shin","Shin L"], ["legL_foot","Foot L"],
      ["hipR","Hip R"], ["legR_thigh","Thigh R"], ["legR_shin","Shin R"], ["legR_foot","Foot R"],
    ];
    order.forEach(([key,title])=>{
      xyzRows(`${title} — Offset`, key, "pos");
      xyzRows(`${title} — Rotation (deg)`, key, "rot");
    });

    wireActionsRow(); // buttons at the bottom
  }

  // ---- Actions (reuse existing row; no duplicates) ----
  function wireActionsRow() {
    let actions = document.querySelector('#screen--rig .rig-actions');
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "row-right rig-actions";
      document.getElementById("rig-form").appendChild(actions);
    }
    if (!actions.dataset.wired) {
      actions.innerHTML = `
        <button id="rig-reset" class="secondary">Reset Sizes &amp; Pose</button>
        <button id="rig-zero-pose" class="secondary">Zero Pose</button>
        <button id="rig-save-local" class="secondary">Save to Browser</button>
        <button id="rig-import" class="secondary">Import XML</button>
        <button id="rig-export" class="primary">Export XML</button>
        <button id="rig-exit" class="success">Back</button>
        <input id="rig-file" type="file" accept=".xml,application/xml" style="display:none">
      `;
      actions.dataset.wired = "1";
    }

    document.getElementById("rig-reset").onclick = ()=>{
      params = deepClone(DEF);
      refresh(); buildForm(); saveLocalSilently();
    };
    document.getElementById("rig-zero-pose").onclick = ()=>{
      for(const k of Object.keys(params.transforms)) params.transforms[k] = t0();
      refresh(); buildForm(); saveLocalSilently();
    };
    document.getElementById("rig-save-local").onclick = ()=>{ saveLocal(); };
    document.getElementById("rig-export").onclick = ()=>{ exportXML(); };
    document.getElementById("rig-exit").onclick = ()=>{
      document.querySelectorAll(".screen").forEach(s=>s.classList.remove("visible"));
      document.getElementById("screen--menu").classList.add("visible");
    };

    // Import XML
    const fileInput = document.getElementById("rig-file");
    document.getElementById("rig-import").onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const text = await f.text();
        const loaded = parseRigXML(text);
        if (!loaded) { alert("Invalid XML format."); return; }
        params = loaded; ensureTransformMap(params);
        refresh(); buildForm(); saveLocalSilently();
        alert("Rig imported.");
      } catch (err) {
        console.error(err);
        alert("Failed to import XML.");
      } finally {
        fileInput.value = "";
      }
    };
  }

  // ---- Animation controls overlay (top-right of canvas) ----
  function buildAnimBar(){
    const wrap = document.querySelector(".rig-canvas-wrap");
    let bar = document.getElementById("rig-animbar");
    if (bar) return; // already built
    bar = document.createElement("div");
    bar.id = "rig-animbar";
    bar.className = "rig-animbar";
    bar.innerHTML = `
      <button id="anim-play" class="secondary">▶ Play</button>
      <select id="anim-mode" class="secondary">
        <option value="walk">Walk / Run</option>
        <option value="idle">Idle</option>
        <option value="jump">Jump (air pose)</option>
        <option value="punch">Punch loop</option>
      </select>
      <label class="anim-speed">Speed
        <input id="anim-speed" type="range" min="0.2" max="3" step="0.1" value="1">
      </label>
    `;
    wrap.appendChild(bar);

    const btn  = document.getElementById("anim-play");
    const mode = document.getElementById("anim-mode");
    const spd  = document.getElementById("anim-speed");

    btn.onclick = ()=>{
      anim.playing = !anim.playing;
      btn.textContent = anim.playing ? "⏸ Pause" : "▶ Play";
    };
    mode.onchange = ()=>{ anim.mode = mode.value; };
    spd.oninput  = ()=>{ anim.speed = Number(spd.value)||1; };
  }

  // ---------- persistence & export ----------
  function saveLocalSilently(){ try{ localStorage.setItem("hxh.rig.params", JSON.stringify(params)); }catch(_){} }
  function saveLocal(){ saveLocalSilently(); alert("Saved this rig to your browser (localStorage)."); }

  function parseFloatAttr(node, name, def=0){ const v = parseFloat(node?.getAttribute(name)); return Number.isFinite(v) ? v : def; }
  function parseRigXML(text){
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return null;
    const root = doc.querySelector("rig"); if (!root) return null;

    const out = deepClone(DEF);
    const col = root.getAttribute("color"); if (col) out.color = col;

    // sizes
    const sizes = root.querySelector("sizes");
    if (sizes){
      const set3 = (tag, dst) => {
        const n = sizes.querySelector(tag); if(!n) return;
        ["w","h","d"].forEach(k => { if(n.hasAttribute(k)) dst[k] = parseFloatAttr(n,k,dst[k]); });
      };
      set3("pelvis", out.pelvis);
      set3("torsoLower", out.torsoLower);
      set3("torsoUpper", out.torsoUpper);
      set3("neck", out.neck);
      set3("head", out.head);

      const arm = sizes.querySelector("arm");
      if (arm){
        [["upperW","upperW"],["upperD","upperD"],["upperLen","upperLen"],
         ["foreW","foreW"],["foreD","foreD"],["foreLen","foreLen"],["handLen","handLen"]]
         .forEach(([attr,key])=>{ if(arm.hasAttribute(attr)) out.arm[key] = parseFloatAttr(arm, attr, out.arm[key]); });
      }
      const leg = sizes.querySelector("leg");
      if (leg){
        [["thighW","thighW"],["thighD","thighD"],["thighLen","thighLen"],
         ["shinW","shinW"],["shinD","shinD"],["shinLen","shinLen"],
         ["footW","footW"],["footH","footH"],["footLen","footLen"]]
         .forEach(([attr,key])=>{ if(leg.hasAttribute(attr)) out.leg[key] = parseFloatAttr(leg, attr, out.leg[key]); });
      }
    }

    // transforms
    ensureTransformMap(out);
    const T = root.querySelector("transforms");
    if (T){
      for (const key of PART_KEYS){
        const n = T.querySelector(key); if (!n) continue;
        const tr = out.transforms[key];
        tr.pos.x = parseFloatAttr(n,"posX",tr.pos.x);
        tr.pos.y = parseFloatAttr(n,"posY",tr.pos.y);
        tr.pos.z = parseFloatAttr(n,"posZ",tr.pos.z);
        tr.rot.x = parseFloatAttr(n,"rotX",tr.rot.x);
        tr.rot.y = parseFloatAttr(n,"rotY",tr.rot.y);
        tr.rot.z = parseFloatAttr(n,"rotZ",tr.rot.z);
      }
    }
    return out;
  }

  function exportXML(){
    const p = params;
    function attrs(obj){ return Object.entries(obj).map(([k,v])=>`${k}="${Number(v).toFixed(3)}"`).join(" "); }
    function tnode(key){
      const tr = p.transforms[key] || t0();
      return `    <${key} posX="${tr.pos.x.toFixed(3)}" posY="${tr.pos.y.toFixed(3)}" posZ="${tr.pos.z.toFixed(3)}" rotX="${tr.rot.x.toFixed(3)}" rotY="${tr.rot.y.toFixed(3)}" rotZ="${tr.rot.z.toFixed(3)}" />`;
    }
    const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<rig name="CustomRig" color="${p.color}">
  <sizes>
    <pelvis ${attrs(p.pelvis)} />
    <torsoLower ${attrs(p.torsoLower)} />
    <torsoUpper ${attrs(p.torsoUpper)} />
    <neck ${attrs(p.neck)} />
    <head ${attrs(p.head)} />
    <arm ${attrs(p.arm)} />
    <leg ${attrs(p.leg)} />
  </sizes>
  <transforms>
${PART_KEYS.map(tnode).join("\n")}
  </transforms>
</rig>`;
    const blob = new Blob([xml], {type:"application/xml"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hxh_rig_${Date.now()}.xml`;
    document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
  }

  // public
  window.RigEditor = { boot };
})();
