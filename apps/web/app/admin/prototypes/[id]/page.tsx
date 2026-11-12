import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill, type PillTone } from "@/components/ui/pill";
import { requireAdmin } from "@/lib/auth";
import { db, events, prototypes, users } from "@/lib/db";
import {
  formatCost,
  formatDateTime,
  formatSeconds,
  isUuid,
  parseTimestamp,
} from "@/lib/format";
import { QaActions } from "./_components/qa-actions";
import { RequirementsChecklist } from "./_components/requirements-checklist";

// QA of a built prototype (design A4). Other statuses show a short summary until the
// review and record screens (A2, A5) are built in M3.
const statusLabels: Record<string, [string, PillTone]> = {
  approved: ["Waiting for the builder", "neutral"],
  building: ["Building", "neutral"],
  build_failed: ["Build failed", "danger"],
  awaiting_qa: ["Ready for QA", "amber"],
  released: ["Live", "success"],
  expired: ["Expired", "neutral"],
  offline: ["Offline", "neutral"],
  declined: ["Declined", "danger"],
};

export default async function PrototypePage({ params }: PageProps<"/admin/prototypes/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [prototype] = await db
    .select({
      id: prototypes.id,
      title: prototypes.title,
      slug: prototypes.slug,
      status: prototypes.status,
      statusChangedAt: prototypes.statusChangedAt,
      requirements: prototypes.requirements,
      buildAttempts: prototypes.buildAttempts,
      buildCostUsd: prototypes.buildCostUsd,
      siteUrl: prototypes.siteUrl,
      releasedAt: prototypes.releasedAt,
      expiresAt: prototypes.expiresAt,
      email: users.email,
    })
    .from(prototypes)
    .innerJoin(users, eq(users.id, prototypes.userId))
    .where(eq(prototypes.id, id));
  if (!prototype) notFound();

  const build = await latestBuild(id);
  const [statusLabel, statusTone] = statusLabels[prototype.status] ?? [prototype.status, "neutral"];
  const title = prototype.title ?? "Untitled prototype";
  const functionalRequirements = readRequirements(prototype.requirements);

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-[18px] px-6 pt-5 pb-14">
      <Link href="/admin" className="self-start py-2.5 font-bold">
        Back to queue
      </Link>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] font-extrabold tracking-tight">{title}</h1>
          <Pill tone={statusTone} size="sm">
            {statusLabel}
          </Pill>
        </div>
        <p className="text-ink-muted">
          {statusLine(prototype.status, prototype.statusChangedAt, prototype.expiresAt)}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          {prototype.slug && prototype.siteUrl && (
            <PreviewPanel
              id={prototype.id}
              slug={prototype.slug}
              siteUrl={prototype.siteUrl}
              live={prototype.status === "released"}
            />
          )}
          {prototype.status === "awaiting_qa" && functionalRequirements.length > 0 && (
            <RequirementsChecklist prototypeId={prototype.id} requirements={functionalRequirements} />
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          {prototype.status === "awaiting_qa" && <QaActions prototypeId={prototype.id} />}
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-[26px]">
            <h2 className="text-lg font-bold">Build</h2>
            <dl className="flex flex-col text-[15px]">
              <Fact label="User">{prototype.email}</Fact>
              <Fact label="Attempt">{prototype.buildAttempts}</Fact>
              {build.checksPassed !== null && (
                <Fact label="Automatic check">
                  {build.checksPassed ? (
                    <span className="font-bold text-success-ink">Passed</span>
                  ) : (
                    <span className="font-bold text-danger-ink">Failed</span>
                  )}
                </Fact>
              )}
              {build.durationMs !== null && (
                <Fact label="Build time">{formatSeconds(build.durationMs)}</Fact>
              )}
              <Fact label="Cost">{formatCost(prototype.buildCostUsd)}</Fact>
              {build.model && <Fact label="Model">{build.model}</Fact>}
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}

function PreviewPanel({
  id,
  slug,
  siteUrl,
  live,
}: {
  id: string;
  slug: string;
  siteUrl: string;
  live: boolean;
}) {
  // Live prototypes open for anyone; previews go through a signed admin link
  const href = live ? siteUrl : `/api/admin/requests/${id}/preview`;
  return (
    <section className="flex flex-col overflow-hidden rounded-[20px] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b-4 border-navy px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none"
          >
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
          </svg>
          <span className="truncate">
            {live
              ? `${slug} is live. Anyone with the link can open it.`
              : `Private preview of ${slug}. Only admins can open it.`}
          </span>
        </div>
        <a href={href} target="_blank" rel="noopener" className="py-2.5 font-bold">
          Open in a new tab
        </a>
      </div>
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 bg-admin-rule p-6 text-center">
        <p className="max-w-[460px] text-[15px] text-ink-muted">
          {live
            ? siteUrl
            : "The preview opens in a new tab with a link that works for 15 minutes. Click through every screen before you release it."}
        </p>
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className="rounded-full bg-navy px-7 py-3.5 font-bold text-white no-underline hover:bg-[#1d2c6e] hover:text-white"
        >
          {live ? "Open the live prototype" : "Open preview"}
        </a>
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t-2 border-admin-rule py-[9px]">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function statusLine(status: string, changedAt: string, expiresAt: string | null): string {
  const changed = formatDateTime(parseTimestamp(changedAt));
  switch (status) {
    case "awaiting_qa":
      return `Built ${changed}. The user has not been emailed yet.`;
    case "released":
      return `Released ${changed}.${expiresAt ? ` Live until ${formatDateTime(parseTimestamp(expiresAt))}.` : ""}`;
    case "approved":
      return `Sent to the builder ${changed}. It is picked up within seconds.`;
    default:
      return `Status changed ${changed}.`;
  }
}

/** The approved requirements are internal Genie's RequirementsDraft (plus a title). */
function readRequirements(requirements: unknown): string[] {
  if (requirements && typeof requirements === "object" && "functional_requirements" in requirements) {
    const list = (requirements as { functional_requirements: unknown }).functional_requirements;
    if (Array.isArray(list)) return list.filter((item): item is string => typeof item === "string");
  }
  return [];
}

/** Model, checks and duration of the most recent build attempt, from the event timeline. */
async function latestBuild(prototypeId: string) {
  const rows = await db
    .select({ action: events.action, createdAt: events.createdAt, details: events.details })
    .from(events)
    .where(
      and(
        eq(events.prototypeId, prototypeId),
        inArray(events.action, ["build_started", "build_succeeded", "build_failed"]),
      ),
    )
    .orderBy(asc(events.id));

  const finished = rows.findLast((row) => row.action !== "build_started");
  const details = (finished?.details ?? {}) as { attempt?: number; model?: string; checks?: Record<string, number> };
  const started = rows.findLast(
    (row) =>
      row.action === "build_started" &&
      (row.details as { attempt?: number } | null)?.attempt === details.attempt,
  );
  return {
    model: details.model ?? null,
    checksPassed: finished ? finished.action === "build_succeeded" : null,
    durationMs:
      finished && started
        ? parseTimestamp(finished.createdAt).getTime() - parseTimestamp(started.createdAt).getTime()
        : null,
  };
}
