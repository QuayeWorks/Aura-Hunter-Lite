// region-manager.js
(function(){
  const REGION_SIZE = 256;
  const SALT = 0xA11CE;

  function seededForRegion(rx, rz){
    const s = Utils.hash3(window.environment.seed||1, rx*73856093 ^ rz*19349663, SALT);
    return s / 4294967296;
  }

  // ------------ Terrain settings + persistence ------------
  const TERRAIN_SETTINGS_KEY = "hxh-terrain-settings";
  const TERRAIN_LAYER_DEFS = [
    { key:"bedrock", color:[0.5,0.5,0.56], emissive:[0.14,0.14,0.16], destructible:false, thickness:1 },
    { key:"dirt",    color:[0.5,0.34,0.2], emissive:[0.10,0.06,0.03], destructible:true,  thickness:1 },
    { key:"grass",   color:[0.32,0.62,0.3],emissive:[0.10,0.22,0.10], destructible:true,  thickness:0.25 }
  ];
  const defaultTerrainSettings = {
    length:32, width:32, cubeSize:1.2, activeRadius:48, streamingPadding:6,
    layers: TERRAIN_LAYER_DEFS.length, maxTrees:18
  };

  function clamp(x,a,b){ return Math.min(b, Math.max(a, x)); }
  function clampSetting(value, min, max, fallback){ if(!Number.isFinite(value)) return fallback; return clamp(value,min,max); }
  function normalizeTerrainSettings(next={}){
    const out = { ...defaultTerrainSettings };
    if (typeof next.length === "number") out.length = Math.round(clampSetting(next.length, 8, 256, defaultTerrainSettings.length));
    if (typeof next.width === "number") out.width = Math.round(clampSetting(next.width, 8, 256, defaultTerrainSettings.width));
    if (typeof next.cubeSize === "number") out.cubeSize = clampSetting(next.cubeSize, 0.5, 4, defaultTerrainSettings.cubeSize);
    if (typeof next.activeRadius === "number") out.activeRadius = clampSetting(next.activeRadius, 6, 300, defaultTerrainSettings.activeRadius);
    if (typeof next.streamingPadding === "number") out.streamingPadding = clampSetting(next.streamingPadding, 2, 60, defaultTerrainSettings.streamingPadding);
    if (typeof next.maxTrees === "number") out.maxTrees = Math.round(clampSetting(next.maxTrees, 0, 400, defaultTerrainSettings.maxTrees));
    out.layers = TERRAIN_LAYER_DEFS.length;
    return out;
  }
  function saveTerrainSettings(settings){ try{ localStorage.setItem(TERRAIN_SETTINGS_KEY, JSON.stringify(settings)); }catch{} }

  // ------------ Terrain lifecycle ------------
  function disposeTerrain(){
    const terrain = environment.terrain;
    if (!terrain) return;

    // clear trees if your game uses them
    if (typeof clearTrees === "function") try{ clearTrees(); }catch{}

    if (terrain.columns) {
      for (const column of terrain.columns) {
        if (!column) continue;
        for (const block of column) {
          if (block && !block.isDisposed?.()) { try{ block.dispose(); }catch{} }
        }
      }
    }
    if (terrain.layerTemplates) {
      for (const tpl of terrain.layerTemplates) {
        if (tpl && !tpl.isDisposed?.()) { try{ tpl.dispose(); }catch{} }
      }
    }
    if (terrain.root && !terrain.root.isDisposed?.()) { try{ terrain.root.dispose(false); }catch{} }
    environment.terrain = null;
    world.ground = null;
  }

  function createTerrain(scene){
    disposeTerrain();

    const settings = environment.terrainSettings = normalizeTerrainSettings(environment.terrainSettings);
    saveTerrainSettings(settings);

    const { length, width, cubeSize, layers } = settings;

    const layerThicknesses = new Array(layers);
    const layerOffsets = new Array(layers);
    let totalLayerHeight = 0;
    for (let layer=0; layer<layers; layer++){
      const def = TERRAIN_LAYER_DEFS[layer] || {};
      const thickness = cubeSize * (def.thickness ?? 1);
      layerOffsets[layer] = totalLayerHeight;
      layerThicknesses[layer] = thickness;
      totalLayerHeight += thickness;
    }

    const totalWidth = length * cubeSize;
    const totalDepth = width * cubeSize;
    world.size = Math.max(totalWidth, totalDepth);

    const halfX = totalWidth * 0.5;
    const halfZ = totalDepth * 0.5;
    const baseY = -totalLayerHeight;

    const root = new BABYLON.TransformNode("terrainRoot", scene);

    const columns = new Array(length * width);
    const heights = new Float32Array(length * width);
    const columnStates = new Array(length * width).fill(false);
    const centers = new Array(length * width);

    // Materials once
    const layerMaterials = TERRAIN_LAYER_DEFS.map(def=>{
      const mat = new BABYLON.StandardMaterial(`terrain_${def.key}`, scene);
      const diffuse = new BABYLON.Color3(def.color[0], def.color[1], def.color[2]);
      const emissive = new BABYLON.Color3(def.emissive[0], def.emissive[1], def.emissive[2]);
      mat.diffuseColor = diffuse;
      mat.ambientColor = diffuse.scale(0.45);
      mat.emissiveColor = emissive;
      mat.specularColor = BABYLON.Color3.Black();
      return mat;
    });

    const layerTemplates = [];
    for (let layer=0; layer<layers; layer++){
      const template = BABYLON.MeshBuilder.CreateBox(`terrainCubeTemplate_L${layer}`, {
        width:cubeSize, depth:cubeSize, height:layerThicknesses[layer]
      }, scene);
      template.parent = root;
      const mi = Math.min(layer, layerMaterials.length-1);
      template.material = layerMaterials[mi];
      template.isVisible = false;
      template.isPickable = false;
      template.checkCollisions = true;
      template.setEnabled(false);
      layerTemplates[layer] = template;
    }

    for (let z=0; z<width; z++){
      for (let x=0; x<length; x++){
        const idx = z*length + x;
        const column = new Array(layers);
        columns[idx] = column;
        heights[idx] = totalLayerHeight;

        const worldX = -halfX + (x + 0.5) * cubeSize;
        const worldZ = -halfZ + (z + 0.5) * cubeSize;
        centers[idx] = { x: worldX, z: worldZ };

        for (let layer=0; layer<layers; layer++){
          const source = layerTemplates[layer];
          const block = source.createInstance(`terrainCube_${x}_${z}_${layer}`);
          block.parent = root;
          const layerHeight = layerThicknesses[layer];
          const offsetY = layerOffsets[layer] + layerHeight * 0.5;
          block.position.set(worldX, baseY + offsetY, worldZ);

          block.metadata = { terrainBlock:{ columnIndex:idx, layer, destructible:TERRAIN_LAYER_DEFS[layer]?.destructible ?? true, destroyed:false } };
          block.isPickable = true;
          block.checkCollisions = true;
          block.setEnabled(false);
          column[layer] = block;
        }
      }
    }

    environment.terrain = {
      root, columns, heights, centers, columnStates, baseY, cubeSize,
      colsX:length, colsZ:width, halfX, halfZ, totalHeight: totalLayerHeight,
      layerOffsets, layerThicknesses,
      settings: { ...settings },
      streamAccumulator: 0, streamInterval: 0.25,
      layerTemplates
    };
  }

  // ------------ Helpers used by other modules ------------
  function terrainColumnIndexFromWorld(x,z){
    const t = environment.terrain; if (!t) return -1;
    const fx = (x + t.halfX) / t.cubeSize;
    const fz = (z + t.halfZ) / t.cubeSize;
    if (fx<0||fz<0||fx>=t.colsX||fz>=t.colsZ) return -1;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    return iz * t.colsX + ix;
  }
  function getTerrainHeight(x,z){
    const t = environment.terrain; if (!t) return null;
    const idx = terrainColumnIndexFromWorld(x,z); if (idx<0) return null;
    const h = t.heights[idx]; if (!Number.isFinite(h) || h<=0) return t.baseY;
    return t.baseY + h;
  }
  function getTerrainLayerTopForColumn(columnIndex, layerIndex){
    const t = environment.terrain; if (!t) return null;
    if (columnIndex<0 || columnIndex>=t.columns.length) return null;
    if (layerIndex<0 || layerIndex>=t.layerOffsets.length) return null;
    const column = t.columns[columnIndex]; if (!column) return null;
    const block = column[layerIndex]; if (!block) return null;
    const meta = block.metadata?.terrainBlock; if (!meta || meta.destroyed) return null;
    const offset = t.layerOffsets[layerIndex] + t.layerThicknesses[layerIndex];
    return t.baseY + offset;
  }

  function enableTerrainColumn(column){
    if (!column) return;
    for (let i=0;i<column.length;i++){
      const block = column[i]; if (!block) continue;
      const meta = block.metadata?.terrainBlock;
      if (!meta || meta.destroyed) continue;
      block.setEnabled(true);
      block.checkCollisions = true;
      block.isPickable = true;
    }
  }
  function disableTerrainColumn(column){
    if (!column) return;
    for (let i=0;i<column.length;i++){
      const block = column[i]; if (!block) continue;
      block.setEnabled(false);
      block.checkCollisions = false;
      block.isPickable = false;
    }
  }

  function updateTerrainStreaming(center, dt=0, force=false){
    const t = environment.terrain; if (!t) return;
    t.streamAccumulator += dt;
    if (!force && t.streamAccumulator < t.streamInterval) return;
    t.streamAccumulator = 0;

    const { activeRadius, streamingPadding } = t.settings || { activeRadius:48, streamingPadding:6 };
    const activeR = activeRadius + (streamingPadding||0);

    const cx = center.x, cz = center.z;
    const N = t.columns.length;
    for (let idx=0; idx<N; idx++){
      const p = t.centers[idx]; if (!p) continue;
      const dx = p.x - cx, dz = p.z - cz;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const shouldEnable = dist <= activeR;
      const cur = !!t.columnStates[idx];
      if (shouldEnable && !cur){
        t.columnStates[idx] = true;
        enableTerrainColumn(t.columns[idx]);
        if (typeof setTreeColumnEnabled === "function") setTreeColumnEnabled(idx, true);
      } else if (!shouldEnable && cur){
        t.columnStates[idx] = false;
        disableTerrainColumn(t.columns[idx]);
        if (typeof setTreeColumnEnabled === "function") setTreeColumnEnabled(idx, false);
      }
    }
  }

  // ------------ Region Manager ------------
  const RegionManager = {
    region: null,
    onSwap: [],
    init(scene){ this.scene = scene; this.region = null; },
    update(playerPos){
      if (!playerPos) return;
      const rx = Math.floor(playerPos.x / REGION_SIZE);
      const rz = Math.floor(playerPos.z / REGION_SIZE);
      if (!this.region || this.region.rx!==rx || this.region.rz!==rz){
        this.swapTo(rx, rz);
      }
    },
    async swapTo(rx, rz){
      this.region = {rx, rz};
      const rseed = seededForRegion(rx, rz);
      window.environment.seed = rseed;

      if (typeof disposeTerrain === "function") disposeTerrain();
      if (typeof createTerrain  === "function") createTerrain(this.scene);

      // optional garnish
      if (typeof scatterVegetation === "function") try{ await scatterVegetation(this.scene); }catch{}

      const pos = (window.playerRoot && window.playerRoot.position) || BABYLON.Vector3.Zero();
      if (typeof updateTerrainStreaming === "function") updateTerrainStreaming(pos, 0, true);

      if (window.Spawns && typeof window.Spawns.reset === "function") window.Spawns.reset();
      this.onSwap.forEach(fn=>{ try{ fn(this.region); }catch{} });
    }
  };

  // Expose everything other systems use
  window.RegionManager = RegionManager;
  window.disposeTerrain = disposeTerrain;
  window.createTerrain  = createTerrain;
  window.updateTerrainStreaming = updateTerrainStreaming;
  window.terrainColumnIndexFromWorld = terrainColumnIndexFromWorld;
  window.getTerrainHeight = getTerrainHeight;
  window.getTerrainLayerTopForColumn = getTerrainLayerTopForColumn;
})();
