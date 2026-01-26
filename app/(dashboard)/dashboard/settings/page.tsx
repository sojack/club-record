"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";

export default function SettingsPage() {
  const router = useRouter();
  const { selectedClub, isLoading: clubLoading, isOwner } = useClub();
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (selectedClub) {
      setShortName(selectedClub.short_name);
      setFullName(selectedClub.full_name);
      setLogoUrl(selectedClub.logo_url || "");
    }
  }, [selectedClub]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClub || !isOwner) return;

    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("clubs")
      .update({
        short_name: shortName,
        full_name: fullName,
        logo_url: logoUrl || null,
      })
      .eq("id", selectedClub.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Settings saved successfully!" });
      router.refresh();
    }

    setSaving(false);
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
          Create a club to manage settings.
        </p>
        <Link
          href="/dashboard/clubs/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Create Club
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your club profile and preferences.
        </p>
      </div>

      {!isOwner && (
        <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
          Only the club owner can modify settings. You have read-only access.
        </div>
      )}

      <div className="max-w-2xl rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 className="mb-6 text-xl font-semibold text-gray-900 dark:text-white">
          Club Profile
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {message && (
            <div
              className={`rounded-lg p-4 text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                  : "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-400"
              }`}
            >
              {message.text}
            </div>
          )}

          <div>
            <label
              htmlFor="shortName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Short Name
            </label>
            <input
              id="shortName"
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              required
              maxLength={10}
              disabled={!isOwner}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Short abbreviation for your club (e.g., RHAC)
            </p>
          </div>

          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={!isOwner}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
            />
          </div>

          <div>
            <label
              htmlFor="logoUrl"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Logo URL (optional)
            </label>
            <input
              id="logoUrl"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              disabled={!isOwner}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Direct link to your club logo image
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Public URL
            </div>
            <code className="mt-1 block text-sm text-gray-900 dark:text-white">
              clubrecord.app/{selectedClub.slug}
            </code>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              URL slug cannot be changed after creation
            </p>
          </div>

          {isOwner && (
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
