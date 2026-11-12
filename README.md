# Bristol 8 km x 8 km - geometry with traffic, wind, temperature, shade, pollution and flooding (web preview)

Release ext007-20261112. It adds to ext003: Malago Road as a landmark, a 2 m terrain mesh and a 2 m flood model around Malago Road, a replay of a UAV delivery schedule, and the wind and the traffic NOx tracer of the Malago Road area on 4 m cells. These were built as four steps (ext004 to ext007); ext004, ext005 and ext006 were review candidates and were not published on their own.

Interactive Three.js preview of a base/analysis-candidate geometry layer for central Bristol (EPSG:32630 local frame, 8 km x 8 km),
with illustrative simulation layers: traffic, wind, air temperature, shade, a traffic NOx tracer, three flooding scenarios and a replay of a UAV delivery schedule.
Open `viewer/` (the root page redirects there). Drag to pan, right-drag to rotate, scroll to zoom, double-click a feature for its record.
The arrow at the top right always points to true north (0.3 degrees west of the map grid north in this area).

## Intro tour

Opening the viewer plays a tour of about 3 minutes: the whole area, six landmarks (Clifton Suspension Bridge, Cabot Tower,
Wills Memorial Building, Bristol Cathedral, St Mary Redcliffe and Malago Road), traffic close up and as a map of the whole area, then wind, air temperature,
shade through a day, the NOx tracer, the rain flood and the river flood, then free exploration.
The order and camera transitions follow the South Kensington viewer of the Physics-Grounded 4D World Model Framework.
Skip intro or Esc leaves it; dragging, scrolling or touching the model hands control to you at once; Space pauses; Play intro replays it.
`?tour=0` (or a fixed `?cam=`) opens without the tour; the tour also does not start by itself when the system asks for reduced motion.
Malago Road (the A38 through Bedminster, a study area) is a road, not a building: while the tour shows it, or after its button in the Landmarks list is pressed, an orange ribbon marks its 428 m centre line from OpenStreetMap. The geometry has no finer detail there than elsewhere; the flood layer has a 2 m version for this area (below).
In the tour, wind is shown as speed colours on the ground; in the Simulations panel it can be shown as moving streaks or as speed colours, at a chosen height.

