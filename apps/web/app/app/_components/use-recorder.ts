"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GenerateMessage } from "@/app/api/requests/[id]/generate/route";
import { encodeWav, joinSamples } from "@/lib/wav";

// The recorder (M2.3): microphone → AudioWorklet (16 kHz mono PCM16) → a WAV chunk every 30 s,
// uploaded to Storage while recording, so a closed tab loses at most one chunk (FR-R2).

export const SAMPLE_RATE = 16000;
export const MAX_SECONDS = 10 * 60;
export const WARNING_SECONDS = 9 * 60;
export const MIN_SECONDS = 15;
export const QUIET = 4;
const LIVE_BARS = 34;
const CHUNK_SAMPLES = 30 * SAMPLE_RATE;
const MAX_SAMPLES = MAX_SECONDS * SAMPLE_RATE;
const UPLOAD_ATTEMPTS = 3;
const quietBars = Array.from({ length: LIVE_BARS }, () => QUIET);

export type RecorderPhase =
  | "idle"
  | "starting"
  | "recording"
  | "paused"
  | "saving"
  | "review"
  | "generating";

export type GenerateStep = "transcribing" | "analysing" | "done";

export type Recording = {
  prototypeId: string;
  /** Local playback; null for a recording saved in an earlier visit */
  url: string | null;
  seconds: number;
  /** One level per 100 ms, for the playback wave */
  levels: number[];
};

type Session = {
  prototypeId: string;
  stream: MediaStream;
  context: AudioContext;
  node: AudioWorkletNode;
  blocks: Int16Array[];
  chunk: Int16Array[];
  chunkSamples: number;
  totalSamples: number;
  nextIndex: number;
  levels: number[];
  uploads: Promise<void>;
  uploadFailed: boolean;
  stopping: boolean;
  flushed?: () => void;
};

