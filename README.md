# Bristol 8 km x 8 km - geometry with traffic, wind, temperature, shade, pollution and flooding (web preview)

Release ext002-20261111.

Interactive Three.js preview of a base/analysis-candidate geometry layer for central Bristol (EPSG:32630 local frame, 8 km x 8 km),
with illustrative simulation layers: traffic, wind, air temperature, shade, a traffic NOx tracer and two flooding scenarios.
Open `viewer/` (the root page redirects there). Drag to pan, right-drag to rotate, scroll to zoom, double-click a feature for its record.
The arrow at the top right always points to true north (0.3 degrees west of the map grid north in this area).

## Intro tour

Opening the viewer plays a tour of about 2 3/4 minutes: the whole area, five landmarks (Clifton Suspension Bridge, Cabot Tower,
Wills Memorial Building, Bristol Cathedral, St Mary Redcliffe), traffic close up and as a map of the whole area, then wind, air temperature,
shade through a day, the NOx tracer, the rain flood and the river flood, then free exploration.
The order and camera transitions follow the South Kensington viewer of the Physics-Grounded 4D World Model Framework.
Skip intro or Esc leaves it; dragging, scrolling or touching the model hands control to you at once; Space pauses; Play intro replays it.
`?tour=0` (or a fixed `?cam=`) opens without the tour; the tour also does not start by itself when the system asks for reduced motion.
In the tour, wind is shown as speed colours on the ground; in the Simulations panel it is shown as moving streaks.

**Chapters.** In free exploration the Chapters button (top left, next to Play intro) lists the seven chapters of the tour: Landmarks, Traffic, Wind,
Temperature, Shade, Pollution and Flooding. Choosing one plays that chapter again with the same camera moves, layer animation and captions:
the camera flies in from the current view, the chapter plays (Landmarks: all five; Traffic: close up, then the whole area; Flooding: rain storm,
then river inflow), and the camera returns to the whole-area view for free exploration. End chapter or Esc stops where the camera is and
switches the chapter's layer off; dragging, scrolling or touching the model hands control over and keeps that layer on. A chapter can be
played as often as wanted; a chapter whose results are missing from a build is greyed out.

## Simulations (illustrative, not validated)

All layers are switched on and played from the Simulations panel. They are replays of results computed beforehand; no solver runs in the browser.
None of them is a measurement, a forecast or a validated result. The scenario values below are project defaults chosen to demonstrate
each layer; they are not observed Bristol conditions.

**Traffic.** A replay of an Eclipse SUMO 1.28.0 run on the OpenStreetMap road network with random passenger-car trips (one departure every
0.2 s, seed 42): 300 seconds after a 600 second warm-up, looped; 4,070 vehicles, about 2,500 to 3,100 on the roads at any time. Left-hand traffic;
signal positions and timings are guessed by SUMO from the map. Cars are drawn at true size on the model's road and bridge-deck surfaces, and as
dots (white moving, amber stopped) from far away; cars in tunnels and on covered roads are not shown. Synthetic demand: not observed traffic,
not traffic counts and not the TSM traffic model. Passenger cars only.

**Wind.** The framework's SCALED neural surrogate (weights used on Bristol with Yueyan Li's agreement) applied to the Bristol buildings on 4 m cells
with the terrain flattened; bridges and trees are not obstacles. Shown 12 m above the ground at 16 m resolution, 16 saved steps of 60.
Wind direction and speed are what the model produces, not a Bristol weather record. Smaller model tiles than the
reference setting were used to fit the shared GPU (more tile seams, same weights). Not validated against CFD or measurements.

**Air temperature.** Yi Qi's 2-D temperature model from the framework, unchanged, driven by the 12 m wind above on 8 m cells. The scenario is
the model's own summer-afternoon default (ambient 31.5 C, parameterised heating over built areas and cooling over vegetation and shade) with
the sun of 21 June, 14:00 BST at Bristol; 11 frames, 400 s apart. Colours span 31.0 to 32.4 C. It shows where the model makes air warmer or
cooler; it is not an energy balance with Bristol weather and not a temperature record.

**Shade.** Sun and shadow for 21 June 2026 under a clear sky, 05:00 to 21:00 BST every 30 minutes, from the framework's solar module
(sun position and shadow casting on a 4 m height grid of terrain and buildings). Trees and bridges are not in that grid and cast no shadow; overhangs are
filled and narrow streets are blurred by the 4 m grid.

