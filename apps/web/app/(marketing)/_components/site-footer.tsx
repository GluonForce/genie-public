import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Wave } from "@/components/ui/wave";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#get", label: "What you get" },
      { href: "/#plans", label: "Plans" },
      { href: "/#faq", label: "Questions" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-up", label: "Create an account" },
      { href: "/sign-in", label: "Sign in" },
      { href: "/app", label: "Check your prototype" },
    ],
  },
  {
    title: "Legal and contact",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/acceptable-use", label: "Acceptable use" },
    ],
    note: "[CONTACT EMAIL]",
  },
];

// A wave that fades out: the end of the track
const fadeBars = [
  100, 82, 94, 70, 86, 60, 74, 50, 64, 42, 54, 34, 44, 28, 36, 22, 28, 16, 20, 12, 14, 8, 10, 6, 6,
  4, 4, 4,
];

export function SiteFooter() {
  return (
    <footer className="bg-blush">
      <Container className="flex flex-col gap-12 pt-18 pb-8">
        <div className="flex flex-wrap gap-x-18 gap-y-12">
          <div className="flex min-w-0 flex-[1.4_1_320px] flex-col gap-3.5">
            <Link
              href="/"
              className="font-display text-[56px] leading-none font-extrabold tracking-tight no-underline"
            >
              genie
            </Link>
            <p className="max-w-[360px]">
              Speech to prototype. You describe an idea out loud and get a web prototype you can
              click through and share.
            </p>
            <p className="text-ink-muted">Made by Gluonforce</p>
          </div>

          {columns.map((column) => (
            <nav
              key={column.title}
              aria-label={column.title}
              className="flex min-w-0 flex-[1_1_150px] flex-col"
            >
              <h2 className="mb-1.5 text-base font-bold">{column.title}</h2>
              {column.links.map((link) => (
                <Link key={link.href} href={link.href} className="py-2.5 no-underline">
                  {link.label}
                </Link>
              ))}
              {"note" in column && <p className="py-2.5">{column.note}</p>}
            </nav>
          ))}
        </div>

        <Wave bars={fadeBars} align="end" className="h-18 gap-1.5" barShape="rounded-t" animated />

        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-t-4 border-navy pt-5 text-[15px]">
          <span>© 2026 Gluonforce. All rights reserved.</span>
          <span>End of track</span>
        </div>
      </Container>
    </footer>
  );
}