/** `saved`: a recording uploaded in an earlier visit, so the user can still generate from it. */
export function useRecorder(saved?: { prototypeId: string; seconds: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<RecorderPhase>(saved ? "review" : "idle");
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState(quietBars);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(
    saved ? { prototypeId: saved.prototypeId, url: null, seconds: saved.seconds, levels: [] } : null,
  );
  const [generateStep, setGenerateStep] = useState<GenerateStep>("transcribing");
  const session = useRef<Session | null>(null);

  // Turn the microphone off when leaving the page
  useEffect(() => () => release(session.current), []);
  useEffect(() => {
    const url = recording?.url;
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [recording]);

  async function start() {
    setPhase("starting");
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      return fail("Genie needs your microphone. Allow access in your browser, then try again.");
    }

    const response = await fetch("/api/requests", { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      stream.getTracks().forEach((track) => track.stop());
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      return fail(body?.error ?? "Could not start recording. Check your connection and try again.");
    }
    const { id } = (await response.json()) as { id: string };

    try {
      const context = new AudioContext();
      await context.audioWorklet.addModule("/worklets/pcm16-recorder.js");
      await context.resume();
      const node = new AudioWorkletNode(context, "pcm16-recorder");
      context.createMediaStreamSource(stream).connect(node);
      node.connect(context.destination); // outputs silence; keeps the node running
      const current: Session = {
        prototypeId: id,
        stream,
        context,
        node,
        blocks: [],
        chunk: [],
        chunkSamples: 0,
        totalSamples: 0,
        nextIndex: 0,
        levels: [],
        uploads: Promise.resolve(),
        uploadFailed: false,
        stopping: false,
      };
      node.port.onmessage = ({ data }: MessageEvent<{ type: string; samples?: Int16Array }>) => {
        if (data.type === "pcm" && data.samples) addSamples(current, data.samples);
        if (data.type === "flushed") current.flushed?.();
      };
      session.current = current;
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      return fail("This browser cannot record audio. Try the latest Chrome, Edge, Firefox or Safari.");
    }
    setSeconds(0);
    setBars(quietBars);
    setPhase("recording");
  }

  function fail(message: string) {
    setError(message);
    setPhase("idle");
  }

  function addSamples(current: Session, samples: Int16Array) {
    current.blocks.push(samples);
    current.chunk.push(samples);
    current.chunkSamples += samples.length;
    current.totalSamples += samples.length;

    let sum = 0;
    for (const sample of samples) sum += (sample / 32768) ** 2;
    // Square root so quiet speech still moves the bars
    const height = Math.min(100, QUIET + Math.sqrt(Math.sqrt(sum / samples.length)) * 180);
    current.levels.push(height);
    setBars((previous) => [...previous.slice(1), height]);
    setSeconds(Math.floor(current.totalSamples / SAMPLE_RATE));

    if (current.chunkSamples >= CHUNK_SAMPLES) sendChunk(current);
    if (current.totalSamples >= MAX_SAMPLES) void stop(); // FR-R3
  }

  function sendChunk(current: Session) {
    const index = current.nextIndex++;
    const wav = encodeWav(joinSamples(current.chunk), SAMPLE_RATE);
    const durationMs = Math.round((current.totalSamples * 1000) / SAMPLE_RATE);
    current.chunk = [];
    current.chunkSamples = 0;
    // One upload at a time, in order
    current.uploads = current.uploads
      .then(() => uploadChunk(current.prototypeId, index, durationMs, wav))
      .catch(() => {
        current.uploadFailed = true;
      });
  }

  function togglePause() {
    const current = session.current;
    if (!current) return;
    const pausing = phase === "recording";
    current.node.port.postMessage({ type: pausing ? "pause" : "resume" });
    setPhase(pausing ? "paused" : "recording");
  }

  async function stop() {
    const current = session.current;
    if (!current || current.stopping) return;
    current.stopping = true;
    setPhase("saving");
    // Collect the last few samples still inside the worklet
    await new Promise<void>((resolve) => {
      current.flushed = resolve;
      current.node.port.postMessage({ type: "flush" });
    });
    release(current);
    session.current = null;
    if (current.chunkSamples > 0) sendChunk(current);
    await current.uploads;
    if (current.uploadFailed) {
      setError("Part of the recording could not be saved. Check your connection and record again.");
    }
    setRecording({
      prototypeId: current.prototypeId,
      url: URL.createObjectURL(encodeWav(joinSamples(current.blocks), SAMPLE_RATE)),
      seconds: current.totalSamples / SAMPLE_RATE,
      levels: current.levels,
    });
    setPhase("review");
  }

  async function recordAgain() {
    if (!recording) return;
    setError(null);
    const response = await fetch(`/api/requests/${recording.prototypeId}/recording`, {
      method: "DELETE",
    }).catch(() => null);
    if (!response?.ok) {
      setError("Could not delete the recording. Check your connection and try again.");
      return;
    }
    setRecording(null);
    setSeconds(0);
    setBars(quietBars);
    setPhase("idle");
  }

  /** Generate (FR-G1): follows the streamed steps, then shows the requirements. */
  async function generate() {
    if (!recording) return;
    setError(null);
    setGenerateStep("transcribing");
    setPhase("generating");
    const response = await fetch(`/api/requests/${recording.prototypeId}/generate`, {
      method: "POST",
    }).catch(() => null);
    if (!response?.ok || !response.body) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not reach Genie. Check your connection and try again.");
      setPhase("review");
      return;
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = "";
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) break;
      buffered += value;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line) as GenerateMessage;
        if ("error" in message) {
          setError(message.error);
          setPhase("review");
          return;
        }
        setGenerateStep(message.step);
        if (message.step === "done") {
          router.refresh();
          return;
        }
      }
    }
    // The stream ended without a result, e.g. the connection dropped. If the requirements were
    // saved anyway, the refreshed page shows them instead of this screen.
    setError("The connection was interrupted. Please try again.");
    setPhase("review");
    router.refresh();
  }

  return {
    phase,
    seconds,
    bars,
    error,
    recording,
    generateStep,
    start,
    togglePause,
    stop,
    recordAgain,
    generate,
  };
}

function release(current: Session | null) {
  if (!current) return;
  current.node.port.onmessage = null;
  current.stream.getTracks().forEach((track) => track.stop());
  void current.context.close();
}

async function uploadChunk(prototypeId: string, index: number, durationMs: number, wav: Blob) {
  for (let attempt = 1; ; attempt++) {
    try {
      const signed = await fetch(`/api/requests/${prototypeId}/audio-upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index, durationMs }),
      });
      if (!signed.ok) throw new Error(`Upload URL failed: ${signed.status}`);
      const { url } = (await signed.json()) as { url: string };
      const put = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "audio/wav", "x-upsert": "true" },
        body: wav,
      });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      return;
    } catch (error) {
      if (attempt >= UPLOAD_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

export function formatClock(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
