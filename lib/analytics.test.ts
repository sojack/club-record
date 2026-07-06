import { describe, it, expect } from "vitest";
import {
  utcDay,
  buildDailySeries,
  countSince,
  topN,
  isBotUserAgent,
} from "./analytics";

const NOW = new Date("2026-07-06T15:00:00Z");

describe("utcDay", () => {
  it("returns the UTC day for an ISO timestamp", () => {
    expect(utcDay("2026-07-05T23:59:59Z")).toBe("2026-07-05");
    expect(utcDay("2026-07-06T00:00:01Z")).toBe("2026-07-06");
  });
});

describe("buildDailySeries", () => {
  it("fills the whole window with zero-count days", () => {
    const series = buildDailySeries([], 7, NOW);
    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ date: "2026-06-30", count: 0 });
    expect(series[6]).toEqual({ date: "2026-07-06", count: 0 });
  });

  it("buckets timestamps into their UTC day", () => {
    const series = buildDailySeries(
      ["2026-07-05T23:59:00Z", "2026-07-06T00:01:00Z", "2026-07-06T12:00:00Z"],
      3,
      NOW
    );
    expect(series).toEqual([
      { date: "2026-07-04", count: 0 },
      { date: "2026-07-05", count: 1 },
      { date: "2026-07-06", count: 2 },
    ]);
  });

  it("ignores timestamps outside the window", () => {
    const series = buildDailySeries(["2026-01-01T00:00:00Z"], 3, NOW);
    expect(series.every((d) => d.count === 0)).toBe(true);
  });
});

describe("countSince", () => {
  it("counts timestamps within the last N days", () => {
    const stamps = [
      "2026-07-06T10:00:00Z", // today
      "2026-07-01T10:00:00Z", // 5 days ago
      "2026-06-01T10:00:00Z", // ~35 days ago
    ];
    expect(countSince(stamps, 7, NOW)).toBe(2);
    expect(countSince(stamps, 30, NOW)).toBe(2);
    expect(countSince(stamps, 60, NOW)).toBe(3);
  });
});

describe("topN", () => {
  it("counts keys, sorts by count desc then key asc, and slices to n", () => {
    const keys = ["a", "b", "a", "c", "b", "a", null, undefined, ""];
    expect(topN(keys, 2)).toEqual([
      { key: "a", count: 3 },
      { key: "b", count: 2 },
    ]);
  });

  it("breaks count ties alphabetically", () => {
    expect(topN(["z", "m", "z", "m"], 5)).toEqual([
      { key: "m", count: 2 },
      { key: "z", count: 2 },
    ]);
  });
});

describe("isBotUserAgent", () => {
  it("treats a missing UA as a bot", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
  });

  it("detects common crawlers", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 HeadlessChrome/120.0")).toBe(true);
    expect(isBotUserAgent("Screaming Frog SEO Spider")).toBe(true);
  });

  it("passes normal browsers", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
      )
    ).toBe(false);
  });
});
