"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { parseRecordsCSV, CSVRecord } from "@/lib/csv-parser";
import type { Club } from "@/types/database";

interface ParsedFile {
  file: File;
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
  records: CSVRecord[];
  errors: string[];
}

function parseFilename(filename: string): {
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
} {
  const nameWithoutExt = filename.replace(/\.csv$/i, "");
  const title = nameWithoutExt.replace(/_/g, " ").trim();
  const slug = nameWithoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const upperName = nameWithoutExt.toUpperCase();
  let courseType: "LCM" | "SCM" | "SCY" = "LCM";
  if (upperName.includes("SCM")) {
    courseType = "SCM";
  } else if (upperName.includes("SCY")) {
    courseType = "SCY";
  } else if (upperName.includes("LCM")) {
    courseType = "LCM";
  }

  return { title, slug, courseType };
}

export default function AdminUploadPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const [clubId, setClubId] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<{ success: string[]; failed: string[] } | null>(null);

  useEffect(() => {
    params.then((p) => setClubId(p.clubId));
  }, [params]);

  useEffect(() => {
    if (clubId) {
      loadClub();
    }
  }, [clubId]);

  const loadClub = async () => {
    if (!clubId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();

    setClub(data as Club | null);
    setLoading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const parsed: ParsedFile[] = [];

    for (const file of Array.from(files)) {
      const content = await file.text();
      const { title, slug, courseType } = parseFilename(file.name);
      const { records, errors } = parseRecordsCSV(content);

      parsed.push({
        file,
        title,
        slug,
        courseType,
        records,
        errors,
      });
    }

    setParsedFiles(parsed);
    setResults(null);
  };

  const updateFileConfig = (index: number, updates: Partial<ParsedFile>) => {
    setParsedFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const handleUpload = async () => {
    if (!club || parsedFiles.length === 0) return;

    setUploading(true);
    setProgress({ current: 0, total: parsedFiles.length });

    const supabase = createClient();
    const success: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < parsedFiles.length; i++) {
      const file = parsedFiles[i];
      setProgress({ current: i + 1, total: parsedFiles.length });

      if (file.records.length === 0) {
        failed.push(`${file.title}: No valid records`);
        continue;
      }

      const { data: listData, error: listError } = await supabase
        .from("record_lists")
        .insert({
          club_id: club.id,
          title: file.title,
          slug: file.slug,
          course_type: file.courseType,
        })
        .select()
        .single();

      if (listError) {
        failed.push(`${file.title}: ${listError.message}`);
        continue;
      }

      const { error: recordsError } = await supabase.from("records").insert(
        file.records.map((r, idx) => ({
          record_list_id: listData.id,
          event_name: r.event_name,
          time_ms: r.time_ms,
          swimmer_name: r.swimmer_name,
          record_date: r.record_date,
          location: r.location,
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
    setUploading(false);
    setProgress(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Club not found
        </h2>
        <Link
          href="/admin"
          className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400"
        >
          Back to Admin
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Back to All Clubs
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          Upload for {club.full_name}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {club.short_name} &bull; /{club.slug}
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
              href={`/${club.slug}`}
              target="_blank"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              View Public Page
            </Link>
            <button
              onClick={() => {
                setParsedFiles([]);
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
    </div>
  );
}
