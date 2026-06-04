// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClub: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { makeSupabase } from "@/lib/test/supabase-mock";
import BulkUploadPage from "./page";

const club = { id: "club-1", slug: "uac", short_name: "UAC", full_name: "Uptown Aquatic Club", logo_url: null, level: "regular" };

function fileInput(): HTMLInputElement {
  return document.getElementById("csv-files") as HTMLInputElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(useClub).mockReturnValue({
    selectedClub: club, setSelectedClub: vi.fn(), isLoading: false,
    isOwner: true, isEditor: false, canEdit: true,
  } as unknown as ReturnType<typeof useClub>);
});

describe("BulkUploadPage", () => {
  it("previews the parsed record count after selecting a file", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>);
    render(<BulkUploadPage />);

    const file = new File(["Event,Time,Swimmer\n50 Free,24.56,John Smith"], "SCM-Male.csv", { type: "text/csv" });
    await userEvent.upload(fileInput(), file);

    expect(await screen.findByText("1 records")).toBeInTheDocument();
  });

  it("inserts the list + records on 'Create All Lists'", async () => {
    const sb = makeSupabase({
      record_lists: { data: { id: "new-list" }, error: null },
      records: { error: null },
    });
    vi.mocked(createClient).mockReturnValue(sb as unknown as ReturnType<typeof createClient>);
    render(<BulkUploadPage />);

    const file = new File(["Event,Time,Swimmer\n50 Free,24.56,John Smith"], "SCM-Male.csv", { type: "text/csv" });
    await userEvent.upload(fileInput(), file);
    await screen.findByText("1 records");

    await userEvent.click(screen.getByRole("button", { name: "Create All Lists" }));

    await waitFor(() => expect(sb.from).toHaveBeenCalledWith("record_lists"));
    expect(sb.from).toHaveBeenCalledWith("records");
  });

  it("disables upload when a file has no valid records", async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>);
    render(<BulkUploadPage />);

    const file = new File(["Event,Time,Swimmer\n,24.56,A"], "SCM-Male.csv", { type: "text/csv" });
    await userEvent.upload(fileInput(), file);

    expect(await screen.findByText("0 records")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create All Lists" })).toBeDisabled();
  });
});
