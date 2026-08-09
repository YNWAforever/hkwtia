import "server-only";

import {Pool} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/neon-serverless";

import {databaseEnv} from "@/lib/config/env";

const {databaseUrl} = databaseEnv();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to initialize the database client.");
}

/** Server-only Drizzle database client. Never log this client's connection details. */
export const db = drizzle(new Pool({connectionString: databaseUrl}));
