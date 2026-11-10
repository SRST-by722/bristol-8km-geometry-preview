# Bristol 8 km x 8 km geometry - stage preview (freeze full_B8)

Interactive Three.js preview of a base/analysis-candidate geometry layer for central Bristol (EPSG:32630 local frame, 8 km x 8 km).
Open `viewer/` (the root page redirects there). Drag to pan, right-drag to rotate, scroll to zoom, double-click a feature for its record.

**Status: stage preview with known defects. Not surveyed, not physically validated, not simulation-ready.**

- Footprints, roads, water and green areas are mapped data. Heights come from tags, LiDAR or defaults (see each building's record).
- Roof forms, facades, colours, woodland crowns, water display levels, bridge approach ramps and landmark details are inferred or illustrative.
- Known defects kept in this version: 25 unresolved bridge-end connections; 30 of 341 inferred ramps steeper than 10% (9 steeper than 15%);
  42 ramps with an outer-end difference over 0.3 m in a crude test; 2 shared bridge nodes with steps over 0.3 m;
  buildings under bridges may be too tall; landmark fine detail is not modelled.
- Files: `web/` holds compressed copies (meshopt, 16-bit quantised positions) of the analysis masters, which are not published here.
  `FREEZE_full_B8.json` lists the SHA256 of every file in `viewer/` and `web/`.
- Tested in Safari 27.2 on a Mac mini (Apple M6). Other devices have not been measured.

Sources and licences: see `ATTRIBUTION.md`.
