import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs";

export function SignOutButton() {
  return (
    <ClerkSignOutButton redirectUrl="/">
      <button type="button" className="cursor-pointer py-3 underline hover:text-[#c22a1b]">
        Sign out
      </button>
    </ClerkSignOutButton>
  );
}
