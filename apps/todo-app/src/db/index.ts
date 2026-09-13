import { Pool } from "pg";
import { createClient, syncSchema } from "@lightorm/core";
import { models } from "../models.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and point it at your " +
      "Neon / Supabase / local Postgres connection string.",
  );
}

// Serverless Postgres providers (Neon, Supabase) require SSL. Local
// Postgres during development typically doesn't, so this is configurable.
const useSSL = process.env.PGSSL !== "disable";

export const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

export const db = createClient(pool, models);

/** Creates the `todo` table if it doesn't already exist. Dev convenience only — see ARCHITECTURE.md. */
export async function initDb(): Promise<void> {
  await syncSchema(pool, models);
}
