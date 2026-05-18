import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

export class DataAccessError extends Error {
  readonly context: string;

  constructor(context: string, cause: PostgrestError) {
    super(`Data access failed: ${context}`, { cause });
    this.name = "DataAccessError";
    this.context = context;
  }
}

/**
 * Unwrap a Supabase result.
 * - error set    → console.error("[data-access] " + context, error) then throw DataAccessError
 * - otherwise    → return data (null = "no rows" for a maybeSingle read)
 */
export function unwrap<T>(
  result: { data: T | null; error: PostgrestError | null },
  context: string
): T | null {
  if (result.error) {
    console.error(`[data-access] ${context}`, result.error);
    throw new DataAccessError(context, result.error);
  }
  return result.data;
}

/** Build a generic 500 JSON response with the given (CORS) headers. */
export function dbErrorToResponse(
  headers: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500, headers }
  );
}
