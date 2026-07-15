"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { parseRecordsCSV, CSVRecord } from "@/lib/csv-parser";
import { scopeForClubLevel, type ListScope } from "@/lib/scope";
import { normalizeListTitle } from "@/lib/list-title";
import {
  parseCombinedCsv,
  planReconciliation,
  type ListPlan,
  type CreateRow,
} from "@/lib/combined-csv";
import { generateCombinedUpdatePrompt } from "@/lib/ai-import-prompt";
import type { SwimRecord } from "@/types/database";

interface ParsedFile {
  file: File;
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  listScope: ListScope;
  records: CSVRecord[];
  errors: string[];
}

function parseFilename(filename: string): {
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
} {
  const nameWithoutExt = filename.replace(/\.csv$/i, "");
  const title = normalizeListTitle(nameWithoutExt);
  const slug = nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const upper = nameWithoutExt.toUpperCase();
  let courseType: "LCM" | "SCM" | "SCY" = "LCM";
  if (upper.includes("SCM")) courseType = "SCM";
  else if (upper.includes("SCY")) courseType = "SCY";
  else if (upper.includes("LCM")) courseType = "LCM";

  const lower = nameWithoutExt.toLowerCase();
  let gender: "male" | "female" | "mixed" | null = null;
  if (lower.includes("mixed")) gender = "mixed";
  else if (lower.includes("women") || lower.includes("female")) gender = "female";
  else if (lower.includes("men") || lower.includes("male")) gender = "male";

  const recordType: "individual" | "relay" = lower.includes("relay")
    ? "relay"
    : "individual";

  return { title, slug, courseType, gender, recordType };
}

