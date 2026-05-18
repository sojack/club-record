import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/guard";
import type { Club } from "@/types/database";

interface ClubLayoutProps {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string }>;
}

export default async function ClubLayout({ children, params }: ClubLayoutProps) {
  const { clubSlug } = await params;
  const supabase = await createClient();

  const club = unwrap<Club>(
    await supabase.from("clubs").select("*").eq("slug", clubSlug).maybeSingle(),
    `clubs: slug=${clubSlug}`
  );

  if (!club) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            {club.logo_url && (
              <Image
                src={club.logo_url}
                alt={`${club.short_name} logo`}
                width={48}
                height={48}
                className="rounded-lg"
              />
            )}
            <div>
              <Link
                href={`/${club.slug}`}
                className="text-xl font-bold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
              >
                {club.full_name}
              </Link>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Records
              </p>
            </div>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-gray-200 bg-white py-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Powered by{" "}
            <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
              Club Record
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
