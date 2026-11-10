import { clerkMiddleware } from "@clerk/nextjs/server";

// Only makes Clerk aware of each request. Access rules live in the pages,
// layouts and route handlers that need them, not here. The URLs make
// server-side redirects go to our own pages instead of Clerk's hosted ones.
export default clerkMiddleware({
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
