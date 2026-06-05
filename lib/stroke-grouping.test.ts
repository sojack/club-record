import { describe, it, expect } from "vitest";
import { detectStroke } from "./stroke-grouping";

describe("detectStroke", () => {
  it("maps each stroke suffix to its full label and canonical order", () => {
    expect(detectStroke("50 Free")).toMatchObject({ label: "Freestyle", order: 1 });
    expect(detectStroke("100 Back")).toMatchObject({ label: "Backstroke", order: 2 });
    expect(detectStroke("50 Breast")).toMatchObject({ label: "Breaststroke", order: 3 });
    expect(detectStroke("200 Fly")).toMatchObject({ label: "Butterfly", order: 4 });
    expect(detectStroke("100 Butterfly")).toMatchObject({ label: "Butterfly", order: 4 });
    expect(detectStroke("200 IM")).toMatchObject({ label: "Individual Medley", order: 5 });
    expect(detectStroke("400 Medley")).toMatchObject({ label: "Individual Medley", order: 5 });
  });

  it("falls back to Other for unrecognized events", () => {
    expect(detectStroke("50 Kick")).toMatchObject({ key: "other", label: "Other", order: 6 });
    expect(detectStroke("")).toMatchObject({ key: "other", order: 6 });
  });
});
