---
name: airport-config-builder
description: Builds a config/airports/ICAO.yaml gate-allocation config for the AGA (Aurora Gate Allocator) project from source documents like an IVAO MANEX (wiki.ivao.fr) and/or an official eAIP AD2 PDF. Use this whenever the user wants to add a new airport to AGA, mentions a MANEX or eAIP for an aerodrome, gives an ICAO code with source PDFs/URLs and asks for gate/parking/stand config, or asks to extract wake categories, terminal/airline groupings, closed stands, or stand-blocking rules for an airport into the engine's config format. Also use if the user says things like "ajoute LFXX", "construit la config pour cet aeroport", or pastes a MANEX/eAIP link and an ICAO code.
---

# Airport config builder (AGA)

Turns airport source documents (MANEX, eAIP) into a working
`config/airports/<icao>.yaml` for this repo's gate-allocation engine. This
process was run successfully by hand for LFLL and LFPO — read those two
files first (`config/airports/lfll.yaml`, `config/airports/lfpo.yaml`) as
your ground-truth examples of what "done" looks like, including how they
write source citations and flag gaps. Don't reinvent the format — copy
their structure and adapt the content.

## Why this matters

The whole point of AGA's suggestion engine is that it only recommends gates
that are actually plausible (right size, right airline). A config built from
guessed data is worse than no config at all, because it will confidently
suggest wrong gates instead of visibly having no data. Every value you can't
verify from a source document must be either derived from an explicit,
documented rule (and flagged as an approximation) or left out — never
invented to fill a gap silently. This mirrors how lfll.yaml flags uncertain
airline codes ("a confirmer") and how lfpo.yaml flags its wake categories as
a qualitative approximation rather than a measured wingspan table.

## Prerequisite: the .gts coordinate file must already exist

`GATES/<icao>.gts` (format `CODE;ICAO;LAT_DMS;LON_DMS;` per line) is the
authoritative list of real stand IDs — it's what the engine actually loads
gate-by-gate. The yaml config you're building only *annotates* stands that
already exist in that file (closed/wake category/group/blocking); it never
invents new stand IDs.

Check first:
```bash
ls "GATES/<icao-lowercase>.gts"
```

If it's missing, stop and tell the user this is a prerequisite — ask them
for it (it usually comes from the same MANEX documentation set, sometimes as
a separate attachment) rather than guessing stand IDs from a document's loose
ranges like "stands A11 to A42". Those ranges are approximate wayfinding for
humans, not a literal enumeration — the real list only lives in the `.gts`.

## Step 1 — Get the source text

You'll typically have one or both of:
- **MANEX wiki page** (`wiki.ivao.fr/.../<icao>-...`) — fetch it directly
  (WebFetch or the browser tools). It's usually the richer source for
  terminal/zone/airline groupings and stand-specific operational
  constraints, written in plain prose.
- **Official eAIP AD2 PDF** (national AIP, e.g. sia.aviation-civile.gouv.fr
  for France) — the authoritative source for the ARP position and elevation
  (section "AD 2.2" / "Position GEO ARP" in French eAIPs). It sometimes also
  has a parking-stand constraint table (look for "AD 2.XX.8" / "Utilisation
  des postes de stationnement" or the English equivalent "Use of parking
  stands"), but rarely a precise per-stand wingspan table — that data is
  often gatekept behind an internal ops extranet (as found for LFPO). Don't
  assume it's there; search for it, and note plainly in the yaml if it
  isn't.

If given a large PDF (100+ pages), **don't render every page as an image** —
extract text instead, which is dramatically faster and was already validated
on a 213-page eAIP in this project:
```bash
pdftotext -layout "<path-to-pdf>" "<scratchpad>/aip_<icao>.txt"
```
(`pdftotext` is available at `/mingw64/bin/pdftotext` in this environment's
Git Bash — no extra install needed.) Then grep the extracted text for the
sections you need instead of reading it linearly:
```bash
grep -n "ARP\|Position GEO\|postes de stationnement\|envergure\|Poste de stationnement" "<scratchpad>/aip_<icao>.txt"
```
Save extracted text files to the scratchpad directory, not the project —
they're working material, not a repo artifact.

## Step 2 — Extract each field

Work through these in order; each maps directly to a key in the yaml (see
`references/schema.md` for the full field-by-field reference and annotated
examples if anything here is ambiguous).

1. **`reference_point`** — ARP lat/lon from the eAIP ("Position GEO ARP"),
   converted to the project's DMS string format (`N048.43.24.000` /
   `E002.22.46.000` — same style as `GATES/*.gts`, degrees-minutes-seconds
   with a leading zero-padded degree field).
