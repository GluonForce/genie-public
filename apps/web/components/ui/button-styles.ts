// Shared by Button and ButtonLink so a link and a button with the same variant look identical.
export const buttonBase =
  "inline-flex items-center justify-center gap-3 rounded-full font-bold no-underline transition-colors";

export const buttonVariants = {
  primary: "bg-navy text-white hover:bg-[#1d2c6e] hover:text-white",
  inverse: "bg-white text-navy hover:bg-blush hover:text-navy",
  outline: "border-2 border-navy text-navy hover:bg-blush hover:text-navy",
  danger: "border-2 border-danger bg-white text-danger hover:bg-danger-tint hover:text-danger",
};

export type ButtonVariant = keyof typeof buttonVariants;
