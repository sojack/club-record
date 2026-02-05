"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewRecordListPage() {
  const router = useRouter();
  const { selectedClub, isLoading: clubLoading } = useClub();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [courseType, setCourseType] = useState<"LCM" | "SCM" | "SCY">("LCM");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClub) return;

    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("record_lists")
      .insert({
        club_id: selectedClub.id,
        title,
        slug,
        course_type: courseType,
        gender,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        setError("A record list with this slug already exists. Please choose a different URL.");
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    router.push(`/dashboard/records/${data.id}`);
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
          Select or create a club first.
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
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">
          Create Record List
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Create a new record list for an age group, gender, or category.
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
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
              placeholder="e.g., Girls 12 & Under"
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
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              required
              pattern="[a-z0-9-]+"
              placeholder="e.g., girls12"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <div>
            <label
              htmlFor="courseType"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Course Type
            </label>
            <select
              id="courseType"
              value={courseType}
              onChange={(e) => setCourseType(e.target.value as "LCM" | "SCM" | "SCY")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="LCM">Long Course Meters (LCM)</option>
              <option value="SCM">Short Course Meters (SCM)</option>
              <option value="SCY">Short Course Yards (SCY)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="gender"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Gender
            </label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as "male" | "female")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard/records"
              className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create List"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
