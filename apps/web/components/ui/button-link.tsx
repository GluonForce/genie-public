import Link from "next/link";
import { buttonBase, buttonVariants, type ButtonVariant } from "./button-styles";

type ButtonLinkProps = {
  href: string;
  variant?: ButtonVariant;
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
      className={`${buttonBase} px-7 py-4 text-lg ${buttonVariants[variant]} ${className}`}
    >
      {recordDot && <span aria-hidden="true" className="size-3.5 rounded-full bg-coral" />}
      {children}
    </Link>
  );
}
