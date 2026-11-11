const sizes = {
  user: "rounded-[28px] p-9",
  admin: "rounded-[20px] px-6 py-5",
};

type CardProps = React.ComponentProps<"section"> & {
  size?: keyof typeof sizes;
};

export function Card({ size = "user", className = "", ...props }: CardProps) {
  return <section className={`bg-white ${sizes[size]} ${className}`} {...props} />;
}
