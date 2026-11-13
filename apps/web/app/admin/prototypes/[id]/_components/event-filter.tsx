"use client";

import { useRouter } from "next/navigation";

export type EventFilterValue = "all" | "user" | "admin" | "system";

const options: [EventFilterValue, string][] = [
  ["all", "All events"],
  ["user", "User actions"],
  ["admin", "Admin actions"],
  ["system", "System"],
];

/** Filter for the event log, kept in the URL (`?events=`). */
export function EventFilter({ value }: { value: EventFilterValue }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="event-filter" className="text-sm font-bold">
        Show
      </label>
      <select
        id="event-filter"
        value={value}
        onChange={(event) =>
          router.replace(event.target.value === "all" ? "?" : `?events=${event.target.value}`, { scroll: false })
        }
        className="h-[46px] rounded-[14px] border-2 border-navy bg-white px-3.5 text-navy"
      >
        {options.map(([option, label]) => (
          <option key={option} value={option}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
