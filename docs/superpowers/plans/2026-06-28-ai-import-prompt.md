# AI-Assisted Data Import Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clubs a copy-pasteable, list-aware AI prompt that converts their messy spreadsheet/PDF records into a CSV our existing importer accepts.

**Architecture:** One new pure function `generateAIImportPrompt(options)` (sibling to `generateCSVTemplate`) is the single source of truth for the prompt. Two surfaces consume it: an in-context "Prepare my data with AI" button in `CSVUploader`, and a public docs page at `/help/import-with-ai`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4.

## Global Constraints

- Path alias `@/*` maps to the `club-record/` root.
- All commands run from `club-record/`.
- No test framework is configured. Verification uses `npx tsx` throwaway scripts (deleted after), `npm run lint`, and `npm run build`.
- TypeScript strict mode — no `any`, no unused vars.
- The **authoritative contract** for which columns/values are valid is `parseRecordsCSV` in `lib/csv-parser.ts`, NOT `generateCSVTemplate`. Column rules: AgeGroup required when `scope !== "club"` OR `relay === true`; Club required when `scope !== "club"`; Province required when `scope === "national"`.
- Boolean flag columns accept `true`/`yes`/`1`/`x`; the prompt instructs AIs to use lowercase `x`.
- Existing styling idiom: panels use `rounded-lg border border-gray-200 p-4 dark:border-gray-700`; primary buttons `rounded-lg bg-blue-600 ... text-white hover:bg-blue-700`; text links `text-sm text-blue-600 hover:underline dark:text-blue-400`.
- Do not push to remote. Local commits only, no Co-Authored-By trailer.

---

### Task 1: `generateAIImportPrompt` pure function

**Files:**
- Create: `lib/ai-import-prompt.ts`
- Verify (throwaway): `scripts/_verify-ai-prompt.ts` (deleted in final step)

**Interfaces:**
- Consumes: nothing (pure, no imports).
- Produces: `generateAIImportPrompt(options?: AIImportPromptOptions): string` and `interface AIImportPromptOptions { relay?: boolean; scope?: "club" | "provincial" | "national"; ageGroups?: string[]; relayEvents?: string[]; }`

- [ ] **Step 1: Write the verification script first (acts as the failing test)**

Create `scripts/_verify-ai-prompt.ts`:

```ts
import { generateAIImportPrompt } from "../lib/ai-import-prompt";

const cases: Array<[string, Parameters<typeof generateAIImportPrompt>[0]]> = [
  ["individual-club", { scope: "club" }],
  ["individual-national", { scope: "national", ageGroups: ["11-12", "13-14"] }],
  ["relay-club", { relay: true, scope: "club", ageGroups: ["11-12"], relayEvents: ["4 X 50 Freestyle Relay"] }],
  ["relay-national", { relay: true, scope: "national", ageGroups: ["11-12"], relayEvents: ["4 X 50 Freestyle Relay"] }],
];

for (const [name, opts] of cases) {
  console.log(`\n===== ${name} =====`);
  console.log(generateAIImportPrompt(opts));
}
```

- [ ] **Step 2: Run it to confirm it fails (module does not exist yet)**

Run: `cd club-record && npx tsx scripts/_verify-ai-prompt.ts`
Expected: FAIL — `Cannot find module '../lib/ai-import-prompt'` (or a TS resolution error).

- [ ] **Step 3: Implement `lib/ai-import-prompt.ts`**

