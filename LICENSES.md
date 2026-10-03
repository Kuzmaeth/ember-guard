# Licenses

## Game assets
All 3D models in `public/models/` and `assets/` are original. They are generated from scratch by `tools/build_assets.py` from Blender primitives, with no third-party models, textures, scans or reference meshes. They belong to the project owner.

## Code shipped to players
| Package | Use | License |
|---|---|---|
| three (0.170) | renderer, GLTFLoader, meshopt_decoder (from `three/examples/jsm`) | MIT |

## Build-time tools only (not shipped)
| Package / tool | Use | License |
|---|---|---|
| vite | bundler | MIT |
| @gltf-transform/core, extensions, functions, cli | GLB optimization | MIT |
| meshoptimizer | Meshopt encoder | MIT |
| Blender 5.2 LTS | model generation (the output is not covered by the GPL) | GPL-2.0-or-later |
