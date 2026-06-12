"use client";

export default function ClubError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="mb-2 font-display text-2xl font-semibold text-gray-900 dark:text-white">
        Records temporarily unavailable
      </h1>
      <p className="mb-6 text-gray-500 dark:text-gray-400">
        We hit a problem loading these records. Please try again in a moment.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
