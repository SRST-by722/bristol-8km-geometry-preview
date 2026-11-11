# Bristol 8 km x 8 km - geometry, wind and flooding (web preview)

Interactive Three.js preview of a base/analysis-candidate geometry layer for central Bristol (EPSG:32630 local frame, 8 km x 8 km),
with two illustrative simulation layers: wind (learned surrogate model) and surface-water flooding (design storm).
Open `viewer/` (the root page redirects there). Drag to pan, right-drag to rotate, scroll to zoom, double-click a feature for its record.

## Intro tour

Opening the viewer plays a short tour (about 1.5 minutes): the whole area, five landmarks (Clifton Suspension Bridge, Cabot Tower,
Wills Memorial Building, Bristol Cathedral, St Mary Redcliffe), then the wind and flooding results seen from above, then free exploration.
The order and camera transitions follow the South Kensington viewer of the Physics-Grounded 4D World Model Framework.
Skip intro or Esc leaves it; dragging, scrolling or touching the model hands control to you at once; Space pauses; Play intro replays it.
`?tour=0` (or a fixed `?cam=`) opens without the tour; the tour also does not start by itself when the system asks for reduced motion.
In the tour, wind is shown as speed colours on the ground; in the Simulations panel it is shown as moving streaks.

## Simulations (illustrative, not validated)

Both layers are switched on and played from the Simulations panel. They are shown on the web copy of the terrain; no solver runs in the browser.

**Flooding.** A rainfall scenario: 50 mm in 90 minutes, then 90 minutes of drainage (the design storm of the group's South Kensington
run, not a Bristol event). Shallow-water solver of the Physics-Grounded 4D World Model Framework, unchanged, on the Environment Agency
2 m DTM resampled to 8 m, with buildings as solid blocks. Sewers take 12 mm/h, green areas infiltrate 20 mm/h; mapped water areas and the
domain edge take the outflow. River levels and tides are not modelled. Not a flood forecast and not checked against Environment Agency
flood maps. Deep water in closed terrain hollows and early thin-film speeds have not been checked.

**Wind.** The framework's SCALED neural surrogate (weights used on Bristol with Yueyan Li's agreement) applied to the Bristol buildings on 4 m cells
with the terrain flattened; bridges and trees are not obstacles. Shown 12 m above the ground at 16 m resolution, 16 saved steps of 60.
Wind direction and speed are what the model produces, not a Bristol weather record. Smaller model tiles than the
reference setting were used to fit the shared GPU (more tile seams, same weights). Not validated against CFD or measurements.

Data for both layers are PNG-encoded frames in `web/fields/` (`manifest.json` describes grids, encodings, scenario and limits).

**Status: stage preview with known defects. Not surveyed, not physically validated, not simulation-ready.**

## This is a separate visual preview copy

The files in `web/` are packed for fast loading. They are not the analysis masters and not the frozen full_B8 web copies.

- Positions: quantised to 16 bit over each tile file (a grid of about 8 mm). Measured against the masters: the bounding box of every feature differs by at most 6.2 mm. This is a per-feature bounding-box check, not an error bound for every vertex. The terrain overview uses one grid over 8 km (measured 6.1 cm), as before.
- Shading: only terrain keeps stored normals. All other faces are shaded flat in the browser from each triangle.
- Feature records (heights, sources, ids) are in `*.features.json` next to each tile file and are fetched when a feature is double-clicked.
- Triangles thinner than the 7.6 mm grid can collapse: 7,589 removed in total across 744 tile files. `PREVIEW_PACK_REPORT.json` lists every file.
- Coverage and feature inventory are retained: buildings, roads, terrain, vegetation, bridges and landmarks across the whole 8 km area. Quantisation, small collapsed triangles and shading changes are disclosed above.

## What the model is

- Footprints, roads, water and green areas are mapped data. Heights come from tags, LiDAR or defaults (see each building's record).
- Roof forms, facades, colours, woodland crowns, water display levels, bridge approach ramps and landmark details are inferred or illustrative.
- Known defects kept in this version: 25 unresolved bridge-end connections; 30 of 341 inferred ramps steeper than 10% (9 steeper than 15%);
  42 ramps with an outer-end difference over 0.3 m in a crude test; 2 shared bridge nodes with steps over 0.3 m;
  buildings under bridges may be too tall; landmark fine detail is not modelled.

## Loading

The page shows a terrain overview first (about 2 MB), then whole-area building blocks in 16 parts, then detail near the view
(roads and roof forms within 1400 m, windows and doors within 420 m). A bar at the top reports real downloaded bytes.
Add `?diag=1` to the viewer address for frame rate, network counts and captured page errors.

Sources and licences: see `ATTRIBUTION.md`.

## Release verification

Geometry preview: the CO performance candidate reviewed by CD on Mac mini Safari 27.2. Under a local shared 2 MiB/s limit with 100 ms request latency and no cache, the old full overview was ready at 11.969 s; this preview showed terrain at 2.103 s and completed the overview at 7.437 s (one run each, not Air/network guarantees). Cathedral details, bridge, layer toggle, picking and fast view changes passed the exercised native-browser checks; captured page errors were zero.

Simulations and intro tour (release intro001-20261111): display and interaction checked by CD on Mac mini Safari 27.2 from a local server: the tour order, transitions, Skip/Esc/Space, hand-over by drag and scroll, `?tour=0`, `?cam=`, and the Simulations panel afterwards; about 60 frames per second sampled; captured page errors zero. Not tested on a MacBook Air or over a slow network. These checks cover display only, not the physics.

`SOURCE_FREEZE_full_B8.json` describes the historical input freeze, not current deployed file hashes. `WEB_RELEASE_MANIFEST.json` (in the repository) lists the deployed release. Analysis masters and frozen outputs were not changed.
