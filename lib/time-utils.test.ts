import { describe, it, expect } from "vitest";
import { formatMsToTime, parseTimeToMs, isValidTimeFormat } from "./time-utils";

describe("formatMsToTime", () => {
  it("formats sub-minute times as SS.hh", () => {
    expect(formatMsToTime(20910)).toBe("20.91");
  });

  it("formats minute+ times as M:SS.hh", () => {
    expect(formatMsToTime(102000)).toBe("1:42.00");
    expect(formatMsToTime(870670)).toBe("14:30.67");
  });

  it("handles the exact 60000ms boundary with no rounding", () => {
    expect(formatMsToTime(60000)).toBe("1:00.00");
  });

  it("returns empty string for zero/negative/non-finite", () => {
    expect(formatMsToTime(0)).toBe("");
    expect(formatMsToTime(-5)).toBe("");
    expect(formatMsToTime(NaN)).toBe("");
    expect(formatMsToTime(Infinity)).toBe("");
    expect(formatMsToTime(-Infinity)).toBe("");
  });

  // B1: 59999ms must roll into minutes, not produce "60.00"
  it("rolls a sub-minute rounding overflow into minutes (B1)", () => {
    expect(formatMsToTime(59999)).toBe("1:00.00");
  });

  // B2: hundredths overflow must carry into seconds/minutes, not "1:09.100"
  it("carries hundredths rounding overflow into seconds (B2)", () => {
    expect(formatMsToTime(69995)).toBe("1:10.00");
  });
});

describe("parseTimeToMs", () => {
  it("parses well-formed times", () => {
    expect(parseTimeToMs("20.91")).toBe(20910);
    expect(parseTimeToMs("1:42.00")).toBe(102000);
    expect(parseTimeToMs("14:30.67")).toBe(870670);
    expect(parseTimeToMs("1:02:03.45")).toBe(3723450);
  });

  it("accepts the malformed-but-valid MM:SS:hh form", () => {
    expect(parseTimeToMs("1:42:00")).toBe(102000);
  });

  it("returns 0 for empty/whitespace input", () => {
    expect(parseTimeToMs("")).toBe(0);
    expect(parseTimeToMs("   ")).toBe(0);
  });

  it("does not regress seconds-only values >= 100s", () => {
    expect(parseTimeToMs("100.91")).toBe(100910);
  });

  // B3: non-numeric input must be 0, never NaN
  it("returns 0 (not NaN) for non-numeric input (B3)", () => {
    expect(parseTimeToMs("abc")).toBe(0);
    expect(parseTimeToMs("1:ab.cd")).toBe(0);
  });

  // B3b: partial garbage must be rejected, not silently parsed
  it("returns 0 for partially numeric input (B3b)", () => {
    expect(parseTimeToMs("12x")).toBe(0);
  });
});

describe("isValidTimeFormat (current behavior, unchanged)", () => {
  it("accepts canonical formats", () => {
    expect(isValidTimeFormat("20.91")).toBe(true);
    expect(isValidTimeFormat("1:42.00")).toBe(true);
    expect(isValidTimeFormat("14:30.67")).toBe(true);
  });

  it("rejects malformed/empty/non-numeric", () => {
    expect(isValidTimeFormat("")).toBe(false);
    expect(isValidTimeFormat("abc")).toBe(false);
    expect(isValidTimeFormat("1:2")).toBe(false);
  });
});

describe("format(parse(x)) round-trip is stable", () => {
  it("is idempotent for canonical inputs", () => {
    expect(formatMsToTime(parseTimeToMs("20.91"))).toBe("20.91");
    expect(formatMsToTime(parseTimeToMs("1:42.00"))).toBe("1:42.00");
    expect(formatMsToTime(parseTimeToMs("14:30.67"))).toBe("14:30.67");
  });
});
