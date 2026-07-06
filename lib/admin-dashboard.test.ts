import { describe, it, expect } from "vitest";
import { aggregateDashboard, type AggregateInput } from "./admin-dashboard";

const NOW = new Date("2026-07-06T12:00:00Z");

function baseInput(overrides: Partial<AggregateInput> = {}): AggregateInput {
  return {
    now: NOW,
    users: [
      { id: "u1", email: "new@x.ca", created_at: "2026-07-06T01:00:00Z" },
      { id: "u2", email: "mid@x.ca", created_at: "2026-06-20T01:00:00Z" },
      { id: "u3", email: "old@x.ca", created_at: "2026-01-01T01:00:00Z" },
    ],
    memberships: [
      { user_id: "u1", clubs: { full_name: "Richmond Hill Aquatic Club" } },
      { user_id: "u1", clubs: { full_name: "Toronto Swim Club" } },
      { user_id: "u3", clubs: null },
    ],
    clubs: [
      {
        id: "c1",
        full_name: "Richmond Hill Aquatic Club",
        slug: "rhac",
        level: "regular",
        created_at: "2026-07-01T00:00:00Z",
        club_members: [{ count: 3 }],
        record_lists: [{ count: 4 }],
      },
      {
        id: "c2",
        full_name: "Toronto Swim Club",
        slug: "tsc",
        level: "provincial",
        created_at: "2026-01-01T00:00:00Z",
        club_members: [{ count: 1 }],
        record_lists: [{ count: 2 }],
      },
    ],
    pageViews: [
      {
        created_at: "2026-07-06T10:00:00Z",
        club_slug: "rhac",
        list_slug: "scm",
        visitor_hash: "v1",
      },
      {
        created_at: "2026-07-06T11:00:00Z",
        club_slug: "rhac",
        list_slug: null,
        visitor_hash: "v1",
      },
      {
        created_at: "2026-06-15T10:00:00Z",
        club_slug: "tsc",
        list_slug: "lcm",
        visitor_hash: "v2",
      },
    ],
    recordActivity: [
      { updated_at: "2026-07-05T10:00:00Z", record_lists: { club_id: "c1" } },
      { updated_at: "2026-07-01T10:00:00Z", record_lists: { club_id: "c1" } },
      { updated_at: "2026-06-10T10:00:00Z", record_lists: { club_id: "c2" } },
      { updated_at: null, record_lists: { club_id: "c2" } },
    ],
    ...overrides,
  };
}

describe("aggregateDashboard", () => {
  it("computes signup totals, windows, and series", () => {
    const d = aggregateDashboard(baseInput());
    expect(d.signups.total).toBe(3);
    expect(d.signups.new7).toBe(1);
    expect(d.signups.new30).toBe(2);
    expect(d.signups.series).toHaveLength(30);
    expect(d.signups.series[29]).toEqual({ date: "2026-07-06", count: 1 });
  });

  it("lists recent signups newest-first with their club names", () => {
    const d = aggregateDashboard(baseInput());
    expect(d.signups.recent[0]).toEqual({
      email: "new@x.ca",
      createdAt: "2026-07-06T01:00:00Z",
      clubs: ["Richmond Hill Aquatic Club", "Toronto Swim Club"],
    });
    expect(d.signups.recent[2].clubs).toEqual([]);
    expect(d.signups.recent).toHaveLength(3);
  });

  it("computes club counts", () => {
    const d = aggregateDashboard(baseInput());
    expect(d.clubs).toEqual({ total: 2, new7: 1, new30: 1 });
  });

  it("computes traffic stats, uniques, and top lists", () => {
    const d = aggregateDashboard(baseInput());
    expect(d.traffic.today).toBe(2);
    expect(d.traffic.views7).toBe(2);
    expect(d.traffic.views30).toBe(3);
    expect(d.traffic.uniques7).toBe(1);
    expect(d.traffic.uniques30).toBe(2);
    expect(d.traffic.topClubs[0]).toEqual({ key: "rhac", count: 2 });
    expect(d.traffic.topLists).toEqual([
      { key: "rhac/scm", count: 1 },
      { key: "tsc/lcm", count: 1 },
    ]);
  });

  it("computes per-club content stats with record counts and last activity", () => {
    const d = aggregateDashboard(baseInput());
    expect(d.content.totalLists).toBe(6);
    expect(d.content.totalRecords).toBe(4);
    const rhac = d.content.perClub.find((c) => c.slug === "rhac");
    expect(rhac).toMatchObject({
      name: "Richmond Hill Aquatic Club",
      level: "regular",
      members: 3,
      lists: 4,
      records: 2,
      lastActivity: "2026-07-05T10:00:00Z",
    });
  });

  it("computes engagement windows sorted by most recent activity", () => {
    const d = aggregateDashboard(baseInput());
    expect(d.engagement.active7.map((c) => c.slug)).toEqual(["rhac"]);
    expect(d.engagement.active30.map((c) => c.slug)).toEqual(["rhac", "tsc"]);
  });

  it("handles fully empty input", () => {
    const d = aggregateDashboard(
      baseInput({
        users: [],
        memberships: [],
        clubs: [],
        pageViews: [],
        recordActivity: [],
      })
    );
    expect(d.signups.total).toBe(0);
    expect(d.traffic.views30).toBe(0);
    expect(d.content.perClub).toEqual([]);
    expect(d.engagement.active30).toEqual([]);
  });
});
