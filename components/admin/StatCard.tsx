interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

export default function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>
      ) : null}
    </div>
  );
}
