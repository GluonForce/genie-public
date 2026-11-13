import { and, asc, eq, sql } from "drizzle-orm";
import { reviseRequirements, type Requirements } from "@/lib/agents/requirements";
import { db, events, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { apiUser, logBlockedAttempt, reviewable } from "@/lib/requests";
import { getClientIp } from "@/lib/users";

export const maxDuration = 60;

const MAX_REVISIONS = 2;

/**
 * A change request (FR-G4, BR-4): the requirement agent rewrites the requirements with every
 * remark so far applied. At most two; each new version is stored as an event.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/requests/[id]/revise">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { remark?: unknown } | null;
  const remark = typeof body?.remark === "string" ? body.remark.trim() : "";
  if (remark.length < 5) return Response.json({ error: "Describe what to change." }, { status: 400 });
  if (remark.length > 1000) {
    return Response.json({ error: "Keep the change request under 1000 characters." }, { status: 400 });
  }
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });

  const [prototype] = await db
    .select({
      transcript: prototypes.transcript,
      requirements: prototypes.requirements,
      revisionCount: prototypes.revisionCount,
    })
    .from(prototypes)
    .where(reviewable(user.id, id));
  if (!prototype?.transcript || !prototype.requirements) {
    return Response.json({ error: "These requirements can no longer be changed." }, { status: 409 });
  }
  if (prototype.revisionCount >= MAX_REVISIONS) {
    await logBlockedAttempt(user.id, id, await getClientIp(), "third_remark");
    return Response.json({ error: "You have used both change requests." }, { status: 409 });
  }

  const earlier = await db
    .select({ details: events.details })
    .from(events)
    .where(and(eq(events.prototypeId, id), eq(events.action, "requirements_revised")))
    .orderBy(asc(events.id));
  const remarks = [
    ...earlier.map((row) => (row.details as { remark: string }).remark),
    remark,
  ];

  let result;
  try {
    result = await reviseRequirements(prototype.transcript, prototype.requirements as Requirements, remarks);
  } catch (error) {
    console.error(`Revise failed for ${id}`, error);
    return Response.json(
      { error: "Something went wrong while updating your requirements. Please try again." },
      { status: 502 },
    );
  }

  const saved = await db.transaction(async (tx) => {
    // Counting from the value read above means two parallel requests cannot both be applied
    const [row] = await tx
      .update(prototypes)
      .set({
        requirements: result.requirements,
        title: result.requirements.title,
        revisionCount: sql`${prototypes.revisionCount} + 1`,
        requirementsCostUsd: sql`${prototypes.requirementsCostUsd} + ${result.costUsd}`,
      })
      .where(and(reviewable(user.id, id), eq(prototypes.revisionCount, prototype.revisionCount)))
      .returning({ revisionCount: prototypes.revisionCount });
    if (!row) return false;
    // Versions 2 and 3 of the requirements (architecture 5.4)
    await tx.insert(events).values({
      actorId: user.id,
      actorRole: "user",
      userId: user.id,
      prototypeId: id,
      action: "requirements_revised",
      details: {
        remark,
        requirements: result.requirements,
        model: result.model,
        requirements_cost_usd: Number(result.costUsd.toFixed(6)),
      },
    });
    return true;
  });
  if (!saved) {
    return Response.json({ error: "These requirements were changed meanwhile. Reload the page." }, { status: 409 });
  }
  return Response.json({ requirements: result.requirements });
}
