import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            Club Record
          </div>
          <div className="space-x-4">
            <Link
              href="/login"
              className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Sign up
            </Link>
          </div>
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
          <div className="flex justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium text-white hover:bg-blue-700"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-gray-300 px-8 py-3 text-lg font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 text-3xl">📊</div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Easy CSV Import
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Upload your existing records via CSV. Automatic time format
              detection handles any format.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 text-3xl">🏊</div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Multiple Record Lists
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Create separate lists for age groups, genders, or course types
              (SCM, SCY, LCM).
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 text-3xl">🔗</div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Shareable Links
            </h3>
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
