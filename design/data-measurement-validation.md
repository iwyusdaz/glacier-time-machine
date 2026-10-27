# Data and measurement validation

## DEM spot checks (automated: tests/unit/terrain-data.test.js)

| Point (published coordinate) | DEM value | Check |
|---|---|---|
| Muir Inlet (row 25) | 0.0 m | water at sea level, consistent |
| Muir Glacier (row 23) | 28.2 m | low valley floor, plausible |
| Riggs Glacier (row 24) | 962.8 m | up-glacier, plausible |

Metadata, bounds/resolution consistency and the 16-bit encoding are unit-tested.

## Measurement path (scripts/compute-flowline.mjs, tests/unit/logic.test.js)

- Lowest-cost route on the 60 m grid between the Muir Inlet and Muir Glacier published coordinates; cost = metres × (1 + max(elevation, 0) / 25).
- Result: 60 vertices, **36.44 km**; vertex elevations 0 m except the last three (6, 11, 32 m), so the path follows the water and low valley floor as intended.
- Tests: stored length equals recomputed length (< 2 m); markers at both ends measure within the 600 m task tolerance; 7 km scale task tolerance 300 m (keyboard reaches exactly 7.0 km in 100 m steps, checked in the functional test).
- Cross-check with sources: USGS says maximum retreat since the mid-1700s exceeds 50 km (row 5). A 36 km water path from the lower inlet to the present glacier area is consistent with that (it is shorter because the path starts inside the inlet, not at the Little Ice Age maximum). This is a consistency check, not a validation against a terminus record.

## Rates (tests/unit/logic.test.js)

| Period | Published | Lower-bound rate |
|---|---|---|
| 1941–1950 | > 3 km | ≥ 0.33 km/yr |
| 1941–2004 | > 7 km | ≥ 0.11 km/yr |

Task answers in content match `lowerBoundRate()` to < 0.001. The rate chart and its table contain only these periods (unit + functional tests).

## Not validated (cannot be yet)

- In-app terminus distances vs a published terminus history (plan §10): no dated history verified. UNVERIFIED.
- Imagery co-registration: no imagery draped. Not applicable.
- Camera-alignment error: camera station not solved. UNVERIFIED.
- DEM vertical datum (EGM2008) stated from the product description, not from a saved handbook page. UNVERIFIED.
