import { formatRelativeTime, formatExactDateTime } from "@/lib/date-utils";

export default function LastUpdated({ iso }: { iso: string | null }) {
  if (!iso) return null;
  return (
    <span
      className="text-sm text-gray-500 dark:text-gray-400"
      title={formatExactDateTime(iso)}
    >
      Last updated {formatRelativeTime(iso)}
    </span>
  );
}
