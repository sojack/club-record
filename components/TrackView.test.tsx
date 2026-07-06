// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import TrackView from "./TrackView";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("TrackView", () => {
  it("renders nothing", () => {
    navigator.sendBeacon = vi.fn(() => true);
    const { container } = render(<TrackView clubSlug="rhac" listSlug="scm" />);
    expect(container.innerHTML).toBe("");
  });

  it("sends one beacon with the page payload", async () => {
    const sendBeacon = vi.fn(() => true);
    navigator.sendBeacon = sendBeacon;
    render(<TrackView clubSlug="rhac" listSlug="scm-records" />);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/track");
    const payload = JSON.parse(await blob.text());
    expect(payload).toMatchObject({
      clubSlug: "rhac",
      listSlug: "scm-records",
    });
    expect(typeof payload.path).toBe("string");
  });

  it("does not send again on re-render", () => {
    const sendBeacon = vi.fn(() => true);
    navigator.sendBeacon = sendBeacon;
    const { rerender } = render(<TrackView clubSlug="rhac" listSlug={null} />);
    rerender(<TrackView clubSlug="rhac" listSlug={null} />);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it("falls back to fetch when sendBeacon is unavailable", () => {
    // @ts-expect-error simulate a browser without sendBeacon
    navigator.sendBeacon = undefined;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    render(<TrackView clubSlug="rhac" listSlug={null} />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("/api/track");
  });
});
