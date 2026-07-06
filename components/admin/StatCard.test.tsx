// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "./StatCard";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Total users" value={42} />);
    expect(screen.getByText("Total users")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders the optional sub-text", () => {
    render(<StatCard label="Signups" value={7} sub="+3 this week" />);
    expect(screen.getByText("+3 this week")).toBeTruthy();
  });

  it("omits sub-text when not provided", () => {
    const { container } = render(<StatCard label="Clubs" value={5} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });
});
