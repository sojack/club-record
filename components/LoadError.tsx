"use client";

export default function LoadError({
  onRetry,
  message = "We couldn't load this right now. Please try again.",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div className="py-12 text-center">
      <p className="mb-4 text-gray-500 dark:text-gray-400">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
