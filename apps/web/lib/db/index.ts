import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as relations from "./generated/relations";
import * as schema from "./generated/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set (see apps/web/.env.example)");

// One connection pool per server process. In development, Next.js reloads modules
// on every change, so the pool is kept on globalThis to avoid opening new ones.
const globalForDb = globalThis as unknown as { pg?: postgres.Sql };

// prepare: false is required by Supabase's transaction pooler
const client = globalForDb.pg ?? postgres(databaseUrl, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema: { ...schema, ...relations } });
export * from "./generated/schema";
