import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";
import { clerkAppearance, clerkLocalization } from "@/lib/clerk-appearance";
import "./globals.css";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["500", "800"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Genie: say your idea, get a working prototype",
  description:
    "Describe your app idea out loud. Genie writes the requirements, our team reviews them, and you get a clickable web prototype by email.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${unbounded.variable} ${onest.variable} antialiased`}>
      <body className="font-sans">
        <ClerkProvider
          appearance={clerkAppearance}
          localization={clerkLocalization}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/app"
          signUpFallbackRedirectUrl="/app"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
