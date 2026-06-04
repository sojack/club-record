// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { makeSupabase } from "@/lib/test/supabase-mock";
import ResetPasswordPage from "./page";

function authStub(extra: Record<string, unknown>) {
  return {
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    ...extra,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
});

describe("ResetPasswordPage", () => {
  it("still renders the form (via the 3s fallback) when getSession rejects", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(createClient).mockReturnValue(
        makeSupabase({}, {
          auth: authStub({ getSession: vi.fn().mockRejectedValue(new Error("no session")) }),
        }) as unknown as ReturnType<typeof createClient>
      );

      render(<ResetPasswordPage />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByRole("button", { name: "Update password" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the success view when the password update succeeds", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({}, {
        auth: authStub({
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u-1" } } } }),
          updateUser: vi.fn().mockResolvedValue({ error: null }),
        }),
      }) as unknown as ReturnType<typeof createClient>
    );

    render(<ResetPasswordPage />);

    const pw = await screen.findByLabelText("New Password");
    await userEvent.type(pw, "secret1");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("shows a generic message when updateUser throws", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({}, {
        auth: authStub({
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u-1" } } } }),
          updateUser: vi.fn().mockRejectedValue(new Error("network down")),
        }),
      }) as unknown as ReturnType<typeof createClient>
    );

    render(<ResetPasswordPage />);

    const pw = await screen.findByLabelText("New Password");
    await userEvent.type(pw, "secret1");
    await userEvent.type(screen.getByLabelText("Confirm New Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
  });
});
