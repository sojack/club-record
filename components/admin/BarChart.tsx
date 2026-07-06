import type { DayCount } from "@/lib/analytics";

interface BarChartProps {
  series: DayCount[];
  label: string;
}

const WIDTH = 600;
const HEIGHT = 120;

export default function BarChart({ series, label }: BarChartProps) {
  const max = Math.max(1, ...series.map((d) => d.count));
  const barWidth = WIDTH / Math.max(1, series.length);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      className="h-24 w-full"
    >
      {series.map((d, i) => {
        const h = (d.count / max) * (HEIGHT - 4);
        return (
          <rect
            key={d.date}
            x={i * barWidth + 1}
            y={HEIGHT - h}
            width={Math.max(1, barWidth - 2)}
            height={h}
            className="fill-blue-500 dark:fill-blue-400"
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
