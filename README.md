# Bristol 8 km x 8 km geometry - web preview (lighter copy of freeze full_B8)

Interactive Three.js preview of a base/analysis-candidate geometry layer for central Bristol (EPSG:32630 local frame, 8 km x 8 km).
Open `viewer/` (the root page redirects there). Drag to pan, right-drag to rotate, scroll to zoom, double-click a feature for its record.

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

This release uses the CO performance candidate reviewed by CD on Mac mini Safari 27.2. Under a local shared 2 MiB/s limit with 100 ms request latency and no cache, the old full overview was ready at 11.969 s; this preview showed terrain at 2.103 s and completed the overview at 7.437 s (one run each, not Air/network guarantees). Cathedral details, bridge, layer toggle, picking and fast view changes passed the exercised native-browser checks; captured page errors were zero.

`SOURCE_FREEZE_full_B8.json` describes the historical input freeze, not current deployed file hashes. `WEB_RELEASE_MANIFEST.json` lists this release. Analysis masters and frozen outputs were not changed.
