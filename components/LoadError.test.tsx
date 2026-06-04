// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoadError from "./LoadError";

describe("LoadError", () => {
  it("renders the default message and a retry button", () => {
    render(<LoadError onRetry={() => {}} />);
    expect(
      screen.getByText("We couldn't load this right now. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders a custom message when provided", () => {
    render(<LoadError onRetry={() => {}} message="Custom failure text" />);
    expect(screen.getByText("Custom failure text")).toBeInTheDocument();
  });

  it("calls onRetry when the button is clicked", async () => {
    const onRetry = vi.fn();
    render(<LoadError onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
