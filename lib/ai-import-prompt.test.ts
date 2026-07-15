import { describe, it, expect } from "vitest";
import { generateCombinedUpdatePrompt } from "./ai-import-prompt";
import { COMBINED_COLUMNS } from "./combined-csv";

describe("generateCombinedUpdatePrompt", () => {
  it("includes the combined header and instructs to preserve linkage columns and never delete", () => {
    const p = generateCombinedUpdatePrompt();
    expect(p).toContain([...COMBINED_COLUMNS].join(","));
    expect(p).toContain("Record ID");
    expect(p.toLowerCase()).toContain("never delete");
    expect(p).toContain("Superseded By");
  });
});
