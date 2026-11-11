type ProgressTrackProps = {
  steps: string[];
  /** Index of the step the user is on; earlier steps show as done */
  current: number;
  className?: string;
};

/** The step bar above the user app screens: coral for done, navy for the current step. */
export function ProgressTrack({ steps, current, className = "" }: ProgressTrackProps) {
  return (
    <ol aria-label="Progress" className={`flex gap-1.5 text-sm font-bold ${className}`}>
      {steps.map((step, index) => {
        const state =
          index < current
            ? "border-coral"
            : index === current
              ? "border-navy"
              : "border-white text-ink-muted";
        return (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className={`flex-1 border-t-6 pt-2 ${state}`}
          >
            {index + 1} {step}
          </li>
        );
      })}
    </ol>
  );
}
