import { and, eq, gte, gt, sql } from "drizzle-orm";
import { generateRequirements } from "@/lib/agents/requirements";
import { transcribeAudio } from "@/lib/agents/transcription";
import { db, events, prototypes } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { apiUser, recordable } from "@/lib/requests";
import { download } from "@/lib/storage";

// Transcription of up to 20 chunks plus the requirement agent; NFR-1 aims for under 60 s
export const maxDuration = 120;

const MIN_DURATION_MS = 15_000;
// FR-G5: fewer words than this is too little to build requirements from
const MIN_WORDS = 25;

export type GenerateMessage =
  | { step: "transcribing" | "analysing" | "done" }
  | { error: string; tooShort?: boolean };

/**
 * Generate (FR-G1, FR-G2): locks the recording, transcribes the chunks in parallel, joins them in
 * order and runs the requirement agent. Streams one JSON line per step for the Generating screen.
 * Any failure unlocks the recording, so the user can try again or record again.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/requests/[id]/generate">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });

  const [locked] = await db
    .update(prototypes)
    .set({ recordingLockedAt: sql`now()` })
    .where(
      and(
        recordable(user.id, id),
        gt(prototypes.audioChunkCount, 0),
        gte(prototypes.recordingDurationMs, MIN_DURATION_MS),
      ),
    )
    .returning({ chunks: prototypes.audioChunkCount });
  if (!locked) {
    return Response.json(
      { error: "This recording can't be used. Record at least 15 seconds and try again." },
      { status: 409 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (message: GenerateMessage) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      const unlock = () =>
        db
          .update(prototypes)
          .set({ recordingLockedAt: null })
          .where(and(eq(prototypes.id, id), eq(prototypes.status, "recording")));
      try {
        send({ step: "transcribing" });
        const parts = await Promise.all(
          Array.from({ length: locked.chunks }, async (_, index) =>
            transcribeAudio(await download("audio", `${id}/${index}.wav`)),
          ),
        );
        const transcript = parts.map((part) => part.text).filter(Boolean).join(" ");
        const transcriptionCost = parts.reduce((total, part) => total + part.costUsd, 0);
        // Spent even if the transcript turns out too short or the next step fails
        await db
          .update(prototypes)
          .set({ transcriptionCostUsd: sql`${prototypes.transcriptionCostUsd} + ${transcriptionCost}` })
          .where(eq(prototypes.id, id));
        if (transcript.split(" ").filter(Boolean).length < MIN_WORDS) {
          await unlock();
          send({
            error:
              "We could hardly hear anything in this recording. Record again and describe your idea: who it is for and what they should be able to do.",
            tooShort: true,
          });
          return;
        }

        send({ step: "analysing" });
        const result = await generateRequirements(transcript);
        await db.transaction(async (tx) => {
          const [row] = await tx
            .update(prototypes)
            .set({
              status: "requirements_ready",
              statusChangedAt: sql`now()`,
              title: result.requirements.title,
              transcript,
              requirements: result.requirements,
              requirementsCostUsd: sql`${prototypes.requirementsCostUsd} + ${result.costUsd}`,
            })
            .where(and(eq(prototypes.id, id), eq(prototypes.status, "recording")))
            .returning({ id: prototypes.id });
          if (!row) throw new Error(`Prototype ${id} left recording during Generate`);
          // Version 1 of the requirements (architecture 5.4)
          await tx.insert(events).values({
            actorId: user.id,
            actorRole: "user",
            userId: user.id,
            prototypeId: id,
            action: "requirements_generated",
            fromStatus: "recording",
            toStatus: "requirements_ready",
            details: {
              requirements: result.requirements,
              model: result.model,
              transcript_chars: transcript.length,
              transcription_model: parts[0]?.model,
              transcription_cost_usd: Number(transcriptionCost.toFixed(6)),
              requirements_cost_usd: Number(result.costUsd.toFixed(6)),
            },
          });
        });
        send({ step: "done" });
      } catch (error) {
        console.error(`Generate failed for ${id}`, error);
        await unlock().catch(() => undefined);
        send({ error: "Something went wrong while writing your requirements. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
