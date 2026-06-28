# AI-Assisted Data Import: "Prepare my data with AI" — Design

**Date:** 2026-06-28
**Status:** Approved (pending spec review)

## Problem

Clubs already have a flexible CSV importer (`parseRecordsCSV`), but the real
onboarding friction is upstream: getting a club's messy source data into a clean
CSV in the first place. Most clubs keep their records in **inconsistent
spreadsheets (Excel/Google Sheets)** or in **documents/PDFs/old web pages**; some
use Hy-Tek (out of scope here). The mechanical import is solved; the data-prep
step is not.

## Goal

Give clubs a **club-side, "bring your own AI"** path: a polished, copy-pasteable
prompt that a volunteer pastes into whatever AI they already use (ChatGPT,
Claude, Gemini, Copilot) along with their raw data. The AI returns a clean CSV
matching exactly what our importer expects, which the volunteer then uploads
through the existing importer.

This is the first of a possible sequence (A → B): it ships fast with zero new
infrastructure and zero AI cost to us, and lays groundwork for a future
platform-side "paste & we structure it" feature.

## Non-Goals

- Platform-side LLM extraction (option B) — future work.
- MCP server / direct AI write access (option C) — niche, deferred.
- Hy-Tek / Meet Manager adapters — separate effort.

## Architecture

A single source of truth feeds two surfaces.

### New pure function: `lib/ai-import-prompt.ts`

`generateAIImportPrompt(options)` — a sibling to `generateCSVTemplate()` taking
the **same options shape**:

```ts
interface AIImportPromptOptions {
  relay?: boolean;
  scope?: "club" | "provincial" | "national";
  ageGroups?: string[];      // allowed age groups (relay / provincial / national)
  relayEvents?: string[];    // relay event names
}
```

Returns a single copy-pasteable prompt **string**. Because it derives its column
list and rules from the same option logic as `generateCSVTemplate()`, the
prompt's schema can never drift from what `parseRecordsCSV` accepts.

Pure function, no dependencies, no side effects — trivially verifiable.

### Two consuming surfaces

1. **In-context button** in `components/CSVUploader.tsx`, beside the existing
   "Download CSV template" link. Generated per-list from the `relay`, `scope`,
   `allowedAgeGroups`, `relayEvents` props the component already receives.
2. **Docs page** at `app/help/import-with-ai/page.tsx` — public, static-rendered,
   renders a generic club-scope version plus a plain-language workflow
   walkthrough for discoverability and onboarding emails.

## Prompt Content

The generated prompt is a single block with these parts:

**a. Role + task framing.** Instructs the AI it is converting a swim club's
messy records into one specific CSV, and that it must output **only** CSV (header
row + data rows) — no commentary, no markdown code fences.

**b. Exact target schema.** The ordered column list *for this list*, from the
same logic as the template:
- Individual club: `Event,Time,Swimmer,Date,Location` + flag columns.
- Relay national (widest): `Event,AgeGroup,Time,Name1,Name2,Name3,Name4,Club,Province,Date,Location` + flag columns.
- (All scope variants in between mirror `generateCSVTemplate`.)
- Plus a trailing **`Notes`** column (see part c).

**c. Domain rules baked in** (the real value — encoding knowledge a volunteer's
AI wouldn't have):
- **Time format:** `MM:SS.hh` or `SS.hh` (e.g. `1:02.34`, `24.56`). Never
  minutes-as-decimal.
- **Date format:** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. Leave blank if unknown
  rather than guessing.
- **Boolean flag columns:** use `x` / blank (matches the parser's
  `true/yes/1/x`).
- **One row per record.** Relays = 4 swimmer names in `Name1`–`Name4`, or just
  the team name in `Name1`.
- **Scope rules:** provincial/national require `Club`; national requires
  `Province`.
- **Age groups** (relay / provincial / national): when `ageGroups` is provided,
  list the exact allowed values and instruct the AI to use only those.
- **Don't invent data:** leave unknown fields blank.
- **`Notes` column:** the AI records assumptions/uncertainties here. Safe to
  import — the parser only reads mapped columns and silently ignores `Notes`.

**d. Paste marker:** `--- PASTE YOUR DATA BELOW ---` so the volunteer knows
exactly where to drop their spreadsheet rows / PDF text.

## UI Detail

### In-context button (`CSVUploader.tsx`)

- "✨ Prepare my data with AI" button beside the existing template link.
- Clicking expands an **inline panel** in the same visual language as the
  existing preview/error panels (no new modal library), containing:
  - Three numbered steps: *1. Copy this prompt → 2. Paste it into your AI
    (ChatGPT, Claude, Gemini…) with your spreadsheet/PDF data → 3. Save the CSV
    it gives you and drop it above.*
  - A read-only box with the generated prompt and a **Copy** button using
    `navigator.clipboard`, with a "Copied!" toggle state.

### Docs page (`app/help/import-with-ai/page.tsx`)

- Public, static-rendered (SEO + linkable in onboarding emails).
- Plain-language workflow for a volunteer; shows a generic club-scope prompt with
  a copy button; notes the in-app version is tailored per list; links back to the
  dashboard.

## Error Handling / Testing

- Pure function → no runtime errors to handle.
- Clipboard copy wrapped in try/catch with a "select-and-copy manually"
  fallback.
- No test framework exists. Keep `generateAIImportPrompt` pure; during dev,
  manually verify the column set matches `generateCSVTemplate` across the matrix:
  individual-club, relay-club, relay-provincial, relay-national.

## Files Touched

- **New:** `lib/ai-import-prompt.ts`
- **New:** `app/help/import-with-ai/page.tsx`
- **Edit:** `components/CSVUploader.tsx` (button + inline panel + copy handler)