**Traffic NOx tracer.** NOx emitted by the cars of the traffic run (SUMO's HBEFA 4 emission model with the same petrol Euro 4 car class for
every vehicle), carried by one steady wind field with the framework's upwind transport step on 8 m cells in a single 10 m mixed layer for
30 minutes. The wind is the 12 m surrogate field rescaled to a mean of 2 m/s. No background, chemistry, deposition or vertical profile.
Shown on a relative logarithmic colour scale. It is a tracer of where traffic emissions would collect under these assumptions: not PM2.5,
not an air-quality assessment, and very high values appear where the surrogate wind is nearly still. A diesel/petrol split and attribution
to individual vehicles are not included.

**Flooding, rain storm.** 50 mm in 90 minutes, then 90 minutes of drainage (the design storm of the group's South Kensington
run, not a Bristol event). Shallow-water solver of the framework, unchanged, on the Environment Agency
2 m DTM resampled to 8 m, with buildings as solid blocks. Sewers take 12 mm/h, green areas infiltrate 20 mm/h; mapped water areas and the
domain edge take the outflow. River levels and tides are not modelled. Not a flood forecast and not checked against Environment Agency
flood maps. Deep water in closed terrain hollows and early thin-film speeds have not been checked.

**Flooding, river inflow.** The same solver with water entering the River Avon at the east edge of the area: inflow rising for 1 hour to
800 m3/s, held for 2 hours, falling for 1 hour, 5 hours simulated (8.64 million m3 in total); no rain, no drainage, no tides, river
initially without flow. The inflow values are illustrative, with no return period. The terrain data record the water surface at the time of
survey, not the river bed, so the channel carries far too little water and flooding of the banks is exaggerated: about 187 ha of land
(3.8% of the land in the area) is under more than 10 cm at some time, and depths above 10 m appear near the inflow. Water balance of the
run: inflow 8,640,000 m3 = 7,819,515 m3 still in the area + 820,475 m3 left at the edges, difference 10 m3. Not a recorded event and not a forecast.

Data: PNG-encoded frames in `web/fields/` (`manifest.json` describes grids, encodings, scenarios and limits) and `web/traffic/`
(`traffic.bin` with its `manifest.json`).

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
Each simulation layer is downloaded when it is first switched on or reached in the tour (traffic is the largest, about 10 MB).
Add `?diag=1` to the viewer address for frame rate, network counts and captured page errors.

Sources and licences: see `ATTRIBUTION.md`.

## Release verification

Geometry preview: the CO performance candidate reviewed by CD on Mac mini Safari 27.2. Under a local shared 2 MiB/s limit with 100 ms request latency and no cache, the old full overview was ready at 11.969 s; this preview showed terrain at 2.103 s and completed the overview at 7.437 s (one run each, not Air/network guarantees). Cathedral details, bridge, layer toggle, picking and fast view changes passed the exercised native-browser checks; captured page errors were zero.

Release intro001-20261111 (wind, rain flood, intro tour): display and interaction checked by CD on Mac mini Safari 27.2 from a local server; about 60 frames per second sampled; captured page errors zero.

Release ext001-20261111 (traffic, north arrow, temperature, shade, NOx tracer, river flood): the review builds were checked by CD on Mac mini Safari from a local server in two rounds: the new tour stages, the layer switches, cars on the Cumberland Basin flyover, traffic speed, pause and seek, shadows at three times of day from one camera, both flood scenarios and the switch between them; about 60 frames per second in most sampled views (35 in one sample just after three layers were switched on) and zero captured page errors there. Not tested on a MacBook Air or over a slow network. These checks cover display only, not the physics; no layer has been compared with measurements.

Release ext002-20261111 (chapter replay): checked by CO before release in headless Chromium with software rendering (not Safari): the Chapters menu; each of the seven chapters started from a different view and played to its end; End chapter, Esc and hand-over by drag; an immediate repeat; chapters after skipping the intro and after its natural end; a 390 px wide window; greyed-out chapters in a build without those results; zero page errors. On Mac mini Safari, CD played the intro and all seven chapters to their natural end from a local server and exercised Skip, Space, Esc, End chapter and hand-over by drag and by wheel (about 60 frames per second at the chapter ends). After that review the layout for short, narrow windows was corrected (the Chapters menu stays above the loading bar and scrolls if needed; the caption box keeps clear of the north arrow and scrolls inside when the window is short) and checked by CO in headless Chromium at seven window sizes from 320 x 480 to 1280 x 800, including 427 x 290. Not tested on a phone, a MacBook Air or a slow network.

`SOURCE_FREEZE_full_B8.json` describes the historical input freeze, not current deployed file hashes. `WEB_RELEASE_MANIFEST.json` (in the repository) lists the deployed release. Analysis masters and frozen outputs were not changed.
