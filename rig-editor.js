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
  const anim = {
    playing:false,
    mode:"walk",
    speed:1.0,
    grounded:true,
    phase:0,
    attackT:0,
    clipTime:0
  };

  let animClips = [];
  const animEditorState = { clipId:null, frameId:null };
  let animPlayButton = null;
  let animModeSelect = null;
  const animUIRefs = { previewSlider:null, frameSelect:null, clipSelect:null };

  function newId(prefix){
    return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  }

  function cloneTransforms(src){
    const wrap = { transforms: deepClone(src || {}) };
    ensureTransformMap(wrap);
    return deepClone(wrap.transforms);
  }

  function loadAnimations(){
    animClips = [];
    try {
      const raw = JSON.parse(localStorage.getItem("hxh.rig.animations") || "null");
      if (Array.isArray(raw)) animClips = raw.map(normalizeClip).filter(Boolean);
      else if (raw && Array.isArray(raw.clips)) animClips = raw.clips.map(normalizeClip).filter(Boolean);
    } catch (err) {
      console.warn("Failed to parse stored rig animations", err);
    }
    if (!animClips.length) {
      const clip = createClip("New Clip");
      clip.frames[1].time = clip.length;
      animClips.push(clip);
    }
    ensureClipSelection();
  }

  function saveAnimationsLocal(){
    try { localStorage.setItem("hxh.rig.animations", JSON.stringify(animClips)); } catch (_) {}
  }

  function normalizeClip(raw){
    if (!raw) return null;
    const clip = {
      id: typeof raw.id === "string" && raw.id ? raw.id : newId("clip"),
      name: (raw.name || "Clip").trim() || "Clip",
      length: Number(raw.length) > 0 ? Number(raw.length) : 1,
      loop: raw.loop !== false,
      frames: []
    };
    const frames = Array.isArray(raw.frames) ? raw.frames : [];
    frames.forEach(f => {
      const frame = {
        id: typeof f?.id === "string" && f.id ? f.id : newId("kf"),
        time: Number(f?.time),
        transforms: cloneTransforms(f?.transforms)
      };
      if (!Number.isFinite(frame.time)) frame.time = 0;
      frame.time = Math.max(0, frame.time);
      clip.frames.push(frame);
    });
    if (!clip.frames.length) {
      clip.frames.push({ id:newId("kf"), time:0, transforms: cloneTransforms(params?.transforms || DEF.transforms) });
      clip.frames.push({ id:newId("kf"), time:clip.length, transforms: cloneTransforms(params?.transforms || DEF.transforms) });
    }
    clip.frames.sort((a,b)=>a.time-b.time);
    return clip;
  }

  function ensureClipSelection(){
    if (!animClips.length){
      animEditorState.clipId = null;
      animEditorState.frameId = null;
      return null;
    }
    let clip = animClips.find(c=>c.id===animEditorState.clipId);
    if (!clip) {
      clip = animClips[0];
      animEditorState.clipId = clip.id;
    }
    if (!clip.frames.length){
      clip.frames.push({ id:newId("kf"), time:0, transforms: cloneTransforms(params?.transforms || DEF.transforms) });
    }
    let frame = clip.frames.find(f=>f.id===animEditorState.frameId);
    if (!frame){
      frame = clip.frames[0];
      animEditorState.frameId = frame?.id || null;
    }
    return clip;
  }

  function currentClip(){
    return ensureClipSelection();
  }

  function currentFrame(){
    const clip = currentClip();
    if (!clip) return null;
    const frame = clip.frames.find(f=>f.id===animEditorState.frameId);
    return frame || clip.frames[0] || null;
  }

  function createClip(name){
    const clip = {
      id: newId("clip"),
      name: name || "Clip",
      length: 1,
      loop: true,
      frames: [
        { id:newId("kf"), time:0, transforms: cloneTransforms(params?.transforms || DEF.transforms) },
        { id:newId("kf"), time:1, transforms: cloneTransforms(params?.transforms || DEF.transforms) }
      ]
    };
    return clip;
  }

  function duplicateClip(src){
    const clip = {
      id: newId("clip"),
      name: `${src.name || "Clip"} Copy`,
      length: src.length,
      loop: src.loop,
      frames: src.frames.map(f=>({ id:newId("kf"), time:f.time, transforms: cloneTransforms(f.transforms) }))
    };
    clip.frames.sort((a,b)=>a.time-b.time);
    return clip;
  }

  function sortFrames(clip){
    clip.frames.sort((a,b)=>a.time-b.time);
  }

  function sampleClip(clip, time){
    if (!clip || !clip.frames.length) return null;
    const frames = clip.frames;
    if (frames.length === 1) return cloneTransforms(frames[0].transforms);
    const len = Math.max(clip.length, 0.0001);
    let t = time;
    if (clip.loop){
      t = ((t % len) + len) % len;
    } else {
      t = Math.min(len, Math.max(0, t));
    }
    let prev = frames[0];
    let next = frames[frames.length-1];
    for (let i=0;i<frames.length;i++){
      const fr = frames[i];
      if (fr.time >= t){
        next = fr;
        prev = frames[Math.max(0, i-1)];
        break;
      }
    }
    if (t <= frames[0].time) return cloneTransforms(frames[0].transforms);
    if (t >= frames[frames.length-1].time) return cloneTransforms(frames[frames.length-1].transforms);
    if (prev === next) return cloneTransforms(prev.transforms);
    const span = Math.max(0.0001, next.time - prev.time);
    const k = Math.min(1, Math.max(0, (t - prev.time)/span));
    const out = {};
    for (const key of PART_KEYS){
      const A = prev.transforms?.[key] || t0();
      const B = next.transforms?.[key] || t0();
      out[key] = {
        pos: {
          x: BABYLON.Scalar.Lerp(A.pos?.x||0, B.pos?.x||0, k),
          y: BABYLON.Scalar.Lerp(A.pos?.y||0, B.pos?.y||0, k),
          z: BABYLON.Scalar.Lerp(A.pos?.z||0, B.pos?.z||0, k)
        },
        rot: {
          x: BABYLON.Scalar.Lerp(A.rot?.x||0, B.rot?.x||0, k),
          y: BABYLON.Scalar.Lerp(A.rot?.y||0, B.rot?.y||0, k),
          z: BABYLON.Scalar.Lerp(A.rot?.z||0, B.rot?.z||0, k)
        }
      };
    }
    return out;
  }

  function applyPoseToNodes(pose){
    if (!pose) return;
    for (const key of PART_KEYS){
      const node = nodes[key];
      if (!node) continue;
      const tr = pose[key] || t0();
      node.position.set(tr.pos.x, tr.pos.y, tr.pos.z);
      node.rotation.set(d2r(tr.rot.x), d2r(tr.rot.y), d2r(tr.rot.z));
    }
  }

  function setAnimMode(value){
    anim.mode = value;
    if (animModeSelect){
      const hasOption = Array.from(animModeSelect.options).some(opt=>opt.value === value);
      if (hasOption) animModeSelect.value = value;
    }
  }

  function syncAnimPlayButton(){
    if (animPlayButton){
      animPlayButton.textContent = anim.playing ? "⏸ Pause" : "▶ Play";
    }
  }

  function syncPreviewSlider(clip){
    const slider = animUIRefs.previewSlider;
    if (!slider) return;
    if (!clip || clip.id !== animEditorState.clipId) return;
    const len = Math.max(clip.length, 0.0001);
    const ratio = Math.min(1, Math.max(0, anim.clipTime / len));
    slider.value = String(ratio);
  }

  function rebuildAnimModeOptions(){
    if (!animModeSelect) return;
    animModeSelect.querySelectorAll('optgroup[data-custom="1"]').forEach(g=>g.remove());
    if (!animClips.length) return;
    const group = document.createElement("optgroup");
    group.label = "Custom Clips";
    group.dataset.custom = "1";
    animClips.forEach(clip => {
      const opt = document.createElement("option");
      opt.value = `clip:${clip.id}`;
      opt.textContent = clip.name || "Clip";
      if (anim.mode === opt.value) opt.selected = true;
      group.appendChild(opt);
    });
    animModeSelect.appendChild(group);
    const has = Array.from(group.children).some(opt=>opt.value === anim.mode);
    if (has) animModeSelect.value = anim.mode;
  }

  function boot(){
    if(booted){ refresh(); return; }
    booted = true;

    // load params (browser) or defaults, then normalize
    try { params = JSON.parse(localStorage.getItem("hxh.rig.params")||"null"); } catch(e){ params=null; }
    if(!params) params = deepClone(DEF);
    ensureTransformMap(params);
    loadAnimations();

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
    rebuildAnimModeOptions();
    // simple smoothing of abrupt wheel jumps (lerp to a target)
    let targetRadius = camera.radius;
    scene.onBeforeRenderObservable.add(()=>{
      targetRadius = BABYLON.Scalar.Clamp(targetRadius, camera.lowerRadiusLimit||1, camera.upperRadiusLimit||100);
      camera.radius = BABYLON.Scalar.Lerp(camera.radius, targetRadius, 0.18);
    });
    canvas.addEventListener("wheel", () => { targetRadius = camera.radius; }, { passive:true });

    engine.runRenderLoop(()=>{
      const dt = engine.getDeltaTime() / 1000;
      animateTick(dt);
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

    const mode = anim.mode || "walk";
    if (mode.startsWith("clip:")){
      const clipId = mode.slice(5);
      const clip = animClips.find(c=>c.id===clipId);
      if (clip){
        if (anim.playing){
          anim.clipTime += dt * Math.max(anim.speed, 0);
        }
        const len = Math.max(clip.length, 0.0001);
        if (clip.loop){
          anim.clipTime = ((anim.clipTime % len) + len) % len;
        } else {
          anim.clipTime = Math.min(len, Math.max(0, anim.clipTime));
        }
        const pose = sampleClip(clip, anim.clipTime);
        applyPoseToNodes(pose);
        syncPreviewSlider(clip);
      }
      return;
    }

    const P = partsForAnim();

    if (!anim.playing){
      anim.phase = anim.phase || 0;
      anim.attackT = 0;
      return;
    }

    // idle walk speed trick
    let spd = anim.speed;
    if (mode === "idle") spd = 0.15*anim.speed;
    if (mode === "walk") anim.grounded = true;
    if (mode === "jump") anim.grounded = false;

    // auto punch every ~0.8s when "punch" mode
    if (mode === "punch"){
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

    buildAnimationEditorUI();
    wireActionsRow(); // buttons at the bottom

    function buildAnimationEditorUI(){
      const clip = currentClip();
      const frame = currentFrame();
      const gAnim = group("Animations", "rig-anim-editor");
      gAnim.classList.add("rig-anim-editor");

      animUIRefs.previewSlider = null;
      animUIRefs.frameSelect = null;
      animUIRefs.clipSelect = null;

      const clipRow = document.createElement("div");
      clipRow.className = "row";
      const clipLabel = document.createElement("label");
      clipLabel.textContent = "Clip";
      const clipSelect = document.createElement("select");
      clipSelect.id = "rig-anim-clip";
      animClips.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name || "Clip";
        if (clip && c.id === clip.id) opt.selected = true;
        clipSelect.appendChild(opt);
      });
      clipSelect.addEventListener("change", ()=>{
        animEditorState.clipId = clipSelect.value || null;
        const newClip = ensureClipSelection();
        animEditorState.frameId = newClip?.frames[0]?.id || null;
        anim.clipTime = 0;
        anim.playing = false;
        syncAnimPlayButton();
        if (newClip) setAnimMode(`clip:${newClip.id}`);
        else setAnimMode("walk");
        rebuildAnimModeOptions();
        buildForm();
      });
      clipRow.appendChild(clipLabel);
      clipRow.appendChild(clipSelect);
      gAnim.appendChild(clipRow);
      animUIRefs.clipSelect = clipSelect;

      const clipBtnRow = document.createElement("div");
      clipBtnRow.className = "row rig-anim-buttons";
      clipBtnRow.innerHTML = `
        <button type="button" id="rig-anim-new" class="secondary">New Clip</button>
        <button type="button" id="rig-anim-dup" class="secondary">Duplicate</button>
        <button type="button" id="rig-anim-del" class="secondary">Delete</button>
        <button type="button" id="rig-anim-import" class="secondary">Import JSON</button>
        <button type="button" id="rig-anim-export" class="secondary">Export JSON</button>
        <input type="file" id="rig-anim-file" accept=".json,application/json" style="display:none">
      `;
      gAnim.appendChild(clipBtnRow);

      const fileInput = clipBtnRow.querySelector("#rig-anim-file");
      clipBtnRow.querySelector("#rig-anim-new").onclick = ()=>{
        const c = createClip(`Clip ${animClips.length+1}`);
        animClips.push(c);
        animEditorState.clipId = c.id;
        animEditorState.frameId = c.frames[0].id;
        anim.clipTime = 0;
        anim.playing = false;
        syncAnimPlayButton();
        setAnimMode(`clip:${c.id}`);
        rebuildAnimModeOptions();
        saveAnimationsLocal();
        buildForm();
      };
      clipBtnRow.querySelector("#rig-anim-dup").onclick = ()=>{
        if (!clip) return;
        const dup = duplicateClip(clip);
        animClips.push(dup);
        animEditorState.clipId = dup.id;
        animEditorState.frameId = dup.frames[0]?.id || null;
        anim.clipTime = 0;
        anim.playing = false;
        syncAnimPlayButton();
        setAnimMode(`clip:${dup.id}`);
        rebuildAnimModeOptions();
        saveAnimationsLocal();
        buildForm();
      };
      clipBtnRow.querySelector("#rig-anim-del").onclick = ()=>{
        if (!clip) return;
        const idx = animClips.findIndex(c=>c.id===clip.id);
        if (idx < 0) return;
        animClips.splice(idx,1);
        if (!animClips.length) {
          const nc = createClip("New Clip");
          animClips.push(nc);
        }
        ensureClipSelection();
        anim.clipTime = 0;
        anim.playing = false;
        syncAnimPlayButton();
        const sel = currentClip();
        if (sel) setAnimMode(`clip:${sel.id}`);
        else setAnimMode("walk");
        rebuildAnimModeOptions();
        saveAnimationsLocal();
        buildForm();
      };
      clipBtnRow.querySelector("#rig-anim-import").onclick = ()=> fileInput.click();
      clipBtnRow.querySelector("#rig-anim-export").onclick = ()=>{
        const blob = new Blob([JSON.stringify({ clips: animClips }, null, 2)], { type:"application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `rig_animations_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
      };
      fileInput.onchange = async ()=>{
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.clips) ? parsed.clips : null);
          if (!incoming) {
            alert("Invalid animation JSON.");
          } else {
            incoming.map(normalizeClip).filter(Boolean).forEach(c=>animClips.push(c));
            ensureClipSelection();
            anim.clipTime = 0;
            anim.playing = false;
            syncAnimPlayButton();
            const sel = currentClip();
            if (sel) setAnimMode(`clip:${sel.id}`);
            rebuildAnimModeOptions();
            saveAnimationsLocal();
            buildForm();
            alert("Animations imported.");
          }
        } catch (err) {
          console.error(err);
          alert("Failed to import animations.");
        } finally {
          fileInput.value = "";
        }
      };

      if (!clip) return;

      const nameRow = document.createElement("div");
      nameRow.className = "row";
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Name";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = clip.name || "Clip";
      nameInput.addEventListener("input", ()=>{
        clip.name = nameInput.value || "Clip";
        rebuildAnimModeOptions();
        saveAnimationsLocal();
      });
      nameRow.appendChild(nameLabel);
      nameRow.appendChild(nameInput);
      gAnim.appendChild(nameRow);

      numberRow(gAnim, "Length (s)", ()=>clip.length, v=>{
        clip.length = Math.max(0.01, Number(v)||0.01);
        saveAnimationsLocal();
        syncPreviewSlider(clip);
      }, 0.05, 0.01, 99);

      const loopRow = document.createElement("div");
      loopRow.className = "row";
      const loopLabel = document.createElement("label");
      loopLabel.textContent = "Loop";
      const loopInput = document.createElement("input");
      loopInput.type = "checkbox";
      loopInput.checked = clip.loop !== false;
      loopInput.addEventListener("change", ()=>{
        clip.loop = !!loopInput.checked;
        saveAnimationsLocal();
      });
      loopRow.appendChild(loopLabel);
      loopRow.appendChild(loopInput);
      gAnim.appendChild(loopRow);

      const frameRow = document.createElement("div");
      frameRow.className = "row";
      const frameLabel = document.createElement("label");
      frameLabel.textContent = "Keyframe";
      const frameSelect = document.createElement("select");
      frameSelect.id = "rig-anim-frame";
      clip.frames.forEach(f=>{
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = `${f.time.toFixed(3)}s`;
        if (frame && frame.id === f.id) opt.selected = true;
        frameSelect.appendChild(opt);
      });
      frameSelect.addEventListener("change", ()=>{
        animEditorState.frameId = frameSelect.value || null;
        const fr = currentFrame();
        if (fr){
          anim.clipTime = fr.time;
          anim.playing = false;
          syncAnimPlayButton();
          setAnimMode(`clip:${clip.id}`);
          syncPreviewSlider(clip);
        }
        buildForm();
      });
      frameRow.appendChild(frameLabel);
      frameRow.appendChild(frameSelect);
      gAnim.appendChild(frameRow);
      animUIRefs.frameSelect = frameSelect;

      const frameBtnRow = document.createElement("div");
      frameBtnRow.className = "row rig-anim-frame-buttons";
      frameBtnRow.innerHTML = `
        <button type="button" id="rig-frame-add" class="secondary">Add Frame</button>
        <button type="button" id="rig-frame-dup" class="secondary">Duplicate Frame</button>
        <button type="button" id="rig-frame-del" class="secondary">Delete Frame</button>
      `;
      gAnim.appendChild(frameBtnRow);

      frameBtnRow.querySelector("#rig-frame-add").onclick = ()=>{
        const newFrame = {
          id: newId("kf"),
          time: Math.min(clip.length, Math.max(0, anim.clipTime)),
          transforms: cloneTransforms(params.transforms)
        };
        clip.frames.push(newFrame);
        sortFrames(clip);
        animEditorState.frameId = newFrame.id;
        anim.clipTime = newFrame.time;
        anim.playing = false;
        syncAnimPlayButton();
        saveAnimationsLocal();
        buildForm();
      };
      frameBtnRow.querySelector("#rig-frame-dup").onclick = ()=>{
        if (!frame) return;
        const dup = {
          id: newId("kf"),
          time: frame.time,
          transforms: cloneTransforms(frame.transforms)
        };
        clip.frames.push(dup);
        sortFrames(clip);
        animEditorState.frameId = dup.id;
        anim.clipTime = dup.time;
        anim.playing = false;
        syncAnimPlayButton();
        saveAnimationsLocal();
        buildForm();
      };
      frameBtnRow.querySelector("#rig-frame-del").onclick = ()=>{
        if (!frame) return;
        if (clip.frames.length <= 1){
          alert("A clip must have at least one keyframe.");
          return;
        }
        const idx = clip.frames.findIndex(f=>f.id===frame.id);
        if (idx >= 0) clip.frames.splice(idx,1);
        sortFrames(clip);
        animEditorState.frameId = clip.frames[0]?.id || null;
        const fr = currentFrame();
        anim.clipTime = fr ? fr.time : 0;
        anim.playing = false;
        syncAnimPlayButton();
        saveAnimationsLocal();
        buildForm();
      };

      const frameTimeRow = document.createElement("div");
      frameTimeRow.className = "row";
      const timeLabel = document.createElement("label");
      timeLabel.textContent = "Frame Time (s)";
      const timeInput = document.createElement("input");
      timeInput.type = "number";
      timeInput.step = "0.01";
      timeInput.min = "0";
      timeInput.max = String(clip.length);
      timeInput.value = frame ? frame.time.toFixed(3) : "0";
      timeInput.addEventListener("change", ()=>{
        if (!frame) return;
        const v = Number(timeInput.value);
        if (Number.isFinite(v)){
          frame.time = Math.min(clip.length, Math.max(0, v));
          sortFrames(clip);
          anim.clipTime = frame.time;
          anim.playing = false;
          syncAnimPlayButton();
          saveAnimationsLocal();
          buildForm();
        }
      });
      frameTimeRow.appendChild(timeLabel);
      frameTimeRow.appendChild(timeInput);
      gAnim.appendChild(frameTimeRow);

      const poseRow = document.createElement("div");
      poseRow.className = "row rig-anim-pose";
      const captureBtn = document.createElement("button");
      captureBtn.type = "button";
      captureBtn.className = "secondary";
      captureBtn.textContent = "Capture from Pose";
      captureBtn.onclick = ()=>{
        if (!frame) return;
        frame.transforms = cloneTransforms(params.transforms);
        saveAnimationsLocal();
      };
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "secondary";
      applyBtn.textContent = "Apply to Pose";
      applyBtn.onclick = ()=>{
        if (!frame) return;
        params.transforms = cloneTransforms(frame.transforms);
        ensureTransformMap(params);
        saveLocalSilently();
        refresh();
        buildForm();
      };
      poseRow.appendChild(captureBtn);
      poseRow.appendChild(applyBtn);
      gAnim.appendChild(poseRow);

      const previewRow = document.createElement("div");
      previewRow.className = "row";
      const previewLabel = document.createElement("label");
      previewLabel.textContent = "Preview";
      const preview = document.createElement("input");
      preview.type = "range";
      preview.min = "0";
      preview.max = "1";
      preview.step = "0.01";
      const len = Math.max(clip.length, 0.0001);
      preview.value = String(Math.min(1, Math.max(0, anim.clipTime / len)));
      preview.addEventListener("input", ()=>{
        anim.clipTime = Number(preview.value || "0") * len;
        anim.playing = false;
        syncAnimPlayButton();
        setAnimMode(`clip:${clip.id}`);
      });
      previewRow.appendChild(previewLabel);
      previewRow.appendChild(preview);
      gAnim.appendChild(previewRow);
      animUIRefs.previewSlider = preview;
    }
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

    animPlayButton = btn;
    animModeSelect = mode;

    btn.onclick = ()=>{
      anim.playing = !anim.playing;
      syncAnimPlayButton();
    };
    mode.onchange = ()=>{
      setAnimMode(mode.value);
      if (mode.value.startsWith("clip:")){
        anim.clipTime = 0;
        anim.playing = false;
        syncAnimPlayButton();
      }
    };
    spd.oninput  = ()=>{ anim.speed = Number(spd.value)||1; };

    syncAnimPlayButton();
    mode.value = anim.mode;
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
