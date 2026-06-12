import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="text-center">
        <h1 className="font-display text-7xl font-semibold text-gold-400 dark:text-gold-500">404</h1>
        <h2 className="mt-4 font-display text-2xl font-semibold text-gray-900 dark:text-white">
          Page not found
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
