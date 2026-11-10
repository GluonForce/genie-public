import Link from "next/link";
import { Container } from "@/components/ui/container";

const navLinks = [
  { href: "/#how", label: "How it works" },
  { href: "/#get", label: "What you get" },
  { href: "/#plans", label: "Plans" },
  { href: "/#faq", label: "Questions" },
  { href: "/sign-in", label: "Sign in" },
];

export function SiteHeader() {
  return (
    <header>
      <Container className="flex flex-wrap items-center justify-between gap-3 py-5">
        <Link href="/" className="font-display text-2xl font-extrabold no-underline">
          genie
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-7 gap-y-1 font-medium">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="py-3 no-underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </Container>
    </header>
  );
}
