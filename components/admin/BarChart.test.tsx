// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import BarChart from "./BarChart";

const SERIES = [
  { date: "2026-07-04", count: 0 },
  { date: "2026-07-05", count: 2 },
  { date: "2026-07-06", count: 4 },
];

describe("BarChart", () => {
  it("renders one bar per day with a tooltip title", () => {
    const { container } = render(<BarChart series={SERIES} label="Views" />);
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(rects[1].querySelector("title")?.textContent).toBe("2026-07-05: 2");
  });

  it("is labelled for accessibility", () => {
    const { container } = render(<BarChart series={SERIES} label="Views" />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(
      "Views"
    );
  });

  it("renders an empty series without crashing", () => {
    const { container } = render(<BarChart series={[]} label="Views" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });
});
