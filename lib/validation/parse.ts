import { NextResponse } from "next/server";
import { z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Read + validate a JSON request body against a zod schema.
 * - body not valid JSON → 400 { error: "Invalid JSON body" }
 * - schema failure       → 400 { error: "Validation failed", issues: [...] }
 * - success              → { ok: true, data } (typed via z.infer)
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.map(String).join("."),
      message: i.message,
    }));
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation failed", issues },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}
