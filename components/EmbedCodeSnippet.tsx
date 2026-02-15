"use client";

import { useState } from "react";

interface EmbedCodeSnippetProps {
  clubSlug: string;
  listSlug: string;
  listTitle: string;
}

export default function EmbedCodeSnippet({
  clubSlug,
  listSlug,
  listTitle,
}: EmbedCodeSnippetProps) {
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedUrl = `${origin}/embed/${clubSlug}?list=${listSlug}`;
  const apiUrl = `${origin}/api/clubs/${clubSlug}/records?list=${listSlug}`;

  const iframeCode = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" title="${listTitle}"></iframe>`;

  const copyToClipboard = async (text: string, type: "embed" | "api") => {
    await navigator.clipboard.writeText(text);
    if (type === "embed") {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2000);
    } else {
      setCopiedApi(true);
      setTimeout(() => setCopiedApi(false), 2000);
    }
  };

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Embed &amp; API
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Share this record list on your club website or access it programmatically.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Embed Code
          </label>
          <div className="mt-1 flex gap-2">
            <code className="block flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
              {iframeCode}
            </code>
            <button
              onClick={() => copyToClipboard(iframeCode, "embed")}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {copiedEmbed ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API Endpoint
          </label>
          <div className="mt-1 flex gap-2">
            <code className="block flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
              GET {apiUrl}
            </code>
            <button
              onClick={() => copyToClipboard(apiUrl, "api")}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {copiedApi ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
