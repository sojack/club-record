# Design: Club-level records authority (regular / provincial / national)

**Date:** 2026-05-17
**Status:** Approved (design); pending spec review
**Builds on:** `2026-05-16-relay-records-design.md` and
`2026-05-17-individual-records-age-group-display-design.md` (reuses
`record_lists.scope` as the behavioural switch and the relay/individual
age-group + holder-club + province machinery).

## Problem & goal

`record_lists.scope` (the switch that drives age-band grouping, holder-club
and province columns) is currently **inferred from the uploaded filename**
(`parseFilename` looks for a `national`/`provincial`/`canadian` token). That
inference silently fell back to `scope='club'` for the 4 Canadian Masters
individual lists (uploaded by a pre-fix bundle), producing 263/288/257/279
flat records with `age_group=NULL` and no dividers.

A dedicated records-authority club holds **only** national (or only
provincial) records — never ordinary club records. Anchor the behaviour to
the **club**, not the filename: a club has a *level*, and that level
authoritatively determines the scope of every list under it. This removes the
entire filename-inference failure class and adds a real
national-vs-provincial distinction.

## Behaviour matrix (the core)

| Club level | Age-band grouping | Holder **Club** column | **Province** column |
|---|---|---|---|
| `regular` | no | no | no (today's club records — unchanged) |
| `provincial` | yes | yes | **no** — the province is the provincial club itself (`clubs.province`) |
| `national` | yes | yes | **yes** (per record: ON/QC/…) — identical to today's `national_provincial` |

Provincial records still show the **holder's club** (which club the
record-holder swims for); they omit the per-record province because the whole
list belongs to one province, stored on the club.

## Architecture (Approach B)

Add `clubs.level` (+ `clubs.province`) as the authoritative source. Keep
`record_lists.scope` as the denormalised behavioural switch the ~8 read sites
already consume — widen it to `club | provincial | national` and **set it
from the club's level at list-creation/upload time**, deleting the
`parseFilename` scope inference. Read sites get a small refactor from one
boolean (`isNatProv`) to two derived booleans. No new behavioural switch is
threaded through the app; relay/individual display, fetches, and the
grouped-divider code stay structurally intact.

## 1. Schema changes (new idempotent migrations under `supabase/migrations/`)

