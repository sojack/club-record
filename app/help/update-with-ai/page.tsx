"use client";

import { useState } from "react";
import Link from "next/link";
import { generateCombinedUpdatePrompt } from "@/lib/ai-import-prompt";

export default function UpdateWithAIPage() {
  const [copied, setCopied] = useState(false);
  const prompt = generateCombinedUpdatePrompt();

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
        Update your records with AI
      </h1>
      <p className="mt-4 text-gray-600 dark:text-gray-400">
        Already have your records in Club Record and want to apply a batch of
        changes — a meet&rsquo;s worth of new records, corrections, or broken
        records? Export what you have, let any AI assistant (ChatGPT, Claude,
        Gemini, Copilot) apply the changes, and re-import. Your record history is
        preserved: when a faster time comes in, the old record is kept as history,
        not deleted.
      </p>

      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30">
        <h2 className="font-semibold text-amber-900 dark:text-amber-200">
          Keep a backup before you make changes
        </h2>
        <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
          Export your records first and save that file somewhere safe. If an
          update goes wrong, re-importing your backup restores the previous
          values. Re-importing never deletes records, so your history is always
          safe — but if a bad edit <em>added</em> rows you didn&rsquo;t want, you
          may need to remove those few by hand.
        </p>
      </div>

      <ol className="mt-6 list-inside list-decimal space-y-2 text-gray-700 dark:text-gray-300">
        <li>
          Go to <strong>Dashboard → Records</strong> and click{" "}
          <strong>Export CSV</strong>. Keep this file as your backup.
        </li>
        <li>Copy the prompt below.</li>
        <li>
          Paste it into your AI assistant, followed by the exported CSV and your
          new results.
        </li>
        <li>
          The AI returns the updated CSV. Save it as a <code>.csv</code> file.
        </li>
        <li>
          Re-import it via <strong>Bulk Upload → Combined CSV</strong>, review the
          preview, and confirm.
        </li>
      </ol>

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-500">
        New to Club Record and importing records for the first time? Use{" "}
        <Link
          href="/help/import-with-ai"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Import your records with AI
        </Link>{" "}
        instead — that&rsquo;s for records that live in a spreadsheet or PDF, not
        yet in Club Record.
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
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