export default function BulkUploadPage() {
  const { selectedClub, isLoading: clubLoading, canEdit } = useClub();
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<{ success: string[]; failed: string[] } | null>(null);
  const [mode, setMode] = useState<"per-list" | "combined">("per-list");
  const [plans, setPlans] = useState<ListPlan[] | null>(null);
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  const [showCombinedPrompt, setShowCombinedPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const parsed: ParsedFile[] = [];

      for (const file of Array.from(files)) {
        const content = await file.text();
        const { title, slug, courseType, gender, recordType } = parseFilename(file.name);
        const listScope = scopeForClubLevel(selectedClub?.level);
        const { records, errors } = parseRecordsCSV(content, {
          relay: recordType === "relay",
          scope: listScope,
        });

        parsed.push({
          file,
          title,
          slug,
          courseType,
          gender,
          recordType,
          listScope,
          records,
          errors,
        });
      }

      setParsedFiles(parsed);
      setResults(null);
    } catch (err) {
      console.error("[mutation] dashboard: parse upload files", err);
      setResults({ success: [], failed: ["Couldn't read the selected file(s). Please try again."] });
    }
  };

  const updateFileConfig = (index: number, updates: Partial<ParsedFile>) => {
    setParsedFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const handleUpload = async () => {
    if (!selectedClub || parsedFiles.length === 0) return;

    setUploading(true);
    setProgress({ current: 0, total: parsedFiles.length });

    const supabase = createClient();
    const success: string[] = [];
    const failed: string[] = [];

    try {
      for (let i = 0; i < parsedFiles.length; i++) {
        const file = parsedFiles[i];
        setProgress({ current: i + 1, total: parsedFiles.length });

        if (file.records.length === 0) {
          failed.push(`${file.title}: No valid records`);
          continue;
        }

        // Create record list
        const { data: listData, error: listError } = await supabase
          .from("record_lists")
          .insert({
            club_id: selectedClub.id,
            title: file.title,
            slug: file.slug,
            course_type: file.courseType,
            gender: file.gender,
            record_type: file.recordType,
            scope: file.listScope,
          })
          .select()
          .single();

        if (listError) {
          failed.push(`${file.title}: ${listError.message}`);
          continue;
        }

        // Insert records
        const { error: recordsError } = await supabase.from("records").insert(
          file.records.map((r, idx) => ({
            record_list_id: listData.id,
            event_name: r.event_name,
            time_ms: r.time_ms,
            swimmer_name: r.swimmer_name,
            swimmer_name_2: r.swimmer_name_2,
            swimmer_name_3: r.swimmer_name_3,
            swimmer_name_4: r.swimmer_name_4,
            age_group: r.age_group,
            record_club: r.record_club,
            province: r.province,
            record_date: r.record_date,
            location: r.location,
            split_times: r.split_times,
            sort_order: idx,
            is_national: r.is_national,
            is_current_national: r.is_current_national,
            is_provincial: r.is_provincial,
            is_current_provincial: r.is_current_provincial,
            is_split: r.is_split,
            is_relay_split: r.is_relay_split,
            is_new: r.is_new,
          }))
        );

        if (recordsError) {
          failed.push(`${file.title}: Records failed - ${recordsError.message}`);
        } else {
          success.push(`${file.title}: ${file.records.length} records`);
        }
      }

      setResults({ success, failed });
    } catch (e) {
      console.error("[mutation] dashboard: bulk upload", e);
      setResults({
        success,
        failed: [...failed, "Something went wrong. Please try again."],
      });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const combinedUpdatePrompt = generateCombinedUpdatePrompt();

  const copyCombinedPrompt = async () => {
    try {
      await navigator.clipboard.writeText(combinedUpdatePrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptCopied(false);
    }
  };

  const handleCombinedFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClub) return;
    const content = await file.text();
    const scope = scopeForClubLevel(selectedClub.level);
    const { groups, errors } = parseCombinedCsv(content, scope);
    setPlanErrors(errors);

    const supabase = createClient();
    const built: ListPlan[] = [];
    for (const group of groups) {
      let existingList: { id: string } | null = null;
      let existingRecords: SwimRecord[] = [];
      if (group.slug) {
        const { data: list, error: listError } = await supabase
          .from("record_lists")
          .select("id")
          .eq("club_id", selectedClub.id)
          .eq("slug", group.slug)
          .maybeSingle();
        if (listError) {
          setPlanErrors([
            ...errors,
            `Couldn't read existing records for "${group.title || group.slug}". Please try again.`,
          ]);
          setPlans(null);
          return;
        }
        if (list) {
          existingList = { id: list.id };
          const { data: recs, error: recsError } = await supabase
            .from("records")
            .select("*")
            .eq("record_list_id", list.id);
          if (recsError) {
            setPlanErrors([
              ...errors,
              `Couldn't read existing records for "${group.title || group.slug}". Please try again.`,
            ]);
            setPlans(null);
            return;
          }
          existingRecords = (recs as SwimRecord[]) ?? [];
        }
      }
      built.push(planReconciliation(group, existingList, existingRecords, scope));
    }
    setPlans(built);
    setResults(null);
  };

  const insertRecord = async (
    supabase: ReturnType<typeof createClient>,
    listId: string,
    fields: CreateRow["fields"],
    sortOrder: number,
    isCurrent: boolean,
    supersededBy: string | null
  ) => {
    const { data, error } = await supabase
      .from("records")
      .insert({
        record_list_id: listId,
        event_name: fields.event_name,
        time_ms: fields.time_ms,
        swimmer_name: fields.swimmer_name,
        swimmer_name_2: fields.swimmer_name_2,
        swimmer_name_3: fields.swimmer_name_3,
        swimmer_name_4: fields.swimmer_name_4,
        age_group: fields.age_group,
        record_club: fields.record_club,
        province: fields.province,
        record_date: fields.record_date,
        location: fields.location,
        split_times: fields.split_times,
        sort_order: sortOrder,
        is_national: fields.is_national,
        is_current_national: fields.is_current_national,
        is_provincial: fields.is_provincial,
        is_current_provincial: fields.is_current_provincial,
        is_split: fields.is_split,
        is_relay_split: fields.is_relay_split,
        is_new: fields.is_new,
        is_world_record: fields.is_world_record,
        is_current: isCurrent,
        superseded_by: supersededBy,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  };

  const executePlans = async () => {
    if (!selectedClub || !plans) return;
    setUploading(true);
    const supabase = createClient();
    const success: string[] = [];
    const failed: string[] = [];

    for (const plan of plans) {
      try {
        let listId: string;
        if (plan.action === "create") {
          const slug =
            plan.slug ||
            plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const { data: listData, error } = await supabase
            .from("record_lists")
            .insert({
              club_id: selectedClub.id,
              title: plan.title,
              slug,
              course_type: plan.courseType,
              gender: plan.gender,
              record_type: plan.recordType,
              scope: plan.scope,
            })
            .select()
            .single();
          if (error) throw new Error(error.message);
          listId = listData.id;

          // Insert current rows, mapping csv id -> new db id, then history rows.
          const idMap = new Map<string, string>();
          for (const cr of plan.createRows.filter((r) => r.isCurrent)) {
            const newId = await insertRecord(supabase, listId, cr.fields, cr.sortOrder, true, null);
            if (cr.csvRecordId) idMap.set(cr.csvRecordId, newId);
          }
          for (const cr of plan.createRows.filter((r) => !r.isCurrent)) {
            const parentId = cr.supersededByCsvId ? idMap.get(cr.supersededByCsvId) ?? null : null;
            await insertRecord(supabase, listId, cr.fields, cr.sortOrder, false, parentId);
          }
        } else {
          // action === "update": re-resolve the list id by slug to apply ops.
          const { data: list } = await supabase
            .from("record_lists")
            .select("id")
            .eq("club_id", selectedClub.id)
            .eq("slug", plan.slug)
            .maybeSingle();
          if (!list) throw new Error("list vanished");
          listId = list.id;

          for (const op of plan.ops) {
            if (op.kind === "update") {
              const { error } = await supabase.from("records").update({
                event_name: op.fields.event_name, time_ms: op.fields.time_ms,
                swimmer_name: op.fields.swimmer_name, swimmer_name_2: op.fields.swimmer_name_2,
                swimmer_name_3: op.fields.swimmer_name_3, swimmer_name_4: op.fields.swimmer_name_4,
                age_group: op.fields.age_group, record_club: op.fields.record_club,
                province: op.fields.province, record_date: op.fields.record_date,
                location: op.fields.location, split_times: op.fields.split_times,
                is_national: op.fields.is_national, is_current_national: op.fields.is_current_national,
                is_provincial: op.fields.is_provincial, is_current_provincial: op.fields.is_current_provincial,
                is_split: op.fields.is_split, is_relay_split: op.fields.is_relay_split,
                is_new: op.fields.is_new, is_world_record: op.fields.is_world_record,
              }).eq("id", op.id);
              if (error) throw new Error(error.message);
            } else if (op.kind === "insert") {
              await insertRecord(supabase, listId, op.fields, op.sortOrder, true, null);
            } else {
              // supersede: insert new current, mark old, re-parent ancestors
              const newId = await insertRecord(supabase, listId, op.fields, op.sortOrder, true, null);
              const { error: e1 } = await supabase.from("records")
                .update({ superseded_by: newId, is_current: false }).eq("id", op.oldId);
              if (e1) throw new Error(e1.message);
              const { error: e2 } = await supabase.from("records")
                .update({ superseded_by: newId }).eq("superseded_by", op.oldId);
              if (e2) throw new Error(e2.message);
            }
          }
        }
        success.push(`${plan.title}: ${plan.action === "create" ? "created" : "updated"}`);
      } catch (err) {
        failed.push(`${plan.title}: ${(err as Error).message}`);
      }
    }

    setResults({ success, failed });
    setPlans(null);
    setUploading(false);
  };

  const planCounts = (plan: ListPlan) => {
    if (plan.action === "create") {
      return {
        updates: 0,
        newRecords: plan.createRows.filter((r) => r.isCurrent).length,
        supersessions: 0,
      };
    }
    return {
      updates: plan.ops.filter((o) => o.kind === "update").length,
      newRecords: plan.ops.filter((o) => o.kind === "insert").length,
      supersessions: plan.ops.filter((o) => o.kind === "supersede").length,
    };
  };

  if (clubLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!selectedClub) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          No club selected
        </h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Select a club first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard/records"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Back to Record Lists
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold text-gray-900 dark:text-white">
          Bulk Upload
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Upload multiple CSV files to create record lists automatically. Filenames become list titles.
        </p>
      </div>

      {/* Results */}
      {results && (
        <div className="mb-6 space-y-4">
          {results.success.length > 0 && (
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/50">
              <h3 className="font-medium text-green-800 dark:text-green-200">
                Successfully created ({results.success.length})
              </h3>
              <ul className="mt-2 list-inside list-disc text-sm text-green-700 dark:text-green-300">
                {results.success.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {results.failed.length > 0 && (
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/50">
              <h3 className="font-medium text-red-800 dark:text-red-200">
                Failed ({results.failed.length})
              </h3>
              <ul className="mt-2 list-inside list-disc text-sm text-red-700 dark:text-red-300">
                {results.failed.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-3">
            <Link
              href="/dashboard/records"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              View Record Lists
            </Link>
            <button
              onClick={() => {
                setParsedFiles([]);
                setPlans(null);
                setPlanErrors([]);
                setResults(null);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Upload More
            </button>
          </div>
        </div>
      )}

      {!results && (
        <>
          {/* Mode toggle */}
          <div className="mb-6 inline-flex rounded-lg border border-gray-300 p-1 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setMode("per-list")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                mode === "per-list"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              Files per list
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setMode("combined")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === "combined"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                Combined CSV
              </button>
            )}
          </div>
        </>
      )}

      {!results && mode === "per-list" && (
        <>
          {/* File Input */}
          <div className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Select CSV Files
            </h2>
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
              <input
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="csv-files"
              />
              <label
                htmlFor="csv-files"
                className="cursor-pointer text-gray-600 dark:text-gray-400"
              >
                <div className="text-4xl">📁</div>
                <p className="mt-2 font-medium">Click to select CSV files</p>
                <p className="mt-1 text-sm">
                  Select multiple files at once. Filenames will be used as list titles.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Example: SCM_Female_18-24.csv → &quot;SCM Female 18-24&quot;
                </p>
              </label>
            </div>
          </div>

          {/* Parsed Files Preview */}
          {parsedFiles.length > 0 && (
            <div className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Preview ({parsedFiles.length} files)
              </h2>
              <div className="space-y-4">
                {parsedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                          {file.file.name}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                              Title
                            </label>
                            <input
                              type="text"
                              value={file.title}
                              onChange={(e) =>
                                updateFileConfig(index, { title: e.target.value })
                              }
                              className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            />
                          </div>
                          <div className="w-32">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                              Course
                            </label>
                            <select
                              value={file.courseType}
                              onChange={(e) =>
                                updateFileConfig(index, {
                                  courseType: e.target.value as "LCM" | "SCM" | "SCY",
                                })
                              }
                              className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                              <option value="LCM">LCM</option>
                              <option value="SCM">SCM</option>
                              <option value="SCY">SCY</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                            file.records.length > 0
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                          }`}
                        >
                          {file.records.length} records
                        </div>
                        {file.errors.length > 0 && (
                          <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                            {file.errors.length} warning(s)
                          </div>
                        )}
                      </div>
                    </div>
                    {file.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                          Show warnings
                        </summary>
                        <ul className="mt-1 list-inside list-disc text-xs text-amber-600 dark:text-amber-400">
                          {file.errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {file.errors.length > 5 && (
                            <li>...and {file.errors.length - 5} more</li>
                          )}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
              </div>

              {/* Upload Button */}
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Total: {parsedFiles.reduce((acc, f) => acc + f.records.length, 0)} records
                  across {parsedFiles.length} lists
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setParsedFiles([])}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading || parsedFiles.every((f) => f.records.length === 0)}
                    className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading
                      ? `Uploading ${progress?.current}/${progress?.total}...`
                      : "Create All Lists"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!results && mode === "combined" && !canEdit && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You need editor access to import records.
          </p>
        </div>
      )}

      {!results && mode === "combined" && canEdit && (
        <>
          {/* Combined File Input */}
          <div className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Select Combined CSV
            </h2>
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
              <input
                type="file"
                accept=".csv"
                onChange={handleCombinedFile}
                className="hidden"
                id="combined-csv-file"
              />
              <label
                htmlFor="combined-csv-file"
                className="cursor-pointer text-gray-600 dark:text-gray-400"
              >
                <div className="text-4xl">📄</div>
                <p className="mt-2 font-medium">Click to select a combined CSV</p>
                <p className="mt-1 text-sm">
                  A single file with every list, exported from this page. We&rsquo;ll match
                  records by Record ID and only add a new record when a faster time appears
                  in a slot &mdash; nothing is ever deleted.
                </p>
              </label>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowCombinedPrompt((v) => !v)}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                ✨ Prepare update with AI
              </button>
            </div>
            {showCombinedPrompt && (
              <div className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  Update your records with AI
                </h4>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>Export your records (the combined CSV) from this club.</li>
                  <li>Copy this prompt.</li>
                  <li>Paste it into your AI assistant (ChatGPT, Claude, Gemini…), along with your exported CSV and your new results.</li>
                  <li>Save the CSV it returns.</li>
                  <li>Upload it here.</li>
                </ol>
                <textarea
                  readOnly
                  value={combinedUpdatePrompt}
                  className="mt-3 h-48 w-full resize-y rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={copyCombinedPrompt}
                  className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  {promptCopied ? "Copied!" : "Copy prompt"}
                </button>
              </div>
            )}
          </div>

          {/* Plan Preview */}
          {planErrors.length > 0 && (
            <div className="mb-6 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/50">
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                Rows skipped while parsing ({planErrors.length})
              </h3>
              <ul className="mt-2 list-inside list-disc text-sm text-amber-700 dark:text-amber-300">
                {planErrors.slice(0, 10).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {planErrors.length > 10 && <li>...and {planErrors.length - 10} more</li>}
              </ul>
            </div>
          )}

          {plans && plans.length > 0 && (
            <div className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                Preview ({plans.length} list{plans.length === 1 ? "" : "s"})
              </h2>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Existing records not in this file are kept.
              </p>
              <div className="space-y-4">
                {plans.map((plan, index) => {
                  const counts = planCounts(plan);
                  return (
                    <div
                      key={index}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {plan.title}
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {plan.courseType} &middot; {plan.recordType}
                          </div>
                        </div>
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                            plan.action === "create"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {plan.action === "create" ? "Create" : "Update"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>{counts.updates} update{counts.updates === 1 ? "" : "s"}</span>
                        <span>{counts.newRecords} new record{counts.newRecords === 1 ? "" : "s"}</span>
                        <span>{counts.supersessions} supersession{counts.supersessions === 1 ? "" : "s"}</span>
                      </div>
                      {plan.flags.length > 0 && (
                        <ul className="mt-3 list-inside list-disc text-xs text-amber-600 dark:text-amber-400">
                          {plan.flags.map((flag, i) => (
                            <li key={i}>{flag}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Confirm Button */}
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No existing records are deleted &mdash; superseded records are kept as history.
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPlans(null);
                      setPlanErrors([]);
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Clear
                  </button>
                  <button
                    onClick={executePlans}
                    disabled={uploading}
                    className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploading ? "Importing..." : "Confirm & import"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Help */}
      <div className="rounded-xl bg-gray-100 p-6 dark:bg-gray-800/50">
        <h3 className="font-medium text-gray-900 dark:text-white">Tips</h3>
        {mode === "per-list" || !canEdit ? (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Filenames are converted to list titles (underscores become spaces, hyphens preserved)</li>
            <li>Course type (SCM, LCM, SCY) is auto-detected from filename</li>
            <li>You can edit titles and course types before uploading</li>
            <li>Each CSV needs: Event, Time, Swimmer columns (Date, Location optional)</li>
          </ul>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Use the combined CSV exported from this club&rsquo;s record lists</li>
            <li>Rows with a matching Record ID update that record in place</li>
            <li>A faster time in an existing slot supersedes the old record &mdash; it becomes history, not deleted</li>
            <li>Lists that no longer exist are recreated, including their history chain</li>
          </ul>
        )}
      </div>
    </div>
  );
}
