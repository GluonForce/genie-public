import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env.local ourselves when it exists.
try {
  process.loadEnvFile(".env.local");
} catch {}

// The database schema is owned by supabase/migrations. drizzle-kit only reads the
// live database (`pnpm db:pull`) to generate matching TypeScript types; it never
// creates or changes tables.
//
// drizzle-kit needs the session pooler (port 5432): its parallel queries get mixed
// up on the transaction pooler (port 6543) that the app uses. Both poolers share
// the same host and credentials, so only the port changes.
const sessionUrl = new URL(process.env.DATABASE_URL!);
sessionUrl.port = "5432";

export default defineConfig({
  dialect: "postgresql",
  schemaFilter: ["public"],
  out: "./lib/db/generated",
  dbCredentials: {
    url: sessionUrl.toString(),
  },
});
