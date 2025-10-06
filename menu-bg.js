// menu-bg.js — God Throne BG (hardcoded poses, no XML), throne x3, crisp, camera pan
(function(){
  let engine, scene, camera, glow, canvas;
  let orbs = [];
  let t = 0;
  let camTarget;
  let manualCam = false; // toggled with 'P'
  let resizeHandler = null;
  let keyHandler = null;
  let renderObserver = null;

  // --- Hardcoded poses generated from your uploaded XMLs ---
// === Hardcoded poses (degrees) ===
// === Hardcoded poses (degrees) ===
const POSE_SITTING = {
  pelvis:      { pos:{x:0.000, y:1.190, z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  torsoLower:  { pos:{x:0.000, y:0.450, z:0.000}, rot:{x:6.276,   y:0.000,   z:0.000} },
  torsoUpper:  { pos:{x:0.000, y:0.710, z:0.000}, rot:{x:3.627,   y:0.000,   z:0.000} },
  neck:        { pos:{x:0.000, y:0.250, z:-0.000},rot:{x:350.746, y:0.000,   z:0.000} },
  head:        { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:347.458, y:0.000,   z:0.000} },
  shoulderL:   { pos:{x:-0.650,y:0.000, z:0.000}, rot:{x:0.000,   y:180.000, z:0.000} },
  armL_upper:  { pos:{x:0.000, y:-0.450, z:0.000}, rot:{x:30.295,  y:187.416,   z:0.396} },
  armL_fore:   { pos:{x:0.000, y:-0.750,z:0.000}, rot:{x:41.116,  y:360.000, z:360.000} },
  armL_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  shoulderR:   { pos:{x:0.650, y:0.000, z:0.000}, rot:{x:0.000,   y:180.000, z:0.000} },
  armR_upper:  { pos:{x:0.000, y:-0.350, z:0.000}, rot:{x:30.892,  y:180.000,   z:3.297} },
  armR_fore:   { pos:{x:0.000, y:-0.750,z:0.000}, rot:{x:30.963,  y:360.000, z:360.000} },
  armR_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  hipL:        { pos:{x:-0.250,y:-0.450,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  legL_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:255.392, y:0.000,   z:0.000} },
  legL_shin:   { pos:{x:0.000, y:-1.050,z:0.000}, rot:{x:80.031,  y:0.000,   z:0.000} },
  legL_foot:   { pos:{x:0.000, y:-0.880,z:0.210},rot:{x:-20.000,   y:180.000,   z:0.000} },
  hipR:        { pos:{x:0.250, y:-0.350,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  legR_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:285.257, y:180.000, z:180.000} },
  legR_shin:   { pos:{x:0.000, y:-1.050,z:-0.000},rot:{x:80.248,  y:360.000, z:360.000} },
  legR_foot:   { pos:{x:0.000, y:-0.880,z:0.210},rot:{x:-20.000,   y:180.000,   z:0.000} },
};

const POSE_KNEELING = {
  pelvis:      { pos:{x:0.000, y:1.190, z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  torsoLower:  { pos:{x:0.000, y:0.450, z:0.000}, rot:{x:6.415,   y:0.000,   z:0.000} },
  torsoUpper:  { pos:{x:0.000, y:0.710, z:0.000}, rot:{x:4.947,   y:0.000,   z:0.000} },
  neck:        { pos:{x:0.000, y:0.250, z:-0.000},rot:{x:8.795,   y:0.000,   z:0.000} },
  head:        { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:11.552,  y:0.000,   z:0.000} },
  shoulderL:   { pos:{x:-0.650,y:0.000, z:0.000}, rot:{x:0.000,   y:180.000, z:0.000} },
  armL_upper:  { pos:{x:0.000, y:-0.450, z:0.000}, rot:{x:18.888,  y:225.723,  z:18.365} },
  armL_fore:   { pos:{x:0.000, y:-0.750,z:-0.000},rot:{x:57.918,  y:0.000,   z:0.000} },
  armL_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  shoulderR:   { pos:{x:0.650, y:0.000, z:0.000}, rot:{x:0.000,   y:180.000, z:0.000} },
  armR_upper:  { pos:{x:0.000, y:-0.450, z:-0.000},rot:{x:40.926,  y:174.287, z:9.413} },
  armR_fore:   { pos:{x:0.000, y:-0.750,z:0.000}, rot:{x:360.000, y:0.000,   z:30.251} },
  armR_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  hipL:        { pos:{x:-0.250,y:-0.350,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  legL_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:272.397, y:360.000, z:0.000} },
  legL_shin:   { pos:{x:0.000, y:-1.050,z:-0.000},rot:{x:87.414,  y:0.000,   z:0.000} },
  legL_foot:   { pos:{x:0.000, y:-0.880,z:0.210},rot:{x:0.000,   y:0.000,   z:0.000} },
  hipR:        { pos:{x:0.250, y:-0.350,z:0.000}, rot:{x:0.000,   y:0.000,   z:0.000} },
  legR_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:19.925,  y:359.247, z:359.930} },
  legR_shin:   { pos:{x:0.000, y:-1.050,z:0.000}, rot:{x:87.258,  y:180.000, z:180.000} },
  legR_foot:   { pos:{x:0.000, y:-0.880,z:0.210},rot:{x:0.000,   y:0.000,   z:0.000} },
};

  // --- Rig defaults (same as your XML sizes) ---
  const RIG_KEY = "hxh.rig.params";
  function currentRig(){
    try{ if (window.HXH && typeof window.HXH.getRig === "function") return window.HXH.getRig(); }catch{}
    try{ const j = localStorage.getItem(RIG_KEY); if (j) return JSON.parse(j); }catch{}
    return {
      color: "#804a00",
      pelvis: { w: 0.850, h: 0.350, d: 0.520 },
      torsoLower: { w: 0.900, h: 0.450, d: 0.550 },
      torsoUpper: { w: 0.950, h: 0.710, d: 0.550 },
      neck: { w: 0.250, h: 0.250, d: 0.250 },
      head: { w: 0.520, h: 0.520, d: 0.520 },
      arm: { upperW: 0.340, upperD: 0.340, upperLen: 0.750, foreW: 0.300, foreD: 0.270, foreLen: 0.700, handLen: 0.250 },
      leg: { thighW: 0.450, thighD: 0.500, thighLen: 1.050, shinW: 0.330, shinD: 0.430, shinLen: 0.880, footW: 0.320, footH: 0.210, footLen: 0.750 },
      transforms: {
        pelvis:      { pos:{x:0.000, y:1.190, z:0.000}, rot:{x:0, y:0, z:0} },
        torsoLower:  { pos:{x:0.000, y:0.450, z:0.000}, rot:{x:0, y:0, z:0} },
        torsoUpper:  { pos:{x:0.000, y:0.710, z:0.000}, rot:{x:0, y:0, z:0} },
        neck:        { pos:{x:0.000, y:0.250, z:0.000}, rot:{x:0, y:0, z:0} },
        head:        { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
        shoulderL:   { pos:{x:-0.650,y:0.000, z:0.000}, rot:{x:0, y:180, z:0} },
        armL_upper:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
        armL_fore:   { pos:{x:0.000, y:-0.750,z:0.000}, rot:{x:0, y:0, z:0} },
        armL_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0, y:0, z:0} },
        shoulderR:   { pos:{x:0.650, y:0.000, z:0.000}, rot:{x:0, y:180, z:0} },
        armR_upper:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
        armR_fore:   { pos:{x:0.000, y:-0.750,z:0.000}, rot:{x:0, y:0, z:0} },
        armR_hand:   { pos:{x:0.000, y:-0.710,z:0.000}, rot:{x:0, y:0, z:0} },
        hipL:        { pos:{x:-0.250,y:-0.350,z:0.000}, rot:{x:0, y:0, z:0} },
        legL_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
        legL_shin:   { pos:{x:0.000, y:-1.050,z:0.000}, rot:{x:0, y:0, z:0} },
        legL_foot:   { pos:{x:0.000, y:-0.880,z:-0.210}, rot:{x:0, y:0, z:0} },
        hipR:        { pos:{x:0.250, y:-0.350,z:0.000}, rot:{x:0, y:0, z:0} },
        legR_thigh:  { pos:{x:0.000, y:0.000, z:0.000}, rot:{x:0, y:0, z:0} },
        legR_shin:   { pos:{x:0.000, y:-1.050,z:0.000}, rot:{x:0, y:0, z:0} },
        legR_foot:   { pos:{x:0.000, y:-0.880,z:-0.210}, rot:{x:0, y:0, z:0} },
      }
    };
  }

  // --- Materials ---
  function goldMaterial(name, scene, emissiveScale=1.0){
    const m = new BABYLON.PBRMaterial(name, scene);
    m.albedoColor = new BABYLON.Color3(1.0, 0.85, 0.35);
    m.metallic = 1.0; m.roughness = 0.25;
    m.emissiveColor = new BABYLON.Color3(0.8, 0.45, 0.15).scale(emissiveScale);
    return m;
  }
  function lightMat(name, scene, intensity=1.0){
    const m = new BABYLON.StandardMaterial(name, scene);
    m.emissiveColor = new BABYLON.Color3(1,1,1).scale(intensity);
    m.diffuseColor = BABYLON.Color3.Black();
    m.specularColor = BABYLON.Color3.Black();
    return m;
  }

  // --- Humanoid constructor with namePrefix (for unique nodes) ---
  function buildHumanoid(rig, scene, colorHex="#ffffff", emissive=1.9, namePrefix=""){
    const root = new BABYLON.TransformNode(namePrefix+"rigRoot", scene);
    const N=(n)=> namePrefix+n;
    const c = BABYLON.Color3.FromHexString(colorHex);
    const mat = new BABYLON.StandardMaterial("rigMat", scene);
    mat.emissiveColor = c.scale(emissive); mat.diffuseColor = c.scale(0.05); mat.specularColor = BABYLON.Color3.Black();

    function block(name, w,h,d){
      const n = new BABYLON.TransformNode(N(name)+"_pivot", scene);
      const m = BABYLON.MeshBuilder.CreateBox(N(name), {width:w, height:h, depth:d}, scene);
      m.parent = n; m.material = mat; m.position.y = -h*0.5;
      return n;
    }

    const pelvis = block("pelvis", rig.pelvis.w, rig.pelvis.h, rig.pelvis.d); pelvis.parent=root; pelvis.position.y=(rig.transforms?.pelvis?.pos?.y ?? 1.19);
    const tl = block("torsoLower", rig.torsoLower.w, rig.torsoLower.h, rig.torsoLower.d); tl.parent=pelvis; tl.position.y = rig.torsoLower.h*0.5+0.30;
    const tu = block("torsoUpper", rig.torsoUpper.w, rig.torsoUpper.h, rig.torsoUpper.d); tu.parent=tl; tu.position.y = rig.torsoUpper.h*0.5+0.55;
    const neck = block("neck", rig.neck.w, rig.neck.h, rig.neck.d); neck.parent=tu; neck.position.y = rig.neck.h*0.5+0.55;
    const head = BABYLON.MeshBuilder.CreateBox(N("head"),{width:rig.head.w,height:rig.head.h,depth:rig.head.d},scene);
    head.material = mat; head.parent = neck; head.position.y = rig.head.h*0.5;

    function arm(side, sign){
      const shoulder = new BABYLON.TransformNode(N("shoulder"+side), scene);
      shoulder.parent = tu; shoulder.position.set(sign * 0.62, 0.5, 0);
      const upper = block("arm"+side+"_upper", rig.arm.upperW, rig.arm.upperLen, rig.arm.upperD); upper.parent=shoulder;
      const fore  = block("arm"+side+"_fore",  rig.arm.foreW,  rig.arm.foreLen,  rig.arm.foreD); fore.parent=upper; fore.position.y = -rig.arm.upperLen;
      const hand  = block("arm"+side+"_hand",  rig.arm.foreW*0.8, rig.arm.handLen, rig.arm.foreD*0.8); hand.parent=fore; hand.position.y = -rig.arm.foreLen;
      return {shoulder, upper, fore, hand};
    }
    arm("L", -1); arm("R", +1);

    function leg(side, sign){
      const hip = new BABYLON.TransformNode(N("hip"+side), scene); hip.parent=pelvis; hip.position.set(sign*0.33, -0.12, 0);
      const thigh = block("leg"+side+"_thigh", rig.leg.thighW, rig.leg.thighLen, rig.leg.thighD); thigh.parent=hip;
      const shin  = block("leg"+side+"_shin",  rig.leg.shinW,  rig.leg.shinLen,  rig.leg.shinD ); shin.parent=thigh; shin.position.y = -rig.leg.thighLen;
      const foot  = block("leg"+side+"_foot",  rig.leg.footW,  rig.leg.footH,   rig.leg.footLen); foot.parent=shin; foot.position.set(0, -rig.leg.shinLen, -rig.leg.footH);
      return {hip, thigh, shin, foot};
    }
    leg("L", -1); leg("R", +1);

    return root;
  }

  // --- Apply a hardcoded pose object to nodes with a prefix ---
  function applyPose(pose, scene, namePrefix=""){
    const deg = v => (Number(v)||0) * Math.PI / 180;
    for (const part in pose){
      const tr = pose[part];
      const pivotName = part === "head" ? namePrefix+"head" : namePrefix+part + "_pivot";
      const n = scene.getTransformNodeByName(pivotName) || scene.getMeshByName(pivotName);
      if (!n) continue;
      if (tr.pos){ n.position.x = tr.pos.x||0; n.position.y = tr.pos.y||0; n.position.z = tr.pos.z||0; }
      if (tr.rot){ n.rotation.x = deg(tr.rot.x); n.rotation.y = deg(tr.rot.y); n.rotation.z = deg(tr.rot.z); }
    }
  }

	function buildThrone(scene, gold){
	  const group = new BABYLON.TransformNode("throne", scene);
	  const base  = BABYLON.MeshBuilder.CreateBox("th_base", {width:3.375,  height:0.3375, depth:3.375},  scene); base.material=gold; base.parent=group; base.position.y = 0.16875;
	  const step  = BABYLON.MeshBuilder.CreateBox("th_step", {width:2.7,    height:0.225,  depth:2.7},    scene); step.material=gold; step.parent=group; step.position.y = 0.39375;
	  const seat  = BABYLON.MeshBuilder.CreateBox("th_seat", {width:1.6875, height:0.3375, depth:1.6875}, scene); seat.material=gold; seat.parent=group; seat.position.y = 0.73125;
	  const back  = BABYLON.MeshBuilder.CreateBox("th_back", {width:1.6875, height:2.25,   depth:0.28125},scene); back.material=gold; back.parent=group; back.position.set(0, 1.74375, -0.703125);
	  const armL  = BABYLON.MeshBuilder.CreateBox("th_armL", {width:0.28125,height:0.5625, depth:1.4625}, scene); armL.material=gold; armL.parent=group; armL.position.set(-0.84375, 0.9, 0.05625);
	  const armR  = BABYLON.MeshBuilder.CreateBox("th_armR", {width:0.28125,height:0.5625, depth:1.4625}, scene); armR.material=gold; armR.parent=group; armR.position.set( 0.84375, 0.9, 0.05625);
	  return group;
	}


  function ensureCanvas(){
    const host = document.querySelector('#screen--menu .menu-bg');
    if (!host) return null;
    if (canvas && canvas.isConnected) return canvas;
    let existing = host.querySelector('#menu-canvas');
    if (!existing) {
      existing = document.createElement('canvas');
      existing.id = 'menu-canvas';
      host.appendChild(existing);
    }
    canvas = existing;
    return canvas;
  }

  function build(){
    canvas = ensureCanvas();
    if(!canvas) return;
    manualCam = false;
    canvas.style.pointerEvents = '';
    canvas.style.zIndex = '';
    engine = new BABYLON.Engine(canvas, true, { stencil:true });
    try { engine.setHardwareScalingLevel(1 / (window.devicePixelRatio || 1)); } catch {}
    scene  = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(1,1,1,1);

    // Camera
    camera = new BABYLON.ArcRotateCamera("cam", Math.PI*1.2, 1.05, 28, new BABYLON.Vector3(0,2.6,0), scene);
    camera.lowerRadiusLimit = 14; camera.upperRadiusLimit = 60;
    camera.wheelDeltaPercentage = 0.006; camera.pinchDeltaPercentage = 0.006;
    camera.inertia = 0.92; 
    // Input ergonomics
    camera.useCtrlForPanning = true;          // Ctrl+LeftDrag pans (RightDrag also pans)
    camera.panningSensibility = 800;
    if (camera.inputs?.attached?.pointers) {
      camera.inputs.attached.pointers.buttons = [0,1,2]; // Left rotate, Middle/Right pan
    }
    // Start in auto mode; press 'P' for manual control
    camera.detachControl();
    const toggleCam = (on) => {
      manualCam = on != null ? on : !manualCam;
      if (manualCam) {
        canvas.style.pointerEvents = 'auto';
        canvas.style.zIndex = '1000';      // bring canvas above menu UI
        camera.attachControl(canvas, false /* preventDefault so we own the mouse */);
        try { canvas.focus(); } catch {}
      } else {
        camera.detachControl();
        canvas.style.pointerEvents = '';
        canvas.style.zIndex = '';
      }
    };
    keyHandler = (e)=>{ if ((e.key||'').toLowerCase()==='p') toggleCam(); };
    window.addEventListener('keydown', keyHandler);
	
    camTarget = new BABYLON.TransformNode("camTarget", scene);
    camTarget.position = new BABYLON.Vector3(0, 2.6, 0);
    camera.lockedTarget = camTarget;

    // Lights + glow
    const hemi = new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0,1,0), scene); hemi.intensity = 1.0;
    const dir  = new BABYLON.DirectionalLight("s", new BABYLON.Vector3(-0.3,-1,-0.2), scene);
    dir.position = new BABYLON.Vector3(30,50,30); dir.intensity = 0.9;
    glow = new BABYLON.GlowLayer("glow", scene, { blurKernelSize: 36, intensity: 0.55 });

    // Gold floor
    const floor = BABYLON.MeshBuilder.CreateGround("floor",{width:240,height:240},scene);
    floor.material = goldMaterial("goldFloor", scene, 0.55);

    // Orbs
    const orbm = lightMat("orbM", scene, 1.2);
    for(let i=0;i<36;i++){
      const d = 18 + Math.random()*36;
      const a = Math.random()*Math.PI*2;
      const y = 2.0 + Math.random()*10;
      const sphere = BABYLON.MeshBuilder.CreateSphere("orb"+i,{diameter: 0.5 + Math.random()*1.6, segments: 22}, scene);
      sphere.material = orbm;
      sphere.position.set(Math.cos(a)*d, y, Math.sin(a)*d);
      orbs.push({mesh:sphere, r:a, d, y, s: 0.3 + Math.random()*0.9});
    }

    // Throne + giant (apply hardcoded SITTING pose)
    const gold = goldMaterial("gold", scene, 1.0);
    const throne = buildThrone(scene, gold);
    throne.scaling.setAll(3.00);
    const rig = currentRig();
    const giant = buildHumanoid(rig, scene, "#ffffff", 1.8, "giant_");
    giant.parent = throne;
    giant.position.set(0, 0.06, 0.1)
    applyPose(POSE_SITTING, scene, "giant_");

    // Followers — three kneeling rings: 6, 12, 24
    const rings = [
      { count: 7,  radius: 14 },
      { count: 14, radius: 26 },
      { count: 21, radius: 38 },
	  { count: 28, radius: 50 },
	  { count: 35, radius: 62 },
	  { count: 42, radius: 74 },
	  { count: 49, radius: 86 },
    ];
    rings.forEach((ring, rIdx) => {
      for (let i = 0; i < ring.count; i++) {
        const ang = (i / ring.count) * Math.PI * 2;
        const fx = Math.cos(ang) * ring.radius;
        const fz = Math.sin(ang) * ring.radius;
        const prefix = `f${rIdx}_${i}_`;
        const h = buildHumanoid(rig, scene, "#ffffff", 1.0, prefix);
        h.position.set(fx, 0, fz);
        h.lookAt(new BABYLON.Vector3(0, 1.6, 0));
        applyPose(POSE_KNEELING, scene, prefix);
      }
    });

    // Halo
    const halo = BABYLON.MeshBuilder.CreateSphere("halo",{diameter: 8, segments: 24}, scene);
    halo.material = lightMat("haloM", scene, 0.35); halo.material.alpha = 0.08;
    halo.position = new BABYLON.Vector3(0, 3.0, 0);

    // Keep throne/rig hard edges off glow
    scene.meshes.forEach(m => {
      if (m.name.startsWith("th_")) {
        glow.addExcludedMesh(m);
      }
    });

    // Animate
    renderObserver = scene.onBeforeRenderObservable.add(()=>{
      const dt = engine.getDeltaTime()/1000; t += dt;
      if (!manualCam) {
        camera.alpha += dt*0.08;
        camera.radius = 26 + Math.sin(t*0.35)*2.0;
      }

      if (!manualCam) {
        const panR = 1.4;
        camTarget.position.x = Math.cos(t * 0.20) * panR;
        camTarget.position.z = Math.sin(t * 0.20) * panR;
        camTarget.position.y = 2.6 + Math.sin(t * 0.12) * 0.20;
      }
      orbs.forEach((c,i)=>{
        c.r += dt*(0.08 + c.s*0.08);
        const y = c.y + Math.sin(t*1.6 + i)*0.6;
        c.mesh.position.set(Math.cos(c.r)*c.d, y, Math.sin(c.r)*c.d);
      });
    });

    engine.runRenderLoop(()=> scene.render());
    if (!resizeHandler) {
      resizeHandler = () => { try { engine && engine.resize(); } catch {} };
      window.addEventListener("resize", resizeHandler);
    }
  }

  window.MenuBG = {
    start(){ if(!engine) build(); },
    stop(){
      const auditKey = 'menu-background';
      const audit = window.SceneAudit;
      if (audit && scene) {
        try {
          audit.beginTransition(auditKey, {
            fromLabel: 'Menu Background',
            toLabel: 'Disposed',
            scene,
            engine
          });
        } catch {}
      }

      if (renderObserver && scene) {
        try { scene.onBeforeRenderObservable.remove(renderObserver); } catch {}
      }
      renderObserver = null;

      if (scene) {
        try { scene.dispose(); } catch {}
      }
      scene = null;
      glow = null;
      camTarget = null;

      if (camera) {
        try { camera.detachControl(); } catch {}
      }
      camera = null;

      if (engine) {
        try { engine.stopRenderLoop(); } catch {}
        try { engine.dispose(); } catch {}
      }
      engine = null;

      if (keyHandler) {
        window.removeEventListener('keydown', keyHandler);
        keyHandler = null;
      }
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }

      if (canvas) {
        try { canvas.remove(); } catch {}
      }
      canvas = null;
      manualCam = false;
      orbs = [];
      t = 0;

      if (audit) {
        try {
          const menuState = window.MenuBG?.getState?.();
          audit.completeTransition(auditKey, {
            fromLabel: 'Menu Background',
            toLabel: 'Disposed',
            scene: menuState.scene,
            engine: menuState.engine
          });
        } catch {}
      }
    },
    getState(){
      return {
        engine,
        scene,
        canvas,
        active: !!engine
      };
    }
  };
})();
