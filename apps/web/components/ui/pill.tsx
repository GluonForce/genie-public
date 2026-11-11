const tones = {
  neutral: "bg-admin-rule text-navy",
  amber: "bg-amber text-amber-ink",
  success: "bg-success text-success-ink",
  danger: "bg-danger-tint text-danger-ink",
};

const sizes = {
  md: "px-3.5 py-1.5 text-[15px]",
  // Admin screens use smaller pills
  sm: "px-3 py-1 text-sm",
};

export type PillTone = keyof typeof tones;

type PillProps = React.ComponentProps<"span"> & {
  tone?: PillTone;
  size?: keyof typeof sizes;
};

/** A rounded status label, such as "Waiting for review" or "Live". */
export function Pill({ tone = "neutral", size = "md", className = "", ...props }: PillProps) {
  return (
    <span
      className={`inline-block self-start rounded-full font-bold ${tones[tone]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
