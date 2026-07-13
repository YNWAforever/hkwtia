import {neon} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/neon-http";

import {serverEnv} from "@/lib/config/env";

const {databaseUrl} = serverEnv();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to initialize the database client.");
}

const sql = neon(databaseUrl);

/** Server-only Drizzle database client. Never log this client's connection details. */
export const db = drizzle(sql);
