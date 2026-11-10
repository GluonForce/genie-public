import Link from "next/link";
import { Wave } from "@/components/ui/wave";

const included = [
  "One prototype built from your recording",
  "Two rounds of changes to the requirements",
  "A review by a person on our team",
  "A link you can share, live for 3 days",
];

const panelWave = [30, 70, 100, 55, 80, 40, 90, 60, 35, 75, 50, 85, 45, 65, 25, 15];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="flex min-w-0 flex-[1_1_440px] flex-col gap-10 bg-blush px-6 pt-10 pb-12 sm:px-12">
        <Link href="/" className="self-start font-display text-2xl font-extrabold no-underline">
          genie
        </Link>
        <div className="my-auto flex flex-col gap-6">
          <h1 className="font-display text-4xl leading-[1.08] font-extrabold tracking-tight">
            Your first prototype is free
          </h1>
          <Wave bars={panelWave} className="h-16 gap-1.5" barShape="rounded-sm" />
          <ul className="flex flex-col text-lg">
            {included.map((item, i) => (
              <li
                key={item}
                className={`py-3 ${i === 0 ? "border-t-4 border-navy" : "border-t-2 border-rule-blush"}`}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex min-w-0 flex-[1_1_480px] items-center justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}
