// game.js — Orchestrator
(function(){
  const $ = (q)=>document.querySelector(q);

  // HUD refs (keep these ids/classes in index.html)
  window.hud = {
    name: $("#hud-name"),
    nen: $("#hud-nen"),
    level: $("#hud-level"),
    xpbar: $("#hud-xpbar span"),
    health: $("#hud-health span"),
    nenbar: $("#hud-nenbar span"),
    msg: $("#hud-message"),
    cdQ: $("#cd-q"),
    cdE: $("#cd-e"),
    cdDash: $("#cd-shift"),
    pauseOverlay: $("#pause-overlay"),
    btnResume: $("#btn-resume"),          // main menu resume
    btnResumeGame: $("#btn-resume-game"), // pause overlay resume
    btnExit: $("#btn-exit"),
  };
  window.hudState = { bars:{health:-1, nen:-1, xp:-1}, cooldowns:{
    nenblast:{active:false,pct:-1}, special:{active:false,pct:-1}, dash:{active:false,pct:-1}
  }};

  // World & env
  window.world = { size:100, gravityY:-28, ground:null, platforms:[] };
  window.environment = {
    seed: 1, time: 0, dayLength: 160,
    sky:null, skyMaterial:null, sun:null, moon:null, sunMesh:null, moonMesh:null, hemi:null,
    clouds:[], trees:[], treeColumns:[], terrain:null,
    terrainSettings: { length:32, width:32, cubeSize:1.2, activeRadius:48, streamingPadding:6, layers:3, maxTrees:18 },
    updateAccumulator:0, updateInterval:1/24
  };

  // Globals used by modules
  window.engine = null; window.scene = null; window.camera = null;
  window.playerRoot = null; window.enemies = []; window.projectiles = [];
  window.state = window.state || { hp:100, maxHP:100, nen:100, nenMax:100, ch:{nen:"Initiate"} };
  window.COOLDOWNS = { meleehit:0.25, nenblast:2.0, special:10, dash:2.6 };

  // Input
  const input = {}, inputOnce = {}, inputUp = {};
  function bindInput(){
    window.addEventListener("keydown",(e)=>{ if(!input[e.code]) inputOnce[e.code]=true; input[e.code]=true; });
    window.addEventListener("keyup",(e)=>{ input[e.code]=false; inputUp[e.code]=true; });
    window.addEventListener("wheel",(e)=>{ input["WheelDelta"]=(input["WheelDelta"]||0)+e.deltaY; }, {passive:true});
	// C + LMB = Ko strike
	window.addEventListener("mousedown", (e) => {
	  if (e.button !== 0) return;              // left click only
	  if (!input["KeyC"]) return;              // require C held
	  // Optional: pass a melee attempt callback to give the strike something to do
	  window.KoKenRyu?.koStrike?.(() => {
		// simple melee cone check around the player (placeholder)
		const origin = playerRoot.position.clone().add(new BABYLON.Vector3(0,1.0,0));
		const forward = scene.activeCamera?.getForwardRay()?.direction || new BABYLON.Vector3(0,0,1);
		for (let i = enemies.length - 1; i >= 0; i--) {
		  const eMesh = enemies[i]; if (!eMesh || eMesh.isDisposed?.()) continue;
		  const toE = eMesh.position.subtract(origin);
		  const dist = toE.length(); if (dist > 2.2) continue;
		  toE.normalize();
		  if (BABYLON.Vector3.Dot(forward, toE) > 0.55) {
			// Big hit to one target in front
			try { eMesh.dispose(); } catch {}
			enemies.splice(i,1);
			// register kill so absorb can trigger
			window.Combat?.onKill?.(playerRoot, eMesh);
			break;
		  }
		}
	  });
	});

  }

  // Setup Babylon
  async function setupBabylon(canvas){
    window.engine = new BABYLON.Engine(canvas, true);
    window.scene = new BABYLON.Scene(engine);

    window.camera = new BABYLON.ArcRotateCamera("cam", -Math.PI/2, Math.PI/3, 18, new BABYLON.Vector3(0,1,0), scene);
    camera.attachControl(canvas, true);
    const light = new BABYLON.HemisphericLight("h", new BABYLON.Vector3(0,1,0), scene); light.intensity=0.8;

    // Player placeholder
    window.playerRoot = BABYLON.MeshBuilder.CreateCapsule("player",{height:1.8, radius:0.3}, scene);
    playerRoot.position.set(0,3,0);
    playerRoot.checkCollisions = true;

    // Terrain + spawns
    RegionManager.init(scene);
    createTerrain(scene);                   // first terrain
    updateTerrainStreaming(playerRoot.position, 0, true);
    if (window.Items?.attachChestInteraction) Items.attachChestInteraction(scene);

    // Render loop
    let last = performance.now();
    engine.runRenderLoop(()=>{
      const now = performance.now(); const dt = Math.min(0.05, (now-last)/1000); last = now;
      tick(dt);
      scene.render();
    });

    window.addEventListener("resize", ()=> engine.resize());
  }

  function movePlayer(dt){
    // very simple WASD move on XZ plane
    const dir = new BABYLON.Vector3(
      (input["KeyD"]?1:0) - (input["KeyA"]?1:0),
      0,
      (input["KeyS"]?1:0) - (input["KeyW"]?1:0)
    );
    if (dir.lengthSquared()>0){ dir.normalize(); playerRoot.moveWithCollisions(dir.scale(6*dt)); }
  }

function updateProjectiles(dt){
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];

    // integrate
    p.prevPos.copyFrom(p.mesh.position);
    p.mesh.position.addInPlace(p.dir.scale(p.speed * dt));
    p.life.t -= dt;

    // expired?
    if (p.life.t <= 0) {
      try { p.mesh.dispose(); } catch {}
      projectiles.splice(i, 1);
      continue;
    }

    // hit test vs enemies
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (!e || e.isDisposed?.()) continue;

      // radius-based check (more robust than your mixed units)
      const mobR = e.getBoundingInfo?.()?.boundingSphere?.radius || 0.6;
      const hitR = (p.radius || 0.5) + mobR;
      const maxDist2 = hitR * hitR;

      if (BABYLON.Vector3.DistanceSquared(e.position, p.mesh.position) <= maxDist2) {
        // register kill FIRST so victim metadata is intact
        window.Combat?.onKill?.(playerRoot, e);

        // then clean up
        try { e.dispose(); } catch {}
        enemies.splice(j, 1);

        try { p.mesh.dispose(); } catch {}
        projectiles.splice(i, 1);

        break; // this projectile is gone; break inner loop
      }
    }
  }
}


  function tick(dt){
    // Inputs
    Nen.handleInputs(input, inputOnce, dt);

    // Movement + simple gravity snap
    movePlayer(dt);

    // Terrain streaming + spawns
    updateTerrainStreaming(playerRoot.position, dt);
    Spawns.update(scene);
    RegionManager.update(playerRoot.position);

    // Nen + KKR
    Nen.update(dt);
    if (window.KoKenRyu?.update) KoKenRyu.update(dt);

    // Combat
    Combat.tickCooldowns(dt);
    updateProjectiles(dt);

    // HUD
    updateHUD();
    updateCooldownUI(dt);

    // clear one-shot inputs
    for (const k in inputOnce) delete inputOnce[k];
    for (const k in inputUp) delete inputUp[k];
  }

  function boot(){
    const canvas = document.getElementById("renderCanvas");
    bindInput();
    setupBabylon(canvas);
    // hooks (Q/E/Shift)
    window.addEventListener("keydown",(e)=>{
      if (e.code==="KeyQ") Combat.blast();
      if (e.code==="KeyE") Combat.special();
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
