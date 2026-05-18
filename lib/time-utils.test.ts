import { describe, it, expect } from "vitest";
import { formatMsToTime } from "./time-utils";

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
