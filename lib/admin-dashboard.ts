import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDailySeries,
  countSince,
  topN,
  utcDay,
  type DayCount,
} from "@/lib/analytics";

const DAY_MS = 86_400_000;

export interface UserRow {
  id: string;
  email?: string;
  created_at: string;
}

export interface MembershipRow {
  user_id: string;
  clubs: { full_name: string } | null;
}

export interface ClubStatRow {
  id: string;
  full_name: string;
  slug: string;
  level: string;
  created_at: string;
  club_members: { count: number }[];
  record_lists: { count: number }[];
}

export interface PageViewRow {
  created_at: string;
  club_slug: string;
  list_slug: string | null;
  visitor_hash: string;
}

export interface RecordActivityRow {
  updated_at: string | null;
  record_lists: { club_id: string } | null;
}

export interface AggregateInput {
  now: Date;
  users: UserRow[];
  memberships: MembershipRow[];
  clubs: ClubStatRow[];
  pageViews: PageViewRow[];
  recordActivity: RecordActivityRow[];
}

export interface PerClubStats {
  id: string;
  name: string;
  slug: string;
  level: string;
  members: number;
  lists: number;
  records: number;
  lastActivity: string | null; // ISO timestamp of latest record update
}

export interface DashboardData {
  signups: {
    total: number;
    new7: number;
    new30: number;
    series: DayCount[];
    recent: { email: string; createdAt: string; clubs: string[] }[]; // 10 newest
  };
  clubs: { total: number; new7: number; new30: number };
  traffic: {
    today: number;
    views7: number;
    views30: number;
    uniques7: number;
    uniques30: number;
    series: DayCount[]; // 30 days
    topClubs: { key: string; count: number }[]; // top 10 club slugs
    topLists: { key: string; count: number }[]; // top 10 "clubSlug/listSlug"
  };
  content: {
    totalLists: number;
    totalRecords: number;
    perClub: PerClubStats[];
  };
  engagement: { active7: PerClubStats[]; active30: PerClubStats[] };
}

function uniquesSince(views: PageViewRow[], days: number, now: Date): number {
  const cutoff = now.getTime() - days * DAY_MS;
  const hashes = new Set(
    views
      .filter((v) => new Date(v.created_at).getTime() >= cutoff)
      .map((v) => v.visitor_hash)
  );
  return hashes.size;
}

function activeSince(
  perClub: PerClubStats[],
  days: number,
  now: Date
): PerClubStats[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return perClub
    .filter(
      (c) => c.lastActivity && new Date(c.lastActivity).getTime() >= cutoff
    )
    .sort(
      (a, b) =>
        new Date(b.lastActivity!).getTime() -
        new Date(a.lastActivity!).getTime()
    );
}