```ts
export interface AIImportPromptOptions {
  relay?: boolean;
  scope?: "club" | "provincial" | "national";
  /** Allowed standard age-group names. When provided, the prompt restricts the AI to these exact values. */
  ageGroups?: string[];
  /** Relay event names to steer event naming. */
  relayEvents?: string[];
}

/**
 * Build a copy-pasteable prompt that instructs any AI assistant to convert a
 * club's raw records into a CSV that `parseRecordsCSV` accepts. Column set and
 * rules follow the PARSER's contract (not `generateCSVTemplate`): AgeGroup when
 * non-club scope or relay; Club when non-club; Province when national.
 */
export function generateAIImportPrompt(options: AIImportPromptOptions = {}): string {
  const isRelay = options.relay === true;
  const scope = options.scope ?? "club";
  const carriesClub = scope !== "club";
  const carriesProvince = scope === "national";
  const hasAgeGroup = isRelay || carriesClub;

  const swimmerCols = isRelay ? ["Name1", "Name2", "Name3", "Name4"] : ["Swimmer"];
  const flagCols = isRelay
    ? ["is_World_Record", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_New"]
    : ["is_World_Record", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit", "is_New"];

  const columns = [
    "Event",
    ...(hasAgeGroup ? ["AgeGroup"] : []),
    "Time",
    ...swimmerCols,
    ...(carriesClub ? ["Club"] : []),
    ...(carriesProvince ? ["Province"] : []),
    "Date",
    "Location",
    ...flagCols,
    "Notes",
  ];

  const rules: string[] = [
    "Output ONLY CSV: a header row exactly matching the columns below, then one row per record. No commentary, no explanations, no markdown code fences.",
    `Columns, in this exact order: ${columns.join(", ")}.`,
    "Time format: use MM:SS.hh for times of one minute or more (e.g. 1:02.34) and SS.hh for under a minute (e.g. 24.56). Never write minutes as a decimal.",
    "Date format: YYYY, YYYY-MM, or YYYY-MM-DD. If the date is unknown, leave it blank — do not guess.",
    "Flag columns (the is_* columns): put a lowercase x when true, otherwise leave the cell blank.",
    "One row per record. Do not merge multiple records into a single row.",
    "Do not invent data. If a value is not present in the source, leave that cell blank.",
    "Use the Notes column for any assumptions, uncertainties, or rows you were unsure about, so a human can review them. This column is ignored on import.",
  ];

  if (isRelay) {
    rules.push("This is a RELAY list. Each record is a four-person team: put the four swimmer names in Name1, Name2, Name3, Name4. If you only have the team name, put it in Name1 and leave Name2-Name4 blank.");
  }
  if (hasAgeGroup) {
    if (options.ageGroups && options.ageGroups.length > 0) {
      rules.push(`Every record needs an AgeGroup. Use ONLY these exact values: ${options.ageGroups.join(", ")}. Do not invent other age groups.`);
    } else {
      rules.push("Every record needs an AgeGroup.");
    }
  }
  if (carriesClub) {
    rules.push("Every record needs a Club (the club or team that holds the record).");
  }
  if (carriesProvince) {
    rules.push("Every record needs a Province (the record holder's province).");
  }
  if (isRelay && options.relayEvents && options.relayEvents.length > 0) {
    rules.push(`Where possible, match relay event names to these: ${options.relayEvents.join(", ")}.`);
  }

  const numbered = rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n");

  return [
    "You are helping a swim club convert their existing records into a CSV file for upload to Club Record (clubrecord.ca).",
    "",
    "I will paste my records below. They may be messy — copied from a spreadsheet, a PDF, or a web page. Convert them into clean CSV following these rules:",
    "",
    numbered,
    "",
    "Use exactly this header row:",
    columns.join(","),
    "",
    "--- PASTE YOUR DATA BELOW ---",
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run the verification script and eyeball every case**

Run: `cd club-record && npx tsx scripts/_verify-ai-prompt.ts`
Expected: PASS (prints 4 prompts). Confirm by inspection:
- `individual-club`: header has NO AgeGroup/Club/Province; has `Swimmer`, `is_Split`, `is_RelaySplit`, trailing `Notes`.
- `individual-national`: header has `AgeGroup`, `Club`, `Province`; still `Swimmer`; lists allowed age groups `11-12, 13-14`.
- `relay-club`: header has `AgeGroup`, `Name1..Name4`, NO Club/Province, NO is_Split/is_RelaySplit; relay rule present.
- `relay-national`: header has `AgeGroup`, `Name1..Name4`, `Club`, `Province`.

- [ ] **Step 5: Lint**

Run: `cd club-record && npm run lint`
Expected: no errors for `lib/ai-import-prompt.ts`.

- [ ] **Step 6: Delete the throwaway script and commit**

```bash
cd club-record
rm scripts/_verify-ai-prompt.ts
git add lib/ai-import-prompt.ts
git commit -m "feat: generateAIImportPrompt for AI-assisted CSV prep"
```

---

### Task 2: "Prepare my data with AI" button in CSVUploader

**Files:**
- Modify: `components/CSVUploader.tsx`

**Interfaces:**
- Consumes: `generateAIImportPrompt` from Task 1; existing props `relay`, `scope`, `allowedAgeGroups`, `relayEvents`.
- Produces: no exported API change.

- [ ] **Step 1: Add the import**

In `components/CSVUploader.tsx`, below the existing csv-parser import (line 4), add:

```ts
import { generateAIImportPrompt } from "@/lib/ai-import-prompt";
```

- [ ] **Step 2: Add state for the panel and copy feedback**

After `const fileInputRef = useRef<HTMLInputElement>(null);` (line 24), add:

```ts
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
```

- [ ] **Step 3: Compute the prompt and add the copy handler**

After the `downloadTemplate` function (ends line 110), add:

```ts
  const aiPrompt = generateAIImportPrompt({
    relay,
    scope,
    ageGroups: allowedAgeGroups,
    relayEvents,
  });

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
```

- [ ] **Step 4: Replace the single template button with a button row + AI panel**

Replace this block (lines 150-156):

```tsx
      <button
        type="button"
        onClick={downloadTemplate}
        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        Download CSV template
      </button>
