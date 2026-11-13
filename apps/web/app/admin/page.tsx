import { asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { requireAdmin } from "@/lib/auth";
import { db, prototypes, users } from "@/lib/db";
import { formatCost, formatDuration } from "@/lib/format";
import { statusLabels } from "./_components/status-labels";
import { StatusTabs } from "./_components/status-tabs";

type Status = (typeof prototypes.status.enumValues)[number];

// Queue (design A1, FR-AD1). Recording and requirements_ready are still with the user, so the
// tabs leave them out; a search covers every status.
const tabs = {
  pending: { label: "Pending approval", statuses: ["pending_review"], badge: "bg-amber text-amber-ink" },
  building: { label: "Building", statuses: ["approved", "building"], badge: "bg-admin-rule" },
  qa: { label: "Ready for QA", statuses: ["awaiting_qa"], badge: "bg-amber text-amber-ink" },
  failed: { label: "Build failed", statuses: ["build_failed"], badge: "bg-danger-tint text-danger-ink" },
  live: { label: "Live", statuses: ["released"], badge: "bg-admin-rule" },
  closed: { label: "Closed", statuses: ["declined", "user_declined", "expired", "offline"], badge: "bg-admin-rule" },
} satisfies Record<string, { label: string; statuses: Status[]; badge: string }>;

type TabKey = keyof typeof tabs;

const intro: Record<TabKey, string> = {
  pending: "Requirements the user approved, oldest first. Accepting starts the build.",
  building: "Accepted requests the builder has picked up or will pick up within seconds.",
  qa: "Built prototypes waiting for a check, oldest first. Users are not emailed until you release them.",
  failed: "Builds that failed their checks after the fix round. The user has not been told.",
  live: "Released prototypes. Anyone with the link can open them until they expire.",
  closed: "Declined, expired and offline requests, newest first.",
};

const actionLabel: Record<TabKey, string> = {
  pending: "Review",
  building: "View",
  qa: "Open QA",
  failed: "View",
  live: "View",
  closed: "View",
};

export default async function AdminQueuePage({ searchParams }: PageProps<"/admin">) {
  // Checked here as well as in the layout: layouts don't re-run on every navigation
  await requireAdmin();
  const { status: requested, q } = await searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const current: TabKey =
    typeof requested === "string" && requested in tabs ? (requested as TabKey) : "pending";

  const counts = await db
    .select({ status: prototypes.status, count: count() })
    .from(prototypes)
    .groupBy(prototypes.status);

  const rows = await db
    .select({
      id: prototypes.id,
      status: prototypes.status,
      title: prototypes.title,
      slug: prototypes.slug,
      email: users.email,
      recordingDurationMs: prototypes.recordingDurationMs,
      revisionCount: prototypes.revisionCount,
      ipFlagged: prototypes.ipFlagged,
      // How many other accounts share an IP with the user, from the submitted event
      ipMatches: sql<number>`coalesce((select jsonb_array_length(e.details->'ip_flag_matches') from events e where e.prototype_id = ${prototypes.id} and e.action = 'submitted' order by e.id desc limit 1), 0)`.mapWith(Number),
      // Computed by Postgres, so rendering stays pure
      waitingMs: sql<number>`extract(epoch from now() - ${prototypes.statusChangedAt}) * 1000`.mapWith(Number),
      expiresInMs: sql<number | null>`extract(epoch from ${prototypes.expiresAt} - now()) * 1000`.mapWith(Number),
      // Transcription, requirements and build together
      totalCostUsd: sql<string>`${prototypes.transcriptionCostUsd} + ${prototypes.requirementsCostUsd} + ${prototypes.buildCostUsd}`,
    })
    .from(prototypes)
    .innerJoin(users, eq(users.id, prototypes.userId))
    .where(
      search
        ? or(
            ilike(users.email, contains(search)),
            ilike(prototypes.title, contains(search)),
            ilike(prototypes.slug, contains(search)),
          )
        : inArray(prototypes.status, tabs[current].statuses),
    )
    .orderBy(
      search || current === "closed" ? desc(prototypes.statusChangedAt) : asc(prototypes.statusChangedAt),
    )
    .limit(200);

  const pending = !search && current === "pending";

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[30px] font-extrabold tracking-tight">Queue</h1>
          <p className="text-ink-muted">
            {search ? (
              <>
                Every prototype matching &ldquo;{search}&rdquo;, most recent first.{" "}
                <Link href={`/admin?status=${current}`} className="font-bold">
                  Clear search
                </Link>
              </>
            ) : (
              intro[current]
            )}
          </p>
        </div>
        <form action="/admin" className="flex flex-col gap-1.5">
          <label htmlFor="queue-search" className="text-sm font-bold">
            Search
          </label>
          <Input
            id="queue-search"
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Email, title or link name"
            className="h-12 w-[300px] max-w-full"
          />
        </form>
      </div>

      <StatusTabs
        current={search ? "" : current}
        tabs={(Object.keys(tabs) as TabKey[]).map((key) => ({
          key,
          label: tabs[key].label,
          badge: tabs[key].badge,
          count: counts
            .filter((c) => (tabs[key].statuses as Status[]).includes(c.status))
            .reduce((total, c) => total + c.count, 0),
        }))}
      />

      <div className="overflow-x-auto rounded-[20px] bg-white">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-ink-muted">{search ? "No prototypes match." : "Nothing here."}</p>
        ) : (
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="text-sm">
                <Th>Prototype</Th>
                <Th>User</Th>
                <Th>
                  {search ? "Status" : current === "live" ? "Expires in" : current === "closed" ? "Closed" : "Waiting"}
                </Th>
                {pending ? (
                  <>
                    <Th>Changes used</Th>
                    <Th>Flags</Th>
                  </>
                ) : (
                  <Th>Cost</Th>
                )}
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
                    <div className="text-sm text-ink-muted">
                      {pending || !row.slug
                        ? `Recording ${formatRecording(row.recordingDurationMs)}`
                        : row.slug}
                    </div>
                  </td>
                  <td className="px-6 py-4">{row.email}</td>
                  <td className="px-6 py-4">
                    {search ? (
                      <Pill tone={(statusLabels[row.status] ?? [row.status, "neutral"])[1]} size="sm">
                        {(statusLabels[row.status] ?? [row.status])[0]}
                      </Pill>
                    ) : current === "live"
                      ? Number.isFinite(row.expiresInMs)
                        ? formatDuration(row.expiresInMs ?? 0)
                        : "Not set"
                      : current === "closed"
                        ? `${formatDuration(row.waitingMs)} ago`
                        : formatDuration(row.waitingMs)}
                  </td>
                  {pending ? (
                    <>
                      <td className="px-6 py-4">{row.revisionCount} of 2</td>
                      <td className="px-6 py-4">
                        {row.ipFlagged ? (
                          <Pill tone="danger" size="sm">
                            IP shared with {row.ipMatches} account{row.ipMatches === 1 ? "" : "s"}
                          </Pill>
                        ) : (
                          <span className="text-ink-muted">None</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <td className="px-6 py-4">{formatCost(row.totalCostUsd)}</td>
                  )}
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/prototypes/${row.id}`}
                      className="inline-block rounded-full bg-navy px-[22px] py-[11px] font-bold text-white no-underline hover:bg-[#1d2c6e] hover:text-white"
                    >
                      {search ? "View" : actionLabel[current]}
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

/** "3 min 12 s" */
function formatRecording(milliseconds: number | null): string {
  const seconds = Math.round((milliseconds ?? 0) / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** An ILIKE pattern matching `text` anywhere, with its own wildcards escaped. */
function contains(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}
