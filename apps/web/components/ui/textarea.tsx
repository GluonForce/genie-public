import { fieldClass } from "./input";

export function Textarea({ rows = 4, className = "", ...props }: React.ComponentProps<"textarea">) {
  return <textarea rows={rows} className={`${fieldClass} resize-y px-4 py-3.5 ${className}`} {...props} />;
}
