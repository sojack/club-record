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
        <li>Paste it into your AI assistant, followed by your records (paste the &quot;spreadsheet rows&quot; or the text from your &quot;PDF/web page&quot;).</li>
        <li>The AI returns CSV text. Save it as a <code>.csv</code> file.</li>
        <li>Upload that file using <strong>Import CSV</strong> on your record list.</li>
      </ol>
      <p className="mt-6 text-sm text-gray-500 dark:text-gray-500">
        Tip: the importer also offers a &quot;Prepare my data with AI&quot; button that
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
