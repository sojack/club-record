import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchDashboardData,
  type DashboardData,
  type PerClubStats,
} from "@/lib/admin-dashboard";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";

export const dynamic = "force-dynamic";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 font-display text-xl font-semibold text-gray-900 dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
      {children}
    </div>
  );
}

const TH =
  "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400";
const TD = "px-3 py-2 text-sm text-gray-700 dark:text-gray-300";

function formatDay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

function ClubActivityTable({ clubs }: { clubs: PerClubStats[] }) {
  if (clubs.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No activity in this window.
      </p>
    );
  }
  return (
    <table className="min-w-full">
      <thead>
        <tr>
          <th className={TH}>Club</th>
          <th className={TH}>Last record update</th>
        </tr>
      </thead>
      <tbody>
        {clubs.map((c) => (
          <tr key={c.id}>
            <td className={TD}>{c.name}</td>
            <td className={TD}>{formatDay(c.lastActivity)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AdminDashboardPage() {
  let data: DashboardData | null = null;
  try {
    data = await fetchDashboardData(createAdminClient());
  } catch (e) {
    console.error("[admin-dashboard] fetch failed", e);
  }

  if (!data) {
    return (
      <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">
          Couldn&rsquo;t load dashboard data. Check the server logs.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-gray-900 dark:text-white">
          App Overview
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Signups, traffic, content, and club activity at a glance.
        </p>
      </div>

      <Section title="Signups">
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total users" value={data.signups.total} />
          <StatCard label="New (7 days)" value={data.signups.new7} />
          <StatCard label="New (30 days)" value={data.signups.new30} />
          <StatCard
            label="Clubs"
            value={data.clubs.total}
            sub={`+${data.clubs.new30} in 30 days`}
          />
        </div>
        <Card>
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            Daily signups, last 30 days
          </p>
          <BarChart series={data.signups.series} label="Daily signups" />
        </Card>
        <div className="mt-4">
          <Card>
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              Recent signups
            </p>
            {data.signups.recent.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No users yet.
              </p>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={TH}>Email</th>
                    <th className={TH}>Signed up</th>
                    <th className={TH}>Clubs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.signups.recent.map((u) => (
                    <tr key={u.email + u.createdAt}>
                      <td className={TD}>{u.email}</td>
                      <td className={TD}>{formatDay(u.createdAt)}</td>
                      <td className={TD}>
                        {u.clubs.length > 0 ? u.clubs.join(", ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </Section>

      <Section title="Traffic">
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Views today" value={data.traffic.today} />
          <StatCard label="Views (7 days)" value={data.traffic.views7} />
          <StatCard label="Views (30 days)" value={data.traffic.views30} />
          <StatCard label="Uniques (7 days)" value={data.traffic.uniques7} />
          <StatCard label="Uniques (30 days)" value={data.traffic.uniques30} />
        </div>
        <Card>
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            Daily page views, last 30 days
          </p>
          <BarChart series={data.traffic.series} label="Daily page views" />
        </Card>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              Top clubs by views (30 days)
            </p>
            {data.traffic.topClubs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No page views recorded yet.
              </p>
            ) : (
              <table className="min-w-full">
                <tbody>
                  {data.traffic.topClubs.map((c) => (
                    <tr key={c.key}>
                      <td className={TD}>/{c.key}</td>
                      <td className={`${TD} text-right`}>{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card>
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              Top record lists by views (30 days)
            </p>
            {data.traffic.topLists.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No list views recorded yet.
              </p>
            ) : (
              <table className="min-w-full">
                <tbody>
                  {data.traffic.topLists.map((l) => (
                    <tr key={l.key}>
                      <td className={TD}>/{l.key}</td>
                      <td className={`${TD} text-right`}>{l.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </Section>

      <Section title="Content">
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Clubs" value={data.clubs.total} />
          <StatCard label="Record lists" value={data.content.totalLists} />
          <StatCard label="Records" value={data.content.totalRecords} />
        </div>
        <Card>
          {data.content.perClub.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No clubs yet.
            </p>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={TH}>Club</th>
                  <th className={TH}>Level</th>
                  <th className={TH}>Members</th>
                  <th className={TH}>Lists</th>
                  <th className={TH}>Records</th>
                  <th className={TH}>Last record update</th>
                </tr>
              </thead>
              <tbody>
                {data.content.perClub.map((c) => (
                  <tr key={c.id}>
                    <td className={TD}>
                      {c.name}{" "}
                      <span className="text-gray-400 dark:text-gray-500">
                        /{c.slug}
                      </span>
                    </td>
                    <td className={TD}>{c.level}</td>
                    <td className={TD}>{c.members}</td>
                    <td className={TD}>{c.lists}</td>
                    <td className={TD}>{c.records}</td>
                    <td className={TD}>{formatDay(c.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Section>

      <Section title="Engagement">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              Clubs active in the last 7 days
            </p>
            <ClubActivityTable clubs={data.engagement.active7} />
          </Card>
          <Card>
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              Clubs active in the last 30 days
            </p>
            <ClubActivityTable clubs={data.engagement.active30} />
          </Card>
        </div>
      </Section>
    </div>
  );
}
