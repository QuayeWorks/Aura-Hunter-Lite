# Aura Hunter Lite

A browser-based Hunter × Hunter–inspired 3D action sandbox built with **Babylon.js**.  
Create a custom humanoid rig, allocate **Power / Agility / Focus**, and battle AI on floating platforms.

## Play
Once deployed with GitHub Pages, your game will be available at:
https://QuayeWorks.github.io/aura-hunter-lite/

## Features
- Custom character creation (name, clan, Nen type, theme color)
- 3 consolidated stats: **Power**, **Agility**, **Focus**
- Charged jumping, dash, melee, Nen blasts, and a Nen-special per type
- Time distortion (Specialist), shields (Conjurer), electrified strikes (Transmuter), etc.
- Segmented humanoid with walk/jump/attack animation
- **Rig Editor** (offset/rotation/size per limb) with XML import/export
- Waves of humanoid enemies with simple AI

## Controls
- **WASD** move, **Space** jump (hold to charge), **Shift** dash  
- **Q** Nen blast, **E** Special, **C** charge Nen  
- **Right Mouse** drag: orbit camera, **Wheel**: zoom  
- **Esc** pause, **L** level-up menu

## Local Dev
Serve the folder with any static server:
```bash
# Python 3
python -m http.server -d . 8080
# or Node (if installed)
npx http-server -p 8080
