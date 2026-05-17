"use client";

import { useState, useRef } from "react";
import { parseRecordsCSV, generateCSVTemplate, type CSVRecord } from "@/lib/csv-parser";

interface CSVUploaderProps {
  onUpload: (records: CSVRecord[]) => void;
  relay?: boolean;
  scope?: "club" | "national_provincial";
  allowedAgeGroups?: string[];
  relayEvents?: string[];
}

export default function CSVUploader({
  onUpload,
  relay = false,
  scope = "club",
  allowedAgeGroups,
  relayEvents,
}: CSVUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<CSVRecord[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setErrors([]);
    setPreview(null);

    if (!file.name.endsWith(".csv")) {
      setErrors(["Please upload a CSV file"]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const { records, errors: parseErrors } = parseRecordsCSV(content, {
        relay,
        scope,
        allowedAgeGroups,
      });

      if (parseErrors.length > 0) {
        setErrors(parseErrors);
      }

      if (records.length > 0) {
        setPreview(records);
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleConfirm = () => {
    if (preview) {
      onUpload(preview);
      setPreview(null);
      setErrors([]);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const content = generateCSVTemplate(
      relay
        ? { relay: true, scope, ageGroups: allowedAgeGroups, relayEvents }
        : {}
    );
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = relay ? "relay_records_template.csv" : "records_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-300 dark:border-gray-600"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <div className="text-4xl">📄</div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Drag and drop a CSV file here, or click to browse
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          {relay
            ? scope === "national_provincial"
              ? "Expected columns: Event, AgeGroup, Time, Name1-Name4, Club, Province, Date, Location"
              : "Expected columns: Event, AgeGroup, Time, Name1-Name4, Date, Location"
            : "Expected columns: Event, Time, Swimmer, Date (optional), Location (optional)"}
        </p>
      </div>

      <button
        type="button"
        onClick={downloadTemplate}
        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        Download CSV template
      </button>

      {errors.length > 0 && (
        <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <h4 className="font-medium text-red-700 dark:text-red-400">
            Import Errors
          </h4>
          <ul className="mt-2 list-inside list-disc text-sm text-red-600 dark:text-red-300">
            {errors.slice(0, 5).map((error, i) => (
              <li key={i}>{error}</li>
            ))}
            {errors.length > 5 && (
              <li>...and {errors.length - 5} more errors</li>
            )}
          </ul>
        </div>
      )}

      {preview && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-white">
            Preview ({preview.length} records)
          </h4>
          <div className="mt-2 max-h-60 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Event</th>
                  {relay && (
                    <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Age Group</th>
                  )}
                  <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Time</th>
                  <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">
                    {relay ? "Swimmers" : "Swimmer"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((record, i) => (
                  <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{record.event_name}</td>
                    {relay && (
                      <td className="px-3 py-2 text-gray-900 dark:text-white">{record.age_group}</td>
                    )}
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{record.time_ms}ms</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">
                      {relay
                        ? [record.swimmer_name, record.swimmer_name_2, record.swimmer_name_3, record.swimmer_name_4].filter(Boolean).join(", ")
                        : record.swimmer_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 10 && (
              <p className="mt-2 text-center text-sm text-gray-500">
                ...and {preview.length - 10} more records
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700"
            >
              Import {preview.length} Records
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
