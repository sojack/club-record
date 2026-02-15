export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="p-4">{children}</div>
      <div className="border-t border-gray-200 px-4 py-3 text-center text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
        Powered by{" "}
        <a
          href="https://clubrecord.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Club Record
        </a>
      </div>
    </div>
  );
}