### `add_club_level.sql`
```sql
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'regular'
    CHECK (level IN ('regular', 'provincial', 'national'));
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS province TEXT;
```
- `level` defaults `regular` → every existing club is unaffected (regular
  behaviour = today's club records).
- `province` is nullable; meaningful only when `level='provincial'`
  (the province that provincial club represents, e.g. `ON`). Null for
  `regular` and `national` clubs.

### `widen_record_lists_scope.sql`
The existing CHECK is the unnamed inline constraint from
`add_relay_fields_to_record_lists.sql`; Postgres auto-names it
`record_lists_scope_check`. Order matters (drop → migrate values → re-add):
```sql
ALTER TABLE record_lists DROP CONSTRAINT IF EXISTS record_lists_scope_check;
UPDATE record_lists SET scope = 'national' WHERE scope = 'national_provincial';
ALTER TABLE record_lists
  ADD CONSTRAINT record_lists_scope_check
    CHECK (scope IN ('club', 'provincial', 'national'));
```
Existing `'national_provincial'` rows = the Canadian Masters **relay**
national lists, which carry per-record province → map to `'national'`.
`'club'` rows unchanged. No existing `'provincial'` data.

### `types/database.ts`
- `Club` gains `level: 'regular' | 'provincial' | 'national'` and
  `province: string | null`.
- `RecordList.scope` → `'club' | 'provincial' | 'national'`.
- `RelayParseOptions.scope` and `RelayTemplateOptions.scope` (in
  `lib/csv-parser.ts`) and `CSVUploader`/`RecordTable`/`PublicRecordSearch`
  `scope` props → same 3-value union.

The Canadian Masters club's `level='national'` is **not** set by migration
(we don't hardcode its id; `level` is admin-set). The data map above already
makes its existing relay lists `scope='national'`; the admin sets the club
level via the UI (§5) after deploy.

## 2. Write side — scope derived from club level, filename inference removed

A single helper, e.g. `lib/scope.ts`:
```ts
export type ClubLevel = "regular" | "provincial" | "national";
export type ListScope = "club" | "provincial" | "national";
export function scopeForClubLevel(level: ClubLevel | null | undefined): ListScope {
  return level === "national" ? "national"
       : level === "provincial" ? "provincial"
       : "club";
}
```
- `parseFilename` (in `bulk-upload/page.tsx` and `admin/[clubId]/upload/page.tsx`):
  **keep** title/slug/courseType/gender/recordType detection; **delete** the
  `scope` derivation and the `scope` field from its return type.
- `bulk-upload/page.tsx`: `scope = scopeForClubLevel(selectedClub.level)`
  (from `ClubContext`); insert with that. Pass it to `parseRecordsCSV`.
- `admin/[clubId]/upload/page.tsx` → `api/admin/upload/route.ts`: the **route**
  loads the club via the admin client (`select level`) and computes
  `scopeForClubLevel(club.level)` server-side. It does **not** trust any
  client-supplied scope. The admin page stops sending `scope`.
- `records/new/page.tsx` (New List form): **remove** the `scope` state and the
  scope `<select>`. The created list's `scope = scopeForClubLevel(selectedClub.level)`.
  `record_type` (individual/relay) remains a user choice.
- `ClubContext` must expose `level` on the selected club. It already
  `select("*")`s clubs, so the column flows once the migration + types land —
  verify in the plan and add the field to the context's `Club` typing usage.

## 3. Parser (`lib/csv-parser.ts`) — three behaviours

Replace the binary `indivNatProv`/`isNatProv` logic with scope-driven
behaviour:
- `scope === 'club'`: plain individual (no age/club/province) — unchanged.
- `scope === 'national'`: require + populate `age_group` + `record_club` +
  `province` (exactly today's `national_provincial` path).
- `scope === 'provincial'`: require + populate `age_group` + `record_club`;
  leave `province` **null** (it lives on the club).
- Relay rows: the 4-name requirement is unchanged for `record_type='relay'`
  regardless of scope; `province` is required/populated only for `national`,
  `record_club` for `provincial` + `national`, `age_group` for
  `provincial` + `national`.
- The individual age-group strings are still **not** validated against a
  standard set (carried over from the prior spec).

## 4. Read sites — `isNatProv` → two derived booleans

Every site computing `isNatProv = scope === 'national_provincial'` (or the
post-individual-feature equivalent) becomes:
- `showHolderClub = scope !== 'club'`
- `showProvince = scope === 'national'`
- age-group / grouping enablement = `scope !== 'club'` (individual → age-band
  dividers; relay → age-group column — i.e. exactly today's
  national_provincial rendering, now also reached by `provincial`).

Affected files: `components/RecordTable.tsx`, `app/[clubSlug]/[recordSlug]/PublicRecordSearch.tsx`,
`lib/csv-parser.ts`, `app/(dashboard)/dashboard/records/[listId]/page.tsx`
(the "Relay · Nat/Prov / Club" badge → reflect 3 values),
`components/CSVUploader.tsx` (relay/provincial template & expected-columns
text: provincial template omits the `Province` column), and the editor/public
prop-passing (`ClubRecordBrowser.tsx`, `[recordSlug]/page.tsx` — already pass
`scope`, just 3-valued now). Column counts / `colSpan` must stay symmetric:
the Province column appears iff `showProvince`, the Club column iff
`showHolderClub`, in both `<th>` and `<td>` and the empty-state/divider
`colSpan`.

Public labelling: on the public page, when the club is `provincial` and has
`clubs.province`, show it once (e.g. a "<Province> Provincial Records"
heading) since records omit it. Keep this minimal — a single heading line,
not per-row.

## 5. Admin UI (admin-only)

- The owner-facing **New Club** form (`dashboard/clubs/new`) is **unchanged**;
  `level` defaults to `regular`. Regular owners cannot set level.
- In the `ADMIN_EMAIL`-gated `app/admin/` area, add a per-club control to set
  `level` (`regular`/`provincial`/`national`) and, shown only when
  `level='provincial'`, a `province` text input. **Concrete placement:** a
  small "Club level" settings block at the top of the existing per-club admin
  page `app/admin/[clubId]/upload/page.tsx` (it already loads the club by id
  and is admin-gated) — a `level` `<select>` + conditional `province` input +
  Save, persisting via the admin (service-role) client (a small update to the
  existing `app/api/admin/upload/route.ts` or a sibling admin route — the plan
  decides the exact endpoint, admin-auth identical to the upload route).
- The admin promotes the Canadian Masters club to `level='national'` here
  after deploy.

## 6. Migration + remediation of the 4 broken lists

Operational sequence (documented; executed by the user):
1. Apply the two migrations; deploy the code.
2. Admin sets the Canadian Masters club `level='national'` (§5). Its existing
   relay national lists are already `scope='national'` from the data map.
3. Delete the 4 bad individual lists (`Men/Women {LCM,SCM} National`).
4. Re-bulk-upload the 4 `SNC/individual-csv/*_National.csv` into that club →
   scope is now `national` (from club level) → `age_group` + `record_club` +
   `province` populated → public age-band dividers + editor Age Group/Club/
   Prov columns appear.

The lost `age_group` on the old rows cannot be recovered without re-import
(it was never stored); re-import is the chosen, deterministic fix.

## Non-goals

- Regular clubs and their `scope='club'` lists: behaviour unchanged.
- Existing relay national lists: identical behaviour; the migration only
  renames their scope value (`national_provincial`→`national`).
- Provincial behaviour is fully implemented but **no provincial data exists
  yet**; the only import exercised now is national. No provincial prep
  script / CSVs in scope.
- The SNC prep scripts (national data) are unaffected — national parser
  behaviour is unchanged from today's `national_provincial`.
- **No filename-based scope anywhere after this.** `parseFilename` keeps only
  title/slug/course/gender/recordType.
- Pre-existing items already on record (readOnly `colSpan` off-by-one,
  `parseFilename` duplication across the two upload pages, embed widget not
  showing grouping, `is_world_record` blank in prep output) remain out of
  scope.

## Assumptions / notes

- Provincial records show the holder's club but not province; the provincial
  club carries its own province (`clubs.province`).
- `national` is behaviourally identical to the prior `national_provincial`
  (just renamed); this keeps the existing relay national lists working with
  no display change.
- This feature adds **no** dependency on un-applied prior migrations beyond
  what is already pending; it adds its own two migrations.
