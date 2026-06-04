import { vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";

/** A query outcome. An `Error` value makes the query REJECT (simulates a
 *  network/transport throw); any other value RESOLVES (a normal
 *  `{ data, error }` Supabase result). */
export type QueryResult = { data?: unknown; error: unknown };
export type Outcome = QueryResult | Error;

const CHAIN_METHODS = [
  "select",
  "eq",
  "order",
  "limit",
  "in",
  "insert",
  "update",
  "delete",
  "upsert",
] as const;

function settle(outcome: Outcome): Promise<QueryResult> {
  return outcome instanceof Error
    ? Promise.reject(outcome)
    : Promise.resolve(outcome);
}

/** A chainable, thenable Supabase query-builder mock. Builder methods return
 *  the same chain; `single`/`maybeSingle`/awaiting the chain settle `outcome`. */
export function makeChain(outcome: Outcome) {
  const chain: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn(() => settle(outcome));
  chain.maybeSingle = vi.fn(() => settle(outcome));
  chain.then = (
    onF: (v: QueryResult) => unknown,
    onR?: (e: unknown) => unknown
  ) => settle(outcome).then(onF, onR);
  return chain;
}

/** A Supabase-client-shaped mock. `from(table)` resolves the table's configured
 *  outcome; `rpc(fn)` resolves the rpc's; `auth` is passed through as-is. */
export function makeSupabase(
  byTable: Record<string, Outcome> = {},
  opts: {
    rpc?: Record<string, Outcome>;
    auth?: Record<string, unknown>;
  } = {}
) {
  return {
    from: vi.fn((t: string) => makeChain(byTable[t] ?? { data: null, error: null })),
    rpc: vi.fn((fn: string) => settle(opts.rpc?.[fn] ?? { data: null, error: null })),
    auth: opts.auth ?? {},
  };
}

/** A canned PostgrestError for "returned error" cases. */
export const pgError = { message: "boom", code: "XX000" } as unknown as PostgrestError;
