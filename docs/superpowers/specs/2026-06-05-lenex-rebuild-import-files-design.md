# Design: Rebuild Canadian Masters import files from Lenex

**Date:** 2026-06-05
**Status:** Approved
**Topic:** Regenerate all 10 Canadian Masters import CSVs (4 individual + 6
relay, LCM + SCM) from swimrankings **Lenex** exports instead of the xlsx — to
get clean swimmer names (including **relay** swimmer names), real provinces, and
real meet city/date.

## Context

The prior import files came from `SNC-new/Records-CAN.MS (1).xlsx`, which lists
only a **club name** for every relay (no individual swimmers) and needs name
reformatting + province guesswork for individuals. The user downloaded the same
records from swimrankings in **Lenex 2.0** format (`.lxf`, a zipped XML), which
carries full athlete data:

- `SNC-new/records (2).lxf` — **LCM**: 552 individual + 125 relay
- `SNC-new/records_2.lxf` — **SCM**: 593 individual + 137 relay

Lenex relay records list each leg's athlete (`RELAY > RELAYPOSITIONS >
RELAYPOSITION > ATHLETE`), and individual records carry `firstname`/`lastname`,
club `name`/`region`, and `MEETINFO` city/date. This is a strictly better source,
so it **replaces the xlsx** as the source of truth for these import files.

This task changes **data tooling + data only** — no app/importer/editor change.
The importer already accepts `Name2/3/4` columns and the relay 1-or-4 rule.

## Goals

1. `SNC-new/generate_imports.py` reads the two `.lxf` files (stdlib only) and
   writes the same 10 files + `_review.csv`, rerunnably.
2. Relay records with all 4 swimmers listed get real names; relays with fewer
   listed swimmers stay **club-team** (club in leg 1). Individuals get clean
   `First Last` names.
3. Every emitted file parses through the real `parseRecordsCSV` (national scope)
   with **0 errors**.

## Non-goals

- No app/importer/editor/DB change.
- Not creating the "Canadian Masters" club or uploading (manual user step).
- Not importing splits, points, birthdate, club code, nation, meet name.
- The xlsx and the old `SNC/` relay CSVs are abandoned (not consulted).

## Source data facts (from the two `.lxf` files)

| | LCM Men | LCM Women | SCM Men | SCM Women | total |
|---|---|---|---|---|---|
| Individual records (incl. empties) | 273 | 279 | 295 | 298 | 1,145 |

| Relay | LCM M | LCM W | LCM X | SCM M | SCM W | SCM X | total |
|---|---|---|---|---|---|---|---|
| All | 41 | 40 | 44 | 45 | 45 | 47 | 262 |
| Named (4 swimmers) | 33 | 35 | 37 | 45 | 39 | 47 | 236 |
| Club-team (<4 listed) | 8 | 5 | 7 | 0 | 6 | 0 | 26 |

- **33 individual records have no `ATHLETE`** (empty/"target" bands) → **dropped**
  → real individual total **1,112**.
- Relay listed-swimmer counts are only **0, 1, or 4** (no 2–3 partials), so the
  rule is unambiguous.
- Missing club `region`: **8 individual + 2 relay** → `Unknown` placeholder.
- Dates all `YYYY-MM-DD`; times `HH:MM:SS.ss`.

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Source of truth | The two Lenex `.lxf` files; xlsx + old `SNC/` CSVs abandoned |
| D2 | Scope | Rebuild **all** 10 files (individual + relay, both courses) |
| D3 | Relay with 4 listed athletes | Full names: `Swimmer`=leg 1, `Name2/3/4`=legs 2–4 |
| D4 | Relay with <4 listed athletes (26) | Club-team: `Swimmer`=club, legs blank; logged |
| D5 | Individual record with no athlete (33) | Dropped; logged |
| D6 | Missing province (region) | `Unknown` placeholder; logged |
| D7 | Swimmer name format | `"{firstname} {lastname}"` verbatim from Lenex (already clean) |

## Design

### Generator (`SNC-new/generate_imports.py`, rewritten)

Python 3 stdlib only (`zipfile` + `xml.etree.ElementTree` to read each `.lxf`'s
`LenexData.lef`; `csv` to write). Deterministic, no network, no third-party
packages. Rerunnable: overwrites `SNC-new/import/*`. Iterates
`RECORDLISTS → RECORDLIST → RECORDS → RECORD`, preserving Lenex document order
(record lists are emitted in ascending age-band order, events in event order).

Per `RECORDLIST`: `course` ∈ {LCM, SCM} (from the file), `gender` M/F/X →
Men/Women/Mixed, `age_group = "{agemin}-{agemax}"` from its single `AGEGROUP`.

Per `RECORD` (`is_relay = SWIMSTYLE/@relaycount not in {"1", None}`):

| Field | Source → transform |
|---|---|
| `Event` | `SWIMSTYLE`: individual `{distance} {stroke}` with `FREE→Free, BACK→Back, BREAST→Breast, FLY→Fly, MEDLEY→IM`; relay `{relaycount}x{distance} {stroke}` with `FREE→Free, MEDLEY→Medley` (e.g. `4x50 Free`, `4x100 Medley`) |
| `AgeGroup` | list's `agemin-agemax` |
| `Time` | `@swimtime` `HH:MM:SS.ss` → drop hours/leading zeros: `00:00:25.24→25.24`, `00:01:44.79→1:44.79`, `00:37:00.32→37:00.32` |
| `Date` | `MEETINFO/@date` verbatim (`YYYY-MM-DD`) |
| `Location` | `MEETINFO/@city`, blanked when `???`/`UNKNOWN`/empty (case-insensitive) |
| `is_New` | `"true"` if `Date` starts `2026`, else `""` |

**Individual** (no athlete → drop + review "no athlete"):
`Swimmer = "{firstname} {lastname}"` from `.//ATHLETE`; `Club` = its `CLUB/@name`;
`Province` = `CLUB/@region` (else `Unknown` + review). File `"{course} {gender}.csv"`.

**Relay**: `club = RELAY/CLUB/@name`, `region = RELAY/CLUB/@region`. Collect
`RELAYPOSITION` athletes ordered by `@number` as `"{firstname} {lastname}"`.
- 4 names → `Swimmer`=name 1, `Name2/Name3/Name4`=names 2–4.
- otherwise → `Swimmer`=`club`, `Name2/3/4`=blank; review "club-team relay (N
  swimmers listed)".
`Province` = `region` (else `Unknown` + review). File `"{course} {gender} Relay.csv"`.

### Output columns

- Individual header: `Event,AgeGroup,Time,Swimmer,Club,Province,Date,Location,is_New`.
- Relay header: `Event,AgeGroup,Time,Swimmer,Name2,Name3,Name4,Club,Province,Date,Location,is_New`.
- `_review.csv` header: `Source,Gender,Type,Event,AgeGroup,Club,Province,Issue`.
  One row per dropped (no athlete), club-team relay, or province-placeholdered
  record. Expected ≈ 33 dropped + 26 club-team + (≤10 province), with overlap.

### Expected output

| File | Records |
|---|---|
| `LCM Men.csv` / `LCM Women.csv` / `SCM Men.csv` / `SCM Women.csv` | ~1,112 total (273/279/295/298 minus per-file empties) |
| `LCM Men Relay.csv` | 41 |
| `LCM Women Relay.csv` | 40 |
| `LCM Mixed Relay.csv` | 44 |
| `SCM Men Relay.csv` | 45 |
| `SCM Women Relay.csv` | 45 |
| `SCM Mixed Relay.csv` | 47 |
| **Relay total** | **262** (236 named + 26 club-team) |

The generator prints per-file counts, the review count, and the dropped count.

### Validation

A **throwaway Vitest test inside `club-record/`** reads each generated CSV from
`SNC-new/import/` by absolute path and runs it through `parseRecordsCSV`
(individual files `{ relay: false, scope: "national" }`; relay files
`{ relay: true, scope: "national" }`), asserting **0 errors** and
`records.length === data-row count`. Run once to confirm upload-readiness, then
deleted (depends on machine-local paths outside the repo).

## Verification

1. `python3 SNC-new/generate_imports.py` → writes 10 CSVs + `_review.csv`;
   printed relay counts 41/40/44/45/45/47, individual ≈ 1,112, 33 dropped.
2. Throwaway validation test → all 10 files: 0 errors, records == data-row count.
3. Spot-check: a relay row shows 4 real names + club + province; a club-team relay
   shows the club in `Swimmer` with blank `Name2/3/4`; an individual shows
   `First Last`.

## Follow-ups (not this task)

- User creates/confirms the national "Canadian Masters" club and bulk-uploads the
  10 files.
- Optionally fix the few `Unknown` provinces in `_review.csv` at source.
</content>