export function aggregateDashboard(input: AggregateInput): DashboardData {
  const { now, users, memberships, clubs, pageViews, recordActivity } = input;

  // Signups
  const userStamps = users.map((u) => u.created_at);
  const clubsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    if (!m.clubs) continue;
    const list = clubsByUser.get(m.user_id) ?? [];
    list.push(m.clubs.full_name);
    clubsByUser.set(m.user_id, list);
  }
  const recent = [...users]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 10)
    .map((u) => ({
      email: u.email ?? "(no email)",
      createdAt: u.created_at,
      clubs: clubsByUser.get(u.id) ?? [],
    }));

  // Traffic
  const viewStamps = pageViews.map((v) => v.created_at);
  const today = pageViews.filter(
    (v) => utcDay(v.created_at) === utcDay(now)
  ).length;

  // Content: per-club record counts + latest activity from the records join
  const recordCounts = new Map<string, number>();
  const lastActivity = new Map<string, string>();
  for (const r of recordActivity) {
    const clubId = r.record_lists?.club_id;
    if (!clubId) continue;
    recordCounts.set(clubId, (recordCounts.get(clubId) ?? 0) + 1);
    if (
      r.updated_at &&
      (!lastActivity.has(clubId) || r.updated_at > lastActivity.get(clubId)!)
    ) {
      lastActivity.set(clubId, r.updated_at);
    }
  }
  const perClub: PerClubStats[] = clubs.map((c) => ({
    id: c.id,
    name: c.full_name,
    slug: c.slug,
    level: c.level,
    members: c.club_members?.[0]?.count ?? 0,
    lists: c.record_lists?.[0]?.count ?? 0,
    records: recordCounts.get(c.id) ?? 0,
    lastActivity: lastActivity.get(c.id) ?? null,
  }));

  return {
    signups: {
      total: users.length,
      new7: countSince(userStamps, 7, now),
      new30: countSince(userStamps, 30, now),
      series: buildDailySeries(userStamps, 30, now),
      recent,
    },
    clubs: {
      total: clubs.length,
      new7: countSince(
        clubs.map((c) => c.created_at),
        7,
        now
      ),
      new30: countSince(
        clubs.map((c) => c.created_at),
        30,
        now
      ),
    },
    traffic: {
      today,
      views7: countSince(viewStamps, 7, now),
      views30: countSince(viewStamps, 30, now),
      uniques7: uniquesSince(pageViews, 7, now),
      uniques30: uniquesSince(pageViews, 30, now),
      series: buildDailySeries(viewStamps, 30, now),
      topClubs: topN(
        pageViews.map((v) => v.club_slug),
        10
      ),
      topLists: topN(
        pageViews.map((v) =>
          v.list_slug ? `${v.club_slug}/${v.list_slug}` : null
        ),
        10
      ),
    },
    content: {
      totalLists: perClub.reduce((sum, c) => sum + c.lists, 0),
      totalRecords: recordActivity.length,
      perClub,
    },
    engagement: {
      active7: activeSince(perClub, 7, now),
      active30: activeSince(perClub, 30, now),
    },
  };
}

/** Await a Supabase query; on any failure log and return the fallback. */
async function safe<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>,
  context: string,
  fallback: T
): Promise<T> {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`[admin-dashboard] ${context}`, error);
      return fallback;
    }
    return data ?? fallback;
  } catch (e) {
    console.error(`[admin-dashboard] ${context}`, e);
    return fallback;
  }
}

async function listAllUsers(admin: SupabaseClient): Promise<UserRow[]> {
  const users: UserRow[] = [];
  const perPage = 1000;
  try {
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw error;
      users.push(
        ...data.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
        }))
      );
      if (data.users.length < perPage) break;
    }
  } catch (e) {
    console.error("[admin-dashboard] listUsers", e);
  }
  return users;
}

export async function fetchDashboardData(
  admin: SupabaseClient
): Promise<DashboardData> {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  const [users, clubs, pageViews, recordActivity] = await Promise.all([
    listAllUsers(admin),
    safe<ClubStatRow[]>(
      admin
        .from("clubs")
        .select(
          "id, full_name, slug, level, created_at, club_members(count), record_lists(count)"
        ),
      "clubs",
      []
    ),
    safe<PageViewRow[]>(
      admin
        .from("page_views")
        .select("created_at, club_slug, list_slug, visitor_hash")
        .gte("created_at", since30),
      "page_views",
      []
    ),
    safe<RecordActivityRow[]>(
      admin.from("records").select("updated_at, record_lists!inner(club_id)"),
      "records activity",
      []
    ),
  ]);

  const recentIds = [...users]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 10)
    .map((u) => u.id);

  const memberships =
    recentIds.length > 0
      ? await safe<MembershipRow[]>(
          admin
            .from("club_members")
            .select("user_id, clubs(full_name)")
            .in("user_id", recentIds) as unknown as PromiseLike<{
            data: MembershipRow[] | null;
            error: unknown;
          }>,
          "recent memberships",
          []
        )
      : [];

  return aggregateDashboard({
    now,
    users,
    memberships,
    clubs,
    pageViews,
    recordActivity,
  });
}
