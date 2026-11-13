import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ProgressTrack } from "@/components/ui/progress-track";
import type { Requirements } from "@/lib/agents/requirements";
import { requireUser } from "@/lib/auth";
import { db, events, prototypes } from "@/lib/db";
import { parseTimestamp } from "@/lib/format";
import { GENERATE_LOCK_MINUTES } from "@/lib/requests";
import { ensureUser } from "@/lib/users";
import { GeneratingElsewhere } from "./_components/generating";
import { RecordScreen } from "./_components/record-screen";
import { RequirementsScreen } from "./_components/requirements-screen";
import { ClosedStatus, InProgressStatus, LiveStatus } from "./_components/status-screens";

const steps = ["Record", "Requirements", "Team review", "Prototype"];

// Which progress step each status belongs to (M2.1)
const stepOf: Record<string, number> = {
  recording: 0,
  requirements_ready: 1,
  pending_review: 2,
  approved: 2,
  building: 2,
  build_failed: 2,
  awaiting_qa: 2,
  released: 3,
  expired: 3,
  offline: 3,
  declined: 3,
  user_declined: 3,
};

const inProgress = ["pending_review", "approved", "building", "build_failed", "awaiting_qa"];

/** The user app: one prototype per user, so its status decides the screen. */
export default async function UserHomePage() {
  // Checked here as well as in the layout: layouts don't re-run on every navigation
  const user = await ensureUser(await requireUser());
  const [prototype] = await db
    .select({
      id: prototypes.id,
      status: prototypes.status,
      statusChangedAt: prototypes.statusChangedAt,
      title: prototypes.title,
      audioChunkCount: prototypes.audioChunkCount,
      recordingDurationMs: prototypes.recordingDurationMs,
      requirements: prototypes.requirements,
      submittedAt: prototypes.submittedAt,
      siteUrl: prototypes.siteUrl,
      expiresAt: prototypes.expiresAt,
      decisionCategory: prototypes.decisionCategory,
      decisionReason: prototypes.decisionReason,
      userDeclineReason: prototypes.userDeclineReason,
      // Computed by Postgres, so rendering stays pure
      generating: sql<boolean>`coalesce(${prototypes.recordingLockedAt} > now() - make_interval(mins => ${GENERATE_LOCK_MINUTES}), false)`,
      expiresInMs: sql<number | null>`extract(epoch from ${prototypes.expiresAt} - now()) * 1000`.mapWith(Number),
    })
    .from(prototypes)
    .where(eq(prototypes.userId, user.id));
  const status = prototype?.status ?? "recording";
  const requirements = prototype?.requirements as Requirements | null;
  const title = prototype?.title ?? requirements?.title ?? "Your prototype";

  let screen: React.ReactNode;
  if (!prototype || status === "recording") {
    // Chunks uploaded in an earlier visit can still be used for Generate
    const saved =
      prototype && prototype.audioChunkCount > 0
        ? { prototypeId: prototype.id, seconds: (prototype.recordingDurationMs ?? 0) / 1000 }
        : undefined;
    screen = prototype?.generating ? <GeneratingElsewhere /> : <RecordScreen saved={saved} />;
  } else if (status === "requirements_ready" && requirements) {
    screen = (
      <RequirementsScreen
        prototypeId={prototype.id}
        requirements={requirements}
        {...(await requirementHistory(prototype.id))}
      />
    );
  } else if (inProgress.includes(status) && requirements) {
    screen = (
      <InProgressStatus
        status={status}
        email={user.email}
        requirements={requirements}
        submittedAt={prototype.submittedAt ? parseTimestamp(prototype.submittedAt) : null}
      />
    );
  } else if (status === "released" && prototype.siteUrl) {
    screen = (
      <LiveStatus
        title={title}
        siteUrl={prototype.siteUrl}
        expiresAt={prototype.expiresAt ? parseTimestamp(prototype.expiresAt) : null}
        expiresInMs={prototype.expiresInMs}
      />
    );
  } else {
    screen = (
      <ClosedStatus
        status={status}
        title={title}
        decisionCategory={prototype.decisionCategory}
        decisionReason={prototype.decisionReason}
        userDeclineReason={prototype.userDeclineReason}
        changedAt={parseTimestamp(prototype.statusChangedAt)}
      />
    );
  }

  return (
    <>
      <ProgressTrack
        steps={steps}
        current={stepOf[status] ?? 0}
        className="mx-auto w-full max-w-[1088px] px-6 pt-2"
      />
      {screen}
    </>
  );
}

/** Earlier versions and change requests, from the event timeline (architecture 5.4). */
async function requirementHistory(prototypeId: string) {
  const versions = await db
    .select({ details: events.details })
    .from(events)
    .where(
      and(
        eq(events.prototypeId, prototypeId),
        inArray(events.action, ["requirements_generated", "requirements_revised"]),
      ),
    )
    .orderBy(asc(events.id));
  const details = versions.map((row) => row.details as { remark?: string; requirements: Requirements });
  return {
    remarks: details.flatMap((version) => (version.remark ? [version.remark] : [])),
    previousRequirements: details.at(-2)?.requirements.functional_requirements ?? null,
  };
}