**Chapters.** In free exploration the Chapters button (top left, next to Play intro) lists the seven chapters of the tour: Landmarks, Traffic, Wind,
Temperature, Shade, Pollution and Flooding. Choosing one plays that chapter again with the same camera moves, layer animation and captions:
the camera flies in from the current view, the chapter plays (Landmarks: all six; Traffic: close up, then the whole area; Flooding: rain storm,
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
with the terrain flattened; bridges and trees are not obstacles. Shown at 16 m resolution, 16 saved steps of 60, at a height chosen with the Height slider in the Simulations panel: ten layers centred 8, 16, 24, 32, 40, 48, 64, 80, 96 and 120 m above the ground. Each height is one layer of the model grid, an 8 m thick average (for example 4 to 12 m for the 8 m layer); the ground is flat in the model, so heights are above local ground. Colours and streak speeds use one scale for all heights. The tour shows the 8 m layer.
Correction: releases up to ext002 described the lowest layer as 12 m above the ground. The model grid has a solid ground slab below it, so that layer is 4 to 12 m above the ground, centred at 8 m. The data are unchanged; the air temperature and NOx layers were computed with this same layer and only its description changes.
Wind direction and speed are what the model produces, not a Bristol weather record. Smaller model tiles than the
reference setting were used to fit the shared GPU (more tile seams, same weights). Not validated against CFD or measurements.

**Air temperature.** Yi Qi's 2-D temperature model from the framework, unchanged, driven by the lowest wind layer above (4 to 12 m above the ground) on 8 m cells. The scenario is
the model's own summer-afternoon default (ambient 31.5 C, parameterised heating over built areas and cooling over vegetation and shade) with
the sun of 21 June, 14:00 BST at Bristol; 11 frames, 400 s apart. Colours span 31.0 to 32.4 C. It shows where the model makes air warmer or
cooler; it is not an energy balance with Bristol weather and not a temperature record.

**Shade.** Sun and shadow for 21 June 2026 under a clear sky, 05:00 to 21:00 BST every 30 minutes, from the framework's solar module
(sun position and shadow casting on a 4 m height grid of terrain and buildings). Trees and bridges are not in that grid and cast no shadow; overhangs are
filled and narrow streets are blurred by the 4 m grid.

**Traffic NOx tracer.** NOx emitted by the cars of the traffic run (SUMO's HBEFA 4 emission model with the same petrol Euro 4 car class for
every vehicle), carried by one steady wind field with the framework's upwind transport step on 8 m cells in a single 10 m mixed layer for
30 minutes. The wind is the lowest layer of the surrogate field (4 to 12 m above the ground) rescaled to a mean of 2 m/s. No background, chemistry, deposition or vertical profile.
Shown on a relative logarithmic colour scale. It is a tracer of where traffic emissions would collect under these assumptions: not PM2.5,
not an air-quality assessment, and very high values appear where the surrogate wind is nearly still. A diesel/petrol split and attribution
to individual vehicles are not included.

**Flooding, rain storm.** 50 mm in 90 minutes, then 90 minutes of drainage (the design storm of the group's South Kensington
run, not a Bristol event). Shallow-water solver of the framework, unchanged, on the Environment Agency
2 m DTM resampled to 8 m, with buildings as solid blocks. Sewers take 12 mm/h, green areas infiltrate 20 mm/h; mapped water areas and the
domain edge take the outflow. River levels and tides are not modelled. Not a flood forecast and not checked against Environment Agency
flood maps. Deep water in closed terrain hollows and early thin-film speeds have not been checked.

**UAV deliveries.** A replay of one run of the MFMU UAV scheduler (research integration preview, https://github.com/MMMaikouyebohan/mfmu-uwm-integration-preview, commit 3b0fa7c, used unchanged) on a demonstration scenario made for this page: 24 stations (4 hubs where UAVs start and swap batteries, 8 collection stations, 12 drop-off stations), 200 UAVs in total (50 at each hub), 600 synthetic paired delivery requests (seed 20261112) and 240 slots of one minute. Station positions are a hand-picked pattern moved to the nearest mapped green area with no building or water within 12 m. They are not real or planned sites; collection and drop-off are this scenario's use of the stations (the scheduler knows hubs and stations). Travel times given to the scheduler are straight-line distances at 15 m/s rounded up to whole slots. The battery model, the 240-slot horizon and the five-slot drop-off window are the scheduler's fixed research settings. The run shown used the mean_field backend on a GPU workstation: 600 of 600 requests accepted, 0 hard violations, 9 rounds; the scheduler's own replay and an independent replay of events and battery levels passed. All 600 owner decisions used the scheduler's uniform fallback and none used mean-field guidance, so the run shows a schedule that closes under the hard constraints, not a benefit of mean-field guidance. 198 of the 200 UAVs fly and at most 51 are in the air at once. The scheduler's earlier validation campaign does not cover a new scenario such as this one. What the page draws: for each UAV the flight segments of its journeys as straight lines between stations, position linear in time; at other times the UAV stands at its station on a display grid. Flight height is a display choice (60 m above the highest ground under the line, with a climb and a descent). There is no routing and no obstacle, airspace or wind check; return flights that the scheduler only certifies as feasible are not drawn. The UAV model is the cargo hexacopter of the framework's South Kensington UAV demonstration (hexacopter_cargo.glb, unchanged, 1.36 m wide, drawn at true size; yellow dots mark UAVs in flight). Not an operating plan and not flight paths.

**Wind, Malago Road on 4 m cells.** For a square around Malago Road (252 x 250 cells of 4 m: x -560 to 448 m, y -2152 to -1152 m in the local frame) the wind layer can be shown on the surrogate model's own 4 m cells and 4 m thick layers, 17 heights from 0-4 m to 64-68 m above the ground, the same 16 saved steps. These are the saved steps of the 8 km wind run decoded again without the 2 x 2 x 2 averaging; no new model run. Averaging the 4 m cells over 2 x 2 x 2 reproduces the published 8 m layers that lie in this height range (8 to 48 m and 64 m) to 0.0005 model units, at every saved step. The whole-area wind layers are those averaged fields drawn on 16 m pixels. Finer pixels show what the model produced at its own cell size and add no accuracy: flattened terrain, no trees or bridges, no CFD or measurements behind it, not compared with the Malago Road experiments. Chosen with Area in the wind controls. The whole-area traffic NOx tracer and the temperature layer still use the 8 m averaged wind.

**NOx tracer, Malago Road on 4 m cells.** The traffic NOx tracer computed again for the Malago Road area on 4 m cells (shown: 244 x 242 cells, x -544 to 432 m, y -2136 to -1168 m), with the same cars, emission model, solver and assumptions as the whole-area layer (one 10 m mixed layer, no chemistry or deposition, clean start, 30 minutes) and the same speed factor, but the surrogate wind at its own 4 m cell size (mean of the two layers 4-12 m above the ground). A 4 m column is an obstacle if either of its two cells is building (29 % of columns); in the 8 m run a cell is an obstacle if any of its eight 4 m cells is (43 %), so individual buildings are resolved here where the 8 m run has blocks. The run is nested: after every step a 16 m ring around the area is set to the 8 m solution of the whole-area run, so tracer released outside flows in; the ring is not shown. Check of the nesting: the same set-up on 8 m cells with the 8 m wind gives back the whole-area run inside the ring (correlation 0.9999, mean 0.5 % lower, over 5,325 cells). The 4 m result itself differs from the 8 m run where both have open cells (mean 0.31 of the 8 m value, correlation 0.47); this reflects the different obstacles and wind detail and is not an error estimate of either. Tracer inside the area at the end (72.6 g) is close to what was released inside it (73.2 g); this is not a mass-balance check, because tracer also enters and leaves through the ring and that exchange was not totalled. The wind is a horizontal slice of a 3-D field and is not free of divergence, so the conservative 2-D scheme piles tracer up where the slice converges: at the end 85 % of the tracer mass sits in 1 % of the open cells (77 % in the 8 m control), and the largest value keeps growing. The colour scale ends at 1000 ug/m3; 1,217 pixels over the 31 frames lie above it and are drawn in the last colour. Finer cells do not make this a more accurate concentration. A relative tracer under stated assumptions; not a measured or validated concentration; not compared with the Malago Road experiments. Chosen with Area in the tracer controls.

**Terrain at 2 m around Malago Road.** In four detail tiles (t07_04, t08_04, t07_05, t08_05: x -500 to 500 m, y -2000 to -1000 m in the local frame) the terrain mesh and the surfaces draped on it (roads, rail, water, vegetation areas) use every node of the 2 m terrain grid; everywhere else they use every second node (4 m). The block is made of whole tiles and is not the square of the 2 m flood model below (x -555 to 445 m, y -2151 to -1151 m); the two overlap, neither contains the other. Measured at the 251,001 grid nodes of the block, the 4 m mesh lay 0.068 m rms from the 2 m grid heights (0.13 m at the 95th percentile, 0.30 m at the 99th, 1.47 m at most; 599 nodes more than 0.5 m). The 2 m mesh passes through every node, except 1,000 vertices on the outer edge of the block, which sit on the straight edges of the neighbouring 4 m tiles so that no gap opens (largest shift 0.50 m). Buildings, trees, hedges and bridges are unchanged. The four base files grow from 252,146 to 786,360 triangles and from 1.01 MB to 2.48 MB. The 2 m grid is the Environment Agency 2 m data sampled bilinearly once from the British National Grid into the local frame; the mesh holds no detail beyond that source, and frame rate with these tiles was not measured.

**Flooding, Malago Road at 2 m.** The same rain storm and solver on a 1 km x 1 km square around Malago Road (cell centres x -554 to 444 m, y -2150 to -1152 m in the local frame), on 2 m cells (500 x 500), the spacing of the Environment Agency terrain data, instead of cells pooled to 8 m. The 2 m terrain grid is the Environment Agency 2 m data sampled bilinearly once from the British National Grid into the local frame; it holds no detail beyond that source. Within this square the 8 m grid differs from the 2 m terrain by 0.18 m rms (0.38 m at the 95th percentile, 2.3 m at most); the 2 m run uses the 2 m heights directly. Which street features this resolves has not been assessed. The water line drawn on building walls in this scenario uses the same 2 m heights. It is a separate small model: no water enters across its edges (the upper River Malago and street flow from the surrounding area are left out) and its edges absorb outflow. Over the same square the 8 km model shows 14.6 ha of ground under more than 10 cm at some time and the 2 m model 9.2 ha; because the boundaries differ, that difference is not the effect of resolution alone. Water balance of the run: 45,000 m3 of rain and roof runoff = 17,633 m3 drained + 9,338 m3 left at the edges + 18,025 m3 still in the square, difference 3 m3. Chosen with the scenario list of the Flooding layer. Not compared with the Malago Road experiments.

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

Release ext003-20261112 (wind height slider, speed colours in the panel, corrected height labels): no new model run was made. The 8 m layer is the one already published; 16 and 40 m come from slices saved during the original run; the other seven heights come from decoding the saved model steps again on the GPU workstation (run by CD; where both exist the two differ by at most 0.01 in model speed units, because the saved steps are stored at lower precision). The height reading was checked independently by CD against the model input code. On Mac mini Safari from a local server, CD checked a first build with three heights: switching height in both displays, changing height during playback, the Wind chapter returning to the 8 m layer, and a full intro run (about 60 frames per second, zero captured errors). Afterwards the remaining heights were added and the layout of the Simulations card in narrow windows was corrected (the card now scrolls inside the window); CO checked this in headless Chromium with software rendering at eight window sizes from 320 x 480 to 1280 x 800, including 427 x 290. Not tested on a phone, a MacBook Air or a slow network.

Release ext007-20261112 was built in four steps on top of ext003. Each step copied the previous package and was checked on its own; only the last is published. CO tested each step separately and did not run one complete regression of all layers and the intro on the final package.

Step ext004-20261112 (Malago Road as a landmark; 2 m flood model and 2 m terrain mesh for the Malago Road area): checked by CO in headless Chromium on its own review candidate (not published on its own) with software rendering (not Safari): the Landmarks list entry, the Landmarks chapter with six stops, the ribbon shown during the Malago Road stop and removed afterwards, the list button, the intro with 16 stages (175 s); the three flood scenarios and switching between them, the Flooding chapter returning to the 8 km rain scenario, a build without the 2 m data; the four 2 m terrain tiles loading next to their 4 m neighbours; zero page errors. The 2 m tiles were also checked from the files: draped surfaces at least 3 cm above the terrain triangles, heights along the block edge equal to the neighbouring tiles, all other layers unchanged. Frame rate and Safari behaviour were not part of that check.

Step ext005-20261112 (UAV deliveries layer): checked by CO in headless Chromium on its own review candidate (not published on its own) with software rendering (not Safari): the layer loads, 24 station markers and 200 UAVs, the time slider, play, the station list, switching the layer off, a build without the UAV data, the traffic layer next to it; zero page errors. Replay data were checked against the scheduler result when exported (segments continuous per UAV, flight times equal to the travel-time table). Frame rate and Safari behaviour were not part of that check.

Step ext006-20261112 (wind of the Malago Road area on 4 m cells): checked by CO in headless Chromium on its own review candidate (not published on its own) with software rendering (not Safari): switching between the two wind areas, heights and labels of each, both display modes, the Wind chapter returning to the whole-area wind, a build without the 4 m data; zero page errors. Frame rate and Safari behaviour were not part of that check.

Step ext007-20261112, the published package (NOx tracer of the Malago Road area on 4 m cells): checked by CO in headless Chromium with software rendering (not Safari): switching between the two tracer areas with the layer on and off, labels and grids, play, the temperature layer taking over the map slot, the Pollution chapter returning to the whole-area tracer, a build without the 4 m data; zero page errors. Frame rate and Safari behaviour were not part of that check.

`SOURCE_FREEZE_full_B8.json` describes the historical input freeze, not current deployed file hashes. `WEB_RELEASE_MANIFEST.json` (in the repository) lists the deployed release. Analysis masters and frozen outputs were not changed.
