"use client";

interface RecordFlagsProps {
  record: {
    is_national?: boolean;
    is_current_national?: boolean;
    is_provincial?: boolean;
    is_current_provincial?: boolean;
    is_split?: boolean;
    is_relay_split?: boolean;
    is_new?: boolean;
  };
  size?: "sm" | "md";
  showEmpty?: boolean;
}

export const FLAG_DEFINITIONS = [
  { key: "is_national" as const, label: "Canadian Record", icon: "🍁", color: "text-red-600" },
  { key: "is_current_national" as const, label: "Current Canadian Record", icon: "🇨🇦", color: "text-red-600" },
  { key: "is_provincial" as const, label: "Provincial Record", icon: "🏅", color: "text-amber-600" },
  { key: "is_current_provincial" as const, label: "Current Provincial", icon: "🥇", color: "text-amber-600" },
  { key: "is_split" as const, label: "Split Time", icon: "⏱️", color: "text-blue-600" },
  { key: "is_relay_split" as const, label: "Relay Split", icon: "🏊", color: "text-cyan-600" },
  { key: "is_new" as const, label: "New Record", icon: "⭐", color: "text-yellow-500" },
];

export default function RecordFlags({ record, size = "md", showEmpty = false }: RecordFlagsProps) {
  const activeFlags = FLAG_DEFINITIONS.filter((flag) => record[flag.key]);

  if (activeFlags.length === 0 && !showEmpty) {
    return null;
  }

  const sizeClass = size === "sm" ? "text-sm" : "text-base";

  return (
    <span className={`inline-flex gap-0.5 ${sizeClass}`}>
      {activeFlags.map((flag) => (
        <span key={flag.key} title={flag.label} className="cursor-default">
          {flag.icon}
        </span>
      ))}
    </span>
  );
}

export function RecordFlagsLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
      <span className="font-medium">Legend:</span>
      {FLAG_DEFINITIONS.map((flag) => (
        <span key={flag.key} className="flex items-center gap-1">
          <span>{flag.icon}</span>
          <span>{flag.label}</span>
        </span>
      ))}
    </div>
  );
}
