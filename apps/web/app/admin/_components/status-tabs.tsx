import Link from "next/link";

export type StatusTab = {
  key: string;
  label: string;
  count: number;
  /** Colour of the count badge on an unselected tab (design A1) */
  badge: string;
};

/** The status filter above the queue: rounded tabs with a count, the current one filled navy. */
export function StatusTabs({ tabs, current }: { tabs: StatusTab[]; current: string }) {
  return (
    <nav aria-label="Request status" className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const selected = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={`/admin?status=${tab.key}`}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex h-[46px] items-center gap-2.5 rounded-full border-2 px-5 font-bold no-underline ${
              selected
                ? "border-navy bg-navy text-white hover:text-white"
                : "border-rule bg-white text-navy hover:text-navy"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-2.5 py-px text-[13px] ${selected ? "bg-coral text-navy" : tab.badge}`}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
