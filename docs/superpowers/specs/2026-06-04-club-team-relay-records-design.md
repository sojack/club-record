# Design: Club-team relay records + Canadian Masters relay import

**Date:** 2026-06-04
**Status:** Approved
**Topic:** Let a relay record represent a **club/team** holder (no individual
swimmers), so the 262 Canadian Masters relay records can be imported, then
generate their import files.

## Context

The Canadian Masters source (`SNC-new/Records-CAN.MS (1).xlsx`) has 262 relay
records where the holder is a club (e.g. "Penguin Masters Swimming") — the
source tracks no individual swimmers. The app's importer
(`lib/csv-parser.ts`) rejects any relay missing all four swimmer names
(`require all 4 swimmer names`), so these cannot import.

Everything else already accommodates a leg-1-only relay: the records schema has
`swimmer_name` (NOT NULL, the leg-1 holder) + nullable `swimmer_name_2/3/4` +
`record_club`; the public relay view renders
`[leg1..leg4].filter(Boolean).join(", ")` and shows `record_club` separately;
and `RecordTable` saves blank legs (the save filter only requires an event
name). **The single blocker is the importer's 4-name rule.**

## Goals

1. The importer accepts a **club-team relay** — leg-1 (`Swimmer`) present, legs
   2-4 absent — while still accepting full 4-swimmer relays and rejecting
   partial (2-3) ones.
2. The 6 Canadian Masters relay CSVs (LCM/SCM × Men/Women/Mixed) generate and
   validate through the real importer with 0 errors.

## Non-goals

- **No `swimmer_name` migration** — leg-1 stays `NOT NULL`; a club-team relay
  stores the club in `swimmer_name` (decided with the user). The club therefore
  appears in both the holder column and the Club column on the national view —
  accepted redundancy.
- No display/editor code changes (the public view + editor already handle
  blank legs).
- No change to full 4-swimmer relay behavior.
- Not creating the "Canadian Masters" club / uploading (manual user step).

## Decisions (locked with the user)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Club-team representation | Club name in `swimmer_name` (leg 1) + `record_club`; legs 2-4 null. No migration |
| D2 | Importer relay rule | **1-or-4**: legs 2-4 must be all-present (full relay) or all-absent (club-team); 1-2 present → error |

## Design

### Part 1 — Importer (`lib/csv-parser.ts`)

Replace the relay 4-name guard (currently lines 246-252):

```ts
    if (isRelay) {
      if (!name2?.trim() || !name3?.trim() || !name4?.trim()) {
        errors.push(
          `Row ${index + 2}: Relay records require all 4 swimmer names (Name1-Name4)`
        );
        return;
      }
```

with the 1-or-4 rule:

```ts
    if (isRelay) {
      const presentLegs = [name2, name3, name4].filter((n) => n?.trim()).length;
      if (presentLegs !== 0 && presentLegs !== 3) {
        errors.push(
          `Row ${index + 2}: A relay needs all 4 swimmer names, or just the team name in leg 1 (Swimmer)`
        );
        return;
      }
```

(The `allowedAgeGroups` check that follows, and the base
`if (!event || !time || !swimmer)` check — leg-1 is still required, holding the
team — and the national `recordClub`/`ageGroup`/`province` checks all stay.)

Fix the record construction so absent legs become `null` instead of throwing on
`undefined.trim()` (lines 291-293):

```ts
      swimmer_name_2: isRelay ? (name2?.trim() || null) : null,
      swimmer_name_3: isRelay ? (name3?.trim() || null) : null,
      swimmer_name_4: isRelay ? (name4?.trim() || null) : null,
```

That is the entire app change.

### Part 2 — Tests (TDD, `lib/csv-parser.test.ts`)

Add relay cases (driven through `parseRecordsCSV`):
- **Club-team relay** (national): a relay row with `Swimmer`=club, `Club`,
  `Province`, `AgeGroup`, no Name2-4 → 1 record; `swimmer_name` = club,
  `swimmer_name_2/3/4` = null, `record_club` = club.
- **Full relay** still parses: `Swimmer`+`Name2`+`Name3`+`Name4` all present →
  1 record with all four set.
- **Partial relay** errors: `Swimmer`+`Name2` only (2 of 4) → an error, 0
  records.

Existing relay tests must stay green.

### Part 3 — Relay import files (`SNC-new/`)

Extend `SNC-new/generate_imports.py` to also emit relay rows (remove the
`"x" in distance` skip; route relay rows to relay files). Per relay row:

| Column | Source → transform |
|---|---|
| `Event` | `DISTANCE` + " " + stroke; relay strokes `Fr→Free`, `Me→Medley` (e.g. `4x50 Free`, `4x100 Medley`) |
| `AgeGroup` | `"{AGEMIN}-{AGEMAX}"` (combined band, e.g. `72-99`) |
| `Time` | `SWIMTIME` |
| `Swimmer` | `CLUBNAME` (leg-1 = team) |
| `Club` | `CLUBNAME` |
| `Province` | `REGION`, else `"Unknown"` (flag) |
| `Date` | Excel serial → `YYYY-MM-DD` |
| `Location` | `MEETCITY`, blanked for `???`/`UNKNOWN`/empty |

Files (gender `M→Men, F→Women, X→Mixed`): `LCM Men Relay.csv` (41),
`LCM Women Relay.csv` (40), `LCM Mixed Relay.csv` (44), `SCM Men Relay.csv`
(45), `SCM Women Relay.csv` (45), `SCM Mixed Relay.csv` (47) — 262 total.
Header: `Event,AgeGroup,Time,Swimmer,Club,Province,Date,Location` (no Name2-4).
Relay rows missing province (2) get the `Unknown` placeholder and are added to
`_review.csv` (alongside the individual entries).

### Validation

A **throwaway Vitest test** in `club-record/` reads the 6 relay CSVs by
absolute path and runs each through `parseRecordsCSV({ relay: true,
scope: "national" })`, asserting **0 errors** and the expected per-file count
(above). Run once, then deleted. (This exercises the new 1-or-4 path end-to-end:
club-team relays with no Name2-4 must parse cleanly.)

## Verification

1. App change: `npx vitest run lib/csv-parser.test.ts` → green (new + existing);
   full `npx vitest run` green; `npx tsc --noEmit` + `npm run lint` clean. The
   importer change is committed (branch → local commits → merge).
2. Data: `python3 SNC-new/generate_imports.py` now also writes the 6 relay
   files (printed counts 41/40/44/45/45/47); the throwaway relay validation
   passes with 0 errors; then it is deleted.

## Follow-ups (not this task)

- The user creates/confirms a national-level "Canadian Masters" club and
  bulk-uploads all 10 files (4 individual + 6 relay).
- Optionally fix `_review.csv` provinces and regenerate.
</content>
