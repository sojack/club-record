import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "./parse";

const schema = z.object({
  a: z.string(),
  nested: z.array(z.object({ time_ms: z.number() })),
  mode: z
    .enum(["x", "y"])
    .nullish()
    .transform((v) => v ?? "x"),
});

function req(body: string): Request {
  return new Request("http://t/x", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("parseJsonBody", () => {
  it("returns a 400 'Invalid JSON body' on unparseable JSON", async () => {
    const r = await parseJsonBody(req("{not json"), schema);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.response.status).toBe(400);
    expect(await r.response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns a 400 'Validation failed' with dotted issue paths", async () => {
    const r = await parseJsonBody(
      req(JSON.stringify({ a: 1, nested: [{ time_ms: "bad" }] })),
      schema
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.response.status).toBe(400);
    const body = await r.response.json();
    expect(body.error).toBe("Validation failed");
    const paths = body.issues.map((i: { path: string }) => i.path);
    expect(paths).toContain("a");
    expect(paths).toContain("nested.0.time_ms");
    for (const issue of body.issues) {
      expect(typeof issue.message).toBe("string");
    }
  });

  it("returns ok:true with parsed+typed data (unknown keys stripped, transform applied)", async () => {
    const r = await parseJsonBody(
      req(JSON.stringify({ a: "hi", nested: [], extra: 99 })),
      schema
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected success");
    expect(r.data).toEqual({ a: "hi", nested: [], mode: "x" });
  });
});
