// Styles Clerk's sign-in and sign-up forms to match docs/design.
// Clerk's CSS goes into the "clerk" layer (declared in globals.css), so the
// Tailwind classes below take precedence over Clerk's defaults.
export const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#101b4d",
    colorForeground: "#101b4d",
    colorMutedForeground: "#4a5278",
    colorBackground: "#ffffff",
    colorDanger: "#a31f12",
    fontFamily: "var(--font-onest)",
    borderRadius: "14px",
  },
  elements: {
    cardBox: "shadow-none border-0",
    card: "shadow-none",
    headerTitle: "font-display text-[28px] font-extrabold text-navy",
    headerSubtitle: "text-ink-muted text-base",
    socialButtonsBlockButton: "h-14 rounded-full border-2 border-navy text-base font-bold shadow-none",
    formFieldLabel: "text-[15px] font-bold text-navy",
    formFieldInput: "h-13 border-2 border-navy text-[17px] shadow-none",
    otpCodeFieldInput: "border-2 border-rule font-display text-2xl font-extrabold",
    formButtonPrimary: "rounded-full bg-navy py-4 text-lg font-bold normal-case shadow-none",
    footer: "bg-white bg-none",
    footerActionText: "text-ink-muted text-base",
    footerActionLink: "font-bold text-navy text-base underline",
  },
};

// Phase 1 sign-in: Google, or a 6-digit code sent by email. No passwords.
export const clerkLocalization = {
  signUp: {
    start: {
      title: "Create your account",
      subtitle: "Continue with Google, or get a 6-digit code by email. No password needed.",
    },
  },
  signIn: {
    start: {
      title: "Sign in to Genie",
      subtitle: "Continue with Google, or get a 6-digit code by email.",
    },
  },
};
