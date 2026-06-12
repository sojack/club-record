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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b-2 border-gold-400 bg-gradient-to-r from-blue-950 to-blue-900">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center gap-4">
            {club.logo_url && (
              <Image
                src={club.logo_url}
                alt={`${club.short_name} logo`}
                width={48}
                height={48}
                className="rounded-lg bg-white/95 p-0.5"
              />
            )}
            <div>
              <Link
                href={`/${club.slug}`}
                className="font-display text-2xl font-semibold tracking-tight text-white transition-colors hover:text-gold-200"
              >
                {club.full_name}
              </Link>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-gold-300">
                Records
              </p>
            </div>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-gray-200 bg-white py-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Powered by{" "}
            <Link href="/" className="font-medium text-blue-700 hover:text-gold-700 hover:underline dark:text-blue-400 dark:hover:text-gold-400">
              Club Record
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
