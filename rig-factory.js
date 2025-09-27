// rig-factory.js
// Builds enemy/NPC rigs by species & size. Humanoids now use the same segmented rig
// you use for the player (if available), falling back to the capsule only if needed.

(function(){
  const Species = {
    HUMANOID: "humanoid",
    QUAD: "quad",
    AVIAN: "avian",
    AQUATIC: "aquatic",
    ANTHRO: "anthro",
  };

  const SizeClass = {
    TINY: "tiny", SMALL: "small", MEDIUM: "medium", LARGE: "large", GIANT: "giant",
  };

  function rollSize(rng){
    const r = rng();
    if (r < 0.10) return SizeClass.TINY;
    if (r < 0.35) return SizeClass.SMALL;
    if (r < 0.75) return SizeClass.MEDIUM;
    if (r < 0.93) return SizeClass.LARGE;
    return SizeClass.GIANT;
  }

  // Baseline stats for a baseline humanoid
  const BASE = { hp: 80, dmg: 8, speed: 3.6 };

  function mulStats(s, m){ return { hp: Math.round(s.hp*m), dmg: s.dmg*m, speed: s.speed }; }

  function sizeMul(size){
    switch(size){
      case SizeClass.TINY:   return 0.55;
      case SizeClass.SMALL:  return 0.8;
      case SizeClass.MEDIUM: return 1.0;
      case SizeClass.LARGE:  return 1.5;
      case SizeClass.GIANT:  return 2.2;
      default: return 1.0;
    }
  }

  function speciesMul(species, size){
    // your rule: quads > baseline humanoid; giant quads/anthros > giant humanoids
    if (species === Species.QUAD)     return size === SizeClass.GIANT ? 2.6 : 1.35;
    if (species === Species.ANTHRO)   return size === SizeClass.GIANT ? 2.8 : 1.25;
    if (species === Species.AVIAN)    return 1.10;
    if (species === Species.AQUATIC)  return 1.15;
    return 1.0;
  }

  function buildStats(species, size){
    // shorter humanoid weaker; taller stronger/enduring (handled by sizeMul)
    const m = sizeMul(size) * speciesMul(species, size);
    const s = mulStats(BASE, m);
    // slight tweaks per species
    if (species === Species.AVIAN)    s.speed *= 1.15;
    if (species === Species.AQUATIC)  s.speed *= 1.10;
    if (species === Species.QUAD)     s.speed *= 1.20;
    return s;
  }

  // ----- helpers: simple proxies for non-humanoids -----
  function mat(scene, hex="#88ccff"){
    const m = new BABYLON.StandardMaterial("m", scene);
    const c = BABYLON.Color3.FromHexString(hex);
    m.diffuseColor=c; m.emissiveColor=c.scale(0.1);
    return m;
  }

  function proxyCapsule(scene, h=2.0, r=0.35, hex="#88ccff"){
    const root = new BABYLON.TransformNode("mob_root", scene);
    const body = BABYLON.MeshBuilder.CreateCapsule("mob_capsule",
      { height:h, radius:r, tessellation:12, subdivisions:2 }, scene);
    body.material = mat(scene, hex);
    body.parent = root;
    body.position.y = h*0.5;
    return root;
  }

  function createQuad(scene, size){
    const scale = sizeMul(size);
    const root = new BABYLON.TransformNode("quad_root", scene);
    const body = BABYLON.MeshBuilder.CreateBox("quad_body",{width:1.0*scale, height:0.6*scale, depth:1.8*scale},scene);
    body.material = mat(scene, "#b6ff00");
    body.parent = root; body.position.y = 0.4*scale;
    // four legs (simple boxes)
    const leg = ()=>BABYLON.MeshBuilder.CreateBox("leg",{width:0.18*scale,height:0.6*scale,depth:0.18*scale},scene);
    const l1=leg(),l2=leg(),l3=leg(),l4=leg();
    [l1,l2,l3,l4].forEach(L=>{ L.parent=root; L.material = body.material; });
    l1.position.set( 0.34*scale,0.3*scale, 0.65*scale);
    l2.position.set(-0.34*scale,0.3*scale, 0.65*scale);
    l3.position.set( 0.34*scale,0.3*scale,-0.65*scale);
    l4.position.set(-0.34*scale,0.3*scale,-0.65*scale);
    return root;
  }

  function createAvian(scene, size){
    const scale = sizeMul(size);
    const root = new BABYLON.TransformNode("avian_root", scene);
    const body = BABYLON.MeshBuilder.CreateSphere("avian_body",{diameter:0.9*scale},scene);
    body.material = mat(scene, "#00ffee");
    body.parent = root; body.position.y = 1.0*scale;
    const wing = ()=>BABYLON.MeshBuilder.CreateBox("wing",{width:0.9*scale,height:0.1*scale,depth:0.35*scale},scene);
    const w1=wing(), w2=wing(); w1.parent=root; w2.parent=root;
    w1.position.set( 0.6*scale,1.0*scale,0); w2.position.set(-0.6*scale,1.0*scale,0);
    return root;
  }

  function createAquatic(scene, size){
    const scale = sizeMul(size);
    const root = new BABYLON.TransformNode("fish_root", scene);
    const body = BABYLON.MeshBuilder.CreateSphere("fish_body",{diameter:1.1*scale, segments:8},scene);
    body.scaling.set(1.9*scale,1.0*scale,0.9*scale);
    body.material = mat(scene, "#3399ff");
    body.parent = root; body.position.y = 0.5*scale;
    return root;
  }

  function createAnthro(scene, size){
    // use humanoid rig if available; otherwise a tinted capsule
    if (typeof window.createHumanoid === "function") {
      const { root } = window.createHumanoid("#ff66cc"); // use your rig builder
      root.scaling.scaleInPlace(sizeMul(size));
      return root;
    }
    const root = proxyCapsule(scene, 2.0*sizeMul(size), 0.35*sizeMul(size), "#ff66cc");
    return root;
  }

  // Try to build the same segmented humanoid you use in the editor/gameplay.
  // We defer to a global factory if present (character.js / old game.js).
	// Use the same builder your old game used. No internal substitutes.
	function createHumanoidFromProject(scene, size){
	  // Original path: Character.createPlayerRig(scene, { color })
	  if (window.Character && typeof window.Character.createPlayerRig === "function"){
		var rig = window.Character.createPlayerRig(scene, { color:"#00ffcc" });
		if (rig && rig.root){
		  rig.root.scaling.scaleInPlace(sizeMul(size));
		  return rig.root;
		}
	  }
	  // Older global function fallback (if you previously had one)
	  if (typeof window.createHumanoid === "function"){
		var res = window.createHumanoid("#00ffcc");
		if (res && res.root){
		  res.root.scaling.scaleInPlace(sizeMul(size));
		  return res.root;
		}
	  }

	  // Last-resort: capsule (shouldn't happen if original builder exists)
	  console.warn("[rig-factory] Original humanoid builder not found; using capsule fallback.");
	  return proxyCapsule(scene, 2.0*sizeMul(size), 0.35*sizeMul(size), "#00ffcc");
	}

  // bob animation for idle
  function idleBob(root, scene){
    let t = 0;
    scene.onBeforeRenderObservable.add(()=>{
      t += scene.getEngine().getDeltaTime()/1000;
      const y = Math.sin(t*2.0)*0.03;
      root.position.y += (y - (root.metadata?._bobY || 0));
      root.metadata = root.metadata || {};
      root.metadata._bobY = y;
    });
  }

  const RigFactory = {
    create(scene, species, size){
      let root;
      switch (species){
        case Species.HUMANOID: root = createHumanoidFromProject(scene, size); break;
        case Species.QUAD:     root = createQuad(scene, size); break;
        case Species.AVIAN:    root = createAvian(scene, size); break;
        case Species.AQUATIC:  root = createAquatic(scene, size); break;
        case Species.ANTHRO:   root = createAnthro(scene, size); break;
        default:               root = proxyCapsule(scene, 2.0*sizeMul(size), 0.35*sizeMul(size)); break;
      }
      root.checkCollisions = true;
      root.isPickable = true;
      return root;
    },
    Species, SizeClass, rollSize, buildStats
  };

  window.Rigs = window.Rigs || {};
  window.Rigs.RigFactory = RigFactory;
})();
