import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Hero on deep water */}
      <div className="bg-gradient-to-b from-blue-950 via-blue-900 to-blue-800 text-white">
        <header className="container mx-auto px-4 py-6">
          <nav className="flex items-center justify-between">
            <div className="font-display text-2xl font-semibold tracking-tight text-white">
              Club Record
            </div>
            <Link
              href="/login"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:border-gold-300/60 hover:text-white"
            >
              Club Manager Login
            </Link>
          </nav>
        </header>

        <main className="container mx-auto px-4 pb-24 pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-gold-300">
              Every record. Beautifully kept.
            </p>
            <h1 className="mb-6 font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Showcase Your Swim Club Records
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-blue-100">
              Create beautiful, shareable record boards for your swim club.
              Import records via CSV or let AI prepare your data, manage
              multiple age groups, and share public links with your community.
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-2xl">
            <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
              <h2 className="mb-1 text-center font-display text-2xl font-semibold text-gray-900 dark:text-white">
                Find Your Club
              </h2>
              <p className="mb-6 text-center text-gray-600 dark:text-gray-400">
                Swimmers, parents, and fans — go directly to your club&apos;s records page.
              </p>
              <div className="space-y-3">
                {[
                  { slug: "rhac", abbr: "RHAC", name: "Richmond Hill Aquatic Club" },
                  { slug: "auro", abbr: "AURO", name: "Aurora Masterducks" },
                  { slug: "eomac", abbr: "EOMAC", name: "Etobicoke Masters Swimming" },
                ].map((club) => (
                  <Link
                    key={club.slug}
                    href={`/${club.slug}`}
                    className="group flex items-center justify-between rounded-xl border border-gray-200 px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-sm dark:border-gray-700 dark:hover:border-gold-500"
                  >
                    <div>
                      <span className="font-semibold text-blue-800 dark:text-blue-300">{club.abbr}</span>
                      <span className="ml-2 text-gray-600 dark:text-gray-400">{club.name}</span>
                    </div>
                    <span className="text-gray-400 transition-colors group-hover:text-gold-600 dark:group-hover:text-gold-400">&rarr;</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      <main className="container mx-auto px-4">
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-gold-200 bg-gold-50 p-8 text-center shadow-sm dark:border-gold-900 dark:bg-gold-950/40">
          <h2 className="mb-2 font-display text-xl font-semibold text-gray-900 dark:text-white">
            Club Manager?
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Sign up to create and manage record boards for your club.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 transition-colors hover:border-gray-400 dark:border-gray-600 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Log In
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-8 pb-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
            <div className="mb-4 text-3xl">📊</div>
            <h2 className="mb-2 font-display text-lg font-semibold text-gray-900 dark:text-white">
              Easy CSV Import
            </h2>
            <p className="leading-relaxed text-gray-600 dark:text-gray-400">
              Upload a CSV and we handle the rest — automatic time-format
              detection, flexible columns, and per-row error checks.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
            <div className="mb-4 text-3xl">🏊</div>
            <h2 className="mb-2 font-display text-lg font-semibold text-gray-900 dark:text-white">
              Multiple Record Lists
            </h2>
            <p className="leading-relaxed text-gray-600 dark:text-gray-400">
              Create separate lists for age groups, genders, or course types
              (SCM, SCY, LCM).
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
            <div className="mb-4 text-3xl">🔗</div>
            <h2 className="mb-2 font-display text-lg font-semibold text-gray-900 dark:text-white">
              Shareable Links
            </h2>
            <p className="leading-relaxed text-gray-600 dark:text-gray-400">
              Each record list gets a clean public URL to share with swimmers
              and families.
            </p>
          </div>
          <Link
            href="/help/import-with-ai"
            className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900 dark:ring-white/10"
          >
            <div className="mb-4 text-3xl">✨</div>
            <h2 className="mb-2 font-display text-lg font-semibold text-gray-900 dark:text-white">
              AI-Assisted Import
            </h2>
            <p className="leading-relaxed text-gray-600 dark:text-gray-400">
              Already use AI to manage your data? Get a ready-made prompt that
              turns your spreadsheets or PDFs into a clean, importable file.
            </p>
            <span className="mt-3 inline-block text-sm font-medium text-blue-700 group-hover:text-gold-700 group-hover:underline dark:text-blue-400 dark:group-hover:text-gold-400">
              Learn how &rarr;
            </span>
          </Link>
          <Link
            href="/help/update-with-ai"
            className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900 dark:ring-white/10"
          >
            <div className="mb-4 text-3xl">🔄</div>
            <h2 className="mb-2 font-display text-lg font-semibold text-gray-900 dark:text-white">
              AI-Assisted Update
            </h2>
            <p className="leading-relaxed text-gray-600 dark:text-gray-400">
              Records already in Club Record? Export them, let AI apply new
              results and corrections, then re-import &mdash; history and all.
            </p>
            <span className="mt-3 inline-block text-sm font-medium text-blue-700 group-hover:text-gold-700 group-hover:underline dark:text-blue-400 dark:group-hover:text-gold-400">
              Learn how &rarr;
            </span>
          </Link>
        </div>
      </main>

      <footer className="container mx-auto px-4 py-10 text-center text-gray-500 dark:text-gray-400">
        <p>&copy; {new Date().getFullYear()} Club Record. All rights reserved.</p>
        <p className="mt-2">
          Designed by{" "}
          <a
            href="https://jsdesigns.ca"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 hover:text-gold-700 hover:underline dark:text-blue-400 dark:hover:text-gold-400"
          >
            JS Designs
          </a>
        </p>
      </footer>
    </div>
  );
}
