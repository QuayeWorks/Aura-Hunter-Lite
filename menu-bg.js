// menu-bg.js — neon grid + floating cubes + idle humanoid silhouette
(function(){
  let engine, scene, camera, glow, loop, canvas;
  let t = 0;

  function createHumanoidSilhouette(colorHex="#0ef"){
    const scene = camera.getScene();
    const c = BABYLON.Color3.FromHexString(colorHex);
    const mat = new BABYLON.StandardMaterial("menuSil", scene);
    mat.emissiveColor = c.scale(0.7);
    mat.diffuseColor  = c.scale(0.08);
    mat.specularColor = BABYLON.Color3.Black();

    const root = new BABYLON.TransformNode("menuRig", scene);

    function seg(parent, w,h,d, yOff=0){
      const t = new BABYLON.TransformNode("p", scene);
      t.parent = parent; t.position.y = yOff;
      const m = BABYLON.MeshBuilder.CreateBox("b",{width:w,height:h,depth:d}, scene);
      m.parent = t; m.material = mat; m.position.y = -h*0.5;
      return t;
    }
    const pelvis = seg(root,.9,.28,.6,1.6);
    const tl = seg(pelvis,.9,.45,.55,.30);
    const tu = seg(tl,.95,.45,.55,.55);
    const neck = seg(tu,.25,.22,.25,.55);
    const head = BABYLON.MeshBuilder.CreateBox("head",{width:.45,height:.6,depth:.45},scene);
    head.material = mat; head.parent = neck; head.position.y = .3;

    const shL = new BABYLON.TransformNode("shL",scene); shL.parent = tu; shL.position.set(-.62,.5,0);
    const shR = new BABYLON.TransformNode("shR",scene); shR.parent = tu; shR.position.set(.62,.5,0);
    seg(shL,.25,.55,.25,0); seg(shL,.22,.55,.22,0); seg(shL,.22,.22,.22,0);
    seg(shR,.25,.55,.25,0); seg(shR,.22,.55,.22,0); seg(shR,.22,.22,.22,0);

    const hipL = new BABYLON.TransformNode("hipL",scene); hipL.parent = pelvis; hipL.position.set(-.33,-.12,0);
    const hipR = new BABYLON.TransformNode("hipR",scene); hipR.parent = pelvis; hipR.position.set(.33,-.12,0);
    seg(hipL,.30,.65,.30,0); seg(hipL,.27,.65,.27,0); seg(hipL,.32,.18,.38,0);
    seg(hipR,.30,.65,.30,0); seg(hipR,.27,.65,.27,0); seg(hipR,.32,.18,.38,0);

    root.position.set(0,0,0);
    return root;
  }

  function build(){
    canvas = document.getElementById("menu-canvas");
    if(!canvas) return;
    engine = new BABYLON.Engine(canvas, true, { stencil:true });
    scene  = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.02,0.03,0.06,1);

    camera = new BABYLON.ArcRotateCamera("cam", Math.PI*1.15, 1.15, 20, new BABYLON.Vector3(0,1.1,0), scene);
    camera.lowerRadiusLimit = 12; camera.upperRadiusLimit = 28;
    camera.wheelDeltaPercentage = 0.008; camera.pinchDeltaPercentage = 0.008;
    camera.inertia = 0.95; camera.attachControl(canvas, false);

    new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0,1,0), scene).intensity = .7;
    const sun = new BABYLON.DirectionalLight("s", new BABYLON.Vector3(-.5,-1,-.35), scene);
    sun.position = new BABYLON.Vector3(20,30,20); sun.intensity = .7;

    glow = new BABYLON.GlowLayer("glow", scene, { blurKernelSize: 32, intensity: 0.6 });

    // neon grid
    const ground = BABYLON.MeshBuilder.CreateGround("g",{width:200,height:200},scene);
    try{
      const Grid = new BABYLON.GridMaterial("gm", scene);
      Grid.gridRatio = 2.5; Grid.majorUnitFrequency = 5; Grid.minorUnitVisibility = 0.65;
      Grid.color1 = new BABYLON.Color3(.05,.9,1.0);
      Grid.color2 = new BABYLON.Color3(0.02,0.03,0.06);
      ground.material = Grid;
    }catch{
      const m = new BABYLON.StandardMaterial("gm", scene);
      m.emissiveColor = new BABYLON.Color3(.05,.9,1.0).scale(0.25); m.diffuseColor = new BABYLON.Color3(0.02,0.03,0.06);
      ground.material = m;
    }

    // floating cubes
    const cubes = [];
    for(let i=0;i<28;i++){
      const d = 12 + Math.random()*26;
      const a = Math.random()*Math.PI*2;
      const y = 0.8 + Math.random()*5;
      const box = BABYLON.MeshBuilder.CreateBox("c"+i,{size: 0.6 + Math.random()*0.8}, scene);
      box.position.set(Math.cos(a)*d, y, Math.sin(a)*d);
      const m = new BABYLON.StandardMaterial("cm"+i, scene);
      m.emissiveColor = BABYLON.Color3.FromHexString("#0ff").scale(0.8);
      m.diffuseColor = m.emissiveColor.scale(0.1);
      box.material = m;
      cubes.push({mesh:box, r:a, d, y, s: 0.3 + Math.random()*0.8});
    }

    // idle humanoid + aura
    const rig = createHumanoidSilhouette("#0ef");
    rig.position.y = .2;
    const aura = BABYLON.MeshBuilder.CreateSphere("aura",{diameter: 3.2, segments: 12}, scene);
    const am = new BABYLON.StandardMaterial("am", scene);
    am.emissiveColor = BABYLON.Color3.FromHexString("#0ef").scale(0.35);
    am.alpha = 0.12; aura.material = am; aura.position.y = 1.2;

    loop = scene.onBeforeRenderObservable.add(()=>{
      const dt = engine.getDeltaTime()/1000; t += dt;
      camera.alpha += dt*0.12;
      camera.radius = 18 + Math.sin(t*0.5)*1.4;

      cubes.forEach((c,i)=>{
        c.r += dt*(0.05 + c.s*0.06);
        const y = c.y + Math.sin(t*1.8 + i)*0.35;
        c.mesh.position.set(Math.cos(c.r)*c.d, y, Math.sin(c.r)*c.d);
        c.mesh.rotation.y += dt*(0.3 + c.s*0.5);
      });

      aura.scaling.setAll(1 + Math.sin(t*1.7)*0.035 + 0.04);
      aura.material.alpha = 0.10 + (Math.sin(t*2.2)*0.03 + 0.05);
    });

    engine.runRenderLoop(()=> scene.render());
    window.addEventListener("resize", ()=> engine.resize());
  }

  function stop(){ if (!scene) return; try{ engine.stopRenderLoop(); }catch{} }
  function start(){ if (!scene) build(); else engine.runRenderLoop(()=> scene.render()); }

  document.addEventListener("DOMContentLoaded", build);
  window.MenuBG = { start, stop };
})();
