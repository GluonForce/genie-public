import { asc, count, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db, prototypes, users } from "@/lib/db";
import { formatCost, formatDuration } from "@/lib/format";
import { StatusTabs } from "./_components/status-tabs";

// Queue (design A1). For now only the tabs the build pipeline produces: Ready for QA and Live.
// Pending approval, Building, Build failed and Closed arrive with the rest of M3.
const tabs = {
  qa: { label: "Ready for QA", status: "awaiting_qa", badge: "bg-amber text-amber-ink" },
  live: { label: "Live", status: "released", badge: "bg-admin-rule" },
} as const;

type TabKey = keyof typeof tabs;

export default async function AdminQueuePage({ searchParams }: PageProps<"/admin">) {
  // Checked here as well as in the layout: layouts don't re-run on every navigation
  await requireAdmin();
  const requested = (await searchParams).status;
  const current: TabKey = requested === "live" ? "live" : "qa";

  const counts = await db
    .select({ status: prototypes.status, count: count() })
    .from(prototypes)
    .where(inArray(prototypes.status, ["awaiting_qa", "released"]))
    .groupBy(prototypes.status);

  const rows = await db
    .select({
      id: prototypes.id,
      title: prototypes.title,
      slug: prototypes.slug,
      email: users.email,
      // Computed by Postgres, so rendering stays pure
      waitingMs: sql<number>`extract(epoch from now() - ${prototypes.statusChangedAt}) * 1000`.mapWith(Number),
      expiresInMs: sql<number | null>`extract(epoch from ${prototypes.expiresAt} - now()) * 1000`.mapWith(Number),
      buildCostUsd: prototypes.buildCostUsd,
    })
    .from(prototypes)
    .innerJoin(users, eq(users.id, prototypes.userId))
    .where(eq(prototypes.status, tabs[current].status))
    .orderBy(asc(prototypes.statusChangedAt));

  const isQa = current === "qa";

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-14">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[30px] font-extrabold tracking-tight">Queue</h1>
        <p className="text-ink-muted">
          {isQa
            ? "Built prototypes waiting for a check, oldest first. Users are not emailed until you release them."
            : "Released prototypes. Anyone with the link can open them until they expire."}
        </p>
      </div>

      <StatusTabs
        current={current}
        tabs={(Object.keys(tabs) as TabKey[]).map((key) => ({
          key,
          label: tabs[key].label,
          badge: tabs[key].badge,
          count: counts.find((c) => c.status === tabs[key].status)?.count ?? 0,
        }))}
      />

      <div className="overflow-x-auto rounded-[20px] bg-white">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-ink-muted">
            {isQa ? "Nothing is waiting for QA." : "No prototypes are live."}
          </p>
        ) : (
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="text-sm">
                <Th>Prototype</Th>
                <Th>User</Th>
                <Th>{isQa ? "Waiting" : "Expires in"}</Th>
                <Th>Cost</Th>
                <Th>
                  <span className="sr-only">Action</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b-2 border-admin-rule last:border-b-0">
                  <td className="px-6 py-4">
                    <div className="font-bold">{row.title ?? "Untitled prototype"}</div>
                    <div className="text-sm text-ink-muted">{row.slug ?? "No link yet"}</div>
                  </td>
                  <td className="px-6 py-4">{row.email}</td>
                  <td className="px-6 py-4">
                    {isQa
                      ? formatDuration(row.waitingMs)
                      : Number.isFinite(row.expiresInMs)
                        ? formatDuration(row.expiresInMs ?? 0)
                        : "Not set"}
                  </td>
                  <td className="px-6 py-4">{formatCost(row.buildCostUsd)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/prototypes/${row.id}`}
                      className="inline-block rounded-full bg-navy px-[22px] py-[11px] font-bold text-white no-underline hover:bg-[#1d2c6e] hover:text-white"
                    >
                      {isQa ? "Open QA" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="border-b-4 border-navy px-6 py-4 font-bold">
      {children}
    </th>
  );
}
