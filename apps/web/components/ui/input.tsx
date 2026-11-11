// Shared with Textarea
export const fieldClass =
  "w-full rounded-[14px] border-2 border-navy bg-white text-base text-navy placeholder:text-ink-muted disabled:opacity-50";

export function Input({ className = "", ...props }: React.ComponentProps<"input">) {
  return <input className={`${fieldClass} h-13.5 px-4.5 ${className}`} {...props} />;
}
