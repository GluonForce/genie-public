import "server-only";
import { ModelError, errorMessage, modelChain, openrouterPost } from "./openrouter";
import { REQUIREMENT_PROMPT } from "./requirement-prompt";

// Port of internal Genie's agents/requirement_agent.py: the transcript goes to the
// REQUIREMENT_AGENT model, which returns internal Genie's RequirementsDraft plus a title.

/** Internal Genie's RequirementsDraft with v2's `title`; the worker builds from this JSON. */
export type Requirements = {
  title: string;
  summary: string;
  intent: string;
  functional_requirements: string[];
  user_stories: string[];
};

export type RequirementsResult = { requirements: Requirements; model: string; costUsd: number };

// Same as internal Genie's Agent(retries=2): an invalid answer is asked for again
const ATTEMPTS_PER_MODEL = 2;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "intent", "functional_requirements", "user_stories"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    intent: { type: "string" },
    functional_requirements: { type: "array", items: { type: "string" } },
    user_stories: { type: "array", items: { type: "string" } },
  },
};

export function generateRequirements(transcript: string): Promise<RequirementsResult> {
  return run(formatTranscript(transcript));
}

/** Regenerate the requirements with the user's remarks applied on top of the current ones. */
export function reviseRequirements(
  transcript: string,
  current: Requirements,
  remarks: string[],
): Promise<RequirementsResult> {
  const numbered = remarks.map((remark, index) => `${index + 1}. ${remark}`).join("\n");
  const prompt =
    `${formatTranscript(transcript)}\n\n` +
    `Current requirements:\n${JSON.stringify(current, null, 2)}\n\n` +
    `User remarks, oldest first (the last one is new):\n${numbered}\n\n` +
    "Revise the current requirements so that every remark is applied, " +
    "and return the complete updated requirements.";
  return run(prompt);
}

function formatTranscript(transcript: string): string {
  return `Transcript:\n\n${transcript}`;
}

async function run(prompt: string): Promise<RequirementsResult> {
  const models = modelChain(process.env.REQUIREMENT_AGENT, process.env.FALLBACK_REQUIREMENT_AGENT);
  if (models.length === 0) throw new ModelError("REQUIREMENT_AGENT is not set");
  const effort = process.env.REQUIREMENT_AGENT_EFFORT?.trim();
  let costUsd = 0;
  let failure = new ModelError("No requirement model was tried");

  for (const model of models) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      const response = await openrouterPost("/chat/completions", {
        model,
        messages: [
          { role: "system", content: REQUIREMENT_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: "requirements", strict: true, schema } },
        ...(effort ? { reasoning: { effort } } : {}),
      });
      if (!response.ok) {
        // The model or provider failed: go to the fallback model
        failure = new ModelError(`Requirement model ${model} failed: ${await errorMessage(response)}`);
        console.warn(failure.message);
        break;
      }
      const body = (await response.json()) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
        usage?: { cost?: number };
      };
      costUsd += body.usage?.cost ?? 0;
      const requirements = parseRequirements(body.choices?.[0]?.message?.content);
      if (requirements) return { requirements, model: body.model ?? model, costUsd };
      failure = new ModelError(`Requirement model ${model} returned invalid requirements`);
      console.warn(`${failure.message} (attempt ${attempt})`);
    }
  }
  throw failure;
}

function parseRequirements(content: string | undefined): Requirements | null {
  if (!content) return null;
  let data: unknown;
  try {
    // Models without structured output sometimes wrap the JSON in a Markdown fence
    data = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const isText = (field: unknown) => typeof field === "string" && field.trim() !== "";
  const isList = (field: unknown) =>
    Array.isArray(field) && field.every((item) => typeof item === "string");
  if (
    !isText(value.title) ||
    !isText(value.summary) ||
    !isText(value.intent) ||
    !isList(value.functional_requirements) ||
    !isList(value.user_stories)
  ) {
    return null;
  }
  return {
    title: (value.title as string).trim(),
    summary: (value.summary as string).trim(),
    intent: (value.intent as string).trim(),
    functional_requirements: value.functional_requirements as string[],
    user_stories: value.user_stories as string[],
  };
}