```

with:

```tsx
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          Download CSV template
        </button>
        <button
          type="button"
          onClick={() => setShowAIPrompt((v) => !v)}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ✨ Prepare my data with AI
        </button>
      </div>

      {showAIPrompt && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-white">
            Prepare your data with AI
          </h4>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Copy the prompt below.</li>
            <li>Paste it into your AI assistant (ChatGPT, Claude, Gemini…) along with your spreadsheet or PDF data.</li>
            <li>Save the CSV it returns and drop it in the box above.</li>
          </ol>
          <textarea
            readOnly
            value={aiPrompt}
            className="mt-3 h-48 w-full resize-y rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
          />
          <button
            type="button"
            onClick={copyPrompt}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            {copied ? "Copied!" : "Copy prompt"}
          </button>
        </div>
      )}
```

- [ ] **Step 5: Lint**

Run: `cd club-record && npm run lint`
Expected: no errors for `components/CSVUploader.tsx`.

- [ ] **Step 6: Build to confirm the component compiles**

Run: `cd club-record && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual smoke check (dev server)**

Run: `cd club-record && npm run dev`, open a record list's CSV import, click "✨ Prepare my data with AI". Confirm the panel expands, the prompt reflects the list's scope/relay, and "Copy prompt" shows "Copied!".

- [ ] **Step 8: Commit**

```bash
cd club-record
git add components/CSVUploader.tsx
git commit -m "feat: in-context AI data-prep prompt in CSVUploader"
```

---

### Task 3: Public docs page `/help/import-with-ai`

**Files:**
- Create: `app/help/import-with-ai/page.tsx`

**Interfaces:**
- Consumes: `generateAIImportPrompt` from Task 1.
- Produces: a public route at `/help/import-with-ai`.

- [ ] **Step 1: Create the page (client component for the copy button)**

Create `app/help/import-with-ai/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { generateAIImportPrompt } from "@/lib/ai-import-prompt";

export default function ImportWithAIPage() {
  const [copied, setCopied] = useState(false);
  const prompt = generateAIImportPrompt({ scope: "club" });

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Import your records with AI
      </h1>
      <p className="mt-4 text-gray-600 dark:text-gray-400">
        If your records live in a spreadsheet, a PDF, or an old web page, you can
        use any AI assistant (ChatGPT, Claude, Gemini, Copilot) to turn them into
        a CSV that Club Record imports cleanly. Here is how.
      </p>
      <ol className="mt-6 list-inside list-decimal space-y-2 text-gray-700 dark:text-gray-300">
        <li>Copy the prompt below.</li>
        <li>Paste it into your AI assistant, followed by your records (paste the spreadsheet rows or the text from your PDF/web page).</li>
        <li>The AI returns CSV text. Save it as a <code>.csv</code> file.</li>
        <li>Upload that file using <strong>Import CSV</strong> on your record list.</li>
      </ol>
      <p className="mt-6 text-sm text-gray-500 dark:text-gray-500">
        Tip: the importer also offers a “Prepare my data with AI” button that
        generates a prompt tailored to the exact list you are importing into
        (relay columns, age groups, province, etc.). The prompt below is the
        general club version.
      </p>
      <textarea
        readOnly
        value={prompt}
        className="mt-4 h-64 w-full resize-y rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
      />
      <button
        type="button"
        onClick={copyPrompt}
        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        {copied ? "Copied!" : "Copy prompt"}
      </button>
      <div className="mt-8">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Lint**

Run: `cd club-record && npm run lint`
Expected: no errors for the new page.

- [ ] **Step 3: Build and confirm the route exists**

Run: `cd club-record && npm run build`
Expected: build succeeds and output lists the `/help/import-with-ai` route.

- [ ] **Step 4: Manual smoke check**

Run: `cd club-record && npm run dev`, visit `/help/import-with-ai`. Confirm the page renders, shows the generic club prompt, and "Copy prompt" works.

- [ ] **Step 5: Commit**

```bash
cd club-record
git add "app/help/import-with-ai/page.tsx"
git commit -m "feat: public /help/import-with-ai docs page"
```

---

## Self-Review

**Spec coverage:**
- Pure function `generateAIImportPrompt` (single source of truth) → Task 1. ✓
- Scope-aware columns matching the parser contract → Task 1 (Global Constraints + Step 3). ✓
- Prompt content parts a–d (role framing, exact schema, domain rules, paste marker, Notes column) → Task 1 Step 3. ✓
- In-context button beside template link + inline panel + copy → Task 2. ✓
- Docs page `/help/import-with-ai` → Task 3. ✓
- Clipboard try/catch fallback → Tasks 2 & 3. ✓

**Placeholder scan:** No TBD/TODO; all steps contain full code and exact commands. ✓

**Type consistency:** `AIImportPromptOptions` defined in Task 1 is consumed with matching field names (`relay`, `scope`, `ageGroups`, `relayEvents`) in Tasks 2 and 3. `generateAIImportPrompt` signature identical across all references. ✓

**Note on deviation from spec:** The spec said "same logic as `generateCSVTemplate`." During grounding we found `generateCSVTemplate` omits AgeGroup/Club/Province for *individual* non-club lists, which `parseRecordsCSV` actually requires. The plan deliberately follows the parser (the binding contract) so generated CSVs validate. This is a correctness improvement, captured in Global Constraints.
