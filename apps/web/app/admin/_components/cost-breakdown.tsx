import type { CostBreakdown } from "@/lib/costs";
import { formatCost } from "@/lib/format";

/** What a prototype cost by stage, with the model behind each stage. */
export function CostBreakdownCard({ breakdown }: { breakdown: CostBreakdown }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-white p-[26px]">
      <h2 className="text-lg font-bold">Cost</h2>
      <dl className="flex flex-col text-[15px]">
        {breakdown.lines.map((line) => (
          <div key={line.stage} className="flex justify-between gap-3 border-t-2 border-admin-rule py-[9px]">
            <dt className="flex min-w-0 flex-col">
              <span>{line.stage}</span>
              <span className="text-sm break-words text-ink-muted">
                {line.models.length > 0 ? line.models.join(", ") : "Not run yet"}
              </span>
            </dt>
            <dd className="text-right tabular-nums">{formatCost(line.costUsd, 4)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t-4 border-navy py-[9px] font-bold">
          <dt>Total</dt>
          <dd className="text-right tabular-nums">{formatCost(breakdown.totalUsd, 4)}</dd>
        </div>
      </dl>
    </section>
  );
}
