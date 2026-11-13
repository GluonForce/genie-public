import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, events, prototypes } from "@/lib/db";

// What one prototype cost, by stage (admins only). Totals come from the prototype's cost columns;
// the models come from the event timeline.

export type CostLine = { stage: string; models: string[]; costUsd: number };
export type CostBreakdown = { lines: CostLine[]; totalUsd: number };

export async function loadCostBreakdown(prototypeId: string): Promise<CostBreakdown | null> {
  const [row] = await db
    .select({
      transcription: prototypes.transcriptionCostUsd,
      requirements: prototypes.requirementsCostUsd,
      build: prototypes.buildCostUsd,
    })
    .from(prototypes)
    .where(eq(prototypes.id, prototypeId));
  if (!row) return null;

  const timeline = await db
    .select({ action: events.action, details: events.details })
    .from(events)
    .where(
      and(
        eq(events.prototypeId, prototypeId),
        inArray(events.action, [
          "requirements_generated",
          "requirements_revised",
          "build_succeeded",
          "build_failed",
        ]),
      ),
    )
    .orderBy(asc(events.id));

  const models = { transcription: new Set<string>(), requirements: new Set<string>(), build: new Set<string>() };
  for (const { action, details } of timeline) {
    const { model, transcription_model } = (details ?? {}) as { model?: string; transcription_model?: string };
    if (transcription_model) models.transcription.add(transcription_model);
    if (!model) continue;
    if (action.startsWith("requirements_")) models.requirements.add(model);
    else models.build.add(model);
  }

  const lines: CostLine[] = [
    { stage: "Transcription", models: [...models.transcription], costUsd: Number(row.transcription) },
    { stage: "Requirements", models: [...models.requirements], costUsd: Number(row.requirements) },
    { stage: "Build", models: [...models.build], costUsd: Number(row.build) },
  ];
  return { lines, totalUsd: lines.reduce((total, line) => total + line.costUsd, 0) };
}
