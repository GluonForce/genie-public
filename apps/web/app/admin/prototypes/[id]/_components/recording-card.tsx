"use client";

import { useRef, useState } from "react";
import { Wave } from "@/components/ui/wave";

// Recording and transcript for the reviewer (design A2).

const bars = Array.from({ length: 40 }, (_, i) => 25 + ((i * 53) % 75));

export function RecordingCard({
  prototypeId,
  seconds,
  transcript,
}: {
  prototypeId: string;
  seconds: number;
  transcript: string | null;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const playhead = seconds > 0 ? Math.min(bars.length - 1, Math.floor((position / seconds) * bars.length)) : 0;

  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] bg-white p-[26px]">
      <h2 className="text-lg font-bold">Recording</h2>
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          aria-label={playing ? "Pause recording" : "Play recording"}
          onClick={() => {
            const player = audio.current;
            if (!player) return;
            if (player.paused) void player.play();
            else player.pause();
          }}
          className="flex size-[52px] flex-none cursor-pointer items-center justify-center rounded-full bg-navy hover:bg-[#1d2c6e]"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
            {playing ? (
              <path d="M5 3.5h3.5v13H5zM11.5 3.5H15v13h-3.5z" fill="#FFFFFF" />
            ) : (
              <path d="M6 3.5v13l11-6.5z" fill="#FFFFFF" />
            )}
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Wave bars={bars} playhead={playhead} className="h-11 gap-[3px]" />
          <div className="flex justify-between text-sm text-ink-muted">
            <span>{formatClock(position)}</span>
            <span>{formatClock(seconds)}</span>
          </div>
        </div>
        {/* Loaded only when played: the whole recording is joined on the server */}
        <audio
          ref={audio}
          src={`/api/admin/requests/${prototypeId}/audio`}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPosition(0)}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="font-bold">Transcript</div>
        <p className="max-h-[136px] overflow-y-auto text-[15px] text-ink-muted">
          {transcript ?? "No transcript."}
        </p>
      </div>
    </section>
  );
}

function formatClock(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
