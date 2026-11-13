import "server-only";
import { ModelError, errorMessage, modelChain, openrouterPost } from "./openrouter";

// Port of internal Genie's agents/transcription_agent.py: one WAV clip to the TRANSCRIBING_AGENT
// speech-to-text model, English text back. Tries the fallback model if the first one fails.

const LANGUAGE = "en";

export type Transcription = { text: string; model: string; costUsd: number };

export async function transcribeAudio(wav: ArrayBuffer): Promise<Transcription> {
  const models = modelChain(process.env.TRANSCRIBING_AGENT, process.env.FALLBACK_TRANSCRIBING_AGENT);
  if (models.length === 0) throw new ModelError("TRANSCRIBING_AGENT is not set");
  const audio = Buffer.from(wav).toString("base64");
  let failure = new ModelError("No transcription model was tried");
  for (const model of models) {
    try {
      return await transcribe(model, audio);
    } catch (error) {
      console.warn(`Transcription model ${model} failed:`, error);
      failure = error instanceof ModelError ? error : new ModelError(String(error));
    }
  }
  throw failure;
}

async function transcribe(model: string, audio: string): Promise<Transcription> {
  const response = await openrouterPost("/audio/transcriptions", {
    model,
    input_audio: { data: audio, format: "wav" },
    language: LANGUAGE,
  });
  if (!response.ok) {
    throw new ModelError(`OpenRouter transcription failed: ${await errorMessage(response)}`);
  }
  const body = (await response.json()) as { text?: string; usage?: { cost?: number } };
  return {
    text: String(body.text ?? "").split(/\s+/).filter(Boolean).join(" "),
    model,
    costUsd: body.usage?.cost ?? 0,
  };
}
