"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewClubPage() {
  const router = useRouter();
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleShortNameChange = (value: string) => {
    setShortName(value);
    if (!slug || slug === generateSlug(shortName)) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to create a club");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("clubs").insert({
      user_id: user.id,
      short_name: shortName,
      full_name: fullName,
      slug: slug || generateSlug(shortName),
    });

    if (insertError) {
      if (insertError.code === "23505") {
        setError("A club with this URL slug already exists. Please choose a different one.");
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    // Refresh to update the clubs list in context
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          Add New Club
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Create another club to manage separate record boards.
        </p>
      </div>

      <div className="max-w-2xl rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/50 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="shortName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Short Name (e.g., RHAC)
            </label>
            <input
              id="shortName"
              type="text"
              value={shortName}
              onChange={(e) => handleShortNameChange(e.target.value)}
              required
              maxLength={10}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Full Name (e.g., Richmond Hill Aquatic Club)
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
              htmlFor="slug"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              URL Slug
            </label>
            <div className="mt-1 flex items-center">
              <span className="text-gray-500 dark:text-gray-400">clubrecord.app/</span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                required
                pattern="[a-z0-9-]+"
                className="ml-1 block flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
              This will be your public URL and cannot be changed later
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Club"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
