import { describe, it, expect, vi, afterEach } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { unwrap, DataAccessError, dbErrorToResponse } from "./guard";

const pgError = {
  message: "boom",
  details: "",
  hint: "",
  code: "XX000",
  name: "PostgrestError",
} as unknown as PostgrestError;

afterEach(() => vi.restoreAllMocks());

describe("unwrap", () => {
  it("returns data on success without logging or throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      expect(unwrap({ data: { id: 1 }, error: null }, "ctx")).toEqual({ id: 1 })
    ).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null on a maybeSingle miss (no rows, no error)", () => {
    expect(unwrap({ data: null, error: null }, "ctx")).toBeNull();
  });

  it("returns the array (not null) for a successful list read", () => {
    expect(unwrap<number[]>({ data: [], error: null }, "ctx")).toEqual([]);
    expect(unwrap<number[]>({ data: [1, 2], error: null }, "ctx")).toEqual([
      1, 2,
    ]);
  });

  it("logs and throws DataAccessError when error is set", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      unwrap({ data: null, error: pgError }, "clubs: by slug")
    ).toThrow(DataAccessError);
    expect(spy).toHaveBeenCalledWith("[data-access] clubs: by slug", pgError);
  });
});

describe("DataAccessError", () => {
  it("carries name, context, and cause", () => {
    const err = new DataAccessError("clubs: by slug", pgError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DataAccessError");
    expect(err.context).toBe("clubs: by slug");
    expect(err.cause).toBe(pgError);
  });
});

describe("dbErrorToResponse", () => {
  it("returns a generic 500 with the given headers, no internal detail", async () => {
    const res = dbErrorToResponse({ "Access-Control-Allow-Origin": "*" });
    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});
