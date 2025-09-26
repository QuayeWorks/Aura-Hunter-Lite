// rig-factory.js
(function(){
  const Species = { HUMANOID:"humanoid", QUAD:"quadruped", AVIAN:"avian", AQUATIC:"aquatic", ANTHRO:"anthro" };
  const SizeClass = { TINY:0, SMALL:1, MEDIUM:2, LARGE:3, GIANT:4 };

  // Baselines + multipliers
  const BASE = { hp:100, dmg:10, speed:5, jump:1 };
  const SIZE_HP = [0.60,0.85,1.00,1.35,1.80];
  const SIZE_DMG= [0.65,0.85,1.00,1.30,1.75];
  const SIZE_SPD= [1.10,1.05,1.00,0.95,0.85];
  const SPEC_MUL = {
    [Species.HUMANOID]: {hp:1.0,dmg:1.0, notes:["two-legged","tool-user"]},
    [Species.QUAD]:     {hp:1.15,dmg:1.35, notes:["pounce","maul"]},
    [Species.AVIAN]:    {hp:0.85,dmg:1.15, notes:["fly","dive"]},
    [Species.AQUATIC]:  {hp:1.20,dmg:1.20, notes:["swim","lunge"]},
    [Species.ANTHRO]:   {hp:1.25,dmg:1.30, notes:["tool-user","absorb"]}
  };
  const GIANT_BONUS = {
    [Species.HUMANOID]: {hp:1.00,dmg:1.00},
    [Species.QUAD]:     {hp:1.10,dmg:1.15},
    [Species.ANTHRO]:   {hp:1.18,dmg:1.22},
    [Species.AVIAN]:    {hp:1.05,dmg:1.10},
    [Species.AQUATIC]:  {hp:1.12,dmg:1.12}
  };

  function rollSize(rng, species){
    const r = rng();
    return r<0.12?SizeClass.TINY : r<0.50?SizeClass.SMALL : r<0.80?SizeClass.MEDIUM : r<0.95?SizeClass.LARGE : SizeClass.GIANT;
  }
  function buildStats(species,size, extra){
    const sp = SPEC_MUL[species]; const g=(size===SizeClass.GIANT?GIANT_BONUS[species]:{hp:1,dmg:1});
    const stats = {
      hp: Math.round(BASE.hp*SIZE_HP[size]*sp.hp*g.hp),
      dmg: BASE.dmg*SIZE_DMG[size]*sp.dmg*g.dmg,
      speed: BASE.speed*SIZE_SPD[size]*(species===Species.AVIAN?1.1:1.0),
      jump: BASE.jump*(species===Species.AVIAN?1.3:1.0),
      species, size, abilities: new Set(extra?.abilities||sp.notes||[])
    };
    if (species === Species.ANTHRO) stats.abilities.add("absorb");
    return stats;
  }

  function idleBob(node, scene){
    const a = new BABYLON.Animation("idleBob","position.y", 30,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{frame:0, value: node.position.y},{frame:30, value: node.position.y+0.04},{frame:60, value: node.position.y}]);
    node.animations = node.animations||[]; node.animations.push(a);
    scene.beginAnimation(node, 0, 60, true, 0.8);
  }

  // --- Simple placeholders for variety ---
  function createHumanoidCapsule(scene, size){
    const sY=[0.6,0.9,1.0,1.6,2.3][size];
    const root = BABYLON.MeshBuilder.CreateCapsule("humanoid",{height:1.4*sY, radius:0.28*sY*0.6},scene);
    return root;
  }
  function createQuad(scene, size){
    const s=[0.7,0.9,1.0,1.5,2.2][size];
    const body = BABYLON.MeshBuilder.CreateBox("quadBody",{width:0.7*s, height:0.5*s, depth:1.2*s},scene);
    const head = BABYLON.MeshBuilder.CreateSphere("quadHead",{diameter:0.35*s},scene); head.parent=body; head.position.z=0.7*s;
    return body;
  }
  function createAvian(scene, size){
    const s=[0.5,0.8,1.0,1.4,2.0][size];
    const body = BABYLON.MeshBuilder.CreateSphere("birdBody",{diameter:0.6*s},scene);
    const wingL = BABYLON.MeshBuilder.CreatePlane("wingL",{width:0.8*s,height:0.25*s},scene); wingL.parent=body; wingL.position.x=-0.5*s;
    const wingR = BABYLON.MeshBuilder.CreatePlane("wingR",{width:0.8*s,height:0.25*s},scene); wingR.parent=body; wingR.position.x= 0.5*s;
    body.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_Y;
    return body;
  }
  function createAquatic(scene, size){
    const s=[0.6,0.9,1.0,1.6,2.4][size];
    const body = BABYLON.MeshBuilder.CreateSphere("fishBody",{diameterX:1.2*s, diameterY:0.6*s, diameterZ:0.6*s, segments:2},scene);
    const tail = BABYLON.MeshBuilder.CreatePlane("tail",{width:0.5*s,height:0.6*s},scene); tail.parent=body; tail.position.x=-0.8*s;
    return body;
  }
  function createAnthro(scene, size){
    return createHumanoidCapsule(scene, size);
  }

  // Optional: a segmented humanoid rig stub you can wire later (kept separate)
  function createHumanoidRig(scene, colorHex="#88ccff", rigData /*unused placeholder*/){
    const color = BABYLON.Color3.FromHexString(colorHex);
    const mat = new BABYLON.StandardMaterial("humRigMat", scene);
    mat.diffuseColor = color.scale(0.4);
    mat.emissiveColor = color.scale(0.15);
    const root = BABYLON.MeshBuilder.CreateBox("humRigRoot",{width:0.6, height:1.8, depth:0.4},scene);
    root.material = mat;
    return root;
  }

  const RigFactory = {
    create(scene, species, size){
      let root;
      if (species===Species.HUMANOID) root=createHumanoidCapsule(scene,size);
      else if (species===Species.QUAD) root=createQuad(scene,size);
      else if (species===Species.AVIAN) root=createAvian(scene,size);
      else if (species===Species.AQUATIC) root=createAquatic(scene,size);
      else root=createAnthro(scene,size);

      const stats = buildStats(species,size);
      root.checkCollisions=true; root.isPickable=true;
      root.metadata = { mob:true, species, size, stats, hp:stats.hp };
      idleBob(root, scene);
      return root;
    },
    Species, SizeClass, rollSize, buildStats,
    createHumanoidRig, createHumanoidCapsule
  };

  window.Rigs = { RigFactory, Species, SizeClass, rollSize, buildStats };
})();
