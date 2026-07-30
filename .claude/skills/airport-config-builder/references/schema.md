# config/airports/<icao>.yaml — full schema reference

This is the exact shape `src/gates/airport-loader.js#loadAirport()` parses.
Read that file directly if anything here seems out of date — it's the
source of truth, this doc is a convenience.

## Top-level keys

```yaml
icao: LFPO          # optional; falls back to the filename uppercased
name: Paris Orly     # optional; falls back to ''

reference_point:     # optional — omit entirely if you don't have an ARP;
  lat: N048.43.24.000   # the engine just disables final-approach detection
  lon: E002.22.46.000   # for this airport rather than erroring

final_approach_criteria:
  radius_nm: 3          # default 3 unless told otherwise
  max_altitude_ft: 2000 # default 2000 unless told otherwise

closed_gates:
  - J01
  - J21

wake_categories:
  A01: E
  A11: C
  # ... any stand not listed here simply has no wake category data
  # (suggest.js treats missing category as "unknown", not "unlimited")

gate_blocking:
  # DIRECTIONAL: key = stand that, when occupied, neutralizes the listed
  # stands. No implicit reverse relationship.
  B62: [B61, B63]
  C81: [C82]
  C82: [C81, C83]

gate_groups:
  zone_alpha:
    label: Zone 3D/3E - Alpha (human-readable, shown in the UI)
    gates: [A01, A02, A03]          # every ID must exist in the .gts
    airlines: [AFR, EZY, VLG]       # ICAO callsign prefixes; omit or [] = open to any airline
```

## DMS coordinate string format

Same convention as `GATES/*.gts`: `<N|S|E|W><DDD>.<MM>.<SS.sss>` — degrees
zero-padded to the field width used by that hemisphere (3 digits for
longitude, 2 or 3 for latitude depending on the airport's location — match
what's already in the matching `.gts` file for consistency). Example:
`N048.43.24.000` = 48°43'24.000"N.

Convert decimal degrees to this format as:
```
deg = floor(abs(decimal))
min = floor((abs(decimal) - deg) * 60)
sec = (abs(decimal) - deg - min/60) * 3600
```
then format with the hemisphere letter (N/S for latitude, E/W for
longitude) based on sign.

## wake_categories — OACI letter reference

| Letter | Max wingspan |
|---|---|
| A | < 15 m |
| B | 15–24 m |
| C | 24–36 m |
| D | 36–52 m |
| E | 52–65 m |
| F | 65–80 m |

This maps to `src/gates/occupancy.js`'s `WAKE_ORDER` — the engine compares
an arriving aircraft's category (from `config/aircraft-wake-categories.yaml`,
looked up by ICAO type code) against a candidate stand's category and only
suggests stands whose category is >= the aircraft's. If you encounter an
aircraft type not in `config/aircraft-wake-categories.yaml` while testing,
that's a separate generic file (not per-airport) — add it there if you have
a confident wingspan source, otherwise leave it; the engine will surface an
explicit warning rather than guessing.

## gate_groups — why airline codes matter more than you'd think

`suggest.js` prioritizes airline match over wake category tightness when
ranking candidates. A group with the wrong airline code doesn't just fail to
suggest that stand to the right airline — it can also make the engine
recommend that stand to the *wrong* airline (since an empty/no-match
`airlines` list is treated as "open"), or silently exclude legitimate
traffic from a group it should belong to. This is why uncertain codes get
flagged inline rather than guessed:

```yaml
  zone_papa:
    label: Zone 1A - Papa
    gates: [P08, P09]
    airlines: [DLA, AEA, CLG]
    # DLA=Air Dolomiti, AEA=Air Europa, CLG=Chalair (code a confirmer)
```

## gate_blocking — real confirmed example (LFLL)

Straight from `config/airports/lfll.yaml`, sourced from a user-provided
"postes neutralisés par occupation" table — note the asymmetry:

```yaml
gate_blocking:
  B62: [B61, B63]   # B62 occupied blocks both neighbours
  B72: [B71, B73]
  B73: [B71, B72]   # B73 occupied blocks B71 AND B72 (not just B71)
  C19: [B92, B93, C21, C22, C23, C41]  # one trigger can span many stands
```
Stands that never appear as a key (e.g. `B61`, `B71` alone) don't neutralize
anything when occupied — this was confirmed by the user against the real
operational document, not assumed. Never assume a pair is reciprocal just
because it looks geometrically adjacent.

## Full worked examples

Read these files directly for complete, real, working configs:
- `config/airports/lfll.yaml` — precise wake data + confirmed directional
  blocking table.
- `config/airports/lfpo.yaml` — qualitative wake approximation + merged
  overlapping zone groups (see its "LIMITES CONNUES" header comment for how
  to write up an ambiguous source honestly).
- `config/airports/lfpg.yaml` — large-hub scale (500+ stands, generated via
  a one-off script rather than hand-written): a `.gts` 5th field decoded as
  the real wake category by cross-checking named A380 stands, prefix→zone
  mapping read visually off eAIP parking charts (pdftotext failed on them),
  and an honest gap left open for one zone (Terminal 3) whose physical
  stand prefix couldn't be confirmed.
