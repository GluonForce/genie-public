import Link from "next/link";

const variants = {
  primary: "bg-navy text-white hover:bg-[#1d2c6e] hover:text-white",
  inverse: "bg-white text-navy hover:bg-blush hover:text-navy",
  outline: "border-2 border-navy text-navy hover:bg-blush hover:text-navy",
};

type ButtonLinkProps = {
  href: string;
  variant?: keyof typeof variants;
  /** Shows the coral record dot used on "Record your idea" buttons */
  recordDot?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function ButtonLink({
  href,
  variant = "primary",
  recordDot = false,
  className = "",
  children,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-3 rounded-full px-7 py-4 text-lg font-bold no-underline transition-colors ${variants[variant]} ${className}`}
    >
      {recordDot && <span aria-hidden="true" className="size-3.5 rounded-full bg-coral" />}
      {children}
    </Link>
  );
}
