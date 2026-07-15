import { describe, it, expect } from "vitest";
import { parseSplitsColumn, formatSplitsColumn, splitRows } from "./split-utils";

describe("parseSplitsColumn", () => {
  it("parses cumulative distance=time pairs into ms", () => {
    expect(parseSplitsColumn("50=29.10;100=1:02.78")).toEqual([
      { distance: 50, ms: 29100 },
      { distance: 100, ms: 62780 },
    ]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseSplitsColumn(" 50=29.10 ; 100=1:02.78 ")).toEqual([
      { distance: 50, ms: 29100 },
      { distance: 100, ms: 62780 },
    ]);
  });

  it("returns null for empty or missing input", () => {
    expect(parseSplitsColumn("")).toBeNull();
    expect(parseSplitsColumn(undefined)).toBeNull();
  });

  it("throws on a pair with no '='", () => {
    expect(() => parseSplitsColumn("50=29.10;garbage")).toThrow(/Malformed split/);
  });

  it("throws on a non-integer distance", () => {
    expect(() => parseSplitsColumn("x=29.10")).toThrow(/Invalid split distance/);
  });

  it("throws on an unparseable time", () => {
    expect(() => parseSplitsColumn("50=abc")).toThrow(/Invalid split time/);
  });
});

describe("splitRows", () => {
  it("computes cumulative + per-segment deltas", () => {
    expect(
      splitRows([
        { distance: 50, ms: 29100 },
        { distance: 100, ms: 62780 },
        { distance: 150, ms: 98500 },
      ])
    ).toEqual([
      { distance: 50, cumulativeMs: 29100, deltaMs: 29100 },
      { distance: 100, cumulativeMs: 62780, deltaMs: 33680 },
      { distance: 150, cumulativeMs: 98500, deltaMs: 35720 },
    ]);
  });

  it("handles a single split", () => {
    expect(splitRows([{ distance: 50, ms: 29100 }])).toEqual([
      { distance: 50, cumulativeMs: 29100, deltaMs: 29100 },
    ]);
  });
});

describe("formatSplitsColumn", () => {
  it("returns empty string for null", () => {
    expect(formatSplitsColumn(null)).toBe("");
  });

  it("serializes cumulative distance=time pairs", () => {
    expect(
      formatSplitsColumn([
        { distance: 50, ms: 29100 },
        { distance: 100, ms: 62780 },
      ])
    ).toBe("50=29.10;100=1:02.78");
  });

  it("round-trips through parseSplitsColumn", () => {
    const splits = [
      { distance: 50, ms: 29100 },
      { distance: 100, ms: 62780 },
    ];
    expect(parseSplitsColumn(formatSplitsColumn(splits))).toEqual(splits);
  });
});
