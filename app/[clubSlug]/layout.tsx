import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { Club } from "@/types/database";

interface ClubLayoutProps {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string }>;
}

export default async function ClubLayout({ children, params }: ClubLayoutProps) {
  const { clubSlug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const typedClub = club as Club;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            {typedClub.logo_url && (
              <Image
                src={typedClub.logo_url}
                alt={`${typedClub.short_name} logo`}
                width={48}
                height={48}
                className="rounded-lg"
              />
            )}
            <div>
              <Link
                href={`/${typedClub.slug}`}
                className="text-xl font-bold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
              >
                {typedClub.full_name}
              </Link>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Club Records
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
