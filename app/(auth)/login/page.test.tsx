// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { makeSupabase } from "@/lib/test/supabase-mock";
import LoginPage from "./page";

const push = vi.fn();
const refresh = vi.fn();

function mockClient(signInWithPassword: ReturnType<typeof vi.fn>) {
  vi.mocked(createClient).mockReturnValue(
    makeSupabase({}, { auth: { signInWithPassword } }) as unknown as ReturnType<typeof createClient>
  );
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
  await userEvent.type(screen.getByLabelText("Password"), "secret1");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  push.mockClear();
  refresh.mockClear();
  vi.mocked(useRouter).mockReturnValue({ push, refresh } as unknown as ReturnType<typeof useRouter>);
});

describe("LoginPage", () => {
  it("navigates to the dashboard on success", async () => {
    mockClient(vi.fn().mockResolvedValue({ error: null }));
    render(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the returned error message and re-enables the button", async () => {
    mockClient(vi.fn().mockResolvedValue({ error: { message: "Invalid login credentials" } }));
    render(<LoginPage />);
    await fillAndSubmit();
    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a generic message and re-enables the button when the call throws", async () => {
    mockClient(vi.fn().mockRejectedValue(new Error("network down")));
    render(<LoginPage />);
    await fillAndSubmit();
    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });
});
