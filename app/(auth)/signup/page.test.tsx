// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { makeSupabase } from "@/lib/test/supabase-mock";
import SignupPage from "./page";

const push = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  push.mockClear();
  vi.mocked(useRouter).mockReturnValue({
    push,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
});

describe("SignupPage — orphaned-account recovery", () => {
  it("redirects to the dashboard (no raw DB error) when the club insert fails", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(
        { clubs: { data: null, error: { message: "duplicate key value", code: "23505" } } },
        { auth: { signUp: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } }, error: null }) } }
      ) as unknown as ReturnType<typeof createClient>
    );

    render(<SignupPage />);

    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await userEvent.type(screen.getByLabelText(/Short Name/), "UAC");
    await userEvent.type(screen.getByLabelText(/Full Name/), "Uptown Aquatic Club");
    await userEvent.click(screen.getByRole("button", { name: "Create Club" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText(/duplicate key value/)).not.toBeInTheDocument();
  });
});