2. **`final_approach_criteria`** — default to `radius_nm: 3` and
   `max_altitude_ft: 2000` unless the user gives you different values.
3. **`closed_gates`** — stands explicitly described as non-commercial,
   permanently closed, or protocol/VIP-only-and-thus-out-of-scope (e.g.
   LFPO's Juliet stands). Don't close stands just because they're remote or
   low-traffic — "closed" means genuinely unavailable for allocation.
4. **`wake_categories`** — OACI letter per stand (A<15m, B15-24m, C24-36m,
   D36-52m, E52-65m, F65-80m wingspan). Prefer a source with an explicit
   per-stand wingspan or category table (rare — LFLL had one via a MANEX
   attachment, outside the official AIP). If the source only gives
   qualitative language ("small/medium capacity" as default, specific stands
   called out as "gros porteur"/"heavy"/wide-body-capable), use that to set
   a default category plus overrides — and say so explicitly in a yaml
   comment, the way lfpo.yaml does. A stand with no evidence either way can
   be left out of `wake_categories` entirely (the engine treats a missing
   entry as "no category data", not as unlimited).
5. **`gate_groups`** — zone/terminal → stand list → airline list. Cross-check
   every stand ID against the `.gts` file (step 0). Translate airline names
   to ICAO callsign-prefix codes (e.g. "Air France" → `AFR`) using
   well-known public codes; if you're not confident about a specific one,
   write it in with an inline "a confirmer" comment rather than silently
   guessing — a wrong code silently blocks that airline's real traffic from
   ever matching the group.
6. **`gate_blocking`** — only if the source explicitly documents stands that
   neutralize each other when occupied (e.g. "a widebody on X blocks Y and
   Z"). This relationship is **directional, not symmetric** — LFLL's real
   data confirms a stand like B62 occupied blocks B61 and B63, but B61 alone
   occupied blocks nothing. Encode exactly what the source states in each
   direction; don't assume it's reciprocal. If the source has no such table,
   omit `gate_blocking` entirely rather than inventing plausible-looking
   pairs.

## Step 3 — Write the yaml

Follow `config/airports/lfpo.yaml` as the structural template (it's the more
recent of the two references and has the clearest "known limitations" style).
Always include:
- A header comment block citing exact sources (document name/URL, section
  numbers) — matches the citation style already in both reference files.
- A `LIMITES CONNUES` comment section listing every approximation, omission,
  or uncertainty from step 2 — this is not optional politeness, it's what
  lets the user (or you, next session) know what to trust versus verify.

## Step 4 — Validate

Run this from the project root before calling it done:
```bash
node -e "
const { loadAirport } = require('./src/gates/airport-loader');
const a = loadAirport('<ICAO>');
console.log(a.icao, a.name, '|', a.gates.size, 'postes');
console.log('ARP:', a.referencePoint);
console.log('Fermes:', [...a.gates.values()].filter(g => g.closed).map(g => g.id));
"
```
This confirms the yaml parses, the ARP converts correctly, and every stand
you referenced actually resolves against the `.gts` file (a typo'd stand ID
in `wake_categories` or `gate_groups` fails silently otherwise — it just
never matches anything). Spot-check a couple of specific stands you're least
sure about by printing `a.gates.get('<ID>')` directly. If you have time,
also run a quick simulated suggestion (see the debug window's traffic
simulator, or `GateEngine.simulateAircraft()` in `electron/engine.js`) for
one aircraft matching a known airline group and one that shouldn't match
anything, to sanity-check the suggestion logic end to end — this is how LFPO
was verified (a Vueling A320 correctly got a zone_alpha stand; an Emirates
B777 correctly fell back to an ungrouped category-E stand).

## Step 5 — Report back

Summarize for the user, in plain terms: what was extracted with confidence
(cite the source), what was approximated (and how), what was left out
entirely for lack of data, and any airline codes or values you weren't sure
about. This is the same shape as the LFLL/LFPO wrap-ups already in this
project's history — the user needs to know what to double-check before
relying on it for real gate suggestions.
