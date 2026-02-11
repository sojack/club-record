import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            Club Record
          </div>
          <Link
            href="/login"
            className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            Club Manager Login
          </Link>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-6 text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
            Showcase Your Swim Club Records
          </h1>
          <p className="mb-10 text-xl text-gray-600 dark:text-gray-300">
            Create beautiful, shareable record boards for your swim club.
            Import records via CSV, manage multiple age groups, and share
            public links with your community.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl">
          <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
            <h2 className="mb-4 text-center text-xl font-semibold text-gray-900 dark:text-white">
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
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-5 py-4 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
                >
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">{club.abbr}</span>
                    <span className="ml-2 text-gray-600 dark:text-gray-400">{club.name}</span>
                  </div>
                  <span className="text-gray-400">&rarr;</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-md rounded-xl border border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-800 dark:bg-blue-900/30">
          <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            Club Manager?
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Sign up to create and manage record boards for your club.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-gray-300 px-6 py-2.5 font-medium text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Log In
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 text-3xl">📊</div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Easy CSV Import
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Upload your existing records via CSV. Automatic time format
              detection handles any format.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 text-3xl">🏊</div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Multiple Record Lists
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Create separate lists for age groups, genders, or course types
              (SCM, SCY, LCM).
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 text-3xl">🔗</div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Shareable Links
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Each record list gets a clean public URL to share with swimmers
              and families.
            </p>
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-4 py-10 text-center text-gray-500 dark:text-gray-400">
        <p>&copy; {new Date().getFullYear()} Club Record. All rights reserved.</p>
      </footer>
    </div>
  );
}
