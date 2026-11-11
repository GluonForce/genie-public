import { buttonBase, buttonVariants, type ButtonVariant } from "./button-styles";

const sizes = {
  md: "px-7 py-4 text-lg",
  // Admin screens use smaller buttons
  sm: "px-5 py-2.5 text-base",
};

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonBase} ${sizes[size]} ${buttonVariants[variant]} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
