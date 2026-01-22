"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Club } from "@/types/database";

export default function SettingsPage() {
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadClub();
  }, []);

  const loadClub = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("clubs")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setClub(data as Club);
        setShortName(data.short_name);
        setFullName(data.full_name);
        setLogoUrl(data.logo_url || "");
      }
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club) return;

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
      .eq("id", club.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Settings saved successfully!" });
      router.refresh();
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
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
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
              clubrecord.app/{club?.slug}
            </code>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              URL slug cannot be changed after creation
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
