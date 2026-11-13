import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/ui/pill";
import type { Requirements } from "@/lib/agents/requirements";
import { requireAdmin } from "@/lib/auth";
import { loadCostBreakdown } from "@/lib/costs";
import { db, events, prototypes, users } from "@/lib/db";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatSeconds,
  isUuid,
  parseTimestamp,
} from "@/lib/format";
import { CostBreakdownCard } from "../../_components/cost-breakdown";
import { statusLabels } from "../../_components/status-labels";
import type { EventFilterValue } from "./_components/event-filter";
import { categoryLabels, EventLog, type LoggedEvent } from "./_components/event-log";
import { QaActions } from "./_components/qa-actions";
import { RecordActions } from "./_components/record-actions";
import { RecordingCard } from "./_components/recording-card";
import { RequirementVersions, type RequirementVersion } from "./_components/requirement-versions";
import { RequirementsChecklist } from "./_components/requirements-checklist";
import { ReviewDecision, RetryBuild } from "./_components/review-decision";

// One prototype for admins: review (design A2) while pending, QA (A4) once built, and a summary
// with the requirements, recording, user, costs and event log in every status. Live, offline and
// expired prototypes also get the record header (A5).
const eventFilters = ["all", "user", "admin", "system"] as const;

export default async function PrototypePage({ params, searchParams }: PageProps<"/admin/prototypes/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const requested = (await searchParams).events;
  const filter: EventFilterValue = eventFilters.find((value) => value === requested) ?? "all";
  if (!isUuid(id)) notFound();

  const [prototype] = await db
    .select({
      id: prototypes.id,
      userId: prototypes.userId,
      title: prototypes.title,
      slug: prototypes.slug,
      status: prototypes.status,
      statusChangedAt: prototypes.statusChangedAt,
      requirements: prototypes.requirements,
      transcript: prototypes.transcript,
      audioChunkCount: prototypes.audioChunkCount,
      recordingDurationMs: prototypes.recordingDurationMs,
      submittedAt: prototypes.submittedAt,
      buildAttempts: prototypes.buildAttempts,
      buildCostUsd: prototypes.buildCostUsd,
      siteUrl: prototypes.siteUrl,
      expiresAt: prototypes.expiresAt,
      decisionCategory: prototypes.decisionCategory,
      decisionReason: prototypes.decisionReason,
      userDeclineReason: prototypes.userDeclineReason,
      email: users.email,
      signedUpAt: users.createdAt,
      // Computed by Postgres, so rendering stays pure
      waitingMs: sql<number>`extract(epoch from now() - ${prototypes.statusChangedAt}) * 1000`.mapWith(Number),
      expiresInMs: sql<number | null>`extract(epoch from ${prototypes.expiresAt} - now()) * 1000`.mapWith(Number),
    })
    .from(prototypes)
    .innerJoin(users, eq(users.id, prototypes.userId))
    .where(eq(prototypes.id, id));
  if (!prototype) notFound();

  const [build, costs, versions, ipCheck, log] = await Promise.all([
    latestBuild(id),
    loadCostBreakdown(id),
    requirementVersions(id),
    ipMatches(id),
    eventLog(id, prototype.userId),
  ]);
  const status = prototype.status;
  const [statusLabel, statusTone] = statusLabels[status] ?? [status, "neutral"];
  const title = prototype.title ?? "Untitled prototype";
  const functionalRequirements = readRequirements(prototype.requirements);
  const record = status === "released" || status === "offline" || status === "expired";
  const timeLeft = (prototype.expiresInMs ?? 0) > 0;
  const rebuilds = log.filter((event) => event.action === "rebuild_requested").length;

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-[18px] px-6 pt-5 pb-14">
      <Link href="/admin" className="self-start py-2.5 font-bold">
        Back to queue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] font-extrabold tracking-tight">{title}</h1>
          <Pill tone={statusTone} size="sm">
            {statusLabel}
          </Pill>
        </div>
        <p className="text-ink-muted">
          {status === "pending_review" && prototype.submittedAt
            ? `Submitted by ${prototype.email} on ${formatDateTime(parseTimestamp(prototype.submittedAt))}. Waiting ${formatDuration(prototype.waitingMs)}.`
            : statusLine(status, prototype.statusChangedAt, prototype.expiresAt)}
        </p>
      </div>
      {record && (
        <RecordActions
          prototypeId={prototype.id}
          siteUrl={prototype.siteUrl}
          canDownload={prototype.buildAttempts > 0}
          mode={status === "released" ? "live" : status === "offline" && timeLeft ? "restore" : "redeploy"}
        />
      )}
      </div>

      {record && (
        <div className="flex flex-wrap gap-4">
          <Stat
            label={status === "released" ? "Link expires in" : status === "offline" ? "Link offline" : "Link expired"}
            value={
              status === "released"
                ? formatDuration(prototype.expiresInMs ?? 0)
                : status === "offline" && timeLeft
                  ? `${formatDuration(prototype.expiresInMs ?? 0)} left`
                  : "Not live"
            }
            note={prototype.expiresAt ? formatDateTime(parseTimestamp(prototype.expiresAt)) : undefined}
            accent
          />
          <Stat
            label="Build attempts"
            value={String(prototype.buildAttempts)}
            note={`${rebuilds} rebuild${rebuilds === 1 ? "" : "s"} after QA`}
          />
          <Stat
            label="Total build cost"
            value={formatCost(prototype.buildCostUsd)}
            note={prototype.buildAttempts === 1 ? "One attempt" : `Across ${prototype.buildAttempts} attempts`}
          />
          <Stat label="Link name" value={prototype.slug ?? "None"} small />
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          {prototype.slug && prototype.siteUrl && status !== "offline" && status !== "expired" && (
            <PreviewPanel
              id={prototype.id}
              slug={prototype.slug}
              siteUrl={prototype.siteUrl}
              live={status === "released"}
            />
          )}
          {status === "awaiting_qa" && functionalRequirements.length > 0 && (
            <RequirementsChecklist prototypeId={prototype.id} requirements={functionalRequirements} />
          )}
          {status !== "awaiting_qa" && versions.length > 0 && (
            <RequirementVersions versions={versions} submitted={prototype.submittedAt !== null} />
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          {status === "pending_review" && (
            <ReviewDecision prototypeId={prototype.id} title={title} email={prototype.email} />
          )}
          {status === "awaiting_qa" && (
            <QaActions prototypeId={prototype.id} title={title} email={prototype.email} />
          )}
          {status === "build_failed" && <RetryBuild prototypeId={prototype.id} />}
          {(prototype.decisionReason || prototype.userDeclineReason) && (
            <section className="flex flex-col gap-2 rounded-[20px] bg-white p-[26px]">
              <h2 className="text-lg font-bold">
                {status === "user_declined" ? "Reason the user gave" : "Reason sent to the user"}
              </h2>
              {prototype.decisionCategory && (
                <p className="text-sm font-bold text-ink-muted">
                  {categoryLabels[prototype.decisionCategory] ?? prototype.decisionCategory}
                </p>
              )}
              <p className="text-[15px]">{prototype.decisionReason ?? prototype.userDeclineReason}</p>
            </section>
          )}
          {prototype.buildAttempts > 0 && (
            <section className="flex flex-col gap-3 rounded-[20px] bg-white p-[26px]">
              <h2 className="text-lg font-bold">Build</h2>
              <dl className="flex flex-col text-[15px]">
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
              </dl>
              <a href={`/api/admin/requests/${prototype.id}/source`} className="self-start py-1 font-bold">
                Download source
              </a>
            </section>
          )}
          {prototype.audioChunkCount > 0 && (
            <RecordingCard
              prototypeId={prototype.id}
              seconds={(prototype.recordingDurationMs ?? 0) / 1000}
              transcript={prototype.transcript}
            />
          )}
          <section className="flex flex-col gap-3 rounded-[20px] bg-white p-[26px]">
            <h2 className="text-lg font-bold">User</h2>
            <dl className="flex flex-col text-[15px]">
              <Fact label="Email">{prototype.email}</Fact>
              <Fact label="Signed up">{formatDateTime(parseTimestamp(prototype.signedUpAt))}</Fact>
              {ipCheck.ip && <Fact label="IP address">{ipCheck.ip}</Fact>}
              {ipCheck.ip && (
                <Fact label="Other accounts on this IP">
                  {ipCheck.emails.length > 0 ? (
                    <span className="font-bold text-danger-ink">{ipCheck.emails.join(", ")}</span>
                  ) : (
                    "None"
                  )}
                </Fact>
              )}
            </dl>
            <p className="text-sm text-ink-muted">
              When an IP address is shared, the other accounts are listed here so you can judge
              whether it is the same person. It never blocks a request by itself.
            </p>
          </section>
          {costs && <CostBreakdownCard breakdown={costs} />}
        </aside>
      </div>

      <EventLog
        prototypeId={prototype.id}
        events={log}
        filter={filter}
        recordingSeconds={(prototype.recordingDurationMs ?? 0) / 1000}
      />
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

function Stat({
  label,
  value,
  note,
  accent = false,
  small = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-[1_1_200px] flex-col gap-1 rounded-[20px] border-t-[6px] bg-white px-[22px] py-[18px] ${
        accent ? "border-coral" : "border-navy"
      }`}
    >
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={small ? "text-[17px] font-bold break-all" : "font-display text-xl font-extrabold"}>{value}</div>
      {note && <div className="text-sm text-ink-muted">{note}</div>}
    </div>
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
    case "building":
      return `Building since ${changed}.`;
    case "build_failed":
      return `Build failed ${changed}. The user has not been told.`;
    case "declined":
      return `Declined ${changed}.`;
    case "user_declined":
      return `Declined by the user ${changed}.`;
    case "offline":
      return `Taken offline ${changed}. The link shows "not available" until it is restored.`;
    case "expired":
      return `Expired ${changed}. Redeploying gives it another 3 days.`;
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

/** Checks and duration of the most recent build attempt, from the event timeline. */
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
  const details = (finished?.details ?? {}) as { attempt?: number };
  const started = rows.findLast(
    (row) =>
      row.action === "build_started" &&
      (row.details as { attempt?: number } | null)?.attempt === details.attempt,
  );
  return {
    checksPassed: finished ? finished.action === "build_succeeded" : null,
    durationMs:
      finished && started
        ? parseTimestamp(finished.createdAt).getTime() - parseTimestamp(started.createdAt).getTime()
        : null,
  };
}

/** Every version of the requirements with the change request that produced it (architecture 5.4). */
async function requirementVersions(prototypeId: string): Promise<RequirementVersion[]> {
  const rows = await db
    .select({ details: events.details })
    .from(events)
    .where(
      and(
        eq(events.prototypeId, prototypeId),
        inArray(events.action, ["requirements_generated", "requirements_revised"]),
      ),
    )
    .orderBy(asc(events.id));
  return rows.map((row) => {
    const details = row.details as { requirements: Requirements; remark?: string };
    return { requirements: details.requirements, remark: details.remark ?? null };
  });
}

/** The IP the user submitted from and the other accounts seen on it (BR-7). */
async function ipMatches(prototypeId: string): Promise<{ ip: string | null; emails: string[] }> {
  const [submitted] = await db
    .select({ ip: events.ip, details: events.details })
    .from(events)
    .where(and(eq(events.prototypeId, prototypeId), eq(events.action, "submitted")))
    .orderBy(desc(events.id))
    .limit(1);
  if (!submitted) return { ip: null, emails: [] };
  const matchIds = (submitted.details as { ip_flag_matches?: string[] } | null)?.ip_flag_matches ?? [];
  const matches =
    matchIds.length > 0
      ? await db.select({ email: users.email }).from(users).where(inArray(users.id, matchIds))
      : [];
  return { ip: submitted.ip, emails: matches.map((row) => row.email) };
}

/**
 * The prototype's events plus the owner's sign-up, oldest first. The email is the actor's, so
 * admins are named on their own actions.
 */
async function eventLog(prototypeId: string, userId: string): Promise<LoggedEvent[]> {
  return db
    .select({
      id: events.id,
      createdAt: events.createdAt,
      actorRole: events.actorRole,
      actorEmail: users.email,
      action: events.action,
      fromStatus: events.fromStatus,
      toStatus: events.toStatus,
      ip: events.ip,
      reason: events.reason,
      details: events.details,
    })
    .from(events)
    .leftJoin(users, eq(users.id, events.actorId))
    .where(
      or(
        eq(events.prototypeId, prototypeId),
        and(eq(events.userId, userId), isNull(events.prototypeId), eq(events.action, "signup")),
      ),
    )
    .orderBy(asc(events.id));
}
